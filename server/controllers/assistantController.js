/**
 * Controller for TPO Analytics Assistant.
 * Handles /api/assistant/ask (AI/rules routed) and /api/assistant/run (direct tool execution).
 */

const mongoose = require('mongoose');
const { ChatLog, AiUsage } = require('../models');
const assistantTools = require('../services/assistant/assistantTools');
const {
  TOOL_NAMES,
  validateToolAndParams,
  generateCantAnswerResponse,
  routeIntent,
  formatAssistantAnswer,
  SUGGESTED_QUESTIONS,
} = require('../services/assistant/intentRouter');

/**
 * Resolves the authenticated collegeId scope.
 * TPO: Strictly derived from req.user.college. Any param/query is ignored.
 * Superadmin: Must pass collegeId explicitly.
 */
function resolveAssistantScope(req) {
  let collegeId;
  if (req.user.role === 'tpo') {
    collegeId = req.user.college?._id || req.user.college;
    if (!collegeId) {
      return { errorStatus: 403, errorMessage: 'TPO account is not associated with any college' };
    }
  } else if (req.user.role === 'superadmin') {
    const passedId = req.body?.collegeId || req.query?.collegeId;
    if (!passedId) {
      return { errorStatus: 400, errorMessage: 'collegeId is required for superadmin' };
    }
    collegeId = passedId;
  } else {
    return {
      errorStatus: 403,
      errorMessage: 'Not authorized: only TPOs and superadmins can access the assistant',
    };
  }

  if (!mongoose.Types.ObjectId.isValid(collegeId)) {
    return { errorStatus: 400, errorMessage: 'Invalid college ID format' };
  }

  return { collegeObjId: new mongoose.Types.ObjectId(collegeId), collegeId: collegeId.toString() };
}

/**
 * @desc    Ask a natural language analytics question (AI/rules routed)
 * @route   POST /api/assistant/ask
 * @access  Private (TPO, Superadmin)
 */
const askAssistant = async (req, res, next) => {
  try {
    const scope = resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }
    const { collegeObjId } = scope;

    const { question, previous } = req.body || {};

    // Validate question presence
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required',
      });
    }

    const trimmedQuestion = question.trim();

    // Oversized question (> 300 chars): return friendly refusal without error stack
    if (trimmedQuestion.length > 300) {
      const cantAnswer = generateCantAnswerResponse();
      try {
        await ChatLog.create({
          user: req.user._id,
          college: collegeObjId,
          question: trimmedQuestion.slice(0, 300),
          tool: 'unknown',
          params: {},
          status: 'cant_answer',
        });
      } catch (_) {}

      return res.status(200).json({
        success: true,
        ...cantAnswer,
        generatedAt: new Date(),
        source: 'rules',
      });
    }

    // Route intent via AI (falls back to rule-based matcher on quota/error/invalid JSON)
    const routed = await routeIntent(trimmedQuestion, previous, req.user._id);
    const { tool, params, source } = routed;

    // Check if tool is known and params pass Zod schema
    const validation = validateToolAndParams(tool, params);
    if (!validation.valid || tool === 'unknown' || !assistantTools[tool]) {
      const cantAnswer = generateCantAnswerResponse();
      try {
        await ChatLog.create({
          user: req.user._id,
          college: collegeObjId,
          question: trimmedQuestion,
          tool: tool || 'unknown',
          params: params || {},
          status: 'cant_answer',
        });
      } catch (_) {}

      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

      return res.status(200).json({
        success: true,
        ...cantAnswer,
        generatedAt: new Date(),
        source: source || 'rules',
        dailyUsage,
      });
    }

    // Execute the pure server tool function scoped to collegeObjId
    const toolFunction = assistantTools[tool];
    const data = await toolFunction(collegeObjId, validation.params);

    // Format deterministic template answer
    const answer = formatAssistantAnswer(tool, validation.params, data);

    // Audit query in ChatLog (never stores results or resume text)
    try {
      await ChatLog.create({
        user: req.user._id,
        college: collegeObjId,
        question: trimmedQuestion,
        tool,
        params: validation.params,
        status: 'success',
      });
    } catch (auditErr) {
      console.warn('[Assistant Audit] Failed to record ChatLog:', auditErr.message);
    }

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

    return res.status(200).json({
      success: true,
      canAnswer: true,
      answer,
      data,
      tool,
      params: validation.params,
      generatedAt: new Date(),
      source,
      dailyUsage,
      suggestedQuestions: SUGGESTED_QUESTIONS,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Directly execute a verified tool without AI (used by suggested chips)
 * @route   POST /api/assistant/run
 * @access  Private (TPO, Superadmin)
 */
const runAssistantTool = async (req, res, next) => {
  try {
    const scope = resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }
    const { collegeObjId } = scope;

    const { tool, params } = req.body || {};

    const validation = validateToolAndParams(tool, params);
    if (!validation.valid || !assistantTools[tool]) {
      const cantAnswer = generateCantAnswerResponse();
      return res.status(200).json({
        success: true,
        ...cantAnswer,
        generatedAt: new Date(),
        source: 'direct',
      });
    }

    // Execute pure server tool
    const toolFunction = assistantTools[tool];
    const data = await toolFunction(collegeObjId, validation.params);

    const answer = formatAssistantAnswer(tool, validation.params, data);

    // Audit direct run
    try {
      await ChatLog.create({
        user: req.user._id,
        college: collegeObjId,
        question: `[Direct: ${tool}]`,
        tool,
        params: validation.params,
        status: 'success',
      });
    } catch (auditErr) {
      console.warn('[Assistant Audit] Failed to record ChatLog:', auditErr.message);
    }

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

    return res.status(200).json({
      success: true,
      canAnswer: true,
      answer,
      data,
      tool,
      params: validation.params,
      generatedAt: new Date(),
      source: 'direct',
      dailyUsage,
      suggestedQuestions: SUGGESTED_QUESTIONS,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get suggested question chips
 * @route   GET /api/assistant/suggestions
 * @access  Private (TPO, Superadmin)
 */
const getAssistantSuggestions = async (req, res, next) => {
  try {
    const scope = resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

    return res.status(200).json({
      success: true,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      dailyUsage,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  askAssistant,
  runAssistantTool,
  getAssistantSuggestions,
};

