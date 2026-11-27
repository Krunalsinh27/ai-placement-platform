const {
  resumeIdParamSchema,
  resumeAndVersionIdParamSchema,
  listResumesQuerySchema,
  listTrashQuerySchema,
  createResumeSchema,
  updateResumeSchema,
  duplicateResumeSchema,
  listVersionsQuerySchema,
  createVersionSchema,
  restoreVersionSchema,
  tpoListResumesQuerySchema,
  createResumeReviewSchema,
  suggestRequestSchema,
  suggestResponseSchema,
  tailorRequestSchema,
  applyTailorRequestSchema,
  importResumeSchema,
  generateCoverLetterSchema,
  saveCoverLetterSchema,
  getCoverLetterQuerySchema,
  exportCoverLetterPdfSchema,
} = require('../validators/resumeStudioValidator');

const { Resume, CoverLetter } = require('../models');

const {
  getStudentProfile,
  getResumeWithOwnershipCheck,
  computeMissingFields,
  listResumes,
  createResume,
  getResume,
  updateResume,
  archiveResume,
  unarchiveResume,
  trashResume,
  listTrashResumes,
  restoreTrashResume,
  duplicateResume,
  setPrimaryResume,
  listResumeVersions,
  createResumeVersion,
  restoreResumeVersion,
  deleteResumeVersion,
  tpoListStudentResumes,
  tpoGetStudentResume,
  tpoCreateResumeReview,
  getResumeReviewsForUser,
} = require('../services/resumeStudio/resumeStudioService');
const { generateSuggestion } = require('../services/resumeStudio/suggestionService');
const {
  generateTailorProposals,
  applyTailorProposals,
} = require('../services/resumeStudio/tailoringService');
const {
  generateCoverLetterForStudio,
  saveCoverLetterForStudio,
  getCoverLetterForStudio,
  generateCoverLetterPdfStream,
} = require('../services/resumeStudio/coverLetterService');
const { loadResumeSource } = require('../services/resumeBuilder/resumeBuilderService');
const { getTemplates } = require('../services/resumeStudio/templateRegistry');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');

function handleZodError(res, parseResult) {
  return res.status(400).json({
    success: false,
    message: parseResult.error.issues[0]?.message || 'Validation failed',
    errors: parseResult.error.issues,
  });
}

