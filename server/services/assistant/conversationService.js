/**
 * Conversation Service for Multi-Role Assistant.
 * Manages per-user, per-conversation memory, message persistence,
 * context sliding window (last N=10 messages), and rolling summarization.
 */

const { ChatLog, ConversationMeta } = require('../../models');
const { generateFallbackTitle } = require('./titleService');

const MAX_WINDOW_MESSAGES = parseInt(process.env.ASSISTANT_MEMORY_MAX_MESSAGES || '10', 10);

/**
 * Saves a message (user, assistant, or tool) to ChatLog
 */
async function saveMessage({
  conversationId,
  user,
  role,
  college = null,
  company = null,
  sender = 'user',
  question = '',
  content = '',
  tool = 'none',
  toolCalls = [],
  sources = [],
  params = {},
  status = 'success',
}) {
  try {
    const entry = await ChatLog.create({
      conversationId: String(conversationId),
      user,
      role,
      college: college || undefined,
      company: company || undefined,
      sender,
      question: question ? String(question).slice(0, 1500) : '',
      content: content ? String(content).slice(0, 10000) : '',
      tool: tool || 'none',
      toolCalls: toolCalls || [],
      sources: sources || [],
      params: params || {},
      status: status || 'success',
      createdAt: new Date(),
    });
    return entry;
  } catch (err) {
    console.warn('[ConversationService] Failed to save message:', err.message);
    return null;
  }
}

/**
 * Builds conversational context for the model turn:
 * - Fetches messages for conversationId
 * - Extracts last N messages (default 10)
 * - Summarizes any messages preceding the last N messages
 */
async function getConversationContext(conversationId, userId, maxMessages = MAX_WINDOW_MESSAGES) {
  if (!conversationId) {
    return { recentMessages: [], olderSummary: '' };
  }

  try {
    const query = { conversationId: String(conversationId) };
    if (userId) query.user = userId;

    const allLogs = await ChatLog.find(query)
      .sort({ createdAt: 1 })
      .lean();

    if (!allLogs || allLogs.length === 0) {
      return { recentMessages: [], olderSummary: '' };
    }

    if (allLogs.length <= maxMessages) {
      const recentMessages = allLogs.map(mapLogToMessage);
      return { recentMessages, olderSummary: '' };
    }

    // Split into older messages to summarize and recent messages to send verbatim
    const olderLogs = allLogs.slice(0, allLogs.length - maxMessages);
    const recentLogs = allLogs.slice(allLogs.length - maxMessages);

    // Build rolling summary of older messages
    const summaryLines = olderLogs
      .filter((l) => l.sender === 'user' || l.sender === 'assistant')
      .map((l) => {
        const text = (l.content || l.question || '').slice(0, 100).replace(/\n/g, ' ');
        return `${l.sender === 'user' ? 'User' : 'Assistant'}: ${text}`;
      });

    const olderSummary =
      summaryLines.length > 0
        ? `Previous context summary of earlier conversation:\n${summaryLines.slice(-6).join('\n')}`
        : '';

    const recentMessages = recentLogs.map(mapLogToMessage);
    return { recentMessages, olderSummary };
  } catch (err) {
    console.warn('[ConversationService] Failed to get context:', err.message);
    return { recentMessages: [], olderSummary: '' };
  }
}

function mapLogToMessage(log) {
  const role = log.sender === 'tool' ? 'tool' : log.sender === 'assistant' ? 'assistant' : 'user';
  const msg = {
    role,
    content: log.content || log.question || '',
  };

  if (log.toolCalls && log.toolCalls.length > 0) {
    msg.tool_calls = log.toolCalls.map((tc) => ({
      id: tc.id || `call_${Math.random()}`,
      type: 'function',
      function: {
        name: tc.name,
        arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
      },
    }));
  }

  if (log.tool && log.tool !== 'none') {
    msg.name = log.tool;
  }

  return msg;
}

/**
 * Lists conversation threads for an authenticated user.
 * Returns { conversationId, title, pinned, lastMessageAt, messageCount },
 * sorted pinned first, then newest.
 * Existing old conversations without a title are filled on read using the fallback.
 */
