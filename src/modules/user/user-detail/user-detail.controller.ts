import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { UserDetailService } from './user-detail.service';
import { MinioService } from 'src/common/minio/minio.service';
import { CreateUserDetailDto } from './dto/create-user-detail.dto';
import { UpdateUserDetailDto } from './dto/update-user.dto';

@UseGuards(JwtAuthGuard)
@Controller('user-detail')
export class UserDetailController {
  constructor(
    private readonly service: UserDetailService,
    private readonly minio: MinioService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('foto_ktp'))
  async createOrUpdate(
    @Req() req,
    @Body() dto: CreateUserDetailDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let foto_ktp: string | undefined;

    if (file) {
      foto_ktp = await this.minio.upload(file, 'ktp');
    }

    // Bersihkan DTO: Ubah string "undefined" atau "" menjadi undefined murni
    const cleanData = {
      nama_lengkap: dto.nama_lengkap || undefined,
      no_hp: dto.no_hp || undefined,
      alamat: dto.alamat || undefined,
      no_ktp: dto.no_ktp || undefined,
      foto_ktp, // undefined jika tidak ada file baru
    };

    await this.service.upsert(req.user.userId, cleanData);

    return { message: 'Data berhasil disimpan dan menunggu verifikasi.' };
  }
}
