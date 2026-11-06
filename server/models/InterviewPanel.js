const mongoose = require('mongoose');

const interviewerSubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Interviewer name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Interviewer email is required'],
      trim: true,
      lowercase: true,
    },
  },
  { _id: true }
);

const interviewPanelSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: [true, 'Panel name is required'],
      trim: true,
    },
    interviewers: {
      type: [interviewerSubSchema],
      default: [],
    },
    venueOrLink: {
      type: String,
      trim: true,
      default: '',
    },
    room: {
      type: String,
      trim: true,
      default: '',
    },
    capacity: {
      type: Number,
      default: 1,
      min: [1, 'Panel capacity must be at least 1'],
    },
  },
  {
    timestamps: true,
  }
);

interviewPanelSchema.index({ round: 1, name: 1 });

const InterviewPanel = mongoose.model('InterviewPanel', interviewPanelSchema);

module.exports = InterviewPanel;

