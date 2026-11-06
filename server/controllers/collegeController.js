const { College } = require('../models');

/**
 * @desc    Get all registered colleges (public endpoint for student/TPO registration dropdowns)
 * @route   GET /api/colleges
 * @access  Public
 */
const getColleges = async (req, res, next) => {
  try {
    // Only return approved colleges for public registration dropdowns
    const query = {
      $or: [{ status: 'approved' }, { status: { $exists: false } }],
    };
    const colleges = await College.find(query).sort({ name: 1 });
    res.status(200).json({
      success: true,
      count: colleges.length,
      data: colleges,
      colleges,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single college by ID
 * @route   GET /api/colleges/:id
 * @access  Public
 */
const getCollegeById = async (req, res, next) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
      });
    }

    res.status(200).json({
      success: true,
      college,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new college
 * @route   POST /api/colleges
 * @access  Private (Admin / Superadmin)
 */
const createCollege = async (req, res, next) => {
  try {
    const { name, code, city, state, website, accreditation, contactEmail, contactPhone } =
      req.body;

    if (!name || !code || !city || !state) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (name, code, city, state)',
      });
    }

    const existingCode = await College.findOne({ code: code.trim().toUpperCase() });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        message: `A college with code '${code.trim().toUpperCase()}' already exists`,
      });
    }

    const college = await College.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      city: city.trim(),
      state: state.trim(),
      website: website ? website.trim() : '',
      accreditation: accreditation ? accreditation.trim() : '',
      contactEmail: contactEmail ? contactEmail.trim().toLowerCase() : undefined,
      contactPhone: contactPhone ? contactPhone.trim() : '',
    });

    res.status(201).json({
      success: true,
      message: 'College created successfully',
      college,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get logged-in TPO's college settings
 * @route   GET /api/colleges/my/settings
 * @access  Private (TPO / Admin / Superadmin of that college)
 */
const getMyCollegeSettings = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'No college profile associated with your account',
      });
    }

    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
      });
    }

    res.status(200).json({
      success: true,
      settings: {
        requireStudentApproval: Boolean(college.requireStudentApproval),
      },
      college,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update logged-in TPO's college settings (e.g. requireStudentApproval)
 * @route   PUT /api/colleges/my/settings
 * @access  Private (TPO of that college only)
 */
const updateMyCollegeSettings = async (req, res, next) => {
  try {
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'No college profile associated with your account',
      });
    }

    // If caller explicitly provides a collegeId in body, check that it matches caller's college
    if (
      req.body.collegeId &&
      req.user.role !== 'superadmin' &&
      req.body.collegeId.toString() !== collegeId
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only update settings for your own college',
      });
    }

    const college = await College.findById(collegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
      });
    }

    if (req.body.requireStudentApproval !== undefined) {
      college.requireStudentApproval = Boolean(req.body.requireStudentApproval);
    }

    await college.save();

    res.status(200).json({
      success: true,
      message: 'College settings updated successfully',
      settings: {
        requireStudentApproval: Boolean(college.requireStudentApproval),
      },
      college,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update college settings by ID with cross-college authorization check
 * @route   PUT /api/colleges/:id/settings
 * @access  Private (TPO of that college only / Superadmin)
 */
const updateCollegeSettingsById = async (req, res, next) => {
  try {
    const targetCollegeId = req.params.id;
    const userCollegeId = (req.user.college?._id || req.user.college)?.toString();

    if (req.user.role !== 'superadmin' && (!userCollegeId || userCollegeId !== targetCollegeId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: You can only update settings for your own college',
      });
    }

    const college = await College.findById(targetCollegeId);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
      });
    }

    if (req.body.requireStudentApproval !== undefined) {
      college.requireStudentApproval = Boolean(req.body.requireStudentApproval);
    }

    await college.save();

    res.status(200).json({
      success: true,
      message: 'College settings updated successfully',
      settings: {
        requireStudentApproval: Boolean(college.requireStudentApproval),
      },
      college,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getColleges,
  getCollegeById,
  createCollege,
  getMyCollegeSettings,
  updateMyCollegeSettings,
  updateCollegeSettingsById,
};

