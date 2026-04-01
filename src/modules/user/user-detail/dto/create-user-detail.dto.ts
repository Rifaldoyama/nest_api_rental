import { IsOptional, IsString } from 'class-validator';

export class CreateUserDetailDto {
  @IsString()
  nama_lengkap: string;

  @IsString()
  no_hp: string;

  @IsString()
  alamat: string;

  @IsOptional()
  @IsString()
  no_ktp?: string;
}
