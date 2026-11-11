const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College reference is required'],
    },
    enrollmentNo: {
      type: String,
      required: [true, 'Enrollment number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    branch: {
      type: String,
      required: [true, 'Branch is required'],
      trim: true,
      uppercase: true,
    },
    batchYear: {
      type: Number,
      required: [true, 'Batch year is required'],
      min: [2000, 'Batch year must be at least 2000'],
      max: [2100, 'Batch year is not valid'],
    },
    cgpa: {
      type: Number,
      required: [true, 'CGPA is required'],
      min: [0, 'CGPA cannot be less than 0'],
      max: [10, 'CGPA cannot exceed 10'],
    },
    backlogs: {
      type: Number,
      required: [true, 'Number of backlogs is required'],
      default: 0,
      min: [0, 'Backlogs cannot be negative'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    resumeUrl: {
      type: String,
      trim: true,
      default: '',
    },
    resumeOriginalName: {
      type: String,
      trim: true,
      default: '',
    },
    sendReminderEmails: {
      type: Boolean,
      default: true,
    },
    resumeProfile: {
      skills: [
        {
          name: { type: String, trim: true },
          confirmedByStudent: { type: Boolean, default: false },
          foundInResume: { type: Boolean, default: true },
          sources: [{ type: String, trim: true }],
          projectCount: { type: Number, default: 0 },
          inProjects: { type: Boolean, default: false },
          inExperience: { type: Boolean, default: false },
          weight: { type: Number, default: 0.7 },
          evidence: {
            sources: [{ type: String, trim: true }],
            projectCount: { type: Number, default: 0 },
            inProjects: { type: Boolean, default: false },
            inExperience: { type: Boolean, default: false },
            weight: { type: Number, default: 0.7 },
            hasEvidence: { type: Boolean, default: false },
          },
        },
      ],
      education: [
        {
          degree: { type: String, default: '' },
          field: { type: String, default: '' },
          institution: { type: String, default: '' },
          year: { type: String, default: '' },
        },
      ],
      experience: [
        {
          title: { type: String, default: '' },
          company: { type: String, default: '' },
          location: { type: String, default: '' },
          duration: { type: String, default: '' },
          technologies: [{ type: String, trim: true }],
          bullets: [{ type: String, trim: true }],
          description: { type: String, default: '' },
        },
      ],
      projects: [
        {
          title: { type: String, default: '' },
          description: { type: String, default: '' },
          technologies: [{ type: String, trim: true }],
          bullets: [{ type: String, trim: true }],
        },
      ],
      certifications: [{ type: String, trim: true }],
      summary: {
        type: String,
        default: '',
      },
      status: {
        type: String,
        enum: ['none', 'pending', 'parsed', 'failed', 'rate_limited'],
        default: 'none',
      },
      source: {
        type: String,
        enum: ['llm', 'rules', 'none'],
        default: 'none',
      },
      model: {
        type: String,
        default: '',
      },
      resumeHash: {
        type: String,
        default: '',
      },
      parsedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for querying, filtering, and cross-college aggregations
studentSchema.index({ college: 1, batchYear: 1, branch: 1 });
studentSchema.index({ college: 1, branch: 1 });
studentSchema.index({ college: 1, cgpa: -1 });
studentSchema.index({ branch: 1, batchYear: 1 });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
