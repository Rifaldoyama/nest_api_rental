import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateZonaDto } from './dto/create-zona.dto';
import { UpdateZonaDto } from './dto/update-zona.dto';
import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';
import { StatusPeminjaman, MetodePengambilan } from '@prisma/client';

@Injectable()
export class AdminZonaService {
  constructor(
    private prisma: PrismaService,
    private peminjamanSharedService: PeminjamanSharedService,
  ) {}

  // ==========================================
  // CREATE ZONA
  // ==========================================

  async create(dto: CreateZonaDto) {
    return this.prisma.zonaPengiriman.create({
      data: {
        nama: dto.nama,
        jarak_min: dto.jarak_min,
        jarak_max: dto.jarak_max,
        biaya: dto.biaya,
      },
    });
  }

  // ==========================================
  // GET ALL ZONA
  // ==========================================

  async findAll() {
    return this.prisma.zonaPengiriman.findMany({
      orderBy: {
        jarak_min: 'asc',
      },
    });
  }

  // ==========================================
  // GET ONE
  // ==========================================

  async findOne(id: string) {
    const zona = await this.prisma.zonaPengiriman.findUnique({
      where: { id },
    });

    if (!zona) {
      throw new NotFoundException('Zona tidak ditemukan');
    }

    return zona;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(id: string, dto: UpdateZonaDto) {
    await this.findOne(id);

    return this.prisma.zonaPengiriman.update({
      where: { id },

      data: {
        ...dto,
      },
    });
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.zonaPengiriman.delete({
      where: { id },
    });
  }

  // // ==========================================
  // // ASSIGN ZONA & RECALCULATE BILL
  // // ==========================================
  async assignZona(peminjamanId: string, zonaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const peminjaman = await tx.peminjaman.findUnique({
        where: { id: peminjamanId },
      });

      if (!peminjaman)
        throw new NotFoundException('Peminjaman tidak ditemukan');

      if (peminjaman.status_pinjam !== StatusPeminjaman.MENUNGGU_PERSETUJUAN) {
        throw new BadRequestException(
          'Zona hanya bisa di assign saat MENUNGGU_PERSETUJUAN',
        );
      }

      const bill = await this.peminjamanSharedService.recalculateBill(
        tx,
        peminjamanId,
        zonaId,
      );

      if (peminjaman.metode_ambil !== MetodePengambilan.DIANTAR) {
        throw new BadRequestException('Peminjaman bukan metode DIANTAR');
      }
      return tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          ...bill,
          zonaId,
        },
      });
    });
  }
}
