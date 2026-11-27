const crypto = require('crypto');
const { Application, Drive, Student, Placement, Resume, ResumeVersion, CoverLetter } = require('../models');
const {
  notifyNewApplicant,
  notifyApplicationStatusChange,
} = require('../utils/notificationService');
const { getEndOfDayIST } = require('../utils/pipelineService');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { sanitizeSpreadsheetValue, escapeCsvCell } = require('../utils/spreadsheet');
const { formatIST } = require('../utils/dateTime');

/**
 * @desc    Apply to a placement drive
 * @route   POST /api/applications
 * @access  Private (Student only)
 */
const applyToDrive = async (req, res, next) => {
  try {
    const { driveId, resumeId, versionId } = req.body;

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

    // Check college eligibility: Drive must include student's college
    const driveCollegeIds = drive.getAllCollegeIds ? drive.getAllCollegeIds() : Drive.getDriveCollegeIds(drive);
    const studentCollegeId = (student.college?._id || student.college)?.toString();
    if (!studentCollegeId || !driveCollegeIds.includes(studentCollegeId)) {
      return res.status(403).json({
        success: false,
        message: 'Ineligible: This placement drive is not open to students of your college.',
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

    // 8.5 Resolve Resume & ResumeVersion for snapshot (Server-side snapshot construction)
    let selectedResume = null;
    let selectedVersion = null;
    let resumeSnapshot = null;
    let appliedVersionId = null;

    if (resumeId) {
      selectedResume = await Resume.findOne({
        _id: resumeId,
        student: student._id,
        archived: false,
      });
      if (!selectedResume) {
        return res.status(404).json({
          success: false,
          message: 'Selected resume not found or does not belong to your account',
        });
      }
      if (versionId) {
        selectedVersion = await ResumeVersion.findOne({
          _id: versionId,
          resume: selectedResume._id,
          student: student._id,
        });
        if (!selectedVersion) {
          return res.status(404).json({
            success: false,
            message: 'Selected resume version not found',
          });
        }
      } else {
        selectedVersion = await ResumeVersion.findOne({
          resume: selectedResume._id,
          student: student._id,
        }).sort({ createdAt: -1 });
      }
    } else {
      // Default: the student's primary resume's latest version
      selectedResume = await Resume.findOne({
        student: student._id,
        isPrimary: true,
        archived: false,
      });
      if (selectedResume) {
        selectedVersion = await ResumeVersion.findOne({
          resume: selectedResume._id,
          student: student._id,
        }).sort({ createdAt: -1 });
      }
    }

    let resolvedCoverLetter = null;
    if (typeof req.body.coverLetter === 'string' && req.body.coverLetter.trim()) {
      resolvedCoverLetter = req.body.coverLetter.trim();
    } else if (req.body.coverLetterId) {
      const clDoc = await CoverLetter.findOne({
        _id: req.body.coverLetterId,
        student: student._id,
      });
      if (clDoc && clDoc.content) {
        resolvedCoverLetter = clDoc.content.trim();
      }
    } else if (selectedVersion?.coverLetter && selectedVersion.coverLetter.trim()) {
      resolvedCoverLetter = selectedVersion.coverLetter.trim();
    }

    if (selectedResume) {
      const snapshotData = selectedVersion?.resumeData || selectedResume.data || {};
      const snapshotTemplate = selectedVersion?.templateId || selectedResume.templateId || 'modern';
      // Server-side deterministic contentHash computed strictly from snapshotData
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(snapshotData))
        .digest('hex');

      resumeSnapshot = {
        resumeId: selectedResume._id,
        versionId: selectedVersion?._id || null,
        contentHash,
        data: snapshotData,
        templateId: snapshotTemplate,
        coverLetter: resolvedCoverLetter,
        createdAt: new Date(),
      };
      appliedVersionId = selectedVersion?._id || null;
    }

    // 9. Create Application FIRST - if this fails (e.g. duplicate key), version is never marked submitted
    const application = await Application.create({
      student: student._id,
      drive: drive._id,
      status: 'applied',
      appliedOn: new Date(),
      resumeVersion: appliedVersionId,
      resumeSnapshot,
    });

    // 10. Only mark version as submitted AFTER Application is created successfully
    if (selectedVersion) {
      selectedVersion.submitted = true;
      if (!selectedVersion.targetDrive) {
        selectedVersion.targetDrive = drive._id;
      }
      if (!selectedVersion.contentHash && resumeSnapshot?.contentHash) {
        selectedVersion.contentHash = resumeSnapshot.contentHash;
      }
      await selectedVersion.save();
    }

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

    if (req.user.role !== 'superadmin') {
      if (req.user.role === 'recruiter') {
        const userCompanyId = (req.user.company?._id || req.user.company)?.toString();
        const driveCompanyId = (drive.company?._id || drive.company)?.toString();
        if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to view applications for another company drive',
          });
        }
      } else {
        const driveCollegeIds = drive.getAllCollegeIds ? drive.getAllCollegeIds() : Drive.getDriveCollegeIds(drive);
        const userCollegeId = (req.user.college?._id || req.user.college)?.toString();
        if (!userCollegeId || !driveCollegeIds.includes(userCollegeId)) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to view applications for another college drive',
          });
        }
      }
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
    const applicationDocs = await Application.find(appQuery)
      .populate({
        path: 'student',
        select: 'user college branch batchYear phone skills enrollmentNo cgpa backlogs placementStatus resumeUrl createdAt updatedAt',
        populate: [
          { path: 'user', select: 'name email role' },
          { path: 'college', select: 'name code' },
        ],
      })
      .sort({ appliedOn: -1 })
      .skip(skip)
      .limit(limitNum);

    // Gate resumeUrl for recruiters: if an application has a snapshot, strip student's live resumeUrl
    // so recruiters cannot bypass the snapshot to reach the live resume. Keep legacy applications working.
    const applications = applicationDocs.map((doc) => {
      const app = doc.toObject ? doc.toObject() : { ...doc };
      if (req.user?.role === 'recruiter' && app.resumeSnapshot?.data) {
        if (app.student) {
          delete app.student.resumeUrl;
        }
      }
      return app;
    });

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

    if (req.user.role !== 'superadmin') {
      const driveCollegeIds = application.drive.getAllCollegeIds ? application.drive.getAllCollegeIds() : Drive.getDriveCollegeIds(application.drive);
      const userCollegeId = (req.user.college?._id || req.user.college)?.toString();
      if (!userCollegeId || !driveCollegeIds.includes(userCollegeId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update application status for another college',
        });
      }
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

