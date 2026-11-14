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
const { protect, authorize } = require('../middleware/authMiddleware');

router
  .route('/')
  .post(protect, authorize('recruiter', 'superadmin'), createJobRequirement)
  .get(protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), getJobRequirements);

router
  .route('/:id')
  .get(protect, authorize('recruiter', 'tpo', 'admin', 'superadmin'), getJobRequirementById)
  .put(protect, authorize('recruiter', 'superadmin'), updateJobRequirement)
  .delete(protect, authorize('recruiter', 'superadmin'), deleteJobRequirement);

router
  .route('/:id/publish')
  .patch(protect, authorize('recruiter', 'superadmin'), publishJobRequirement);

module.exports = router;

