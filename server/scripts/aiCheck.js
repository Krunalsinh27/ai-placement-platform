#!/usr/bin/env node
/**
 * AI Provider Health Check & Connectivity Probe
 * Usage: npm run ai:check
 *
 * Reads AI_* env vars, validates provider isolation, verifies model configs,
 * and sends one tiny harmless probe through the configured primary provider.
 * NEVER prints API keys, credentials, or personal data.
 */
require('dotenv').config();

const {
  getPrimaryProvider,
  getGroqConfig,
  getGeminiConfig,
  getResolvedProviderChain,
  isFallbackEnabled,
  getRequestTimeoutMs,
  sanitizeProviderError,
} = require('../services/ai/aiConfig');

function getStatusClass(statusCode) {
  if (typeof statusCode !== 'number') return '5xx';
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return `${statusCode}`;
}

async function runAiCheck() {
  const primaryProvider = getPrimaryProvider();
  const groqConfig = getGroqConfig();
  const geminiConfig = getGeminiConfig();
  const chain = getResolvedProviderChain();
  const fallbackEnabled = isFallbackEnabled();
  const timeoutMs = getRequestTimeoutMs();

  console.log('\n======================================================');
  console.log('              🤖  AI SERVICE HEALTH CHECK             ');
  console.log('======================================================');
  console.log('Primary Provider    :', primaryProvider);
  console.log('Resolved Fallback   :', chain.join(' -> '));
  console.log('Fallback Enabled    :', fallbackEnabled ? 'Yes' : 'No');
  console.log('Request Timeout     :', `${timeoutMs} ms`);
  console.log('--- Provider Status ---');
  console.log('Groq Configured     :', groqConfig.configured ? 'Configured (hidden)' : 'Not Set');
  console.log('Groq Model          :', groqConfig.model);
  console.log('Groq Fast Model     :', groqConfig.modelFast);
  console.log('Gemini Configured   :', geminiConfig.configured ? 'Configured (hidden)' : 'Not Set');
  console.log('Gemini Model        :', geminiConfig.model);
  console.log('Gemini OCR Model    :', geminiConfig.modelOcr);
  console.log('Gemini Embed Model  :', geminiConfig.modelEmbedding);
  console.log('--- Caps & Thresholds ---');
  console.log('Daily Call Cap      :', process.env.AI_DAILY_CALL_CAP || '400 (default)');
  console.log('User Parse Cap      :', process.env.AI_USER_DAILY_PARSE_CAP || '5 (default)');
  console.log('======================================================\n');

  if (primaryProvider === 'none' || !primaryProvider) {
    console.log('Status Class : Disabled');
    console.log('Latency      : 0 ms');
    console.log('Result       : AI features are disabled (AI_PROVIDER=none).');
    console.log('Note         : System operates safely in deterministic rule-based fallback mode.\n');
    process.exit(0);
  }

  if (primaryProvider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      console.error('Status Class : 4xx');
      console.error('Latency      : 0 ms');
      console.error('Error        : Mock AI provider is strictly prohibited in production environment.\n');
      process.exit(1);
    }

    const start = Date.now();
    try {
      const mockProvider = require('../services/ai/providers/mockProvider');
      await mockProvider.generateCompletion({
        systemPrompt: 'Respond with a JSON object: {"status": "ok"}',
        userPrompt: '{}',
      });
      const latency = Date.now() - start;
      console.log('Status Class : 2xx (200 OK)');
      console.log(`Latency      : ${latency} ms`);
      console.log('Result       : Mock provider probe succeeded.\n');
      process.exit(0);
    } catch (err) {
      const latency = Date.now() - start;
      const status = err.status || err.statusCode || 500;
      console.error(`Status Class : ${getStatusClass(status)} (${status})`);
      console.error(`Latency      : ${latency} ms`);
      console.error(`Error        : ${sanitizeProviderError(err.message, 'mock')}\n`);
      process.exit(1);
    }
  }

  if (primaryProvider === 'rules') {
    console.log('Status Class : 2xx (Offline)');
    console.log('Latency      : 0 ms');
    console.log('Result       : Offline rule-based dictionary mode active.\n');
    process.exit(0);
  }

  if (primaryProvider === 'groq' || primaryProvider === 'gemini') {
    const isGroq = primaryProvider === 'groq';
    const activeConfig = isGroq ? groqConfig : geminiConfig;

    if (!activeConfig.configured) {
      console.error('Status Class : 4xx (401 Unauthorized)');
      console.error('Latency      : 0 ms');
      console.error(`Error        : API key is missing for configured primary provider "${primaryProvider}".\n`);
      process.exit(1);
    }

    const start = Date.now();
    try {
      const providerModule = isGroq
        ? require('../services/ai/providers/groqProvider')
        : require('../services/ai/providers/geminiProvider');

      await providerModule.generateCompletion({
        systemPrompt: 'Respond with a JSON object: {"status": "ok"}',
        userPrompt: '{}',
        model: activeConfig.model,
        timeoutMs: Math.min(timeoutMs, 10000),
      });

      const latency = Date.now() - start;
      console.log('Status Class : 2xx (200 OK)');
      console.log(`Latency      : ${latency} ms`);
      console.log(`Result       : ${primaryProvider} probe succeeded with model "${activeConfig.model}".\n`);
      process.exit(0);
    } catch (err) {
      const latency = Date.now() - start;
      const status = err.status || err.statusCode || 500;
      console.error(`Status Class : ${getStatusClass(status)} (${status})`);
      console.error(`Latency      : ${latency} ms`);
      console.error(`Error        : ${sanitizeProviderError(err.message, primaryProvider)}\n`);
      process.exit(1);
    }
  }

  console.error(`Status Class : 4xx`);
  console.error(`Latency      : 0 ms`);
  console.error(`Error        : Unsupported primary provider "${primaryProvider}". Expected "groq", "gemini", "mock", "rules", or "none".\n`);
  process.exit(1);
}

if (require.main === module) {
  runAiCheck().catch((err) => {
    console.error('Unexpected error during AI health check:', err.message);
    process.exit(1);
  });
}

module.exports = runAiCheck;
