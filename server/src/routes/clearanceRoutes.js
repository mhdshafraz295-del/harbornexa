const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getFisherClearance,
  grantClearance,
  getTodayClearances,
  getFisherClearanceHistory,
} = require('../controllers/clearanceController');

// All clearance endpoints require authenticated Admin
router.use(requireAuth);

router.get('/today', getTodayClearances);
router.get('/fishers/:fisherId', getFisherClearance);
router.post('/fishers/:fisherId/grant', grantClearance);
router.get('/fishers/:fisherId/history', getFisherClearanceHistory);

module.exports = router;
