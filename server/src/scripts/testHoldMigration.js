const http = require('http');
const prisma = require('../config/prismaClient');
const bcrypt = require('bcrypt');
const app = require('../app');

async function getJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`HTTP Status ${res.status} Error Body:`, text);
    throw new Error(`HTTP ${res.status} returned non-JSON response: ${text.substring(0, 300)}`);
  }
}

async function runHoldTests() {
  console.log('==================================================');
  console.log('   PRISMA STEP 7: HOLD & BLOCK HISTORY TEST SUITE');
  console.log('==================================================');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5100, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5100');

  const baseUrl = 'http://127.0.0.1:5100';

  let testFisher = null;
  let hold1 = null;
  let hold2 = null;
  let testDebt = null;

  try {
    // Authenticate Admin
    const validPass = 'Admin123!';
    const validHash = await bcrypt.hash(validPass, 12);
    await prisma.admins.update({
      where: { email: 'admin@valachchenaiharbor.lk' },
      data: { password_hash: validHash },
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@valachchenaiharbor.lk', password: validPass }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const cookieHeader = setCookie ? setCookie.split(';')[0] : '';

    // Test A: Block History listing & tabs
    const listRes = await fetch(`${baseUrl}/api/holds?tab=ACTIVE&page=1&limit=10`, {
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
        `✔ Test A Passed: GET /api/holds returned 200 OK (${listBody.items.length} active manual holds).`
      );
    } else {
      throw new Error(`Test A Failed: ${listRes.status} ${JSON.stringify(listBody)}`);
    }

    // Test B: Create Test Fisher & Add Manual Hold (Hold 1)
    await prisma.fishers.deleteMany({ where: { nic: '199812345678' } });

    const createFisherRes = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Hold Test Fisher',
        nic: '199812345678',
        phone: '0778887766',
        boat_no: 'BOAT-HOLD-1',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody = await getJson(createFisherRes);
    testFisher = createFisherBody.fisher;

    const createHoldRes1 = await fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        reasonCode: 'DOCUMENT_ISSUE',
        notes: 'Missing fishing license copy',
      }),
    });
    const createHoldBody1 = await getJson(createHoldRes1);
    if (
      createHoldRes1.status === 201 &&
      createHoldBody1.success &&
      createHoldBody1.hold.reason_code === 'DOCUMENT_ISSUE' &&
      createHoldBody1.hold.released_at === null
    ) {
      hold1 = createHoldBody1.hold;
      console.log(`✔ Test B Passed: Placed manual hold ID ${hold1.id} (DOCUMENT_ISSUE).`);
    } else {
      throw new Error(`Test B Failed: ${createHoldRes1.status} ${JSON.stringify(createHoldBody1)}`);
    }

    // Verify Effective Clearance Status is HOLD
    const clearanceRes1 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const clearanceBody1 = await getJson(clearanceRes1);
    if (
      clearanceRes1.status === 200 &&
      clearanceBody1.clearanceStatus.status === 'HOLD' &&
      clearanceBody1.clearanceStatus.manualHold === true
    ) {
      console.log('✔ Test B Verification: Effective clearance status updated to HOLD.');
    } else {
      throw new Error(`Test B Verification Failed: ${JSON.stringify(clearanceBody1)}`);
    }

    // Test C: Add Second Manual Hold (Hold 2) -> Multiple holds supported
    const createHoldRes2 = await fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        reasonCode: 'MANAGEMENT_DECISION',
        notes: 'Pending harbor safety inspection',
      }),
    });
    const createHoldBody2 = await getJson(createHoldRes2);
    if (createHoldRes2.status === 201 && createHoldBody2.success) {
      hold2 = createHoldBody2.hold;
      console.log(`✔ Test C Passed: Placed second manual hold ID ${hold2.id} (MANAGEMENT_DECISION).`);
    } else {
      throw new Error(`Test C Failed: ${createHoldRes2.status} ${JSON.stringify(createHoldBody2)}`);
    }

    // Verify 2 active holds exist
    const fisherHoldsRes = await fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const fisherHoldsBody = await getJson(fisherHoldsRes);
    if (fisherHoldsRes.status === 200 && fisherHoldsBody.holds.length === 2) {
      console.log('✔ Test C Verification: Fisher has 2 active holds simultaneously.');
    } else {
      throw new Error(`Test C Verification Failed: ${JSON.stringify(fisherHoldsBody)}`);
    }

    // Test D: Release First Hold -> Second hold remains active, status remains HOLD
    const relRes1 = await fetch(`${baseUrl}/api/holds/${hold1.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        releaseNotes: 'License copy submitted and verified',
      }),
    });
    const relBody1 = await getJson(relRes1);
    if (relRes1.status === 200 && relBody1.success && relBody1.hold.released_at !== null) {
      console.log(`✔ Test D Passed: Released manual hold ID ${hold1.id}.`);
    } else {
      throw new Error(`Test D Failed: ${relRes1.status} ${JSON.stringify(relBody1)}`);
    }

    // Verify status is still HOLD because hold2 is active
    const clearanceRes2 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const clearanceBody2 = await getJson(clearanceRes2);
    if (clearanceRes2.status === 200 && clearanceBody2.clearanceStatus.status === 'HOLD') {
      console.log('✔ Test D Verification: Clearance status remains HOLD while second hold is active.');
    } else {
      throw new Error(`Test D Verification Failed: ${JSON.stringify(clearanceBody2)}`);
    }

    // Test E: Release Second Hold -> Status transitions to CLEARED
    const relRes2 = await fetch(`${baseUrl}/api/holds/${hold2.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        releaseNotes: 'Safety inspection passed',
      }),
    });
    const relBody2 = await getJson(relRes2);
    if (relRes2.status === 200 && relBody2.success) {
      console.log(`✔ Test E Passed: Released second manual hold ID ${hold2.id}.`);
    } else {
      throw new Error(`Test E Failed: ${relRes2.status} ${JSON.stringify(relBody2)}`);
    }

    // Verify clearance status is now CLEARED
    const clearanceRes3 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const clearanceBody3 = await getJson(clearanceRes3);
    if (clearanceRes3.status === 200 && clearanceBody3.clearanceStatus.status === 'CLEARED') {
      console.log('✔ Test E Verification: Clearance status transitioned to CLEARED.');
    } else {
      throw new Error(`Test E Verification Failed: ${JSON.stringify(clearanceBody3)}`);
    }

    // Test F: Double Release Rejection -> 409 Conflict
    const doubleRelRes = await fetch(`${baseUrl}/api/holds/${hold2.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        releaseNotes: 'Attempting double release',
      }),
    });
    const doubleRelBody = await getJson(doubleRelRes);
    if (doubleRelRes.status === 409 && !doubleRelBody.success) {
      console.log('✔ Test F Passed: Double release attempt rejected with 409 Conflict.');
    } else {
      throw new Error(`Test F Failed: Expected 409, got ${doubleRelRes.status} ${JSON.stringify(doubleRelBody)}`);
    }

    // Test G: Hold History Permanence
    const historyRes = await fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const historyBody = await getJson(historyRes);
    if (
      historyRes.status === 200 &&
      historyBody.holds.length === 2 &&
      historyBody.holds.every((h) => h.released_at !== null)
    ) {
      console.log('✔ Test G Passed: Both released hold records remain permanently in history with release metadata.');
    } else {
      throw new Error(`Test G Failed: ${JSON.stringify(historyBody)}`);
    }

    // Test H: Derived Debt Hold Tab
    const addDebtRes = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        category: 'Port Fee',
        originalAmount: '5000.00',
      }),
    });
    const addDebtBody = await getJson(addDebtRes);
    testDebt = addDebtBody.debt;

    const debtTabRes = await fetch(`${baseUrl}/api/holds?tab=DEBT&search=${testFisher.fisher_id}`, {
      headers: { Cookie: cookieHeader },
    });
    const debtTabBody = await getJson(debtTabRes);
    if (
      debtTabRes.status === 200 &&
      debtTabBody.items.some((item) => item.fisher_id === testFisher.id && item.block_type === 'DEBT_HOLD')
    ) {
      console.log('✔ Test H Passed: Fisher appears in DEBT tab dynamically (derived from outstanding debt > 0).');
    } else {
      throw new Error(`Test H Failed: ${debtTabRes.status} ${JSON.stringify(debtTabBody)}`);
    }

    // Verify NO new fisher_holds row was created for the debt hold
    const holdsCountAfterDebt = await prisma.fisher_holds.count({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    if (holdsCountAfterDebt === 2) {
      console.log('✔ Test H Verification: Verified NO fisher_holds row created for debt hold.');
    } else {
      throw new Error(`Test H Verification Failed: Unexpected hold count ${holdsCountAfterDebt}`);
    }

    // Test I: Fully Pay Debt -> Automatic Debt Hold Removal
    const key1 = 'idx-' + Math.random().toString(36).substring(2, 15);
    await fetch(`${baseUrl}/api/debts/${testDebt.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        amount: '5000.00',
        idempotencyKey: key1,
      }),
    });

    const debtTabRes2 = await fetch(`${baseUrl}/api/holds?tab=DEBT&search=${testFisher.fisher_id}`, {
      headers: { Cookie: cookieHeader },
    });
    const debtTabBody2 = await getJson(debtTabRes2);
    if (debtTabRes2.status === 200 && !debtTabBody2.items.some((item) => item.fisher_id === testFisher.id)) {
      console.log('✔ Test I Passed: Fully paying debt automatically removed fisher from DEBT holds tab.');
    } else {
      throw new Error(`Test I Failed: ${JSON.stringify(debtTabBody2)}`);
    }

    // Test J: Debt + Manual Hold Combination
    // Create new debt + manual hold
    const addDebtRes2 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ category: 'Extra Charge', originalAmount: '2000.00' }),
    });
    const addDebtBody2 = await getJson(addDebtRes2);
    const testDebt2 = addDebtBody2.debt;

    const addHoldRes3 = await fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reasonCode: 'PAYMENT_ISSUE', notes: 'Bounced check investigation' }),
    });
    const addHoldBody3 = await getJson(addHoldRes3);
    const hold3 = addHoldBody3.hold;

    // Pay debt fully
    const key2 = 'idx-' + Math.random().toString(36).substring(2, 15);
    await fetch(`${baseUrl}/api/debts/${testDebt2.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ amount: '2000.00', idempotencyKey: key2 }),
    });

    // Clearance status should still be HOLD due to manual hold3
    const clearanceRes4 = await fetch(`${baseUrl}/api/debts/fisher/${testFisher.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const clearanceBody4 = await getJson(clearanceRes4);
    if (
      clearanceRes4.status === 200 &&
      clearanceBody4.clearanceStatus.status === 'HOLD' &&
      clearanceBody4.clearanceStatus.debtHold === false &&
      clearanceBody4.clearanceStatus.manualHold === true
    ) {
      console.log('✔ Test J Passed: After paying debt, Manual Hold remains active and clearance status stays HOLD.');
    } else {
      throw new Error(`Test J Failed: ${JSON.stringify(clearanceBody4)}`);
    }

    // Release hold3
    await fetch(`${baseUrl}/api/holds/${hold3.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ releaseNotes: 'Investigation cleared' }),
    });

    // Test K: Admin Blocks Tab (Base Status = BLOCKED)
    await fetch(`${baseUrl}/api/fishers/${testFisher.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ status: 'BLOCKED' }),
    });

    const adminBlockTabRes = await fetch(`${baseUrl}/api/holds?tab=ADMIN_BLOCK&search=${testFisher.fisher_id}`, {
      headers: { Cookie: cookieHeader },
    });
    const adminBlockTabBody = await getJson(adminBlockTabRes);
    if (
      adminBlockTabRes.status === 200 &&
      adminBlockTabBody.items.some((item) => item.fisher_id === testFisher.id && item.block_type === 'ADMIN_BLOCK')
    ) {
      console.log('✔ Test K Passed: Fisher with base status BLOCKED appears in ADMIN_BLOCK tab.');
    } else {
      throw new Error(`Test K Failed: ${JSON.stringify(adminBlockTabBody)}`);
    }

    // Restore base status to ACTIVE
    await fetch(`${baseUrl}/api/fishers/${testFisher.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });

    // Test L: Concurrent Hold Creation Test (Atomic Lock Safety)
    console.log('--- Testing Concurrent Hold Creation (Atomic Transaction Safety) ---');
    const p1 = fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reasonCode: 'DOCUMENT_ISSUE', notes: 'Concurrent test 1' }),
    }).then((r) => getJson(r));

    const p2 = fetch(`${baseUrl}/api/holds/fisher/${testFisher.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reasonCode: 'OTHER', reasonText: 'Concurrent test 2' }),
    }).then((r) => getJson(r));

    const [resConcurrent1, resConcurrent2] = await Promise.all([p1, p2]);
    if (resConcurrent1.success && resConcurrent2.success) {
      console.log('✔ Test L Passed: Both concurrent hold requests executed safely without race condition or deadlock.');
    } else {
      throw new Error(`Test L Failed: Concurrent holds failed (${JSON.stringify(resConcurrent1)}, ${JSON.stringify(resConcurrent2)})`);
    }

    // Clean up created test records from development database
    await prisma.fisher_holds.deleteMany({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    await prisma.debt_payments.deleteMany({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    await prisma.fisher_debts.deleteMany({
      where: { fisher_id: BigInt(testFisher.id) },
    });
    await prisma.fishers.delete({
      where: { id: BigInt(testFisher.id) },
    });

    console.log('✔ Cleaned up all test fixtures cleanly.');
    console.log('==================================================');
    console.log('✔ ALL STEP 7 HOLD & BLOCK HISTORY TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit();
  }
}

runHoldTests();
