const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');
const {
  askAssistant,
  runAssistantTool,
  getAssistantSuggestions,
} = require('../controllers/assistantController');

// All assistant routes require TPO or Superadmin authorization and are rate-limited
router.use(protect);
router.use(authorize('tpo', 'superadmin'));

router.post('/ask', aiLimiter, askAssistant);
router.post('/run', aiLimiter, runAssistantTool);
router.get('/suggestions', getAssistantSuggestions);

module.exports = router;

