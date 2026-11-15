const Redis = require('ioredis');

let sharedClient = null;

/**
 * Check whether REDIS_URL environment variable is set
 */
const isRedisConfigured = () => {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
};

/**
 * Build connection options for ioredis
 * BullMQ requires maxRetriesPerRequest: null
 */
const getRedisOptions = (rawUrl) => {
  const url = (rawUrl || process.env.REDIS_URL || '').trim();
  const options = {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      if (process.env.NODE_ENV === 'test') {
        // In test mode, fail fast if Redis is unreachable
        return null;
      }
      return Math.min(times * 200, 3000);
    },
  };

  if (url.startsWith('rediss://')) {
    options.tls = {
      rejectUnauthorized: process.env.REDIS_REJECT_UNAUTHORIZED === 'true',
    };
  }

  return options;
};

/**
 * Create a fresh Redis client instance (e.g. for BullMQ Workers or isolated connections)
 */
const createRedisClient = (extraOptions = {}) => {
  if (!isRedisConfigured()) {
    return null;
  }
  const url = process.env.REDIS_URL.trim();
  const baseOptions = getRedisOptions(url);
  const client = new Redis(url, {
    ...baseOptions,
    ...extraOptions,
  });

  client.on('error', (err) => {
    // SECURITY: NEVER log REDIS_URL
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Redis] Connection error:', err.message);
    }
  });

  return client;
};

/**
 * Get or create the shared Redis client instance
 */
const getRedisClient = () => {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!sharedClient || sharedClient.status === 'end') {
    sharedClient = createRedisClient();
  }
  return sharedClient;
};

/**
 * Report Redis connectivity state: 'connected' | 'disconnected' | 'not_configured'
 * SECURITY: NEVER expose REDIS_URL
 */
const getRedisStatus = () => {
  if (!isRedisConfigured()) {
    return 'not_configured';
  }
  if (sharedClient && (sharedClient.status === 'ready' || sharedClient.status === 'connect')) {
    return 'connected';
  }
  return 'disconnected';
};

/**
 * Startup validation: In production, REDIS_URL is mandatory
 */
const validateRedisConfig = (env = process.env) => {
  if (env.NODE_ENV === 'production' && (!env.REDIS_URL || !env.REDIS_URL.trim())) {
    const errorMsg = 'FATAL: REDIS_URL environment variable is required in production';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  return true;
};

/**
 * Close active shared Redis connections gracefully
 */
const closeRedisConnections = async () => {
  if (sharedClient) {
    try {
      await sharedClient.quit();
    } catch (_) {
      sharedClient.disconnect();
    }
    sharedClient = null;
  }
};

module.exports = {
  isRedisConfigured,
  createRedisClient,
  getRedisClient,
  getRedisStatus,
  validateRedisConfig,
  closeRedisConnections,
};

