const express = require('express');
const router = express.Router();
const {
  startTest,
  getStudentAttempt,
  saveAnswer,
  submitTest,
  recordTabSwitch,
  allowStudentRetest,
} = require('../controllers/aptitudeTestController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

// Student Test endpoints
router.post('/:roundId/start', authorize('student'), startTest);
router.get('/:roundId/attempt', authorize('student'), getStudentAttempt);
router.put('/:roundId/answer', authorize('student'), saveAnswer);
router.post('/:roundId/submit', authorize('student'), submitTest);
router.post('/:roundId/tab-switch', authorize('student'), recordTabSwitch);

// TPO Re-test permission
router.put('/:roundId/retest/:studentId', authorize('tpo', 'admin', 'superadmin'), allowStudentRetest);

module.exports = router;

