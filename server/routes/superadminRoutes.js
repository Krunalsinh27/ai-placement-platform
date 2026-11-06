const express = require('express');
const router = express.Router();
const {
  getPlatformOverview,
  getAnalysts,
  updateAnalystStatus,
  getColleges,
  updateCollegeStatus,
  getCompanies,
  updateCompanyVerification,
  getPendingAccounts,
  approvePendingAccount,
  rejectPendingAccount,
} = require('../controllers/superadminController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Universal superadmin protection: Only superadmin role is permitted
router.use(protect);
router.use(authorize('superadmin'));

// Platform Overview
router.get('/overview', getPlatformOverview);

// Analyst Management
router.get('/analysts', getAnalysts);
router.put('/analysts/:id/status', updateAnalystStatus);
router.put('/analysts/:id/approve', (req, res, next) => {
  req.body.status = 'approved';
  updateAnalystStatus(req, res, next);
});
router.put('/analysts/:id/reject', (req, res, next) => {
  req.body.status = 'rejected';
  updateAnalystStatus(req, res, next);
});

// College Verification Management
router.get('/colleges', getColleges);
router.put('/colleges/:id/status', updateCollegeStatus);
router.put('/colleges/:id/approve', (req, res, next) => {
  req.body.status = 'approved';
  updateCollegeStatus(req, res, next);
});
router.put('/colleges/:id/reject', (req, res, next) => {
  req.body.status = 'rejected';
  updateCollegeStatus(req, res, next);
});

// Company Verification Management
router.get('/companies', getCompanies);
router.put('/companies/:id/verify', updateCompanyVerification);

// Pending Accounts Management (TPO and Student cross-college override)
router.get('/pending-accounts', getPendingAccounts);
router.put('/pending-accounts/:id/approve', approvePendingAccount);
router.put('/pending-accounts/:id/reject', rejectPendingAccount);

module.exports = router;

