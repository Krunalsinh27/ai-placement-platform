const mongoose = require('mongoose');
const EmailLog = require('../models/EmailLog');
const { sendRawEmail } = require('./emailService');

class EmailQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.delayMs = 50; // Small delay between emails
    this.maxRetries = 3;
    this.senderFn = sendRawEmail;
  }

  setSenderFunction(fn) {
    this.senderFn = fn;
  }

  resetSenderFunction() {
    this.senderFn = sendRawEmail;
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
        metadata,
      });

      // 2. Add to in-memory queue
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

      // 3. Trigger processing asynchronously without blocking caller request
      setImmediate(() => {
        this.processQueue().catch((err) =>
          console.error('[EmailQueue] Error in worker processing loop:', err)
        );
      });

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
    await log.save();

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

    return log;
  }

  /**
   * Background Queue Worker Loop
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

        if (item.attempts < this.maxRetries) {
          // Re-queue for next attempt
          if (mongoose.connection.readyState === 1) {
            await EmailLog.findByIdAndUpdate(item.logId, {
              attempts: item.attempts,
              error: `Attempt ${item.attempts} failed: ${err.message}`,
            });
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
}

const emailQueue = new EmailQueue();
module.exports = emailQueue;
