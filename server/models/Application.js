const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['applied', 'shortlisted', 'interview', 'selected', 'rejected'],
        message:
          '{VALUE} is not a valid status. Allowed: applied, shortlisted, interview, selected, rejected',
      },
      default: 'applied',
    },
    appliedOn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: a student can only apply once to a specific drive
applicationSchema.index({ student: 1, drive: 1 }, { unique: true });

const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;

