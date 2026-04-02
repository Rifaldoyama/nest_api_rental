import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface MonthData {
  name: string;
  loans: number;
  returns: number;
}


@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalItems,
      activeLoans,
      pendingVerifications,
      totalUsers,
      monthlyRevenue,
      pendingPayments,
    ] = await Promise.all([
      // Total Items (aktif)
      this.prisma.barang.count({
        where: { isActive: true },
      }),

      // Active Loans (peminjaman yang sedang berlangsung)
      this.prisma.peminjaman.count({
        where: {
          status_pinjam: {
            in: ['DIPROSES', 'DIPAKAI'],
          },
        },
      }),

      // Pending Verifications (user yang belum diverifikasi)
      this.prisma.userDetail.count({
        where: {
          verification_status: 'PENDING',
        },
      }),

      // Total Users (kecuali ADMIN)
      this.prisma.user.count({
        where: {
          role: {
            not: 'ADMIN',
          },
        },
      }),

      // Monthly Revenue (pembayaran yang sudah diverifikasi bulan ini)
      this.prisma.pembayaran.aggregate({
        where: {
          status: 'VERIFIED',
          verifiedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: {
          jumlah: true,
        },
      }),

      // Pending Payments (pembayaran yang menunggu verifikasi)
      this.prisma.pembayaran.count({
        where: {
          status: 'PENDING',
        },
      }),
    ]);

    return {
      totalItems,
      activeLoans,
      pendingVerifications,
      totalUsers,
      monthlyRevenue: monthlyRevenue._sum.jumlah || 0,
      pendingPayments,
    };
  }

  async getActivityData() {
    // Get last 12 months data

    const months: MonthData[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString('id-ID', { month: 'short' });
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const [loans, returns] = await Promise.all([
        // Loans count for this month
        this.prisma.peminjaman.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),

        // Returns count for this month (peminjaman yang selesai)
        this.prisma.peminjaman.count({
          where: {
            tanggal_kembali: {
              gte: date,
              lt: nextMonth,
            },
            status_pinjam: 'SELESAI',
          },
        }),
      ]);

      months.push({
        name: monthName,
        loans,
        returns,
      });
    }

    return months;
  }

  async getRecentTransactions(limit: number = 5) {
    const transactions = await this.prisma.pembayaran.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        peminjaman: {
          include: {
            user: true,
            items: {
              include: {
                barang: true,
              },
            },
          },
        },
        verifiedBy: true,
      },
    });

    return transactions.map((tx) => ({
      id: tx.id.slice(0, 8).toUpperCase(),
      user: tx.peminjaman.user.username,
      item: tx.peminjaman.items[0]?.barang.nama || 'Multiple Items',
      amount: `Rp ${tx.jumlah.toLocaleString('id-ID')}`,
      status: this.mapPaymentStatus(tx.status),
      date: tx.createdAt.toISOString().split('T')[0],
    }));
  }

  async getPopularItems(limit: number = 5) {
    const popularItems = await this.prisma.peminjamanBarang.groupBy({
      by: ['barangId'],
      _count: {
        barangId: true,
      },
      orderBy: {
        _count: {
          barangId: 'desc',
        },
      },
      take: limit,
    });

    const itemsWithDetails = await Promise.all(
      popularItems.map(async (item, index) => {
        const barang = await this.prisma.barang.findUnique({
          where: { id: item.barangId },
          include: {
            kategori: true,
          },
        });

        if (!barang) return null;

        // Calculate average rating from testimonials
        const avgRating = await this.prisma.testimoni.aggregate({
          where: {
            peminjaman: {
              items: {
                some: {
                  barangId: barang.id,
                },
              },
            },
          },
          _avg: {
            rating: true,
          },
        });

        return {
          id: index + 1,
          name: barang.nama,
          category: barang.kategori.nama,
          rentals: item._count.barangId,
          rating: avgRating._avg.rating || 0,
          image: this.getIconForCategory(barang.kategori.nama),
          available: barang.stok_tersedia,
        };
      }),
    );

    return itemsWithDetails.filter((item) => item !== null);
  }

  private mapPaymentStatus(status: string) {
    const statusMap = {
      VERIFIED: 'completed',
      PENDING: 'pending',
      REJECTED: 'failed',
    };
    return statusMap[status] || 'processing';
  }

  private getIconForCategory(category: string): string {
    const icons = {
      Camera: '📷',
      Drone: '🚁',
      Audio: '🎤',
      'Action Camera': '🎥',
      Lens: '🔭',
      Lighting: '💡',
    };
    return icons[category] || '📦';
  }
}
