const mongoose = require('mongoose');

const messageSubSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    senderRole: {
      type: String,
      enum: ['recruiter', 'tpo', 'superadmin', 'admin'],
      required: true,
    },
    senderName: {
      type: String,
      trim: true,
    },
    text: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const timelineSubSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'rejected',
        'reschedule_proposed',
        'scheduled',
        'completed',
        'cancelled',
      ],
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedByRole: {
      type: String,
      enum: ['recruiter', 'tpo', 'superadmin', 'admin', 'system'],
      default: 'system',
    },
    updatedByName: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const driveRequestSchema = new mongoose.Schema(
  {
    jobRequirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobRequirement',
      required: [true, 'Job requirement reference is required'],
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College reference is required'],
    },
    proposedDates: {
      type: [Date],
      required: [true, 'At least one proposed drive date is required'],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'Must provide at least one proposed date',
      },
    },
    mode: {
      type: String,
      enum: {
        values: ['on-campus', 'virtual'],
        message: '{VALUE} is not a valid drive mode. Allowed: on-campus, virtual',
      },
      default: 'on-campus',
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: [
          'pending',
          'accepted',
          'rejected',
          'reschedule_proposed',
          'scheduled',
          'completed',
          'cancelled',
        ],
        message: '{VALUE} is not a valid status',
      },
      default: 'pending',
      required: true,
    },
    confirmedDate: {
      type: Date,
      default: null,
    },
    tpoProposedDates: {
      type: [Date],
      default: [],
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    cancelledReason: {
      type: String,
      trim: true,
      default: null,
    },
    drive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Drive',
      default: null,
    },
    messages: [messageSubSchema],
    timeline: [timelineSubSchema],
  },
  {
    timestamps: true,
  }
);

// Compound indexes for high performance querying and filtering
driveRequestSchema.index({ company: 1, status: 1 });
driveRequestSchema.index({ college: 1, status: 1 });
driveRequestSchema.index({ jobRequirement: 1, college: 1, status: 1 });
driveRequestSchema.index({ college: 1, createdAt: -1 });
driveRequestSchema.index({ company: 1, createdAt: -1 });

const DriveRequest = mongoose.model('DriveRequest', driveRequestSchema);

module.exports = DriveRequest;

