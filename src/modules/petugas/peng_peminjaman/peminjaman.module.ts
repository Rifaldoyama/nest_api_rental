import { Module } from '@nestjs/common';

import { PetugasPeminjamanService } from './peminjaman.service';
import { PetugasPeminjamanController } from './peminjaman.controller';

import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';
import { MinioService } from 'src/common/minio/minio.service';

@Module({

  controllers: [
    PetugasPeminjamanController,
  ],

  providers: [
    PetugasPeminjamanService,
    PeminjamanSharedService,
    MinioService
  ],

})
export class PetugasPeminjamanModule {}
