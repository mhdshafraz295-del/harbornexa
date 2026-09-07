const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { upload, checkDeparturePdfs } = require('../controllers/departureCheckerController');

// All departure checker endpoints require authenticated Admin session
router.use(requireAuth);

const handleMulterUpload = (req, res, next) => {
  upload.array('pdfs', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Invalid file upload' });
    }
    next();
  });
};

// POST /api/departure-checker/check-pdfs or /api/departure-pdf-checker/check (Max 5 PDFs per batch)
router.post('/check-pdfs', handleMulterUpload, checkDeparturePdfs);
router.post('/check', handleMulterUpload, checkDeparturePdfs);

module.exports = router;
