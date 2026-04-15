import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { MetodePembayaran } from '@prisma/client';

export class CreateMetodeDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  nomor_rekening: string;

  @IsString()
  @IsNotEmpty()
  atas_nama: string;

  @IsString()
  @IsOptional()
  instruksi?: string; 

  @IsEnum(MetodePembayaran)
  metode: MetodePembayaran;
}
