import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerificationStatus } from '@prisma/client';

@Injectable()
export class UserDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, data: any) {
    // 1. Ambil data lama
    const existing = await this.prisma.userDetail.findUnique({
      where: { userId },
    });

    // 2. Logic: Gunakan data baru jika ada, jika tidak gunakan data lama
    return this.prisma.userDetail.upsert({
      where: { userId },
      update: {
        nama_lengkap: data.nama_lengkap || existing?.nama_lengkap, // Gunakan || untuk handle null/undefined/empty string
        no_hp: data.no_hp || existing?.no_hp,
        alamat: data.alamat || existing?.alamat,
        no_ktp: data.no_ktp || existing?.no_ktp,
        foto_ktp: data.foto_ktp || existing?.foto_ktp, // Foto lama aman disini
        
        // Selalu reset status ke PENDING setiap kali ada update
        verification_status: VerificationStatus.PENDING,
        is_lengkap: true,
      },
      create: {
        userId,
        nama_lengkap: data.nama_lengkap,
        no_hp: data.no_hp,
        alamat: data.alamat,
        no_ktp: data.no_ktp,
        foto_ktp: data.foto_ktp,
        is_lengkap: true,
        verification_status: VerificationStatus.PENDING,
      },
    });
  }
}