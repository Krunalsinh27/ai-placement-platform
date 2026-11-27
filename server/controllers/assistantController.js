/**
 * Controller for Multi-Role Assistant (Student, TPO, Recruiter, Superadmin).
 * Handles:
 * - POST /api/assistant/ask (Standard JSON response)
 * - POST /api/assistant/chat/stream (Server-Sent Events streaming)
 * - GET /api/assistant/conversations (List user threads)
 * - GET /api/assistant/conversations/:conversationId (Get thread history)
 * - DELETE /api/assistant/conversations/:conversationId (Clear single thread)
 * - DELETE /api/assistant/conversations (Clear all threads)
 * - POST /api/assistant/feedback (Thumbs up/down rating)
 * - POST /api/assistant/escalate (Send unanswered question to college TPO)
 * - POST /api/assistant/run (Direct tool execution)
 * - GET /api/assistant/suggestions (Role-tailored chips & quota status)
 */

const mongoose = require('mongoose');
const { ChatLog, AiUsage, Student, User, Notification, ConversationMeta } = require('../models');
const assistantTools = require('../services/assistant/assistantTools');
const {
  processAssistantTurn,
} = require('../services/assistant/orchestrator');
const {
  listUserConversations,
  getConversationMessages,
  deleteConversation,
  clearAllConversations,
  recordFeedback,
} = require('../services/assistant/conversationService');
const { generateAndSaveTitle } = require('../services/assistant/titleService');
const {
  validateToolAndParams,
  formatAssistantAnswer,
  generateCantAnswerResponse,
  getSuggestedQuestions,
} = require('../services/assistant/intentRouter');
const {
  findHelpTopicById,
  matchHelpTopicByKeywords,
} = require('../services/assistant/knowledge');
const { callGeneralCareerAdvisor } = require('../services/assistant/careerAdvisor');

/**
 * Resolves the authenticated user scope and enforces role boundaries.
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
    const student = await Student.findOne({ user: user._id }).populate('user', 'name email');
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
 * @desc    Ask assistant (standard JSON response)
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

    const { question, conversationId } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required',
      });
    }

    const cleanConvId =
      typeof conversationId === 'string' &&
      conversationId.trim().length > 0 &&
      conversationId.trim().toLowerCase() !== 'null' &&
      conversationId.trim().toLowerCase() !== 'undefined'
        ? conversationId.trim()
        : null;

    const result = await processAssistantTurn({
      question: question.trim(),
      conversationId: cleanConvId,
      userId: req.user._id,
      scope,
    });

    if (result.status === 'rate_limited') {
      return res.status(429).json({
        success: false,
        status: 'rate_limited',
        message: result.answer,
        dailyUsage: result.dailyUsage,
      });
    }

    // Trigger async title generation for first/second turn in background
    if (result.conversationId) {
      setImmediate(() => {
        generateAndSaveTitle({
          conversationId: result.conversationId,
          userId: req.user._id,
        }).catch((err) => {
          console.warn('[AssistantController] Async title generation error:', err.message);
        });
      });
    }

    return res.status(200).json({
      ...result,
      generatedAt: new Date(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Stream assistant response via Server-Sent Events (SSE)
 * @route   POST /api/assistant/chat/stream
 * @access  Private (Student, TPO, Recruiter, Superadmin)
 */
