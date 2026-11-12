/**
 * Controller for Multi-Role Assistant (Student, TPO, Recruiter, Superadmin).
 * Handles /api/assistant/ask (AI/rules routed), /api/assistant/run (direct tool execution), and /api/assistant/suggestions.
 */

const mongoose = require('mongoose');
const { ChatLog, AiUsage, Student } = require('../models');
const assistantTools = require('../services/assistant/assistantTools');
const {
  TOOL_NAMES,
  ROLE_ALLOWED_TOOLS,
  validateToolAndParams,
  generateCantAnswerResponse,
  getSuggestedQuestions,
  routeIntent,
  formatAssistantAnswer,
  callGeneralCareerAdvisor,
} = require('../services/assistant/intentRouter');
const {
  findHelpTopicById,
  matchHelpTopicByKeywords,
} = require('../services/assistant/knowledge');

/**
 * Resolves the authenticated user scope and enforces role boundaries.
 * Students: own profile only.
 * Recruiters: own company only.
 * TPOs / Admins: own college only.
 * Superadmins: must pass collegeId explicitly.
 * Analysts & Aspirants: strictly 403 Forbidden.
 */
async function resolveAssistantScope(req) {
  const user = req.user;
  const role = String(user?.role || '').toLowerCase();

  // 1. Forbidden roles
  if (role === 'analyst' || role === 'aspirant') {
    return {
      errorStatus: 403,
      errorMessage: 'Not authorized: Analysts and aspirants cannot access the assistant',
    };
  }

  // 2. Student scope
  if (role === 'student') {
    const student = await Student.findOne({ user: user._id });
    if (!student) {
      return { errorStatus: 404, errorMessage: 'Student profile not found' };
    }
    const studentCollegeId = student.college?._id || student.college || null;
    return {
      role: 'student',
      student,
      collegeObjId: studentCollegeId ? new mongoose.Types.ObjectId(studentCollegeId) : null,
      companyObjId: null,
      suggestedQuestions: getSuggestedQuestions('student'),
    };
  }

  // 3. Recruiter scope
  if (role === 'recruiter') {
    const companyId = user.company?._id || user.company;
    if (!companyId) {
      return { errorStatus: 403, errorMessage: 'Recruiter account is not associated with any company' };
    }
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return { errorStatus: 400, errorMessage: 'Invalid company ID format' };
    }
    return {
      role: 'recruiter',
      companyObjId: new mongoose.Types.ObjectId(companyId),
      companyId: companyId.toString(),
      collegeObjId: null,
      suggestedQuestions: getSuggestedQuestions('recruiter'),
    };
  }

  // 4. Superadmin scope
  if (role === 'superadmin') {
    const passedId = req.body?.collegeId || req.query?.collegeId;
    if (!passedId) {
      return { errorStatus: 400, errorMessage: 'collegeId is required for superadmin' };
    }
    if (!mongoose.Types.ObjectId.isValid(passedId)) {
      return { errorStatus: 400, errorMessage: 'Invalid college ID format' };
    }
    const collegeObjId = new mongoose.Types.ObjectId(passedId);
    let depts = [];
    try {
      depts = await Student.distinct('branch', { college: collegeObjId });
    } catch (_) {}

    return {
      role: 'superadmin',
      collegeObjId,
      collegeId: passedId.toString(),
      companyObjId: null,
      departments: depts,
      suggestedQuestions: getSuggestedQuestions('superadmin', depts),
    };
  }

  // 5. TPO / Admin scope
  if (role === 'tpo' || role === 'admin') {
    const collegeId = user.college?._id || user.college;
    if (!collegeId) {
      return { errorStatus: 403, errorMessage: 'TPO account is not associated with any college' };
    }
    if (!mongoose.Types.ObjectId.isValid(collegeId)) {
      return { errorStatus: 400, errorMessage: 'Invalid college ID format' };
    }
    const collegeObjId = new mongoose.Types.ObjectId(collegeId);
    let depts = [];
    try {
      depts = await Student.distinct('branch', { college: collegeObjId });
    } catch (_) {}

    return {
      role: 'tpo',
      collegeObjId,
      collegeId: collegeId.toString(),
      companyObjId: null,
      departments: depts,
      suggestedQuestions: getSuggestedQuestions('tpo', depts),
    };
  }

  return {
    errorStatus: 403,
    errorMessage: 'Not authorized: Access restricted',
  };
}

