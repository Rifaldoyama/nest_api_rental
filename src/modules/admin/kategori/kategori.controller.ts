import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { KategoriService } from './kategori.service';
import { CreateKategoriDto } from './dto/create.dto';
import { UpdateKategoriDto } from './dto/update.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/kategori')
export class KategoriController {
  private readonly logger = new Logger(KategoriController.name);

  constructor(private readonly service: KategoriService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateKategoriDto,
  ) {
    if (!file) throw new BadRequestException('File gambar wajib');
    return this.service.createWithImage(dto, file);
  }

  @Get()
  findAll() {
    return this.service.findAll({ admin: true });
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKategoriDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.logger.log(`Updating kategori ${id} with data:`, dto);

    // 🔥 FIX: Handle FormData dengan benar
    // Jika dto adalah string (dari FormData), parse terlebih dahulu
    let updateDto = dto;
    if (typeof dto === 'string') {
      try {
        updateDto = JSON.parse(dto);
      } catch (e) {
        // Jika tidak bisa parse, buat object dari field yang ada
        updateDto = {} as UpdateKategoriDto;
      }
    }

    return this.service.update(id, updateDto, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
