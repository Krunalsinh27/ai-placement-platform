/**
 * Mock Interview Controller
 * Endpoints for student mock interview lifecycle and TPO aggregated analytics.
 */

const { mockInterviewService } = require('../services/mockInterview/mockInterviewService');
const { AiUsage } = require('../models');

/**
 * @desc    Start a new mock interview session
 * @route   POST /api/students/me/mock-interviews
 * @access  Private (Student only)
 */
const startSession = async (req, res, next) => {
  try {
    const { role, driveId, difficulty, type, questionCount } = req.body;

    const result = await mockInterviewService.startSession({
      studentUserId: req.user._id,
      role,
      driveId,
      difficulty,
      type,
      questionCount,
    });

    res.status(201).json({
      success: true,
      session: result.session,
      quota: result.quota,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit an answer to a question in the session
 * @route   POST /api/students/me/mock-interviews/:id/answers
 * @access  Private (Student only)
 */
const submitAnswer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { questionIndex, answer } = req.body;

    const result = await mockInterviewService.submitAnswer({
      sessionId: id,
      studentUserId: req.user._id,
      questionIndex,
      answer,
    });

    res.status(200).json({
      success: true,
      evaluation: result.evaluation,
      session: result.session,
      isCompleted: result.isCompleted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get details and progress/report of a mock interview session
 * @route   GET /api/students/me/mock-interviews/:id
 * @access  Private (Student only)
 */
const getSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await mockInterviewService.getSessionReport({
      sessionId: id,
      studentUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List past mock interview sessions for current student
 * @route   GET /api/students/me/mock-interviews
 * @access  Private (Student only)
 */
const listSessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const result = await mockInterviewService.listStudentSessions({
      studentUserId: req.user._id,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Permanently delete a mock interview session
 * @route   DELETE /api/students/me/mock-interviews/:id
 * @access  Private (Student only)
 */
const deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await mockInterviewService.deleteStudentSession({
      sessionId: id,
      studentUserId: req.user._id,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get student's daily mock interview quota status
 * @route   GET /api/students/me/mock-interviews/quota
 * @access  Private (Student only)
 */
const getQuota = async (req, res, next) => {
  try {
    const usage = await AiUsage.getUserDailyUsage(req.user._id, 'student');

    res.status(200).json({
      success: true,
      quota: usage.mock,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get aggregated, anonymized college-level mock interview analytics for TPO
 * @route   GET /api/admin/mock-interviews/analytics
 * @access  Private (TPO / Admin / Superadmin)
 */
const getCollegeAnalytics = async (req, res, next) => {
  try {
    let collegeId = req.user.college?._id || req.user.college;

    if (req.user.role === 'superadmin' && req.query.collegeId) {
      collegeId = req.query.collegeId;
    }

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        message: 'No associated college found for user',
      });
    }

    const analytics = await mockInterviewService.getCollegeAnalytics({ collegeId });

    res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startSession,
  submitAnswer,
  getSession,
  listSessions,
  deleteSession,
  getQuota,
  getCollegeAnalytics,
};
