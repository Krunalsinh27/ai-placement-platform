const path = require('path');
const fs = require('fs');
const { Student, User } = require('../models');

/**
 * @desc    Get current student's profile
 * @route   GET /api/students/me
 * @access  Private (Student only)
 */
const getMyProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id })
      .populate('user', 'name email role')
      .populate('college');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    res.status(200).json({
      success: true,
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update current student's profile (supports multipart with resume upload or JSON)
 * @route   PUT /api/students/me
 * @access  Private (Student only)
 */
const updateMyProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const { name, phone, skills, cgpa, backlogs, branch, batchYear, resumeUrl } = req.body;

    // Optional: update name in User document
    if (name) {
      await User.findByIdAndUpdate(req.user._id, { name: name.trim() });
    }

    // Update student fields if provided
    if (phone !== undefined) student.phone = phone.trim();
    if (cgpa !== undefined) student.cgpa = Number(cgpa);
    if (backlogs !== undefined) student.backlogs = Number(backlogs);
    if (branch !== undefined) student.branch = branch.trim().toUpperCase();
    if (batchYear !== undefined) student.batchYear = Number(batchYear);
    if (req.body.sendReminderEmails !== undefined) {
      student.sendReminderEmails = req.body.sendReminderEmails === true || req.body.sendReminderEmails === 'true';
    }

    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        student.skills = skills;
      } else if (typeof skills === 'string') {
        student.skills = skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    // If file was uploaded via multer, update resumeUrl to the static path
    if (req.file) {
      // Remove old file if it was uploaded locally
      if (student.resumeUrl && student.resumeUrl.startsWith('/uploads/')) {
        const oldFilePath = path.join(__dirname, '..', student.resumeUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlink(oldFilePath, (err) => {
            if (err) console.error('Failed to delete old resume:', err);
          });
        }
      }
      student.resumeUrl = `/uploads/${req.file.filename}`;
    } else if (resumeUrl !== undefined) {
      student.resumeUrl = resumeUrl.trim();
    }

    await student.save();

    const updatedProfile = await Student.findOne({ user: req.user._id }).populate(
      'user',
      'name email role'
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      student: updatedProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload student resume PDF
 * @route   POST /api/students/resume
 * @access  Private (Student only)
 */
const uploadResume = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a PDF resume file',
      });
    }

    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Clean up previous file if locally stored
    if (student.resumeUrl && student.resumeUrl.startsWith('/uploads/')) {
      const oldFilePath = path.join(__dirname, '..', student.resumeUrl);
      if (fs.existsSync(oldFilePath)) {
        fs.unlink(oldFilePath, (err) => {
          if (err) console.error('Failed to delete old resume:', err);
        });
      }
    }

    student.resumeUrl = `/uploads/${req.file.filename}`;
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Resume uploaded successfully',
      resumeUrl: student.resumeUrl,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all students with search, filters & pagination
 * @route   GET /api/students
 * @access  Private (Admin only)
 */
const getStudents = async (req, res, next) => {
  try {
    const { search, branch, batchYear, page = 1, limit = 10 } = req.query;
    const query = {};

    // TPO College scoping
    if (req.user?.college) {
      const collegeId = req.user.college._id || req.user.college;
      query.college = collegeId;
    }

    // Branch filter
    if (branch) {
      query.branch = branch.trim().toUpperCase();
    }

    // Batch year filter
    if (batchYear) {
      query.batchYear = Number(batchYear);
    }

    // Search by student name or enrollment number
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      const userSearchQuery = {
        name: { $regex: searchTerm, $options: 'i' },
        role: 'student',
      };
      if (req.user?.college) {
        userSearchQuery.college = req.user.college._id || req.user.college;
      }
      const matchingUsers = await User.find(userSearchQuery).select('_id');

      const userIds = matchingUsers.map((u) => u._id);

      query.$or = [
        { enrollmentNo: { $regex: searchTerm, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .populate('user', 'name email role')
      .populate('college', 'name code city state')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      count: students.length,
      students,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single student by ID
 * @route   GET /api/students/:id
 * @access  Private (Admin only)
 */
const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('user', 'name email role')
      .populate('college', 'name code city state');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // College scoping check for TPO
    if (req.user?.college) {
      const tpoCollegeId = (req.user.college._id || req.user.college).toString();
      const studentCollegeId = (student.college?._id || student.college)?.toString();
      if (studentCollegeId && studentCollegeId !== tpoCollegeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view student from another college',
        });
      }
    }

    res.status(200).json({
      success: true,
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete student and their user account
 * @route   DELETE /api/students/:id
 * @access  Private (Admin only)
 */
const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // College scoping check for TPO
    if (req.user?.college) {
      const tpoCollegeId = (req.user.college._id || req.user.college).toString();
      const studentCollegeId = (student.college?._id || student.college)?.toString();
      if (studentCollegeId && studentCollegeId !== tpoCollegeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete student from another college',
        });
      }
    }

    // Clean up uploaded resume file if exists
    if (student.resumeUrl && student.resumeUrl.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', student.resumeUrl);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error('Failed to delete resume during student deletion:', err);
        });
      }
    }

    // Delete student record
    await Student.findByIdAndDelete(req.params.id);

    // Delete linked user record
    await User.findByIdAndDelete(student.user);

    res.status(200).json({
      success: true,
      message: 'Student and linked user account removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadResume,
  getStudents,
  getStudentById,
  deleteStudent,
};

