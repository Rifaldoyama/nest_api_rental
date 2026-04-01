import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
} from '@nestjs/common';
import { PeminjamanService } from './peminjaman.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreatePeminjamanDto } from './dto/create-peminjaman.dto';
import { RolesGuard } from 'src/common/guards/role.guard';
import { MinioService } from 'src/common/minio/minio.service';

@Controller('api/peminjaman')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
export class PeminjamanController {
  constructor(private readonly service: PeminjamanService
    , private readonly minioService: MinioService    
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

}
