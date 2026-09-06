const Decimal = require('decimal.js');
const db = require('../config/db');
const { getFisherClearanceStatus, getFisherFinancialSummary } = require('../services/financialService');
const { logAudit } = require('../services/auditService');

/**
 * Returns YYYY-MM-DD string for current Asia/Colombo day
 */
function getColomboTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

/**
 * GET /api/clearance/fishers/:fisherId
 * Get Fisher clearance panel details including derived status, hold reasons, financial summary, and last clearance
 */
const getFisherClearance = async (req, res, next) => {
  try {
    const { fisherId } = req.params;

    const [fishers] = await db.query(
      'SELECT id, fisher_id, full_name, nic, phone, boat_no, status, is_archived FROM fishers WHERE id = ? OR fisher_id = ?',
      [fisherId, fisherId]
    );

    if (fishers.length === 0) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }
    const fisher = fishers[0];

    const clearanceStatus = await getFisherClearanceStatus(fisher.id);
    const financialSummary = await getFisherFinancialSummary(fisher.id);

    // Get last clearance record
    const [lastClearances] = await db.query(
      `SELECT c.*, a.name as granted_by_admin_name
       FROM clearance_records c
       LEFT JOIN admins a ON c.granted_by_admin_id = a.id
       WHERE c.fisher_id = ?
       ORDER BY c.granted_at DESC
       LIMIT 1`,
      [fisher.id]
    );
    const lastClearance = lastClearances.length > 0 ? lastClearances[0] : null;

    return res.status(200).json({
      success: true,
      fisher,
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
  let connection;
  try {
    const { fisherId } = req.params;
    const { idempotencyKey, notes } = req.body;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ success: false, message: 'Idempotency key is required.' });
    }
    const key = idempotencyKey.trim();

    // 1. Pre-flight Idempotency Check
    const [existingKeyRows] = await db.query(
      `SELECT c.*, a.name as granted_by_admin_name, f.fisher_id as custom_fisher_id, f.full_name
       FROM clearance_records c
       JOIN fishers f ON c.fisher_id = f.id
       LEFT JOIN admins a ON c.granted_by_admin_id = a.id
       WHERE c.idempotency_key = ?`,
      [key]
    );

    if (existingKeyRows.length > 0) {
      const existing = existingKeyRows[0];
      // Check if target fisher matches
      const [targetFisher] = await db.query(
        'SELECT id FROM fishers WHERE id = ? OR fisher_id = ?',
        [fisherId, fisherId]
      );
      const targetId = targetFisher.length > 0 ? targetFisher[0].id : null;

      if (targetId && String(existing.fisher_id) === String(targetId)) {
        return res.status(200).json({
          success: true,
          message: 'Clearance already granted.',
          clearance: existing,
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another clearance.',
      });
    }

    // 2. Transaction Safety: Acquire Connection & Begin Transaction
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
      return res.status(400).json({ success: false, message: 'Archived fishers cannot be granted clearance.' });
    }

    // Recalculate effective clearance status using SAME transaction connection
    const currentStatus = await getFisherClearanceStatus(fisher.id, connection);

    if (currentStatus.status !== 'CLEARED') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Fisher cannot be granted clearance due to active hold or pending status.',
        clearanceStatus: currentStatus,
      });
    }

    // Lock CLEARANCE sequence row FOR UPDATE
    const [seqRows] = await connection.query(
      "SELECT next_value FROM system_sequences WHERE sequence_name = 'CLEARANCE' FOR UPDATE"
    );

    let nextValue = 1;
    if (seqRows.length > 0) {
      nextValue = parseInt(seqRows[0].next_value, 10);
    } else {
      await connection.query("INSERT INTO system_sequences (sequence_name, next_value) VALUES ('CLEARANCE', 1)");
    }

    const clearanceNo = `CLR-${String(nextValue).padStart(6, '0')}`;

    // Increment sequence
    await connection.query(
      "UPDATE system_sequences SET next_value = next_value + 1 WHERE sequence_name = 'CLEARANCE'"
    );

    // Insert into clearance_records
    const adminId = req.admin?.id || 1;
    const [insertRes] = await connection.query(
      `INSERT INTO clearance_records 
       (clearance_no, fisher_id, boat_no_snapshot, base_status_snapshot, outstanding_debt_snapshot, clearance_status, notes, idempotency_key, granted_by_admin_id)
       VALUES (?, ?, ?, ?, ?, 'CLEARED', ?, ?, ?)`,
      [
        clearanceNo,
        fisher.id,
        fisher.boat_no || null,
        fisher.status,
        currentStatus.outstandingDebt,
        notes ? notes.trim() : null,
        key,
        adminId,
      ]
    );

    const newClearanceId = insertRes.insertId;

    await connection.commit();
    connection.release();
    connection = null;

    // Log Audit
    await logAudit({
      adminId,
      action: 'CLEARANCE_GRANTED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        clearanceId: newClearanceId,
        clearanceNo,
        fisherId: fisher.id,
        customFisherId: fisher.fisher_id,
        boatNoSnapshot: fisher.boat_no,
      },
    });

    const [createdRows] = await db.query(
      `SELECT c.*, a.name as granted_by_admin_name, f.fisher_id as custom_fisher_id, f.full_name
       FROM clearance_records c
       JOIN fishers f ON c.fisher_id = f.id
       LEFT JOIN admins a ON c.granted_by_admin_id = a.id
       WHERE c.id = ?`,
      [newClearanceId]
    );

    return res.status(201).json({
      success: true,
      message: 'Clearance granted successfully.',
      clearance: createdRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    // Handle concurrent ER_DUP_ENTRY for idempotency_key safely
    if (error.code === 'ER_DUP_ENTRY') {
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
    const colomboTodayDate = getColomboTodayDateString(); // e.g. "2026-09-06"

    // Query clearances granted during current Asia/Colombo business day
    const [rows] = await db.query(
      `SELECT c.*, f.fisher_id as custom_fisher_id, f.full_name, f.phone, a.name as granted_by_admin_name
       FROM clearance_records c
       JOIN fishers f ON c.fisher_id = f.id
       LEFT JOIN admins a ON c.granted_by_admin_id = a.id
       WHERE DATE(c.granted_at) = ? OR DATE(CONVERT_TZ(c.granted_at, '+00:00', '+05:30')) = ?
       ORDER BY c.granted_at DESC`,
      [colomboTodayDate, colomboTodayDate]
    );

    const clearances = rows.map((c) => ({
      ...c,
      outstanding_debt_snapshot: new Decimal(c.outstanding_debt_snapshot || 0).toFixed(2),
    }));

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

    const [fishers] = await db.query('SELECT id FROM fishers WHERE id = ? OR fisher_id = ?', [fisherId, fisherId]);
    if (fishers.length === 0) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }
    const realFisherId = fishers[0].id;

    const [rows] = await db.query(
      `SELECT c.*, a.name as granted_by_admin_name
       FROM clearance_records c
       LEFT JOIN admins a ON c.granted_by_admin_id = a.id
       WHERE c.fisher_id = ?
       ORDER BY c.granted_at DESC`,
      [realFisherId]
    );

    const history = rows.map((c) => ({
      ...c,
      outstanding_debt_snapshot: new Decimal(c.outstanding_debt_snapshot || 0).toFixed(2),
    }));

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
