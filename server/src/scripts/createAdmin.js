const prisma = require('../config/prismaClient');
const bcrypt = require('bcrypt');
const readline = require('readline');
const env = require('../config/env');

function getArg(flag) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split('=')[1] : null;
}

function askQuestion(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function createAdmin() {
  console.log('==================================================');
  console.log('VALACHCHENAI HARBOR - SECURE ADMIN BOOTSTRAP TOOL');
  console.log('==================================================');

  let name = getArg('name');
  let email = getArg('email');
  let password = getArg('password');

  if (!name || !email || !password) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (!name) {
      name = await askQuestion(rl, 'Enter Admin Full Name: ');
    }
    if (!email) {
      email = await askQuestion(rl, 'Enter Admin Email Address: ');
    }
    if (!password) {
      password = await askQuestion(rl, 'Enter Admin Password (min 8 chars): ');
    }

    rl.close();
  }

  if (!name || !email || !password) {
    console.error('❌ Error: Name, Email, and Password are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('❌ Error: Invalid email format.');
    process.exit(1);
  }

  try {
    // Check if email exists
    const existing = await prisma.admins.findUnique({ where: { email } });
    if (existing) {
      console.error(`❌ Error: An admin with email "${email}" already exists.`);
      process.exit(1);
    }

    // Hash password with bcrypt salt rounds 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert admin record securely
    const admin = await prisma.admins.create({
      data: {
        name,
        email,
        password_hash: passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log('--------------------------------------------------');
    console.log(`✔ Admin created successfully!`);
    console.log(`  Admin ID : ${admin.id}`);
    console.log(`  Name     : ${name}`);
    console.log(`  Email    : ${email}`);
    console.log(`  Role     : ${admin.role}`);
    console.log(`  Status   : ${admin.status}`);
    console.log('--------------------------------------------------');
    console.log('NOTE: Password has been securely hashed. Plaintext is never stored or displayed.');
  } catch (error) {
    console.error('❌ Failed to create admin:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
