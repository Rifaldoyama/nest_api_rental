import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateZonaDto {

  @IsOptional()
  @IsString()
  nama?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  jarak_min?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  jarak_max?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  biaya?: number;

}
