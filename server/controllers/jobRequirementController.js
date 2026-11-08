const { JobRequirement, Company } = require('../models');

/**
 * Helper to extract company ID from authenticated user
 */
const getRecruiterCompanyId = (user) => {
  if (!user) return null;
  if (user.company) {
    return user.company._id || user.company;
  }
  return null;
};

/**
 * @desc    Create a new Job Requirement for recruiter's company
 * @route   POST /api/job-requirements
 * @access  Private (Recruiter / Admin)
 */
const createJobRequirement = async (req, res, next) => {
  try {
    const companyId = getRecruiterCompanyId(req.user) || req.body.company;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'No company associated with this account. Please register with a company first.',
      });
    }

    const {
      title,
      description,
      packageLpa,
      openings,
      skills,
      minCgpa,
      maxBacklogs,
      allowedBranches,
      batchYear,
      selectionRounds,
      location,
      status,
    } = req.body;

    // Validate required fields
    if (!title || !description || packageLpa === undefined || !batchYear) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: title, description, packageLpa, batchYear',
      });
    }

    // Process allowedBranches array
    let branches = [];
    if (Array.isArray(allowedBranches)) {
      branches = allowedBranches.map((b) => b.trim().toUpperCase()).filter(Boolean);
    } else if (typeof allowedBranches === 'string') {
      branches = allowedBranches
        .split(',')
        .map((b) => b.trim().toUpperCase())
        .filter(Boolean);
    }

    if (branches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one allowed branch must be specified',
      });
    }

    // Process skills array
    let skillsList = [];
    if (Array.isArray(skills)) {
      skillsList = skills.map((s) => s.trim()).filter(Boolean);
    } else if (typeof skills === 'string') {
      skillsList = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Process selection rounds
    let rounds = ['Aptitude', 'Technical', 'HR'];
    if (Array.isArray(selectionRounds) && selectionRounds.length > 0) {
      rounds = selectionRounds.map((r) => r.trim()).filter(Boolean);
    } else if (typeof selectionRounds === 'string' && selectionRounds.trim() !== '') {
      rounds = selectionRounds
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    }

    const requirement = await JobRequirement.create({
      company: companyId,
      title: title.trim(),
      description: description.trim(),
      packageLpa: Number(packageLpa),
      openings: openings ? Math.max(1, Number(openings)) : 1,
      skills: skillsList,
      minCgpa: minCgpa !== undefined ? Number(minCgpa) : 0,
      maxBacklogs: maxBacklogs !== undefined ? Math.max(0, Number(maxBacklogs)) : 0,
      allowedBranches: branches,
      batchYear: Number(batchYear),
      selectionRounds: rounds,
      location: location ? location.trim() : 'Pan India',
      status: status || 'draft',
    });

    const populated = await JobRequirement.findById(requirement._id).populate(
      'company',
      'name industry website logoUrl verified'
    );

    res.status(201).json({
      success: true,
      message: 'Job requirement created successfully',
      requirement: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Job Requirements (scoped to recruiter's own company, or published for other roles)
 * @route   GET /api/job-requirements
 * @access  Private
 */
const getJobRequirements = async (req, res, next) => {
  try {
    const { status, search, batchYear, branch } = req.query;
    const query = {};

    // 1. Recruiter scoping: recruiters only ever see their own company's requirements
    if (req.user?.role === 'recruiter') {
      const companyId = getRecruiterCompanyId(req.user);
      if (!companyId) {
        return res.status(200).json({
          success: true,
          count: 0,
          requirements: [],
        });
      }
      query.company = companyId;
    } else if (req.query.company) {
      query.company = req.query.company;
    }

    // 2. Filter by status (draft, published, closed)
    if (status && status !== 'all') {
      query.status = status;
    }

    // 3. Batch year filter
    if (batchYear) {
      query.batchYear = Number(batchYear);
    }

    // 4. Branch filter
    if (branch) {
      query.allowedBranches = branch.trim().toUpperCase();
    }

    // 5. Search keyword
    if (search && search.trim() !== '') {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
        { skills: { $regex: term, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await JobRequirement.countDocuments(query);
    const requirements = await JobRequirement.find(query)
      .populate('company', 'name industry website logoUrl verified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: requirements,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: requirements.length,
      requirements,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single Job Requirement by ID
 * @route   GET /api/job-requirements/:id
 * @access  Private
 */
const getJobRequirementById = async (req, res, next) => {
  try {
    const requirement = await JobRequirement.findById(req.params.id).populate(
      'company',
      'name industry website logoUrl verified hrContact'
    );

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Job requirement not found',
      });
    }

    // Recruiter scoping check: cannot access other companies' requirements
    if (req.user?.role === 'recruiter') {
      const companyId = getRecruiterCompanyId(req.user);
      if (
        !companyId ||
        requirement.company?._id?.toString() !== companyId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view requirement from another company',
        });
      }
    }

    res.status(200).json({
      success: true,
      requirement,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Job Requirement (recruiter's own company only)
 * @route   PUT /api/job-requirements/:id
 * @access  Private (Recruiter / Admin)
 */
const updateJobRequirement = async (req, res, next) => {
  try {
    const requirement = await JobRequirement.findById(req.params.id);

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Job requirement not found',
      });
    }

    // Recruiter scoping check
    if (req.user?.role === 'recruiter') {
      const companyId = getRecruiterCompanyId(req.user);
      if (
        !companyId ||
        requirement.company.toString() !== companyId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to edit requirement from another company',
        });
      }
    }

    const {
      title,
      description,
      packageLpa,
      openings,
      skills,
      minCgpa,
      maxBacklogs,
      allowedBranches,
      batchYear,
      selectionRounds,
      location,
      status,
    } = req.body;

    if (title !== undefined) requirement.title = title.trim();
    if (description !== undefined) requirement.description = description.trim();
    if (packageLpa !== undefined) requirement.packageLpa = Number(packageLpa);
    if (openings !== undefined) requirement.openings = Math.max(1, Number(openings));
    if (minCgpa !== undefined) requirement.minCgpa = Number(minCgpa);
    if (maxBacklogs !== undefined) requirement.maxBacklogs = Math.max(0, Number(maxBacklogs));
    if (batchYear !== undefined) requirement.batchYear = Number(batchYear);
    if (location !== undefined) requirement.location = location.trim();
    if (status !== undefined) requirement.status = status;

    if (allowedBranches !== undefined) {
      if (Array.isArray(allowedBranches)) {
        requirement.allowedBranches = allowedBranches
          .map((b) => b.trim().toUpperCase())
          .filter(Boolean);
      } else if (typeof allowedBranches === 'string') {
        requirement.allowedBranches = allowedBranches
          .split(',')
          .map((b) => b.trim().toUpperCase())
          .filter(Boolean);
      }
    }

    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        requirement.skills = skills.map((s) => s.trim()).filter(Boolean);
      } else if (typeof skills === 'string') {
        requirement.skills = skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    if (selectionRounds !== undefined) {
      if (Array.isArray(selectionRounds)) {
        requirement.selectionRounds = selectionRounds.map((r) => r.trim()).filter(Boolean);
      } else if (typeof selectionRounds === 'string') {
        requirement.selectionRounds = selectionRounds
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);
      }
    }

    await requirement.save();

    const populated = await JobRequirement.findById(requirement._id).populate(
      'company',
      'name industry website logoUrl verified'
    );

    res.status(200).json({
      success: true,
      message: 'Job requirement updated successfully',
      requirement: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Publish a draft Job Requirement (one-click action)
 * @route   PATCH /api/job-requirements/:id/publish
 * @access  Private (Recruiter / Admin)
 */
const publishJobRequirement = async (req, res, next) => {
  try {
    const requirement = await JobRequirement.findById(req.params.id);

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Job requirement not found',
      });
    }

    // Ownership check
    if (req.user?.role === 'recruiter') {
      const companyId = getRecruiterCompanyId(req.user);
      if (
        !companyId ||
        requirement.company.toString() !== companyId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to publish requirement from another company',
        });
      }
    }

    requirement.status = 'published';
    await requirement.save();

    const populated = await JobRequirement.findById(requirement._id).populate(
      'company',
      'name industry website logoUrl verified'
    );

    res.status(200).json({
      success: true,
      message: 'Job requirement published successfully',
      requirement: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete Job Requirement (recruiter's own company only)
 * @route   DELETE /api/job-requirements/:id
 * @access  Private (Recruiter / Admin)
 */
const deleteJobRequirement = async (req, res, next) => {
  try {
    const requirement = await JobRequirement.findById(req.params.id);

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Job requirement not found',
      });
    }

    // Ownership check
    if (req.user?.role === 'recruiter') {
      const companyId = getRecruiterCompanyId(req.user);
      if (
        !companyId ||
        requirement.company.toString() !== companyId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete requirement from another company',
        });
      }
    }

    await JobRequirement.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Job requirement deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createJobRequirement,
  getJobRequirements,
  getJobRequirementById,
  updateJobRequirement,
  publishJobRequirement,
  deleteJobRequirement,
};

