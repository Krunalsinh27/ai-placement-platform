const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');
const {
  askAssistant,
  streamAssistantChat,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  submitFeedback,
  escalateToTpo,
  runAssistantTool,
  getAssistantSuggestions,
} = require('../controllers/assistantController');

// Assistant routes allow student, tpo, recruiter, superadmin, and admin roles (analyst and aspirant strictly 403)
router.use(protect);
router.use(authorize('student', 'tpo', 'recruiter', 'superadmin', 'admin'));

// Chat & Streaming
router.post('/ask', aiLimiter, askAssistant);
router.post('/chat/stream', aiLimiter, streamAssistantChat);

// Conversation History & Thread Management
router.get('/conversations', listConversations);
router.get('/conversations/:conversationId', getConversation);
router.patch('/conversations/:conversationId', updateConversation);
router.delete('/conversations/:conversationId', deleteConversation);
router.delete('/conversations', clearAllConversations);

// Feedback & Escalation
router.post('/feedback', submitFeedback);
router.post('/escalate', escalateToTpo);

// Direct execution & Suggestions
router.post('/run', aiLimiter, runAssistantTool);
router.get('/suggestions', getAssistantSuggestions);

module.exports = router;
