/**
 * Gemini AI Provider (Google Generative AI REST API with tool / function calling)
 */

class GeminiProvider {
  constructor() {
    this.name = 'gemini';
  }

  async generateCompletion({ systemPrompt, userPrompt, model, timeoutMs = 20000 }) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is missing');
    }

    const selectedModel = model || process.env.AI_MODEL || 'gemini-1.5-flash';
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
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const err = new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
        err.status = response.status;
        err.statusCode = response.status;
        throw err;
      }

      const data = await response.json();
      const textContent =
        data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return textContent;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
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
   */
  async generateChatCompletionWithTools({
    messages = [],
    tools = [],
    model = null,
    temperature = 0.2,
    timeoutMs = 25000,
  }) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is missing');
    }

    const selectedModel = model || process.env.AI_MODEL || 'gemini-1.5-flash';
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
        const err = new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
        err.status = response.status;
        err.statusCode = response.status;
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

      return {
        message: { content, tool_calls: toolCalls },
        content,
        toolCalls,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new GeminiProvider();
