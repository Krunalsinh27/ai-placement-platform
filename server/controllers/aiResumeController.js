/**
 * Controller for AI Resume Parsing, Skill Matching, and Candidate Ranking
 */

const mongoose = require('mongoose');
const { Student, Drive, Application, User, College } = require('../models');
const {
  parseStudentResume,
  computeMatchScore,
  generateApplicantExplanation,
  normalizeSkill,
  normalizeSkillList,
  sanitizeSkillList,
} = require('../services/ai');

/**
 * Helper to extract college IDs associated with a drive (multi-college support)
 */
function getDriveCollegeIds(drive) {
  if (!drive) return [];
  const ids = new Set();
  if (drive.college) {
    ids.add((drive.college._id || drive.college).toString());
  }
  if (Array.isArray(drive.colleges)) {
    for (const c of drive.colleges) {
      if (c) ids.add((c._id || c).toString());
    }
  }
  return Array.from(ids);
}

/**
 * @desc    Parse student's uploaded resume with AI & schema validation
 * @route   POST /api/students/me/resume/parse
 * @access  Private (Student only)
 */
const parseResume = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    if (!student.resumeUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a resume first before analyzing it',
      });
    }

    const parseResult = await parseStudentResume(student);

    if (parseResult.status === 'failed') {
      return res.status(400).json({
        success: false,
        status: 'failed',
        message: parseResult.error || 'Failed to parse resume document',
        resumeProfile: student.resumeProfile,
      });
    }

    if (parseResult.status === 'rate_limited') {
      return res.status(429).json({
        success: false,
        status: 'rate_limited',
        message: parseResult.error || 'Daily AI parsing cap reached. Please try again tomorrow.',
        resumeProfile: student.resumeProfile,
      });
    }

    return res.status(200).json({
      success: true,
      cached: parseResult.cached || false,
      status: parseResult.status || 'parsed',
      source: parseResult.source || student.resumeProfile?.source,
      resumeProfile: student.resumeProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current student's parsed resume profile
 * @route   GET /api/students/me/resume-profile
 * @access  Private (Student only)
 */
const getResumeProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    return res.status(200).json({
      success: true,
      resumeProfile: student.resumeProfile || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm or edit extracted skills in resume profile
 * @route   PUT /api/students/me/resume-profile
 * @access  Private (Student only)
 */
const updateResumeProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { skills, summary } = req.body;

    if (!student.resumeProfile) {
      student.resumeProfile = {
        skills: [],
        education: [],
        experience: [],
        projects: [],
        certifications: [],
        summary: '',
        status: 'parsed',
        source: 'rules',
      };
    }

    if (Array.isArray(skills)) {
      // Map existing skills to preserve foundInResume
      const existingMap = new Map();
      (student.resumeProfile?.skills || []).forEach((s) => {
        const norm = normalizeSkill(s.name);
        if (norm) {
          existingMap.set(norm, s.foundInResume !== false);
        }
      });

      const sanitized = sanitizeSkillList(skills, 50);
      const updatedSkills = [];

      for (const item of sanitized) {
        const normName = typeof item === 'object' ? item.name : item;
        const confirmed = typeof item === 'object' ? item.confirmedByStudent !== false : true;
        const wasInResume = existingMap.has(normName) ? existingMap.get(normName) : false;

        updatedSkills.push({
          name: normName,
          confirmedByStudent: confirmed,
          foundInResume: wasInResume,
        });
      }

      student.resumeProfile.skills = updatedSkills;

      // Sync confirmed skills into student.skills
      const confirmedNames = updatedSkills.map((s) => s.name);
      student.skills = confirmedNames;
    }

    if (typeof summary === 'string') {
      student.resumeProfile.summary = summary.trim();
    }

    await student.save();

    return res.status(200).json({
      success: true,
      message: 'Resume profile updated and skills confirmed successfully',
      resumeProfile: student.resumeProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get match score & missing skills for current student against a drive
 * @route   GET /api/students/me/skill-match/:driveId
 * @access  Private (Student only)
 */
const getStudentSkillMatch = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const drive = await Drive.findById(req.params.driveId);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Placement drive not found' });
    }

    const match = computeMatchScore(student, drive);

    return res.status(200).json({
      success: true,
      driveId: drive._id,
      role: drive.role,
      match,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get applicants for a drive ranked by deterministic AI match score
 * @route   GET /api/drives/:driveId/ranked-applicants
 * @access  Private (Recruiter owner, TPO of invited college, Superadmin)
 */
const getRankedApplicants = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const drive = await Drive.findById(driveId);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    const user = req.user;
    const userRole = user.role;

    // RBAC Authorization
    if (userRole === 'superadmin') {
      // Allowed
    } else if (userRole === 'recruiter') {
      const userCompanyId = (user.company?._id || user.company)?.toString();
      const driveCompanyId = (drive.company?._id || drive.company)?.toString();
      if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You do not own this drive',
        });
      }
    } else if (userRole === 'tpo' || userRole === 'admin') {
      const userCollegeId = (user.college?._id || user.college)?.toString();
      const driveCollegeIds = getDriveCollegeIds(drive);
      if (!userCollegeId || !driveCollegeIds.includes(userCollegeId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: Your college is not part of this drive',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Access restricted to recruiters and TPOs',
      });
    }

    // Fetch applications
    const applications = await Application.find({ drive: drive._id })
      .populate({
        path: 'student',
        populate: [
          { path: 'user', select: 'name email' },
          { path: 'college', select: 'name code' },
        ],
      });

    // If TPO, filter only students from their college
    let targetApplications = applications;
    if (userRole === 'tpo' || userRole === 'admin') {
      const userCollegeId = (user.college?._id || user.college)?.toString();
      targetApplications = applications.filter((app) => {
        const studentCollegeId = (app.student?.college?._id || app.student?.college)?.toString();
        return studentCollegeId === userCollegeId;
      });
    }

    // Rank candidates deterministically
    const scoredApplicants = targetApplications.map((app) => {
      const student = app.student;
      const match = computeMatchScore(student, drive);

      return {
        applicationId: app._id,
        status: app.status,
        appliedOn: app.appliedOn,
        aiExplanation: app.aiExplanation || null,
        student: {
          _id: student?._id,
          name: student?.user?.name || 'Candidate',
          email: student?.user?.email || '',
          enrollmentNo: student?.enrollmentNo || '',
          branch: student?.branch || '',
          batchYear: student?.batchYear,
          cgpa: student?.cgpa,
          backlogs: student?.backlogs,
          skills: student?.skills || [],
          resumeProfile: student?.resumeProfile ? {
            status: student.resumeProfile.status,
            source: student.resumeProfile.source,
            skills: student.resumeProfile.skills,
            parsedAt: student.resumeProfile.parsedAt,
          } : null,
          hasResume: Boolean(student?.resumeUrl),
        },
        match,
      };
    });

    // Sort by score descending (highest match first)
    scoredApplicants.sort((a, b) => b.match.score - a.match.score);

    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const total = scoredApplicants.length;
    const pages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = scoredApplicants.slice(startIndex, startIndex + limit);

    return res.status(200).json({
      success: true,
      driveId: drive._id,
      total,
      page,
      pages,
      applicants: paginated,
      disclaimer: 'AI-assisted suggestion. The final decision is yours.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Generate or fetch cached 2-3 sentence explanation for an applicant
 * @route   GET /api/drives/:driveId/applicants/:applicationId/explanation
 * @access  Private (Recruiter owner, TPO of applicant's college, Superadmin)
 */
const getApplicantExplanationHandler = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const applicationId = req.params.applicationId;

    const drive = await Drive.findById(driveId);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    const application = await Application.findOne({
      _id: applicationId,
      drive: drive._id,
    }).populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found for this drive' });
    }

    const user = req.user;
    const userRole = user.role;

    // RBAC Authorization
    if (userRole === 'superadmin') {
      // Allowed
    } else if (userRole === 'recruiter') {
      const userCompanyId = (user.company?._id || user.company)?.toString();
      const driveCompanyId = (drive.company?._id || drive.company)?.toString();
      if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You do not own this drive',
        });
      }
    } else if (userRole === 'tpo' || userRole === 'admin') {
      const userCollegeId = (user.college?._id || user.college)?.toString();
      const studentCollegeId = (application.student?.college?._id || application.student?.college)?.toString();
      const driveCollegeIds = getDriveCollegeIds(drive);

      if (
        !userCollegeId ||
        userCollegeId !== studentCollegeId ||
        !driveCollegeIds.includes(userCollegeId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You can only view explanations for students of your invited college',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    // 1. Return cached explanation if present
    if (application.aiExplanation) {
      return res.status(200).json({
        success: true,
        cached: true,
        explanation: application.aiExplanation,
      });
    }

    // 2. Generate explanation from structured breakdown ONLY
    const match = computeMatchScore(application.student, drive);
    const explanation = await generateApplicantExplanation(match, drive.role, user._id);

    // 3. Cache on application document
    application.aiExplanation = explanation;
    application.aiExplanationGeneratedAt = new Date();
    await application.save();

    return res.status(200).json({
      success: true,
      cached: false,
      explanation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update drive skills (required & preferred)
 * @route   PUT /api/drives/:driveId/skills
 * @access  Private (Recruiter owner, TPO / Admin, Superadmin)
 */
const updateDriveSkills = async (req, res, next) => {
  try {
    const driveId = req.params.driveId || req.params.id;
    const drive = await Drive.findById(driveId);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    const user = req.user;
    if (user.role === 'superadmin') {
      // Allowed
    } else if (user.role === 'recruiter') {
      const userCompanyId = (user.company?._id || user.company)?.toString();
      const driveCompanyId = (drive.company?._id || drive.company)?.toString();
      if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
        return res.status(403).json({ success: false, message: 'Not authorized to edit this drive' });
      }
    } else if (user.role === 'tpo' || user.role === 'admin') {
      const userCollegeId = (user.college?._id || user.college)?.toString();
      const driveCollegeIds = getDriveCollegeIds(drive);
      if (!userCollegeId || !driveCollegeIds.includes(userCollegeId)) {
        return res.status(403).json({ success: false, message: 'Not authorized to edit this drive' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { requiredSkills, preferredSkills, minCgpa } = req.body;

    if (Array.isArray(requiredSkills)) {
      drive.requiredSkills = sanitizeSkillList(requiredSkills, 50);
    }
    if (Array.isArray(preferredSkills)) {
      drive.preferredSkills = sanitizeSkillList(preferredSkills, 50);
    }
    if (minCgpa !== undefined && minCgpa !== null) {
      drive.minCgpa = Math.max(0, Math.min(10, Number(minCgpa)));
    }

    await drive.save();

    return res.status(200).json({
      success: true,
      message: 'Drive skills updated successfully',
      requiredSkills: drive.requiredSkills,
      preferredSkills: drive.preferredSkills,
      minCgpa: drive.minCgpa,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDriveCollegeIds,
  parseResume,
  getResumeProfile,
  updateResumeProfile,
  getStudentSkillMatch,
  getRankedApplicants,
  getApplicantExplanationHandler,
  updateDriveSkills,
};

