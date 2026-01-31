import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CekUserModule } from './modules/user/cek_user/cek.module';
// import { VerifyUserModule } from './modules/admin/verfikasiuser/verify.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CekUserModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
