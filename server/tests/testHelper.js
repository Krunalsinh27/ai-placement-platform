const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || 'bull-test';

const {
  isRedisConfigured,
  getRedisClient,
  closeRedisConnections,
  getBullPrefix,
} = require('../config/redis');
const { startQueueWorkers, closeQueueWorkers } = require('../utils/queueWorkers');
const emailQueue = require('../utils/emailQueue');
const { closeNotificationQueue } = require('../utils/notificationService');
const { closeCronQueue } = require('../utils/cronJobs');

function getTestDbUri() {
  if (process.env.MONGO_URI_TEST) return process.env.MONGO_URI_TEST;
  const base = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  if (base.includes('?')) {
    const [dbPart, query] = base.split('?');
    return `${dbPart.replace(/_test$/, '')}_test?${query}`;
  }
  return `${base.replace(/_test$/, '')}_test`;
}

/**
 * Test database safety guard:
 * Refuses to run destructive test cleanup operations unless the target database
 * name strictly ends with "_test". Aborts the entire process/suite with a clear message otherwise.
 *
 * @param {string|Object} connectionOrDbName - Mongoose connection, database instance, or database name string
 */
function assertTestDatabase(connectionOrDbName) {
  let dbName = '';
  if (typeof connectionOrDbName === 'string') {
    dbName = connectionOrDbName;
  } else if (connectionOrDbName?.name) {
    dbName = connectionOrDbName.name;
  } else if (connectionOrDbName?.db?.databaseName) {
    dbName = connectionOrDbName.db.databaseName;
  }

  if (!dbName || !dbName.endsWith('_test')) {
    const errorMsg = `FATAL: Test cleanup refused to run on non-test database "${dbName || 'unknown'}". Database name must end with "_test" to prevent accidental data deletion in development or production. Aborting test suite.`;
    console.error(`\n❌ ${errorMsg}\n`);
    throw new Error(errorMsg);
  }
  return true;
}

/**
 * Clean test-specific BullMQ Redis keys (matching prefix 'bull-test:*')
 */
async function cleanTestRedisKeys() {
  if (!isRedisConfigured()) return;
  const client = getRedisClient();
  if (!client || client.status === 'end') return;
  try {
    const prefix = getBullPrefix();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys && keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch (_) {}
}

/**
 * Start in-process background queue workers for tests needing delivery results.
 * Cleans lingering test-prefix Redis keys first.
 */
async function startTestWorkers() {
  if (isRedisConfigured()) {
    await cleanTestRedisKeys();
    return startQueueWorkers();
  }
  return null;
}

/**
 * Wait for an EmailLog document matching filter to satisfy predicate (by polling up to timeoutMs, every 100ms).
 * @param {Object} filter - Mongoose query filter (e.g. { _id: id } or { recipientEmail: '...' })
 * @param {Function|string} predicate - Condition function (doc => boolean) or string status ('sent', 'failed')
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 */
async function waitForEmailLog(filter, predicate = null, timeoutMs = 10000) {
  const EmailLog = require('../models/EmailLog');
  const start = Date.now();
  let lastDoc = null;

  while (Date.now() - start < timeoutMs) {
    lastDoc = await EmailLog.findOne(filter);
    if (lastDoc) {
      if (typeof predicate === 'function') {
        if (predicate(lastDoc)) return lastDoc;
      } else if (typeof predicate === 'string') {
        if (lastDoc.status === predicate) return lastDoc;
      } else if (!predicate) {
        return lastDoc;
      }
    }
    await new Promise((res) => setTimeout(res, 100));
  }

  const filterStr = JSON.stringify(filter);
  const statusStr = lastDoc
    ? `status="${lastDoc.status}", attempts=${lastDoc.attempts}, error="${lastDoc.error}"`
    : 'null';
  throw new Error(
    `waitForEmailLog timed out after ${timeoutMs}ms for filter ${filterStr}. Last document state: ${statusStr}`
  );
}

/**
 * Cleanly shut down test queue workers, close BullMQ queues and Redis connections.
 */
async function stopTestWorkers() {
  await closeQueueWorkers();
  await emailQueue.closeBullQueue();
  await closeNotificationQueue();
  await closeCronQueue();
  await closeRedisConnections();
}

module.exports = {
  getTestDbUri,
  assertTestDatabase,
  cleanTestRedisKeys,
  startTestWorkers,
  waitForEmailLog,
  stopTestWorkers,
};

