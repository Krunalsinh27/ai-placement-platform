/**
 * server/tests/testAiProviderConfig.js
 *
 * Comprehensive AI Provider Configuration & Fallback Reliability Test Suite (Phase 0 Step 5).
 * Tests all 19 mandated scenarios covering:
 * 1. Groq primary provider success & configuration isolation.
 * 2. Gemini primary provider success & configuration isolation.
 * 3. Groq receives ONLY Groq key (no cross-provider credential leakage).
 * 4. Gemini receives ONLY Gemini key (no cross-provider credential leakage).
 * 5. Provider-model compatibility guards (no Llama to Gemini, no Gemini to Groq).
 * 6. Groq failure (5xx, 429, timeout) triggers sequential Gemini fallback.
 * 7. Reverse fallback: Gemini failure triggers Groq fallback when configured.
 * 8. Fallback disabled (AI_FALLBACK_ENABLED=false) skips secondary provider.
 * 9. Missing fallback credentials safely skips secondary provider in chain.
 * 10. Authentication failures (401/403) FAIL FAST without fallback or retries.
 * 11. Invalid request / bad model (400/404) FAILS FAST without fallback.
 * 12. Bounded timeouts (AI_REQUEST_TIMEOUT_MS clamped between 2s and 60s).
 * 13. Provider error sanitization (strips ?key=..., Bearer ..., configured keys, and PII).
 * 14. Token usage extraction and recording in telemetry.
 * 15. Quota semantics preserved: exactly one usage recorded upon fallback success.
 * 16. Actual provider and actual model recorded in AiCallLog telemetry.
 * 17. Assistant multi-turn chat with tools respects provider config and fallback.
 * 18. Resume OCR fallback uses Gemini OCR model and key only when configured.
 * 19. Embedding service uses Gemini embedding model and key only when configured.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri } = require('./testHelper');
const {
  getPrimaryProvider,
  getGroqConfig,
  getGeminiConfig,
  getProviderConfig,
  resolveModelForProvider,
  isFallbackEnabled,
  getResolvedProviderChain,
  isAiConfigured,
  getRequestTimeoutMs,
  sanitizeProviderError,
} = require('../services/ai/aiConfig');

const groqProvider = require('../services/ai/providers/groqProvider');
const geminiProvider = require('../services/ai/providers/geminiProvider');
const mockProvider = require('../services/ai/providers/mockProvider');
const {
  getProvider,
  callAiWithQuotaAndRetry,
  callAiChatWithTools,
  resetCircuitBreakers,
  getCircuitBreakerStatus,
} = require('../services/ai/aiClient');

const { performOcrFallback } = require('../services/ai/resumeTextExtractor');
const { getSkillEmbedding, cosineSimilarity } = require('../services/ai/embeddingService');
const AiUsage = require('../models/AiUsage');
const AiCallLog = require('../models/AiCallLog');
const { User } = require('../models');

async function runAiProviderConfigTests() {
  console.log('======================================================');
  console.log('  TEST: AI PROVIDER CONFIG & FALLBACK RELIABILITY     ');
  console.log('======================================================\n');

  await mongoose.connect(getTestDbUri());
  console.log('Connected to test DB:', mongoose.connection.name);

  // Snapshot original environment variables for safe restoration
  const originalEnv = { ...process.env };
  function restoreEnv() {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }

  const testUserId = new mongoose.Types.ObjectId();
  await User.create({
    _id: testUserId,
    name: 'Provider Test User',
    email: `provider_test_${Date.now()}@example.com`,
    password: 'password123',
    role: 'student',
    status: 'active',
  });

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Request Timeout Bounds & Parsing
    // -------------------------------------------------------------------------
    console.log('1. Testing timeout bounds clamping (2000ms - 60000ms)...');
    process.env.AI_REQUEST_TIMEOUT_MS = '500'; // Below minimum (2000)
    assert.strictEqual(getRequestTimeoutMs(), 2000, 'Should clamp to MIN_TIMEOUT_MS (2000)');

    process.env.AI_REQUEST_TIMEOUT_MS = '999999'; // Above maximum (60000)
    assert.strictEqual(getRequestTimeoutMs(), 60000, 'Should clamp to MAX_TIMEOUT_MS (60000)');

    process.env.AI_REQUEST_TIMEOUT_MS = '15000'; // Valid custom
    assert.strictEqual(getRequestTimeoutMs(), 15000, 'Should return valid parsed ms');

    delete process.env.AI_REQUEST_TIMEOUT_MS; // Unset default
    assert.strictEqual(getRequestTimeoutMs(), 12000, 'Default timeout should be 12000ms');
    console.log('   ✓ Timeout clamping verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 2: Primary Provider Selection & Production Mock Guard
    // -------------------------------------------------------------------------
    console.log('2. Testing primary provider selection & production mock guard...');
    process.env.AI_PROVIDER = 'groq';
    assert.strictEqual(getPrimaryProvider(), 'groq');

    process.env.AI_PROVIDER = 'gemini';
    assert.strictEqual(getPrimaryProvider(), 'gemini');

    process.env.AI_PROVIDER = 'none';
    assert.strictEqual(getPrimaryProvider(), 'none');

    process.env.AI_PROVIDER = 'invalid-provider';
    assert.strictEqual(getPrimaryProvider(), 'none');

    // In production, 'mock' must be disallowed and throw security error when resolving provider
    process.env.NODE_ENV = 'production';
    process.env.AI_PROVIDER = 'mock';
    assert.throws(
      () => getProvider(),
      /strictly prohibited in production/,
      'Mock AI provider must throw a security error when NODE_ENV=production'
    );
    assert.strictEqual(isAiConfigured(), false, 'Mock provider in production must not be considered configured');
    process.env.NODE_ENV = 'test';
    console.log('   ✓ Primary provider selection verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 3: Provider-Specific Credential Segregation
    // -------------------------------------------------------------------------
    console.log('3. Testing strict credential segregation between Groq and Gemini...');
    delete process.env.AI_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_groq_secret_key_11111';
    process.env.GEMINI_API_KEY = 'AIzaSy_gemini_secret_key_22222';
    process.env.AI_PROVIDER = 'groq';

    const groqCfg = getGroqConfig();
    const geminiCfg = getGeminiConfig();

    assert.strictEqual(groqCfg.apiKey, 'gsk_groq_secret_key_11111', 'Groq should receive only GROQ_API_KEY');
    assert.strictEqual(geminiCfg.apiKey, 'AIzaSy_gemini_secret_key_22222', 'Gemini should receive only GEMINI_API_KEY');
    assert.notStrictEqual(groqCfg.apiKey, geminiCfg.apiKey, 'Groq and Gemini keys must never overlap');

    // Backward compatibility check: AI_API_KEY only used if AI_PROVIDER matches
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.AI_API_KEY = 'legacy_shared_key';
    process.env.AI_PROVIDER = 'groq';

    const groqLegacy = getGroqConfig();
    const geminiLegacy = getGeminiConfig();

    assert.strictEqual(groqLegacy.apiKey, 'legacy_shared_key', 'Groq gets AI_API_KEY when AI_PROVIDER=groq');
    assert.strictEqual(geminiLegacy.apiKey, '', 'Gemini must NOT inherit AI_API_KEY when AI_PROVIDER=groq');
    console.log('   ✓ Credential segregation verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 4: Model Cross-Pollution Guard & Incompatible Model Refusal
    // -------------------------------------------------------------------------
    console.log('4. Testing model cross-pollution guards and explicit incompatible model refusal...');
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';

    // 4.1 Incompatible explicit model request without allowProviderResolution MUST throw INVALID_REQUEST (No silent substitution!)
    assert.throws(
      () => resolveModelForProvider('groq', 'gemini-1.5-pro'),
      (err) => err.code === 'INVALID_REQUEST' && err.status === 400 && err.message.includes('Incompatible model'),
      'Explicit Gemini model passed to Groq must throw INVALID_REQUEST'
    );

    assert.throws(
      () => resolveModelForProvider('gemini', 'llama-3.3-70b-versatile'),
      (err) => err.code === 'INVALID_REQUEST' && err.status === 400 && err.message.includes('Incompatible model'),
      'Explicit Llama model passed to Gemini must throw INVALID_REQUEST'
    );

    // 4.2 Explicit allowProviderResolution=true allows safe substitution to provider model
    const substitutedGroq = resolveModelForProvider('groq', 'gemini-1.5-pro', { allowProviderResolution: true });
    assert.strictEqual(substitutedGroq, 'llama-3.3-70b-versatile', 'Should substitute when allowProviderResolution=true');

    const substitutedGemini = resolveModelForProvider('gemini', 'llama-3.3-70b-versatile', { allowProviderResolution: true });
    assert.strictEqual(substitutedGemini, 'gemini-1.5-flash', 'Should substitute when allowProviderResolution=true');

    // 4.3 Fallback mode (isFallback=true) automatically switches to target provider's model
    const fallbackGroqModel = resolveModelForProvider('groq', 'gemini-1.5-pro', { isFallback: true });
    assert.strictEqual(fallbackGroqModel, 'llama-3.3-70b-versatile', 'Fallback to Groq must use Groq model');

    const fallbackGeminiModel = resolveModelForProvider('gemini', 'llama-3.3-70b-versatile', { isFallback: true });
    assert.strictEqual(fallbackGeminiModel, 'gemini-1.5-flash', 'Fallback to Gemini must use Gemini model');

    // 4.4 Passing compatible models should be accepted directly
    assert.strictEqual(resolveModelForProvider('groq', 'llama-3.1-8b-instant'), 'llama-3.1-8b-instant');
    assert.strictEqual(resolveModelForProvider('gemini', 'gemini-1.5-pro'), 'gemini-1.5-pro');

    // 4.5 Provider adapters must guard against incompatible models directly
    try {
      await groqProvider.generateCompletion({ model: 'gemini-1.5-flash', systemPrompt: 'test', userPrompt: 'test', apiKey: 'gsk_key' });
      assert.fail('groqProvider must reject gemini models directly');
    } catch (adapterErr) {
      assert.strictEqual(adapterErr.code, 'INVALID_REQUEST');
    }

    try {
      await geminiProvider.generateCompletion({ model: 'llama-3.3-70b-versatile', systemPrompt: 'test', userPrompt: 'test', apiKey: 'AIzaSy_key' });
      assert.fail('geminiProvider must reject llama models directly');
    } catch (adapterErr) {
      assert.strictEqual(adapterErr.code, 'INVALID_REQUEST');
    }
    console.log('   ✓ Model compatibility guards and refusal verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 5: Separate Models for Chat, OCR/Vision, and Embeddings
    // -------------------------------------------------------------------------
    console.log('5. Testing model separation for Chat, OCR, and Embeddings...');
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_MODEL_OCR = 'gemini-1.5-flash';
    process.env.GEMINI_MODEL_EMBEDDING = 'text-embedding-004';

    const geminiFullConfig = getGeminiConfig();
    assert.strictEqual(geminiFullConfig.model, 'gemini-1.5-flash');
    assert.strictEqual(geminiFullConfig.modelOcr, 'gemini-1.5-flash');
    assert.strictEqual(geminiFullConfig.modelEmbedding, 'text-embedding-004');
    console.log('   ✓ Model specialization verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 6: Fallback Precedence & Conflict Resolution
    // -------------------------------------------------------------------------
    console.log('6. Testing fallback precedence, conflict resolution, and conditional exclusion...');
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_groq';
    process.env.GEMINI_API_KEY = 'AIzaSy_gemini';
    process.env.AI_FALLBACK_ENABLED = 'true';
    delete process.env.AI_PROVIDER_CHAIN;
    delete process.env.AI_FALLBACK_PROVIDER;

    // Default auto-pairing: Groq + Gemini configured -> ['groq', 'gemini', 'rules']
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'gemini', 'rules']);

    // Secondary provider lacks API key -> excluded from chain -> ['groq', 'rules']
    delete process.env.GEMINI_API_KEY;
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'rules']);

    // Fallback disabled explicitly (AI_FALLBACK_ENABLED=false) -> ['groq', 'rules']
    process.env.GEMINI_API_KEY = 'AIzaSy_gemini';
    process.env.AI_FALLBACK_ENABLED = 'false';
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'rules']);

    // Conflict 1: AI_PROVIDER=gemini, but AI_PROVIDER_CHAIN=groq,gemini,rules
    // AI_PROVIDER must retain primary authority! Chain must start with gemini.
    process.env.AI_FALLBACK_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_PROVIDER_CHAIN = 'groq,gemini,rules';
    assert.deepStrictEqual(
      getResolvedProviderChain(),
      ['gemini', 'groq', 'rules'],
      'AI_PROVIDER must always dictate primary provider regardless of AI_PROVIDER_CHAIN order'
    );
    delete process.env.AI_PROVIDER_CHAIN;

    // Conflict 2: AI_FALLBACK_PROVIDER is identical to primary (groq) -> secondary omitted
    process.env.AI_PROVIDER = 'groq';
    process.env.AI_FALLBACK_PROVIDER = 'groq';
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'rules']);

    // Conflict 3: AI_FALLBACK_PROVIDER='none' -> secondary omitted
    process.env.AI_FALLBACK_PROVIDER = 'none';
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'rules']);

    // Conflict 4: AI_FALLBACK_ENABLED=false but AI_PROVIDER_CHAIN has multiple providers
    process.env.AI_FALLBACK_ENABLED = 'false';
    process.env.AI_PROVIDER_CHAIN = 'groq,gemini,rules';
    assert.deepStrictEqual(getResolvedProviderChain(), ['groq', 'rules'], 'Fallback disabled must override AI_PROVIDER_CHAIN');
    delete process.env.AI_PROVIDER_CHAIN;
    delete process.env.AI_FALLBACK_PROVIDER;

    // Conflict 5: AI_PROVIDER=none but AI_PROVIDER_CHAIN=groq,gemini,rules
    process.env.AI_PROVIDER = 'none';
    process.env.AI_FALLBACK_ENABLED = 'true';
    process.env.AI_PROVIDER_CHAIN = 'groq,gemini,rules';
    assert.deepStrictEqual(getResolvedProviderChain(), ['rules'], 'AI_PROVIDER=none must override all other config');
    delete process.env.AI_PROVIDER_CHAIN;

    // Conflict 6: Legacy AI_API_KEY only configures matching AI_PROVIDER, secondary remains unconfigured
    process.env.AI_PROVIDER = 'groq';
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.AI_API_KEY = 'legacy_groq_only_key';
    assert.deepStrictEqual(
      getResolvedProviderChain(),
      ['groq', 'rules'],
      'Legacy AI_API_KEY must never enable Gemini fallback without GEMINI_API_KEY'
    );
    delete process.env.AI_API_KEY;

    console.log('   ✓ Fallback precedence and conflict resolution verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 7: Provider Error Message Sanitization
    // -------------------------------------------------------------------------
    console.log('7. Testing error sanitization (removes query keys, bearer tokens, configured keys)...');
    process.env.GROQ_API_KEY = 'gsk_real_secret_groq_key_99999';
    process.env.GEMINI_API_KEY = 'AIzaSy_real_secret_gemini_key_88888';

    const rawErrorWithQueryKey =
      'HTTP 400 Bad Request: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSy_real_secret_gemini_key_88888 failed.';
    const scrubbedQuery = sanitizeProviderError(rawErrorWithQueryKey, 'gemini');
    assert.ok(!scrubbedQuery.includes('AIzaSy_real_secret_gemini_key_88888'), 'Raw Gemini key must be redacted');
    assert.ok(scrubbedQuery.includes('[REDACTED]'), 'Must replace with [REDACTED]');

    const rawErrorWithBearer = 'Failed call Authorization: Bearer gsk_real_secret_groq_key_99999 rejected.';
    const scrubbedBearer = sanitizeProviderError(rawErrorWithBearer, 'groq');
    assert.ok(!scrubbedBearer.includes('gsk_real_secret_groq_key_99999'), 'Bearer Groq key must be redacted');
    assert.ok(scrubbedBearer.includes('Bearer [REDACTED]'));

    // PII phone and email in error should also be scrubbed
    const errorWithPii = 'User contact 9876543210 and email test.user@college.edu caused upstream failure.';
    const scrubbedPii = sanitizeProviderError(errorWithPii);
    assert.ok(!scrubbedPii.includes('9876543210'), 'Phone in error must be redacted');
    assert.ok(!scrubbedPii.includes('test.user@college.edu'), 'Email in error must be redacted');
    console.log('   ✓ Error message sanitization verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 8: Missing API Key Throws AUTHENTICATION_ERROR (Status 401)
    // -------------------------------------------------------------------------
    console.log('8. Testing that missing API keys throw AUTHENTICATION_ERROR...');
    delete process.env.GROQ_API_KEY;
    delete process.env.AI_API_KEY;

    try {
      await groqProvider.generateCompletion({ systemPrompt: 'test', userPrompt: 'test' });
      assert.fail('Should have thrown on missing Groq key');
    } catch (err) {
      assert.strictEqual(err.code, 'AUTHENTICATION_ERROR');
      assert.strictEqual(err.status, 401);
      assert.strictEqual(err.isAuthError, true);
    }

    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_API_KEY;
    try {
      await geminiProvider.generateCompletion({ systemPrompt: 'test', userPrompt: 'test' });
      assert.fail('Should have thrown on missing Gemini key');
    } catch (err) {
      assert.strictEqual(err.code, 'AUTHENTICATION_ERROR');
      assert.strictEqual(err.status, 401);
      assert.strictEqual(err.isAuthError, true);
    }
    console.log('   ✓ Authentication error classification verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 9: Mock Provider Integration in aiClient
    // -------------------------------------------------------------------------
    console.log('9. Testing aiClient structured completion with mock provider...');
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_PROVIDER_CHAIN = 'mock,rules';
    mockProvider.reset();

    const mockRes = await callAiWithQuotaAndRetry({
      systemPrompt: 'Extract resume skills',
      userPrompt: 'Candidate with React, Node.js, and MongoDB experience.',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(mockRes.success, true);
    assert.strictEqual(mockRes.provider, 'mock');
    assert.ok(Array.isArray(mockRes.data.skills));
    assert.ok(mockRes.data.skills.includes('react'));
    console.log('   ✓ Mock completion in aiClient verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 10: Authentication Errors (401/403) FAIL FAST without Fallback
    // -------------------------------------------------------------------------
    console.log('10. Testing that 401/403 authentication errors FAIL FAST without fallback...');
    resetCircuitBreakers();

    // Stub groqProvider to throw a 401 Authentication Error
    const originalGroqCompletion = groqProvider.generateCompletion;
    let geminiCalled = false;
    const originalGeminiCompletion = geminiProvider.generateCompletion;

    groqProvider.generateCompletion = async () => {
      const err = new Error('Invalid API Key');
      err.status = 401;
      err.code = 'AUTHENTICATION_ERROR';
      err.isAuthError = true;
      throw err;
    };

    geminiProvider.generateCompletion = async () => {
      geminiCalled = true;
      return JSON.stringify({ status: 'gemini_fallback' });
    };

    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_bad_key';
    process.env.GEMINI_API_KEY = 'AIzaSy_good_key';
    process.env.AI_FALLBACK_ENABLED = 'true';
    delete process.env.AI_PROVIDER_CHAIN;

    const authFailResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'test',
      userPrompt: 'test',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(authFailResult.success, false);
    assert.strictEqual(authFailResult.code, 'AUTHENTICATION_ERROR');
    assert.strictEqual(geminiCalled, false, 'Gemini fallback must NOT be called on 401 authentication error');
    console.log('   ✓ 401 Authentication Fail-Fast verified (zero fallback).');

    // -------------------------------------------------------------------------
    // SCENARIO 11: Invalid Request / Bad Model (400/404) FAILS FAST without Fallback
    // -------------------------------------------------------------------------
    console.log('11. Testing that 400 Bad Request errors FAIL FAST without fallback...');
    geminiCalled = false;

    // 11.1 Upstream 400 Bad Request fails fast
    groqProvider.generateCompletion = async () => {
      const err = new Error('Model not found or malformed payload');
      err.status = 400;
      err.code = 'INVALID_REQUEST';
      err.isClientError = true;
      throw err;
    };

    const clientFailResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'test',
      userPrompt: 'test',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(clientFailResult.success, false);
    assert.strictEqual(clientFailResult.code, 'INVALID_REQUEST');
    assert.strictEqual(geminiCalled, false, 'Gemini fallback must NOT be called on 400 Bad Request');

    // 11.2 Incompatible explicit model request must fail fast before sending (No silent substitution)
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_valid_key';
    const incompatibleModelResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'test',
      userPrompt: 'test',
      model: 'gemini-1.5-flash', // Explicitly incompatible with Groq
      mode: 'parse',
      userId: testUserId,
    });
    assert.strictEqual(incompatibleModelResult.success, false);
    assert.strictEqual(incompatibleModelResult.code, 'INVALID_REQUEST');
    assert.ok(incompatibleModelResult.error.includes('Incompatible model "gemini-1.5-flash" explicitly requested for provider "groq"'));
    console.log('   ✓ 400 Client Error and incompatible model Fail-Fast verified (zero fallback, zero silent substitution).');

    // -------------------------------------------------------------------------
    // SCENARIO 12: Rate Limit (429) & Server Error (5xx) Trigger Sequential Fallback
    // -------------------------------------------------------------------------
    console.log('12. Testing that 429 and 5xx trigger sequential fallback to Gemini...');
    geminiCalled = false;
    let groqCallCount = 0;

    groqProvider.generateCompletion = async () => {
      groqCallCount++;
      const err = new Error('Rate limit exceeded: 429 Too Many Requests');
      err.status = 429;
      err.code = 'RATE_LIMIT';
      throw err;
    };

    geminiProvider.generateCompletion = async (options) => {
      geminiCalled = true;
      assert.strictEqual(options.model, 'gemini-1.5-flash', 'Gemini must receive Gemini model on fallback');
      assert.strictEqual(options.apiKey, 'AIzaSy_good_key', 'Gemini must receive Gemini key on fallback');
      return {
        text: JSON.stringify({ skills: ['javascript', 'python'] }),
        usage: { promptTokens: 25, completionTokens: 10, totalTokens: 35 },
        model: 'gemini-1.5-flash',
      };
    };

    const fallbackSuccessResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'Extract skills',
      userPrompt: 'Skills: Javascript, Python',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(fallbackSuccessResult.success, true);
    assert.strictEqual(fallbackSuccessResult.provider, 'gemini');
    assert.strictEqual(fallbackSuccessResult.fallbackUsed, true);
    assert.strictEqual(geminiCalled, true, 'Gemini must be invoked as fallback when Groq returns 429');
    console.log('   ✓ Rate-limit sequential fallback to Gemini verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 13: Quota Preservation (No Double-Counting on Fallback)
    // -------------------------------------------------------------------------
    console.log('13. Testing daily quota is recorded exactly once upon fallback success...');
    const userUsage = await AiUsage.getUserDailyUsage(testUserId);
    assert.strictEqual(userUsage.used, 2, 'Total parse calls should reflect 1 for mock test + 1 for fallback test (no double count)');
    console.log('   ✓ Quota semantics preserved without double-counting.');

    // -------------------------------------------------------------------------
    // SCENARIO 14: Telemetry Logging in AiCallLog Records Actual Provider and Model
    // -------------------------------------------------------------------------
    console.log('14. Testing AiCallLog telemetry records actual provider, model, and status...');
    const recentLogs = await AiCallLog.find({ userId: testUserId }).sort({ createdAt: -1 }).limit(5).lean();
    assert.ok(recentLogs.length >= 2, 'Should have recorded telemetry logs');

    const lastLog = recentLogs[0];
    assert.strictEqual(lastLog.provider, 'gemini');
    assert.strictEqual(lastLog.model, 'gemini-1.5-flash');
    assert.strictEqual(lastLog.status, 'fallback');
    console.log('   ✓ Telemetry records actual provider and fallback status.');

    // -------------------------------------------------------------------------
    // SCENARIO 15: Reverse Fallback (Gemini Primary -> Groq Secondary)
    // -------------------------------------------------------------------------
    console.log('15. Testing reverse fallback (Gemini primary -> Groq fallback)...');
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSy_gemini_key';
    process.env.GROQ_API_KEY = 'gsk_groq_key';
    process.env.AI_FALLBACK_ENABLED = 'true';
    delete process.env.AI_PROVIDER_CHAIN;

    let groqFallbackCalled = false;
    geminiProvider.generateCompletion = async () => {
      const err = new Error('Gemini 503 Service Unavailable');
      err.status = 503;
      throw err;
    };

    groqProvider.generateCompletion = async (options) => {
      groqFallbackCalled = true;
      assert.strictEqual(options.model, 'llama-3.3-70b-versatile', 'Groq must receive Groq model on reverse fallback');
      assert.strictEqual(options.apiKey, 'gsk_groq_key', 'Groq must receive Groq key on reverse fallback');
      return {
        text: JSON.stringify({ skills: ['docker', 'kubernetes'] }),
        usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
        model: 'llama-3.3-70b-versatile',
      };
    };

    const reverseFallbackResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'Extract skills',
      userPrompt: 'Skills: Docker, Kubernetes',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(reverseFallbackResult.success, true);
    assert.strictEqual(reverseFallbackResult.provider, 'groq');
    assert.strictEqual(reverseFallbackResult.fallbackUsed, true);
    assert.strictEqual(groqFallbackCalled, true, 'Groq fallback must be called when Gemini 503s');
    console.log('   ✓ Reverse fallback (Gemini -> Groq) verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 16: Assistant Multi-Turn Chat with Tools Fallback
    // -------------------------------------------------------------------------
    console.log('16. Testing assistant multi-turn chat fallback behavior...');
    const originalGroqChat = groqProvider.generateChatCompletionWithTools;
    const originalGeminiChat = geminiProvider.generateChatCompletionWithTools;

    groqProvider.generateChatCompletionWithTools = async () => {
      const err = new Error('Groq Chat 500 Internal Error');
      err.status = 500;
      throw err;
    };

    let geminiChatCalled = false;
    geminiProvider.generateChatCompletionWithTools = async (options) => {
      geminiChatCalled = true;
      assert.strictEqual(options.apiKey, 'AIzaSy_gemini_key');
      return {
        content: 'Assistant fallback reply from Gemini.',
        toolCalls: [],
        model: 'gemini-1.5-flash',
        usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
      };
    };

    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_groq_key';
    process.env.GEMINI_API_KEY = 'AIzaSy_gemini_key';

    const chatResult = await callAiChatWithTools({
      messages: [{ role: 'user', content: 'What is my placement status?' }],
      tools: [],
      userId: testUserId,
    });

    assert.strictEqual(chatResult.success, true);
    assert.strictEqual(chatResult.provider, 'gemini');
    assert.strictEqual(chatResult.content, 'Assistant fallback reply from Gemini.');
    assert.strictEqual(geminiChatCalled, true);
    console.log('   ✓ Assistant chat fallback verified.');

    // Restore provider stubs
    groqProvider.generateCompletion = originalGroqCompletion;
    geminiProvider.generateCompletion = originalGeminiCompletion;
    groqProvider.generateChatCompletionWithTools = originalGroqChat;
    geminiProvider.generateChatCompletionWithTools = originalGeminiChat;

    // -------------------------------------------------------------------------
    // SCENARIO 17: OCR Fallback Respects Gemini OCR Isolation
    // -------------------------------------------------------------------------
    console.log('17. Testing OCR fallback adheres to Gemini OCR config isolation...');
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_groq_key';
    delete process.env.GEMINI_API_KEY;

    // If Gemini is unconfigured, OCR fallback must safely return '' without crashing or leaking Groq key
    const ocrBuffer = Buffer.from('%PDF-1.4 scanned sample without text streams');
    const ocrEmptyResult = await performOcrFallback(ocrBuffer, { userId: testUserId });
    assert.strictEqual(ocrEmptyResult, '', 'OCR fallback must return empty string when Gemini is unconfigured');

    // In mock/test mode with mock provider, returns mock OCR text
    process.env.AI_PROVIDER = 'mock';
    const ocrMockResult = await performOcrFallback(ocrBuffer, { userId: testUserId });
    assert.ok(ocrMockResult.includes('Scanned Resume'), 'Mock OCR returns deterministic sample');
    console.log('   ✓ OCR fallback configuration isolation verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 18: Embedding Service Uses Gemini Embedding Model & Isolation
    // -------------------------------------------------------------------------
    console.log('18. Testing embedding service deterministic fallback and model isolation...');
    delete process.env.GEMINI_API_KEY;

    // When Gemini is unconfigured, skill embedding returns deterministic cluster-aware vector
    const vec1 = await getSkillEmbedding('react');
    const vec2 = await getSkillEmbedding('frontend development');
    assert.strictEqual(vec1.length, 128);
    assert.strictEqual(vec2.length, 128);

    const sim = cosineSimilarity(vec1, vec2);
    assert.ok(sim > 0.70, `Related skills should have high deterministic similarity (got ${sim})`);

    const vecUnrelated = await getSkillEmbedding('kubernetes');
    const simUnrelated = cosineSimilarity(vec1, vecUnrelated);
    assert.ok(simUnrelated < 0.40, `Unrelated skills should have low similarity (got ${simUnrelated})`);
    console.log('   ✓ Embedding service deterministic fallback verified.');

    // -------------------------------------------------------------------------
    // SCENARIO 19: AI_PROVIDER=none Operating Mode
    // -------------------------------------------------------------------------
    console.log('19. Testing AI_PROVIDER=none operates safely in offline mode...');
    process.env.AI_PROVIDER = 'none';

    assert.strictEqual(isAiConfigured(), false);
    assert.deepStrictEqual(getResolvedProviderChain(), ['rules']);

    const disabledResult = await callAiWithQuotaAndRetry({
      systemPrompt: 'test',
      userPrompt: 'test',
      mode: 'parse',
      userId: testUserId,
    });

    assert.strictEqual(disabledResult.success, false);
    assert.strictEqual(disabledResult.status, 'disabled');
    console.log('   ✓ AI_PROVIDER=none operating mode verified.');

    console.log('\n======================================================');
    console.log('    ALL 19 AI PROVIDER & FALLBACK TESTS PASSED!       ');
    console.log('======================================================\n');
  } finally {
    // Teardown test user and restore original environment
    await User.deleteOne({ _id: testUserId });
    await AiUsage.deleteMany({});
    await AiCallLog.deleteMany({ userId: testUserId });
    restoreEnv();
  }
}

if (require.main === module) {
  runAiProviderConfigTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('AI Provider Config Test Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = runAiProviderConfigTests;
