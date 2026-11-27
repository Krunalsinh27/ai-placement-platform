/**
 * Production-Grade AI Client Coordinator
 *
 * Implements:
 * 1. Resilient Provider Fallback Chain (e.g. groq -> gemini -> rules)
 * 2. Per-provider Circuit Breaker with automatic cooldown and half-open probing
 * 3. Configurable timeout per call bounded by AI_REQUEST_TIMEOUT_MS
 * 4. Exponential backoff retry with full jitter
 * 5. PII-Free Telemetry logging to AiCallLog and Sentry error hooks
 * 6. Granular per-feature flag enforcement
 * 7. Strict provider-credential segregation and model compatibility checks
 * 8. Authentication and Bad Request errors fail fast without unwanted fallback
 */

const mockProvider = require('./providers/mockProvider');
const groqProvider = require('./providers/groqProvider');
const geminiProvider = require('./providers/geminiProvider');
const AiUsage = require('../../models/AiUsage');
const AiCallLog = require('../../models/AiCallLog');
const { logAiError } = require('../../utils/aiErrorLogger');
const { isAiFeatureEnabled } = require('../../utils/featureFlags');
const {
  getPrimaryProvider,
  getGroqConfig,
  getGeminiConfig,
  getProviderConfig,
  resolveModelForProvider,
  isFallbackEnabled,
  getResolvedProviderChain,
  isAiConfigured,
  getRequestTimeoutMs,
  sanitizeProviderError,
  DEFAULT_TIMEOUT_MS,
} = require('./aiConfig');

