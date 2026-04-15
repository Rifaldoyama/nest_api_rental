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

  private validateFile(file: Express.Multer.File) {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Format file harus JPG, PNG, atau WEBP');
    }

    if (file.size > maxSize) {
      throw new BadRequestException('Ukuran file maksimal 2MB');
    }
  }

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

    if (
      dto.denda_telat_per_hari !== undefined &&
      dto.denda_telat_per_hari !== null
    ) {
      if (dto.denda_telat_per_hari < 0) {
        throw new BadRequestException('Denda tidak boleh negatif');
      }
      if (dto.denda_telat_per_hari > 1000000) {
        throw new BadRequestException('Denda melebihi batas maksimal');
      }
    }

    if (dto.harga_sewa < 0) {
      throw new BadRequestException('Harga sewa tidak boleh negatif');
    }

    let gambar: string | undefined;

    if (file) {
      this.validateFile(file);
      gambar = await this.minio.upload(file, 'barang');
    }

    return this.prisma.barang.create({
      data: {
        nama: dto.nama,
        deskripsi: dto.deskripsi,
        harga_sewa: dto.harga_sewa,
        kategoriId: dto.kategoriId,
        gambar,

        satuan: dto.satuan,

        // 🔥 HANDLE NULLABLE DENGAN JELAS
        denda_telat_per_hari: dto.denda_telat_per_hari ?? null,

        // stok logic
        stok_total,
        stok_tersedia: stok_total,
        stok_dipesan: 0,
        stok_keluar: 0,
      },
    });
  }

  async update(id: string, dto: UpdateBarangDto, file?: Express.Multer.File) {
    return this.prisma.$transaction(async (tx) => {
      const barang = await tx.barang.findUnique({
        where: { id },
      });

      if (!barang) {
        throw new NotFoundException('Barang tidak ditemukan');
      }

      // validasi kategori
      if (dto.kategoriId) {
        const kategori = await tx.kategori.findUnique({
          where: { id: dto.kategoriId },
        });
        if (!kategori) {
          throw new BadRequestException('Kategori tidak valid');
        }
      }

      // handle file
      let gambar: string | undefined;
      if (file) {
        this.validateFile(file);
        gambar = await this.minio.upload(file, 'barang');
      }

      // validasi stok dengan data terkini
      const dipinjam = barang.stok_dipesan + barang.stok_keluar;
      let newStokTotal = barang.stok_total;

      if (dto.stok_total !== undefined) {
        newStokTotal = Number(dto.stok_total);
        if (!Number.isInteger(newStokTotal) || newStokTotal < 0) {
          throw new BadRequestException('Stok total harus angka >= 0');
        }
        if (newStokTotal < dipinjam) {
          throw new BadRequestException(
            `Stok tidak boleh kurang dari yang sedang dipinjam (${dipinjam})`,
          );
        }
      }

      const stok_tersedia = newStokTotal - dipinjam;

      return tx.barang.update({
        where: { id },
        data: {
          nama: dto.nama,
          deskripsi: dto.deskripsi,
          harga_sewa: dto.harga_sewa,
          kategoriId: dto.kategoriId,
          satuan: dto.satuan,
          denda_telat_per_hari:
            dto.denda_telat_per_hari ?? barang.denda_telat_per_hari,
          ...(gambar && { gambar }),
          ...(dto.stok_total !== undefined && {
            stok_total: newStokTotal,
            stok_tersedia,
          }),
        },
      });
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
