import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusPeminjaman, StatusPembayaran } from '@prisma/client';

export class AdminUpdateStatusDto {
  @IsOptional()
  @IsEnum(StatusPeminjaman)
  status_pinjam?: StatusPeminjaman;

  @IsOptional()
  @IsEnum(StatusPembayaran)
  status_bayar?: StatusPembayaran;

  @IsOptional()
  @IsUUID()
  zonaId?: string;
}