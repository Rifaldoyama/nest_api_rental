import { Module } from '@nestjs/common';
import { CekUserController } from './cek.controller';
import { CekUserService } from './cek.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [CekUserController],
  providers: [CekUserService, PrismaService],
  exports: [CekUserService],
})
export class CekUserModule {}
