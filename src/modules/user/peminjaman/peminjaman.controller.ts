import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { PeminjamanService } from './peminjaman.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreatePeminjamanDto } from './dto/create-peminjaman.dto';
import { RolesGuard } from 'src/common/guards/role.guard';
import { MinioService } from 'src/common/minio/minio.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Response } from 'express';
import { TipePembayaran } from '@prisma/client';
import { CreateTestimoniDto } from './dto/create-testimoni.dto';

@Controller('api/peminjaman')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
export class PeminjamanController {
  constructor(
    private readonly service: PeminjamanService,
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  @Post()
  create(@Req() req, @Body() dto: CreatePeminjamanDto) {
    return this.service.create(req.user.userId, dto);
  }

  @Get()
  findMyHistory(@Req() req) {
    return this.service.findAllByUser(req.user.userId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.service.findOneByUser(req.user.userId, id);
  }

  @Get(':id/receipt')
  async generateReceipt(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: TipePembayaran,
    @Res() res: Response,
  ) {
    return this.service.generateReceiptPdf(req.user.userId, id, type, res);
  }

  @Post(':id/testimoni')
  @UseGuards(JwtAuthGuard)
  async createTestimoni(
    @Param('id') id: string,
    @Req() req,
    @Body() dto: CreateTestimoniDto,
  ) {
    return this.service.createTestimoni(req.user.userId, id, dto);
  }

  @Get(':id/can-testimoni')
  @UseGuards(JwtAuthGuard)
  async canTestimoni(@Param('id') id: string, @Req() req) {
    return this.service.canGiveTestimoni(req.user.userId, id);
  }
}
