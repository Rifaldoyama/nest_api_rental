import { Controller, Get, Param } from '@nestjs/common';
import { PublicKategoriService } from './public-kategori.service';

@Controller('public/kategori')
export class PublicKategoriController {
  constructor(private service: PublicKategoriService) {}

  @Get()
  getAll() {
    return this.service.getAllKategori();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getKategoriById(id);
  }
}
