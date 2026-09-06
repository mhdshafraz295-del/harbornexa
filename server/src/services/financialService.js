const Decimal = require('decimal.js');
const db = require('../config/db');

/**
 * Calculates authoritative financial summary for a Fisher using decimal.js
 * 
 * @param {number|string} fisherId 
 * @param {Object} [queryDb] Optional database connection/pool (defaults to db)
 * @returns {Promise<{ totalDebt: string, totalPaid: string, outstandingDebt: string, openDebtCount: number, paidDebtCount: number }>}
 */
const getFisherFinancialSummary = async (fisherId, queryDb = db) => {
  // Query all non-cancelled debts
  const [debts] = await queryDb.query(
    `SELECT id, original_amount, status 
     FROM fisher_debts 
     WHERE fisher_id = ? AND status != 'CANCELLED'`,
    [fisherId]
  );

  // Query all non-reversed payments
  const [payments] = await queryDb.query(
    `SELECT debt_id, amount 
     FROM debt_payments 
     WHERE fisher_id = ? AND reversed_at IS NULL`,
    [fisherId]
  );

  let totalDebt = new Decimal(0);
  let openDebtCount = 0;
  let paidDebtCount = 0;

  for (const d of debts) {
    totalDebt = totalDebt.plus(new Decimal(d.original_amount || 0));
    if (d.status === 'PAID') {
      paidDebtCount += 1;
    } else {
      openDebtCount += 1;
    }
  }

  let totalPaid = new Decimal(0);
  for (const p of payments) {
    totalPaid = totalPaid.plus(new Decimal(p.amount || 0));
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
 * @param {Object} [queryDb] Optional database connection/pool (defaults to db)
 * @returns {Promise<{ status: string, canProceed: boolean, debtHold: boolean, manualHold: boolean, outstandingDebt: string, reasons: Array }>}
 */
const getFisherClearanceStatus = async (fisherId, queryDb = db) => {
  // 1. Query Fisher base status & archived flag
  const [fisherRows] = await queryDb.query(
    'SELECT id, fisher_id, full_name, status, is_archived FROM fishers WHERE id = ? OR fisher_id = ?',
    [fisherId, fisherId]
  );

  if (fisherRows.length === 0) {
    return {
      status: 'NOT_ELIGIBLE',
      canProceed: false,
      debtHold: false,
      manualHold: false,
      outstandingDebt: '0.00',
      reasons: [{ code: 'NOT_FOUND', label: 'Fisher record not found' }],
    };
  }

  const fisher = fisherRows[0];
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

  // 2. Query active manual holds
  const [activeHolds] = await queryDb.query(
    `SELECT id, reason_code, reason_text, notes, hold_date
     FROM fisher_holds
     WHERE fisher_id = ? AND released_at IS NULL
     ORDER BY id ASC`,
    [realFisherId]
  );

  // 3. Query financial summary
  const summary = await getFisherFinancialSummary(realFisherId, queryDb);
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
      holdId: h.id,
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
