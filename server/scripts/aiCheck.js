#!/usr/bin/env node
/**
 * AI Provider Health Check & Connectivity Probe
 * Usage: npm run ai:check
 *
 * Reads AI_* env vars, sends one tiny harmless probe through configured provider,
 * prints provider, model, status class (2xx, 4xx, 5xx), and latency (ms).
 * NEVER prints API key or resume text.
 */
require('dotenv').config();

function sanitizeOutput(text, apiKey) {
  if (!text) return '';
  let str = String(text);
  if (apiKey && apiKey.length > 3) {
    str = str.split(apiKey).join('[REDACTED_API_KEY]');
  }
  return str;
}

function getStatusClass(statusCode) {
  if (typeof statusCode !== 'number') return '5xx';
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return `${statusCode}`;
}

async function runAiCheck() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase().trim();
  const apiKey = process.env.AI_API_KEY || '';
  const apiKeySet = Boolean(apiKey && apiKey.trim());

  let defaultModel = 'none';
  if (provider === 'groq') defaultModel = 'llama-3.3-70b-versatile';
  else if (provider === 'gemini') defaultModel = 'gemini-1.5-flash';
  else if (provider === 'mock') defaultModel = 'mock-deterministic';

  const model = process.env.AI_MODEL || defaultModel;

  console.log('\n======================================================');
  console.log('              🤖  AI SERVICE HEALTH CHECK             ');
  console.log('======================================================');
  console.log('Provider        :', provider);
  console.log('Model           :', model);
  console.log('API Key Status  :', apiKeySet ? 'Configured (hidden)' : 'Not Set');
  console.log('Daily Call Cap  :', process.env.AI_DAILY_CALL_CAP || '400 (default)');
  console.log('User Parse Cap  :', process.env.AI_USER_DAILY_PARSE_CAP || '5 (default)');
  console.log('======================================================\n');

  if (provider === 'none' || !provider) {
    console.log('Status Class : Disabled');
    console.log('Latency      : 0 ms');
    console.log('Result       : AI features are disabled (AI_PROVIDER=none).');
    console.log('Note         : System operates in deterministic rule-based fallback mode.\n');
    process.exit(0);
  }

  if (provider === 'mock') {
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
      console.error(`Error        : ${sanitizeOutput(err.message, apiKey)}\n`);
      process.exit(1);
    }
  }

  if (provider === 'groq' || provider === 'gemini') {
    if (!apiKeySet) {
      console.error('Status Class : 4xx (400 Bad Request)');
      console.error('Latency      : 0 ms');
      console.error(`Error        : AI_API_KEY is missing for provider "${provider}".\n`);
      process.exit(1);
    }

    const start = Date.now();
    try {
      const providerModule =
        provider === 'groq'
          ? require('../services/ai/providers/groqProvider')
          : require('../services/ai/providers/geminiProvider');

      await providerModule.generateCompletion({
        systemPrompt: 'Respond with a JSON object: {"status": "ok"}',
        userPrompt: '{}',
        model,
        timeoutMs: 10000,
      });

      const latency = Date.now() - start;
      console.log('Status Class : 2xx (200 OK)');
      console.log(`Latency      : ${latency} ms`);
      console.log(`Result       : ${provider} probe succeeded.\n`);
      process.exit(0);
    } catch (err) {
      const latency = Date.now() - start;
      const status = err.status || err.statusCode || 500;
      console.error(`Status Class : ${getStatusClass(status)} (${status})`);
      console.error(`Latency      : ${latency} ms`);
      console.error(`Error        : ${sanitizeOutput(err.message, apiKey)}\n`);
      process.exit(1);
    }
  }

  console.error(`Status Class : 4xx`);
  console.error(`Latency      : 0 ms`);
  console.error(`Error        : Unsupported provider "${provider}". Expected "groq", "gemini", "mock", or "none".\n`);
  process.exit(1);
}

if (require.main === module) {
  runAiCheck().catch((err) => {
    console.error('Unexpected error during AI health check:', err.message);
    process.exit(1);
  });
}

module.exports = runAiCheck;

