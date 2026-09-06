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

async function runFisherTests() {
  console.log('==================================================');
  console.log('   PRISMA STEP 5: FISHER MIGRATION TEST SUITE');
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

  // Start HTTP server on port 5098
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5098, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5098');

  const baseUrl = 'http://127.0.0.1:5098';

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

    // Test A: List Fishers
    const listRes = await fetch(`${baseUrl}/api/fishers?page=1&limit=10`, {
      headers: { Cookie: cookieHeader },
    });
    const listBody = await listRes.json();
    if (listRes.status === 200 && listBody.success && Array.isArray(listBody.items) && listBody.pagination) {
      console.log(`✔ Test A Passed: List fishers returned 200 OK (${listBody.items.length} items, total: ${listBody.pagination.total}).`);
    } else {
      throw new Error(`Test A Failed: ${listRes.status} ${JSON.stringify(listBody)}`);
    }

    // Test G & J: Add Fisher (valid + phone normalization + FIS sequence generation)
    const testNic1 = '199012345678';
    await prisma.fishers.deleteMany({ where: { nic: testNic1 } });

    const createRes1 = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Test Fisher One',
        nic: testNic1,
        phone: '0771234567',
        boat_no: 'BOAT-101',
        address: 'Harbor Road, Valachchenai',
        status: 'ACTIVE',
      }),
    });
    const createBody1 = await createRes1.json();
    if (createRes1.status === 201 && createBody1.success && createBody1.fisher.fisher_id.startsWith('FIS-')) {
      if (createBody1.fisher.phone === '+94771234567') {
        console.log(`✔ Test G & J Passed: Created Fisher with sequence ID ${createBody1.fisher.fisher_id} and normalized phone +94771234567.`);
      } else {
        throw new Error(`Test J Failed: Phone normalization failed (${createBody1.fisher.phone})`);
      }
    } else {
      throw new Error(`Test G Failed: ${createRes1.status} ${JSON.stringify(createBody1)}`);
    }
    const createdFisher1 = createBody1.fisher;

    // Test H: Duplicate NIC -> 409
    const dupRes = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Duplicate Fisher',
        nic: testNic1,
        phone: '0779999999',
      }),
    });
    const dupBody = await dupRes.json();
    if (dupRes.status === 409 && !dupBody.success) {
      console.log('✔ Test H Passed: Duplicate NIC rejected with 409 Conflict.');
    } else {
      throw new Error(`Test H Failed: Expected 409, got ${dupRes.status}`);
    }

    // Test I: Invalid NIC -> 400
    const invalidNicRes = await fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Invalid NIC Fisher',
        nic: 'INVALID123',
        phone: '0771234567',
      }),
    });
    if (invalidNicRes.status === 400) {
      console.log('✔ Test I Passed: Invalid NIC format rejected with 400 Bad Request.');
    } else {
      throw new Error(`Test I Failed: Expected 400, got ${invalidNicRes.status}`);
    }

    // Test B: Search by Name
    const searchNameRes = await fetch(`${baseUrl}/api/fishers?search=Test%20Fisher%20One`, {
      headers: { Cookie: cookieHeader },
    });
    const searchNameBody = await searchNameRes.json();
    if (searchNameRes.status === 200 && searchNameBody.items.some((f) => f.id === createdFisher1.id)) {
      console.log('✔ Test B Passed: Search by Name returned matching fisher.');
    } else {
      throw new Error('Test B Failed: Search by Name did not return fisher.');
    }

    // Test C: Search by NIC
    const searchNicRes = await fetch(`${baseUrl}/api/fishers?search=${testNic1}`, {
      headers: { Cookie: cookieHeader },
    });
    const searchNicBody = await searchNicRes.json();
    if (searchNicRes.status === 200 && searchNicBody.items.some((f) => f.id === createdFisher1.id)) {
      console.log('✔ Test C Passed: Search by NIC returned matching fisher.');
    } else {
      throw new Error('Test C Failed: Search by NIC did not return fisher.');
    }

    // Test D: Search by Phone
    const searchPhoneRes = await fetch(`${baseUrl}/api/fishers?search=771234567`, {
      headers: { Cookie: cookieHeader },
    });
    const searchPhoneBody = await searchPhoneRes.json();
    if (searchPhoneRes.status === 200 && searchPhoneBody.items.some((f) => f.id === createdFisher1.id)) {
      console.log('✔ Test D Passed: Search by Phone returned matching fisher.');
    } else {
      throw new Error('Test D Failed: Search by Phone did not return fisher.');
    }

    // Test E: Search by Fisher ID
    const searchFisRes = await fetch(`${baseUrl}/api/fishers?search=${createdFisher1.fisher_id}`, {
      headers: { Cookie: cookieHeader },
    });
    const searchFisBody = await searchFisRes.json();
    if (searchFisRes.status === 200 && searchFisBody.items.some((f) => f.id === createdFisher1.id)) {
      console.log('✔ Test E Passed: Search by Fisher ID returned matching fisher.');
    } else {
      throw new Error('Test E Failed: Search by Fisher ID did not return fisher.');
    }

    // Test F: Search by Boat No
    const searchBoatRes = await fetch(`${baseUrl}/api/fishers?search=BOAT-101`, {
      headers: { Cookie: cookieHeader },
    });
    const searchBoatBody = await searchBoatRes.json();
    if (searchBoatRes.status === 200 && searchBoatBody.items.some((f) => f.id === createdFisher1.id)) {
      console.log('✔ Test F Passed: Search by Boat No returned matching fisher.');
    } else {
      throw new Error('Test F Failed: Search by Boat No did not return fisher.');
    }

    // Test K & L: Edit Fisher & Base status update
    const editRes = await fetch(`${baseUrl}/api/fishers/${createdFisher1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        full_name: 'Test Fisher Updated',
        status: 'BLOCKED',
      }),
    });
    const editBody = await editRes.json();
    if (editRes.status === 200 && editBody.success && editBody.fisher.full_name === 'Test Fisher Updated' && editBody.fisher.status === 'BLOCKED') {
      console.log('✔ Test K & L Passed: Edit Fisher updated name and base status to BLOCKED.');
    } else {
      throw new Error(`Test K & L Failed: ${editRes.status} ${JSON.stringify(editBody)}`);
    }

    // Test M: Archive Fisher
    const archiveRes = await fetch(`${baseUrl}/api/fishers/${createdFisher1.id}/archive`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const archiveBody = await archiveRes.json();
    if (archiveRes.status === 200 && archiveBody.success && archiveBody.fisher.is_archived === true) {
      console.log('✔ Test M Passed: Archive Fisher soft-archived record (is_archived = true).');
    } else {
      throw new Error(`Test M Failed: ${archiveRes.status} ${JSON.stringify(archiveBody)}`);
    }

    // Test N: Restore Fisher
    const restoreRes = await fetch(`${baseUrl}/api/fishers/${createdFisher1.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const restoreBody = await restoreRes.json();
    if (restoreRes.status === 200 && restoreBody.success && restoreBody.fisher.is_archived === false) {
      console.log('✔ Test N Passed: Restore Fisher un-archived record (is_archived = false).');
    } else {
      throw new Error(`Test N Failed: ${restoreRes.status} ${JSON.stringify(restoreBody)}`);
    }

    // Test Q: Concurrent Fisher Creation Test (System Sequence Transaction Concurrency)
    console.log('--- Testing Concurrent Fisher Creation (Atomic Sequence Lock) ---');
    await prisma.fishers.deleteMany({ where: { nic: { in: ['199100000001', '199100000002'] } } });

    const promise1 = fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ full_name: 'Concurrent Fisher A', nic: '199100000001', phone: '0770000001' }),
    }).then((r) => r.json());

    const promise2 = fetch(`${baseUrl}/api/fishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ full_name: 'Concurrent Fisher B', nic: '199100000002', phone: '0770000002' }),
    }).then((r) => r.json());

    const [resConcurrent1, resConcurrent2] = await Promise.all([promise1, promise2]);

    if (resConcurrent1.success && resConcurrent2.success) {
      const id1 = resConcurrent1.fisher.fisher_id;
      const id2 = resConcurrent2.fisher.fisher_id;
      if (id1 !== id2 && id1.startsWith('FIS-') && id2.startsWith('FIS-')) {
        console.log(`✔ Test Q Passed: Concurrent creations produced unique sequential IDs (${id1} and ${id2}).`);
      } else {
        throw new Error(`Test Q Failed: Duplicate sequence IDs generated (${id1}, ${id2})`);
      }
    } else {
      throw new Error(`Test Q Failed: Concurrent creation failed (${JSON.stringify(resConcurrent1)}, ${JSON.stringify(resConcurrent2)})`);
    }

    // Clean up created test records from isolated test database (valachchenai_harbor_test)
    await prisma.fishers.deleteMany({
      where: {
        id: { in: [BigInt(createdFisher1.id), BigInt(resConcurrent1.fisher.id), BigInt(resConcurrent2.fisher.id)] },
      },
    });
    console.log('✔ Cleaned up test fixtures cleanly from test DB.');

    console.log('==================================================');
    console.log('✔ ALL STEP 5 FISHER MIGRATION TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit();
  }
}

runFisherTests();