const express = require('express');
const router = express.Router();
const {
  getOverviewStats,
  getStatsByBranch,
  getStatsByYear,
  getStatsByCompany,
  getTopCompanies,
  getPublicPlacementStats,
  exportSummaryPDF,
} = require('../controllers/statsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public aggregate stats endpoint (No authentication required)
router.get('/public', getPublicPlacementStats);

// Admin / TPO PDF Export route
router.get('/export/pdf', protect, authorize('admin', 'tpo', 'superadmin'), exportSummaryPDF);

// Analytics endpoints (protected for administrative users)
router.get('/overview', protect, authorize('admin', 'tpo', 'superadmin'), getOverviewStats);
router.get('/by-branch', protect, authorize('admin', 'tpo', 'superadmin'), getStatsByBranch);
router.get('/by-year', protect, authorize('admin', 'tpo', 'superadmin'), getStatsByYear);
router.get('/by-company', protect, authorize('admin', 'tpo', 'superadmin'), getStatsByCompany);
router.get('/top-companies', protect, authorize('admin', 'tpo', 'superadmin'), getTopCompanies);

module.exports = router;

