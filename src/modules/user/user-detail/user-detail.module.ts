import { UserDetailController } from './user-detail.controller';
import { Module } from '@nestjs/common';
import { UserDetailService } from './user-detail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MinioModule } from 'src/common/minio/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [UserDetailController],
  providers: [UserDetailService, PrismaService],
  exports: [UserDetailService],
})
export class UserDetailModule {}
