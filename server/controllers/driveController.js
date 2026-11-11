const mongoose = require('mongoose');
const { Drive, Company, Student, Application } = require('../models');
const { notifyDrivePublished } = require('../utils/notificationService');
const { getEndOfDayIST } = require('../utils/pipelineService');
const { parseISTDateTime } = require('../utils/dateTime');

/**
 * Helper to automatically close drives whose application deadline has passed & initialize pipeline
 * Auto-freeze strictly occurs when the current time is after the end of the deadline day in IST.
 */
const autoCloseExpiredDrives = async () => {
  try {
    const now = new Date();
    const candidateDrives = await Drive.find({
      $or: [
        { status: 'open' },
        { applicationsClosed: false },
      ],
    });

    for (const d of candidateDrives) {
      const deadlineEnd = getEndOfDayIST(d.lastDateToApply);
      if (deadlineEnd && now > deadlineEnd) {
        d.status = 'closed';
        d.applicationsClosed = true;
        if (!d.listFrozenAt) d.listFrozenAt = now;
        await d.save();

        // Initialize rounds and populate Round 1
        try {
          const { initializeDriveRoundsAndRound1 } = require('../utils/pipelineService');
          await initializeDriveRoundsAndRound1(d._id);
        } catch (pipeErr) {
          console.error(`Pipeline init error for drive ${d._id}:`, pipeErr.message);
        }
      }
    }
  } catch (error) {
    console.error('Error auto-closing expired drives:', error.message);
  }
};

/**
 * @desc    Create a new placement drive
 * @route   POST /api/drives
 * @access  Private (Admin only)
 */
