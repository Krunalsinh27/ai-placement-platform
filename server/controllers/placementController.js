const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { Placement, Student, Company } = require('../models');
const { sanitizeSpreadsheetValue, escapeCsvCell } = require('../utils/spreadsheet');

/**
 * @desc    Get placements with filters by year, branch, company
 *          Admins can view all (filtered); Students view their own placements.
 * @route   GET /api/placements
 * @access  Private (Admin & Student)
 */
const getPlacements = async (req, res, next) => {
  try {
    const { year, batchYear, branch, company, page = 1, limit = 50 } = req.query;
    const query = {};

    // 1. If student, restrict to their own placement record(s)
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found',
        });
      }
      query.student = student._id;
    } else {
      // 2. Admin filters: year & branch reside in Student model + college scoping for TPO
      const studentFilters = {};
      if (req.user?.college) {
        studentFilters.college = req.user.college._id || req.user.college;
      }
      const targetYear = batchYear || year;
      if (targetYear) {
        studentFilters.batchYear = Number(targetYear);
      }
      if (branch) {
        studentFilters.branch = branch.trim().toUpperCase();
      }

      if (Object.keys(studentFilters).length > 0) {
        const matchingStudents = await Student.find(studentFilters).select('_id');
        query.student = { $in: matchingStudents.map((s) => s._id) };
      }

      // Filter by company (ID or name search)
      if (company) {
        if (mongoose.Types.ObjectId.isValid(company)) {
          query.company = company;
        } else {
          const matchingCompanies = await Company.find({
            name: { $regex: company.trim(), $options: 'i' },
          }).select('_id');
          query.company = { $in: matchingCompanies.map((c) => c._id) };
        }
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Placement.countDocuments(query);
    const placements = await Placement.find(query)
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('drive')
      .populate('company')
      .sort({ offerDate: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: placements,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: placements.length,
      placements,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently logged-in student's placement offers
 * @route   GET /api/placements/my
 * @access  Private (Student only)
 */
const getMyPlacements = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Placement.countDocuments({ student: student._id });
    const placements = await Placement.find({ student: student._id })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('drive')
      .populate('company')
      .sort({ offerDate: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: placements,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: placements.length,
      placements,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export placement records as formatted Excel (.xlsx) spreadsheet
 * @route   GET /api/placements/export/excel
 * @access  Private (Admin only)
 */
const exportPlacementsExcel = async (req, res, next) => {
  try {
    const { year, batchYear, branch, company } = req.query;
    const query = {};

    const studentFilters = {};
    if (req.user?.college) {
      studentFilters.college = req.user.college._id || req.user.college;
    }
    const targetYear = batchYear || year;
    if (targetYear) studentFilters.batchYear = Number(targetYear);
    if (branch && branch !== 'ALL') studentFilters.branch = branch.trim().toUpperCase();

    if (Object.keys(studentFilters).length > 0) {
      const matchingStudents = await Student.find(studentFilters).select('_id');
      query.student = { $in: matchingStudents.map((s) => s._id) };
    }

    if (company && company !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(company)) {
        query.company = company;
      } else {
        const matchingCompanies = await Company.find({
          name: { $regex: company.trim(), $options: 'i' },
        }).select('_id');
        query.company = { $in: matchingCompanies.map((c) => c._id) };
      }
    }

    const placements = await Placement.find(query)
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('drive')
      .populate('company')
      .sort({ offerDate: -1 });

    const format = (req.query.format || req.query.type || 'xlsx').toLowerCase();
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=placement_records_${Date.now()}.csv`
      );
      const header = [
        'S.No',
        'Student Name',
        'Enrollment No',
        'Email Address',
        'Branch',
        'Batch Year',
        'CGPA',
        'Company Name',
        'Job Designation',
        'Package (LPA)',
        'Offer Date',
      ];
      const rows = placements.map((p, idx) => [
        escapeCsvCell(idx + 1),
        escapeCsvCell(p.student?.user?.name || '—'),
        escapeCsvCell(p.student?.enrollmentNo || '—'),
        escapeCsvCell(p.student?.user?.email || '—'),
        escapeCsvCell(p.student?.branch || '—'),
        escapeCsvCell(p.student?.batchYear || '—'),
        escapeCsvCell(p.student?.cgpa || '—'),
        escapeCsvCell(p.company?.name || '—'),
        escapeCsvCell(p.drive?.role || '—'),
        escapeCsvCell(typeof p.packageLpa === 'number' ? p.packageLpa : (p.packageLpa || '—')),
        escapeCsvCell(p.offerDate ? new Date(p.offerDate).toLocaleDateString() : '—'),
      ]);
      const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      return res.status(200).send(csvContent);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'College Placement Record Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Placement Records');

    // Define worksheet columns
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Student Name', key: 'name', width: 24 },
      { header: 'Enrollment No', key: 'enrollmentNo', width: 18 },
      { header: 'Email Address', key: 'email', width: 26 },
      { header: 'Branch', key: 'branch', width: 12 },
      { header: 'Batch Year', key: 'batchYear', width: 14 },
      { header: 'CGPA', key: 'cgpa', width: 10 },
      { header: 'Company Name', key: 'company', width: 24 },
      { header: 'Job Designation', key: 'role', width: 22 },
      { header: 'Package (LPA)', key: 'packageLpa', width: 16 },
      { header: 'Offer Date', key: 'offerDate', width: 15 },
    ];

    // Format Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }, // Indigo-600
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add Data Rows
    placements.forEach((p, idx) => {
      const row = worksheet.addRow({
        sno: idx + 1,
        name: sanitizeSpreadsheetValue(p.student?.user?.name || '—'),
        enrollmentNo: sanitizeSpreadsheetValue(p.student?.enrollmentNo || '—'),
        email: sanitizeSpreadsheetValue(p.student?.user?.email || '—'),
        branch: sanitizeSpreadsheetValue(p.student?.branch || '—'),
        batchYear: typeof p.student?.batchYear === 'number' ? p.student.batchYear : sanitizeSpreadsheetValue(p.student?.batchYear || '—'),
        cgpa: typeof p.student?.cgpa === 'number' ? p.student.cgpa : sanitizeSpreadsheetValue(p.student?.cgpa || '—'),
        company: sanitizeSpreadsheetValue(p.company?.name || '—'),
        role: sanitizeSpreadsheetValue(p.drive?.role || '—'),
        packageLpa: typeof p.packageLpa === 'number' ? p.packageLpa : sanitizeSpreadsheetValue(p.packageLpa || '—'),
        offerDate: sanitizeSpreadsheetValue(p.offerDate ? new Date(p.offerDate).toLocaleDateString() : '—'),
      });

      row.height = 20;
      row.alignment = { vertical: 'middle' };

      // Alternating row styling
      if (idx % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=placement_records_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlacements,
  getMyPlacements,
  exportPlacementsExcel,
};

