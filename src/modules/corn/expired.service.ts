import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'prisma/prisma.service';
import { StatusPembayaran, StatusPeminjaman } from '@prisma/client';

@Injectable()
export class ExpiredService {
  constructor(private prisma: PrismaService) {}

  @Cron('*/5 * * * *') // tiap 5 menit
  async handleExpired() {
    const now = new Date();

    const expiredList = await this.prisma.peminjaman.findMany({
      where: {
        expired_at: { lt: now },
        status_bayar: {
          in: [
            StatusPembayaran.BELUM_BAYAR,
            StatusPembayaran.MENUNGGU_VERIFIKASI_DP,
          ],
        },
        status_pinjam: {
          not: StatusPeminjaman.DITOLAK,
        },
      },
      include: { items: true },
    });

    for (const p of expiredList) {
      await this.prisma.$transaction(async (tx) => {
        // 🔥 BALIKKAN STOK
        for (const item of p.items) {
          await tx.barang.update({
            where: { id: item.barangId },
            data: {
              stok_dipesan: { decrement: item.jumlah },
            },
          });
        }

        // 🔥 UPDATE STATUS
        await tx.peminjaman.update({
          where: { id: p.id },
          data: {
            status_pinjam: StatusPeminjaman.DITOLAK,
            keterangan: 'Expired otomatis (tidak bayar)',
          },
        });
      });
    }
  }
}
