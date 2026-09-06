const crypto = require('crypto');
const prisma = require('../config/prismaClient');
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
 * Helper to check if string is numeric ID
 */
function parseBigIntId(val) {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    try {
      return BigInt(str);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * POST /api/qr/fishers/:fisherId/generate
 * Generate or reissue a secure opaque QR token for a Fisher
 */
const generateQrToken = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const numericId = parseBigIntId(fisherId);

    const result = await prisma.$transaction(async (tx) => {
      // Lock Fisher row FOR UPDATE using raw query for atomicity
      let fishers;
      if (numericId !== null) {
        fishers = await tx.$queryRaw`
          SELECT id, fisher_id, full_name, boat_no, status, is_archived 
          FROM fishers 
          WHERE id = ${numericId} OR fisher_id = ${String(fisherId)} 
          FOR UPDATE
        `;
      } else {
        fishers = await tx.$queryRaw`
          SELECT id, fisher_id, full_name, boat_no, status, is_archived 
          FROM fishers 
          WHERE fisher_id = ${String(fisherId)} 
          FOR UPDATE
        `;
      }

      if (!fishers || fishers.length === 0) {
        return { errorStatus: 404, errorMessage: 'Fisher record not found.' };
      }
      const fisher = fishers[0];

      if (fisher.is_archived) {
        return { errorStatus: 400, errorMessage: 'Cannot generate QR for an archived fisher record.' };
      }

      const fisherDbId = BigInt(fisher.id);

      // Lock existing active tokens FOR UPDATE
      const activeTokens = await tx.$queryRaw`
        SELECT id FROM fisher_qr_tokens WHERE fisher_id = ${fisherDbId} AND is_active = TRUE FOR UPDATE
      `;
      const isReissue = activeTokens && activeTokens.length > 0;

      const adminId = req.admin?.id || 1;

      // Revoke any active token
      if (isReissue) {
        await tx.fisher_qr_tokens.updateMany({
          where: {
            fisher_id: fisherDbId,
            is_active: true,
          },
          data: {
            is_active: false,
            revoked_at: new Date(),
            revoked_by_admin_id: adminId,
          },
        });
      }

      // Generate new secure raw token & hash
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);

      const newRecord = await tx.fisher_qr_tokens.create({
        data: {
          fisher_id: fisherDbId,
          token_hash: tokenHash,
          is_active: true,
          issued_at: new Date(),
          created_by_admin_id: adminId,
        },
      });

      return {
        isReissue,
        rawToken,
        newTokenRecordId: Number(newRecord.id),
        fisher: {
          id: Number(fisher.id),
          fisher_id: fisher.fisher_id,
          full_name: fisher.full_name,
          boat_no: fisher.boat_no,
        },
      };
    });

    if (result.errorStatus) {
      return res.status(result.errorStatus).json({ success: false, message: result.errorMessage });
    }

    // Log Audit (NEVER log rawToken!)
    await logAudit({
      adminId: req.admin?.id || null,
      action: result.isReissue ? 'FISHER_QR_REISSUED' : 'FISHER_QR_ISSUED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: result.fisher.id,
        customFisherId: result.fisher.fisher_id,
        qrTokenRecordId: result.newTokenRecordId,
      },
    });

    return res.status(200).json({
      success: true,
      message: result.isReissue ? 'Fisher QR token reissued successfully.' : 'Fisher QR token generated successfully.',
      rawToken: result.rawToken, // Provided ONCE to client to render QR image
      fisher: result.fisher,
    });
  } catch (error) {
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
    const numericId = parseBigIntId(fisherId);

    const whereClause = {
      OR: [
        ...(numericId !== null ? [{ id: numericId }] : []),
        { fisher_id: String(fisherId) },
      ],
    };

    const fisher = await prisma.fishers.findFirst({
      where: whereClause,
      select: {
        id: true,
        fisher_id: true,
        full_name: true,
        boat_no: true,
        status: true,
        is_archived: true,
      },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    const activeToken = await prisma.fisher_qr_tokens.findFirst({
      where: {
        fisher_id: fisher.id,
        is_active: true,
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        issued_at: true,
        created_at: true,
      },
    });

    const isIssued = Boolean(activeToken);

    return res.status(200).json({
      success: true,
      isIssued,
      activeToken: isIssued
        ? {
            id: Number(activeToken.id),
            issued_at: activeToken.issued_at,
            created_at: activeToken.created_at,
          }
        : null,
      fisher: {
        id: Number(fisher.id),
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
    const numericId = parseBigIntId(fisherId);

    const whereClause = {
      OR: [
        ...(numericId !== null ? [{ id: numericId }] : []),
        { fisher_id: String(fisherId) },
      ],
    };

    const fisher = await prisma.fishers.findFirst({
      where: whereClause,
      select: { id: true, fisher_id: true },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    const activeToken = await prisma.fisher_qr_tokens.findFirst({
      where: {
        fisher_id: fisher.id,
        is_active: true,
      },
      select: { id: true },
    });

    if (!activeToken) {
      return res.status(400).json({ success: false, message: 'Fisher has no active QR token to revoke.' });
    }

    const adminId = req.admin?.id || 1;

    await prisma.fisher_qr_tokens.updateMany({
      where: {
        fisher_id: fisher.id,
        is_active: true,
      },
      data: {
        is_active: false,
        revoked_at: new Date(),
        revoked_by_admin_id: adminId,
      },
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_QR_REVOKED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: Number(fisher.id),
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

    // Query token record with Fisher details via Prisma relation
    const qrRecord = await prisma.fisher_qr_tokens.findUnique({
      where: { token_hash: tokenHash },
      include: {
        fishers: true,
      },
    });

    if (!qrRecord || !qrRecord.fishers) {
      return res.status(404).json({ success: false, message: 'Invalid Fisher QR.' });
    }

    // Check if token is revoked or inactive
    if (!qrRecord.is_active || qrRecord.revoked_at) {
      return res.status(400).json({
        success: false,
        message: 'This Fisher QR is no longer active.',
      });
    }

    const fisher = qrRecord.fishers;

    // Check if Fisher is archived
    if (fisher.is_archived) {
      return res.status(400).json({
        success: false,
        message: 'Fisher record is archived.',
      });
    }

    const fisherDbId = Number(fisher.id);

    // Retrieve real-time financial summary & effective clearance status
    const summary = await getFisherFinancialSummary(fisherDbId);
    const clearance = await getFisherClearanceStatus(fisherDbId);

    // Audit log (Never log raw token!)
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_QR_VERIFIED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        fisherId: fisherDbId,
        customFisherId: fisher.fisher_id,
        effectiveStatus: clearance.status,
      },
    });

    return res.status(200).json({
      success: true,
      fisher: {
        id: fisherDbId,
        fisher_id: fisher.fisher_id,
        full_name: fisher.full_name,
        nic: fisher.nic,
        phone: fisher.phone,
        boat_no: fisher.boat_no,
        base_status: fisher.status,
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
