const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getEligibleDebts,
  previewSchedule,
  listInstallmentPlans,
  handleCreatePlan,
  handleCancelPlan,
  handleDeletePlan,
} = require('../controllers/installmentController');

// All routes require authentication
router.use(requireAuth);

// GET /api/installments/eligible-debts
router.get('/eligible-debts', getEligibleDebts);

// POST /api/installments/preview-schedule
router.post('/preview-schedule', previewSchedule);

// GET /api/installments/plans
router.get('/plans', listInstallmentPlans);

// POST /api/installments/plans
router.post('/plans', handleCreatePlan);

// POST /api/installments/plans/:id/cancel
router.post('/plans/:id/cancel', handleCancelPlan);

// DELETE /api/installments/plans/:id
router.delete('/plans/:id', handleDeletePlan);

module.exports = router;

