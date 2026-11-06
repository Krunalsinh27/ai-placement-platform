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
  .get(protect, getMyCompanyProfile)
  .put(protect, updateMyCompanyProfile);

// Collection Routes
router
  .route('/')
  .post(protect, authorize('admin', 'tpo', 'superadmin'), createCompany)
  .get(protect, getCompanies);

// Single Company by ID Routes
router
  .route('/:id')
  .get(protect, getCompanyById)
  .put(protect, authorize('admin', 'tpo', 'superadmin'), updateCompany)
  .delete(protect, authorize('admin', 'tpo', 'superadmin'), deleteCompany);

module.exports = router;
