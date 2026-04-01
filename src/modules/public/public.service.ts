import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class PublicCatalogService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  private hitungStokPaket(paket) {
    if (!paket.items.length) return 0;

    const stokList = paket.items.map((item) => {
      const stokBarang = item.barang.stok ?? 0;
      return Math.floor(stokBarang / item.jumlah);
    });

    return Math.min(...stokList);
  }

  // =====================
  // BARANG
  // =====================
  // public.service.ts
  async getAllBarang(kategoriId?: string) {
    return this.prisma.barang.findMany({
      where: {
        AND: [
          kategoriId ? { kategoriId } : {},
          {
            kategori: {
              isActive: true,
            },
          },
        ],
      },
      select: {
        id: true,
        nama: true,
        deskripsi: true,
        stok_tersedia: true,
        harga_sewa: true,
        gambar: true,
        kategori: {
          select: { nama: true, isActive: true },
        },
      },
    });
  }

  async getBarangById(id: string) {
    const barang = await this.prisma.barang.findUnique({
      where: { id },
      select: {
        id: true,
        nama: true,
        deskripsi: true,
        stok_tersedia: true,
        harga_sewa: true,
        gambar: true,
        kategori: {
          select: {
            nama: true,
          },
        },
      },
    });

    if (!barang) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return barang;
  }

  // =====================
  // PAKET
  // =====================
  async getAllPaket() {
    const paketList = await this.prisma.paket.findMany({
      where: { isActive: true },
      orderBy: { nama: 'asc' },
      include: {
        items: {
          include: {
            barang: {
              select: {
                nama: true,
                harga_sewa: true,
                gambar: true,
                stok_tersedia: true,
              },
            },
          },
        },
      },
    });

    return Promise.all(
      paketList.map(async (paket) => ({
        ...paket,
        stok_paket: this.hitungStokPaket(paket),
        gambar: paket.gambar ? await this.minio.getFileUrl(paket.gambar) : null,
      })),
    );
  }

  async getPaketById(id: string) {
    const paket = await this.prisma.paket.findFirst({
      where: { id, isActive: true },
      include: {
        items: {
          include: {
            barang: true,
          },
        },
      },
    });

    if (!paket) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    return {
      ...paket,
      stok_paket: this.hitungStokPaket(paket),
      gambar: paket.gambar ? await this.minio.getFileUrl(paket.gambar) : null,
    };
  }
}
