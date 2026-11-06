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

// Admin PDF Export route
router.get('/export/pdf', protect, authorize('admin'), exportSummaryPDF);

// Analytics endpoints (protected for authenticated users)
router.get('/overview', protect, getOverviewStats);
router.get('/by-branch', protect, getStatsByBranch);
router.get('/by-year', protect, getStatsByYear);
router.get('/by-company', protect, getStatsByCompany);
router.get('/top-companies', protect, getTopCompanies);

module.exports = router;

