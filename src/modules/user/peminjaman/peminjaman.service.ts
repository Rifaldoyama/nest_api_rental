import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerificationStatus, JaminanTipe } from '@prisma/client';
import { CreatePeminjamanDto } from './dto/create-peminjaman.dto';
import { MinioService } from 'src/common/minio/minio.service';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import {
  StatusPeminjaman,
  StatusPembayaran,
  TipePembayaran,
  MetodePengambilan,
} from '@prisma/client';
import { differenceInDays } from 'date-fns';
import { PRICING } from 'src/common/constants/pricing.constants';
import { CreateTestimoniDto } from './dto/create-testimoni.dto';

@Injectable()
export class PeminjamanService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) { }

  // ==========================================
  // HELPER: HITUNG TOTAL HARI
  // ==========================================
  private calculateTotalHari(start: Date, end: Date): number {
    const diffTime = end.getTime() - start.getTime();

    if (diffTime < 0)
      throw new BadRequestException(
        'Tanggal selesai tidak boleh sebelum tanggal mulai',
      );

    return differenceInDays(end, start) + 1;
  }

  private calculateTotalBiaya(
    subtotalPerHari: number,
    totalHari: number,
  ): number {
    /**
     * Progressive pricing:
     * - Day 1: 100% of price
     * - Day 2: 70% of price
     * - Day 3+: 50% of price per day
     */
    let total = 0;

    if (totalHari >= 1)
      total += subtotalPerHari * PRICING.PROGRESSIVE.DAY_1_MULTIPLIER;
    if (totalHari >= 2)
      total += subtotalPerHari * PRICING.PROGRESSIVE.DAY_2_MULTIPLIER;
    if (totalHari > 2)
      total +=
        subtotalPerHari *
        PRICING.PROGRESSIVE.DAY_3_PLUS_MULTIPLIER *
        (totalHari - 2);

    return Math.round(total);
  }

  /**
   * Menghitung deposit dari nilai asli barang
   * Tidak perlu field tambahan, semua data sudah ada
   */
  private calculateDeposit(
    finalItems: { harga_satuan: number; jumlah: number }[],
    totalHari: number,
  ): number {
    // 1. Hitung nilai asli per hari dari semua barang
    const nilaiAsliPerHari = finalItems.reduce(
      (total, item) => total + item.harga_satuan * item.jumlah,
      0,
    );

    // 2. Total nilai asli untuk seluruh durasi
    const totalNilaiAsli = nilaiAsliPerHari * totalHari;

    // 3. Deposit 40% dari total nilai asli
    const DEPOSIT_PERCENT = PRICING.DEPOSIT_PERCENT;
    let deposit = Math.round(totalNilaiAsli * DEPOSIT_PERCENT);

    // // 4. Batasan deposit (opsional, untuk customer experience)
    // const MAX_DEPOSIT = 5_000_000;
    // const MIN_DEPOSIT = 250_000;

    // if (deposit > MAX_DEPOSIT) deposit = MAX_DEPOSIT;
    // if (deposit < MIN_DEPOSIT && totalNilaiAsli > 0) deposit = MIN_DEPOSIT;

    return deposit;
  }

  // ==========================================
  // MAIN METHOD: CREATE PEMINJAMAN
  // ==========================================
  async create(userId: string, dto: CreatePeminjamanDto) {
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

      const finalItems: {
        barang: any;
        barangId: string;
        jumlah: number;
        harga_satuan: number;
      }[] = [];

      // =========================
      // BUILD ITEMS
      // =========================
      if (dto.paketId) {
        const paket = await tx.paket.findUnique({
          where: { id: dto.paketId },
          include: { items: { include: { barang: true } } },
        });

        if (!paket) throw new BadRequestException('Paket tidak ditemukan');

        subtotalBarang = paket.harga_final;

        for (const pItem of paket.items) {
          const barang = pItem.barang;

          const available = barang.stok_tersedia - barang.stok_dipesan;

          if (available < pItem.jumlah) {
            throw new BadRequestException(`Stok ${barang.nama} tidak cukup`);
          }

          finalItems.push({
            barang,
            barangId: barang.id,
            jumlah: pItem.jumlah,
            harga_satuan: barang.harga_sewa,
          });
        }
      } else {
        for (const item of dto.items!) {
          const barang = await tx.barang.findUnique({
            where: { id: item.barangId },
          });

          if (!barang || !barang.isActive) {
            throw new BadRequestException('Barang tidak valid');
          }

          const available = barang.stok_tersedia - barang.stok_dipesan;

          if (available < item.jumlah) {
            throw new BadRequestException(`Stok ${barang.nama} tidak cukup`);
          }

          subtotalBarang += barang.harga_sewa * item.jumlah;

          finalItems.push({
            barang,
            barangId: barang.id,
            jumlah: item.jumlah,
            harga_satuan: barang.harga_sewa,
          });
        }
      }

      // =========================
      // DATE
      // =========================
      const startDate = new Date(dto.tanggal_mulai);
      const endDate = new Date(dto.tanggal_selesai);
      const totalHari =
        Math.floor(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;

      const totalSewa = this.calculateTotalBiaya(subtotalBarang, totalHari);

      // ✅ ONGKIR: 0 dulu karena belum assign zona
      const ongkir = 0;

      const depositAmount =
        dto.jaminan_tipe === JaminanTipe.DEPOSIT_UANG
          ? this.calculateDeposit(finalItems, totalHari)
          : 0;

      // ✅ Perhitungan yang benar
      const totalBiaya = totalSewa + ongkir + depositAmount;
      const totalTagihan = totalSewa + ongkir; // Tanpa deposit!
      const nominalDp = Math.round(totalTagihan * 0.35);
      const sisaTagihan = totalTagihan - nominalDp;

      const nilaiAsliPerHari = finalItems.reduce(
        (total, item) => total + item.harga_satuan * item.jumlah,
        0,
      );
      const totalNilaiAsli = nilaiAsliPerHari * totalHari;

      // ✅ Status awal: MENUNGGU_PERSETUJUAN untuk DIANTAR
      const initialStatus =
        dto.metode_ambil === MetodePengambilan.DIANTAR
          ? StatusPeminjaman.MENUNGGU_PERSETUJUAN
          : StatusPeminjaman.SIAP_DIPROSES;

      const created = await tx.peminjaman.create({
        data: {
          userId,
          tanggal_mulai: startDate,
          tanggal_selesai: endDate,
          metode_ambil: dto.metode_ambil,
          alamat_acara: dto.alamat_acara,

          total_sewa: totalSewa,
          total_biaya: totalBiaya,
          total_tagihan: totalTagihan,
          total_nilai_asli: totalNilaiAsli,

          nominal_dp: nominalDp,
          sisa_tagihan: sisaTagihan,

          deposit: depositAmount,

          // ✅ TAMBAHKAN 3 BARIS INI:
          jaminan_tipe: dto.jaminan_tipe,
          jaminan_detail: dto.jaminan_detail || null,
          jaminan_status: 'DITAHAN',

          status_pinjam: initialStatus,
          status_bayar: StatusPembayaran.BELUM_BAYAR,

          total_hari: totalHari,
          expired_at: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      // =========================
      // INSERT ITEMS + SNAPSHOT
      // =========================
      for (const item of finalItems) {
        const barang = await tx.barang.findUnique({
          where: { id: item.barangId },
          include: { kategori: true },
        });

        await tx.peminjamanBarang.create({
          data: {
            peminjamanId: created.id,
            barangId: item.barangId,
            jumlah: item.jumlah,
            harga_satuan: item.harga_satuan,

            nama_barang_snapshot: barang!.nama,
            kategori_snapshot: barang!.kategori.nama,
            harga_saat_itu: barang!.harga_sewa,
            satuan_snapshot: barang!.satuan,

            denda_ringan_snapshot: barang!.denda_ringan,
            denda_sedang_snapshot: barang!.denda_sedang,
            denda_berat_snapshot: barang!.denda_berat,
            denda_hilang_snapshot: barang!.denda_hilang,
            denda_telat_snapshot: barang!.denda_telat_per_hari,
          },
        });
      }

      // =========================
      // RESERVE STOCK
      // =========================
      for (const item of finalItems) {
        const barang = await tx.barang.findUnique({
          where: { id: item.barangId },
        });

        if (!barang) throw new BadRequestException('Barang tidak ditemukan');

        const available = barang.stok_tersedia - barang.stok_dipesan;

        if (available < item.jumlah) {
          throw new BadRequestException('Stok tidak cukup');
        }

        await tx.barang.update({
          where: { id: item.barangId },
          data: {
            stok_dipesan: { increment: item.jumlah },
          },
        });

        await tx.inventoryLog.create({
          data: {
            barangId: item.barangId,
            peminjamanId: created.id,
            tipe: 'RESERVE',
            jumlah: item.jumlah,
            before_stock: barang.stok_tersedia,
            after_stock: barang.stok_tersedia,
          },
        });
      }

      return created;
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
        biayaDetails: true,
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
        biayaDetails: true,
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

  async generateReceiptPdf(
    userId: string,
    id: string,
    type: TipePembayaran,
    res: Response,
  ) {
    const data = await this.prisma.peminjaman.findFirst({
      where: { id, userId },
      include: {
        user: true,
        items: { include: { barang: true } },
        pembayaran: true,
        biayaDetails: true,
      },
    });

    if (!data) throw new NotFoundException('Data tidak ditemukan');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=receipt-${id}.pdf`,
    );

    doc.pipe(res);

    const formatRupiah = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

    const drawLine = () => {
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    };

    const drawRow = (label: string, value: string) => {
      doc.fontSize(10).font('Helvetica');
      doc.text(label, { continued: true });
      doc.text(value, { align: 'right' });
    };

    // ================= HEADER =================
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text('STRUK PEMINJAMAN', { align: 'center' });

    doc.moveDown(0.5);
    drawLine();

    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica');
    drawRow('Nama', data.user.username);
    drawRow('Status', data.status_bayar);
    drawRow('Tanggal', new Date(data.createdAt).toLocaleDateString('id-ID'));

    doc.moveDown(0.5);
    drawLine();

    // ================= BARANG =================
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Barang');

    doc.moveDown(0.5);

    data.items.forEach((item) => {
      const totalItem = item.harga_satuan * item.jumlah;

      doc.font('Helvetica');
      doc.text(item.barang.nama);
      drawRow(
        `${item.jumlah} x ${formatRupiah(item.harga_satuan)}`,
        formatRupiah(totalItem),
      );
      doc.moveDown(0.3);
    });

    drawLine();

    // ================= BIAYA =================
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Rincian Biaya');
    doc.moveDown(0.5);

    drawRow('Total Sewa', formatRupiah(data.total_sewa));

    data.biayaDetails?.forEach((b) => {
      drawRow(b.label, formatRupiah(b.jumlah));
    });

    if (data.deposit > 0) {
      drawRow('Deposit (akan dikembalikan)', formatRupiah(data.deposit));
    }

    drawRow('Total Tagihan', formatRupiah(data.total_tagihan));

    doc.moveDown(0.5);
    drawLine();

    // ================= PEMBAYARAN =================
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Pembayaran');
    doc.moveDown(0.5);

    // 🔥 PERBAIKAN: Langsung pakai data dari tabel peminjaman
    const totalTagihan = data.total_tagihan;
    const totalDibayar = data.total_terbayar;
    let sisaTagihan = totalTagihan - totalDibayar;

    // 🔥 NORMALISASI: Jika status LUNAS, sisa harus 0
    if (data.status_bayar === 'LUNAS') {
      sisaTagihan = 0;
    }

    // 🔥 Ambil data pembayaran dari database (untuk ditampilkan di struk)
    const dp = data.pembayaran.find(
      (p) => p.tipe === 'DP' && p.status === 'VERIFIED',
    );
    const pelunasan = data.pembayaran.find(
      (p) => p.tipe === 'PELUNASAN' && p.status === 'VERIFIED',
    );
    const full = data.pembayaran.find(
      (p) => p.tipe === 'FULL' && p.status === 'VERIFIED',
    );

    // ================= LOGIC PER TYPE =================
    switch (type) {
      case TipePembayaran.DP:
        if (!dp) throw new BadRequestException('DP belum dibayar');

        drawRow('DP Dibayar', formatRupiah(dp.jumlah));
        drawRow('Sisa Tagihan', formatRupiah(sisaTagihan));
        break;

      case TipePembayaran.PELUNASAN:
        if (!pelunasan)
          throw new BadRequestException('Pelunasan belum dibayar');

        if (dp) drawRow('DP', formatRupiah(dp.jumlah));
        drawRow('Pelunasan', formatRupiah(pelunasan.jumlah));
        drawRow('TOTAL DIBAYAR', formatRupiah(totalDibayar));
        drawRow('Sisa Tagihan', formatRupiah(0));
        break;

      case TipePembayaran.FULL:
        if (full) {
          // Bayar FULL langsung
          drawRow('Pembayaran Full', formatRupiah(full.jumlah));
          drawRow('Sisa Tagihan', formatRupiah(0));
        } else {
          // Sudah bayar DP + Pelunasan (atau langsung dari total_terbayar)
          drawRow('Total Pembayaran', formatRupiah(totalDibayar));
          drawRow('Sisa Tagihan', formatRupiah(0));
        }
        break;
    }

    doc.moveDown(0.5);
    drawLine();

    // ================= TOTAL =================
    doc.moveDown(0.5);
    drawLine();

    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(11);
    drawRow('TOTAL TAGIHAN', formatRupiah(totalTagihan));
    drawRow('TOTAL DIBAYAR', formatRupiah(totalDibayar));
    drawRow('SISA', formatRupiah(sisaTagihan >= 0 ? sisaTagihan : 0));

    if (data.deposit > 0) {
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      doc.text(
        `* Deposit Rp ${data.deposit.toLocaleString('id-ID')} akan dikembalikan setelah barang kembali dalam kondisi baik`,
        { align: 'center' },
      );
    }

    doc.moveDown(1);

    // ================= FOOTER =================
    doc.fontSize(9).font('Helvetica');
    doc.text('Terima kasih telah menggunakan layanan kami', {
      align: 'center',
    });

    doc.end();
  }

  async canGiveTestimoni(userId: string, peminjamanId: string) {
    const peminjaman = await this.prisma.peminjaman.findFirst({
      where: {
        id: peminjamanId,
        userId: userId,
        status_pinjam: 'SELESAI',
        status_bayar: 'LUNAS',
      },
      include: {
        testimoni: true,
      },
    });

    if (!peminjaman) {
      return {
        canGive: false,
        reason: 'Peminjaman belum selesai atau belum lunas',
      };
    }

    if (peminjaman.testimoni) {
      return { canGive: false, reason: 'Anda sudah memberi testimoni' };
    }

    return { canGive: true };
  }

  async createTestimoni(
    userId: string,
    peminjamanId: string,
    dto: CreateTestimoniDto,
  ) {
    // Cek apakah bisa memberi testimoni
    const can = await this.canGiveTestimoni(userId, peminjamanId);
    if (!can.canGive) {
      throw new BadRequestException(can.reason);
    }

    return this.prisma.testimoni.create({
      data: {
        userId,
        peminjamanId,
        rating: dto.rating,
        komentar: dto.komentar,
      },
    });
  }
}
