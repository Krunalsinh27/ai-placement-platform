const express = require('express');
const router = express.Router();
const {
  applyToDrive,
  getMyApplications,
  getDriveApplications,
  updateApplicationStatus,
} = require('../controllers/applicationController');
const { getApplicationTimeline } = require('../controllers/recruitmentPipelineController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Student applications
router.post('/', protect, authorize('student'), applyToDrive);
router.get('/my', protect, authorize('student'), getMyApplications);
router.get('/:id/timeline', protect, getApplicationTimeline);

// Admin drive applicants & status updates
router.get('/drive/:driveId', protect, authorize('admin'), getDriveApplications);
router.put('/:id/status', protect, authorize('admin'), updateApplicationStatus);

module.exports = router;

