import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { AdminKelPembayaranService } from './kel-pembayaran.service';
import { CreateMetodeDto } from './dto/create-metode.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { StatusVerifikasiPembayaran } from '@prisma/client';
import { Role } from '@prisma/client';

@Controller('/api/admin/kel-pembayaran')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminKelPembayaranController {
  constructor(private service: AdminKelPembayaranService) {}

  @Post()
  create(@Body() dto: CreateMetodeDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.service.toggleStatus(id);
  }

  //transaksi
  @Get('verifikasi-list')
  getVerifikasiList(@Query('status') status?: string) {
    if (!status || status === 'ALL') {
      return this.service.listMenungguVerifikasi();
    }

    if (!Object.values(StatusVerifikasiPembayaran).includes(status as any)) {
      throw new BadRequestException('Status tidak valid');
    }

    return this.service.listMenungguVerifikasi(
      status as StatusVerifikasiPembayaran,
    );
  }

  @Patch('verifikasi/:id')
  verifikasi(@Param('id') id: string, @Request() req) {
    // Ambil ID admin dari token JWT
    return this.service.verifikasi(id, req.user.userId);
  }

  @Patch('tolak/:id')
  tolak(@Param('id') id: string, @Request() req) {
    return this.service.tolak(id, req.user.userId);
  }
}
