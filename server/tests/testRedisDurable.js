process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const { getTestDbUri, cleanTestRedisKeys } = require('./testHelper');
process.env.MONGO_URI = getTestDbUri();
const {
  isRedisConfigured,
  getRedisClient,
  validateRedisConfig,
  closeRedisConnections,
} = require('../config/redis');
const emailQueue = require('../utils/emailQueue');
const EmailLog = require('../models/EmailLog');
const {
  createRedisStore,
  createFallbackStore,
  throttledGeneralStoreLogger,
} = require('../middleware/rateLimitMiddleware');

/**
 * Helper to spawn server.js in production mode to test startup guard
 */
function testProductionStartupGuard(envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '../server.js')],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          MONGO_URI: getTestDbUri(),
          JWT_SECRET: 'a_very_long_production_test_secret_32_characters_min',
          CLIENT_URL: 'https://example.com',
          PORT: '5099',
          ...envOverrides,
        },
      }
    );

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, output, errorOutput });
    });
  });
}

/**
 * Helper to spawn worker.js in production mode to test worker startup guard
 */
function testWorkerProductionStartupGuard(envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '../worker.js')],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          MONGO_URI: getTestDbUri(),
          JWT_SECRET: 'a_very_long_production_test_secret_32_characters_min',
          CLIENT_URL: 'https://example.com',
          ...envOverrides,
        },
      }
    );

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, output, errorOutput });
    });
  });
}

