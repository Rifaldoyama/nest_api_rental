import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateKategoriDto } from './dto/create.dto';
import { UpdateKategoriDto } from './dto/update.dto';
import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class KategoriService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  async createWithImage(dto: CreateKategoriDto, file: Express.Multer.File) {
    const objectName = await this.minio.upload(file, 'kategori');
    return this.prisma.kategori.create({
      data: {
        nama: dto.nama,
        gambar: objectName,
        isActive: true,
      },
    });
  }

  findAll(options?: { admin?: boolean }) {
    return this.prisma.kategori.findMany({
      orderBy: { createdAt: 'desc' },
      where: options?.admin ? {} : { isActive: true },
    });
  }

  async update(id: string, dto: UpdateKategoriDto, file?: Express.Multer.File) {
    const kategori = await this.prisma.kategori.findUnique({ where: { id } });
    if (!kategori) throw new NotFoundException('Kategori tidak ditemukan');

    let objectName = kategori.gambar;

    if (file) {
      if (kategori.gambar) {
        await this.minio.delete(kategori.gambar).catch(() => null);
      }
      objectName = await this.minio.upload(file, 'kategori');
    }

    // 🔥 FIX: Siapkan data update dengan benar
    const updateData: any = {};

    // Update nama jika ada
    if (dto.nama !== undefined) {
      updateData.nama = dto.nama;
    }

    // 🔥 FIX: Handle isActive dengan benar (bisa dari boolean atau string)
    if (dto.isActive !== undefined) {
      // Konversi ke boolean jika perlu
      updateData.isActive =
        typeof dto.isActive === 'boolean'
          ? dto.isActive
          : dto.isActive === 'true' || dto.isActive === true;
    }

    // Update gambar jika ada file baru
    if (file) {
      updateData.gambar = objectName;
    }

    return this.prisma.kategori.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const kategori = await this.prisma.kategori.findUnique({
      where: { id },
      include: { _count: { select: { barang: true } } },
    });

    if (!kategori) throw new NotFoundException('Kategori tidak ditemukan');

    if (kategori._count.barang > 0) {
      throw new BadRequestException('Kategori masih dipakai oleh barang');
    }

    if (kategori.gambar) {
      await this.minio.delete(kategori.gambar).catch(() => null);
    }

    return this.prisma.kategori.delete({ where: { id } });
  }
}
