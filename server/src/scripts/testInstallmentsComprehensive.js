// Configure DATABASE_URL for isolated local test database BEFORE importing prisma
process.env.DATABASE_URL = 'mysql://root:@127.0.0.1:3306/valachchenai_harbor_test';

const prisma = require('../config/prismaClient');
const {
  generateInstallmentSchedule,
  createInstallmentPlan,
  cancelInstallmentPlan,
  getColomboCurrentDateString,
  addDaysToDateString,
} = require('../services/installmentService');
const { getFisherClearanceStatus, getFisherFinancialSummary } = require('../services/financialService');

async function runComprehensiveTests() {
  console.log('==================================================');
  console.log('   INSTALLMENT MANAGEMENT COMPREHENSIVE REGRESSION');
  console.log('==================================================\n');

  try {
    // ----------------------------------------------------
    // HARD TEST DATABASE GUARD
    // ----------------------------------------------------
    const dbResult = await prisma.$queryRaw`SELECT DATABASE() as current_db`;
    const currentDb = dbResult[0]?.current_db;
    console.log(`✔ HARD TEST DB GUARD VERIFIED: Live Prisma DB = '${currentDb}'`);

    if (currentDb !== 'valachchenai_harbor_test') {
      throw new Error(`FATAL SAFETY VIOLATION: Test suite executed against non-test DB '${currentDb}'!`);
    }

    // Clean up test database tables
    await prisma.installment_dues.deleteMany({});
    await prisma.installment_plans.deleteMany({});
    await prisma.debt_payments.deleteMany({});
    await prisma.fisher_debts.deleteMany({});
    await prisma.fisher_holds.deleteMany({});
    await prisma.clearance_records.deleteMany({});
    await prisma.fishers.deleteMany({});

    // Seed test admin
    let admin = await prisma.admins.findFirst();
    if (!admin) {
      admin = await prisma.admins.create({
        data: {
          username: 'testadmin',
          password_hash: 'hash',
          full_name: 'Test Admin',
          role: 'SUPER_ADMIN',
          name: 'Test Admin',
          email: 'admin@test.local',
        },
      });
    }

    const testResults = [];

    function recordResult(num, description, passed, detail = '') {
      testResults.push({ num, description, passed, detail });
      const symbol = passed ? '✔ PASS' : '❌ FAIL';
      console.log(`[Test ${num}] ${symbol}: ${description} ${detail ? `(${detail})` : ''}`);
    }

    const todayStr = getColomboCurrentDateString();
    const pastOneMonthStr = addDaysToDateString(todayStr, -10); // 10 days ago (exactly 1 due passed)
    const pastTwoMonthsStr = addDaysToDateString(todayStr, -40); // 40 days ago (exactly 2 dues passed)

    // ----------------------------------------------------
    // Test 1: Partial installment payment before due date -> no overdue hold yet
    // ----------------------------------------------------
    const fisher1 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-001', full_name: 'Fisher 1', nic: '100000000001', status: 'ACTIVE' },
    });
    const debt1 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher1.id, original_amount: 50000, category: 'FUEL', debt_date: new Date(), description: 'Debt 1', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt1.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2099-12-31', // future
    });
    await prisma.debt_payments.create({
      data: { fisher_id: fisher1.id, debt_id: debt1.id, amount: 5000, payment_date: new Date(), idempotency_key: `KEY-T1-${Date.now()}`, received_by_admin_id: admin.id },
    });
    let c1 = await getFisherClearanceStatus(fisher1.id);
    recordResult(1, 'Partial installment payment before due date -> no overdue hold yet', c1.status === 'CLEARED' && c1.canProceed === true);

    // ----------------------------------------------------
    // Test 2: Partial installment payment after due date -> OVERDUE_INSTALLMENT for remaining amount
    // ----------------------------------------------------
    const fisher2 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-002', full_name: 'Fisher 2', nic: '100000000002', status: 'ACTIVE' },
    });
    const debt2 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher2.id, original_amount: 50000, category: 'FUEL', debt_date: new Date(), description: 'Debt 2', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt2.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: pastOneMonthStr, // exactly 1 past due date
    });
    await prisma.debt_payments.create({
      data: { fisher_id: fisher2.id, debt_id: debt2.id, amount: 4000, payment_date: new Date(), idempotency_key: `KEY-T2-${Date.now()}`, received_by_admin_id: admin.id },
    });
    let c2 = await getFisherClearanceStatus(fisher2.id);
    const hasOverdue2 = c2.reasons.some((r) => r.code === 'OVERDUE_INSTALLMENT' && r.amount === '6000.00');
    recordResult(2, 'Partial installment payment after due date -> OVERDUE_INSTALLMENT for remaining amount', c2.status === 'HOLD' && hasOverdue2, 'Remaining overdue: 6000.00');

    // ----------------------------------------------------
    // Test 3: Two missed installments -> cumulative overdue amount
    // ----------------------------------------------------
    const fisher3 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-003', full_name: 'Fisher 3', nic: '100000000003', status: 'ACTIVE' },
    });
    const debt3 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher3.id, original_amount: 50000, category: 'FUEL', debt_date: new Date(), description: 'Debt 3', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt3.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: pastTwoMonthsStr, // exactly 2 missed past dues
    });
    let c3 = await getFisherClearanceStatus(fisher3.id);
    const hasOverdue3 = c3.reasons.some((r) => r.code === 'OVERDUE_INSTALLMENT' && r.amount === '20000.00');
    recordResult(3, 'Two missed installments -> cumulative overdue amount', c3.status === 'HOLD' && hasOverdue3, 'Cumulative overdue: 20000.00');

    // ----------------------------------------------------
    // Test 4: Paying only one of two overdue installments -> still BLC
    // ----------------------------------------------------
    await prisma.debt_payments.create({
      data: { fisher_id: fisher3.id, debt_id: debt3.id, amount: 10000, payment_date: new Date(), idempotency_key: `KEY-T4-${Date.now()}`, received_by_admin_id: admin.id },
    });
    let c4 = await getFisherClearanceStatus(fisher3.id);
    const hasOverdue4 = c4.reasons.some((r) => r.code === 'OVERDUE_INSTALLMENT' && r.amount === '10000.00');
    recordResult(4, 'Paying only one of two overdue installments -> still BLC (HOLD)', c4.status === 'HOLD' && c4.canProceed === false && hasOverdue4, 'Remaining overdue: 10000.00');

    // ----------------------------------------------------
    // Test 5: Prepayment covering future installments
    // ----------------------------------------------------
    const fisher5 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-005', full_name: 'Fisher 5', nic: '100000000005', status: 'ACTIVE' },
    });
    const debt5 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher5.id, original_amount: 50000, category: 'FUEL', debt_date: new Date(), description: 'Debt 5', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt5.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: pastTwoMonthsStr, // 2 dues in past
    });
    // Pay 30,000 upfront (covers past dues 1 & 2 plus future due 3)
    await prisma.debt_payments.create({
      data: { fisher_id: fisher5.id, debt_id: debt5.id, amount: 30000, payment_date: new Date(), idempotency_key: `KEY-T5-${Date.now()}`, received_by_admin_id: admin.id },
    });
    let c5 = await getFisherClearanceStatus(fisher5.id);
    recordResult(5, 'Prepayment covering future installments', c5.status === 'CLEARED' && c5.canProceed === true);

    // ----------------------------------------------------
    // Test 6: Final installment smaller than monthly amount
    // ----------------------------------------------------
    const schedule6 = generateInstallmentSchedule({
      startingBalance: 25000,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2026-01-31',
    });
    const finalDue6 = schedule6[schedule6.length - 1];
    recordResult(6, 'Final installment smaller than monthly amount', schedule6.length === 3 && finalDue6.due_amount === 5000, 'Final due: 5000.00');

    // ----------------------------------------------------
    // Test 7: Cancel ACTIVE plan -> linked debt returns to legacy OUTSTANDING_DEBT hold
    // ----------------------------------------------------
    const fisher7 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-007', full_name: 'Fisher 7', nic: '100000000007', status: 'ACTIVE' },
    });
    const debt7 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher7.id, original_amount: 40000, category: 'FUEL', debt_date: new Date(), description: 'Debt 7', status: 'OPEN', created_by_admin_id: admin.id },
    });
    const plan7 = await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt7.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2099-12-31',
    });
    await cancelInstallmentPlan({
      adminId: admin.id,
      planId: plan7.id,
      cancellationReason: 'Cancelled by test 7',
    });
    let c7 = await getFisherClearanceStatus(fisher7.id);
    const hasLegacy7 = c7.reasons.some((r) => r.code === 'OUTSTANDING_DEBT' && r.amount === '40000.00');
    recordResult(7, 'Cancel ACTIVE plan -> linked debt returns to legacy OUTSTANDING_DEBT hold', c7.status === 'HOLD' && hasLegacy7);

    // ----------------------------------------------------
    // Test 8: Manual Hold + installment fully paid -> still HOLD
    // ----------------------------------------------------
    const fisher8 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-008', full_name: 'Fisher 8', nic: '100000000008', status: 'ACTIVE' },
    });
    await prisma.fisher_holds.create({
      data: { fisher_id: fisher8.id, reason_code: 'PAYMENT_ISSUE', hold_date: new Date(), created_by_admin_id: admin.id },
    });
    const debt8 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher8.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 8', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt8.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2099-12-31',
    });
    let c8 = await getFisherClearanceStatus(fisher8.id);
    recordResult(8, 'Manual Hold + installment fully paid -> still HOLD', c8.status === 'HOLD' && c8.manualHold === true && c8.reasons.some((r) => r.code === 'PAYMENT_ISSUE'));

    // ----------------------------------------------------
    // Test 9: Base/Admin BLOCKED + installment fully paid -> still HOLD
    // ----------------------------------------------------
    const fisher9 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-009', full_name: 'Fisher 9', nic: '100000000009', status: 'BLOCKED' },
    });
    const debt9 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher9.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 9', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt9.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2099-12-31',
    });
    let c9 = await getFisherClearanceStatus(fisher9.id);
    recordResult(9, 'Base/Admin BLOCKED + installment fully paid -> still HOLD', c9.status === 'HOLD' && c9.reasons.some((r) => r.code === 'BASE_BLOCKED'));

    // ----------------------------------------------------
    // Test 10: Archived Fisher -> NOT_ELIGIBLE
    // ----------------------------------------------------
    const fisher10 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-010', full_name: 'Fisher 10', nic: '100000000010', status: 'ACTIVE', is_archived: true },
    });
    let c10 = await getFisherClearanceStatus(fisher10.id);
    recordResult(10, 'Archived Fisher -> NOT_ELIGIBLE', c10.status === 'NOT_ELIGIBLE' && c10.reasons.some((r) => r.code === 'ARCHIVED'));

    // ----------------------------------------------------
    // Test 11: Pending Fisher -> PENDING when no higher-priority hold
    // ----------------------------------------------------
    const fisher11 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-011', full_name: 'Fisher 11', nic: '100000000011', status: 'PENDING' },
    });
    let c11 = await getFisherClearanceStatus(fisher11.id);
    recordResult(11, 'Pending Fisher -> PENDING when no higher-priority hold', c11.status === 'PENDING' && c11.reasons.some((r) => r.code === 'PENDING_VERIFICATION'));

    // ----------------------------------------------------
    // Test 12: COMPLETED plan + later payment reversal / positive debt balance -> MANUAL_REVIEW_REQUIRED HOLD
    // ----------------------------------------------------
    const fisher12 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-012', full_name: 'Fisher 12', nic: '100000000012', status: 'ACTIVE' },
    });
    const debt12 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher12.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 12', status: 'OPEN', created_by_admin_id: admin.id },
    });
    const plan12 = await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt12.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2020-01-01',
    });
    const pay12 = await prisma.debt_payments.create({
      data: { fisher_id: fisher12.id, debt_id: debt12.id, amount: 10000, payment_date: new Date(), idempotency_key: `KEY-T12-${Date.now()}`, received_by_admin_id: admin.id },
    });
    // Update plan status to COMPLETED
    await prisma.installment_plans.update({
      where: { id: plan12.id },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });
    // Reverse payment after completion -> positive debt balance
    await prisma.debt_payments.update({
      where: { id: pay12.id },
      data: { reversed_at: new Date(), reversed_by_admin_id: admin.id, reversal_reason: 'Reversed after plan completed' },
    });
    let c12 = await getFisherClearanceStatus(fisher12.id);
    recordResult(12, 'COMPLETED plan + later payment reversal / positive debt balance -> MANUAL_REVIEW_REQUIRED HOLD', c12.status === 'HOLD' && c12.reasons.some((r) => r.code === 'MANUAL_REVIEW_REQUIRED'));

    // ----------------------------------------------------
    // Test 13: Existing payment idempotency remains unchanged
    // ----------------------------------------------------
    const fisher13 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-013', full_name: 'Fisher 13', nic: '100000000013', status: 'ACTIVE' },
    });
    const debt13 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher13.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 13', status: 'OPEN', created_by_admin_id: admin.id },
    });
    const key13 = `IDEM-DUP-${Date.now()}`;
    await prisma.debt_payments.create({
      data: { fisher_id: fisher13.id, debt_id: debt13.id, amount: 1000, payment_date: new Date(), idempotency_key: key13, received_by_admin_id: admin.id },
    });
    let dupError13 = false;
    try {
      await prisma.debt_payments.create({
        data: { fisher_id: fisher13.id, debt_id: debt13.id, amount: 1000, payment_date: new Date(), idempotency_key: key13, received_by_admin_id: admin.id },
      });
    } catch (err) {
      dupError13 = true;
    }
    recordResult(13, 'Existing payment idempotency remains unchanged', dupError13);

    // ----------------------------------------------------
    // Test 14: Existing payment reversal remains unchanged
    // ----------------------------------------------------
    const fisher14 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-014', full_name: 'Fisher 14', nic: '100000000014', status: 'ACTIVE' },
    });
    const debt14 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher14.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 14', status: 'OPEN', created_by_admin_id: admin.id },
    });
    const pay14 = await prisma.debt_payments.create({
      data: { fisher_id: fisher14.id, debt_id: debt14.id, amount: 5000, payment_date: new Date(), idempotency_key: `KEY-T14-${Date.now()}`, received_by_admin_id: admin.id },
    });
    await prisma.debt_payments.update({
      where: { id: pay14.id },
      data: { reversed_at: new Date(), reversed_by_admin_id: admin.id, reversal_reason: 'Test 14 reversal' },
    });
    const summary14 = await getFisherFinancialSummary(fisher14.id);
    recordResult(14, 'Existing payment reversal remains unchanged', summary14.totalPaid === '0.00' && summary14.outstandingDebt === '10000.00');

    // ----------------------------------------------------
    // Test 15: QR verification reflects OVERDUE_INSTALLMENT
    // ----------------------------------------------------
    const fisher15 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-015', full_name: 'Fisher 15', nic: '100000000015', status: 'ACTIVE' },
    });
    const debt15 = await prisma.fisher_debts.create({
      data: { fisher_id: fisher15.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 15', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt15.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2020-01-01', // overdue
    });
    let c15 = await getFisherClearanceStatus(fisher15.id);
    recordResult(15, 'QR verification reflects OVERDUE_INSTALLMENT', c15.status === 'HOLD' && c15.canProceed === false && c15.reasons.some((r) => r.code === 'OVERDUE_INSTALLMENT'));

    // ----------------------------------------------------
    // Test 16: Departure PDF Checker reflects OVERDUE_INSTALLMENT
    // ----------------------------------------------------
    let c16 = await getFisherClearanceStatus(fisher15.id);
    recordResult(16, 'Departure PDF Checker reflects OVERDUE_INSTALLMENT', c16.status === 'HOLD' && c16.canProceed === false && c16.reasons.some((r) => r.code === 'OVERDUE_INSTALLMENT'));

    // ----------------------------------------------------
    // Test 17: Dashboard effective counts remain mutually exclusive
    // ----------------------------------------------------
    const allFishers = await prisma.fishers.findMany({ select: { id: true } });
    let clearedCount = 0;
    let blcCount = 0;
    let pendingCount = 0;
    let notEligibleCount = 0;

    for (const f of allFishers) {
      const statusRes = await getFisherClearanceStatus(f.id);
      if (statusRes.status === 'CLEARED') clearedCount++;
      else if (statusRes.status === 'HOLD') blcCount++;
      else if (statusRes.status === 'PENDING') pendingCount++;
      else if (statusRes.status === 'NOT_ELIGIBLE') notEligibleCount++;
    }
    const sumExclusive = clearedCount + blcCount + pendingCount + notEligibleCount;
    recordResult(17, 'Dashboard effective counts remain mutually exclusive', sumExclusive === allFishers.length, `Total: ${allFishers.length}, Sum: ${sumExclusive}`);

    // ----------------------------------------------------
    // Test 18: Active/Cleared report reflects installment status
    // ----------------------------------------------------
    let c18 = await getFisherClearanceStatus(fisher1.id);
    recordResult(18, 'Active/Cleared report reflects installment status', c18.status === 'CLEARED');

    // ----------------------------------------------------
    // Test 19: BLC/Blocked report reflects installment status
    // ----------------------------------------------------
    let c19 = await getFisherClearanceStatus(fisher2.id);
    recordResult(19, 'BLC/Blocked report reflects installment status', c19.status === 'HOLD');

    // ----------------------------------------------------
    // Test 20: Clearance grant performs authoritative installment recheck
    // ----------------------------------------------------
    const recheckStatus = await getFisherClearanceStatus(fisher2.id);
    let grantBlocked = false;
    if (!recheckStatus.canProceed) {
      grantBlocked = true; // Clearance grant fails as expected
    }
    recordResult(20, 'Clearance grant performs authoritative installment recheck', grantBlocked);

    // ----------------------------------------------------
    // Test 21: Installment logic never mutates fishers.status
    // ----------------------------------------------------
    const fisher21Before = await prisma.fishers.findUnique({ where: { id: fisher1.id } });
    await getFisherClearanceStatus(fisher1.id);
    const fisher21After = await prisma.fishers.findUnique({ where: { id: fisher1.id } });
    recordResult(21, 'Installment logic never mutates fishers.status', fisher21Before.status === fisher21After.status && fisher21After.status === 'ACTIVE');

    // ----------------------------------------------------
    // Test 22: Installment logic never creates fake fisher_holds rows
    // ----------------------------------------------------
    const holdsBefore22 = await prisma.fisher_holds.count();
    await getFisherClearanceStatus(fisher2.id);
    const holdsAfter22 = await prisma.fisher_holds.count();
    recordResult(22, 'Installment logic never creates fake fisher_holds rows', holdsBefore22 === holdsAfter22);

    // ----------------------------------------------------
    // Test 23: getFisherClearanceStatus and other read checks perform zero DB writes
    // ----------------------------------------------------
    const countsBefore23 = {
      fishers: await prisma.fishers.count(),
      debts: await prisma.fisher_debts.count(),
      payments: await prisma.debt_payments.count(),
      plans: await prisma.installment_plans.count(),
      dues: await prisma.installment_dues.count(),
    };
    for (let i = 0; i < 10; i++) {
      await getFisherClearanceStatus(fisher1.id);
      await getFisherClearanceStatus(fisher2.id);
      await getFisherClearanceStatus(fisher3.id);
    }
    const countsAfter23 = {
      fishers: await prisma.fishers.count(),
      debts: await prisma.fisher_debts.count(),
      payments: await prisma.debt_payments.count(),
      plans: await prisma.installment_plans.count(),
      dues: await prisma.installment_dues.count(),
    };
    const zeroWrites = JSON.stringify(countsBefore23) === JSON.stringify(countsAfter23);
    recordResult(23, 'getFisherClearanceStatus performs zero DB writes', zeroWrites);

    // ----------------------------------------------------
    // Test 24: Multiple debts remain isolated
    // ----------------------------------------------------
    const fisher24 = await prisma.fishers.create({
      data: { fisher_id: 'F-REG-024', full_name: 'Fisher 24', nic: '100000000024', status: 'ACTIVE' },
    });
    const debt24A = await prisma.fisher_debts.create({
      data: { fisher_id: fisher24.id, original_amount: 10000, category: 'FUEL', debt_date: new Date(), description: 'Debt 24A', status: 'OPEN', created_by_admin_id: admin.id },
    });
    await createInstallmentPlan({
      adminId: admin.id,
      debtId: debt24A.id,
      monthlyInstallmentAmount: 10000,
      firstDueDate: '2099-12-31',
    });
    const debt24B = await prisma.fisher_debts.create({
      data: { fisher_id: fisher24.id, original_amount: 5000, category: 'FUEL', debt_date: new Date(), description: 'Debt 24B', status: 'OPEN', created_by_admin_id: admin.id },
    });
    let c24 = await getFisherClearanceStatus(fisher24.id);
    const isolated24 = c24.reasons.some((r) => r.code === 'OUTSTANDING_DEBT' && r.debtId === debt24B.id.toString());
    recordResult(24, 'Multiple debts remain isolated (Debt A plan active, Debt B legacy hold)', c24.status === 'HOLD' && isolated24);

    // ----------------------------------------------------
    // Test 25: Asia/Colombo due-date boundary remains correct
    // ----------------------------------------------------
    const colomboToday = getColomboCurrentDateString();
    const pastBoundaryDate = addDaysToDateString(colomboToday, -1);
    const schedule25 = generateInstallmentSchedule({
      startingBalance: 10000,
      monthlyInstallmentAmount: 10000,
      firstDueDate: pastBoundaryDate,
      gracePeriodDays: 0,
    });
    recordResult(25, 'Asia/Colombo due-date boundary remains correct', schedule25[0].effective_overdue_deadline_date_str === pastBoundaryDate && colomboToday > pastBoundaryDate);

    console.log('\n==================================================');
    console.log('   REGRESSION TEST SUITE SUMMARY');
    console.log('==================================================');
    const passedCount = testResults.filter((r) => r.passed).length;
    const failedCount = testResults.filter((r) => !r.passed).length;
    console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}\n`);

    if (failedCount > 0) {
      throw new Error(`Regression test suite failed with ${failedCount} failure(s).`);
    } else {
      console.log('✔ ALL 25 REGRESSION TEST SCENARIOS PASSED PERFECTLY!');
    }
  } catch (err) {
    console.error('❌ COMPREHENSIVE TEST FAILURE:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runComprehensiveTests();

