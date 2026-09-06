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

async function getJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`HTTP Status ${res.status} Error Body:`, text);
    throw new Error(`HTTP ${res.status} returned non-JSON response: ${text.substring(0, 300)}`);
  }
}

async function runStep10Tests() {
  console.log('==================================================');
  console.log('   PRISMA STEP 10: REMAINING DB ACCESS TEST SUITE');
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
  await new Promise((resolve) => server.listen(5104, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5104');

  const baseUrl = 'http://127.0.0.1:5104';

  let testAdmin = null;
  const createdFisherIds = [];

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

    // ----------------------------------------------------
    // TEST 1: CHARGE TYPES CRUD
    // ----------------------------------------------------
    console.log('\n--- Test 1: Charge Types CRUD ---');
    const ctName = 'Test Port Fee ' + Date.now();
    const createCtRes = await fetch(`${baseUrl}/api/charge-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        name: ctName,
        defaultAmount: 2500,
        description: 'Test port fee description',
        isActive: true,
      }),
    });
    const createCtData = await getJson(createCtRes);
    if (createCtRes.status !== 201 || !createCtData.success) {
      throw new Error(`Test 1 Failed: Creating charge type failed - ${JSON.stringify(createCtData)}`);
    }
    const chargeTypeId = createCtData.chargeType.id;
    console.log(`✔ Created charge type ID ${chargeTypeId} with Decimal amount ${createCtData.chargeType.default_amount}`);

    const getCtRes = await fetch(`${baseUrl}/api/charge-types`, { headers: { Cookie: cookieHeader } });
    const getCtData = await getJson(getCtRes);
    if (!getCtData.chargeTypes.some((ct) => ct.id === chargeTypeId)) {
      throw new Error('Test 1 Failed: Charge type not found in list.');
    }
    console.log('✔ Charge types list query returned created item.');

    // ----------------------------------------------------
    // TEST 2: DASHBOARD METRICS & MUTUAL EXCLUSIVITY
    // ----------------------------------------------------
    console.log('\n--- Test 2: Dashboard Metrics & Mutual Exclusivity ---');
    // Clear test fishers if any
    const testNics = ['199990001101', '199990001102', '199990001103', '199990001104', '199990001105', '199990001106'];
    for (const nic of testNics) {
      const existing = await prisma.fishers.findUnique({ where: { nic } });
      if (existing) {
        await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.fisher_holds.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.debt_payments.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.fisher_debts.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.clearance_records.deleteMany({ where: { fisher_id: existing.id } });
        await prisma.fishers.delete({ where: { id: existing.id } });
      }
    }

    // A. Active/Cleared Fisher
    const f1 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100001', full_name: 'F1 Active', nic: '199990001101', status: 'ACTIVE', created_by_admin_id: testAdmin.id },
    });
    // B. Debt Hold Fisher
    const f2 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100002', full_name: 'F2 Debt Hold', nic: '199990001102', status: 'ACTIVE', created_by_admin_id: testAdmin.id },
    });
    await prisma.fisher_debts.create({
      data: { fisher_id: f2.id, category: 'FEE', original_amount: '3500.00', debt_date: new Date(), status: 'OPEN', created_by_admin_id: testAdmin.id },
    });
    // C. Manual Hold Fisher
    const f3 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100003', full_name: 'F3 Manual Hold', nic: '199990001103', status: 'ACTIVE', created_by_admin_id: testAdmin.id },
    });
    await prisma.fisher_holds.create({
      data: { fisher_id: f3.id, reason_code: 'MANAGEMENT_DECISION', hold_date: new Date(), created_by_admin_id: testAdmin.id },
    });
    // D. Base BLOCKED Fisher
    const f4 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100004', full_name: 'F4 Base Blocked', nic: '199990001104', status: 'BLOCKED', created_by_admin_id: testAdmin.id },
    });
    // E. Base PENDING Fisher
    const f5 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100005', full_name: 'F5 Base Pending', nic: '199990001105', status: 'PENDING', created_by_admin_id: testAdmin.id },
    });
    // F. Archived Fisher (should be ignored from counts)
    const f6 = await prisma.fishers.create({
      data: { fisher_id: 'FIS-100006', full_name: 'F6 Archived', nic: '199990001106', status: 'ACTIVE', is_archived: true, created_by_admin_id: testAdmin.id },
    });

    createdFisherIds.push(f1.id, f2.id, f3.id, f4.id, f5.id, f6.id);

    const dashRes = await fetch(`${baseUrl}/api/dashboard/metrics`, { headers: { Cookie: cookieHeader } });
    const dashData = await getJson(dashRes);
    if (dashRes.status !== 200 || !dashData.success) {
      throw new Error(`Test 2 Failed: Dashboard API error - ${JSON.stringify(dashData)}`);
    }

    const { metrics } = dashData;
    console.log('✔ Dashboard metrics retrieved:', metrics);

    // Total non-archived fishers = 5
    if (metrics.totalFishers !== 5) {
      throw new Error(`Test 2 Failed: Expected totalFishers=5, got ${metrics.totalFishers}`);
    }
    // Blocked (effective status HOLD) = F2 (debt), F3 (manual hold), F4 (base blocked) -> 3
    if (metrics.blocked !== 3) {
      throw new Error(`Test 2 Failed: Expected blocked=3, got ${metrics.blocked}`);
    }
    // Pending = F5 -> 1
    if (metrics.pending !== 1) {
      throw new Error(`Test 2 Failed: Expected pending=1, got ${metrics.pending}`);
    }
    // Active (effective status CLEARED) = F1 -> 1
    if (metrics.active !== 1) {
      throw new Error(`Test 2 Failed: Expected active=1, got ${metrics.active}`);
    }
    // Verify mutual exclusivity: active + blocked + pending === totalFishers (1 + 3 + 1 === 5)
    if (metrics.active + metrics.blocked + metrics.pending !== metrics.totalFishers) {
      throw new Error('Test 2 Failed: Status metrics are not mutually exclusive!');
    }
    console.log('✔ Dashboard metrics verified mutually exclusive and exact.');

    // ----------------------------------------------------
    // TEST 3: IMPORT PREVIEW & CONFIRM
    // ----------------------------------------------------
    console.log('\n--- Test 3: Import Confirm & FIS Sequence Lock ---');
    const validRowsToImport = [
      {
        full_name: 'Import Test Fisher Alpha',
        nic: '199990001107',
        phone: '0779900111',
        boat_no: 'BOAT-IMP-001',
        status: 'ACTIVE',
      },
      {
        full_name: 'Import Test Fisher Beta',
        nic: '199990001108',
        phone: '0779900112',
        boat_no: 'BOAT-IMP-002',
        status: 'ACTIVE',
      },
    ];

    const confirmRes = await fetch(`${baseUrl}/api/export/confirm-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ validRows: validRowsToImport }),
    });
    const confirmData = await getJson(confirmRes);
    if (confirmRes.status !== 200 || !confirmData.success) {
      throw new Error(`Test 3 Failed: Confirm import failed - ${JSON.stringify(confirmData)}`);
    }

    const importedFishers = confirmData.importedFishers;
    if (importedFishers.length !== 2) {
      throw new Error('Test 3 Failed: Expected 2 imported fishers.');
    }
    for (const imp of importedFishers) {
      createdFisherIds.push(BigInt(imp.id));
      if (!imp.fisher_id.startsWith('FIS-')) {
        throw new Error(`Test 3 Failed: Fisher ID ${imp.fisher_id} does not start with FIS-`);
      }
    }
    console.log(`✔ Confirm import created fishers: ${importedFishers.map((i) => i.fisher_id).join(', ')}`);

    // ----------------------------------------------------
    // TEST 4: EXPORT REPORTS (ACTIVE & BLOCKED BCL)
    // ----------------------------------------------------
    console.log('\n--- Test 4: Export Reports (Active & Blocked BCL) ---');
    // Export Active Fishers PDF/CSV
    const activeExpRes = await fetch(`${baseUrl}/api/export/active-fishers?format=csv`, { headers: { Cookie: cookieHeader } });
    if (activeExpRes.status !== 200) {
      throw new Error(`Test 4 Failed: Active fishers export failed with HTTP ${activeExpRes.status}`);
    }
    const activeCsvBuffer = Buffer.from(await activeExpRes.arrayBuffer());
    const hasBom = activeCsvBuffer[0] === 0xef && activeCsvBuffer[1] === 0xbb && activeCsvBuffer[2] === 0xbf;
    if (!hasBom) {
      throw new Error('Test 4 Failed: Active CSV export missing UTF-8 BOM at byte 0');
    }
    const activeCsvText = activeCsvBuffer.toString('utf-8');
    if (!activeCsvText.includes('மீதிக் கடன்')) {
      throw new Error('Test 4 Failed: Active CSV export missing Tamil header மீதிக் கடன்');
    }
    console.log('✔ Active Fishers CSV report generated with UTF-8 BOM and Tamil header மீதிக் கடன்.');

    // Export Blocked Fishers (BCL) PDF/CSV
    const blockedExpRes = await fetch(`${baseUrl}/api/export/blocked-fishers?format=csv`, { headers: { Cookie: cookieHeader } });
    if (blockedExpRes.status !== 200) {
      throw new Error(`Test 4 Failed: Blocked fishers export failed with HTTP ${blockedExpRes.status}`);
    }
    const blockedCsvBuffer = Buffer.from(await blockedExpRes.arrayBuffer());
    const hasBlockedBom = blockedCsvBuffer[0] === 0xef && blockedCsvBuffer[1] === 0xbb && blockedCsvBuffer[2] === 0xbf;
    if (!hasBlockedBom) {
      throw new Error('Test 4 Failed: Blocked CSV export missing UTF-8 BOM');
    }
    console.log('✔ Blocked Fishers (BCL) CSV report generated successfully.');

    // Export Blocked Fishers PDF
    const blockedPdfRes = await fetch(`${baseUrl}/api/export/blocked-fishers?format=pdf`, { headers: { Cookie: cookieHeader } });
    if (blockedPdfRes.status !== 200) {
      throw new Error(`Test 4 Failed: Blocked fishers PDF export failed with HTTP ${blockedPdfRes.status}`);
    }
    const pdfContentType = blockedPdfRes.headers.get('content-type');
    if (!pdfContentType || !pdfContentType.includes('application/pdf')) {
      throw new Error(`Test 4 Failed: Expected application/pdf content type, got ${pdfContentType}`);
    }
    console.log('✔ Blocked Fishers (BCL) PDF report generated successfully.');

    // ----------------------------------------------------
    // TEST 5: AUDIT LOG SERVICE VERIFICATION
    // ----------------------------------------------------
    console.log('\n--- Test 5: Audit Log Service ---');
    const auditLogs = await prisma.audit_logs.findMany({
      take: 10,
      orderBy: { id: 'desc' },
    });
    if (auditLogs.length === 0) {
      throw new Error('Test 5 Failed: No audit log records found.');
    }
    // Verify no secret or hash in metadata_json
    for (const log of auditLogs) {
      const json = log.metadata_json || '';
      if (json.includes('password') || json.includes('DATABASE_URL') || json.includes('rawToken')) {
        throw new Error(`Test 5 Failed: Leaked sensitive info in audit log ID ${log.id}`);
      }
    }
    console.log('✔ Audit log service verified writing logs to DB with ZERO secret leaks.');

    console.log('\n==================================================');
    console.log('   ALL PRISMA STEP 10 TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================\n');
  } finally {
    // Teardown test fixtures
    if (createdFisherIds.length > 0) {
      await prisma.fisher_qr_tokens.deleteMany({ where: { fisher_id: { in: createdFisherIds } } });
      await prisma.fisher_holds.deleteMany({ where: { fisher_id: { in: createdFisherIds } } });
      await prisma.debt_payments.deleteMany({ where: { fisher_id: { in: createdFisherIds } } });
      await prisma.fisher_debts.deleteMany({ where: { fisher_id: { in: createdFisherIds } } });
      await prisma.clearance_records.deleteMany({ where: { fisher_id: { in: createdFisherIds } } });
      await prisma.fishers.deleteMany({ where: { id: { in: createdFisherIds } } });
      console.log('✔ Test fixtures cleaned up from valachchenai_harbor_test.');
    }

    server.close();
  }
}

runStep10Tests()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ STEP 10 TEST SUITE FAILED WITH ERROR:');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
