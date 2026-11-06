const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    round: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Round',
      required: [true, 'Round reference is required'],
      index: true,
    },
    text: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    options: {
      type: [String],
      required: [true, 'Four options are required'],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length === 4 && val.every((opt) => typeof opt === 'string' && opt.trim().length > 0);
        },
        message: 'Question must have exactly four non-empty options',
      },
    },
    correctIndex: {
      type: Number,
      required: [true, 'Correct option index is required'],
      min: [0, 'Correct option index must be between 0 and 3'],
      max: [3, 'Correct option index must be between 0 and 3'],
    },
    marks: {
      type: Number,
      required: [true, 'Marks value is required'],
      default: 1,
      min: [0.5, 'Marks must be at least 0.5'],
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: [0, 'Negative marks cannot be negative'],
    },
    section: {
      type: String,
      trim: true,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

questionSchema.index({ round: 1, order: 1 });

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;

