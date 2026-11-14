const express = require('express');
const router = express.Router();
const {
  getPlacements,
  getMyPlacements,
  exportPlacementsExcel,
} = require('../controllers/placementController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Admin / TPO Excel Export route
router.get('/export/excel', protect, authorize('admin', 'tpo', 'superadmin'), exportPlacementsExcel);

// Get placements (Admin/TPO sees own college; Student sees own; Recruiter sees own company)
router.get('/', protect, authorize('student', 'recruiter', 'admin', 'tpo', 'superadmin'), getPlacements);

// Student specific endpoint for their placement offers
router.get('/my', protect, authorize('student'), getMyPlacements);

module.exports = router;

