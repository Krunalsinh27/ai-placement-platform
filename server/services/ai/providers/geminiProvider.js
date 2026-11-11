/**
 * Gemini AI Provider (Google Generative AI REST API with JSON response mode)
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
}

module.exports = new GeminiProvider();

