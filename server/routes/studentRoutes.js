const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  uploadResume: uploadResumeHandler,
  streamResume,
  getStudents,
  getStudentById,
  deleteStudent,
} = require('../controllers/studentController');
const { getStudentUpcomingRounds } = require('../controllers/recruitmentPipelineController');
const { getStudentMyInterviewSlots } = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/authMiddleware');
const uploadResume = require('../middleware/uploadMiddleware');

// Student profile routes
router
  .route('/me')
  .get(protect, authorize('student'), getMyProfile)
  .put(protect, authorize('student'), uploadResume.single('resume'), updateMyProfile);

// Dedicated resume upload route
router
  .route('/resume')
  .post(protect, authorize('student'), uploadResume.single('resume'), uploadResumeHandler);

// Student upcoming round batches (must come before /:id)
router.get('/upcoming-rounds', protect, authorize('student'), getStudentUpcomingRounds);

// Student upcoming interview slots (must come before /:id)
router.get('/my-interview-slots', protect, authorize('student'), getStudentMyInterviewSlots);

// Resume streaming route (must come before /:id)
router.get('/:studentId/resume', protect, streamResume);

// Admin student management routes
router.route('/').get(protect, authorize('admin'), getStudents);
router
  .route('/:id')
  .get(protect, authorize('admin'), getStudentById)
  .delete(protect, authorize('admin'), deleteStudent);

module.exports = router;

