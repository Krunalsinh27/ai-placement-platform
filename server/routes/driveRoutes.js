const express = require('express');
const router = express.Router();
const {
  createDrive,
  getDrives,
  getEligibleDrives,
  getDriveById,
  updateDrive,
  deleteDrive,
  reopenDrive,
} = require('../controllers/driveController');
const {
  freezeDriveAndInitializePipeline,
  removeApplicantBeforeFreeze,
  getDriveProgress,
  getDailyClashes,
  extendBulkOffers,
} = require('../controllers/recruitmentPipelineController');
const {
  getRankedApplicants,
  getApplicantExplanationHandler,
  updateDriveSkills,
} = require('../controllers/aiResumeController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');

// General drives list & creation
router
  .route('/')
  .post(protect, authorize('admin', 'tpo', 'superadmin'), createDrive)
  .get(protect, authorize('admin', 'tpo', 'superadmin', 'recruiter', 'student'), getDrives);

// Student eligible drives (must come before /:id)
router.get('/eligible', protect, authorize('student'), getEligibleDrives);

// TPO Daily clash detection report (must come before /:id)
router.get('/clashes', protect, authorize('tpo', 'admin', 'superadmin'), getDailyClashes);

// Pipeline management routes
router.put('/:id/freeze', protect, authorize('tpo', 'admin', 'superadmin'), freezeDriveAndInitializePipeline);
router.put('/:id/reopen', protect, authorize('tpo', 'admin', 'superadmin'), reopenDrive);
router.put('/:id/remove-applicant/:studentId', protect, authorize('tpo', 'admin', 'superadmin'), removeApplicantBeforeFreeze);
router.get('/:id/progress', protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), getDriveProgress);
router.post('/:id/offers', protect, authorize('recruiter', 'superadmin'), extendBulkOffers);

// AI Ranking & Explanation routes
router.get('/:id/ranked-applicants', protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), aiLimiter, getRankedApplicants);
router.get('/:id/applicants/:applicationId/explanation', protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), aiLimiter, getApplicantExplanationHandler);
router.put('/:id/skills', protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), updateDriveSkills);

// Drive by ID routes
router
  .route('/:id')
  .get(protect, authorize('admin', 'tpo', 'superadmin', 'recruiter', 'student'), getDriveById)
  .put(protect, authorize('admin', 'tpo', 'superadmin'), updateDrive)
  .delete(protect, authorize('admin', 'tpo', 'superadmin'), deleteDrive);

module.exports = router;

