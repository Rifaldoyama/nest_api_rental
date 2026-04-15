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

  // ===============================
  // REKENING TUJUAN (CRUD)
  // ===============================

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

  // ===============================
  // PEMBAYARAN (LIST & DETAIL)
  // ===============================

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

  @Get('pembayaran/:id')
  getDetail(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  // ===============================
  // VERIFIKASI PEMBAYARAN (DENGAN ALLOCATION)
  // ===============================

  @Post('verify-payment/:id')
  verifyPayment(
    @Param('id') id: string,
    @Request() req,
    @Body() body: { status: 'VERIFIED' | 'REJECTED'; catatan?: string },
  ) {
    if (!body.status || !['VERIFIED', 'REJECTED'].includes(body.status)) {
      throw new BadRequestException('Status harus VERIFIED atau REJECTED');
    }

    return this.service.verifyPayment(
      req.user.userId,
      id,
      body.status,
      body.catatan,
    );
  }
  // ===============================
  // DEPOSIT
  // ===============================

  @Post('deposit/:peminjamanId/kembalikan')
  kembalikanDeposit(
    @Param('peminjamanId') peminjamanId: string,
    @Request() req,
  ) {
    return this.service.kembalikanDeposit(req.user.userId, peminjamanId);
  }

  @Get('deposit')
  async getDepositList(
    @Query('status') status: 'all' | 'pending' | 'done' = 'pending',
  ) {
    return this.service.getPeminjamanForDepositRefund(status);
  }
}