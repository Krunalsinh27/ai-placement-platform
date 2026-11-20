const mongoose = require('mongoose');
const EmailLog = require('../models/EmailLog');
const { sendRawEmail } = require('./emailService');
const { isRedisConfigured, getRedisClient, getRedisStatus, getBullPrefix } = require('../config/redis');

/**
 * Detect whether an SMTP error is a permanent rejection (e.g. 5xx, invalid address/mailbox)
 */
const isPermanentSmtpError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '');
  const responseCode = String(err.responseCode || '');

  // SMTP 5xx codes indicate permanent delivery failure
  if (responseCode.startsWith('5') || code.startsWith('5') || /\b5\d{2}\b/.test(msg)) {
    return true;
  }

  const permanentPhrases = [
    'address not found',
    'user unknown',
    'mailbox unavailable',
    'mailbox not found',
    'recipient rejected',
    'invalid recipient',
    'no such user',
    'does not exist',
    'domain not found',
    'unrecognized address',
    'relay access denied',
    'blocked domain',
  ];

  return permanentPhrases.some((phrase) => msg.includes(phrase));
};

class EmailQueue {
  constructor() {
    this.queue = []; // In-process queue
    this.isProcessing = false;
    this.delayMs = 50; // Small delay between emails in in-process mode
    this.maxRetries = 3;
    this.senderFn = sendRawEmail;
    this._bullQueue = null;
  }

  isRedisMode() {
    return isRedisConfigured();
  }

  getBullQueue() {
    if (!this.isRedisMode()) return null;
    if (!this._bullQueue) {
      const { Queue } = require('bullmq');
      this._bullQueue = new Queue('emails', {
        connection: getRedisClient(),
        prefix: getBullPrefix(),
      });
      this._bullQueue.on('error', () => {});
    }
    return this._bullQueue;
  }

  async closeBullQueue() {
    if (this._bullQueue) {
      try {
        await this._bullQueue.close();
      } catch (_) {}
      this._bullQueue = null;
    }
  }

  setSenderFunction(fn) {
    this.senderFn = fn;
  }

  resetSenderFunction() {
    this.senderFn = sendRawEmail;
  }

  getSenderFunction() {
    return this.senderFn || sendRawEmail;
  }

