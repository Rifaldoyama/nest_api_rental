import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaketService } from './paket.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreatePaketDto, UpdatePaketDto } from './dto/create-paket.dto';

@Controller('admin/paket')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PaketController {
  constructor(private readonly paketService: PaketService) {}

  @Post()
  @UseInterceptors(FileInterceptor('gambar'))
  create(
    @Body() dto: CreatePaketDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.paketService.create(dto, file);
  }

  @Get()
  findAll() {
    return this.paketService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paketService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('gambar'))
  update(
    @Param('id') id: string,
    @Body() body: UpdatePaketDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.paketService.update(id, body, file);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.paketService.toggle(id);
  }
}
