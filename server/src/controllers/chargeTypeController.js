const Decimal = require('decimal.js');
const db = require('../config/db');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/charge-types
 * List all charge types (optionally filtered by active state)
 */
const getChargeTypes = async (req, res, next) => {
  try {
    const { activeOnly } = req.query;
    let sql = 'SELECT * FROM charge_types';
    const params = [];

    if (activeOnly === 'true') {
      sql += ' WHERE is_active = TRUE';
    }

    sql += ' ORDER BY name ASC';

    const [rows] = await db.query(sql, params);

    const chargeTypes = rows.map((ct) => ({
      ...ct,
      default_amount: new Decimal(ct.default_amount || 0).toFixed(2),
      is_active: Boolean(ct.is_active),
    }));

    return res.status(200).json({
      success: true,
      chargeTypes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/charge-types
 * Create a new Charge Type
 */
const createChargeType = async (req, res, next) => {
  try {
    const { name, defaultAmount, description, isActive } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Charge type name is required.' });
    }

    const trimmedName = name.trim();

    if (!defaultAmount || isNaN(defaultAmount)) {
      return res.status(400).json({ success: false, message: 'Valid default amount is required.' });
    }

    const decAmount = new Decimal(defaultAmount);
    if (decAmount.lte(0)) {
      return res.status(400).json({ success: false, message: 'Default amount must be greater than zero.' });
    }

    // Check unique name
    const [existing] = await db.query('SELECT id FROM charge_types WHERE name = ?', [trimmedName]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A charge type with this name already exists.' });
    }

    const activeFlag = isActive !== undefined ? Boolean(isActive) : true;
    const adminId = req.admin?.id || 1;

    const [insertRes] = await db.query(
      `INSERT INTO charge_types (name, default_amount, description, is_active, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?)`,
      [trimmedName, decAmount.toFixed(2), description ? description.trim() : null, activeFlag, adminId]
    );

    const newId = insertRes.insertId;

    await logAudit({
      adminId,
      action: 'CHARGE_TYPE_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: newId, name: trimmedName, defaultAmount: decAmount.toFixed(2) },
    });

    const [createdRows] = await db.query('SELECT * FROM charge_types WHERE id = ?', [newId]);

    return res.status(201).json({
      success: true,
      message: 'Charge type created successfully.',
      chargeType: {
        ...createdRows[0],
        default_amount: new Decimal(createdRows[0].default_amount).toFixed(2),
        is_active: Boolean(createdRows[0].is_active),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/charge-types/:id
 * Update an existing Charge Type
 */
const updateChargeType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, defaultAmount, description, isActive } = req.body;

    const [existing] = await db.query('SELECT * FROM charge_types WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Charge type name cannot be empty.' });
      }
      const trimmedName = name.trim();
      const [dup] = await db.query('SELECT id FROM charge_types WHERE name = ? AND id != ?', [trimmedName, id]);
      if (dup.length > 0) {
        return res.status(400).json({ success: false, message: 'Another charge type with this name already exists.' });
      }
      updates.push('name = ?');
      params.push(trimmedName);
    }

    if (defaultAmount !== undefined) {
      if (!defaultAmount || isNaN(defaultAmount)) {
        return res.status(400).json({ success: false, message: 'Valid default amount is required.' });
      }
      const decAmount = new Decimal(defaultAmount);
      if (decAmount.lte(0)) {
        return res.status(400).json({ success: false, message: 'Default amount must be greater than zero.' });
      }
      updates.push('default_amount = ?');
      params.push(decAmount.toFixed(2));
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description ? description.trim() : null);
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(Boolean(isActive));
    }

    if (updates.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes provided.',
        chargeType: {
          ...existing[0],
          default_amount: new Decimal(existing[0].default_amount).toFixed(2),
          is_active: Boolean(existing[0].is_active),
        },
      });
    }

    updates.push('updated_by_admin_id = ?');
    params.push(req.admin?.id || 1);
    params.push(id);

    await db.query(`UPDATE charge_types SET ${updates.join(', ')} WHERE id = ?`, params);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: id },
    });

    const [updated] = await db.query('SELECT * FROM charge_types WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Charge type updated successfully.',
      chargeType: {
        ...updated[0],
        default_amount: new Decimal(updated[0].default_amount).toFixed(2),
        is_active: Boolean(updated[0].is_active),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/charge-types/:id/activate
 */
const activateChargeType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM charge_types WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    await db.query('UPDATE charge_types SET is_active = TRUE, updated_by_admin_id = ? WHERE id = ?', [
      req.admin?.id || 1,
      id,
    ]);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_ACTIVATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: id },
    });

    return res.status(200).json({
      success: true,
      message: 'Charge type activated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/charge-types/:id/deactivate
 */
const deactivateChargeType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM charge_types WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    await db.query('UPDATE charge_types SET is_active = FALSE, updated_by_admin_id = ? WHERE id = ?', [
      req.admin?.id || 1,
      id,
    ]);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_DEACTIVATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: id },
    });

    return res.status(200).json({
      success: true,
      message: 'Charge type deactivated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChargeTypes,
  createChargeType,
  updateChargeType,
  activateChargeType,
  deactivateChargeType,
};
