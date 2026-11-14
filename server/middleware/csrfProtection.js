const { parseAllowedOrigins, isOriginAllowed } = require('../utils/corsConfig');

/**
 * CSRF Protection Middleware for sensitive cookie-based endpoints (/refresh, /logout).
 * Verifies:
 * 1. Required custom header (e.g. X-Requested-With: XMLHttpRequest or X-CSRF-Protection)
 *    Browsers cannot send custom headers in cross-origin simple form submissions or <img>/<script> tags.
 * 2. Origin check (when present) matches allowed client origins.
 */
const csrfProtection = (req, res, next) => {
  // Check required custom header
  const customHeader =
    req.headers['x-requested-with'] ||
    req.headers['x-csrf-protection'] ||
    req.headers['x-csrf-token'];

  if (!customHeader) {
    return res.status(403).json({
      success: false,
      message: 'CSRF protection: Missing required custom header (X-Requested-With)',
    });
  }

  // Check Origin/Referer header when provided
  const rawOrigin = req.headers.origin || req.headers.referer;
  if (rawOrigin) {
    let originToTest = rawOrigin;
    try {
      if (rawOrigin.startsWith('http://') || rawOrigin.startsWith('https://')) {
        originToTest = new URL(rawOrigin).origin;
      }
    } catch (_) {}

    const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isOriginAllowed(originToTest, allowedOrigins, isProduction)) {
      return res.status(403).json({
        success: false,
        message: 'CSRF protection: Invalid or untrusted request origin',
      });
    }
  }

  next();
};

module.exports = csrfProtection;

