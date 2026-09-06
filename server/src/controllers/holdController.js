const db = require('../config/db');
const { logAudit } = require('../services/auditService');

/**
 * POST /api/fishers/:fisherId/holds
 * Create a new manual hold for a Fisher (DOES NOT MUTATE fishers.status)
 */
const createHold = async (req, res, next) => {
  let connection;
  try {
    const { fisherId } = req.params;
    const { reasonCode, reasonText, notes } = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock Fisher row FOR UPDATE to prevent race conditions with Grant Clearance
    const [fishers] = await connection.query(
      'SELECT id, fisher_id, full_name, status, is_archived FROM fishers WHERE id = ? OR fisher_id = ? FOR UPDATE',
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
        message: 'Cannot place a manual hold on an archived fisher record.',
      });
    }

    // Validate reason_code
    const validReasons = ['PAYMENT_ISSUE', 'DOCUMENT_ISSUE', 'MANAGEMENT_DECISION', 'OTHER'];
    if (!reasonCode || !validReasons.includes(reasonCode.toUpperCase())) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Valid reason code is required (PAYMENT_ISSUE, DOCUMENT_ISSUE, MANAGEMENT_DECISION, OTHER).',
      });
    }
    const code = reasonCode.toUpperCase();

    if (code === 'OTHER' && (!reasonText || !reasonText.trim())) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Reason text is required when selecting OTHER.',
      });
    }

    // Insert into fisher_holds WITHOUT mutating fishers.status
    const [insertRes] = await connection.query(
      `INSERT INTO fisher_holds (fisher_id, reason_code, reason_text, notes, hold_date, created_by_admin_id)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        fisher.id,
        code,
        reasonText ? reasonText.trim() : null,
        notes ? notes.trim() : null,
        req.admin?.id || 1,
      ]
    );

    const holdId = insertRes.insertId;

    await connection.commit();
    connection.release();
    connection = null;

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'MANUAL_HOLD_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        holdId,
        fisherId: fisher.id,
        customFisherId: fisher.fisher_id,
        reasonCode: code,
        reasonText: reasonText ? reasonText.trim() : null,
      },
    });

    const [createdRows] = await db.query('SELECT * FROM fisher_holds WHERE id = ?', [holdId]);

    return res.status(201).json({
      success: true,
      message: 'Manual hold recorded successfully.',
      hold: createdRows[0],
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
 * POST /api/holds/:holdId/release
 * Release an active manual hold (DOES NOT MUTATE fishers.status)
 */
const releaseHold = async (req, res, next) => {
  let connection;
  try {
    const { holdId } = req.params;
    const { releaseNotes } = req.body;

    if (!releaseNotes || !releaseNotes.trim()) {
      return res.status(400).json({ success: false, message: 'Release notes are required.' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM fisher_holds WHERE id = ? FOR UPDATE', [holdId]);
    if (existing.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Manual hold record not found.' });
    }
    const hold = existing[0];

    // Lock Fisher row FOR UPDATE
    await connection.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [hold.fisher_id]);

    if (hold.released_at) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({ success: false, message: 'This manual hold has already been released.' });
    }

    // Release hold WITHOUT modifying fishers.status
    await connection.query(
      `UPDATE fisher_holds
       SET released_at = CURRENT_TIMESTAMP, released_by_admin_id = ?, release_notes = ?
       WHERE id = ?`,
      [req.admin?.id || 1, releaseNotes.trim(), holdId]
    );

    await connection.commit();
    connection.release();
    connection = null;

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'MANUAL_HOLD_RELEASED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        holdId,
        fisherId: hold.fisher_id,
        reasonCode: hold.reason_code,
        releaseNotes: releaseNotes.trim(),
      },
    });

    const [releasedRows] = await db.query('SELECT * FROM fisher_holds WHERE id = ?', [holdId]);

    return res.status(200).json({
      success: true,
      message: 'Manual hold released successfully.',
      hold: releasedRows[0],
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
 * GET /api/fishers/:fisherId/holds
 * Get all manual holds for a Fisher
 */
const getFisherHolds = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const [rows] = await db.query(
      `SELECT h.id, h.fisher_id, h.reason_code, h.reason_text, h.notes, h.hold_date,
              h.created_by_admin_id, h.released_at, h.released_by_admin_id, h.release_notes, h.created_at,
              adm1.name as created_by_name, adm2.name as released_by_name
       FROM fisher_holds h
       LEFT JOIN admins adm1 ON h.created_by_admin_id = adm1.id
       LEFT JOIN admins adm2 ON h.released_by_admin_id = adm2.id
       WHERE h.fisher_id = (SELECT id FROM fishers WHERE id = ? OR fisher_id = ? LIMIT 1)
       ORDER BY h.id DESC`,
      [fisherId, fisherId]
    );

    return res.status(200).json({
      success: true,
      holds: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/holds
 * List block history & holds with filters (ACTIVE, HISTORY, DEBT, ADMIN_BLOCK, ALL),
 * search, date range, and pagination.
 */
const getBlockHistory = async (req, res, next) => {
  try {
    const {
      tab = 'ACTIVE', // ACTIVE, HISTORY, DEBT, ADMIN_BLOCK, ALL
      search = '',
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const trimmedSearch = search.trim();
    const searchPattern = `%${trimmedSearch}%`;

    // 1. Fetch Manual Holds
    let manualHolds = [];
    let holdsSql = `
      SELECT h.id, h.fisher_id, h.reason_code, h.reason_text, h.notes, h.hold_date, h.created_by_admin_id,
             h.released_at, h.released_by_admin_id, h.release_notes, h.created_at,
             f.fisher_id as custom_fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.status as base_status,
             adm1.name as created_by_name, adm2.name as released_by_name,
             'MANUAL_HOLD' as block_type
      FROM fisher_holds h
      JOIN fishers f ON h.fisher_id = f.id
      LEFT JOIN admins adm1 ON h.created_by_admin_id = adm1.id
      LEFT JOIN admins adm2 ON h.released_by_admin_id = adm2.id
      WHERE f.is_archived = FALSE
    `;
    const holdsParams = [];

    if (tab === 'ACTIVE') {
      holdsSql += ' AND h.released_at IS NULL';
    }

    if (trimmedSearch) {
      holdsSql += ' AND (f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)';
      holdsParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (fromDate) {
      holdsSql += ' AND DATE(h.hold_date) >= ?';
      holdsParams.push(fromDate);
    }
    if (toDate) {
      holdsSql += ' AND DATE(h.hold_date) <= ?';
      holdsParams.push(toDate);
    }

    holdsSql += ' ORDER BY h.id DESC';
    const [holdRows] = await db.query(holdsSql, holdsParams);
    manualHolds = holdRows.map((r) => ({
      ...r,
      hold_status: r.released_at ? 'RELEASED' : 'ACTIVE',
    }));

    // 2. Fetch Debt Holds
    let debtSql = `
      SELECT f.id as fisher_id, f.fisher_id as custom_fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.status as base_status,
             (
               COALESCE((SELECT SUM(d.original_amount) FROM fisher_debts d WHERE d.fisher_id = f.id AND d.status != 'CANCELLED'), 0) -
               COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.fisher_id = f.id AND p.reversed_at IS NULL), 0)
             ) as outstanding_debt
      FROM fishers f
      WHERE f.is_archived = FALSE
    `;
    const debtParams = [];

    if (trimmedSearch) {
      debtSql += ' AND (f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)';
      debtParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    debtSql += ' HAVING outstanding_debt > 0 ORDER BY f.id DESC';
    const [debtRows] = await db.query(debtSql, debtParams);
    const debtHolds = debtRows.map((f) => ({
      id: `debt-${f.fisher_id}`,
      fisher_id: f.fisher_id,
      custom_fisher_id: f.custom_fisher_id,
      full_name: f.full_name,
      nic: f.nic,
      phone: f.phone,
      boat_no: f.boat_no,
      base_status: f.base_status,
      reason_code: 'DEBT_HOLD',
      reason_text: `மீதிக் கடன்: Rs. ${parseFloat(f.outstanding_debt).toFixed(2)}`,
      outstanding_debt: parseFloat(f.outstanding_debt).toFixed(2),
      block_type: 'DEBT_HOLD',
      hold_status: 'AUTOMATIC',
      hold_date: null,
    }));

    // 3. Fetch Admin Blocks
    let blockSql = `
      SELECT f.id as fisher_id, f.fisher_id as custom_fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.status as base_status
      FROM fishers f
      WHERE f.status = 'BLOCKED' AND f.is_archived = FALSE
    `;
    const blockParams = [];

    if (trimmedSearch) {
      blockSql += ' AND (f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)';
      blockParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    blockSql += ' ORDER BY f.id DESC';
    const [blockRows] = await db.query(blockSql, blockParams);
    const adminBlocks = blockRows.map((f) => ({
      id: `block-${f.fisher_id}`,
      fisher_id: f.fisher_id,
      custom_fisher_id: f.custom_fisher_id,
      full_name: f.full_name,
      nic: f.nic,
      phone: f.phone,
      boat_no: f.boat_no,
      base_status: f.base_status,
      reason_code: 'ADMIN_BLOCK',
      reason_text: 'Manual Block – reason not recorded',
      block_type: 'ADMIN_BLOCK',
      hold_status: 'BLOCKED',
      hold_date: null,
    }));

    // Combine items based on active tab filter
    let allItems = [];
    if (tab === 'ACTIVE') {
      allItems = manualHolds.filter((h) => h.hold_status === 'ACTIVE');
    } else if (tab === 'HISTORY') {
      allItems = manualHolds;
    } else if (tab === 'DEBT') {
      allItems = debtHolds;
    } else if (tab === 'ADMIN_BLOCK') {
      allItems = adminBlocks;
    } else {
      allItems = [...manualHolds, ...debtHolds, ...adminBlocks];
    }

    const total = allItems.length;
    const totalPages = Math.ceil(total / limitNum) || 1;
    const paginatedItems = allItems.slice(offset, offset + limitNum);

    const activeManualCount = manualHolds.filter((h) => h.hold_status === 'ACTIVE').length;
    const historyCount = manualHolds.length;
    const debtCount = debtHolds.length;
    const adminBlockCount = adminBlocks.length;

    return res.status(200).json({
      success: true,
      items: paginatedItems,
      metrics: {
        activeManualCount,
        historyCount,
        debtCount,
        adminBlockCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createHold,
  releaseHold,
  getFisherHolds,
  getBlockHistory,
};
