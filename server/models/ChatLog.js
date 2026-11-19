const mongoose = require('mongoose');

/**
 * ChatLog Schema for Multi-Role Assistant
 *
 * Stores audit metadata, conversation threads, tool usage, and feedback ratings.
 * Strictly NEVER stores raw database result dumps or student PII.
 * Indexed with a TTL of 30 days.
 */
const chatLogSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    messageId: {
      type: String,
      required: false,
      index: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
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
    sender: {
      type: String,
      enum: ['user', 'assistant', 'system', 'tool'],
      default: 'user',
    },
    question: {
      type: String,
      maxlength: 1500,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      maxlength: 10000,
      default: '',
    },
    tool: {
      type: String,
      required: false,
      trim: true,
      default: 'none',
    },
    toolCalls: [
      {
        id: { type: String },
        name: { type: String },
        args: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    sources: [
      {
        title: { type: String },
        category: { type: String },
        chunkIndex: { type: Number },
      },
    ],
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['success', 'cant_answer', 'error', 'rate_limited'],
      default: 'success',
    },
    feedback: {
      rating: { type: Number, enum: [1, -1] },
      comment: { type: String, maxlength: 500 },
      createdAt: { type: Date },
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

// Compound indexes for fast conversation lookups and user thread management
chatLogSchema.index({ user: 1, conversationId: 1, createdAt: 1 });
chatLogSchema.index({ conversationId: 1, createdAt: 1 });

// TTL index: automatically deletes audit logs older than 30 days (2,592,000 seconds)
chatLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ChatLog', chatLogSchema);
