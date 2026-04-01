import { Module } from '@nestjs/common';

import { AdminZonaController } from './zona.controller';
import { AdminZonaService } from './zona.service';
import { PrismaService } from 'prisma/prisma.service';
import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';

@Module({
  controllers: [AdminZonaController],
  providers: [AdminZonaService,PrismaService,PeminjamanSharedService],
})
export class AdminZonaModule {}