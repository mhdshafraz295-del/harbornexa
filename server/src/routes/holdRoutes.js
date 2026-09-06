const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { createHold, releaseHold, getFisherHolds, getBlockHistory } = require('../controllers/holdController');

router.use(requireAuth);

// Get block history & holds list
router.get('/', getBlockHistory);

// Get fisher holds
router.get('/fisher/:fisherId', getFisherHolds);

// Create manual hold
router.post('/fisher/:fisherId', createHold);

// Release manual hold
router.post('/:holdId/release', releaseHold);

module.exports = router;
