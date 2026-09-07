const prisma = require('../config/prismaClient');
const {
  createInstallmentPlan,
  cancelInstallmentPlan,
  calculatePlanCoverageAndStatus,
  getColomboCurrentDateString,
  generateInstallmentSchedule,
} = require('../services/installmentService');

/**
 * GET /api/installments/eligible-debts
 * List fishers and their active debts eligible for creating an installment plan.
 */
async function getEligibleDebts(req, res) {
  try {
    const debts = await prisma.fisher_debts.findMany({
      where: {
        status: { not: 'CANCELLED' },
      },
      include: {
        fishers: {
          select: {
            id: true,
            fisher_id: true,
            full_name: true,
            nic: true,
            status: true,
          },
        },
        debt_payments: {
          where: { reversed_at: null },
        },
        installment_plans: {
          where: { status: 'ACTIVE' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const eligibleList = debts
      .map((debt) => {
        const fisherObj = debt.fishers;
        const totalPaid = debt.debt_payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const originalAmt = Number(debt.original_amount || 0);
        const outstandingBalance = Math.max(0, Number((originalAmt - totalPaid).toFixed(2)));
        const activePlan = debt.installment_plans ? debt.installment_plans : null;

        return {
          debtId: debt.id.toString(),
          fisherId: fisherObj ? fisherObj.id.toString() : '',
          fisherCode: fisherObj ? fisherObj.fisher_id : '',
          fisherName: fisherObj ? fisherObj.full_name : '',
          nicNumber: fisherObj ? fisherObj.nic : '',
          description: debt.description || `Debt #${debt.id}`,
          originalAmount: originalAmt,
          totalPaid,
          outstandingBalance,
          hasActivePlan: !!activePlan,
          activePlanId: activePlan ? activePlan.id.toString() : null,
        };
      })
      .filter((item) => item.outstandingBalance > 0);

    return res.json({ success: true, eligibleDebts: eligibleList });
  } catch (error) {
    console.error('Error fetching eligible debts:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/installments/preview-schedule
 * Calculate preview schedule before creating a plan.
 */
async function previewSchedule(req, res) {
  try {
    const { startingBalance, monthlyInstallmentAmount, firstDueDate, gracePeriodDays } = req.body;
    if (!startingBalance || !monthlyInstallmentAmount || !firstDueDate) {
      return res.status(400).json({ success: false, error: 'Missing required parameters.' });
    }

    const schedule = generateInstallmentSchedule({
      startingBalance: Number(startingBalance),
      monthlyInstallmentAmount: Number(monthlyInstallmentAmount),
      firstDueDate,
      gracePeriodDays: Number(gracePeriodDays) || 0,
    });

    return res.json({ success: true, schedule, totalDuesCount: schedule.length });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/installments/plans
 * List all installment plans with live calculated coverage status.
 */
async function listInstallmentPlans(req, res) {
  try {
    const plans = await prisma.installment_plans.findMany({
      include: {
        fishers: {
          select: {
            id: true,
            fisher_id: true,
            full_name: true,
            nic: true,
          },
        },
        fisher_debts: {
          select: {
            id: true,
            original_amount: true,
            description: true,
            status: true,
            debt_payments: {
              select: {
                id: true,
                amount: true,
                reversed_at: true,
              },
            },
          },
        },
        installment_dues: {
          orderBy: { installment_number: 'asc' },
        },
        admins_installment_plans_created_by_admin_idToadmins: {
          select: { id: true, name: true, email: true },
        },
        admins_installment_plans_cancelled_by_admin_idToadmins: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const todayStr = getColomboCurrentDateString();

    const formattedPlans = plans.map((plan) => {
      const fisherObj = plan.fishers;
      const debtObj = plan.fisher_debts;
      const createdByAdminObj = plan.admins_installment_plans_created_by_admin_idToadmins;
      const cancelledByAdminObj = plan.admins_installment_plans_cancelled_by_admin_idToadmins;

      const debtPayments = debtObj ? debtObj.debt_payments : [];
      const validPaid = debtPayments
        .filter((p) => p.reversed_at == null)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const debtOriginalAmt = Number(debtObj ? debtObj.original_amount : 0);
      const debtCurrentBalance = Math.max(0, Number((debtOriginalAmt - validPaid).toFixed(2)));

      const coverage = calculatePlanCoverageAndStatus(plan, debtPayments, debtCurrentBalance, todayStr);

      const firstDueDateStr = plan.first_due_date instanceof Date
        ? plan.first_due_date.toISOString().slice(0, 10)
        : String(plan.first_due_date).slice(0, 10);

      return {
        id: plan.id.toString(),
        fisherId: fisherObj ? fisherObj.id.toString() : '',
        fisherCode: fisherObj ? fisherObj.fisher_id : '',
        fisherName: fisherObj ? fisherObj.full_name : '',
        nicNumber: fisherObj ? fisherObj.nic : '',
        debtId: plan.debt_id.toString(),
        debtDescription: debtObj ? debtObj.description : null,
        startingBalance: Number(plan.starting_balance),
        startingPaymentId: plan.starting_payment_id.toString(),
        monthlyInstallmentAmount: Number(plan.monthly_amount),
        firstDueDate: firstDueDateStr,
        gracePeriodDays: plan.grace_days,
        totalDuesCount: plan.installment_dues ? plan.installment_dues.length : 0,
        status: plan.status,
        activatedAt: plan.activated_at,
        cancelledAt: plan.cancelled_at,
        cancellationReason: plan.cancellation_reason,
        notes: plan.notes,
        createdByAdmin: createdByAdminObj ? createdByAdminObj.name || createdByAdminObj.email : null,
        cancelledByAdmin: cancelledByAdminObj ? cancelledByAdminObj.name || cancelledByAdminObj.email : null,
        coverage: {
          isManualReviewRequired: coverage.isManualReviewRequired,
          manualReviewReason: coverage.manualReviewReason,
          overdueDuesCount: coverage.overdueDuesCount,
          overdueAmount: coverage.overdueAmount,
          dues: coverage.duesWithCoverage,
        },
      };
    });

    return res.json({ success: true, plans: formattedPlans });
  } catch (error) {
    console.error('Error listing installment plans:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/installments/plans
 * Create a new installment plan.
 */
async function handleCreatePlan(req, res) {
  try {
    const adminId = req.admin?.id || req.user?.id || 1; // Fallback to 1 if auth bypass in dev
    const { fisherId, debtId, monthlyInstallmentAmount, firstDueDate, gracePeriodDays, notes } = req.body;

    if (!fisherId || !debtId || !monthlyInstallmentAmount || !firstDueDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: fisherId, debtId, monthlyInstallmentAmount, firstDueDate.',
      });
    }

    const newPlan = await createInstallmentPlan({
      adminId,
      fisherId,
      debtId,
      monthlyInstallmentAmount: Number(monthlyInstallmentAmount),
      firstDueDate,
      gracePeriodDays: Number(gracePeriodDays) || 0,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Installment plan created successfully.',
      planId: newPlan.id.toString(),
    });
  } catch (error) {
    console.error('Error creating installment plan:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/installments/plans/:id/cancel
 * Cancel an active installment plan.
 */
async function handleCancelPlan(req, res) {
  try {
    const adminId = req.admin?.id || req.user?.id || 1;
    const planId = req.params.id;
    const { cancellationReason } = req.body;

    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Cancellation reason is required.',
      });
    }

    await cancelInstallmentPlan({
      adminId,
      planId,
      cancellationReason,
    });

    return res.json({
      success: true,
      message: 'Installment plan cancelled successfully. Underlying debt has returned to legacy status.',
    });
  } catch (error) {
    console.error('Error cancelling installment plan:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
}

module.exports = {
  getEligibleDebts,
  previewSchedule,
  listInstallmentPlans,
  handleCreatePlan,
  handleCancelPlan,
};
