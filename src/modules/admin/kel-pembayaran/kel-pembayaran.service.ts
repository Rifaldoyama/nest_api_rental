import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
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
  ) {}

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

  // === PERBAIKAN DI SINI ===
  async findAll() {
    return this.prisma.rekeningTujuan.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  // 1. Ambil daftar pembayaran yang butuh verifikasi
  async listMenungguVerifikasi(status?: StatusVerifikasiPembayaran) {
    const list = await this.prisma.pembayaran.findMany({
      where: status ? { status } : {}, // jika tidak ada filter, ambil semua
      include: {
        peminjaman: { include: { user: true } },
        rekeningTujuan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      list.map(async (p) => ({
        ...p,
        bukti_url: p.bukti_pembayaran
          ? await this.minio.getFileUrl(p.bukti_pembayaran)
          : null,
      })),
    );
  }

  // 2. Logika Verifikasi (Pindahan dari petugas dengan sedikit perbaikan)
  async verifikasi(pembayaranId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const pembayaran = await tx.pembayaran.findUnique({
        where: { id: pembayaranId },
        include: { peminjaman: true },
      });

      if (
        !pembayaran ||
        pembayaran.status !== StatusVerifikasiPembayaran.PENDING
      ) {
        throw new BadRequestException(
          'Pembayaran tidak valid atau sudah diproses',
        );
      }

      const peminjaman = pembayaran.peminjaman;

      // VALIDASI FLOW STATUS

      const allowedFullStatuses: StatusPembayaran[] = [
        StatusPembayaran.BELUM_BAYAR,
        StatusPembayaran.DP_DITERIMA,
      ];

      if (
        pembayaran.tipe === TipePembayaran.FULL &&
        !allowedFullStatuses.includes(peminjaman.status_bayar)
      ) {
        throw new BadRequestException('Full tidak valid untuk status saat ini');
      }

      if (
        peminjaman.status_pinjam === StatusPeminjaman.DITOLAK ||
        peminjaman.status_pinjam === StatusPeminjaman.SELESAI
      ) {
        throw new BadRequestException(
          'Peminjaman tidak valid untuk pembayaran',
        );
      }

      if (
        pembayaran.tipe === TipePembayaran.DP &&
        peminjaman.status_bayar !== StatusPembayaran.MENUNGGU_VERIFIKASI_DP
      ) {
        throw new BadRequestException('DP tidak valid untuk status saat ini');
      }

      // VALIDASI DULU
      if (pembayaran.tipe === TipePembayaran.DP) {
        if (pembayaran.jumlah !== peminjaman.nominal_dp + peminjaman.deposit)
          throw new BadRequestException('Nominal DP tidak sesuai');
      }

      if (pembayaran.tipe === TipePembayaran.PELUNASAN) {
        if (pembayaran.jumlah !== peminjaman.sisa_tagihan)
          throw new BadRequestException('Nominal pelunasan tidak sesuai');
      }

      if (pembayaran.tipe === TipePembayaran.FULL) {
        const totalFull = peminjaman.total_biaya + peminjaman.deposit;
        if (pembayaran.jumlah !== totalFull)
          throw new BadRequestException('Nominal full tidak sesuai');
      }

      // BARU UPDATE PEMBAYARAN
      const result = await tx.pembayaran.updateMany({
        where: {
          id: pembayaranId,
          status: StatusVerifikasiPembayaran.PENDING,
        },
        data: {
          status: StatusVerifikasiPembayaran.VERIFIED,
          verifiedById: adminId,
          verifiedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          'Pembayaran sudah diverifikasi oleh admin lain',
        );
      }

      let newSisa = peminjaman.sisa_tagihan;

      if (
        pembayaran.tipe === TipePembayaran.PELUNASAN ||
        pembayaran.tipe === TipePembayaran.FULL
      ) {
        newSisa = 0;
      }

      let newStatusBayar: StatusPembayaran;

      switch (pembayaran.tipe) {
        case TipePembayaran.DP:
          newStatusBayar = StatusPembayaran.DP_DITERIMA;
          break;

        case TipePembayaran.PELUNASAN:
        case TipePembayaran.FULL:
          newStatusBayar = StatusPembayaran.LUNAS;
          break;

        default:
          throw new BadRequestException('Tipe pembayaran tidak dikenali');
      }

      await tx.peminjaman.update({
        where: { id: pembayaran.peminjamanId },
        data: {
          status_bayar: newStatusBayar,
          sisa_tagihan: newSisa,
        },
      });

      return { message: 'Pembayaran berhasil diverifikasi' };
    });
  }

  // 3. Tolak Pembayaran
  async tolak(pembayaranId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const pembayaran = await tx.pembayaran.findUnique({
        where: { id: pembayaranId },
        include: { peminjaman: true },
      });

      if (!pembayaran) {
        throw new NotFoundException('Pembayaran tidak ditemukan');
      }

      if (pembayaran.status !== StatusVerifikasiPembayaran.PENDING) {
        throw new BadRequestException('Pembayaran sudah diproses');
      }

      // Update pembayaran → REJECTED
      await tx.pembayaran.update({
        where: { id: pembayaranId },
        data: {
          status: StatusVerifikasiPembayaran.REJECTED,
          verifiedById: adminId,
          verifiedAt: new Date(),
        },
      });

      let newStatus: StatusPembayaran;

      if (pembayaran.tipe === TipePembayaran.DP) {
        newStatus = StatusPembayaran.BELUM_BAYAR;
      } else if (pembayaran.tipe === TipePembayaran.PELUNASAN) {
        newStatus = StatusPembayaran.DP_DITERIMA;
      } else if (pembayaran.tipe === TipePembayaran.FULL) {
        newStatus = StatusPembayaran.BELUM_BAYAR;
      } else {
        throw new BadRequestException('Tipe pembayaran tidak dikenali');
      }

      await tx.peminjaman.update({
        where: { id: pembayaran.peminjamanId },
        data: {
          status_bayar: newStatus,
        },
      });

      return { message: 'Pembayaran ditolak' };
    });
  }
}
