import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class PaketItemDto {
  @IsString()
  @IsNotEmpty()
  barangId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  jumlah: number;
}

export class CreatePaketDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsOptional()
  @Type(() => Number) 
  @IsNumber()
  @Min(0)
  @Max(100)
  diskon_persen?: number;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaketItemDto)
  items: PaketItemDto[];
}

export class UpdatePaketDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  diskon_persen?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaketItemDto)
  items?: PaketItemDto[];
}