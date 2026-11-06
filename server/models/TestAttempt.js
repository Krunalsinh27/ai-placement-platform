const mongoose = require('mongoose');

const testAnswerSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    selectedIndex: {
      type: Number,
      default: null, // null means not answered / skipped
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const testAttemptSchema = new mongoose.Schema(
  {
    round: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Round',
      required: [true, 'Round reference is required'],
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
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    deadlineAt: {
      type: Date,
      required: [true, 'Deadline timestamp is required'],
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    answers: [testAnswerSchema],
    score: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: {
        values: ['in_progress', 'submitted', 'auto_submitted', 'expired'],
        message: '{VALUE} is not a valid attempt status',
      },
      default: 'in_progress',
      index: true,
    },
    tabSwitchCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    questionOrder: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    shuffleSeed: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

testAttemptSchema.index({ round: 1, student: 1 });

const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);

module.exports = TestAttempt;

