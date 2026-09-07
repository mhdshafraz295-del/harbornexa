const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');
const { calculatePlanCoverageAndStatus, getColomboCurrentDateString } = require('./installmentService');

/**
 * Calculates authoritative financial summary for a Fisher using decimal.js & Prisma
 * 
 * @param {number|string} fisherId 
 * @param {Object} [dbClient] Optional Prisma Client or Transaction Client
 * @returns {Promise<{ totalDebt: string, totalPaid: string, outstandingDebt: string, openDebtCount: number, paidDebtCount: number }>}
 */
const getFisherFinancialSummary = async (fisherId, dbClient = prisma) => {
  const client = (dbClient && dbClient.fisher_debts) ? dbClient : prisma;
  const isNumeric = !isNaN(Number(fisherId));
  let realFisherId = null;

  if (isNumeric) {
    realFisherId = BigInt(fisherId);
  } else {
    const f = await client.fishers.findFirst({
      where: { fisher_id: String(fisherId) },
      select: { id: true },
    });
    if (!f) {
      return {
        totalDebt: '0.00',
        totalPaid: '0.00',
        outstandingDebt: '0.00',
        openDebtCount: 0,
        paidDebtCount: 0,
      };
    }
    realFisherId = f.id;
  }

  // Query all non-cancelled debts via Prisma / Transaction Client
  const debts = await client.fisher_debts.findMany({
    where: {
      fisher_id: realFisherId,
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      original_amount: true,
      status: true,
    },
  });

  // Query all non-reversed payments via Prisma / Transaction Client
  const payments = await client.debt_payments.findMany({
    where: {
      fisher_id: realFisherId,
      reversed_at: null,
    },
    select: {
      debt_id: true,
      amount: true,
    },
  });

  let totalDebt = new Decimal(0);
  let openDebtCount = 0;
  let paidDebtCount = 0;

  for (const d of debts) {
    totalDebt = totalDebt.plus(new Decimal(d.original_amount ? d.original_amount.toString() : 0));
    if (d.status === 'PAID') {
      paidDebtCount += 1;
    } else {
      openDebtCount += 1;
    }
  }

  let totalPaid = new Decimal(0);
  for (const p of payments) {
    totalPaid = totalPaid.plus(new Decimal(p.amount ? p.amount.toString() : 0));
  }

  let outstandingDebt = totalDebt.minus(totalPaid);
  if (outstandingDebt.isNegative()) {
    outstandingDebt = new Decimal(0);
  }

  return {
    totalDebt: totalDebt.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    outstandingDebt: outstandingDebt.toFixed(2),
    openDebtCount,
    paidDebtCount,
  };
};

/**
 * Centralized Effective Clearance Precedence Engine for a Fisher
 * 
 * Precedence Rules:
 * 1. Archived -> NOT_ELIGIBLE
 * 2. Base status BLOCKED -> BASE_BLOCKED ("Manual Block – reason not recorded")
 * 3. Active fisher_holds -> Include all active manual hold reasons
 * 4. Installment plans & Outstanding Debt evaluation per linked debt:
 *    - ACTIVE plan with overdue installment -> OVERDUE_INSTALLMENT
 *    - ACTIVE/COMPLETED plan with baseline inconsistency -> MANUAL_REVIEW_REQUIRED
 *    - ACTIVE plan current (no overdue dues) -> Suppresses legacy hold for THIS linked debt
 *    - No plan or CANCELLED plan with outstanding balance -> OUTSTANDING_DEBT
 * 5. Base status PENDING -> PENDING
 * 6. Base status ACTIVE & 0 holds -> CLEARED
 * 
 * @param {number|string} fisherId 
 * @param {Object} [dbClient] Optional Prisma Client or Transaction Client
 * @returns {Promise<{ status: string, canProceed: boolean, debtHold: boolean, manualHold: boolean, outstandingDebt: string, reasons: Array }>}
 */
