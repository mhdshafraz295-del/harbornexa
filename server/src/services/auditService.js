const db = require('../config/db');

/**
 * Record audit log entry
 * @param {Object} params
 * @param {number|null} params.adminId
 * @param {string} params.action
 * @param {string} params.ipAddress
 * @param {string} params.userAgent
 * @param {Object|null} params.metadata
 */
const logAudit = async ({ adminId = null, action, ipAddress = null, userAgent = null, metadata = null }) => {
  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, ip_address, user_agent, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, action, ipAddress, userAgent, metadataJson]
    );
  } catch (error) {
    console.error('Audit Log Error:', error.message);
    // Audit log failure should not throw to prevent breaking main auth flow
  }
};

module.exports = {
  logAudit,
};
