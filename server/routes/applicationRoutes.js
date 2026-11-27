const express = require('express');
const router = express.Router();
const {
  applyToDrive,
  getMyApplications,
  getDriveApplications,
  updateApplicationStatus,
  getApplicationResumeSnapshot,
  exportApplicationSnapshotPdf,
  exportDriveApplicationsCsv,
  exportDriveApplicationsExcel,
  exportDriveApplicationsPdf,
} = require('../controllers/applicationController');
const { getApplicationTimeline } = require('../controllers/recruitmentPipelineController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Student applications
router.post('/', protect, authorize('student'), applyToDrive);
router.get('/my', protect, authorize('student'), getMyApplications);
router.get('/:id/timeline', protect, getApplicationTimeline);

// Scoped Resume Snapshot endpoints (Owner student, TPO/admin same college, Recruiter own drive)
router.get('/:id/resume-snapshot', protect, getApplicationResumeSnapshot);
router.get('/:id/resume-snapshot/pdf', protect, exportApplicationSnapshotPdf);

// Admin, TPO & Recruiter drive applicants, exports & status updates
router.get('/drive/:driveId', protect, authorize('admin', 'tpo', 'superadmin', 'recruiter'), getDriveApplications);
router.get('/drive/:driveId/export/csv', protect, authorize('admin', 'tpo', 'superadmin', 'recruiter'), exportDriveApplicationsCsv);
router.get('/drive/:driveId/export/excel', protect, authorize('admin', 'tpo', 'superadmin', 'recruiter'), exportDriveApplicationsExcel);
router.get('/drive/:driveId/export/pdf', protect, authorize('admin', 'tpo', 'superadmin', 'recruiter'), exportDriveApplicationsPdf);
router.put('/:id/status', protect, authorize('admin', 'tpo', 'superadmin'), updateApplicationStatus);

module.exports = router;

