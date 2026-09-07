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

async function runOcrFallbackTests() {
  console.log('==================================================');
  console.log('   DEPARTURE PDF OCR FALLBACK FEATURE TEST SUITE');
  console.log('==================================================');

  await assertIsolatedTestDatabase(prisma);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5112, resolve));
  console.log('✔ Test server listening on http://127.0.0.1:5112');

  const baseUrl = 'http://127.0.0.1:5112';

  let testFisherApproved = null;
  let testFisherBlc = null;

  try {
    // 1. Upsert Admin & Authenticate
    const adminEmail = 'admin_ocr_test@valachchenaiharbor.lk';
    const activeHash = await bcrypt.hash('Admin123!', 10);
    const admin = await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: activeHash, status: 'ACTIVE' },
      create: {
        name: 'OCR Test Admin',
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
    await prisma.fisher_debts.deleteMany({ where: { fisher: { fisher_id: { in: ['FIS-888001', 'FIS-888002'] } } } }).catch(() => {});
    await prisma.fishers.deleteMany({ where: { fisher_id: { in: ['FIS-888001', 'FIS-888002'] } } }).catch(() => {});

    // 2. Create Test Fisher 1: Approved Skipper (197916704875)
    testFisherApproved = await prisma.fishers.create({
      data: {
        fisher_id: 'FIS-888001',
        full_name: 'Approved Skipper Fisher',
        nic: '197916704875',
        phone: '+94771234567',
        boat_no: 'SRI-VAL-881',
        status: 'ACTIVE',
        created_by_admin_id: admin.id,
      },
    });

    // 3. Create Test Fisher 2: BLC Crew Member (200527001738)
    testFisherBlc = await prisma.fishers.create({
      data: {
        fisher_id: 'FIS-888002',
        full_name: 'BLC Crew Fisher',
        nic: '200527001738',
        phone: '+94779876543',
        boat_no: 'SRI-VAL-882',
        status: 'BLOCKED',
        created_by_admin_id: admin.id,
      },
    });

    await prisma.fisher_debts.create({
      data: {
        fisher_id: testFisherBlc.id,
        category: 'HARBOR_FEE',
        description: 'Unpaid harbor departure tax',
        original_amount: '4500.00',
        debt_date: new Date(),
        status: 'OPEN',
        created_by_admin_id: admin.id,
      },
    });

    console.log('✔ Created test fixtures: Skipper 197916704875 (Approved) & Crew 200527001738 (BLC).');

    // 4. Construct Synthetic DFAR Departure PDF containing Skipper, Crew, and Officer NICs
    const samplePdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kinds [ /PDF ] /Count 1 /Kids [ 3 0 R ] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [ 0 0 500 400 ] /Contents 4 0 R >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 12 Tf
20 360 Td
(DFAR DEPARTURE MANIFEST - VALACHCHENAI HARBOR) Tj
0 -30 Td
(Vessel Reg No: SRI-VAL-881   License No: LIC-998877) Tj
0 -30 Td
(Skipper's National Identity Card No: 197916704875) Tj
0 -30 Td
(Detail of Crew Members) Tj
0 -25 Td
(1. Crew Member: 2005 2700 1738 - Name: BLC Crew Fisher) Tj
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

    const pdfBuffer = Buffer.from(samplePdfContent, 'utf8');

    // 5. Test Batch Upload to /api/departure-pdf-checker/check
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let bodyString = '';
    bodyString += `--${boundary}\r\n`;
    bodyString += `Content-Disposition: form-data; name="pdfs"; filename="scanned_dfar_manifest.pdf"\r\n`;
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

    const fileRes = uploadData.files[0];
    if (!fileRes || fileRes.status !== 'PROCESSED') {
      throw new Error(`FATAL: File processing failed! Status: "${fileRes?.status}"`);
    }

    const results = fileRes.results;
    console.log('Extracted Results:', JSON.stringify(results, null, 2));

    // Verify 1: Skipper 197916704875 is extracted and APPROVED
    const skipperResult = results.find((r) => r.nic === '197916704875');
    if (!skipperResult || skipperResult.status !== 'APPROVED') {
      throw new Error(`FATAL: Expected Skipper 197916704875 to be APPROVED, got "${skipperResult?.status}"`);
    }
    console.log('✔ Verified Skipper 197916704875 is APPROVED.');

    // Verify 2: Crew 200527001738 is extracted and BLC
    const blcCrewResult = results.find((r) => r.nic === '200527001738');
    if (!blcCrewResult || blcCrewResult.status !== 'BLC') {
      throw new Error(`FATAL: Expected Crew 200527001738 to be BLC, got "${blcCrewResult?.status}"`);
    }
    console.log('✔ Verified Crew 200527001738 is BLC.');

    // Verify 3: Crew 200221510039 is extracted and NOT_FOUND
    const unregCrewResult = results.find((r) => r.nic === '200221510039');
    if (!unregCrewResult || unregCrewResult.status !== 'NOT_FOUND') {
      throw new Error(`FATAL: Expected Crew 200221510039 to be NOT_FOUND, got "${unregCrewResult?.status}"`);
    }
    console.log('✔ Verified Crew 200221510039 is NOT_FOUND.');

    // Verify 4: Officer NIC 198899776655 must NOT be extracted
    const officerResult = results.find((r) => r.nic === '198899776655');
    if (officerResult) {
      throw new Error('FATAL: Officer NIC 198899776655 under "Departure Approved By" was incorrectly extracted as Fisher NIC!');
    }
    console.log('✔ Verified Officer NIC 198899776655 was NOT extracted as Fisher NIC.');

    console.log('==================================================');
    console.log('✔ ALL DEPARTURE PDF OCR & FILTER TESTS PASSED CLEANLY');
    console.log('==================================================');
  } catch (error) {
    console.error('❌ Departure Checker OCR Test Failed:', error);
    process.exit(1);
  } finally {
    if (testFisherApproved) {
      await prisma.fishers.delete({ where: { id: testFisherApproved.id } }).catch(() => {});
    }
    if (testFisherBlc) {
      await prisma.fisher_debts.deleteMany({ where: { fisher_id: testFisherBlc.id } }).catch(() => {});
      await prisma.fishers.delete({ where: { id: testFisherBlc.id } }).catch(() => {});
    }
    await prisma.admins.deleteMany({ where: { email: 'admin_ocr_test@valachchenaiharbor.lk' } }).catch(() => {});
    await prisma.$disconnect();
    server.close();
  }
}

runOcrFallbackTests();

