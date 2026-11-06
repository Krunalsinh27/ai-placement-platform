const express = require('express');
const router = express.Router();
const { getCollegeEmailLogs, resendFailedEmail } = require('../controllers/emailController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/logs', authorize('tpo', 'admin', 'superadmin'), getCollegeEmailLogs);
router.post('/logs/:id/resend', authorize('tpo', 'admin', 'superadmin'), resendFailedEmail);

module.exports = router;

