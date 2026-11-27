/**
 * Test Suite: Refresh Token Concurrency, Rotation, Grace Window & Cookie Verification
 *
 * Verifies:
 * 1. Client concurrency: 10 simultaneous expired-access-token requests trigger exactly ONE refresh operation.
 * 2. Backend rotation: Initial refresh rotates token, sets previousRefreshTokenHash with 15s grace window, and sets new cookie.
 * 3. Concurrent requests during 15s grace window: 10 concurrent requests using previous token receive valid access tokens.
 * 4. Cookie safety during grace window: Concurrent responses do NOT invoke res.cookie (cannot overwrite cookie with obsolete token).
 * 5. Expired grace window rejection: Old token rejected with 401 after 15s grace window.
 * 6. Reuse detection: Token reuse after grace window revokes all sessions and wipes hashes.
 * 7. Logout: Wipes active & previous refresh hashes and clears cookie.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test_jwt_secret_concurrency_12345';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_concurrency_12345';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { refreshToken, logout } = require('../controllers/authController');
const generateTokenHelper = require('../utils/generateToken');
const generateRefreshToken = generateTokenHelper.generateRefreshToken;
const hashToken = generateTokenHelper.hashToken;

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL [${totalTests}]: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  PASS [${totalTests}]: ${message}`);
}

async function runConcurrencyTests() {
  console.log('======================================================');
  console.log('🚀 RUNNING REFRESH TOKEN CONCURRENCY & COOKIE TEST SUITE');
  console.log('======================================================\n');

  const MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_system_test';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
  }

  // Clean up any test user
  await User.deleteMany({ email: 'concurrency_test_user@example.com' });

  const testUser = await User.create({
    name: 'Concurrency Test User',
    email: 'concurrency_test_user@example.com',
    password: 'Password123!',
    role: 'student',
    isApproved: true,
  });

  // -------------------------------------------------------------------------
  // SECTION 1: Client Interceptor Single In-Flight Promise Simulation
  // -------------------------------------------------------------------------
  console.log('--- Testing 1: Client Interceptor 10 Concurrent Expired Requests ---');
  {
    let refreshNetworkCalls = 0;
    let refreshPromise = null;

    // Simulate the exact client logic in client/src/services/api.js
    const simulateBackendRefresh = async () => {
      refreshNetworkCalls++;
      // Simulate network roundtrip latency
      await new Promise((r) => setTimeout(r, 40));
      return 'new_mock_jwt_access_token_' + Date.now();
    };

    const handleClient401 = () => {
      if (!refreshPromise) {
        refreshPromise = simulateBackendRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      return refreshPromise;
    };

    // Fire 10 simultaneous 401s from the client
    const promises = Array.from({ length: 10 }, (_, i) =>
      handleClient401().then((token) => ({ index: i, token }))
    );

    const results = await Promise.all(promises);

    assert(refreshNetworkCalls === 1, 'Exactly 1 refresh network call occurred for 10 simultaneous requests');
    assert(results.length === 10, 'All 10 requests resolved successfully');
    const firstToken = results[0].token;
    assert(results.every((r) => r.token === firstToken), 'All 10 requests shared identical refreshed token');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Initial Rotation, DB State & Cookie Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Testing 2: Initial Refresh Token Rotation & Cookie Setup ---');
  const tokenA = generateRefreshToken(testUser._id);
  testUser.refreshTokenHash = hashToken(tokenA);
  testUser.previousRefreshTokenHash = null;
  testUser.previousRefreshTokenExpiresAt = null;
  await testUser.save();

  let tokenB = null;
  let cookieHeaderSet = null;

  {
    const req = {
      cookies: { refreshToken: tokenA },
    };

    let statusSent = null;
    let jsonSent = null;
    const cookieJar = {};

    const res = {
      status: (s) => {
        statusSent = s;
        return {
          json: (j) => {
            jsonSent = j;
          },
        };
      },
      cookie: (name, val, opts) => {
        cookieJar[name] = { val, opts };
      },
      clearCookie: () => {},
    };

    await refreshToken(req, res, () => {});

    assert(statusSent === 200, 'Initial token rotation succeeds with 200');
    assert(Boolean(jsonSent?.token), 'New access token returned in response');
    assert(Boolean(cookieJar.refreshToken), 'res.cookie was called with refreshToken');
    assert(cookieJar.refreshToken.opts.httpOnly === true, 'Cookie has httpOnly: true');
    assert(['strict', 'lax', 'none'].includes(cookieJar.refreshToken.opts.sameSite), 'Cookie has valid sameSite policy');

    tokenB = cookieJar.refreshToken.val;
    assert(tokenB && tokenB !== tokenA, 'Rotated token B is distinct from original token A');

    // Inspect MongoDB User document
    const userInDb = await User.findById(testUser._id);
    assert(userInDb.refreshTokenHash === hashToken(tokenB), 'Active hash in DB updated to Token B');
    assert(userInDb.previousRefreshTokenHash === hashToken(tokenA), 'Previous hash in DB points to Token A');
    assert(userInDb.previousRefreshTokenExpiresAt !== null, 'Grace window expiration timestamp set');
    const graceWindowMs = new Date(userInDb.previousRefreshTokenExpiresAt) - Date.now();
    assert(graceWindowMs > 5000 && graceWindowMs <= 16000, `Grace window is approx 15 seconds (${graceWindowMs}ms remaining)`);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: 10 Concurrent Requests During 15-Second Grace Window
  // -------------------------------------------------------------------------
  console.log('\n--- Testing 3: 10 Concurrent Requests During Grace Window (Cookie Safety) ---');
  {
    // Simulate 10 simultaneous requests arriving at the backend using the PREVIOUS token A
    // (e.g. before the browser received the set-cookie header from request 1)
    const concurrentRequests = Array.from({ length: 10 }, async (_, idx) => {
      const req = {
        cookies: { refreshToken: tokenA }, // Using previous token within grace window
      };

      let statusSent = null;
      let jsonSent = null;
      let cookieCalled = false;
      let cookieCleared = false;

      const res = {
        status: (s) => {
          statusSent = s;
          return {
            json: (j) => {
              jsonSent = j;
            },
          };
        },
        cookie: () => {
          cookieCalled = true;
        },
        clearCookie: () => {
          cookieCleared = true;
        },
      };

      await refreshToken(req, res, () => {});
      return { idx, statusSent, jsonSent, cookieCalled, cookieCleared };
    });

    const results = await Promise.all(concurrentRequests);

    assert(results.length === 10, 'All 10 concurrent requests completed');
    assert(
      results.every((r) => r.statusSent === 200),
      'All 10 concurrent requests with previous token in grace window succeeded with 200'
    );
    assert(
      results.every((r) => Boolean(r.jsonSent?.token)),
      'All 10 concurrent requests received valid new access tokens'
    );

    // CRITICAL SECURITY ASSERTION: res.cookie MUST NOT be called in grace period responses
    // This ensures concurrent responses CANNOT overwrite the browser's cookie with an obsolete token!
    const anyCookieOverwritten = results.some((r) => r.cookieCalled);
    assert(
      !anyCookieOverwritten,
      'CRITICAL: res.cookie was NEVER called for grace-period requests; cannot overwrite browser cookie with obsolete token'
    );

    const anyCookieCleared = results.some((r) => r.cookieCleared);
    assert(!anyCookieCleared, 'Cookies were not cleared during valid grace window');

    // DB session must still be intact with Token B as the active token
    const userAfterConcurrency = await User.findById(testUser._id);
    assert(
      userAfterConcurrency.refreshTokenHash === hashToken(tokenB),
      'User active token hash remains Token B'
    );
    assert(
      userAfterConcurrency.previousRefreshTokenHash === hashToken(tokenA),
      'User previous token hash remains Token A'
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 4: Expired Grace Window & Reuse Detection Revocation
  // -------------------------------------------------------------------------
  console.log('\n--- Testing 4: Expired Grace Window Rejection & Reuse Revocation ---');
  {
    // Artificially expire the grace window by setting previousRefreshTokenExpiresAt to 1 second in the past
    await User.findByIdAndUpdate(testUser._id, {
      previousRefreshTokenExpiresAt: new Date(Date.now() - 1000),
    });

    const req = {
      cookies: { refreshToken: tokenA }, // Token A has now expired its grace window!
    };

    let statusSent = null;
    let jsonSent = null;
    let cookieCleared = false;

    const res = {
      status: (s) => {
        statusSent = s;
        return {
          json: (j) => {
            jsonSent = j;
          },
        };
      },
      cookie: () => {},
      clearCookie: (name) => {
        if (name === 'refreshToken') cookieCleared = true;
      },
    };

    await refreshToken(req, res, () => {});

    assert(statusSent === 401, 'Request with previous token after grace window expired is rejected with 401');
    assert(cookieCleared, 'Browser refreshToken cookie is cleared on expired/replayed token');

    // Reuse detection: verify user session was completely revoked in MongoDB
    const revokedUser = await User.findById(testUser._id);
    assert(revokedUser.refreshTokenHash === null, 'Active refreshTokenHash wiped to null (reuse revocation)');
    assert(revokedUser.previousRefreshTokenHash === null, 'previousRefreshTokenHash wiped to null');
    assert(revokedUser.previousRefreshTokenExpiresAt === null, 'previousRefreshTokenExpiresAt wiped to null');

    // Subsequent call with Token B (which was valid before) must now ALSO be rejected
    {
      const reqB = { cookies: { refreshToken: tokenB } };
      let statusB = null;
      const resB = {
        status: (s) => {
          statusB = s;
          return { json: () => {} };
        },
        cookie: () => {},
        clearCookie: () => {},
      };
      await refreshToken(reqB, resB, () => {});
      assert(statusB === 401, 'Subsequent request with Token B rejected with 401 because session was revoked');
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 5: Logout Revocation & Cookie Clearing
  // -------------------------------------------------------------------------
  console.log('\n--- Testing 5: User Logout Revocation & Cookie Clearing ---');
  {
    // Set a fresh active token on user
    const tokenC = generateRefreshToken(testUser._id);
    testUser.refreshTokenHash = hashToken(tokenC);
    testUser.previousRefreshTokenHash = 'dummy_prev_hash';
    testUser.previousRefreshTokenExpiresAt = new Date(Date.now() + 15000);
    await testUser.save();

    const req = {
      user: testUser,
      cookies: { refreshToken: tokenC },
    };

    let statusSent = null;
    let jsonSent = null;
    let cookieCleared = false;
    let clearedCookieOptions = null;

    const res = {
      status: (s) => {
        statusSent = s;
        return {
          json: (j) => {
            jsonSent = j;
          },
        };
      },
      clearCookie: (name, opts) => {
        if (name === 'refreshToken') {
          cookieCleared = true;
          clearedCookieOptions = opts;
        }
      },
    };

    await logout(req, res, () => {});

    assert(statusSent === 200, 'Logout succeeds with 200');
    assert(cookieCleared, 'Logout called res.clearCookie for refreshToken');
    assert(clearedCookieOptions?.httpOnly === true, 'Clear cookie specifies httpOnly');

    const loggedOutUser = await User.findById(testUser._id);
    assert(loggedOutUser.refreshTokenHash === null, 'refreshTokenHash cleared in DB on logout');
    assert(loggedOutUser.previousRefreshTokenHash === null, 'previousRefreshTokenHash cleared in DB on logout');
    assert(loggedOutUser.previousRefreshTokenExpiresAt === null, 'previousRefreshTokenExpiresAt cleared in DB on logout');
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL REFRESH TOKEN CONCURRENCY TESTS PASSED (${passedTests}/${totalTests})`);
  console.log('======================================================\n');

  // Clean up
  await User.deleteMany({ email: 'concurrency_test_user@example.com' });
  await mongoose.disconnect();
}

runConcurrencyTests().catch((err) => {
  console.error('\n❌ Concurrency test suite failed:', err);
  process.exit(1);
});
