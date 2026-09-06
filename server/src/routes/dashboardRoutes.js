const express = require('express');
const router = express.Router();
const { getMetrics } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/metrics', requireAuth, getMetrics);

module.exports = router;
