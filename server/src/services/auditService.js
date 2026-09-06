const prisma = require('../config/prismaClient');

/**
 * Record audit log entry using Prisma
 * @param {Object} params
 * @param {number|null} params.adminId
 * @param {string} params.action
 * @param {string} params.ipAddress
 * @param {string} params.userAgent
 * @param {Object|null} params.metadata
 * @param {Object|null} txClient Optional transaction client
 */
const logAudit = async (
  { adminId = null, action, ipAddress = null, userAgent = null, metadata = null },
  txClient = null
) => {
  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const client = txClient || prisma;

    await client.audit_logs.create({
      data: {
        admin_id: adminId ? Number(adminId) : null,
        action,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata_json: metadataJson,
      },
    });
  } catch (error) {
    console.error('Audit Log Error:', error.message);
    // Audit log failure should not throw to prevent breaking main application flows
  }
};

module.exports = {
  logAudit,
};
