const express = require('express');
const router = express.Router();
const {
  getBaseResume,
  tailorResumeHandler,
  generateCoverLetterHandler,
  exportPdfHandler,
  saveVersionHandler,
  listVersionsHandler,
  getVersionHandler,
  deleteVersionHandler,
  getQuotaHandler,
} = require('../controllers/resumeBuilderController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimitMiddleware');

// All routes require student authentication
router.use(protect);
router.use(authorize('student'));

router.get('/base', getBaseResume);
router.get('/quota', getQuotaHandler);
router.post('/tailor', aiLimiter, tailorResumeHandler);
router.post('/cover-letter', aiLimiter, generateCoverLetterHandler);
router.post('/export-pdf', exportPdfHandler);

// Version Control Routes (Max 5 per student)
router.get('/versions', listVersionsHandler);
router.post('/versions', saveVersionHandler);
router.get('/versions/:id', getVersionHandler);
router.delete('/versions/:id', deleteVersionHandler);

module.exports = router;
