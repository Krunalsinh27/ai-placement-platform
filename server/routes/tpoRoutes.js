const express = require('express');
const router = express.Router();
const {
  getPendingTPOs,
  approveTPO,
  rejectTPO,
  getPendingStudents,
  approveStudent,
  rejectStudent,
} = require('../controllers/tpoController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All TPO endpoints require authenticated & approved TPO / Admin / Superadmin
router.use(protect);
router.use(authorize('tpo', 'admin', 'superadmin'));

// Pending TPO management
router.get('/pending', getPendingTPOs);
router.put('/:id/approve', approveTPO);
router.patch('/:id/approve', approveTPO);
router.put('/:id/reject', rejectTPO);
router.patch('/:id/reject', rejectTPO);
router.delete('/:id/reject', rejectTPO);

// Pending Student approvals management (when College.requireStudentApproval is true)
router.get('/pending-students', getPendingStudents);
router.put('/students/:id/approve', approveStudent);
router.patch('/students/:id/approve', approveStudent);
router.put('/students/:id/reject', rejectStudent);
router.patch('/students/:id/reject', rejectStudent);
router.delete('/students/:id/reject', rejectStudent);

// TPO Insights & Analytics
router.get('/insights/at-risk', async (req, res, next) => {
  try {
    const { getAtRiskStudents } = require('../services/analytics/tpoInsightsService');
    const collegeId = req.user.college?._id || req.user.college;
    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'College assignment required' });
    }
    const targetCollegeId = collegeId || req.query.collegeId;
    const data = await getAtRiskStudents({
      collegeId: targetCollegeId,
      filters: {
        branch: req.query.branch,
        batchYear: req.query.batchYear,
        riskTier: req.query.riskTier,
      },
    });
    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/insights/weekly-summary', async (req, res, next) => {
  try {
    const { getWeeklyPlacementSummary } = require('../services/analytics/tpoInsightsService');
    const collegeId = req.user.college?._id || req.user.college;
    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'College assignment required' });
    }
    const targetCollegeId = collegeId || req.query.collegeId;
    const result = await getWeeklyPlacementSummary({
      collegeId: targetCollegeId,
      userRole: req.user.role,
      userId: req.user._id,
    });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

