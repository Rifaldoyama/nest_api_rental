import { Controller, Get, Param } from '@nestjs/common';
import { PublicCatalogService } from './public.service';

@Controller('public/paket')
export class PublicPaketController {
  constructor(private readonly service: PublicCatalogService) {}

  @Get()
  findAll() {
    return this.service.getAllPaket();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.getPaketById(id);
  }
}