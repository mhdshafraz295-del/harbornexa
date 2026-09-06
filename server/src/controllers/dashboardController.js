const Decimal = require('decimal.js');
const db = require('../config/db');
const { getFisherClearanceStatus } = require('../services/financialService');

function getColomboTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

/**
 * GET /api/dashboard/metrics
 * Return clean metrics, real Phase 3 financial aggregates, and real audit log activity
 */
const getMetrics = async (req, res, next) => {
  try {
    // Check if fishers table exists in database schema
    const [tables] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fishers'"
    );

    let totalFishers = 0;
    let active = 0;
    let blocked = 0;
    let pending = 0;
    let outstandingDebt = new Decimal(0);
    let debtHoldCount = 0;
    let paymentsTodayVal = new Decimal(0);

    if (tables.length > 0) {
      // Query all non-archived fishers
      const [fisherRows] = await db.query(
        'SELECT id, status FROM fishers WHERE is_archived = FALSE'
      );

      totalFishers = fisherRows.length;
      active = 0;
      blocked = 0;
      pending = 0;
      debtHoldCount = 0;

      for (const f of fisherRows) {
        const clearance = await getFisherClearanceStatus(f.id);

        if (clearance.debtHold) {
          debtHoldCount += 1;
        }

        if (clearance.status === 'HOLD') {
          blocked += 1;
        } else if (clearance.status === 'PENDING') {
          pending += 1;
        } else if (clearance.status === 'CLEARED') {
          active += 1;
        }
      }

      // Phase 3 Financial Aggregates
      try {
        const [debts] = await db.query(`
          SELECT d.original_amount
          FROM fisher_debts d
          JOIN fishers f ON d.fisher_id = f.id
          WHERE d.status != 'CANCELLED' AND f.is_archived = FALSE
        `);

        const [payments] = await db.query(`
          SELECT p.amount
          FROM debt_payments p
          JOIN fishers f ON p.fisher_id = f.id
          WHERE p.reversed_at IS NULL AND f.is_archived = FALSE
        `);

        let totDebt = new Decimal(0);
        for (const d of debts) {
          totDebt = totDebt.plus(new Decimal(d.original_amount || 0));
        }

        let totPaid = new Decimal(0);
        for (const p of payments) {
          totPaid = totPaid.plus(new Decimal(p.amount || 0));
        }

        outstandingDebt = totDebt.minus(totPaid);
        if (outstandingDebt.isNegative()) {
          outstandingDebt = new Decimal(0);
        }

        // Payments Today in Asia/Colombo
        const colomboToday = getColomboTodayDateString();
        const [ptRows] = await db.query(
          `SELECT amount FROM debt_payments WHERE reversed_at IS NULL AND payment_date = ?`,
          [colomboToday]
        );
        for (const pt of ptRows) {
          paymentsTodayVal = paymentsTodayVal.plus(new Decimal(pt.amount || 0));
        }
      } catch (finErr) {
        console.warn('Phase 3 financial metrics not yet initialized:', finErr.message);
      }
    }

    // Query real audit log entries for Recent Activity section
    let recentActivity = [];
    try {
      const [activityRows] = await db.query(
        `SELECT a.id, a.action, a.ip_address, a.created_at, adm.name as admin_name, adm.email as admin_email
         FROM audit_logs a
         LEFT JOIN admins adm ON a.admin_id = adm.id
         ORDER BY a.created_at DESC
         LIMIT 5`
      );
      recentActivity = activityRows;
    } catch (auditErr) {
      console.warn('Failed to query audit_logs:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      metrics: {
        totalFishers,
        active,
        blocked,
        pending,
        outstandingDebt: outstandingDebt.toFixed(2),
        debtHoldCount,
        paymentsToday: paymentsTodayVal.toFixed(2),
      },
      recentActivity,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMetrics,
};
