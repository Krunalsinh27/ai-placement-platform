const mongoose = require('mongoose');

const roundBatchSchema = new mongoose.Schema(
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
    batchName: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    venueOrLink: {
      type: String,
      required: [true, 'Venue or meeting link is required'],
      trim: true,
    },
    capacity: {
      type: Number,
      default: 50,
      min: [1, 'Capacity must be at least 1'],
    },
    mode: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline',
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

// Indexes for clash detection & schedule queries
roundBatchSchema.index({ drive: 1, startTime: 1 });
roundBatchSchema.index({ venueOrLink: 1, startTime: 1, endTime: 1 });

const RoundBatch = mongoose.model('RoundBatch', roundBatchSchema);

module.exports = RoundBatch;

