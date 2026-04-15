import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BarangService } from './barang.service';
import { CreateBarangDto } from './dto/tambah.dto';
import { UpdateBarangDto } from './dto/edit.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/barang')
export class BarangController {
  constructor(private readonly service: BarangService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body('data') data: string,
  ) {
    if (!data) {
      throw new BadRequestException('Data barang tidak boleh kosong');
    }

    let dto: CreateBarangDto;
    try {
      dto = JSON.parse(data);
    } catch {
      throw new BadRequestException('Format data tidak valid');
    }

    return this.service.create(dto, file);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('data') data: string,
  ) {
    if (!data) {
      throw new BadRequestException('Data barang tidak boleh kosong');
    }

    let dto: UpdateBarangDto;
    try {
      dto = JSON.parse(data);
    } catch {
      throw new BadRequestException('Format data tidak valid');
    }

    return this.service.update(id, dto, file);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
