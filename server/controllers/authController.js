const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Student, College, Company, Aspirant, Notification } = require('../models');
const generateTokenHelper = require('../utils/generateToken');
const emailService = require('../utils/emailService');

const generateToken = generateTokenHelper.generateToken || generateTokenHelper;
const generateRefreshToken = generateTokenHelper.generateRefreshToken;
const hashToken = generateTokenHelper.hashToken;

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? (process.env.COOKIE_SAME_SITE || 'none') : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Password validation rule:
 * Minimum 8 characters, at least one letter and one number
 */
const isValidPassword = (password) => {
  return typeof password === 'string' && /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
};

const PASSWORD_RULE_ERROR =
  'Password must be at least 8 characters long and contain at least one letter and one number';

/**
 * Demo OTP helper: Only returns devOtp when NODE_ENV is not production and DEMO_SHOW_OTP is true
 */
const getDevOtp = (otp) => {
  if (process.env.NODE_ENV !== 'production' && process.env.DEMO_SHOW_OTP === 'true') {
    return otp;
  }
  return undefined;
};

/**
 * Generate 6-digit numeric OTP, bcrypt-hash it, save to User model, and dispatch email directly
 */
const generateAndSendOtp = async (user, purpose) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otp, salt);

  const previousLastOtpSentAt = user.lastOtpSentAt;

  user.otpHash = otpHash;
  user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  user.otpAttempts = 0;
  user.otpPurpose = purpose;
  await user.save();

  let sendResult = { success: false };
  if (purpose === 'verify_email') {
    sendResult = await emailService.sendVerificationEmail(user.email, user.name, otp, user);
  } else if (purpose === 'reset_password') {
    sendResult = await emailService.sendPasswordResetEmail(user.email, user.name, otp, user);
  }

  if (!sendResult.success) {
    // Keep unverified account for Resend, but do not count against 60s cooldown
    user.lastOtpSentAt = previousLastOtpSentAt;
    await user.save();
    return {
      success: false,
      error: 'We could not send the verification email. Please use Resend.',
    };
  }

  // Update cooldown timestamp upon successful dispatch
  user.lastOtpSentAt = new Date();
  await user.save();

  return { success: true, otp };
};

/**
 * Notify approved TPOs of a college (or superadmins if college has 0 approved TPOs)
 * when a student or TPO registers and requires administrative approval
 */
