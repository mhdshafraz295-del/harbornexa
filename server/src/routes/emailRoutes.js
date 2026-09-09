const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getEmailManifests,
  downloadAttachment,
  testEmailConnection,
} = require('../controllers/emailController');

// All email endpoints require authenticated Admin session
router.use(requireAuth);

// GET /api/email/manifests - list recent manifest emails
router.get('/manifests', getEmailManifests);

// GET /api/email/attachments/:attachmentId - download or stream attachment
router.get('/attachments/:attachmentId', downloadAttachment);

// POST /api/email/test-connection - verify IMAP setup
router.post('/test-connection', testEmailConnection);

module.exports = router;
