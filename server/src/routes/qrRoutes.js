const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  generateQrToken,
  getQrStatus,
  revokeQrToken,
  verifyQrToken,
} = require('../controllers/qrController');

// All QR routes require Admin Authentication
router.use(requireAuth);

// Admin Rate Limiter for QR Verification (60 per min per IP)
const verifyRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many QR verification requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/fishers/:fisherId/generate', generateQrToken);
router.get('/fishers/:fisherId/status', getQrStatus);
router.post('/fishers/:fisherId/revoke', revokeQrToken);
router.post('/verify', verifyRateLimiter, verifyQrToken);

module.exports = router;
