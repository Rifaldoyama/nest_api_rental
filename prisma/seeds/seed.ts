import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // =======================
  // USER SEED
  // =======================
  const adminEmail = 'admin@gmail.com';
  const petugasEmail = 'petugas@gmail.com';

  const adminPassword = await bcrypt.hash('admin123', 12);
  const petugasPassword = await bcrypt.hash('petugas123', 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      username: 'admin',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: petugasEmail },
    update: {},
    create: {
      email: petugasEmail,
      username: 'petugas',
      password: petugasPassword,
      role: Role.PETUGAS,
    },
  });

  console.log('🔥 Users seeded');

  // =======================
  // KATEGORI SEED
  // =======================
  const kategoriData = [
    { nama: 'Sound System' },
    { nama: 'Lighting' },
    { nama: 'Stage' },
    { nama: 'Tenda Outdoor' },
    { nama: 'Multimedia' },
    { nama: 'Dekorasi Event' },
    { nama: 'Furniture' },
    { nama: 'Kelistrikan' },
  ];

  const kategoriMap: Record<string, string> = {};

  for (const k of kategoriData) {
    const existing = await prisma.kategori.findFirst({
      where: { nama: k.nama },
    });

    let kategori;

    if (!existing) {
      kategori = await prisma.kategori.create({
        data: {
          nama: k.nama,
          gambar: 'https://placehold.co/600x400',
        },
      });
    } else {
      kategori = existing;
    }

    kategoriMap[k.nama] = kategori.id;
  }
  console.log('📦 Kategori seeded');

  // =======================
  // BARANG SEED
  // =======================
  const barangData = [
    {
      nama: 'Speaker Active 15 inch',
      kategori: 'Sound System',
      stok: 10,
      satuan: 'unit',
      harga: 150000,
    },
    {
      nama: 'Wireless Microphone',
      kategori: 'Sound System',
      stok: 20,
      satuan: 'unit',
      harga: 75000,
    },
    {
      nama: 'Moving Head Light',
      kategori: 'Lighting',
      stok: 12,
      satuan: 'unit',
      harga: 200000,
    },
    {
      nama: 'Panggung Modular 1x2m',
      kategori: 'Stage',
      stok: 30,
      satuan: 'unit',
      harga: 100000,
    },
    {
      nama: 'Tenda Kerucut 5x5',
      kategori: 'Tenda Outdoor',
      stok: 5,
      satuan: 'unit',
      harga: 500000,
    },
    {
      nama: 'LED TV 55 inch',
      kategori: 'Multimedia',
      stok: 8,
      satuan: 'unit',
      harga: 300000,
    },
    {
      nama: 'Kursi Futura',
      kategori: 'Furniture',
      stok: 200,
      satuan: 'pcs',
      harga: 5000,
    },
    {
      nama: 'Genset 5000 Watt',
      kategori: 'Kelistrikan',
      stok: 4,
      satuan: 'unit',
      harga: 350000,
    },
  ];

  for (const b of barangData) {
    await prisma.barang.upsert({
      where: {
        id: `${b.nama}-seed`, // trick supaya tidak bentrok (lebih aman kalau pakai unique field)
      },
      update: {},
      create: {
        nama: b.nama,
        stok_total: b.stok,
        stok_tersedia: b.stok,
        stok_dipesan: 0,
        stok_keluar: 0,
        satuan: b.satuan,
        harga_sewa: b.harga,
        deskripsi: `${b.nama} untuk kebutuhan event`,
        gambar: 'https://placehold.co/600x400',
        kategoriId: kategoriMap[b.kategori],

        denda_ringan: 0.2,
        denda_sedang: 0.5,
        denda_berat: 0.8,
        denda_hilang: 1,
        denda_telat_per_hari: 10000,
      },
    });
  }

  console.log('📦 Barang seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