// ==========================================
// Circuit Breaker State & Constants
// ==========================================
const CIRCUIT_CONFIG = {
  failureThreshold: 3, // Consecutive failures before tripping
  cooldownMs: 60_000,  // Cooldown time before probing (60 seconds)
  defaultTimeoutMs: getRequestTimeoutMs(),
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
  return getPrimaryProvider();
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
 */
function getProviderChain() {
  return getResolvedProviderChain();
}

/**
 * Timeout wrapper for promises
 */
function withTimeout(promise, ms, description = 'Operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${description} timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      err.status = 504;
      err.statusCode = 504;
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
  timeoutMs = null,
  skipQuota = false,
  temperature = 0.1,
  abortSignal = null,
  isAborted = null,
  allowProviderResolution = false,
}) {
  const effectiveTimeoutMs = timeoutMs || getRequestTimeoutMs();
  const isCancelled = () => Boolean(abortSignal?.aborted || (typeof isAborted === 'function' && isAborted()));

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

    const providerConfig = getProviderConfig(providerName);
    if (!providerConfig.configured) {
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

    // Resolve compatible model for this specific provider (guards against cross-provider model pollution)
    let selectedModel;
    try {
      selectedModel = resolveModelForProvider(providerName, model, {
        useFast: mode === 'assistant',
        isFallback,
        allowProviderResolution: Boolean(allowProviderResolution),
      });
    } catch (modelErr) {
      // Incompatible explicit model request must fail fast without silent substitution
      return {
        success: false,
        status: 'failed',
        code: modelErr.code || 'INVALID_REQUEST',
        error: modelErr.message,
      };
    }

    // Provider retry loop (up to 2 attempts with exponential backoff & jitter)
    let shouldTryNextProviderInChain = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const startTime = Date.now();
      try {
        const completionResult = await withTimeout(
          providerInstance.generateCompletion({
            systemPrompt,
            userPrompt,
            mode,
            model: selectedModel,
            temperature,
            apiKey: providerConfig.apiKey,
            timeoutMs: effectiveTimeoutMs,
            returnMeta: true,
          }),
          effectiveTimeoutMs,
          `Provider '${providerName}' completion`
        );

        let rawText = '';
        let tokenUsage = null;
        let actualModel = selectedModel;

        if (typeof completionResult === 'object' && completionResult !== null && typeof completionResult.text === 'string') {
          rawText = completionResult.text;
          tokenUsage = completionResult.usage || null;
          if (completionResult.model) actualModel = completionResult.model;
        } else if (typeof completionResult === 'string') {
          rawText = completionResult;
        } else {
          rawText = String(completionResult || '');
        }

        const latencyMs = Date.now() - startTime;
        const validatedData = parseAndValidate(rawText);

        // Record circuit breaker success
        recordCircuitSuccess(providerName);

        // Record usage in daily quota tracker (recorded ONCE upon success, no double-counting on fallback)
        if (!skipQuota && mode !== 'assistant_title' && userId && !isCancelled()) {
          try {
            await AiUsage.recordCall(userId, mode);
          } catch (recErr) {
            console.warn('[AI Service] Failed to record usage:', recErr.message);
          }
        }

        // Telemetry logging with accurate provider, model, and token metrics
        await AiCallLog.logCall({
          feature: mode,
          provider: providerName,
          model: actualModel,
          status: isFallback ? 'fallback' : 'success',
          latencyMs,
          promptText: `${systemPrompt} ${userPrompt}`,
          completionText: rawText,
          promptTokens: tokenUsage?.promptTokens || null,
          completionTokens: tokenUsage?.completionTokens || null,
          userId,
        });

        return {
          success: true,
          data: validatedData,
          rawText,
          model: actualModel,
          provider: providerName,
          fallbackUsed: isFallback,
          usage: tokenUsage,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err;
        const cleanErrMsg = sanitizeProviderError(err, providerName);

        // Classify Error Type
        const isAuthError =
          err.code === 'AUTHENTICATION_ERROR' ||
          err.isAuthError ||
          err.status === 401 ||
          err.status === 403 ||
          err.statusCode === 401 ||
          err.statusCode === 403;

        const isClientError =
          err.code === 'INVALID_REQUEST' ||
          err.isClientError ||
          err.status === 400 ||
          err.status === 404 ||
          err.statusCode === 400 ||
          err.statusCode === 404;

        const isRateLimited =
          err.code === 'RATE_LIMIT' ||
          err.isRateLimit ||
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
          errorMessage: cleanErrMsg,
          userId,
        });

        logAiError(err, {
          provider: providerName,
          feature: mode,
          model: selectedModel,
          latencyMs,
        });

        // 1. Authentication Failures: FAIL FAST. Do NOT trigger fallback (Constraint 4)
        if (isAuthError) {
          recordCircuitFailure(providerName);
          return {
            success: false,
            status: 'failed',
            code: 'AUTHENTICATION_ERROR',
            error: `AI provider '${providerName}' authentication failed. Check credentials: ${cleanErrMsg}`,
          };
        }

        // 2. Client / Bad Request / Model Not Found: FAIL FAST. Do NOT trigger fallback (Constraint 4)
        if (isClientError) {
          return {
            success: false,
            status: 'failed',
            code: 'INVALID_REQUEST',
            error: `AI provider '${providerName}' rejected request (4xx): ${cleanErrMsg}`,
          };
        }

        // 3. Rate Limits: Eligible for fallback to secondary provider
        if (isRateLimited) {
          hasRateLimitedError = true;
          recordCircuitFailure(providerName);
          shouldTryNextProviderInChain = true;
          break; // Break attempt loop, advance to next provider in chain
        }

        // 4. On first JSON parse error, retry with jitter
        if (attempt === 1 && !err.message.includes('timed out') && !err.message.includes('ETIMEDOUT')) {
          await waitWithJitter(attempt);
          continue;
        }

        // 5. On timeout (504/ETIMEDOUT) or 5xx server error, record failure and try next provider
        recordCircuitFailure(providerName);
        shouldTryNextProviderInChain = true;
        break;
      }
    }

    if (shouldTryNextProviderInChain) {
      continue;
    }
  }

  // If rate-limited across all attempts
  if (hasRateLimitedError) {
    return {
      success: false,
      status: 'rate_limited',
      error: sanitizeProviderError(lastError?.message || 'Daily AI quota exceeded or provider rate limit reached.'),
    };
  }

  // If all LLM providers failed, return fallback status to caller
  return {
    success: false,
    status: 'fallback',
    fallback: true,
    error: sanitizeProviderError(lastError?.message || 'All AI providers in fallback chain failed. Offline rules required.'),
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
  timeoutMs = null,
  allowProviderResolution = false,
}) {
  const effectiveTimeoutMs = timeoutMs || getRequestTimeoutMs();

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

    const providerConfig = getProviderConfig(providerName);
    if (!providerConfig.configured) continue;

    if (isCircuitOpen(providerName)) {
      continue;
    }

    let selectedModel;
    try {
      selectedModel = resolveModelForProvider(providerName, model, {
        useFast: true,
        isFallback: chainIdx > 0,
        allowProviderResolution: Boolean(allowProviderResolution),
      });
    } catch (modelErr) {
      return {
        success: false,
        status: 'failed',
        code: modelErr.code || 'INVALID_REQUEST',
        error: modelErr.message,
      };
    }
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
            apiKey: providerConfig.apiKey,
            timeoutMs: effectiveTimeoutMs,
          }),
          effectiveTimeoutMs,
          `Provider '${providerName}' chat`
        );
      } else {
        const lastUser = messages.filter((m) => m.role === 'user').pop();
        const rawText = await withTimeout(
          providerInstance.generateCompletion({
            systemPrompt: messages[0]?.content || '',
            userPrompt: lastUser?.content || '',
            model: selectedModel,
            apiKey: providerConfig.apiKey,
            timeoutMs: effectiveTimeoutMs,
          }),
          effectiveTimeoutMs,
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

      const actualModel = result.model || selectedModel;

      await AiCallLog.logCall({
        feature: 'chat',
        provider: providerName,
        model: actualModel,
        status: chainIdx > 0 ? 'fallback' : 'success',
        latencyMs,
        promptText: messages.map((m) => m.content).join(' '),
        completionText: result.content || '',
        promptTokens: result.usage?.promptTokens || null,
        completionTokens: result.usage?.completionTokens || null,
        userId,
      });

      return {
        success: true,
        content: result.content || '',
        toolCalls: result.toolCalls || [],
        message: result.message,
        provider: providerName,
        model: actualModel,
        usage: result.usage || null,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      lastError = err;
      const cleanErrMsg = sanitizeProviderError(err, providerName);

      const isAuthError =
        err.code === 'AUTHENTICATION_ERROR' ||
        err.isAuthError ||
        err.status === 401 ||
        err.status === 403 ||
        err.statusCode === 401 ||
        err.statusCode === 403;

      const isClientError =
        err.code === 'INVALID_REQUEST' ||
        err.isClientError ||
        err.status === 400 ||
        err.status === 404 ||
        err.statusCode === 400 ||
        err.statusCode === 404;

      recordCircuitFailure(providerName);

      await AiCallLog.logCall({
        feature: 'chat',
        provider: providerName,
        model: selectedModel,
        status: 'failed',
        latencyMs,
        promptText: messages.map((m) => m.content).join(' '),
        errorMessage: cleanErrMsg,
        userId,
      });

      logAiError(err, {
        provider: providerName,
        feature: 'chat',
        model: selectedModel,
        latencyMs,
      });

      // Authentication or Bad Request error: fail fast without automatic fallback (Constraint 4)
      if (isAuthError) {
        return {
          success: false,
          status: 'failed',
          code: 'AUTHENTICATION_ERROR',
          error: `AI provider '${providerName}' authentication failed: ${cleanErrMsg}`,
        };
      }

      if (isClientError) {
        return {
          success: false,
          status: 'failed',
          code: 'INVALID_REQUEST',
          error: `AI provider '${providerName}' bad request: ${cleanErrMsg}`,
        };
      }
    }
  }

  return {
    success: false,
    status: 'failed',
    error: sanitizeProviderError(lastError?.message || 'AI chat completion failed across all providers.'),
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
