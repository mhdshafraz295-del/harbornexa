const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const crypto = require('crypto');
const env = require('../config/env');

// In-memory attachment cache: Map<attachmentId, { buffer, filename, contentType, size, createdAt }>
const attachmentCache = new Map();

// Periodic cleanup of attachments older than 1 hour (3600000 ms)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, item] of attachmentCache.entries()) {
    if (item.createdAt < oneHourAgo) {
      attachmentCache.delete(id);
    }
  }
}, 15 * 60 * 1000);

/**
 * Creates and configures an ImapFlow client instance
 */
function createImapClient() {
  return new ImapFlow({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: {
      user: env.email.user,
      pass: env.email.pass,
    },
    logger: false,
    emitLogs: false,
    clientInfo: {
      name: 'Valachchenai Harbor Clearance System',
      version: '1.0.0',
    },
  });
}

/**
 * Tests connection to the IMAP server
 */
async function testImapConnection() {
  if (!env.email.user || !env.email.pass) {
    return {
      success: false,
      configured: false,
      message: 'Email credentials not configured in environment (EMAIL_USER / EMAIL_PASS).',
    };
  }

  const client = createImapClient();
  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    await client.logout();
    return {
      success: true,
      configured: true,
      host: env.email.host,
      user: env.email.user,
      inboxStatus: status,
      message: 'Successfully connected to IMAP mailbox.',
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      error: error.message,
      message: `Failed to connect to email server: ${error.message}`,
    };
  }
}

/**
 * Generates deterministic or unique attachment ID
 */
function generateAttachmentId(msgId, filename) {
  return crypto
    .createHash('sha256')
    .update(`${msgId || 'msg'}_${filename}_${Date.now()}`)
    .digest('hex')
    .substring(0, 24);
}

const fs = require('fs');

/**
 * Fallback mock emails when live email credentials are not yet configured in .env.
 * Allows the user and administrators to immediately test the Drag & Drop and 1-Click Verify features.
 */
