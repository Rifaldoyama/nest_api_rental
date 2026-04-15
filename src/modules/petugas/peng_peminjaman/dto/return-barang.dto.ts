import {
  IsArray,
  ValidateNested,
  IsEnum,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { KondisiBarang } from '@prisma/client';

class ReturnItemDto {
  @IsString()
  barangId: string;

  @IsEnum(KondisiBarang)
  kondisi_kembali: KondisiBarang;
}

export class ReturnBarangDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  })
  items: ReturnItemDto[];

  @IsOptional()
  @IsDateString()
  tanggal_kembali?: string;
}
