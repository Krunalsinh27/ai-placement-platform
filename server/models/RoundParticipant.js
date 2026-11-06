const mongoose = require('mongoose');

const roundParticipantSchema = new mongoose.Schema(
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
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoundBatch',
      default: null,
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
    attendance: {
      type: String,
      enum: {
        values: ['pending', 'present', 'absent'],
        message: '{VALUE} is not a valid attendance status',
      },
      default: 'pending',
    },
    result: {
      type: String,
      enum: {
        values: ['pending', 'cleared', 'rejected'],
        message: '{VALUE} is not a valid result status',
      },
      default: 'pending',
    },
    score: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: a student can only be registered once per round
roundParticipantSchema.index({ round: 1, student: 1 }, { unique: true });
roundParticipantSchema.index({ student: 1, batch: 1 });

const RoundParticipant = mongoose.model('RoundParticipant', roundParticipantSchema);

module.exports = RoundParticipant;

