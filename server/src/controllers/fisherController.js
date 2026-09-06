const prisma = require('../config/prismaClient');
const { validateSriLankanNIC, normalizeSriLankanPhone } = require('../utils/validation');
const { logAudit } = require('../services/auditService');

/**
 * Helper to map Prisma fisher record into safe JSON response format (BigInt -> Number)
 */
const mapFisherResponse = (fisher) => {
  if (!fisher) return null;
  return {
    ...fisher,
    id: typeof fisher.id === 'bigint' ? Number(fisher.id) : fisher.id,
    created_by_admin_id: fisher.created_by_admin_id ? Number(fisher.created_by_admin_id) : null,
  };
};

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

    // 1. Build archive & search conditions for Prisma findMany
    const whereConditions = {};

    if (archiveStatus === 'ARCHIVED') {
      whereConditions.is_archived = true;
    } else if (archiveStatus !== 'ALL') {
      whereConditions.is_archived = false;
    }

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      whereConditions.OR = [
        { fisher_id: { contains: trimmedSearch } },
        { full_name: { contains: trimmedSearch } },
        { nic: { contains: trimmedSearch } },
        { phone: { contains: trimmedSearch } },
        { boat_no: { contains: trimmedSearch } },
      ];
    }

    // 2. Fetch matching fishers via Prisma
    const rawItems = await prisma.fishers.findMany({
      where: whereConditions,
      orderBy: { id: 'desc' },
    });

    // Enrich items with effective clearance status without mutating base status
    const enrichedItems = await Promise.all(
      rawItems.map(async (rawItem) => {
        const item = mapFisherResponse(rawItem);
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
    const allFishersForCounts = await prisma.fishers.findMany({
      select: { id: true, is_archived: true },
    });

    let count_all = 0;
    let count_active = 0;
    let count_blocked = 0;
    let count_pending = 0;
    let count_archived = 0;

    for (const f of allFishersForCounts) {
      const fId = Number(f.id);
      if (f.is_archived) {
        count_archived += 1;
      } else {
        count_all += 1;
        const clearance = await getFisherClearanceStatus(fId);
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
    const isNumeric = !isNaN(Number(id));

    const whereCondition = isNumeric
      ? { OR: [{ id: BigInt(id) }, { fisher_id: id }] }
      : { fisher_id: id };

    const fisher = await prisma.fishers.findFirst({
      where: whereCondition,
    });

    if (!fisher) {
      return res.status(404).json({
        success: false,
        message: 'Fisher not found.',
      });
    }

    return res.status(200).json({
      success: true,
      fisher: mapFisherResponse(fisher),
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

    // 5. Check duplicate NIC in DB first via Prisma
    const existingNic = await prisma.fishers.findUnique({
      where: { nic: normalizedNic },
      select: { id: true },
    });
    if (existingNic) {
      return res.status(409).json({
        success: false,
        message: 'A fisher with this NIC already exists.',
      });
    }

    // 6. Transaction-safe Fisher ID sequence generation via Prisma $transaction
    const newFisher = await prisma.$transaction(async (tx) => {
      // Lock sequence row for transaction safety
      const seqRows = await tx.$queryRaw`
        SELECT next_value FROM system_sequences WHERE sequence_name = 'FISHER' FOR UPDATE
      `;

      let nextVal = 1;
      if (!seqRows || seqRows.length === 0) {
        await tx.$executeRaw`
          INSERT INTO system_sequences (sequence_name, next_value) VALUES ('FISHER', 2)
        `;
      } else {
        nextVal = Number(seqRows[0].next_value);
        await tx.$executeRaw`
          UPDATE system_sequences SET next_value = next_value + 1 WHERE sequence_name = 'FISHER'
        `;
      }

      const formattedFisherId = `FIS-${String(nextVal).padStart(6, '0')}`;

      // Insert Fisher with generated fisher_id directly
      return await tx.fishers.create({
        data: {
          fisher_id: formattedFisherId,
          full_name: full_name.trim(),
          nic: normalizedNic,
          phone: normalizedPhone,
          boat_no: boat_no ? boat_no.trim() : null,
          address: address ? address.trim() : null,
          notes: notes ? notes.trim() : null,
          status: validStatus,
          created_by_admin_id: req.admin?.id || null,
        },
      });
    });

    const newFisherMapped = mapFisherResponse(newFisher);

    // Log Audit
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        id: newFisherMapped.id,
        fisherId: newFisherMapped.fisher_id,
        fullName: full_name.trim(),
        nic: normalizedNic,
        status: validStatus,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Fisher registered successfully.',
      fisher: newFisherMapped,
    });
  } catch (error) {
    // Handle Prisma unique constraint error safely
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (Array.isArray(target) && target.includes('nic')) {
        return res.status(409).json({
          success: false,
          message: 'A fisher with this NIC already exists.',
        });
      }
      if (Array.isArray(target) && target.includes('fisher_id')) {
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
  try {
    const { id } = req.params;
    const { full_name, nic, phone, boat_no, address, notes, status } = req.body;
    const isNumeric = !isNaN(Number(id));

    if (!isNumeric) {
      return res.status(400).json({ success: false, message: 'Invalid fisher ID.' });
    }

    const fisherIdNum = BigInt(id);

    const result = await prisma.$transaction(async (tx) => {
      // Lock Fisher row FOR UPDATE
      const existingList = await tx.$queryRaw`SELECT * FROM fishers WHERE id = ${fisherIdNum} FOR UPDATE`;
      if (!existingList || existingList.length === 0) {
        return { notFound: true };
      }
      const currentFisher = existingList[0];

      const updateData = {};

      // Full name
      if (full_name !== undefined) {
        if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
          return { error: { status: 400, message: 'Full name cannot be empty.' } };
        }
        updateData.full_name = full_name.trim();
      }

      // NIC
      if (nic !== undefined && nic !== currentFisher.nic) {
        const nicResult = validateSriLankanNIC(nic);
        if (!nicResult.isValid) {
          return { error: { status: 400, message: nicResult.error } };
        }
        const normalizedNic = nicResult.normalizedNic;

        // Check NIC uniqueness
        const dup = await tx.fishers.findFirst({
          where: {
            nic: normalizedNic,
            id: { not: fisherIdNum },
          },
          select: { id: true },
        });
        if (dup) {
          return { error: { status: 409, message: 'A fisher with this NIC already exists.' } };
        }
        updateData.nic = normalizedNic;
      }

      // Phone
      if (phone !== undefined) {
        const phoneResult = normalizeSriLankanPhone(phone);
        if (!phoneResult.isValid) {
          return { error: { status: 400, message: phoneResult.error } };
        }
        updateData.phone = phoneResult.normalizedPhone;
      }

      // Boat No
      if (boat_no !== undefined) {
        updateData.boat_no = boat_no ? boat_no.trim() : null;
      }

      // Address
      if (address !== undefined) {
        updateData.address = address ? address.trim() : null;
      }

      // Notes
      if (notes !== undefined) {
        updateData.notes = notes ? notes.trim() : null;
      }

      // Status transition
      let statusChanged = false;
      let oldStatus = currentFisher.status;
      let newStatus = currentFisher.status;

      if (status !== undefined && status !== currentFisher.status) {
        if (['ACTIVE', 'BLOCKED', 'PENDING'].includes(status?.toUpperCase())) {
          newStatus = status.toUpperCase();
          updateData.status = newStatus;
          statusChanged = true;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return { noChanges: true, fisher: mapFisherResponse(currentFisher) };
      }

      const updated = await tx.fishers.update({
        where: { id: fisherIdNum },
        data: updateData,
      });

      return {
        updated: mapFisherResponse(updated),
        statusChanged,
        oldStatus,
        newStatus,
        fisherId: currentFisher.fisher_id,
      };
    });

    if (result.notFound) {
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }

    if (result.noChanges) {
      return res.status(200).json({
        success: true,
        message: 'No changes provided.',
        fisher: result.fisher,
      });
    }

    // Audit Logging
    const action = result.statusChanged ? 'FISHER_STATUS_CHANGED' : 'FISHER_UPDATED';
    await logAudit({
      adminId: req.admin?.id || null,
      action,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        id: Number(id),
        fisherId: result.fisherId,
        oldStatus: result.oldStatus,
        newStatus: result.newStatus,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Fisher record updated successfully.',
      fisher: result.updated,
    });
  } catch (error) {
    if (error.code === 'P2002') {
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
  try {
    const { id } = req.params;
    const isNumeric = !isNaN(Number(id));
    if (!isNumeric) {
      return res.status(400).json({ success: false, message: 'Invalid fisher ID.' });
    }

    const fisherIdNum = BigInt(id);

    const existing = await prisma.fishers.findUnique({
      where: { id: fisherIdNum },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }

    const updated = await prisma.fishers.update({
      where: { id: fisherIdNum },
      data: { is_archived: true },
    });

    const mapped = mapFisherResponse(updated);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_ARCHIVED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { id: mapped.id, fisherId: mapped.fisher_id, fullName: mapped.full_name },
    });

    return res.status(200).json({
      success: true,
      message: 'Fisher archived successfully.',
      fisher: mapped,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/fishers/:id/restore
 * Restore archived Fisher
 */
const restoreFisher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isNumeric = !isNaN(Number(id));
    if (!isNumeric) {
      return res.status(400).json({ success: false, message: 'Invalid fisher ID.' });
    }

    const fisherIdNum = BigInt(id);

    const existing = await prisma.fishers.findUnique({
      where: { id: fisherIdNum },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Fisher not found.' });
    }

    const updated = await prisma.fishers.update({
      where: { id: fisherIdNum },
      data: { is_archived: false },
    });

    const mapped = mapFisherResponse(updated);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'FISHER_RESTORED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { id: mapped.id, fisherId: mapped.fisher_id, fullName: mapped.full_name },
    });

    return res.status(200).json({
      success: true,
      message: 'Fisher restored successfully.',
      fisher: mapped,
    });
  } catch (error) {
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