const streamAssistantChat = async (req, res, next) => {
  try {
    const scope = await resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    const { question, conversationId } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required',
      });
    }

    const cleanConvId =
      typeof conversationId === 'string' &&
      conversationId.trim().length > 0 &&
      conversationId.trim().toLowerCase() !== 'null' &&
      conversationId.trim().toLowerCase() !== 'undefined'
        ? conversationId.trim()
        : null;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const streamSender = {
      sendEvent: (event, data) => {
        try {
          if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        } catch (_) {}
      },
    };

    const turnResult = await processAssistantTurn({
      question: question.trim(),
      conversationId: cleanConvId,
      userId: req.user._id,
      scope,
      streamSender,
    });

    const finalConvId = turnResult?.conversationId || cleanConvId;

    res.end();

    // Trigger async title generation AFTER SSE stream ends so response is never delayed
    if (finalConvId) {
      setImmediate(async () => {
        try {
          await generateAndSaveTitle({
            conversationId: finalConvId,
            userId: req.user._id,
            streamSender,
          });
        } catch (err) {
          console.warn('[AssistantController] Async title generation error:', err.message);
        }
      });
    }
  } catch (error) {
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || 'Stream failed' })}\n\n`);
      res.end();
    } catch (_) {
      next(error);
    }
  }
};

/**
 * @desc    List user's active conversations
 * @route   GET /api/assistant/conversations
 * @access  Private
 */
const listConversations = async (req, res, next) => {
  try {
    const conversations = await listUserConversations(req.user._id);
    return res.status(200).json({
      success: true,
      conversations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get message history of a conversation
 * @route   GET /api/assistant/conversations/:conversationId
 * @access  Private
 */
const getConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
    }
    const messages = await getConversationMessages(conversationId, req.user._id);
    return res.status(200).json({
      success: true,
      conversationId,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a specific conversation
 * @route   DELETE /api/assistant/conversations/:conversationId
 * @access  Private
 */
const deleteConversationHandler = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
    }

    // Check conversation existence across ChatLog and ConversationMeta
    const existingLog = await ChatLog.findOne({ conversationId });
    const existingMeta = await ConversationMeta.findOne({ conversationId });

    if (!existingLog && !existingMeta) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    // Enforce ownership: must belong to authenticated user
    const ownerId = (existingMeta?.user || existingLog?.user)?.toString();
    if (ownerId && ownerId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not own this conversation',
      });
    }

    const deletedCount = await deleteConversation(conversationId, req.user._id);
    return res.status(200).json({
      success: true,
      deletedCount,
      message: 'Conversation cleared successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update conversation title or pinned status
 * @route   PATCH /api/assistant/conversations/:conversationId
 * @access  Private
 */
const updateConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
    }
    const { title, pinned } = req.body || {};

    if (title === undefined && pinned === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one of title or pinned must be provided',
      });
    }

    // Check existing conversation in ChatLog or ConversationMeta
    const existingLog = await ChatLog.findOne({ conversationId });
    const existingMeta = await ConversationMeta.findOne({ conversationId });

    if (!existingLog && !existingMeta) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    // Ownership check: must match req.user._id
    const ownerId = (existingMeta?.user || existingLog?.user)?.toString();
    if (ownerId && ownerId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not own this conversation',
      });
    }

    const updates = { updatedAt: new Date() };

    if (title !== undefined) {
      if (typeof title !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Title must be a string',
        });
      }
      // Strip script/style tags and their contents, then strip remaining HTML tags
      const cleanTitle = title
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
      if (!cleanTitle || cleanTitle.length < 1 || cleanTitle.length > 60) {
        return res.status(400).json({
          success: false,
          message: 'Title must be between 1 and 60 characters',
        });
      }
      updates.title = cleanTitle;
      updates.titleSource = 'user';
    }

    if (pinned !== undefined) {
      if (typeof pinned !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Pinned must be a boolean',
        });
      }
      updates.pinned = pinned;
    }

    let meta = existingMeta;
    if (meta) {
      if (updates.title !== undefined) {
        meta.title = updates.title;
        meta.titleSource = updates.titleSource;
      }
      if (updates.pinned !== undefined) {
        meta.pinned = updates.pinned;
      }
      meta.updatedAt = updates.updatedAt;
      await meta.save();
    } else {
      meta = await ConversationMeta.create({
        conversationId,
        user: req.user._id,
        title: updates.title || 'New Conversation',
        titleSource: updates.titleSource || 'user',
        pinned: updates.pinned ?? false,
        createdAt: existingLog?.createdAt || new Date(),
        updatedAt: updates.updatedAt,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Conversation updated successfully',
      conversation: {
        conversationId: meta.conversationId,
        title: meta.title,
        pinned: meta.pinned,
        titleSource: meta.titleSource,
        updatedAt: meta.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear all conversations for the user
 * @route   DELETE /api/assistant/conversations
 * @access  Private
 */
const clearAllConversationsHandler = async (req, res, next) => {
  try {
    const deletedCount = await clearAllConversations(req.user._id);
    return res.status(200).json({
      success: true,
      deletedCount,
      message: 'All conversations cleared successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit feedback (thumbs up / down)
 * @route   POST /api/assistant/feedback
 * @access  Private
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { messageId, conversationId, rating, comment } = req.body || {};
    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be 1 (thumbs up) or -1 (thumbs down)',
      });
    }

    const recorded = await recordFeedback(
      messageId,
      conversationId,
      req.user._id,
      rating,
      comment
    );

    return res.status(200).json({
      success: recorded,
      message: recorded ? 'Feedback recorded successfully' : 'Could not find message to record feedback',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Escalate unanswered question to College TPO (student only)
 * @route   POST /api/assistant/escalate
 * @access  Private (Student only)
 */
const escalateToTpo = async (req, res, next) => {
  try {
    const scope = await resolveAssistantScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({
        success: false,
        message: scope.errorMessage,
      });
    }

    if (scope.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can escalate inquiries to the college TPO',
      });
    }

    const { question, conversationId } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required for escalation',
      });
    }

    if (!scope.collegeObjId) {
      return res.status(400).json({
        success: false,
        message: 'Student is not affiliated with a valid college placement office',
      });
    }

    // Find TPOs for the college
    const tpoUsers = await User.find({
      college: scope.collegeObjId,
      role: { $in: ['tpo', 'admin'] },
    }).select('_id name email');

    if (!tpoUsers || tpoUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active TPO staff found for your college.',
      });
    }

    const studentName = scope.student?.user?.name || scope.student?.enrollmentNo || 'Student';
    const message = `Student Inquiry from ${studentName}: "${question.trim().slice(0, 150)}"`;

    const notifications = tpoUsers.map((tpo) => ({
      user: tpo._id,
      type: 'general',
      message,
      link: '/admin/students',
    }));

    await Notification.insertMany(notifications);

    return res.status(200).json({
      success: true,
      message: `Your question has been forwarded to ${tpoUsers.length} TPO coordinator(s) at your college.`,
      forwardedCount: tpoUsers.length,
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
      const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id, role);
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
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id, role),
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
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id, role),
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
          dailyUsage: await AiUsage.getUserDailyUsage(req.user._id, role),
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

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id, role);

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

    const dailyUsage = await AiUsage.getUserDailyUsage(req.user._id, scope.role);

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
  streamAssistantChat,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation: deleteConversationHandler,
  clearAllConversations: clearAllConversationsHandler,
  submitFeedback,
  escalateToTpo,
  runAssistantTool,
  getAssistantSuggestions,
};
