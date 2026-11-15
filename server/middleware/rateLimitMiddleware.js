const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { isRedisConfigured, getRedisClient } = require('../config/redis');

const isTestEnv = () => process.env.NODE_ENV === 'test';

let lastGeneralWarningTs = 0;
let lastFallbackWarningTs = 0;

/**
 * Throttled logger for general limiters: logs at most 1 warning per minute without the URL
 */
const throttledGeneralStoreLogger = {
  error: () => {
    const now = Date.now();
    if (now - lastGeneralWarningTs >= 60000) {
      lastGeneralWarningTs = now;
      console.warn('[RateLimit] Warning: Redis store unreachable, failing open without rate limiting.');
    }
  },
  warn: () => {},
  info: () => {},
  debug: () => {},
};

/**
 * Throttled warning for auth limiters falling back to in-memory counters
 */
const logFallbackWarning = () => {
  const now = Date.now();
  if (now - lastFallbackWarningTs >= 60000) {
    lastFallbackWarningTs = now;
    console.warn('[RateLimit] Warning: Redis store unreachable for authentication limiter, falling back to in-memory counter.');
  }
};

/**
 * Fallback store that routes increments to Redis when available,
 * and seamlessly falls back to MemoryStore when Redis errors or is unreachable.
 * This guarantees brute-force protection never disappears.
 */
class FallbackRedisStore {
  constructor(prefix, customClient = null) {
    this.prefix = prefix;
    this.memStore = new MemoryStore();
    this.redisStore = null;

    const client = customClient || (isRedisConfigured() ? getRedisClient() : null);
    if (client) {
      this.redisStore = new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix,
      });
    }
  }

  init(options) {
    this.options = options;
    if (typeof this.memStore.init === 'function') {
      this.memStore.init(options);
    }
    if (this.redisStore && typeof this.redisStore.init === 'function') {
      try {
        const res = this.redisStore.init(options);
        if (res && typeof res.catch === 'function') {
          res.catch(() => logFallbackWarning());
        }
      } catch (_) {
        logFallbackWarning();
      }
    }
  }

  async get(key) {
    if (this.redisStore) {
      try {
        return await this.redisStore.get(key);
      } catch (_) {
        logFallbackWarning();
      }
    }
    return await this.memStore.get(key);
  }

  async increment(key) {
    if (this.redisStore) {
      try {
        return await this.redisStore.increment(key);
      } catch (_) {
        logFallbackWarning();
      }
    }
    return await this.memStore.increment(key);
  }

  async decrement(key) {
    if (this.redisStore) {
      try {
        return await this.redisStore.decrement(key);
      } catch (_) {
        logFallbackWarning();
      }
    }
    return await this.memStore.decrement(key);
  }

  async resetKey(key) {
    if (this.redisStore) {
      try {
        await this.redisStore.resetKey(key);
      } catch (_) {
        logFallbackWarning();
      }
    }
    return await this.memStore.resetKey(key);
  }

  async resetAll() {
    if (this.redisStore) {
      try {
        await this.redisStore.resetAll();
      } catch (_) {
        logFallbackWarning();
      }
    }
    return await this.memStore.resetAll();
  }
}

/**
 * Build Redis store for general rate limiters.
 * Falls back to undefined (MemoryStore) when Redis is unset.
 */
const createRedisStore = (prefix, customClient = null) => {
  if (!customClient && !isRedisConfigured()) {
    return undefined;
  }
  const client = customClient || getRedisClient();
  if (!client) {
    return undefined;
  }
  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix,
  });
};

const createFallbackStore = (prefix, customClient = null) => {
  return new FallbackRedisStore(prefix, customClient);
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

// ========================================================
// 1. AUTHENTICATION & SENSITIVE LIMITERS (Fail Secure -> In-Memory Fallback)
// ========================================================

// Login rate limiter: 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: isTestEnv,
  store: createFallbackStore('rl:login:'),
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Account-keyed login rate limiter: 10 attempts per 15 minutes per target account email
const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  store: createFallbackStore('rl:account_login:'),
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
  store: createFallbackStore('rl:otp_verify:'),
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
  store: createFallbackStore('rl:account_otp:'),
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
  store: createFallbackStore('rl:otp_resend:'),
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========================================================
// 2. GENERAL RATE LIMITERS (Fail Open -> passOnStoreError: true)
// ========================================================

// Public endpoints rate limiter: 100 requests per 15 minutes per IP
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: isTestEnv,
  store: createRedisStore('rl:public_api:'),
  passOnStoreError: true,
  logger: throttledGeneralStoreLogger,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
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
  passOnStoreError: true,
  logger: throttledGeneralStoreLogger,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => normalizeUserKey('user_api', req),
  message: {
    success: false,
    message: 'Too many requests from this account. Please try again after a minute.',
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
  passOnStoreError: true,
  logger: throttledGeneralStoreLogger,
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
  passOnStoreError: true,
  logger: throttledGeneralStoreLogger,
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
  createFallbackStore,
  FallbackRedisStore,
  throttledGeneralStoreLogger,
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
