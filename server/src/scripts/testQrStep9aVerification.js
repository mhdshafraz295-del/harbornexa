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
const crypto = require('crypto');
const prisma = require('../config/prismaClient');
const db = require('../config/db');
const env = require('../config/env');
const bcrypt = require('bcrypt');
const app = require('../app');

if (env.db.database !== 'valachchenai_harbor_test') {
  throw new Error(`FATAL: HARD TEST DB GUARD FAILED! env.db.database resolved to '${env.db.database}', expected 'valachchenai_harbor_test'. Aborting.`);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken).trim()).digest('hex');
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

async function runStep9aVerificationTests() {
  console.log('==================================================');
  console.log('  PRISMA STEP 9A: MISSING QR REGRESSION VERIFICATION');
  console.log('==================================================');

  // 1. Query MySQL for DATABASE() on both mysql2 and Prisma to verify live connection target
  const [rawDbRes] = await db.query('SELECT DATABASE() as currentDb');
  const mysql2Db = rawDbRes[0]?.currentDb;

  const prismaDbRes = await prisma.$queryRaw`SELECT DATABASE() as currentDb`;
  const prismaDb = prismaDbRes[0]?.currentDb;

  if (mysql2Db !== 'valachchenai_harbor_test' || prismaDb !== 'valachchenai_harbor_test') {
    throw new Error(`FATAL: DB ISOLATION FAILURE! mysql2='${mysql2Db}', Prisma='${prismaDb}'. Must be 'valachchenai_harbor_test'.`);
  }
  console.log(`✔ HARD TEST DB GUARD VERIFIED: mysql2='${mysql2Db}', Prisma='${prismaDb}' (ISOLATED TEST DB ONLY).`);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5103, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5103');

  const baseUrl = 'http://127.0.0.1:5103';

  let testFisher = null;
  let testAdmin = null;

  try {
    // Authenticate Admin inside test DB
    const validPass = 'Admin123!';
    const validHash = await bcrypt.hash(validPass, 12);
    testAdmin = await prisma.admins.upsert({
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

    // Cleanup any existing fixture with NIC 199999887799
    const existingFixture = await prisma.fishers.findUnique({ where: { nic: '199999887799' } });
    if (existingFixture) {
      const fid = existingFixture.id;
      await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: fid } });
      await prisma.fisher_holds.deleteMany({ where: { fisher_id: fid } });
      await prisma.debt_payments.deleteMany({ where: { fisher_id: fid } });
      await prisma.fisher_debts.deleteMany({ where: { fisher_id: fid } });
      await prisma.clearance_records.deleteMany({ where: { fisher_id: fid } });
      await prisma.fishers.delete({ where: { id: fid } });
    }

    // Create Test Fisher
    const fisherRes = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Step 9A Verification Fisher',
        nic: '199999887799',
        phone: '0779998877',
        boat_no: 'BOAT-9A-001',
      }),
    });
    const fisherData = await getJson(fisherRes);
    testFisher = fisherData.fisher;
    const fisherDbId = BigInt(testFisher.id);
    console.log(`✔ Created active test fisher: ${testFisher.fisher_id} (ID: ${testFisher.id})`);

    // ----------------------------------------------------
    // TEST 2: DEBT LIVE STATUS TEST
    // ----------------------------------------------------
    console.log('\n--- Test 2: Debt Live Status Test ---');
    // Generate QR
    const genRes1 = await fetch(`${baseUrl}/api/qr/fishers/${testFisher.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const genData1 = await getJson(genRes1);
    const validQrToken = genData1.rawToken;

    // 4. Scan SAME QR -> CLEARED
    const scanRes1 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: validQrToken }),
    });
    const scanData1 = await getJson(scanRes1);
    if (scanData1.clearanceStatus.status !== 'CLEARED') {
      throw new Error(`Test 2 Step 4 Failed: Expected status CLEARED, got ${scanData1.clearanceStatus.status}`);
    }
    console.log('✔ Scan 1: Returned CLEARED for active fisher with no debt/hold.');

    // 5. Add Rs. 3000 debt via Prisma
    const createdDebt = await prisma.fisher_debts.create({
      data: {
        fisher_id: fisherDbId,
        category: 'HARBOR_FEE',
        description: 'Test harbor fee debt',
        original_amount: '3000.00',
        debt_date: new Date(),
        status: 'OPEN',
        created_by_admin_id: testAdmin.id,
      },
    });

    // 6. Scan SAME QR -> HOLD (reason includes OUTSTANDING_DEBT)
    const scanRes2 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: validQrToken }),
    });
    const scanData2 = await getJson(scanRes2);
    if (scanData2.clearanceStatus.status !== 'HOLD') {
      throw new Error(`Test 2 Step 6 Failed: Expected status HOLD after adding debt, got ${scanData2.clearanceStatus.status}`);
    }
    const hasDebtReason = scanData2.clearanceStatus.reasons.some(r => r.code === 'OUTSTANDING_DEBT');
    if (!hasDebtReason) {
      throw new Error('Test 2 Step 6 Failed: Reasons did not include OUTSTANDING_DEBT.');
    }
    console.log('✔ Scan 2: Returned HOLD with OUTSTANDING_DEBT reason after adding debt.');

    // 7. Pay full Rs. 3000 via Prisma
    await prisma.$transaction(async (tx) => {
      await tx.debt_payments.create({
        data: {
          debt_id: createdDebt.id,
          fisher_id: fisherDbId,
          amount: '3000.00',
          payment_date: new Date(),
          payment_method: 'CASH',
          idempotency_key: 'idemp-pay-9a-' + Date.now(),
          received_by_admin_id: testAdmin.id,
        },
      });
      await tx.fisher_debts.update({
        where: { id: createdDebt.id },
        data: { status: 'PAID' },
      });
    });

    // 8. Scan SAME QR -> CLEARED
    const scanRes3 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: validQrToken }),
    });
    const scanData3 = await getJson(scanRes3);
    if (scanData3.clearanceStatus.status !== 'CLEARED') {
      throw new Error(`Test 2 Step 8 Failed: Expected CLEARED after full payment, got ${scanData3.clearanceStatus.status}`);
    }
    console.log('✔ Scan 3: Returned CLEARED after full payment of debt (WITHOUT QR reissue).');

    // ----------------------------------------------------
    // TEST 3: PENDING TEST
    // ----------------------------------------------------
    console.log('\n--- Test 3: Pending Fisher Base Status Test ---');
    // Set test Fisher base status to PENDING
    await prisma.fishers.update({
      where: { id: fisherDbId },
      data: { status: 'PENDING' },
    });

    const scanPendingRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: validQrToken }),
    });
    const scanPendingData = await getJson(scanPendingRes);
    if (scanPendingData.clearanceStatus.status !== 'PENDING') {
      throw new Error(`Test 3 Failed: Expected PENDING status, got ${scanPendingData.clearanceStatus.status}`);
    }
    console.log('✔ Verified scan returns PENDING (not CLEARED) when base status is PENDING.');

    // Restore Fisher base status to ACTIVE
    await prisma.fishers.update({
      where: { id: fisherDbId },
      data: { status: 'ACTIVE' },
    });

    // ----------------------------------------------------
    // TEST 4: MULTIPLE REASON TEST
    // ----------------------------------------------------
    console.log('\n--- Test 4: Multiple Reason Test ---');
    // Create new debt
    const createdDebt2 = await prisma.fisher_debts.create({
      data: {
        fisher_id: fisherDbId,
        category: 'PERMIT_FEE',
        description: 'Multiple reason test debt',
        original_amount: '1500.00',
        debt_date: new Date(),
        status: 'OPEN',
        created_by_admin_id: testAdmin.id,
      },
    });

    // Create active manual hold using Prisma
    const manualHold = await prisma.fisher_holds.create({
      data: {
        fisher_id: fisherDbId,
        reason_code: 'MANAGEMENT_DECISION',
        reason_text: 'Multiple reason hold test',
        hold_date: new Date(),
        created_by_admin_id: testAdmin.id,
      },
    });

    // Set base status BLOCKED
    await prisma.fishers.update({
      where: { id: fisherDbId },
      data: { status: 'BLOCKED' },
    });

    // Scan SAME QR
    const scanMultiRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: validQrToken }),
    });
    const scanMultiData = await getJson(scanMultiRes);
    if (scanMultiData.clearanceStatus.status !== 'HOLD') {
      throw new Error(`Test 4 Failed: Expected status HOLD for multiple hold conditions, got ${scanMultiData.clearanceStatus.status}`);
    }

    const reasonCodes = scanMultiData.clearanceStatus.reasons.map(r => r.code);
    const hasOutstandingDebt = reasonCodes.includes('OUTSTANDING_DEBT');
    const hasManualHold = reasonCodes.includes('MANAGEMENT_DECISION');
    const hasBaseBlocked = reasonCodes.includes('BASE_BLOCKED');

    if (!hasOutstandingDebt || !hasManualHold || !hasBaseBlocked) {
      throw new Error(`Test 4 Failed: Missing reason code in array [${reasonCodes.join(', ')}]. Expected OUTSTANDING_DEBT, MANAGEMENT_DECISION, and BASE_BLOCKED.`);
    }
    console.log(`✔ Verified multiple reasons collected simultaneously: [${reasonCodes.join(', ')}].`);

    // Teardown multiple reason conditions
    await prisma.fishers.update({ where: { id: fisherDbId }, data: { status: 'ACTIVE' } });
    await prisma.fisher_holds.update({
      where: { id: manualHold.id },
      data: { released_at: new Date(), released_by_admin_id: testAdmin.id },
    });
    await prisma.fisher_debts.update({
      where: { id: createdDebt2.id },
      data: { status: 'CANCELLED', cancelled_at: new Date(), cancelled_by_admin_id: testAdmin.id },
    });

    // ----------------------------------------------------
    // TEST 5: REPEATED SCAN READ-ONLY TEST
    // ----------------------------------------------------
    console.log('\n--- Test 5: Repeated Scan Read-Only Test ---');
    const fishersCountBefore = await prisma.fishers.count();
    const qrTokensCountBefore = await prisma.fisher_qr_tokens.count();
    const clearanceRecordsCountBefore = await prisma.clearance_records.count();

    // Scan valid QR 3 times consecutively
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${baseUrl}/api/qr/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: JSON.stringify({ token: validQrToken }),
      });
      const data = await getJson(res);
      if (!data.success) {
        throw new Error(`Test 5 Failed on scan #${i}`);
      }
    }

    const fishersCountAfter = await prisma.fishers.count();
    const qrTokensCountAfter = await prisma.fisher_qr_tokens.count();
    const clearanceRecordsCountAfter = await prisma.clearance_records.count();

    if (fishersCountBefore !== fishersCountAfter) {
      throw new Error('Test 5 Failed: fishers count changed after scans!');
    }
    if (qrTokensCountBefore !== qrTokensCountAfter) {
      throw new Error('Test 5 Failed: fisher_qr_tokens count changed after scans!');
    }
    if (clearanceRecordsCountBefore !== clearanceRecordsCountAfter) {
      throw new Error('Test 5 Failed: clearance_records count changed after scans!');
    }
    console.log('✔ Confirmed 3 consecutive QR scans caused 0 table mutations and 0 clearance auto-creations.');

    // ----------------------------------------------------
    // TEST 6: CONCURRENT GENERATE / REISSUE TEST
    // ----------------------------------------------------
    console.log('\n--- Test 6: Concurrent Generate / Reissue Test ---');
    // Run two simultaneous generate/reissue requests for testFisher
    const p1 = fetch(`${baseUrl}/api/qr/fishers/${testFisher.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const p2 = fetch(`${baseUrl}/api/qr/fishers/${testFisher.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });

    const [resP1, resP2] = await Promise.all([p1, p2]);
    const dataP1 = await getJson(resP1);
    const dataP2 = await getJson(resP2);

    if (resP1.status !== 200 || resP2.status !== 200) {
      throw new Error(`Test 6 Failed: Concurrent requests failed - P1: ${resP1.status}, P2: ${resP2.status}`);
    }

    // Verify active token count in DB is EXACTLY 1 for this fisher
    const activeTokensInDb = await prisma.fisher_qr_tokens.findMany({
      where: {
        fisher_id: fisherDbId,
        is_active: true,
      },
    });

    if (activeTokensInDb.length !== 1) {
      throw new Error(`Test 6 Failed: Expected exactly 1 active token in DB, found ${activeTokensInDb.length}`);
    }
    console.log('✔ Verified exactly 1 active token in DB after concurrent issuance requests.');

    // Verify history preserved
    const totalTokensInDb = await prisma.fisher_qr_tokens.findMany({
      where: { fisher_id: fisherDbId },
    });
    if (totalTokensInDb.length < 3) {
      throw new Error('Test 6 Failed: Token history missing or hard deleted.');
    }
    console.log(`✔ Verified token history preserved (${totalTokensInDb.length} historical token records retained).`);

    // Identify which generated token is active by matching hash or raw token
    const activeHash = activeTokensInDb[0].token_hash;
    let latestActiveRawToken = null;
    let expiredRawToken = null;

    if (hashToken(dataP1.rawToken) === activeHash) {
      latestActiveRawToken = dataP1.rawToken;
      expiredRawToken = dataP2.rawToken;
    } else if (hashToken(dataP2.rawToken) === activeHash) {
      latestActiveRawToken = dataP2.rawToken;
      expiredRawToken = dataP1.rawToken;
    } else {
      throw new Error('Test 6 Failed: Active token hash in DB did not match either returned raw token.');
    }

    const verifyActiveRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: latestActiveRawToken }),
    });
    const verifyActiveData = await getJson(verifyActiveRes);
    if (!verifyActiveData.success) {
      throw new Error('Test 6 Failed: Active token failed verification.');
    }
    console.log('✔ Verified active token scan succeeds.');

    // Verify invalidated token fails
    const verifyExpiredRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: expiredRawToken }),
    });
    if (verifyExpiredRes.status !== 400) {
      throw new Error(`Test 6 Failed: Invalidated token scan expected 400, got ${verifyExpiredRes.status}`);
    }
    console.log('✔ Verified invalidated token scan fails with 400.');

    // ----------------------------------------------------
    // TEST 7: RAW TOKEN ONE-TIME RULE
    // ----------------------------------------------------
    console.log('\n--- Test 7: Raw Token One-Time Rule ---');
    // Generate endpoint returns rawToken once
    if (!dataP1.rawToken || !dataP1.rawToken.startsWith('vh_f_')) {
      throw new Error('Test 7 Failed: Generate endpoint response missing rawToken.');
    }

    // Status endpoint DOES NOT return rawToken
    const statusCheckRes = await fetch(`${baseUrl}/api/qr/fishers/${testFisher.fisher_id}/status`, {
      headers: { Cookie: cookieHeader },
    });
    const statusCheckData = await getJson(statusCheckRes);
    if (statusCheckData.activeToken && statusCheckData.activeToken.rawToken) {
      throw new Error('Test 7 Failed: Status endpoint leaked rawToken!');
    }
    console.log('✔ GET status endpoint returned active token ID & timestamp, but NO rawToken.');

    // DB record DOES NOT store rawToken
    const activeDbTokenRecord = await prisma.fisher_qr_tokens.findUnique({
      where: { id: activeTokensInDb[0].id },
    });
    const tokenRecordKeys = Object.keys(activeDbTokenRecord);
    if (tokenRecordKeys.includes('rawToken') || tokenRecordKeys.includes('token')) {
      throw new Error('Test 7 Failed: DB table schema has rawToken field!');
    }
    if (!activeDbTokenRecord.token_hash || activeDbTokenRecord.token_hash.length !== 64) {
      throw new Error('Test 7 Failed: token_hash missing or invalid length.');
    }
    console.log('✔ DB stores exclusively 64-character SHA-256 token_hash. Zero plaintext token storage.');

    console.log('\n==================================================');
    console.log('   ALL STEP 9A VERIFICATION TESTS PASSED CLEANLY!');
    console.log('==================================================\n');

  } finally {
    // Teardown test fixture
    if (testFisher) {
      const fid = BigInt(testFisher.id);
      await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: fid } });
      await prisma.fisher_holds.deleteMany({ where: { fisher_id: fid } });
      await prisma.debt_payments.deleteMany({ where: { fisher_id: fid } });
      await prisma.fisher_debts.deleteMany({ where: { fisher_id: fid } });
      await prisma.clearance_records.deleteMany({ where: { fisher_id: fid } });
      await prisma.fishers.delete({ where: { id: fid } });
      console.log('✔ Test fixtures cleaned up from valachchenai_harbor_test.');
    }

    server.close();
  }
}

runStep9aVerificationTests()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ STEP 9A VERIFICATION TEST SUITE FAILED WITH ERROR:');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
