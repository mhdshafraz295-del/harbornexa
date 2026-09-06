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
const app = require('../app');

if (env.db.database !== 'valachchenai_harbor_test') {
  throw new Error(`FATAL: HARD TEST DB GUARD FAILED! env.db.database resolved to '${env.db.database}', expected 'valachchenai_harbor_test'. Aborting.`);
}

function generateUUID() {
  return 'clr-key-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
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

async function runClearanceTests() {
  console.log('==================================================');
  console.log('   PRISMA STEP 8: CLEARANCE RECORDS TEST SUITE');
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
  await new Promise((resolve) => server.listen(5101, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5101');

  const baseUrl = 'http://127.0.0.1:5101';

  let testFisher1 = null;
  let testFisher2 = null;
  let testFisher3 = null;
  let testFisher4 = null;

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

    // Test A: Normal Clearance Grant Flow & Status Check (No Auto-Create)
    await prisma.fishers.deleteMany({ where: { nic: '199912345678' } });

    const createFisherRes1 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Clearance Test Fisher One',
        nic: '199912345678',
        phone: '0771112233',
        boat_no: 'BOAT-CLR-ORIG',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody1 = await getJson(createFisherRes1);
    testFisher1 = createFisherBody1.fisher;

    // 1. Status query only -> Must NOT auto-create clearance record!
    const panelRes1 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const panelBody1 = await getJson(panelRes1);
    if (
      panelRes1.status === 200 &&
      panelBody1.clearanceStatus.status === 'CLEARED' &&
      panelBody1.lastClearance === null
    ) {
      console.log('✔ Test A (Status Check): Eligibility is CLEARED and status check created ZERO clearance records.');
    } else {
      throw new Error(`Test A (Status Check) Failed: ${JSON.stringify(panelBody1)}`);
    }

    // 2. Explicit Grant Clearance click
    const keyA = generateUUID();
    const grantRes1 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        idempotencyKey: keyA,
        notes: 'Routine morning departure clearance',
      }),
    });
    const grantBody1 = await getJson(grantRes1);
    if (
      grantRes1.status === 201 &&
      grantBody1.success &&
      grantBody1.clearance.clearance_no.startsWith('CLR-') &&
      grantBody1.clearance.boat_no_snapshot === 'BOAT-CLR-ORIG'
    ) {
      console.log(`✔ Test A (Grant): Granted clearance ${grantBody1.clearance.clearance_no} for ${testFisher1.fisher_id}.`);
    } else {
      throw new Error(`Test A (Grant) Failed: ${grantRes1.status} ${JSON.stringify(grantBody1)}`);
    }

    // Verify History and Today's Clearances list contain the record
    const historyRes1 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/history`, {
      headers: { Cookie: cookieHeader },
    });
    const historyBody1 = await getJson(historyRes1);

    const todayRes1 = await fetch(`${baseUrl}/api/clearance/today`, {
      headers: { Cookie: cookieHeader },
    });
    const todayBody1 = await getJson(todayRes1);

    if (
      historyRes1.status === 200 &&
      historyBody1.count === 1 &&
      todayRes1.status === 200 &&
      todayBody1.clearances.some((c) => c.clearance_no === grantBody1.clearance.clearance_no)
    ) {
      console.log('✔ Test A Verification: Clearance history & Today list contain newly granted record.');
    } else {
      throw new Error(`Test A Verification Failed: ${JSON.stringify(historyBody1)} / ${JSON.stringify(todayBody1)}`);
    }

    // Test B: Rejection on Outstanding Debt
    await prisma.fishers.deleteMany({ where: { nic: '199912345679' } });
    const createFisherRes2 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Debt Block Fisher',
        nic: '199912345679',
        phone: '0772223344',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody2 = await getJson(createFisherRes2);
    testFisher2 = createFisherBody2.fisher;

    // Add debt 5000.00
    await fetch(`${baseUrl}/api/debts/fisher/${testFisher2.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ category: 'Trip Charge', originalAmount: '5000.00' }),
    });

    const grantRes2 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher2.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    const grantBody2 = await getJson(grantRes2);
    if (grantRes2.status === 400 && !grantBody2.success && grantBody2.clearanceStatus.debtHold === true) {
      console.log('✔ Test B Passed: Grant Clearance rejected with 400 Bad Request due to outstanding debt.');
    } else {
      throw new Error(`Test B Failed: Expected 400, got ${grantRes2.status} ${JSON.stringify(grantBody2)}`);
    }

    // Test C: Rejection on Manual Hold & Recovery on Release
    await prisma.fishers.deleteMany({ where: { nic: '199912345680' } });
    const createFisherRes3 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Manual Hold Fisher',
        nic: '199912345680',
        phone: '0773334455',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody3 = await getJson(createFisherRes3);
    testFisher3 = createFisherBody3.fisher;

    // Add manual hold
    const addHoldRes = await fetch(`${baseUrl}/api/holds/fisher/${testFisher3.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reasonCode: 'DOCUMENT_ISSUE', notes: 'Missing inspection paper' }),
    });
    const addHoldBody = await getJson(addHoldRes);

    // Attempt grant -> Expect 400 rejection
    const grantRes3 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher3.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    const grantBody3 = await getJson(grantRes3);
    if (grantRes3.status === 400 && grantBody3.clearanceStatus.manualHold === true) {
      console.log('✔ Test C Passed: Grant Clearance rejected while Manual Hold is active.');
    } else {
      throw new Error(`Test C Failed: Expected 400, got ${grantRes3.status}`);
    }

    // Release hold
    await fetch(`${baseUrl}/api/holds/${addHoldBody.hold.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ releaseNotes: 'Paper submitted' }),
    });

    // Grant again -> Expect 201 success
    const grantRes3b = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher3.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    const grantBody3b = await getJson(grantRes3b);
    if (grantRes3b.status === 201 && grantBody3b.success) {
      console.log('✔ Test C Recovery Passed: Clearance granted successfully after manual hold release.');
    } else {
      throw new Error(`Test C Recovery Failed: ${grantRes3b.status} ${JSON.stringify(grantBody3b)}`);
    }

    // Test D: Rejection on Base BLOCKED, PENDING, ARCHIVED
    // 1. Base BLOCKED
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ status: 'BLOCKED' }),
    });
    const grantBlockedRes = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    if (grantBlockedRes.status === 400) {
      console.log('✔ Test D (Base Blocked) Passed: Grant rejected for BLOCKED fisher.');
    } else {
      throw new Error(`Test D (Base Blocked) Failed: ${grantBlockedRes.status}`);
    }

    // 2. Base PENDING
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ status: 'PENDING' }),
    });
    const grantPendingRes = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    if (grantPendingRes.status === 400) {
      console.log('✔ Test D (Base Pending) Passed: Grant rejected for PENDING fisher.');
    } else {
      throw new Error(`Test D (Base Pending) Failed: ${grantPendingRes.status}`);
    }

    // Restore status to ACTIVE
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });

    // 3. Soft-Archived
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}/archive`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const grantArchivedRes = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: generateUUID() }),
    });
    if (grantArchivedRes.status === 400) {
      console.log('✔ Test D (Archived) Passed: Grant rejected for ARCHIVED fisher.');
    } else {
      throw new Error(`Test D (Archived) Failed: ${grantArchivedRes.status}`);
    }

    // Restore fisher from archive
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });

    // Test E: Snapshot Immutability (Edit Boat No after grant -> Historical record unchanged)
    await fetch(`${baseUrl}/api/fishers/${testFisher1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ boat_no: 'BOAT-CLR-MODIFIED-999' }),
    });

    const historyResE = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/history`, {
      headers: { Cookie: cookieHeader },
    });
    const historyBodyE = await getJson(historyResE);
    if (historyBodyE.history[0].boat_no_snapshot === 'BOAT-CLR-ORIG') {
      console.log('✔ Test E Passed: Historical boat_no_snapshot remained immutable (BOAT-CLR-ORIG) after Fisher boat update.');
    } else {
      throw new Error(`Test E Failed: Snapshot mutated! Got ${historyBodyE.history[0].boat_no_snapshot}`);
    }

    // Test F: Idempotency Verification
    // Re-send keyA -> Returns 200 with original clearance
    const idemRes1 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher1.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: keyA }),
    });
    const idemBody1 = await getJson(idemRes1);
    if (idemRes1.status === 200 && idemBody1.clearance.clearance_no === grantBody1.clearance.clearance_no) {
      console.log('✔ Test F Passed: Re-sending same idempotency key returned existing clearance with 200 OK.');
    } else {
      throw new Error(`Test F Failed: ${idemRes1.status} ${JSON.stringify(idemBody1)}`);
    }

    // Re-send keyA for testFisher3 -> Returns 409 Conflict
    const idemRes2 = await fetch(`${baseUrl}/api/clearance/fishers/${testFisher3.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: keyA }),
    });
    if (idemRes2.status === 409) {
      console.log('✔ Test F Passed: Reusing idempotency key for another fisher rejected with 409 Conflict.');
    } else {
      throw new Error(`Test F Failed: Expected 409, got ${idemRes2.status}`);
    }

    // Test G: Concurrent Grant & Sequence Atomic Lock
    await prisma.fishers.deleteMany({ where: { nic: '199912345681' } });
    const createFisherRes4 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Concurrent Clearance Fisher',
        nic: '199912345681',
        phone: '0774445566',
        status: 'ACTIVE',
      }),
    });
    const createFisherBody4 = await getJson(createFisherRes4);
    testFisher4 = createFisherBody4.fisher;

    console.log('--- Testing Concurrent Grant Clearance (Atomic CLR Sequence Lock) ---');
    const keyG1 = generateUUID();
    const keyG2 = generateUUID();

    const p1 = fetch(`${baseUrl}/api/clearance/fishers/${testFisher4.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: keyG1 }),
    }).then((r) => getJson(r));

    const p2 = fetch(`${baseUrl}/api/clearance/fishers/${testFisher4.id}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ idempotencyKey: keyG2 }),
    }).then((r) => getJson(r));

    const [resConcurrent1, resConcurrent2] = await Promise.all([p1, p2]);
    if (resConcurrent1.success && resConcurrent2.success) {
      const no1 = resConcurrent1.clearance.clearance_no;
      const no2 = resConcurrent2.clearance.clearance_no;
      if (no1 !== no2 && no1.startsWith('CLR-') && no2.startsWith('CLR-')) {
        console.log(`✔ Test G Passed: Concurrent grants generated unique sequential clearance numbers (${no1} and ${no2}).`);
      } else {
        throw new Error(`Test G Failed: Duplicate CLR sequence numbers generated (${no1}, ${no2})`);
      }
    } else {
      throw new Error(`Test G Failed: Concurrent grant failed (${JSON.stringify(resConcurrent1)}, ${JSON.stringify(resConcurrent2)})`);
    }

    // Clean up created test records from isolated test database (valachchenai_harbor_test)
    const testFisherIds = [
      BigInt(testFisher1.id),
      BigInt(testFisher2.id),
      BigInt(testFisher3.id),
      BigInt(testFisher4.id),
    ];

    await prisma.clearance_records.deleteMany({
      where: { fisher_id: { in: testFisherIds } },
    });
    await prisma.fisher_holds.deleteMany({
      where: { fisher_id: { in: testFisherIds } },
    });
    await prisma.debt_payments.deleteMany({
      where: { fisher_id: { in: testFisherIds } },
    });
    await prisma.fisher_debts.deleteMany({
      where: { fisher_id: { in: testFisherIds } },
    });
    await prisma.fishers.deleteMany({
      where: { id: { in: testFisherIds } },
    });

    console.log('✔ Cleaned up all test fixtures cleanly from test DB.');
    console.log('==================================================');
    console.log('✔ ALL STEP 8 CLEARANCE TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit();
  }
}

runClearanceTests();
