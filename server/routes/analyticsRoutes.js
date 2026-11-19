const express = require('express');
const router = express.Router();
const {
  getOverview,
  getColleges,
  getByBranch,
  getByYear,
  getTopRecruiters,
  compareColleges,
  exportExcel,
  exportPdf,
  getFilterOptions,
} = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Universal protection: Analyst and Superadmin only
router.use(protect);
router.use(authorize('analyst', 'superadmin'));

router.get('/filters', getFilterOptions);
router.get('/filter-values', getFilterOptions);
router.get('/overview', getOverview);
router.get('/colleges', getColleges);
router.get('/by-branch', getByBranch);
router.get('/by-year', getByYear);
router.get('/top-recruiters', getTopRecruiters);
router.get('/compare', compareColleges);

// Analyst Insights: Weekly Placement Summary with k=5 suppression
router.get('/insights/weekly-summary', async (req, res, next) => {
  try {
    const { getWeeklyPlacementSummary } = require('../services/analytics/tpoInsightsService');
    const { collegeId } = req.query;
    if (!collegeId) {
      return res.status(400).json({ success: false, message: 'collegeId query parameter is required' });
    }
    const result = await getWeeklyPlacementSummary({
      collegeId,
      userRole: 'analyst',
      userId: req.user._id,
    });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});
router.get('/export/excel', exportExcel);
router.get('/export/csv', (req, res, next) => {
  req.query.format = 'csv';
  return exportExcel(req, res, next);
});
router.get('/export/pdf', exportPdf);

module.exports = router;

