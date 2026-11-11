const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { reportLimiter } = require('../middleware/rateLimitMiddleware');
const { getPlacementReport, exportPlacementReport } = require('../controllers/reportController');

// Rate limiting & Authorization: Accessible to TPO (own college) and Superadmin
router.use(reportLimiter);
router.use(protect);
router.use(authorize('tpo', 'superadmin'));

// Placement Report routes
router.get('/placement', getPlacementReport);
router.get('/placement/export', exportPlacementReport);

module.exports = router;

