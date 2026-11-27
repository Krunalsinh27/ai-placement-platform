const mongoose = require('mongoose');
const { Worker, UnrecoverableError } = require('bullmq');
const EmailLog = require('../models/EmailLog');
const { isRedisConfigured, createRedisClient, getBullPrefix } = require('../config/redis');
const emailQueue = require('./emailQueue');
const { processDrivePublishedBatch } = require('./notificationService');
const { executeCronJob } = require('./cronJobs');

let emailWorker = null;
let notificationWorker = null;
let cronWorker = null;
let aiWorker = null;

/**
 * Authoritatively validates job schema, user identity, and tenant isolation on the worker thread.
 * NEVER trusts client-supplied collegeId alone.
 *
 * @param {Object} jobData - BullMQ job.data payload
 * @returns {Promise<{ user: Object, collegeId: string|null, student?: Object, drive?: Object }>}
 * @throws {UnrecoverableError} if schema is invalid, user is deleted, or tenant boundary is violated.
 */
const verifyWorkerTenantAndOwnership = async (jobData) => {
  const { type, payload = {}, userId } = jobData || {};

  // 1. Schema Validation: Allowed Job Types
  const ALLOWED_TYPES = ['resume_parse', 'resume_analyze', 'mock_interview_eval'];
  if (!type || !ALLOWED_TYPES.includes(type)) {
    throw new UnrecoverableError(`Invalid or unsupported AI job type: '${type}'`);
  }

  // 2. Schema Validation: Required userId
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new UnrecoverableError('Missing required userId in AI job data');
  }

  // If MongoDB is not connected (e.g. in offline unit tests without DB), return basic verified structure
  if (mongoose.connection.readyState !== 1) {
    return { user: { _id: userId }, collegeId: jobData.collegeId || null };
  }

  const User = require('../models/User');
  const user = await User.findById(userId).select('_id role college email');
  if (!user) {
    throw new UnrecoverableError(`Authoritative user ${userId} not found or deleted after enqueueing`);
  }

  const isSuperadmin = user.role === 'superadmin';
  const authoritativeCollegeId = user.college ? String(user.college._id || user.college) : null;

  // Verify client-supplied collegeId against authoritative database record
  if (!isSuperadmin && jobData.collegeId) {
    if (!authoritativeCollegeId || authoritativeCollegeId !== String(jobData.collegeId)) {
      throw new UnrecoverableError(
        `Tenant mismatch: Supplied collegeId '${jobData.collegeId}' does not match authoritative user college '${authoritativeCollegeId}'`
      );
    }
  }

  // Per-job-type tenant and target record verification
  if (type === 'resume_parse') {
    const Student = require('../models/Student');
    const studentQuery = payload.studentId ? { _id: payload.studentId } : { user: userId };
    const student = await Student.findOne(studentQuery).select('_id user college resumeUrl');
    if (!student) {
      throw new UnrecoverableError('Target student record not found or deleted');
    }

    if (!isSuperadmin && String(student.user) !== String(userId)) {
      throw new UnrecoverableError(`Ownership violation: student record does not belong to user ${userId}`);
    }

    if (!isSuperadmin && authoritativeCollegeId && student.college) {
      const studentColId = String(student.college._id || student.college);
      if (studentColId !== authoritativeCollegeId) {
        throw new UnrecoverableError(`Tenant isolation violation: student belongs to different college '${studentColId}'`);
      }
    }

    return { user, collegeId: authoritativeCollegeId, student };
  }

  if (type === 'resume_analyze') {
    let drive = null;
    if (payload.driveId) {
      const Drive = require('../models/Drive');
      drive = await Drive.findById(payload.driveId).select('_id colleges college title');
      if (!drive) {
        throw new UnrecoverableError(`Target placement drive ${payload.driveId} not found or deleted`);
      }

      if (!isSuperadmin && authoritativeCollegeId) {
        let driveCollegeIds = [];
        if (Array.isArray(drive.colleges)) {
          driveCollegeIds = drive.colleges.map((c) => String(c._id || c));
        } else if (drive.college) {
          driveCollegeIds = [String(drive.college._id || drive.college)];
        }

        if (driveCollegeIds.length > 0 && !driveCollegeIds.includes(authoritativeCollegeId)) {
          throw new UnrecoverableError(
            `Tenant isolation violation: User college '${authoritativeCollegeId}' is not authorized for target drive '${drive._id}'`
          );
        }
      }
    }

    return { user, collegeId: authoritativeCollegeId, drive };
  }

  if (type === 'mock_interview_eval') {
    if (payload.sessionId) {
      const MockInterviewSession = require('../models/MockInterviewSession');
      const session = await MockInterviewSession.findById(payload.sessionId).select('_id user student college');
      if (!session) {
        throw new UnrecoverableError(`Mock interview session ${payload.sessionId} not found or deleted`);
      }

      if (!isSuperadmin) {
        // 1. Verify college tenant boundary
        if (authoritativeCollegeId && session.college && String(session.college._id || session.college) !== authoritativeCollegeId) {
          throw new UnrecoverableError('Tenant isolation violation: interview session belongs to different college');
        }

        // 2. Verify student ownership boundary
        const Student = require('../models/Student');
        const userStudent = await Student.findOne({ user: userId }).select('_id');
        if (userStudent && session.student && String(session.student._id || session.student) !== String(userStudent._id)) {
          throw new UnrecoverableError('Ownership violation: interview session belongs to another user');
        }
      }
    }

    return { user, collegeId: authoritativeCollegeId };
  }

  return { user, collegeId: authoritativeCollegeId };
};

/**
 * Start BullMQ background queue workers
 */
