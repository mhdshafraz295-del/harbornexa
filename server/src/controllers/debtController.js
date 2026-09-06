const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');
const { Prisma } = require('@prisma/client');
const { logAudit } = require('../services/auditService');

/**
 * Helper to get current application-local date string (YYYY-MM-DD) in Asia/Colombo
 */
function getColomboTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

/**
 * GET /api/debts
 * List debts with search, filters (All, Outstanding, Fully Paid, Debt Hold, Cancelled),
 * pagination, and top metric cards calculation.
 */
const getDebts = async (req, res, next) => {
  try {
    const {
      search = '',
      statusFilter = 'ALL', // ALL, OUTSTANDING, FULLY_PAID, DEBT_HOLD, CANCELLED
      page = 1,
      limit = 25,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // 1. Build search condition across Fisher fields
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

    // 2. Status filter condition on fisher_debts
    let statusCondition = {};
    if (statusFilter === 'OUTSTANDING' || statusFilter === 'DEBT_HOLD') {
      statusCondition = { status: { notIn: ['CANCELLED', 'PAID'] } };
    } else if (statusFilter === 'FULLY_PAID') {
      statusCondition = { status: 'PAID' };
    } else if (statusFilter === 'CANCELLED') {
      statusCondition = { status: 'CANCELLED' };
    }

    const whereClause = {
      fishers: {
        is_archived: false,
        ...searchFilter,
      },
      ...statusCondition,
    };

    const total = await prisma.fisher_debts.count({ where: whereClause });

    const rawDebts = await prisma.fisher_debts.findMany({
      where: whereClause,
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
        debt_payments: {
          where: { reversed_at: null },
          select: { amount: true },
        },
      },
      orderBy: { id: 'desc' },
      skip,
      take: limitNum,
    });

    const items = rawDebts.map((d) => {
      const orig = new Decimal(d.original_amount ? d.original_amount.toString() : 0);
      let paid = new Decimal(0);
      for (const p of d.debt_payments) {
        paid = paid.plus(new Decimal(p.amount ? p.amount.toString() : 0));
      }
      let outstanding = orig.minus(paid);
      if (outstanding.isNegative() || d.status === 'CANCELLED' || d.status === 'PAID') {
        outstanding = new Decimal(0);
      }

      return {
        id: Number(d.id),
        fisher_id: Number(d.fisher_id),
        category: d.category,
        description: d.description,
        original_amount: orig.toFixed(2),
        debt_date: d.debt_date,
        due_date: d.due_date,
        status: d.status,
        notes: d.notes,
        cancelled_at: d.cancelled_at,
        cancellation_reason: d.cancellation_reason,
        created_at: d.created_at,
        updated_at: d.updated_at,
        custom_fisher_id: d.fishers.fisher_id,
        full_name: d.fishers.full_name,
        nic: d.fishers.nic,
        phone: d.fishers.phone,
        boat_no: d.fishers.boat_no,
        base_fisher_status: d.fishers.status,
        total_paid: paid.toFixed(2),
        outstanding_amount: outstanding.toFixed(2),
      };
    });

    // 3. Top Metric Cards Calculation
    const allNonCancelledDebts = await prisma.fisher_debts.findMany({
      where: {
        status: { not: 'CANCELLED' },
        fishers: { is_archived: false },
      },
      select: { original_amount: true },
    });

    const allNonReversedPayments = await prisma.debt_payments.findMany({
      where: {
        reversed_at: null,
        fishers: { is_archived: false },
      },
      select: { amount: true },
    });

    let globalTotalDebt = new Decimal(0);
    for (const d of allNonCancelledDebts) {
      globalTotalDebt = globalTotalDebt.plus(new Decimal(d.original_amount ? d.original_amount.toString() : 0));
    }

    let globalTotalPaid = new Decimal(0);
    for (const p of allNonReversedPayments) {
      globalTotalPaid = globalTotalPaid.plus(new Decimal(p.amount ? p.amount.toString() : 0));
    }

    let totalOutstanding = globalTotalDebt.minus(globalTotalPaid);
    if (totalOutstanding.isNegative()) {
      totalOutstanding = new Decimal(0);
    }

    const allNonArchivedFishers = await prisma.fishers.findMany({
      where: { is_archived: false },
      select: {
        id: true,
        fisher_debts: {
          where: { status: { not: 'CANCELLED' } },
          select: { original_amount: true },
        },
        debt_payments: {
          where: { reversed_at: null },
          select: { amount: true },
        },
      },
    });

    let fishersWithDebtCount = 0;
    let fullyPaidFishersCount = 0;

    for (const f of allNonArchivedFishers) {
      if (f.fisher_debts.length === 0) continue;

      let fisherDebtSum = new Decimal(0);
      for (const d of f.fisher_debts) {
        fisherDebtSum = fisherDebtSum.plus(new Decimal(d.original_amount ? d.original_amount.toString() : 0));
      }

      let fisherPaidSum = new Decimal(0);
      for (const p of f.debt_payments) {
        fisherPaidSum = fisherPaidSum.plus(new Decimal(p.amount ? p.amount.toString() : 0));
      }

      const outVal = fisherDebtSum.minus(fisherPaidSum);

      if (outVal.gt(0)) {
        fishersWithDebtCount += 1;
      } else {
        fullyPaidFishersCount += 1;
      }
    }

    const colomboTodayStr = getColomboTodayDateString();
    const startOfToday = new Date(`${colomboTodayStr}T00:00:00.000Z`);

    const paymentsTodayRows = await prisma.debt_payments.findMany({
      where: {
        reversed_at: null,
        payment_date: startOfToday,
      },
      select: { amount: true },
    });

    let paymentsTodayVal = new Decimal(0);
    for (const pt of paymentsTodayRows) {
      paymentsTodayVal = paymentsTodayVal.plus(new Decimal(pt.amount ? pt.amount.toString() : 0));
    }

    return res.status(200).json({
      success: true,
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      metrics: {
        totalOutstanding: totalOutstanding.toFixed(2),
        fishersWithDebt: fishersWithDebtCount,
        fullyPaidFishers: fullyPaidFishersCount,
        paymentsToday: paymentsTodayVal.toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/fishers/:fisherId/debts
 * Create a new debt record for a Fisher (New trip / charge workflow)
 */
const createDebt = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const { chargeTypeId, charge_type_id, category, description, originalAmount, debtDate, dueDate, notes } = req.body;

    const targetChargeTypeId = chargeTypeId || charge_type_id;

    const isNumeric = !isNaN(Number(fisherId));
    const fisherWhere = isNumeric
      ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
      : { fisher_id: String(fisherId) };

    const fisher = await prisma.fishers.findFirst({
      where: fisherWhere,
      select: { id: true, fisher_id: true, full_name: true, is_archived: true },
    });

    if (!fisher) {
      return res.status(404).json({ success: false, message: 'Fisher record not found.' });
    }

    if (fisher.is_archived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add debt to an archived fisher record.',
      });
    }

    let finalChargeTypeId = null;
    let finalCategory = category ? String(category).trim() : '';

    if (targetChargeTypeId) {
      const ct = await prisma.charge_types.findUnique({
        where: { id: BigInt(targetChargeTypeId) },
      });

      if (!ct) {
        return res.status(400).json({ success: false, message: 'Selected charge type not found.' });
      }

      if (!ct.is_active) {
        return res.status(400).json({ success: false, message: 'Selected charge type is inactive.' });
      }

      finalChargeTypeId = ct.id;
      finalCategory = ct.name;
    }

    if (!finalCategory) {
      return res.status(400).json({ success: false, message: 'Debt category or charge type is required.' });
    }

    if (!originalAmount || isNaN(originalAmount)) {
      return res.status(400).json({ success: false, message: 'Valid debt amount is required.' });
    }
    const decAmount = new Decimal(originalAmount);
    if (decAmount.lte(0)) {
      return res.status(400).json({ success: false, message: 'Debt amount must be greater than zero.' });
    }

    const validDebtDateStr = debtDate ? String(debtDate).trim() : getColomboTodayDateString();
    const validDebtDate = new Date(`${validDebtDateStr}T00:00:00.000Z`);

    const validDueDate = dueDate ? new Date(`${String(dueDate).trim()}T00:00:00.000Z`) : null;

    const newDebt = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fishers WHERE id = ${fisher.id} FOR UPDATE`;

      return await tx.fisher_debts.create({
        data: {
          fisher_id: fisher.id,
          charge_type_id: finalChargeTypeId,
          category: finalCategory,
          description: description ? description.trim() : null,
          original_amount: new Prisma.Decimal(decAmount.toFixed(2)),
          debt_date: validDebtDate,
          due_date: validDueDate,
          status: 'OPEN',
          notes: notes ? notes.trim() : null,
          created_by_admin_id: req.admin?.id || 1,
        },
      });
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        debtId: Number(newDebt.id),
        fisherId: Number(fisher.id),
        customFisherId: fisher.fisher_id,
        chargeTypeId: finalChargeTypeId ? Number(finalChargeTypeId) : null,
        category: finalCategory,
        originalAmount: decAmount.toFixed(2),
      },
    });

    const formattedDebt = {
      ...newDebt,
      id: Number(newDebt.id),
      fisher_id: Number(newDebt.fisher_id),
      charge_type_id: newDebt.charge_type_id ? Number(newDebt.charge_type_id) : null,
      created_by_admin_id: Number(newDebt.created_by_admin_id),
      original_amount: decAmount.toFixed(2),
    };

    return res.status(201).json({
      success: true,
      message: 'Debt record created successfully.',
      debt: formattedDebt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/debts/:id
 * Edit debt record
 */
const updateDebt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, description, originalAmount, debtDate, dueDate, notes } = req.body;

    const debtIdBig = BigInt(id);
    const existing = await prisma.fisher_debts.findUnique({
      where: { id: debtIdBig },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Debt record not found.' });
    }

    if (existing.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot edit a cancelled debt record.' });
    }

    const dataToUpdate = {};

    if (category !== undefined) {
      if (!category || !category.trim()) {
        return res.status(400).json({ success: false, message: 'Category cannot be empty.' });
      }
      dataToUpdate.category = category.trim();
    }

    if (description !== undefined) {
      dataToUpdate.description = description ? description.trim() : null;
    }

    if (debtDate !== undefined) {
      dataToUpdate.debt_date = debtDate ? new Date(`${String(debtDate).trim()}T00:00:00.000Z`) : existing.debt_date;
    }

    if (dueDate !== undefined) {
      dataToUpdate.due_date = dueDate ? new Date(`${String(dueDate).trim()}T00:00:00.000Z`) : null;
    }

    if (notes !== undefined) {
      dataToUpdate.notes = notes ? notes.trim() : null;
    }

    if (originalAmount !== undefined) {
      const decNew = new Decimal(originalAmount);
      if (decNew.lte(0)) {
        return res.status(400).json({ success: false, message: 'Debt amount must be greater than zero.' });
      }

      const activePayments = await prisma.debt_payments.aggregate({
        _sum: { amount: true },
        where: { debt_id: debtIdBig, reversed_at: null },
      });

      const paidVal = new Decimal(activePayments._sum.amount ? activePayments._sum.amount.toString() : 0);

      if (paidVal.gt(0) && decNew.lt(paidVal)) {
        return res.status(400).json({
          success: false,
          message: `New debt amount (${decNew.toFixed(2)}) cannot be lower than already paid amount (${paidVal.toFixed(2)}).`,
        });
      }

      dataToUpdate.original_amount = new Prisma.Decimal(decNew.toFixed(2));

      let newStatus = 'OPEN';
      if (paidVal.gte(decNew)) {
        newStatus = 'PAID';
      } else if (paidVal.gt(0)) {
        newStatus = 'PARTIALLY_PAID';
      }
      dataToUpdate.status = newStatus;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes provided.',
        debt: {
          ...existing,
          id: Number(existing.id),
          fisher_id: Number(existing.fisher_id),
          charge_type_id: existing.charge_type_id ? Number(existing.charge_type_id) : null,
          original_amount: new Decimal(existing.original_amount.toString()).toFixed(2),
        },
      });
    }

    const updated = await prisma.fisher_debts.update({
      where: { id: debtIdBig },
      data: dataToUpdate,
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { debtId: Number(id), fisherId: Number(updated.fisher_id) },
    });

    return res.status(200).json({
      success: true,
      message: 'Debt record updated successfully.',
      debt: {
        ...updated,
        id: Number(updated.id),
        fisher_id: Number(updated.fisher_id),
        charge_type_id: updated.charge_type_id ? Number(updated.charge_type_id) : null,
        original_amount: new Decimal(updated.original_amount.toString()).toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/:id/cancel
 * Cancel an unpaid debt record
 */
const cancelDebt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required.' });
    }

    const debtIdBig = BigInt(id);
    const existing = await prisma.fisher_debts.findUnique({
      where: { id: debtIdBig },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Debt record not found.' });
    }

    if (existing.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Debt is already cancelled.' });
    }

    const activePaymentsCount = await prisma.debt_payments.count({
      where: { debt_id: debtIdBig, reversed_at: null },
    });

    if (activePaymentsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a debt with active payments. Reverse all payments first.',
      });
    }

    const updated = await prisma.fisher_debts.update({
      where: { id: debtIdBig },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_admin_id: req.admin?.id || 1,
        cancellation_reason: cancellationReason.trim(),
      },
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_CANCELLED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { debtId: Number(id), fisherId: Number(updated.fisher_id), reason: cancellationReason.trim() },
    });

    return res.status(200).json({
      success: true,
      message: 'Debt record cancelled successfully.',
      debt: {
        ...updated,
        id: Number(updated.id),
        fisher_id: Number(updated.fisher_id),
        charge_type_id: updated.charge_type_id ? Number(updated.charge_type_id) : null,
        cancelled_by_admin_id: updated.cancelled_by_admin_id ? Number(updated.cancelled_by_admin_id) : null,
        original_amount: new Decimal(updated.original_amount.toString()).toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/debts/:debtId/payments
 * Record a payment with transaction safety & UUID idempotency check
 */
const recordPayment = async (req, res, next) => {
  try {
    const { debtId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNo, notes, idempotencyKey } = req.body;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ success: false, message: 'Idempotency key is required.' });
    }
    const key = idempotencyKey.trim();

    // 1. Idempotency Check pre-flight
    const existingKey = await prisma.debt_payments.findUnique({
      where: { idempotency_key: key },
    });

    if (existingKey) {
      const reqAmountDec = new Decimal(amount || 0).toFixed(2);
      const existAmountDec = new Decimal(existingKey.amount ? existingKey.amount.toString() : 0).toFixed(2);
      const reqDate = paymentDate ? String(paymentDate).trim() : getColomboTodayDateString();
      const existDate = existingKey.payment_date ? new Date(existingKey.payment_date).toISOString().split('T')[0] : '';

      if (
        String(existingKey.debt_id) === String(debtId) &&
        existAmountDec === reqAmountDec &&
        existDate === reqDate
      ) {
        return res.status(200).json({
          success: true,
          message: 'Payment already recorded.',
          payment: {
            ...existingKey,
            id: Number(existingKey.id),
            debt_id: Number(existingKey.debt_id),
            fisher_id: Number(existingKey.fisher_id),
            received_by_admin_id: Number(existingKey.received_by_admin_id),
            amount: existAmountDec,
          },
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another payment.',
      });
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }
    const decPayAmount = new Decimal(amount);
    if (decPayAmount.lte(0)) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    const validPaymentDateStr = paymentDate ? String(paymentDate).trim() : getColomboTodayDateString();
    const validPaymentDate = new Date(`${validPaymentDateStr}T00:00:00.000Z`);

    const debtIdBig = BigInt(debtId);

    const result = await prisma.$transaction(async (tx) => {
      const debts = await tx.$queryRaw`SELECT * FROM fisher_debts WHERE id = ${debtIdBig} FOR UPDATE`;
      if (!debts || debts.length === 0) {
        const err = new Error('Debt record not found.');
        err.statusCode = 404;
        throw err;
      }
      const debt = debts[0];

      await tx.$queryRaw`SELECT id FROM fishers WHERE id = ${debt.fisher_id} FOR UPDATE`;

      if (debt.status === 'CANCELLED') {
        const err = new Error('A cancelled debt cannot receive payments.');
        err.statusCode = 400;
        throw err;
      }

      const activePayments = await tx.debt_payments.aggregate({
        _sum: { amount: true },
        where: { debt_id: debtIdBig, reversed_at: null },
      });

      const currentPaid = new Decimal(activePayments._sum.amount ? activePayments._sum.amount.toString() : 0);
      const origAmount = new Decimal(debt.original_amount ? debt.original_amount.toString() : 0);
      const currentOutstanding = origAmount.minus(currentPaid);

      if (decPayAmount.gt(currentOutstanding)) {
        const err = new Error(`Payment amount (${decPayAmount.toFixed(2)}) cannot exceed the outstanding balance (${currentOutstanding.toFixed(2)}).`);
        err.statusCode = 400;
        throw err;
      }

      const createdPayment = await tx.debt_payments.create({
        data: {
          debt_id: debtIdBig,
          fisher_id: debt.fisher_id,
          amount: new Prisma.Decimal(decPayAmount.toFixed(2)),
          payment_date: validPaymentDate,
          payment_method: paymentMethod ? paymentMethod.trim() : 'CASH',
          reference_no: referenceNo ? referenceNo.trim() : null,
          notes: notes ? notes.trim() : null,
          idempotency_key: key,
          received_by_admin_id: req.admin?.id || 1,
        },
      });

      const newTotalPaid = currentPaid.plus(decPayAmount);
      let newDebtStatus = 'OPEN';
      if (newTotalPaid.gte(origAmount)) {
        newDebtStatus = 'PAID';
      } else if (newTotalPaid.gt(0)) {
        newDebtStatus = 'PARTIALLY_PAID';
      }

      await tx.fisher_debts.update({
        where: { id: debtIdBig },
        data: { status: newDebtStatus },
      });

      return { createdPayment, debt, newDebtStatus };
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'PAYMENT_RECORDED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        paymentId: Number(result.createdPayment.id),
        debtId: Number(debtIdBig),
        fisherId: Number(result.debt.fisher_id),
        amount: decPayAmount.toFixed(2),
        newDebtStatus: result.newDebtStatus,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      payment: {
        ...result.createdPayment,
        id: Number(result.createdPayment.id),
        debt_id: Number(result.createdPayment.debt_id),
        fisher_id: Number(result.createdPayment.fisher_id),
        received_by_admin_id: Number(result.createdPayment.received_by_admin_id),
        amount: decPayAmount.toFixed(2),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingPay = await prisma.debt_payments.findUnique({
        where: { idempotency_key: req.body.idempotencyKey },
      });
      if (existingPay) {
        return res.status(200).json({
          success: true,
          message: 'Payment already recorded.',
          payment: {
            ...existingPay,
            id: Number(existingPay.id),
            debt_id: Number(existingPay.debt_id),
            fisher_id: Number(existingPay.fisher_id),
            received_by_admin_id: Number(existingPay.received_by_admin_id),
            amount: new Decimal(existingPay.amount.toString()).toFixed(2),
          },
        });
      }
      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another payment.',
      });
    }

    next(error);
  }
};

/**
 * POST /api/payments/:paymentId/reverse
 * Reverse a completed payment
 */
const reversePayment = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { reversalReason } = req.body;

    if (!reversalReason || !reversalReason.trim()) {
      return res.status(400).json({ success: false, message: 'Reversal reason is required.' });
    }

    const paymentIdBig = BigInt(paymentId);

    const result = await prisma.$transaction(async (tx) => {
      const payments = await tx.$queryRaw`SELECT * FROM debt_payments WHERE id = ${paymentIdBig} FOR UPDATE`;
      if (!payments || payments.length === 0) {
        const err = new Error('Payment record not found.');
        err.statusCode = 404;
        throw err;
      }
      const payment = payments[0];

      await tx.$queryRaw`SELECT id FROM fishers WHERE id = ${payment.fisher_id} FOR UPDATE`;

      if (payment.reversed_at) {
        const err = new Error('Payment is already reversed.');
        err.statusCode = 400;
        throw err;
      }

      const updatedPayment = await tx.debt_payments.update({
        where: { id: paymentIdBig },
        data: {
          reversed_at: new Date(),
          reversed_by_admin_id: req.admin?.id || 1,
          reversal_reason: reversalReason.trim(),
        },
      });

      const debts = await tx.$queryRaw`SELECT * FROM fisher_debts WHERE id = ${payment.debt_id} FOR UPDATE`;
      if (debts && debts.length > 0) {
        const debt = debts[0];
        const activePayments = await tx.debt_payments.aggregate({
          _sum: { amount: true },
          where: { debt_id: debt.id, reversed_at: null },
        });

        const totalPaid = new Decimal(activePayments._sum.amount ? activePayments._sum.amount.toString() : 0);
        const origAmount = new Decimal(debt.original_amount ? debt.original_amount.toString() : 0);

        let newStatus = 'OPEN';
        if (totalPaid.gte(origAmount)) {
          newStatus = 'PAID';
        } else if (totalPaid.gt(0)) {
          newStatus = 'PARTIALLY_PAID';
        }

        await tx.fisher_debts.update({
          where: { id: debt.id },
          data: { status: newStatus },
        });
      }

      return { updatedPayment, payment };
    });

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'PAYMENT_REVERSED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        paymentId: Number(paymentIdBig),
        debtId: Number(result.payment.debt_id),
        fisherId: Number(result.payment.fisher_id),
        amount: new Decimal(result.payment.amount.toString()).toFixed(2),
        reason: reversalReason.trim(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Payment reversed successfully.',
      payment: {
        ...result.updatedPayment,
        id: Number(result.updatedPayment.id),
        debt_id: Number(result.updatedPayment.debt_id),
        fisher_id: Number(result.updatedPayment.fisher_id),
        received_by_admin_id: Number(result.updatedPayment.received_by_admin_id),
        reversed_by_admin_id: result.updatedPayment.reversed_by_admin_id ? Number(result.updatedPayment.reversed_by_admin_id) : null,
        amount: new Decimal(result.updatedPayment.amount.toString()).toFixed(2),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/fishers/:fisherId/financial-summary
 * Get financial summary & clearance status for a Fisher
 */
const getFisherFinancialInfo = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const { getFisherFinancialSummary, getFisherClearanceStatus } = require('../services/financialService');

    const summary = await getFisherFinancialSummary(fisherId);
    const clearance = await getFisherClearanceStatus(fisherId);

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
        financialSummary: summary,
        clearanceStatus: clearance,
        debts: [],
      });
    }

    const debts = await prisma.fisher_debts.findMany({
      where: { fisher_id: fisher.id },
      include: {
        debt_payments: {
          orderBy: { id: 'desc' },
        },
      },
      orderBy: { id: 'desc' },
    });

    const debtsWithPayments = debts.map((d) => {
      let paidSum = new Decimal(0);
      const payments = d.debt_payments.map((p) => {
        if (!p.reversed_at) {
          paidSum = paidSum.plus(new Decimal(p.amount ? p.amount.toString() : 0));
        }
        return {
          id: Number(p.id),
          debt_id: Number(p.debt_id),
          fisher_id: Number(p.fisher_id),
          amount: new Decimal(p.amount.toString()).toFixed(2),
          payment_date: p.payment_date,
          payment_method: p.payment_method,
          reference_no: p.reference_no,
          notes: p.notes,
          reversed_at: p.reversed_at,
          reversal_reason: p.reversal_reason,
          created_at: p.created_at,
        };
      });

      const origDec = new Decimal(d.original_amount ? d.original_amount.toString() : 0);
      let outDec = origDec.minus(paidSum);
      if (outDec.isNegative() || d.status === 'PAID' || d.status === 'CANCELLED') {
        outDec = new Decimal(0);
      }

      return {
        id: Number(d.id),
        fisher_id: Number(d.fisher_id),
        charge_type_id: d.charge_type_id ? Number(d.charge_type_id) : null,
        category: d.category,
        description: d.description,
        original_amount: origDec.toFixed(2),
        debt_date: d.debt_date,
        due_date: d.due_date,
        status: d.status,
        notes: d.notes,
        created_at: d.created_at,
        paid_amount: paidSum.toFixed(2),
        outstanding_amount: outDec.toFixed(2),
        payments,
      };
    });

    return res.status(200).json({
      success: true,
      financialSummary: summary,
      clearanceStatus: clearance,
      debts: debtsWithPayments,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDebts,
  createDebt,
  updateDebt,
  cancelDebt,
  recordPayment,
  reversePayment,
  getFisherFinancialInfo,
};
