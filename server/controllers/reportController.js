const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { Student, Application, Offer, Drive, Company, College, User } = require('../models');
const { sanitizeSpreadsheetValue, escapeCsvCell } = require('../utils/spreadsheet');

/**
 * Resolves the collegeId and filters from user context and query params
 */
const getReportScope = (req) => {
  let collegeId;
  if (req.user.role === 'tpo') {
    collegeId = req.user.college?._id || req.user.college;
    if (!collegeId) {
      return { errorStatus: 403, errorMessage: 'TPO account is not associated with any college' };
    }
  } else if (req.user.role === 'superadmin') {
    if (!req.query.collegeId) {
      return { errorStatus: 400, errorMessage: 'collegeId is required for superadmin' };
    }
    collegeId = req.query.collegeId;
  } else {
    return { errorStatus: 403, errorMessage: 'Not authorized: only TPOs and superadmins can view placement reports' };
  }

  if (!mongoose.Types.ObjectId.isValid(collegeId)) {
    return { errorStatus: 400, errorMessage: 'Invalid college ID format' };
  }

  const collegeObjId = new mongoose.Types.ObjectId(collegeId);

  const yearParam = req.query.academicYear || req.query.batch || req.query.batchYear;
  let batchYear = null;
  if (yearParam !== undefined && yearParam !== null && yearParam !== '' && !isNaN(Number(yearParam))) {
    batchYear = Number(yearParam);
  }

  const deptParam = req.query.department || req.query.branch;
  let branch = null;
  if (deptParam && typeof deptParam === 'string' && deptParam.trim()) {
    branch = deptParam.trim().toUpperCase();
  }

  return { collegeObjId, batchYear, branch };
};

/**
 * Helper to compute placement report data using MongoDB aggregation pipelines
 */
