const { Application, Drive, Student, Placement } = require('../models');
const {
  notifyNewApplicant,
  notifyApplicationStatusChange,
} = require('../utils/notificationService');
const { getEndOfDayIST } = require('../utils/pipelineService');

/**
 * @desc    Apply to a placement drive
 * @route   POST /api/applications
 * @access  Private (Student only)
 */
const applyToDrive = async (req, res, next) => {
  try {
    const { driveId } = req.body;

    if (!driveId) {
      return res.status(400).json({
        success: false,
        message: 'Drive ID is required',
      });
    }

    // 1. Fetch student profile
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found. Please complete your registration.',
      });
    }

    // 2. Check configurable policy: block placed students if configured
    const blockPlaced = process.env.BLOCK_PLACED_STUDENTS === 'true';
    if (blockPlaced) {
      const existingPlacement = await Placement.findOne({ student: student._id });
      if (existingPlacement) {
        return res.status(400).json({
          success: false,
          message:
            'Application blocked: Campus placement policy restricts already placed students from applying to additional drives.',
        });
      }
    }

    // 3. Fetch drive details
    const drive = await Drive.findById(driveId);
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Placement drive not found',
      });
    }

    // 4. Verify drive status, deadline, and frozen application list
    const now = new Date();
    const deadlineEnd = getEndOfDayIST(drive.lastDateToApply);
    const isPastDeadline = deadlineEnd ? now > deadlineEnd : false;

    if (drive.applicationsClosed || isPastDeadline || drive.status === 'closed') {
      // Ensure drive is recorded as closed & frozen
      if (!drive.applicationsClosed || drive.status !== 'closed') {
        drive.status = 'closed';
        drive.applicationsClosed = true;
        if (!drive.listFrozenAt) drive.listFrozenAt = new Date();
        await drive.save();
      }
      return res.status(400).json({
        success: false,
        message:
          'Applications for this drive are closed and the candidate list is frozen. No new applications or withdrawals are permitted.',
      });
    }

    // 5. Check eligibility criteria: CGPA
    if (student.cgpa < drive.minCgpa) {
      return res.status(400).json({
        success: false,
        message: `Ineligible: Your CGPA (${student.cgpa}) is lower than the required minimum (${drive.minCgpa}).`,
      });
    }

    // 6. Check eligibility criteria: Backlogs
    if (student.backlogs > drive.maxBacklogs) {
      return res.status(400).json({
        success: false,
        message: `Ineligible: You have ${student.backlogs} backlog(s), which exceeds the maximum allowed limit (${drive.maxBacklogs}).`,
      });
    }

    // 7. Check eligibility criteria: Branch
    const studentBranch = student.branch.toUpperCase();
    const isBranchAllowed = drive.allowedBranches.some(
      (b) => b.toUpperCase() === studentBranch
    );
    if (!isBranchAllowed) {
      return res.status(400).json({
        success: false,
        message: `Ineligible: Your branch (${student.branch}) is not eligible for this drive. Allowed branches: ${drive.allowedBranches.join(', ')}.`,
      });
    }

    // 8. Prevent duplicate application
    const existingApplication = await Application.findOne({
      student: student._id,
      drive: drive._id,
    });
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an application for this drive.',
      });
    }

    // 9. Create Application
    const application = await Application.create({
      student: student._id,
      drive: drive._id,
      status: 'applied',
      appliedOn: new Date(),
    });

    const populatedApp = await Application.findById(application._id)
      .populate({
        path: 'drive',
        populate: { path: 'company' },
      })
      .populate('student');

    // Notify recruiter of new applicant
    await notifyNewApplicant({
      companyId: drive.company,
      applicantName: req.user.name,
      branch: student.branch,
      cgpa: student.cgpa,
      role: drive.role,
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: populatedApp,
    });
  } catch (error) {
    // Handle duplicate key error from MongoDB unique index
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an application for this drive.',
      });
    }
    next(error);
  }
};

/**
 * @desc    Get student's own applications with drive & company info
 * @route   GET /api/applications/my
 * @access  Private (Student only)
 */
const getMyApplications = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Application.countDocuments({ student: student._id });
    const applications = await Application.find({ student: student._id })
      .populate({
        path: 'drive',
        populate: { path: 'company' },
      })
      .sort({ appliedOn: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: applications,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: applications.length,
      applications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all applicants for a specific drive
 * @route   GET /api/applications/drive/:driveId
 * @access  Private (Admin only)
 */
const getDriveApplications = async (req, res, next) => {
  try {
    const { driveId } = req.params;

    const drive = await Drive.findById(driveId).populate('company');
    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found',
      });
    }

    const appQuery = { drive: driveId };
    if (req.user?.college) {
      const collegeId = req.user.college._id || req.user.college;
      const collegeStudents = await Student.find({ college: collegeId }).select('_id');
      appQuery.student = { $in: collegeStudents.map((s) => s._id) };
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Application.countDocuments(appQuery);
    const applications = await Application.find(appQuery)
      .populate({
        path: 'student',
        populate: [
          { path: 'user', select: 'name email role' },
          { path: 'college', select: 'name code' },
        ],
      })
      .sort({ appliedOn: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      drive,
      data: applications,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: applications.length,
      applications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update application status (Admin only)
 *          Automatically creates or deletes Placement record on status "selected"
 * @route   PUT /api/applications/:id/status
 * @access  Private (Admin only)
 */
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['applied', 'shortlisted', 'interview', 'selected', 'rejected'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
      });
    }

    const application = await Application.findById(req.params.id).populate('drive');
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    const oldStatus = application.status;
    application.status = status;
    await application.save();

    let placementRecord = null;

    // 1. If changed to 'selected', create Placement record
    if (status === 'selected' && oldStatus !== 'selected') {
      const existingPlacement = await Placement.findOne({
        student: application.student,
        drive: application.drive._id,
      });

      if (!existingPlacement) {
        placementRecord = await Placement.create({
          student: application.student,
          drive: application.drive._id,
          company: application.drive.company,
          packageLpa: application.drive.packageLpa,
          offerDate: new Date(),
        });
      } else {
        placementRecord = existingPlacement;
      }
    }

    // 2. If changed away from 'selected', remove corresponding Placement record
    if (oldStatus === 'selected' && status !== 'selected') {
      await Placement.findOneAndDelete({
        student: application.student,
        drive: application.drive._id,
      });
    }

    const updatedApplication = await Application.findById(application._id)
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate({
        path: 'drive',
        populate: { path: 'company' },
      });

    // Notify student on status change or interview schedule
    if (updatedApplication.student?.user?._id) {
      await notifyApplicationStatusChange({
        studentUserId: updatedApplication.student.user._id,
        companyName: updatedApplication.drive?.company?.name,
        role: updatedApplication.drive?.role,
        status,
      });
    }

    res.status(200).json({
      success: true,
      message: `Application status updated from '${oldStatus}' to '${status}'`,
      application: updatedApplication,
      placement: placementRecord,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyToDrive,
  getMyApplications,
  getDriveApplications,
  updateApplicationStatus,
};

