const mongoose = require('mongoose');

/**
 * TailorSession Schema
 * Stores short-lived, server-trusted tailoring proposals and JD snapshots.
 * Automatically removed after 30 minutes via MongoDB TTL index.
 */
const tailorSessionSchema = new mongoose.Schema(
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
    contentHash: {
      type: String,
      required: true,
      trim: true,
    },
    proposals: [
      {
        id: { type: String, required: true },
        section: { type: String, required: true },
        target: { type: mongoose.Schema.Types.Mixed },
        original: { type: mongoose.Schema.Types.Mixed },
        proposed: { type: mongoose.Schema.Types.Mixed },
        reason: { type: String, default: '' },
        matchedJdKeyword: { type: String, default: '' },
      },
    ],
    jdSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    targetRole: {
      type: String,
      default: '',
      trim: true,
    },
    targetCompany: {
      type: String,
      default: '',
      trim: true,
    },
    baselineScore: {
      type: Number,
      default: 0,
    },
    projectedScore: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

tailorSessionSchema.index({ student: 1, resume: 1, createdAt: -1 });

module.exports = mongoose.model('TailorSession', tailorSessionSchema);
