const express = require('express');
const router = express.Router();
const {
  createDriveRequests,
  getDriveRequests,
  getDriveRequestById,
  cancelDriveRequest,
  respondToDriveRequest,
  acceptTpoProposedDate,
  confirmDriveSchedule,
  finalizeAndPublishDrive,
  addMessage,
  getDriveReconciliationReport,
  runDriveReconciliation,
} = require('../controllers/driveRequestController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All drive-request routes require authentication
router.use(protect);

// Base collection routes
router
  .route('/')
  .post(authorize('recruiter', 'superadmin'), createDriveRequests)
  .get(authorize('recruiter', 'tpo', 'admin', 'superadmin'), getDriveRequests);

// TPO dedicated alias for incoming requests
router.get(
  '/college',
  authorize('tpo', 'admin', 'superadmin'),
  getDriveRequests
);

// Diagnostic and reconciliation routes (placed before /:id parameter route)
router.get(
  '/reconciliation/report',
  authorize('tpo', 'admin', 'superadmin'),
  getDriveReconciliationReport
);

router.post(
  '/reconciliation/run',
  authorize('tpo', 'admin', 'superadmin'),
  runDriveReconciliation
);

// Single item routes
router
  .route('/:id')
  .get(authorize('recruiter', 'tpo', 'admin', 'superadmin'), getDriveRequestById);

// Recruiter actions
router
  .route('/:id/cancel')
  .patch(authorize('recruiter', 'superadmin'), cancelDriveRequest)
  .put(authorize('recruiter', 'superadmin'), cancelDriveRequest);

router
  .route('/:id/accept-date')
  .patch(authorize('recruiter', 'superadmin'), acceptTpoProposedDate)
  .put(authorize('recruiter', 'superadmin'), acceptTpoProposedDate);

router
  .route('/:id/confirm-schedule')
  .patch(authorize('recruiter', 'superadmin'), confirmDriveSchedule)
  .put(authorize('recruiter', 'superadmin'), confirmDriveSchedule);

// TPO response and finalize actions
router
  .route('/:id/respond')
  .put(authorize('tpo', 'admin', 'superadmin'), respondToDriveRequest);

router
  .route('/:id/finalize')
  .put(authorize('tpo', 'admin', 'superadmin'), finalizeAndPublishDrive)
  .post(authorize('tpo', 'admin', 'superadmin'), finalizeAndPublishDrive);

// Collaborative messaging
router
  .route('/:id/messages')
  .post(authorize('recruiter', 'tpo', 'admin', 'superadmin'), addMessage);

module.exports = router;

