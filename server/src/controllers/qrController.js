const crypto = require('crypto');
const db = require('../config/db');
const { logAudit } = require('../services/auditService');
const { getFisherClearanceStatus, getFisherFinancialSummary } = require('../services/financialService');

/**
 * Hash raw token using SHA-256 for secure storage/comparison
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken).trim()).digest('hex');
}

/**
 * Generate cryptographically secure 32-byte opaque QR token
 */
function generateRawToken() {
  return 'vh_f_' + crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/qr/fishers/:fisherId/generate
 * Generate or reissue a secure opaque QR token for a Fisher
 */
const generateQrToken = async (req, res, next) => {
  let connection;
  try {
    const { fisherId } = req.params;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock Fisher row FOR UPDATE
    const [fishers] = await connection.query(
      'SELECT id, fisher_id, full_name, boat_no, status, is_archived FROM fishers WHERE id = ? OR fisher_id = ? FOR UPDATE',
      [fisherId, fisherId]
    );

    if (fishers.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }
    const fisher = fishers[0];

    if (fisher.is_archived) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Cannot generate QR for an archived fisher record.',
      });
    }

    // Check existing active token count
    const [activeTokens] = await connection.query(
      'SELECT id FROM fisher_qr_tokens WHERE fisher_id = ? AND is_active = TRUE FOR UPDATE',
      [fisher.id]
    );
    const isReissue = activeTokens.length > 0;

    // Revoke any active token
    if (isReissue) {
      await connection.query(
        `UPDATE fisher_qr_tokens 
         SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, revoked_by_admin_id = ?
         WHERE fisher_id = ? AND is_active = TRUE`,
        [req.admin?.id || 1, fisher.id]
      );
    }

    // Generate new secure raw token & hash
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    const [insertRes] = await connection.query(
      `INSERT INTO fisher_qr_tokens (fisher_id, token_hash, is_active, issued_at, created_by_admin_id)
       VALUES (?, ?, TRUE, CURRENT_TIMESTAMP, ?)`,
      [fisher.id, tokenHash, req.admin?.id || 1]
    );

    const newTokenRecordId = insertRes.insertId;

    await connection.commit();
    connection.release();
    connection = null;

    // Log Audit (NEVER log rawToken!)
    await logAudit({
      adminId: req.admin?.id || null,
      action: isReissue ? 'FISHER_QR_REISSUED' : 'FISHER_QR_ISSUED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: fisher.id,
        customFisherId: fisher.fisher_id,
        qrTokenRecordId: newTokenRecordId,
      },
    });

    return res.status(200).json({
      success: true,
      message: isReissue ? 'Fisher QR token reissued successfully.' : 'Fisher QR token generated successfully.',
      rawToken, // Provided ONCE to client to render QR image
      fisher: {
        id: fisher.id,
        fisher_id: fisher.fisher_id,
        full_name: fisher.full_name,
        boat_no: fisher.boat_no,
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    next(error);
  }
};

/**
 * GET /api/qr/fishers/:fisherId/status
 * Get current active QR status for a Fisher
 */
const getQrStatus = async (req, res, next) => {
  try {
    const { fisherId } = req.params;

    const [fishers] = await db.query(
      'SELECT id, fisher_id, full_name, boat_no, status, is_archived FROM fishers WHERE id = ? OR fisher_id = ?',
      [fisherId, fisherId]
    );

    if (fishers.length === 0) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }
    const fisher = fishers[0];

    const [activeTokens] = await db.query(
      `SELECT id, issued_at, created_at
       FROM fisher_qr_tokens
       WHERE fisher_id = ? AND is_active = TRUE
       ORDER BY id DESC LIMIT 1`,
      [fisher.id]
    );

    const isIssued = activeTokens.length > 0;

    return res.status(200).json({
      success: true,
      isIssued,
      activeToken: isIssued ? activeTokens[0] : null,
      fisher: {
        id: fisher.id,
        fisher_id: fisher.fisher_id,
        full_name: fisher.full_name,
        boat_no: fisher.boat_no,
        is_archived: fisher.is_archived,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/qr/fishers/:fisherId/revoke
 * Revoke active QR token for a Fisher
 */
const revokeQrToken = async (req, res, next) => {
  try {
    const { fisherId } = req.params;

    const [fishers] = await db.query('SELECT id, fisher_id FROM fishers WHERE id = ? OR fisher_id = ?', [
      fisherId,
      fisherId,
    ]);

    if (fishers.length === 0) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }
    const fisher = fishers[0];

    const [activeTokens] = await db.query(
      'SELECT id FROM fisher_qr_tokens WHERE fisher_id = ? AND is_active = TRUE',
      [fisher.id]
    );

    if (activeTokens.length === 0) {
      return res.status(400).json({ success: false, message: 'Fisher has no active QR token to revoke.' });
    }

    await db.query(
      `UPDATE fisher_qr_tokens
       SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, revoked_by_admin_id = ?
       WHERE fisher_id = ? AND is_active = TRUE`,
      [req.admin?.id || 1, fisher.id]
    );

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_QR_REVOKED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: fisher.id,
        customFisherId: fisher.fisher_id,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Fisher QR token revoked successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/qr/verify
 * Verify scanned opaque QR token and return real-time Fisher clearance status
 */
const verifyQrToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Fisher QR.' });
    }

    const trimmedToken = token.trim();
    if (!trimmedToken.startsWith('vh_f_') || trimmedToken.length < 15 || trimmedToken.length > 128) {
      return res.status(400).json({ success: false, message: 'Invalid Fisher QR.' });
    }

    const tokenHash = hashToken(trimmedToken);

    // Query token record with Fisher details
    const [rows] = await db.query(
      `SELECT 
         t.id as token_id, t.is_active, t.revoked_at, t.issued_at,
         f.id as fisher_id, f.fisher_id as custom_fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.status as base_status, f.is_archived
       FROM fisher_qr_tokens t
       JOIN fishers f ON t.fisher_id = f.id
       WHERE t.token_hash = ?`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid Fisher QR.' });
    }

    const qrRecord = rows[0];

    // Check if token is revoked or inactive
    if (!qrRecord.is_active || qrRecord.revoked_at) {
      return res.status(400).json({
        success: false,
        message: 'This Fisher QR is no longer active.',
      });
    }

    // Check if Fisher is archived
    if (qrRecord.is_archived) {
      return res.status(400).json({
        success: false,
        message: 'Fisher record is archived.',
      });
    }

    // Retrieve real-time financial summary & effective clearance status
    const summary = await getFisherFinancialSummary(qrRecord.fisher_id);
    const clearance = await getFisherClearanceStatus(qrRecord.fisher_id);

    // Audit log (Never log raw token!)
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_QR_VERIFIED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: qrRecord.fisher_id,
        customFisherId: qrRecord.custom_fisher_id,
        effectiveStatus: clearance.status,
      },
    });

    return res.status(200).json({
      success: true,
      fisher: {
        id: qrRecord.fisher_id,
        fisher_id: qrRecord.custom_fisher_id,
        full_name: qrRecord.full_name,
        nic: qrRecord.nic,
        phone: qrRecord.phone,
        boat_no: qrRecord.boat_no,
        base_status: qrRecord.base_status,
      },
      financialSummary: summary,
      clearanceStatus: clearance,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateQrToken,
  getQrStatus,
  revokeQrToken,
  verifyQrToken,
};
