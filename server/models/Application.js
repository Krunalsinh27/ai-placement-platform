const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
    },
    resumeVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResumeVersion',
      default: null,
    },
    resumeSnapshot: {
      resumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        default: null,
      },
      versionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ResumeVersion',
        default: null,
      },
      contentHash: {
        type: String,
        default: '',
      },
      data: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      templateId: {
        type: String,
        default: 'modern',
      },
      coverLetter: {
        type: String,
        default: null,
      },
      createdAt: {
        type: Date,
        default: null,
      },
    },
    status: {
      type: String,
      enum: {
        values: ['applied', 'shortlisted', 'interview', 'selected', 'rejected'],
        message:
          '{VALUE} is not a valid status. Allowed: applied, shortlisted, interview, selected, rejected',
      },
      default: 'applied',
    },
    appliedOn: {
      type: Date,
      default: Date.now,
    },
    aiExplanation: {
      type: String,
      default: null,
    },
    aiExplanationGeneratedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: a student can only apply once to a specific drive
applicationSchema.index({ student: 1, drive: 1 }, { unique: true });
applicationSchema.index({ drive: 1, status: 1 });
applicationSchema.index({ student: 1, status: 1 });
applicationSchema.index({ drive: 1, appliedOn: -1 });
applicationSchema.index({ resumeVersion: 1 });

const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;

