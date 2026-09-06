const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');
const { Prisma } = require('@prisma/client');
const { getFisherClearanceStatus, getFisherFinancialSummary } = require('../services/financialService');
const { logAudit } = require('../services/auditService');

/**
 * Returns YYYY-MM-DD string for current Asia/Colombo day
 */
function getColomboTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

/**
 * Helper to map clearance_records BigInt fields to Numbers and Decimal snapshots to Strings
 */
function mapClearanceRecord(c) {
  if (!c) return null;
  return {
    id: Number(c.id),
    clearance_no: c.clearance_no,
    fisher_id: Number(c.fisher_id),
    boat_no_snapshot: c.boat_no_snapshot,
    base_status_snapshot: c.base_status_snapshot,
    outstanding_debt_snapshot: c.outstanding_debt_snapshot
      ? new Decimal(c.outstanding_debt_snapshot.toString()).toFixed(2)
      : '0.00',
    clearance_status: c.clearance_status,
    notes: c.notes,
    idempotency_key: c.idempotency_key,
    granted_by_admin_id: Number(c.granted_by_admin_id),
    granted_at: c.granted_at,
    created_at: c.created_at,
    granted_by_admin_name: c.admins?.name || c.granted_by_admin_name || null,
    custom_fisher_id: c.fishers?.fisher_id || c.custom_fisher_id || null,
    full_name: c.fishers?.full_name || c.full_name || null,
  };
}

/**
 * GET /api/clearance/fishers/:fisherId
 * Get Fisher clearance panel details including derived status, hold reasons, financial summary, and last clearance
 */
const getFisherClearance = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const isNumeric = !isNaN(Number(fisherId));
    const fisherWhere = isNumeric
      ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
      : { fisher_id: String(fisherId) };

    const fisher = await prisma.fishers.findFirst({
      where: fisherWhere,
      select: {
        id: true,
        fisher_id: true,
        full_name: true,
        nic: true,
        phone: true,
        boat_no: true,
        status: true,
        is_archived: true,
      },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    const clearanceStatus = await getFisherClearanceStatus(fisher.id);
    const financialSummary = await getFisherFinancialSummary(fisher.id);

    const lastClearanceRaw = await prisma.clearance_records.findFirst({
      where: { fisher_id: fisher.id },
      include: {
        admins: { select: { name: true } },
      },
      orderBy: { granted_at: 'desc' },
    });

    const lastClearance = lastClearanceRaw ? mapClearanceRecord(lastClearanceRaw) : null;

    return res.status(200).json({
      success: true,
      fisher: {
        ...fisher,
        id: Number(fisher.id),
      },
      clearanceStatus,
      financialSummary,
      lastClearance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/clearance/fishers/:fisherId/grant
 * Atomic Grant Clearance transaction with FOR UPDATE row-level locking & idempotency
 */
const grantClearance = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const { idempotencyKey, notes } = req.body;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ success: false, message: 'Idempotency key is required.' });
    }
    const key = idempotencyKey.trim();

    const isNumeric = !isNaN(Number(fisherId));
    const fisherWhere = isNumeric
      ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
      : { fisher_id: String(fisherId) };

    const targetFisher = await prisma.fishers.findFirst({
      where: fisherWhere,
      select: { id: true },
    });

    // 1. Pre-flight Idempotency Check
    const existingRecord = await prisma.clearance_records.findUnique({
      where: { idempotency_key: key },
      include: {
        admins: { select: { name: true } },
        fishers: { select: { fisher_id: true, full_name: true } },
      },
    });

    if (existingRecord) {
      if (targetFisher && existingRecord.fisher_id === targetFisher.id) {
        return res.status(200).json({
          success: true,
          message: 'Clearance already granted.',
          clearance: mapClearanceRecord(existingRecord),
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another clearance.',
      });
    }

    if (!targetFisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    // 2. Transaction Safety: Atomic Transaction with FOR UPDATE Row Locking
    const result = await prisma.$transaction(async (tx) => {
      // Lock Fisher row FOR UPDATE
      const fishers = await tx.$queryRaw`SELECT id, fisher_id, full_name, boat_no, status, is_archived FROM fishers WHERE id = ${targetFisher.id} FOR UPDATE`;
      if (!fishers || fishers.length === 0) {
        const err = new Error('Fisher record not found.');
        err.statusCode = 404;
        throw err;
      }
      const fisher = fishers[0];

      if (fisher.is_archived) {
        const err = new Error('Archived fishers cannot be granted clearance.');
        err.statusCode = 400;
        throw err;
      }

      // Recalculate effective clearance status INSIDE SAME TRANSACTION
      const currentStatus = await getFisherClearanceStatus(fisher.id, tx);

      if (currentStatus.status !== 'CLEARED') {
        const err = new Error('Fisher cannot be granted clearance due to active hold or pending status.');
        err.statusCode = 400;
        err.clearanceStatus = currentStatus;
        throw err;
      }

      // Lock CLEARANCE sequence row FOR UPDATE
      const seqRows = await tx.$queryRaw`SELECT next_value FROM system_sequences WHERE sequence_name = 'CLEARANCE' FOR UPDATE`;
      let nextValue = 1;

      if (seqRows && seqRows.length > 0) {
        nextValue = Number(seqRows[0].next_value);
        await tx.$queryRaw`UPDATE system_sequences SET next_value = next_value + 1 WHERE sequence_name = 'CLEARANCE'`;
      } else {
        await tx.$queryRaw`INSERT INTO system_sequences (sequence_name, next_value) VALUES ('CLEARANCE', 2)`;
      }

      const clearanceNo = `CLR-${String(nextValue).padStart(6, '0')}`;
      const adminId = req.admin?.id || 1;

      const createdRecord = await tx.clearance_records.create({
        data: {
          clearance_no: clearanceNo,
          fisher_id: fisher.id,
          boat_no_snapshot: fisher.boat_no || null,
          base_status_snapshot: fisher.status,
          outstanding_debt_snapshot: new Prisma.Decimal(currentStatus.outstandingDebt),
          clearance_status: 'CLEARED',
          notes: notes ? notes.trim() : null,
          idempotency_key: key,
          granted_by_admin_id: adminId,
        },
        include: {
          admins: { select: { name: true } },
          fishers: { select: { fisher_id: true, full_name: true } },
        },
      });

      return { createdRecord, clearanceNo, fisher, adminId };
    });

    // 3. Log Audit
    await logAudit({
      adminId: result.adminId,
      action: 'CLEARANCE_GRANTED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        clearanceId: Number(result.createdRecord.id),
        clearanceNo: result.clearanceNo,
        fisherId: Number(result.fisher.id),
        customFisherId: result.fisher.fisher_id,
        boatNoSnapshot: result.fisher.boat_no,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Clearance granted successfully.',
      clearance: mapClearanceRecord(result.createdRecord),
    });
  } catch (error) {
    if (error.statusCode) {
      const response = { success: false, message: error.message };
      if (error.clearanceStatus) {
        response.clearanceStatus = error.clearanceStatus;
      }
      return res.status(error.statusCode).json(response);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another clearance.',
      });
    }

    next(error);
  }
};

