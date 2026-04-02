import { PrismaService } from 'prisma/prisma.service';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  StatusPeminjaman,
  StatusPembayaran,
  MetodePengambilan,
  KondisiBarang,
  JaminanTipe,
} from '@prisma/client';

type UpdateStatusPayload = {
  status_pinjam?: StatusPeminjaman;
  status_bayar?: StatusPembayaran;

  approvedById?: string;
  deliveredById?: string;
  receivedById?: string;

  jaminan_tipe?: JaminanTipe;
  kondisi_barang_keluar?: KondisiBarang;
  foto_serah_terima?: string;
  jaminan_detail?: string;
  zonaId?: string;
};

@Injectable()
export class PeminjamanSharedService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // INTERNAL TYPE (NETRAL)
  // ==========================================

  private readonly cancelStatus: StatusPeminjaman[] = [
    StatusPeminjaman.DITOLAK,
  ];

  async recalculateBill(tx: any, peminjamanId: string, zonaId?: string | null) {
    const peminjaman = await tx.peminjaman.findUnique({
      where: { id: peminjamanId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    let biayaOngkir = 0;

    if (zonaId) {
      const zona = await tx.zonaPengiriman.findUnique({
        where: { id: zonaId },
      });

      if (zona) biayaOngkir = zona.biaya;
    }

    const totalSewa = peminjaman.total_sewa;
    const ongkir = biayaOngkir;

    const total = totalSewa + ongkir;

    const DP_PERCENT = 0.35;
    const DEPOSIT_PERCENT = 0.4;

    const dp = Math.round(totalSewa * DP_PERCENT);
    const deposit =
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG
        ? Math.round(totalSewa * DEPOSIT_PERCENT)
        : 0;
    const sisa = totalSewa - dp;

    return {
      total_biaya: total,
      nominal_dp: dp,
      sisa_tagihan: sisa,
      deposit,
      zonaId,
    };
  }

  // ==========================================
  // GET ALL
  // ==========================================

  async findAll() {
    return this.prisma.peminjaman.findMany({
      include: {
        user: {
          include: {
            detail: true,
          },
        },
        items: {
          include: {
            barang: {
              /* ... select barang ... */
            },
          },
        },
        paket: true,
        approvedBy: { select: { id: true, username: true } },
        deliveredBy: { select: { id: true, username: true } },
        receivedBy: { select: { id: true, username: true } },
        zona: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // UPDATE STATUS (GENERIC)
  // ==========================================

  async updateStatus(
    peminjamanId: string,
    actorId: string,
    data: UpdateStatusPayload,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Ambil data peminjaman beserta itemnya
      const peminjaman = await tx.peminjaman.findUnique({
        where: { id: peminjamanId },
        include: { items: true },
      });

      if (!peminjaman)
        throw new NotFoundException('Peminjaman tidak ditemukan');
      const oldStatus = peminjaman.status_pinjam;
      const newStatus = data.status_pinjam;

      if (
        data.status_bayar &&
        !peminjaman.zonaId &&
        peminjaman.metode_ambil === MetodePengambilan.DIANTAR
      ) {
        throw new BadRequestException('Zona belum di-set');
      }

      if (peminjaman.metode_ambil === MetodePengambilan.DIANTAR) {
        if (!peminjaman.zonaId && !data.zonaId) {
          throw new BadRequestException(
            'Zona harus ditentukan sebelum pembayaran',
          );
        }
      }

      const unpaidStatus: StatusPembayaran[] = [
        StatusPembayaran.BELUM_BAYAR,
        StatusPembayaran.MENUNGGU_VERIFIKASI_DP,
      ];

      if (
        peminjaman.expired_at &&
        new Date() > peminjaman.expired_at &&
        unpaidStatus.includes(peminjaman.status_bayar)
      ) {
        await tx.peminjaman.update({
          where: { id: peminjamanId },
          data: {
            status_pinjam: StatusPeminjaman.DITOLAK,
            keterangan: 'Expired (tidak bisa melakukan pembayaran)',
          },
        });

        throw new BadRequestException('Transaksi sudah expired');
      }
      const validTransitions =
        peminjaman.metode_ambil === MetodePengambilan.DIANTAR
          ? {
              MENUNGGU_PERSETUJUAN: [
                StatusPeminjaman.SIAP_DIPROSES,
                StatusPeminjaman.DITOLAK,
              ],

              SIAP_DIPROSES: [StatusPeminjaman.DIPROSES],

              DIPROSES: [StatusPeminjaman.DIPAKAI],

              DIPAKAI: [StatusPeminjaman.SELESAI],
            }
          : {
              MENUNGGU_PERSETUJUAN: [
                StatusPeminjaman.SIAP_DIPROSES,
                StatusPeminjaman.DITOLAK,
              ],

              SIAP_DIPROSES: [StatusPeminjaman.DIPROSES],

              DIPROSES: [StatusPeminjaman.DIPAKAI],

              DIPAKAI: [StatusPeminjaman.SELESAI],
            };

      if (data.status_pinjam) {
        const allowed = validTransitions[peminjaman.status_pinjam] || [];

        if (!allowed.includes(data.status_pinjam)) {
          throw new BadRequestException(
            `Transisi tidak valid dari ${peminjaman.status_pinjam} ke ${data.status_pinjam}`,
          );
        }
      }

      // 2. Siapkan object untuk update
      let updateData: any = {
        ...data,
      };

      if (data.status_pinjam === StatusPeminjaman.DIPROSES) {
        updateData.deliveredById = actorId;
      }

      if (data.status_pinjam === StatusPeminjaman.SELESAI) {
        updateData.receivedById = actorId;
      }

      if (data.status_bayar) {
        updateData.status_bayar = data.status_bayar;
      }
      // 1. DP → cuma validasi, tidak ubah status
      if (data.status_bayar === StatusPembayaran.DP_DITERIMA) {
        updateData.status_bayar = StatusPembayaran.DP_DITERIMA;
      }

      // =====================================================
      // SIDE EFFECT: STOCK OUT (DIPROSES)
      // =====================================================

      if (
        oldStatus === StatusPeminjaman.SIAP_DIPROSES &&
        newStatus === StatusPeminjaman.DIPROSES
      ) {
        for (const item of peminjaman.items) {
          const barang = await tx.barang.findUnique({
            where: { id: item.barangId },
          });

          if (!barang || barang.stok_tersedia < item.jumlah) {
            throw new BadRequestException(
              `Stok tidak cukup untuk barang ${item.barangId}`,
            );
          }

          const before = barang.stok_tersedia;
          const after = before - item.jumlah;

          await tx.barang.update({
            where: { id: item.barangId },
            data: {
              stok_tersedia: { decrement: item.jumlah },
              stok_keluar: { increment: item.jumlah },
            },
          });
          // ✅ INVENTORY LOG WAJIB
          await tx.inventoryLog.create({
            data: {
              barangId: item.barangId,
              peminjamanId: peminjaman.id,
              tipe: 'OUT',
              jumlah: item.jumlah,
              before_stock: before,
              after_stock: after,
            },
          });
        }
      }
      // =====================================================
      // SIDE EFFECT: REJECT → RESTORE STOCK
      // =====================================================

      if (
        newStatus === StatusPeminjaman.DITOLAK &&
        oldStatus !== StatusPeminjaman.DITOLAK
      ) {
        for (const item of peminjaman.items) {
          const barang = await tx.barang.findUnique({
            where: { id: item.barangId },
          });

          if (!barang) {
            throw new NotFoundException(
              `Barang dengan id ${item.barangId} tidak ditemukan`,
            );
          }

          if (barang.stok_keluar < item.jumlah) {
            throw new BadRequestException(
              `Stok tidak cukup untuk barang ${item.barangId}`,
            );
          }

          const before = barang.stok_tersedia;
          const after = before + item.jumlah;

          await tx.barang.update({
            where: { id: item.barangId },
            data: {
              stok_tersedia: { increment: item.jumlah },
              stok_keluar: { decrement: item.jumlah },
            },
          });

          await tx.inventoryLog.create({
            data: {
              barangId: item.barangId,
              peminjamanId: peminjaman.id,
              tipe: 'RETURN',
              jumlah: item.jumlah,
              before_stock: before,
              after_stock: after,
            },
          });
        }
      }
      // 4. Eksekusi Update
      return tx.peminjaman.update({
        where: { id: peminjamanId },
        data: updateData,
        include: {
          user: true,

          items: {
            include: {
              barang: true,
            },
          },

          approvedBy: {
            select: { id: true, username: true },
          },

          deliveredBy: {
            select: { id: true, username: true },
          },

          receivedBy: {
            select: { id: true, username: true },
          },

          zona: true,
        },
      });
    });
  }
}
