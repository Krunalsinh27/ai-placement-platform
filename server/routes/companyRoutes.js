const express = require('express');
const router = express.Router();
const {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getMyCompanyProfile,
  updateMyCompanyProfile,
} = require('../controllers/companyController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Recruiter / Current Company Profile Route
router
  .route('/me')
  .get(protect, authorize('recruiter', 'superadmin'), getMyCompanyProfile)
  .put(protect, authorize('recruiter', 'superadmin'), updateMyCompanyProfile);

// Collection Routes
router
  .route('/')
  .post(protect, authorize('admin', 'tpo', 'superadmin'), createCompany)
  .get(protect, getCompanies);

// Single Company by ID Routes
router
  .route('/:id')
  .get(protect, getCompanyById)
  .put(protect, authorize('superadmin'), updateCompany)
  .delete(protect, authorize('superadmin'), deleteCompany);

module.exports = router;
