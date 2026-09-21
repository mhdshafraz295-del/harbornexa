const prisma = require('../config/prismaClient');

async function dropNicIndex() {
  try {
    console.log('Dropping unique index nic from fishers table if exists...');
    await prisma.$executeRawUnsafe('ALTER TABLE fishers DROP INDEX nic');
    console.log('Successfully dropped unique index nic from fishers table!');
  } catch (err) {
    console.log('Index drop result:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

dropNicIndex();