function getMockDepartureEmails() {
  const mockAttachmentId1 = 'mock_dfar_imula_0308';
  const mockAttachmentId2 = 'mock_dfar_salman_pdf';

  let realPdfBuffer = null;
  const desktopPdfPath = 'C:\\Users\\97470\\Desktop\\Departure_approval-IMULA0308KLT.pdf';
  try {
    if (fs.existsSync(desktopPdfPath)) {
      realPdfBuffer = fs.readFileSync(desktopPdfPath);
    }
  } catch (err) {
    console.warn('Could not read desktop sample PDF:', err.message);
  }

  if (!realPdfBuffer) {
    realPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000118 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n212\n%%EOF'
    );
  }

  const mockAttachmentId3 = 'mock_dfar_imula_0452';
  const mockAttachmentId4 = 'mock_cg_imula_0189';

  const defaultMockSize = 111405;

  if (!attachmentCache.has(mockAttachmentId1)) {
    attachmentCache.set(mockAttachmentId1, {
      buffer: realPdfBuffer,
      filename: 'Departure_approval-IMULA0308KLT.pdf',
      contentType: 'application/pdf',
      size: defaultMockSize,
      createdAt: Date.now(),
    });
    attachmentCache.set(mockAttachmentId2, {
      buffer: realPdfBuffer,
      filename: 'salman.pdf',
      contentType: 'application/pdf',
      size: defaultMockSize,
      createdAt: Date.now(),
    });
    attachmentCache.set(mockAttachmentId3, {
      buffer: realPdfBuffer,
      filename: 'Departure_approval-IMULA0452KLT.pdf',
      contentType: 'application/pdf',
      size: defaultMockSize,
      createdAt: Date.now(),
    });
    attachmentCache.set(mockAttachmentId4, {
      buffer: realPdfBuffer,
      filename: 'Sea_Safety_IMULA0189MTR.pdf',
      contentType: 'application/pdf',
      size: defaultMockSize,
      createdAt: Date.now(),
    });
  }

  return [
    {
      id: 'mock_email_001',
      subject: '(no subject) - salman.pdf',
      from: 'mhdshafraz295@gmail.com',
      fromName: 'Mhd Shafraz',
      date: '2026-09-08T14:20:00.000Z',
      preview: 'Please find attached the departure crew manifest for verification: salman.pdf',
      hasPdf: true,
      attachments: [
        {
          id: mockAttachmentId2,
          filename: 'salman.pdf',
          size: defaultMockSize,
          contentType: 'application/pdf',
        },
      ],
    },
    {
      id: 'mock_email_002',
      subject: 'DFAR Departure Approval Manifest - IMULA0308KLT',
      from: 'dfar.batticaloa@fisheries.gov.lk',
      fromName: 'DFAR District Office Batticaloa',
      date: '2026-09-08T10:15:00.000Z',
      preview: 'Please find attached the approved departure manifest for vessel IMULA0308KLT with 5 crew members.',
      hasPdf: true,
      attachments: [
        {
          id: mockAttachmentId1,
          filename: 'Departure_approval-IMULA0308KLT.pdf',
          size: defaultMockSize,
          contentType: 'application/pdf',
        },
      ],
    },
    {
      id: 'mock_email_003',
      subject: 'Crew Manifest Approval - IMULA0452KLT',
      from: 'clearance@valachchenaiharbor.lk',
      fromName: 'Valachchenai Harbor Clearance Dept',
      date: '2026-09-08T08:45:00.000Z',
      preview: 'Vessel clearance manifest submitted for IMULA0452KLT. Requires BLC biometric and departure validation.',
      hasPdf: true,
      attachments: [
        {
          id: mockAttachmentId3,
          filename: 'Departure_approval-IMULA0452KLT.pdf',
          size: defaultMockSize,
          contentType: 'application/pdf',
        },
      ],
    },
    {
      id: 'mock_email_004',
      subject: 'Pre-departure Sea Safety Clearance - IMULA0189MTR',
      from: 'coastguard.clearance@slcg.gov.lk',
      fromName: 'Coast Guard Station Valaichchenai',
      date: '2026-09-07T16:30:00.000Z',
      preview: 'Pre-departure sea safety and life jacket compliance manifest verified for IMULA0189MTR.',
      hasPdf: true,
      attachments: [
        {
          id: mockAttachmentId4,
          filename: 'Sea_Safety_IMULA0189MTR.pdf',
          size: defaultMockSize,
          contentType: 'application/pdf',
        },
      ],
    },
    {
      id: 'mock_email_005',
      subject: 'Anoshan Yoganathan - Lecturer - Computing & Course Coordinator reacted to your post',
      from: 'notifications@linkedin.com',
      fromName: 'LinkedIn',
      date: '2026-09-07T13:10:00.000Z',
      preview: 'Site visit of the fisheries harbor clearance project was shared. See full reactions on LinkedIn.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_006',
      subject: "Salman, you've got a promo 🎉 - Savings of up to 50% off are waiting for you in your account",
      from: 'uber.srilanka@uber.com',
      fromName: 'Uber',
      date: '2026-09-07T09:00:00.000Z',
      preview: 'Enjoy special ride discounts this week across Eastern province. Open the Uber app to claim.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_007',
      subject: 'You shared some Google Account data with Pika',
      from: 'no-reply@accounts.google.com',
      fromName: 'Google Accounts',
      date: '2026-09-05T18:22:00.000Z',
      preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to third-party services.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_008',
      subject: 'You shared some Google Account data with KLINGAI',
      from: 'no-reply@accounts.google.com',
      fromName: 'Google Accounts',
      date: '2026-09-05T17:15:00.000Z',
      preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to KLINGAI.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_009',
      subject: "Welcome to Runway. Let's make something.",
      from: 'notifications@runwayml.com',
      fromName: 'Runway',
      date: '2026-09-05T15:40:00.000Z',
      preview: 'Explore what you can do in your first few minutes with Gen-3 Alpha and AI video creation.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_010',
      subject: 'You shared some Google Account data with Runway',
      from: 'no-reply@accounts.google.com',
      fromName: 'Google Accounts',
      date: '2026-09-05T14:30:00.000Z',
      preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to Runway.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_011',
      subject: '[GitHub] A third-party OAuth application has been added to your account',
      from: 'noreply@github.com',
      fromName: 'GitHub',
      date: '2026-09-05T11:05:00.000Z',
      preview: 'Hey sfn1825-community, an OAuth application was recently authorized to access your GitHub account.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_012',
      subject: 'SriEastTech: Your Odoo Periodic Digest - September 2026',
      from: 'info@srieasttech.com',
      fromName: 'SriEastTech',
      date: '2026-09-04T16:50:00.000Z',
      preview: 'SriEastTech Connect: Your Odoo periodic enterprise digest and database statistics summary.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_013',
      subject: 'Prabhath Nishantha - Co-Founder reacted to this post: As a Lecturer - Faculty of Computing',
      from: 'notifications@linkedin.com',
      fromName: 'LinkedIn',
      date: '2026-09-04T12:18:00.000Z',
      preview: 'View your connection updates and professional network activity on LinkedIn.',
      hasPdf: false,
      attachments: [],
    },
    {
      id: 'mock_email_014',
      subject: 'Activate srieasttech.odoo.com - Database Confirmation',
      from: 'admin@srieasttech.odoo.com',
      fromName: 'SriEastTech Odoo',
      date: '2026-09-04T09:30:00.000Z',
      preview: 'Database Confirmation: srieasttech.odoo.com has been successfully created. Click to activate your admin account.',
      hasPdf: false,
      attachments: [],
    },
  ];
}

