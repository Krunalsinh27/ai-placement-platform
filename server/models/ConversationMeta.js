const mongoose = require('mongoose');

/**
 * ConversationMeta Schema for AI Assistant Chat
 * Stores conversation titles, auto-generation source, pin status, and ownership.
 * Indexed with a 30-day TTL matching ChatLog.
 */
const conversationMetaSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 60,
      trim: true,
    },
    titleSource: {
      type: String,
      enum: ['ai', 'fallback', 'user'],
      default: 'fallback',
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Compound index for user listing, pinned sorting, and recency
conversationMetaSchema.index({ user: 1, pinned: -1, updatedAt: -1 });

// TTL index: automatically deletes metadata older than 30 days (2,592,000 seconds), matching ChatLog
conversationMetaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ConversationMeta', conversationMetaSchema);
