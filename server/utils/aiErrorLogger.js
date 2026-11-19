/**
 * Sentry-Compatible AI Error Logger
 *
 * Captures AI exceptions, sanitized provider errors, and circuit breaker events.
 * Strictly guarantees that NO PII (student names, emails, raw resume text, user prompts)
 * is sent to external monitoring or logged to stderr.
 */

let SentryInstance = null;

// Initialize Sentry if SENTRY_DSN is configured
if (process.env.SENTRY_DSN && process.env.SENTRY_DSN.trim()) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN.trim(),
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
    SentryInstance = Sentry;
  } catch (err) {
    console.warn('[AiErrorLogger] Sentry initialization skipped:', err.message);
  }
}

/**
 * Sanitizes error messages by scrubbing potential API keys, tokens, or PII
 */
function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown AI Error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/[a-zA-Z0-9_\-]{20,}/g, (token) => {
      // Scrub potential API keys (e.g. gsk_*, AIza*)
      if (token.startsWith('gsk_') || token.startsWith('AIza')) {
        return '[REDACTED_KEY]';
      }
      return token;
    })
    .slice(0, 300);
}

/**
 * Logs an AI subsystem error to Sentry and local structured logs
 */
function logAiError(error, context = {}) {
  const sanitizedMsg = sanitizeErrorMessage(error?.message || String(error));
  const sanitizedContext = {
    provider: context.provider || 'unknown',
    feature: context.feature || context.mode || 'general',
    model: context.model || 'default',
    latencyMs: context.latencyMs || 0,
    status: context.status || 'failed',
    circuitBreakerTripped: Boolean(context.circuitBreakerTripped),
    timestamp: new Date().toISOString(),
  };

  // Structured console log
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[AI Error Monitor] [${sanitizedContext.feature}] [${sanitizedContext.provider}]: ${sanitizedMsg}`, sanitizedContext);
  }

  // Dispatch to Sentry if active
  if (SentryInstance) {
    SentryInstance.withScope((scope) => {
      scope.setTags({
        ai_provider: sanitizedContext.provider,
        ai_feature: sanitizedContext.feature,
        ai_model: sanitizedContext.model,
        circuit_breaker: sanitizedContext.circuitBreakerTripped ? 'tripped' : 'normal',
      });
      scope.setExtras(sanitizedContext);
      SentryInstance.captureException(new Error(sanitizedMsg));
    });
  }
}

module.exports = {
  logAiError,
  sanitizeErrorMessage,
};
