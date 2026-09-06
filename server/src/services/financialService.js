const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');

/**
 * Calculates authoritative financial summary for a Fisher using decimal.js & Prisma
 * 
 * @param {number|string} fisherId 
 * @param {Object} [queryDb] Optional database connection/pool (retained for backward compatibility)
 * @returns {Promise<{ totalDebt: string, totalPaid: string, outstandingDebt: string, openDebtCount: number, paidDebtCount: number }>}
 */
const getFisherFinancialSummary = async (fisherId, queryDb = null) => {
  const isNumeric = !isNaN(Number(fisherId));
  let realFisherId = null;

  if (isNumeric) {
    realFisherId = BigInt(fisherId);
  } else {
    const f = await prisma.fishers.findFirst({
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

  // Query all non-cancelled debts via Prisma
  const debts = await prisma.fisher_debts.findMany({
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

  // Query all non-reversed payments via Prisma
  const payments = await prisma.debt_payments.findMany({
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
 * 4. Outstanding Debt > 0 -> OUTSTANDING_DEBT
 * 5. Base status PENDING -> PENDING
 * 6. Base status ACTIVE & 0 holds -> CLEARED
 * 
 * @param {number|string} fisherId 
 * @param {Object} [queryDb] Optional database connection/pool
 * @returns {Promise<{ status: string, canProceed: boolean, debtHold: boolean, manualHold: boolean, outstandingDebt: string, reasons: Array }>}
 */
const getFisherClearanceStatus = async (fisherId, queryDb = null) => {
  const isNumeric = !isNaN(Number(fisherId));

  const whereCondition = isNumeric
    ? { OR: [{ id: BigInt(fisherId) }, { fisher_id: String(fisherId) }] }
    : { fisher_id: String(fisherId) };

  // 1. Query Fisher base status & archived flag via Prisma
  const fisher = await prisma.fishers.findFirst({
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

  // 2. Query active manual holds via Prisma
  const activeHolds = await prisma.fisher_holds.findMany({
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

  // 3. Query financial summary
  const summary = await getFisherFinancialSummary(realFisherId);
  const hasDebtHold = new Decimal(summary.outstandingDebt).gt(0);
  const hasManualHold = activeHolds.length > 0 || fisher.status === 'BLOCKED';

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

  // Add Debt Hold reason if outstanding debt > 0
  if (hasDebtHold) {
    reasons.push({
      code: 'OUTSTANDING_DEBT',
      label: 'மீதிக் கடன்',
      amount: summary.outstandingDebt,
    });
  }

  // Determine final effective status
  if (reasons.length > 0) {
    return {
      status: 'HOLD',
      canProceed: false,
      debtHold: hasDebtHold,
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

