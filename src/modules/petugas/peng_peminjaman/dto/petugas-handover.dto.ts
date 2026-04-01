import { IsString, IsEnum, IsOptional } from 'class-validator';

export class PetugasHandoverDto {

  @IsString()
  @IsOptional()
  kondisi_barang_keluar: string;

  @IsString()
  @IsOptional()
  foto_serah_terima: string; // URL foto dari Minio/Cloudinary
}
