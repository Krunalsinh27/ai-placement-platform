/**
 * CORS Configuration and Validation Utilities
 *
 * Rules:
 * 1. In production, wildcard '*' or wildcard patterns (e.g. '*.domain.com')
 *    are STRICTLY FORBIDDEN when credentials: true is enabled. Startup must fail.
 * 2. In non-production (development, test), validated wildcard patterns are allowed.
 */

function validateCorsConfig(clientUrl, nodeEnv = process.env.NODE_ENV) {
  const isProduction = nodeEnv === 'production';

  if (!clientUrl || clientUrl.trim() === '') {
    if (isProduction) {
      throw new Error('FATAL: CLIENT_URL environment variable is required in production.');
    }
    return;
  }

  const origins = clientUrl
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (isProduction) {
    for (const origin of origins) {
      if (origin === '*' || origin.includes('*')) {
        throw new Error(
          `FATAL: Wildcard CORS origin "${origin}" is strictly forbidden in production with credentials: true.`
        );
      }
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        throw new Error(
          `FATAL: Localhost origin "${origin}" is not permitted in production environment.`
        );
      }
    }
  } else {
    // In development/test, validate that wildcard patterns have valid structure
    for (const origin of origins) {
      if (origin !== '*' && origin.includes('*')) {
        // e.g. https://*.vercel.app or http://localhost:*
        const hasValidProtocol = /^https?:\/\//i.test(origin);
        if (!hasValidProtocol) {
          throw new Error(`Invalid wildcard pattern "${origin}". Pattern must include http:// or https:// protocol.`);
        }
      }
    }
  }
}

function parseAllowedOrigins(clientUrl) {
  if (!clientUrl) return ['http://localhost:5173'];
  return clientUrl
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins, isProduction = process.env.NODE_ENV === 'production') {
  // If no origin header is provided (e.g. same-origin request, curl, postman, server-to-server), allow it
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/+$/, '').toLowerCase();

  return allowedOrigins.some((allowed) => {
    const normalizedAllowed = allowed.trim().replace(/\/+$/, '').toLowerCase();

    // Direct match
    if (normalizedAllowed === normalizedOrigin) return true;

    // In production, wildcards are strictly prohibited
    if (isProduction) return false;

    // In non-production, permit validated wildcards
    if (normalizedAllowed === '*') return true;
    if (normalizedAllowed.includes('*')) {
      const regexPattern =
        '^' +
        normalizedAllowed
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$';
      const regex = new RegExp(regexPattern, 'i');
      return regex.test(normalizedOrigin);
    }

    return false;
  });
}

module.exports = {
  validateCorsConfig,
  parseAllowedOrigins,
  isOriginAllowed,
};

