const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

let r2Client = null;

try {
  const endpoint = env.r2.endpoint && env.r2.endpoint.startsWith('http')
    ? env.r2.endpoint
    : (env.r2.accountId ? `https://${env.r2.accountId}.r2.cloudflarestorage.com` : null);

  if (endpoint && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.accessKeyId !== 'your_r2_access_key_id') {
    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
} catch (error) {
  console.warn('⚠️ Cloudflare R2 Client initialization skipped for Phase 1 foundation:', error.message);
}

module.exports = {
  r2Client,
  bucketName: env.r2.bucketName,
};
