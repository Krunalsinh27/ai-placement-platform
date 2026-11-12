const mongoose = require('mongoose');

/**
 * ChatLog Schema for TPO Analytics Assistant
 *
 * Stores audit metadata of user queries and tool routing.
 * Strictly NEVER stores results, raw data, or resume text.
 * Indexed with a TTL of 30 days.
 */
const chatLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['student', 'tpo', 'recruiter', 'superadmin', 'admin'],
      required: true,
      index: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: false,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: false,
      index: true,
    },
    question: {
      type: String,
      maxlength: 300,
      trim: true,
      default: '',
    },
    tool: {
      type: String,
      required: true,
      trim: true,
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['success', 'cant_answer', 'error', 'rate_limited'],
      default: 'success',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// TTL index: automatically deletes audit logs older than 30 days (2,592,000 seconds)
chatLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ChatLog', chatLogSchema);

