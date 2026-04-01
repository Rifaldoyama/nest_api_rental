import { Module } from "@nestjs/common";
import { PaketController } from "./paket.controller";
import { PaketService } from "./paket.service";
import { MinioModule } from "src/common/minio/minio.module";
import { PrismaModule } from "prisma/prisma.module";

@Module({
  imports: [MinioModule,PrismaModule],
  controllers: [PaketController],
  providers: [PaketService],
})
export class PaketModule {}