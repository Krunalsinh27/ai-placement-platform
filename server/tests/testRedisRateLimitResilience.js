process.env.NODE_ENV = 'test';
process.env.ENFORCE_RATE_LIMIT = 'true';

const assert = require('assert');
const http = require('http');
const net = require('net');
const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const { getTestDbUri } = require('./testHelper');
process.env.MONGO_URI = getTestDbUri();

const {
  isRedisConfigured,
  getRateLimitRedisClient,
  createRateLimitRedisClient,
  closeRedisConnections,
} = require('../config/redis');

const {
  FallbackRedisStore,
  createFallbackStore,
  resetRateLimitCircuit,
  aiLimiter,
} = require('../middleware/rateLimitMiddleware');

const { aiRequestBudget } = require('../middleware/aiTimeoutMiddleware');
const AiUsage = require('../models/AiUsage');

/**
 * Creates a lightweight RESP protocol TCP server for testing Redis reconnection & recovery
 */
function createMockRespServer(port = 6389) {
  const store = new Map();
  const server = net.createServer((socket) => {
    socket.on('data', (buf) => {
      const msg = buf.toString();
      // Basic RESP command parser for PING, SCRIPT, EVAL, GET, SET, INCR, etc.
      if (msg.includes('PING')) {
        socket.write('+PONG\r\n');
      } else if (msg.includes('CONFIG')) {
        socket.write('*2\r\n$16\r\nmaxmemory-policy\r\n$10\r\nnoeviction\r\n');
      } else if (msg.includes('SCRIPT')) {
        socket.write('+d9b1c7f53f93a9d9e4a3b8d4f6c8e1a2b3c4d5e6\r\n');
      } else if (msg.includes('EVAL') || msg.includes('evalsha')) {
        // Mock rate-limit-redis script response: [totalHits, ttlMs]
        socket.write('*2\r\n:1\r\n:60000\r\n');
      } else {
        socket.write('+OK\r\n');
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
    server.on('error', reject);
  });
}

async function runResilienceTests() {
  console.log('======================================================');
  console.log('    TEST: REDIS RATE-LIMIT RESILIENCE & AI BUDGET     ');
  console.log('======================================================\n');

  await mongoose.connect(getTestDbUri());

  try {
    // ========================================================
    // TEST 1: Unreachable Redis Port & < 2s Response with In-Memory Counters
    // ========================================================
    console.log('1. Testing aiLimiter on unreachable Redis port (< 2s latency & in-memory counter)...');

    resetRateLimitCircuit();
    const closedPort = 6398;
    const closedClient = new Redis(`redis://127.0.0.1:${closedPort}`, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 800,
      connectTimeout: 800,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });
    closedClient.on('error', () => {}); // Suppress connection error logs

    const testStore = createFallbackStore('rl:test_resilience_ai:', closedClient);

    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      store: testStore,
      skip: () => false,
      validate: false,
      message: { success: false, message: 'Too many AI requests. Please try again after 15 minutes.' },
    });

    const app = express();
    app.use(express.json());
    app.post('/test-ai-route', testLimiter, (req, res) => {
      res.json({ success: true, message: 'AI route processed successfully' });
    });

    const server = http.createServer(app);
    await new Promise((r) => server.listen(5093, '127.0.0.1', r));

    try {
      // Capture console.warn to verify throttled warning and absence of REDIS_URL
      const warnings = [];
      const origWarn = console.warn;
      console.warn = (...args) => {
        warnings.push(args.join(' '));
        origWarn(...args);
      };
      resetRateLimitCircuit();

      try {
        // Request 1: Redis times out (800ms) -> falls back to in-memory -> succeeds
        const t1 = Date.now();
        const res1 = await fetch('http://127.0.0.1:5093/test-ai-route', { method: 'POST' });
        const latency1 = Date.now() - t1;
        assert.strictEqual(res1.status, 200, 'Request 1 should succeed');
        assert(latency1 < 2000, `Request 1 latency must be < 2000ms (got ${latency1}ms)`);
        console.log(`✓ Request 1 succeeded in ${latency1}ms (< 2000ms) via in-memory fallback`);

        // Request 2: Responds < 2000ms
        const t2 = Date.now();
        const res2 = await fetch('http://127.0.0.1:5093/test-ai-route', { method: 'POST' });
        const latency2 = Date.now() - t2;
        assert.strictEqual(res2.status, 200, 'Request 2 should succeed');
        assert(latency2 < 2000, `Request 2 latency must be < 2000ms (got ${latency2}ms)`);
        console.log(`✓ Request 2 succeeded in ${latency2}ms (< 2000ms)`);

        // Request 3: Hits in-memory cap of 2 -> returns 429
        const t3 = Date.now();
        const res3 = await fetch('http://127.0.0.1:5093/test-ai-route', { method: 'POST' });
        const latency3 = Date.now() - t3;
        assert.strictEqual(res3.status, 429, 'Request 3 should be blocked with 429 by in-memory counter');
        const body3 = await res3.json();
        assert.strictEqual(body3.success, false);
        console.log(`✓ Request 3 blocked with 429 in ${latency3}ms (in-memory counter enforced)`);

        // Verify log throttling and security
        const redisWarns = warnings.filter((w) => w.includes('Redis unavailable, using in-memory rate limits'));
        assert(redisWarns.length >= 1, 'Should log throttled warning: "Redis unavailable, using in-memory rate limits"');
        assert(redisWarns.length <= 2, 'Warning must be throttled to 1 per minute');
        warnings.forEach((w) => {
          assert(!w.includes('redis://'), 'SECURITY: Must not log REDIS_URL');
        });
        console.log('✓ Warning logged with exact text "Redis unavailable, using in-memory rate limits" and no REDIS_URL');
      } finally {
        console.warn = origWarn;
      }

      // ========================================================
      // TEST 2: Circuit Breaker (3 consecutive failures skip Redis for 30s)
      // ========================================================
      console.log('\n2. Testing Circuit Breaker (skips Redis after 3 consecutive failures)...');
      // After requests 1, 2, and 3 failed on Redis, consecutiveFailures is 3 and circuit is OPEN
      assert(testStore._isCircuitOpen(), 'Circuit must be open after 3 consecutive failures');

      // Request 4: Because circuit is open, it must bypass Redis timeout entirely (< 50ms)
      const t4 = Date.now();
      const res4 = await fetch('http://127.0.0.1:5093/test-ai-route', { method: 'POST' });
      const latency4 = Date.now() - t4;
      assert.strictEqual(res4.status, 429, 'Request 4 should remain blocked by memory counter');
      assert(latency4 < 50, `Circuit-open request must be instant (got ${latency4}ms, expected < 50ms)`);
      console.log(`✓ Circuit-open request executed in ${latency4}ms (< 50ms) bypassing Redis timeout`);

    } finally {
      await new Promise((r) => server.close(r));
      closedClient.disconnect();
    }

    // ========================================================
    // TEST 3: Recovery when Redis returns
    // ========================================================
    console.log('\n3. Testing Recovery when Redis returns...');

    let isRedisUp = false;
    const simulatedClient = {
      status: 'ready',
      call: async (...args) => {
        if (!isRedisUp) {
          throw new Error('connect ECONNREFUSED (Redis down)');
        }
        const cmd = String(args[0] || '').toUpperCase();
        if (cmd === 'SCRIPT') {
          return 'd9b1c7f53f93a9d9e4a3b8d4f6c8e1a2b3c4d5e6';
        }
        if (cmd === 'EVAL' || cmd === 'EVALSHA') {
          return [1, 60000];
        }
        return 'OK';
      },
    };

    const recoveringStore = createFallbackStore('rl:test_recovery:', simulatedClient);
    recoveringStore.init({ windowMs: 60000 });
    assert.strictEqual(recoveringStore._isCircuitOpen(), false, 'Fresh store circuit should start closed');

    // 1. Simulate calls while Redis is down
    await recoveringStore.increment('candidate_1');
    await recoveringStore.increment('candidate_2');
    await recoveringStore.increment('candidate_3');
    assert.strictEqual(recoveringStore._isCircuitOpen(), true, 'Circuit must open after 3 consecutive failures');
    assert.strictEqual(recoveringStore.consecutiveFailures, 3);

    // 2. Next call while circuit is open skips Redis
    let redisCalledWhileOpen = false;
    simulatedClient.call = async () => {
      redisCalledWhileOpen = true;
      throw new Error('Should not be called');
    };
    await recoveringStore.increment('candidate_4');
    assert.strictEqual(redisCalledWhileOpen, false, 'Redis must NOT be called when circuit is open');

    // 3. Redis comes back!
    isRedisUp = true;
    simulatedClient.call = async (...args) => {
      const cmd = String(args[0] || '').toUpperCase();
      if (cmd === 'SCRIPT') {
        return 'd9b1c7f53f93a9d9e4a3b8d4f6c8e1a2b3c4d5e6';
      }
      if (cmd === 'EVAL' || cmd === 'EVALSHA') {
        return [1, 60000];
      }
      return 'OK';
    };

    // 4. Probe window expires (30s elapsed)
    recoveringStore.circuitOpenUntil = Date.now() - 1;
    assert.strictEqual(recoveringStore._isCircuitOpen(), false, 'Probe window allows attempt');

    // 5. Probe attempt executes against Redis, succeeds, and resets circuit
    const probeResult = await recoveringStore.increment('candidate_5');
    assert(probeResult, 'Increment should succeed');
    assert.strictEqual(recoveringStore.consecutiveFailures, 0, 'Consecutive failures must reset to 0');
    assert.strictEqual(recoveringStore._isCircuitOpen(), false, 'Circuit must be closed after successful probe');
    console.log('✓ Store successfully recovers when Redis comes back: resets failure count and closes circuit');

    // ========================================================
    // TEST 4: AI Request Budget (60s timeout, returns 504, quota NOT consumed)
    // ========================================================
    console.log('\n4. Testing AI Request Budget (HTTP 504 on timeout & quota preserved)...');

    const testStudentUser = new mongoose.Types.ObjectId();
    await AiUsage.deleteMany({ user: testStudentUser });

    const quotaBefore = await AiUsage.getUserDailyUsage(testStudentUser);
    const initialTailorUsed = quotaBefore?.tailor?.used || 0;

    // Create app with aiRequestBudget configured for 150ms timeout for test speed
    process.env.AI_REQUEST_TIMEOUT_MS = '150';

    const aiBudgetApp = express();
    aiBudgetApp.use(express.json());

    aiBudgetApp.post(
      '/api/test-ai-budget',
      (req, res, next) => {
        req.user = { _id: testStudentUser, role: 'student' };
        next();
      },
      aiRequestBudget(60000), // Configured with 60s, overridden to 150ms via env
      async (req, res) => {
        // Simulate a slow AI service call that takes 400ms (> 150ms budget)
        await new Promise((resolve) => setTimeout(resolve, 400));

        // If not timed out, would record quota:
        const isCancelled = Boolean(req.timedOut || req.abortSignal?.aborted);
        if (!isCancelled) {
          await AiUsage.recordCall(testStudentUser, 'tailor');
        }

        if (res.headersSent || req.timedOut) return;
        res.json({ success: true, message: 'Completed' });
      }
    );

    const budgetServer = http.createServer(aiBudgetApp);
    await new Promise((r) => budgetServer.listen(5094, '127.0.0.1', r));

    try {
      const budgetRes = await fetch('http://127.0.0.1:5094/api/test-ai-budget', { method: 'POST' });
      const budgetBody = await budgetRes.json();

      assert.strictEqual(budgetRes.status, 504, 'Exceeded budget request must return HTTP 504');
      assert.strictEqual(budgetBody.success, false);
      assert.strictEqual(
        budgetBody.message,
        'The AI took too long. Your quota was not used.',
        'Must return exact message: "The AI took too long. Your quota was not used."'
      );
      console.log('✓ Returned HTTP 504 with message: "The AI took too long. Your quota was not used."');

      // Wait 300ms to ensure slow background work has finished
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify quota was NOT consumed
      const quotaAfter = await AiUsage.getUserDailyUsage(testStudentUser);
      const finalTailorUsed = quotaAfter?.tailor?.used || 0;
      assert.strictEqual(
        finalTailorUsed,
        initialTailorUsed,
        'Quota must NOT be consumed when AI request budget times out'
      );
      console.log(`✓ Verified quota was not consumed: tailor calls = ${finalTailorUsed} (unchanged)`);
    } finally {
      delete process.env.AI_REQUEST_TIMEOUT_MS;
      await new Promise((r) => budgetServer.close(r));
      await AiUsage.deleteMany({ user: testStudentUser });
    }

    // ========================================================
    // TEST 5: Comprehensive Redis Lifecycle & Readiness (Scenarios 1-10)
    // ========================================================
    console.log('\n5. Testing Comprehensive Redis Client Lifecycle & Readiness (Scenarios 1-10)...');

    const unhandledRejections = [];
    const rejectionHandler = (reason) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', rejectionHandler);

    try {
      // ----------------------------------------------------
      // Scenario 1: Redis already ready before application initialization
      // ----------------------------------------------------
      console.log('  Scenario 1: Redis already ready before store initialization...');
      const readyClient = new Redis('redis://127.0.0.1:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      await new Promise((resolve) => readyClient.once('ready', resolve));
      assert.strictEqual(readyClient.status, 'ready');

      const readyStore = createFallbackStore('rl:test_scen1:', readyClient);
      readyStore.init({ windowMs: 60000 });
      assert.strictEqual(readyStore.consecutiveFailures, 0);
      assert.strictEqual(readyStore._isCircuitOpen(), false);

      const readyInc = await readyStore.increment('user_ready_init');
      assert.strictEqual(readyInc.totalHits, 1);
      console.log('  ✓ Scenario 1 PASS: Ready Redis initializes cleanly with 0 failures');
      await readyClient.quit();

      // ----------------------------------------------------
      // Scenario 2: Redis connecting when rate limiter initializes
      // ----------------------------------------------------
      console.log('  Scenario 2: Redis connecting when rate limiter initializes...');
      const connectingClient = new Redis('redis://127.0.0.1:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      assert.strictEqual(connectingClient.status, 'connecting', 'Client must start in connecting status');

      const connectingStore = createFallbackStore('rl:test_scen2:', connectingClient);
      connectingStore.init({ windowMs: 60000 });
      assert.strictEqual(connectingStore.consecutiveFailures, 0, 'Must not record failure on connection in progress');
      assert.strictEqual(connectingStore._isCircuitOpen(), false, 'Circuit must not open on startup');

      // Wait 100ms for connection to complete
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(connectingClient.status, 'ready');
      const connInc = await connectingStore.increment('user_conn_init');
      assert.strictEqual(connInc.totalHits, 1);
      console.log('  ✓ Scenario 2 PASS: Connecting client initializes without tripping circuit');
      await connectingClient.quit();

      // ----------------------------------------------------
      // Scenario 3: First request during Redis connection establishment
      // ----------------------------------------------------
      console.log('  Scenario 3: First request arrives while Redis is still connecting...');
      const firstReqClient = new Redis('redis://127.0.0.1:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      assert.strictEqual(firstReqClient.status, 'connecting');

      const firstReqStore = createFallbackStore('rl:test_scen3:', firstReqClient);
      firstReqStore.init({ windowMs: 60000 });

      // Immediate request while still connecting (does not wait for ready manually)
      const firstInc = await firstReqStore.increment('user_instant');
      assert(firstInc, 'Increment during connection must succeed');
      assert.strictEqual(firstInc.totalHits, 1);
      assert.strictEqual(firstReqStore.consecutiveFailures, 0);
      console.log('  ✓ Scenario 3 PASS: First request during connection establishment uses Redis successfully');
      await firstReqClient.quit();

      // ----------------------------------------------------
      // Scenario 4: Redis command failure handling
      // ----------------------------------------------------
      console.log('  Scenario 4: Redis command failure falls back to memory safely...');
      const failingMockClient = {
        status: 'ready',
        call: async () => {
          throw new Error('READONLY You cant write against a read only replica');
        },
      };

      const failingStore = createFallbackStore('rl:test_scen4:', failingMockClient);
      failingStore.init({ windowMs: 60000 });

      const failInc = await failingStore.increment('user_fail_cmd');
      assert(failInc, 'Should fall back to MemoryStore on Redis command failure');
      assert.strictEqual(failInc.totalHits, 1);
      assert.strictEqual(failingStore.consecutiveFailures, 1, 'Should record 1 failure');
      console.log('  ✓ Scenario 4 PASS: Command failure falls back to memory and records failure');

      // ----------------------------------------------------
      // Scenario 5: In-memory fallback enforcement
      // ----------------------------------------------------
      console.log('  Scenario 5: In-memory fallback strictly enforces rate limits...');
      const deadPortClient = new Redis('redis://127.0.0.1:6397', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      deadPortClient.on('error', () => {});

      const fallbackMemStore = createFallbackStore('rl:test_scen5:', deadPortClient);
      fallbackMemStore.init({ windowMs: 60000 });

      const h1 = await fallbackMemStore.increment('user_strict');
      assert.strictEqual(h1.totalHits, 1, 'First in-memory hit must be 1');
      const h2 = await fallbackMemStore.increment('user_strict');
      assert.strictEqual(h2.totalHits, 2, 'Second in-memory hit must be 2');
      const h3 = await fallbackMemStore.increment('user_strict');
      assert.strictEqual(h3.totalHits, 3, 'Third in-memory hit must be 3');
      console.log('  ✓ Scenario 5 PASS: In-memory fallback increments correctly when Redis is down');
      deadPortClient.disconnect();

      // ----------------------------------------------------
      // Scenario 6: Circuit breaker activation after 3 consecutive failures
      // ----------------------------------------------------
      console.log('  Scenario 6: Circuit breaker activates after 3 failures and skips Redis...');
      const cbClient = {
        status: 'ready',
        call: async () => {
          throw new Error('ETIMEDOUT');
        },
      };
      const cbStore = createFallbackStore('rl:test_scen6:', cbClient);
      cbStore.init({ windowMs: 60000 });

      await cbStore.increment('cb_user_1');
      await cbStore.increment('cb_user_2');
      await cbStore.increment('cb_user_3');
      assert.strictEqual(cbStore.consecutiveFailures, 3);
      assert.strictEqual(cbStore._isCircuitOpen(), true, 'Circuit breaker must be open');

      let cbRedisCalled = false;
      cbClient.call = async () => {
        cbRedisCalled = true;
      };
      await cbStore.increment('cb_user_4');
      assert.strictEqual(cbRedisCalled, false, 'Circuit open must bypass Redis call');
      console.log('  ✓ Scenario 6 PASS: Circuit breaker trips after 3 failures and bypasses Redis');

      // ----------------------------------------------------
      // Scenario 7: Redis recovery after connection failure
      // ----------------------------------------------------
      console.log('  Scenario 7: Redis recovery after failure resets circuit and resumes Redis...');
      let mockRedisRecovered = false;
      const recClient = {
        status: 'ready',
        call: async (...args) => {
          if (!mockRedisRecovered) throw new Error('ECONNREFUSED');
          const cmd = String(args[0] || '').toUpperCase();
          if (cmd === 'SCRIPT') return 'mock_sha';
          if (cmd === 'EVAL' || cmd === 'EVALSHA') return [1, 60000];
          return 'OK';
        },
      };
      const recStore = createFallbackStore('rl:test_scen7:', recClient);
      recStore.init({ windowMs: 60000 });

      await recStore.increment('rec_1');
      await recStore.increment('rec_2');
      await recStore.increment('rec_3');
      assert.strictEqual(recStore._isCircuitOpen(), true);

      // Simulate recovery and window expiration
      mockRedisRecovered = true;
      recStore.circuitOpenUntil = Date.now() - 100;
      assert.strictEqual(recStore._isCircuitOpen(), false);

      const recRes = await recStore.increment('rec_probe');
      assert.strictEqual(recRes.totalHits, 1);
      assert.strictEqual(recStore.consecutiveFailures, 0);
      assert.strictEqual(recStore._isCircuitOpen(), false);
      console.log('  ✓ Scenario 7 PASS: Probe on recovered Redis resets failures and closes circuit');

      // ----------------------------------------------------
      // Scenario 8: Real Redis increment, decrement, and reset
      // ----------------------------------------------------
      console.log('  Scenario 8: Real Docker Redis-backed increment, decrement, and reset...');
      const realClient = new Redis('redis://127.0.0.1:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      const realStore = createFallbackStore('rl:test_scen8:', realClient);
      realStore.init({ windowMs: 60000 });

      await realStore.resetKey('counter_test');
      const inc1 = await realStore.increment('counter_test');
      assert.strictEqual(inc1.totalHits, 1, 'First hit must be 1');

      const inc2 = await realStore.increment('counter_test');
      assert.strictEqual(inc2.totalHits, 2, 'Second hit must be 2');

      await realStore.decrement('counter_test');
      const getDecr = await realStore.get('counter_test');
      assert.strictEqual(getDecr.totalHits, 1, 'After decrement, hits must be 1');

      await realStore.resetKey('counter_test');
      const incAfterReset = await realStore.increment('counter_test');
      assert.strictEqual(incAfterReset.totalHits, 1, 'After resetKey, hits must be 1');
      console.log('  ✓ Scenario 8 PASS: Real Redis increment, decrement, and resetKey operate accurately');
      await realClient.quit();

      // ----------------------------------------------------
      // Scenario 9: Multiple limiters sharing dedicated client safely
      // ----------------------------------------------------
      console.log('  Scenario 9: Multiple limiters sharing dedicated client without interference...');
      const sharedClient = getRateLimitRedisClient();
      const s1 = createFallbackStore('rl:shared_login:', sharedClient);
      const s2 = createFallbackStore('rl:shared_otp:', sharedClient);
      const s3 = createFallbackStore('rl:shared_ai:', sharedClient);

      s1.init({ windowMs: 60000 });
      s2.init({ windowMs: 60000 });
      s3.init({ windowMs: 60000 });

      const [rShared1, rShared2, rShared3] = await Promise.all([
        s1.increment('user_common'),
        s2.increment('user_common'),
        s3.increment('user_common'),
      ]);

      assert.strictEqual(rShared1.totalHits, 1, 'Store 1 hits must be 1');
      assert.strictEqual(rShared2.totalHits, 1, 'Store 2 hits must be 1');
      assert.strictEqual(rShared3.totalHits, 1, 'Store 3 hits must be 1');

      // Verify second hit on s1 does not affect s2 or s3
      const rShared1Second = await s1.increment('user_common');
      assert.strictEqual(rShared1Second.totalHits, 2);

      const checkS2 = await s2.get('user_common');
      assert.strictEqual(checkS2.totalHits, 1, 'Store 2 must remain isolated at 1');
      console.log('  ✓ Scenario 9 PASS: Multiple limiters share dedicated client with isolated counters');

      // ----------------------------------------------------
      // Scenario 9b: GeneralRedisStore non-blocking init, reconnect preloading, and deduplication
      // ----------------------------------------------------
      console.log('  Scenario 9b: GeneralRedisStore non-blocking init, deduplicated preloading, & reconnect...');
      const { createRedisStore, GeneralRedisStore } = require('../middleware/rateLimitMiddleware');
      const genClient = new Redis('redis://127.0.0.1:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });

      const genStore = createRedisStore('rl:test_gen_scen:', genClient);
      const tGenInit = Date.now();
      genStore.init({ windowMs: 60000 });
      const genInitDuration = Date.now() - tGenInit;
      assert(genInitDuration < 100, `genStore.init() must be non-blocking (<100ms), took ${genInitDuration}ms`);

      // Allow background ready preloading to settle
      await new Promise((r) => setTimeout(r, 40));
      const genInc1 = await genStore.increment('gen_user_1');
      assert.strictEqual(genInc1.totalHits, 1);

      // Verify deduplicated preloading does not throw on concurrent triggers
      await Promise.all([
        genStore._safePreloadScripts(),
        genStore._safePreloadScripts(),
        genStore._safePreloadScripts(),
      ]);

      // Simulate reconnect event
      genClient.emit('ready');
      await new Promise((r) => setTimeout(r, 30));
      const genInc2 = await genStore.increment('gen_user_1');
      assert.strictEqual(genInc2.totalHits, 2, 'Counter must increment after simulated reconnect');
      console.log('  ✓ Scenario 9b PASS: GeneralRedisStore non-blocking init & reconnect preload verified');
      await genClient.quit();

      // ----------------------------------------------------
      // Scenario 10: Zero unhandled promise rejections
      // ----------------------------------------------------
      console.log('  Scenario 10: Verifying zero unhandled promise rejections...');
      // Wait 150ms for any background timers or late rejections to surface
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(
        unhandledRejections.length,
        0,
        `Expected 0 unhandled promise rejections, got ${unhandledRejections.length}: ${unhandledRejections.join(', ')}`
      );
      console.log('  ✓ Scenario 10 PASS: Zero unhandled promise rejections detected across all tests');

    } finally {
      process.removeListener('unhandledRejection', rejectionHandler);
    }

    console.log('\n======================================================');
    console.log('   ALL REDIS RESILIENCE & AI BUDGET TESTS PASSED!     ');
    console.log('======================================================\n');
  } finally {
    await closeRedisConnections();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

if (require.main === module) {
  runResilienceTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Resilience test failed:', err);
      process.exit(1);
    });
}

module.exports = runResilienceTests;
