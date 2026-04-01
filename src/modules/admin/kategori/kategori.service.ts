import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
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
      // Jika bukan admin, hanya tampilkan yang aktif
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
      // 2. Upload file baru
      objectName = await this.minio.upload(file, 'kategori');
    }

    return this.prisma.kategori.update({
      where: { id },
      data: {
        ...dto,
        gambar: objectName,
      },
    });
  }

  async remove(id: string) {
    const kategori = await this.prisma.kategori.findUnique({
      where: { id },
      include: { _count: { select: { barang: true } } }
    });

    if (!kategori) throw new NotFoundException('Kategori tidak ditemukan');

    // Cek relasi menggunakan count agar lebih efisien
    if (kategori._count.barang > 0) {
      throw new BadRequestException('Kategori masih dipakai oleh barang');
    }

    // Hapus gambar di Minio sebelum hapus record di DB
    if (kategori.gambar) {
      await this.minio.delete(kategori.gambar).catch(() => null);
    }

    return this.prisma.kategori.delete({ where: { id } });
  }
}