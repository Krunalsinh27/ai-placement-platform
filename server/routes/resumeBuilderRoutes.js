const express = require('express');
const router = express.Router();
const {
  getBaseResume,
  loadSourceHandler,
  analyzeTargetHandler,
  generateMatchReportHandler,
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

// Wizard Step 1: Source Normalization
router.post('/source', loadSourceHandler);

// Wizard Step 2: Target Analysis
router.post('/analyze-target', analyzeTargetHandler);

// Wizard Step 3: Match & ATS Report
router.post('/match-report', generateMatchReportHandler);

// Wizard Step 4: Tailoring, PDF Export & Legacy Base
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
