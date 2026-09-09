/**
 * Smoke test for Email Integration in Valachchenai Harbor System
 */
process.env.JWT_SECRET = 'test_jwt_secret_token_12345678901234567890';
const emailService = require('../services/emailService');

async function runEmailIntegrationSmokeTest() {
  console.log('==================================================');
  console.log('  TEST: EMAIL INTEGRATION SMOKE TEST');
  console.log('==================================================');

  try {
    // 1. Test fetching departure manifest emails (with fallback to preview demo emails if .env not configured)
    console.log('\n--- Test 1: Fetch Departure Manifest Emails ---');
    const emailResult = await emailService.fetchDepartureEmails({ limit: 5 });

    console.log(`Configured: ${emailResult.configured}`);
    console.log(`Email Count: ${emailResult.emails?.length || 0}`);

    if (!emailResult.emails || emailResult.emails.length === 0) {
      throw new Error('Expected at least 1 departure manifest email (or demo email).');
    }

    const firstEmail = emailResult.emails[0];
    console.log(`✔ Subject: "${firstEmail.subject}"`);
    console.log(`✔ From: ${firstEmail.from}`);
    console.log(`✔ Has PDF: ${firstEmail.hasPdf}`);

    if (!firstEmail.attachments || firstEmail.attachments.length === 0) {
      throw new Error('First email should contain at least 1 PDF attachment.');
    }

    const firstAttachment = firstEmail.attachments[0];
    console.log(`✔ Attachment: "${firstAttachment.filename}" (ID: ${firstAttachment.id}, Size: ${firstAttachment.size} bytes)`);

    // 2. Test cached attachment retrieval
    console.log('\n--- Test 2: Retrieve Attachment Buffer by ID ---');
    const cached = emailService.getCachedAttachment(firstAttachment.id);

    if (!cached || !cached.buffer) {
      throw new Error(`Failed to retrieve cached attachment for ID ${firstAttachment.id}`);
    }

    console.log(`✔ Cached buffer retrieved successfully! Length: ${cached.buffer.length} bytes`);
    console.log(`✔ Content-Type: ${cached.contentType}`);

    console.log('\n==================================================');
    console.log('✔ ALL EMAIL INTEGRATION SMOKE TESTS PASSED!');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Smoke test failed:', err);
    process.exit(1);
  }
}

runEmailIntegrationSmokeTest();
