import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { VerificationStatus, JaminanTipe } from '@prisma/client';
import { CreatePeminjamanDto } from './dto/create-peminjaman.dto';
import { MinioService } from 'src/common/minio/minio.service';
import {
  StatusPeminjaman,
  StatusPembayaran,
  MetodePengambilan,
} from '@prisma/client';

@Injectable()
export class PeminjamanService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  // ==========================================
  // HELPER: HITUNG TOTAL HARI
  // ==========================================
  private calculateTotalHari(start: Date, end: Date): number {
    const diffTime = end.getTime() - start.getTime();

    if (diffTime < 0)
      throw new BadRequestException(
        'Tanggal selesai tidak boleh sebelum tanggal mulai',
      );

    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
  private calculateTotalBiaya(
    subtotalPerHari: number,
    totalHari: number,
  ): number {
    let total = 0;

    if (totalHari >= 1) total += subtotalPerHari; // 100%

    if (totalHari >= 2) total += subtotalPerHari * 0.7; // 70%

    if (totalHari > 2) total += subtotalPerHari * 0.5 * (totalHari - 2); // 50%

    return Math.round(total);
  }

  // ==========================================
  // MAIN METHOD: CREATE PEMINJAMAN
  // ==========================================
  async create(userId: string, dto: CreatePeminjamanDto) {
    // 1. Validasi User Approved
    const userDetail = await this.prisma.userDetail.findUnique({
      where: { userId },
    });
    if (
      !userDetail ||
      userDetail.verification_status !== VerificationStatus.APPROVED
    ) {
      throw new ForbiddenException('Akun belum diverifikasi oleh admin');
    }

    const ACTIVE_STATUSES = [
      StatusPeminjaman.MENUNGGU_PERSETUJUAN,
      StatusPeminjaman.SIAP_DIPROSES,
      StatusPeminjaman.DIPROSES,
      StatusPeminjaman.DIPAKAI,
    ];

    const activeCount = await this.prisma.peminjaman.count({
      where: {
        userId,
        status_pinjam: { in: ACTIVE_STATUSES },
      },
    });

    if (activeCount > 0) {
      throw new BadRequestException(
        'Selesaikan peminjaman sebelumnya terlebih dahulu',
      );
    }
    if (!dto.jaminan_tipe)
      throw new BadRequestException('Jaminan wajib dipilih');

    if (dto.jaminan_tipe !== JaminanTipe.DEPOSIT_UANG && !dto.jaminan_detail) {
      throw new BadRequestException('Detail jaminan wajib diisi');
    }

    if (!dto.paketId && (!dto.items || dto.items.length === 0))
      throw new BadRequestException('Pilih paket atau minimal 1 barang');

    return this.prisma.$transaction(async (tx) => {
      let subtotalBarang = 0;
      let depositAmount = 0;

      type ItemPeminjaman = {
        barangId: string;
        jumlah: number;
        harga_satuan: number;
      };
      const finalItems: ItemPeminjaman[] = [];

      // 2. Logika Barang (Paket atau Satuan)
      if (dto.paketId) {
        const paket = await tx.paket.findUnique({
          where: { id: dto.paketId },
          include: { items: { include: { barang: true } } },
        });
        if (!paket) throw new BadRequestException('Paket tidak ditemukan');

        subtotalBarang = paket.harga_final;
        for (const pItem of paket.items) {
          if (!pItem.barang.isActive) {
            throw new BadRequestException('Barang paket tidak aktif');
          }

          if (pItem.barang.stok_tersedia < pItem.jumlah) {
            throw new BadRequestException('Stok barang paket tidak cukup');
          }

          finalItems.push({
            barangId: pItem.barangId,
            jumlah: pItem.jumlah,
            harga_satuan: pItem.barang.harga_sewa,
          });
        }
      } else if (dto.items) {
        for (const item of dto.items) {
          const barang = await tx.barang.findFirst({
            where: { id: item.barangId, isActive: true },
          });

          if (!barang) {
            throw new BadRequestException(
              'Barang tidak ditemukan / tidak aktif',
            );
          }

          if (barang.stok_tersedia < item.jumlah) {
            throw new BadRequestException('Stok tidak cukup');
          }

          subtotalBarang += barang.harga_sewa * item.jumlah;
          finalItems.push({
            barangId: barang.id,
            jumlah: item.jumlah,
            harga_satuan: barang.harga_sewa,
          });
        }
      }

      // 3. Kalkulasi Final
      const startDate = new Date(dto.tanggal_mulai);
      const endDate = new Date(dto.tanggal_selesai);

      //agar bisa set tanggal hari ini
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      if (startDate < today) {
        throw new BadRequestException('Tanggal mulai tidak boleh di masa lalu');
      }

      // if (startDate < now)
      //   throw new BadRequestException('Tanggal mulai tidak boleh di masa lalu');

      if (endDate < startDate) {
        throw new BadRequestException(
          'Tanggal selesai tidak boleh sebelum tanggal mulai',
        );
      }

      const totalHari = this.calculateTotalHari(startDate, endDate);

      const totalSewa = this.calculateTotalBiaya(subtotalBarang, totalHari);

      let ongkir = 0;

      if (dto.metode_ambil === MetodePengambilan.DIANTAR) {
        ongkir = 0;
      }

      const totalBiaya = totalSewa + ongkir;

      const DP_PERCENT = 0.35;
      const DEPOSIT_PERCENT = 0.4;

      const nominalDp = Math.round(totalSewa * DP_PERCENT);

      if (dto.jaminan_tipe === JaminanTipe.DEPOSIT_UANG) {
        depositAmount = Math.round(totalSewa * DEPOSIT_PERCENT);
      }

      if (dto.jaminan_tipe === JaminanTipe.DEPOSIT_UANG) {
        if (
          !dto.nama_rekening_pengembalian ||
          !dto.bank_pengembalian ||
          !dto.nomor_rekening_pengembalian
        ) {
          throw new BadRequestException(
            'Rekening pengembalian wajib diisi untuk jaminan deposit',
          );
        }
      }

      const sisaTagihan = totalSewa - nominalDp;

      if (nominalDp < 0) {
        throw new BadRequestException('Nominal DP tidak boleh negatif');
      }

      if (dto.metode_ambil === 'DIANTAR' && !dto.alamat_acara)
        throw new BadRequestException('Alamat wajib jika DIANTAR');

      const alamatAcara =
        dto.metode_ambil === 'DIANTAR' ? dto.alamat_acara : null;

      let statusPinjam: StatusPeminjaman;

      if (dto.metode_ambil === MetodePengambilan.DIANTAR) {
        statusPinjam = StatusPeminjaman.MENUNGGU_PERSETUJUAN;
      } else {
        statusPinjam = StatusPeminjaman.SIAP_DIPROSES;
      }

      const expiredAt = new Date();
      expiredAt.setHours(expiredAt.getHours() + 6); 

      // 4. Create Records
      return tx.peminjaman.create({
        data: {
          userId,
          paketId: dto.paketId ?? null,
          tanggal_mulai: startDate,
          tanggal_selesai: endDate,
          metode_ambil: dto.metode_ambil,
          alamat_acara: alamatAcara,

          total_sewa: totalSewa,
          total_biaya: totalBiaya,

          nominal_dp: nominalDp,
          sisa_tagihan: sisaTagihan,
          deposit: depositAmount,
          jaminan_tipe: dto.jaminan_tipe,
          jaminan_detail: dto.jaminan_detail ?? null,
          status_pinjam: statusPinjam,
          status_bayar: StatusPembayaran.BELUM_BAYAR,
          keterangan: `Durasi: ${totalHari} hari`,
          items: {
            create: finalItems,
          },
          nama_rekening_pengembalian:
            dto.jaminan_tipe === 'DEPOSIT_UANG'
              ? dto.nama_rekening_pengembalian
              : null,

          bank_pengembalian:
            dto.jaminan_tipe === 'DEPOSIT_UANG' ? dto.bank_pengembalian : null,

          nomor_rekening_pengembalian:
            dto.jaminan_tipe === 'DEPOSIT_UANG'
              ? dto.nomor_rekening_pengembalian
              : null,
          expired_at: expiredAt,
        },
        include: {
          items: {
            include: { barang: true },
          },
          paket: {
            include: {
              items: {
                include: { barang: true },
              },
            },
          },
        },
      });
    });
  }

  // ========
  // GET ALL(Ambil Semua Data Peminjaman)
  // ========

  async findAllByUser(userId: string) {
    return this.prisma.peminjaman.findMany({
      where: {
        userId: userId,
      },
      include: {
        zona: true,
        items: {
          include: {
            barang: {
              select: { nama: true, gambar: true },
            },
          },
        },
        paket: {
          include: {
            items: {
              include: {
                barang: {
                  select: {
                    nama: true,
                    gambar: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==========
  // GET ONE
  // ==========
  async findOneByUser(userId: string, peminjamanId: string) {
    const peminjaman = await this.prisma.peminjaman.findFirst({
      where: {
        id: peminjamanId,
        userId: userId,
      },
      include: {
        zona: true,
        items: {
          include: {
            barang: true,
          },
        },
        paket: {
          include: {
            items: {
              include: {
                barang: {
                  select: {
                    nama: true,
                    gambar: true,
                  },
                },
              },
            },
          },
        },
        user: {
          select: { username: true, email: true },
        },
        pembayaran: {
          include: {
            rekeningTujuan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!peminjaman) {
      throw new NotFoundException('Data peminjaman tidak ditemukan');
    }

    return {
      ...peminjaman,

      items: peminjaman.items.map((item) => ({
        ...item,
        subtotal: item.jumlah * item.harga_satuan,
      })),
    };
  }
}
