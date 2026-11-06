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
router.get('/export/excel', exportExcel);
router.get('/export/pdf', exportPdf);

module.exports = router;

