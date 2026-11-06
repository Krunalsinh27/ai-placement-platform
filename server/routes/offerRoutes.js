const express = require('express');
const router = express.Router();
const {
  getMyOffers,
  acceptOffer,
  declineOffer,
} = require('../controllers/recruitmentPipelineController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/my', authorize('student'), getMyOffers);
router.put('/:id/accept', authorize('student'), acceptOffer);
router.put('/:id/decline', authorize('student'), declineOffer);

module.exports = router;

