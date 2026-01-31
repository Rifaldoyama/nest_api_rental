// user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

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
}
