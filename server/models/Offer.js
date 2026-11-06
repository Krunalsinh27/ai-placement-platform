const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      required: [true, 'Drive reference is required'],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
      index: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College reference is required'],
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
    packageLpa: {
      type: Number,
      required: [true, 'Package (LPA) is required'],
      min: [0, 'Package (LPA) cannot be negative'],
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    expiryDate: {
      type: Date,
      required: [true, 'Offer expiry date is required'],
    },
    role: {
      type: String,
      trim: true,
      default: '',
    },
    designation: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['offered', 'accepted', 'declined', 'expired'],
        message: '{VALUE} is not a valid offer status',
      },
      default: 'offered',
    },
    offeredAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Placement',
      default: null,
    },
    reminderSent48h: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// A student can only receive one active offer per drive
offerSchema.index({ drive: 1, student: 1 });
offerSchema.index({ student: 1, status: 1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;

