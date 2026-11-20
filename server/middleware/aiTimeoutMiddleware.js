/**
 * AI Request Budget Middleware
 *
 * Enforces a strict total execution budget on heavy AI endpoints
 * (such as resume analyze, tailor, and cover letter).
 *
 * If processing exceeds the budget (default: 60,000ms / 60 seconds; overridable via AI_REQUEST_TIMEOUT_MS),
 * responds with HTTP 504 Gateway Timeout and:
 * { success: false, message: "The AI took too long. Your quota was not used." }
 *
 * It attaches req.abortSignal and req.timedOut so handlers and AI clients
 * abort gracefully and never consume user quota on timeout.
 */
const aiRequestBudget = (timeoutMs = 60000) => {
  return (req, res, next) => {
    const envTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS);
    const effectiveTimeout = !isNaN(envTimeout) && envTimeout > 0 ? envTimeout : timeoutMs;

    let timedOut = false;
    const abortController = new AbortController();
    req.abortSignal = abortController.signal;
    req.isAborted = () => timedOut || abortController.signal.aborted;

    const timer = setTimeout(() => {
      timedOut = true;
      req.timedOut = true;
      try {
        abortController.abort();
      } catch (_) {}

      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          message: 'The AI took too long. Your quota was not used.',
        });
      }
    }, effectiveTimeout);

    res.on('finish', () => {
      clearTimeout(timer);
    });

    res.on('close', () => {
      clearTimeout(timer);
    });

    next();
  };
};

module.exports = {
  aiRequestBudget,
};
