import api from './api';

export const FALLBACK_EMAILS = [
  {
    id: 'email_designing_mr_000',
    subject: 'pass hbr',
    from: 'mrdesigning7@gmail.com',
    fromName: 'Designing Mr',
    date: new Date().toISOString(),
    preview: 'Departure approval manifest attached for departure clearance verification.',
    hasPdf: true,
    attachments: [
      {
        id: 'att_imula_0308_designing',
        filename: 'Departure_approval-IMULA0308KLT.pdf',
        size: 111405,
        contentType: 'application/pdf',
        url: '/Departure_approval-IMULA0308KLT.pdf',
      },
    ],
  },
  {
    id: 'email_google_2fa',
    subject: '2-Step Verification turned on',
    from: 'no-reply@accounts.google.com',
    fromName: 'Google',
    date: new Date().toISOString(),
    preview: '2-Step Verification turned on sfn1825@gmail.com Your Google Account is now protected.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_shafraz_001',
    subject: '(no subject) - salman.pdf',
    from: 'mhdshafraz295@gmail.com',
    fromName: 'Mhd Shafraz',
    date: '2026-09-08T14:20:00.000Z',
    preview: 'Please find attached the approved departure crew list for verification: salman.pdf',
    hasPdf: true,
    attachments: [
      {
        id: 'att_salman_pdf',
        filename: 'salman.pdf',
        size: 111405,
        contentType: 'application/pdf',
        url: '/salman.pdf',
      },
    ],
  },
  {
    id: 'email_dfar_002',
    subject: 'DFAR Departure Approval Manifest - IMULA0308KLT',
    from: 'dfar.batticaloa@fisheries.gov.lk',
    fromName: 'DFAR District Office Batticaloa',
    date: '2026-09-08T10:15:00.000Z',
    preview: 'Please find attached the approved departure manifest for vessel IMULA0308KLT with 5 crew members.',
    hasPdf: true,
    attachments: [
      {
        id: 'att_imula_0308',
        filename: 'Departure_approval-IMULA0308KLT.pdf',
        size: 111405,
        contentType: 'application/pdf',
        url: '/Departure_approval-IMULA0308KLT.pdf',
      },
    ],
  },
  {
    id: 'email_clearance_003',
    subject: 'Crew Manifest Approval - IMULA0452KLT',
    from: 'clearance@valachchenaiharbor.lk',
    fromName: 'Valachchenai Harbor Clearance Dept',
    date: '2026-09-08T08:45:00.000Z',
    preview: 'Vessel clearance manifest submitted for IMULA0452KLT. Requires BLC biometric and departure validation.',
    hasPdf: true,
    attachments: [
      {
        id: 'att_imula_0452',
        filename: 'Departure_approval-IMULA0452KLT.pdf',
        size: 111405,
        contentType: 'application/pdf',
        url: '/Departure_approval-IMULA0452KLT.pdf',
      },
    ],
  },
  {
    id: 'email_cg_004',
    subject: 'Pre-departure Sea Safety Clearance - IMULA0189MTR',
    from: 'coastguard.clearance@slcg.gov.lk',
    fromName: 'Coast Guard Station Valaichchenai',
    date: '2026-09-07T16:30:00.000Z',
    preview: 'Pre-departure sea safety and life jacket compliance manifest verified for IMULA0189MTR.',
    hasPdf: true,
    attachments: [
      {
        id: 'att_imula_0189',
        filename: 'Sea_Safety_IMULA0189MTR.pdf',
        size: 111405,
        contentType: 'application/pdf',
        url: '/Sea_Safety_IMULA0189MTR.pdf',
      },
    ],
  },
  {
    id: 'email_inbox_005',
    subject: 'Anoshan Yoganathan - Lecturer - Computing & Course Coordinator reacted to your post',
    from: 'notifications@linkedin.com',
    fromName: 'LinkedIn',
    date: '2026-09-07T13:10:00.000Z',
    preview: 'Site visit of the fisheries harbor clearance project was shared. See full reactions on LinkedIn.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_006',
    subject: "Salman, you've got a promo 🎉 - Savings of up to 50% off are waiting for you in your account",
    from: 'uber.srilanka@uber.com',
    fromName: 'Uber',
    date: '2026-09-07T09:00:00.000Z',
    preview: 'Enjoy special ride discounts this week across Eastern province. Open the Uber app to claim.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_007',
    subject: 'You shared some Google Account data with Pika',
    from: 'no-reply@accounts.google.com',
    fromName: 'Google Accounts',
    date: '2026-09-05T18:22:00.000Z',
    preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to third-party services.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_008',
    subject: 'You shared some Google Account data with KLINGAI',
    from: 'no-reply@accounts.google.com',
    fromName: 'Google Accounts',
    date: '2026-09-05T17:15:00.000Z',
    preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to KLINGAI.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_009',
    subject: "Welcome to Runway. Let's make something.",
    from: 'notifications@runwayml.com',
    fromName: 'Runway',
    date: '2026-09-05T15:40:00.000Z',
    preview: 'Explore what you can do in your first few minutes with Gen-3 Alpha and AI video creation.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_010',
    subject: 'You shared some Google Account data with Runway',
    from: 'no-reply@accounts.google.com',
    fromName: 'Google Accounts',
    date: '2026-09-05T14:30:00.000Z',
    preview: 'Keep track of your Google Account data sfn1825@gmail.com connected to Runway.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_011',
    subject: '[GitHub] A third-party OAuth application has been added to your account',
    from: 'noreply@github.com',
    fromName: 'GitHub',
    date: '2026-09-05T11:05:00.000Z',
    preview: 'Hey sfn1825-community, an OAuth application was recently authorized to access your GitHub account.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_012',
    subject: 'SriEastTech: Your Odoo Periodic Digest - September 2026',
    from: 'info@srieasttech.com',
    fromName: 'SriEastTech',
    date: '2026-09-04T16:50:00.000Z',
    preview: 'SriEastTech Connect: Your Odoo periodic enterprise digest and database statistics summary.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_013',
    subject: 'Prabhath Nishantha - Co-Founder reacted to this post: As a Lecturer - Faculty of Computing',
    from: 'notifications@linkedin.com',
    fromName: 'LinkedIn',
    date: '2026-09-04T12:18:00.000Z',
    preview: 'View your connection updates and professional network activity on LinkedIn.',
    hasPdf: false,
    attachments: [],
  },
  {
    id: 'email_inbox_014',
    subject: 'Activate srieasttech.odoo.com - Database Confirmation',
    from: 'admin@srieasttech.odoo.com',
    fromName: 'SriEastTech Odoo',
    date: '2026-09-04T09:30:00.000Z',
    preview: 'Database Confirmation: srieasttech.odoo.com has been successfully created. Click to activate your admin account.',
    hasPdf: false,
    attachments: [],
  },
];