  /**
   * Enqueue an email non-blockingly
   */
  async enqueueEmail({
    user,
    recipientEmail,
    recipientName = '',
    type,
    subject,
    htmlBody = '',
    textBody = '',
    attachments = [],
    replyTo = '',
    college = null,
    company = null,
    metadata = {},
  }) {
    try {
      if (!user || !recipientEmail || !subject) {
        console.error('[EmailQueue] Missing required parameters to enqueue email');
        return null;
      }

      // 1. Persist initial EmailLog entry with status 'queued'
      const log = await EmailLog.create({
        user,
        recipientEmail,
        recipientName,
        type,
        subject,
        htmlBody,
        textBody,
        status: 'queued',
        attempts: 0,
        replyTo,
        college,
        company,
        metadata: {
          ...metadata,
          attachments,
        },
      });

      // 2. Dispatch to BullMQ or in-process queue
      if (this.isRedisMode()) {
        try {
          const bullQueue = this.getBullQueue();
          if (bullQueue) {
            const jobId = `email-${log._id.toString()}`;
            let timer;
            const timeoutPromise = new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('BullMQ add timed out after 1500ms')), 1500);
            });
            await Promise.race([
              bullQueue.add(
                'send-email',
                {
                  logId: log._id.toString(),
                  user: user.toString(),
                  recipientEmail,
                  recipientName,
                  type,
                  subject,
                  htmlBody,
                  textBody,
                  attachments,
                  replyTo,
                },
                {
                  jobId,
                  attempts: this.maxRetries,
                  backoff: {
                    type: 'emailBackoff',
                  },
                  removeOnComplete: true,
                }
              ),
              timeoutPromise,
            ]).finally(() => clearTimeout(timer));
          }
        } catch (queueErr) {
          // SECURITY: Never log REDIS_URL. Fall back to in-memory queue so email delivery doesn't stall.
          console.warn('[EmailQueue] Redis/BullMQ unavailable, falling back to in-memory delivery:', queueErr.message || queueErr.name || 'Queue offline');
          this.queue.push({
            logId: log._id,
            user,
            recipientEmail,
            recipientName,
            type,
            subject,
            htmlBody,
            textBody,
            attachments,
            replyTo,
            attempts: 0,
          });
          setImmediate(() => {
            this.processQueue().catch((err) =>
              console.error('[EmailQueue] Error processing queue:', err)
            );
          });
        }
      } else {
        // In-memory queue
        this.queue.push({
          logId: log._id,
          user,
          recipientEmail,
          recipientName,
          type,
          subject,
          htmlBody,
          textBody,
          attachments,
          replyTo,
          attempts: 0,
        });

        setImmediate(() => {
          this.processQueue().catch((err) =>
            console.error('[EmailQueue] Error in worker processing loop:', err)
          );
        });
      }

      return log;
    } catch (error) {
      console.error('[EmailQueue] Error enqueuing email:', error.message);
      return null;
    }
  }

  /**
   * Re-enqueue a failed EmailLog for immediate re-delivery
   */
  async resendFailedEmail(logId) {
    const log = await EmailLog.findById(logId);
    if (!log) throw new Error('Email log record not found');

    log.status = 'queued';
    log.error = null;
    log.attempts = 0;
    await log.save();

    if (this.isRedisMode()) {
      try {
        const bullQueue = this.getBullQueue();
        if (bullQueue) {
          const originalJobId = `email-${log._id.toString()}`;
          try {
            await Promise.race([
              bullQueue.remove(originalJobId),
              new Promise((_, reject) => setTimeout(() => reject(new Error('BullMQ remove timed out')), 800)),
            ]);
          } catch (_) {}

          const jobId = `email-${log._id.toString()}-resend-${Date.now()}`;
          let timer;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('BullMQ add timed out after 1500ms')), 1500);
          });
          await Promise.race([
            bullQueue.add(
              'send-email',
              {
                logId: log._id.toString(),
                user: log.user?.toString(),
                recipientEmail: log.recipientEmail,
                recipientName: log.recipientName,
                type: log.type,
                subject: log.subject,
                htmlBody: log.htmlBody,
                textBody: log.textBody,
                attachments: log.metadata?.attachments || [],
                replyTo: log.replyTo,
              },
              {
                jobId,
                attempts: this.maxRetries,
                backoff: {
                  type: 'emailBackoff',
                },
                removeOnComplete: true,
              }
            ),
            timeoutPromise,
          ]).finally(() => clearTimeout(timer));
        }
      } catch (queueErr) {
        console.warn('[EmailQueue] Redis/BullMQ unavailable for re-send, falling back to in-memory delivery:', queueErr.message || queueErr.name || 'Queue offline');
        this.queue.push({
          logId: log._id,
          user: log.user,
          recipientEmail: log.recipientEmail,
          recipientName: log.recipientName,
          type: log.type,
          subject: log.subject,
          htmlBody: log.htmlBody,
          textBody: log.textBody,
          attachments: log.metadata?.attachments || [],
          replyTo: log.replyTo,
          attempts: 0,
        });

        setImmediate(() => {
          this.processQueue().catch((err) =>
            console.error('[EmailQueue] Error in resend processing loop:', err)
          );
        });
      }
    } else {
      this.queue.push({
        logId: log._id,
        user: log.user,
        recipientEmail: log.recipientEmail,
        recipientName: log.recipientName,
        type: log.type,
        subject: log.subject,
        htmlBody: log.htmlBody,
        textBody: log.textBody,
        attachments: log.metadata?.attachments || [],
        replyTo: log.replyTo,
        attempts: 0,
      });

      setImmediate(() => {
        this.processQueue().catch((err) =>
          console.error('[EmailQueue] Error in resend processing loop:', err)
        );
      });
    }

    return log;
  }

  /**
   * Recover pending EmailLog rows after a restart or periodically.
   * Avoids duplicate jobs by using stable jobId in BullMQ or checking in-process queue.
   * @param {number} olderThanMinutes - Only recover queued rows older than this threshold (default 0 = all)
   */
  async recoverPendingEmails(olderThanMinutes = 0) {
    if (mongoose.connection.readyState !== 1) return 0;

    try {
      const query = { status: 'queued' };
      if (olderThanMinutes > 0) {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
        query.createdAt = { $lte: cutoff };
      }

      const pendingLogs = await EmailLog.find(query).sort({ createdAt: 1 });
      let recoveredCount = 0;

      for (const log of pendingLogs) {
        if (this.isRedisMode()) {
          try {
            const bullQueue = this.getBullQueue();
            if (bullQueue) {
              const jobId = `email-${log._id.toString()}`;
              let getJobTimer;
              const existingJob = await Promise.race([
                bullQueue.getJob(jobId),
                new Promise((_, reject) => {
                  getJobTimer = setTimeout(() => reject(new Error('BullMQ getJob timed out')), 800);
                }),
              ]).finally(() => clearTimeout(getJobTimer));

              if (!existingJob) {
                let addTimer;
                await Promise.race([
                  bullQueue.add(
                    'send-email',
                    {
                      logId: log._id.toString(),
                      user: log.user?.toString(),
                      recipientEmail: log.recipientEmail,
                      recipientName: log.recipientName,
                      type: log.type,
                      subject: log.subject,
                      htmlBody: log.htmlBody,
                      textBody: log.textBody,
                      attachments: log.metadata?.attachments || [],
                      replyTo: log.replyTo,
                    },
                    {
                      jobId,
                      attempts: this.maxRetries,
                      backoff: {
                        type: 'emailBackoff',
                      },
                      removeOnComplete: true,
                    }
                  ),
                  new Promise((_, reject) => {
                    addTimer = setTimeout(() => reject(new Error('BullMQ add timed out')), 1500);
                  }),
                ]).finally(() => clearTimeout(addTimer));
                recoveredCount++;
              }
            }
          } catch (bullErr) {
            console.error('[EmailQueue] Failed to recover job to BullMQ:', bullErr.message);
          }
        } else {
          const alreadyQueued = this.queue.some(
            (item) => item.logId?.toString() === log._id.toString()
          );
          if (!alreadyQueued) {
            this.queue.push({
              logId: log._id,
              user: log.user,
              recipientEmail: log.recipientEmail,
              recipientName: log.recipientName,
              type: log.type,
              subject: log.subject,
              htmlBody: log.htmlBody,
              textBody: log.textBody,
              attachments: log.metadata?.attachments || [],
              replyTo: log.replyTo,
              attempts: log.attempts || 0,
            });
            recoveredCount++;
          }
        }
      }

      if (!this.isRedisMode() && recoveredCount > 0) {
        setImmediate(() => {
          this.processQueue().catch((err) =>
            console.error('[EmailQueue] Error processing recovered queue:', err)
          );
        });
      }

      if (recoveredCount > 0) {
        console.log(`[EmailQueue] Recovered ${recoveredCount} pending email(s)${olderThanMinutes > 0 ? ` older than ${olderThanMinutes}m` : ''}.`);
      }

      return recoveredCount;
    } catch (err) {
      console.error('[EmailQueue] Error recovering pending emails:', err.message);
      return 0;
    }
  }

  /**
   * Start periodic recovery timer (runs every 5m recovering queued rows older than 2m)
   */
  startPeriodicRecovery(intervalMinutes = 5, olderThanMinutes = 2) {
    if (this._periodicTimer) return;
    this._periodicTimer = setInterval(() => {
      this.recoverPendingEmails(olderThanMinutes).catch((err) => {
        console.error('[EmailQueue] Error in periodic recovery:', err.message);
      });
    }, intervalMinutes * 60 * 1000);
    this._periodicTimer.unref();
  }

  stopPeriodicRecovery() {
    if (this._periodicTimer) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = null;
    }
  }

  /**
   * Return job counts for health reporting: { waiting, active, failed }
   */
  async getJobCounts() {
    if (this.isRedisMode() && getRedisStatus() === 'connected') {
      const bullQueue = this.getBullQueue();
      if (bullQueue) {
        try {
          let timer;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('BullMQ getJobCounts timed out after 800ms')), 800);
          });
          const counts = await Promise.race([
            bullQueue.getJobCounts('waiting', 'active', 'failed'),
            timeoutPromise,
          ]).finally(() => clearTimeout(timer));

          return {
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            failed: counts.failed || 0,
          };
        } catch (_) {}
      }
    }

    return {
      waiting: this.queue.length,
      active: this.isProcessing ? 1 : 0,
      failed: 0,
    };
  }

  /**
   * In-Process Background Queue Worker Loop (used when Redis is unset)
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (mongoose.connection.readyState !== 1) {
        this.isProcessing = false;
        return;
      }
      const item = this.queue.shift();

      // Delay between sends
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }

      item.attempts += 1;

      try {
        const result = await this.senderFn({
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
              attempts: item.attempts,
              error: null,
            });
          }
        } else {
          throw new Error(result?.error || 'Email dispatch failed');
        }
      } catch (err) {
        if (mongoose.connection.readyState !== 1) {
          this.isProcessing = false;
          return;
        }

        console.error(
          `[EmailQueue] Send attempt ${item.attempts} failed for ${item.recipientEmail}:`,
          err.message
        );

        const isPermanent = isPermanentSmtpError(err);

        if (isPermanent) {
          console.error(
            `[EmailQueue] Permanent failure for ${item.recipientEmail}: ${err.message}. Marking failed without retries.`
          );
          if (mongoose.connection.readyState === 1) {
            await EmailLog.findByIdAndUpdate(item.logId, {
              status: 'failed',
              attempts: item.attempts,
              error: `Permanent failure: ${err.message}`,
            });
          }
          // Do not retry permanent errors
          continue;
        }

        // Temporary error: retry up to maxRetries (3) with growing delay (1s, 5s, 30s in prod; fast in test)
        if (item.attempts < this.maxRetries) {
          const delays = process.env.NODE_ENV === 'test' ? [50, 100, 200] : [1000, 5000, 30000];
          const delay = delays[item.attempts - 1] || 30000;

          if (mongoose.connection.readyState === 1) {
            await EmailLog.findByIdAndUpdate(item.logId, {
              attempts: item.attempts,
              error: `Attempt ${item.attempts} failed (temporary): ${err.message}. Retrying in ${delay / 1000}s`,
            });
          }

          const waitMs = this.delayMs === 0 ? 0 : delay;
          if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
          this.queue.push(item);
        } else {
          // Max retries reached, mark failed
          if (mongoose.connection.readyState === 1) {
            await EmailLog.findByIdAndUpdate(item.logId, {
              status: 'failed',
              attempts: item.attempts,
              error: `Failed after ${item.attempts} attempts: ${err.message}`,
            });
          }
        }
      }
    }

    this.isProcessing = false;
  }

  async close() {
    this.stopPeriodicRecovery();
    if (this._bullQueue) {
      try {
        await this._bullQueue.close();
      } catch (_) {}
      this._bullQueue = null;
    }
  }
}

const emailQueue = new EmailQueue();
emailQueue.isPermanentSmtpError = isPermanentSmtpError;
module.exports = emailQueue;
