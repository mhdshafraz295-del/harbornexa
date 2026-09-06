const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');
const { Prisma } = require('@prisma/client');
const { logAudit } = require('../services/auditService');

/**
 * POST /api/holds/fisher/:fisherId (or /api/fishers/:fisherId/holds)
 * Create a new manual hold for a Fisher (DOES NOT MUTATE fishers.status)
 */
const createHold = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const { reasonCode, reasonText, notes } = req.body;

    const isNumeric = !isNaN(Number(fisherId));
    const fisherWhere = isNumeric
      ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
      : { fisher_id: String(fisherId) };

    const fisher = await prisma.fishers.findFirst({
      where: fisherWhere,
      select: { id: true, fisher_id: true, full_name: true, status: true, is_archived: true },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    if (fisher.is_archived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot place a manual hold on an archived fisher record.',
      });
    }

    // Validate reason_code against enum
    const validReasons = ['PAYMENT_ISSUE', 'DOCUMENT_ISSUE', 'MANAGEMENT_DECISION', 'OTHER'];
    if (!reasonCode || !validReasons.includes(reasonCode.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Valid reason code is required (PAYMENT_ISSUE, DOCUMENT_ISSUE, MANAGEMENT_DECISION, OTHER).',
      });
    }
    const code = reasonCode.toUpperCase();

    if (code === 'OTHER' && (!reasonText || !reasonText.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Reason text is required when selecting OTHER.',
      });
    }

    // Transaction with atomic FOR UPDATE row lock on Fisher
    const createdHold = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fishers WHERE id = ${fisher.id} FOR UPDATE`;

      return await tx.fisher_holds.create({
        data: {
          fisher_id: fisher.id,
          reason_code: code,
          reason_text: reasonText ? reasonText.trim() : null,
          notes: notes ? notes.trim() : null,
          hold_date: new Date(),
          created_by_admin_id: req.admin?.id || 1,
        },
      });
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'MANUAL_HOLD_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        holdId: Number(createdHold.id),
        fisherId: Number(fisher.id),
        customFisherId: fisher.fisher_id,
        reasonCode: code,
        reasonText: reasonText ? reasonText.trim() : null,
      },
    });

    const formattedHold = {
      ...createdHold,
      id: Number(createdHold.id),
      fisher_id: Number(createdHold.fisher_id),
      created_by_admin_id: Number(createdHold.created_by_admin_id),
      released_by_admin_id: createdHold.released_by_admin_id ? Number(createdHold.released_by_admin_id) : null,
    };

    return res.status(201).json({
      success: true,
      message: 'Manual hold recorded successfully.',
      hold: formattedHold,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/holds/:holdId/release
 * Release an active manual hold (DOES NOT MUTATE fishers.status)
 */
const releaseHold = async (req, res, next) => {
  try {
    const { holdId } = req.params;
    const { releaseNotes } = req.body;

    if (!releaseNotes || !releaseNotes.trim()) {
      return res.status(400).json({ success: false, message: 'Release notes are required.' });
    }

    const holdIdBig = BigInt(holdId);

    const result = await prisma.$transaction(async (tx) => {
      // Lock hold row FOR UPDATE
      const holds = await tx.$queryRaw`SELECT * FROM fisher_holds WHERE id = ${holdIdBig} FOR UPDATE`;
      if (!holds || holds.length === 0) {
        const err = new Error('Manual hold record not found.');
        err.statusCode = 404;
        throw err;
      }
      const hold = holds[0];

      // Lock Fisher row FOR UPDATE
      await tx.$queryRaw`SELECT id FROM fishers WHERE id = ${hold.fisher_id} FOR UPDATE`;

      if (hold.released_at) {
        const err = new Error('This manual hold has already been released.');
        err.statusCode = 409;
        throw err;
      }

      const updatedHold = await tx.fisher_holds.update({
        where: { id: holdIdBig },
        data: {
          released_at: new Date(),
          released_by_admin_id: req.admin?.id || 1,
          release_notes: releaseNotes.trim(),
        },
      });

      return { updatedHold, hold };
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'MANUAL_HOLD_RELEASED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        holdId: Number(holdIdBig),
        fisherId: Number(result.hold.fisher_id),
        reasonCode: result.hold.reason_code,
        releaseNotes: releaseNotes.trim(),
      },
    });

    const formattedHold = {
      ...result.updatedHold,
      id: Number(result.updatedHold.id),
      fisher_id: Number(result.updatedHold.fisher_id),
      created_by_admin_id: Number(result.updatedHold.created_by_admin_id),
      released_by_admin_id: Number(result.updatedHold.released_by_admin_id),
    };

    return res.status(200).json({
      success: true,
      message: 'Manual hold released successfully.',
      hold: formattedHold,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/holds/fisher/:fisherId
 * Get all manual holds for a Fisher
 */
const getFisherHolds = async (req, res, next) => {
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
      return res.status(200).json({
        success: true,
        holds: [],
      });
    }

    const rawHolds = await prisma.fisher_holds.findMany({
      where: { fisher_id: fisher.id },
      include: {
        admins_fisher_holds_created_by_admin_idToadmins: { select: { name: true } },
        admins_fisher_holds_released_by_admin_idToadmins: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
    });

    const holds = rawHolds.map((h) => ({
      id: Number(h.id),
      fisher_id: Number(h.fisher_id),
      reason_code: h.reason_code,
      reason_text: h.reason_text,
      notes: h.notes,
      hold_date: h.hold_date,
      created_by_admin_id: Number(h.created_by_admin_id),
      released_at: h.released_at,
      released_by_admin_id: h.released_by_admin_id ? Number(h.released_by_admin_id) : null,
      release_notes: h.release_notes,
      created_at: h.created_at,
      created_by_name: h.admins_fisher_holds_created_by_admin_idToadmins?.name || null,
      released_by_name: h.admins_fisher_holds_released_by_admin_idToadmins?.name || null,
    }));

    return res.status(200).json({
      success: true,
      holds,
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
    const searchFilter = trimmedSearch
      ? {
          OR: [
            { fisher_id: { contains: trimmedSearch } },
            { full_name: { contains: trimmedSearch } },
            { nic: { contains: trimmedSearch } },
            { phone: { contains: trimmedSearch } },
            { boat_no: { contains: trimmedSearch } },
          ],
        }
      : {};

    // 1. Fetch Manual Holds via Prisma
    const holdWhere = {
      fishers: {
        is_archived: false,
        ...searchFilter,
      },
    };

    if (tab === 'ACTIVE') {
      holdWhere.released_at = null;
    }

    if (fromDate || toDate) {
      holdWhere.hold_date = {};
      if (fromDate) {
        holdWhere.hold_date.gte = new Date(`${String(fromDate).trim()}T00:00:00.000Z`);
      }
      if (toDate) {
        holdWhere.hold_date.lte = new Date(`${String(toDate).trim()}T23:59:59.999Z`);
      }
    }

    const rawManualHolds = await prisma.fisher_holds.findMany({
      where: holdWhere,
      include: {
        fishers: {
          select: {
            fisher_id: true,
            full_name: true,
            nic: true,
            phone: true,
            boat_no: true,
            status: true,
          },
        },
        admins_fisher_holds_created_by_admin_idToadmins: { select: { name: true } },
        admins_fisher_holds_released_by_admin_idToadmins: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
    });

    const manualHolds = rawManualHolds.map((h) => ({
      id: Number(h.id),
      fisher_id: Number(h.fisher_id),
      reason_code: h.reason_code,
      reason_text: h.reason_text,
      notes: h.notes,
      hold_date: h.hold_date,
      created_by_admin_id: Number(h.created_by_admin_id),
      released_at: h.released_at,
      released_by_admin_id: h.released_by_admin_id ? Number(h.released_by_admin_id) : null,
      release_notes: h.release_notes,
      created_at: h.created_at,
      custom_fisher_id: h.fishers.fisher_id,
      full_name: h.fishers.full_name,
      nic: h.fishers.nic,
      phone: h.fishers.phone,
      boat_no: h.fishers.boat_no,
      base_status: h.fishers.status,
      created_by_name: h.admins_fisher_holds_created_by_admin_idToadmins?.name || null,
      released_by_name: h.admins_fisher_holds_released_by_admin_idToadmins?.name || null,
      block_type: 'MANUAL_HOLD',
      hold_status: h.released_at ? 'RELEASED' : 'ACTIVE',
    }));

    // 2. Fetch Debt Holds (Derived from non-archived fishers with outstanding debt > 0)
    const fishersForDebt = await prisma.fishers.findMany({
      where: {
        is_archived: false,
        ...searchFilter,
      },
      select: {
        id: true,
        fisher_id: true,
        full_name: true,
        nic: true,
        phone: true,
        boat_no: true,
        status: true,
        fisher_debts: {
          where: { status: { not: 'CANCELLED' } },
          select: { original_amount: true },
        },
        debt_payments: {
          where: { reversed_at: null },
          select: { amount: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    const debtHolds = [];
    for (const f of fishersForDebt) {
      let totalDebt = new Decimal(0);
      for (const d of f.fisher_debts) {
        totalDebt = totalDebt.plus(new Decimal(d.original_amount ? d.original_amount.toString() : 0));
      }

      let totalPaid = new Decimal(0);
      for (const p of f.debt_payments) {
        totalPaid = totalPaid.plus(new Decimal(p.amount ? p.amount.toString() : 0));
      }

      const outstanding = totalDebt.minus(totalPaid);
      if (outstanding.gt(0)) {
        debtHolds.push({
          id: `debt-${Number(f.id)}`,
          fisher_id: Number(f.id),
          custom_fisher_id: f.fisher_id,
          full_name: f.full_name,
          nic: f.nic,
          phone: f.phone,
          boat_no: f.boat_no,
          base_status: f.status,
          reason_code: 'DEBT_HOLD',
          reason_text: `மீதிக் கடன்: Rs. ${outstanding.toFixed(2)}`,
          outstanding_debt: outstanding.toFixed(2),
          block_type: 'DEBT_HOLD',
          hold_status: 'AUTOMATIC',
          hold_date: null,
        });
      }
    }

    // 3. Fetch Admin Blocks (Non-archived fishers with status = 'BLOCKED')
    const blockedFishers = await prisma.fishers.findMany({
      where: {
        status: 'BLOCKED',
        is_archived: false,
        ...searchFilter,
      },
      select: {
        id: true,
        fisher_id: true,
        full_name: true,
        nic: true,
        phone: true,
        boat_no: true,
        status: true,
      },
      orderBy: { id: 'desc' },
    });

    const adminBlocks = blockedFishers.map((f) => ({
      id: `block-${Number(f.id)}`,
      fisher_id: Number(f.id),
      custom_fisher_id: f.fisher_id,
      full_name: f.full_name,
      nic: f.nic,
      phone: f.phone,
      boat_no: f.boat_no,
      base_status: f.status,
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
