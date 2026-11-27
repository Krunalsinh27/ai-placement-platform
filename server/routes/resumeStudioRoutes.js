const express = require('express');
const router = express.Router();

const {
  listResumesHandler,
  createResumeHandler,
  getResumeHandler,
  updateResumeHandler,
  archiveResumeHandler,
  unarchiveResumeHandler,
  trashResumeHandler,
  listTrashResumesHandler,
  restoreTrashResumeHandler,
  duplicateResumeHandler,
  setPrimaryResumeHandler,
  listResumeVersionsHandler,
  createResumeVersionHandler,
  restoreResumeVersionHandler,
  deleteResumeVersionHandler,
  getTemplatesHandler,
  exportResumePdfHandler,
  tpoListResumesHandler,
  tpoGetResumeHandler,
  tpoCreateReviewHandler,
  getResumeReviewsHandler,
  suggestResumeHandler,
  tailorResumeHandler,
  applyTailorResumeHandler,
  importResumeHandler,
  generateCoverLetterHandler,
  saveCoverLetterHandler,
  getCoverLetterHandler,
  exportCoverLetterPdfHandler,
} = require('../controllers/resumeStudioController');

const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * Safe upload wrapper to catch Multer file size and upload errors cleanly with 400
 */
const uploadImportFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum allowed limit (5MB)',
        });
      }
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
};

const { protect, authorize } = require('../middleware/authMiddleware');
const { userApiLimiter, aiLimiter } = require('../middleware/rateLimitMiddleware');
const { aiRequestBudget } = require('../middleware/aiTimeoutMiddleware');

// Base middlewares for all Resume Studio endpoints
router.use(protect);
router.use(userApiLimiter);

// ----------------------------------------------------------------------------
// Templates: Shared (Student, TPO, Admin, Superadmin)
// ----------------------------------------------------------------------------
router.get('/templates', getTemplatesHandler);

// ----------------------------------------------------------------------------
// Phase 11: TPO & Admin Endpoints (/api/resume-studio/tpo/*)
// ----------------------------------------------------------------------------
const tpoRouter = express.Router();
tpoRouter.use(authorize('tpo', 'admin', 'superadmin'));

tpoRouter.get('/resumes', tpoListResumesHandler);
tpoRouter.get('/resumes/:id', tpoGetResumeHandler);
tpoRouter.get('/resumes/:id/reviews', getResumeReviewsHandler);
tpoRouter.post('/resumes/:id/reviews', tpoCreateReviewHandler);

router.use('/tpo', tpoRouter);

// ----------------------------------------------------------------------------
// Shared Review Read Endpoint (/api/resume-studio/resumes/:id/reviews)
// ----------------------------------------------------------------------------
router.get(
  '/resumes/:id/reviews',
  authorize('student', 'tpo', 'admin', 'superadmin'),
  getResumeReviewsHandler
);

// ----------------------------------------------------------------------------
// Student-Only Endpoints
// ----------------------------------------------------------------------------
const studentRouter = express.Router();
studentRouter.use(authorize('student'));

// Resume CRUD
studentRouter.get('/', listResumesHandler);
studentRouter.get('/trash', listTrashResumesHandler);
studentRouter.post('/', createResumeHandler);
studentRouter.post('/import', uploadImportFile, importResumeHandler);
studentRouter.get('/:id', getResumeHandler);
studentRouter.patch('/:id', updateResumeHandler);
studentRouter.put('/:id', updateResumeHandler);
studentRouter.delete('/:id', archiveResumeHandler);
studentRouter.post('/:id/unarchive', unarchiveResumeHandler);
studentRouter.post('/:id/trash', trashResumeHandler);
studentRouter.delete('/:id/trash', trashResumeHandler);
studentRouter.post('/:id/restore-trash', restoreTrashResumeHandler);
studentRouter.post('/:id/duplicate', duplicateResumeHandler);
studentRouter.post('/:id/primary', setPrimaryResumeHandler);
studentRouter.post('/:id/export-pdf', exportResumePdfHandler);
studentRouter.post('/:id/suggest', aiLimiter, aiRequestBudget(60000), suggestResumeHandler);
studentRouter.post('/:id/tailor', aiLimiter, aiRequestBudget(60000), tailorResumeHandler);
studentRouter.post('/:id/tailor/apply', applyTailorResumeHandler);

// Phase 9: Cover Letter Management
studentRouter.post('/:id/cover-letter/generate', aiLimiter, aiRequestBudget(60000), generateCoverLetterHandler);
studentRouter.put('/:id/cover-letter', saveCoverLetterHandler);
studentRouter.get('/:id/cover-letter', getCoverLetterHandler);
studentRouter.post('/:id/cover-letter/export-pdf', exportCoverLetterPdfHandler);

// Version Management
studentRouter.get('/:id/versions', listResumeVersionsHandler);
studentRouter.post('/:id/versions', createResumeVersionHandler);
studentRouter.post('/:id/versions/:vid/restore', restoreResumeVersionHandler);
studentRouter.delete('/:id/versions/:vid', deleteResumeVersionHandler);

router.use('/resumes', studentRouter);

module.exports = router;
