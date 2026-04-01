import {
  IsString,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateZonaDto {

  @IsString()
  nama: string;

  @IsNumber()
  @Min(0)
  jarak_min: number;

  @IsNumber()
  @Min(0)
  jarak_max: number;

  @IsNumber()
  @Min(0)
  biaya: number;

}
