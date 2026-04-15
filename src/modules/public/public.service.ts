import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';

@Injectable()
export class PublicCatalogService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  private hitungStokPaket(items: any[]): number {
    if (!items || items.length === 0) return 0;

    const stokPerBarang = items.map((item) => {
      const stokBarang = item.barang?.stok_tersedia ?? 0;
      return Math.floor(stokBarang / item.jumlah);
    });

    return Math.min(...stokPerBarang);
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
        stok_dipesan: true,
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
      paketList.map(async (paket) => {
        const totalPaket = this.hitungStokPaket(paket.items);

        return {
          ...paket,
          total_paket: totalPaket,
          gambar: paket.gambar
            ? await this.minio.getFileUrl(paket.gambar)
            : null,
        };
      }),
    );
  }

  async getPaketById(id: string) {
    const paket = await this.prisma.paket.findFirst({
      where: { id, isActive: true },
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

    if (!paket) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    // ✅ Hitung stok paket realtime
    const totalPaket = this.hitungStokPaket(paket.items);

    return {
      ...paket,
      total_paket: totalPaket, // ✅ Override dengan nilai realtime
      gambar: paket.gambar ? await this.minio.getFileUrl(paket.gambar) : null,
    };
  }
}
