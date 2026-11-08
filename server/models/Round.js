const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema(
  {
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Round name is required'],
      trim: true,
    },
    order: {
      type: Number,
      required: [true, 'Round order sequence number is required'],
      min: [1, 'Round order must be at least 1'],
    },
    type: {
      type: String,
      enum: {
        values: [
          'aptitude',
          'coding',
          'technical',
          'hr',
          'group_discussion',
          'pre_placement_talk',
        ],
        message: '{VALUE} is not a valid round type',
      },
      required: [true, 'Round type is required'],
      default: 'technical',
    },
    date: {
      type: Date,
      default: null,
    },
    mode: {
      type: String,
      enum: {
        values: ['online', 'offline', ''],
        message: '{VALUE} is not a valid round mode',
      },
      default: '',
    },
    deliveryMode: {
      type: String,
      enum: {
        values: ['platform_test', 'online_external', 'offline_campus', ''],
        message: '{VALUE} is not a valid delivery mode',
      },
      default: '',
      index: true,
    },
    testWindowStart: {
      type: Date,
      default: null,
    },
    testWindowEnd: {
      type: Date,
      default: null,
    },
    reportByTime: {
      type: String,
      trim: true,
      default: '',
    },
    durationMinutes: {
      type: Number,
      default: null,
    },
    venueOrLink: {
      type: String,
      trim: true,
      default: '',
    },
    cutoffScore: {
      type: Number,
      default: null,
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    evaluationCriteria: {
      type: [String],
      default: ['technical', 'problemSolving', 'communication'],
    },
    slotDurationMinutes: {
      type: Number,
      default: 30,
      min: [5, 'Slot duration must be at least 5 minutes'],
    },
    // Aptitude Platform Test Settings
    shuffleQuestions: {
      type: Boolean,
      default: true,
    },
    shuffleOptions: {
      type: Boolean,
      default: false,
    },
    negativeMarking: {
      type: Boolean,
      default: false,
    },
    showScoreToStudents: {
      type: Boolean,
      default: false,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    questionCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    resultsPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index on drive and order
roundSchema.index({ drive: 1, order: 1 });
roundSchema.index({ drive: 1, status: 1 });
roundSchema.index({ deliveryMode: 1, testWindowEnd: 1 });

const Round = mongoose.model('Round', roundSchema);

module.exports = Round;

