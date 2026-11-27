const mongoose = require('mongoose');
const { redactPII } = require('../services/ai/redactor');

const aiCallLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    feature: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['success', 'fallback', 'failed', 'rate_limited'],
      default: 'success',
      index: true,
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    promptTokensEstimated: {
      type: Number,
      default: 0,
    },
    completionTokensEstimated: {
      type: Number,
      default: 0,
    },
    costEstimateUsd: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },
    circuitBreakerTripped: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically purge records after 30 days
aiCallLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
aiCallLogSchema.index({ feature: 1, timestamp: -1 });
aiCallLogSchema.index({ provider: 1, status: 1 });

/**
 * Token cost estimations (USD per 1M tokens)
 */
const PRICING = {
  groq: {
    prompt: 0.59 / 1_000_000,
    completion: 0.79 / 1_000_000,
  },
  gemini: {
    prompt: 0.075 / 1_000_000,
    completion: 0.3 / 1_000_000,
  },
  mock: {
    prompt: 0,
    completion: 0,
  },
  rules: {
    prompt: 0,
    completion: 0,
  },
};

/**
 * Calculates approximate cost in USD given provider and token counts
 */
function estimateCost(provider, promptTokens = 0, completionTokens = 0) {
  const norm = (provider || '').toLowerCase().trim();
  const rates = PRICING[norm] || PRICING.groq;
  const cost = promptTokens * rates.prompt + completionTokens * rates.completion;
  return Number(cost.toFixed(6));
}

/**
 * Rough token estimation helper (1 token ≈ 4 characters)
 */
function estimateTokensFromText(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Safely persists telemetry log without throwing errors
 */
aiCallLogSchema.statics.logCall = async function ({
  feature,
  provider,
  model = '',
  status = 'success',
  latencyMs = 0,
  promptText = '',
  completionText = '',
  promptTokens = null,
  completionTokens = null,
  errorMessage = null,
  circuitBreakerTripped = false,
  userId = null,
}) {
  try {
    const pTokens = promptTokens !== null ? promptTokens : estimateTokensFromText(promptText);
    const cTokens = completionTokens !== null ? completionTokens : estimateTokensFromText(completionText);
    const cost = estimateCost(provider, pTokens, cTokens);

    // Sanitize error message to ensure no PII, API keys, credentials, or sensitive tokens are logged
    const sanitizedError = errorMessage
      ? redactPII(String(errorMessage)).slice(0, 500)
      : null;

    return await this.create({
      feature: feature || 'general',
      provider: provider || 'unknown',
      model: model || '',
      status,
      latencyMs: Math.max(0, Math.round(latencyMs)),
      promptTokensEstimated: pTokens,
      completionTokensEstimated: cTokens,
      costEstimateUsd: cost,
      errorMessage: sanitizedError,
      circuitBreakerTripped: Boolean(circuitBreakerTripped),
      userId: userId || null,
    });
  } catch (err) {
    // Non-blocking telemetry failure
    console.warn('[AiCallLog] Telemetry recording failed:', err.message);
    return null;
  }
};

const AiCallLog = mongoose.model('AiCallLog', aiCallLogSchema);

module.exports = AiCallLog;