const createDrive = async (req, res, next) => {
  try {
    const {
      company,
      role,
      packageLpa,
      location,
      minCgpa,
      maxBacklogs,
      allowedBranches,
      lastDateToApply,
      driveDate,
      status,
      requiredSkills,
      preferredSkills,
      colleges,
    } = req.body;

    // Validate company existence
    if (!company) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }

    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(404).json({
        success: false,
        message: 'Referenced company does not exist',
      });
    }

    // Process allowedBranches
    let branches = [];
    if (Array.isArray(allowedBranches)) {
      branches = allowedBranches.map((b) => b.trim().toUpperCase());
    } else if (typeof allowedBranches === 'string') {
      branches = allowedBranches
        .split(',')
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);
    }

    if (branches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one allowed branch is required',
      });
    }

    const applyDeadline = getEndOfDayIST(lastDateToApply);
    const isPastDeadline = applyDeadline ? new Date() > applyDeadline : false;
    const driveStatus = isPastDeadline ? 'closed' : status || 'open';

    const collegeId = req.user.college?._id || req.user.college;

    const { sanitizeSkillList } = require('../services/ai');

    const drive = await Drive.create({
      college: collegeId,
      colleges: Array.isArray(colleges) && colleges.length > 0 ? colleges : (collegeId ? [collegeId] : []),
      company,
      role: role.trim(),
      packageLpa: Number(packageLpa),
      location: location.trim(),
      minCgpa: minCgpa !== undefined ? Number(minCgpa) : 0,
      maxBacklogs: maxBacklogs !== undefined ? Number(maxBacklogs) : 0,
      requiredSkills: sanitizeSkillList(requiredSkills, 50),
      preferredSkills: sanitizeSkillList(preferredSkills, 50),
      allowedBranches: branches,
      lastDateToApply: applyDeadline,
      driveDate: parseISTDateTime(driveDate),
      status: driveStatus,
      applicationsClosed: isPastDeadline,
      listFrozenAt: isPastDeadline ? new Date() : null,
    });

    const populatedDrive = await Drive.findById(drive._id).populate('company');

    // Notify eligible students if drive is open
    if (populatedDrive.status === 'open') {
      await notifyDrivePublished(populatedDrive);
    }

    res.status(201).json({
      success: true,
      message: 'Drive created successfully',
      drive: populatedDrive,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all drives (supports company & status filters; students only see open drives)
 * @route   GET /api/drives
 * @access  Private (Admin and Student)
 */
const getDrives = async (req, res, next) => {
  try {
    // 1. Automatically close any expired drives
    await autoCloseExpiredDrives();

    const { company, status, search } = req.query;
    const query = {};

    // College-based scoping for multi-tenant isolation
    if (req.user.role === 'tpo' || req.user.role === 'admin') {
      const collegeId = req.user.college?._id || req.user.college;
      if (collegeId) {
        query.college = collegeId;
      }
    } else if (req.user.role === 'student') {
      // Students only see open drives from their own college
      query.status = 'open';
      const studentCollegeId = req.user.college?._id || req.user.college;
      if (studentCollegeId) {
        query.college = studentCollegeId;
      }
    } else if (req.user.role === 'recruiter') {
      // Recruiters only see drives belonging to their own company
      const companyId = req.user.company?._id || req.user.company;
      if (companyId) {
        query.company = companyId;
      }
    } else if (status) {
      // Superadmins can filter by specific status
      query.status = status;
    }

    // Filter by company
    if (company && req.user.role !== 'recruiter') {
      if (mongoose.Types.ObjectId.isValid(company)) {
        query.company = company;
      } else {
        // Search company by name
        const matchingCompanies = await Company.find({
          name: { $regex: company.trim(), $options: 'i' },
        }).select('_id');
        query.company = { $in: matchingCompanies.map((c) => c._id) };
      }
    }

    // Search by role or location
    if (search && search.trim() !== '') {
      query.$or = [
        { role: { $regex: search.trim(), $options: 'i' } },
        { location: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Drive.countDocuments(query);
    const drives = await Drive.find(query)
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('jobRequirement', 'title packageLpa selectionRounds')
      .sort({ driveDate: 1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: drives,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: drives.length,
      drives,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get drives the logged-in student is eligible for
 * @route   GET /api/drives/eligible
 * @access  Private (Student only)
 */
const getEligibleDrives = async (req, res, next) => {
  try {
    // 1. Auto-close expired drives
    await autoCloseExpiredDrives();

    // 2. Fetch student profile
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const now = new Date();

    // Eligibility criteria:
    // - college matches student's college
    // - status is 'open'
    // - lastDateToApply >= now
    // - minCgpa <= student.cgpa
    // - maxBacklogs >= student.backlogs
    // - student.branch is in drive's allowedBranches
    const studentCollegeId =
      student.college?._id || student.college || req.user.college?._id || req.user.college;

    const eligibleQuery = {
      minCgpa: { $lte: student.cgpa },
      maxBacklogs: { $gte: student.backlogs },
      allowedBranches: student.branch.toUpperCase(),
    };

    if (studentCollegeId) {
      eligibleQuery.$or = [
        { college: studentCollegeId },
        { colleges: studentCollegeId },
      ];
    }

    const drives = await Drive.find(eligibleQuery)
      .populate('company')
      .sort({ lastDateToApply: 1 });

    const { computeMatchScore } = require('../services/ai');

    // Return matching drives whose deadline hasn't passed in IST, with applicationsClosed flag and match analysis
    const eligibleDrives = drives
      .filter((d) => {
        const deadlineEnd = getEndOfDayIST(d.lastDateToApply);
        return deadlineEnd && deadlineEnd >= now;
      })
      .map((d) => {
        const obj = d.toObject();
        obj.applicationsClosed = Boolean(d.applicationsClosed);
        try {
          obj.match = computeMatchScore(student, d);
        } catch (_) {
          obj.match = null;
        }
        return obj;
      });

    const total = eligibleDrives.length;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const paginatedDrives = eligibleDrives.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.status(200).json({
      success: true,
      data: paginatedDrives,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: paginatedDrives.length,
      studentCriteria: {
        cgpa: student.cgpa,
        backlogs: student.backlogs,
        branch: student.branch,
      },
      drives: paginatedDrives,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single drive by ID
 * @route   GET /api/drives/:id
 * @access  Private (Admin and Student)
 */
const getDriveById = async (req, res, next) => {
  try {
    await autoCloseExpiredDrives();

    const drive = await Drive.findById(req.params.id).populate('company');

    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found',
      });
    }

    res.status(200).json({
      success: true,
      drive,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update drive details
 * @route   PUT /api/drives/:id
 * @access  Private (Admin only)
 */
const updateDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);

    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found',
      });
    }

    const {
      company,
      role,
      packageLpa,
      location,
      minCgpa,
      maxBacklogs,
      allowedBranches,
      lastDateToApply,
      driveDate,
      status,
      requiredSkills,
      preferredSkills,
      colleges,
    } = req.body;

    if (company) {
      const companyExists = await Company.findById(company);
      if (!companyExists) {
        return res.status(404).json({
          success: false,
          message: 'Referenced company does not exist',
        });
      }
      drive.company = company;
    }

    if (role !== undefined) drive.role = role.trim();
    if (packageLpa !== undefined) drive.packageLpa = Number(packageLpa);
    if (location !== undefined) drive.location = location.trim();
    if (minCgpa !== undefined) drive.minCgpa = Number(minCgpa);
    if (maxBacklogs !== undefined) drive.maxBacklogs = Number(maxBacklogs);

    if (requiredSkills !== undefined) {
      const { sanitizeSkillList } = require('../services/ai');
      drive.requiredSkills = sanitizeSkillList(requiredSkills, 50);
    }
    if (preferredSkills !== undefined) {
      const { sanitizeSkillList } = require('../services/ai');
      drive.preferredSkills = sanitizeSkillList(preferredSkills, 50);
    }
    if (Array.isArray(colleges)) {
      drive.colleges = colleges;
    }

    if (allowedBranches !== undefined) {
      if (Array.isArray(allowedBranches)) {
        drive.allowedBranches = allowedBranches.map((b) => b.trim().toUpperCase());
      } else if (typeof allowedBranches === 'string') {
        drive.allowedBranches = allowedBranches
          .split(',')
          .map((b) => b.trim().toUpperCase())
          .filter(Boolean);
      }
    }

    if (lastDateToApply !== undefined) {
      drive.lastDateToApply = getEndOfDayIST(lastDateToApply);
      // Auto-set closed if date has passed
      if (new Date() > drive.lastDateToApply) {
        drive.status = 'closed';
        drive.applicationsClosed = true;
        if (!drive.listFrozenAt) drive.listFrozenAt = new Date();
      }
    }

    if (driveDate !== undefined) drive.driveDate = parseISTDateTime(driveDate);

    // If explicit status passed and not expired
    if (status !== undefined) {
      if (status === 'open' && new Date() > drive.lastDateToApply) {
        return res.status(400).json({
          success: false,
          message: 'Cannot open a drive whose last date to apply has already passed',
        });
      }
      drive.status = status;
    }

    await drive.save();

    const updatedDrive = await Drive.findById(drive._id).populate('company');

    res.status(200).json({
      success: true,
      message: 'Drive updated successfully',
      drive: updatedDrive,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    TPO reopens applications for a closed/frozen drive
 * @route   PUT /api/drives/:id/reopen
 * @access  Private (TPO, Admin, Superadmin)
 */
const reopenDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Placement drive not found' });
    }

    // Authorization: Superadmin or same college TPO
    if (req.user.role !== 'superadmin') {
      const userCollegeId = (req.user.college?._id || req.user.college)?.toString();
      const driveCollegeId = (drive.college?._id || drive.college)?.toString();
      if (!userCollegeId || !driveCollegeId || userCollegeId !== driveCollegeId) {
        return res.status(403).json({ success: false, message: 'Not authorized to manage drives for another college' });
      }
    }

    // 1. Check if deadline has already passed (end of day in IST)
    const deadlineEnd = getEndOfDayIST(drive.lastDateToApply);
    if (deadlineEnd && new Date() > deadlineEnd) {
      return res.status(400).json({
        success: false,
        message: `Cannot reopen applications: The application deadline (${new Date(drive.lastDateToApply).toLocaleDateString()}) has already passed.`,
      });
    }

    // 2. Check if any round has started
    const { Round, RoundBatch, RoundParticipant } = require('../models');
    const rounds = await Round.find({ drive: drive._id });

    const roundIds = rounds.map((r) => r._id);
    const roundStarted = rounds.some(
      (r) => r.status === 'ongoing' || r.status === 'completed' || r.resultsPublished === true
    );

    const participantActionRecorded = await RoundParticipant.findOne({
      round: { $in: roundIds },
      $or: [
        { attendance: { $in: ['present', 'absent'] } },
        { result: { $in: ['cleared', 'rejected'] } },
      ],
    });

    if (roundStarted || participantActionRecorded) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reopen applications: Recruitment rounds have already begun for this drive.',
      });
    }

    // 3. Reopen applications
    drive.applicationsClosed = false;
    drive.listFrozenAt = null;
    drive.status = 'open';
    await drive.save();

    // Clean up unstarted rounds, batches, and participants so pipeline re-initializes cleanly on next freeze
    if (roundIds.length > 0) {
      await RoundBatch.deleteMany({ round: { $in: roundIds } });
      await RoundParticipant.deleteMany({ round: { $in: roundIds } });
      await Round.deleteMany({ drive: drive._id });
    }

    const populated = await Drive.findById(drive._id).populate('company');

    res.status(200).json({
      success: true,
      message: 'Applications reopened successfully. Students can now apply until the deadline.',
      drive: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete drive
 * @route   DELETE /api/drives/:id
 * @access  Private (Admin only)
 */
const deleteDrive = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);

    if (!drive) {
      return res.status(404).json({
        success: false,
        message: 'Drive not found',
      });
    }

    // Delete associated applications
    await Application.deleteMany({ drive: drive._id });

    // Delete drive
    await Drive.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Drive and its associated applications deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDrive,
  getDrives,
  getEligibleDrives,
  getDriveById,
  updateDrive,
  deleteDrive,
  autoCloseExpiredDrives,
  reopenDrive,
};

