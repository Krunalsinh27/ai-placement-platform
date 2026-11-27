/**
 * Gemini AI Provider (Google Generative AI REST API with tool / function calling)
 */

const { getGeminiConfig, sanitizeProviderError, resolveModelForProvider } = require('../aiConfig');

class GeminiProvider {
  constructor() {
    this.name = 'gemini';
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
    const config = getGeminiConfig();
    const apiKey = (optApiKey || config.apiKey || '').trim();

    if (!apiKey) {
      const err = new Error('Gemini API key is missing or unconfigured.');
      err.code = 'AUTHENTICATION_ERROR';
      err.status = 401;
      err.statusCode = 401;
      err.isAuthError = true;
      throw err;
    }

    const selectedModel = resolveModelForProvider('gemini', model, { useFast: false });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: typeof temperature === 'number' ? temperature : 0.1,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const cleanMsg = sanitizeProviderError(errorText, 'gemini');
        const err = new Error(`Gemini API responded with status ${response.status}: ${cleanMsg}`);
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
      const textContent =
        data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      if (returnMeta) {
        const usage = data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount || 0,
              completionTokens: data.usageMetadata.candidatesTokenCount || 0,
              totalTokens: data.usageMetadata.totalTokenCount || 0,
            }
          : null;

        return {
          text: textContent,
          usage,
          model: selectedModel,
        };
      }

      return textContent;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
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
    const config = getGeminiConfig();
    const apiKey = (optApiKey || config.apiKey || '').trim();

    if (!apiKey) {
      const err = new Error('Gemini API key is missing or unconfigured.');
      err.code = 'AUTHENTICATION_ERROR';
      err.status = 401;
      err.statusCode = 401;
      err.isAuthError = true;
      throw err;
    }

    const selectedModel = resolveModelForProvider('gemini', model, { useFast: true });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Convert OpenAI messages to Gemini contents
    let systemInstruction = null;
    const contents = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemInstruction = { parts: [{ text: m.content }] };
      } else if (m.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: m.content || '' }],
        });
      } else if (m.role === 'assistant') {
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            let args = {};
            try {
              args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
            } catch (_) {}
            parts.push({
              functionCall: {
                name: tc.function.name,
                args,
              },
            });
          }
        }
        if (parts.length > 0) contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        let output = {};
        try {
          output = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        } catch (_) {
          output = { text: m.content };
        }
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: m.name,
                response: { output },
              },
            },
          ],
        });
      }
    }

    const bodyPayload = {
      contents,
      generationConfig: {
        temperature,
      },
    };

    if (systemInstruction) {
      bodyPayload.systemInstruction = systemInstruction;
    }

    // Convert tools to Gemini functionDeclarations
    if (Array.isArray(tools) && tools.length > 0) {
      const functionDeclarations = tools.map((t) => {
        const fn = t.function || t;
        return {
          name: fn.name,
          description: fn.description || '',
          parameters: fn.parameters || { type: 'object', properties: {} },
        };
      });
      bodyPayload.tools = [{ functionDeclarations }];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const cleanMsg = sanitizeProviderError(errorText, 'gemini');
        const err = new Error(`Gemini API responded with status ${response.status}: ${cleanMsg}`);
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
      const parts = data.candidates?.[0]?.content?.parts || [];

      let content = '';
      const toolCalls = [];

      for (const part of parts) {
        if (part.text) {
          content += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).substring(2, 9)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }

      const usage = data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata.totalTokenCount || 0,
          }
        : null;

      return {
        message: { content, tool_calls: toolCalls },
        content,
        toolCalls,
        usage,
        model: selectedModel,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
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

module.exports = new GeminiProvider();
