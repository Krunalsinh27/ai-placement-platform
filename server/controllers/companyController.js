const { Company, Drive } = require('../models');

/**
 * @desc    Create a new company
 * @route   POST /api/companies
 * @access  Private (Admin only)
 */
const createCompany = async (req, res, next) => {
  try {
    const { name, industry, website, description } = req.body;

    if (!name || !industry) {
      return res.status(400).json({
        success: false,
        message: 'Company name and industry are required',
      });
    }

    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: 'A company with this name already exists',
      });
    }

    const company = await Company.create({
      name: name.trim(),
      industry: industry.trim(),
      website: website ? website.trim() : '',
      description: description ? description.trim() : '',
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all companies with optional search
 * @route   GET /api/companies
 * @access  Private (Admin and Student)
 */
const getCompanies = async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = {};

    if (search && typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { industry: { $regex: term, $options: 'i' } },
      ];
    }

    const companies = await Company.find(query)
      .select('_id name industry website description logoUrl verified')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: companies.length,
      companies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single company by ID
 * @route   GET /api/companies/:id
 * @access  Private (Admin and Student)
 */
const getCompanyById = async (req, res, next) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const isOwningRecruiter =
      req.user?.role === 'recruiter' &&
      (req.user.company?._id || req.user.company)?.toString() === req.params.id;

    // Only superadmin or the company's owning recruiter may view hrContact and owner
    const projection = isSuperadmin || isOwningRecruiter ? '' : '-hrContact -owner';

    const company = await Company.findById(req.params.id).select(projection);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    // Also fetch associated drives for this company
    const drives = await Drive.find({ company: company._id }).sort({ driveDate: -1 });

    res.status(200).json({
      success: true,
      company,
      drives,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update company details
 * @route   PUT /api/companies/:id
 * @access  Private (Admin only)
 */
const updateCompany = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Only superadmin can modify global company records directly. Recruiters should use /api/companies/me.',
      });
    }

    const { name, industry, website, description } = req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    // If changing name, ensure uniqueness
    if (name && name.trim().toLowerCase() !== company.name.toLowerCase()) {
      const existing = await Company.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: company._id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Another company with this name already exists',
        });
      }
      company.name = name.trim();
    }

    if (industry !== undefined) company.industry = industry.trim();
    if (website !== undefined) company.website = website.trim();
    if (description !== undefined) company.description = description.trim();

    await company.save();

    res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete company
 * @route   DELETE /api/companies/:id
 * @access  Private (Admin only)
 */
const deleteCompany = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Only superadmin can delete global company records.',
      });
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    // Check if drives exist for this company
    const associatedDrives = await Drive.countDocuments({ company: company._id });
    if (associatedDrives > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete company with ${associatedDrives} associated drive(s). Delete the drives first.`,
      });
    }

    await Company.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Company deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get recruiter's company profile
 * @route   GET /api/company/me
 * @access  Private (Recruiter / Admin)
 */
const getMyCompanyProfile = async (req, res, next) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;

    if (!companyId) {
      return res.status(404).json({
        success: false,
        message: 'No company associated with this account',
      });
    }

    const company = await Company.findById(companyId).populate('owner', 'name email');
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found',
      });
    }

    // Also fetch associated drives for this company
    const drives = await Drive.find({ company: company._id }).sort({ driveDate: -1 });

    res.status(200).json({
      success: true,
      company,
      drives,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update recruiter's company profile
 * @route   PUT /api/company/me
 * @access  Private (Recruiter / Admin)
 */
const updateMyCompanyProfile = async (req, res, next) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;

    if (!companyId) {
      return res.status(404).json({
        success: false,
        message: 'No company associated with this account',
      });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company profile not found',
      });
    }

    const { name, industry, website, description, logoUrl, hrContact } = req.body;

    if (name && name.trim().toLowerCase() !== company.name.toLowerCase()) {
      const existing = await Company.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: company._id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Another company with this name already exists',
        });
      }
      company.name = name.trim();
    }

    if (industry !== undefined) company.industry = industry.trim();
    if (website !== undefined) company.website = website.trim();
    if (description !== undefined) company.description = description.trim();
    if (logoUrl !== undefined) company.logoUrl = logoUrl.trim();

    if (hrContact) {
      company.hrContact = {
        name: hrContact.name !== undefined ? hrContact.name.trim() : company.hrContact?.name || '',
        email:
          hrContact.email !== undefined
            ? hrContact.email.trim().toLowerCase()
            : company.hrContact?.email || '',
        phone:
          hrContact.phone !== undefined ? hrContact.phone.trim() : company.hrContact?.phone || '',
      };
    }

    await company.save();

    res.status(200).json({
      success: true,
      message: 'Company profile updated successfully',
      company,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getMyCompanyProfile,
  updateMyCompanyProfile,
};

