const prisma = require('../config/prismaClient');

/**
 * Helper: Get current date formatted as YYYY-MM-DD in Asia/Colombo timezone.
 */
function getColomboCurrentDateString(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(dateObj); // returns YYYY-MM-DD
}

/**
 * Helper: Add X days to a YYYY-MM-DD date string.
 */
function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper: Get total days in a given year and month (month is 1-indexed: 1-12).
 */
function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Helper: Generate monthly due dates preserving day-of-month and end-of-month anchors.
 */
function generateInstallmentSchedule({
  startingBalance,
  monthlyInstallmentAmount,
  firstDueDate,
  gracePeriodDays = 0,
}) {
  const numStartingBalance = Number(startingBalance);
  const numMonthlyAmount = Number(monthlyInstallmentAmount);
  const numGraceDays = Number(gracePeriodDays) || 0;

  if (numStartingBalance <= 0 || numMonthlyAmount <= 0) {
    throw new Error('Starting balance and monthly installment amount must be greater than zero.');
  }

  const [firstYear, firstMonth, firstDay] = firstDueDate.split('-').map(Number);
  const firstMonthDays = getDaysInMonth(firstYear, firstMonth);
  const isMonthEndAnchor = firstDay === firstMonthDays;
  const anchorDay = firstDay;

  const totalDuesCount = Math.ceil(numStartingBalance / numMonthlyAmount);
  const dues = [];

  let remaining = numStartingBalance;

  for (let i = 0; i < totalDuesCount; i++) {
    let dueDateStr = '';
    if (i === 0) {
      dueDateStr = firstDueDate;
    } else {
      const monthOffset = (firstMonth - 1) + i;
      const targetYear = firstYear + Math.floor(monthOffset / 12);
      const targetMonth = (monthOffset % 12) + 1;
      const maxDaysInTargetMonth = getDaysInMonth(targetYear, targetMonth);

      const dueDay = isMonthEndAnchor
        ? maxDaysInTargetMonth
        : Math.min(anchorDay, maxDaysInTargetMonth);

      const yStr = String(targetYear);
      const mStr = String(targetMonth).padStart(2, '0');
      const dStr = String(dueDay).padStart(2, '0');
      dueDateStr = `${yStr}-${mStr}-${dStr}`;
    }

    const dueAmount = Math.min(numMonthlyAmount, remaining);
    remaining = Math.max(0, Number((remaining - dueAmount).toFixed(2)));

    const effectiveOverdueDeadlineStr = addDaysToDateString(dueDateStr, numGraceDays);

    dues.push({
      installment_number: i + 1,
      due_date_str: dueDateStr,
      grace_period_days: numGraceDays,
      effective_overdue_deadline_date_str: effectiveOverdueDeadlineStr,
      due_amount: Number(dueAmount.toFixed(2)),
    });
  }

  return dues;
}

/**
 * Calculate plan coverage and status based on post-baseline payments and dues schedule.
 */
function calculatePlanCoverageAndStatus(plan, payments = [], debtCurrentBalance = 0, todayStr = getColomboCurrentDateString()) {
  const planStartingPaymentId = BigInt(plan.starting_payment_id || 0);

  // 1. Check pre-plan payment baseline inconsistency
  const prePlanReversals = payments.filter((p) => {
    if (BigInt(p.id) > planStartingPaymentId) return false;
    const isReversed = p.reversed_at != null || p.is_reversed === true;
    if (!isReversed) return false;
    if (!p.reversed_at) return true; // reversed without timestamp -> treat as post-plan reversal
    return new Date(p.reversed_at) > new Date(plan.created_at);
  });

  if (prePlanReversals.length > 0) {
    return {
      planStatus: plan.status,
      isManualReviewRequired: true,
      manualReviewReason: 'PRE_PLAN_PAYMENT_REVERSED',
      overdueDuesCount: 0,
      overdueAmount: 0,
      duesWithCoverage: [],
    };
  }

  // 2. Check COMPLETED plan status
  if (plan.status === 'COMPLETED') {
    if (debtCurrentBalance > 0) {
      return {
        planStatus: 'COMPLETED',
        isManualReviewRequired: true,
        manualReviewReason: 'COMPLETED_PLAN_WITH_OUTSTANDING_BALANCE',
        overdueDuesCount: 0,
        overdueAmount: 0,
        duesWithCoverage: [],
      };
    }
    return {
      planStatus: 'COMPLETED',
      isManualReviewRequired: false,
      manualReviewReason: null,
      overdueDuesCount: 0,
      overdueAmount: 0,
      duesWithCoverage: [],
    };
  }

  if (plan.status !== 'ACTIVE') {
    return {
      planStatus: plan.status,
      isManualReviewRequired: false,
      manualReviewReason: null,
      overdueDuesCount: 0,
      overdueAmount: 0,
      duesWithCoverage: [],
    };
  }

  // 3. For ACTIVE plans, aggregate post-baseline valid payments
  const postPlanPayments = payments
    .filter((p) => BigInt(p.id) > planStartingPaymentId && p.reversed_at == null && !p.is_reversed)
    .sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)));

  let totalAllocatable = postPlanPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const dues = [...(plan.installment_dues || [])].sort((a, b) => a.installment_number - b.installment_number);

  let overdueDuesCount = 0;
  let overdueAmount = 0;

  const duesWithCoverage = dues.map((due) => {
    const dueAmt = Number(due.due_amount);
    const dueDateStr = due.due_date instanceof Date
      ? due.due_date.toISOString().slice(0, 10)
      : String(due.due_date).slice(0, 10);
    const effectiveDeadlineStr = addDaysToDateString(dueDateStr, plan.grace_days || 0);

    const allocated = Math.min(dueAmt, totalAllocatable);
    totalAllocatable = Math.max(0, totalAllocatable - allocated);

    const isPaid = allocated >= dueAmt - 0.001;
    const unpaidAmt = Number((dueAmt - allocated).toFixed(2));
    const isOverdue = !isPaid && todayStr > effectiveDeadlineStr;

    if (isOverdue) {
      overdueDuesCount++;
      overdueAmount += unpaidAmt;
    }

    return {
      id: due.id ? due.id.toString() : null,
      installment_number: due.installment_number,
      due_date_str: dueDateStr,
      effective_overdue_deadline_date_str: effectiveDeadlineStr,
      due_amount: dueAmt,
      allocatedAmount: Number(allocated.toFixed(2)),
      unpaidAmount: unpaidAmt,
      isPaid,
      isOverdue,
    };
  });

  return {
    planStatus: 'ACTIVE',
    isManualReviewRequired: false,
    manualReviewReason: null,
    overdueDuesCount,
    overdueAmount: Number(overdueAmount.toFixed(2)),
    duesWithCoverage,
  };
}

