import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCatalogService } from './public.service';

@Controller('public/barang')
export class PublicBarangController {
  constructor(private readonly service: PublicCatalogService) {}

  @Get()
  findAll(@Query('kategoriId') kategoriId?: string) {
    return this.service.getAllBarang(kategoriId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.getBarangById(id);
  }
}
