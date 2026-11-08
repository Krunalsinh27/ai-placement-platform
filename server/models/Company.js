const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      unique: true,
      trim: true,
    },
    industry: {
      type: String,
      required: [true, 'Industry type is required'],
      trim: true,
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Verification requires superadmin approval
    verified: {
      type: Boolean,
      default: false,
    },
    hrContact: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
      },
      phone: {
        type: String,
        trim: true,
        default: '',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for superadmin verification filters and recruiter company lookup
companySchema.index({ verified: 1 });
companySchema.index({ owner: 1 });

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
