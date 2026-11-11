/**
 * AI Client coordinator.
 * Selects provider, enforces quotas, handles retries, and returns structured responses.
 */

const mockProvider = require('./providers/mockProvider');
const groqProvider = require('./providers/groqProvider');
const geminiProvider = require('./providers/geminiProvider');
const AiUsage = require('../../models/AiUsage');

function getActiveProviderName() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase().trim();
  return provider;
}

function getProvider() {
  const providerName = getActiveProviderName();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && providerName === 'mock') {
    throw new Error('Security Error: mock AI provider is strictly prohibited in production environment');
  }

  switch (providerName) {
    case 'mock':
      return mockProvider;
    case 'groq':
      return groqProvider;
    case 'gemini':
      return geminiProvider;
    case 'none':
    default:
      return null;
  }
}

/**
 * Checks whether AI features can run with an active LLM provider.
 */
function isAiConfigured() {
  const providerName = getActiveProviderName();
  if (providerName === 'none' || !providerName) return false;
  if (providerName === 'mock') {
    return process.env.NODE_ENV !== 'production';
  }
  const hasKey = Boolean(process.env.AI_API_KEY && process.env.AI_API_KEY.trim());
  return hasKey;
}

/**
 * Executes completion with quota check, retry on invalid JSON, and rate_limited mapping.
 *
 * @param {Object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userPrompt
 * @param {string} [options.mode='parse'] - 'parse' | 'explain'
 * @param {string|ObjectId} [options.userId=null]
 * @param {Function} [options.validateFn=null] - Optional schema validation function
 * @returns {Promise<{ success: boolean, data?: any, status?: string, error?: string, rawText?: string }>}
 */
async function callAiWithQuotaAndRetry({
  systemPrompt,
  userPrompt,
  mode = 'parse',
  userId = null,
  validateFn = null,
}) {
  // 1. Check if configured
  if (!isAiConfigured()) {
    return {
      success: false,
      status: 'disabled',
      error: 'AI service is not configured or disabled.',
    };
  }

  // 2. Enforce Daily Quota (MongoDB persisted)
  try {
    const quotaCheck = await AiUsage.canMakeCall(userId);
    if (!quotaCheck.allowed) {
      return {
        success: false,
        status: 'rate_limited',
        error: quotaCheck.message || 'Daily AI call limit reached.',
      };
    }
  } catch (quotaErr) {
    console.warn('[AI Service] Quota check failed:', quotaErr.message);
  }

  const provider = getProvider();
  if (!provider) {
    return {
      success: false,
      status: 'disabled',
      error: 'No active AI provider.',
    };
  }

  // Helper for JSON parsing & validation
  const parseAndValidate = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Try to extract JSON between markdown codeblocks if present
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error('Invalid JSON returned by provider');
      }
    }
    if (typeof validateFn === 'function') {
      return validateFn(parsed);
    }
    return parsed;
  };

  // Attempt 1
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const rawText = await provider.generateCompletion({
        systemPrompt,
        userPrompt,
        mode,
      });

      const validatedData = parseAndValidate(rawText);

      // Successfully processed: Record call against MongoDB daily counter
      try {
        await AiUsage.recordCall(userId);
      } catch (recErr) {
        console.warn('[AI Service] Failed to record usage:', recErr.message);
      }

      return {
        success: true,
        data: validatedData,
        rawText,
        model: process.env.AI_MODEL || provider.name,
      };
    } catch (err) {
      lastError = err;
      const isRateLimited =
        err.status === 429 ||
        err.statusCode === 429 ||
        (err.message && err.message.includes('429')) ||
        (err.message && err.message.toLowerCase().includes('rate limit'));

      if (isRateLimited) {
        return {
          success: false,
          status: 'rate_limited',
          error: 'AI provider rate limit / quota exceeded.',
        };
      }

      // If it was the first attempt and JSON parse failed, loop will retry once.
      if (attempt === 1) {
        continue;
      }
    }
  }

  return {
    success: false,
    status: 'failed',
    error: lastError?.message || 'AI generation failed after 1 retry.',
  };
}

module.exports = {
  getActiveProviderName,
  getProvider,
  isAiConfigured,
  callAiWithQuotaAndRetry,
};

