/**
 * Groq AI Provider (OpenAI-compatible chat completions with JSON mode)
 */

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  }

  async generateCompletion({ systemPrompt, userPrompt, model, timeoutMs = 20000 }) {
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
          temperature: 0.1,
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
}

module.exports = new GroqProvider();

