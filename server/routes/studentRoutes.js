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
const {
  parseResume,
  getResumeProfile,
  updateResumeProfile,
  deleteResumeProfile,
  getStudentSkillMatch,
  analyzeResumeHandler,
} = require('../controllers/aiResumeController');
const { protect, authorize } = require('../middleware/authMiddleware');
const uploadResume = require('../middleware/uploadMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');

// Student profile routes
router
  .route('/me')
  .get(protect, authorize('student'), getMyProfile)
  .put(protect, authorize('student'), uploadResume.single('resume'), updateMyProfile);

// AI Resume parsing & insight routes (must come before /:id or /:studentId)
router.post('/me/resume/parse', protect, authorize('student'), aiLimiter, parseResume);
router.post('/me/resume/analyze', protect, authorize('student'), aiLimiter, analyzeResumeHandler);
router
  .route('/me/resume-profile')
  .get(protect, authorize('student'), getResumeProfile)
  .put(protect, authorize('student'), updateResumeProfile)
  .delete(protect, authorize('student'), deleteResumeProfile);
router.get('/me/skill-match/:driveId', protect, authorize('student'), aiLimiter, getStudentSkillMatch);

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