const notifyApproversForPendingAccount = async ({ registrant, college, role, detail }) => {
  try {
    const collegeId = college?._id || college;
    let collegeName = college?.name;
    if (!collegeName && collegeId) {
      const colDoc = await College.findById(collegeId);
      collegeName = colDoc?.name;
    }
    collegeName = collegeName || 'your college';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Find existing approved TPOs for this college
    const approvers = await User.find({
      college: collegeId,
      role: 'tpo',
      isApproved: true,
      _id: { $ne: registrant._id },
    });

    const isStudent = role === 'student';
    const reviewLink = `${clientUrl}/admin/dashboard`;
    const message = isStudent
      ? `New student registration: ${registrant.name}${detail ? ` (${detail})` : ''} requires approval.`
      : `New TPO colleague registration: ${registrant.name} (${registrant.email}) requires approval.`;

    if (approvers.length > 0) {
      for (const approver of approvers) {
        await Notification.create({
          user: approver._id,
          type: 'pending_approval',
          message,
          link: '/admin/dashboard',
        }).catch(() => {});

        await emailService.sendApprovalNoticeEmail({
          to: approver.email,
          approverName: approver.name,
          registrantName: registrant.name,
          registrantRole: role,
          collegeName,
          reviewLink,
        }).catch(() => {});
      }
    } else {
      // If 0 approved TPOs exist for this college, notify superadmin so account doesn't get stuck!
      const superadmins = await User.find({ role: 'superadmin' });
      for (const sa of superadmins) {
        await Notification.create({
          user: sa._id,
          type: 'pending_approval',
          message: `Pending ${role.toUpperCase()} registration for ${collegeName} with no active TPO: ${registrant.name} (${registrant.email}).`,
          link: '/superadmin/pending-accounts',
        }).catch(() => {});

        await emailService.sendApprovalNoticeEmail({
          to: sa.email,
          approverName: sa.name,
          registrantName: registrant.name,
          registrantRole: role,
          collegeName: `${collegeName} (No Active TPO)`,
          reviewLink: `${clientUrl}/superadmin/pending-accounts`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[notifyApproversForPendingAccount] Error:', err.message);
  }
};

/**
 * Notify platform superadmin when a new recruiter registers and requires approval
 */
const notifySuperadminForPendingRecruiter = async (recruiterUser, companyDoc) => {
  try {
    const superadmins = await User.find({ role: 'superadmin' });
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const compName = companyDoc?.name || 'Company';

    for (const sa of superadmins) {
      await Notification.create({
        user: sa._id,
        type: 'pending_approval',
        message: `New recruiter registration: ${recruiterUser.name} (${compName}) requires approval.`,
        link: '/superadmin/pending-accounts',
      }).catch(() => {});

      await emailService.sendApprovalNoticeEmail({
        to: sa.email,
        approverName: sa.name,
        registrantName: recruiterUser.name,
        registrantRole: 'recruiter',
        collegeName: compName,
        reviewLink: `${clientUrl}/superadmin/pending-accounts`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[notifySuperadminForPendingRecruiter] Error:', err.message);
  }
};

/**
 * @desc    Register a new student & create their student profile
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      college,
      enrollmentNo,
      branch,
      batchYear,
      cgpa,
      backlogs,
      phone,
      skills,
      resumeUrl,
    } = req.body;

    // Basic validation
    if (
      !name ||
      !email ||
      !password ||
      !enrollmentNo ||
      !branch ||
      !batchYear ||
      cgpa === undefined ||
      !phone
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Please provide all required fields (name, email, password, enrollmentNo, branch, batchYear, cgpa, phone)',
      });
    }

    // Password rule verification
    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    // College validation
    let collegeDoc = null;
    let collegeId = college;
    if (!collegeId) {
      collegeDoc = await College.findOne();
      if (!collegeDoc) {
        return res.status(400).json({
          success: false,
          message: 'No colleges found in the system. Please contact the administrator.',
        });
      }
      collegeId = collegeDoc._id;
    } else {
      collegeDoc = await College.findById(collegeId);
      if (!collegeDoc) {
        return res.status(400).json({
          success: false,
          message: 'Selected college does not exist',
        });
      }
    }

    // Check if college requires TPO approval for verified students
    const needsTpoApproval = Boolean(collegeDoc.requireStudentApproval);

    // Check if user email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      // Unverified account: treat as fresh registration attempt
      const existingEnrollment = await Student.findOne({
        enrollmentNo: enrollmentNo.trim().toUpperCase(),
        user: { $ne: existingUser._id },
      });
      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          message: 'A student with this enrollment number already exists',
        });
      }

      existingUser.name = name.trim();
      existingUser.password = password;
      existingUser.role = 'student';
      existingUser.college = collegeId;
      existingUser.phone = phone ? phone.trim() : '';
      existingUser.isApproved = !needsTpoApproval;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      await Student.findOneAndUpdate(
        { user: existingUser._id },
        {
          college: collegeId,
          enrollmentNo: enrollmentNo.trim().toUpperCase(),
          branch: branch.trim().toUpperCase(),
          batchYear: Number(batchYear),
          cgpa: Number(cgpa),
          backlogs: backlogs ? Number(backlogs) : 0,
          phone: phone.trim(),
          skills: Array.isArray(skills)
            ? skills
            : skills
            ? skills.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          resumeUrl: resumeUrl || '',
        },
        { upsert: true, new: true }
      );

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      if (needsTpoApproval) {
        notifyApproversForPendingAccount({
          registrant: existingUser,
          college: collegeDoc,
          role: 'student',
          detail: `${branch.trim().toUpperCase()} (${Number(batchYear)})`,
        }).catch(() => {});
      }

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message:
          'Registration updated! Please verify your email with the 6-digit verification code sent to your inbox.',
        email: existingUser.email,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          college: existingUser.college,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    // Check if enrollment number already exists
    const existingEnrollment = await Student.findOne({
      enrollmentNo: enrollmentNo.trim().toUpperCase(),
    });
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'A student with this enrollment number already exists',
      });
    }

    // 1. Create base User document (isEmailVerified=false, isApproved depending on college rule)
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'student',
      college: collegeId,
      phone: phone ? phone.trim() : '',
      isEmailVerified: false,
      isApproved: !needsTpoApproval,
    });

    // 2. Create Student profile
    try {
      await Student.create({
        user: user._id,
        college: collegeId,
        enrollmentNo: enrollmentNo.trim().toUpperCase(),
        branch: branch.trim().toUpperCase(),
        batchYear: Number(batchYear),
        cgpa: Number(cgpa),
        backlogs: backlogs ? Number(backlogs) : 0,
        phone: phone.trim(),
        skills: Array.isArray(skills)
          ? skills
          : skills
          ? skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        resumeUrl: resumeUrl || '',
      });
    } catch (studentErr) {
      await User.findByIdAndDelete(user._id);
      throw studentErr;
    }

    // 3. Send 6-digit OTP for email verification
    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    if (needsTpoApproval) {
      notifyApproversForPendingAccount({
        registrant: user,
        college: collegeDoc,
        role: 'student',
        detail: `${branch.trim().toUpperCase()} (${Number(batchYear)})`,
      }).catch(() => {});
    }

    const devOtp = getDevOtp(otpResult.otp);

    // Return message, email, and user details (NO JWT TOKEN, NO AUTO-LOGIN)
    res.status(201).json({
      success: true,
      message:
        'Registration successful! Please verify your email with the 6-digit verification code sent to your inbox.',
      email: user.email,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a new TPO with college assignment (pending existing TPO approval)
 * @route   POST /api/auth/register/tpo
 * @access  Public
 */
const registerTPO = async (req, res, next) => {
  try {
    const { name, email, password, college, phone } = req.body;

    if (!name || !email || !password || !college) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (name, email, password, college)',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    const collegeDoc = await College.findById(college);
    if (!collegeDoc) {
      return res.status(400).json({
        success: false,
        message: 'Selected college does not exist',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      // Unverified account: treat as new registration attempt
      existingUser.name = name.trim();
      existingUser.password = password;
      existingUser.role = 'tpo';
      existingUser.phone = phone ? phone.trim() : '';
      existingUser.college = collegeDoc._id;
      existingUser.isApproved = false;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      notifyApproversForPendingAccount({
        registrant: existingUser,
        college: collegeDoc,
        role: 'tpo',
      }).catch(() => {});

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message:
          'TPO registration updated! Please verify your email with the 6-digit verification code sent to your inbox.',
        email: existingUser.email,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          role: existingUser.role,
          college: existingUser.college,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'tpo',
      phone: phone ? phone.trim() : '',
      college: collegeDoc._id,
      isApproved: false, // Requires existing TPO approval
      isEmailVerified: false,
    });

    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    notifyApproversForPendingAccount({
      registrant: user,
      college: collegeDoc,
      role: 'tpo',
    }).catch(() => {});

    const devOtp = getDevOtp(otpResult.otp);

    res.status(201).json({
      success: true,
      message:
        'TPO account registration submitted! Please verify your email with the 6-digit verification code sent to your inbox.',
      email: user.email,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        college: user.college,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a new College and its first TPO administrator in one request
 * @route   POST /api/auth/register-college
 * @access  Public
 */
const registerCollege = async (req, res, next) => {
  try {
    const {
      name,
      collegeName,
      code,
      collegeCode,
      city,
      state,
      website,
      contactEmail,
      contactPhone,
      accreditation,
      tpoName,
      tpoEmail,
      tpoPassword,
      tpoPhone,
      email,
      password,
      phone,
    } = req.body;

    const finalCollegeName = (collegeName || name || '').trim();
    const finalCollegeCode = (collegeCode || code || '').trim().toUpperCase();
    const finalCity = (city || '').trim();
    const finalState = (state || '').trim();
    const finalWebsite = (website || '').trim();
    const finalContactEmail = (contactEmail || tpoEmail || email || '').trim().toLowerCase();
    const finalContactPhone = (contactPhone || tpoPhone || phone || '').trim();
    const finalAccreditation = (accreditation || '').trim();

    const finalTpoName = (tpoName || (!collegeName ? '' : name) || '').trim();
    const finalTpoEmail = (tpoEmail || email || '').trim().toLowerCase();
    const finalTpoPassword = tpoPassword || password || '';
    const finalTpoPhone = (tpoPhone || phone || '').trim();

    if (!finalCollegeName || !finalCollegeCode || !finalCity || !finalState) {
      return res.status(400).json({
        success: false,
        message: 'College name, unique code, city, and state are required',
      });
    }

    if (!finalTpoName || !finalTpoEmail || !finalTpoPassword) {
      return res.status(400).json({
        success: false,
        message: 'TPO administrator full name, official email, and password are required',
      });
    }

    if (!isValidPassword(finalTpoPassword)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    // Uniqueness checks
    const existingCode = await College.findOne({ code: finalCollegeCode });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        message: `A college with code "${finalCollegeCode}" already exists`,
      });
    }

    const existingName = await College.findOne({
      name: { $regex: new RegExp(`^${finalCollegeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existingName) {
      return res.status(400).json({
        success: false,
        message: `A college named "${finalCollegeName}" is already registered`,
      });
    }

    const existingUser = await User.findOne({ email: finalTpoEmail });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      // Check if college code exists and belongs to someone else
      let college = await College.findOne({ code: finalCollegeCode });
      if (college && existingUser.college && college._id.toString() !== existingUser.college.toString()) {
        return res.status(400).json({
          success: false,
          message: `A college with code "${finalCollegeCode}" already exists`,
        });
      }

      if (!college) {
        college = await College.create({
          name: finalCollegeName,
          code: finalCollegeCode,
          city: finalCity,
          state: finalState,
          website: finalWebsite,
          contactEmail: finalContactEmail || finalTpoEmail,
          contactPhone: finalContactPhone,
          accreditation: finalAccreditation,
          status: 'pending',
          requireStudentApproval: false,
        });
      }

      existingUser.name = finalTpoName;
      existingUser.password = finalTpoPassword;
      existingUser.phone = finalTpoPhone;
      existingUser.role = 'tpo';
      existingUser.college = college._id;
      existingUser.isApproved = true;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message: `College "${college.name}" registration updated! Please verify your email with the 6-digit code sent to your inbox.`,
        email: existingUser.email,
        college,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          role: existingUser.role,
          college,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    // Create College
    const college = await College.create({
      name: finalCollegeName,
      code: finalCollegeCode,
      city: finalCity,
      state: finalState,
      website: finalWebsite,
      contactEmail: finalContactEmail || finalTpoEmail,
      contactPhone: finalContactPhone,
      accreditation: finalAccreditation,
      status: 'pending', // Pending superadmin verification
      requireStudentApproval: false,
    });

    // Create first TPO user (isApproved=true, isEmailVerified=false)
    const user = await User.create({
      name: finalTpoName,
      email: finalTpoEmail,
      password: finalTpoPassword,
      phone: finalTpoPhone,
      role: 'tpo',
      college: college._id,
      isApproved: true,
      isEmailVerified: false,
    });

    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    const devOtp = getDevOtp(otpResult.otp);

    res.status(201).json({
      success: true,
      message: `College "${college.name}" registered successfully! Please verify your email with the 6-digit code sent to your inbox.`,
      email: user.email,
      college,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        college,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a recruiter user and create/link their Company profile
 * @route   POST /api/auth/register-recruiter
 * @access  Public
 */
const registerRecruiter = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      companyId,
      companyName,
      industry,
      website,
      description,
      logoUrl,
      hrContact,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide recruiter name, corporate email, and password',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      // Unverified account: treat as new registration attempt
      let targetCompany = null;
      if (companyId) {
        targetCompany = await Company.findById(companyId);
        if (!targetCompany) {
          return res.status(400).json({
            success: false,
            message: 'Specified company does not exist',
          });
        }
      } else {
        const targetName = (companyName || req.body.nameCompany || '').trim();
        if (!targetName) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a company name or select an existing company',
          });
        }

        targetCompany = await Company.findOne({
          name: { $regex: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });

        if (!targetCompany) {
          targetCompany = await Company.create({
            name: targetName,
            industry: (industry || 'Technology & IT Services').trim(),
            website: website ? website.trim() : '',
            description: description ? description.trim() : '',
            logoUrl: logoUrl ? logoUrl.trim() : '',
            owner: existingUser._id,
            verified: false,
            hrContact: {
              name: hrContact?.name || name.trim(),
              email: hrContact?.email || email.trim().toLowerCase(),
              phone: hrContact?.phone || phone?.trim() || '',
            },
          });
        }
      }

      existingUser.name = name.trim();
      existingUser.password = password;
      existingUser.role = 'recruiter';
      existingUser.company = targetCompany._id;
      existingUser.phone = phone ? phone.trim() : '';
      existingUser.isApproved = false;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      notifySuperadminForPendingRecruiter(existingUser, targetCompany).catch(() => {});

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message:
          'Recruiter registration updated! Please verify your email with the 6-digit code sent to your corporate email.',
        email: existingUser.email,
        company: targetCompany,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          role: existingUser.role,
          company: targetCompany,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    let targetCompany = null;
    if (companyId) {
      targetCompany = await Company.findById(companyId);
      if (!targetCompany) {
        return res.status(400).json({
          success: false,
          message: 'Specified company does not exist',
        });
      }
    } else {
      const targetName = (companyName || req.body.nameCompany || '').trim();
      if (!targetName) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a company name or select an existing company',
        });
      }

      targetCompany = await Company.findOne({
        name: { $regex: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });

      if (!targetCompany) {
        targetCompany = await Company.create({
          name: targetName,
          industry: (industry || 'Technology & IT Services').trim(),
          website: website ? website.trim() : '',
          description: description ? description.trim() : '',
          logoUrl: logoUrl ? logoUrl.trim() : '',
          owner: null,
          verified: false,
          hrContact: {
            name: hrContact?.name || name.trim(),
            email: hrContact?.email || email.trim().toLowerCase(),
            phone: hrContact?.phone || phone?.trim() || '',
          },
        });
      }
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'recruiter',
      company: targetCompany._id,
      phone: phone ? phone.trim() : '',
      isApproved: false,
      isEmailVerified: false,
    });

    if (!targetCompany.owner) {
      targetCompany.owner = user._id;
      await targetCompany.save();
    }

    notifySuperadminForPendingRecruiter(user, targetCompany).catch(() => {});

    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    const devOtp = getDevOtp(otpResult.otp);

    res.status(201).json({
      success: true,
      message:
        'Recruiter profile registered successfully! Please verify your email with the 6-digit code sent to your corporate email.',
      email: user.email,
      company: targetCompany,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        company: targetCompany,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register an Analyst / Observer user (requires superadmin approval)
 * @route   POST /api/auth/register-analyst
 * @access  Public
 */
const registerAnalyst = async (req, res, next) => {
  try {
    const { name, email, organisation, organisationType, purpose, designation, password } =
      req.body;

    if (!name || !email || !password || !organisation || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, organisation, purpose, and password are required',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      existingUser.name = name.trim();
      existingUser.password = password;
      existingUser.role = 'analyst';
      existingUser.organisation = organisation.trim();
      existingUser.organisationType = organisationType ? String(organisationType).trim() : '';
      existingUser.purpose = purpose.trim();
      existingUser.designation = designation ? designation.trim() : '';
      existingUser.isApproved = false;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message:
          'Analyst registration updated! Please verify your email with the OTP code. Administrator approval is required before logging in.',
        email: existingUser.email,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          organisation: existingUser.organisation,
          organisationType: existingUser.organisationType,
          purpose: existingUser.purpose,
          designation: existingUser.designation,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'analyst',
      organisation: organisation.trim(),
      organisationType: organisationType ? String(organisationType).trim() : '',
      purpose: purpose.trim(),
      designation: designation ? designation.trim() : '',
      isApproved: false, // Requires superadmin approval
      isEmailVerified: false,
    });

    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    const devOtp = getDevOtp(otpResult.otp);

    res.status(201).json({
      success: true,
      message:
        'Analyst account registered successfully. Please verify your email with the OTP code. Administrator approval is required before logging in.',
      email: user.email,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organisation: user.organisation,
        organisationType: user.organisationType,
        purpose: user.purpose,
        designation: user.designation,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register a Prospective Student (Aspirant)
 * @route   POST /api/auth/register-aspirant
 * @access  Public
 */
const registerAspirant = async (req, res, next) => {
  try {
    const { name, email, password, state, interestedBranches, twelfthStream } = req.body;

    if (!name || !email || !password || !state) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and state are required',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'This email is already registered. Log in, or use Forgot password.',
          code: 'ALREADY_REGISTERED',
        });
      }

      existingUser.name = name.trim();
      existingUser.password = password;
      existingUser.role = 'aspirant';
      existingUser.isApproved = true;
      existingUser.isEmailVerified = false;
      await existingUser.save();

      const parsedBranches = Array.isArray(interestedBranches)
        ? interestedBranches
        : typeof interestedBranches === 'string'
        ? interestedBranches
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      await Aspirant.findOneAndUpdate(
        { user: existingUser._id },
        {
          state: state.trim(),
          interestedBranches: parsedBranches,
          twelfthStream: twelfthStream ? String(twelfthStream).trim() : '',
        },
        { upsert: true, new: true }
      );

      const otpResult = await generateAndSendOtp(existingUser, 'verify_email');
      if (!otpResult.success) {
        return res.status(500).json({
          success: false,
          message: 'We could not send the verification email. Please use Resend.',
          email: existingUser.email,
        });
      }

      const devOtp = getDevOtp(otpResult.otp);
      return res.status(200).json({
        success: true,
        message:
          'Prospective student registration updated! Please verify your email with the 6-digit code sent to your inbox.',
        email: existingUser.email,
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          isApproved: existingUser.isApproved,
          isEmailVerified: existingUser.isEmailVerified,
        },
        ...(devOtp ? { devOtp } : {}),
      });
    }

    // Aspirants are auto-approved upon email verification
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'aspirant',
      isApproved: true,
      isEmailVerified: false,
    });

    const parsedBranches = Array.isArray(interestedBranches)
      ? interestedBranches
      : typeof interestedBranches === 'string'
      ? interestedBranches
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    await Aspirant.create({
      user: user._id,
      state: state.trim(),
      interestedBranches: parsedBranches,
      twelfthStream: twelfthStream ? String(twelfthStream).trim() : '',
      shortlistedColleges: [],
      savedComparisons: [],
    });

    const otpResult = await generateAndSendOtp(user, 'verify_email');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
        email: user.email,
      });
    }

    const devOtp = getDevOtp(otpResult.otp);

    res.status(201).json({
      success: true,
      message:
        'Prospective student account registered successfully. Please verify your email with the 6-digit code sent to your inbox.',
      email: user.email,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify email address using 6-digit OTP
 * @route   POST /api/auth/verify-email
 * @access  Public
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email address and 6-digit verification code are required',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification request. Please check the email entered.',
      });
    }

    if (user.isEmailVerified) {
      return res.status(200).json({
        success: true,
        message: 'Your email address is already verified. You may now log in.',
      });
    }

    if (!user.otpHash || !user.otpExpiresAt || user.otpPurpose !== 'verify_email') {
      return res.status(400).json({
        success: false,
        message: 'No active verification code found. Please request a new verification code.',
      });
    }

    // Check expiry
    if (new Date() > new Date(user.otpExpiresAt)) {
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Verification code has expired (valid for 10 minutes). Please request a new code.',
      });
    }

    // Check attempts limit (max 5 wrong attempts)
    if (user.otpAttempts >= 5) {
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. This code has been invalidated. Please request a new code.',
      });
    }

    // Compare entered OTP
    const isMatch = await bcrypt.compare(String(otp).trim(), user.otpHash);
    if (!isMatch) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= 5) {
        user.otpHash = null;
        user.otpExpiresAt = null;
        user.otpPurpose = null;
        user.otpAttempts = 0;
        await user.save();

        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts (5/5). This code has been invalidated. Please request a new code.',
        });
      }

      await user.save();
      const attemptsLeft = 5 - user.otpAttempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${attemptsLeft} attempt(s) remaining.`,
      });
    }

    // Code is valid! Mark email verified and clear OTP fields
    user.isEmailVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.otpPurpose = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! You may now log in to your account.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP verification or reset code with 60-second cooldown
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
const resendOTP = async (req, res, next) => {
  try {
    const { email, purpose = 'verify_email' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Privacy safeguard: Never reveal whether an email exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a verification code has been sent.',
      });
    }

    // 60-second cooldown check
    if (user.lastOtpSentAt) {
      const elapsedMs = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (elapsedMs < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting a new verification code.`,
          cooldownRemaining: waitSeconds,
        });
      }
    }

    const otpResult = await generateAndSendOtp(user, purpose);
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
      });
    }

    const devOtp = getDevOtp(otpResult.otp);
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a verification code has been sent.',
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Forgot password request - sends reset OTP
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Privacy safeguard: Never reveal whether an email exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account is associated with this email, a password reset code has been sent.',
      });
    }

    // 60-second cooldown check
    if (user.lastOtpSentAt) {
      const elapsedMs = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (elapsedMs < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting another reset code.`,
          cooldownRemaining: waitSeconds,
        });
      }
    }

    const otpResult = await generateAndSendOtp(user, 'reset_password');
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'We could not send the verification email. Please use Resend.',
      });
    }

    const devOtp = getDevOtp(otpResult.otp);
    res.status(200).json({
      success: true,
      message: 'If an account is associated with this email, a password reset code has been sent.',
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using email, OTP and new password
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, 6-digit code, and your new password',
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: PASSWORD_RULE_ERROR,
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password reset request',
      });
    }

    if (!user.otpHash || !user.otpExpiresAt || user.otpPurpose !== 'reset_password') {
      return res.status(400).json({
        success: false,
        message: 'No active password reset request found. Please request a new code.',
      });
    }

    // Check expiry
    if (new Date() > new Date(user.otpExpiresAt)) {
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Password reset code has expired. Please request a new code.',
      });
    }

    // Check attempts limit
    if (user.otpAttempts >= 5) {
      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. This reset code has been invalidated. Please request a new code.',
      });
    }

    const isMatch = await bcrypt.compare(String(otp).trim(), user.otpHash);
    if (!isMatch) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= 5) {
        user.otpHash = null;
        user.otpExpiresAt = null;
        user.otpPurpose = null;
        user.otpAttempts = 0;
        await user.save();

        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts (5/5). This code has been invalidated. Please request a new code.',
        });
      }

      await user.save();
      const remaining = 5 - user.otpAttempts;
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. ${remaining} attempt(s) remaining.`,
      });
    }

    // Valid code! Update password and clear OTP/lockout fields
    user.password = newPassword; // Automatically hashed by userSchema pre-save
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.otpPurpose = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.isEmailVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Check for user
    const user = await User.findOne({ email: email.trim().toLowerCase() })
      .populate('college')
      .populate('company');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check Account Lockout
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.lockUntil) - new Date()) / (60 * 1000)
      );
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
        locked: true,
        lockUntil: user.lockUntil,
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
        user.failedLoginAttempts = 0;
        await user.save();

        return res.status(423).json({
          success: false,
          message: 'Account locked for 15 minutes due to 5 consecutive failed login attempts.',
          locked: true,
          lockUntil: user.lockUntil,
        });
      } else {
        await user.save();
        const attemptsLeft = 5 - user.failedLoginAttempts;
        return res.status(401).json({
          success: false,
          message: `Invalid email or password. ${attemptsLeft} attempt(s) remaining before account lockout.`,
        });
      }
    }

    // Password is valid! Reset failed login attempts and lockout
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    // Check Email Verification status
    if (user.isEmailVerified === false) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in.',
        unverified: true,
        email: user.email,
      });
    }

    // Check College verification status for TPO / student
    if (user.role === 'tpo' && user.college && user.college.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Waiting for college approval',
        unapproved: true,
      });
    }

    if (user.role === 'tpo' && user.college && user.college.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'College registration has been rejected by system administrator',
        unapproved: true,
      });
    }

    // Check approval status
    if (user.isApproved === false) {
      if (user.role === 'analyst') {
        return res.status(403).json({
          success: false,
          message: 'Waiting for approval',
          role: 'analyst',
          whatNext: 'A platform superadmin will review your credentials and organisation details before approving your account.',
          unapproved: true,
        });
      }
      if (user.role === 'student') {
        let collegeName = user.college?.name;
        if (!collegeName) {
          const studentProfile = await Student.findOne({ user: user._id }).populate('college');
          collegeName = studentProfile?.college?.name;
        }
        collegeName = collegeName || 'your college';
        return res.status(403).json({
          success: false,
          message: `Your registration is waiting for approval by the Training & Placement Office of ${collegeName}.`,
          collegeName,
          role: 'student',
          whatNext: `The Training & Placement Office of ${collegeName} will review and activate your account. You will receive an email once approved.`,
          unapproved: true,
        });
      }
      if (user.role === 'tpo') {
        const collegeName = user.college?.name || 'your college';
        return res.status(403).json({
          success: false,
          message: `Your TPO account for ${collegeName} is waiting for approval from an existing TPO of that college.`,
          collegeName,
          role: 'tpo',
          whatNext: `An existing TPO from ${collegeName} will review and approve your account. Once approved, you can log in immediately.`,
          unapproved: true,
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Your account is pending administrator approval',
        unapproved: true,
        whatNext: 'A system administrator will review and approve your account.',
      });
    }

    // If student, attach student profile
    let student = null;
    if (user.role === 'student') {
      student = await Student.findOne({ user: user._id }).populate('college');
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college || null,
        company: user.company || null,
        organisation: user.organisation || '',
        organisationType: user.organisationType || '',
        purpose: user.purpose || '',
        designation: user.designation || '',
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/auth/me
 * @access  Private (Requires token)
 */
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
      student: req.student || null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  registerTPO,
  registerCollege,
  registerRecruiter,
  registerAnalyst,
  registerAspirant,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
  login,
  getMe,
  isValidPassword,
  generateAndSendOtp,
};
