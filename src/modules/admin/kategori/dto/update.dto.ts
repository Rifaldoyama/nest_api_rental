import { PartialType } from '@nestjs/mapped-types';
import { CreateKategoriDto } from './create.dto';

export class UpdateKategoriDto extends PartialType(CreateKategoriDto) {}
