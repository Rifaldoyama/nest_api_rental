import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Role, VerificationStatus } from '@prisma/client';

@Injectable()
export class VerifyUserService {
  constructor(private prisma: PrismaService) {}

  async getUsers(status?: VerificationStatus) {
    return this.prisma.user.findMany({
      where: {
        role: Role.USER,
        detail: status ? { verification_status: status } : { is_lengkap: true },
      },
      include: { detail: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        detail: true,
        peminjaman: {
            take: 5, 
            orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!user) throw new BadRequestException('User tidak ditemukan');
    return user;
  }

  async verifyUser(userId: string, status: VerificationStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { detail: true }
    });

    if (!user) throw new BadRequestException('User tidak ditemukan');
    
    if (!user.detail || !user.detail.is_lengkap) {
      throw new BadRequestException('User belum melengkapi data profil/KTP');
    }

    return this.prisma.userDetail.update({
      where: { userId: userId },
      data: {
        verification_status: status, // Bisa APPROVED atau REJECTED
      },
    });
  }

  async getUsersForVerification() {
    return this.prisma.user.findMany({
      where: {
        role: Role.USER,
        detail: {
          is_lengkap: true,
          verification_status: VerificationStatus.PENDING, // Filter yang butuh verifikasi
        },
      },
      include: {
        detail: true,
      },
    });
  }
}