const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prismaClient');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const PORT = env.port;

/**
 * Ensures required system admin accounts are created & active on server startup
 */
async function ensureDefaultAdmins() {
  try {
    const adminEmail = 'alsafafisheriesorg@gmail.com';
    const adminName = 'assafa';
    const rawPass = 'Al_Safa_202609';

    const existing = await prisma.admins.findUnique({
      where: { email: adminEmail },
    });

    const passwordHash = await bcrypt.hash(rawPass, 12);

    if (!existing) {
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
    } else {
      await prisma.admins.update({
        where: { email: adminEmail },
        data: {
          name: adminName,
          password_hash: passwordHash,
          status: 'ACTIVE',
        },
      });
      console.log(`✔ Admin account "${adminEmail}" (${adminName}) updated/verified.`);
    }
  } catch (err) {
    console.warn('Notice: Could not auto-seed admin account:', err.message);
  }
}

async function startServer() {
  try {
    // Verify DB Connection via Prisma Engine
    await prisma.$queryRaw`SELECT 1 + 1 AS result`;
    console.log('✔ Prisma Database Engine connected successfully.');

    // Ensure assafa admin account is created and active
    await ensureDefaultAdmins();

    const server = app.listen(PORT, () => {
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
        console.error(`Please close the process listening on port ${PORT} or update PORT in server/.env.\n`);
      } else {
        console.error('❌ Server startup error:', error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to Database connection error:');
    console.error(error.message);
    console.error('Please ensure MySQL service is running on port 3306 and database migration has been run.');
    process.exit(1);
  }
}

startServer();
