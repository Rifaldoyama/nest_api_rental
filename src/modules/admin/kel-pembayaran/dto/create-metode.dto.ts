import { IsString, IsEnum } from 'class-validator';
import { MetodePembayaran } from '@prisma/client';

export class CreateMetodeDto {

  @IsString()
  nama: string;

  @IsString()
  nomor_rekening: string;

  @IsString()
  atas_nama: string;

  @IsString()
  instruksi: string;

  @IsEnum(MetodePembayaran)
  metode: MetodePembayaran;
}
