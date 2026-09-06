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
const { assertIsolatedTestDatabase } = require('./helpers/testDbGuard');
const bcrypt = require('bcrypt');
const app = require('../app');

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

async function runQrTests() {
  console.log('==================================================');
  console.log('     PRISMA STEP 9: QR SYSTEM TEST SUITE');
  console.log('==================================================');

  await assertIsolatedTestDatabase(prisma);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5102, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5102');

  const baseUrl = 'http://127.0.0.1:5102';

  let testFisher1 = null;
  let testFisher2 = null;

  try {
    // Authenticate Admin inside test DB
    const validPass = 'Admin123!';
    const validHash = await bcrypt.hash(validPass, 12);
    const testAdmin = await prisma.admins.upsert({
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

    // Teardown pre-existing test fishers
    const testNics = ['199999887766', '199999887767'];
    for (const nic of testNics) {
      const existing = await prisma.fishers.findUnique({ where: { nic } });
      if (existing) {
        await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.fisher_holds.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.clearance_records.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.fishers.delete({ where: { id: existing.id } });
      }
    }

    // Create Test Fisher 1
    const fisherRes1 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'QR Test Fisher One',
        nic: '199999887766',
        phone: '0771112233',
        boat_no: 'BOAT-QR-001',
      }),
    });
    const fisherData1 = await getJson(fisherRes1);
    testFisher1 = fisherData1.fisher;
    console.log(`✔ Created active test fisher: ${testFisher1.fisher_id} (ID: ${testFisher1.id})`);

    // ----------------------------------------------------
    // TEST 1: Generate Initial QR Token for Active Fisher
    // ----------------------------------------------------
    console.log('\n--- Test 1: Generate Initial QR Token ---');
    const genRes1 = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const genData1 = await getJson(genRes1);
    if (genRes1.status !== 200 || !genData1.success || !genData1.rawToken) {
      throw new Error(`Test 1 Failed: Expected 200 & rawToken, got ${genRes1.status} - ${JSON.stringify(genData1)}`);
    }
    const rawToken1 = genData1.rawToken;
    if (!rawToken1.startsWith('vh_f_')) {
      throw new Error(`Test 1 Failed: rawToken does not start with 'vh_f_': ${rawToken1}`);
    }

    // Verify DB record (stored as SHA-256 hash, active)
    const tokenHash1 = hashToken(rawToken1);
    const dbToken1 = await prisma.fisher_qr_tokens.findUnique({ where: { token_hash: tokenHash1 } });
    if (!dbToken1 || !dbToken1.is_active || Number(dbToken1.fisher_id) !== Number(testFisher1.id)) {
      throw new Error('Test 1 Failed: QR token DB record incorrect or not active.');
    }
    console.log(`✔ Generated rawToken: ${rawToken1.substring(0, 15)}... (DB Hash verified active)`);

    // Verify Status endpoint
    const statusRes1 = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/status`, {
      headers: { Cookie: cookieHeader },
    });
    const statusData1 = await getJson(statusRes1);
    if (statusRes1.status !== 200 || !statusData1.isIssued || !statusData1.activeToken) {
      throw new Error(`Test 1 Failed: Status endpoint failed - ${JSON.stringify(statusData1)}`);
    }
    console.log('✔ GET QR status returned isIssued=true and activeToken.');

    // ----------------------------------------------------
    // TEST 2: Read-Only Scan Verification of Active QR
    // ----------------------------------------------------
    console.log('\n--- Test 2: Read-Only Scan Verification ---');
    const verifyRes1 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken1 }),
    });
    const verifyData1 = await getJson(verifyRes1);
    if (verifyRes1.status !== 200 || !verifyData1.success || verifyData1.fisher.fisher_id !== testFisher1.fisher_id) {
      throw new Error(`Test 2 Failed: Scan verification failed - ${JSON.stringify(verifyData1)}`);
    }
    if (verifyData1.clearanceStatus.status !== 'CLEARED') {
      throw new Error(`Test 2 Failed: Expected status CLEARED, got ${verifyData1.clearanceStatus.status}`);
    }
    console.log(`✔ Verified QR token scan successfully for Fisher ${testFisher1.fisher_id} (Status: CLEARED).`);

    // ----------------------------------------------------
    // TEST 3: Dynamic Live Status Change on Active QR Scan
    // ----------------------------------------------------
    console.log('\n--- Test 3: Dynamic Live Status Change on Active QR Scan ---');
    // Place a manual hold on Fisher 1 using Prisma
    const createdHold = await prisma.fisher_holds.create({
      data: {
        fisher_id: BigInt(testFisher1.id),
        reason_code: 'MANAGEMENT_DECISION',
        reason_text: 'Temporary administrative hold for testing',
        hold_date: new Date(),
        created_by_admin_id: testAdmin.id,
      },
    });

    // Scan same rawToken1 again without reissuing!
    const verifyRes2 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken1 }),
    });
    const verifyData2 = await getJson(verifyRes2);
    if (verifyRes2.status !== 200 || verifyData2.clearanceStatus.status !== 'HOLD') {
      throw new Error(`Test 3 Failed: Expected HOLD status on scan after hold, got ${JSON.stringify(verifyData2)}`);
    }
    console.log('✔ QR scan dynamically returned HOLD status after hold applied (no reissue needed).');

    // Release the manual hold using Prisma
    await prisma.fisher_holds.update({
      where: { id: createdHold.id },
      data: {
        released_at: new Date(),
        released_by_admin_id: testAdmin.id,
        release_notes: 'Releasing test hold',
      },
    });

    // Scan rawToken1 again
    const verifyRes3 = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken1 }),
    });
    const verifyData3 = await getJson(verifyRes3);
    if (verifyRes3.status !== 200 || verifyData3.clearanceStatus.status !== 'CLEARED') {
      throw new Error(`Test 3 Failed: Expected CLEARED after hold release, got ${JSON.stringify(verifyData3)}`);
    }
    console.log('✔ QR scan dynamically returned CLEARED status after hold released.');

    // ----------------------------------------------------
    // TEST 4: Reissue QR Token for Same Fisher
    // ----------------------------------------------------
    console.log('\n--- Test 4: Reissue QR Token ---');
    const genRes2 = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const genData2 = await getJson(genRes2);
    if (genRes2.status !== 200 || !genData2.success || !genData2.rawToken) {
      throw new Error(`Test 4 Failed: Reissue failed - ${JSON.stringify(genData2)}`);
    }
    const rawToken2 = genData2.rawToken;
    if (rawToken1 === rawToken2) {
      throw new Error('Test 4 Failed: Reissued token must be different from old token.');
    }

    // Check old token is inactive in DB
    const dbTokenOld = await prisma.fisher_qr_tokens.findUnique({ where: { token_hash: tokenHash1 } });
    if (!dbTokenOld || dbTokenOld.is_active || !dbTokenOld.revoked_at) {
      throw new Error('Test 4 Failed: Old token was not revoked in DB upon reissue.');
    }

    // Verify old token scan fails with 400
    const verifyOldRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken1 }),
    });
    const verifyOldData = await getJson(verifyOldRes);
    if (verifyOldRes.status !== 400 || verifyOldData.message !== 'This Fisher QR is no longer active.') {
      throw new Error(`Test 4 Failed: Old token scan expected 400 inactive message, got ${verifyOldRes.status} - ${JSON.stringify(verifyOldData)}`);
    }
    console.log('✔ Old QR token rejected with "This Fisher QR is no longer active." after reissue.');

    // Verify new token scan succeeds
    const verifyNewRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken2 }),
    });
    const verifyNewData = await getJson(verifyNewRes);
    if (verifyNewRes.status !== 200 || !verifyNewData.success) {
      throw new Error(`Test 4 Failed: New reissued token scan failed - ${JSON.stringify(verifyNewData)}`);
    }
    console.log('✔ New reissued QR token verified successfully.');

    // ----------------------------------------------------
    // TEST 5: Manual QR Token Revocation
    // ----------------------------------------------------
    console.log('\n--- Test 5: Revoke QR Token ---');
    const revokeRes = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const revokeData = await getJson(revokeRes);
    if (revokeRes.status !== 200 || !revokeData.success) {
      throw new Error(`Test 5 Failed: Revoke endpoint failed - ${JSON.stringify(revokeData)}`);
    }

    // Status check returns isIssued=false
    const statusRes2 = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/status`, {
      headers: { Cookie: cookieHeader },
    });
    const statusData2 = await getJson(statusRes2);
    if (statusRes2.status !== 200 || statusData2.isIssued !== false || statusData2.activeToken !== null) {
      throw new Error(`Test 5 Failed: Status after revocation should be isIssued=false, got ${JSON.stringify(statusData2)}`);
    }
    console.log('✔ Status endpoint confirmed isIssued=false after revocation.');

    // Verification of revoked token fails
    const verifyRevokedRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: rawToken2 }),
    });
    const verifyRevokedData = await getJson(verifyRevokedRes);
    if (verifyRevokedRes.status !== 400 || verifyRevokedData.message !== 'This Fisher QR is no longer active.') {
      throw new Error(`Test 5 Failed: Expected 400 for revoked token, got ${verifyRevokedRes.status} - ${JSON.stringify(verifyRevokedData)}`);
    }
    console.log('✔ Revoked QR token scan rejected with 400.');

    // Revoking again returns 400
    const revokeAgainRes = await fetch(`${baseUrl}/api/qr/fishers/${testFisher1.fisher_id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const revokeAgainData = await getJson(revokeAgainRes);
    if (revokeAgainRes.status !== 400) {
      throw new Error(`Test 5 Failed: Double revocation expected 400, got ${revokeAgainRes.status} - ${JSON.stringify(revokeAgainData)}`);
    }
    console.log('✔ Double revocation handled correctly with 400.');

    // ----------------------------------------------------
    // TEST 6: Invalid & Malformed Token Verification
    // ----------------------------------------------------
    console.log('\n--- Test 6: Invalid & Malformed Token Verification ---');
    const emptyRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: '' }),
    });
    if (emptyRes.status !== 400) {
      throw new Error(`Test 6 Failed: Empty token expected 400, got ${emptyRes.status}`);
    }

    const malformedRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: 'invalid_prefix_123456789' }),
    });
    if (malformedRes.status !== 400) {
      throw new Error(`Test 6 Failed: Malformed token expected 400, got ${malformedRes.status}`);
    }

    const nonexistentRes = await fetch(`${baseUrl}/api/qr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ token: 'vh_f_' + 'a'.repeat(64) }),
    });
    if (nonexistentRes.status !== 404) {
      throw new Error(`Test 6 Failed: Non-existent token expected 404, got ${nonexistentRes.status}`);
    }
    console.log('✔ Empty, malformed, and non-existent QR token verifications rejected properly.');

    // ----------------------------------------------------
    // TEST 7: Archived Fisher QR Prevention
    // ----------------------------------------------------
    console.log('\n--- Test 7: Archived Fisher QR Prevention ---');
    const fisherRes2 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'QR Test Fisher Two Archived',
        nic: '199999887767',
        phone: '0771112234',
        boat_no: 'BOAT-QR-002',
      }),
    });
    const fisherData2 = await getJson(fisherRes2);
    testFisher2 = fisherData2.fisher;

    // Archive testFisher2
    await prisma.fishers.update({
      where: { id: BigInt(testFisher2.id) },
      data: { is_archived: true },
    });

    const genArchivedRes = await fetch(`${baseUrl}/api/qr/fishers/${testFisher2.fisher_id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    });
    const genArchivedData = await getJson(genArchivedRes);
    if (genArchivedRes.status !== 400 || genArchivedData.message !== 'Cannot generate QR for an archived fisher record.') {
      throw new Error(`Test 7 Failed: Archived fisher QR generation expected 400, got ${genArchivedRes.status} - ${JSON.stringify(genArchivedData)}`);
    }
    console.log('✔ Archived fisher QR generation blocked with 400.');

    console.log('\n==================================================');
    console.log('   ALL PRISMA STEP 9 QR TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================\n');
  } finally {
    // Teardown test records
    if (testFisher1 || testFisher2) {
      const idsToDelete = [testFisher1?.id, testFisher2?.id].filter(Boolean).map(id => BigInt(id));
      await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: { in: idsToDelete } } });
      await prisma.fisher_holds.deleteMany({ where: { fisher_id: { in: idsToDelete } } });
      await prisma.clearance_records.deleteMany({ where: { fisher_id: { in: idsToDelete } } });
      await prisma.fishers.deleteMany({ where: { id: { in: idsToDelete } } });
      console.log('✔ Test fixtures cleaned up from valachchenai_harbor_test.');
    }

    server.close();
  }
}

runQrTests()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ TEST SUITE FAILED WITH ERROR:');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