// GET /resumes
const listResumesHandler = async (req, res, next) => {
  try {
    const queryParse = listResumesQuerySchema.safeParse(req.query);
    if (!queryParse.success) return handleZodError(res, queryParse);

    const student = await getStudentProfile(req.user);
    const result = await listResumes(student, queryParse.data);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes
const createResumeHandler = async (req, res, next) => {
  try {
    const bodyParse = createResumeSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await createResume(student, bodyParse.data);

    res.status(201).json({
      success: true,
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// GET /resumes/:id
const getResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await getResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /resumes/:id
const updateResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = updateResumeSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await updateResume(paramParse.data.id, student, bodyParse.data);

    res.status(200).json({
      success: true,
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /resumes/:id (archive)
const archiveResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await archiveResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      message: 'Resume archived successfully',
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/unarchive
const unarchiveResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await unarchiveResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      message: 'Resume unarchived successfully',
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/trash
const trashResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await trashResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      message: 'Resume moved to Trash',
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// GET /resumes/trash
const listTrashResumesHandler = async (req, res, next) => {
  try {
    const queryParse = listTrashQuerySchema.safeParse(req.query);
    if (!queryParse.success) return handleZodError(res, queryParse);

    const student = await getStudentProfile(req.user);
    const result = await listTrashResumes(student, queryParse.data);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/restore-trash
const restoreTrashResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await restoreTrashResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      message: 'Resume restored from Trash',
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/duplicate
const duplicateResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = duplicateResumeSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await duplicateResume(paramParse.data.id, student, bodyParse.data);

    res.status(201).json({
      success: true,
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/primary
const setPrimaryResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await setPrimaryResume(paramParse.data.id, student);

    res.status(200).json({
      success: true,
      message: 'Resume set as primary',
      resume,
    });
  } catch (error) {
    next(error);
  }
};

// GET /resumes/:id/versions
const listResumeVersionsHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const queryParse = listVersionsQuerySchema.safeParse(req.query);
    if (!queryParse.success) return handleZodError(res, queryParse);

    const student = await getStudentProfile(req.user);
    const result = await listResumeVersions(paramParse.data.id, student, queryParse.data);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/versions
const createResumeVersionHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = createVersionSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const { version, warning } = await createResumeVersion(
      paramParse.data.id,
      student,
      bodyParse.data
    );

    res.status(201).json({
      success: true,
      version,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/versions/:vid/restore
const restoreResumeVersionHandler = async (req, res, next) => {
  try {
    const paramParse = resumeAndVersionIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = restoreVersionSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const result = await restoreResumeVersion(
      paramParse.data.id,
      paramParse.data.vid,
      student,
      bodyParse.data
    );

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /resumes/:id/versions/:vid
const deleteResumeVersionHandler = async (req, res, next) => {
  try {
    const paramParse = resumeAndVersionIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const result = await deleteResumeVersion(
      paramParse.data.id,
      paramParse.data.vid,
      student
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// GET /templates
const getTemplatesHandler = async (req, res, next) => {
  try {
    const templates = getTemplates();
    res.status(200).json({
      success: true,
      templates,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/export-pdf
const exportResumePdfHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const student = await getStudentProfile(req.user);
    const resume = await getResume(paramParse.data.id, student);

    const cleanTitle = (resume.title || 'Resume')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${cleanTitle || 'Resume'}.pdf"`
    );

    await new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('error', reject);
      generateResumePdf(resume.data || {}, resume.templateId || 'modern', res);
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// Phase 11: TPO & Admin Resume Reviews
// ============================================================================

// GET /tpo/resumes
const tpoListResumesHandler = async (req, res, next) => {
  try {
    const queryParse = tpoListResumesQuerySchema.safeParse(req.query);
    if (!queryParse.success) return handleZodError(res, queryParse);

    const result = await tpoListStudentResumes(req.user, queryParse.data);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// GET /tpo/resumes/:id
const tpoGetResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const result = await tpoGetStudentResume(paramParse.data.id, req.user);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /tpo/resumes/:id/reviews
const tpoCreateReviewHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = createResumeReviewSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const review = await tpoCreateResumeReview(paramParse.data.id, req.user, bodyParse.data);
    res.status(201).json({
      success: true,
      message: 'Review feedback posted successfully',
      review,
    });
  } catch (error) {
    next(error);
  }
};

// GET /resumes/:id/reviews (accessible by student owner or same-college TPO/admin)
const getResumeReviewsHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const result = await getResumeReviewsForUser(paramParse.data.id, req.user);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /resumes/:id/suggest
const suggestResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = suggestRequestSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await getResume(paramParse.data.id, student);

    const suggestion = await generateSuggestion(
      resume,
      bodyParse.data,
      req.user,
      {
        signal: req.abortSignal,
        isAborted: req.isAborted,
      }
    );

    if (res.headersSent || req.timedOut) return;

    // Validate output schema
    const responseParse = suggestResponseSchema.safeParse(suggestion);
    if (!responseParse.success) {
      console.warn('[ResumeStudioController] Suggestion response schema validation warning:', responseParse.error.issues);
    }

    res.status(200).json(suggestion);
  } catch (error) {
    if (res.headersSent || req.timedOut) return;
    if (error.status === 422 || error.status === 429 || error.status === 400 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        reasonCodes: error.reasonCodes || [],
        items: error.items || [],
      });
    }
    next(error);
  }
};

// POST /resumes/:id/tailor
const tailorResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = tailorRequestSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await getResume(paramParse.data.id, student);

    const result = await generateTailorProposals(
      resume,
      bodyParse.data,
      req.user,
      {
        signal: req.abortSignal,
        isAborted: req.isAborted,
      }
    );

    if (res.headersSent || req.timedOut) return;

    res.status(200).json(result);
  } catch (error) {
    if (res.headersSent || req.timedOut) return;
    if (error.status === 429 || error.status === 400 || error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

// POST /resumes/:id/tailor/apply
const applyTailorResumeHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = applyTailorRequestSchema.safeParse(req.body);
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);

    const result = await applyTailorProposals(
      paramParse.data.id,
      bodyParse.data,
      student
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.status === 400 || error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /resumes/import
 * Imports resume draft from upload / resume_ai_file / text / profile.
 * Reuses existing loadResumeSource and consolidated parser.
 * Identifies missingFields honestly without any filler.
 */
const importResumeHandler = async (req, res, next) => {
  try {
    const bodyParse = importResumeSchema.safeParse(req.body || {});
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const { type, text, title, templateId } = bodyParse.data;

    // Upload safety: Validate file existence, size cap, and magic bytes
    if (type === 'upload') {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: 'File is required for upload import',
        });
      }

      const buf = req.file.buffer;
      if (buf.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum allowed limit (5MB)',
        });
      }

      // Check magic bytes for PDF (%PDF) or DOCX (PK\x03\x04)
      const isPdf = buf.length >= 4 && buf.slice(0, 4).toString('ascii') === '%PDF';
      const isDocx =
        buf.length >= 4 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);

      if (!isPdf && !isDocx) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid file format: Only valid PDF and DOCX files are allowed (magic header verification failed)',
        });
      }
    }

    // Call existing loadResumeSource
    const loadResult = await loadResumeSource({
      studentUserId: req.user._id,
      type,
      text,
      file: req.file || null,
    });

    // Zero-persistence safety: dereference upload buffer
    req.file = null;

    const resumeData = loadResult.resumeData || {};
    const missingFields = computeMissingFields(resumeData);

    const newResume = await createResume(student, {
      title: title || 'Imported Resume',
      templateId: templateId || 'modern',
      data: resumeData,
      isPrimary: false,
    });

    res.status(201).json({
      success: true,
      message: 'Resume imported successfully as draft',
      resume: newResume,
      missingFields,
      warnings: loadResult.warnings || [],
      parseConfidence: loadResult.parseConfidence || 1.0,
      sourceType: type,
      extractedLinks: loadResult.extractedLinks || [],
    });
  } catch (error) {
    req.file = null;
    if (error.status === 400 || error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error.status === 403 || error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    if (error.status === 404 || error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /resumes/:id/cover-letter/generate
 * Generates an ATS-aligned, grounded cover letter reusing generateCoverLetter.
 */
const generateCoverLetterHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = generateCoverLetterSchema.safeParse(req.body || {});
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const result = await generateCoverLetterForStudio(
      paramParse.data.id,
      bodyParse.data,
      req.user
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.status || error.statusCode) {
      return res.status(error.status || error.statusCode).json({
        success: false,
        message: error.message,
        reasonCodes: error.reasonCodes || undefined,
        items: error.items || undefined,
      });
    }
    next(error);
  }
};

/**
 * PUT /resumes/:id/cover-letter
 * Saves or updates cover letter text linked to resume, optional version, and optional drive.
 */
const saveCoverLetterHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = saveCoverLetterSchema.safeParse(req.body || {});
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);

    const result = await saveCoverLetterForStudio(
      paramParse.data.id,
      bodyParse.data,
      student
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.status || error.statusCode) {
      return res.status(error.status || error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /resumes/:id/cover-letter
 * Fetches saved cover letter for resume, optional version, and optional drive.
 */
const getCoverLetterHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const queryParse = getCoverLetterQuerySchema.safeParse(req.query || {});
    if (!queryParse.success) return handleZodError(res, queryParse);

    const student = await getStudentProfile(req.user);

    const result = await getCoverLetterForStudio(
      paramParse.data.id,
      queryParse.data,
      student
    );

    res.status(200).json(result);
  } catch (error) {
    if (error.status || error.statusCode) {
      return res.status(error.status || error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /resumes/:id/cover-letter/export-pdf
 * Streams an ATS-compliant PDF of the cover letter directly to the response.
 */
const exportCoverLetterPdfHandler = async (req, res, next) => {
  try {
    const paramParse = resumeIdParamSchema.safeParse(req.params);
    if (!paramParse.success) return handleZodError(res, paramParse);

    const bodyParse = exportCoverLetterPdfSchema.safeParse(req.body || {});
    if (!bodyParse.success) return handleZodError(res, bodyParse);

    const student = await getStudentProfile(req.user);
    const resume = await getResumeWithOwnershipCheck(paramParse.data.id, student);

    let content = bodyParse.data.content;
    let targetRole = bodyParse.data.role;
    let targetCompany = bodyParse.data.company;

    // If not provided in body, lookup saved CoverLetter
    if (!content) {
      const coverDoc = await CoverLetter.findOne({
        resume: resume._id,
        student: student._id,
        ...(bodyParse.data.versionId ? { version: bodyParse.data.versionId } : {}),
      }).sort({ updatedAt: -1 });

      if (coverDoc) {
        content = coverDoc.content;
        targetRole = targetRole || coverDoc.role;
        targetCompany = targetCompany || coverDoc.company;
      }
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'No cover letter content available to export as PDF',
      });
    }

    const candidateName =
      resume.data?.contact?.fullName ||
      student.user?.name ||
      req.user.name ||
      'Candidate';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Cover_Letter_${candidateName.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    generateCoverLetterPdfStream({
      candidateName,
      contact: resume.data?.contact || {},
      targetRole: targetRole || 'Software Engineer',
      targetCompany: targetCompany || '',
      content,
      outputStream: res,
    });
  } catch (error) {
    if (error.status || error.statusCode) {
      return res.status(error.status || error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

module.exports = {
  getTemplatesHandler,
  exportResumePdfHandler,
  listResumesHandler,
  createResumeHandler,
  getResumeHandler,
  updateResumeHandler,
  archiveResumeHandler,
  unarchiveResumeHandler,
  trashResumeHandler,
  listTrashResumesHandler,
  restoreTrashResumeHandler,
  duplicateResumeHandler,
  setPrimaryResumeHandler,
  listResumeVersionsHandler,
  createResumeVersionHandler,
  restoreResumeVersionHandler,
  deleteResumeVersionHandler,
  tpoListResumesHandler,
  tpoGetResumeHandler,
  tpoCreateReviewHandler,
  getResumeReviewsHandler,
  suggestResumeHandler,
  tailorResumeHandler,
  applyTailorResumeHandler,
  importResumeHandler,
  generateCoverLetterHandler,
  saveCoverLetterHandler,
  getCoverLetterHandler,
  exportCoverLetterPdfHandler,
};
