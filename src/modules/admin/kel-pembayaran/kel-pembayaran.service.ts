import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMetodeDto } from './dto/create-metode.dto';
import {
  MetodePembayaran,
  StatusPembayaran,
  StatusVerifikasiPembayaran,
  TipePembayaran,
  StatusPeminjaman,
} from '@prisma/client';
import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class AdminKelPembayaranService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) { }

  async create(dto: CreateMetodeDto) {
    return this.prisma.rekeningTujuan.create({
      data: {
        nama: dto.nama,
        nomor: dto.nomor_rekening,
        metode: dto.metode ?? MetodePembayaran.BANK_TRANSFER,
        atas_nama: dto.atas_nama,
        instruksi: dto.instruksi,
        aktif: true,
      },
    });
  }

  async toggleStatus(id: string) {
    const rekening = await this.prisma.rekeningTujuan.findUnique({
      where: { id },
    });
    if (!rekening) throw new NotFoundException('Rekening tidak ditemukan');

    return this.prisma.rekeningTujuan.update({
      where: { id },
      data: {
        aktif: !rekening.aktif,
      },
    });
  }

  // === LIST REKENING TUJUAN ======
  async findAll() {
    return this.prisma.rekeningTujuan.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  // 1. Ambil daftar pembayaran yang butuh verifikasi
  async listMenungguVerifikasi(status?: StatusVerifikasiPembayaran) {
    const whereClause =
      status === 'ALL' || !status
        ? { status: StatusVerifikasiPembayaran.PENDING }
        : status === 'PENDING'
          ? { status: StatusVerifikasiPembayaran.PENDING }
          : { status };
    const list = await this.prisma.pembayaran.findMany({
      where: whereClause,
      include: {
        peminjaman: {
          include: {
            user: {
              include: { detail: true },
            },
          },
        },
        rekeningTujuan: true,
        allocations: true,
        verifiedBy: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      list.map(async (p) => ({
        ...p,
        bukti_url: p.bukti_pembayaran
          ? await this.minio.getFileUrl(p.bukti_pembayaran)
          : null,
        ringkasan: {
          dp: p.allocations.find((a) => a.tipe === 'DP')?.jumlah || 0,
          deposit: p.allocations.find((a) => a.tipe === 'DEPOSIT')?.jumlah || 0,
          pelunasan:
            p.allocations.find((a) => a.tipe === 'PELUNASAN')?.jumlah || 0,
        },
      })),
    );
  }

  // ===============================
  // GET DETAIL PEMBAYARAN
  // ===============================
  async getDetail(pembayaranId: string) {
    const pembayaran = await this.prisma.pembayaran.findUnique({
      where: { id: pembayaranId },
      include: {
        peminjaman: {
          include: {
            user: {
              include: { detail: true },
            },
            items: {
              include: { barang: true },
            },
            paket: true,
            biayaDetails: true,
          },
        },
        rekeningTujuan: true,
        allocations: true,
        verifiedBy: {
          select: { id: true, username: true },
        },
      },
    });

    if (!pembayaran) throw new NotFoundException('Pembayaran tidak ditemukan');

    return {
      ...pembayaran,
      bukti_url: pembayaran.bukti_pembayaran
        ? await this.minio.getFileUrl(pembayaran.bukti_pembayaran)
        : null,
    };
  }

  // ===============================
  // VERIFY PAYMENT (ADMIN)
  // ===============================
  async verifyPayment(
    adminId: string,
    pembayaranId: string,
    status: 'VERIFIED' | 'REJECTED',
    catatan?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const pembayaran = await tx.pembayaran.findUnique({
        where: { id: pembayaranId },
        include: {
          peminjaman: true,
          allocations: true,
        },
      });

      if (!pembayaran)
        throw new NotFoundException('Pembayaran tidak ditemukan');
      if (pembayaran.status !== 'PENDING') {
        throw new BadRequestException('Pembayaran sudah diproses');
      }

      const peminjaman = pembayaran.peminjaman;

      if (peminjaman.status_pinjam === StatusPeminjaman.DITOLAK) {
        throw new BadRequestException('Peminjaman sudah ditolak');
      }

      // if (peminjaman.status_pinjam === StatusPeminjaman.SELESAI) {
      //   throw new BadRequestException('Peminjaman sudah selesai');
      // }

      const existingVerified = await tx.pembayaran.findFirst({
        where: {
          peminjamanId: pembayaran.peminjamanId,
          status: 'VERIFIED',
          tipe: pembayaran.tipe,
        },
      });

      if (existingVerified && status === 'VERIFIED') {
        throw new BadRequestException('Pembayaran sudah pernah diverifikasi');
      }

      if (status === 'VERIFIED') {
        await tx.pembayaran.update({
          where: { id: pembayaranId },
          data: {
            status: 'VERIFIED',
            verifiedById: adminId,
            verifiedAt: new Date(),
            catatan,
          },
        });

        const updateData: any = {};
        // ✅ FIX: Explicitly type as StatusPembayaran
        let newStatusBayar: StatusPembayaran = pembayaran.peminjaman
          .status_bayar as StatusPembayaran;

        for (const alloc of pembayaran.allocations) {
          if (alloc.tipe === 'DP') {
            updateData.total_terbayar = { increment: alloc.jumlah };
            updateData.sisa_tagihan = { decrement: alloc.jumlah };
            newStatusBayar = StatusPembayaran.DP_DITERIMA;
          } else if (alloc.tipe === 'DEPOSIT') {
            updateData.total_terbayar = { increment: alloc.jumlah };
          } else if (alloc.tipe === 'PELUNASAN') {
            updateData.total_terbayar = { increment: alloc.jumlah };
            updateData.sisa_tagihan = { decrement: alloc.jumlah };

            const newSisaTagihan =
              (pembayaran.peminjaman.sisa_tagihan || 0) - alloc.jumlah;
            if (newSisaTagihan <= 0) {
              newStatusBayar = StatusPembayaran.LUNAS;
            }
          } else if (alloc.tipe === 'SEWA') {
            // 🔥 PERBAIKAN: Handler untuk FULL PAYMENT dengan validasi
            const currentSisa = peminjaman.sisa_tagihan || 0;
            const totalTagihan = peminjaman.total_tagihan || 0;

            // Cek apakah sudah ada DP
            const existingDP = await tx.pembayaran.findFirst({
              where: {
                peminjamanId: pembayaran.peminjamanId,
                tipe: 'DP',
                status: 'VERIFIED',
              },
            });

            if (existingDP) {
              // Sudah ada DP, treat sebagai pelunasan
              if (currentSisa < alloc.jumlah) {
                throw new BadRequestException(`Jumlah melebihi sisa tagihan`);
              }
              updateData.total_terbayar = { increment: alloc.jumlah };
              updateData.sisa_tagihan = { decrement: alloc.jumlah };
            } else {
              // FULL langsung tanpa DP
              updateData.total_terbayar = { increment: alloc.jumlah };
              updateData.sisa_tagihan = totalTagihan - alloc.jumlah;
            }
            newStatusBayar = StatusPembayaran.LUNAS;
          }
        }

        if (updateData.sisa_tagihan === 0 || (updateData.sisa_tagihan?.decrement && updateData.sisa_tagihan.decrement < 0)) {
          updateData.sisa_tagihan = 0;
        }
        // Update peminjaman
        await tx.peminjaman.update({
          where: { id: pembayaran.peminjamanId },
          data: {
            ...updateData,
            status_bayar: newStatusBayar,
            expired_at: null,
          },
        });

        await tx.peminjamanBiayaDetail.create({
          data: {
            peminjamanId: pembayaran.peminjamanId,
            tipe: 'OTHER',
            label: `✅ Pembayaran ${pembayaran.tipe} diverifikasi oleh admin ${adminId}`,
            jumlah: pembayaran.jumlah,
            sumber_id: adminId,
          },
        });

        // Jika status sudah LUNAS, update status peminjaman
        if (newStatusBayar === StatusPembayaran.LUNAS) {
          const peminjamanNow = await tx.peminjaman.findUnique({
            where: { id: pembayaran.peminjamanId },
          });

          if (
            peminjamanNow?.status_pinjam ===
            StatusPeminjaman.MENUNGGU_PERSETUJUAN
          ) {
            await tx.peminjaman.update({
              where: { id: pembayaran.peminjamanId },
              data: { status_pinjam: StatusPeminjaman.SIAP_DIPROSES },
            });
          }
        }
      } else {
        // REJECTED
        await tx.pembayaran.update({
          where: { id: pembayaranId },
          data: {
            status: 'REJECTED',
            verifiedById: adminId,
            verifiedAt: new Date(),
            catatan,
          },
        });

        // ✅ Hitung total allocation yang akan di-rollback
        let totalDibayar = 0;
        for (const alloc of pembayaran.allocations) {
          if (alloc.tipe !== 'DEPOSIT') {
            totalDibayar += alloc.jumlah;
          }
        }

        // ✅ Rollback total_terbayar dan sisa_tagihan
        const updateData: any = {
          total_terbayar: { decrement: totalDibayar },
          sisa_tagihan: { increment: totalDibayar },
          expired_at: new Date(Date.now() + 60 * 60 * 1000),
        };

        let newStatusBayar: StatusPembayaran = StatusPembayaran.BELUM_BAYAR;

        if (pembayaran.tipe === 'DP') {
          newStatusBayar = StatusPembayaran.BELUM_BAYAR;
        } else if (pembayaran.tipe === 'PELUNASAN') {
          newStatusBayar = StatusPembayaran.DP_DITERIMA;
        } else if (pembayaran.tipe === 'FULL') {
          newStatusBayar = StatusPembayaran.BELUM_BAYAR;
        }

        updateData.status_bayar = newStatusBayar;

        await tx.peminjaman.update({
          where: { id: pembayaran.peminjamanId },
          data: updateData,
        });
        await tx.peminjamanBiayaDetail.create({
          data: {
            peminjamanId: pembayaran.peminjamanId,
            tipe: 'OTHER',
            label: `❌ Pembayaran ${pembayaran.tipe} ditolak oleh admin ${adminId}. Catatan: ${catatan || 'Tidak ada catatan'}`,
            jumlah: 0,
            sumber_id: adminId,
          },
        });

        return { success: true, status: 'REJECTED' };
      }
    });
  }

  // ===============================
  // KEMBALIKAN DEPOSIT (ADMIN)
  // ===============================
  async kembalikanDeposit(adminId: string, peminjamanId: string) {
    return this.prisma.$transaction(async (tx) => {
      const peminjaman = await tx.peminjaman.findUnique({
        where: { id: peminjamanId },
        include: {
          biayaDetails: {
            where: { tipe: 'DENDA' },
          },
          // ✅ Include pembayaran denda untuk validasi
          pembayaran: {
            where: { tipe: 'DENDA' },
          },
        },
      });

      if (!peminjaman)
        throw new NotFoundException('Peminjaman tidak ditemukan');
      if (peminjaman.status_pinjam !== StatusPeminjaman.SELESAI) {
        throw new BadRequestException('Peminjaman belum selesai');
      }
      if (
        !peminjaman.nama_rekening_pengembalian ||
        !peminjaman.bank_pengembalian ||
        !peminjaman.nomor_rekening_pengembalian
      ) {
        throw new BadRequestException(
          'User belum mengisi data rekening untuk pengembalian deposit',
        );
      }
      if (peminjaman.deposit_dikembalikan) {
        throw new BadRequestException('Deposit sudah dikembalikan');
      }
      // ✅ Validasi: Pastikan tidak ada denda yang pending
      const dendaPending = peminjaman.pembayaran.some(
        (p) => p.tipe === 'DENDA' && p.status === 'PENDING',
      );

      if (dendaPending) {
        throw new BadRequestException(
          'Tidak dapat mengembalikan deposit karena masih ada denda yang belum dibayar/diverifikasi',
        );
      }

      const totalDenda = peminjaman.total_denda || 0;
      const depositKembali = Math.max(0, peminjaman.deposit - totalDenda);

      // ✅ Gunakan tipe REFUND_DEPOSIT
      if (depositKembali > 0) {
        await tx.pembayaran.create({
          data: {
            peminjamanId,
            jumlah: depositKembali,
            metode: MetodePembayaran.BANK_TRANSFER,
            tipe: TipePembayaran.REFUND_DEPOSIT,
            status: StatusVerifikasiPembayaran.VERIFIED,
            verifiedById: adminId,
            verifiedAt: new Date(),
            catatan: `Pengembalian deposit setelah dikurangi denda Rp${totalDenda.toLocaleString('id-ID')}`,
          },
        });
      }

      // ✅ Tambahkan audit trail di biayaDetail
      await tx.peminjamanBiayaDetail.create({
        data: {
          peminjamanId,
          tipe: 'OTHER',
          label: `✅ Deposit Rp${peminjaman.deposit.toLocaleString('id-ID')} dikembalikan Rp${depositKembali.toLocaleString('id-ID')} (potongan denda Rp${totalDenda.toLocaleString('id-ID')}) oleh admin ${adminId}`,
          jumlah: -depositKembali, // Negatif untuk refund
          sumber_id: adminId,
        },
      });

      // ✅ Tambahkan ke keterangan untuk kronologi
      const auditNote = `\n[${new Date().toISOString()}] Deposit dikembalikan oleh admin ${adminId}. Total denda: Rp${totalDenda.toLocaleString('id-ID')}. Deposit kembali: Rp${depositKembali.toLocaleString('id-ID')}`;

      await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          deposit_kembali: depositKembali,
          deposit_dikembalikan: true,
          keterangan: `${peminjaman.keterangan || ''}${auditNote}`,
        },
      });

      return {
        success: true,
        depositKembali,
        totalDenda,
        message:
          depositKembali > 0
            ? `Deposit dikembalikan Rp${depositKembali.toLocaleString('id-ID')}`
            : 'Tidak ada deposit yang dikembalikan (habis untuk denda)',
      };
    });
  }

  async getPeminjamanForDepositRefund(
    status: 'all' | 'pending' | 'done' = 'pending',
  ) {
    const whereClause: any = {
      status_pinjam: StatusPeminjaman.SELESAI,
      deposit: { gt: 0 }, // ✅ Hanya yang ada deposit
    };

    if (status === 'pending') {
      whereClause.deposit_dikembalikan = false;
    } else if (status === 'done') {
      whereClause.deposit_dikembalikan = true;
    }

    const peminjaman = await this.prisma.peminjaman.findMany({
      where: whereClause,
      select: {
        id: true,
        tanggal_selesai: true,
        deposit: true,
        total_denda: true,
        deposit_kembali: true,
        deposit_dikembalikan: true,
        status_pinjam: true,
        // ✅ Include info rekening
        nama_rekening_pengembalian: true,
        bank_pengembalian: true,
        nomor_rekening_pengembalian: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        pembayaran: {
          where: { tipe: 'DENDA' },
          select: {
            id: true,
            tipe: true,
            status: true,
            jumlah: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { tanggal_selesai: 'desc' },
    });

    return peminjaman;
  }
}
