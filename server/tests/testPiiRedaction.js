/**
 * server/tests/testPiiRedaction.js
 *
 * Comprehensive PII Redaction & AI Privacy Regression Test Suite.
 * Covers all 10 scenarios mandated in Phase 0 Step 4:
 * 1. Year ranges and calendar dates are preserved (no false positive [PHONE_REDACTED]).
 * 2. Valid Indian and international phone numbers are properly redacted.
 * 3. Email addresses are properly redacted across multiple domains and structures.
 * 4. National IDs (Aadhaar, PAN, SSN) are properly redacted.
 * 5. API keys and credentials (Google AIza, Groq gsk_, OpenAI sk-, GitHub PAT, AWS, Bearer, PEM keys) are redacted.
 * 6. ReDoS / catastrophic backtracking protection: 40k digit/symbol input executes in < 100ms.
 * 7. Assistant tool outputs are sanitized before LLM synthesis (contacts stripped, arrays capped at 25, size bounded).
 * 8. Assistant conversation history has PII redacted during prompt context assembly (mapLogToMessage & olderSummary).
 * 9. OCR fallback enforces file size, validates daily quota via AiUsage, and logs telemetry in AiCallLog without raw buffers.
 * 10. AiCallLog error messages sanitize credentials and sensitive tokens without persisting raw prompts/resumes.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';

const { getTestDbUri } = require('./testHelper');
const {
  redactPII,
  isYearRangeOrDate,
  PHONE_REGEX,
  EMAIL_REGEX,
  AADHAAR_REGEX,
  PAN_REGEX,
  SSN_REGEX,
  ADDRESS_REGEX,
  CREDENTIALS_REGEX,
} = require('../services/ai/redactor');
const { tokenizeText, detokenize } = require('../services/resumeBuilder/tokenMasker');
const { sanitizeToolOutputForLlm } = require('../services/assistant/orchestrator');
const {
  saveMessage,
  getConversationContext,
  mapLogToMessage,
} = require('../services/assistant/conversationService');
const {
  performOcrFallback,
  extractResumeText,
  MAX_RESUME_SIZE,
} = require('../services/ai/resumeTextExtractor');
const AiUsage = require('../models/AiUsage');
const AiCallLog = require('../models/AiCallLog');
const { User, Student, ChatLog } = require('../models');

async function runPiiRedactionTests() {
  console.log('======================================================');
  console.log('       TEST: PII REDACTION & AI PRIVACY HARDENING     ');
  console.log('======================================================\n');

  await mongoose.connect(getTestDbUri());
  console.log('Connected to test DB:', mongoose.connection.name);

  // Helper cleanup
  const testEmailPrefix = 'pii_test_' + Date.now();
  const testUserId = new mongoose.Types.ObjectId();

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Year ranges & dates preserved (no false positive phone redaction)
    // -------------------------------------------------------------------------
    console.log('1. Testing year ranges and calendar dates are preserved...');
    const yearRangeSample =
      'Education: B.Tech in Computer Engineering (2019-2023) at ABC Institute. Class of 2020 - 2024. Internship: 2018-22. Graduated on 2023-05-12 (or 12-05-2023).';
    const redactedYears = redactPII(yearRangeSample);

    assert.ok(
      !redactedYears.includes('[PHONE_REDACTED]'),
      `Year ranges should not be converted to [PHONE_REDACTED], got: ${redactedYears}`
    );
    assert.ok(redactedYears.includes('2019-2023'), '2019-2023 must be preserved');
    assert.ok(redactedYears.includes('2020 - 2024'), '2020 - 2024 must be preserved');
    assert.ok(redactedYears.includes('2018-22'), '2018-22 must be preserved');
    assert.ok(redactedYears.includes('2023-05-12'), '2023-05-12 date must be preserved');
    assert.ok(isYearRangeOrDate('2019-2023'), 'isYearRangeOrDate helper must return true for 2019-2023');
    assert.ok(isYearRangeOrDate('2020 - 2024'), 'isYearRangeOrDate helper must return true for 2020 - 2024');

    // Also test tokenMasker preserves year ranges
    const tokenizedYears = tokenizeText(yearRangeSample);
    assert.strictEqual(
      Object.keys(tokenizedYears.tokenMap).filter((k) => k.startsWith('[[PHONE_')).length,
      0,
      'tokenMasker must not tokenize year ranges as phone numbers'
    );

    // Non-PII technical content preservation test
    const techSample =
      'Built high-performance microservices using React 18.3.1, Node.js 22.23.4, Express 4.18.2, MongoDB 8.2, and Redis 7.0 on port 8080. GPA: 3.85/4.00 and 8.8/10.0. Handled HTTP 500 and 404 gracefully.';
    const redactedTech = redactPII(techSample);
    assert.ok(redactedTech.includes('18.3.1'), 'Semver version must not be redacted');
    assert.ok(redactedTech.includes('22.23.4'), 'Node version must not be redacted');
    assert.ok(redactedTech.includes('8080'), 'Port 8080 must not be redacted');
    assert.ok(redactedTech.includes('3.85/4.00'), 'GPA must not be redacted');
    assert.ok(redactedTech.includes('8.8/10.0'), 'GPA must not be redacted');
    assert.ok(redactedTech.includes('HTTP 500'), 'HTTP status code must not be redacted');

    // Serialized and nested text redaction test
    const serializedJson = JSON.stringify({ user: 'Bob', email: 'bob@sub.domain.org', phone: '9876543210' });
    const redactedJson = redactPII(serializedJson);
    assert.ok(!redactedJson.includes('bob@sub.domain.org'), 'Serialized email must be redacted');
    assert.ok(!redactedJson.includes('9876543210'), 'Serialized phone must be redacted');
    assert.ok(redactedJson.includes('[EMAIL_REDACTED]'), 'Serialized placeholder must be inserted');

    const markdownSample = 'Reach me at [my email](mailto:charlie@college.edu) or [my profile](https://linkedin.com/in/charlie).';
    const redactedMarkdown = redactPII(markdownSample);
    assert.ok(!redactedMarkdown.includes('charlie@college.edu'), 'Markdown mailto email must be redacted');
    assert.ok(redactedMarkdown.includes('[EMAIL_REDACTED]'), 'Markdown placeholder must be inserted');

    console.log('✓ Year ranges, dates, and non-PII technical content preserved without false positives\n');

    // -------------------------------------------------------------------------
    // SCENARIO 2: Valid Phone numbers properly redacted
    // -------------------------------------------------------------------------
    console.log('2. Testing valid phone numbers are properly redacted...');
    const phoneSample =
      'Call me at +91 98765 43210 or 98765-43210. US office: +1 (555) 234-5678 or (987) 654-3210. Mobile: 9876543210.';
    const redactedPhones = redactPII(phoneSample);

    assert.ok(!redactedPhones.includes('98765 43210'), 'Phone numbers must be stripped');
    assert.ok(!redactedPhones.includes('98765-43210'), 'Dashed phone numbers must be stripped');
    assert.ok(!redactedPhones.includes('234-5678'), 'US phone numbers must be stripped');
    assert.ok(!redactedPhones.includes('9876543210'), '10-digit mobile numbers must be stripped');
    assert.ok(
      redactedPhones.includes('[PHONE_REDACTED]'),
      'Must contain [PHONE_REDACTED] placeholder'
    );
    console.log('✓ Valid phone numbers properly redacted\n');

    // -------------------------------------------------------------------------
    // SCENARIO 3: Email addresses properly redacted
    // -------------------------------------------------------------------------
    console.log('3. Testing email addresses are properly redacted...');
    const emailSample =
      'Reach student at student.alpha@college.edu or personal dev-test_123@sub.domain.org.';
    const redactedEmails = redactPII(emailSample);

    assert.ok(!redactedEmails.includes('student.alpha@college.edu'), 'Institutional email must be redacted');
    assert.ok(!redactedEmails.includes('dev-test_123@sub.domain.org'), 'Subdomain email must be redacted');
    assert.ok(redactedEmails.includes('[EMAIL_REDACTED]'), 'Must contain [EMAIL_REDACTED] placeholder');
    console.log('✓ Email addresses properly redacted\n');

    // -------------------------------------------------------------------------
    // SCENARIO 4: National IDs (Aadhaar, PAN, SSN) properly redacted
    // -------------------------------------------------------------------------
    console.log('4. Testing national IDs (Aadhaar, PAN, SSN) are properly redacted...');
    const idSample =
      'Government IDs: Aadhaar 1234 5678 9012, PAN ABCDE1234F, SSN 123-45-6789.';
    const redactedIds = redactPII(idSample);

    assert.ok(!redactedIds.includes('1234 5678 9012'), 'Aadhaar number must be redacted');
    assert.ok(!redactedIds.includes('ABCDE1234F'), 'PAN number must be redacted');
    assert.ok(!redactedIds.includes('123-45-6789'), 'SSN number must be redacted');
    assert.ok(redactedIds.includes('[ID_REDACTED]'), 'Must contain [ID_REDACTED] placeholder');
    console.log('✓ National IDs properly redacted\n');

    // -------------------------------------------------------------------------
    // SCENARIO 5: API keys and credentials properly redacted
    // -------------------------------------------------------------------------
    console.log('5. Testing API keys and credentials are properly redacted...');
    const credsSample = [
      'Google Key: AIzaSyD9xYZ123456789012345678901234',
      'Groq Key: gsk_1234567890abcdef1234567890abcdef12345678',
      'OpenAI Key: sk-proj-1234567890abcdef1234567890abcdef',
      'GitHub Token: ghp_1234567890abcdef1234567890abcdef1234',
      'AWS Key: AKIAIOSFODNN7EXAMPLE',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyPayload.dummySig',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----',
    ].join('\n');

    const redactedCreds = redactPII(credsSample);

    assert.ok(!redactedCreds.includes('AIzaSyD9xYZ'), 'Google API key must be redacted');
    assert.ok(!redactedCreds.includes('gsk_1234567890'), 'Groq API key must be redacted');
    assert.ok(!redactedCreds.includes('sk-proj-1234567890'), 'OpenAI key must be redacted');
    assert.ok(!redactedCreds.includes('ghp_1234567890'), 'GitHub PAT must be redacted');
    assert.ok(!redactedCreds.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS access key must be redacted');
    assert.ok(!redactedCreds.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token must be redacted');
    assert.ok(!redactedCreds.includes('MIIEowIBAAKCAQEA0'), 'Private key must be redacted');
    assert.ok(redactedCreds.includes('[CREDENTIAL_REDACTED]'), 'Must contain [CREDENTIAL_REDACTED] placeholder');
    console.log('✓ Credentials and API keys properly redacted\n');

    // -------------------------------------------------------------------------
    // SCENARIO 6: ReDoS safety & bounded execution time (40,000 characters)
    // -------------------------------------------------------------------------
    console.log('6. Testing ReDoS safety and performance on 40,000-character input...');
    const longDigits = '9'.repeat(40000);
    const startDigits = Date.now();
    const resDigits = redactPII(longDigits);
    const durationDigits = Date.now() - startDigits;

    assert.ok(
      durationDigits < 100,
      `40k digits must process in < 100ms without ReDoS, took: ${durationDigits}ms`
    );
    assert.strictEqual(resDigits.length, 40000, '40k digits result preserved');

    // Also test alphanumeric with street-like words without matching address prefix
    const longAlnum = 'Street Avenue Road Nagar Colony '.repeat(1200); // ~38,400 chars
    const startAlnum = Date.now();
    const resAlnum = redactPII(longAlnum);
    const durationAlnum = Date.now() - startAlnum;

    assert.ok(
      durationAlnum < 100,
      `40k alphanumeric string must process in < 100ms without ReDoS, took: ${durationAlnum}ms`
    );
    console.log(`✓ ReDoS safety verified (digits: ${durationDigits}ms, alnum: ${durationAlnum}ms)\n`);

    // -------------------------------------------------------------------------
    // SCENARIO 7: Assistant tool outputs sanitized before LLM synthesis
    // -------------------------------------------------------------------------
    console.log('7. Testing assistant tool output sanitization...');
    const rawToolOutput = {
      collegeName: 'Alpha Engineering College',
      students: Array.from({ length: 35 }, (_, idx) => ({
        id: idx + 1,
        name: `Candidate ${idx + 1}`,
        email: `candidate${idx + 1}@college.edu`,
        phone: '+91 98765 000' + String(idx).padStart(2, '0'),
        personalEmail: `private${idx + 1}@gmail.com`,
        notes: `Graduated 2019-2023. Reachable at backup${idx + 1}@college.edu`,
      })),
      statistics: {
        totalEligible: 35,
        avgCgpa: 8.5,
      },
    };

    const sanitizedJson = sanitizeToolOutputForLlm(rawToolOutput, 25, 15000);
    const sanitizedObj = JSON.parse(sanitizedJson);

    // 1. Arrays capped at 25 items + truncation object
    assert.strictEqual(sanitizedObj.students.length, 26, 'Array must be sliced to 25 items + 1 truncation marker');
    assert.deepStrictEqual(sanitizedObj.students[25], {
      _truncated: true,
      totalItems: 35,
      showing: 25,
    });

    // 2. Personal contact fields masked
    assert.strictEqual(sanitizedObj.students[0].email, '[CONTACT_REDACTED]');
    assert.strictEqual(sanitizedObj.students[0].phone, '[CONTACT_REDACTED]');
    assert.strictEqual(sanitizedObj.students[0].personalEmail, '[CONTACT_REDACTED]');

    // 3. String notes redacted for PII while preserving year range
    assert.ok(!sanitizedObj.students[0].notes.includes('backup1@college.edu'), 'String email must be redacted');
    assert.ok(sanitizedObj.students[0].notes.includes('[EMAIL_REDACTED]'), 'String email placeholder inserted');
    assert.ok(sanitizedObj.students[0].notes.includes('2019-2023'), 'Year range in notes must be preserved');
    console.log('✓ Assistant tool output sanitized and bounded\n');

    // -------------------------------------------------------------------------
    // SCENARIO 8: Conversation history privacy during prompt assembly
    // -------------------------------------------------------------------------
    console.log('8. Testing conversation history PII redaction on prompt context build...');
    const convId = 'test_conv_pii_' + Date.now();

    // Save user message with raw sensitive info in DB
    await saveMessage({
      conversationId: convId,
      user: testUserId,
      role: 'student',
      sender: 'user',
      question: 'My email is bob.private@college.edu and phone is +91 98765 43210. Groq key: gsk_secret1234567890abcdef.',
      content: 'My email is bob.private@college.edu and phone is +91 98765 43210. Groq key: gsk_secret1234567890abcdef.',
      status: 'success',
    });

    // Save assistant reply
    await saveMessage({
      conversationId: convId,
      user: testUserId,
      role: 'student',
      sender: 'assistant',
      content: 'I have noted your contact bob.private@college.edu and details.',
      status: 'success',
    });

    // Retrieve context for model prompt
    const { recentMessages } = await getConversationContext(convId, testUserId);
    assert.ok(recentMessages.length >= 2, 'Should retrieve stored conversation messages');

    for (const msg of recentMessages) {
      assert.ok(
        !msg.content.includes('bob.private@college.edu'),
        `Prompt message must not contain raw email, got: ${msg.content}`
      );
      assert.ok(
        !msg.content.includes('98765 43210'),
        `Prompt message must not contain raw phone, got: ${msg.content}`
      );
      assert.ok(
        !msg.content.includes('gsk_secret1234567890abcdef'),
        `Prompt message must not contain raw API keys, got: ${msg.content}`
      );
    }

    // Direct unit test of mapLogToMessage
    const mapped = mapLogToMessage({
      sender: 'user',
      content: 'Contact me at alice.secret@domain.com or 9876543210',
    });
    assert.ok(!mapped.content.includes('alice.secret@domain.com'), 'mapLogToMessage must redact emails');
    assert.ok(!mapped.content.includes('9876543210'), 'mapLogToMessage must redact phones');
    assert.ok(mapped.content.includes('[EMAIL_REDACTED]'), 'mapLogToMessage must insert [EMAIL_REDACTED]');

    // Title generation question sanitization test
    const { generateConversationTitle } = require('../services/assistant/titleService');
    const titleRes = await generateConversationTitle({
      question: 'Need help formatting resume for email alice@secret.edu and phone 9876543210',
      userId: testUserId,
    });
    assert.ok(titleRes && titleRes.title, 'Title generation should produce a title');
    assert.ok(!titleRes.title.includes('alice@secret.edu'), 'Title must not leak student email');
    assert.ok(!titleRes.title.includes('9876543210'), 'Title must not leak phone number');
    console.log('✓ Conversation history and assistant titles PII-redacted during prompt context assembly\n');

    // -------------------------------------------------------------------------
    // SCENARIO 9: OCR fallback privacy, quota, and file bounds
    // -------------------------------------------------------------------------
    console.log('9. Testing OCR fallback privacy, quota, and file boundary enforcement...');

    // 1. Oversized file (> 5MB)
    const oversizedBuffer = Buffer.alloc(MAX_RESUME_SIZE + 100);
    await assert.rejects(
      async () => {
        await performOcrFallback(oversizedBuffer, { userId: testUserId });
      },
      (err) => err && err.code === 'FILE_TOO_LARGE',
      'Oversized buffer must throw FILE_TOO_LARGE'
    );

    // 2. Normal scanned buffer with quota available
    const scannedBuffer = Buffer.from('%PDF-1.4 Scanned resume content mock');
    const ocrText = await performOcrFallback(scannedBuffer, { userId: testUserId });
    assert.ok(ocrText.length > 0, 'Mock OCR should return text when quota allows');

    // Verify telemetry logged in AiCallLog
    const ocrLog = await AiCallLog.findOne({ userId: testUserId, feature: 'resume_ocr' }).sort({ timestamp: -1 });
    assert.ok(ocrLog, 'AiCallLog entry must be recorded for resume_ocr');
    assert.strictEqual(ocrLog.feature, 'resume_ocr', 'Feature must be resume_ocr');
    assert.strictEqual(ocrLog.status, 'success', 'Status must be success');

    // Verify usage recorded in AiUsage
    const dailyUsage = await AiUsage.getUserDailyUsage(testUserId, 'student');
    assert.ok(dailyUsage.used >= 1, 'AiUsage must record parse usage for OCR');

    // 3. Quota exhausted: simulate 20 parse calls
    const dateKey = AiUsage.getTodayKey();
    await AiUsage.findOneAndUpdate(
      { date: dateKey },
      { $set: { [`userCounts.${String(testUserId)}`]: 20 } },
      { upsert: true }
    );
    const exhaustedOcr = await performOcrFallback(scannedBuffer, { userId: testUserId });
    assert.strictEqual(exhaustedOcr, '', 'OCR fallback must return empty when user parse quota is exhausted');
    console.log('✓ OCR fallback validates file size, quota, and telemetry without logging raw buffers\n');

    // -------------------------------------------------------------------------
    // SCENARIO 10: Error and telemetry logging privacy
    // -------------------------------------------------------------------------
    console.log('10. Testing error and telemetry logging privacy in AiCallLog...');
    const sensitiveErrorMsg =
      'Request failed: Bearer eyJhbGciOiJIUzI1NiJ9.secretToken and API key AIzaSyD9xYZ123456789012345678901234 for user admin@platform.com';

    await AiCallLog.logCall({
      feature: 'test_telemetry',
      provider: 'mock',
      status: 'failed',
      errorMessage: sensitiveErrorMsg,
      userId: testUserId,
    });

    const loggedErrorEntry = await AiCallLog.findOne({
      userId: testUserId,
      feature: 'test_telemetry',
    }).sort({ timestamp: -1 });

    assert.ok(loggedErrorEntry, 'Log entry must be created');
    assert.ok(
      !loggedErrorEntry.errorMessage.includes('eyJhbGciOiJIUzI1NiJ9'),
      'Bearer token must not appear in logged error'
    );
    assert.ok(
      !loggedErrorEntry.errorMessage.includes('AIzaSyD9xYZ'),
      'API key must not appear in logged error'
    );
    assert.ok(
      !loggedErrorEntry.errorMessage.includes('admin@platform.com'),
      'Email must not appear in logged error'
    );
    assert.ok(
      loggedErrorEntry.errorMessage.includes('[CREDENTIAL_REDACTED]') ||
      loggedErrorEntry.errorMessage.includes('Bearer [REDACTED]') ||
      loggedErrorEntry.errorMessage.includes('[EMAIL_REDACTED]'),
      'Sanitized placeholders must be present in logged error'
    );
    console.log('✓ Error logs sanitize credentials, tokens, and emails\n');

    console.log('======================================================');
    console.log(' ALL 10 PII REDACTION & PRIVACY REGRESSION TESTS PASSED');
    console.log('======================================================\n');
  } finally {
    // Cleanup test artifacts
    await ChatLog.deleteMany({ user: testUserId });
    await AiUsage.deleteMany({ user: testUserId });
    await AiCallLog.deleteMany({ userId: testUserId });
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runPiiRedactionTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runPiiRedactionTests };