/**
 * @desc    Ask a natural language analytics or help question (AI/rules routed)
 * @route   POST /api/assistant/ask
 * @access  Private (Student, TPO, Recruiter, Superadmin)
 */
const askAssistant = async (req, res, next) => {
  try {
    const scope = await resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    const { role } = scope;
    const { question, previous } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required',
      });
    }

    const trimmedQuestion = question.trim();

    // Oversized question (> 300 chars): return friendly refusal without error stack
    if (trimmedQuestion.length > 300) {
      const cantAnswer = generateCantAnswerResponse(role, scope.suggestedQuestions);
      try {
        await ChatLog.create({
          user: req.user._id,
          role,
          college: scope.collegeObjId || undefined,
          company: scope.companyObjId || undefined,
          question: trimmedQuestion.slice(0, 300),
          tool: 'unknown',
          params: {},
          status: 'cant_answer',
        });
      } catch (_) {}

      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

      return res.status(200).json({
        success: true,
        ...cantAnswer,
        generatedAt: new Date(),
        source: 'rules',
        dailyUsage,
      });
    }

    // Deterministic help knowledge base check: Help queries consume 0 quota and bypass rate limit
    const helpMatch = matchHelpTopicByKeywords(role, trimmedQuestion);
    if (helpMatch) {
      const topic = findHelpTopicById(role, helpMatch.id) || helpMatch;
      const answer = `### 📖 ${topic.title}\n\n${topic.answer}`;
      const data = { topicId: topic.id, title: topic.title, answer: topic.answer };

      try {
        await ChatLog.create({
          user: req.user._id,
          role,
          college: scope.collegeObjId || undefined,
          company: scope.companyObjId || undefined,
          question: trimmedQuestion,
          tool: 'help',
          params: { topicId: topic.id },
          status: 'success',
        });
      } catch (_) {}

      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);
      return res.status(200).json({
        success: true,
        canAnswer: true,
        answer,
        data,
        tool: 'help',
        params: { topicId: topic.id },
        generatedAt: new Date(),
        source: 'help',
        dailyUsage,
        suggestedQuestions: scope.suggestedQuestions,
      });
    }

    // Check user daily chat quota before invoking AI
    const quotaCheck = await AiUsage.canMakeCall(req.user._id, 'assistant');
    if (!quotaCheck.allowed) {
      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);
      return res.status(429).json({
        success: false,
        status: 'rate_limited',
        message: quotaCheck.message || 'Daily AI chat quota reached. Please try again tomorrow.',
        dailyUsage,
      });
    }

    // Route intent via AI (or fallback to rule-based matcher)
    const routed = await routeIntent(trimmedQuestion, previous, req.user._id, role);
    const { tool, params, source } = routed;

    // Strict role validation: Ensure tool is authorized for this role
    const validation = validateToolAndParams(tool, params, role);
    if (!validation.valid || tool === 'unknown') {
      const cantAnswer = generateCantAnswerResponse(role, scope.suggestedQuestions);
      try {
        await ChatLog.create({
          user: req.user._id,
          role,
          college: scope.collegeObjId || undefined,
          company: scope.companyObjId || undefined,
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

    // Execute tool based on role
    let data = null;
    let answer = '';
    let responseSource = source;

    if (tool === 'help') {
      const topic =
        findHelpTopicById(role, validation.params?.topicId) ||
        matchHelpTopicByKeywords(role, trimmedQuestion);
      if (topic) {
        answer = `### 📖 ${topic.title}\n\n${topic.answer}`;
        data = { topicId: topic.id, title: topic.title, answer: topic.answer };
      } else {
        answer = 'Here is the platform documentation guide for your inquiry.';
        data = { help: true };
      }
      responseSource = 'help';
    } else if (tool === 'general') {
      const advisorRes = await callGeneralCareerAdvisor(trimmedQuestion, req.user._id);
      answer = advisorRes.answer;
      data = { general: true, answer: advisorRes.answer };
      responseSource = 'general';
    } else if (role === 'student') {
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.student, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'student');
    } else if (role === 'recruiter') {
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.companyObjId, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'recruiter');
    } else {
      // TPO / Superadmin / Admin
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.collegeObjId, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'tpo');
    }

    // Audit query in ChatLog (strictly metadata only, zero results stored)
    try {
      await ChatLog.create({
        user: req.user._id,
        role,
        college: scope.collegeObjId || undefined,
        company: scope.companyObjId || undefined,
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
      source: responseSource,
      dailyUsage,
      suggestedQuestions: scope.suggestedQuestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Directly execute a verified tool without AI (used by suggested chips)
 * @route   POST /api/assistant/run
 * @access  Private (Student, TPO, Recruiter, Superadmin)
 */
const runAssistantTool = async (req, res, next) => {
  try {
    const scope = await resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    const { role } = scope;
    const { tool, params } = req.body || {};

    const validation = validateToolAndParams(tool, params, role);
    if (!validation.valid) {
      const cantAnswer = generateCantAnswerResponse(role, scope.suggestedQuestions);
      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);
      return res.status(200).json({
        success: true,
        ...cantAnswer,
        generatedAt: new Date(),
        source: 'direct',
        dailyUsage,
      });
    }

    let data = null;
    let answer = '';
    let responseSource = 'direct';

    if (tool === 'help') {
      const topic =
        findHelpTopicById(role, validation.params?.topicId) ||
        matchHelpTopicByKeywords(role, validation.params?.topicId || '');
      if (topic) {
        answer = `### 📖 ${topic.title}\n\n${topic.answer}`;
        data = { topicId: topic.id, title: topic.title, answer: topic.answer };
      } else {
        answer = 'Here is the platform guide for your inquiry.';
        data = { help: true };
      }
      responseSource = 'help';
    } else if (tool === 'general') {
      const advisorRes = await callGeneralCareerAdvisor(validation.params?.question || 'Career guidance', req.user._id);
      answer = advisorRes.answer;
      data = { general: true, answer: advisorRes.answer };
      responseSource = 'general';
    } else if (role === 'student') {
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.student, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'student');
    } else if (role === 'recruiter') {
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.companyObjId, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'recruiter');
    } else {
      // TPO / Superadmin / Admin
      const toolFn = assistantTools[tool];
      if (!toolFn) {
        return res.status(200).json({
          success: true,
          ...generateCantAnswerResponse(role, scope.suggestedQuestions),
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id),
        });
      }
      data = await toolFn(scope.collegeObjId, validation.params);
      answer = formatAssistantAnswer(tool, validation.params, data, 'tpo');
    }

    // Audit direct run (metadata only)
    try {
      await ChatLog.create({
        user: req.user._id,
        role,
        college: scope.collegeObjId || undefined,
        company: scope.companyObjId || undefined,
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
      source: responseSource,
      dailyUsage,
      suggestedQuestions: scope.suggestedQuestions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get role-tailored suggested question chips
 * @route   GET /api/assistant/suggestions
 * @access  Private (Student, TPO, Recruiter, Superadmin)
 */
const getAssistantSuggestions = async (req, res, next) => {
  try {
    const scope = await resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id);

    return res.status(200).json({
      success: true,
      role: scope.role,
      suggestedQuestions: scope.suggestedQuestions,
      suggestions: scope.suggestedQuestions,
      dailyUsage,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  resolveAssistantScope,
  askAssistant,
  runAssistantTool,
  getAssistantSuggestions,
};
