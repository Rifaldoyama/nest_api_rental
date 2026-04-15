import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';
import { CreatePaketDto } from './dto/create-paket.dto';

@Injectable()
export class PaketService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  // ✅ Helper untuk menghitung stok paket yang tersedia
  private hitungStokPaket(items: any[]): number {
    if (!items || items.length === 0) return 0;

    const stokPerBarang = items.map((item) => {
      const stokBarang = item.barang?.stok_tersedia ?? 0;
      return Math.floor(stokBarang / item.jumlah);
    });

    return Math.min(...stokPerBarang);
  }

  // ✅ Helper untuk validasi dan perhitungan
  private async validateAndCalculate(dto: any) {
    const barangIds = dto.items.map((i: any) => i.barangId);

    const barangList = await this.prisma.barang.findMany({
      where: {
        id: { in: barangIds },
        isActive: true,
      },
      include: {
        kategori: true,
      },
    });

    const barangMap = new Map(barangList.map((b) => [b.id, b]));

    let totalHarga = 0;
    let totalUnit = 0;

    for (const item of dto.items) {
      const barang = barangMap.get(item.barangId);

      if (!barang) {
        throw new BadRequestException(
          `Barang dengan ID ${item.barangId} tidak ditemukan atau tidak aktif`,
        );
      }

      // ✅ Validasi stok_tersedia
      if (item.jumlah > barang.stok_tersedia) {
        throw new BadRequestException(
          `Jumlah ${barang.nama} melebihi stok tersedia. Stok tersedia: ${barang.stok_tersedia}, diminta: ${item.jumlah}`,
        );
      }

      totalHarga += barang.harga_sewa * item.jumlah;
      totalUnit += item.jumlah;
    }

    return { totalHarga, totalUnit, barangMap, barangList };
  }

  async create(dto: CreatePaketDto, file?: Express.Multer.File) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Paket harus memiliki minimal 1 barang');
    }

    // ✅ Validasi dan hitung totalHarga, totalUnit
    const { totalHarga, barangMap } = await this.validateAndCalculate(dto);

    // Hitung harga final
    const diskon = dto.diskon_persen ?? 0;
    const hargaFinal = totalHarga - (totalHarga * diskon) / 100;

    if (hargaFinal < 0) {
      throw new BadRequestException('Harga final tidak boleh negatif');
    }

    // Upload gambar ke Minio
    let objectName: string | null = null;
    if (file) {
      objectName = await this.minio.upload(file, 'paket');
    }

    // ✅ Create Paket dengan total_paket = 0 dulu (akan diupdate setelah items terbuat)
    const paket = await this.prisma.paket.create({
      data: {
        nama: dto.nama,
        diskon_persen: diskon,
        harga_final: Math.round(hargaFinal),
        total_paket: 0, // ✅ Required field, isi 0 dulu
        deskripsi: dto.deskripsi,
        gambar: objectName,
        items: {
          create: dto.items.map((item: any) => {
            const barang = barangMap.get(item.barangId);

            if (!barang) {
              throw new BadRequestException(
                `Barang dengan ID ${item.barangId} tidak ditemukan`,
              );
            }

            return {
              barangId: item.barangId,
              jumlah: item.jumlah,
              nama_barang_snapshot: barang.nama,
              kategori_snapshot: barang.kategori?.nama || '',
              harga_saat_itu: barang.harga_sewa,
            };
          }),
        },
      },
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
                gambar: true,
              },
            },
          },
        },
      },
    });

    // ✅ Hitung total_paket (stok paket yang tersedia) berdasarkan items
    const totalPaket = this.hitungStokPaket(paket.items);

    // ✅ Update total_paket dengan nilai yang benar
    const updatedPaket = await this.prisma.paket.update({
      where: { id: paket.id },
      data: { total_paket: totalPaket },
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
                gambar: true,
              },
            },
          },
        },
      },
    });

    return {
      message: 'Paket berhasil dibuat',
      data: updatedPaket,
    };
  }

  async update(id: string, dto: any, file?: Express.Multer.File) {
    const existing = await this.prisma.paket.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    let totalHarga = 0;
    let barangMap = new Map();

    // Hitung totalHarga dari items existing
    if (existing.items.length > 0) {
      const barangIds = existing.items.map((i) => i.barangId);
      const barangList = await this.prisma.barang.findMany({
        where: { id: { in: barangIds }, isActive: true },
      });
      const tempMap = new Map(barangList.map((b) => [b.id, b]));

      totalHarga = existing.items.reduce((sum, item) => {
        const barang = tempMap.get(item.barangId);
        return sum + (barang?.harga_sewa || item.harga_saat_itu) * item.jumlah;
      }, 0);
    }

    // Jika ada perubahan items, hitung ulang
    if (dto.items) {
      const { totalHarga: newTotalHarga, barangMap: newBarangMap } =
        await this.validateAndCalculate(dto);

      totalHarga = newTotalHarga;
      barangMap = newBarangMap;
    }

    // Hitung harga final
    const diskon = dto.diskon_persen ?? existing.diskon_persen ?? 0;
    const hargaFinal = totalHarga - (totalHarga * diskon) / 100;

    // Handle gambar
    let objectName = existing.gambar;
    if (file) {
      if (existing.gambar) {
        await this.minio.delete(existing.gambar);
      }
      objectName = await this.minio.upload(file, 'paket');
    }

    const updatedPaket = await this.prisma.$transaction(async (tx) => {
      // Hapus items lama jika ada perubahan
      if (dto.items) {
        await tx.paketBarang.deleteMany({
          where: { paketId: id },
        });
      }

      return tx.paket.update({
        where: { id },
        data: {
          nama: dto.nama ?? existing.nama,
          deskripsi: dto.deskripsi ?? existing.deskripsi,
          diskon_persen: diskon,
          harga_final: Math.round(hargaFinal),
          total_paket: existing.total_paket, // ✅ Tetap gunakan nilai lama dulu
          gambar: objectName,
          items: dto.items
            ? {
                create: dto.items.map((item: any) => {
                  const barang = barangMap.get(item.barangId);

                  if (!barang) {
                    throw new BadRequestException(
                      `Barang dengan ID ${item.barangId} tidak ditemukan`,
                    );
                  }

                  return {
                    barangId: item.barangId,
                    jumlah: item.jumlah,
                    nama_barang_snapshot: barang.nama,
                    kategori_snapshot: barang.kategori?.nama || '',
                    harga_saat_itu: barang.harga_sewa,
                  };
                }),
              }
            : undefined,
        },
        include: {
          items: {
            include: {
              barang: {
                select: {
                  id: true,
                  nama: true,
                  harga_sewa: true,
                  stok_tersedia: true,
                  gambar: true,
                },
              },
            },
          },
        },
      });
    });

    // ✅ Hitung total_paket (stok paket yang tersedia) berdasarkan items terbaru
    const totalPaket = this.hitungStokPaket(updatedPaket.items);

    // ✅ Update total_paket dengan nilai yang benar
    const finalPaket = await this.prisma.paket.update({
      where: { id },
      data: { total_paket: totalPaket },
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
                gambar: true,
              },
            },
          },
        },
      },
    });

    return finalPaket;
  }

  async toggle(id: string) {
    const paket = await this.prisma.paket.findUnique({
      where: { id },
    });

    if (!paket) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    return this.prisma.paket.update({
      where: { id },
      data: {
        isActive: !paket.isActive,
      },
    });
  }

  async findAll() {
    const paketList = await this.prisma.paket.findMany({
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
                gambar: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // ✅ Update total_paket dan harga_final secara realtime
    const updatedPaketList = await Promise.all(
      paketList.map(async (paket) => {
        // ✅ Hitung total_paket = stok paket yang tersedia
        const totalPaketRealtime = this.hitungStokPaket(paket.items);

        // Hitung total harga dari harga_sewa terbaru
        const totalHargaRealtime = paket.items.reduce((sum, item) => {
          return (
            sum + (item.barang?.harga_sewa || item.harga_saat_itu) * item.jumlah
          );
        }, 0);

        const diskon = paket.diskon_persen || 0;
        const hargaFinalRealtime =
          totalHargaRealtime - (totalHargaRealtime * diskon) / 100;

        // Update ke database jika ada perubahan
        if (
          totalPaketRealtime !== paket.total_paket ||
          Math.round(hargaFinalRealtime) !== paket.harga_final
        ) {
          await this.prisma.paket.update({
            where: { id: paket.id },
            data: {
              total_paket: totalPaketRealtime,
              harga_final: Math.round(hargaFinalRealtime),
            },
          });
        }

        return {
          ...paket,
          total_paket: totalPaketRealtime,
          harga_final: Math.round(hargaFinalRealtime),
        };
      }),
    );

    return updatedPaketList;
  }

  async findOne(id: string) {
    const paket = await this.prisma.paket.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            barang: {
              select: {
                id: true,
                nama: true,
                harga_sewa: true,
                stok_tersedia: true,
                gambar: true,
              },
            },
          },
        },
      },
    });

    if (!paket) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    // ✅ Hitung total_paket = stok paket yang tersedia
    const totalPaketRealtime = this.hitungStokPaket(paket.items);

    const totalHargaRealtime = paket.items.reduce((sum, item) => {
      return (
        sum + (item.barang?.harga_sewa || item.harga_saat_itu) * item.jumlah
      );
    }, 0);

    const diskon = paket.diskon_persen || 0;
    const hargaFinalRealtime =
      totalHargaRealtime - (totalHargaRealtime * diskon) / 100;

    // Update database
    if (
      totalPaketRealtime !== paket.total_paket ||
      Math.round(hargaFinalRealtime) !== paket.harga_final
    ) {
      await this.prisma.paket.update({
        where: { id },
        data: {
          total_paket: totalPaketRealtime,
          harga_final: Math.round(hargaFinalRealtime),
        },
      });
    }

    return {
      ...paket,
      total_paket: totalPaketRealtime,
      harga_final: Math.round(hargaFinalRealtime),
    };
  }
}
