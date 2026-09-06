const Decimal = require('decimal.js');
const db = require('../config/db');
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
    const offset = (pageNum - 1) * limitNum;

    // 1. Build search condition across Fisher fields
    const searchConditions = [];
    const searchParams = [];
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      searchConditions.push(
        '(f.fisher_id LIKE ? OR f.full_name LIKE ? OR f.nic LIKE ? OR f.phone LIKE ? OR f.boat_no LIKE ?)'
      );
      const searchPattern = `%${trimmedSearch}%`;
      searchParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const searchWhereSql = searchConditions.length > 0 ? `AND ${searchConditions.join(' AND ')}` : '';

    // 2. Base query fetching non-archived fishers and their debts with total paid
    let debtStatusWhereSql = '';
    const queryParams = [...searchParams];

    if (statusFilter === 'OUTSTANDING' || statusFilter === 'DEBT_HOLD') {
      debtStatusWhereSql = "AND d.status != 'CANCELLED' AND d.status != 'PAID'";
    } else if (statusFilter === 'FULLY_PAID') {
      debtStatusWhereSql = "AND d.status = 'PAID'";
    } else if (statusFilter === 'CANCELLED') {
      debtStatusWhereSql = "AND d.status = 'CANCELLED'";
    }

    const countSql = `
      SELECT COUNT(*) as total
      FROM fisher_debts d
      JOIN fishers f ON d.fisher_id = f.id
      WHERE f.is_archived = FALSE ${debtStatusWhereSql} ${searchWhereSql}
    `;
    const [countRows] = await db.query(countSql, queryParams);
    const total = countRows[0]?.total || 0;

    const listSql = `
      SELECT 
        d.id, d.fisher_id, d.category, d.description, d.original_amount, d.debt_date, d.due_date,
        d.status, d.notes, d.cancelled_at, d.cancellation_reason, d.created_at, d.updated_at,
        f.fisher_id as custom_fisher_id, f.full_name, f.nic, f.phone, f.boat_no, f.status as base_fisher_status,
        COALESCE(SUM(CASE WHEN p.reversed_at IS NULL THEN p.amount ELSE 0 END), 0) as total_paid
      FROM fisher_debts d
      JOIN fishers f ON d.fisher_id = f.id
      LEFT JOIN debt_payments p ON d.id = p.debt_id
      WHERE f.is_archived = FALSE ${debtStatusWhereSql} ${searchWhereSql}
      GROUP BY d.id
      ORDER BY d.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rawItems] = await db.query(listSql, [...queryParams, limitNum, offset]);

    // Format item values using decimal.js
    const items = rawItems.map((item) => {
      const orig = new Decimal(item.original_amount || 0);
      const paid = new Decimal(item.total_paid || 0);
      let outstanding = orig.minus(paid);
      if (outstanding.isNegative() || item.status === 'CANCELLED' || item.status === 'PAID') {
        outstanding = new Decimal(0);
      }

      return {
        ...item,
        original_amount: orig.toFixed(2),
        total_paid: paid.toFixed(2),
        outstanding_amount: outstanding.toFixed(2),
      };
    });

    // 3. Top Metric Cards Calculation
    // Total Outstanding: Sum of non-cancelled debts minus non-reversed payments across all non-archived fishers
    const [allNonCancelledDebts] = await db.query(`
      SELECT d.original_amount
      FROM fisher_debts d
      JOIN fishers f ON d.fisher_id = f.id
      WHERE d.status != 'CANCELLED' AND f.is_archived = FALSE
    `);

    const [allNonReversedPayments] = await db.query(`
      SELECT p.amount
      FROM debt_payments p
      JOIN fishers f ON p.fisher_id = f.id
      WHERE p.reversed_at IS NULL AND f.is_archived = FALSE
    `);

    let globalTotalDebt = new Decimal(0);
    for (const d of allNonCancelledDebts) {
      globalTotalDebt = globalTotalDebt.plus(new Decimal(d.original_amount || 0));
    }

    let globalTotalPaid = new Decimal(0);
    for (const p of allNonReversedPayments) {
      globalTotalPaid = globalTotalPaid.plus(new Decimal(p.amount || 0));
    }

    let totalOutstanding = globalTotalDebt.minus(globalTotalPaid);
    if (totalOutstanding.isNegative()) {
      totalOutstanding = new Decimal(0);
    }

    // Fishers With Debt: Distinct non-archived fishers whose total current outstanding > 0
    const [fisherBalanceRows] = await db.query(`
      SELECT 
        f.id as fisher_id,
        COALESCE(SUM(d.original_amount), 0) as sum_debt,
        COALESCE(SUM(p.amount), 0) as sum_paid
      FROM fishers f
      LEFT JOIN fisher_debts d ON f.id = d.fisher_id AND d.status != 'CANCELLED'
      LEFT JOIN debt_payments p ON f.id = p.fisher_id AND p.reversed_at IS NULL
      WHERE f.is_archived = FALSE
      GROUP BY f.id
    `);

    let fishersWithDebtCount = 0;
    let fullyPaidFishersCount = 0;

    // Check historical debt per fisher for Fully Paid metric calculation
    const [fishersWithHistoricalDebts] = await db.query(`
      SELECT DISTINCT fisher_id
      FROM fisher_debts
      WHERE status != 'CANCELLED'
    `);
    const historicalFisherIds = new Set(fishersWithHistoricalDebts.map((r) => r.fisher_id));

    for (const fb of fisherBalanceRows) {
      const debtVal = new Decimal(fb.sum_debt || 0);
      const paidVal = new Decimal(fb.sum_paid || 0);
      const outVal = debtVal.minus(paidVal);

      if (outVal.gt(0)) {
        fishersWithDebtCount += 1;
      } else if (historicalFisherIds.has(fb.fisher_id) && outVal.lte(0)) {
        fullyPaidFishersCount += 1;
      }
    }

    // Payments Today: Sum of non-reversed payments where payment_date = Asia/Colombo today
    const colomboToday = getColomboTodayDateString();
    const [paymentsTodayRows] = await db.query(
      `SELECT amount FROM debt_payments WHERE reversed_at IS NULL AND payment_date = ?`,
      [colomboToday]
    );

    let paymentsTodayVal = new Decimal(0);
    for (const pt of paymentsTodayRows) {
      paymentsTodayVal = paymentsTodayVal.plus(new Decimal(pt.amount || 0));
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
  let connection;
  try {
    const { fisherId } = req.params;
    const { chargeTypeId, charge_type_id, category, description, originalAmount, debtDate, dueDate, notes } = req.body;

    const targetChargeTypeId = chargeTypeId || charge_type_id;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock Fisher FOR UPDATE to prevent race conditions with Grant Clearance
    const [fishers] = await connection.query(
      'SELECT id, fisher_id, full_name, is_archived FROM fishers WHERE id = ? OR fisher_id = ? FOR UPDATE',
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
        message: 'Cannot add debt to an archived fisher record.',
      });
    }

    let finalChargeTypeId = null;
    let finalCategory = category ? String(category).trim() : '';

    // Validate Charge Type if provided
    if (targetChargeTypeId) {
      const [chargeTypes] = await connection.query(
        'SELECT id, name, default_amount, is_active FROM charge_types WHERE id = ?',
        [targetChargeTypeId]
      );
      if (chargeTypes.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Selected charge type not found.' });
      }

      const ct = chargeTypes[0];
      if (!ct.is_active) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ success: false, message: 'Selected charge type is inactive.' });
      }

      finalChargeTypeId = ct.id;
      finalCategory = ct.name; // Snapshot Charge Type name into category
    }

    if (!finalCategory) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Debt category or charge type is required.' });
    }

    // Validate Amount using decimal.js
    if (!originalAmount || isNaN(originalAmount)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Valid debt amount is required.' });
    }
    const decAmount = new Decimal(originalAmount);
    if (decAmount.lte(0)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Debt amount must be greater than zero.' });
    }

    // Validate Debt Date
    const validDebtDate = debtDate ? String(debtDate).trim() : getColomboTodayDateString();

    // Insert Debt
    const [insertRes] = await connection.query(
      `INSERT INTO fisher_debts 
       (fisher_id, charge_type_id, category, description, original_amount, debt_date, due_date, status, notes, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      [
        fisher.id,
        finalChargeTypeId,
        finalCategory,
        description ? description.trim() : null,
        decAmount.toFixed(2),
        validDebtDate,
        dueDate ? String(dueDate).trim() : null,
        notes ? notes.trim() : null,
        req.admin?.id || 1,
      ]
    );

    const newDebtId = insertRes.insertId;

    await connection.commit();
    connection.release();
    connection = null;

    // Audit Log
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        debtId: newDebtId,
        fisherId: fisher.id,
        customFisherId: fisher.fisher_id,
        chargeTypeId: finalChargeTypeId,
        category: finalCategory,
        originalAmount: decAmount.toFixed(2),
      },
    });

    const [createdRows] = await db.query('SELECT * FROM fisher_debts WHERE id = ?', [newDebtId]);

    return res.status(201).json({
      success: true,
      message: 'Debt record created successfully.',
      debt: createdRows[0],
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
 * PATCH /api/debts/:id
 * Edit debt record
 */
const updateDebt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, description, originalAmount, debtDate, dueDate, notes } = req.body;

    const [existing] = await db.query('SELECT * FROM fisher_debts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Debt record not found.' });
    }
    const debt = existing[0];

    if (debt.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot edit a cancelled debt record.' });
    }

    const updates = [];
    const queryParams = [];

    if (category !== undefined) {
      if (!category || !category.trim()) {
        return res.status(400).json({ success: false, message: 'Category cannot be empty.' });
      }
      updates.push('category = ?');
      queryParams.push(category.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      queryParams.push(description ? description.trim() : null);
    }

    if (debtDate !== undefined) {
      updates.push('debt_date = ?');
      queryParams.push(debtDate ? String(debtDate).trim() : debt.debt_date);
    }

    if (dueDate !== undefined) {
      updates.push('due_date = ?');
      queryParams.push(dueDate ? String(dueDate).trim() : null);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      queryParams.push(notes ? notes.trim() : null);
    }

    // Amount change check
    if (originalAmount !== undefined) {
      const decNew = new Decimal(originalAmount);
      if (decNew.lte(0)) {
        return res.status(400).json({ success: false, message: 'Debt amount must be greater than zero.' });
      }

      // Query valid non-reversed payments
      const [payments] = await db.query(
        'SELECT SUM(amount) as paid FROM debt_payments WHERE debt_id = ? AND reversed_at IS NULL',
        [id]
      );
      const paidVal = new Decimal(payments[0]?.paid || 0);

      if (paidVal.gt(0) && decNew.lt(paidVal)) {
        return res.status(400).json({
          success: false,
          message: `New debt amount (${decNew.toFixed(2)}) cannot be lower than already paid amount (${paidVal.toFixed(2)}).`,
        });
      }

      updates.push('original_amount = ?');
      queryParams.push(decNew.toFixed(2));

      // Recalculate status based on payments
      let newStatus = 'OPEN';
      if (paidVal.gte(decNew)) {
        newStatus = 'PAID';
      } else if (paidVal.gt(0)) {
        newStatus = 'PARTIALLY_PAID';
      }
      updates.push('status = ?');
      queryParams.push(newStatus);
    }

    if (updates.length === 0) {
      return res.status(200).json({ success: true, message: 'No changes provided.', debt });
    }

    queryParams.push(id);
    await db.query(`UPDATE fisher_debts SET ${updates.join(', ')} WHERE id = ?`, queryParams);

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { debtId: id, fisherId: debt.fisher_id },
    });

    const [updated] = await db.query('SELECT * FROM fisher_debts WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Debt record updated successfully.',
      debt: updated[0],
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

    const [existing] = await db.query('SELECT * FROM fisher_debts WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Debt record not found.' });
    }
    const debt = existing[0];

    if (debt.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Debt is already cancelled.' });
    }

    // Ensure no unreversed payments exist
    const [payments] = await db.query(
      'SELECT id FROM debt_payments WHERE debt_id = ? AND reversed_at IS NULL',
      [id]
    );

    if (payments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a debt with active payments. Reverse all payments first.',
      });
    }

    await db.query(
      `UPDATE fisher_debts 
       SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancelled_by_admin_id = ?, cancellation_reason = ?
       WHERE id = ?`,
      [req.admin?.id || 1, cancellationReason.trim(), id]
    );

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'DEBT_CANCELLED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { debtId: id, fisherId: debt.fisher_id, reason: cancellationReason.trim() },
    });

    const [updated] = await db.query('SELECT * FROM fisher_debts WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Debt record cancelled successfully.',
      debt: updated[0],
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
  let connection;
  try {
    const { debtId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNo, notes, idempotencyKey } = req.body;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return res.status(400).json({ success: false, message: 'Idempotency key is required.' });
    }
    const key = idempotencyKey.trim();

    // 1. Idempotency Check: Pre-flight check in database
    const [existingKeyRows] = await db.query('SELECT * FROM debt_payments WHERE idempotency_key = ?', [key]);
    if (existingKeyRows.length > 0) {
      const existingPay = existingKeyRows[0];
      const reqAmountDec = new Decimal(amount || 0).toFixed(2);
      const existAmountDec = new Decimal(existingPay.amount || 0).toFixed(2);
      const reqDate = paymentDate ? String(paymentDate).trim() : getColomboTodayDateString();
      const existDate = existingPay.payment_date ? String(existingPay.payment_date).split('T')[0] : '';

      // Check payload equivalence (debt_id, fisher_id, amount, payment_date)
      if (
        String(existingPay.debt_id) === String(debtId) &&
        existAmountDec === reqAmountDec &&
        existDate === reqDate
      ) {
        return res.status(200).json({
          success: true,
          message: 'Payment already recorded.',
          payment: existingPay,
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Idempotency key has already been used for another payment.',
      });
    }

    // Validate payment amount using decimal.js
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }
    const decPayAmount = new Decimal(amount);
    if (decPayAmount.lte(0)) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    const validPaymentDate = paymentDate ? String(paymentDate).trim() : getColomboTodayDateString();

    // 2. Transaction Safety: Acquire Connection & Begin Transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // SELECT debt FOR UPDATE to prevent race conditions
    const [debts] = await connection.query('SELECT * FROM fisher_debts WHERE id = ? FOR UPDATE', [debtId]);
    if (debts.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Debt record not found.' });
    }
    const debt = debts[0];

    // Lock Fisher FOR UPDATE to prevent race conditions with Grant Clearance
    await connection.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [debt.fisher_id]);

    if (debt.status === 'CANCELLED') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'A cancelled debt cannot receive payments.' });
    }

    // Calculate current valid paid amount and outstanding balance
    const [paidRows] = await connection.query(
      'SELECT SUM(amount) as total_paid FROM debt_payments WHERE debt_id = ? AND reversed_at IS NULL',
      [debtId]
    );
    const currentPaid = new Decimal(paidRows[0]?.total_paid || 0);
    const origAmount = new Decimal(debt.original_amount);
    const currentOutstanding = origAmount.minus(currentPaid);

    // Overpayment Protection Check
    if (decPayAmount.gt(currentOutstanding)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Payment amount (${decPayAmount.toFixed(2)}) cannot exceed the outstanding balance (${currentOutstanding.toFixed(2)}).`,
      });
    }

    // Insert Payment
    const [insertRes] = await connection.query(
      `INSERT INTO debt_payments 
       (debt_id, fisher_id, amount, payment_date, payment_method, reference_no, notes, idempotency_key, received_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        debt.id,
        debt.fisher_id,
        decPayAmount.toFixed(2),
        validPaymentDate,
        paymentMethod ? paymentMethod.trim() : 'CASH',
        referenceNo ? referenceNo.trim() : null,
        notes ? notes.trim() : null,
        key,
        req.admin?.id || 1,
      ]
    );
    const newPaymentId = insertRes.insertId;

    // Recalculate debt status
    const newTotalPaid = currentPaid.plus(decPayAmount);
    let newDebtStatus = 'OPEN';
    if (newTotalPaid.gte(origAmount)) {
      newDebtStatus = 'PAID';
    } else if (newTotalPaid.gt(0)) {
      newDebtStatus = 'PARTIALLY_PAID';
    }

    await connection.query('UPDATE fisher_debts SET status = ? WHERE id = ?', [newDebtStatus, debt.id]);

    await connection.commit();
    connection.release();
    connection = null;

    // Audit Log
    await logAudit({
      adminId: req.admin?.id || null,
      action: 'PAYMENT_RECORDED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        paymentId: newPaymentId,
        debtId: debt.id,
        fisherId: debt.fisher_id,
        amount: decPayAmount.toFixed(2),
        newDebtStatus,
      },
    });

    const [createdPayment] = await db.query('SELECT * FROM debt_payments WHERE id = ?', [newPaymentId]);

    return res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      payment: createdPayment[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }

    // Handle ER_DUP_ENTRY for idempotency_key race conditions safely
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('idempotency_key')) {
      const [existingPayRows] = await db.query('SELECT * FROM debt_payments WHERE idempotency_key = ?', [
        req.body.idempotencyKey,
      ]);
      if (existingPayRows.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Payment already recorded.',
          payment: existingPayRows[0],
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
  let connection;
  try {
    const { paymentId } = req.params;
    const { reversalReason } = req.body;

    if (!reversalReason || !reversalReason.trim()) {
      return res.status(400).json({ success: false, message: 'Reversal reason is required.' });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [payments] = await connection.query('SELECT * FROM debt_payments WHERE id = ? FOR UPDATE', [
      paymentId,
    ]);

    if (payments.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }
    const payment = payments[0];

    // Lock Fisher FOR UPDATE to prevent race conditions with Grant Clearance
    await connection.query('SELECT id FROM fishers WHERE id = ? FOR UPDATE', [payment.fisher_id]);

    if (payment.reversed_at) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'Payment is already reversed.' });
    }

    // Mark payment reversed
    await connection.query(
      `UPDATE debt_payments 
       SET reversed_at = CURRENT_TIMESTAMP, reversed_by_admin_id = ?, reversal_reason = ?
       WHERE id = ?`,
      [req.admin?.id || 1, reversalReason.trim(), paymentId]
    );

    // Recalculate linked debt status
    const [debts] = await connection.query('SELECT * FROM fisher_debts WHERE id = ? FOR UPDATE', [
      payment.debt_id,
    ]);

    if (debts.length > 0) {
      const debt = debts[0];
      const [paidRows] = await connection.query(
        'SELECT SUM(amount) as total_paid FROM debt_payments WHERE debt_id = ? AND reversed_at IS NULL',
        [debt.id]
      );

      const totalPaid = new Decimal(paidRows[0]?.total_paid || 0);
      const origAmount = new Decimal(debt.original_amount);

      let newStatus = 'OPEN';
      if (totalPaid.gte(origAmount)) {
        newStatus = 'PAID';
      } else if (totalPaid.gt(0)) {
        newStatus = 'PARTIALLY_PAID';
      }

      await connection.query('UPDATE fisher_debts SET status = ? WHERE id = ?', [newStatus, debt.id]);
    }

    await connection.commit();
    connection.release();
    connection = null;

    await logAudit({
      adminId: req.admin?.id || null,
      action: 'PAYMENT_REVERSED',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        paymentId,
        debtId: payment.debt_id,
        fisherId: payment.fisher_id,
        amount: payment.amount,
        reason: reversalReason.trim(),
      },
    });

    const [updatedPayment] = await db.query('SELECT * FROM debt_payments WHERE id = ?', [paymentId]);

    return res.status(200).json({
      success: true,
      message: 'Payment reversed successfully.',
      payment: updatedPayment[0],
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
 * GET /api/fishers/:fisherId/financial-summary
 * Get financial summary & clearance status for a Fisher
 */
const getFisherFinancialInfo = async (req, res, next) => {
  try {
    const { fisherId } = req.params;
    const { getFisherFinancialSummary, getFisherClearanceStatus } = require('../services/financialService');

    const summary = await getFisherFinancialSummary(fisherId);
    const clearance = await getFisherClearanceStatus(fisherId);

    // Also fetch debts list with payment history
    const [debts] = await db.query(
      `SELECT id, category, description, original_amount, debt_date, due_date, status, notes, created_at
       FROM fisher_debts
       WHERE fisher_id = (SELECT id FROM fishers WHERE id = ? OR fisher_id = ? LIMIT 1)
       ORDER BY id DESC`,
      [fisherId, fisherId]
    );

    const debtsWithPayments = await Promise.all(
      debts.map(async (d) => {
        const [payments] = await db.query(
          `SELECT id, amount, payment_date, payment_method, reference_no, notes, reversed_at, reversal_reason, created_at
           FROM debt_payments
           WHERE debt_id = ?
           ORDER BY id DESC`,
          [d.id]
        );

        let paidSum = new Decimal(0);
        for (const p of payments) {
          if (!p.reversed_at) {
            paidSum = paidSum.plus(new Decimal(p.amount || 0));
          }
        }

        const origDec = new Decimal(d.original_amount || 0);
        let outDec = origDec.minus(paidSum);
        if (outDec.isNegative() || d.status === 'PAID' || d.status === 'CANCELLED') {
          outDec = new Decimal(0);
        }

        return {
          ...d,
          original_amount: origDec.toFixed(2),
          paid_amount: paidSum.toFixed(2),
          outstanding_amount: outDec.toFixed(2),
          payments,
        };
      })
    );

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
