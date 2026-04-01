import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import { AdminZonaService } from './zona.service';

import { CreateZonaDto } from './dto/create-zona.dto';
import { UpdateZonaDto } from './dto/update-zona.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AssignZonaDto } from './dto/assign-zona.dto';

import { Role } from '@prisma/client';

@Controller('api/admin/zona')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminZonaController {
  constructor(private readonly service: AdminZonaService) {}

  // ==========================================
  // CREATE
  // ==========================================

  @Post()
  create(@Body() dto: CreateZonaDto) {
    return this.service.create(dto);
  }

  // ==========================================
  // GET ALL
  // ==========================================

  @Get()
  findAll() {
    return this.service.findAll();
  }

  // ==========================================
  // GET ONE
  // ==========================================

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZonaDto) {
    return this.service.update(id, dto);
  }

  // ==========================================
  // DELETE
  // ==========================================

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Patch('assign/:peminjamanId')
  assignZona(
    @Param('peminjamanId') peminjamanId: string,
    @Body() dto: AssignZonaDto,
  ) {
    return this.service.assignZona(peminjamanId, dto.zonaId);
  }
}
