const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');
const {
  askAssistant,
  runAssistantTool,
  getAssistantSuggestions,
} = require('../controllers/assistantController');

// Assistant routes allow student, tpo, recruiter, superadmin, and admin roles (analyst and aspirant strictly 403)
router.use(protect);
router.use(authorize('student', 'tpo', 'recruiter', 'superadmin', 'admin'));

router.post('/ask', aiLimiter, askAssistant);
router.post('/run', aiLimiter, runAssistantTool);
router.get('/suggestions', getAssistantSuggestions);

module.exports = router;

