-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PETUGAS', 'USER');

-- CreateEnum
CREATE TYPE "StatusPeminjaman" AS ENUM ('MENUNGGU_PERSETUJUAN', 'SIAP_DIPROSES', 'DIPROSES', 'DIPAKAI', 'SELESAI', 'DITOLAK');

-- CreateEnum
CREATE TYPE "MetodePengambilan" AS ENUM ('AMBIL_SENDIRI', 'DIANTAR');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StatusPembayaran" AS ENUM ('BELUM_BAYAR', 'MENUNGGU_VERIFIKASI_DP', 'DP_DITOLAK', 'DP_DITERIMA', 'MENUNGGU_VERIFIKASI_PELUNASAN', 'MENUNGGU_VERIFIKASI_FULL', 'LUNAS', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "KondisiBarang" AS ENUM ('BAGUS', 'RUSAK_RINGAN', 'RUSAK_SEDANG', 'RUSAK_BERAT', 'HILANG');

-- CreateEnum
CREATE TYPE "JaminanTipe" AS ENUM ('KTP', 'SIM', 'PASPOR', 'STNK', 'DEPOSIT_UANG', 'LAINNYA');

-- CreateEnum
CREATE TYPE "MetodePembayaran" AS ENUM ('BANK_TRANSFER', 'EWALLET', 'QRIS', 'CASH');

-- CreateEnum
CREATE TYPE "TipePembayaran" AS ENUM ('DP', 'PELUNASAN', 'DENDA', 'FULL', 'REFUND_DEPOSIT');

