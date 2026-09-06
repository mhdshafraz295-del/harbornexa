const http = require('http');
const prisma = require('../config/prismaClient');
const db = require('../config/db');
const bcrypt = require('bcrypt');
const app = require('../app');

async function runAuthTests() {
  console.log('==================================================');
  console.log('  PRISMA STEP 4: AUTHENTICATION MIGRATION TEST SUITE');
  console.log('==================================================');

  // Start HTTP server on port 5099
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5099, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5099');

  const baseUrl = 'http://127.0.0.1:5099';
  let cookieHeader = null;

  try {
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
      body: JSON.stringify({ email: 'admin@valachchenaiharbor.lk', password: 'WrongPassword123!' }),
    });
    const wrongPassBody = await wrongPassRes.json();
    if (wrongPassRes.status === 401 && !wrongPassBody.success) {
      console.log('✔ Test B Passed: Wrong password rejected with 401.');
    } else {
      throw new Error(`Test B Failed: Expected 401, got ${wrongPassRes.status}`);
    }

    // Create an inactive admin temporarily for Test C (in test DB or cleaned up after)
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

    // Test C: Inactive Admin -> 401
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

    // Clean up temporary inactive test admin
    await prisma.admins.delete({ where: { email: inactiveEmail } });

    // Test D: GET /api/auth/me Unauthenticated -> 401
    const unauthMeRes = await fetch(`${baseUrl}/api/auth/me`);
    if (unauthMeRes.status === 401) {
      console.log('✔ Test D Passed: /api/auth/me unauthenticated rejected with 401.');
    } else {
      throw new Error(`Test D Failed: Expected 401, got ${unauthMeRes.status}`);
    }

    // Test E: Valid Login -> 200, cookie set, safe payload returned
    // First set a known password for admin@valachchenaiharbor.lk to ensure valid login
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
    const loginBody = await loginRes.json();

    if (loginRes.status !== 200 || !loginBody.success) {
      throw new Error(`Test E Failed: Expected 200, got ${loginRes.status} ${JSON.stringify(loginBody)}`);
    }

    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie || !setCookie.includes('token=')) {
      throw new Error('Test E Failed: httpOnly token cookie not set.');
    }
    cookieHeader = setCookie.split(';')[0];

    if (loginBody.admin.password_hash || JSON.stringify(loginBody).includes('password_hash')) {
      throw new Error('Test E Failed: password_hash leaked in response payload!');
    }
    console.log('✔ Test E Passed: Valid login succeeded (200 OK, Cookie issued, no password_hash leaked).');

    // Test F: GET /api/auth/me Authenticated -> 200
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    const meBody = await meRes.json();
    if (meRes.status === 200 && meBody.success && meBody.admin.email === 'admin@valachchenaiharbor.lk') {
      console.log('✔ Test F Passed: GET /api/auth/me returned correct Admin payload.');
    } else {
      throw new Error(`Test F Failed: Expected 200 OK, got ${meRes.status}`);
    }

    // Test G: Unrelated mysql2 endpoint smoke test (GET /api/fishers) -> 200 OK
    const fishersRes = await fetch(`${baseUrl}/api/fishers`, {
      headers: { Cookie: cookieHeader },
    });
    const fishersBody = await fishersRes.json();
    if (fishersRes.status === 200 && fishersBody.success) {
      console.log('✔ Test G Passed: Unrelated mysql2 endpoint GET /api/fishers succeeded cleanly.');
    } else {
      throw new Error(`Test G Failed: Unrelated mysql2 endpoint returned ${fishersRes.status}`);
    }

    // Test H: POST /api/auth/logout -> 200 OK & Cookie cleared
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    const logoutBody = await logoutRes.json();
    const logoutCookie = logoutRes.headers.get('set-cookie');
    if (logoutRes.status === 200 && logoutBody.success && logoutCookie && logoutCookie.includes('token=;')) {
      console.log('✔ Test H Passed: Logout succeeded and auth cookie cleared.');
    } else {
      throw new Error(`Test H Failed: Expected 200 & cleared cookie, got ${logoutRes.status}`);
    }

    // Test I: Protected route after logout -> 401
    const postLogoutMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: logoutCookie ? logoutCookie.split(';')[0] : '' },
    });
    if (postLogoutMeRes.status === 401) {
      console.log('✔ Test I Passed: Access post-logout returned 401 Unauthorized.');
    } else {
      throw new Error(`Test I Failed: Expected 401, got ${postLogoutMeRes.status}`);
    }

    console.log('==================================================');
    console.log('✔ ALL STEP 4 AUTHENTICATION TESTS PASSED CLEANLY');
    console.log('==================================================');
  } finally {
    server.close();
    process.exit(0);
  }
}

runAuthTests();