const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getDebts,
  createDebt,
  updateDebt,
  cancelDebt,
  recordPayment,
  reversePayment,
  getFisherFinancialInfo,
} = require('../controllers/debtController');

router.use(requireAuth);

// Debts list & top metrics
router.get('/', getDebts);

// Fisher financial summary & clearance status
router.get('/fisher/:fisherId', getFisherFinancialInfo);

// Add debt
router.post('/fisher/:fisherId', createDebt);

// Edit debt
router.patch('/:id', updateDebt);

// Cancel debt
router.post('/:id/cancel', cancelDebt);

// Record payment
router.post('/:debtId/payments', recordPayment);

// Reverse payment
router.post('/payments/:paymentId/reverse', reversePayment);

module.exports = router;
