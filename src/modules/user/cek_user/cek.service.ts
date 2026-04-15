// user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CekUserService {
  constructor(private prisma: PrismaService) {}

  async getUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        detail: true,
      },
    });
  }

  async isUserDataComplete(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        detail: {
          select: { is_lengkap: true },
        },
      },
    });
    if (!user) return false;
    if (user.role !== 'USER') return true;
    return user.detail?.is_lengkap === true;
  }

  async getMyVerificationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        detail: {
          select: {
            verification_status: true,
          },
        },
      },
    });

    if (!user || !user.detail) {
      return { status: 'PENDING' };
    }

    return {
      status: user.detail.verification_status,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        detail: {
          select: {
            nama_lengkap: true,
            no_hp: true,
            alamat: true,
            no_ktp: true,
            verification_status: true,
            is_lengkap: true,
          },
        },
      },
    });

    return user?.detail || null;
  }
}
