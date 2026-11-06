const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'College name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'College code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    accreditation: {
      type: String,
      trim: true,
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid contact email address',
      ],
    },
    contactPhone: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    requireStudentApproval: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const College = mongoose.model('College', collegeSchema);

module.exports = College;

