import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Request,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from 'src/common/guards/jwt.guard';

import { UserPembayaranService } from './pembayaran.service';

import { CreatePembayaranDto } from './dto/create-pembayaran.dto';

@Controller('/api/user/pembayaran')
@UseGuards(JwtAuthGuard)
export class UserPembayaranController {
  constructor(private service: UserPembayaranService) {}

  // ===============================
  // CREATE DP
  // ===============================
  @Post('dp')
  createDP(
    @Request() req,
    @Body()
    body: {
      peminjamanId: string;
      rekeningTujuanId?: string;
    },
  ) {
    return this.service.createDP(
      req.user.userId,
      body.peminjamanId,
      body.rekeningTujuanId,
    );
  }

  @Post('full')
  createFull(
    @Request() req,
    @Body() body: { peminjamanId: string; rekeningTujuanId: string },
  ) {
    return this.service.createFullPayment(
      req.user.userId,
      body.peminjamanId,
      body.rekeningTujuanId,
    );
  }

  @Get('rekening-tujuan')
  async getRekeningTujuan() {
    // Pastikan Anda inject PrismaService di constructor
    return this.service.getRekeningActive();
  }

  // ===============================
  // CREATE PELUNASAN
  // ===============================
  @Post('pelunasan')
  createPelunasan(
    @Request() req,
    @Body() body: { peminjamanId: string; rekeningTujuanId: string },
  ) {
    return this.service.createPelunasan(
      req.user.userId,
      body.peminjamanId,
      body.rekeningTujuanId,
    );
  }

  // ===============================
  // UPLOAD BUKTI (dipakai dua kali)
  // ===============================
  @Patch(':id/upload-bukti')
  @UseInterceptors(FileInterceptor('file'))
  uploadBukti(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadBukti(req.user.userId, id, file);
  }
}
