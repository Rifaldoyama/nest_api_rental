import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';
import { CreatePaketDto } from './dto/create-paket.dto';

@Injectable()
export class PaketService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  async create(dto: CreatePaketDto, file?: Express.Multer.File) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Paket harus memiliki minimal 1 barang');
    }

    // 1️⃣ Ambil barang
    const barangIds = dto.items.map((i) => i.barangId);

    const barangList = await this.prisma.barang.findMany({
      where: { id: { in: barangIds }, isActive: true },
    });

    if (barangList.length !== barangIds.length) {
      throw new BadRequestException('Ada barang tidak valid');
    }

    let total = 0;

    const barangMap = new Map(barangList.map((b) => [b.id, b]));

    for (const item of dto.items) {
      const barang = barangMap.get(item.barangId);

      if (!barang) {
        throw new BadRequestException(
          `Barang ${item.barangId} tidak ditemukan`,
        );
      }

      // VALIDASI stok_tersedia
      if (item.jumlah > barang.stok_tersedia) {
        throw new BadRequestException(
          `Jumlah ${barang.nama} melebihi stok_tersedia (${barang.stok_tersedia})`,
        );
      }

      total += barang.harga_sewa * item.jumlah;
    }

    // 3️⃣ Hitung diskon
    let hargaFinal = total;

    if (dto.diskon_persen) {
      hargaFinal = total - (total * dto.diskon_persen) / 100;
    }

    if (hargaFinal < 0) hargaFinal = 0;

    // 4️⃣ Upload foto ke Minio
    let objectName: string | null = null;

    if (file) {
      objectName = await this.minio.upload(file, 'paket');
    }

    // 5️⃣ Create Paket
    const paket = await this.prisma.paket.create({
      data: {
        nama: dto.nama,
        total_paket: total,
        diskon_persen: dto.diskon_persen,
        harga_final: Math.round(hargaFinal),
        deskripsi: dto.deskripsi,
        gambar: objectName,
        items: {
          create: dto.items.map((item) => ({
            barangId: item.barangId,
            jumlah: item.jumlah,
          })),
        },
      },
      include: {
        items: {
          include: { barang: true },
        },
      },
    });

    return {
      message: 'Paket berhasil dibuat',
      data: paket,
    };
  }

  async update(id: string, dto: any, file?: Express.Multer.File) {
    const existing = await this.prisma.paket.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    let total = existing.total_paket;
    let hargaFinal = existing.harga_final;

    // Kalau items diganti → hitung ulang
    if (dto.items) {
      const barangIds = dto.items.map((i) => i.barangId);

      const barangList = await this.prisma.barang.findMany({
        where: { id: { in: barangIds }, isActive: true },
      });

      if (barangList.length !== barangIds.length) {
        throw new BadRequestException('Ada barang tidak valid');
      }

      const barangMap = new Map(barangList.map((b) => [b.id, b]));

      total = 0;

      for (const item of dto.items) {
        const barang = barangMap.get(item.barangId);

        if (!barang) {
          throw new BadRequestException('Barang tidak ditemukan');
        }

        if (item.jumlah > barang.stok_tersedia) {
          throw new BadRequestException(
            `Jumlah ${barang.nama} melebihi stok_tersedia (${barang.stok_tersedia})`,
          );
        }

        total += barang.harga_sewa * item.jumlah;
      }

      hargaFinal = total;

      if (dto.diskon_persen ?? existing.diskon_persen) {
        const diskon = dto.diskon_persen ?? existing.diskon_persen;

        hargaFinal = total - (total * diskon) / 100;
      }
    }

    let objectName = existing.gambar;

    if (file) {
      if (existing.gambar) {
        await this.minio.delete(existing.gambar);
      }

      objectName = await this.minio.upload(file, 'paket');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.paketBarang.deleteMany({
          where: { paketId: id },
        });
      }

      return tx.paket.update({
        where: { id },
        data: {
          nama: dto.nama,
          deskripsi: dto.deskripsi,
          diskon_persen: dto.diskon_persen,
          total_paket: total,
          harga_final: Math.round(hargaFinal),
          gambar: objectName,
          items: dto.items
            ? {
                create: dto.items.map((item) => ({
                  barangId: item.barangId,
                  jumlah: item.jumlah,
                })),
              }
            : undefined,
        },
        include: {
          items: { include: { barang: true } },
        },
      });
    });
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
            barang: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return paketList;
  }

  async findOne(id: string) {
    const paket = await this.prisma.paket.findUnique({
      where: { id },
      include: {
        items: {
          include: { barang: true },
        },
      },
    });

    if (!paket) {
      throw new NotFoundException('Paket tidak ditemukan');
    }

    return paket;
  }
}
