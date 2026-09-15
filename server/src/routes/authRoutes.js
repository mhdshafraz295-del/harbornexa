const express = require('express');
const router = express.Router();
const { login, getMe, logout, createAdminAccount } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiter');

router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, getMe);
router.post('/logout', requireAuth, logout);
router.post('/create-admin', requireAuth, createAdminAccount);

module.exports = router;
