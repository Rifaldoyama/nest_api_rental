import { Module } from '@nestjs/common';
import { AdminKelPembayaranController } from './kel-pembayaran.controller';
import { AdminKelPembayaranService } from './kel-pembayaran.service';
import { MinioService } from 'src/common/minio/minio.service';


@Module({

  controllers: [
    AdminKelPembayaranController,
  ],
  providers: [
    AdminKelPembayaranService,
    MinioService
  ],

})
export class AdminKelPembayaranModule {}
