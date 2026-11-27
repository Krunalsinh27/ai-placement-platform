/**
 * Title Generation Service for AI Assistant Conversations
 *
 * Implements:
 * 1. Automatic 3-6 word topic title generation via the fast LLM model.
 * 2. Asynchronous execution that never blocks or delays chat responses.
 * 3. Fallback deterministic title generation with greeting stripping and word-boundary truncation (max 40 chars).
 * 4. Greeting-only detection: pauses title generation until the second user message if first message is a greeting.
 * 5. Telemetry logged to AiCallLog under feature 'assistant_title' without consuming chat quota.
 */

const { ConversationMeta, ChatLog } = require('../../models');
const { callAiWithQuotaAndRetry, isAiConfigured } = require('../ai/aiClient');
const { isAiFeatureEnabled } = require('../../utils/featureFlags');
const { redactPII } = require('../ai/redactor');

// Regex for pure greetings
const GREETING_ONLY_REGEX = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|howdy|hola|namaste|greetings|sup|yo)(?:\s+(?:there|bot|assistant|all|team))?$/i;

// Regex for leading greetings & filler conversational prefixes
const LEADING_FILLER_REGEX = /^(?:hello\s+there|hi\s+there|hey\s+there|hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|i\s+want\s+to\s+know|can\s+you\s+please\s+tell\s+me|can\s+you\s+tell\s+me|tell\s+me|i\s+need\s+to\s+know|i\s+want\s+to|i\s+want|please\s+tell\s+me|please)[,:\s-]+/i;

/**
 * Checks if a user message consists strictly of a greeting with no substantive question.
 *
 * @param {string} text - Message text to inspect
 * @returns {boolean}
 */
function isGreetingOnly(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text
    .replace(/[.,!?;:()"'`~@#$%^&*\-_+=/\\]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean) return true;
  return GREETING_ONLY_REGEX.test(clean);
}

/**
 * Deterministic fallback title generator
 * Strips conversational greetings/fillers, capitalizes first character,
 * and truncates at a word boundary to at most 40 characters with an ellipsis.
 * Safely preserves non-English / Unicode content.
 *
 * @param {string} text - Raw user question
 * @returns {string} Cleaned topic title
 */
function generateFallbackTitle(text) {
  if (!text || typeof text !== 'string') {
    return 'New Conversation';
  }

  let cleaned = text.trim();

  // Iteratively strip leading greeting and filler phrases
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(LEADING_FILLER_REGEX, '').trim();
  } while (cleaned !== prev && cleaned.length > 0);

  // If stripping left nothing, restore original trimmed text
  if (!cleaned) {
    cleaned = text.trim();
  }

  // Remove quotes and punctuation at boundaries
  cleaned = cleaned
    .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
    .replace(/[.,!?;:\s]+$/, '')
    .trim();

  if (!cleaned) {
    return 'New Conversation';
  }

  // Capitalize first character
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  const MAX_FALLBACK_LEN = 40;
  if (cleaned.length <= MAX_FALLBACK_LEN) {
    return cleaned;
  }

  // Word-boundary cut at <= MAX_FALLBACK_LEN
  const slice = cleaned.slice(0, MAX_FALLBACK_LEN);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 10) {
    return slice.slice(0, lastSpace).replace(/[.,!?;:\s]+$/, '') + '…';
  }
  return slice.replace(/[.,!?;:\s]+$/, '') + '…';
}

/**
 * Generates a 3-6 word topic title using AI or deterministic fallback.
 * Sends only the question (no replies, no student PII).
 *
 * @param {object} params
 * @param {string} params.question - The question to title
 * @param {string} params.userId - Authenticated user ID
 * @returns {Promise<{ title: string, source: 'ai' | 'fallback' }>}
 */
