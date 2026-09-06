const express = require('express');
const router = express.Router();
const { login, getMe, logout } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiter');

router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, getMe);
router.post('/logout', requireAuth, logout);

module.exports = router;
