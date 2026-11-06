const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema(
  {
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InterviewSlot',
      required: [true, 'Interview slot reference is required'],
      unique: true,
      index: true,
    },
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
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    evaluator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Evaluator user is required'],
    },
    evaluatorName: {
      type: String,
      trim: true,
      default: '',
    },
    criteriaScores: {
      technical: {
        type: Number,
        required: [true, 'Technical score is required'],
        min: [1, 'Technical score must be at least 1'],
        max: [5, 'Technical score cannot exceed 5'],
      },
      problemSolving: {
        type: Number,
        required: [true, 'Problem solving score is required'],
        min: [1, 'Problem solving score must be at least 1'],
        max: [5, 'Problem solving score cannot exceed 5'],
      },
      communication: {
        type: Number,
        required: [true, 'Communication score is required'],
        min: [1, 'Communication score must be at least 1'],
        max: [5, 'Communication score cannot exceed 5'],
      },
    },
    score: {
      type: Number,
      default: null,
    },
    comments: {
      type: String,
      trim: true,
      default: '',
    },
    recommendation: {
      type: String,
      enum: {
        values: ['strong_hire', 'hire', 'hold', 'reject'],
        message: '{VALUE} is not a valid recommendation',
      },
      required: [true, 'Recommendation is required'],
    },
    sharedWithStudent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

evaluationSchema.index({ round: 1, student: 1 });

const Evaluation = mongoose.model('Evaluation', evaluationSchema);

module.exports = Evaluation;

