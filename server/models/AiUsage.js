const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      unique: true,
      index: true,
    },
    globalCount: {
      type: Number,
      default: 0,
    },
    userCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    userAnalyzeCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    userChatCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Helper to get today's date key in YYYY-MM-DD
 */
aiUsageSchema.statics.getTodayKey = function () {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if a call can be made under global and user daily caps
 */
aiUsageSchema.statics.canMakeCall = async function (userId = null, mode = 'parse') {
  const globalCap = parseInt(process.env.AI_DAILY_CALL_CAP || '400', 10);
  const isAnalyze = mode === 'analyze';
  const isChat = mode === 'assistant' || mode === 'chat' || mode === 'career';

  let userCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);
  if (isAnalyze) {
    userCap = parseInt(process.env.AI_USER_DAILY_ANALYZE_CAP || '10', 10);
  } else if (isChat) {
    userCap = parseInt(process.env.AI_USER_DAILY_CHAT_CAP || '30', 10);
  }

  const dateKey = this.getTodayKey();
  const record = await this.findOne({ date: dateKey });

  if (!record) {
    return { allowed: true, globalRemaining: globalCap, userRemaining: userCap };
  }

  if (record.globalCount >= globalCap) {
    return {
      allowed: false,
      reason: 'global_cap_reached',
      message: 'Global daily AI quota reached. Please try again tomorrow.',
    };
  }

  if (userId) {
    let userMap = record.userCounts;
    if (isAnalyze) {
      userMap = record.userAnalyzeCounts;
    } else if (isChat) {
      userMap = record.userChatCounts;
    }

    const userCount = userMap ? userMap.get(String(userId)) || 0 : 0;
    if (userCount >= userCap) {
      let capMessage = 'Your personal daily AI parsing quota has been reached for today.';
      if (isAnalyze) {
        capMessage = 'Your personal daily AI resume analysis quota has been reached for today.';
      } else if (isChat) {
        capMessage = 'Your personal daily AI chat quota has been reached for today.';
      }

      return {
        allowed: false,
        reason: 'user_cap_reached',
        message: capMessage,
      };
    }
  }

  return { allowed: true };
};

/**
 * Get current user daily usage metrics (used, cap, remaining, analyze metrics, chat metrics)
 */
aiUsageSchema.statics.getUserDailyUsage = async function (userId) {
  const parseCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);
  const analyzeCap = parseInt(process.env.AI_USER_DAILY_ANALYZE_CAP || '10', 10);
  const chatCap = parseInt(process.env.AI_USER_DAILY_CHAT_CAP || '30', 10);

  if (!userId) {
    return {
      used: 0,
      cap: parseCap,
      remaining: parseCap,
      analyze: { used: 0, cap: analyzeCap, remaining: analyzeCap },
      analyzeUsed: 0,
      analyzeCap: analyzeCap,
      analyzeRemaining: analyzeCap,
      chat: { used: 0, cap: chatCap, remaining: chatCap },
      chatUsed: 0,
      chatCap: chatCap,
      chatRemaining: chatCap,
    };
  }

  const dateKey = this.getTodayKey();
  const record = await this.findOne({ date: dateKey });
  const parseUsed = record?.userCounts ? record.userCounts.get(String(userId)) || 0 : 0;
  const analyzeUsed = record?.userAnalyzeCounts ? record.userAnalyzeCounts.get(String(userId)) || 0 : 0;
  const chatUsed = record?.userChatCounts ? record.userChatCounts.get(String(userId)) || 0 : 0;

  return {
    used: parseUsed,
    cap: parseCap,
    remaining: Math.max(0, parseCap - parseUsed),
    analyze: {
      used: analyzeUsed,
      cap: analyzeCap,
      remaining: Math.max(0, analyzeCap - analyzeUsed),
    },
    analyzeUsed,
    analyzeCap,
    analyzeRemaining: Math.max(0, analyzeCap - analyzeUsed),
    chat: {
      used: chatUsed,
      cap: chatCap,
      remaining: Math.max(0, chatCap - chatUsed),
    },
    chatUsed,
    chatCap,
    chatRemaining: Math.max(0, chatCap - chatUsed),
  };
};

/**
 * Atomically record an AI call against today's quota
 */
aiUsageSchema.statics.recordCall = async function (userId = null, mode = 'parse') {
  const dateKey = this.getTodayKey();
  const update = {
    $inc: { globalCount: 1 },
  };

  if (userId) {
    let fieldName = 'userCounts';
    if (mode === 'analyze') {
      fieldName = 'userAnalyzeCounts';
    } else if (mode === 'assistant' || mode === 'chat' || mode === 'career') {
      fieldName = 'userChatCounts';
    }
    update.$inc[`${fieldName}.${String(userId)}`] = 1;
  }

  return await this.findOneAndUpdate(
    { date: dateKey },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);

module.exports = AiUsage;

