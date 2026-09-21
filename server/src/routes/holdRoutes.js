const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { createHold, releaseHold, getFisherHolds, getBlockHistory, blockByNic, blockByBoat, unblockBoat } = require('../controllers/holdController');

router.use(requireAuth);

// Get block history & holds list
router.get('/', getBlockHistory);

// Get fisher holds
router.get('/fisher/:fisherId', getFisherHolds);

// Block by NIC number (any owner/admin can block a person by their NIC)
router.post('/block-by-nic', blockByNic);

// Block by Boat Number (any owner/admin can block a person by boat number)
router.post('/block-by-boat', blockByBoat);

// Unblock Boat Number
router.post('/unblock-boat', unblockBoat);

// Create manual hold
router.post('/fisher/:fisherId', createHold);

// Release manual hold
router.post('/:holdId/release', releaseHold);

module.exports = router;
