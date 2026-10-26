const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  logout,
  createAdminAccount,
  updateProfile,
  changePassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiter');

router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, getMe);
router.post('/logout', requireAuth, logout);
router.post('/create-admin', requireAuth, createAdminAccount);
router.put('/profile', requireAuth, updateProfile);
router.put('/change-password', requireAuth, changePassword);

module.exports = router;
