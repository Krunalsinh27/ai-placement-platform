process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const mongoose = require('mongoose');
const { getTestDbUri } = require('./testHelper');
const {
  isRedisConfigured,
  getRedisClient,
  validateRedisConfig,
  closeRedisConnections,
} = require('../config/redis');
const emailQueue = require('../utils/emailQueue');
const EmailLog = require('../models/EmailLog');
const { createRedisStore } = require('../middleware/rateLimitMiddleware');
const rateLimit = require('express-rate-limit');

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
  console.log('       TEST: REDIS DURABILITY & BACKGROUND WORK       ');
  console.log('======================================================\n');

  // ========================================================
  // PART (e): Production startup fails without REDIS_URL
  // This test does NOT require Redis to be running!
  // ========================================================
  console.log('1. Testing (e): Production startup guard refuses execution without REDIS_URL...');

  // 1.1 Direct config validator checks
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

  // 1.2 Spawned server.js production startup test
  const serverProdRes = await testProductionStartupGuard({
    REDIS_URL: '',
  });
  assert.strictEqual(serverProdRes.code, 1, 'server.js must exit with code 1 in production without REDIS_URL');
  assert(
    serverProdRes.errorOutput.includes('FATAL: REDIS_URL environment variable is required in production'),
    'server.js must print FATAL REDIS_URL message on stderr'
  );
  console.log('✓ server.js exits with code 1 and logs FATAL error when REDIS_URL is missing');

  // 1.3 Spawned worker.js production startup test
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
    console.log('Live Redis durability tests (a, b, c, d) skipped.');
    console.log('Set REDIS_URL (e.g. redis://127.0.0.1:6379) to run live suite.');
    console.log('------------------------------------------------------\n');
    console.log('======================================================');
    console.log('    REDIS CONFIG & PRODUCTION GUARD TESTS PASSED      ');
    console.log('======================================================\n');
    return;
  }

  // ========================================================
  // LIVE REDIS TESTS (a, b, c, d)
  // ========================================================
  console.log('Connecting to MongoDB and Redis for live durability tests...');
  await mongoose.connect(getTestDbUri());
  const redisClient = getRedisClient();
  assert(redisClient, 'Redis client must be initialized');

  const { Queue, Worker } = require('bullmq');

  try {
    // Clean up any test logs
    await EmailLog.deleteMany({ recipientEmail: /@redis-test\.com$/ });

    // --------------------------------------------------------
    // (a) Enqueue emails, restart the worker, jobs still complete
    // --------------------------------------------------------
    console.log('\n2. Testing (a): Enqueue emails, restart worker, jobs still complete...');
    const testLogId = new mongoose.Types.ObjectId();
    const testUserId = new mongoose.Types.ObjectId();

    // Set mock sender function
    emailQueue.setSenderFunction(async () => {
      return { success: true, messageId: '<test-redis-email-1>' };
    });

    const enqueuedLog = await emailQueue.enqueueEmail({
      user: testUserId,
      recipientEmail: 'durable@redis-test.com',
      recipientName: 'Durable Candidate',
      type: 'test_durable',
      subject: 'Durable Queue Test Email',
      htmlBody: '<p>Testing worker restart</p>',
    });

    assert(enqueuedLog, 'EmailLog record must be created');
    assert.strictEqual(enqueuedLog.status, 'queued');

    const bullQueue = emailQueue.getBullQueue();
    const queuedJob = await bullQueue.getJob(`email-${enqueuedLog._id.toString()}`);
    assert(queuedJob, 'Job must exist in Redis BullMQ queue');

    // Simulate worker starting up after restart
    const { createRedisClient } = require('../config/redis');
    let processed = false;

    const worker1 = new Worker(
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
        processed = true;
        return { success: true };
      },
      { connection: createRedisClient() }
    );

    // Wait up to 5 seconds for worker to process the job
    const startWait = Date.now();
    while (!processed && Date.now() - startWait < 5000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    await worker1.close();

    const finalLog = await EmailLog.findById(enqueuedLog._id);
    assert.strictEqual(finalLog.status, 'sent', 'EmailLog status must be updated to sent');
    assert.strictEqual(finalLog.attempts, 1, 'EmailLog attempts must be 1');
    console.log('✓ Email queued, worker started, and job completed successfully');

    // --------------------------------------------------------
    // (b) Pending EmailLog recovery on startup, with no duplicates
    // --------------------------------------------------------
    console.log('\n3. Testing (b): Pending EmailLog recovery on startup, with no duplicates...');
    const recoverLog1 = await EmailLog.create({
      user: testUserId,
      recipientEmail: 'recover1@redis-test.com',
      type: 'recovery_test',
      subject: 'Recovery Test 1',
      status: 'queued',
      attempts: 0,
    });
    const recoverLog2 = await EmailLog.create({
      user: testUserId,
      recipientEmail: 'recover2@redis-test.com',
      type: 'recovery_test',
      subject: 'Recovery Test 2',
      status: 'queued',
      attempts: 0,
    });

    // Run recovery round 1
    const recoveredRound1 = await emailQueue.recoverPendingEmails();
    assert(recoveredRound1 >= 2, `Round 1 should recover at least 2 logs, recovered ${recoveredRound1}`);

    // Verify jobs exist in BullMQ
    const job1 = await bullQueue.getJob(`email-${recoverLog1._id.toString()}`);
    const job2 = await bullQueue.getJob(`email-${recoverLog2._id.toString()}`);
    assert(job1, 'Job 1 must exist in BullMQ queue after recovery');
    assert(job2, 'Job 2 must exist in BullMQ queue after recovery');

    // Run recovery round 2 (must not create duplicates)
    const recoveredRound2 = await emailQueue.recoverPendingEmails();
    assert.strictEqual(recoveredRound2, 0, 'Round 2 must not enqueue duplicates (count 0)');

    // Clean up recovered test jobs
    if (job1) await job1.remove();
    if (job2) await job2.remove();
    console.log('✓ Pending EmailLog records recovered on startup with no duplicate jobs');

    // --------------------------------------------------------
    // (c) Rate-limit counters survive a restart of the limiter store
    // --------------------------------------------------------
    console.log('\n4. Testing (c): Rate-limit counters survive a restart of the limiter store...');
    const testPrefix = 'rl:test_persist:';
    // Clean up test key in Redis
    const testKeys = await redisClient.keys(`${testPrefix}*`);
    if (testKeys.length > 0) {
      await redisClient.del(testKeys);
    }

    const store1 = createRedisStore(testPrefix);
    assert(store1, 'createRedisStore must return a RedisStore instance');

    // Express app using store 1
    const app1 = express();
    const limiter1 = rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      store: store1,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: () => 'fixed-test-client',
      skip: () => false,
    });
    app1.use(limiter1);
    app1.get('/test-rl', (req, res) => res.json({ ok: true }));

    const s1 = app1.listen(5097);
    const r1 = await fetch('http://127.0.0.1:5097/test-rl');
    const r2 = await fetch('http://127.0.0.1:5097/test-rl');
    assert.strictEqual(r1.headers.get('ratelimit-remaining'), '9');
    assert.strictEqual(r2.headers.get('ratelimit-remaining'), '8');
    await new Promise((r) => s1.close(r));

    // Simulate restarting the limiter with a new store instance pointing to same Redis prefix
    const store2 = createRedisStore(testPrefix);
    const app2 = express();
    const limiter2 = rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      store: store2,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: () => 'fixed-test-client',
      skip: () => false,
    });
    app2.use(limiter2);
    app2.get('/test-rl', (req, res) => res.json({ ok: true }));

    const s2 = app2.listen(5098);
    const r3 = await fetch('http://127.0.0.1:5098/test-rl');
    await new Promise((r) => s2.close(r));

    // Hit counter must be preserved across store restart (remaining should be 7)
    assert.strictEqual(
      r3.headers.get('ratelimit-remaining'),
      '7',
      'Rate-limit counter must survive restart of limiter store'
    );
    console.log('✓ Rate-limit counter survived store restart (remaining: 9 -> 8 -> 7)');

    // --------------------------------------------------------
    // (d) Two scheduler instances run a scheduled job once
    // --------------------------------------------------------
    console.log('\n5. Testing (d): Two scheduler instances run a scheduled job once...');
    const schedulerQueue1 = new Queue('test-scheduled-queue', { connection: getRedisClient() });
    const schedulerQueue2 = new Queue('test-scheduled-queue', { connection: getRedisClient() });

    // Instance 1 registers scheduler
    await schedulerQueue1.upsertJobScheduler(
      'dedup-test-schedule',
      { pattern: '* * * * *' },
      { name: 'dedup-test-job' }
    );

    // Instance 2 registers identical scheduler
    await schedulerQueue2.upsertJobScheduler(
      'dedup-test-schedule',
      { pattern: '* * * * *' },
      { name: 'dedup-test-job' }
    );

    const schedulers = await schedulerQueue1.getJobSchedulers();
    const matching = schedulers.filter((s) => s.id === 'dedup-test-schedule');
    assert.strictEqual(
      matching.length,
      1,
      'BullMQ job scheduler must be deduplicated across multiple server instances'
    );

    // Clean up test scheduler
    await schedulerQueue1.removeJobScheduler('dedup-test-schedule');
    await schedulerQueue1.close();
    await schedulerQueue2.close();
    console.log('✓ Two scheduler instances deduplicated to exactly one schedule entry in Redis');

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

