import { PrismaService } from 'src/prisma/prisma.service';
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
import { PRICING } from 'src/common/constants/pricing.constants';

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
      include: {
        items: { include: { barang: true } },
        paket: true,
      },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    // Hitung total hari
    const startDate = new Date(peminjaman.tanggal_mulai);
    const endDate = new Date(peminjaman.tanggal_selesai);
    const totalHari =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    // Hitung nilai asli dan subtotal
    let nilaiAsliPerHari = 0;
    let subtotalBarang = 0;
    if (peminjaman.paketId && peminjaman.paket) {
      subtotalBarang = peminjaman.paket.harga_final; // Pakai harga diskon
      for (const item of peminjaman.items) {
        nilaiAsliPerHari += item.harga_satuan * item.jumlah; // Deposit dari nilai asli
      }
    } else {
      for (const item of peminjaman.items) {
        nilaiAsliPerHari += item.harga_satuan * item.jumlah;
        subtotalBarang += item.harga_satuan * item.jumlah;
      }
    }

    const totalNilaiAsli = nilaiAsliPerHari * totalHari;

    // Hitung total sewa dengan progressive pricing
    const calculateTotalBiaya = (
      subtotalPerHari: number,
      totalHari: number,
    ) => {
      let total = 0;
      if (totalHari >= 1)
        total += subtotalPerHari * PRICING.PROGRESSIVE.DAY_1_MULTIPLIER; // Day 1: 100%
      if (totalHari >= 2)
        total += subtotalPerHari * PRICING.PROGRESSIVE.DAY_2_MULTIPLIER; // Day 2: 70%
      if (totalHari > 2)
        total +=
          subtotalPerHari *
          PRICING.PROGRESSIVE.DAY_3_PLUS_MULTIPLIER *
          (totalHari - 2); // Day 3+: 50%
      return Math.round(total);
    };

    const totalSewa = calculateTotalBiaya(subtotalBarang, totalHari);

    // Hitung ongkir dari PeminjamanBiayaDetail
    const ongkirDetail = await tx.peminjamanBiayaDetail.findFirst({
      where: { peminjamanId, tipe: 'ONGKIR' },
    });
    const ongkir = ongkirDetail?.jumlah ?? 0;

    // Hitung deposit (40% dari total nilai asli)
    const DEPOSIT_PERCENT = PRICING.DEPOSIT_PERCENT;
    let deposit = Math.round(totalNilaiAsli * DEPOSIT_PERCENT);

    // ✅ PERBAIKAN UTAMA
    const totalBiaya = totalSewa + ongkir + deposit; // total yang harus dibayar + deposit
    const totalTagihan = totalSewa + ongkir; // total yang harus dibayar USER (tanpa deposit)
    const dp = Math.round(totalTagihan * PRICING.DP_PERCENT); // DP 35% dari totalTagihan
    const sisaTagihan = totalTagihan - dp; // Sisa setelah DP

    // ✅ Hitung ulang total_terbayar dari pembayaran yang sudah diverifikasi
    const verifiedPayments = await tx.pembayaran.findMany({
      where: {
        peminjamanId,
        status: 'VERIFIED',
      },
      include: { allocations: true },
    });

    let totalTerbayar = 0;
    for (const payment of verifiedPayments) {
      for (const alloc of payment.allocations) {
        // Hanya hitung SEWA, DP, PELUNASAN (bukan DEPOSIT)
        if (alloc.tipe !== 'DEPOSIT') {
          totalTerbayar += alloc.jumlah;
        }
      }
    }

    const sisaTagihanAktual = totalTagihan - totalTerbayar;

    await tx.peminjaman.update({
      where: { id: peminjamanId },
      data: { total_hari: totalHari },
    });

    return {
      // Untuk update Peminjaman
      total_sewa: totalSewa,
      total_biaya: totalBiaya,
      total_tagihan: totalTagihan,
      total_nilai_asli: totalNilaiAsli,
      nominal_dp: dp,
      sisa_tagihan: sisaTagihanAktual,
      deposit: deposit,
      total_hari: totalHari,

      // Untuk keperluan lain
      ongkir: ongkir,
      total_terbayar: totalTerbayar,
    };
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
              SIAP_DIPROSES: [
                StatusPeminjaman.DIPROSES,
                StatusPeminjaman.DITOLAK,
              ],
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
        updateData.expired_at = null;
      }

      // =====================================================
      // SIDE EFFECT: STOCK OUT (DIPROSES)
      // =====================================================

      if (
        oldStatus === StatusPeminjaman.SIAP_DIPROSES &&
        newStatus === StatusPeminjaman.DIPROSES
      ) {
        const totalTagihanLunas =
          peminjaman.total_terbayar >= peminjaman.total_tagihan;
        if (!totalTagihanLunas) {
          throw new BadRequestException(
            'Tagihan belum lunas, tidak boleh diproses',
          );
        }

        for (const item of peminjaman.items) {
          const barang = await tx.barang.findUnique({
            where: { id: item.barangId },
          });

          if (!barang || barang.stok_tersedia < item.jumlah) {
            throw new BadRequestException(
              `Stok tidak cukup untuk barang ${item.barangId}`,
            );
          }

          if (barang.stok_dipesan < item.jumlah) {
            throw new BadRequestException(
              `Stok dipesan tidak cukup untuk barang ${item.barangId}`,
            );
          }

          const before = barang.stok_tersedia;
          const after = before - item.jumlah;

          await tx.barang.update({
            where: { id: item.barangId },
            data: {
              stok_tersedia: { decrement: item.jumlah },
              stok_keluar: { increment: item.jumlah },
              stok_dipesan: { decrement: item.jumlah },
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
            throw new NotFoundException('Barang tidak ditemukan');
          }

          const hasOut = await tx.inventoryLog.findFirst({
            where: {
              peminjamanId: peminjaman.id,
              barangId: item.barangId,
              tipe: 'OUT',
            },
          });

          // BELUM OUT
          if (!hasOut) {
            if (barang.stok_dipesan < item.jumlah) {
              throw new BadRequestException('Stok dipesan tidak valid');
            }

            await tx.barang.update({
              where: { id: item.barangId },
              data: {
                stok_dipesan: { decrement: item.jumlah },
              },
            });

            await tx.inventoryLog.create({
              data: {
                barangId: item.barangId,
                peminjamanId: peminjaman.id,
                tipe: 'RELEASE',
                jumlah: item.jumlah,
                before_stock: barang.stok_tersedia,
                after_stock: barang.stok_tersedia,
              },
            });

            continue;
          }

          // SUDAH OUT
          if (barang.stok_keluar < item.jumlah) {
            throw new BadRequestException('Stok keluar tidak valid');
          }

          const before = barang.stok_tersedia;

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
              after_stock: before + item.jumlah,
            },
          });
        }
      }

      let auditNote = `\n[${new Date().toISOString()}] Status: ${oldStatus} → ${newStatus} oleh ${actorId}`;
      if (data.status_bayar) {
        auditNote += ` | Pembayaran: ${peminjaman.status_bayar} → ${data.status_bayar}`;
      }
      // 4. Eksekusi Update
      return tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          ...updateData,
          keterangan: `${peminjaman.keterangan || ''}${auditNote}`,
        },
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

  async getAuditTrail(peminjamanId: string) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
      include: {
        user: { include: { detail: true } },
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
        inventoryLogs: {
          include: { barang: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    // Parse keterangan menjadi kronologi
    const kronologi =
      peminjaman.keterangan
        ?.split('\n')
        .filter((line) => line.startsWith('['))
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
      customer: peminjaman.user.detail?.nama_lengkap,

      // Timeline status
      status_peminjaman: {
        saat_ini: peminjaman.status_pinjam,
        history: kronologi.filter((k) => k.event.includes('status')),
      },

      // Timeline petugas
      petugas: {
        pengantar: peminjaman.deliveredBy,
        penerima: peminjaman.receivedBy,
        approver: peminjaman.approvedBy,
      },

      // Detail barang & kondisi
      barang: peminjaman.items.map((item) => ({
        nama: item.barang.nama,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        kondisi_kembali: item.kondisi_kembali,
      })),

      // Detail denda (dari biayaDetails)
      denda: peminjaman.biayaDetails
        .filter((b) => b.tipe === 'DENDA')
        .map((d) => ({
          label: d.label,
          jumlah: d.jumlah,
          jenis: d.jenis_denda,
          quantity: d.qty,
          barang_id: d.barangId,
        })),

      total_denda: peminjaman.total_denda,

      // Detail deposit
      deposit: {
        awal: peminjaman.deposit,
        kembali: peminjaman.deposit_kembali,
        sudah_dikembalikan: peminjaman.deposit_dikembalikan,
      },

      // Pembayaran
      pembayaran: peminjaman.pembayaran.map((p) => ({
        jumlah: p.jumlah,
        tipe: p.tipe,
        status: p.status,
        metode: p.metode,
        verified_by: p.verifiedBy?.username,
        verified_at: p.verifiedAt,
      })),

      // Pergerakan stok
      stok_movement: peminjaman.inventoryLogs.map((log) => ({
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
        biayaDetails: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
