const mongoose = require('mongoose');
const { Worker, UnrecoverableError } = require('bullmq');
const EmailLog = require('../models/EmailLog');
const { isRedisConfigured, createRedisClient } = require('../config/redis');
const emailQueue = require('./emailQueue');
const { processDrivePublishedBatch } = require('./notificationService');
const { executeCronJob } = require('./cronJobs');

let emailWorker = null;
let notificationWorker = null;
let cronWorker = null;

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
        settings: {
          backoffStrategies: {
            emailBackoff(attemptsMade) {
              const delays =
                process.env.NODE_ENV === 'test' ? [50, 100, 200] : [1000, 5000, 30000];
              return delays[attemptsMade - 1] || 30000;
            },
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
      }
    );

    cronWorker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[CronWorker] Worker error:', err.message);
      }
    });
  }

  return { emailWorker, notificationWorker, cronWorker };
};

/**
 * Gracefully close all active queue workers, waiting for in-flight jobs to complete
 */
const closeQueueWorkers = async () => {
  const workers = [emailWorker, notificationWorker, cronWorker].filter(Boolean);
  emailWorker = null;
  notificationWorker = null;
  cronWorker = null;

  await Promise.allSettled(workers.map((w) => w.close()));
};

const getQueueWorkers = () => ({
  emailWorker,
  notificationWorker,
  cronWorker,
});

module.exports = {
  startQueueWorkers,
  closeQueueWorkers,
  getQueueWorkers,
};

