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
} from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';
import { ReturnBarangDto } from './dto/return-barang.dto';
import { hitungPersentaseDenda } from 'src/common/utils/denda.util';

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
        pembayaran: true,
      },
    });
  }

  // Tahap 1: Petugas mulai mengantar atau menyiapkan barang
  startDelivery(peminjamanId: string, petugasId: string) {
    return this.shared.updateStatus(peminjamanId, petugasId, {
      status_pinjam: StatusPeminjaman.DIPROSES,
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

    if (peminjaman.status_pinjam !== StatusPeminjaman.DIPROSES)
      throw new BadRequestException('Status tidak valid');

    let fotoPath: string | null = null;

    if (file) {
      fotoPath = await this.minio.upload(file, `handover/${peminjamanId}`);
    }

    return this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        status_pinjam: StatusPeminjaman.DIPAKAI,
        kondisi_barang_keluar: dto.kondisi_barang_keluar as KondisiBarang,
        foto_serah_terima: fotoPath,
        deliveredById: petugasId,
      },
    });
  }

  async returnBarang(
    peminjamanId: string,
    petugasId: string,
    dto: ReturnBarangDto,
    file: Express.Multer.File,
  ) {
    const peminjaman = await this.prisma.peminjaman.findUnique({
      where: { id: peminjamanId },
      include: { items: true },
    });

    if (!peminjaman) throw new NotFoundException('Peminjaman tidak ditemukan');

    if (peminjaman.status_pinjam !== StatusPeminjaman.DIPAKAI)
      throw new BadRequestException('Status tidak valid untuk return');

    if (dto.items.length !== peminjaman.items.length)
      throw new BadRequestException('Semua barang wajib diisi kondisi kembali');

    let totalDenda = 0;

    for (const item of dto.items) {
      const pemItem = peminjaman.items.find(
        (i) => i.barangId === item.barangId,
      );

      if (!pemItem) throw new BadRequestException('Barang tidak valid');

      const persen = hitungPersentaseDenda(item.kondisi_kembali);
      const dendaItem = pemItem.harga_satuan * pemItem.jumlah * persen;

      totalDenda += dendaItem;

      await this.prisma.peminjamanBarang.update({
        where: {
          peminjamanId_barangId: {
            peminjamanId,
            barangId: item.barangId,
          },
        },
        data: {
          kondisi_kembali: item.kondisi_kembali,
          denda_item: dendaItem,
        },
      });
    }

    let fotoPath: string | null = null;

    if (file) {
      fotoPath = await this.minio.upload(file, `pengembalian/${peminjamanId}`);
    }

    // ============================
    // SIMPAN DENDA KE BIAYA DETAIL
    // ============================
    if (totalDenda > 0) {
      await this.prisma.peminjamanBiayaDetail.create({
        data: {
          peminjamanId,
          tipe: 'DENDA',
          label: 'Denda kerusakan barang',
          jumlah: totalDenda,
        },
      });

      // ============================
      // BUAT TAGIHAN DENDA
      // ============================
      await this.prisma.pembayaran.create({
        data: {
          peminjamanId,
          jumlah: totalDenda,
          metode: 'BANK_TRANSFER', // atau dynamic kalau ada pilihan
          tipe: 'DENDA',
          status: 'PENDING',
        },
      });
    }

    // ============================
    // UPDATE PEMINJAMAN
    // ============================
    await this.prisma.peminjaman.update({
      where: { id: peminjamanId },
      data: {
        status_pinjam: StatusPeminjaman.SELESAI,
        status_bayar:
          totalDenda > 0
            ? StatusPembayaran.MENUNGGU_VERIFIKASI_PELUNASAN
            : StatusPembayaran.LUNAS,
        receivedById: petugasId,
        foto_pengembalian: fotoPath,
        tanggal_kembali: new Date(),

        // OPTIONAL tapi penting
        total_biaya: peminjaman.total_biaya + totalDenda,
        sisa_tagihan: totalDenda,
      },
    });

    return {
      message: 'Return berhasil',
      totalDenda,
    };
  }
}
