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
aiUsageSchema.statics.canMakeCall = async function (userId = null) {
  const globalCap = parseInt(process.env.AI_DAILY_CALL_CAP || '400', 10);
  const userCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);

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
    const userCount = record.userCounts ? record.userCounts.get(String(userId)) || 0 : 0;
    if (userCount >= userCap) {
      return {
        allowed: false,
        reason: 'user_cap_reached',
        message: 'Your personal daily AI parsing quota has been reached for today.',
      };
    }
  }

  return { allowed: true };
};

/**
 * Get current user daily usage metrics (used, cap, remaining)
 */
aiUsageSchema.statics.getUserDailyUsage = async function (userId) {
  const userCap = parseInt(process.env.AI_USER_DAILY_PARSE_CAP || '5', 10);
  if (!userId) {
    return { used: 0, cap: userCap, remaining: userCap };
  }

  const dateKey = this.getTodayKey();
  const record = await this.findOne({ date: dateKey });
  if (!record || !record.userCounts) {
    return { used: 0, cap: userCap, remaining: userCap };
  }

  const userCount = record.userCounts.get(String(userId)) || 0;
  return {
    used: userCount,
    cap: userCap,
    remaining: Math.max(0, userCap - userCount),
  };
};

/**
 * Atomically record an AI call against today's quota
 */
aiUsageSchema.statics.recordCall = async function (userId = null) {
  const dateKey = this.getTodayKey();
  const update = {
    $inc: { globalCount: 1 },
  };

  if (userId) {
    update.$inc[`userCounts.${String(userId)}`] = 1;
  }

  return await this.findOneAndUpdate(
    { date: dateKey },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);

module.exports = AiUsage;

