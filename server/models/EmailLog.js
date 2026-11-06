const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required'],
      trim: true,
      lowercase: true,
    },
    recipientName: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      required: [true, 'Email type is required'],
      index: true,
      enum: [
        'drive_published',
        'round_scheduled',
        'slot_assigned',
        'slot_reminder_24h',
        'slot_reminder_1h',
        'batch_reminder_24h',
        'batch_reminder_1h',
        'called_next',
        'result_declared',
        'offer_received',
        'offer_expiring_48h',
        'announcement',
        'schedule_updated',
        'verification_otp',
        'password_reset',
        'status_change',
        'drive_request',
        'request_response',
        'new_applicant',
        'interview_schedule',
        'general_notification',
      ],
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    htmlBody: {
      type: String,
      default: '',
    },
    textBody: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    replyTo: {
      type: String,
      trim: true,
      default: '',
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

emailLogSchema.index({ college: 1, createdAt: -1 });
emailLogSchema.index({ status: 1, attempts: 1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;
