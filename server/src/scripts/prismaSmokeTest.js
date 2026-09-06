const prisma = require('../config/prismaClient');

async function runSmokeTest() {
  console.log('--- STARTING PRISMA READ-ONLY SMOKE TEST ---');
  
  try {
    const adminCount = await prisma.admins.count();
    const fisherCount = await prisma.fishers.count();
    const debtCount = await prisma.fisher_debts.count();
    const paymentCount = await prisma.debt_payments.count();
    const holdCount = await prisma.fisher_holds.count();
    const clearanceCount = await prisma.clearance_records.count();
    const qrTokenCount = await prisma.fisher_qr_tokens.count();
    const chargeTypeCount = await prisma.charge_types.count();
    const auditLogCount = await prisma.audit_logs.count();
    const settingCount = await prisma.settings.count();
    
    const sequences = await prisma.system_sequences.findMany();
    const sequenceSummary = sequences.map(seq => ({
      sequence_name: seq.sequence_name,
      next_value: String(seq.next_value)
    }));

    // Decimal inspection
    const sampleChargeType = await prisma.charge_types.findFirst();
    const decimalSampleType = sampleChargeType ? typeof sampleChargeType.default_amount : 'N/A';
    const decimalSampleValue = sampleChargeType ? sampleChargeType.default_amount.toString() : 'N/A';

    console.log('READ-ONLY SMOKE TEST RESULTS:');
    console.log(`- Admins Count: ${adminCount}`);
    console.log(`- Fishers Count: ${fisherCount}`);
    console.log(`- Fisher Debts Count: ${debtCount}`);
    console.log(`- Debt Payments Count: ${paymentCount}`);
    console.log(`- Fisher Holds Count: ${holdCount}`);
    console.log(`- Clearance Records Count: ${clearanceCount}`);
    console.log(`- Fisher QR Tokens Count: ${qrTokenCount}`);
    console.log(`- Charge Types Count: ${chargeTypeCount}`);
    console.log(`- Audit Logs Count: ${auditLogCount}`);
    console.log(`- Settings Count: ${settingCount}`);
    console.log(`- System Sequences: ${JSON.stringify(sequenceSummary)}`);
    console.log(`- Decimal Field Type: ${decimalSampleType}, Sample Value: ${decimalSampleValue}`);
    console.log('--- PRISMA READ-ONLY SMOKE TEST PASSED ---');
  } catch (error) {
    console.error('PRISMA SMOKE TEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Prisma Client disconnected cleanly.');
  }
}

runSmokeTest();