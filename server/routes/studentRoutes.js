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
const { getStudentMyTests } = require('../controllers/aptitudeTestController');
const {
  parseResume,
  getResumeProfile,
  updateResumeProfile,
  deleteResumeProfile,
  getStudentSkillMatch,
  analyzeResumeHandler,
} = require('../controllers/aiResumeController');
const {
  startSession,
  submitAnswer,
  getSession,
  listSessions,
  deleteSession,
  getQuota,
} = require('../controllers/mockInterviewController');
const { protect, authorize } = require('../middleware/authMiddleware');
const uploadResume = require('../middleware/uploadMiddleware');
const { aiLimiter, userApiLimiter } = require('../middleware/rateLimitMiddleware');
const { aiRequestBudget } = require('../middleware/aiTimeoutMiddleware');

// Student profile routes
router
  .route('/me')
  .get(protect, authorize('student'), getMyProfile)
  .put(protect, authorize('student'), uploadResume.single('resume'), updateMyProfile);

// AI Resume parsing & insight routes (must come before /:id or /:studentId)
router.post('/me/resume/parse', protect, authorize('student'), aiLimiter, parseResume);
router.post('/me/resume/analyze', protect, authorize('student'), aiLimiter, aiRequestBudget(60000), analyzeResumeHandler);
router
  .route('/me/resume-profile')
  .get(protect, authorize('student'), getResumeProfile)
  .put(protect, authorize('student'), updateResumeProfile)
  .delete(protect, authorize('student'), deleteResumeProfile);
router.get('/me/skill-match/:driveId', protect, authorize('student'), aiLimiter, getStudentSkillMatch);

// AI Mock Interview routes for students
router.post('/me/mock-interviews', protect, authorize('student'), aiLimiter, startSession);
router.get('/me/mock-interviews', protect, authorize('student'), listSessions);
router.get('/me/mock-interviews/quota', protect, authorize('student'), getQuota);
router.get('/me/mock-interviews/:id', protect, authorize('student'), getSession);
router.post('/me/mock-interviews/:id/answers', protect, authorize('student'), aiLimiter, submitAnswer);
router.delete('/me/mock-interviews/:id', protect, authorize('student'), deleteSession);

// AI Resume Builder & Tailoring routes for students
router.use('/me/resume-builder', require('./resumeBuilderRoutes'));

// AI Skill-Gap Learning Plan route
router.get('/me/skill-gap-plan', protect, authorize('student'), aiLimiter, async (req, res, next) => {
  try {
    const { generateSkillGapPlan } = require('../services/ai/skillGapService');
    const plan = await generateSkillGapPlan({ studentUserId: req.user._id });
    res.status(200).json({
      success: true,
      plan,
    });
  } catch (error) {
    next(error);
  }
});

// Asynchronous AI Job Status Polling
router.get('/me/ai-jobs/:jobId', protect, authorize('student'), async (req, res, next) => {
  try {
    const { getAiJobStatus } = require('../services/ai/aiQueue');
    const status = await getAiJobStatus(req.params.jobId);
    res.status(200).json({
      success: true,
      ...status,
    });
  } catch (error) {
    next(error);
  }
});

// Dedicated resume upload route
router
  .route('/resume')
  .post(protect, authorize('student'), uploadResume.single('resume'), uploadResumeHandler);

// Student upcoming round batches (must come before /:id)
router.get('/upcoming-rounds', protect, authorize('student'), getStudentUpcomingRounds);

// Student upcoming interview slots (must come before /:id)
router.get('/my-interview-slots', protect, authorize('student'), getStudentMyInterviewSlots);

// Student enrolled platform tests (must come before /:id)
router.get('/my-tests', protect, authorize('student'), userApiLimiter, getStudentMyTests);

// Resume streaming route (must come before /:id)
router.get('/:studentId/resume', protect, streamResume);

// Admin / TPO student management routes
router.route('/').get(protect, authorize('admin', 'tpo', 'superadmin'), getStudents);
router
  .route('/:id')
  .get(protect, authorize('admin', 'tpo', 'superadmin'), getStudentById)
  .delete(protect, authorize('admin', 'tpo', 'superadmin'), deleteStudent);

module.exports = router;

