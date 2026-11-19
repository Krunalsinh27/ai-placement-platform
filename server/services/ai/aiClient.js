/**
 * Production-Grade AI Client Coordinator
 *
 * Implements:
 * 1. Resilient Provider Fallback Chain (e.g. groq -> gemini -> rules)
 * 2. Per-provider Circuit Breaker with automatic cooldown and half-open probing
 * 3. Configurable timeout per call (Promise.race)
 * 4. Exponential backoff retry with full jitter
 * 5. PII-Free Telemetry logging to AiCallLog and Sentry error hooks
 * 6. Granular per-feature flag enforcement
 */

const mockProvider = require('./providers/mockProvider');
const groqProvider = require('./providers/groqProvider');
const geminiProvider = require('./providers/geminiProvider');
const AiUsage = require('../../models/AiUsage');
const AiCallLog = require('../../models/AiCallLog');
const { logAiError } = require('../../utils/aiErrorLogger');
const { isAiFeatureEnabled } = require('../../utils/featureFlags');

// ==========================================
// Circuit Breaker State & Constants
// ==========================================
const CIRCUIT_CONFIG = {
  failureThreshold: 3, // Consecutive failures before tripping
  cooldownMs: 60_000,  // Cooldown time before probing (60 seconds)
  defaultTimeoutMs: 12_000, // 12 seconds per external LLM call
};

const circuitBreakers = {
  groq: { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: 0 },
  gemini: { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: 0 },
  mock: { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: 0 },
};

function getCircuitBreakerStatus() {
  const result = {};
  const now = Date.now();
  for (const [provider, cb] of Object.entries(circuitBreakers)) {
    let effectiveState = cb.state;
    if (cb.state === 'OPEN' && now - cb.lastFailureTime > CIRCUIT_CONFIG.cooldownMs) {
      effectiveState = 'HALF-OPEN';
    }
    result[provider] = {
      state: effectiveState,
      consecutiveFailures: cb.consecutiveFailures,
      lastFailureTime: cb.lastFailureTime ? new Date(cb.lastFailureTime).toISOString() : null,
      cooldownRemainingMs:
        cb.state === 'OPEN'
          ? Math.max(0, CIRCUIT_CONFIG.cooldownMs - (now - cb.lastFailureTime))
          : 0,
    };
  }
  return result;
}

function resetCircuitBreakers() {
  for (const provider of Object.keys(circuitBreakers)) {
    circuitBreakers[provider] = { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: 0 };
  }
}

function recordCircuitFailure(providerName) {
  const cb = circuitBreakers[providerName];
  if (!cb) return;

  cb.consecutiveFailures += 1;
  cb.lastFailureTime = Date.now();
  if (cb.consecutiveFailures >= CIRCUIT_CONFIG.failureThreshold) {
    cb.state = 'OPEN';
    console.warn(`[AI Circuit Breaker] Tripped OPEN for provider '${providerName}' after ${cb.consecutiveFailures} consecutive failures.`);
  }
}

function recordCircuitSuccess(providerName) {
  const cb = circuitBreakers[providerName];
  if (!cb) return;

  cb.consecutiveFailures = 0;
  cb.state = 'CLOSED';
}

function isCircuitOpen(providerName) {
  const cb = circuitBreakers[providerName];
  if (!cb) return false;

  if (cb.state === 'CLOSED') return false;

  const now = Date.now();
  if (cb.state === 'OPEN') {
    if (now - cb.lastFailureTime > CIRCUIT_CONFIG.cooldownMs) {
      cb.state = 'HALF-OPEN';
      return false; // Allow probe request
    }
    return true; // Still cooling down
  }

  // HALF-OPEN: Allow single probe
  return false;
}

// ==========================================
// Provider Registry & Resolution
// ==========================================
function getActiveProviderName() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase().trim();
  return provider;
}

