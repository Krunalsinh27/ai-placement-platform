const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { isRedisConfigured, getRedisClient, getRateLimitRedisClient } = require('../config/redis');

const isTestEnv = () => process.env.NODE_ENV === 'test' && process.env.ENFORCE_RATE_LIMIT !== 'true';

let lastGeneralWarningTs = 0;
let lastFallbackWarningTs = 0;

let sharedConsecutiveFailures = 0;
let sharedCircuitOpenUntil = 0;

const resetRateLimitCircuit = () => {
  sharedConsecutiveFailures = 0;
  sharedCircuitOpenUntil = 0;
  lastFallbackWarningTs = 0;
};

/**
 * Throttled logger for general limiters: logs at most 1 warning per minute without the URL
 */
const throttledGeneralStoreLogger = {
  error: () => {
    const now = Date.now();
    if (now - lastGeneralWarningTs >= 60000) {
      lastGeneralWarningTs = now;
      console.warn('[RateLimit] Redis unavailable, using in-memory rate limits');
    }
  },
  warn: () => {},
  info: () => {},
  debug: () => {},
};

/**
 * Throttled warning: logs at most 1 warning per minute without the URL
 * Exact message: "Redis unavailable, using in-memory rate limits"
 */
const logFallbackWarning = () => {
  const now = Date.now();
  if (now - lastFallbackWarningTs >= 60000) {
    lastFallbackWarningTs = now;
    console.warn('[RateLimit] Redis unavailable, using in-memory rate limits');
  }
};

/**
 * Fallback store that routes increments to Redis when available,
 * and seamlessly falls back to MemoryStore when Redis errors, times out, or is unreachable.
 * Includes an 800ms timeout per call and a circuit breaker (trips for 30s after 3 consecutive failures).
 */
class FallbackRedisStore {
  constructor(prefix, customClient = null) {
    this.prefix = prefix;
    this.memStore = new MemoryStore();
    this.redisStore = null;
    this.customClient = customClient;
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;

    const client = customClient || (isRedisConfigured() ? getRateLimitRedisClient() : null);
    if (client) {
      this.client = client;
      this.redisStore = new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix,
      });
    }
  }

  _isCircuitOpen() {
    const now = Date.now();
    if (this.customClient) {
      return now < this.circuitOpenUntil;
    }
    return now < sharedCircuitOpenUntil;
  }

  _recordFailure() {
    const now = Date.now();
    if (this.customClient) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= 3) {
        this.circuitOpenUntil = now + 30000;
      }
    } else {
      sharedConsecutiveFailures += 1;
      if (sharedConsecutiveFailures >= 3) {
        sharedCircuitOpenUntil = now + 30000;
      }
    }
    logFallbackWarning();
  }

  _recordSuccess() {
    if (this.customClient) {
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
    } else {
      sharedConsecutiveFailures = 0;
      sharedCircuitOpenUntil = 0;
    }
  }

  resetCircuit() {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    if (!this.customClient) {
      resetRateLimitCircuit();
    }
  }

  _getRedisStore() {
    if (this.redisStore) return this.redisStore;
    if (!this.customClient && isRedisConfigured()) {
      const client = getRateLimitRedisClient();
      if (client) {
        this.client = client;
        this.redisStore = new RedisStore({
          sendCommand: (...args) => client.call(...args),
          prefix: this.prefix,
        });
        if (this.options && typeof this.redisStore.init === 'function') {
          try {
            this.redisStore.init(this.options);
          } catch (_) {}
        }
      }
    }
    return this.redisStore;
  }

  init(options) {
    this.options = options;
    if (typeof this.memStore.init === 'function') {
      this.memStore.init(options);
    }
    const store = this._getRedisStore();
    if (store && typeof store.init === 'function') {
      try {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('init timed out after 800ms')), 800);
        });
        Promise.race([
          Promise.resolve(store.init(options)),
          timeoutPromise,
        ])
          .then(() => clearTimeout(timer))
          .catch(() => {
            clearTimeout(timer);
            this._recordFailure();
          });
      } catch (_) {
        this._recordFailure();
      }
    }
  }

  async _executeWithTimeout(fnName, ...args) {
    const store = this._getRedisStore();
    const isCircuitOpen = this._isCircuitOpen();

    if (store && !isCircuitOpen) {
      let timer;
      try {
        const fn = store[fnName];
        if (typeof fn === 'function') {
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Redis ${fnName} timed out after 800ms`)), 800);
          });
          const result = await Promise.race([
            fn.apply(store, args),
            timeoutPromise,
          ]);
          clearTimeout(timer);
          this._recordSuccess();
          return result;
        }
      } catch (err) {
        clearTimeout(timer);
        this._recordFailure();
      }
    }

    // Fallback to in-memory store
    const memFn = this.memStore[fnName];
    if (typeof memFn === 'function') {
      return await memFn.apply(this.memStore, args);
    }
  }

  async get(key) {
    return await this._executeWithTimeout('get', key);
  }

  async increment(key) {
    return await this._executeWithTimeout('increment', key);
  }

  async decrement(key) {
    return await this._executeWithTimeout('decrement', key);
  }

  async resetKey(key) {
    return await this._executeWithTimeout('resetKey', key);
  }

  async resetAll() {
    return await this._executeWithTimeout('resetAll');
  }
}

/**
 * Build Redis store for general rate limiters.
 * Falls back to undefined (MemoryStore) when Redis is unset.
 * Wrapped in 800ms timeout.
 */
const createRedisStore = (prefix, customClient = null) => {
  if (!customClient && !isRedisConfigured()) {
    return undefined;
  }
  const client = customClient || getRateLimitRedisClient();
  if (!client) {
    return undefined;
  }
  return new RedisStore({
    sendCommand: async (...args) => {
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis command timed out after 800ms')), 800);
      });
      try {
        return await Promise.race([client.call(...args), timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    },
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
// Uses FallbackRedisStore to maintain rate limiting with in-memory fallback even when Redis is down
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: isTestEnv,
  store: createFallbackStore('rl:ai:'),
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
  resetRateLimitCircuit,
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
