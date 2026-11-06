const mongoose = require('mongoose');

const interviewSlotSchema = new mongoose.Schema(
  {
    round: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Round',
      required: [true, 'Round reference is required'],
      index: true,
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
      index: true,
    },
    panel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InterviewPanel',
      required: [true, 'Interview panel reference is required'],
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: [true, 'Application reference is required'],
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    meetingLink: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['scheduled', 'checked_in', 'in_progress', 'completed', 'no_show'],
        message: '{VALUE} is not a valid slot status',
      },
      default: 'scheduled',
      index: true,
    },
    queueNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    reminderSent24h: {
      type: Boolean,
      default: false,
      index: true,
    },
    reminderSent1h: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

interviewSlotSchema.index({ panel: 1, startTime: 1, endTime: 1 });
interviewSlotSchema.index({ student: 1, startTime: 1, endTime: 1 });
interviewSlotSchema.index({ round: 1, student: 1 });

const InterviewSlot = mongoose.model('InterviewSlot', interviewSlotSchema);

module.exports = InterviewSlot;