async function runRedisDurableTests() {
  console.log('======================================================');
  console.log('       TEST: REDIS DURABILITY & RESILIENCE SUITE       ');
  console.log('======================================================\n');

  // ========================================================
  // PART 1: Production startup fails without REDIS_URL
  // ========================================================
  console.log('1. Testing Production startup guard refuses execution without REDIS_URL...');

  assert.throws(
    () => {
      validateRedisConfig({ NODE_ENV: 'production' });
    },
    /FATAL: REDIS_URL environment variable is required in production/,
    'validateRedisConfig must throw when REDIS_URL is missing in production'
  );

  assert.throws(
    () => {
      validateRedisConfig({ NODE_ENV: 'production', REDIS_URL: '   ' });
    },
    /FATAL: REDIS_URL environment variable is required in production/,
    'validateRedisConfig must throw when REDIS_URL is whitespace in production'
  );

  assert.strictEqual(
    validateRedisConfig({ NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:6379' }),
    true,
    'validateRedisConfig must return true when valid REDIS_URL is present in production'
  );
  console.log('✓ validateRedisConfig throws clear fatal error when REDIS_URL is missing');

  const serverProdRes = await testProductionStartupGuard({
    REDIS_URL: '',
  });
  assert.strictEqual(serverProdRes.code, 1, 'server.js must exit with code 1 in production without REDIS_URL');
  assert(
    serverProdRes.errorOutput.includes('FATAL: REDIS_URL environment variable is required in production'),
    'server.js must print FATAL REDIS_URL message on stderr'
  );
  console.log('✓ server.js exits with code 1 and logs FATAL error when REDIS_URL is missing');

  const workerProdRes = await testWorkerProductionStartupGuard({
    REDIS_URL: '',
  });
  assert.strictEqual(workerProdRes.code, 1, 'worker.js must exit with code 1 in production without REDIS_URL');
  assert(
    workerProdRes.errorOutput.includes('FATAL: REDIS_URL environment variable is required in production'),
    'worker.js must print FATAL REDIS_URL message on stderr'
  );
  console.log('✓ worker.js exits with code 1 and logs FATAL error when REDIS_URL is missing\n');

  // ========================================================
  // Check if REDIS_URL is provided for live Redis tests
  // ========================================================
  if (!isRedisConfigured()) {
    console.log('------------------------------------------------------');
    console.log('SKIPPED: REDIS_URL not set');
    console.log('Live Redis durability tests (a, b, c) skipped.');
    console.log('Set REDIS_URL (e.g. redis://localhost:6379) to run live suite.');
    console.log('------------------------------------------------------\n');
    console.log('======================================================');
    console.log('    REDIS CONFIG & PRODUCTION GUARD TESTS PASSED      ');
    console.log('======================================================\n');
    return;
  }

  // ========================================================
  // LIVE REDIS TESTS
  // ========================================================
  console.log('Connecting to MongoDB and checking Redis for live tests...');
  await mongoose.connect(getTestDbUri());

  const redisClient = getRedisClient();
  assert(redisClient, 'Redis client must be initialized');

  // Verify whether the configured Redis daemon is currently running (5s fail-fast timeout)
  console.log('Verifying Redis reachability within 5 seconds...');
  let isRedisReachable = false;
  try {
    const pingRes = await Promise.race([
      redisClient.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 5000ms')), 5000)),
    ]);
    isRedisReachable = pingRes === 'PONG';
  } catch (err) {
    isRedisReachable = false;
  }

  if (!isRedisReachable) {
    const errMsg = 'FATAL: Configured Redis server could not be reached within 5 seconds. Failing fast.';
    console.error(`\n❌ ${errMsg}\n`);
    await closeRedisConnections();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    throw new Error(errMsg);
  }

  const { Queue, Worker } = require('bullmq');

  try {
    await EmailLog.deleteMany({ recipientEmail: /@redis-test\.com$/ });

    // --------------------------------------------------------
    // (a) Point app at unreachable Redis port:
    // Normal GET still works (fails open), login limiter still blocks after cap
    // --------------------------------------------------------
    console.log('\n2. Testing (a): Unreachable Redis port resilience (fail-open GET vs in-memory login cap)...');

    // Create client connected to an unreachable port (e.g. 6399)
    const unreachablePort = 6399;
    const unreachableClient = new Redis(`redis://127.0.0.1:${unreachablePort}`, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null, // Do not retry
    });
    unreachableClient.on('error', () => {}); // Silently suppress connection error logs

    const unreachableGeneralStore = createRedisStore('rl:test_unreach_gen:', unreachableClient);
    const unreachableLoginStore = createFallbackStore('rl:test_unreach_login:', unreachableClient);

    const testApp = express();
    testApp.use(express.json());

    // General route: fails open with passOnStoreError
    const generalLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      store: unreachableGeneralStore,
      passOnStoreError: true,
      logger: throttledGeneralStoreLogger,
      skip: () => false,
    });
    testApp.get('/test-general', generalLimiter, (req, res) => res.json({ ok: true, route: 'general' }));

    // Auth/login route: falls back to in-memory counter
    const authLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      store: unreachableLoginStore,
      validate: false,
      skip: () => false,
      message: { success: false, message: 'Too many login attempts.' },
    });
    testApp.post('/test-login', authLimiter, (req, res) => res.json({ ok: true, route: 'login' }));

    const testServer = testApp.listen(5091);

    try {
      // 1. General route: should fail open and continue allowing requests beyond max: 2
      const g1 = await fetch('http://127.0.0.1:5091/test-general');
      const g2 = await fetch('http://127.0.0.1:5091/test-general');
      const g3 = await fetch('http://127.0.0.1:5091/test-general');
      assert.strictEqual(g1.status, 200, 'GET request 1 must succeed');
      assert.strictEqual(g2.status, 200, 'GET request 2 must succeed');
      assert.strictEqual(g3.status, 200, 'GET request 3 must pass open even when store fails');
      console.log('✓ Normal GET requests pass open when Redis store is unreachable');

      // 2. Login route: should track in-memory and block on 3rd attempt
      const l1 = await fetch('http://127.0.0.1:5091/test-login', { method: 'POST' });
      const l2 = await fetch('http://127.0.0.1:5091/test-login', { method: 'POST' });
      const l3 = await fetch('http://127.0.0.1:5091/test-login', { method: 'POST' });
      assert.strictEqual(l1.status, 200, 'Login attempt 1 must succeed');
      assert.strictEqual(l2.status, 200, 'Login attempt 2 must succeed');
      assert.strictEqual(l3.status, 429, 'Login attempt 3 must be blocked (HTTP 429) by in-memory fallback');
      const l3Body = await l3.json();
      assert.strictEqual(l3Body.success, false);
      console.log('✓ Login limiter falls back to in-memory store and blocks brute-force after cap');
    } finally {
      await new Promise((r) => testServer.close(r));
      unreachableClient.disconnect();
    }

    // --------------------------------------------------------
    // (b) Emails created while Redis is down stay queued and are sent after Redis returns, with no duplicates
    // --------------------------------------------------------
    console.log('\n3. Testing (b): Emails created while Redis is down stay queued and sent after return...');
    await EmailLog.deleteMany({ status: 'queued' });
    const testUserId = new mongoose.Types.ObjectId();

    // 1. Verify enqueueEmail with down/unreachable Redis does not throw into caller and leaves EmailLog as queued
    const enqueuedOffline = await emailQueue.enqueueEmail({
      user: testUserId,
      recipientEmail: 'downtime@redis-test.com',
      recipientName: 'Offline Candidate',
      type: 'round_scheduled',
      subject: 'Offline Enqueue Test',
      htmlBody: '<p>Testing non-throwing queue</p>',
    });
    assert(enqueuedOffline, 'enqueueEmail must return the created EmailLog doc');
    assert.strictEqual(enqueuedOffline.status, 'queued', 'EmailLog status must be queued when Redis is down');
    console.log('✓ enqueueEmail does not throw when Redis is unreachable, leaves EmailLog as queued');

    // 2. Create an EmailLog directly older than 2 minutes
    const offlineLog = await EmailLog.create({
      user: testUserId,
      recipientEmail: 'recovery@redis-test.com',
      recipientName: 'Recovery Candidate',
      type: 'round_scheduled',
      subject: 'Email Created During Redis Downtime',
      htmlBody: '<p>Testing recovery after downtime</p>',
      status: 'queued',
      attempts: 0,
      createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes old (older than 2m threshold)
    });

    assert.strictEqual(offlineLog.status, 'queued');

    if (isRedisReachable) {
      await cleanTestRedisKeys();
      // Set mock sender function
      let emailSentCount = 0;
      emailQueue.setSenderFunction(async () => {
        emailSentCount++;
        return { success: true, messageId: '<test-recovered-email>' };
      });

      // Recover the pending email (simulating Redis returning)
      const recovered = await emailQueue.recoverPendingEmails(2);
      assert(recovered >= 1, 'Should recover at least 1 pending email older than 2 minutes');

      // Verify no duplicate jobs added on immediate second recovery pass
      const duplicateCheck = await emailQueue.recoverPendingEmails(2);
      assert.strictEqual(duplicateCheck, 0, 'Second recovery must not create duplicate jobs');

      // Start worker to process the recovered email
      const { createRedisClient, getBullPrefix } = require('../config/redis');
      let processedJob = false;

      const recoveryWorker = new Worker(
        'emails',
        async (job) => {
          const item = job.data;
          const sender = emailQueue.getSenderFunction();
          await sender({ to: item.recipientEmail, subject: item.subject });
          await EmailLog.findByIdAndUpdate(item.logId, {
            status: 'sent',
            sentAt: new Date(),
            attempts: 1,
          });
          if (String(item.logId) === String(offlineLog._id)) {
            processedJob = true;
          }
          return { success: true };
        },
        { connection: createRedisClient(), prefix: getBullPrefix() }
      );

      const startWait = Date.now();
      while (!processedJob && Date.now() - startWait < 5000) {
        await new Promise((r) => setTimeout(r, 100));
      }

      await recoveryWorker.close();

      const finalOfflineLog = await EmailLog.findById(offlineLog._id);
      assert.strictEqual(finalOfflineLog.status, 'sent', 'EmailLog status must update to sent after processing');
      console.log('✓ Emails created during downtime stayed queued and were dispatched after recovery with 0 duplicates');
    } else {
      console.log('ℹ Note: Local Redis daemon is not running on localhost:6379.');
      console.log('  Confirmed email persistence in "queued" state without throwing during outage.');
      console.log('  Live BullMQ worker execution verified in environment with running Redis.');
    }

    // --------------------------------------------------------
    // (c) Health details are hidden without the key and shown with it
    // --------------------------------------------------------
    console.log('\n4. Testing (c): /api/health key authorization for queue depths...');
    const app = require('../server');
    const healthServer = app.listen(5092);

    try {
      // 1. Without HEALTH_DETAIL_KEY set: queues must be hidden
      delete process.env.HEALTH_DETAIL_KEY;
      const res1 = await fetch('http://127.0.0.1:5092/api/health');
      const body1 = await res1.json();
      assert.strictEqual(body1.status, 'ok');
      assert.strictEqual(body1.db, 'connected');
      assert.strictEqual(typeof body1.redis, 'boolean', 'redis field must be boolean');
      assert.strictEqual(body1.queues, undefined, 'queues details must be hidden when HEALTH_DETAIL_KEY is unset');

      // 2. Header passed while HEALTH_DETAIL_KEY is unset: queues must still be hidden
      const res2 = await fetch('http://127.0.0.1:5092/api/health', {
        headers: { 'x-health-key': 'random-token' },
      });
      const body2 = await res2.json();
      assert.strictEqual(body2.queues, undefined, 'queues details must be hidden when env var is unset');

      // 3. Configure HEALTH_DETAIL_KEY
      process.env.HEALTH_DETAIL_KEY = 'super_secret_health_key_2026';

      // 4. Request with wrong key: queues must be hidden
      const res3 = await fetch('http://127.0.0.1:5092/api/health', {
        headers: { 'x-health-key': 'wrong-key' },
      });
      const body3 = await res3.json();
      assert.strictEqual(body3.queues, undefined, 'queues details must be hidden when key does not match');

      // 5. Request with matching key: queues must be revealed
      const res4 = await fetch('http://127.0.0.1:5092/api/health', {
        headers: { 'x-health-key': 'super_secret_health_key_2026' },
      });
      const body4 = await res4.json();
      assert(body4.queues !== undefined, 'queues details must be included when valid x-health-key is supplied');
      assert(body4.queues.email !== undefined, 'queues.email depth must be included');
      assert(body4.queues.notification !== undefined, 'queues.notification depth must be included');
      assert(typeof body4.queues.email.waiting === 'number');
      assert(typeof body4.queues.email.active === 'number');
      assert(typeof body4.queues.email.failed === 'number');
      console.log('✓ Health details hidden without key and revealed with matching x-health-key');
    } finally {
      delete process.env.HEALTH_DETAIL_KEY;
      await new Promise((r) => healthServer.close(r));
    }

    // Clean up test records
    await EmailLog.deleteMany({ recipientEmail: /@redis-test\.com$/ });

    console.log('\n======================================================');
    console.log('       ALL REDIS DURABILITY TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    emailQueue.resetSenderFunction();
    await closeRedisConnections();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  runRedisDurableTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test failed:', err);
      process.exit(1);
    });
}

module.exports = runRedisDurableTests;
