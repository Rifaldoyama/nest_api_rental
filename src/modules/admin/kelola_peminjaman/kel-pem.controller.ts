import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AdminPeminjamanService } from './kel-pem.service';
import { AdminUpdateStatusDto } from './dto/update.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

import { Role } from '@prisma/client';

@Controller('api/admin/peminjaman')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPeminjamanController {

  constructor(
    private readonly service: AdminPeminjamanService,
  ) {}

  // ==========================================
  // GET ALL PEMINJAMAN
  // ==========================================

  @Get()
  findAll() {

    return this.service.findAll();

  }

  // ==========================================
  // UPDATE STATUS (GENERIC)
  // approve / reject / terima dp
  // ==========================================

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: AdminUpdateStatusDto,
  ) {

    return this.service.updateStatus(
      id,
      req.user.userId,
      dto,
    );

  }

}
