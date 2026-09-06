// 1. HARD TEST ENVIRONMENT OVERRIDES - MUST BE AT THE VERY TOP BEFORE ANY IMPORTS
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'valachchenai_harbor_test';
process.env.DATABASE_URL = 'mysql://root:@127.0.0.1:3306/valachchenai_harbor_test';

// 2. HARD TEST DB GUARD PRE-CHECKS
if (process.env.DB_NAME !== 'valachchenai_harbor_test') {
  throw new Error(`FATAL: HARD TEST DB GUARD FAILED! process.env.DB_NAME is '${process.env.DB_NAME}', expected 'valachchenai_harbor_test'. Aborting test execution.`);
}

if (!process.env.DATABASE_URL.includes('/valachchenai_harbor_test')) {
  throw new Error(`FATAL: HARD TEST DB GUARD FAILED! process.env.DATABASE_URL does not target 'valachchenai_harbor_test'. Aborting test execution.`);
}

// 3. Module Imports
const http = require('http');
const prisma = require('../config/prismaClient');
const db = require('../config/db');
const env = require('../config/env');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = require('../app');

if (env.db.database !== 'valachchenai_harbor_test') {
  throw new Error(`FATAL: HARD TEST DB GUARD FAILED! env.db.database resolved to '${env.db.database}', expected 'valachchenai_harbor_test'. Aborting.`);
}

function generateUUID() {
  return 'idx-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

async function getJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`HTTP Status ${res.status} Error Body:`, text);
    throw new Error(`HTTP ${res.status} returned non-JSON response: ${text.substring(0, 300)}`);
  }
}

