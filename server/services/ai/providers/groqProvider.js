/**
 * Groq AI Provider (OpenAI-compatible chat completions with function / tool calling)
 */

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  }

  async generateCompletion({ systemPrompt, userPrompt, model, temperature = 0.1, timeoutMs = 20000 }) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error('Groq AI API key is missing');
    }

    const selectedModel = model || process.env.AI_MODEL || 'llama-3.3-70b-versatile';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
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
        const err = new Error(`Groq API responded with status ${response.status}: ${errorText}`);
        err.status = response.status;
        err.statusCode = response.status;
        throw err;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '{}';
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Groq API request timed out after ${timeoutMs}ms`);
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
      throw new Error('Groq AI API key is missing');
    }

    const selectedModel = model || process.env.AI_MODEL || 'llama-3.3-70b-versatile';
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
      const response = await fetch(this.endpoint, {
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
        const err = new Error(`Groq API responded with status ${response.status}: ${errorText}`);
        err.status = response.status;
        err.statusCode = response.status;
        throw err;
      }

      const data = await response.json();
      const choice = data.choices?.[0]?.message || {};
      const toolCalls = choice.tool_calls || [];
      const content = choice.content || '';

      return {
        message: choice,
        content,
        toolCalls,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Groq API request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new GroqProvider();
