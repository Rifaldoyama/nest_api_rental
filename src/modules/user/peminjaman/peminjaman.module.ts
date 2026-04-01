import { Module } from "@nestjs/common";
import { PeminjamanController } from "./peminjaman.controller";
import { PeminjamanService } from "./peminjaman.service";
import { PrismaService } from "prisma/prisma.service";
import { MinioService } from "src/common/minio/minio.service";

@Module({
  controllers: [PeminjamanController],
  providers: [PeminjamanService, PrismaService, MinioService],
})
export class PeminjamanModule {}