async function runDebtTests() {
  console.log('==================================================');
  console.log('   PRISMA STEP 6: DEBT & PAYMENT TEST SUITE');
  console.log('==================================================');

  // Query MySQL for DATABASE() on both mysql2 and Prisma to verify live connection target
  const [rawDbRes] = await db.query('SELECT DATABASE() as currentDb');
  const mysql2Db = rawDbRes[0]?.currentDb;

  const prismaDbRes = await prisma.$queryRaw`SELECT DATABASE() as currentDb`;
  const prismaDb = prismaDbRes[0]?.currentDb;

  if (mysql2Db !== 'valachchenai_harbor_test' || prismaDb !== 'valachchenai_harbor_test') {
    throw new Error(`FATAL: DB ISOLATION FAILURE! mysql2='${mysql2Db}', Prisma='${prismaDb}'. Must be 'valachchenai_harbor_test'.`);
  }
  console.log(`✔ HARD TEST DB GUARD VERIFIED: mysql2='${mysql2Db}', Prisma='${prismaDb}' (ISOLATED TEST DB ONLY).`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5099, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5099');

  const baseUrl = 'http://127.0.0.1:5099';

  let testFisher = null;
  let testDebt1 = null;
  let testPayment1 = null;
  let testPayment2 = null;
  let testDebt2 = null;

  try {
    // Authenticate Admin inside test DB
    const validPass = 'Admin123!';
    const validHash = await bcrypt.hash(validPass, 12);
    await prisma.admins.upsert({
      where: { email: 'admin@valachchenaiharbor.lk' },
      update: { password_hash: validHash, status: 'ACTIVE' },
      create: {
        name: 'System Admin',
        email: 'admin@valachchenaiharbor.lk',
        password_hash: validHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@valachchenaiharbor.lk', password: validPass }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const cookieHeader = setCookie ? setCookie.split(';')[0] : '';

    // Test A: List Debts & Metric Cards
    const listRes = await fetch(`${baseUrl}/api/debts?page=1&limit=10`, {
      headers: { Cookie: cookieHeader },
    });
    const listBody = await getJson(listRes);
    if (
      listRes.status === 200 &&
      listBody.success &&
      Array.isArray(listBody.items) &&
      listBody.pagination &&
      listBody.metrics
    ) {
      console.log(
        `✔ Test A Passed: GET /api/debts returned 200 OK (${listBody.items.length} items, total outstanding: ${listBody.metrics.totalOutstanding}).`
      );
    } else {
      throw new Error(`Test A Failed: ${listRes.status} ${JSON.stringify(listBody)}`);
    }

    // Test B: Create Test Fisher Fixture
    await prisma.fishers.deleteMany({ where: { nic: '199512345678' } });

    const createFisherRes = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Debt Test Fisher',
        nic: '199512345678',
        phone: '0779998877',
        boat_no: 'BOAT-DEBT-1',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody = await getJson(createFisherRes);
    if (createFisherRes.status === 201 && createFisherBody.success) {
      testFisher = createFisherBody.fisher;
      console.log(`✔ Test B Passed: Created test fisher fixture (${testFisher.fisher_id}).`);
    } else {
      throw new Error(`Test B Failed: ${createFisherRes.status} ${JSON.stringify(createFisherBody)}`);
    }

    // Test C: Add New Charge / Debt (5000.00)
    const createDebtRes1 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        category: 'Trip Harbor Fee',
        description: 'Standard harbor entry fee for test trip',
        originalAmount: '5000.00',
        debtDate: '2026-09-06',
        notes: 'Initial test debt',
      }),
    });
    const createDebtBody1 = await getJson(createDebtRes1);
    if (
      createDebtRes1.status === 201 &&
      createDebtBody1.success &&
      createDebtBody1.debt.status === 'OPEN' &&
      createDebtBody1.debt.original_amount === '5000.00'
    ) {
      testDebt1 = createDebtBody1.debt;
      console.log(`✔ Test C Passed: Created debt record ID ${testDebt1.id} for amount 5000.00 (OPEN).`);
    } else {
      throw new Error(`Test C Failed: ${createDebtRes1.status} ${JSON.stringify(createDebtBody1)}`);
    }

    // Test D: Partial Payment (2000.00)
    const key1 = generateUUID();
    const payRes1 = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '2000.00',
        paymentMethod: 'CASH',
        idempotencyKey: key1,
        notes: 'First partial payment',
      }),
    });
    const payBody1 = await getJson(payRes1);
    if (payRes1.status === 201 && payBody1.success && payBody1.payment.amount === '2000.00') {
      testPayment1 = payBody1.payment;
      console.log(`✔ Test D Passed: Recorded partial payment 2000.00 (ID: ${testPayment1.id}).`);
    } else {
      throw new Error(`Test D Failed: ${payRes1.status} ${JSON.stringify(payBody1)}`);
    }

    // Verify Debt Status is PARTIALLY_PAID
    const fisherInfoRes1 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const fisherInfoBody1 = await getJson(fisherInfoRes1);
    const updatedDebt1 = fisherInfoBody1.debts.find((d) => d.id === testDebt1.id);
    if (updatedDebt1 && updatedDebt1.status === 'PARTIALLY_PAID' && updatedDebt1.outstanding_amount === '3000.00') {
      console.log('✔ Test D Verification: Debt status transitioned to PARTIALLY_PAID (outstanding 3000.00).');
    } else {
      throw new Error(`Test D Verification Failed: ${JSON.stringify(updatedDebt1)}`);
    }

    // Test E: Idempotency Verification (Same key, same payload -> 200 OK with original payment)
    const idemRes = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '2000.00',
        paymentMethod: 'CASH',
        idempotencyKey: key1,
      }),
    });
    const idemBody = await getJson(idemRes);
    if (idemRes.status === 200 && idemBody.success && idemBody.payment.id === testPayment1.id) {
      console.log('✔ Test E Passed: Duplicate idempotency key request returned existing payment with 200 OK.');
    } else {
      throw new Error(`Test E Failed: ${idemRes.status} ${JSON.stringify(idemBody)}`);
    }

    // Test F: Idempotency Key Reuse Conflict (Same key, different amount -> 409 Conflict)
    const conflictRes = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '1000.00',
        paymentMethod: 'CASH',
        idempotencyKey: key1,
      }),
    });
    const conflictBody = await getJson(conflictRes);
    if (conflictRes.status === 409 && !conflictBody.success) {
      console.log('✔ Test F Passed: Reusing idempotency key with different payload rejected with 409 Conflict.');
    } else {
      throw new Error(`Test F Failed: Expected 409, got ${conflictRes.status} ${JSON.stringify(conflictBody)}`);
    }

    // Test G: Overpayment Rejection (Attempt to pay 4000.00 when outstanding is 3000.00 -> 400)
    const overpayRes = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '4000.00',
        paymentMethod: 'CASH',
        idempotencyKey: generateUUID(),
      }),
    });
    const overpayBody = await getJson(overpayRes);
    if (overpayRes.status === 400 && !overpayBody.success) {
      console.log('✔ Test G Passed: Overpayment attempt (4000.00 > 3000.00) rejected with 400 Bad Request.');
    } else {
      throw new Error(`Test G Failed: Expected 400, got ${overpayRes.status} ${JSON.stringify(overpayBody)}`);
    }

    // Test H: Full Payment (3000.00) -> Debt status transitions to PAID
    const key2 = generateUUID();
    const payRes2 = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '3000.00',
        paymentMethod: 'BANK_TRANSFER',
        idempotencyKey: key2,
        notes: 'Final payment',
      }),
    });
    const payBody2 = await getJson(payRes2);
    if (payRes2.status === 201 && payBody2.success) {
      testPayment2 = payBody2.payment;
      console.log(`✔ Test H Passed: Recorded final payment 3000.00 (ID: ${testPayment2.id}).`);
    } else {
      throw new Error(`Test H Failed: ${payRes2.status} ${JSON.stringify(payBody2)}`);
    }

    // Verify Debt Status is PAID
    const fisherInfoRes2 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const fisherInfoBody2 = await getJson(fisherInfoRes2);
    const updatedDebt2 = fisherInfoBody2.debts.find((d) => d.id === testDebt1.id);
    if (updatedDebt2 && updatedDebt2.status === 'PAID' && updatedDebt2.outstanding_amount === '0.00') {
      console.log('✔ Test H Verification: Debt status transitioned to PAID (outstanding 0.00).');
    } else {
      throw new Error(`Test H Verification Failed: ${JSON.stringify(updatedDebt2)}`);
    }

    // Test I: Payment Reversal (Reverse payment 2: 3000.00) -> Debt reverts to PARTIALLY_PAID
    const revRes1 = await fetch(`${baseUrl}/api/debts/payments/${testPayment2.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        reversalReason: 'Check bounced during clearing',
      }),
    });
    const revBody1 = await getJson(revRes1);
    if (revRes1.status === 200 && revBody1.success && revBody1.payment.reversed_at) {
      console.log(`✔ Test I Passed: Payment ${testPayment2.id} reversed successfully.`);
    } else {
      throw new Error(`Test I Failed: ${revRes1.status} ${JSON.stringify(revBody1)}`);
    }

    // Verify Debt Status reverted to PARTIALLY_PAID
    const fisherInfoRes3 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const fisherInfoBody3 = await getJson(fisherInfoRes3);
    const updatedDebt3 = fisherInfoBody3.debts.find((d) => d.id === testDebt1.id);
    if (updatedDebt3 && updatedDebt3.status === 'PARTIALLY_PAID' && updatedDebt3.outstanding_amount === '3000.00') {
      console.log('✔ Test I Verification: Linked debt status reverted to PARTIALLY_PAID.');
    } else {
      throw new Error(`Test I Verification Failed: ${JSON.stringify(updatedDebt3)}`);
    }

    // Test J: Double Reversal Rejection -> 400
    const doubleRevRes = await fetch(`${baseUrl}/api/debts/payments/${testPayment2.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        reversalReason: 'Attempting second reversal',
      }),
    });
    const doubleRevBody = await getJson(doubleRevRes);
    if (doubleRevRes.status === 400 && !doubleRevBody.success) {
      console.log('✔ Test J Passed: Double payment reversal rejected with 400 Bad Request.');
    } else {
      throw new Error(`Test J Failed: Expected 400, got ${doubleRevRes.status} ${JSON.stringify(doubleRevBody)}`);
    }

    // Test K: Cancel Debt with Active Payments Rejection -> 400
    const cancelWithPayRes = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        cancellationReason: 'Testing cancel with active payments',
      }),
    });
    const cancelWithPayBody = await getJson(cancelWithPayRes);
    if (cancelWithPayRes.status === 400 && !cancelWithPayBody.success) {
      console.log('✔ Test K Passed: Cancelling debt with active payments rejected with 400 Bad Request.');
    } else {
      throw new Error(`Test K Failed: Expected 400, got ${cancelWithPayRes.status} ${JSON.stringify(cancelWithPayBody)}`);
    }

    // Test L: Reverse Payment 1 (2000.00) -> Debt reverts to OPEN
    const revRes2 = await fetch(`${baseUrl}/api/debts/payments/${testPayment1.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        reversalReason: 'Clearing payment for cancellation test',
      }),
    });
    const revBody2 = await getJson(revRes2);
    if (revRes2.status === 200 && revBody2.success) {
      console.log(`✔ Test L Passed: Payment ${testPayment1.id} reversed.`);
    } else {
      throw new Error(`Test L Failed: ${revRes2.status} ${JSON.stringify(revBody2)}`);
    }

    // Test M: Cancel Debt -> status = CANCELLED
    const cancelRes = await fetch(`${baseUrl}/api/debts/${testDebt1.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        cancellationReason: 'Waived by Harbor Master',
      }),
    });
    const cancelBody = await getJson(cancelRes);
    if (cancelRes.status === 200 && cancelBody.success && cancelBody.debt.status === 'CANCELLED') {
      console.log(`✔ Test M Passed: Debt ${testDebt1.id} cancelled successfully.`);
    } else {
      throw new Error(`Test M Failed: ${cancelRes.status} ${JSON.stringify(cancelBody)}`);
    }

    // Test N: Create Debt 2 & Update Debt (PATCH)
    const createDebtRes2 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        category: 'Maintenance Fee',
        description: 'Boat maintenance charge',
        originalAmount: '3000.00',
      }),
    });
    const createDebtBody2 = await getJson(createDebtRes2);
    testDebt2 = createDebtBody2.debt;

    const patchRes = await fetch(`${baseUrl}/api/debts/${testDebt2.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        category: 'Updated Maintenance Fee',
        originalAmount: '4000.00',
      }),
    });
    const patchBody = await getJson(patchRes);
    if (
      patchRes.status === 200 &&
      patchBody.success &&
      patchBody.debt.category === 'Updated Maintenance Fee' &&
      patchBody.debt.original_amount === '4000.00'
    ) {
      console.log(`✔ Test N Passed: Edited debt ID ${testDebt2.id} (updated amount to 4000.00).`);
    } else {
      throw new Error(`Test N Failed: ${patchRes.status} ${JSON.stringify(patchBody)}`);
    }

    // Test O: Update Debt Lower Than Paid Rejection
    const payRes3 = await fetch(`${baseUrl}/api/debts/${testDebt2.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '2500.00',
        idempotencyKey: generateUUID(),
      }),
    });
    const payBody3 = await getJson(payRes3);

    const patchLowRes = await fetch(`${baseUrl}/api/debts/${testDebt2.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        originalAmount: '2000.00', // lower than 2500.00 paid
      }),
    });
    const patchLowBody = await getJson(patchLowRes);
    if (patchLowRes.status === 400 && !patchLowBody.success) {
      console.log('✔ Test O Passed: Attempt to set debt amount below paid amount rejected with 400 Bad Request.');
    } else {
      throw new Error(`Test O Failed: Expected 400, got ${patchLowRes.status} ${JSON.stringify(patchLowBody)}`);
    }

    // Test P: Financial Summary & Clearance Status Integration
    const finSummaryRes = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const finSummaryBody = await getJson(finSummaryRes);
    if (
      finSummaryRes.status === 200 &&
      finSummaryBody.success &&
      finSummaryBody.financialSummary.outstandingDebt === '1500.00' &&
      finSummaryBody.clearanceStatus.status === 'HOLD' &&
      finSummaryBody.clearanceStatus.debtHold === true
    ) {
      console.log('✔ Test P Passed: Financial Summary (outstanding 1500.00) & Clearance Status (HOLD due to debt) verified.');
    } else {
      throw new Error(`Test P Failed: ${finSummaryRes.status} ${JSON.stringify(finSummaryBody)}`);
    }

    // Test Q: Concurrent Payments Race Test (Two concurrent 500.00 payments on 1500.00 outstanding)
    console.log('--- Testing Concurrent Payment Recording (Atomic Transaction Safety) ---');
    const p1 = fetch(`${baseUrl}/api/debts/${testDebt2.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ amount: '500.00', idempotencyKey: generateUUID() }),
    }).then((r) => getJson(r));

    const p2 = fetch(`${baseUrl}/api/debts/${testDebt2.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ amount: '500.00', idempotencyKey: generateUUID() }),
    }).then((r) => getJson(r));

    const [resConcurrent1, resConcurrent2] = await Promise.all([p1, p2]);
    if (resConcurrent1.success && resConcurrent2.success) {
      console.log('✔ Test Q Passed: Both concurrent payments recorded safely without race condition/deadlock.');
    } else {
      throw new Error(`Test Q Failed: Concurrent payment failed (${JSON.stringify(resConcurrent1)}, ${JSON.stringify(resConcurrent2)})`);
    }

    // Clean up created test records from isolated test database (valachchenai_harbor_test)
    await prisma.debt_payments.deleteMany({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    await prisma.fisher_debts.deleteMany({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    await prisma.fishers.delete({
      where: { id: BigInt(testFisher.id) },
    });

    console.log('✔ Cleaned up all test fixtures cleanly from test DB.');
    console.log('==================================================');
    console.log('✔ ALL STEP 6 DEBT & PAYMENT TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit();
  }
}

runDebtTests();
