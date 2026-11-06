const express = require('express');
const router = express.Router();
const {
  getPlacements,
  getMyPlacements,
  exportPlacementsExcel,
} = require('../controllers/placementController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Admin Excel Export route
router.get('/export/excel', protect, authorize('admin'), exportPlacementsExcel);

// Get placements (Admin sees all with filters; Student sees own)
router.get('/', protect, getPlacements);

// Student specific endpoint for their placement offers
router.get('/my', protect, authorize('student'), getMyPlacements);

module.exports = router;

