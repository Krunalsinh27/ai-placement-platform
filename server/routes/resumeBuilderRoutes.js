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

// Student authentication & authorization
router.use(protect);
router.use(authorize('student'));

router.post('/source', upload.single('file'), loadSourceHandler);
router.post('/analyze-target', analyzeTargetHandler);
router.get('/base', getBaseResume);
router.get('/quota', getQuotaHandler);
router.post('/tailor', aiLimiter, aiRequestBudget(60000), tailorResumeHandler);
router.post('/cover-letter', aiLimiter, aiRequestBudget(60000), generateCoverLetterHandler);
router.post('/export-pdf', exportPdfHandler);
router.get('/versions', listVersionsHandler);
router.post('/versions', saveVersionHandler);
router.get('/versions/:id', getVersionHandler);
router.delete('/versions/:id', deleteVersionHandler);

module.exports = router;
