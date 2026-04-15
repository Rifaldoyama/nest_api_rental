import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
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
  // ✅ FIX: zona.service.ts
  async assignZona(peminjamanId: string, zonaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const peminjaman = await tx.peminjaman.findUnique({
        where: { id: peminjamanId },
      });

      if (!peminjaman)
        throw new NotFoundException('Peminjaman tidak ditemukan');

      // ✅ Validasi
      if (peminjaman.metode_ambil !== MetodePengambilan.DIANTAR) {
        throw new BadRequestException('Peminjaman bukan metode DIANTAR');
      }

      if (peminjaman.status_pinjam !== StatusPeminjaman.MENUNGGU_PERSETUJUAN) {
        throw new BadRequestException(
          `Zona hanya bisa di assign saat MENUNGGU_PERSETUJUAN, saat ini: ${peminjaman.status_pinjam}`,
        );
      }

      if (peminjaman.total_terbayar > 0) {
        throw new BadRequestException(
          'Tidak bisa ubah zona setelah ada pembayaran',
        );
      }

      const zona = await tx.zonaPengiriman.findUnique({
        where: { id: zonaId },
      });

      if (!zona) throw new NotFoundException('Zona tidak ditemukan');

      // ✅ Hapus ongkir lama (kalau ada)
      await tx.peminjamanBiayaDetail.deleteMany({
        where: {
          peminjamanId,
          tipe: 'ONGKIR',
        },
      });

      // ✅ Insert ongkir baru
      await tx.peminjamanBiayaDetail.create({
        data: {
          peminjamanId,
          tipe: 'ONGKIR',
          label: zona.nama,
          jumlah: zona.biaya,
          sumber_id: zona.id,
        },
      });

      // ✅ Recalculate semua biaya
      const bill = await this.peminjamanSharedService.recalculateBill(
        tx,
        peminjamanId,
      );

      // ✅ Update peminjaman dengan data yang sudah dihitung ulang
      const updated = await tx.peminjaman.update({
        where: { id: peminjamanId },
        data: {
          total_sewa: bill.total_sewa,
          total_biaya: bill.total_biaya,
          total_tagihan: bill.total_tagihan, // ✅ Sekarang ada
          total_nilai_asli: bill.total_nilai_asli,
          nominal_dp: bill.nominal_dp,
          sisa_tagihan: bill.sisa_tagihan, // ✅ Sisa tagihan yang benar
          deposit: bill.deposit,
          total_hari: bill.total_hari,
          zonaId,
          status_pinjam: StatusPeminjaman.SIAP_DIPROSES, // ✅ Lanjut ke SIAP_DIPROSES

          // ✅ Catat di audit trail
          keterangan: `${peminjaman.keterangan || ''}\n[${new Date().toISOString()}] Zona di-assign: ${zona.nama} (Ongkir: Rp${zona.biaya.toLocaleString()})`,
        },
      });

      return updated;
    });
  }
}
