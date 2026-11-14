const rateLimit = require('express-rate-limit');

const isTestEnv = () => process.env.NODE_ENV === 'test';

// Login rate limiter: 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helper to normalize email key for account-keyed rate limiting (trim, lowercase).
 * Gracefully falls back to IP address if email is invalid or missing.
 */
const normalizeAccountKey = (prefix, rawEmail, fallbackIp) => {
  if (typeof rawEmail === 'string') {
    const normalized = rawEmail.trim().toLowerCase();
    if (normalized) {
      return `${prefix}:${normalized}`;
    }
  }
  return fallbackIp || 'unknown';
};

// Account-keyed login rate limiter: 10 attempts per 15 minutes per target account email
const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeAccountKey('account_login', req.body?.email, req.ip),
  message: {
    success: false,
    message: 'Too many login attempts for this account. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP verify limiter: 25 attempts per 15 minutes per IP
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many verification attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Account-keyed OTP rate limiter: 10 attempts per 15 minutes per target account email
const accountOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeAccountKey('account_otp', req.body?.email, req.ip),
  message: {
    success: false,
    message: 'Too many OTP requests or verification attempts for this account. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP resend & Forgot password limiter: 10 requests per 15 minutes per IP
const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoints rate limiter: 100 requests per 15 minutes per IP
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Reports rate limiter: 60 requests per 15 minutes per IP
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many report requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI endpoints rate limiter: 40 requests per 15 minutes per IP
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many AI requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  normalizeAccountKey,
  loginLimiter,
  accountLoginLimiter,
  otpVerifyLimiter,
  accountOtpLimiter,
  otpResendLimiter,
  publicApiLimiter,
  reportLimiter,
  aiLimiter,
};

