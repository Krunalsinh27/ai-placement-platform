const { z } = require('zod');

const RESUME_TEMPLATES = [
  'modern',
  'classic',
  'compact',
  'minimal-ats',
  'software-engineer',
  'professional-fresher',
  'modern-professional',
  'technical-projects',
];

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const resumeIdParamSchema = z.object({
  id: objectIdSchema,
});

const resumeAndVersionIdParamSchema = z.object({
  id: objectIdSchema,
  vid: objectIdSchema,
});

const listResumesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => val === true || val === 'true')
    .optional()
    .default(false),
});

const listTrashQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const createResumeSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120, 'Resume title cannot exceed 120 characters')
    .optional()
    .default('Untitled Resume'),
  templateId: z
    .enum(RESUME_TEMPLATES, {
      errorMap: () => ({ message: 'Invalid resume template' }),
    })
    .optional()
    .default('modern'),
  data: z.record(z.any()).optional().default({}),
  isPrimary: z.boolean().optional().default(false),
});

const updateResumeSchema = z
  .object({
    title: z.string().trim().max(120, 'Resume title cannot exceed 120 characters').optional(),
    templateId: z
      .enum(RESUME_TEMPLATES, {
        errorMap: () => ({ message: 'Invalid resume template' }),
      })
      .optional(),
    data: z.record(z.any()).optional(),
    isPrimary: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const duplicateResumeSchema = z.object({
  title: z.string().trim().max(120, 'Resume title cannot exceed 120 characters').optional(),
});

const listVersionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const createVersionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Version name is required')
    .max(100, 'Version name cannot exceed 100 characters')
    .optional()
    .default('Snapshot'),
  resumeData: z.record(z.any()).optional(),
  templateId: z
    .enum(RESUME_TEMPLATES, {
      errorMap: () => ({ message: 'Invalid resume template' }),
    })
    .optional(),
  source: z.enum(['manual', 'ai-tailor', 'import']).optional().default('manual'),
  label: z.string().trim().max(100).optional().default(''),
  contentHash: z.string().trim().max(128).optional().default(''),
  targetRole: z.string().trim().max(100).optional().default(''),
  targetCompany: z.string().trim().max(100).optional().default(''),
  targetDrive: objectIdSchema.optional().nullable(),
  atsScore: z.number().min(0).max(100).optional().default(0),
  baselineScore: z.number().min(0).max(100).optional().default(0),
  coverLetter: z.string().max(10000).optional().default(''),
  isDefault: z.boolean().optional().default(false),
});

const restoreVersionSchema = z.object({
  name: z.string().trim().max(100).optional(),
});

const tpoListResumesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional().default(''),
  branch: z.string().trim().max(100).optional(),
  batchYear: z.coerce.number().int().min(2000).max(2100).optional(),
  reviewStatus: z.enum(['all', 'needs_revision', 'approved', 'in_review', 'unreviewed']).optional().default('all'),
});

const createResumeReviewSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, 'Review comment cannot be empty')
    .max(2000, 'Review comment cannot exceed 2000 characters'),
  status: z.enum(['needs_revision', 'approved', 'in_review']).default('needs_revision'),
});

const suggestRequestSchema = z.object({
  type: z.enum(['summary', 'bullet', 'skills'], {
    errorMap: () => ({ message: "Type must be one of 'summary', 'bullet', or 'skills'" }),
  }),
  section: z.enum(['summary', 'skills', 'experience', 'projects']).optional(),
  itemIndex: z.coerce.number().int().min(0).optional(),
  bulletIndex: z.coerce.number().int().min(0).optional(),
  originalText: z.string().max(2000).optional(),
  targetRole: z.string().trim().max(120).optional(),
  jdText: z.string().trim().max(10000).optional(),
});

const suggestResponseSchema = z.object({
  success: z.boolean(),
  type: z.enum(['summary', 'bullet', 'skills']),
  target: z.object({
    section: z.string(),
    itemIndex: z.number().nullable().optional(),
    bulletIndex: z.number().nullable().optional(),
  }),
  original: z.any(),
  proposed: z.any(),
  reasonCodes: z.array(z.string()).optional(),
  explanation: z.string().optional(),
});

const tailorRequestSchema = z
  .object({
    driveId: objectIdSchema.optional(),
    jobDescription: z.string().trim().max(20000).optional(),
  })
  .refine(
    (data) => Boolean(data.driveId || (data.jobDescription && data.jobDescription.length >= 10)),
    {
      message: 'Either driveId or a valid jobDescription (at least 10 characters) is required',
    }
  );

const applyTailorRequestSchema = z.object({
  sessionId: objectIdSchema.optional(),
  acceptedProposalIds: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one accepted proposal ID is required'),
  proposals: z.array(z.record(z.any())).optional().default([]),
  jdSnapshot: z.record(z.any()).optional().default({}),
  versionName: z.string().trim().max(100).optional(),
});

const importResumeSchema = z
  .object({
    type: z.enum(['upload', 'resume_ai_file', 'text', 'profile'], {
      errorMap: () => ({ message: "Source type must be 'upload', 'resume_ai_file', 'text', or 'profile'" }),
    }),
    text: z.string().max(50000).optional(),
    title: z.string().trim().max(120).optional().default('Imported Resume'),
    templateId: z
      .enum(RESUME_TEMPLATES, {
        errorMap: () => ({ message: 'Invalid resume template' }),
      })
      .optional()
      .default('modern'),
  })
  .refine(
    (data) => {
      if (data.type === 'text') {
        return Boolean(data.text && data.text.trim().length >= 10);
      }
      return true;
    },
    { message: 'Resume text must be at least 10 characters when type is text' }
  );

const generateCoverLetterSchema = z.object({
  versionId: objectIdSchema.optional(),
  driveId: objectIdSchema.optional(),
  role: z.string().trim().max(100).optional().default('Software Engineer'),
  company: z.string().trim().max(100).optional().default(''),
  jobDescription: z.string().trim().max(20000).optional(),
});

const saveCoverLetterSchema = z.object({
  versionId: objectIdSchema.optional(),
  driveId: objectIdSchema.optional(),
  role: z.string().trim().max(100).optional().default('Software Engineer'),
  company: z.string().trim().max(100).optional().default(''),
  content: z.string().trim().min(10, 'Cover letter content must be at least 10 characters').max(20000),
  source: z.enum(['ai', 'manual']).optional().default('manual'),
});

const getCoverLetterQuerySchema = z.object({
  versionId: objectIdSchema.optional(),
  driveId: objectIdSchema.optional(),
});

const exportCoverLetterPdfSchema = z.object({
  coverLetterId: objectIdSchema.optional(),
  versionId: objectIdSchema.optional(),
  content: z.string().max(20000).optional(),
  role: z.string().trim().max(100).optional(),
  company: z.string().trim().max(100).optional(),
});

module.exports = {
  RESUME_TEMPLATES,
  objectIdSchema,
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
};
