const db = require('../config/db');
const { validateSriLankanNIC, normalizeSriLankanPhone } = require('../utils/validation');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/fishers
 * Server-side list, search, status filter, archive filter, and pagination
 * Returns global real database status counts independent of pagination.
 */
const getFishers = async (req, res, next) => {
  try {
    const {
      search = '',
      status = '',
      archiveStatus = 'ACTIVE',
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const { getFisherClearanceStatus } = require('../services/financialService');

    // 1. Build archive & search conditions
    const whereConditions = [];
    const queryParams = [];

    if (archiveStatus === 'ARCHIVED') {
      whereConditions.push('is_archived = TRUE');
    } else if (archiveStatus !== 'ALL') {
      whereConditions.push('is_archived = FALSE');
    }

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.push(
        '(fisher_id LIKE ? OR full_name LIKE ? OR nic LIKE ? OR phone LIKE ? OR boat_no LIKE ?)'
      );
      const searchPattern = `%${trimmedSearch}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 2. Fetch matching fishers for effective status enrichment & filtering
    const listSql = `
      SELECT 
        id, fisher_id, full_name, nic, phone, boat_no, address, notes, status, is_archived,
        created_by_admin_id, created_at, updated_at
      FROM fishers
      ${whereSql}
      ORDER BY id DESC
    `;
    const [rawItems] = await db.query(listSql, queryParams);

    // Enrich items with effective clearance status without mutating base status
    const enrichedItems = await Promise.all(
      rawItems.map(async (item) => {
        const clearance = await getFisherClearanceStatus(item.id);
        return {
          ...item,
          effectiveStatus: clearance.status, // 'CLEARED' | 'HOLD' | 'PENDING' | 'NOT_ELIGIBLE'
          clearanceDetails: clearance,
        };
      })
    );

    // Filter items based on effective status tab filter
    let filteredItems = enrichedItems;
    const reqStatus = status ? status.toUpperCase() : '';
    if (reqStatus === 'BLOCKED') {
      filteredItems = enrichedItems.filter((i) => i.effectiveStatus === 'HOLD');
    } else if (reqStatus === 'ACTIVE') {
      filteredItems = enrichedItems.filter((i) => i.effectiveStatus === 'CLEARED');
    } else if (reqStatus === 'PENDING') {
      filteredItems = enrichedItems.filter((i) => i.effectiveStatus === 'PENDING');
    }

    const total = filteredItems.length;
    const offset = (pageNum - 1) * limitNum;
    const items = filteredItems.slice(offset, offset + limitNum);

    // 3. Global real database counts across all fishers using getFisherClearanceStatus
    const [allFishersForCounts] = await db.query('SELECT id, is_archived FROM fishers');

    let count_all = 0;
    let count_active = 0;
    let count_blocked = 0;
    let count_pending = 0;
    let count_archived = 0;

    for (const f of allFishersForCounts) {
      if (f.is_archived) {
        count_archived += 1;
      } else {
        count_all += 1;
        const clearance = await getFisherClearanceStatus(f.id);
        if (clearance.status === 'HOLD') {
          count_blocked += 1;
        } else if (clearance.status === 'PENDING') {
          count_pending += 1;
        } else if (clearance.status === 'CLEARED') {
          count_active += 1;
        }
      }
    }

    const counts = {
      all: count_all,
      active: count_active,
      blocked: count_blocked,
      pending: count_pending,
      archived: count_archived,
    };

    return res.status(200).json({
      success: true,
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      counts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/fishers/:id
 * Retrieve single fisher details
 */
const getFisherById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT id, fisher_id, full_name, nic, phone, boat_no, address, notes, status, is_archived, created_at, updated_at
       FROM fishers WHERE id = ? OR fisher_id = ?`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Fisher not found.',
      });
    }

    return res.status(200).json({
      success: true,
      fisher: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/fishers
 * Add a new Fisher with transaction-safe sequence Fisher ID generation (system_sequences)
 */
const createFisher = async (req, res, next) => {
  let connection;
  try {
    const { full_name, nic, phone, boat_no, address, notes, status = 'ACTIVE' } = req.body;

    // 1. Validate full_name
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    // 2. Validate NIC
    const nicResult = validateSriLankanNIC(nic);
    if (!nicResult.isValid) {
      return res.status(400).json({ success: false, message: nicResult.error });
    }
    const normalizedNic = nicResult.normalizedNic;

    // 3. Validate & normalize phone
    const phoneResult = normalizeSriLankanPhone(phone);
    if (!phoneResult.isValid) {
      return res.status(400).json({ success: false, message: phoneResult.error });
    }
    const normalizedPhone = phoneResult.normalizedPhone;

    // 4. Validate status
    const validStatus = ['ACTIVE', 'BLOCKED', 'PENDING'].includes(status?.toUpperCase())
      ? status.toUpperCase()
      : 'ACTIVE';

    // 5. Check duplicate NIC in DB first
    const [existingNic] = await db.query('SELECT id FROM fishers WHERE nic = ?', [normalizedNic]);
    if (existingNic.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A fisher with this NIC already exists.',
      });
    }

    // 6. Transaction-safe Fisher ID sequence generation
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock sequence row for transaction safety
    const [seqRows] = await connection.query(
      "SELECT next_value FROM system_sequences WHERE sequence_name = 'FISHER' FOR UPDATE"
    );

    let nextVal = 1;
    if (seqRows.length === 0) {
      await connection.query(
        "INSERT INTO system_sequences (sequence_name, next_value) VALUES ('FISHER', 2)"
      );
    } else {
      nextVal = seqRows[0].next_value;
      await connection.query(
        "UPDATE system_sequences SET next_value = next_value + 1 WHERE sequence_name = 'FISHER'"
      );
    }

    const formattedFisherId = `FIS-${String(nextVal).padStart(6, '0')}`;

    // Insert Fisher with FINAL generated fisher_id directly
    const [insertResult] = await connection.query(
      `INSERT INTO fishers (fisher_id, full_name, nic, phone, boat_no, address, notes, status, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formattedFisherId,
        full_name.trim(),
        normalizedNic,
        normalizedPhone,
        boat_no ? boat_no.trim() : null,
        address ? address.trim() : null,
        notes ? notes.trim() : null,
        validStatus,
        req.admin?.id || null,
      ]
    );

    await connection.commit();
    connection.release();
    connection = null;

    const newFisherId = insertResult.insertId;

    // Log Audit
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        id: newFisherId,
        fisherId: formattedFisherId,
        fullName: full_name.trim(),
        nic: normalizedNic,
        status: validStatus,
      },
    });

    // Fetch created fisher row
    const [newRows] = await db.query('SELECT * FROM fishers WHERE id = ?', [newFisherId]);

    return res.status(201).json({
      success: true,
      message: 'Fisher registered successfully.',
      fisher: newRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    // Handle MySQL unique key constraint error safely
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('nic')) {
        return res.status(409).json({
          success: false,
          message: 'A fisher with this NIC already exists.',
        });
      }
      if (error.message.includes('fisher_id')) {
        return res.status(409).json({
          success: false,
          message: 'A fisher with this Fisher ID already exists. Please retry.',
        });
      }
    }
    next(error);
  }
};

/**
 * PATCH /api/fishers/:id
 * Edit Fisher details / status
 */
const updateFisher = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    const { full_name, nic, phone, boat_no, address, notes, status } = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock Fisher row FOR UPDATE
    const [existingRows] = await connection.query('SELECT * FROM fishers WHERE id = ? FOR UPDATE', [id]);
    if (existingRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }
    const currentFisher = existingRows[0];

    const updates = [];
    const queryParams = [];

    // Full name
    if (full_name !== undefined) {
      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
      }
      updates.push('full_name = ?');
      queryParams.push(full_name.trim());
    }

    // NIC
    if (nic !== undefined && nic !== currentFisher.nic) {
      const nicResult = validateSriLankanNIC(nic);
      if (!nicResult.isValid) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: nicResult.error });
      }
      const normalizedNic = nicResult.normalizedNic;

      // Check NIC uniqueness
      const [dup] = await connection.query('SELECT id FROM fishers WHERE nic = ? AND id != ?', [
        normalizedNic,
        id,
      ]);
      if (dup.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(409).json({
          success: false,
          message: 'A fisher with this NIC already exists.',
        });
      }
      updates.push('nic = ?');
      queryParams.push(normalizedNic);
    }

    // Phone
    if (phone !== undefined) {
      const phoneResult = normalizeSriLankanPhone(phone);
      if (!phoneResult.isValid) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: phoneResult.error });
      }
      updates.push('phone = ?');
      queryParams.push(phoneResult.normalizedPhone);
    }

    // Boat No
    if (boat_no !== undefined) {
      updates.push('boat_no = ?');
      queryParams.push(boat_no ? boat_no.trim() : null);
    }

    // Address
    if (address !== undefined) {
      updates.push('address = ?');
      queryParams.push(address ? address.trim() : null);
    }

    // Notes
    if (notes !== undefined) {
      updates.push('notes = ?');
      queryParams.push(notes ? notes.trim() : null);
    }

    // Status transition
    let statusChanged = false;
    let oldStatus = currentFisher.status;
    let newStatus = currentFisher.status;

    if (status !== undefined && status !== currentFisher.status) {
      if (['ACTIVE', 'BLOCKED', 'PENDING'].includes(status?.toUpperCase())) {
        newStatus = status.toUpperCase();
        updates.push('status = ?');
        queryParams.push(newStatus);
        statusChanged = true;
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(200).json({
        success: true,
        message: 'No changes provided.',
        fisher: currentFisher,
      });
    }

    queryParams.push(id);
    await connection.query(`UPDATE fishers SET ${updates.join(', ')} WHERE id = ?`, queryParams);

    await connection.commit();
    connection.release();
    connection = null;

    // Audit Logging
    const action = statusChanged ? 'FISHER_STATUS_CHANGED' : 'FISHER_UPDATED';
    await logAudit({
      adminId: req.admin?.id || null,
      action,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        id,
        fisherId: currentFisher.fisher_id,
        oldStatus,
        newStatus,
      },
    });

    const [updatedRows] = await db.query('SELECT * FROM fishers WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Fisher record updated successfully.',
      fisher: updatedRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('nic')) {
      return res.status(409).json({
        success: false,
        message: 'A fisher with this NIC already exists.',
      });
    }
    next(error);
  }
};

/**
 * POST /api/fishers/:id/archive
 * Soft archive Fisher
 */
const archiveFisher = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM fishers WHERE id = ? FOR UPDATE', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }

    await connection.query('UPDATE fishers SET is_archived = TRUE WHERE id = ?', [id]);

    await connection.commit();
    connection.release();
    connection = null;

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_ARCHIVED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { id, fisherId: existing[0].fisher_id, fullName: existing[0].full_name },
    });

    const [updated] = await db.query('SELECT * FROM fishers WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Fisher archived successfully.',
      fisher: updated[0],
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
 * POST /api/fishers/:id/restore
 * Restore archived Fisher
 */
const restoreFisher = async (req, res, next) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM fishers WHERE id = ? FOR UPDATE', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }

    await connection.query('UPDATE fishers SET is_archived = FALSE WHERE id = ?', [id]);

    await connection.commit();
    connection.release();
    connection = null;

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_RESTORED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { id, fisherId: existing[0].fisher_id, fullName: existing[0].full_name },
    });

    const [updated] = await db.query('SELECT * FROM fishers WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Fisher restored successfully.',
      fisher: updated[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    next(error);
  }
};

module.exports = {
  getFishers,
  getFisherById,
  createFisher,
  updateFisher,
  archiveFisher,
  restoreFisher,
};
