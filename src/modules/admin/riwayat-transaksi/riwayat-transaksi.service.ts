import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';

type MonthlyStat = {
  month: Date;
  count: number;
  revenue: number;
};
@Injectable()
export class RiwayatTransaksiService {
  constructor(private prisma: PrismaService) {}

  async getAllTransactions(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PeminjamanWhereInput = {};

    // Date filter
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    // Status filter
    if (filters?.status) {
      where.status_pinjam = filters.status as any;
    }

    // Search filter
    if (filters?.search) {
      where.OR = [
        {
          user: { username: { contains: filters.search, mode: 'insensitive' } },
        },
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
        { id: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.prisma.peminjaman.findMany({
        where,
        include: {
          user: {
            include: {
              detail: true,
            },
          },
          items: {
            include: {
              barang: {
                include: {
                  kategori: true,
                },
              },
            },
          },
          pembayaran: {
            include: {
              verifiedBy: true,
              rekeningTujuan: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          paket: {
            include: {
              items: {
                include: {
                  barang: true,
                },
              },
            },
          },
          approvedBy: true,
          deliveredBy: true,
          receivedBy: true,
          biayaDetails: true,
          testimoni: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.peminjaman.count({ where }),
    ]);

    return {
      data: transactions.map((tx) => this.formatTransaction(tx)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransactionDetail(id: string) {
    const transaction = await this.prisma.peminjaman.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            detail: true,
          },
        },
        items: {
          include: {
            barang: {
              include: {
                kategori: true,
              },
            },
          },
        },
        pembayaran: {
          include: {
            verifiedBy: true,
            rekeningTujuan: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        approvedBy: true,
        deliveredBy: true,
        receivedBy: true,
        biayaDetails: true,
        testimoni: true,
        paket: {
          include: {
            items: {
              include: {
                barang: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return this.formatTransaction(transaction);
  }

  async getActivityLogs(limit: number = 50) {
    // Combine logs from multiple sources
    const [peminjamanLogs, pembayaranLogs, inventoryLogs] = await Promise.all([
      // Peminjaman status changes
      this.prisma.peminjaman.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          approvedBy: true,
          deliveredBy: true,
          receivedBy: true,
        },
      }),

      // Pembayaran verifications
      this.prisma.pembayaran.findMany({
        take: limit,
        orderBy: { verifiedAt: 'desc' },
        where: {
          verifiedAt: { not: null },
        },
        include: {
          peminjaman: {
            include: { user: true },
          },
          verifiedBy: true,
        },
      }),

      // Inventory changes
      this.prisma.inventoryLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          barang: true,
        },
      }),
    ]);

    // Format and combine logs
    const logs = [
      ...peminjamanLogs.map((log) => this.formatPeminjamanLog(log)),
      ...pembayaranLogs.map((log) => this.formatPembayaranLog(log)),
      ...inventoryLogs.map((log) => this.formatInventoryLog(log)),
    ];

    // Sort by date
    logs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return logs.slice(0, limit);
  }

  private formatTransaction(tx: any) {
    const totalPaid = tx.pembayaran
      .filter((p) => p.status === 'VERIFIED')
      .reduce((sum, p) => sum + p.jumlah, 0);

    const dpPaid = tx.pembayaran
      .filter((p) => p.tipe === 'DP' && p.status === 'VERIFIED')
      .reduce((sum, p) => sum + p.jumlah, 0);

    return {
      id: tx.id,
      invoiceNumber: `INV-${tx.id.slice(0, 8).toUpperCase()}`,
      user: {
        id: tx.user.id,
        name: tx.user.username,
        email: tx.user.email,
        phone: tx.user.detail?.no_hp,
      },
      items: tx.items.map((item) => ({
        id: item.barang.id,
        name: item.barang.nama,
        quantity: item.jumlah,
        price: item.harga_satuan,
        subtotal: item.jumlah * item.harga_satuan,
        category: item.barang.kategori.nama,
        kondisiKeluar: tx.kondisi_barang_keluar,
        kondisiKembali: item.kondisi_kembali,
      })),
      paket: tx.paket
        ? {
            id: tx.paket.id,
            name: tx.paket.nama,
            diskon: tx.paket.diskon_persen,
            totalPaket: tx.paket.harga_final,
          }
        : null,
      dates: {
        start: tx.tanggal_mulai,
        end: tx.tanggal_selesai,
        return: tx.tanggal_kembali,
        createdAt: tx.createdAt,
      },
      financials: {
        totalSewa: tx.total_sewa,
        totalBiaya: tx.total_biaya,
        dp: {
          required: tx.nominal_dp,
          paid: dpPaid,
          status: dpPaid >= tx.nominal_dp ? 'LUNAS' : 'KURANG',
        },
        paid: totalPaid,
        remaining: tx.sisa_tagihan,
        deposit: {
          amount: tx.deposit,
          returned: tx.deposit_kembali,
          status: tx.deposit_dikembalikan ? 'RETURNED' : 'HELD',
        },
        paymentHistory: tx.pembayaran.map((p) => ({
          id: p.id,
          amount: p.jumlah,
          type: p.tipe,
          method: p.metode,
          status: p.status,
          verifiedBy: p.verifiedBy?.username,
          verifiedAt: p.verifiedAt,
          receipt: p.bukti_pembayaran,
          createdAt: p.createdAt,
        })),
        additionalFees: tx.biayaDetails.map((b) => ({
          type: b.tipe,
          label: b.label,
          amount: b.jumlah,
        })),
      },
      status: {
        peminjaman: tx.status_pinjam,
        pembayaran: tx.status_bayar,
      },
      delivery: {
        method: tx.metode_ambil,
        address: tx.alamat_acara,
        zone: tx.zona,
        deliveredBy: tx.deliveredBy?.username,
        receivedBy: tx.receivedBy?.username,
      },
      documents: {
        serahTerima: tx.foto_serah_terima,
        pengembalian: tx.foto_pengembalian,
        suratJalan: tx.file_surat_jalan,
      },
      jaminan: tx.jaminan_tipe
        ? {
            type: tx.jaminan_tipe,
            detail: tx.jaminan_detail,
            status: tx.jaminan_status,
          }
        : null,
      testimoni: tx.testimoni,
      approvedBy: tx.approvedBy?.username,
      notes: tx.keterangan,
      expiredAt: tx.expired_at,
    };
  }

  private formatPeminjamanLog(tx: any) {
    // Ambil timestamp yang valid, fallback ke current date jika tidak ada
    let timestamp = tx.updatedAt || tx.createdAt;

    // Jika masih null/undefined, gunakan current date
    if (!timestamp) {
      timestamp = new Date();
    }

    return {
      id: `${tx.id}-status`,
      type: 'PEMINJAMAN',
      action: `Status peminjaman: ${tx.status_pinjam}`,
      user: tx.user?.username || 'System',
      timestamp: timestamp, // ✅ Pastikan valid
      details: {
        newStatus: tx.status_pinjam,
        transactionId: tx.id,
      },
    };
  }

  private formatPembayaranLog(payment: any) {
    return {
      id: payment.id,
      type: 'PEMBAYARAN',
      action: `Pembayaran ${payment.tipe} sebesar Rp ${payment.jumlah.toLocaleString()} diverifikasi oleh ${payment.verifiedBy?.username}`,
      user: payment.peminjaman.user.username,
      timestamp: payment.verifiedAt,
      details: {
        amount: payment.jumlah,
        type: payment.tipe,
        status: payment.status,
        transactionId: payment.peminjamanId,
      },
    };
  }

  private formatInventoryLog(log: any) {
    return {
      id: log.id,
      type: 'INVENTORY',
      action: `${log.tipe} - ${log.barang.nama}: ${log.jumlah} unit (${log.before_stock} → ${log.after_stock})`,
      user: 'System',
      timestamp: log.createdAt,
      details: {
        barangId: log.barangId,
        barangName: log.barang.nama,
        type: log.tipe,
        quantity: log.jumlah,
        beforeStock: log.before_stock,
        afterStock: log.after_stock,
      },
    };
  }

  async getTransactionStats() {
    const [
      totalTransactions,
      totalRevenue,
      averageTransaction,
      statusCount,
      monthlyStats,
    ] = await Promise.all([
      this.prisma.peminjaman.count(),

      this.prisma.pembayaran.aggregate({
        where: { status: 'VERIFIED' },
        _sum: { jumlah: true },
      }),

      this.prisma.pembayaran.aggregate({
        where: { status: 'VERIFIED' },
        _avg: { jumlah: true },
      }),

      this.prisma.peminjaman.groupBy({
        by: ['status_pinjam'],
        _count: true,
      }),

      this.prisma.$queryRaw<MonthlyStat[]>`
      SELECT 
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*)::int as count,
        COALESCE(SUM("total_biaya"),0)::int as revenue
      FROM "Peminjaman"
      WHERE "createdAt" >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month DESC
    `,
    ]);

    return {
      total: Number(totalTransactions),

      revenue: Number(totalRevenue._sum.jumlah || 0),

      average: Number(averageTransaction._avg.jumlah || 0),

      statusBreakdown: statusCount.map((s) => ({
        status_pinjam: s.status_pinjam,
        _count: Number(s._count),
      })),

      monthlyTrend: monthlyStats.map((m) => ({
        month: new Date(m.month).toISOString().slice(0, 7),
        count: m.count,
        revenue: m.revenue,
      })),
    };
  }

  async exportTransactions(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    search?: string;
  }) {
    const where: Prisma.PeminjamanWhereInput = {};

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    if (filters?.status) {
      where.status_pinjam = filters.status as any;
    }

    if (filters?.search) {
      where.OR = [
        {
          user: { username: { contains: filters.search, mode: 'insensitive' } },
        },
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
        { id: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const transactions = await this.prisma.peminjaman.findMany({
      where,
      include: {
        user: {
          include: {
            detail: true,
          },
        },
        items: {
          include: {
            barang: {
              include: {
                kategori: true,
              },
            },
          },
        },
        pembayaran: {
          include: {
            verifiedBy: true,
            rekeningTujuan: true,
          },
        },
        biayaDetails: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions
      .map((tx) => {
        try {
          return this.formatTransaction(tx);
        } catch (err) {
          console.error('FORMAT ERROR:', tx.id, err);
          return null;
        }
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null);
  }

  async exportTransactionsCsv(filters?: any): Promise<string> {
    const data = await this.exportTransactions(filters);

    if (!Array.isArray(data)) {
      throw new Error('DATA_BUKAN_ARRAY');
    }

    if (data.length === 0) {
      throw new Error('DATA_KOSONG');
    }

    const header = [
      'Invoice',
      'User',
      'Email',
      'Total',
      'Paid',
      'Status',
      'Tanggal',
    ];

    const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = data.map((tx) => {
      return [
        escape(tx.invoiceNumber),
        escape(tx.user?.name),
        escape(tx.user?.email),
        tx.financials?.totalBiaya ?? 0,
        tx.financials?.paid ?? 0,
        escape(tx.status?.peminjaman),
        escape(tx.dates?.createdAt),
      ];
    });

    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return '\uFEFF' + csv; // biar Excel aman
  }

  async exportTransactionsExcel(filters?: any) {
    const data = await this.exportTransactions(filters);

    if (data.length === 0) {
      throw new Error('DATA_KOSONG');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    worksheet.columns = [
      { header: 'Invoice', key: 'invoice', width: 20 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Paid', key: 'paid', width: 15 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Tanggal', key: 'date', width: 20 },
    ];

    data.forEach((tx) => {
      worksheet.addRow({
        invoice: tx.invoiceNumber,
        user: tx.user?.name,
        email: tx.user?.email,
        total: tx.financials?.totalBiaya,
        paid: tx.financials?.paid,
        status: tx.status?.peminjaman,
        date: tx.dates?.createdAt,
      });
    });

    // styling header
    worksheet.getRow(1).font = { bold: true };

    return workbook;
  }
}
