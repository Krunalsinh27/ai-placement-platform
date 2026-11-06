const express = require('express');
const router = express.Router();
const { updateQuestion, deleteQuestion } = require('../controllers/aptitudeTestController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.put('/:id', authorize('recruiter', 'superadmin'), updateQuestion);
router.delete('/:id', authorize('recruiter', 'superadmin'), deleteQuestion);

module.exports = router;

