import { Module } from '@nestjs/common';
import { BarangService } from './barang.service';
import { BarangController } from './barang.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioService } from 'src/common/minio/minio.service';

@Module({
  controllers: [BarangController],
  providers: [BarangService, PrismaService,MinioService],
})
export class BarangModule {}
