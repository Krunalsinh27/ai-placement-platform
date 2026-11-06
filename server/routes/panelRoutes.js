const express = require('express');
const router = express.Router();
const {
  updatePanel,
  deletePanel,
  callNextCandidate,
} = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.put('/:id', authorize('recruiter', 'tpo', 'admin', 'superadmin'), updatePanel);
router.delete('/:id', authorize('recruiter', 'tpo', 'admin', 'superadmin'), deletePanel);
router.post('/:id/call-next', authorize('recruiter', 'tpo', 'admin', 'superadmin'), callNextCandidate);

module.exports = router;