async function generateConversationTitle({ question, userId = null }) {
  const fallback = generateFallbackTitle(question);

  // If AI is disabled or assistant feature flag is off, return fallback title immediately
  if (!isAiConfigured() || !isAiFeatureEnabled('assistant')) {
    return { title: fallback, source: 'fallback' };
  }

  try {
    const cleanQuestion = redactPII(String(question || '').trim().slice(0, 300));
    const systemPrompt =
      'You are a concise title generator. Generate a 3-6 word topic title summarizing the user question in the user\'s language. Rules: Do NOT use quotes. Do NOT end with punctuation. Max 60 characters. Return ONLY the title text, nothing else.';
    const userPrompt = `User question: "${cleanQuestion}"`;

    const result = await callAiWithQuotaAndRetry({
      systemPrompt,
      userPrompt,
      mode: 'assistant_title',
      userId,
      timeoutMs: 5000,
      skipQuota: true,
      model: process.env.AI_MODEL_FAST || process.env.AI_MODEL,
    });

    if (result && result.success && (result.data || result.rawText)) {
      let rawTitle = String(result.data || result.rawText || '').trim();

      // Clean markdown, quotes, and punctuation
      rawTitle = rawTitle
        .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/[.,!?;:\s]+$/, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();

      if (rawTitle.length > 60) {
        const slice = rawTitle.slice(0, 60);
        const lastSpace = slice.lastIndexOf(' ');
        rawTitle = (lastSpace > 20 ? slice.slice(0, lastSpace) : slice).trim();
      }

      // Check if valid non-empty title was extracted
      if (rawTitle.length >= 2 && !rawTitle.toLowerCase().includes('error')) {
        return {
          title: rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1),
          source: 'ai',
        };
      }
    }
  } catch (err) {
    console.warn('[TitleService] AI title generation failed, falling back:', err.message);
  }

  return { title: fallback, source: 'fallback' };
}

/**
 * Inspects conversation history and generates + saves a title if this is the first turn
 * (or second turn if first was greeting-only).
 *
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string} params.userId
 * @param {object} [params.streamSender] - Optional SSE stream sender
 * @returns {Promise<object|null>} The saved or existing ConversationMeta record
 */
async function generateAndSaveTitle({ conversationId, userId, streamSender = null }) {
  if (
    !conversationId ||
    typeof conversationId !== 'string' ||
    !conversationId.trim() ||
    conversationId.trim().toLowerCase() === 'null' ||
    conversationId.trim().toLowerCase() === 'undefined' ||
    !userId
  ) {
    return null;
  }

  const cleanConvId = conversationId.trim();

  try {
    // 1. Check if metadata already exists
    const existing = await ConversationMeta.findOne({ conversationId: cleanConvId });
    if (existing && existing.title) {
      return existing;
    }

    // 2. Fetch conversation messages
    const logs = await ChatLog.find({ conversationId: cleanConvId })
      .sort({ createdAt: 1 })
      .lean();

    if (!logs || logs.length === 0) return null;

    // Must have at least one successful assistant reply
    const hasSuccessReply = logs.some((l) => l.sender === 'assistant' && l.status === 'success');
    if (!hasSuccessReply) return null;

    // Filter user messages
    const userLogs = logs.filter((l) => l.sender === 'user');
    if (userLogs.length === 0) return null;

    const firstQuestion = (userLogs[0].question || userLogs[0].content || '').trim();

    // Check if the first message is greeting-only
    let targetQuestion = firstQuestion;
    if (isGreetingOnly(firstQuestion)) {
      if (userLogs.length < 2) {
        // Wait for second message before titling
        return null;
      }
      targetQuestion = (userLogs[1].question || userLogs[1].content || '').trim();
    }

    if (!targetQuestion) return null;

    // 3. Generate title
    const { title, source } = await generateConversationTitle({
      question: targetQuestion,
      userId,
    });

    // 4. Save metadata atomically
    const meta = await ConversationMeta.findOneAndUpdate(
      { conversationId: cleanConvId },
      {
        $setOnInsert: {
          conversationId: cleanConvId,
          user: userId,
          title,
          titleSource: source,
          pinned: false,
          createdAt: new Date(),
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // 5. Send SSE event if stream is still open
    if (streamSender && typeof streamSender.sendEvent === 'function') {
      try {
        streamSender.sendEvent('conversation_title', {
          conversationId,
          title: meta.title,
        });
      } catch (_) {}
    }

    return meta;
  } catch (err) {
    console.warn('[TitleService] Error in generateAndSaveTitle:', err.message);
    return null;
  }
}

module.exports = {
  isGreetingOnly,
  generateFallbackTitle,
  generateConversationTitle,
  generateAndSaveTitle,
};
