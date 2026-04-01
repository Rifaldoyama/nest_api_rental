import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateBarangDto } from './dto/tambah.dto';
import { UpdateBarangDto } from './dto/edit.dto';
import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class BarangService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}
  async create(dto: CreateBarangDto, file?: Express.Multer.File) {
    const kategori = await this.prisma.kategori.findUnique({
      where: { id: dto.kategoriId },
    });

    if (!kategori) {
      throw new BadRequestException('Kategori tidak valid');
    }

    const stok_total = Number(dto.stok_total);

    if (!Number.isInteger(stok_total) || stok_total < 0) {
      throw new BadRequestException('Stok total harus angka >= 0');
    }

    let gambar: string | undefined;
    if (file) {
      gambar = await this.minio.upload(file, 'barang');
    }

    return this.prisma.barang.create({
      data: {
        nama: dto.nama,
        deskripsi: dto.deskripsi,
        harga_sewa: dto.harga_sewa,
        kategoriId: dto.kategoriId,
        gambar,

        stok_total: stok_total,
        stok_tersedia: stok_total,
        stok_dipesan: 0,
        stok_keluar: 0,
      },
    });
  }

  async update(id: string, dto: UpdateBarangDto, file?: Express.Multer.File) {
    const barang = await this.findOne(id);

    let gambar: string | undefined;
    if (file) {
      gambar = await this.minio.upload(file, 'barang');
    }

    const stok_total =
      dto.stok_total !== undefined ? Number(dto.stok_total) : barang.stok_total;

    if (dto.stok_total !== undefined) {
      if (!Number.isInteger(stok_total) || stok_total < 0) {
        throw new BadRequestException('stok_total tidak valid');
      }
    }

    // 🧠 hitung stok yang sedang dipinjam
    const dipinjam = barang.stok_total - barang.stok_tersedia;

    // 🚨 VALIDASI PENTING
    if (stok_total < dipinjam) {
      throw new BadRequestException(
        `Stok tidak boleh kurang dari jumlah yang sedang dipinjam (${dipinjam})`,
      );
    }

    // recalculation aman
    const stok_tersedia = stok_total - dipinjam;

    return this.prisma.barang.update({
      where: { id },
      data: {
        nama: dto.nama,
        deskripsi: dto.deskripsi,
        harga_sewa: dto.harga_sewa,
        kategoriId: dto.kategoriId,
        ...(gambar && { gambar }),

        ...(dto.stok_total !== undefined && {
          stok_total,
          stok_tersedia,
        }),
      },
    });
  }

  async findAll() {
    return this.prisma.barang.findMany({
      include: { kategori: true },
    });
  }

  async findOne(id: string) {
    const barang = await this.prisma.barang.findUnique({
      where: { id },
      include: { kategori: true },
    });

    if (!barang) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return barang;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.barang.delete({ where: { id } });
  }
}
