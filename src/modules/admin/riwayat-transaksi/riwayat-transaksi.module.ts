import { Module } from '@nestjs/common';
import { RiwayatTransaksiController } from './riwayat-transaksi.controller';
import { RiwayatTransaksiService } from './riwayat-transaksi.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RiwayatTransaksiController],
  providers: [RiwayatTransaksiService],
  exports: [RiwayatTransaksiService],
})
export class RiwayatTransaksiModule {}