const mongoose = require('mongoose');

const driveSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    jobRequirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobRequirement',
      default: null,
    },
    driveRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriveRequest',
      default: null,
    },
    role: {
      type: String,
      required: [true, 'Job role is required'],
      trim: true,
    },
    packageLpa: {
      type: Number,
      required: [true, 'Package (LPA) is required'],
      min: [0, 'Package (LPA) cannot be negative'],
    },
    location: {
      type: String,
      required: [true, 'Job location is required'],
      trim: true,
    },
    venueOrMeetingLink: {
      type: String,
      trim: true,
      default: '',
    },
    mode: {
      type: String,
      enum: ['on-campus', 'virtual'],
      default: 'on-campus',
    },
    minCgpa: {
      type: Number,
      required: [true, 'Minimum CGPA requirement is required'],
      default: 0,
      min: [0, 'Minimum CGPA cannot be negative'],
      max: [10, 'Minimum CGPA cannot exceed 10'],
    },
    maxBacklogs: {
      type: Number,
      required: [true, 'Maximum backlogs limit is required'],
      default: 0,
      min: [0, 'Maximum backlogs cannot be negative'],
    },
    allowedBranches: {
      type: [String],
      required: [true, 'At least one allowed branch must be specified'],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'Drive must allow at least one branch',
      },
    },
    lastDateToApply: {
      type: Date,
      required: [true, 'Last date to apply is required'],
    },
    driveDate: {
      type: Date,
      required: [true, 'Drive date is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'closed'],
        message: '{VALUE} is not a valid status. Allowed: open, closed',
      },
      default: 'open',
    },
    applicationsClosed: {
      type: Boolean,
      default: false,
    },
    listFrozenAt: {
      type: Date,
      default: null,
    },
    excludedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Drive = mongoose.model('Drive', driveSchema);

module.exports = Drive;

