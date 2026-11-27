const mongoose = require('mongoose');

const resumeReviewSchema = new mongoose.Schema(
  {
    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: [true, 'Resume reference is required'],
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    tpo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'TPO reviewer reference is required'],
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College reference is required'],
      index: true,
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['needs_revision', 'approved', 'in_review'],
        message: 'Status must be needs_revision, approved, or in_review',
      },
      default: 'needs_revision',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast college and resume queries
resumeReviewSchema.index({ college: 1, createdAt: -1 });
resumeReviewSchema.index({ resume: 1, createdAt: -1 });
resumeReviewSchema.index({ student: 1, createdAt: -1 });

const ResumeReview = mongoose.model('ResumeReview', resumeReviewSchema);

module.exports = ResumeReview;
