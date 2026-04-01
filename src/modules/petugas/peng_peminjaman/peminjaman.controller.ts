import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Post,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { generateSuratSerahTerima } from 'src/common/utils/generate-serah-terima';

import { PetugasPeminjamanService } from './peminjaman.service';
import { PetugasHandoverDto } from './dto/petugas-handover.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReturnBarangDto } from './dto/return-barang.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

import { Role } from '@prisma/client';

@Controller('api/petugas/peminjaman')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PETUGAS)
export class PetugasPeminjamanController {
  constructor(private readonly service: PetugasPeminjamanService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/surat')
  async downloadSurat(@Param('id') id: string, @Res() res: Response) {
    const peminjaman = await this.service.findOne(id);

    if (!peminjaman) {
      return res.status(404).json({ message: 'Peminjaman tidak ditemukan' });
    }

    generateSuratSerahTerima(res, peminjaman);
  }

  // ✅ Tambahkan ini
  @Patch(':id/start')
  start(@Param('id') id: string, @Req() req) {
    return this.service.startDelivery(id, req.user.userId);
  }

  @Patch(':id/handover')
  @UseInterceptors(FileInterceptor('foto_serah_terima'))
  handover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
    @Body() dto: PetugasHandoverDto,
  ) {
    return this.service.handover(id, req.user.userId, dto, file);
  }

  @Patch(':id/return')
  @UseInterceptors(FileInterceptor('foto_pengembalian'))
  async returnBarang(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ReturnBarangDto,
    @Req() req,
  ) {
    return this.service.returnBarang(id, req.user.userId, dto, file);
  }
}
