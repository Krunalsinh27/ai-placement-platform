const mongoose = require('mongoose');

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

/**
 * Resume Schema
 * Core document for Resume Studio representing a student's resume.
 * A student can have multiple resumes (e.g. general, frontend, backend, data science),
 * with at most one active primary resume enforced at the database level via a partial unique index.
 */
const resumeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College reference is required'],
      index: true,
    },
    title: {
      type: String,
      default: 'Untitled Resume',
      trim: true,
      maxlength: [120, 'Resume title cannot exceed 120 characters'],
    },
    templateId: {
      type: String,
      enum: {
        values: RESUME_TEMPLATES,
        message: '{VALUE} is not a supported resume template',
      },
      default: 'modern',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    draftUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound index for querying student resumes filtered by deleted/archived state
resumeSchema.index({ student: 1, deleted: 1, archived: 1, updatedAt: -1 });

// Partial unique index: at most one active (archived: false, deleted: false) primary resume per student
resumeSchema.index(
  { student: 1, isPrimary: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, archived: false, deleted: false },
  }
);

resumeSchema.statics.RESUME_TEMPLATES = RESUME_TEMPLATES;

module.exports = mongoose.model('Resume', resumeSchema);
