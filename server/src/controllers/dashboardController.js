const Decimal = require('decimal.js');
const prisma = require('../config/prismaClient');

function getColomboTodayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
}

/**
 * GET /api/dashboard/metrics
 * Return clean metrics, real Phase 3 financial aggregates, and real audit log activity via Prisma
 */
const getMetrics = async (req, res, next) => {
  try {
    let totalFishers = 0;
    let active = 0;
    let blocked = 0;
    let pending = 0;
    let outstandingDebt = new Decimal(0);
    let debtHoldCount = 0;
    let paymentsTodayVal = new Decimal(0);

    // Query non-archived fishers
    const nonArchivedFishers = await prisma.fishers.findMany({
      where: { is_archived: false },
      select: { id: true, status: true },
    });

    totalFishers = nonArchivedFishers.length;

    if (totalFishers > 0) {
      // Efficient bulk status aggregation (avoiding N+1 queries for 3000+ fishers)
      const activeHolds = await prisma.fisher_holds.findMany({
        where: { released_at: null },
        select: { fisher_id: true },
      });
      const activeHoldsSet = new Set(activeHolds.map((h) => Number(h.fisher_id)));

      // Fetch non-cancelled debts grouped by fisher_id
      const debtsByFisher = await prisma.fisher_debts.groupBy({
        by: ['fisher_id'],
        where: {
          status: { not: 'CANCELLED' },
          fishers: { is_archived: false },
        },
        _sum: { original_amount: true },
      });

      // Fetch non-reversed payments grouped by fisher_id
      const paymentsByFisher = await prisma.debt_payments.groupBy({
        by: ['fisher_id'],
        where: {
          reversed_at: null,
          fishers: { is_archived: false },
        },
        _sum: { amount: true },
      });

      const debtMap = new Map();
      for (const d of debtsByFisher) {
        debtMap.set(
          Number(d.fisher_id),
          new Decimal(d._sum.original_amount ? d._sum.original_amount.toString() : 0)
        );
      }

      const payMap = new Map();
      for (const p of paymentsByFisher) {
        payMap.set(
          Number(p.fisher_id),
          new Decimal(p._sum.amount ? p._sum.amount.toString() : 0)
        );
      }

      const debtHoldFisherIds = new Set();
      for (const [fid, totDebt] of debtMap.entries()) {
        const totPaid = payMap.get(fid) || new Decimal(0);
        if (totDebt.minus(totPaid).gt(0)) {
          debtHoldFisherIds.add(fid);
        }
      }

      active = 0;
      blocked = 0;
      pending = 0;
      debtHoldCount = 0;

      for (const f of nonArchivedFishers) {
        const fid = Number(f.id);
        const hasManualHold = activeHoldsSet.has(fid) || f.status === 'BLOCKED';
        const hasDebtHold = debtHoldFisherIds.has(fid);

        if (hasDebtHold) {
          debtHoldCount += 1;
        }

        if (hasManualHold || hasDebtHold) {
          blocked += 1; // Effective status HOLD
        } else if (f.status === 'PENDING') {
          pending += 1;
        } else {
          active += 1; // Effective status CLEARED
        }
      }

      // Financial Aggregates
      try {
        const debtAgg = await prisma.fisher_debts.aggregate({
          where: {
            status: { not: 'CANCELLED' },
            fishers: { is_archived: false },
          },
          _sum: { original_amount: true },
        });

        const payAgg = await prisma.debt_payments.aggregate({
          where: {
            reversed_at: null,
            fishers: { is_archived: false },
          },
          _sum: { amount: true },
        });

        const totDebt = new Decimal(
          debtAgg._sum.original_amount ? debtAgg._sum.original_amount.toString() : 0
        );
        const totPaid = new Decimal(
          payAgg._sum.amount ? payAgg._sum.amount.toString() : 0
        );

        outstandingDebt = totDebt.minus(totPaid);
        if (outstandingDebt.isNegative()) {
          outstandingDebt = new Decimal(0);
        }

        // Payments Today in Asia/Colombo
        const colomboToday = getColomboTodayDateString();
        const ptRows = await prisma.$queryRaw`
          SELECT amount FROM debt_payments WHERE reversed_at IS NULL AND payment_date = ${colomboToday}
        `;
        for (const pt of ptRows) {
          paymentsTodayVal = paymentsTodayVal.plus(new Decimal(pt.amount ? pt.amount.toString() : 0));
        }
      } catch (finErr) {
        console.warn('Financial metrics query warning:', finErr.message);
      }
    }

    // Query real audit log entries for Recent Activity section
    let recentActivity = [];
    try {
      const activityRows = await prisma.audit_logs.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          admins: {
            select: { name: true, email: true },
          },
        },
      });

      recentActivity = activityRows.map((a) => ({
        id: Number(a.id),
        action: a.action,
        ip_address: a.ip_address,
        created_at: a.created_at,
        admin_name: a.admins?.name || null,
        admin_email: a.admins?.email || null,
      }));
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
