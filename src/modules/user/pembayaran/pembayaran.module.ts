import {} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { UserPembayaranController } from './pembayaran.controller';
import { UserPembayaranService } from './pembayaran.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service'

@Module({
  controllers: [UserPembayaranController],
  providers: [UserPembayaranService, PrismaService, MinioService],
})
export class UserPembayaranModule {}
