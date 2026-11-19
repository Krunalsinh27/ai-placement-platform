const express = require('express');
const router = express.Router();
const {
  startSession,
  submitAnswer,
  getSession,
  listSessions,
  deleteSession,
  getQuota,
  getCollegeAnalytics,
} = require('../controllers/mockInterviewController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');

// TPO / Admin aggregated analytics
router.get('/analytics', protect, authorize('tpo', 'admin', 'superadmin'), getCollegeAnalytics);

// Student mock interview endpoints
router.post('/', protect, authorize('student'), aiLimiter, startSession);
router.get('/', protect, authorize('student'), listSessions);
router.get('/quota', protect, authorize('student'), getQuota);
router.get('/:id', protect, authorize('student'), getSession);
router.post('/:id/answers', protect, authorize('student'), aiLimiter, submitAnswer);
router.delete('/:id', protect, authorize('student'), deleteSession);

module.exports = router;
