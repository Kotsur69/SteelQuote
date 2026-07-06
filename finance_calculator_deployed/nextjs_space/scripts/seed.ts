import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash1 = await bcrypt.hash('1234', 10);
  await prisma.user.upsert({
    where: { email: 'example@gmail.com' },
    update: {},
    create: { email: 'example@gmail.com', name: 'Test User', password: hash1 },
  });

  const hash2 = await bcrypt.hash('johndoe123', 10);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: { email: 'john@doe.com', name: 'Admin', password: hash2 },
  });

  console.log('Seed completed');
}

main().catch(console.error).finally(() => prisma.$disconnect());