-- CreateEnum
CREATE TYPE "TipePembayaranAllocation" AS ENUM ('DP', 'PELUNASAN', 'SEWA', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "StatusVerifikasiPembayaran" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TipeBiaya" AS ENUM ('ONGKIR', 'DENDA', 'DAMAGE', 'ADMIN_FEE', 'DISKON', 'OTHER');

-- CreateEnum
CREATE TYPE "JaminanStatus" AS ENUM ('DITAHAN', 'DIKEMBALIKAN');

-- CreateEnum
CREATE TYPE "JenisDenda" AS ENUM ('KERUSAKAN', 'KEHILANGAN', 'KETERLAMBATAN');

-- CreateEnum
CREATE TYPE "InventoryTipe" AS ENUM ('RESERVE', 'RELEASE', 'OUT', 'RETURN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDetail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "no_hp" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "no_ktp" TEXT,
    "foto_ktp" TEXT,
    "foto_selfie" TEXT,
    "is_lengkap" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "UserDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kategori" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "gambar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barang" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "stok_total" INTEGER NOT NULL,
    "stok_tersedia" INTEGER NOT NULL,
    "stok_dipesan" INTEGER NOT NULL DEFAULT 0,
    "stok_keluar" INTEGER NOT NULL DEFAULT 0,
    "satuan" TEXT NOT NULL,
    "harga_sewa" INTEGER NOT NULL,
    "deskripsi" TEXT,
    "gambar" TEXT,
    "denda_ringan" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "denda_sedang" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "denda_berat" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "denda_hilang" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "denda_telat_per_hari" INTEGER DEFAULT 0,
    "kategoriId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Barang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "barangId" TEXT NOT NULL,
    "peminjamanId" TEXT,
    "tipe" "InventoryTipe" NOT NULL,
    "before_stock" INTEGER NOT NULL,
    "after_stock" INTEGER NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paket" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "diskon_persen" INTEGER,
    "harga_final" INTEGER NOT NULL,
    "deskripsi" TEXT,
    "gambar" TEXT,
    "total_paket" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaketBarang" (
    "id" TEXT NOT NULL,
    "paketId" TEXT NOT NULL,
    "barangId" TEXT NOT NULL,
    "nama_barang_snapshot" TEXT NOT NULL,
    "kategori_snapshot" TEXT NOT NULL,
    "harga_saat_itu" INTEGER NOT NULL,
    "jumlah" INTEGER NOT NULL,

    CONSTRAINT "PaketBarang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Peminjaman" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvedById" TEXT,
    "deliveredById" TEXT,
    "receivedById" TEXT,
    "tanggal_mulai" TIMESTAMP(3) NOT NULL,
    "tanggal_selesai" TIMESTAMP(3) NOT NULL,
    "tanggal_kembali" TIMESTAMP(3),
    "metode_ambil" "MetodePengambilan" NOT NULL,
    "alamat_acara" TEXT,
    "zonaId" TEXT,
    "total_biaya" INTEGER NOT NULL,
    "total_sewa" INTEGER NOT NULL,
    "total_denda" INTEGER NOT NULL DEFAULT 0,
    "total_tagihan" INTEGER NOT NULL DEFAULT 0,
    "total_terbayar" INTEGER NOT NULL DEFAULT 0,
    "total_nilai_asli" INTEGER,
    "nominal_dp" INTEGER NOT NULL DEFAULT 0,
    "sisa_tagihan" INTEGER NOT NULL DEFAULT 0,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "deposit_kembali" INTEGER NOT NULL DEFAULT 0,
    "deposit_dikembalikan" BOOLEAN NOT NULL DEFAULT false,
    "status_pinjam" "StatusPeminjaman" NOT NULL DEFAULT 'MENUNGGU_PERSETUJUAN',
    "status_bayar" "StatusPembayaran" NOT NULL DEFAULT 'BELUM_BAYAR',
    "jaminan_tipe" "JaminanTipe",
    "jaminan_detail" TEXT,
    "jaminan_status" "JaminanStatus" NOT NULL DEFAULT 'DITAHAN',
    "nama_rekening_pengembalian" TEXT,
    "bank_pengembalian" TEXT,
    "nomor_rekening_pengembalian" TEXT,
    "foto_serah_terima" TEXT,
    "foto_pengembalian" TEXT,
    "kondisi_barang_keluar" "KondisiBarang",
    "file_surat_jalan" TEXT,
    "keterangan" TEXT,
    "paketId" TEXT,
    "expired_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Peminjaman_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeminjamanBiayaDetail" (
    "id" TEXT NOT NULL,
    "sumber_id" TEXT,
    "peminjamanId" TEXT NOT NULL,
    "barangId" TEXT,
    "tipe" "TipeBiaya" NOT NULL,
    "label" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "jenis_denda" "JenisDenda",
    "qty" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeminjamanBiayaDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeminjamanBarang" (
    "id" TEXT NOT NULL,
    "peminjamanId" TEXT NOT NULL,
    "barangId" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,
    "kondisi_kembali" "KondisiBarang",
    "nama_barang_snapshot" TEXT NOT NULL,
    "kategori_snapshot" TEXT NOT NULL,
    "harga_saat_itu" INTEGER NOT NULL,
    "satuan_snapshot" TEXT NOT NULL,
    "denda_ringan_snapshot" DOUBLE PRECISION,
    "denda_sedang_snapshot" DOUBLE PRECISION,
    "denda_berat_snapshot" DOUBLE PRECISION,
    "denda_hilang_snapshot" DOUBLE PRECISION,
    "denda_telat_snapshot" INTEGER,

    CONSTRAINT "PeminjamanBarang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pembayaran" (
    "id" TEXT NOT NULL,
    "peminjamanId" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "metode" "MetodePembayaran" NOT NULL,
    "tipe" "TipePembayaran" NOT NULL,
    "status" "StatusVerifikasiPembayaran" NOT NULL DEFAULT 'PENDING',
    "rekeningTujuanId" TEXT,
    "bukti_pembayaran" TEXT,
    "catatan" TEXT,
    "keterangan_ditolak" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pembayaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PembayaranAllocation" (
    "id" TEXT NOT NULL,
    "pembayaranId" TEXT NOT NULL,
    "tipe" "TipePembayaranAllocation" NOT NULL,
    "jumlah" INTEGER NOT NULL,

    CONSTRAINT "PembayaranAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RekeningTujuan" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "metode" "MetodePembayaran" NOT NULL,
    "atas_nama" TEXT NOT NULL,
    "instruksi" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RekeningTujuan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZonaPengiriman" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "jarak_min" DOUBLE PRECISION NOT NULL,
    "jarak_max" DOUBLE PRECISION NOT NULL,
    "biaya" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZonaPengiriman_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimoni" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "peminjamanId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "komentar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Testimoni_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "gambar" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserDetail_userId_key" ON "UserDetail"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaketBarang_paketId_barangId_key" ON "PaketBarang"("paketId", "barangId");

-- CreateIndex
CREATE INDEX "Peminjaman_userId_idx" ON "Peminjaman"("userId");

-- CreateIndex
CREATE INDEX "Peminjaman_status_pinjam_idx" ON "Peminjaman"("status_pinjam");

-- CreateIndex
CREATE INDEX "Peminjaman_status_bayar_idx" ON "Peminjaman"("status_bayar");

-- CreateIndex
CREATE INDEX "Peminjaman_tanggal_mulai_tanggal_selesai_idx" ON "Peminjaman"("tanggal_mulai", "tanggal_selesai");

-- CreateIndex
CREATE INDEX "Pembayaran_peminjamanId_idx" ON "Pembayaran"("peminjamanId");

-- CreateIndex
CREATE INDEX "Pembayaran_status_idx" ON "Pembayaran"("status");

-- CreateIndex
CREATE INDEX "Pembayaran_tipe_idx" ON "Pembayaran"("tipe");

-- CreateIndex
CREATE INDEX "Pembayaran_createdAt_idx" ON "Pembayaran"("createdAt");

-- CreateIndex
CREATE INDEX "Pembayaran_peminjamanId_status_idx" ON "Pembayaran"("peminjamanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Testimoni_peminjamanId_key" ON "Testimoni"("peminjamanId");

-- AddForeignKey
ALTER TABLE "UserDetail" ADD CONSTRAINT "UserDetail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barang" ADD CONSTRAINT "Barang_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "Kategori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaketBarang" ADD CONSTRAINT "PaketBarang_paketId_fkey" FOREIGN KEY ("paketId") REFERENCES "Paket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaketBarang" ADD CONSTRAINT "PaketBarang_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaPengiriman"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_paketId_fkey" FOREIGN KEY ("paketId") REFERENCES "Paket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBiayaDetail" ADD CONSTRAINT "PeminjamanBiayaDetail_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBiayaDetail" ADD CONSTRAINT "PeminjamanBiayaDetail_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBarang" ADD CONSTRAINT "PeminjamanBarang_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBarang" ADD CONSTRAINT "PeminjamanBarang_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_rekeningTujuanId_fkey" FOREIGN KEY ("rekeningTujuanId") REFERENCES "RekeningTujuan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PembayaranAllocation" ADD CONSTRAINT "PembayaranAllocation_pembayaranId_fkey" FOREIGN KEY ("pembayaranId") REFERENCES "Pembayaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimoni" ADD CONSTRAINT "Testimoni_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimoni" ADD CONSTRAINT "Testimoni_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