function resolveProviderInstance(name) {
  const norm = (name || '').toLowerCase().trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && norm === 'mock') {
    throw new Error('Security Error: mock AI provider is strictly prohibited in production environment');
  }

  switch (norm) {
    case 'mock':
      return mockProvider;
    case 'groq':
      return groqProvider;
    case 'gemini':
      return geminiProvider;
    default:
      return null;
  }
}

function getProvider() {
  const providerName = getActiveProviderName();
  return resolveProviderInstance(providerName);
}

/**
 * Resolves the ordered fallback chain of providers.
 * e.g., 'groq' -> ['groq', 'gemini', 'rules']
 */
function getProviderChain() {
  if (process.env.AI_PROVIDER_CHAIN && process.env.AI_PROVIDER_CHAIN.trim()) {
    const parsed = process.env.AI_PROVIDER_CHAIN.split(',')
      .map((p) => p.toLowerCase().trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  const primary = getActiveProviderName();
  if (primary === 'mock') {
    return ['mock', 'rules'];
  }
  if (primary === 'groq') {
    return ['groq', 'gemini', 'rules'];
  }
  if (primary === 'gemini') {
    return ['gemini', 'groq', 'rules'];
  }

  return [primary, 'rules'].filter(Boolean);
}

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
 * Timeout wrapper for promises
 */
function withTimeout(promise, ms, description = 'Operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${description} timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Sleep with exponential backoff and jitter
 */
function waitWithJitter(attempt, baseDelay = 300, maxDelay = 2000) {
  const expDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
  // Full jitter: between 80% and 120% of exponential delay
  const jitterFactor = 0.8 + Math.random() * 0.4;
  const delay = Math.round(expDelay * jitterFactor);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ==========================================
// Core Execution Functions
// ==========================================

/**
 * Executes a structured completion across the provider fallback chain.
 */
async function callAiWithQuotaAndRetry({
  systemPrompt,
  userPrompt,
  mode = 'parse',
  userId = null,
  validateFn = null,
  model = null,
  timeoutMs = CIRCUIT_CONFIG.defaultTimeoutMs,
  skipQuota = false,
}) {
  // 1. Feature flag check
  if (!isAiFeatureEnabled(mode)) {
    return {
      success: false,
      status: 'disabled',
      error: `AI feature '${mode}' is currently disabled by administrator.`,
    };
  }

  // 2. Configuration check
  if (!isAiConfigured()) {
    return {
      success: false,
      status: 'disabled',
      error: 'AI service is not configured or disabled.',
    };
  }

  // 3. Daily Quota Check (MongoDB persisted) - skipped if skipQuota or assistant_title
  if (!skipQuota && mode !== 'assistant_title') {
    try {
      const quotaCheck = await AiUsage.canMakeCall(userId, mode);
      if (!quotaCheck.allowed) {
        await AiCallLog.logCall({
          feature: mode,
          provider: getActiveProviderName(),
          status: 'rate_limited',
          errorMessage: quotaCheck.message || 'Daily AI call limit reached.',
          userId,
        });

        return {
          success: false,
          status: 'rate_limited',
          error: quotaCheck.message || 'Daily AI call limit reached.',
        };
      }
    } catch (quotaErr) {
      console.warn('[AI Service] Quota check error:', quotaErr.message);
    }
  }

  // Helper for JSON parsing & validation
  const parseAndValidate = (raw) => {
    if (mode === 'career' || mode === 'text' || mode === 'assistant_title') {
      return raw;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
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

  const chain = getProviderChain();
  let lastError = null;
  let hasRateLimitedError = false;

  for (let chainIdx = 0; chainIdx < chain.length; chainIdx++) {
    const providerName = chain[chainIdx];
    const isFallback = chainIdx > 0;

    // If provider is 'rules', we have reached the end of LLM chain
    if (providerName === 'rules') {
      break;
    }

    const providerInstance = resolveProviderInstance(providerName);
    if (!providerInstance) {
      continue;
    }

    // Circuit breaker check
    if (isCircuitOpen(providerName)) {
      console.warn(`[AI Service] Provider '${providerName}' circuit is OPEN. Bypassing to next provider.`);
      await AiCallLog.logCall({
        feature: mode,
        provider: providerName,
        status: 'fallback',
        errorMessage: 'Circuit breaker is OPEN; bypassed.',
        circuitBreakerTripped: true,
        userId,
      });
      continue;
    }

    const selectedModel =
      model ||
      (mode === 'assistant'
        ? process.env.AI_MODEL_FAST || process.env.AI_MODEL
        : process.env.AI_MODEL) ||
      'default';

    // Provider retry loop (up to 2 attempts with exponential backoff & jitter)
    for (let attempt = 1; attempt <= 2; attempt++) {
      const startTime = Date.now();
      try {
        const rawText = await withTimeout(
          providerInstance.generateCompletion({
            systemPrompt,
            userPrompt,
            mode,
            model: selectedModel,
          }),
          timeoutMs,
          `Provider '${providerName}' completion`
        );

        const latencyMs = Date.now() - startTime;
        const validatedData = parseAndValidate(rawText);

        // Record circuit breaker success
        recordCircuitSuccess(providerName);

        // Record usage in daily quota tracker (skipped if skipQuota or assistant_title)
        if (!skipQuota && mode !== 'assistant_title' && userId) {
          try {
            await AiUsage.recordCall(userId, mode);
          } catch (recErr) {
            console.warn('[AI Service] Failed to record usage:', recErr.message);
          }
        }

        // Telemetry logging
        await AiCallLog.logCall({
          feature: mode,
          provider: providerName,
          model: selectedModel,
          status: isFallback ? 'fallback' : 'success',
          latencyMs,
          promptText: `${systemPrompt} ${userPrompt}`,
          completionText: rawText,
          userId,
        });

        return {
          success: true,
          data: validatedData,
          rawText,
          model: selectedModel,
          provider: providerName,
          fallbackUsed: isFallback,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err;

        const isRateLimited =
          err.status === 429 ||
          err.statusCode === 429 ||
          (err.message && err.message.includes('429')) ||
          (err.message && err.message.toLowerCase().includes('rate limit'));

        // Log error telemetry
        await AiCallLog.logCall({
          feature: mode,
          provider: providerName,
          model: selectedModel,
          status: isRateLimited ? 'rate_limited' : 'failed',
          latencyMs,
          promptText: `${systemPrompt} ${userPrompt}`,
          errorMessage: err.message,
          userId,
        });

        logAiError(err, {
          provider: providerName,
          feature: mode,
          model: selectedModel,
          latencyMs,
        });

        if (isRateLimited) {
          hasRateLimitedError = true;
          recordCircuitFailure(providerName);
          // Break attempt loop to move immediately to fallback provider in chain
          break;
        }

        // On first JSON parse error, retry with jitter
        if (attempt === 1 && !err.message.includes('timed out')) {
          await waitWithJitter(attempt);
          continue;
        }

        // On timeout or persistent error, record circuit failure and try next provider
        recordCircuitFailure(providerName);
        break;
      }
    }
  }

  // If rate-limited across all attempts
  if (hasRateLimitedError) {
    return {
      success: false,
      status: 'rate_limited',
      error: lastError?.message || 'Daily AI quota exceeded or provider rate limit reached.',
    };
  }

  // If all LLM providers failed, return fallback status to caller
  return {
    success: false,
    status: 'fallback',
    fallback: true,
    error: lastError?.message || 'All AI providers in fallback chain failed. Offline rules required.',
  };
}

/**
 * Executes a multi-turn chat completion with tools under fallback & quota checks
 */
async function callAiChatWithTools({
  messages = [],
  tools = [],
  userId = null,
  role = null,
  model = null,
  temperature = 0.2,
  recordUsage = true,
  timeoutMs = CIRCUIT_CONFIG.defaultTimeoutMs,
}) {
  // 1. Feature flag check
  if (!isAiFeatureEnabled('assistant')) {
    return {
      success: false,
      status: 'disabled',
      error: 'AI Assistant feature is currently disabled by administrator.',
    };
  }

  // 2. Configuration check
  if (!isAiConfigured()) {
    return {
      success: false,
      status: 'disabled',
      error: 'AI service is not configured or disabled.',
    };
  }

  // 3. Quota check
  try {
    const quotaCheck = await AiUsage.canMakeCall(userId, 'chat', role);
    if (!quotaCheck.allowed) {
      await AiCallLog.logCall({
        feature: 'chat',
        provider: getActiveProviderName(),
        status: 'rate_limited',
        errorMessage: quotaCheck.message || 'Daily AI chat quota reached.',
        userId,
      });

      return {
        success: false,
        status: 'rate_limited',
        error: quotaCheck.message || 'Daily AI chat quota reached.',
      };
    }
  } catch (quotaErr) {
    console.warn('[AI Service] Chat quota check failed:', quotaErr.message);
  }

  const chain = getProviderChain();
  let lastError = null;

  for (let chainIdx = 0; chainIdx < chain.length; chainIdx++) {
    const providerName = chain[chainIdx];
    if (providerName === 'rules') break;

    const providerInstance = resolveProviderInstance(providerName);
    if (!providerInstance) continue;

    if (isCircuitOpen(providerName)) {
      continue;
    }

    const selectedModel =
      model || process.env.AI_MODEL_FAST || process.env.AI_MODEL || 'default';

    const startTime = Date.now();
    try {
      let result;
      if (typeof providerInstance.generateChatCompletionWithTools === 'function') {
        result = await withTimeout(
          providerInstance.generateChatCompletionWithTools({
            messages,
            tools,
            model: selectedModel,
            temperature,
          }),
          timeoutMs,
          `Provider '${providerName}' chat`
        );
      } else {
        const lastUser = messages.filter((m) => m.role === 'user').pop();
        const rawText = await withTimeout(
          providerInstance.generateCompletion({
            systemPrompt: messages[0]?.content || '',
            userPrompt: lastUser?.content || '',
            model: selectedModel,
          }),
          timeoutMs,
          `Provider '${providerName}' chat completion`
        );
        result = { content: rawText, toolCalls: [] };
      }

      const latencyMs = Date.now() - startTime;
      recordCircuitSuccess(providerName);

      if (recordUsage && userId) {
        try {
          await AiUsage.recordCall(userId, 'chat');
        } catch (recErr) {
          console.warn('[AI Service] Failed to record chat usage:', recErr.message);
        }
      }

      await AiCallLog.logCall({
        feature: 'chat',
        provider: providerName,
        model: selectedModel,
        status: chainIdx > 0 ? 'fallback' : 'success',
        latencyMs,
        promptText: messages.map((m) => m.content).join(' '),
        completionText: result.content || '',
        userId,
      });

      return {
        success: true,
        content: result.content || '',
        toolCalls: result.toolCalls || [],
        message: result.message,
        provider: providerName,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      lastError = err;
      recordCircuitFailure(providerName);

      await AiCallLog.logCall({
        feature: 'chat',
        provider: providerName,
        model: selectedModel,
        status: 'failed',
        latencyMs,
        promptText: messages.map((m) => m.content).join(' '),
        errorMessage: err.message,
        userId,
      });

      logAiError(err, {
        provider: providerName,
        feature: 'chat',
        model: selectedModel,
        latencyMs,
      });
    }
  }

  return {
    success: false,
    status: 'failed',
    error: lastError?.message || 'AI chat completion failed across all providers.',
  };
}

module.exports = {
  getActiveProviderName,
  getProvider,
  getProviderChain,
  isAiConfigured,
  getCircuitBreakerStatus,
  resetCircuitBreakers,
  recordCircuitFailure,
  recordCircuitSuccess,
  isCircuitOpen,
  withTimeout,
  waitWithJitter,
  callAiWithQuotaAndRetry,
  callAiChatWithTools,
  CIRCUIT_CONFIG,
};
