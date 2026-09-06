const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prismaClient');

const PORT = env.port;

async function startServer() {
  try {
    // Verify DB Connection via Prisma Engine
    await prisma.$queryRaw`SELECT 1 + 1 AS result`;
    console.log('✔ Prisma Database Engine connected successfully.');

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
