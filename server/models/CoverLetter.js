const mongoose = require('mongoose');

/**
 * CoverLetter Schema
 * Stores candidate cover letter text linked to a Resume, optional ResumeVersion, and optional Drive.
 * Pure text payload; PDFs are streamed on-demand and never stored in MongoDB.
 */
const coverLetterSchema = new mongoose.Schema(
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
    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
      index: true,
    },
    version: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResumeVersion',
      default: null,
      index: true,
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      default: null,
      index: true,
    },
    role: {
      type: String,
      default: 'Software Engineer',
      trim: true,
      maxlength: [100, 'Role title cannot exceed 100 characters'],
    },
    company: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
    },
    content: {
      type: String,
      required: [true, 'Cover letter content is required'],
      trim: true,
      maxlength: [20000, 'Cover letter cannot exceed 20,000 characters'],
    },
    source: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'manual',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

coverLetterSchema.index({ resume: 1, version: 1, drive: 1 });
coverLetterSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('CoverLetter', coverLetterSchema);
