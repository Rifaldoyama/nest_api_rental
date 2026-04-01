import { Module } from "@nestjs/common";
import { KategoriController } from "./kategori.controller";
import { KategoriService } from "./kategori.service";
import { MinioService } from "src/common/minio/minio.service";
import { PrismaService } from "prisma/prisma.service";

@Module({
  controllers: [KategoriController],
  providers: [KategoriService,PrismaService,MinioService],
})
export class KategoriModule {}