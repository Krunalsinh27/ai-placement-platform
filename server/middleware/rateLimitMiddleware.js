const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { isRedisConfigured, getRedisClient } = require('../config/redis');

const isTestEnv = () => process.env.NODE_ENV === 'test';

/**
 * Build Redis store for rate limiter when Redis is configured.
 * Gracefully returns undefined (falling back to MemoryStore) when Redis is unset.
 */
const createRedisStore = (prefix) => {
  if (!isRedisConfigured()) {
    return undefined;
  }
  const client = getRedisClient();
  if (!client) {
    return undefined;
  }
  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix,
  });
};

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

/**
 * Helper to generate per-user rate limiting key for authenticated routes.
 * Uses req.user._id if authenticated; gracefully falls back to IP if user is missing.
 */
const normalizeUserKey = (prefix, req) => {
  const userId = req.user?._id?.toString() || req.user?.id?.toString();
  if (userId) {
    return `${prefix}:user:${userId}`;
  }
  return `${prefix}:ip:${req.ip || 'unknown'}`;
};

// Login rate limiter: 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: isTestEnv,
  store: createRedisStore('rl:login:'),
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authenticated user API rate limiter: 120 requests per minute per user (falls back to IP if unauthenticated)
const userApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  skip: isTestEnv,
  store: createRedisStore('rl:user_api:'),
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeUserKey('user_api', req),
  message: {
    success: false,
    message: 'Too many requests from this account. Please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Account-keyed login rate limiter: 10 attempts per 15 minutes per target account email
const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  store: createRedisStore('rl:account_login:'),
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
  store: createRedisStore('rl:otp_verify:'),
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
  store: createRedisStore('rl:account_otp:'),
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
  store: createRedisStore('rl:otp_resend:'),
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
  store: createRedisStore('rl:public_api:'),
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Reports rate limiter: 60 requests per 15 minutes per user (falls back to IP if unauthenticated)
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: isTestEnv,
  store: createRedisStore('rl:report:'),
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeUserKey('report', req),
  message: {
    success: false,
    message: 'Too many report requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI endpoints rate limiter: 40 requests per 15 minutes per user (falls back to IP if unauthenticated)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: isTestEnv,
  store: createRedisStore('rl:ai:'),
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeUserKey('ai', req),
  message: {
    success: false,
    message: 'Too many AI requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  createRedisStore,
  normalizeAccountKey,
  normalizeUserKey,
  userApiLimiter,
  loginLimiter,
  accountLoginLimiter,
  otpVerifyLimiter,
  accountOtpLimiter,
  otpResendLimiter,
  publicApiLimiter,
  reportLimiter,
  aiLimiter,
};
