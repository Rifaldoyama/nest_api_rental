-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PETUGAS', 'USER');

-- CreateEnum
CREATE TYPE "StatusPeminjaman" AS ENUM ('DIAJUKAN', 'DISETUJUI', 'DIANTAR', 'DIPAKAI', 'SELESAI', 'DITOLAK');

-- CreateEnum
CREATE TYPE "MetodePengambilan" AS ENUM ('AMBIL_SENDIRI', 'DIANTAR');

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
    "is_lengkap" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kategori" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "Kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barang" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "stok" INTEGER NOT NULL,
    "harga_sewa" INTEGER NOT NULL,
    "kategoriId" TEXT NOT NULL,

    CONSTRAINT "Barang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paket" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "harga" INTEGER NOT NULL,

    CONSTRAINT "Paket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaketBarang" (
    "id" TEXT NOT NULL,
    "paketId" TEXT NOT NULL,
    "barangId" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,

    CONSTRAINT "PaketBarang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Peminjaman" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tanggal_mulai" TIMESTAMP(3) NOT NULL,
    "tanggal_selesai" TIMESTAMP(3) NOT NULL,
    "tanggal_kembali" TIMESTAMP(3),
    "metode_pengambilan" "MetodePengambilan" NOT NULL,
    "alamat_event" TEXT,
    "biaya_pengantaran" INTEGER NOT NULL DEFAULT 0,
    "biaya_pemasangan" INTEGER NOT NULL DEFAULT 0,
    "denda" INTEGER NOT NULL DEFAULT 0,
    "catatan_rusak" TEXT,
    "total_biaya" INTEGER NOT NULL,
    "status_peminjaman" "StatusPeminjaman" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Peminjaman_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeminjamanBarang" (
    "id" TEXT NOT NULL,
    "peminjamanId" TEXT NOT NULL,
    "barangId" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,

    CONSTRAINT "PeminjamanBarang_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserDetail_userId_key" ON "UserDetail"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Testimoni_peminjamanId_key" ON "Testimoni"("peminjamanId");

-- AddForeignKey
ALTER TABLE "UserDetail" ADD CONSTRAINT "UserDetail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barang" ADD CONSTRAINT "Barang_kategoriId_fkey" FOREIGN KEY ("kategoriId") REFERENCES "Kategori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaketBarang" ADD CONSTRAINT "PaketBarang_paketId_fkey" FOREIGN KEY ("paketId") REFERENCES "Paket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaketBarang" ADD CONSTRAINT "PaketBarang_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Peminjaman" ADD CONSTRAINT "Peminjaman_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBarang" ADD CONSTRAINT "PeminjamanBarang_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeminjamanBarang" ADD CONSTRAINT "PeminjamanBarang_barangId_fkey" FOREIGN KEY ("barangId") REFERENCES "Barang"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimoni" ADD CONSTRAINT "Testimoni_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimoni" ADD CONSTRAINT "Testimoni_peminjamanId_fkey" FOREIGN KEY ("peminjamanId") REFERENCES "Peminjaman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
