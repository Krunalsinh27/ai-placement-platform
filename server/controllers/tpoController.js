const { User, Student, College } = require('../models');
const { sendAccountApprovedEmail, sendAccountRejectedEmail } = require('../utils/emailService');

/**
 * @desc    Get pending unapproved TPO colleagues for the logged-in TPO's college
 * @route   GET /api/tpo/pending
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const getPendingTPOs = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();

    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'No college profile associated with your TPO account',
      });
    }

    const query = {
      role: 'tpo',
      isApproved: false,
    };

    if (collegeId && req.user.role !== 'superadmin') {
      query.college = collegeId;
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await User.countDocuments(query);
    const pendingTpos = await User.find(query)
      .select('-password')
      .populate('college', 'name code city state')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: pendingTpos,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: pendingTpos.length,
      pendingTpos,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve a pending TPO colleague from the same college
 * @route   PUT /api/tpo/:id/approve
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const approveTPO = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    const targetUserId = req.params.id;

    const targetUser = await User.findById(targetUserId).populate('college');

    if (!targetUser || targetUser.role !== 'tpo') {
      return res.status(404).json({
        success: false,
        message: 'TPO user not found',
      });
    }

    // Verify same college authorization
    const targetCollegeId = (targetUser.college?._id || targetUser.college)?.toString();

    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || !targetCollegeId || targetCollegeId !== collegeId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only approve TPO colleagues from your own college',
      });
    }

    if (targetUser.isApproved) {
      return res.status(200).json({
        success: true,
        message: `TPO ${targetUser.name} is already approved`,
        user: targetUser,
      });
    }

    targetUser.isApproved = true;
    await targetUser.save();

    sendAccountApprovedEmail({
      to: targetUser.email,
      name: targetUser.name,
      role: 'tpo',
      collegeName: targetUser.college?.name,
    }).catch(() => {});

    const userPayload = {
      _id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      phone: targetUser.phone,
      role: targetUser.role,
      college: targetUser.college,
      isApproved: targetUser.isApproved,
    };

    res.status(200).json({
      success: true,
      message: `Successfully approved TPO account for ${targetUser.name} (${targetUser.email})`,
      data: userPayload,
      user: userPayload,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject and delete a pending TPO colleague account request (same-college TPO only)
 * @route   PUT /api/tpo/:id/reject
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const rejectTPO = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    const targetUserId = req.params.id;

    const targetUser = await User.findById(targetUserId).populate('college');

    if (!targetUser || targetUser.role !== 'tpo') {
      return res.status(404).json({
        success: false,
        message: 'TPO user not found',
      });
    }

    // Verify same college authorization
    const targetCollegeId = (targetUser.college?._id || targetUser.college)?.toString();

    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || !targetCollegeId || targetCollegeId !== collegeId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only reject TPO colleagues from your own college',
      });
    }

    // Prevent rejecting self
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot reject your own account',
      });
    }

    // Only allow rejecting pending (unapproved) TPOs
    if (targetUser.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject an already approved TPO account',
      });
    }

    const rejectedName = targetUser.name;
    const rejectedEmail = targetUser.email;
    const collegeName = targetUser.college?.name;

    sendAccountRejectedEmail({
      to: rejectedEmail,
      name: rejectedName,
      role: 'tpo',
      collegeName,
    }).catch(() => {});

    // Delete the pending TPO user
    await User.findByIdAndDelete(targetUser._id);

    res.status(200).json({
      success: true,
      message: `Successfully rejected and deleted pending TPO registration for ${rejectedName} (${rejectedEmail})`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get pending unapproved students for the logged-in TPO's college
 * @route   GET /api/tpo/pending-students
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const getPendingStudents = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();

    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'No college profile associated with your TPO account',
      });
    }

    const userQuery = {
      role: 'student',
      isApproved: false,
    };

    if (collegeId && req.user.role !== 'superadmin') {
      userQuery.college = collegeId;
    }

    const unapprovedUsers = await User.find(userQuery).select('-password');
    const userIds = unapprovedUsers.map((u) => u._id);

    const total = await Student.countDocuments({ user: { $in: userIds } });
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const pendingStudents = await Student.find({ user: { $in: userIds } })
      .populate('user', 'name email phone isApproved isEmailVerified createdAt')
      .populate('college', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: pendingStudents,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: pendingStudents.length,
      pendingStudents,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve a pending student from the same college
 * @route   PUT /api/tpo/students/:id/approve
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const approveStudent = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    const targetId = req.params.id;

    // targetId can be Student._id or User._id
    let student = await Student.findById(targetId).populate('user').populate('college');
    if (!student) {
      student = await Student.findOne({ user: targetId }).populate('user').populate('college');
    }

    if (!student || !student.user) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const targetCollegeId = (student.college?._id || student.college)?.toString();
    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || !targetCollegeId || targetCollegeId !== collegeId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only approve students from your own college',
      });
    }

    const user = await User.findById(student.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Associated user account not found',
      });
    }

    user.isApproved = true;
    await user.save();

    sendAccountApprovedEmail({
      to: user.email,
      name: user.name,
      role: 'student',
      collegeName: student.college?.name,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Successfully approved student registration for ${user.name} (${student.enrollmentNo})`,
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject and delete a pending student account request (same-college TPO only)
 * @route   PUT /api/tpo/students/:id/reject
 * @access  Private (Approved TPO / Admin / Superadmin only)
 */
const rejectStudent = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    const targetId = req.params.id;

    let student = await Student.findById(targetId).populate('user').populate('college');
    if (!student) {
      student = await Student.findOne({ user: targetId }).populate('user').populate('college');
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const targetCollegeId = (student.college?._id || student.college)?.toString();
    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || !targetCollegeId || targetCollegeId !== collegeId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only reject students from your own college',
      });
    }

    const studentName = student.user?.name || 'Student';
    const studentEnrollment = student.enrollmentNo;
    const studentEmail = student.user?.email;
    const collegeName = student.college?.name;
    const userId = student.user?._id || student.user;

    if (studentEmail) {
      sendAccountRejectedEmail({
        to: studentEmail,
        name: studentName,
        role: 'student',
        collegeName,
      }).catch(() => {});
    }

    await Student.deleteOne({ _id: student._id });
    if (userId) {
      await User.deleteOne({ _id: userId });
    }

    res.status(200).json({
      success: true,
      message: `Successfully rejected and deleted pending student account for ${studentName} (${studentEnrollment})`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingTPOs,
  approveTPO,
  rejectTPO,
  getPendingStudents,
  approveStudent,
  rejectStudent,
};
