import { Module } from '@nestjs/common';
import { VerifyUserService  } from './verify.service';
import { VerifyUserController } from './verify.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [VerifyUserController],
  providers: [VerifyUserService , PrismaService],
})
export class VerifyUserModule {}
