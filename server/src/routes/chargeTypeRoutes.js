const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getChargeTypes,
  createChargeType,
  updateChargeType,
  activateChargeType,
  deactivateChargeType,
} = require('../controllers/chargeTypeController');

// All routes require authenticated Admin
router.use(requireAuth);

router.get('/', getChargeTypes);
router.post('/', createChargeType);
router.patch('/:id', updateChargeType);
router.post('/:id/activate', activateChargeType);
router.post('/:id/deactivate', deactivateChargeType);

module.exports = router;