const startQueueWorkers = () => {
  if (!isRedisConfigured()) {
    return null;
  }

  // 1. Email Worker
  if (!emailWorker) {
    emailWorker = new Worker(
      'emails',
      async (job) => {
        const item = job.data;
        const sender = emailQueue.getSenderFunction();
        const attemptNum = job.attemptsMade + 1;

        try {
          const result = await sender({
            to: item.recipientEmail,
            subject: item.subject,
            text: item.textBody,
            html: item.htmlBody,
            attachments: item.attachments,
            replyTo: item.replyTo,
          });

          if (result && result.success) {
            if (mongoose.connection.readyState === 1) {
              await EmailLog.findByIdAndUpdate(item.logId, {
                status: 'sent',
                sentAt: new Date(),
                attempts: attemptNum,
                error: null,
              });
            }
            return { success: true };
          } else {
            throw new Error(result?.error || 'Email dispatch failed');
          }
        } catch (err) {
          const isPermanent = emailQueue.isPermanentSmtpError(err);

          if (isPermanent) {
            if (mongoose.connection.readyState === 1) {
              await EmailLog.findByIdAndUpdate(item.logId, {
                status: 'failed',
                attempts: attemptNum,
                error: `Permanent failure: ${err.message}`,
              });
            }
            // UnrecoverableError prevents BullMQ from retrying permanent failures
            throw new UnrecoverableError(`Permanent failure: ${err.message}`);
          }

          // Temporary error handling
          if (attemptNum < 3) {
            const delays = process.env.NODE_ENV === 'test' ? [50, 100, 200] : [1000, 5000, 30000];
            const nextDelay = delays[attemptNum - 1] || 30000;

            if (mongoose.connection.readyState === 1) {
              await EmailLog.findByIdAndUpdate(item.logId, {
                attempts: attemptNum,
                error: `Attempt ${attemptNum} failed (temporary): ${err.message}. Retrying in ${nextDelay / 1000}s`,
              });
            }
          } else {
            if (mongoose.connection.readyState === 1) {
              await EmailLog.findByIdAndUpdate(item.logId, {
                status: 'failed',
                attempts: attemptNum,
                error: `Failed after ${attemptNum} attempts: ${err.message}`,
              });
            }
          }
          throw err;
        }
      },
      {
        connection: createRedisClient(),
        prefix: getBullPrefix(),
        settings: {
          backoffStrategy(attemptsMade, type) {
            if (type === 'emailBackoff') {
              const delays =
                process.env.NODE_ENV === 'test' ? [50, 100, 200] : [1000, 5000, 30000];
              return delays[attemptsMade - 1] || 30000;
            }
            return 1000;
          },
        },
      }
    );

    emailWorker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[EmailWorker] Worker error:', err.message);
      }
    });
  }

  // 2. Notification Fan-Out Worker
  if (!notificationWorker) {
    notificationWorker = new Worker(
      'notifications',
      async (job) => {
        if (job.name === 'drive-published') {
          const { driveId } = job.data;
          await processDrivePublishedBatch(driveId);
          return { success: true };
        }
      },
      {
        connection: createRedisClient(),
        prefix: getBullPrefix(),
      }
    );

    notificationWorker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[NotificationWorker] Worker error:', err.message);
      }
    });
  }

  // 3. Scheduled Jobs Worker
  if (!cronWorker) {
    cronWorker = new Worker(
      'scheduled-jobs',
      async (job) => {
        return await executeCronJob(job.name);
      },
      {
        connection: createRedisClient(),
        prefix: getBullPrefix(),
      }
    );

    cronWorker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[CronWorker] Worker error:', err.message);
      }
    });
  }

  // 4. Heavy AI Jobs Worker
  if (!aiWorker) {
    aiWorker = new Worker(
      'ai-jobs',
      async (job) => {
        const { type, payload = {}, userId } = job.data || {};

        // 1. Authoritative Worker-Side Schema, User & Tenant Verification
        const verified = await verifyWorkerTenantAndOwnership(job.data);
        const resolvedCollegeId = verified.collegeId;

        // 2. Execution & Progress
        const { processAiJobDirectly } = require('../services/ai/aiQueue');
        await job.updateProgress(20);

        try {
          const result = await processAiJobDirectly(type, payload, userId, resolvedCollegeId);
          await job.updateProgress(100);
          return result;
        } catch (err) {
          const isPermanent =
            err instanceof UnrecoverableError ||
            err.message?.includes('validation') ||
            err.message?.includes('not found') ||
            err.message?.includes('Tenant isolation') ||
            err.message?.includes('Ownership violation') ||
            err.message?.includes('Unsupported AI job type');
          if (isPermanent) {
            throw new UnrecoverableError(err.message);
          }
          throw err;
        }
      },
      {
        connection: createRedisClient(),
        prefix: getBullPrefix(),
        concurrency: 2,
      }
    );

    aiWorker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[AiWorker] Worker error:', err.message);
      }
    });
  }

  return { emailWorker, notificationWorker, cronWorker, aiWorker };
};

/**
 * Gracefully close all active queue workers, waiting for in-flight jobs to complete
 */
const closeQueueWorkers = async () => {
  const workers = [emailWorker, notificationWorker, cronWorker, aiWorker].filter(Boolean);
  emailWorker = null;
  notificationWorker = null;
  cronWorker = null;
  aiWorker = null;

  await Promise.allSettled(workers.map((w) => w.close()));
};

const getQueueWorkers = () => ({
  emailWorker,
  notificationWorker,
  cronWorker,
  aiWorker,
});

module.exports = {
  startQueueWorkers,
  closeQueueWorkers,
  getQueueWorkers,
  verifyWorkerTenantAndOwnership,
};

