const Redis = require('ioredis');

let sharedClient = null;
let lastErrorLogTs = 0;
const activeClients = new Set();

/**
 * Check whether REDIS_URL environment variable is set
 */
const isRedisConfigured = () => {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
};

/**
 * Check maxmemory-policy on connection.
 * Warns if policy is not 'noeviction' (BullMQ jobs could be lost on memory eviction).
 * Ignores silently if CONFIG command is disabled by cloud provider.
 */
const checkMaxMemoryPolicy = async (client) => {
  if (!client) return;
  try {
    const res = await client.call('CONFIG', 'GET', 'maxmemory-policy');
    let policy = '';
    if (Array.isArray(res)) {
      policy = res.length >= 2 ? String(res[1]).toLowerCase() : String(res[0]).toLowerCase();
    } else if (res && typeof res === 'object') {
      policy = String(res['maxmemory-policy'] || '').toLowerCase();
    } else if (typeof res === 'string') {
      policy = res.toLowerCase();
    }

    if (policy && policy !== 'noeviction') {
      console.warn(`[Redis] Warning: Redis maxmemory-policy is '${policy}'. BullMQ needs noeviction, jobs can be lost.`);
    }
  } catch (_) {
    // If command is disabled by provider (e.g. AWS ElastiCache, Upstash, Render, Heroku), ignore silently
  }
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
    connectTimeout: 5000,
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
    const now = Date.now();
    if (process.env.NODE_ENV !== 'test' && now - lastErrorLogTs >= 60000) {
      lastErrorLogTs = now;
      console.error('[Redis] Connection error:', err.message);
    }
  });

  client.once('ready', () => {
    checkMaxMemoryPolicy(client);
  });

  activeClients.add(client);
  client.on('end', () => {
    activeClients.delete(client);
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
  const clients = Array.from(activeClients);
  activeClients.clear();
  sharedClient = null;
  await Promise.allSettled(
    clients.map(async (client) => {
      try {
        await client.quit();
      } catch (_) {
        try {
          client.disconnect();
        } catch (_) {}
      }
    })
  );
};

/**
 * Return BullMQ key prefix.
 * In test environment, uses 'bull-test' to isolate test queues from production/development.
 */
const getBullPrefix = () => {
  if (process.env.BULLMQ_PREFIX && process.env.BULLMQ_PREFIX.trim()) {
    return process.env.BULLMQ_PREFIX.trim();
  }
  if (process.env.NODE_ENV === 'test') {
    return 'bull-test';
  }
  return 'bull';
};

module.exports = {
  isRedisConfigured,
  createRedisClient,
  getRedisClient,
  getRedisStatus,
  getBullPrefix,
  checkMaxMemoryPolicy,
  validateRedisConfig,
  closeRedisConnections,
};
