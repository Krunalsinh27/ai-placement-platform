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

module.exports = router;

