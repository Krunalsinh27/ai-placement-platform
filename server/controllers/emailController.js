const mongoose = require('mongoose');
const { EmailLog, User, College } = require('../models');
const emailQueue = require('../utils/emailQueue');

/**
 * Get email logs for the logged-in TPO's college
 * @route GET /api/emails/logs (or GET /api/colleges/my/email-logs)
 * @access Private (TPO, Admin, Superadmin)
 */
const getCollegeEmailLogs = async (req, res, next) => {
  try {
    let collegeId = null;

    if (req.user.role === 'superadmin') {
      collegeId = req.query.collegeId || null;
    } else if (req.user.role === 'tpo' || req.user.role === 'admin') {
      collegeId = (req.user.college?._id || req.user.college)?.toString();
      if (!collegeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: No college associated with your TPO profile',
        });
      }

      // If user specifically requested another collegeId in query, reject with 403
      if (req.query.collegeId && req.query.collegeId !== collegeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You can only view email communications for your own college',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Only college TPOs and administrators can view email logs',
      });
    }

    const query = {};
    if (collegeId) {
      query.college = collegeId;
    }

    // Filter by status (sent, failed, queued)
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    // Filter by email type
    if (req.query.type && req.query.type !== 'all') {
      query.type = req.query.type;
    }

    // Search by recipient email or subject
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [{ recipientEmail: searchRegex }, { subject: searchRegex }, { recipientName: searchRegex }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      EmailLog.find(query)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      EmailLog.countDocuments(query),
    ]);

    // Statistics counts
    const statusCounts = await EmailLog.aggregate([
      { $match: collegeId ? { college: new mongoose.Types.ObjectId(collegeId) } : {} },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const stats = { sent: 0, failed: 0, queued: 0 };
    statusCounts.forEach((sc) => {
      if (stats[sc._id] !== undefined) stats[sc._id] = sc.count;
    });

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      stats,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend a failed email log
 * @route POST /api/emails/logs/:id/resend (or POST /api/colleges/my/email-logs/:id/resend)
 * @access Private (TPO, Admin, Superadmin)
 */
const resendFailedEmail = async (req, res, next) => {
  try {
    const log = await EmailLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Email log not found' });
    }

    // Access control: TPO can only resend emails for their own college
    if (req.user.role === 'tpo' || req.user.role === 'admin') {
      const userCollegeId = (req.user.college?._id || req.user.college)?.toString();
      const logCollegeId = log.college?.toString();

      if (!userCollegeId || !logCollegeId || userCollegeId !== logCollegeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: You can only resend emails for your own college',
        });
      }
    } else if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updatedLog = await emailQueue.resendFailedEmail(log._id);

    res.status(200).json({
      success: true,
      message: `Email to ${log.recipientEmail} queued for re-delivery.`,
      log: updatedLog,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCollegeEmailLogs,
  resendFailedEmail,
};