async function computePlacementReportData({ collegeObjId, batchYear, branch }) {
  // 1. Student aggregation (matching college & filters)
  const studentMatch = { college: collegeObjId };
  if (batchYear) studentMatch.batchYear = batchYear;
  if (branch) studentMatch.branch = branch;

  const studentAgg = await Student.aggregate([
    { $match: studentMatch },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalStudents: { $sum: 1 },
              verifiedStudents: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$userDoc.isEmailVerified', true] },
                        { $eq: ['$isVerified', true] },
                        { $eq: ['$verified', true] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              studentIds: { $push: '$_id' },
            },
          },
        ],
        departmentWise: [
          {
            $group: {
              _id: '$branch',
              total: { $sum: 1 },
              studentIds: { $push: '$_id' },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const summaryStudentData = studentAgg[0]?.summary[0] || {
    totalStudents: 0,
    verifiedStudents: 0,
    studentIds: [],
  };
  const totalStudents = summaryStudentData.totalStudents;
  const verifiedStudents = summaryStudentData.verifiedStudents;
  const matchedStudentIds = summaryStudentData.studentIds;

  // 2. Registered for Placement (unique students among matched cohort with at least 1 application)
  let registeredCount = 0;
  if (matchedStudentIds.length > 0) {
    const registeredAgg = await Application.aggregate([
      { $match: { student: { $in: matchedStudentIds } } },
      { $group: { _id: '$student' } },
      { $count: 'count' },
    ]);
    registeredCount = registeredAgg[0]?.count || 0;
  }

  // 3. Offers match pipeline
  const offerMatchPipeline = [
    {
      $lookup: {
        from: 'students',
        localField: 'student',
        foreignField: '_id',
        as: 'studentDoc',
      },
    },
    { $unwind: '$studentDoc' },
    {
      $match: {
        $or: [
          { college: collegeObjId },
          { 'studentDoc.college': collegeObjId },
        ],
        ...(batchYear && { 'studentDoc.batchYear': batchYear }),
        ...(branch && { 'studentDoc.branch': branch }),
      },
    },
  ];

  // 4. Placed students (Offer status === 'accepted')
  // Group by student so each student is counted once, and take highest accepted package
  const placedStudentsAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    { $match: { status: 'accepted' } },
    {
      $group: {
        _id: '$student',
        department: { $first: '$studentDoc.branch' },
        studentId: { $first: '$student' },
        packages: {
          $push: {
            $cond: [
              {
                $and: [
                  { $ne: ['$packageLpa', null] },
                  { $isNumber: '$packageLpa' },
                  { $gte: ['$packageLpa', 0] },
                ],
              },
              '$packageLpa',
              '$$REMOVE',
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        department: 1,
        studentId: 1,
        highestPackage: {
          $cond: [
            { $gt: [{ $size: '$packages' }, 0] },
            { $max: '$packages' },
            null,
          ],
        },
      },
    },
  ]);

  const placedStudents = placedStudentsAgg.length;
  // Computed honestly from unique applicants among matched cohort
  const registeredForPlacement = registeredCount;
  const unplacedCount = Math.max(0, totalStudents - placedStudents);
  const placementPercentage =
    totalStudents > 0 ? Number(((placedStudents / totalStudents) * 100).toFixed(2)) : 0;

  // 5. Total offers (all offers extended to matched students)
  const totalOffersAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    { $count: 'totalOffers' },
  ]);
  const totalOffers = totalOffersAgg[0]?.totalOffers || 0;

  // 6. Package metrics
  // "students with no package value (exclude from package stats, don't count as 0)"
  const validStudentPackages = placedStudentsAgg
    .map((s) => s.highestPackage)
    .filter((p) => typeof p === 'number' && !isNaN(p));

  let averagePackage = 0;
  let medianPackage = 0;
  let highestPackage = 0;
  let lowestPackage = 0;

  if (validStudentPackages.length > 0) {
    highestPackage = Number(Math.max(...validStudentPackages).toFixed(2));
    lowestPackage = Number(Math.min(...validStudentPackages).toFixed(2));
    averagePackage = Number(
      (validStudentPackages.reduce((a, b) => a + b, 0) / validStudentPackages.length).toFixed(2)
    );

    const sorted = [...validStudentPackages].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianPackage =
      sorted.length % 2 !== 0
        ? Number(sorted[mid].toFixed(2))
        : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }

  // 7. Department-wise breakdown
  const deptPlacedMap = new Map();
  for (const s of placedStudentsAgg) {
    const dept = (s.department || 'UNKNOWN').toUpperCase();
    if (!deptPlacedMap.has(dept)) {
      deptPlacedMap.set(dept, []);
    }
    if (typeof s.highestPackage === 'number' && !isNaN(s.highestPackage)) {
      deptPlacedMap.get(dept).push(s.highestPackage);
    } else {
      deptPlacedMap.get(dept).push(null);
    }
  }

  const deptStudentGroups = studentAgg[0]?.departmentWise || [];
  const allDepts = Array.from(
    new Set([
      ...deptStudentGroups.map((d) => d._id),
      ...Array.from(deptPlacedMap.keys()),
    ])
  )
    .filter(Boolean)
    .sort();

  const departmentWise = allDepts.map((dept) => {
    const total = deptStudentGroups.find((d) => d._id === dept)?.total || 0;
    const deptPackagesRaw = deptPlacedMap.get(dept) || [];
    const placed = deptPackagesRaw.length;
    const pct = total > 0 ? Number(((placed / total) * 100).toFixed(2)) : 0;
    const numericPackages = deptPackagesRaw.filter((p) => typeof p === 'number' && !isNaN(p));
    const avgPkg =
      numericPackages.length > 0
        ? Number((numericPackages.reduce((a, b) => a + b, 0) / numericPackages.length).toFixed(2))
        : 0;
    const highPkg =
      numericPackages.length > 0 ? Number(Math.max(...numericPackages).toFixed(2)) : 0;

    return {
      department: dept,
      total,
      placed,
      placementPercentage: pct,
      avgPackage: avgPkg,
      highestPackage: highPkg,
    };
  });

  // 8. Company-wise breakdown
  const companyOffersAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    {
      $lookup: {
        from: 'companies',
        localField: 'company',
        foreignField: '_id',
        as: 'compDoc',
      },
    },
    { $unwind: { path: '$compDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$company',
        companyName: { $first: '$compDoc.name' },
        offers: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        acceptedPackages: {
          $push: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'accepted'] },
                  { $ne: ['$packageLpa', null] },
                  { $isNumber: '$packageLpa' },
                  { $gte: ['$packageLpa', 0] },
                ],
              },
              '$packageLpa',
              '$$REMOVE',
            ],
          },
        },
      },
    },
  ]);

  const companyDrivesAgg = await Drive.aggregate([
    { $match: { college: collegeObjId } },
    {
      $lookup: {
        from: 'applications',
        let: { driveId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$drive', '$$driveId'] } } },
          ...(matchedStudentIds.length > 0 ? [{ $match: { student: { $in: matchedStudentIds } } }] : []),
        ],
        as: 'matchedApps',
      },
    },
    {
      $lookup: {
        from: 'companies',
        localField: 'company',
        foreignField: '_id',
        as: 'compDoc',
      },
    },
    { $unwind: { path: '$compDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$company',
        companyName: { $first: '$compDoc.name' },
        drivesCount: { $sum: 1 },
        applicantStudents: { $push: '$matchedApps.student' },
      },
    },
  ]);

  const companyMap = new Map();
  for (const c of companyDrivesAgg) {
    const key = c._id ? c._id.toString() : 'unknown';
    const uniqueApplicants = new Set(
      c.applicantStudents
        .flat()
        .filter(Boolean)
        .map((id) => id.toString())
    ).size;
    companyMap.set(key, {
      company: c.companyName || 'Unknown Company',
      drives: c.drivesCount || 0,
      applicants: uniqueApplicants,
      offers: 0,
      accepted: 0,
      avgPackage: 0,
      _packages: [],
    });
  }

  for (const o of companyOffersAgg) {
    const key = o._id ? o._id.toString() : 'unknown';
    if (!companyMap.has(key)) {
      companyMap.set(key, {
        company: o.companyName || 'Unknown Company',
        drives: 0,
        applicants: 0,
        offers: 0,
        accepted: 0,
        avgPackage: 0,
        _packages: [],
      });
    }
    const entry = companyMap.get(key);
    if (!entry.company || entry.company === 'Unknown Company') {
      entry.company = o.companyName || 'Unknown Company';
    }
    entry.offers = o.offers || 0;
    entry.accepted = o.accepted || 0;
    entry._packages = o.acceptedPackages || [];
    if (entry._packages.length > 0) {
      entry.avgPackage = Number(
        (entry._packages.reduce((a, b) => a + b, 0) / entry._packages.length).toFixed(2)
      );
    }
  }

  const companyWise = Array.from(companyMap.values()).map(({ _packages, ...item }) => item);
  companyWise.sort((a, b) => b.accepted - a.accepted || b.offers - a.offers || a.company.localeCompare(b.company));

  // 9. Drive-wise breakdown
  const driveWiseAgg = await Drive.aggregate([
    { $match: { college: collegeObjId } },
    {
      $lookup: {
        from: 'companies',
        localField: 'company',
        foreignField: '_id',
        as: 'companyDoc',
      },
    },
    { $unwind: { path: '$companyDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'applications',
        let: { driveId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$drive', '$$driveId'] } } },
          ...(matchedStudentIds.length > 0 ? [{ $match: { student: { $in: matchedStudentIds } } }] : []),
        ],
        as: 'apps',
      },
    },
    {
      $lookup: {
        from: 'offers',
        let: { driveId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$drive', '$$driveId'] } } },
          ...(matchedStudentIds.length > 0 ? [{ $match: { student: { $in: matchedStudentIds } } }] : []),
        ],
        as: 'driveOffers',
      },
    },
    {
      $project: {
        driveTitle: '$role',
        company: { $ifNull: ['$companyDoc.name', 'Unknown Company'] },
        date: '$driveDate',
        applied: { $size: '$apps' },
        shortlisted: {
          $size: {
            $filter: {
              input: '$apps',
              as: 'a',
              cond: {
                $in: ['$$a.status', ['shortlisted', 'interview', 'selected']],
              },
            },
          },
        },
        offered: { $size: '$driveOffers' },
        accepted: {
          $size: {
            $filter: {
              input: '$driveOffers',
              as: 'o',
              cond: { $eq: ['$$o.status', 'accepted'] },
            },
          },
        },
      },
    },
    { $sort: { date: -1 } },
  ]);

  const driveWise = driveWiseAgg.map((d) => ({
    driveTitle: d.driveTitle || 'Placement Drive',
    company: d.company,
    date: d.date,
    applied: d.applied,
    shortlisted: d.shortlisted,
    offered: d.offered,
    accepted: d.accepted,
  }));

  // 10. Monthly Trend (offers per month in Asia/Kolkata +05:30)
  const monthlyTrendAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m',
            date: { $ifNull: ['$offeredAt', '$createdAt'] },
            timezone: '+05:30',
          },
        },
        offers: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        month: '$_id',
        offers: 1,
        accepted: 1,
      },
    },
  ]);

  const monthlyTrend = monthlyTrendAgg.filter((m) => m.month);

  // 11. Package Distribution for visual chart
  const packageRanges = [
    { range: '< 5 LPA', min: 0, max: 5 },
    { range: '5 - 10 LPA', min: 5, max: 10 },
    { range: '10 - 15 LPA', min: 10, max: 15 },
    { range: '15 - 20 LPA', min: 15, max: 20 },
    { range: '> 20 LPA', min: 20, max: Infinity },
  ];

  const packageDistribution = packageRanges.map((r) => {
    const count = validStudentPackages.filter((p) => {
      if (r.max === Infinity) return p > r.min;
      return p >= r.min && p < r.max;
    }).length;
    return { range: r.range, count };
  });

  // 12. Placed students roster for report export (strictly without passwords, hashes, tokens)
  const placedStudentsListAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    { $match: { status: 'accepted' } },
    {
      $lookup: {
        from: 'users',
        localField: 'studentDoc.user',
        foreignField: '_id',
        as: 'studentUser',
      },
    },
    { $unwind: { path: '$studentUser', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'companies',
        localField: 'company',
        foreignField: '_id',
        as: 'compDoc',
      },
    },
    { $unwind: { path: '$compDoc', preserveNullAndEmptyArrays: true } },
    { $sort: { packageLpa: -1 } },
    {
      $group: {
        _id: '$student',
        name: { $first: '$studentUser.name' },
        rollNo: { $first: '$studentDoc.enrollmentNo' },
        department: { $first: '$studentDoc.branch' },
        company: { $first: '$compDoc.name' },
        package: { $first: '$packageLpa' },
      },
    },
    { $sort: { department: 1, name: 1 } },
    {
      $project: {
        _id: 0,
        name: { $ifNull: ['$name', 'Student'] },
        rollNo: { $ifNull: ['$rollNo', '—'] },
        department: { $ifNull: ['$department', '—'] },
        company: { $ifNull: ['$company', '—'] },
        package: { $ifNull: ['$package', '—'] },
      },
    },
  ]);

  const summary = {
    totalStudents,
    verifiedStudents,
    registeredForPlacement,
    placedStudents,
    placementPercentage,
    unplacedCount,
    totalOffers,
    averagePackage,
    medianPackage,
    highestPackage,
    lowestPackage,
  };

  return {
    summary,
    departmentWise,
    companyWise,
    driveWise,
    monthlyTrend,
    packageDistribution,
    placedStudentsList: placedStudentsListAgg,
  };
}

