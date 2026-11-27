/**
 * Test Suite: Phase B Reliability Verification
 *
 * Verifies:
 * 1. B1: Queue reliability & safe failure recording (no false in-memory claims in Redis mode).
 * 2. B2: Database connectivity error in authMiddleware returns HTTP 503 (DB_UNAVAILABLE), not 401.
 * 3. B3: Refresh token rotation with atomic 15-second grace window for concurrent requests and reuse detection.
 * 4. B4: ConversationMeta validation rejecting 'null', 'undefined', and preventing duplicate key crashes.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test_jwt_secret_phase_b_12345';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_phase_b_12345';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User, ConversationMeta } = require('../models');
const { protect } = require('../middleware/authMiddleware');
const generateTokenHelper = require('../utils/generateToken');
const emailQueue = require('../utils/emailQueue');
const EmailLog = require('../models/EmailLog');

const generateToken = generateTokenHelper.generateToken || generateTokenHelper;
const generateRefreshToken = generateTokenHelper.generateRefreshToken;
const hashToken = generateTokenHelper.hashToken;

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL [${totalTests}]: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  PASS [${totalTests}]: ${message}`);
  }
}

async function runPhaseBTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING PHASE B RELIABILITY TEST SUITE');
  console.log('======================================================\n');

  const MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_system_test';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
  }

  const testEmail = `phase_b_test_${Date.now()}@example.com`;

  // Clean previous test user
  await User.deleteMany({ email: { $regex: /phase_b_test_/ } });
  await ConversationMeta.deleteMany({ title: { $regex: /Phase B Test/ } });

  const testUser = await User.create({
    name: 'Phase B Test User',
    email: testEmail,
    password: 'Password123!@#',
    role: 'student',
    isApproved: true,
    isEmailVerified: true,
  });

  // -------------------------------------------------------------------------
  // SECTION 1: B2 - MongoDB Error vs JWT Error in Auth Middleware
  // -------------------------------------------------------------------------
  console.log('--- Testing B2: Auth Middleware DB Connectivity vs Invalid JWT ---');

  // Test 1.1: Missing token returns 401
  {
    const req = { headers: {}, set: () => {} };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      set: () => {},
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert(statusSent === 401, 'Missing Authorization header returns 401');
    assert(jsonSent?.message?.includes('no token provided'), 'Missing token error message is accurate');
    assert(!nextCalled, 'next() not called on missing token');
  }

  // Test 1.2: Invalid JWT signature/expired token returns 401
  {
    const req = {
      headers: { authorization: 'Bearer invalid.token.payload' },
      set: () => {},
    };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      set: () => {},
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };
    let nextCalled = false;
    await protect(req, res, () => { nextCalled = true; });

    assert(statusSent === 401, 'Malformed JWT token returns 401');
    assert(jsonSent?.message?.includes('token failed or expired'), 'Invalid token message is accurate');
    assert(!nextCalled, 'next() not called on invalid token');
  }

  // Test 1.3: Valid JWT but MongoDB throws MongoServerSelectionError -> returns 503 DB_UNAVAILABLE
  {
    const validToken = generateToken(testUser._id);
    const req = {
      headers: { authorization: `Bearer ${validToken}` },
      set: () => {},
    };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      set: () => {},
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };
    let nextCalled = false;

    // Temporarily mock User.findById to simulate DB outage
    const originalFindById = User.findById;
    User.findById = () => {
      const dbErr = new Error('getaddrinfo ENOTFOUND cluster0.mongodb.net');
      dbErr.name = 'MongoServerSelectionError';
      throw dbErr;
    };

    try {
      await protect(req, res, () => { nextCalled = true; });
    } finally {
      User.findById = originalFindById;
    }

    assert(statusSent === 503, 'Database outage during JWT verification returns HTTP 503 Service Unavailable');
    assert(jsonSent?.code === 'DB_UNAVAILABLE', 'Response code is DB_UNAVAILABLE');
    assert(jsonSent?.message?.includes('Database service temporarily unavailable'), 'User-friendly DB outage message');
    assert(!nextCalled, 'next() not called when database is down');
  }

  // Test 1.4: Valid JWT with working DB calls next() and attaches req.user
  {
    const validToken = generateToken(testUser._id);
    const req = {
      headers: { authorization: `Bearer ${validToken}` },
      set: () => {},
    };
    let nextCalled = false;
    const res = {
      set: () => {},
      status: () => ({ json: () => {} }),
    };

    await protect(req, res, () => { nextCalled = true; });

    assert(nextCalled, 'Valid token with connected DB successfully calls next()');
    assert(req.user && req.user._id.toString() === testUser._id.toString(), 'req.user correctly attached');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: B3 - Refresh Token Rotation, Grace Window, and Reuse Detection
  // -------------------------------------------------------------------------
  console.log('\n--- Testing B3: Refresh Token Rotation & Grace Window ---');

  const { refreshToken, logout } = require('../controllers/authController');

  // Test 2.1: Missing refresh token cookie returns 401
  {
    const req = { cookies: {} };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
      clearCookie: () => {},
    };
    await refreshToken(req, res, () => {});
    assert(statusSent === 401, 'Missing refresh token cookie returns 401');
  }

  // Test 2.2: Initial refresh rotates token and sets previousRefreshTokenHash
  const initialRefreshToken = generateRefreshToken(testUser._id);
  testUser.refreshTokenHash = hashToken(initialRefreshToken);
  testUser.previousRefreshTokenHash = null;
  testUser.previousRefreshTokenExpiresAt = null;
  await testUser.save();

  let rotatedToken = null;
  {
    const req = { cookies: { refreshToken: initialRefreshToken } };
    let statusSent = null;
    let jsonSent = null;
    let cookieSet = {};
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
      cookie: (name, val) => {
        cookieSet[name] = val;
      },
      clearCookie: () => {},
    };

    await refreshToken(req, res, () => {});

    assert(statusSent === 200, 'First refresh token request succeeds with 200');
    assert(Boolean(jsonSent?.token), 'New access token is issued');
    assert(Boolean(cookieSet.refreshToken), 'New refresh token cookie is set');

    rotatedToken = cookieSet.refreshToken;

    // Check database state
    const updatedUser = await User.findById(testUser._id);
    assert(updatedUser.refreshTokenHash === hashToken(rotatedToken), 'Active refreshTokenHash updated to new token');
    assert(updatedUser.previousRefreshTokenHash === hashToken(initialRefreshToken), 'previousRefreshTokenHash preserves previous token');
    assert(updatedUser.previousRefreshTokenExpiresAt > new Date(), 'previousRefreshTokenExpiresAt set in future');
  }

  // Test 2.3: Concurrent second request using initial token within grace window succeeds!
  {
    const req = { cookies: { refreshToken: initialRefreshToken } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
      cookie: () => {},
      clearCookie: () => {},
    };

    await refreshToken(req, res, () => {});

    assert(statusSent === 200, 'Concurrent request with previous token within grace window succeeds with 200');
    assert(Boolean(jsonSent?.token), 'Valid access token issued during grace window');

    // Verify session was NOT revoked
    const userInGrace = await User.findById(testUser._id);
    assert(Boolean(userInGrace.refreshTokenHash), 'User session remains active during grace window');
  }

  // Test 2.4: Tampering / Replay with expired grace window revokes all sessions
  {
    // Artificially expire the grace window
    await User.findByIdAndUpdate(testUser._id, {
      previousRefreshTokenExpiresAt: new Date(Date.now() - 1000),
    });

    const req = { cookies: { refreshToken: initialRefreshToken } };
    let statusSent = null;
    let jsonSent = null;
    let cookieCleared = false;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
      cookie: () => {},
      clearCookie: () => { cookieCleared = true; },
    };

    await refreshToken(req, res, () => {});

    assert(statusSent === 401, 'Request with expired grace window token returns 401');
    assert(cookieCleared, 'Cookie cleared on expired/replayed token');

    const revokedUser = await User.findById(testUser._id);
    assert(revokedUser.refreshTokenHash === null, 'All active refresh sessions revoked on token replay detection');
    assert(revokedUser.previousRefreshTokenHash === null, 'Previous refresh hash cleared on revocation');
  }

  // Test 2.5: Logout revokes both active and previous refresh hashes
  {
    const freshRefreshToken = generateRefreshToken(testUser._id);
    testUser.refreshTokenHash = hashToken(freshRefreshToken);
    testUser.previousRefreshTokenHash = 'some_old_hash';
    testUser.previousRefreshTokenExpiresAt = new Date(Date.now() + 15000);
    await testUser.save();

    const req = { cookies: { refreshToken: freshRefreshToken }, user: testUser };
    let statusSent = null;
    let cookieCleared = false;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: () => {} };
      },
      clearCookie: () => { cookieCleared = true; },
    };

    await logout(req, res, () => {});

    assert(statusSent === 200, 'Logout succeeds with 200');
    assert(cookieCleared, 'Refresh cookie cleared on logout');

    const loggedOutUser = await User.findById(testUser._id);
    assert(loggedOutUser.refreshTokenHash === null, 'refreshTokenHash cleared on logout');
    assert(loggedOutUser.previousRefreshTokenHash === null, 'previousRefreshTokenHash cleared on logout');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: B4 - ConversationMeta Duplicate "null" Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- Testing B4: ConversationMeta "null" Key Prevention ---');

  // Test 3.1: ConversationMeta rejects literal string "null"
  {
    let validationError = null;
    try {
      await ConversationMeta.create({
        conversationId: 'null',
        user: testUser._id,
        title: 'Phase B Test 1',
      });
    } catch (err) {
      validationError = err;
    }
    assert(Boolean(validationError), 'ConversationMeta rejects conversationId="null"');
    assert(validationError?.name === 'ValidationError', 'Validation error thrown for "null" string');
  }

  // Test 3.2: ConversationMeta rejects literal string "undefined"
  {
    let validationError = null;
    try {
      await ConversationMeta.create({
        conversationId: 'undefined',
        user: testUser._id,
        title: 'Phase B Test 2',
      });
    } catch (err) {
      validationError = err;
    }
    assert(Boolean(validationError), 'ConversationMeta rejects conversationId="undefined"');
  }

  // Test 3.3: ConversationMeta accepts valid unique IDs
  {
    const validId1 = `conv_${Date.now()}_1`;
    const validId2 = `conv_${Date.now()}_2`;

    const meta1 = await ConversationMeta.create({
      conversationId: validId1,
      user: testUser._id,
      title: 'Phase B Test Valid 1',
    });
    const meta2 = await ConversationMeta.create({
      conversationId: validId2,
      user: testUser._id,
      title: 'Phase B Test Valid 2',
    });

    assert(meta1.conversationId === validId1, 'First valid conversation metadata saved');
    assert(meta2.conversationId === validId2, 'Second valid conversation metadata saved');

    // Clean up
    await ConversationMeta.deleteMany({ _id: { $in: [meta1._id, meta2._id] } });
  }

  // -------------------------------------------------------------------------
  // SECTION 4: B1 - EmailQueue Redis Mode Queue Unavailable Handling
  // -------------------------------------------------------------------------
  console.log('\n--- Testing B1: EmailQueue Redis Unavailable Safe Failure ---');

  {
    // Test that when in Redis mode, failure to add to BullMQ marks EmailLog as failed, not in-memory
    const originalIsRedis = emailQueue.isRedisMode;
    const originalGetBull = emailQueue.getBullQueue;

    emailQueue.isRedisMode = () => true;
    emailQueue.getBullQueue = () => ({
      add: () => Promise.reject(new Error('BullMQ connection timed out')),
    });

    let logResult = null;
    try {
      logResult = await emailQueue.enqueueEmail({
        user: testUser._id,
        recipientEmail: 'test@example.com',
        subject: 'Phase B Queue Test',
        type: 'round_scheduled',
      });
    } finally {
      emailQueue.isRedisMode = originalIsRedis;
      emailQueue.getBullQueue = originalGetBull;
    }

    assert(Boolean(logResult), 'EmailLog entry created');
    const persistedLog = await EmailLog.findById(logResult._id);
    assert(persistedLog.status === 'failed', 'EmailLog status marked failed when BullMQ is unavailable');
    assert(persistedLog.error.includes('Queue unavailable'), 'Failure error recorded in EmailLog');

    // Clean up
    await EmailLog.findByIdAndDelete(logResult._id);
  }

  // Clean test user
  await User.findByIdAndDelete(testUser._id);

  console.log('\n======================================================');
  console.log(`🎉 ALL PHASE B TESTS PASSED (${passedTests}/${totalTests})`);
  console.log('======================================================\n');
}

runPhaseBTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Phase B test suite encountered an unexpected failure:', err);
    process.exit(1);
  });
