import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@gmail.com';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('✅ Admin already exists');
    return;
  }

  const hashedPassword = await bcrypt.hash('admin123', 12);

  await prisma.user.create({
    data: {
      email: adminEmail,
      username: 'admin',
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log('🔥 Admin seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
