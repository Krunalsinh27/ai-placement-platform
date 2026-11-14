const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const {
  getRoundDetails,
  updateRoundSettings,
  exportRoundAttendancePdf,
  autoSplitRoundBatches,
  moveParticipantBatch,
  updateBulkAttendance,
  updateBulkResults,
  shortlistParticipantsByCutoff,
  importResultsCSV,
  publishRoundResults,
  getRoundAnnouncementPreview,
  sendRoundAnnouncement,
} = require('../controllers/recruitmentPipelineController');
const {
  createRoundPanel,
  getRoundPanels,
  autoScheduleInterviewSlots,
  getRoundSlots,
} = require('../controllers/interviewController');
const {
  getRoundQuestions,
  createQuestion,
  importQuestionsCSV,
  getRoundTestResults,
} = require('../controllers/aptitudeTestController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/:id', authorize('recruiter', 'tpo', 'admin', 'superadmin'), getRoundDetails);
router.get('/:id/attendance/pdf', authorize('recruiter', 'tpo', 'admin', 'superadmin'), exportRoundAttendancePdf);
router.put('/:id', authorize('recruiter', 'tpo', 'admin', 'superadmin'), updateRoundSettings);
router.put('/:id/settings', authorize('recruiter', 'tpo', 'admin', 'superadmin'), updateRoundSettings);
router.post('/:id/batches/auto-split', authorize('recruiter', 'tpo', 'admin', 'superadmin'), autoSplitRoundBatches);
router.put('/:id/move-participant', authorize('recruiter', 'tpo', 'admin', 'superadmin'), moveParticipantBatch);
router.put('/:id/attendance', authorize('recruiter', 'tpo', 'admin', 'superadmin'), updateBulkAttendance);
router.put('/:id/results', authorize('recruiter', 'tpo', 'admin', 'superadmin'), updateBulkResults);
router.post('/:id/shortlist-by-cutoff', authorize('recruiter', 'tpo', 'admin', 'superadmin'), shortlistParticipantsByCutoff);
router.post('/:id/results/import', authorize('recruiter', 'tpo', 'admin', 'superadmin'), upload.single('file'), importResultsCSV);
router.post('/:id/publish-results', authorize('recruiter', 'tpo', 'admin', 'superadmin'), publishRoundResults);

// Interview Round Panel & Slot routes
router.post('/:id/panels', authorize('recruiter', 'tpo', 'admin', 'superadmin'), createRoundPanel);
router.get('/:id/panels', authorize('recruiter', 'tpo', 'admin', 'superadmin'), getRoundPanels);
router.post('/:id/slots/auto-schedule', authorize('recruiter', 'tpo', 'admin', 'superadmin'), autoScheduleInterviewSlots);
router.get('/:id/slots', authorize('student', 'recruiter', 'tpo', 'admin', 'superadmin'), getRoundSlots);

// Aptitude Platform Test & Question Bank routes
router.get('/:id/questions', authorize('recruiter', 'tpo', 'admin', 'superadmin'), getRoundQuestions);
router.post('/:id/questions', authorize('recruiter', 'superadmin'), createQuestion);
router.post('/:id/questions/import', authorize('recruiter', 'superadmin'), upload.single('file'), importQuestionsCSV);
router.get('/:id/test-results', authorize('recruiter', 'tpo', 'admin', 'superadmin'), getRoundTestResults);

// Round Announcements
router.get('/:id/announcements/preview', authorize('recruiter', 'tpo', 'admin', 'superadmin'), getRoundAnnouncementPreview);
router.post('/:id/announcements', authorize('recruiter', 'tpo', 'admin', 'superadmin'), sendRoundAnnouncement);

module.exports = router;

