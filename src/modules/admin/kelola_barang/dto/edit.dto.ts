import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateBarangDto {
  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  harga_sewa?: number;

  @IsOptional()
  @IsString()
  kategoriId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stok_total?: number; // opsional admin correction

  @IsOptional()
  @IsString()
  gambar?: string;
}