/**
 * @desc    Get comprehensive placement report for college TPO / Superadmin
 * @route   GET /api/reports/placement
 * @access  Private (TPO: own college, Superadmin: collegeId param)
 */
const getPlacementReport = async (req, res, next) => {
  try {
    const scope = getReportScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({ success: false, message: scope.errorMessage });
    }

    const reportData = await computePlacementReportData(scope);

    return res.status(200).json({
      success: true,
      message: 'Placement report generated successfully',
      data: {
        summary: reportData.summary,
        departmentWise: reportData.departmentWise,
        companyWise: reportData.companyWise,
        driveWise: reportData.driveWise,
        monthlyTrend: reportData.monthlyTrend,
        packageDistribution: reportData.packageDistribution,
      },
      summary: reportData.summary,
      departmentWise: reportData.departmentWise,
      companyWise: reportData.companyWise,
      driveWise: reportData.driveWise,
      monthlyTrend: reportData.monthlyTrend,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export placement report in Excel (.xlsx) or CSV format
 * @route   GET /api/reports/placement/export?format=xlsx|csv
 * @access  Private (TPO: own college, Superadmin: collegeId param)
 */
const exportPlacementReport = async (req, res, next) => {
  try {
    const scope = getReportScope(req);
    if (scope.errorStatus) {
      return res.status(scope.errorStatus).json({ success: false, message: scope.errorMessage });
    }

    const reportData = await computePlacementReportData(scope);
    const format = (req.query.format || req.query.type || 'xlsx').toLowerCase();

    // Fetch college metadata for nice filenames
    const college = await College.findById(scope.collegeObjId).select('name code');
    const collegeCode = college?.code || 'college';
    const timestamp = Date.now();

    if (format === 'csv') {
      // CSV returns the placed-students list safely formatted
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="placed_students_${collegeCode}_${timestamp}.csv"`
      );

      const header = ['Name', 'Roll No', 'Department', 'Company', 'Package (LPA)'];
      const rows = reportData.placedStudentsList.map((s) => [
        escapeCsvCell(s.name),
        escapeCsvCell(s.rollNo),
        escapeCsvCell(s.department),
        escapeCsvCell(s.company),
        escapeCsvCell(typeof s.package === 'number' ? s.package : (s.package !== null && s.package !== undefined ? s.package : '—')),
      ]);

      const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      return res.status(200).send(csvContent);
    }

    // Default: Excel (xlsx) using exceljs
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Placement Management System';
    workbook.created = new Date();

    // 1. Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 34 },
      { header: 'Value', key: 'value', width: 22 },
    ];
    summarySheet.getRow(1).font = { bold: true };

    const summaryRows = [
      { metric: 'Total Students', value: reportData.summary.totalStudents },
      { metric: 'Verified Students', value: reportData.summary.verifiedStudents },
      { metric: 'Registered for Placement', value: reportData.summary.registeredForPlacement },
      { metric: 'Placed Students', value: reportData.summary.placedStudents },
      { metric: 'Placement Percentage (%)', value: `${reportData.summary.placementPercentage}%` },
      { metric: 'Unplaced Count', value: reportData.summary.unplacedCount },
      { metric: 'Total Offers', value: reportData.summary.totalOffers },
      { metric: 'Average Package (LPA)', value: reportData.summary.averagePackage },
      { metric: 'Median Package (LPA)', value: reportData.summary.medianPackage },
      { metric: 'Highest Package (LPA)', value: reportData.summary.highestPackage },
      { metric: 'Lowest Package (LPA)', value: reportData.summary.lowestPackage },
    ];
    summaryRows.forEach((row) => {
      summarySheet.addRow({
        metric: sanitizeSpreadsheetValue(row.metric),
        value: typeof row.value === 'number' ? row.value : sanitizeSpreadsheetValue(row.value),
      });
    });

    // 2. Department-wise Sheet
    const deptSheet = workbook.addWorksheet('Department-wise');
    deptSheet.columns = [
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Total Students', key: 'total', width: 16 },
      { header: 'Placed Students', key: 'placed', width: 16 },
      { header: 'Placement %', key: 'placementPercentage', width: 16 },
      { header: 'Average Package (LPA)', key: 'avgPackage', width: 24 },
      { header: 'Highest Package (LPA)', key: 'highestPackage', width: 24 },
    ];
    deptSheet.getRow(1).font = { bold: true };
    reportData.departmentWise.forEach((d) => {
      deptSheet.addRow({
        department: sanitizeSpreadsheetValue(d.department),
        total: d.total,
        placed: d.placed,
        placementPercentage: `${d.placementPercentage}%`,
        avgPackage: d.avgPackage,
        highestPackage: d.highestPackage,
      });
    });

    // 3. Company-wise Sheet
    const compSheet = workbook.addWorksheet('Company-wise');
    compSheet.columns = [
      { header: 'Company', key: 'company', width: 28 },
      { header: 'Drives', key: 'drives', width: 12 },
      { header: 'Applicants', key: 'applicants', width: 14 },
      { header: 'Offers Extended', key: 'offers', width: 16 },
      { header: 'Offers Accepted', key: 'accepted', width: 16 },
      { header: 'Average Package (LPA)', key: 'avgPackage', width: 22 },
    ];
    compSheet.getRow(1).font = { bold: true };
    reportData.companyWise.forEach((c) => {
      compSheet.addRow({
        company: sanitizeSpreadsheetValue(c.company),
        drives: c.drives,
        applicants: c.applicants,
        offers: c.offers,
        accepted: c.accepted,
        avgPackage: c.avgPackage,
      });
    });

    // 4. Drive-wise Sheet
    const driveSheet = workbook.addWorksheet('Drive-wise');
    driveSheet.columns = [
      { header: 'Drive Title', key: 'driveTitle', width: 28 },
      { header: 'Company', key: 'company', width: 24 },
      { header: 'Drive Date', key: 'date', width: 18 },
      { header: 'Applied', key: 'applied', width: 12 },
      { header: 'Shortlisted', key: 'shortlisted', width: 14 },
      { header: 'Offered', key: 'offered', width: 12 },
      { header: 'Accepted', key: 'accepted', width: 12 },
    ];
    driveSheet.getRow(1).font = { bold: true };
    reportData.driveWise.forEach((d) => {
      driveSheet.addRow({
        driveTitle: sanitizeSpreadsheetValue(d.driveTitle),
        company: sanitizeSpreadsheetValue(d.company),
        date: sanitizeSpreadsheetValue(d.date ? new Date(d.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'),
        applied: d.applied,
        shortlisted: d.shortlisted,
        offered: d.offered,
        accepted: d.accepted,
      });
    });

    // 5. Placed Students Sheet (Strictly no passwords, tokens, hashes; formula-neutralized)
    const placedSheet = workbook.addWorksheet('Placed Students');
    placedSheet.columns = [
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Roll No', key: 'rollNo', width: 18 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Company', key: 'company', width: 24 },
      { header: 'Package (LPA)', key: 'package', width: 16 },
    ];
    placedSheet.getRow(1).font = { bold: true };
    reportData.placedStudentsList.forEach((s) => {
      placedSheet.addRow({
        name: sanitizeSpreadsheetValue(s.name),
        rollNo: sanitizeSpreadsheetValue(s.rollNo),
        department: sanitizeSpreadsheetValue(s.department),
        company: sanitizeSpreadsheetValue(s.company),
        package: typeof s.package === 'number' ? s.package : sanitizeSpreadsheetValue(s.package || '—'),
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="placement_report_${collegeCode}_${timestamp}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlacementReport,
  exportPlacementReport,
  computePlacementReportData,
};

