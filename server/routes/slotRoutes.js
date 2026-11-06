const express = require('express');
const router = express.Router();
const {
  updateSlotStatus,
  allowSlotRetest,
  submitSlotEvaluation,
  getSlotEvaluation,
  getSlotDetails,
} = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/:id', authorize('student', 'recruiter', 'tpo', 'admin', 'superadmin'), getSlotDetails);
router.put('/:id/status', authorize('student', 'recruiter', 'tpo', 'admin', 'superadmin'), updateSlotStatus);
router.put('/:id/allow-retest', authorize('recruiter', 'tpo', 'admin', 'superadmin'), allowSlotRetest);
router.post('/:id/evaluation', authorize('recruiter', 'tpo', 'admin', 'superadmin'), submitSlotEvaluation);
router.get('/:id/evaluation', authorize('recruiter', 'tpo', 'student', 'admin', 'superadmin'), getSlotEvaluation);

module.exports = router;

