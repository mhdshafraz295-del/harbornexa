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

const http = require('http');
const prisma = require('../config/prismaClient');
const { assertIsolatedTestDatabase } = require('./helpers/testDbGuard');
const bcrypt = require('bcrypt');
const app = require('../app');

async function runDepartureCheckerTests() {
  console.log('==================================================');
  console.log('   DEPARTURE PDF CHECKER FEATURE TEST SUITE');
  console.log('==================================================');

  await assertIsolatedTestDatabase(prisma);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5110, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5110');

  const baseUrl = 'http://127.0.0.1:5110';

  let testFisherApproved = null;
  let testFisherBlc = null;

  try {
    // 1. Upsert Admin & Authenticate
    const adminEmail = 'admin_dep_test@valachchenaiharbor.lk';
    const activeHash = await bcrypt.hash('Admin123!', 10);
    const admin = await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: activeHash, status: 'ACTIVE' },
      create: {
        name: 'Departure Test Admin',
        email: adminEmail,
        password_hash: activeHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'Admin123!' }),
    });

    const authCookie = loginRes.headers.get('set-cookie');
    if (!authCookie || loginRes.status !== 200) {
      throw new Error('Failed to log in as test admin.');
    }
    // Pre-cleanup in case previous run was interrupted
    await prisma.fisher_debts.deleteMany({ where: { fisher: { fisher_id: { in: ['FIS-999001', 'FIS-999002'] } } } }).catch(() => {});
    await prisma.fishers.deleteMany({ where: { fisher_id: { in: ['FIS-999001', 'FIS-999002'] } } }).catch(() => {});

    // 2. Create Test Fisher 1: Approved (CLEARED)
    testFisherApproved = await prisma.fishers.create({
      data: {
        fisher_id: 'FIS-999001',
        full_name: 'Approved Departure Fisher',
        nic: '991122334V',
        phone: '+94771122334',
        boat_no: 'SRI-VAL-991',
        status: 'ACTIVE',
        created_by_admin_id: admin.id,
      },
    });

    // 3. Create Test Fisher 2: BLC (BLOCKED with outstanding debt)
    testFisherBlc = await prisma.fishers.create({
      data: {
        fisher_id: 'FIS-999002',
        full_name: 'BLC Departure Fisher',
        nic: '200599887766',
        phone: '+94779988776',
        boat_no: 'SRI-VAL-992',
        status: 'BLOCKED',
        created_by_admin_id: admin.id,
      },
    });

    // Add Debt to Fisher 2
    await prisma.fisher_debts.create({
      data: {
        fisher_id: testFisherBlc.id,
        category: 'HARBOR_FEE',
        description: 'Unpaid harbor departure tax',
        original_amount: '3500.00',
        debt_date: new Date(),
        status: 'OPEN',
        created_by_admin_id: admin.id,
      },
    });

    console.log('✔ Created test fixtures for Approved Fisher (991122334V) and BLC Fisher (200599887766).');

    // 4. Construct synthetic PDF Buffer containing extracted NICs
    const samplePdfContent = `%PDF-1.4
1 0 obj
<< /Title (Departure Manifest Test) >>
endobj
2 0 obj
<< /Length 120 >>
stream
(VALACHCHENAI HARBOR DEPARTURE MANIFEST) Tj
(Fisher 1 NIC: 991122334V - Approved) Tj
(Fisher 2 NIC: 200599887766 - BLC) Tj
(Fisher 3 NIC: 887766554V - Not Found) Tj
endstream
endobj
xref
0 3
0000000000 65535 f 
0000000009 00000 n 
0000000062 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
230
%%EOF`;

    const pdfBuffer = Buffer.from(samplePdfContent, 'utf8');

    // 5. Test Batch Upload to /api/departure-checker/check-pdfs using multipart/form-data
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let bodyString = '';
    bodyString += `--${boundary}\r\n`;
    bodyString += `Content-Disposition: form-data; name="pdfs"; filename="departure_manifest_alpha.pdf"\r\n`;
    bodyString += `Content-Type: application/pdf\r\n\r\n`;
    bodyString += pdfBuffer.toString('binary');
    bodyString += `\r\n--${boundary}--\r\n`;

    const uploadRes = await fetch(`${baseUrl}/api/departure-checker/check-pdfs`, {
      method: 'POST',
      headers: {
        'Cookie': authCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(bodyString, 'binary'),
    });

    const uploadData = await uploadRes.json();
    if (uploadRes.status !== 200 || !uploadData.success) {
      throw new Error(`Upload failed with status ${uploadRes.status}: ${JSON.stringify(uploadData)}`);
    }

    console.log('✔ Batch upload API call succeeded.');

    // 6. Verify in-memory processing status (no R2 key stored)
    const fileRes = uploadData.files[0];
    if (!fileRes || fileRes.status !== 'PROCESSED') {
      throw new Error(`FATAL: File processing failed! Status: "${fileRes?.status}"`);
    }
    if (fileRes.r2Key !== undefined) {
      throw new Error(`FATAL: Unexpected R2 key "${fileRes.r2Key}" returned! Departure checker must not store files in R2.`);
    }
    console.log('✔ Verified strictly in-memory PDF processing (no R2 storage).');

    // 7. Verify Extracted NIC results
    const results = fileRes.results;
    if (!results || results.length === 0) {
      throw new Error('FATAL: No NIC results extracted from test PDF!');
    }

    const approvedResult = results.find((r) => r.nic === '991122334V');
    const blcResult = results.find((r) => r.nic === '200599887766');
    const notFoundResult = results.find((r) => r.nic === '887766554V');

    if (!approvedResult || approvedResult.outcome !== 'APPROVED') {
      throw new Error(`FATAL: Expected APPROVED outcome for 991122334V, got "${approvedResult?.outcome}"`);
    }
    console.log('✔ Verified APPROVED status for 991122334V.');

    if (!blcResult || blcResult.outcome !== 'BLC') {
      throw new Error(`FATAL: Expected BLC outcome for 200599887766, got "${blcResult?.outcome}"`);
    }
    console.log('✔ Verified BLC status for 200599887766 (Reasons: ' + JSON.stringify(blcResult.reasons) + ').');

    if (!notFoundResult || notFoundResult.outcome !== 'NOT_FOUND') {
      throw new Error(`FATAL: Expected NOT_FOUND outcome for 887766554V, got "${notFoundResult?.outcome}"`);
    }
    console.log('✔ Verified NOT_FOUND status for 887766554V.');

    // 8. Test File Format Validation (Non-PDF rejection)
    let badBody = '';
    badBody += `--${boundary}\r\n`;
    badBody += `Content-Disposition: form-data; name="pdfs"; filename="invalid_image.jpg"\r\n`;
    badBody += `Content-Type: image/jpeg\r\n\r\n`;
    badBody += `NOT A PDF FILE CONTENT`;
    badBody += `\r\n--${boundary}--\r\n`;

    const badRes = await fetch(`${baseUrl}/api/departure-checker/check-pdfs`, {
      method: 'POST',
      headers: {
        'Cookie': authCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: Buffer.from(badBody, 'binary'),
    });

    const badData = await badRes.json();
    if (badRes.status === 400 || (badData.files && badData.files[0]?.status === 'FAILED')) {
      console.log('✔ Verified non-PDF file validation rejection.');
    } else {
      throw new Error('FATAL: Non-PDF file was not rejected as invalid!');
    }

    console.log('==================================================');
    console.log('✔ ALL DEPARTURE PDF CHECKER TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (error) {
    console.error('❌ Departure Checker Test Failed:', error);
    process.exit(1);
  } finally {
    // Cleanup Test Fixtures
    if (testFisherApproved) {
      await prisma.fishers.delete({ where: { id: testFisherApproved.id } }).catch(() => {});
    }
    if (testFisherBlc) {
      await prisma.fisher_debts.deleteMany({ where: { fisher_id: testFisherBlc.id } }).catch(() => {});
      await prisma.fishers.delete({ where: { id: testFisherBlc.id } }).catch(() => {});
    }
    await prisma.admins.deleteMany({ where: { email: 'admin_dep_test@valachchenaiharbor.lk' } }).catch(() => {});
    await prisma.$disconnect();
    server.close();
  }
}

runDepartureCheckerTests();
