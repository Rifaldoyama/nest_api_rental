import { Module } from '@nestjs/common';
import { PublicBarangController } from './public-barang.controller';
import { PublicPaketController } from './public-paket.controller';
import { PublicCatalogService } from './public.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicKategoriController } from './kategori/public-kategori.controller';
import { PublicKategoriService } from './kategori/public-kategori.service';
import { MinioService } from 'src/common/minio/minio.service';

@Module({
  controllers: [
    PublicBarangController,
    PublicPaketController,
    PublicKategoriController
  ],
  providers: [
    PublicCatalogService,
    PrismaService,
    MinioService,
    PublicKategoriService
  ],
})
export class PublicCatalogModule {}
