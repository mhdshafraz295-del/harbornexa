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
const { assertIsolatedTestDatabase } = require('./helpers/testDbGuard');
const bcrypt = require('bcrypt');
const app = require('../app');

async function runAuthTests() {
  console.log('==================================================');
  console.log('  PRISMA STEP 4: AUTHENTICATION MIGRATION TEST SUITE');
  console.log('==================================================');

  await assertIsolatedTestDatabase(prisma);

  // Start HTTP server on port 5099
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5099, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5099');

  const baseUrl = 'http://127.0.0.1:5099';
  let cookieHeader = null;

  try {
    // Upsert primary admin in test database
    const adminEmail = 'admin@valachchenaiharbor.lk';
    const activeHash = await bcrypt.hash('Admin123!', 10);
    await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: activeHash, status: 'ACTIVE' },
      create: {
        name: 'System Admin',
        email: adminEmail,
        password_hash: activeHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    // Test A: Unknown Email -> 401
    const unknownRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@test.com', password: 'Password123!' }),
    });
    const unknownBody = await unknownRes.json();
    if (unknownRes.status === 401 && !unknownBody.success) {
      console.log('✔ Test A Passed: Unknown email rejected with 401.');
    } else {
      throw new Error(`Test A Failed: Expected 401, got ${unknownRes.status}`);
    }

    // Test B: Wrong Password -> 401
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'WrongPassword123!' }),
    });
    const wrongPassBody = await wrongPassRes.json();
    if (wrongPassRes.status === 401 && !wrongPassBody.success) {
      console.log('✔ Test B Passed: Wrong password rejected with 401.');
    } else {
      throw new Error(`Test B Failed: Expected 401, got ${wrongPassRes.status}`);
    }

    // Create an inactive admin temporarily for Test C
    const inactiveEmail = 'inactive_test_admin@valachchenaiharbor.lk';
    const tempHash = await bcrypt.hash('Password123!', 10);
    await prisma.admins.upsert({
      where: { email: inactiveEmail },
      update: { status: 'INACTIVE' },
      create: {
        name: 'Inactive Admin',
        email: inactiveEmail,
        password_hash: tempHash,
        role: 'ADMIN',
        status: 'INACTIVE',
      },
    });

    const inactiveRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inactiveEmail, password: 'Password123!' }),
    });
    const inactiveBody = await inactiveRes.json();
    if (inactiveRes.status === 401 && !inactiveBody.success) {
      console.log('✔ Test C Passed: Inactive admin rejected with 401.');
    } else {
      throw new Error(`Test C Failed: Expected 401, got ${inactiveRes.status}`);
    }

    // Test D: Unauthenticated /me -> 401
    const unauthMeRes = await fetch(`${baseUrl}/api/auth/me`);
    if (unauthMeRes.status === 401) {
      console.log('✔ Test D Passed: /api/auth/me unauthenticated rejected with 401.');
    } else {
      throw new Error(`Test D Failed: Expected 401, got ${unauthMeRes.status}`);
    }

    // Test E: Valid Login
    const validPass = 'Admin123!';
    const validLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: validPass }),
    });
    const validLoginBody = await validLoginRes.json();
    const setCookie = validLoginRes.headers.get('set-cookie');

    if (
      validLoginRes.status === 200 &&
      validLoginBody.success &&
      setCookie &&
      !validLoginBody.admin.password_hash
    ) {
      cookieHeader = setCookie.split(';')[0];
      console.log('✔ Test E Passed: Valid login succeeded (200 OK, Cookie issued, no password_hash leaked).');
    } else {
      throw new Error(`Test E Failed: ${validLoginRes.status} ${JSON.stringify(validLoginBody)}`);
    }

    // Test F: Authenticated /me
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    const meBody = await meRes.json();
    if (meRes.status === 200 && meBody.success && meBody.admin.email === adminEmail) {
      console.log('✔ Test F Passed: GET /api/auth/me returned correct Admin payload.');
    } else {
      throw new Error(`Test F Failed: ${meRes.status} ${JSON.stringify(meBody)}`);
    }

    // Test G: Verify non-auth endpoint coexists safely
    const listFishersRes = await fetch(`${baseUrl}/api/fishers`, {
      headers: { Cookie: cookieHeader },
    });
    if (listFishersRes.status === 200) {
      console.log('✔ Test G Passed: Unrelated endpoint GET /api/fishers succeeded cleanly.');
    } else {
      throw new Error(`Test G Failed: ${listFishersRes.status}`);
    }

    // Test H: Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const logoutBody = await logoutRes.json();
    if (logoutRes.status === 200 && logoutBody.success) {
      const clearCookie = logoutRes.headers.get('set-cookie');
      cookieHeader = clearCookie ? clearCookie.split(';')[0] : '';
      console.log('✔ Test H Passed: Logout succeeded and auth cookie cleared.');
    } else {
      throw new Error(`Test H Failed: ${logoutRes.status}`);
    }

    // Test I: Access post-logout -> 401
    const postLogoutMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    if (postLogoutMeRes.status === 401) {
      console.log('✔ Test I Passed: Access post-logout returned 401 Unauthorized.');
    } else {
      throw new Error(`Test I Failed: Expected 401, got ${postLogoutMeRes.status}`);
    }

    // Clean up temporary inactive admin from isolated test DB
    await prisma.admins.deleteMany({ where: { email: inactiveEmail } });

    console.log('==================================================');
    console.log('✔ ALL STEP 4 AUTHENTICATION TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (err) {
    console.error('❌ Test Execution Error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit();
  }
}

runAuthTests();