/**
 * Fetches recent departure manifest emails from INBOX
 */
async function fetchDepartureEmails({ limit = 15 } = {}) {
  // If credentials are not set, return mock demo emails with configured=false flag
  if (!env.email.user || !env.email.pass) {
    return {
      configured: false,
      message: 'Email credentials not set. Showing live preview / demo emails.',
      emails: getMockDepartureEmails(),
    };
  }

  const client = createImapClient();
  const emails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const status = await client.status('INBOX', { messages: true });
      const totalMessages = status.messages || 0;

      if (totalMessages === 0) {
        return { configured: true, emails: [] };
      }

      // Calculate sequence range for latest messages
      const fetchStart = Math.max(1, totalMessages - limit + 1);
      const seqRange = `${fetchStart}:${totalMessages}`;

      // Fetch messages
      for await (const message of client.fetch(seqRange, {
        envelope: true,
        source: true,
        flags: true,
      })) {
        try {
          // Parse message source using mailparser
          const parsed = await simpleParser(message.source);

          const pdfAttachments = (parsed.attachments || []).filter(
            (att) =>
              att.contentType === 'application/pdf' ||
              (att.filename && att.filename.toLowerCase().endsWith('.pdf'))
          );

          // Prepare attachment metadata and store buffers
          const attachmentList = [];
          for (const att of pdfAttachments) {
            const attachmentId = generateAttachmentId(parsed.messageId, att.filename);
            attachmentCache.set(attachmentId, {
              buffer: att.content,
              filename: att.filename || `Departure_Manifest_${attachmentId.substring(0, 6)}.pdf`,
              contentType: att.contentType || 'application/pdf',
              size: att.size || (att.content ? att.content.length : 0),
              createdAt: Date.now(),
            });

            attachmentList.push({
              id: attachmentId,
              filename: att.filename || `Departure_Manifest_${attachmentId.substring(0, 6)}.pdf`,
              size: att.size || (att.content ? att.content.length : 0),
              contentType: 'application/pdf',
            });
          }

          const fromText = parsed.from ? parsed.from.text : '';
          const fromValue = parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0] : null;

          emails.unshift({
            id: parsed.messageId || String(message.uid),
            uid: message.uid,
            subject: parsed.subject || '(No Subject)',
            from: fromValue ? fromValue.address : fromText,
            fromName: fromValue ? fromValue.name || fromValue.address : fromText,
            date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            preview: (parsed.text || '').substring(0, 160).replace(/\s+/g, ' ').trim(),
            hasPdf: attachmentList.length > 0,
            attachments: attachmentList,
          });
        } catch (parseErr) {
          console.error(`Error parsing message UID ${message.uid}:`, parseErr.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    return {
      configured: true,
      count: emails.length,
      emails,
    };
  } catch (error) {
    console.error('IMAP fetch error:', error);
    // Return mock emails as fallback with error note
    return {
      configured: true,
      error: error.message,
      message: `Failed to fetch from mail server: ${error.message}. Showing demo manifest list.`,
      emails: getMockDepartureEmails(),
    };
  }
}

/**
 * Gets cached PDF attachment by ID
 */
function getCachedAttachment(attachmentId) {
  return attachmentCache.get(attachmentId) || null;
}

module.exports = {
  fetchDepartureEmails,
  getCachedAttachment,
  testImapConnection,
};
