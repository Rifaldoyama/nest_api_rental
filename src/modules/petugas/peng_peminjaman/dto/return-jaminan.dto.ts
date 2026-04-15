import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JaminanStatus } from '@prisma/client';

export class ReturnJaminanDto {
  @IsEnum(JaminanStatus)
  status: JaminanStatus; 

  @IsOptional()
  @IsString()
  catatan?: string;

  @IsOptional()
  @IsString()
  foto_bukti_pengembalian?: string;
}