/**
 * GET /api/clearance/today
 * Query today's granted clearances using Asia/Colombo date boundaries
 */
const getTodayClearances = async (req, res, next) => {
  try {
    const colomboTodayDate = getColomboTodayDateString();

    const rawClearances = await prisma.$queryRaw`
      SELECT c.*, f.fisher_id as custom_fisher_id, f.full_name, f.phone, a.name as granted_by_admin_name
      FROM clearance_records c
      JOIN fishers f ON c.fisher_id = f.id
      LEFT JOIN admins a ON c.granted_by_admin_id = a.id
      WHERE DATE(c.granted_at) = ${colomboTodayDate} OR DATE(CONVERT_TZ(c.granted_at, '+00:00', '+05:30')) = ${colomboTodayDate}
      ORDER BY c.granted_at DESC
    `;

    const clearances = rawClearances.map((c) => mapClearanceRecord(c));

    return res.status(200).json({
      success: true,
      todayDate: colomboTodayDate,
      count: clearances.length,
      clearances,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clearance/fishers/:fisherId/history
 * Query complete permanent clearance history for a Fisher
 */
const getFisherClearanceHistory = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const isNumeric = !isNaN(Number(fisherId));
    const fisherWhere = isNumeric
      ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
      : { fisher_id: String(fisherId) };

    const fisher = await prisma.fishers.findFirst({
      where: fisherWhere,
      select: { id: true },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    const rawRecords = await prisma.clearance_records.findMany({
      where: { fisher_id: fisher.id },
      include: {
        admins: { select: { name: true } },
      },
      orderBy: { granted_at: 'desc' },
    });

    const history = rawRecords.map((c) => mapClearanceRecord(c));

    return res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFisherClearance,
  grantClearance,
  getTodayClearances,
  getFisherClearanceHistory,
};
