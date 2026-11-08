const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
    },
    role: {
      type: String,
      enum: {
        values: ['student', 'tpo', 'recruiter', 'superadmin', 'admin', 'analyst', 'aspirant'],
        message: '{VALUE} is not a valid role. Allowed: student, tpo, recruiter, superadmin, admin, analyst, aspirant',
      },
      default: 'student',
    },
    organisation: {
      type: String,
      trim: true,
      default: '',
    },
    organisationType: {
      type: String,
      enum: {
        values: ['University', 'Government department', 'Accreditation body', 'Researcher', 'Other', ''],
        message: '{VALUE} is not a valid organisation type',
      },
      default: '',
    },
    purpose: {
      type: String,
      trim: true,
      default: '',
    },
    designation: {
      type: String,
      trim: true,
      default: '',
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otpHash: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpPurpose: {
      type: String,
      enum: ['verify_email', 'reset_password', null],
      default: null,
    },
    lastOtpSentAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    refreshTokenHash: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving to database
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Ensure legacy/existing records without isApproved or isEmailVerified field default safely to true
userSchema.post('init', function () {
  if (this.isApproved === undefined || this.isApproved === null) {
    this.isApproved = true;
  }
  if (this.isEmailVerified === undefined || this.isEmailVerified === null) {
    this.isEmailVerified = true;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
