const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getFishers,
  getFisherById,
  createFisher,
  updateFisher,
  archiveFisher,
  restoreFisher,
} = require('../controllers/fisherController');

// All routes require authenticated Admin session
router.use(requireAuth);

router.get('/', getFishers);
router.get('/:id', getFisherById);
router.post('/', createFisher);
router.patch('/:id', updateFisher);
router.post('/:id/archive', archiveFisher);
router.post('/:id/restore', restoreFisher);

module.exports = router;