/**
 * Helper to verify scoped authorization for reading application resume snapshots
 * - Owner student
 * - TPO / Admin of the SAME college
 * - Recruiter ONLY for drives they own
 * - Superadmin
 */
function verifySnapshotAccess(user, application) {
  if (!user || !application) return false;
  if (user.role === 'superadmin') return true;

  const appStudentUserId = (application.student?.user?._id || application.student?.user)?.toString();
  const appStudentCollegeId = (application.student?.college?._id || application.student?.college)?.toString();
  const driveCompanyId = (application.drive?.company?._id || application.drive?.company)?.toString();

  const userId = user._id?.toString();
  const userCollegeId = (user.college?._id || user.college)?.toString();
  const userCompanyId = (user.company?._id || user.company)?.toString();

  if (user.role === 'student') {
    return userId === appStudentUserId;
  }

  if (user.role === 'admin' || user.role === 'tpo') {
    return Boolean(userCollegeId && appStudentCollegeId && userCollegeId === appStudentCollegeId);
  }

  if (user.role === 'recruiter') {
    return Boolean(userCompanyId && driveCompanyId && userCompanyId === driveCompanyId);
  }

  return false;
}

/**
 * @desc    Get scoped resume snapshot for an application
 * @route   GET /api/applications/:id/resume-snapshot
 * @access  Private (Owner student, TPO/admin of same college, Recruiter for own drive, Superadmin)
 */
