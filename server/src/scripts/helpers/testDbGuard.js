/**
 * Authoritative Prisma-Only Hard Guard for Automated Write Tests
 * Ensures write operations run ONLY against isolated test database: valachchenai_harbor_test
 * @param {Object} prisma PrismaClient instance
 */
async function assertIsolatedTestDatabase(prisma) {
  if (process.env.DB_NAME !== 'valachchenai_harbor_test') {
    throw new Error(`FATAL: HARD TEST DB GUARD FAILED! process.env.DB_NAME is '${process.env.DB_NAME}', expected 'valachchenai_harbor_test'. Aborting test execution.`);
  }

  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('/valachchenai_harbor_test')) {
    throw new Error(`FATAL: HARD TEST DB GUARD FAILED! process.env.DATABASE_URL does not target 'valachchenai_harbor_test'. Aborting test execution.`);
  }

  // Authoritative query against active database connection
  const res = await prisma.$queryRaw`SELECT DATABASE() as currentDb`;
  const currentDb = res && res[0] ? res[0].currentDb : null;

  if (currentDb !== 'valachchenai_harbor_test') {
    throw new Error(`FATAL: DB ISOLATION FAILURE! Live Prisma connection is connected to '${currentDb}', expected 'valachchenai_harbor_test'. Aborting.`);
  }

  console.log(`✔ HARD TEST DB GUARD VERIFIED: Live Prisma DB = '${currentDb}' (ISOLATED TEST DB ONLY).`);
  return currentDb;
}

module.exports = {
  assertIsolatedTestDatabase,
};
