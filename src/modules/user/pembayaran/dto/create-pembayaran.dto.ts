import { IsString, IsNumber, IsEnum } from 'class-validator';
import { TipePembayaran } from '@prisma/client';

export class CreatePembayaranDto {

  @IsString()
  peminjamanId: string;

  @IsString()
  rekeningTujuanId: string;

  @IsNumber()
  jumlah: number;

  @IsEnum(TipePembayaran)
  tipe: TipePembayaran;
}
