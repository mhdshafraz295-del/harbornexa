const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prismaClient');
const bcrypt = require('bcryptjs');


const PORT = env.port;

/**
 * Ensures required system admin accounts are created & active on server startup
 */
async function ensureDefaultAdmins() {
  try {
    const adminEmail = 'alsafafisheriesorg@gmail.com';
    const adminName = 'assafa';
    const rawPass = 'Al_Safa_202609';

    // Seed 1: Super Admin Account
    const existing = await prisma.admins.findUnique({
      where: { email: adminEmail },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash(rawPass, 10);
      await prisma.admins.create({
        data: {
          name: adminName,
          email: adminEmail,
          password_hash: passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      console.log(`✔ Admin account "${adminEmail}" (${adminName}) created successfully.`);
    } else if (existing.status !== 'ACTIVE') {
      await prisma.admins.update({
        where: { email: adminEmail },
        data: { status: 'ACTIVE' },
      });
    }

    // Seed 2: Restricted Checker Account
    const checkerEmail = 'alamanuser@gmail.com';
    const checkerName = 'Al Safa Checker';
    const checkerRawPass = 'Al_Safa_2026';

    const existingChecker = await prisma.admins.findUnique({
      where: { email: checkerEmail },
    });

    if (!existingChecker) {
      const checkerPasswordHash = await bcrypt.hash(checkerRawPass, 10);
      await prisma.admins.create({
        data: {
          name: checkerName,
          email: checkerEmail,
          password_hash: checkerPasswordHash,
          role: 'CHECKER',
          status: 'ACTIVE',
        },
      });
      console.log(`✔ Checker account "${checkerEmail}" created successfully.`);
    } else if (existingChecker.status !== 'ACTIVE') {
      await prisma.admins.update({
        where: { email: checkerEmail },
        data: { status: 'ACTIVE' },
      });
    }
  } catch (err) {
    console.warn('Notice: Could not auto-seed admin account:', err.message);
  }
}

async function startServer() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log(`VALACHCHENAI HARBOR SYSTEM - SERVER RUNNING`);
    console.log(`Environment : ${env.nodeEnv}`);
    console.log(`Port        : ${PORT}`);
    console.log(`Client URL  : ${env.clientUrl}`);
    console.log('==================================================');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ FATAL ERROR: Port ${PORT} is already in use by another process.`);
    } else {
      console.error('❌ Server startup error:', error.message);
    }
  });

  // Verify DB connection & seed admin accounts asynchronously after server opens port
  try {
    await prisma.$queryRaw`SELECT 1 + 1 AS result`;
    console.log('✔ Prisma Database Engine connected successfully.');
    await ensureDefaultAdmins();
  } catch (error) {
    console.warn('⚠️ Database initialization warning:', error.message);
  }
}

startServer();
