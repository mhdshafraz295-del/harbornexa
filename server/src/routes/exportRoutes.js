const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  upload,
  downloadTemplate,
  previewFisherImport,
  confirmFisherImport,
  downloadImportErrorReport,
  exportFishers,
  exportDebts,
  exportPayments,
  exportClearances,
  exportBlockHistory,
  exportActiveFishers,
  exportBlockedFishers,
} = require('../controllers/exportController');

// All import/export endpoints require authenticated Admin session
router.use(requireAuth);

// Import endpoints
router.get('/import-template', downloadTemplate);
router.post('/preview-import', upload.single('file'), previewFisherImport);
router.post('/confirm-import', confirmFisherImport);
router.post('/error-report', downloadImportErrorReport);

// Export endpoints (fetches ALL rows)
router.get('/fishers', exportFishers);
router.get('/debts', exportDebts);
router.get('/payments', exportPayments);
router.get('/clearances', exportClearances);
router.get('/block-history', exportBlockHistory);
router.get('/active-fishers', exportActiveFishers);
router.get('/blocked-fishers', exportBlockedFishers);

module.exports = router;
