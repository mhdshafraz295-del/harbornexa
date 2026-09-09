const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const jwtSecret = process.env.JWT_SECRET;

// Enforce strict startup check for JWT_SECRET
if (!jwtSecret || jwtSecret.trim() === '' || jwtSecret === 'your_secure_jwt_secret_here') {
  console.error('\n================================================================');
  console.error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing, empty, or using insecure placeholder!');
  console.error('Please configure a secure JWT_SECRET in server/.env file before starting the server.');
  console.error('================================================================\n');
  throw new Error('JWT_SECRET configuration missing or insecure. Aborting server startup.');
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'valachchenai_harbor',
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'valachchenai-harbor-docs',
    endpoint: process.env.R2_ENDPOINT || '',
  },
  email: {
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '993', 10),
    user: process.env.EMAIL_USER || 'sfn1825@gmail.com',
    pass: process.env.EMAIL_PASS || 'cgilraqbmuqfrokc',
    secure: process.env.EMAIL_SECURE !== 'false', // true by default (TLS port 993)
  },
};
