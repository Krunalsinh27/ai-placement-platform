const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { validateRedisConfig, isRedisConfigured, closeRedisConnections } = require('./config/redis');
const { startQueueWorkers, closeQueueWorkers } = require('./utils/queueWorkers');
const emailQueue = require('./utils/emailQueue');
const { initCronJobs } = require('./utils/cronJobs');

dotenv.config();

// Fail fast in production if REDIS_URL is missing
if (process.env.NODE_ENV === 'production') {
  validateRedisConfig();
  if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI environment variable is required in production');
    process.exit(1);
  }
}

// Connect to MongoDB
connectDB();

const initWorker = async () => {
  console.log('[Worker] Initializing queue worker process...');

  if (!isRedisConfigured() && process.env.NODE_ENV !== 'test') {
    console.warn('[Worker] Warning: REDIS_URL is not configured. BullMQ workers require Redis.');
  }

  // Register repeatable BullMQ schedulers if Redis is available
  if (isRedisConfigured()) {
    await initCronJobs();
  }

  // Recover any pending emails stored in database
  await emailQueue.recoverPendingEmails();

  // Start BullMQ workers
  startQueueWorkers();

  console.log('[Worker] Background workers active and listening for jobs.');
};

initWorker().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err.message);
  process.exit(1);
});

// Graceful shutdown handling
let isShuttingDown = false;
const handleShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Worker] Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. Stop workers from accepting new jobs and wait for in-flight jobs to complete
    await closeQueueWorkers();
    console.log('[Worker] Queue workers stopped successfully.');

    // 2. Close Redis connections
    await closeRedisConnections();
    console.log('[Worker] Redis connections closed.');

    // 3. Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('[Worker] MongoDB connection closed.');
    }

    process.exit(0);
  } catch (err) {
    console.error(`[Worker] Error during graceful shutdown on ${signal}:`, err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