async function listUserConversations(userId, limit = 50) {
  try {
    const rawConversations = await ChatLog.aggregate([
      { $match: { user: userId } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$conversationId',
          firstQuestion: { $first: '$question' },
          firstContent: { $first: '$content' },
          lastContent: { $last: '$content' },
          lastSender: { $last: '$sender' },
          messageCount: { $sum: 1 },
          updatedAt: { $last: '$createdAt' },
          createdAt: { $first: '$createdAt' },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
    ]);

    if (!rawConversations || rawConversations.length === 0) {
      return [];
    }

    const conversationIds = rawConversations.map((c) => String(c._id));

    // Fetch existing ConversationMeta records for these conversations
    const metas = await ConversationMeta.find({
      user: userId,
      conversationId: { $in: conversationIds },
    }).lean();

    const metaMap = new Map();
    for (const m of metas) {
      metaMap.set(String(m.conversationId), m);
    }

    const lazyUpserts = [];
    const results = [];

    for (const c of rawConversations) {
      const convId = String(c._id);
      const meta = metaMap.get(convId);

      let title;
      let pinned = false;
      const lastMessageAt = c.updatedAt || c.createdAt || new Date();

      if (meta && meta.title && meta.title.trim()) {
        title = meta.title.trim();
        pinned = Boolean(meta.pinned);
      } else {
        // Fallback for old/un-titled conversations
        title = generateFallbackTitle(c.firstQuestion || c.firstContent || 'New Conversation');
        pinned = meta ? Boolean(meta.pinned) : false;

        // Lazily record fallback title into ConversationMeta
        lazyUpserts.push(
          ConversationMeta.updateOne(
            { conversationId: convId, user: userId },
            {
              $setOnInsert: {
                conversationId: convId,
                user: userId,
                title,
                titleSource: 'fallback',
                pinned,
                createdAt: c.createdAt || new Date(),
                updatedAt: lastMessageAt,
              },
            },
            { upsert: true }
          ).catch((e) => {
            console.warn('[ConversationService] Lazy title persist error:', e.message);
          })
        );
      }

      results.push({
        conversationId: convId,
        title,
        pinned,
        lastMessageAt,
        messageCount: c.messageCount || 1,
        lastMessage: (c.lastContent || '').slice(0, 100),
        updatedAt: lastMessageAt,
        createdAt: c.createdAt || lastMessageAt,
      });
    }

    // Trigger lazy upserts in background without awaiting
    if (lazyUpserts.length > 0) {
      Promise.all(lazyUpserts).catch(() => {});
    }

    // Sort pinned first, then newest lastMessageAt descending
    results.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
      return timeB - timeA;
    });

    return results;
  } catch (err) {
    console.warn('[ConversationService] Failed to list conversations:', err.message);
    return [];
  }
}

/**
 * Gets message history for a specific conversation
 */
async function getConversationMessages(conversationId, userId) {
  try {
    const query = { conversationId: String(conversationId) };
    if (userId) query.user = userId;

    const logs = await ChatLog.find(query)
      .sort({ createdAt: 1 })
      .lean();

    return logs.map((l) => ({
      id: l._id.toString(),
      messageId: l.messageId,
      conversationId: l.conversationId,
      sender: l.sender,
      role: l.sender,
      question: l.question,
      content: l.content,
      tool: l.tool,
      toolCalls: l.toolCalls,
      sources: l.sources,
      feedback: l.feedback,
      createdAt: l.createdAt,
    }));
  } catch (err) {
    console.warn('[ConversationService] Failed to get messages:', err.message);
    return [];
  }
}

/**
 * Clears/deletes a single conversation from ChatLog and ConversationMeta
 */
async function deleteConversation(conversationId, userId) {
  try {
    const query = { conversationId: String(conversationId) };
    if (userId) query.user = userId;
    const [chatRes] = await Promise.all([
      ChatLog.deleteMany(query),
      ConversationMeta.deleteMany(query),
    ]);
    return chatRes.deletedCount;
  } catch (err) {
    console.warn('[ConversationService] Failed to delete conversation:', err.message);
    return 0;
  }
}

/**
 * Clears all conversations for a user from ChatLog and ConversationMeta
 */
async function clearAllConversations(userId) {
  try {
    const query = { user: userId };
    const [chatRes] = await Promise.all([
      ChatLog.deleteMany(query),
      ConversationMeta.deleteMany(query),
    ]);
    return chatRes.deletedCount;
  } catch (err) {
    console.warn('[ConversationService] Failed to clear all conversations:', err.message);
    return 0;
  }
}

/**
 * Record feedback rating (thumbs up / down)
 */
async function recordFeedback(messageId, conversationId, userId, rating, comment = '') {
  try {
    const query = { user: userId };
    if (messageId) {
      query.$or = [{ messageId: String(messageId) }, { _id: messageId }];
    } else if (conversationId) {
      query.conversationId = String(conversationId);
      query.sender = 'assistant';
    }

    const updated = await ChatLog.findOneAndUpdate(
      query,
      {
        feedback: {
          rating: rating === 1 ? 1 : -1,
          comment: comment ? String(comment).slice(0, 500) : '',
          createdAt: new Date(),
        },
      },
      { new: true, sort: { createdAt: -1 } }
    );

    return Boolean(updated);
  } catch (err) {
    console.warn('[ConversationService] Failed to record feedback:', err.message);
    return false;
  }
}

module.exports = {
  MAX_WINDOW_MESSAGES,
  saveMessage,
  getConversationContext,
  listUserConversations,
  getConversationMessages,
  deleteConversation,
  clearAllConversations,
  recordFeedback,
};
