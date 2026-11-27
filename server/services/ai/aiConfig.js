/**
 * Centralized AI Provider Configuration System
 *
 * Implements:
 * 1. Provider-specific configuration isolation (Groq, Gemini, Mock, Rules).
 * 2. Strict credential segregation (no provider ever receives another provider's API key).
 * 3. Model compatibility guards (no provider ever receives an incompatible model name).
 * 4. Separate model configuration for Chat, OCR/Vision, and Embeddings.
 * 5. Safe fallback validation (only configured secondary providers with their own credentials can be in the chain).
 * 6. Credential & key sanitization for error messages and telemetry.
 */

const { redactPII } = require('./redactor');

const DEFAULT_TIMEOUT_MS = 12000;
const MIN_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 60000;

/**
 * Resolves request timeout in ms with bounds checking
 */
function getRequestTimeoutMs() {
  const parsed = parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/**
 * Gets the primary configured provider name
 * Defaults to 'none' if unset or invalid.
 * 'mock' is forbidden in production environments.
 *
 * @returns {'groq' | 'gemini' | 'mock' | 'rules' | 'none'}
 */
function getPrimaryProvider() {
  const raw = (process.env.AI_PROVIDER || 'none').toLowerCase().trim();

  if (['groq', 'gemini', 'mock', 'rules', 'none'].includes(raw)) {
    return raw;
  }

  return 'none';
}

/**
 * Groq-specific configuration
 */
function getGroqConfig() {
  const primary = (process.env.AI_PROVIDER || '').toLowerCase().trim();

  // Strict API key resolution:
  // Primary: GROQ_API_KEY
  // Backward compatibility: AI_API_KEY ONLY IF AI_PROVIDER is explicitly 'groq'
  let apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
  if (!apiKey && primary === 'groq' && process.env.AI_API_KEY) {
    apiKey = process.env.AI_API_KEY.trim();
  }

  let model = process.env.GROQ_MODEL ? process.env.GROQ_MODEL.trim() : '';
  if (!model && primary === 'groq' && process.env.AI_MODEL) {
    // Only inherit AI_MODEL if it does not look like a Gemini model
    if (!process.env.AI_MODEL.toLowerCase().includes('gemini')) {
      model = process.env.AI_MODEL.trim();
    }
  }
  if (!model) {
    model = 'llama-3.3-70b-versatile';
  }

  let modelFast = process.env.GROQ_MODEL_FAST ? process.env.GROQ_MODEL_FAST.trim() : '';
  if (!modelFast && primary === 'groq' && process.env.AI_MODEL_FAST) {
    if (!process.env.AI_MODEL_FAST.toLowerCase().includes('gemini')) {
      modelFast = process.env.AI_MODEL_FAST.trim();
    }
  }
  if (!modelFast) {
    modelFast = 'llama-3.1-8b-instant';
  }

  return {
    name: 'groq',
    apiKey,
    model,
    modelFast,
    endpoint: process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',
    configured: Boolean(apiKey),
  };
}

/**
 * Gemini-specific configuration
 * Supports separate models for Chat, OCR/Vision, and Embeddings.
 */
function getGeminiConfig() {
  const primary = (process.env.AI_PROVIDER || '').toLowerCase().trim();

  // Strict API key resolution:
  // Primary: GEMINI_API_KEY
  // Backward compatibility: AI_API_KEY ONLY IF AI_PROVIDER is explicitly 'gemini'
  let apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  if (!apiKey && primary === 'gemini' && process.env.AI_API_KEY) {
    apiKey = process.env.AI_API_KEY.trim();
  }

  let model = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : '';
  if (!model && primary === 'gemini' && process.env.AI_MODEL) {
    // Only inherit AI_MODEL if it looks like a Gemini model
    if (process.env.AI_MODEL.toLowerCase().includes('gemini')) {
      model = process.env.AI_MODEL.trim();
    }
  }
  if (!model) {
    model = 'gemini-1.5-flash';
  }

  let modelFast = process.env.GEMINI_MODEL_FAST ? process.env.GEMINI_MODEL_FAST.trim() : '';
  if (!modelFast && primary === 'gemini' && process.env.AI_MODEL_FAST) {
    if (process.env.AI_MODEL_FAST.toLowerCase().includes('gemini')) {
      modelFast = process.env.AI_MODEL_FAST.trim();
    }
  }
  if (!modelFast) {
    modelFast = model;
  }

  // Vision / OCR Model configuration (separate from text chat)
  const modelOcr = (process.env.GEMINI_MODEL_OCR || model).trim();

  // Embedding Model configuration (separate from text chat)
  const modelEmbedding = (process.env.GEMINI_MODEL_EMBEDDING || 'text-embedding-004').trim();

  return {
    name: 'gemini',
    apiKey,
    model,
    modelFast,
    modelOcr,
    modelEmbedding,
    configured: Boolean(apiKey),
  };
}

/**
 * Returns configuration specific to a provider name
 *
 * @param {'groq' | 'gemini' | 'mock' | 'rules'} providerName
 * @returns {object} Provider configuration object
 */
function getProviderConfig(providerName) {
  const norm = (providerName || '').toLowerCase().trim();
  switch (norm) {
    case 'groq':
      return getGroqConfig();
    case 'gemini':
      return getGeminiConfig();
    case 'mock':
      return {
        name: 'mock',
        apiKey: 'mock-key',
        model: 'mock-deterministic',
        modelFast: 'mock-deterministic',
        configured: process.env.NODE_ENV !== 'production',
      };
    case 'rules':
      return {
        name: 'rules',
        apiKey: '',
        model: 'rule-based-dictionary',
        modelFast: 'rule-based-dictionary',
        configured: true,
      };
    default:
      return {
        name: norm,
        apiKey: '',
        model: '',
        modelFast: '',
        configured: false,
      };
  }
}

/**
 * Resolves an appropriate, compatible model name for the given provider.
 * Guards against cross-provider model pollution.
 *
 * Requirements:
 * 1. Default resolution: when requestedModel is null/empty, uses target provider's configured model.
 * 2. Provider-specific fallback: when isFallback is true, automatically switches to the fallback provider's model.
 * 3. Incompatible explicit request: if caller explicitly specifies an incompatible model (e.g. gemini on groq or llama on gemini)
 *    and allowProviderResolution is NOT true (and isFallback is false), throws an explicit INVALID_REQUEST error.
 *    It does NOT silently substitute!
 *
 * @param {string} providerName - 'groq' | 'gemini' | 'mock' | 'rules'
 * @param {string|null} [requestedModel] - Model requested by caller
 * @param {boolean|object} [optionsOrUseFast=false] - Options object or boolean for useFast
 * @returns {string} Compatible model name
 * @throws {Error} If explicit requestedModel is incompatible with the provider
 */
function resolveModelForProvider(providerName, requestedModel = null, optionsOrUseFast = false) {
  const normProvider = (providerName || '').toLowerCase().trim();
  const config = getProviderConfig(normProvider);

  let useFast = false;
  let isFallback = false;
  let allowProviderResolution = false;

  if (typeof optionsOrUseFast === 'boolean') {
    useFast = optionsOrUseFast;
  } else if (optionsOrUseFast && typeof optionsOrUseFast === 'object') {
    useFast = Boolean(optionsOrUseFast.useFast);
    isFallback = Boolean(optionsOrUseFast.isFallback);
    allowProviderResolution = Boolean(optionsOrUseFast.allowProviderResolution);
  }

  if (normProvider === 'mock') {
    return 'mock-deterministic';
  }

  if (normProvider === 'rules') {
    return 'rule-based-dictionary';
  }

  const defaultModel = useFast ? config.modelFast : config.model;

  // If no explicit model requested, return provider's configured model
  if (!requestedModel || typeof requestedModel !== 'string' || !requestedModel.trim() || requestedModel === 'default') {
    return defaultModel;
  }

  const req = requestedModel.trim();
  const lowerReq = req.toLowerCase();

  if (normProvider === 'groq') {
    // Check if incompatible (e.g. Gemini models or Claude models)
    const isGeminiModel = lowerReq.includes('gemini');
    const isClaudeModel = lowerReq.includes('claude');

    if (isGeminiModel || isClaudeModel) {
      if (isFallback || allowProviderResolution) {
        return defaultModel;
      }
      const err = new Error(
        `Incompatible model "${req}" explicitly requested for provider "groq". Gemini and Claude models cannot be executed on Groq. To allow automatic substitution, pass allowProviderResolution: true or leave model unset.`
      );
      err.code = 'INVALID_REQUEST';
      err.status = 400;
      err.statusCode = 400;
      err.isClientError = true;
      throw err;
    }
    return req;
  }

  if (normProvider === 'gemini') {
    // Check if incompatible (e.g. Llama, Mixtral, Whisper, Deepseek models, or models starting with openai/)
    const isLlamaModel =
      lowerReq.includes('llama') ||
      lowerReq.includes('mixtral') ||
      lowerReq.includes('whisper') ||
      lowerReq.includes('deepseek') ||
      lowerReq.includes('qwen') ||
      lowerReq.startsWith('openai/');

    if (isLlamaModel) {
      if (isFallback || allowProviderResolution) {
        return defaultModel;
      }
      const err = new Error(
        `Incompatible model "${req}" explicitly requested for provider "gemini". Llama and open-source models cannot be executed on Google Gemini. To allow automatic substitution, pass allowProviderResolution: true or leave model unset.`
      );
      err.code = 'INVALID_REQUEST';
      err.status = 400;
      err.statusCode = 400;
      err.isClientError = true;
      throw err;
    }
    return req;
  }

  return req;
}

/**
 * Determines whether fallback to a secondary provider is enabled.
 * Defaults to true unless explicitly set to 'false'.
 *
 * @returns {boolean}
 */
function isFallbackEnabled() {
  if (process.env.AI_FALLBACK_ENABLED === 'false' || process.env.AI_FALLBACK_ENABLED === '0') {
    return false;
  }
  return true;
}

/**
 * Resolves the ordered provider fallback chain according to deterministic precedence:
 *
 * 1. Master Switch (AI_PROVIDER):
 *    - 'none' or unset: Returns ['rules']. AI is disabled platform-wide.
 *    - 'rules': Returns ['rules']. Offline deterministic matching only.
 *    - 'mock': Returns ['mock', 'rules'].
 *    - 'groq' | 'gemini': Fixed as the primary provider. AI_PROVIDER ALWAYS determines primary.
 * 2. Fallback Master Switch (AI_FALLBACK_ENABLED):
 *    - If 'false' or '0': Fallback to any secondary LLM is strictly disabled. Returns [primary, 'rules'].
 * 3. Secondary Provider Resolution:
 *    - Precedence A (AI_PROVIDER_CHAIN): If explicit chain is set (e.g. "groq,gemini,rules"),
 *      primary is kept as AI_PROVIDER, and subsequent providers are verified:
 *      they must have their OWN credentials configured and not duplicate primary.
 *    - Precedence B (AI_FALLBACK_PROVIDER): If set (and != 'none' and != primary),
 *      and has its OWN credentials configured.
 *    - Precedence C (Auto-pairing): 'groq' pairs with 'gemini', 'gemini' pairs with 'groq',
 *      ONLY if the secondary candidate has its OWN credentials configured.
 * 4. Terminal Fallback: Always includes 'rules' as the terminal safeguard.
 *
 * @returns {string[]} Ordered list of provider names, e.g. ['groq', 'gemini', 'rules']
 */
function getResolvedProviderChain() {
  const primary = getPrimaryProvider();

  if (primary === 'none') {
    return ['rules'];
  }

  if (primary === 'mock') {
    return ['mock', 'rules'];
  }

  if (primary === 'rules') {
    return ['rules'];
  }

  // If fallback is explicitly disabled, strictly only primary and rules
  if (!isFallbackEnabled()) {
    return [primary, 'rules'];
  }

  // Precedence A: Explicit AI_PROVIDER_CHAIN override
  if (process.env.AI_PROVIDER_CHAIN && process.env.AI_PROVIDER_CHAIN.trim()) {
    const rawItems = process.env.AI_PROVIDER_CHAIN.split(',')
      .map((p) => p.toLowerCase().trim())
      .filter(Boolean);

    const chain = [primary];

    for (const item of rawItems) {
      if (item === 'rules' || item === 'none' || item === primary) {
        continue;
      }
      const pConfig = getProviderConfig(item);
      if (pConfig.configured && !chain.includes(item)) {
        chain.push(item);
      }
    }

    chain.push('rules');
    return chain;
  }

  // Precedence B: Explicit AI_FALLBACK_PROVIDER
  let fallbackCandidate = process.env.AI_FALLBACK_PROVIDER
    ? process.env.AI_FALLBACK_PROVIDER.toLowerCase().trim()
    : null;

  // Precedence C: Default auto-pairing
  if (!fallbackCandidate) {
    if (primary === 'groq') fallbackCandidate = 'gemini';
    else if (primary === 'gemini') fallbackCandidate = 'groq';
  }

  const chain = [primary];

  if (
    fallbackCandidate &&
    fallbackCandidate !== primary &&
    fallbackCandidate !== 'none' &&
    fallbackCandidate !== 'rules'
  ) {
    const fbConfig = getProviderConfig(fallbackCandidate);
    // Secondary provider ONLY included if it has its OWN configured credentials
    if (fbConfig.configured) {
      chain.push(fallbackCandidate);
    }
  }

  chain.push('rules');
  return chain;
}

/**
 * Checks whether the primary AI service is configured and ready to accept calls.
 *
 * @returns {boolean}
 */
function isAiConfigured() {
  const primary = getPrimaryProvider();
  if (primary === 'none' || !primary) return false;
  if (primary === 'rules') return true;
  if (primary === 'mock') {
    return process.env.NODE_ENV !== 'production';
  }
  const config = getProviderConfig(primary);
  return Boolean(config.configured);
}

/**
 * Sanitizes provider error messages, ensuring no API keys, Bearer tokens,
 * or URLs with sensitive query parameters leak into logs or client responses.
 *
 * @param {Error|string} err - Error object or string
 * @param {string} [providerName] - Optional provider context
 * @returns {string} Scrubbed error message
 */
function sanitizeProviderError(err, providerName = '') {
  if (!err) return 'Unknown provider error';
  let message = typeof err === 'string' ? err : err.message || 'Unknown provider error';

  // Strip query param API keys: ?key=... or &key=...
  message = message.replace(/[?&]key=[A-Za-z0-9_\-]+/gi, '?key=[REDACTED]');

  // Strip Bearer tokens
  message = message.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');

  // Strip known configured keys if present in message
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.length > 5) {
    message = message.split(groqKey).join('[REDACTED_GROQ_KEY]');
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 5) {
    message = message.split(geminiKey).join('[REDACTED_GEMINI_KEY]');
  }
  const sharedKey = process.env.AI_API_KEY;
  if (sharedKey && sharedKey.length > 5) {
    message = message.split(sharedKey).join('[REDACTED_AI_KEY]');
  }

  // Scrub general PII
  message = redactPII(message);

  return message.slice(0, 500);
}

module.exports = {
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
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
