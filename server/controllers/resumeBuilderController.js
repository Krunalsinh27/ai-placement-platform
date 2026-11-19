/**
 * AI Resume Builder & Tailoring Controller
 * Handles compiling base resumes, tailoring to drives/JDs, generating truthful cover letters,
 * version management (max 5), and ATS-compliant PDFKit export.
 */

const {
  compileBaseResume,
  loadResumeSource,
  analyzeResumeTarget,
  generateMatchReport,
  tailorResume,
  generateCoverLetter,
  saveResumeVersion,
  listResumeVersions,
  getResumeVersion,
  deleteResumeVersion,
  checkUnresolvedPlaceholders,
} = require('../services/resumeBuilder/resumeBuilderService');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');
const { AiUsage } = require('../models');

/**
 * @desc    Load and normalize resume data from selected source (profile, upload, text)
 * @route   POST /api/resume-builder/source
 * @access  Private (Student only)
 */
const loadSourceHandler = async (req, res, next) => {
  try {
    const { type, text } = req.body || {};
    if (!type || typeof type !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Source 'type' is required ('profile', 'upload', or 'text')",
      });
    }

    const result = await loadResumeSource({
      studentUserId: req.user._id,
      type,
      text,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Analyze target role & requirements from Drive, JD, or General mode
 * @route   POST /api/resume-builder/analyze-target
 * @access  Private (Student only)
 */
const analyzeTargetHandler = async (req, res, next) => {
  try {
    const { driveId, jobDescription } = req.body || {};
    const result = await analyzeResumeTarget({
      studentUserId: req.user._id,
      driveId,
      jobDescription,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Generate match and ATS report between candidate resume and target
 * @route   POST /api/resume-builder/match-report
 * @access  Private (Student only)
 */
const generateMatchReportHandler = async (req, res, next) => {
  try {
    const { resumeData, target } = req.body || {};
    if (!resumeData || typeof resumeData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Valid resumeData object is required for match report',
      });
    }

    const result = generateMatchReport({
      resumeData,
      target,
    });

    res.status(200).json({
      success: true,
      matchReport: result,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get baseline compiled resume from student profile
 * @route   GET /api/students/me/resume-builder/base
 * @access  Private (Student only)
 */
const getBaseResume = async (req, res, next) => {
  try {
    const resumeData = await compileBaseResume(req.user._id);

    res.status(200).json({
      success: true,
      resumeData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tailor resume to target Drive or Job Description
 * @route   POST /api/students/me/resume-builder/tailor
 * @access  Private (Student only)
 */
const tailorResumeHandler = async (req, res, next) => {
  try {
    const { resumeData, driveId, jobDescription } = req.body;

    const result = await tailorResume({
      studentUserId: req.user._id,
      baseResumeData: resumeData,
      driveId,
      jobDescription,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Generate a truthful, customized cover letter
 * @route   POST /api/students/me/resume-builder/cover-letter
 * @access  Private (Student only)
 */
const generateCoverLetterHandler = async (req, res, next) => {
  try {
    const { role, company, driveId, jobDescription } = req.body;

    const result = await generateCoverLetter({
      studentUserId: req.user._id,
      role,
      company,
      driveId,
      jobDescription,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export ATS resume as PDF via PDFKit (enforces placeholder blocking)
 * @route   POST /api/students/me/resume-builder/export-pdf
 * @access  Private (Student only)
 */
const exportPdfHandler = async (req, res, next) => {
  try {
    const { resumeData, templateId = 'modern' } = req.body;

    if (!resumeData || typeof resumeData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Valid resume data object is required for PDF export',
      });
    }

    // 1. Enforce Placeholder Blocking Guard
    const placeholderCheck = checkUnresolvedPlaceholders(resumeData);
    if (placeholderCheck.hasPlaceholders) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot export PDF: Resume contains unresolved placeholders ('[add your real number]'). Please replace them with your actual metrics or remove them before exporting.",
        occurrences: placeholderCheck.occurrences,
      });
    }

    // 2. Set response headers
    const candidateName = (resumeData.contact?.fullName || 'Candidate')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 30);
    const filename = `Resume_${candidateName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 3. Generate PDF and pipe to response
    generateResumePdf(resumeData, templateId, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Save or update a resume version (strictly max 5 per student)
 * @route   POST /api/students/me/resume-builder/versions
 * @access  Private (Student only)
 */
const saveVersionHandler = async (req, res, next) => {
  try {
    const result = await saveResumeVersion({
      studentUserId: req.user._id,
      versionData: req.body,
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List all saved resume versions for student (max 5)
 * @route   GET /api/students/me/resume-builder/versions
 * @access  Private (Student only)
 */
const listVersionsHandler = async (req, res, next) => {
  try {
    const result = await listResumeVersions(req.user._id);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a specific saved resume version
 * @route   GET /api/students/me/resume-builder/versions/:id
 * @access  Private (Student only)
 */
const getVersionHandler = async (req, res, next) => {
  try {
    const version = await getResumeVersion(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      version,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a saved resume version
 * @route   DELETE /api/students/me/resume-builder/versions/:id
 * @access  Private (Student only)
 */
const deleteVersionHandler = async (req, res, next) => {
  try {
    const result = await deleteResumeVersion(req.params.id, req.user._id);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get daily tailoring & cover letter quota status
 * @route   GET /api/students/me/resume-builder/quota
 * @access  Private (Student only)
 */
const getQuotaHandler = async (req, res, next) => {
  try {
    const usage = await AiUsage.getUserDailyUsage(req.user._id, 'student');

    res.status(200).json({
      success: true,
      quota: usage.tailor,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBaseResume,
  loadSourceHandler,
  analyzeTargetHandler,
  generateMatchReportHandler,
  tailorResumeHandler,
  generateCoverLetterHandler,
  exportPdfHandler,
  saveVersionHandler,
  listVersionsHandler,
  getVersionHandler,
  deleteVersionHandler,
  getQuotaHandler,
};
