const mongoose = require('mongoose');

/**
 * ResumeVersion Schema
 * Stores candidate customized and tailored resume snapshots (up to 5 per student),
 * tracking chosen ATS single-column templates, matched skills, bullet rewrites,
 * before/after ATS scores, and tailored cover letters.
 */
const resumeVersionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Version name is required'],
      trim: true,
      maxlength: [100, 'Version name cannot exceed 100 characters'],
    },
    targetRole: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    targetCompany: {
      type: String,
      trim: true,
      default: '',
      maxlength: 100,
    },
    targetDrive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      default: null,
    },
    templateId: {
      type: String,
      enum: ['modern', 'classic', 'compact'],
      default: 'modern',
    },
    resumeData: {
      contact: {
        fullName: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        location: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        github: { type: String, default: '' },
        portfolio: { type: String, default: '' },
      },
      summary: { type: String, default: '' },
      skills: [
        {
          category: { type: String, default: 'Technical Skills' },
          items: [{ type: String, trim: true }],
        },
      ],
      experience: [
        {
          title: { type: String, default: '' },
          company: { type: String, default: '' },
          location: { type: String, default: '' },
          duration: { type: String, default: '' },
          bullets: [{ type: String }],
        },
      ],
      projects: [
        {
          title: { type: String, default: '' },
          technologies: [{ type: String, trim: true }],
          duration: { type: String, default: '' },
          link: { type: String, default: '' },
          bullets: [{ type: String }],
        },
      ],
      education: [
        {
          degree: { type: String, default: '' },
          institution: { type: String, default: '' },
          field: { type: String, default: '' },
          year: { type: String, default: '' },
          score: { type: String, default: '' },
        },
      ],
      certifications: [{ type: String, trim: true }],
    },
    atsScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    baselineScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    coverLetter: {
      type: String,
      default: '',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

resumeVersionSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('ResumeVersion', resumeVersionSchema);
