const Redis = require('ioredis');

let sharedClient = null;
let rateLimitClient = null;
let lastErrorLogTs = 0;
let lastRateLimitErrorLogTs = 0;
const activeClients = new Set();

/**
 * Check whether REDIS_URL environment variable is set.
 * Local development note:
 * To run a local Redis container matching production requirements:
 *   docker run -d --name placement-redis -p 6379:6379 redis:7-alpine
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
 * Build connection options for BullMQ ioredis clients.
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
 * Build connection options for rate-limiting ioredis client.
 * Uses enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 800, connectTimeout: 800
 */
const getRateLimitRedisOptions = (rawUrl) => {
  const url = (rawUrl || process.env.REDIS_URL || '').trim();
  const options = {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 800,
    connectTimeout: 1500, // allow 1.5s for initial TCP connection establishment
    enableReadyCheck: false,
    retryStrategy(times) {
      if (process.env.NODE_ENV === 'test') {
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

  if (typeof client.setMaxListeners === 'function') {
    client.setMaxListeners(30);
  }

  activeClients.add(client);
  client.on('end', () => {
    activeClients.delete(client);
  });

  return client;
};

/**
 * Create a dedicated Redis client for rate limiting.
 * Configured with enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 800ms
 */
const createRateLimitRedisClient = (extraOptions = {}) => {
  if (!isRedisConfigured()) {
    return null;
  }
  const url = process.env.REDIS_URL.trim();
  const baseOptions = getRateLimitRedisOptions(url);
  const client = new Redis(url, {
    ...baseOptions,
    ...extraOptions,
  });

  client.on('error', (err) => {
    // SECURITY: NEVER log REDIS_URL or credentials
    const now = Date.now();
    if (process.env.NODE_ENV !== 'test' && now - lastRateLimitErrorLogTs >= 60000) {
      lastRateLimitErrorLogTs = now;
      const sanitized = (err?.message || '')
        .replace(/redis:\/\/[^\s@]+@/gi, 'redis://***@')
        .replace(/rediss:\/\/[^\s@]+@/gi, 'rediss://***@');
      console.warn('[Redis] Rate-limit client connection error:', sanitized);
    }
  });

  if (typeof client.setMaxListeners === 'function') {
    client.setMaxListeners(30);
  }

  activeClients.add(client);
  client.on('end', () => {
    activeClients.delete(client);
  });

  return client;
};

/**
 * Get or create the shared Redis client instance (for BullMQ queues/workers)
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
 * Get or create the dedicated rate-limit Redis client instance
 */
const getRateLimitRedisClient = () => {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!rateLimitClient || rateLimitClient.status === 'end') {
    rateLimitClient = createRateLimitRedisClient();
  }
  return rateLimitClient;
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
  rateLimitClient = null;
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

/**
 * Safely wait for an ioredis client to reach 'ready' state if it is currently establishing connection.
 * Handles: ready, connecting, connect, reconnecting, close, end, error.
 * Bounded by maxWaitMs (default 800ms).
 * Reuses a single in-flight readiness promise across multiple concurrent callers to avoid listener bloat.
 * Safe for custom/mock test clients without event emitter methods.
 */
const waitForClientReady = (client, maxWaitMs = 800) => {
  if (!client) return Promise.resolve(false);
  if (client.status === 'ready') return Promise.resolve(true);
  if (client.status === 'end') return Promise.resolve(false);
  if (typeof client.once !== 'function') {
    return Promise.resolve(client.status === 'ready');
  }

  if (client._readyPromise) {
    return client._readyPromise;
  }

  client._readyPromise = new Promise((resolve) => {
    let timer = null;
    let settled = false;

    const cleanup = () => {
      delete client._readyPromise;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof client.removeListener === 'function') {
        client.removeListener('ready', onReady);
        client.removeListener('end', onEnd);
        client.removeListener('error', onError);
        client.removeListener('close', onClose);
      }
    };

    const onReady = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    };

    const onEnd = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    };

    const onClose = () => {
      if (process.env.NODE_ENV === 'test' || client.status === 'end') {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }
    };

    const onError = () => {
      if (client.status === 'end' || (process.env.NODE_ENV === 'test' && client.status === 'close')) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }
    };

    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(client.status === 'ready');
      }
    }, maxWaitMs);

    client.once('ready', onReady);
    client.once('end', onEnd);
    client.on('error', onError);
    client.once('close', onClose);
  });

  return client._readyPromise;
};

module.exports = {
  isRedisConfigured,
  createRedisClient,
  createRateLimitRedisClient,
  getRedisClient,
  getRateLimitRedisClient,
  getRateLimitRedisOptions,
  getRedisStatus,
  getBullPrefix,
  checkMaxMemoryPolicy,
  validateRedisConfig,
  closeRedisConnections,
  waitForClientReady,
};
