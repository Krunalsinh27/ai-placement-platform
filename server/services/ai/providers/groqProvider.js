/**
 * Groq AI Provider (OpenAI-compatible chat completions with function / tool calling)
 */

const { getGroqConfig, sanitizeProviderError, resolveModelForProvider } = require('../aiConfig');

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  }

  /**
   * Generates a single structured completion
   *
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {string} [options.model]
   * @param {number} [options.temperature=0.1]
   * @param {number} [options.timeoutMs=20000]
   * @param {string} [options.apiKey]
   * @param {boolean} [options.returnMeta=false]
   * @returns {Promise<string|{text: string, usage: object, model: string}>}
   */
  async generateCompletion({
    systemPrompt,
    userPrompt,
    model = null,
    temperature = 0.1,
    timeoutMs = 20000,
    apiKey: optApiKey = null,
    returnMeta = false,
  }) {
    const config = getGroqConfig();
    const apiKey = (optApiKey || config.apiKey || '').trim();

    if (!apiKey) {
      const err = new Error('Groq AI API key is missing or unconfigured.');
      err.code = 'AUTHENTICATION_ERROR';
      err.status = 401;
      err.statusCode = 401;
      err.isAuthError = true;
      throw err;
    }

    const selectedModel = resolveModelForProvider('groq', model, { useFast: false });
    const endpoint = config.endpoint || this.endpoint;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: typeof temperature === 'number' ? temperature : 0.1,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const cleanMsg = sanitizeProviderError(errorText, 'groq');
        const err = new Error(`Groq API responded with status ${response.status}: ${cleanMsg}`);
        err.status = response.status;
        err.statusCode = response.status;

        if (response.status === 401 || response.status === 403) {
          err.code = 'AUTHENTICATION_ERROR';
          err.isAuthError = true;
        } else if (response.status === 400 || response.status === 404) {
          err.code = 'INVALID_REQUEST';
          err.isClientError = true;
        } else if (response.status === 429) {
          err.code = 'RATE_LIMIT';
          err.isRateLimit = true;
        }

        throw err;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      if (returnMeta) {
        const usage = data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : null;

        return {
          text: content,
          usage,
          model: data.model || selectedModel,
        };
      }

      return content;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Groq API request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        timeoutErr.statusCode = 504;
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Multi-turn chat completion with native function calling
   *
   * @param {Object} options
   * @param {Array} options.messages - [{ role, content, tool_calls, tool_call_id, name }]
   * @param {Array} [options.tools] - [{ type: 'function', function: { name, description, parameters } }]
   * @param {string} [options.model]
   * @param {number} [options.temperature=0.2]
   * @param {number} [options.timeoutMs=25000]
   * @param {string} [options.apiKey]
   */
  async generateChatCompletionWithTools({
    messages = [],
    tools = [],
    model = null,
    temperature = 0.2,
    timeoutMs = 25000,
    apiKey: optApiKey = null,
  }) {
    const config = getGroqConfig();
    const apiKey = (optApiKey || config.apiKey || '').trim();

    if (!apiKey) {
      const err = new Error('Groq AI API key is missing or unconfigured.');
      err.code = 'AUTHENTICATION_ERROR';
      err.status = 401;
      err.statusCode = 401;
      err.isAuthError = true;
      throw err;
    }

    const selectedModel = resolveModelForProvider('groq', model, { useFast: true });
    const endpoint = config.endpoint || this.endpoint;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const payload = {
      model: selectedModel,
      messages,
      temperature,
    };

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const cleanMsg = sanitizeProviderError(errorText, 'groq');
        const err = new Error(`Groq API responded with status ${response.status}: ${cleanMsg}`);
        err.status = response.status;
        err.statusCode = response.status;

        if (response.status === 401 || response.status === 403) {
          err.code = 'AUTHENTICATION_ERROR';
          err.isAuthError = true;
        } else if (response.status === 400 || response.status === 404) {
          err.code = 'INVALID_REQUEST';
          err.isClientError = true;
        } else if (response.status === 429) {
          err.code = 'RATE_LIMIT';
          err.isRateLimit = true;
        }

        throw err;
      }

      const data = await response.json();
      const choice = data.choices?.[0]?.message || {};
      const toolCalls = choice.tool_calls || [];
      const content = choice.content || '';

      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : null;

      return {
        message: choice,
        content,
        toolCalls,
        usage,
        model: data.model || selectedModel,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Groq API request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        timeoutErr.statusCode = 504;
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new GroqProvider();
