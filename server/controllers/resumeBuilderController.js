/**
 * AI Resume Builder & Tailoring Controller
 * Handles compiling base resumes, tailoring to drives/JDs, generating truthful cover letters,
 * version management (max 5), and ATS-compliant PDFKit export.
 */

const { z } = require('zod');
const {
  compileBaseResume,
  loadResumeSource,
  analyzeResumeTarget,
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

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const sourceSchema = z.object({
  type: z.enum(['profile', 'upload', 'resume_ai_file', 'text'], {
    errorMap: () => ({ message: "Source 'type' is required ('profile', 'upload', 'resume_ai_file', or 'text')" }),
  }),
  text: z.string().max(50000, 'Resume text is too large (maximum 50,000 characters)').optional(),
});

const analyzeTargetSchema = z.object({
  driveId: objectIdSchema.optional().nullable(),
  jobDescription: z.string().max(20000, 'Job description must be 20,000 characters or fewer').optional().default(''),
});

const tailorSchema = z.object({
  resumeData: z.record(z.any()).optional(),
  driveId: objectIdSchema.optional().nullable(),
  jobDescription: z.string().max(20000, 'Job description must be 20,000 characters or fewer').optional().default(''),
  sourceType: z.enum(['profile', 'upload', 'resume_ai_file', 'text']).optional().default('profile'),
});

const coverLetterSchema = z.object({
  role: z.string().max(100, 'Role must be 100 characters or fewer').optional(),
  company: z.string().max(100, 'Company must be 100 characters or fewer').optional(),
  driveId: objectIdSchema.optional().nullable(),
  jobDescription: z.string().max(20000, 'Job description must be 20,000 characters or fewer').optional().default(''),
});

const exportPdfSchema = z.object({
  resumeData: z.record(z.any(), {
    required_error: 'Valid resume data object is required for PDF export',
    invalid_type_error: 'Valid resume data object is required for PDF export',
  }),
  templateId: z.enum(['modern', 'classic', 'compact']).optional().default('modern'),
});

const saveVersionSchema = z.object({
  versionId: objectIdSchema.optional(),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer').optional().default('Custom Tailored Resume'),
  resumeData: z.record(z.any(), {
    required_error: 'Valid resume data object is required',
    invalid_type_error: 'Valid resume data object is required',
  }),
  templateId: z.enum(['modern', 'classic', 'compact']).optional().default('modern'),
  targetRole: z.string().max(100).optional(),
  targetCompany: z.string().max(100).optional(),
  driveId: objectIdSchema.optional().nullable(),
});

const objectIdParamSchema = z.object({
  id: objectIdSchema,
});

const listVersionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * @desc    Load and normalize resume data from selected source (profile, upload, resume_ai_file, text)
 * @route   POST /api/resume-builder/source
 * @access  Private (Student only)
 */
const loadSourceHandler = async (req, res, next) => {
  try {
    const parseResult = sourceSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || "Source 'type' is required ('profile', 'upload', 'resume_ai_file', or 'text')",
        errors: parseResult.error.issues,
      });
    }

    const { type, text } = parseResult.data;

    const result = await loadResumeSource({
      studentUserId: req.user._id,
      type,
      text,
      file: req.file || null,
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
    const parseResult = analyzeTargetSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || 'Invalid target payload',
        errors: parseResult.error.issues,
      });
    }

    const { driveId, jobDescription } = parseResult.data;
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
      missingFields: resumeData.missingFields || [],
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
    const parseResult = tailorSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || 'Invalid tailor payload',
        errors: parseResult.error.issues,
      });
    }

    const { resumeData, driveId, jobDescription, sourceType } = parseResult.data;

    const result = await tailorResume({
      studentUserId: req.user._id,
      baseResumeData: resumeData,
      driveId,
      jobDescription,
      sourceType,
      signal: req.abortSignal,
      isAborted: req.isAborted,
    });

    if (res.headersSent || req.timedOut) return;

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (res.headersSent || req.timedOut) return;
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
    const parseResult = coverLetterSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || 'Invalid cover letter payload',
        errors: parseResult.error.issues,
      });
    }

    const { role, company, driveId, jobDescription } = parseResult.data;

    const result = await generateCoverLetter({
      studentUserId: req.user._id,
      role,
      company,
      driveId,
      jobDescription,
      signal: req.abortSignal,
      isAborted: req.isAborted,
    });

    if (res.headersSent || req.timedOut) return;

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (res.headersSent || req.timedOut) return;
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
    const parseResult = exportPdfSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || 'Valid resume data object is required for PDF export',
        errors: parseResult.error.issues,
      });
    }

    const { resumeData, templateId } = parseResult.data;

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
    const parseResult = saveVersionSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: parseResult.error.issues[0]?.message || 'Invalid version payload',
        errors: parseResult.error.issues,
      });
    }

    const result = await saveResumeVersion({
      studentUserId: req.user._id,
      versionData: parseResult.data,
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
    const queryResult = listVersionsQuerySchema.safeParse(req.query);
    const paginationOptions = queryResult.success ? queryResult.data : {};
    const result = await listResumeVersions(req.user._id, paginationOptions);

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
    const paramResult = objectIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version ID format',
        errors: paramResult.error.issues,
      });
    }

    const version = await getResumeVersion(paramResult.data.id, req.user._id);

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
    const paramResult = objectIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid version ID format',
        errors: paramResult.error.issues,
      });
    }

    const result = await deleteResumeVersion(paramResult.data.id, req.user._id);

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
  tailorResumeHandler,
  generateCoverLetterHandler,
  exportPdfHandler,
  saveVersionHandler,
  listVersionsHandler,
  getVersionHandler,
  deleteVersionHandler,
  getQuotaHandler,
  schemas: {
    sourceSchema,
    analyzeTargetSchema,
    tailorSchema,
    coverLetterSchema,
    exportPdfSchema,
    saveVersionSchema,
    objectIdParamSchema,
    listVersionsQuerySchema,
  },
};
