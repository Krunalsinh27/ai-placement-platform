const express = require('express');
const router = express.Router();
const {
  getColleges,
  getCollegeById,
  createCollege,
  getMyCollegeSettings,
  updateMyCollegeSettings,
  updateCollegeSettingsById,
} = require('../controllers/collegeController');
const {
  getPublicCollegesPlacements,
  getPublicCollegeDetailsByCode,
  getPublicCompareColleges,
  getPublicFilterOptions,
} = require('../controllers/publicPlacementsController');
const { getCollegeEmailLogs, resendFailedEmail } = require('../controllers/emailController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public Placements Endpoints (No auth required)
router.get('/public/filters', getPublicFilterOptions);
router.get('/public/placements', getPublicCollegesPlacements);
router.get('/public/placements/:code', getPublicCollegeDetailsByCode);
router.get('/public/compare', getPublicCompareColleges);

router.route('/')
  .get(getColleges)
  .post(protect, authorize('admin', 'tpo', 'superadmin'), createCollege);

// College settings endpoints (must precede /:id)
router.route('/my/settings')
  .get(protect, authorize('admin', 'tpo', 'superadmin'), getMyCollegeSettings)
  .put(protect, authorize('admin', 'tpo', 'superadmin'), updateMyCollegeSettings);

// TPO College Email logs
router.route('/my/email-logs')
  .get(protect, authorize('admin', 'tpo', 'superadmin'), getCollegeEmailLogs);

router.route('/my/email-logs/:id/resend')
  .post(protect, authorize('admin', 'tpo', 'superadmin'), resendFailedEmail);

router.route('/:id/settings')
  .put(protect, authorize('admin', 'tpo', 'superadmin'), updateCollegeSettingsById);

router.route('/:id')
  .get(getCollegeById);

module.exports = router;