const getApplicationResumeSnapshot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id)
      .populate({
        path: 'student',
        select: 'user college branch enrollmentNo cgpa backlogs placementStatus resumeUrl',
        populate: [
          { path: 'user', select: '_id name email role' },
          { path: 'college', select: '_id name code' },
        ],
      })
      .populate({
        path: 'drive',
        select: '_id role company allowedBranches status',
        populate: { path: 'company', select: '_id name' },
      });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    if (!verifySnapshotAccess(req.user, application)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application resume snapshot',
      });
    }

    if (!application.resumeSnapshot || !application.resumeSnapshot.data) {
      return res.status(404).json({
        success: false,
        message: 'No resume snapshot found for this application (legacy application)',
      });
    }

    res.status(200).json({
      success: true,
      snapshot: application.resumeSnapshot,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export on-demand ATS PDF for an application's resume snapshot
 * @route   GET /api/applications/:id/resume-snapshot/pdf
 * @access  Private (Owner student, TPO/admin of same college, Recruiter for own drive, Superadmin)
 */
const exportApplicationSnapshotPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id)
      .populate({
        path: 'student',
        select: 'user college branch enrollmentNo cgpa backlogs placementStatus resumeUrl',
        populate: [
          { path: 'user', select: '_id name email role' },
          { path: 'college', select: '_id name code' },
        ],
      })
      .populate({
        path: 'drive',
        select: '_id role company allowedBranches status',
        populate: { path: 'company', select: '_id name' },
      });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    if (!verifySnapshotAccess(req.user, application)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application resume snapshot',
      });
    }

    if (!application.resumeSnapshot || !application.resumeSnapshot.data) {
      return res.status(404).json({
        success: false,
        message: 'No resume snapshot found for this application (legacy application)',
      });
    }

    const snapshot = application.resumeSnapshot;
    const candidateName =
      snapshot.data?.contact?.fullName || application.student?.user?.name || 'Candidate';
    const safeFileName = `${candidateName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')}_Application_Resume.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      generateResumePdf(snapshot.data || {}, snapshot.templateId || 'modern', res);
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Internal helper to resolve authorized drive and scoped applications for export.
 * Enforces strict college isolation for TPO/Admin: a TPO can ONLY view and export
 * students enrolled in their own college.
 */
async function getScopedDriveApplicationsForExport(req, driveId) {
  const drive = await Drive.findById(driveId).populate('company college colleges');
  if (!drive) {
    const error = new Error('Drive not found');
    error.statusCode = 404;
    throw error;
  }

  const appQuery = { drive: driveId };

  // Authorization & Tenancy Isolation
  if (req.user.role === 'tpo' || req.user.role === 'admin') {
    const driveCollegeIds = drive.getAllCollegeIds ? drive.getAllCollegeIds() : Drive.getDriveCollegeIds(drive);
    const userCollegeId = (req.user.college?._id || req.user.college)?.toString();
    if (!userCollegeId || !driveCollegeIds.includes(userCollegeId)) {
      const error = new Error('Not authorized to access applications for another college drive');
      error.statusCode = 403;
      throw error;
    }

    // STRICT COLLEGE ISOLATION: Must only fetch students from this TPO's college!
    const collegeStudents = await Student.find({ college: userCollegeId }).select('_id');
    appQuery.student = { $in: collegeStudents.map((s) => s._id) };
  } else if (req.user.role === 'recruiter') {
    const userCompanyId = (req.user.company?._id || req.user.company)?.toString();
    const driveCompanyId = (drive.company?._id || drive.company)?.toString();
    if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
      const error = new Error('Not authorized to access applications for another company drive');
      error.statusCode = 403;
      throw error;
    }
  } else if (req.user.role !== 'superadmin') {
    const error = new Error('Not authorized to export drive applications');
    error.statusCode = 403;
    throw error;
  }

  // Superadmin optional college filter
  if (req.user.role === 'superadmin' && req.query.collegeId && req.query.collegeId !== 'all') {
    const collegeStudents = await Student.find({ college: req.query.collegeId }).select('_id');
    appQuery.student = { $in: collegeStudents.map((s) => s._id) };
  }

  // Optional status filter
  if (req.query.status && req.query.status !== 'all') {
    appQuery.status = req.query.status;
  }

  const applications = await Application.find(appQuery)
    .populate({
      path: 'student',
      populate: [
        { path: 'user', select: 'name email phone' },
        { path: 'college', select: 'name code city state' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  return { drive, applications };
}

/**
 * @desc    Export drive applicants as CSV with formula injection protection
 * @route   GET /api/applications/drive/:driveId/export/csv
 * @access  Private (TPO, Admin, Superadmin, Recruiter)
 */
const exportDriveApplicationsCsv = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const { drive, applications } = await getScopedDriveApplicationsForExport(req, driveId);

    const safeRole = (drive.role || 'Drive').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `applications_${safeRole}_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const header = [
      '#',
      'Candidate Name',
      'Email',
      'Phone',
      'Enrollment No',
      'College Name',
      'Branch',
      'Batch Year',
      'CGPA',
      'Backlogs',
      'Placement Status',
      'Application Status',
      'Applied Date',
    ];

    const rows = applications.map((app, index) => {
      const st = app.student || {};
      const u = st.user || {};
      const col = st.college || {};

      return [
        escapeCsvCell(index + 1),
        escapeCsvCell(u.name || 'Candidate'),
        escapeCsvCell(u.email || ''),
        escapeCsvCell(u.phone || st.phone || ''),
        escapeCsvCell(st.enrollmentNo || ''),
        escapeCsvCell(col.name || ''),
        escapeCsvCell(st.branch || ''),
        escapeCsvCell(st.batchYear || ''),
        escapeCsvCell(st.cgpa ?? ''),
        escapeCsvCell(st.backlogs ?? 0),
        escapeCsvCell(st.placementStatus || 'unplaced'),
        escapeCsvCell(app.status || 'applied'),
        escapeCsvCell(formatIST(app.createdAt)),
      ];
    });

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    return res.status(200).send(csvContent);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Export drive applicants as formatted Excel (.xlsx) with formula injection protection
 * @route   GET /api/applications/drive/:driveId/export/excel
 * @access  Private (TPO, Admin, Superadmin, Recruiter)
 */
