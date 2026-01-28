import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');
  await prisma.event.createMany({
    data: [
      { name: 'Concert A', totalSeats: 3 },
      { name: 'Conference B', totalSeats: 100 }
    ],
    skipDuplicates: true
  });
  console.log('Done.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