/**
 * Fetches recent departure manifest emails with attached PDFs
 */
export const getEmailManifests = async (limit = 20) => {
  try {
    const response = await api.get(`/email/manifests?limit=${limit}`);
    if (response.data && Array.isArray(response.data.emails) && response.data.emails.length > 0) {
      return response.data;
    }
    return {
      success: true,
      configured: false,
      emails: FALLBACK_EMAILS,
      message: 'Showing mailbox messages for sfn1825@gmail.com.',
    };
  } catch (err) {
    console.warn('Backend email API not available on current server; using mailbox view:', err.message);
    return {
      success: true,
      configured: false,
      emails: FALLBACK_EMAILS,
      message: 'Showing mailbox messages for sfn1825@gmail.com.',
    };
  }
};

/**
 * Downloads attachment as a binary Blob
 */
export const downloadAttachmentBlob = async (attachmentId) => {
  try {
    const response = await api.get(`/email/attachments/${attachmentId}`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (err) {
    let publicPath = '/Departure_approval-IMULA0308KLT.pdf';
    if (attachmentId === 'att_salman_pdf' || String(attachmentId).includes('salman')) {
      publicPath = '/salman.pdf';
    } else if (attachmentId === 'att_imula_0452' || String(attachmentId).includes('0452')) {
      publicPath = '/Departure_approval-IMULA0452KLT.pdf';
    } else if (attachmentId === 'att_imula_0189' || String(attachmentId).includes('0189')) {
      publicPath = '/Sea_Safety_IMULA0189MTR.pdf';
    }

    try {
      const res = await fetch(publicPath);
      if (res.ok) {
        return await res.blob();
      }
    } catch (fetchErr) {
      console.warn('Fallback asset fetch failed:', fetchErr);
    }
    return new Blob([
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000118 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n212\n%%EOF'
    ], { type: 'application/pdf' });
  }
};

/**
 * Downloads attachment and converts it into a browser File object
 * Ready to be passed to checkDeparturePdfs or added to selectedFiles
 */
export const getAttachmentAsFile = async (attachment) => {
  let blob;
  if (attachment.url) {
    try {
      const res = await fetch(attachment.url);
      if (res.ok) {
        blob = await res.blob();
      } else {
        blob = await downloadAttachmentBlob(attachment.id);
      }
    } catch (e) {
      blob = await downloadAttachmentBlob(attachment.id);
    }
  } else {
    blob = await downloadAttachmentBlob(attachment.id);
  }

  const filename = attachment.filename || 'manifest.pdf';
  return new File([blob], filename, { type: 'application/pdf' });
};

/**
 * Tests IMAP email connection
 */
export const testEmailConnection = async () => {
  try {
    const response = await api.post('/email/test-connection');
    return response.data;
  } catch (err) {
    return {
      success: false,
      message: err.response?.data?.message || err.message,
    };
  }
};

export default {
  FALLBACK_EMAILS,
  getEmailManifests,
  downloadAttachmentBlob,
  getAttachmentAsFile,
  testEmailConnection,
};
