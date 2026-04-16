import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CekUserModule } from './modules/user/cek_user/cek.module';
import { UserDetailModule } from './modules/user/user-detail/user-detail.module';
import { BarangModule } from './modules/admin/kelola_barang/barang.module';
import { KategoriModule } from './modules/admin/kategori/kategori.module';
import { VerifyUserModule } from './modules/admin/verfikasiuser/verify.module';
import { PeminjamanModule } from './modules/user/peminjaman/peminjaman.module';
import { PetugasPeminjamanModule } from './modules/petugas/peng_peminjaman/peminjaman.module';
import { PublicCatalogModule } from './modules/public/public.module';
import { AdminZonaModule } from './modules/admin/zona/zona.module';
import { AdminPeminjamanModule } from './modules/admin/kelola_peminjaman/kel-pem.module';
import { AdminKelPembayaranModule } from './modules/admin/kel-pembayaran/kel-pembayaran.module';
import { UserPembayaranModule } from './modules/user/pembayaran/pembayaran.module';
import { PaketModule } from './modules/admin/paket/paket.module';
import { DashboardModule } from './modules/admin/dashboard/dashboard.module';
import { RiwayatTransaksiModule } from './modules/admin/riwayat-transaksi/riwayat-transaksi.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ExpiredModule } from './modules/corn/expired.module';
import { AppController } from './app.controller';

@Module({
  imports: [
  PrismaModule,
  AuthModule,
  CekUserModule,
  UserDetailModule,
  BarangModule,
  KategoriModule,
  VerifyUserModule,
  PeminjamanModule,
  PetugasPeminjamanModule,
  PublicCatalogModule,
  AdminZonaModule,
  AdminPeminjamanModule,
  AdminKelPembayaranModule,
  UserPembayaranModule,
  PaketModule,
  DashboardModule,
  RiwayatTransaksiModule,
  ScheduleModule.forRoot(),
  ExpiredModule,
],
  controllers: [AppController],
})
export class AppModule {}