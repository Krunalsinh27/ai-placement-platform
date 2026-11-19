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
    userMockCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    userTailorCounts: {
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
 * Helper to get role-specific daily chat cap
 */
function getRoleChatCap(role) {
  const normRole = String(role || '').toLowerCase();
  if (normRole === 'student') {
    return parseInt(process.env.AI_USER_DAILY_CHAT_CAP_STUDENT || process.env.AI_USER_DAILY_CHAT_CAP || '20', 10);
  }
  if (normRole === 'tpo' || normRole === 'admin') {
    return parseInt(process.env.AI_USER_DAILY_CHAT_CAP_TPO || process.env.AI_USER_DAILY_CHAT_CAP || '50', 10);
  }
  if (normRole === 'recruiter') {
    return parseInt(process.env.AI_USER_DAILY_CHAT_CAP_RECRUITER || process.env.AI_USER_DAILY_CHAT_CAP || '40', 10);
  }
  if (normRole === 'superadmin') {
    return parseInt(process.env.AI_USER_DAILY_CHAT_CAP_SUPERADMIN || process.env.AI_USER_DAILY_CHAT_CAP || '100', 10);
  }
  return parseInt(process.env.AI_USER_DAILY_CHAT_CAP || '30', 10);
}

/**
 * Check if a call can be made under global and user daily caps
 */
aiUsageSchema.statics.canMakeCall = async function (userId = null, mode = 'parse', role = null) {
  const globalCap = parseInt(process.env.AI_DAILY_CALL_CAP || '400', 10);
  const isAnalyze = mode === 'analyze';
  const isChat = mode === 'assistant' || mode === 'chat' || mode === 'career';
  const isMock = mode === 'mock' || mode === 'interview' || (typeof mode === 'string' && mode.startsWith('mock'));
  const isTailor = mode === 'tailor' || mode === 'cover_letter' || (typeof mode === 'string' && mode.startsWith('tailor'));

  let userCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);
  if (isAnalyze) {
    userCap = parseInt(process.env.AI_USER_DAILY_ANALYZE_CAP || '10', 10);
  } else if (isChat) {
    userCap = getRoleChatCap(role);
  } else if (isMock) {
    userCap = parseInt(process.env.AI_USER_DAILY_MOCK_CAP || '5', 10);
  } else if (isTailor) {
    userCap = parseInt(process.env.AI_USER_DAILY_TAILOR_CAP || '10', 10);
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
    } else if (isMock) {
      userMap = record.userMockCounts;
    } else if (isTailor) {
      userMap = record.userTailorCounts;
    }

    const userCount = userMap ? userMap.get(String(userId)) || 0 : 0;
    if (userCount >= userCap) {
      let capMessage = 'Your personal daily AI parsing quota has been reached for today.';
      if (isAnalyze) {
        capMessage = 'Your personal daily AI resume analysis quota has been reached for today.';
      } else if (isChat) {
        capMessage = 'Your personal daily AI chat quota has been reached for today.';
      } else if (isMock) {
        capMessage = 'Your personal daily AI mock interview quota has been reached for today.';
      } else if (isTailor) {
        capMessage = 'Your personal daily AI resume tailoring quota has been reached for today.';
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
 * Get current user daily usage metrics (used, cap, remaining, analyze metrics, chat metrics, mock metrics)
 */
aiUsageSchema.statics.getUserDailyUsage = async function (userId, role = null) {
  const parseCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);
  const analyzeCap = parseInt(process.env.AI_USER_DAILY_ANALYZE_CAP || '10', 10);
  const chatCap = getRoleChatCap(role);
  const mockCap = parseInt(process.env.AI_USER_DAILY_MOCK_CAP || '5', 10);
  const tailorCap = parseInt(process.env.AI_USER_DAILY_TAILOR_CAP || '10', 10);

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
      mock: { used: 0, cap: mockCap, remaining: mockCap },
      mockUsed: 0,
      mockCap: mockCap,
      mockRemaining: mockCap,
      tailor: { used: 0, cap: tailorCap, remaining: tailorCap },
      tailorUsed: 0,
      tailorCap: tailorCap,
      tailorRemaining: tailorCap,
    };
  }

  const dateKey = this.getTodayKey();
  const record = await this.findOne({ date: dateKey });
  const parseUsed = record?.userCounts ? record.userCounts.get(String(userId)) || 0 : 0;
  const analyzeUsed = record?.userAnalyzeCounts ? record.userAnalyzeCounts.get(String(userId)) || 0 : 0;
  const chatUsed = record?.userChatCounts ? record.userChatCounts.get(String(userId)) || 0 : 0;
  const mockUsed = record?.userMockCounts ? record.userMockCounts.get(String(userId)) || 0 : 0;
  const tailorUsed = record?.userTailorCounts ? record.userTailorCounts.get(String(userId)) || 0 : 0;

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
    mock: {
      used: mockUsed,
      cap: mockCap,
      remaining: Math.max(0, mockCap - mockUsed),
    },
    mockUsed,
    mockCap,
    mockRemaining: Math.max(0, mockCap - mockUsed),
    tailor: {
      used: tailorUsed,
      cap: tailorCap,
      remaining: Math.max(0, tailorCap - tailorUsed),
    },
    tailorUsed,
    tailorCap,
    tailorRemaining: Math.max(0, tailorCap - tailorUsed),
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
    } else if (mode === 'mock' || mode === 'interview' || (typeof mode === 'string' && mode.startsWith('mock'))) {
      fieldName = 'userMockCounts';
    } else if (mode === 'tailor' || mode === 'cover_letter' || (typeof mode === 'string' && mode.startsWith('tailor'))) {
      fieldName = 'userTailorCounts';
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

