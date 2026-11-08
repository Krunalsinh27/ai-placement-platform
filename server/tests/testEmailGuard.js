const assert = require('assert');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const {
  shouldSendRealSmtp,
  isBlockedDomain,
  BLOCKED_DOMAINS,
  sendEmail,
  sendRawEmail,
  resetSmtpRateLimit,
} = require('../utils/emailService');
const emailQueue = require('../utils/emailQueue');
const EmailLog = require('../models/EmailLog');

async function runEmailGuardTests() {
  console.log('======================================================');
  console.log('       TEST: EMAIL GUARD & DELIVERY HARDENING        ');
  console.log('======================================================\n');

  // Connect to DB for queue testing
  const testDbUri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_management_test';
  await mongoose.connect(testDbUri);
  console.log('Connected to MongoDB test database successfully.\n');

  try {
    // -----------------------------------------------------------------
    // TEST 1: Blocked Domain Verification (never sent, even in production)
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Blocked Domains (Never passed to SMTP) ---');
    for (const domain of BLOCKED_DOMAINS) {
      const email = `candidate@${domain}`;
      assert.strictEqual(isBlockedDomain(email), true, `Domain ${domain} should be blocked`);
    }

    // Verify subdomains are also blocked (e.g. mail.portal.com)
    assert.strictEqual(isBlockedDomain('user@dept.college.com'), true);
    assert.strictEqual(isBlockedDomain('admin@sub.example.org'), true);

    // Verify shouldSendRealSmtp blocks blocked domains even if NODE_ENV=production and EMAIL_MODE=smtp
    const originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_MODE = 'smtp';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASS = 'secret1234';

    const blockedCheck1 = shouldSendRealSmtp('student@portal.com');
    assert.strictEqual(blockedCheck1.allowed, false);
    assert.strictEqual(blockedCheck1.mode, 'skipped');
    assert.ok(blockedCheck1.reason.includes('portal.com'));

    const blockedCheck2 = shouldSendRealSmtp('tpo@college.com');
    assert.strictEqual(blockedCheck2.allowed, false);
    assert.strictEqual(blockedCheck2.mode, 'skipped');

    console.log('✓ Blocked domains (portal.com, college.com, example.com, etc.) are strictly rejected in all environments.');

    // -----------------------------------------------------------------
    // TEST 2: Environment Guards (test env & dev allowlist)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Environment Guard & EMAIL_DEV_ALLOWLIST ---');

    // In NODE_ENV=test, never allow real SMTP
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_MODE = 'smtp';
    const testEnvCheck = shouldSendRealSmtp('realuser@gmail.com');
    assert.strictEqual(testEnvCheck.allowed, false);
    assert.strictEqual(testEnvCheck.mode, 'console');
    assert.ok(testEnvCheck.reason.includes('NODE_ENV is test'));
    console.log('✓ In test environment (NODE_ENV=test), real SMTP is always blocked.');

    // In development mode (NODE_ENV=development), recipient MUST be in EMAIL_DEV_ALLOWLIST
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_MODE = 'smtp';
    process.env.EMAIL_DEV_ALLOWLIST = 'allowed1@gmail.com, allowed2@company.com';

    // Unlisted address -> blocked
    const unlistedCheck = shouldSendRealSmtp('randomperson@gmail.com');
    assert.strictEqual(unlistedCheck.allowed, false);
    assert.strictEqual(unlistedCheck.mode, 'skipped');
    assert.ok(unlistedCheck.reason.includes('EMAIL_DEV_ALLOWLIST'));

    // Listed address -> allowed
    const listedCheck = shouldSendRealSmtp('allowed1@gmail.com');
    assert.strictEqual(listedCheck.allowed, true);

    console.log('✓ Non-production delivery requires recipient to be in EMAIL_DEV_ALLOWLIST.');

    // -----------------------------------------------------------------
    // TEST 3: Mock Transporter Check (Verify nodemailer is never called for fake domains)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: sendRawEmail Guard Execution ---');
    // Call sendRawEmail with fake domain
    const result = await sendRawEmail({
      to: 'seed_student@portal.com',
      subject: 'Interview Slot Scheduled',
      text: 'You have an interview',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, 'skipped');
    console.log('✓ sendRawEmail safely intercepts fake domain and returns mode="skipped" without touching SMTP.');

    // -----------------------------------------------------------------
    // TEST 4: Permanent Failure Classification & Non-retry in EmailQueue
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Permanent Failures (5xx, address not found) are NOT Retried ---');
    const isPermanent = emailQueue.isPermanentSmtpError;

    // 5xx errors
    assert.strictEqual(isPermanent({ responseCode: 550, message: '5.1.1 User unknown' }), true);
    assert.strictEqual(isPermanent({ code: '554', message: 'Transaction failed' }), true);
    assert.strictEqual(isPermanent(new Error('550 Address not found')), true);
    assert.strictEqual(isPermanent(new Error('Mailbox unavailable')), true);
    assert.strictEqual(isPermanent(new Error('Recipient rejected')), true);

    // Temporary errors (network timeouts, 4xx) should NOT be permanent
    assert.strictEqual(isPermanent(new Error('Connection timeout')), false);
    assert.strictEqual(isPermanent(new Error('ECONNRESET')), false);
    assert.strictEqual(isPermanent({ responseCode: 421, message: 'Service not available' }), false);

    console.log('✓ Permanent error classification (5xx, User unknown, Address not found) verified.');

    // Test queue processing with a permanent error: verify attempts = 1 and status = failed immediately
    let sendCalls = 0;
    emailQueue.setSenderFunction(async () => {
      sendCalls++;
      const err = new Error('550 5.1.1 Address not found: recipient does not exist');
      err.responseCode = 550;
      throw err;
    });

    const dummyUser = new mongoose.Types.ObjectId();
    const log = await emailQueue.enqueueEmail({
      user: dummyUser,
      recipientEmail: 'nonexistent@randomdomain.org',
      type: 'general_notification',
      subject: 'Test Permanent Error',
      htmlBody: '<p>Test</p>',
    });

    // Wait for queue processing to finish
    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatedLog = await EmailLog.findById(log._id);
    assert.strictEqual(updatedLog.status, 'failed');
    assert.strictEqual(updatedLog.attempts, 1);
    assert.strictEqual(sendCalls, 1);
    assert.ok(updatedLog.error.includes('Permanent failure'));
    console.log('✓ EmailQueue immediately marked 550 failure as failed with attempts=1 (0 retries).');

    emailQueue.resetSenderFunction();

    // -----------------------------------------------------------------
    // TEST 5: Real SMTP Per-Minute Rate Cap
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Per-Minute Rate Cap (EMAIL_MAX_PER_MINUTE) ---');
    const { shouldSendRealSmtp: checkRateLimit, resetSmtpRateLimit: resetLimit } = require('../utils/emailService');
    resetLimit();
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_MODE = 'smtp';
    process.env.EMAIL_MAX_PER_MINUTE = '2'; // Cap at 2 per minute for testing

    const capCheck1 = checkRateLimit('user1@realcorp.com');
    assert.strictEqual(capCheck1.allowed, true);

    // Call sendRawEmail with a mocked transporter to increment the real send count
    emailQueue.setSenderFunction(async () => ({ success: true, mode: 'smtp', messageId: 'test-1' }));
    
    // Simulate real sends via sendEmail or shouldSendRealSmtp
    // We can directly call sendRawEmail or recordRealSmtpSend
    const emailModule = require('../utils/emailService');
    // Using emailModule's methods
    // We have 2 allowed slots:
    // Slot 1
    assert.strictEqual(emailModule.shouldSendRealSmtp('allowed1@realcorp.com').allowed, true);
    // Simulate recording send 1
    // We can call sendRawEmail by mocking transporter or directly testing shouldSendRealSmtp after 2 recorded sends
    // To cleanly test:
    const nodemailer = require('nodemailer');
    const originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = () => ({
      sendMail: async () => ({ messageId: 'msg-mock' }),
    });

    // Send #1 (allowed)
    const res1 = await emailModule.sendRawEmail({ to: 'user1@realcorp.com', subject: 'Test 1' });
    assert.strictEqual(res1.mode, 'smtp');

    // Send #2 (allowed)
    const res2 = await emailModule.sendRawEmail({ to: 'user2@realcorp.com', subject: 'Test 2' });
    assert.strictEqual(res2.mode, 'smtp');

    // Send #3 (blocked by rate limit: cap is 2)
    const capCheck3 = emailModule.shouldSendRealSmtp('user3@realcorp.com');
    assert.strictEqual(capCheck3.allowed, false);
    assert.strictEqual(capCheck3.mode, 'skipped');
    assert.ok(capCheck3.reason.includes('Per-minute SMTP send cap reached'));

    const res3 = await emailModule.sendRawEmail({ to: 'user3@realcorp.com', subject: 'Test 3' });
    assert.strictEqual(res3.mode, 'skipped');
    assert.ok(res3.reason.includes('Per-minute SMTP send cap reached'));

    // Restore createTransport
    nodemailer.createTransport = originalCreateTransport;
    emailModule.resetSmtpRateLimit();

    // Restore env
    Object.assign(process.env, originalEnv);
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_MODE = 'console';

    console.log('✓ Rate cap (EMAIL_MAX_PER_MINUTE) effectively throttles sends after limit is reached.');

    console.log('\n======================================================');
    console.log('      ALL EMAIL GUARD TESTS PASSED SUCCESSFULLY!       ');
    console.log('======================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runEmailGuardTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Email guard test failed:', err);
      process.exit(1);
    });
}

module.exports = { runEmailGuardTests };
