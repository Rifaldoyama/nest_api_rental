import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PublicKategoriService {
  constructor(private prisma: PrismaService) {}

  async getAllKategori() {
    return this.prisma.kategori.findMany({
      where: { isActive: true },
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        gambar: true,
        isActive: true
      },
    });
  }

  async getKategoriById(id: string) {
    const kategori = await this.prisma.kategori.findUnique({
      where: { id },
      select: {
        id: true,
        nama: true,
        gambar: true,
        isActive: true
      },
    });

    if (!kategori || !kategori.isActive) {
      throw new NotFoundException('Kategori tidak ditemukan atau sedang dinonaktifkan');
    }

    return kategori;
  }
}
