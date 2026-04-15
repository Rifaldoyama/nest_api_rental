import { Module } from '@nestjs/common';
import { ExpiredService } from './expired.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [ExpiredService, PrismaService],
})
export class ExpiredModule {}