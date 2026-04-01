import { Module } from '@nestjs/common';

import { AdminPeminjamanController } from './kel-pem.controller';
import { AdminPeminjamanService } from './kel-pem.service';

import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';

@Module({

  controllers: [
    AdminPeminjamanController,
  ],

  providers: [
    AdminPeminjamanService,
    PeminjamanSharedService,
  ],

})
export class AdminPeminjamanModule {}
