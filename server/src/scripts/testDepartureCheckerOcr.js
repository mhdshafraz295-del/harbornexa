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

async function runDoc1PdfTests() {
  console.log('==================================================');
  console.log('   DOC1.PDF EXACT EXTRACTION & RESULT PRESERVATION TEST');
  console.log('==================================================');

  await assertIsolatedTestDatabase(prisma);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5115, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5115');

  const baseUrl = 'http://127.0.0.1:5115';

  let testFisherApproved = null;

  try {
    // 1. Upsert Admin & Authenticate
    const adminEmail = 'admin_doc1_test@valachchenaiharbor.lk';
    const activeHash = await bcrypt.hash('Admin123!', 10);
    const admin = await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: activeHash, status: 'ACTIVE' },
      create: {
        name: 'Doc1 Test Admin',
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
    console.log('✔ Auth login succeeded.');

    // Pre-cleanup test fishers
    await prisma.fisher_debts.deleteMany({ where: { fisher: { fisher_id: { in: ['FIS-DOC1-01', 'FIS-DOC1-02', 'FIS-DOC1-03'] } } } }).catch(() => {});
    await prisma.fishers.deleteMany({ where: { fisher_id: { in: ['FIS-DOC1-01', 'FIS-DOC1-02', 'FIS-DOC1-03'] } } }).catch(() => {});
    await prisma.fishers.deleteMany({ where: { nic: { in: ['197916704875', '200527001738', '200221510039'] } } }).catch(() => {});

    // 2. Create EXACT ONLY ONE Fisher in DB: 200527001738 (APPROVED)
    // 197916704875 and 200221510039 do NOT exist in the database!
    testFisherApproved = await prisma.fishers.create({
      data: {
        fisher_id: 'FIS-DOC1-02',
        full_name: 'Approved Fisher Member',
        nic: '200527001738',
        phone: '+94772005270',
        boat_no: 'SRI-VAL-2005',
        status: 'ACTIVE',
        created_by_admin_id: admin.id,
      },
    });

    console.log('✔ Created test fixture: 200527001738 (APPROVED in DB). 197916704875 & 200221510039 are NOT in DB.');

    // 3. Construct Synthetic Doc1.pdf containing Skipper 197916704875, Crew 200527001738, Crew 200221510039, and Officer 198899776655
    const doc1PdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kinds [ /PDF ] /Count 1 /Kids [ 3 0 R ] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 500 400 ] /Contents 4 0 R >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 12 Tf
20 360 Td
(DFAR DEPARTURE MANIFEST - VALACHCHENAI HARBOR) Tj
0 -30 Td
(Vessel Reg No: SRI-VAL-2005   License No: LIC-DOC1-88) Tj
0 -30 Td
(Skipper's National Identity Card No: 197916704875) Tj
0 -30 Td
(Detail of Crew Members) Tj
0 -25 Td
(1. Crew Member: 2005 2700 1738 - Name: Approved Fisher Member) Tj
0 -25 Td
(2. Crew Member: 2002 2151 0039 - Name: Unregistered Crew) Tj
0 -40 Td
(Departure Approved By Officer NIC: 198899776655) Tj
ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000062 00000 n 
0000000142 00000 n 
0000000244 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
550
%%EOF`;

    const pdfBuffer = Buffer.from(doc1PdfContent, 'utf8');

    // 4. Test Batch Upload to /api/departure-pdf-checker/check
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let bodyString = '';
    bodyString += `--${boundary}\r\n`;
    bodyString += `Content-Disposition: form-data; name="pdfs"; filename="Doc1.pdf"\r\n`;
    bodyString += `Content-Type: application/pdf\r\n\r\n`;
    bodyString += pdfBuffer.toString('binary');
    bodyString += `\r\n--${boundary}--\r\n`;

    const uploadRes = await fetch(`${baseUrl}/api/departure-pdf-checker/check`, {
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

    // 5. Verify Summary Counts
    const summary = uploadData.summary;
    console.log('Returned Batch Summary:', JSON.stringify(summary, null, 2));

    if (summary.nicCount !== 3) {
      throw new Error(`FATAL: Expected nicCount (NICs Extracted) = 3, got ${summary.nicCount}!`);
    }
    console.log('✔ Verified NICs Extracted = 3.');

    if (summary.approved !== 1) {
      throw new Error(`FATAL: Expected approved = 1, got ${summary.approved}!`);
    }
    console.log('✔ Verified Approved = 1.');

    if (summary.blocked !== 0) {
      throw new Error(`FATAL: Expected blocked = 0, got ${summary.blocked}!`);
    }
    console.log('✔ Verified Blocked = 0.');

    if (summary.notFound !== 2) {
      throw new Error(`FATAL: Expected notFound = 2, got ${summary.notFound}!`);
    }
    console.log('✔ Verified Not Found = 2.');

    // 6. Verify Per-NIC Outcomes
    const results = uploadData.files[0].results;
    console.log('Extracted Results Array:', JSON.stringify(results, null, 2));

    if (results.length !== 3) {
      throw new Error(`FATAL: Expected exactly 3 NIC results, got ${results.length}!`);
    }

    const res1 = results.find((r) => r.nic === '197916704875');
    const res2 = results.find((r) => r.nic === '200527001738');
    const res3 = results.find((r) => r.nic === '200221510039');

    if (!res1 || res1.status !== 'NOT_FOUND') {
      throw new Error(`FATAL: 197916704875 should be NOT_FOUND, got "${res1?.status}"`);
    }
    console.log('✔ Verified 197916704875 -> NOT_FOUND.');

    if (!res2 || res2.status !== 'APPROVED') {
      throw new Error(`FATAL: 200527001738 should be APPROVED, got "${res2?.status}"`);
    }
    console.log('✔ Verified 200527001738 -> APPROVED / NOT BLC.');

    if (!res3 || res3.status !== 'NOT_FOUND') {
      throw new Error(`FATAL: 200221510039 should be NOT_FOUND, got "${res3?.status}"`);
    }
    console.log('✔ Verified 200221510039 -> NOT_FOUND.');

    // 7. Verify Officer NIC 198899776655 is NOT in results
    const officerRes = results.find((r) => r.nic === '198899776655');
    if (officerRes) {
      throw new Error('FATAL: Officer NIC 198899776655 under "Departure Approved By" was incorrectly included!');
    }
    console.log('✔ Verified Officer NIC 198899776655 is NOT in results.');

    console.log('==================================================');
    console.log('✔ ALL DOC1.PDF EXACT TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (error) {
    console.error('❌ Doc1.pdf Test Failed:', error);
    process.exit(1);
  } finally {
    if (testFisherApproved) {
      await prisma.fishers.delete({ where: { id: testFisherApproved.id } }).catch(() => {});
    }
    await prisma.admins.deleteMany({ where: { email: 'admin_doc1_test@valachchenaiharbor.lk' } }).catch(() => {});
    await prisma.$disconnect();
    server.close();
  }
}

runDoc1PdfTests();
