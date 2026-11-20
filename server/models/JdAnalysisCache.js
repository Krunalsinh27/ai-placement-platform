const mongoose = require('mongoose');

/**
 * Model: JdAnalysisCache
 * Caches normalized job description (JD) analysis to guarantee deterministic
 * extraction, prevent score drift across Re-Analyze actions, and reduce unnecessary LLM calls.
 *
 * Hash: SHA-256 of normalized JD text (trimmed, whitespace-collapsed, lowercased).
 * TTL: 30 days (2,592,000 seconds)
 */
const jdAnalysisCacheSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    analysis: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    source: {
      type: String,
      enum: ['ai', 'rules'],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model('JdAnalysisCache', jdAnalysisCacheSchema);