const exportDriveApplicationsExcel = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const { drive, applications } = await getScopedDriveApplicationsForExport(req, driveId);

    const safeRole = (drive.role || 'Drive').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `applications_${safeRole}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Placement Platform';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Applicants');
    sheet.columns = [
      { header: '#', key: 'sr', width: 6 },
      { header: 'Candidate Name', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Enrollment No', key: 'enrollmentNo', width: 18 },
      { header: 'College', key: 'college', width: 30 },
      { header: 'Branch', key: 'branch', width: 24 },
      { header: 'Batch Year', key: 'batchYear', width: 12 },
      { header: 'CGPA', key: 'cgpa', width: 10 },
      { header: 'Backlogs', key: 'backlogs', width: 10 },
      { header: 'Placement Status', key: 'placementStatus', width: 18 },
      { header: 'Application Status', key: 'status', width: 18 },
      { header: 'Applied Date', key: 'appliedDate', width: 22 },
    ];

    // Header styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    applications.forEach((app, index) => {
      const st = app.student || {};
      const u = st.user || {};
      const col = st.college || {};

      const row = sheet.addRow({
        sr: index + 1,
        name: sanitizeSpreadsheetValue(u.name || 'Candidate'),
        email: sanitizeSpreadsheetValue(u.email || ''),
        phone: sanitizeSpreadsheetValue(u.phone || st.phone || ''),
        enrollmentNo: sanitizeSpreadsheetValue(st.enrollmentNo || ''),
        college: sanitizeSpreadsheetValue(col.name || ''),
        branch: sanitizeSpreadsheetValue(st.branch || ''),
        batchYear: typeof st.batchYear === 'number' ? st.batchYear : sanitizeSpreadsheetValue(st.batchYear || ''),
        cgpa: typeof st.cgpa === 'number' ? st.cgpa : (st.cgpa ? sanitizeSpreadsheetValue(st.cgpa) : ''),
        backlogs: typeof st.backlogs === 'number' ? st.backlogs : (st.backlogs ? sanitizeSpreadsheetValue(st.backlogs) : 0),
        placementStatus: sanitizeSpreadsheetValue(st.placementStatus || 'unplaced'),
        status: sanitizeSpreadsheetValue(app.status || 'applied'),
        appliedDate: sanitizeSpreadsheetValue(formatIST(app.createdAt)),
      });

      // Alternating row background
      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Export drive applicants as print-friendly A4 PDF with college branding
 * @route   GET /api/applications/drive/:driveId/export/pdf
 * @access  Private (TPO, Admin, Superadmin, Recruiter)
 */
const exportDriveApplicationsPdf = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const { drive, applications } = await getScopedDriveApplicationsForExport(req, driveId);

    const safeRole = (drive.role || 'Drive').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `applicants_${safeRole}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true, compress: false });
    doc.pipe(res);

    // Resolve header college title (if TPO, user's college; otherwise primary college or company)
    const collegeTitle = req.user?.college?.name || drive.college?.name || 'CAMPUS PLACEMENT DRIVE';

    // Header Title
    doc.fillColor('#0f172a').fontSize(15).font('Helvetica-Bold').text(collegeTitle.toUpperCase(), { align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#4338ca').text('DRIVE APPLICANT ROSTER', { align: 'center' });
    doc.moveDown(0.4);

    // Metadata Box
    const boxY = doc.y;
    doc.rect(36, boxY, 522, 54).fillAndStroke('#f8fafc', '#cbd5e1');
    const metaY = boxY + 6;
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold');
    doc.text(`Company: ${drive.company?.name || 'N/A'}`, 44, metaY);
    doc.text(`Role: ${drive.role || 'N/A'}`, 44, metaY + 14);
    doc.text(`Package: ${drive.packageLpa != null && !isNaN(drive.packageLpa) ? `${drive.packageLpa} LPA` : '—'}`, 44, metaY + 28);

    doc.text(`Drive Date: ${drive.driveDate ? formatIST(drive.driveDate, { dateOnly: true }) : 'TBD'}`, 300, metaY);
    doc.text(`Generated: ${formatIST(new Date())}`, 300, metaY + 14);
    doc.text(`Total Applicants in Report: ${applications.length}`, 300, metaY + 28);

    doc.y = boxY + 62;

    // Table Header
    const colX = {
      sr: 40,
      roll: 60,
      name: 140,
      branch: 260,
      cgpa: 360,
      status: 405,
      date: 460,
    };

    const drawTableHeader = (y) => {
      doc.rect(36, y, 522, 18).fillAndStroke('#e2e8f0', '#94a3b8');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#', colX.sr, y + 5);
      doc.text('Roll / Enrollment', colX.roll, y + 5);
      doc.text('Candidate Name', colX.name, y + 5);
      doc.text('Branch', colX.branch, y + 5);
      doc.text('CGPA', colX.cgpa, y + 5);
      doc.text('Status', colX.status, y + 5);
      doc.text('Applied Date', colX.date, y + 5);
    };

    let curY = doc.y;
    drawTableHeader(curY);
    curY += 18;

    applications.forEach((app, idx) => {
      if (curY > 740) {
        doc.addPage();
        curY = 36;
        drawTableHeader(curY);
        curY += 18;
      }

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(36, curY, 522, 20).fillAndStroke(rowBg, '#e2e8f0');

      const st = app.student || {};
      const u = st.user || {};

      doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
      doc.text(String(idx + 1), colX.sr, curY + 6);
      doc.text(st.enrollmentNo || '—', colX.roll, curY + 6);
      doc.text(u.name || 'Candidate', colX.name, curY + 6);
      doc.text(st.branch || '—', colX.branch, curY + 6);
      doc.text(st.cgpa != null ? String(st.cgpa) : '—', colX.cgpa, curY + 6);

      // Status pill
      const statusText = (app.status || 'applied').toUpperCase();
      let statusColor = '#334155';
      if (app.status === 'selected') statusColor = '#059669';
      else if (app.status === 'rejected') statusColor = '#e11d48';
      else if (app.status === 'interview') statusColor = '#d97706';
      else if (app.status === 'shortlisted') statusColor = '#4f46e5';

      doc.font('Helvetica-Bold').fillColor(statusColor);
      doc.text(statusText, colX.status, curY + 6);

      doc.font('Helvetica').fillColor('#64748b');
      doc.text(formatIST(app.createdAt, { dateOnly: true }), colX.date, curY + 6);

      curY += 20;
    });

    // Page Numbering Footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8');
      doc.text(`Page ${i + 1} of ${range.count}`, 36, 792 - 25, {
        align: 'center',
        width: 522,
      });
    }

    doc.end();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  applyToDrive,
  getMyApplications,
  getDriveApplications,
  updateApplicationStatus,
  getApplicationResumeSnapshot,
  exportApplicationSnapshotPdf,
  exportDriveApplicationsCsv,
  exportDriveApplicationsExcel,
  exportDriveApplicationsPdf,
};

