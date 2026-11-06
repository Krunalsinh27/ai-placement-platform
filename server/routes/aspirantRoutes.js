const express = require('express');
const router = express.Router();
const {
  getAspirantProfile,
  updateAspirantProfile,
  addToShortlist,
  removeFromShortlist,
  getShortlist,
  getSavedComparisons,
  saveComparison,
  deleteComparison,
  getAspirantFilterOptions,
  getRecommendations,
} = require('../controllers/aspirantController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Universal route protection: Aspirant role only
router.use(protect);
router.use(authorize('aspirant'));

// Recommendations tailored to aspirant's branches and home state
router.get('/recommendations', getRecommendations);

// Filter options (states, batchYears, branches)
router.get('/filters', getAspirantFilterOptions);

// Preferences & Profile
router.route('/me')
  .get(getAspirantProfile)
  .put(updateAspirantProfile);

// Shortlisted colleges
router.get('/shortlist', getShortlist);
router.route('/shortlist/:collegeId')
  .post(addToShortlist)
  .delete(removeFromShortlist);

// Saved comparisons
router.route('/comparisons')
  .get(getSavedComparisons)
  .post(saveComparison);

router.delete('/comparisons/:id', deleteComparison);

module.exports = router;