const getFisherClearanceStatus = async (fisherId, dbClient = prisma) => {
  const client = (dbClient && dbClient.fishers) ? dbClient : prisma;
  const isNumeric = !isNaN(Number(fisherId));

  const whereCondition = isNumeric
    ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
    : { fisher_id: String(fisherId) };

  // 1. Query Fisher base status & archived flag via Prisma / Transaction Client
  const fisher = await client.fishers.findFirst({
    where: whereCondition,
    select: {
      id: true,
      fisher_id: true,
      full_name: true,
      status: true,
      is_archived: true,
    },
  });

  if (!fisher) {
    return {
      status: 'NOT_ELIGIBLE',
      canProceed: false,
      debtHold: false,
      manualHold: false,
      outstandingDebt: '0.00',
      reasons: [{ code: 'NOT_FOUND', label: 'Fisher record not found' }],
    };
  }

  const realFisherId = fisher.id;

  if (fisher.is_archived) {
    return {
      status: 'NOT_ELIGIBLE',
      canProceed: false,
      debtHold: false,
      manualHold: false,
      outstandingDebt: '0.00',
      reasons: [{ code: 'ARCHIVED', label: 'Fisher record is archived' }],
    };
  }

  // 2. Query active manual holds via Prisma / Transaction Client
  const activeHolds = await client.fisher_holds.findMany({
    where: {
      fisher_id: realFisherId,
      released_at: null,
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      reason_code: true,
      reason_text: true,
      notes: true,
      hold_date: true,
    },
  });

  // 3. Financial summary
  const summary = await getFisherFinancialSummary(realFisherId, client);

  // 4. Per-debt installment plan evaluation
  const nonCancelledDebts = await client.fisher_debts.findMany({
    where: {
      fisher_id: realFisherId,
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      original_amount: true,
    },
  });

  const allDebtPayments = await client.debt_payments.findMany({
    where: {
      fisher_id: realFisherId,
    },
    select: {
      id: true,
      debt_id: true,
      amount: true,
      reversed_at: true,
    },
  });

  const activeOrCompletedPlans = await client.installment_plans.findMany({
    where: {
      fisher_id: realFisherId,
      status: { in: ['ACTIVE', 'COMPLETED'] },
    },
    include: {
      installment_dues: {
        orderBy: { installment_number: 'asc' },
      },
    },
  });

  const planMap = new Map();
  for (const plan of activeOrCompletedPlans) {
    planMap.set(plan.debt_id.toString(), plan);
  }

  const reasons = [];

  // Add Base Blocked reason if base status is BLOCKED
  if (fisher.status === 'BLOCKED') {
    reasons.push({
      code: 'BASE_BLOCKED',
      label: 'Manual Block – reason not recorded',
    });
  }

  // Add all active manual hold reasons
  for (const h of activeHolds) {
    let label = 'Manual Hold';
    switch (h.reason_code) {
      case 'PAYMENT_ISSUE':
        label = 'Payment Issue';
        break;
      case 'DOCUMENT_ISSUE':
        label = 'Document Issue';
        break;
      case 'MANAGEMENT_DECISION':
        label = 'Management Decision';
        break;
      case 'OTHER':
        label = h.reason_text || 'Other Manual Hold Reason';
        break;
    }
    reasons.push({
      code: h.reason_code,
      label,
      holdId: Number(h.id),
      notes: h.notes,
      holdDate: h.hold_date,
    });
  }

  let debtHoldTriggered = false;
  const todayStr = getColomboCurrentDateString();

  // Evaluate each debt individually
  for (const debt of nonCancelledDebts) {
    const debtIdStr = debt.id.toString();
    const debtPayments = allDebtPayments.filter((p) => p.debt_id.toString() === debtIdStr);
    const validPaidSum = debtPayments
      .filter((p) => p.reversed_at == null)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const debtOriginalAmt = Number(debt.original_amount || 0);
    const debtCurrentBalance = Math.max(0, Number((debtOriginalAmt - validPaidSum).toFixed(2)));

    if (debtCurrentBalance <= 0) {
      // Debt is fully paid, no hold
      continue;
    }

    const linkedPlan = planMap.get(debtIdStr);

    if (!linkedPlan || linkedPlan.status === 'CANCELLED') {
      // Legacy debt with balance > 0 and no active/completed installment plan -> OUTSTANDING_DEBT
      debtHoldTriggered = true;
      reasons.push({
        code: 'OUTSTANDING_DEBT',
        label: 'மீதிக் கடன்',
        amount: debtCurrentBalance.toFixed(2),
        debtId: debtIdStr,
      });
      continue;
    }

    // Has an ACTIVE or COMPLETED linked installment plan
    const evalRes = calculatePlanCoverageAndStatus(linkedPlan, debtPayments, debtCurrentBalance, todayStr);

    if (evalRes.isManualReviewRequired) {
      debtHoldTriggered = true;
      reasons.push({
        code: 'MANUAL_REVIEW_REQUIRED',
        label: evalRes.manualReviewReason === 'PRE_PLAN_PAYMENT_REVERSED'
          ? 'Manual Review Required – Pre-plan payment was reversed'
          : 'Manual Review Required – Plan marked completed but debt has remaining balance',
        debtId: debtIdStr,
        planId: linkedPlan.id.toString(),
        reason: evalRes.manualReviewReason,
      });
    } else if (evalRes.overdueDuesCount > 0) {
      debtHoldTriggered = true;
      reasons.push({
        code: 'OVERDUE_INSTALLMENT',
        label: 'நிலுவை தவணை / Overdue Installment',
        amount: evalRes.overdueAmount.toFixed(2),
        overdueCount: evalRes.overdueDuesCount,
        debtId: debtIdStr,
        planId: linkedPlan.id.toString(),
      });
    } else {
      // Plan is active and current (or completed with zero balance) -> Hold for THIS debt is suppressed!
    }
  }

  const hasManualHold = activeHolds.length > 0 || fisher.status === 'BLOCKED';

  // Determine final effective status
  if (reasons.length > 0) {
    return {
      status: 'HOLD',
      canProceed: false,
      debtHold: debtHoldTriggered,
      manualHold: hasManualHold,
      outstandingDebt: summary.outstandingDebt,
      reasons,
    };
  }

  if (fisher.status === 'PENDING') {
    return {
      status: 'PENDING',
      canProceed: false,
      debtHold: false,
      manualHold: false,
      outstandingDebt: summary.outstandingDebt,
      reasons: [{ code: 'PENDING_VERIFICATION', label: 'Identity Pending Verification' }],
    };
  }

  return {
    status: 'CLEARED',
    canProceed: true,
    debtHold: false,
    manualHold: false,
    outstandingDebt: summary.outstandingDebt,
    reasons: [],
  };
};

module.exports = {
  getFisherFinancialSummary,
  getFisherClearanceStatus,
};