/**
 * Create a new Installment Plan atomically within a Prisma transaction with row locks.
 * Authoritative fisher_id is ALWAYS extracted from the locked fisher_debts row.
 */
async function createInstallmentPlan({
  adminId,
  debtId,
  fisherId, // optional validation param, authoritative fisher_id is extracted from locked debt
  monthlyInstallmentAmount,
  firstDueDate,
  gracePeriodDays = 0,
  notes = '',
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock linked debt row using SELECT ... FOR UPDATE
    const lockedDebts = await tx.$queryRaw`
      SELECT id, fisher_id, original_amount, status 
      FROM fisher_debts 
      WHERE id = ${BigInt(debtId)} 
      FOR UPDATE
    `;

    if (!lockedDebts || lockedDebts.length === 0) {
      throw new Error('Debt record not found.');
    }

    const lockedDebt = lockedDebts[0];

    // Authoritative fisher_id comes FROM the locked debt row!
    const authoritativeFisherId = BigInt(lockedDebt.fisher_id);

    // If request included a fisherId, reject if it does not match the locked debt's fisher_id
    if (fisherId != null && BigInt(fisherId) !== authoritativeFisherId) {
      throw new Error('Mismatched fisher ID: Debt belongs to a different fisher.');
    }

    // 2. Check for existing ACTIVE installment plan
    const activePlan = await tx.installment_plans.findFirst({
      where: {
        debt_id: BigInt(debtId),
        status: 'ACTIVE',
      },
    });

    if (activePlan) {
      throw new Error('An ACTIVE installment plan already exists for this debt.');
    }

    // 3. Calculate authoritative starting balance inside locked transaction
    const validPayments = await tx.debt_payments.findMany({
      where: {
        debt_id: BigInt(debtId),
        reversed_at: null,
      },
    });

    const totalPaid = validPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const authStartingBalance = Number((Number(lockedDebt.original_amount) - totalPaid).toFixed(2));

    if (authStartingBalance <= 0) {
      throw new Error('Cannot create installment plan for a debt with no remaining outstanding balance.');
    }

    // 4. Determine starting_payment_id inside locked transaction
    const latestPayment = await tx.debt_payments.findFirst({
      where: { debt_id: BigInt(debtId) },
      orderBy: { id: 'desc' },
    });

    const startingPaymentId = latestPayment ? BigInt(latestPayment.id) : 0n;

    // 5. Generate schedule
    const schedule = generateInstallmentSchedule({
      startingBalance: authStartingBalance,
      monthlyInstallmentAmount,
      firstDueDate,
      gracePeriodDays,
    });

    const newPlan = await tx.installment_plans.create({
      data: {
        fisher_id: authoritativeFisherId,
        debt_id: BigInt(debtId),
        starting_balance: authStartingBalance,
        starting_payment_id: startingPaymentId,
        monthly_amount: Number(monthlyInstallmentAmount),
        first_due_date: new Date(firstDueDate),
        grace_days: Number(gracePeriodDays) || 0,
        status: 'ACTIVE',
        notes: notes ? notes.trim() : null,
        created_by_admin_id: Number(adminId),
      },
    });

    // 7. Create installment dues
    const dueRecords = schedule.map((d) => ({
      plan_id: newPlan.id,
      installment_number: d.installment_number,
      due_date: new Date(d.due_date_str),
      due_amount: d.due_amount,
    }));

    await tx.installment_dues.createMany({
      data: dueRecords,
    });

    return newPlan;
  });
}

/**
 * Cancel an ACTIVE Installment Plan.
 */
async function cancelInstallmentPlan({ adminId, planId, cancellationReason }) {
  if (!cancellationReason || !cancellationReason.trim()) {
    throw new Error('Cancellation reason is required.');
  }

  return await prisma.$transaction(async (tx) => {
    const plan = await tx.installment_plans.findUnique({
      where: { id: BigInt(planId) },
    });

    if (!plan) {
      throw new Error('Installment plan not found.');
    }

    if (plan.status !== 'ACTIVE') {
      throw new Error(`Cannot cancel a plan with status '${plan.status}'.`);
    }

    const updatedPlan = await tx.installment_plans.update({
      where: { id: BigInt(planId) },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_admin_id: Number(adminId),
        cancellation_reason: cancellationReason.trim(),
      },
    });

    return updatedPlan;
  });
}

module.exports = {
  getColomboCurrentDateString,
  addDaysToDateString,
  generateInstallmentSchedule,
  calculatePlanCoverageAndStatus,
  createInstallmentPlan,
  cancelInstallmentPlan,
};

