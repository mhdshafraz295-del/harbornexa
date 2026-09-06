const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const secret = crypto.randomBytes(64).toString('hex');
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('JWT_SECRET=')) {
    envContent = envContent.replace(/JWT_SECRET=.*/g, `JWT_SECRET=${secret}`);
  } else {
    envContent += `\nJWT_SECRET=${secret}`;
  }

  if (envContent.includes('JWT_EXPIRES_IN=')) {
    envContent = envContent.replace(/JWT_EXPIRES_IN=.*/g, `JWT_EXPIRES_IN=8h`);
  } else {
    envContent += `\nJWT_EXPIRES_IN=8h`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✔ Generated 128-character cryptographically strong JWT_SECRET and updated server/.env');
} else {
  console.error('❌ server/.env file does not exist.');
  process.exit(1);
}
