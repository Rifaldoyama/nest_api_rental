import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MetodePengambilan, JaminanTipe } from '@prisma/client';

class PeminjamanItemDto {
  @IsString()
  @IsNotEmpty()
  barangId: string;

  @IsInt()
  @Min(1)
  jumlah: number;
}

export class CreatePeminjamanDto {
  @IsNotEmpty()
  @IsString()
  tanggal_mulai: string;

  @IsNotEmpty()
  @IsString()
  tanggal_selesai: string;

  @IsEnum(MetodePengambilan)
  metode_ambil: MetodePengambilan;

  @IsOptional()
  @IsString()
  alamat_acara?: string;

  @IsOptional()
  @IsNumber()
  jarak_km?: number; // Jarak dalam KM

  @IsOptional() 
  @IsString()
  paketId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeminjamanItemDto)
  items?: PeminjamanItemDto[];

  @IsEnum(JaminanTipe)
  @IsNotEmpty()
  jaminan_tipe: JaminanTipe;

  @IsOptional()
  @IsString()
  nama_rekening_pengembalian?: string;

  @IsOptional()
  @IsString()
  bank_pengembalian?: string;
  
  @IsOptional()
  @IsString()
  nomor_rekening_pengembalian?: string;

  @IsOptional()
  @IsString()
  jaminan_detail?: string;
}
