import { Injectable } from '@nestjs/common';
import { PeminjamanSharedService } from 'src/modules/shared/peminjaman.shared.service';
import { AdminUpdateStatusDto } from './dto/update.dto';

@Injectable()
export class AdminPeminjamanService {

  constructor(private shared: PeminjamanSharedService) {}

  findAll() {
    return this.shared.findAll();
  }

  updateStatus(
    peminjamanId: string,
    adminId: string,
    dto: AdminUpdateStatusDto,
  ) {
    return this.shared.updateStatus(
      peminjamanId,
      adminId,
      dto,
    );
  }

}
