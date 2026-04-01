import { IsArray, ValidateNested, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { KondisiBarang } from '@prisma/client';

class ReturnItemDto {
  @IsString()
  barangId: string;

  @IsEnum(KondisiBarang)
  kondisi_kembali: KondisiBarang;
}

export class ReturnBarangDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}
