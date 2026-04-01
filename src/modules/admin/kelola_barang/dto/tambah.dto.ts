import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateBarangDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsInt()
  @Min(0)
  harga_sewa: number;

  @IsString()
  @IsNotEmpty()
  kategoriId: string;

  @IsInt()
  @Min(0)
  stok_total: number;

  @IsOptional()
  @IsString()
  gambar?: string;
}
