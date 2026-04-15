import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';
import { PetugasHandoverDto } from './dto/petugas-handover.dto';
import {
  StatusPembayaran,
  StatusPeminjaman,
  KondisiBarang,
  JaminanStatus,
  JenisDenda,
  PeminjamanBiayaDetail,
} from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';
import { ReturnBarangDto } from './dto/return-barang.dto';
import { ReturnJaminanDto } from './dto/return-jaminan.dto';

// src/modules/petugas/peng_peminjaman/peminjaman.service.ts
@Injectable()
export class PetugasPeminjamanService {
  constructor(
    private shared: PeminjamanSharedService,
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  // Petugas melihat tugas yang masuk
  findAll() {
    return this.shared.findAll();
  }
  async findOne(id: string) {
    return this.prisma.peminjaman.findUnique({
      where: { id },
      include: {
        user: { include: { detail: true } },
        items: { include: { barang: true } },
        paket: true,
        zona: true,
        pembayaran: {
          include: { allocations: true },
        },
        biayaDetails: true,
      },
    });
  }

  async getAuditTrail(peminjamanId: string) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
      include: {
        user: {
          include: { detail: true },
        },
        items: {
          include: { barang: true },
        },
        biayaDetails: {
          orderBy: { createdAt: 'desc' },
        },
        pembayaran: {
          include: {
            verifiedBy: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        deliveredBy: { select: { id: true, username: true } },
        receivedBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
        // ✅ Sekarang sudah tersedia setelah schema diupdate
        inventoryLogs: {
          include: { barang: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!peminjaman) {
      throw new NotFoundException('Peminjaman tidak ditemukan');
    }

    // Parse keterangan menjadi kronologi
    const kronologi =
      peminjaman.keterangan
        ?.split('\n')
        .filter((line) => line.trim() && line.startsWith('['))
        .map((line) => {
          const match = line.match(/\[(.*?)\]\s(.*)/);
          return {
            timestamp: match ? new Date(match[1]) : null,
            event: match ? match[2] : line,
            raw: line,
          };
        }) || [];

    return {
      id: peminjaman.id,
      customer: peminjaman.user.detail?.nama_lengkap || 'Unknown',

      // Timeline status
      status_peminjaman: {
        saat_ini: peminjaman.status_pinjam,
        history: kronologi.filter(
          (k) =>
            k.event.toLowerCase().includes('status') ||
            k.event.toLowerCase().includes('diproses') ||
            k.event.toLowerCase().includes('dipakai') ||
            k.event.toLowerCase().includes('selesai'),
        ),
      },

      // Timeline petugas
      petugas: {
        pengantar: peminjaman.deliveredBy,
        penerima: peminjaman.receivedBy,
        approver: peminjaman.approvedBy,
      },

      // Detail barang & kondisi
      barang: peminjaman.items.map((item) => ({
        id: item.barangId,
        nama: item.barang.nama,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        kondisi_kembali: item.kondisi_kembali,
      })),

      // Detail denda (dari biayaDetails)
      denda: peminjaman.biayaDetails
        .filter((b) => b.tipe === 'DENDA')
        .map((d) => ({
          id: d.id,
          label: d.label,
          jumlah: d.jumlah,
          jenis: d.jenis_denda,
          quantity: d.qty,
          barang_id: d.barangId,
          created_at: d.createdAt,
        })),

      total_denda: peminjaman.total_denda,

      // Detail deposit
      deposit: {
        awal: peminjaman.deposit,
        kembali: peminjaman.deposit_kembali,
        sudah_dikembalikan: peminjaman.deposit_dikembalikan,
        tipe: peminjaman.jaminan_tipe,
      },

      // Pembayaran
      pembayaran: peminjaman.pembayaran.map((p) => ({
        id: p.id,
        jumlah: p.jumlah,
        tipe: p.tipe,
        status: p.status,
        metode: p.metode,
        verified_by: p.verifiedBy?.username,
        verified_at: p.verifiedAt,
        created_at: p.createdAt,
      })),

      // Pergerakan stok
      stok_movement: peminjaman.inventoryLogs.map((log) => ({
        id: log.id,
        barang: log.barang.nama,
        tipe: log.tipe,
        jumlah: log.jumlah,
        before: log.before_stock,
        after: log.after_stock,
        timestamp: log.createdAt,
      })),

      // Dokumen
      dokumen: {
        foto_serah_terima: peminjaman.foto_serah_terima,
        foto_pengembalian: peminjaman.foto_pengembalian,
        kondisi_keluar: peminjaman.kondisi_barang_keluar,
      },

      // Kronologi lengkap
      kronologi,

      // Metadata
      metadata: {
        created_at: peminjaman.createdAt,
        tanggal_mulai: peminjaman.tanggal_mulai,
        tanggal_selesai: peminjaman.tanggal_selesai,
        tanggal_kembali: peminjaman.tanggal_kembali,
        metode_ambil: peminjaman.metode_ambil,
      },
    };
  }

  async startDelivery(peminjamanId: string, petugasId: string) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam !== StatusPeminjaman.SIAP_DIPROSES) {
      throw new BadRequestException('Harus SIAP_DIPROSES');
    }

    return this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        status_pinjam: StatusPeminjaman.DIPROSES,
        deliveredById: petugasId,
        keterangan: `${peminjaman.keterangan || ''}\n[${new Date().toISOString()}] Petugas mulai pengantaran`,
      },
    });
  }

  // Add confirmArrival method for DIANTAR
  async confirmArrival(peminjamanId: string, petugasId: string) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
    });

    if (!peminjaman) {
      throw new NotFoundException('Peminjaman tidak ditemukan');
    }

    // Only DIANTAR method can use this
    if (peminjaman.metode_ambil !== 'DIANTAR') {
      throw new BadRequestException(
        'Konfirmasi kedatangan hanya untuk metode pengantaran (DIANTAR)',
      );
    }

    // Must be in DIPROSES status
    if (peminjaman.status_pinjam !== StatusPeminjaman.DIPROSES) {
      throw new BadRequestException(
        `Konfirmasi kedatangan hanya bisa dari status DIPROSES, saat ini: ${peminjaman.status_pinjam}`,
      );
    }

    const auditNote = `\n[${new Date().toISOString()}] Barang telah sampai di tujuan, dikonfirmasi oleh petugas ${petugasId}`;
    // Update to DIPAKAI
    return this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        status_pinjam: StatusPeminjaman.DIPAKAI,
        deliveredById: petugasId,
        keterangan: `${peminjaman.keterangan || ''}${auditNote}`,
      },
    });
  }

  // Tahap 2: Barang sampai, dipasang, jaminan diambil, dan diserahkan (Handover)
  async handover(
    peminjamanId: string,
    petugasId: string,
    dto: PetugasHandoverDto,
    file: Express.Multer.File,
  ) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam !== StatusPeminjaman.DIPROSES) {
      throw new BadRequestException(
        `Handover hanya bisa dilakukan dari status DIPROSES, saat ini: ${peminjaman.status_pinjam}`,
      );
    }
    let fotoPath: string | null = null;

    if (file) {
      fotoPath = await this.minio.upload(file, `handover/${peminjamanId}`);
    }
    const auditNote = `\n[${new Date().toISOString()}] Serah terima dilakukan oleh petugas ${petugasId}. Kondisi barang keluar: ${dto.kondisi_barang_keluar}`;

    const items = await this.prisma.peminjamanBarang.findMany({
      where: { peminjamanId },
    });

    for (const item of items) {
      const barang = await this.prisma.barang.findUnique({
        where: { id: item.barangId },
      });

      if (!barang) continue;

      const beforeStock = barang.stok_tersedia;
      const afterStock = beforeStock - item.jumlah;

      await this.prisma.barang.update({
        where: { id: item.barangId },
        data: {
          stok_tersedia: { decrement: item.jumlah },
          stok_dipesan: { decrement: item.jumlah },
          stok_keluar: { increment: item.jumlah },
        },
      });

      await this.prisma.inventoryLog.create({
        data: {
          barangId: item.barangId,
          peminjamanId,
          tipe: 'OUT',
          jumlah: item.jumlah,
          before_stock: beforeStock,
          after_stock: afterStock,
        },
      });
    }
    return this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        status_pinjam: StatusPeminjaman.DIPAKAI,
        kondisi_barang_keluar: dto.kondisi_barang_keluar as KondisiBarang,
        foto_serah_terima: fotoPath,
        deliveredById: petugasId,
        keterangan: `${peminjaman.keterangan || ''}${auditNote}`,
      },
    });
  }

  async returnBarang(
    peminjamanId: string,
    petugasId: string,
    dto: ReturnBarangDto,
    file: Express.Multer.File,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const peminjaman = await tx.peminjaman.findUnique({
        where: { id: peminjamanId },
        include: {
          items: {
            include: {
              barang: true,
            },
          },
        },
      });

      if (!peminjaman)
        throw new NotFoundException('Peminjaman tidak ditemukan');

      if (peminjaman.status_pinjam !== StatusPeminjaman.DIPAKAI) {
        throw new BadRequestException(
          `Return hanya bisa dari DIPAKAI, saat ini: ${peminjaman.status_pinjam}`,
        );
      }

      if (dto.items.length !== peminjaman.items.length) {
        throw new BadRequestException(
          'Semua barang wajib diisi kondisi kembali',
        );
      }

      // =============================================
      // 1. HITUNG DENDA KERUSAKAN/KEHILANGAN
      // =============================================
      let totalDendaKerusakan = 0;
      const dendaDetails: PeminjamanBiayaDetail[] = [];

      for (const item of dto.items) {
        const pemItem = peminjaman.items.find(
          (i) => i.barangId === item.barangId,
        );

        if (!pemItem) throw new BadRequestException('Barang tidak valid');

        // ✅ Ambil persentase denda dari snapshot (sudah ada di DB!)
        let persentaseDenda = 0;
        let jenisDenda: JenisDenda = 'KERUSAKAN';

        switch (item.kondisi_kembali) {
          case KondisiBarang.RUSAK_RINGAN:
            persentaseDenda = pemItem.denda_ringan_snapshot || 0.2;
            break;
          case KondisiBarang.RUSAK_SEDANG:
            persentaseDenda = pemItem.denda_sedang_snapshot || 0.5;
            break;
          case KondisiBarang.RUSAK_BERAT:
            persentaseDenda = pemItem.denda_berat_snapshot || 0.8;
            break;
          case KondisiBarang.HILANG:
            persentaseDenda = pemItem.denda_hilang_snapshot || 1;
            jenisDenda = 'KEHILANGAN';
            break;
          default:
            persentaseDenda = 0;
        }

        const dendaItem = Math.floor(
          pemItem.harga_satuan * pemItem.jumlah * persentaseDenda,
        );
        totalDendaKerusakan += dendaItem;

        // ✅ CATAT DETAIL KERUSAKAN DI BIAYADETAIL (AUDIT TRAIL)
        if (dendaItem > 0) {
          const biayaDetail = await tx.peminjamanBiayaDetail.create({
            data: {
              peminjamanId,
              barangId: item.barangId,
              tipe: 'DENDA',
              label: `${pemItem.barang.nama} - ${item.kondisi_kembali} (${persentaseDenda * 100}% dari ${pemItem.harga_satuan.toLocaleString()})`,
              jumlah: dendaItem,
              jenis_denda: jenisDenda,
              qty: pemItem.jumlah,
              sumber_id: petugasId, // ✅ Catat petugas yang menemukan
            },
          });

          dendaDetails.push(biayaDetail);
        }

        // Update kondisi kembali
        await tx.peminjamanBarang.updateMany({
          where: { peminjamanId, barangId: item.barangId },
          data: { kondisi_kembali: item.kondisi_kembali },
        });
      }

      // =============================================
      // 2. HITUNG DENDA KETERLAMBATAN
      // =============================================
      const tanggalKembali = dto.tanggal_kembali
        ? new Date(dto.tanggal_kembali)
        : new Date();
      const tanggalSelesai = new Date(peminjaman.tanggal_selesai);

      let totalDendaTelat = 0;
      let hariTelat = 0;

      if (tanggalKembali > tanggalSelesai) {
        hariTelat = Math.ceil(
          (tanggalKembali.getTime() - tanggalSelesai.getTime()) /
            (1000 * 3600 * 24),
        );

        let totalDendaPerHari = 0;
        for (const item of peminjaman.items) {
          totalDendaPerHari += (item.denda_telat_snapshot || 0) * item.jumlah;
        }

        totalDendaTelat = totalDendaPerHari * hariTelat;

        if (totalDendaTelat > 0) {
          // ✅ CATAT DENDA KETERLAMBATAN DI BIAYADETAIL
          await tx.peminjamanBiayaDetail.create({
            data: {
              peminjamanId,
              tipe: 'DENDA',
              label: `Denda keterlambatan ${hariTelat} hari x Rp${totalDendaPerHari.toLocaleString()}/hari`,
              jumlah: totalDendaTelat,
              jenis_denda: 'KETERLAMBATAN',
              qty: hariTelat,
              sumber_id: petugasId,
            },
          });
        }
      }

      // =============================================
      // 3. UPLOAD FOTO & UPDATE PEMINJAMAN
      // =============================================
      let fotoPath: string | null = null;
      if (file) {
        fotoPath = await this.minio.upload(
          file,
          `pengembalian/${peminjamanId}`,
        );
      }

      const totalDenda = totalDendaKerusakan + totalDendaTelat;

      // ✅ Catat di keterangan untuk audit trail
      const auditNote = `\n[${new Date().toISOString()}] Barang dikembalikan oleh petugas ${petugasId}. Denda kerusakan: ${totalDendaKerusakan}, Denda telat: ${totalDendaTelat}.`;

      await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          status_pinjam: StatusPeminjaman.SELESAI,
          receivedById: petugasId,
          foto_pengembalian: fotoPath,
          tanggal_kembali: tanggalKembali,
          total_denda: { increment: totalDenda },
          total_tagihan: { increment: totalDenda },
          sisa_tagihan: { increment: totalDenda },
          keterangan: `${peminjaman.keterangan || ''}${auditNote}`,
        },
      });

      // =============================================
      // 4. HANDLE BERDASARKAN TIPE JAMINAN
      // =============================================
      if (totalDenda > 0) {
        // ✅ PERBAIKI: Cek deposit > 0 sebagai prioritas
        if (peminjaman.deposit > 0) {
          // Ada deposit, potong dari deposit (tidak peduli jaminan_tipe)
          await tx.peminjamanBiayaDetail.create({
            data: {
              peminjamanId,
              tipe: 'OTHER',
              label: `⚠️ Denda total Rp${totalDenda.toLocaleString()} akan dipotong dari deposit`,
              jumlah: 0,
              sumber_id: petugasId,
            },
          });

          // ✅ Update deposit_kembali langsung
          const depositKembali = Math.max(0, peminjaman.deposit - totalDenda);
          await tx.peminjaman.update({
            where: { id: peminjamanId },
            data: {
              deposit_kembali: depositKembali,
              // deposit_dikembalikan tetap false, nanti admin yang proses
            },
          });
        } else if (
          peminjaman.jaminan_tipe === 'DEPOSIT_UANG' &&
          peminjaman.deposit > 0
        ) {
          // Fallback: cek jaminan_tipe juga
          await tx.peminjamanBiayaDetail.create({
            data: {
              peminjamanId,
              tipe: 'OTHER',
              label: `⚠️ Denda total Rp${totalDenda.toLocaleString()} akan dipotong dari deposit (Admin)`,
              jumlah: 0,
              sumber_id: petugasId,
            },
          });
        } else {
          // Tidak ada deposit, buat tagihan denda
          await tx.pembayaran.create({
            data: {
              peminjamanId,
              jumlah: totalDenda,
              metode: 'BANK_TRANSFER',
              tipe: 'DENDA',
              status: 'PENDING',
              catatan: `Tagihan denda: Kerusakan Rp${totalDendaKerusakan.toLocaleString()}, Keterlambatan Rp${totalDendaTelat.toLocaleString()}`,
              allocations: {
                create: {
                  tipe: 'PELUNASAN',
                  jumlah: totalDenda,
                },
              },
            },
          });

          await tx.peminjaman.update({
            where: { id: peminjamanId },
            data: {
              status_bayar: StatusPembayaran.MENUNGGU_VERIFIKASI_PELUNASAN,
            },
          });
        }
      }

      // =============================================
      // 5. KEMBALIKAN STOK & BUAT INVENTORY LOG
      // =============================================
      for (const item of dto.items) {
        const pemItem = peminjaman.items.find(
          (i) => i.barangId === item.barangId,
        );

        if (!pemItem) {
          throw new BadRequestException('Barang tidak valid');
        }

        const jumlah = pemItem.jumlah;

        const updatedCheck = await tx.barang.findUnique({
          where: { id: item.barangId },
        });

        if (!updatedCheck) {
          throw new BadRequestException('Barang tidak ditemukan');
        }

        const beforeStock = updatedCheck.stok_tersedia;

        const kondisi = item.kondisi_kembali;

        const isRusakRingan =
          kondisi === KondisiBarang.RUSAK_RINGAN ||
          kondisi === KondisiBarang.RUSAK_SEDANG;

        const isRusakBerat =
          kondisi === KondisiBarang.RUSAK_BERAT ||
          kondisi === KondisiBarang.HILANG;

        // ✅ BAGUS
        if (!isRusakBerat) {
          const afterStock = beforeStock + jumlah;

          const updated = await tx.barang.updateMany({
            where: {
              id: item.barangId,
              stok_keluar: { gte: jumlah },
            },
            data: {
              stok_tersedia: { increment: jumlah },
              stok_keluar: { decrement: jumlah },
            },
          });

          if (updated.count === 0) {
            throw new BadRequestException('Stok tidak valid');
          }

          await tx.inventoryLog.create({
            data: {
              barangId: item.barangId,
              peminjamanId,
              tipe: 'RETURN',
              jumlah,
              before_stock: beforeStock,
              after_stock: afterStock,
            },
          });

          continue;
        }

        const updated = await tx.barang.updateMany({
          where: {
            id: item.barangId,
            stok_keluar: { gte: jumlah },
          },
          data: {
            stok_total: { decrement: jumlah },
            stok_keluar: { decrement: jumlah },
          },
        });

        if (updated.count === 0) {
          throw new BadRequestException('Stok tidak valid');
        }

        await tx.inventoryLog.create({
          data: {
            barangId: item.barangId,
            peminjamanId,
            tipe: 'RETURN',
            jumlah: jumlah,
            before_stock: beforeStock,
            after_stock: beforeStock,
          },
        });
      }

      return {
        message: 'Return berhasil',
        totalDenda: {
          kerusakan: totalDendaKerusakan,
          keterlambatan: totalDendaTelat,
          total: totalDenda,
        },
        dendaDetails,
      };
    });
  }

  // ===============================
  // KEMBALIKAN JAMINAN FISIK (KTP, SIM, dll)
  // ===============================
  async kembalikanJaminanFisik(
    peminjamanId: string,
    petugasId: string,
    dto: ReturnJaminanDto,
    file?: Express.Multer.File,
  ) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
    });

    if (!peminjaman) {
      throw new NotFoundException('Peminjaman tidak ditemukan');
    }

    // Validasi: hanya untuk jaminan non-deposit
    if (peminjaman.jaminan_tipe === 'DEPOSIT_UANG') {
      throw new BadRequestException(
        'Jaminan deposit uang dikembalikan oleh admin via transfer',
      );
    }

    // Validasi: status harus SELESAI
    if (peminjaman.status_pinjam !== StatusPeminjaman.SELESAI) {
      throw new BadRequestException(
        `Peminjaman belum selesai. Status saat ini: ${peminjaman.status_pinjam}`,
      );
    }

    // Validasi: jangan double return
    if (peminjaman.jaminan_status === JaminanStatus.DIKEMBALIKAN) {
      throw new BadRequestException('Jaminan sudah dikembalikan sebelumnya');
    }

    // Upload foto bukti jika ada
    let fotoPath: string | null = null;
    if (file) {
      fotoPath = await this.minio.upload(file, `jaminan/${peminjamanId}`);
    }

    // Update peminjaman
    const updated = await this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        jaminan_status: dto.status,
        keterangan: dto.catatan
          ? `${peminjaman.keterangan || ''}\nPengembalian jaminan: ${dto.catatan}`
          : peminjaman.keterangan,
        // Simpan foto bukti (perlu tambah field di schema jika belum ada)
        // foto_bukti_jaminan: fotoPath,
      },
    });

    // Buat log pengembalian jaminan (optional)
    await this.prisma.peminjamanBiayaDetail.create({
      data: {
        peminjamanId,
        tipe: 'OTHER',
        label: `Pengembalian jaminan ${peminjaman.jaminan_tipe} oleh petugas ${petugasId}`,
        jumlah: 0,
        sumber_id: petugasId,
      },
    });

    return {
      success: true,
      message: `Jaminan ${peminjaman.jaminan_tipe} berhasil dikembalikan`,
      data: {
        jaminan_tipe: peminjaman.jaminan_tipe,
        jaminan_detail: peminjaman.jaminan_detail,
        status: dto.status,
        catatan: dto.catatan,
        foto_bukti: fotoPath,
      },
    };
  }
}
