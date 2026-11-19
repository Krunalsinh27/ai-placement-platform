const mongoose = require('mongoose');

/**
 * Subdocument schema for individual mock interview questions
 */
const questionSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      enum: ['technical', 'hr', 'behavioral', 'cs_fundamentals', 'system_design'],
      default: 'technical',
    },
    competency: {
      type: String,
      trim: true,
      default: '',
    },
    expectedKeywords: [
      {
        type: String,
        trim: true,
      },
    ],
    idealAnswerGuidelines: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

/**
 * Subdocument schema for candidate answers and evaluation results
 */
const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    score: {
      correctness: { type: Number, default: 0, min: 0, max: 100 },
      clarity: { type: Number, default: 0, min: 0, max: 100 },
      depth: { type: Number, default: 0, min: 0, max: 100 },
      structure: { type: Number, default: 0, min: 0, max: 100 },
      overall: { type: Number, default: 0, min: 0, max: 100 },
    },
    feedback: {
      type: String,
      trim: true,
      default: '',
    },
    sampleAnswer: {
      type: String,
      trim: true,
      default: '',
    },
    starEvaluation: {
      situation: { type: Boolean, default: false },
      task: { type: Boolean, default: false },
      action: { type: Boolean, default: false },
      result: { type: Boolean, default: false },
      comment: { type: String, default: '' },
    },
    answeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/**
 * MockInterviewSession Schema
 * Tracks student mock interview questions, candidate responses,
 * multi-dimensional AI scoring, and personalized 7-day study roadmaps.
 */
const mockInterviewSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      index: true,
    },
    targetRole: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    targetDrive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      default: null,
    },
    type: {
      type: String,
      enum: ['technical', 'hr', 'behavioral', 'mixed'],
      default: 'mixed',
      required: true,
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'intermediate',
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
    currentQuestionIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalQuestions: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
    },
    questions: [questionSchema],
    answers: [answerSchema],
    scores: {
      overall: { type: Number, default: 0, min: 0, max: 100 },
      correctness: { type: Number, default: 0, min: 0, max: 100 },
      clarity: { type: Number, default: 0, min: 0, max: 100 },
      depth: { type: Number, default: 0, min: 0, max: 100 },
      structure: { type: Number, default: 0, min: 0, max: 100 },
    },
    feedback: {
      summary: { type: String, default: '' },
      strengths: [{ type: String }],
      weaknesses: [{ type: String }],
      improvementPlan: [
        {
          day: { type: Number, min: 1, max: 7 },
          title: { type: String, default: '' },
          focus: { type: String, default: '' },
          tasks: [{ type: String }],
        },
      ],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for performant lookups and analytics
mockInterviewSessionSchema.index({ student: 1, createdAt: -1 });
mockInterviewSessionSchema.index({ college: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('MockInterviewSession', mockInterviewSessionSchema);
