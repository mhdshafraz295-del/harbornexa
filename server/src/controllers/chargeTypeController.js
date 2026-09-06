const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/charge-types
 * List all charge types (optionally filtered by active state)
 */
const getChargeTypes = async (req, res, next) => {
  try {
    const { activeOnly } = req.query;

    const where = {};
    if (activeOnly === 'true') {
      where.is_active = true;
    }

    const rows = await prisma.charge_types.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    const chargeTypes = rows.map((ct) => ({
      ...ct,
      id: Number(ct.id),
      default_amount: new Decimal(ct.default_amount ? ct.default_amount.toString() : 0).toFixed(2),
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
    const existing = await prisma.charge_types.findUnique({
      where: { name: trimmedName },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A charge type with this name already exists.' });
    }

    const activeFlag = isActive !== undefined ? Boolean(isActive) : true;
    const adminId = req.admin?.id || 1;

    const createdRecord = await prisma.charge_types.create({
      data: {
        name: trimmedName,
        default_amount: decAmount.toFixed(2),
        description: description ? description.trim() : null,
        is_active: activeFlag,
        created_by_admin_id: adminId,
      },
    });

    const newId = Number(createdRecord.id);

    await logAudit({
      adminId,
      action: 'CHARGE_TYPE_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: newId, name: trimmedName, defaultAmount: decAmount.toFixed(2) },
    });

    return res.status(201).json({
      success: true,
      message: 'Charge type created successfully.',
      chargeType: {
        ...createdRecord,
        id: newId,
        default_amount: new Decimal(createdRecord.default_amount.toString()).toFixed(2),
        is_active: Boolean(createdRecord.is_active),
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
    const targetId = BigInt(id);
    const { name, defaultAmount, description, isActive } = req.body;

    const existing = await prisma.charge_types.findUnique({
      where: { id: targetId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    const dataToUpdate = {};

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Charge type name cannot be empty.' });
      }
      const trimmedName = name.trim();
      const dup = await prisma.charge_types.findFirst({
        where: {
          name: trimmedName,
          NOT: { id: targetId },
        },
      });
      if (dup) {
        return res.status(400).json({ success: false, message: 'Another charge type with this name already exists.' });
      }
      dataToUpdate.name = trimmedName;
    }

    if (defaultAmount !== undefined) {
      if (!defaultAmount || isNaN(defaultAmount)) {
        return res.status(400).json({ success: false, message: 'Valid default amount is required.' });
      }
      const decAmount = new Decimal(defaultAmount);
      if (decAmount.lte(0)) {
        return res.status(400).json({ success: false, message: 'Default amount must be greater than zero.' });
      }
      dataToUpdate.default_amount = decAmount.toFixed(2);
    }

    if (description !== undefined) {
      dataToUpdate.description = description ? description.trim() : null;
    }

    if (isActive !== undefined) {
      dataToUpdate.is_active = Boolean(isActive);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes provided.',
        chargeType: {
          ...existing,
          id: Number(existing.id),
          default_amount: new Decimal(existing.default_amount.toString()).toFixed(2),
          is_active: Boolean(existing.is_active),
        },
      });
    }

    dataToUpdate.updated_by_admin_id = req.admin?.id || 1;

    const updated = await prisma.charge_types.update({
      where: { id: targetId },
      data: dataToUpdate,
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: Number(targetId) },
    });

    return res.status(200).json({
      success: true,
      message: 'Charge type updated successfully.',
      chargeType: {
        ...updated,
        id: Number(updated.id),
        default_amount: new Decimal(updated.default_amount.toString()).toFixed(2),
        is_active: Boolean(updated.is_active),
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
    const targetId = BigInt(id);

    const existing = await prisma.charge_types.findUnique({
      where: { id: targetId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    await prisma.charge_types.update({
      where: { id: targetId },
      data: {
        is_active: true,
        updated_by_admin_id: req.admin?.id || 1,
      },
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_ACTIVATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: Number(targetId) },
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
    const targetId = BigInt(id);

    const existing = await prisma.charge_types.findUnique({
      where: { id: targetId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Charge type not found.' });
    }

    await prisma.charge_types.update({
      where: { id: targetId },
      data: {
        is_active: false,
        updated_by_admin_id: req.admin?.id || 1,
      },
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'CHARGE_TYPE_DEACTIVATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { chargeTypeId: Number(targetId) },
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
