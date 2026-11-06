const mongoose = require('mongoose');

const comparisonSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Comparison name is required'],
    trim: true,
  },
  colleges: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Enforce max 3 colleges per saved comparison
comparisonSchema.path('colleges').validate(function (val) {
  return val && val.length <= 3;
}, 'Comparison cannot have more than 3 colleges');

const aspirantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    state: {
      type: String,
      trim: true,
      default: '',
    },
    interestedBranches: [
      {
        type: String,
        trim: true,
      },
    ],
    twelfthStream: {
      type: String,
      trim: true,
      default: '',
    },
    shortlistedColleges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
      },
    ],
    savedComparisons: [comparisonSchema],
  },
  {
    timestamps: true,
  }
);

const Aspirant = mongoose.model('Aspirant', aspirantSchema);

module.exports = Aspirant;

