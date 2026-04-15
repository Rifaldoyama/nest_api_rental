import { IsInt, IsOptional, IsString, Min, IsIn } from 'class-validator';

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
  stok_total?: number;

  @IsOptional()
  @IsString()
  gambar?: string;

  @IsOptional()
  @IsIn(['pcs', 'unit', 'meter', 'set', 'kg'])
  satuan?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  denda_telat_per_hari?: number;
}
