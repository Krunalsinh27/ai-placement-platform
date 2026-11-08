const mongoose = require('mongoose');

const jobRequirementSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
    },
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
    },
    packageLpa: {
      type: Number,
      required: [true, 'Package (LPA) is required'],
      min: [0, 'Package (LPA) cannot be negative'],
    },
    openings: {
      type: Number,
      required: [true, 'Number of openings is required'],
      default: 1,
      min: [1, 'Openings must be at least 1'],
    },
    skills: {
      type: [String],
      default: [],
    },
    minCgpa: {
      type: Number,
      default: 0,
      min: [0, 'Minimum CGPA cannot be negative'],
      max: [10, 'Minimum CGPA cannot exceed 10'],
    },
    maxBacklogs: {
      type: Number,
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
        message: 'Requirement must allow at least one branch',
      },
    },
    batchYear: {
      type: Number,
      required: [true, 'Graduation batch year is required'],
      min: [2000, 'Batch year must be at least 2000'],
      max: [2100, 'Batch year is not valid'],
    },
    selectionRounds: {
      type: [String],
      default: ['Aptitude', 'Technical', 'HR'],
    },
    location: {
      type: String,
      trim: true,
      default: 'Pan India',
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'published', 'closed'],
        message: '{VALUE} is not a valid status. Allowed: draft, published, closed',
      },
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for recruiter requirements queries
jobRequirementSchema.index({ company: 1, status: 1 });
jobRequirementSchema.index({ company: 1, createdAt: -1 });

const JobRequirement = mongoose.model('JobRequirement', jobRequirementSchema);

module.exports = JobRequirement;

