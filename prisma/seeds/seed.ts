import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@gmail.com';
  const petugasEmail = 'petugas@gmail.com';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        username: 'admin',
        password: hashedPassword,
        role: Role.ADMIN,
      },
    });

    console.log('🔥 Admin created');
  } else {
    console.log('✅ Admin already exists');
  }

  const existingPetugas = await prisma.user.findUnique({
    where: { email: petugasEmail },
  });

  if (!existingPetugas) {
    const hashedPasswordPet = await bcrypt.hash('petugas123', 12);

    await prisma.user.create({
      data: {
        email: petugasEmail,
        username: 'petugas',
        password: hashedPasswordPet,
        role: Role.PETUGAS,
      },
    });

    console.log('🔥 Petugas created');
  } else {
    console.log('✅ Petugas already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
