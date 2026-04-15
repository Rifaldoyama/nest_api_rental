import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from 'prisma/prisma.service';

import {
  StatusVerifikasiPembayaran,
  StatusPembayaran,
  TipePembayaran,
  StatusPeminjaman,
  TipePembayaranAllocation,
  JaminanTipe,
} from '@prisma/client';

import { CreatePembayaranDto } from './dto/create-pembayaran.dto';

import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class UserPembayaranService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  async getRekeningActive() {
    return this.prisma.rekeningTujuan.findMany({
      where: { aktif: true },
      select: {
        id: true,
        nama: true,
        nomor: true,
        atas_nama: true,
        metode: true,
      },
    });
  }

  // ===============================
  // CREATE DP
  // ===============================
  async createDP(
    userId: string,
    peminjamanId: string,
    rekeningTujuanId?: string,
  ) {
    const peminjaman = await this.prisma.peminjaman.findFirst({
      where: { id: peminjamanId, userId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam === StatusPeminjaman.DITOLAK) {
      throw new BadRequestException('Peminjaman ditolak');
    }

    if (peminjaman.status_pinjam === StatusPeminjaman.SELESAI) {
      throw new BadRequestException('Peminjaman sudah selesai');
    }

    if (
      peminjaman.expired_at &&
      new Date() > peminjaman.expired_at &&
      peminjaman.status_bayar === StatusPembayaran.BELUM_BAYAR
    ) {
      throw new BadRequestException('Transaksi sudah expired');
    }

    if (
      peminjaman.status_pinjam !== StatusPeminjaman.SIAP_DIPROSES ||
      peminjaman.status_bayar !== StatusPembayaran.BELUM_BAYAR
    ) {
      throw new BadRequestException('Peminjaman belum bisa dibayar');
    }

    const activePayment = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        status: StatusVerifikasiPembayaran.PENDING,
      },
    });

    if (activePayment)
      throw new BadRequestException('Masih ada pembayaran pending');

    // Cari pembayaran DP terakhir
    const existingDP = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        tipe: TipePembayaran.DP,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // =============================
    // CASE 1: SUDAH VERIFIED
    // =============================

    if (existingDP?.status === StatusVerifikasiPembayaran.VERIFIED)
      throw new BadRequestException('DP sudah diverifikasi');

    // =============================
    // CASE 2: MASIH PENDING
    // =============================

    if (existingDP?.status === StatusVerifikasiPembayaran.PENDING)
      return existingDP;

    // =============================
    // CASE 3: REJECTED → EDIT
    // =============================

    if (existingDP?.status === StatusVerifikasiPembayaran.REJECTED) {
      return this.prisma.$transaction(async (tx) => {
        const pembayaran = await tx.pembayaran.update({
          where: { id: existingDP.id },
          data: {
            status: StatusVerifikasiPembayaran.PENDING,
            bukti_pembayaran: null,
            verifiedAt: null,
            verifiedById: null,
            catatan: null,
          },
        });

        await tx.peminjaman.update({
          where: { id: peminjamanId },
          data: {
            status_bayar: StatusPembayaran.BELUM_BAYAR,
          },
        });

        return pembayaran;
      });
    }

    // =============================
    // CASE 4: BELUM ADA → CREATE BARU
    // =============================

    if (!rekeningTujuanId)
      throw new BadRequestException('Rekening wajib dipilih');

    const rekening = await this.prisma.rekeningTujuan.findFirst({
      where: {
        id: rekeningTujuanId,
        aktif: true,
      },
    });

    if (!rekening) throw new BadRequestException('Rekening tidak valid');

    if (
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG &&
      peminjaman.deposit === 0
    ) {
      throw new BadRequestException('Deposit wajib diisi untuk jaminan uang');
    }

    const dpAmount = peminjaman.nominal_dp;
    const depositAmount =
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG
        ? peminjaman.deposit
        : 0;
    const totalBayar = dpAmount + depositAmount;

    return this.prisma.$transaction(async (tx) => {
      const pembayaranDP = await tx.pembayaran.create({
        data: {
          peminjamanId,
          jumlah: totalBayar,
          metode: rekening.metode,
          tipe: TipePembayaran.DP,
          rekeningTujuanId,
          status: StatusVerifikasiPembayaran.PENDING,
          allocations: {
            create: [
              {
                tipe: TipePembayaranAllocation.DP,
                jumlah: dpAmount,
              },
              ...(depositAmount > 0
                ? [
                    {
                      tipe: TipePembayaranAllocation.DEPOSIT,
                      jumlah: depositAmount,
                    },
                  ]
                : []),
            ],
          },
        },
        include: { allocations: true },
      });

      // 3. Update status peminjaman
      await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          status_bayar: StatusPembayaran.MENUNGGU_VERIFIKASI_DP,
          expired_at: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      return pembayaranDP;
    });
  }
  // ===============================
  // CREATE PELUNASAN
  // ===============================
  async createPelunasan(
    userId: string,
    peminjamanId: string,
    rekeningTujuanId: string,
  ) {
    const peminjaman = await this.prisma.peminjaman.findFirst({
      where: { id: peminjamanId, userId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam === StatusPeminjaman.DITOLAK) {
      throw new BadRequestException('Peminjaman ditolak');
    }

    if (peminjaman.status_pinjam === StatusPeminjaman.SELESAI) {
      throw new BadRequestException('Peminjaman sudah selesai');
    }

    if (
      peminjaman.expired_at &&
      new Date() > peminjaman.expired_at &&
      peminjaman.status_bayar === StatusPembayaran.BELUM_BAYAR
    ) {
      throw new BadRequestException('Transaksi sudah expired');
    }

    if (peminjaman.status_bayar === StatusPembayaran.LUNAS)
      throw new BadRequestException('Sudah lunas');

    if (peminjaman.sisa_tagihan <= 0)
      throw new BadRequestException('Tidak ada sisa tagihan');

    const rekening = await this.prisma.rekeningTujuan.findFirst({
      where: { id: rekeningTujuanId, aktif: true },
    });

    if (!rekening) throw new BadRequestException('Rekening tidak valid');

    const allowedStatuses: StatusPembayaran[] = [
      StatusPembayaran.MENUNGGU_VERIFIKASI_DP,
      StatusPembayaran.DP_DITERIMA,
    ];

    if (!allowedStatuses.includes(peminjaman.status_bayar)) {
      throw new BadRequestException('DP belum dibayar');
    }

    // if (peminjaman.status_bayar !== StatusPembayaran.DP_DITERIMA) {
    //   throw new BadRequestException('DP belum diverifikasi');
    // }

    const activePayment = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        status: StatusVerifikasiPembayaran.PENDING,
      },
    });

    if (activePayment)
      throw new BadRequestException('Masih ada pembayaran pending');

    const existingPelunasan = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        tipe: TipePembayaran.PELUNASAN,
        status: {
          in: [
            StatusVerifikasiPembayaran.PENDING,
            StatusVerifikasiPembayaran.VERIFIED,
          ],
        },
      },
    });

    if (existingPelunasan)
      throw new BadRequestException('Pelunasan sudah dibuat');

    if (
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG &&
      peminjaman.deposit === 0
    ) {
      throw new BadRequestException('Deposit wajib diisi untuk jaminan uang');
    }

    return this.prisma.$transaction(async (tx) => {
      const pembayaran = await tx.pembayaran.create({
        data: {
          peminjamanId,
          jumlah: peminjaman.sisa_tagihan,
          metode: rekening.metode,
          tipe: TipePembayaran.PELUNASAN,
          rekeningTujuanId,
          status: StatusVerifikasiPembayaran.PENDING,
          allocations: {
            create: {
              tipe: TipePembayaranAllocation.PELUNASAN,
              jumlah: peminjaman.sisa_tagihan,
            },
          },
        },
        include: { allocations: true },
      });

      await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          status_bayar: StatusPembayaran.MENUNGGU_VERIFIKASI_PELUNASAN,
        },
      });

      return pembayaran;
    });
  }

  async createFullPayment(
    userId: string,
    peminjamanId: string,
    rekeningTujuanId: string,
  ) {
    const peminjaman = await this.prisma.peminjaman.findFirst({
      where: { id: peminjamanId, userId },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam === StatusPeminjaman.DITOLAK) {
      throw new BadRequestException('Peminjaman ditolak');
    }

    if (peminjaman.status_pinjam === StatusPeminjaman.SELESAI) {
      throw new BadRequestException('Peminjaman sudah selesai');
    }

    if (peminjaman.status_bayar === StatusPembayaran.LUNAS)
      throw new BadRequestException('Sudah lunas');

    if (
      peminjaman.expired_at &&
      new Date() > peminjaman.expired_at &&
      peminjaman.status_bayar === StatusPembayaran.BELUM_BAYAR
    ) {
      throw new BadRequestException('Transaksi sudah expired');
    }

    if (peminjaman.status_pinjam !== StatusPeminjaman.SIAP_DIPROSES) {
      throw new BadRequestException('Tidak bisa full payment di status ini');
    }

    if (peminjaman.status_bayar !== StatusPembayaran.BELUM_BAYAR)
      throw new BadRequestException('Sudah ada pembayaran');

    const activePayment = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        status: StatusVerifikasiPembayaran.PENDING,
      },
    });

    if (activePayment)
      throw new BadRequestException('Masih ada pembayaran pending');

    const rekening = await this.prisma.rekeningTujuan.findFirst({
      where: {
        id: rekeningTujuanId,
        aktif: true,
      },
    });

    if (!rekening) throw new BadRequestException('Rekening tidak valid');

    const existingFull = await this.prisma.pembayaran.findFirst({
      where: {
        peminjamanId,
        tipe: TipePembayaran.FULL,
        status: {
          in: [
            StatusVerifikasiPembayaran.PENDING,
            StatusVerifikasiPembayaran.VERIFIED,
          ],
        },
      },
    });

    if (existingFull)
      throw new BadRequestException('Full payment sudah dibuat');

    if (
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG &&
      peminjaman.deposit === 0
    ) {
      throw new BadRequestException('Deposit wajib diisi untuk jaminan uang');
    }

    const totalSewa = peminjaman.total_sewa;
    const depositAmount =
      peminjaman.jaminan_tipe === JaminanTipe.DEPOSIT_UANG
        ? peminjaman.deposit
        : 0;
    const totalBayar = peminjaman.total_tagihan;

    return this.prisma.$transaction(async (tx) => {
      const pembayaran = await tx.pembayaran.create({
        data: {
          peminjamanId,
          jumlah: totalBayar,
          metode: rekening.metode,
          tipe: TipePembayaran.FULL,
          status: StatusVerifikasiPembayaran.PENDING,
          rekeningTujuanId,
          allocations: {
            create: [
              {
                tipe: TipePembayaranAllocation.SEWA,
                jumlah: totalSewa,
              },
              ...(depositAmount > 0
                ? [
                    {
                      tipe: TipePembayaranAllocation.DEPOSIT,
                      jumlah: depositAmount,
                    },
                  ]
                : []),
            ],
          },
        },
        include: { allocations: true },
      });

      await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          status_bayar: StatusPembayaran.MENUNGGU_VERIFIKASI_FULL,
        },
      });

      return pembayaran;
    });
  }

  // ===============================
  // UPLOAD BUKTI (dipakai DP dan Pelunasan)
  // ===============================
  async uploadBukti(
    userId: string,
    pembayaranId: string,
    file: Express.Multer.File,
  ) {
    const pembayaran = await this.prisma.pembayaran.findUnique({
      where: { id: pembayaranId },
      include: { peminjaman: true },
    });

    if (!pembayaran) throw new NotFoundException('Pembayaran tidak ditemukan');

    if (pembayaran.peminjaman.userId !== userId)
      throw new ForbiddenException('Tidak diizinkan');

    if (pembayaran.status !== StatusVerifikasiPembayaran.PENDING)
      throw new BadRequestException(
        'Pembayaran sudah diverifikasi atau ditolak',
      );

    if (pembayaran.bukti_pembayaran)
      throw new BadRequestException('Bukti sudah diupload');

    const path = `pembayaran/${pembayaran.peminjamanId}/${pembayaran.id}`;
    if (!file) throw new BadRequestException('File bukti wajib diupload');
    const objectName = await this.minio.upload(file, path);

    return this.prisma.pembayaran.update({
      where: { id: pembayaranId },
      data: {
        bukti_pembayaran: objectName,
        status: StatusVerifikasiPembayaran.PENDING,
      },
    });
  }
}
