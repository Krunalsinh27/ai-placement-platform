const express = require('express');
const router = express.Router();
const {
  createJobRequirement,
  getJobRequirements,
  getJobRequirementById,
  updateJobRequirement,
  publishJobRequirement,
  deleteJobRequirement,
} = require('../controllers/jobRequirementController');
const { protect } = require('../middleware/authMiddleware');

router
  .route('/')
  .post(protect, createJobRequirement)
  .get(protect, getJobRequirements);

router
  .route('/:id')
  .get(protect, getJobRequirementById)
  .put(protect, updateJobRequirement)
  .delete(protect, deleteJobRequirement);

router
  .route('/:id/publish')
  .patch(protect, publishJobRequirement);

module.exports = router;

