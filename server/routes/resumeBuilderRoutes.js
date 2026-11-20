const express = require('express');
const router = express.Router();
const {
  getBaseResume,
  loadSourceHandler,
  analyzeTargetHandler,
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
const { aiRequestBudget } = require('../middleware/aiTimeoutMiddleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// All routes require student authentication
router.use(protect);
router.use(authorize('student'));

// Source Normalization (Supports multipart file upload or JSON)
router.post('/source', upload.single('file'), loadSourceHandler);

// Target Analysis
router.post('/analyze-target', analyzeTargetHandler);

// Tailoring, PDF Export & Base Resume
router.get('/base', getBaseResume);
router.get('/quota', getQuotaHandler);
router.post('/tailor', aiLimiter, aiRequestBudget(60000), tailorResumeHandler);
router.post('/cover-letter', aiLimiter, aiRequestBudget(60000), generateCoverLetterHandler);
router.post('/export-pdf', exportPdfHandler);

// Version Control Routes (Max 5 per student)
router.get('/versions', listVersionsHandler);
router.post('/versions', saveVersionHandler);
router.get('/versions/:id', getVersionHandler);
router.delete('/versions/:id', deleteVersionHandler);

module.exports = router;
