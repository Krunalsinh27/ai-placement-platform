const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const { Student, Application, Placement, Company, Drive } = require('../models');

/**
 * Helper to construct student match filters from query params and user college context
 */
const getStudentMatch = (query, user) => {
  const match = {};
  if (query.batchYear) {
    match.batchYear = Number(query.batchYear);
  }
  if (query.branch) {
    match.branch = query.branch.trim().toUpperCase();
  }
  if (user?.college) {
    const collegeId = user.college._id || user.college;
    match.college = new mongoose.Types.ObjectId(collegeId);
  } else if (query.college) {
    match.college = new mongoose.Types.ObjectId(query.college);
  }
  return match;
};

/**
 * @desc    Get overall placement overview statistics
 *          Note: Placement records are created strictly upon student acceptance of an offer (Task 23 v2).
 *          Only accepted offers generate Placement records and count towards placement metrics.
 * @route   GET /api/stats/overview
 * @access  Private
 */
const getOverviewStats = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    // 1. Total matching students
    const studentIds = (await Student.find(studentMatch).select('_id')).map((s) => s._id);
    const totalStudents = studentIds.length;

    if (totalStudents === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalStudents: 0,
          totalApplied: 0,
          totalPlaced: 0,
          placementPercentage: 0,
          highestPackage: 0,
          lowestPackage: 0,
          averagePackage: 0,
        },
      });
    }

    // 2. Total unique students who applied to at least one drive
    const appliedAggregation = await Application.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $group: { _id: '$student' } },
      { $count: 'totalApplied' },
    ]);
    const totalApplied = appliedAggregation[0]?.totalApplied || 0;

    // 3. Unique placed students & package statistics
    const placementAggregation = await Placement.aggregate([
      { $match: { student: { $in: studentIds } } },
      {
        $group: {
          _id: null,
          uniquePlacedStudents: { $addToSet: '$student' },
          highestPackage: { $max: '$packageLpa' },
          lowestPackage: { $min: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $project: {
          _id: 0,
          totalPlaced: { $size: '$uniquePlacedStudents' },
          highestPackage: 1,
          lowestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
    ]);

    const placementData = placementAggregation[0] || {
      totalPlaced: 0,
      highestPackage: 0,
      lowestPackage: 0,
      averagePackage: 0,
    };

    const totalPlaced = placementData.totalPlaced;
    const placementPercentage =
      totalStudents > 0
        ? Number(((totalPlaced / totalStudents) * 100).toFixed(2))
        : 0;

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalApplied,
        totalPlaced,
        placementPercentage,
        highestPackage: placementData.highestPackage || 0,
        lowestPackage: placementData.lowestPackage || 0,
        averagePackage: placementData.averagePackage || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get placement statistics grouped by branch
 * @route   GET /api/stats/by-branch
 * @access  Private
 */
const getStatsByBranch = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    const branchStats = await Student.aggregate([
      { $match: studentMatch },
      // Lookup placements to identify if student was placed
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          branch: '$branch',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$branch',
          totalStudents: { $sum: 1 },
          placed: {
            $sum: { $cond: ['$isPlaced', 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          branch: '$_id',
          totalStudents: 1,
          placed: 1,
          placementPercentage: {
            $cond: [
              { $gt: ['$totalStudents', 0] },
              {
                $round: [
                  {
                    $multiply: [{ $divide: ['$placed', '$totalStudents'] }, 100],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { branch: 1 } },
    ]);

    res.status(200).json({
      success: true,
      count: branchStats.length,
      data: branchStats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get placement statistics grouped by batch year
 * @route   GET /api/stats/by-year
 * @access  Private
 */
const getStatsByYear = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    // 1. Student counts & placed counts by year
    const yearStudentCounts = await Student.aggregate([
      { $match: studentMatch },
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          batchYear: '$batchYear',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$batchYear',
          totalStudents: { $sum: 1 },
          placed: { $sum: { $cond: ['$isPlaced', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2. Average package by year from Placements
    const yearPackageStats = await Placement.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      ...(studentMatch.batchYear || studentMatch.branch || studentMatch.college
        ? [
            {
              $match: {
                ...(studentMatch.batchYear && { 'student.batchYear': studentMatch.batchYear }),
                ...(studentMatch.branch && { 'student.branch': studentMatch.branch }),
                ...(studentMatch.college && { 'student.college': studentMatch.college }),
              },
            },
          ]
        : []),
      {
        $group: {
          _id: '$student.batchYear',
          avgPackage: { $avg: '$packageLpa' },
          highestPackage: { $max: '$packageLpa' },
        },
      },
    ]);

    // Map packages into a lookup table by year
    const packageMap = {};
    yearPackageStats.forEach((p) => {
      packageMap[p._id] = {
        avgPackage: Number(p.avgPackage.toFixed(2)),
        highestPackage: p.highestPackage,
      };
    });

    const data = yearStudentCounts.map((item) => {
      const year = item._id;
      const totalStudents = item.totalStudents;
      const placed = item.placed;
      const placementPercentage =
        totalStudents > 0 ? Number(((placed / totalStudents) * 100).toFixed(2)) : 0;
      const pkgInfo = packageMap[year] || { avgPackage: 0, highestPackage: 0 };

      return {
        batchYear: year,
        totalStudents,
        placed,
        placementPercentage,
        averagePackage: pkgInfo.avgPackage,
        highestPackage: pkgInfo.highestPackage,
      };
    });

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get metrics for each company (drives count, applicants, selected, rate, package)
 * @route   GET /api/stats/by-company
 * @access  Private
 */
const getStatsByCompany = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    const companies = await Company.aggregate([
      // Lookup all drives for this company
      {
        $lookup: {
          from: 'drives',
          localField: '_id',
          foreignField: 'company',
          as: 'drives',
        },
      },
      // Lookup placements (filtered by student criteria if provided)
      {
        $lookup: {
          from: 'placements',
          let: { companyId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$company', '$$companyId'] } } },
            {
              $lookup: {
                from: 'students',
                localField: 'student',
                foreignField: '_id',
                as: 'student',
              },
            },
            { $unwind: '$student' },
            ...(studentMatch.batchYear || studentMatch.branch || studentMatch.college
              ? [
                  {
                    $match: {
                      ...(studentMatch.batchYear && {
                        'student.batchYear': studentMatch.batchYear,
                      }),
                      ...(studentMatch.branch && {
                        'student.branch': studentMatch.branch,
                      }),
                      ...(studentMatch.college && {
                        'student.college': studentMatch.college,
                      }),
                    },
                  },
                ]
              : []),
          ],
          as: 'filteredPlacements',
        },
      },
      // Lookup applications via drives (filtered by student criteria if provided)
      {
        $lookup: {
          from: 'applications',
          let: { driveIds: '$drives._id' },
          pipeline: [
            { $match: { $expr: { $in: ['$drive', '$$driveIds'] } } },
            {
              $lookup: {
                from: 'students',
                localField: 'student',
                foreignField: '_id',
                as: 'student',
              },
            },
            { $unwind: '$student' },
            ...(studentMatch.batchYear || studentMatch.branch || studentMatch.college
              ? [
                  {
                    $match: {
                      ...(studentMatch.batchYear && {
                        'student.batchYear': studentMatch.batchYear,
                      }),
                      ...(studentMatch.branch && {
                        'student.branch': studentMatch.branch,
                      }),
                      ...(studentMatch.college && {
                        'student.college': studentMatch.college,
                      }),
                    },
                  },
                ]
              : []),
          ],
          as: 'filteredApplications',
        },
      },
      {
        $project: {
          _id: 1,
          companyId: '$_id',
          companyName: '$name',
          industry: '$industry',
          website: '$website',
          drivesCount: { $size: '$drives' },
          totalApplicants: { $size: '$filteredApplications' },
          selectedCount: { $size: '$filteredPlacements' },
          selectionRate: {
            $cond: [
              { $gt: [{ $size: '$filteredApplications' }, 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $size: '$filteredPlacements' },
                          { $size: '$filteredApplications' },
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          highestPackage: {
            $cond: [
              { $gt: [{ $size: '$filteredPlacements' }, 0] },
              { $max: '$filteredPlacements.packageLpa' },
              { $ifNull: [{ $max: '$drives.packageLpa' }, 0] },
            ],
          },
          averagePackage: {
            $cond: [
              { $gt: [{ $size: '$filteredPlacements' }, 0] },
              { $round: [{ $avg: '$filteredPlacements.packageLpa' }, 2] },
              { $ifNull: [{ $round: [{ $avg: '$drives.packageLpa' }, 2] }, 0] },
            ],
          },
        },
      },
      { $sort: { selectedCount: -1, totalApplicants: -1 } },
    ]);

    res.status(200).json({
      success: true,
      count: companies.length,
      data: companies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get top 10 companies by number of hires
 * @route   GET /api/stats/top-companies
 * @access  Private
 */
const getTopCompanies = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    const topCompanies = await Placement.aggregate([
      // Lookup student to apply batchYear / branch filters
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      ...(studentMatch.batchYear || studentMatch.branch || studentMatch.college
        ? [
            {
              $match: {
                ...(studentMatch.batchYear && {
                  'student.batchYear': studentMatch.batchYear,
                }),
                ...(studentMatch.branch && {
                  'student.branch': studentMatch.branch,
                }),
                ...(studentMatch.college && {
                  'student.college': studentMatch.college,
                }),
              },
            },
          ]
        : []),
      {
        $group: {
          _id: '$company',
          hiresCount: { $sum: 1 },
          highestPackage: { $max: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $lookup: {
          from: 'companies',
          localField: '_id',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: '$company' },
      {
        $project: {
          _id: 0,
          companyId: '$_id',
          companyName: '$company.name',
          industry: '$company.industry',
          hiresCount: 1,
          highestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
      { $sort: { hiresCount: -1, highestPackage: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      success: true,
      count: topCompanies.length,
      data: topCompanies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get public placement record (Aggregate statistics only - no student personal details)
 * @route   GET /api/stats/public
 * @access  Public
 */
const getPublicPlacementStats = async (req, res, next) => {
  try {
    const studentQuery = {};
    if (req.query.college) {
      studentQuery.college = new mongoose.Types.ObjectId(req.query.college);
    }

    // 1. Total students count
    const totalStudents = await Student.countDocuments(studentQuery);
    const collegeStudentIds = req.query.college
      ? (await Student.find(studentQuery).select('_id')).map((s) => s._id)
      : null;

    // 2. Overview placement stats
    const placementAggregation = await Placement.aggregate([
      ...(collegeStudentIds ? [{ $match: { student: { $in: collegeStudentIds } } }] : []),
      {
        $group: {
          _id: null,
          uniquePlacedStudents: { $addToSet: '$student' },
          highestPackage: { $max: '$packageLpa' },
          lowestPackage: { $min: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $project: {
          _id: 0,
          totalPlaced: { $size: '$uniquePlacedStudents' },
          highestPackage: 1,
          lowestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
    ]);

    const placementData = placementAggregation[0] || {
      totalPlaced: 0,
      highestPackage: 0,
      lowestPackage: 0,
      averagePackage: 0,
    };

    const totalPlaced = placementData.totalPlaced;
    const placementPercentage =
      totalStudents > 0
        ? Number(((totalPlaced / totalStudents) * 100).toFixed(2))
        : 0;

    // 3. Branch-wise statistics
    const branchStats = await Student.aggregate([
      ...(req.query.college ? [{ $match: studentQuery }] : []),
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          branch: '$branch',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$branch',
          totalStudents: { $sum: 1 },
          placed: { $sum: { $cond: ['$isPlaced', 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          branch: '$_id',
          totalStudents: 1,
          placed: 1,
          placementPercentage: {
            $cond: [
              { $gt: ['$totalStudents', 0] },
              {
                $round: [
                  {
                    $multiply: [{ $divide: ['$placed', '$totalStudents'] }, 100],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { branch: 1 } },
    ]);

    // 4. Year-wise historical trend
    const yearCounts = await Student.aggregate([
      ...(req.query.college ? [{ $match: studentQuery }] : []),
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          batchYear: '$batchYear',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$batchYear',
          totalStudents: { $sum: 1 },
          placed: { $sum: { $cond: ['$isPlaced', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const yearPackageStats = await Placement.aggregate([
      ...(collegeStudentIds ? [{ $match: { student: { $in: collegeStudentIds } } }] : []),
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $group: {
          _id: '$student.batchYear',
          avgPackage: { $avg: '$packageLpa' },
          highestPackage: { $max: '$packageLpa' },
        },
      },
    ]);

    const pkgMap = {};
    yearPackageStats.forEach((p) => {
      pkgMap[p._id] = {
        avgPackage: Number(p.avgPackage.toFixed(2)),
        highestPackage: p.highestPackage,
      };
    });

    const yearStats = yearCounts.map((item) => {
      const year = item._id;
      const total = item.totalStudents;
      const placed = item.placed;
      const pct = total > 0 ? Number(((placed / total) * 100).toFixed(2)) : 0;
      const pkg = pkgMap[year] || { avgPackage: 0, highestPackage: 0 };
      return {
        batchYear: year,
        totalStudents: total,
        placed,
        placementPercentage: pct,
        averagePackage: pkg.avgPackage,
        highestPackage: pkg.highestPackage,
      };
    });

    // 5. Top 10 Recruiters
    const topRecruiters = await Placement.aggregate([
      ...(collegeStudentIds ? [{ $match: { student: { $in: collegeStudentIds } } }] : []),
      {
        $group: {
          _id: '$company',
          hiresCount: { $sum: 1 },
          highestPackage: { $max: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $lookup: {
          from: 'companies',
          localField: '_id',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: '$company' },
      {
        $project: {
          _id: 0,
          companyName: '$company.name',
          industry: '$company.industry',
          website: '$company.website',
          hiresCount: 1,
          highestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
      { $sort: { hiresCount: -1, highestPackage: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalStudents,
          totalPlaced,
          placementPercentage,
          highestPackage: placementData.highestPackage || 0,
          averagePackage: placementData.averagePackage || 0,
        },
        branchStats,
        yearStats,
        topRecruiters,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export placement summary report as a professional PDF document
 * @route   GET /api/stats/export/pdf
 * @access  Private (Admin only)
 */
const exportSummaryPDF = async (req, res, next) => {
  try {
    const studentMatch = getStudentMatch(req.query, req.user);

    // 1. Gather all statistics
    const studentIds = (await Student.find(studentMatch).select('_id')).map((s) => s._id);
    const totalStudents = studentIds.length;

    const appliedAggregation = await Application.aggregate([
      { $match: { student: { $in: studentIds } } },
      { $group: { _id: '$student' } },
      { $count: 'totalApplied' },
    ]);
    const totalApplied = appliedAggregation[0]?.totalApplied || 0;

    const placementAggregation = await Placement.aggregate([
      { $match: { student: { $in: studentIds } } },
      {
        $group: {
          _id: null,
          uniquePlacedStudents: { $addToSet: '$student' },
          highestPackage: { $max: '$packageLpa' },
          lowestPackage: { $min: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $project: {
          _id: 0,
          totalPlaced: { $size: '$uniquePlacedStudents' },
          highestPackage: 1,
          lowestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
    ]);

    const placementData = placementAggregation[0] || {
      totalPlaced: 0,
      highestPackage: 0,
      lowestPackage: 0,
      averagePackage: 0,
    };
    const totalPlaced = placementData.totalPlaced;
    const placementPercentage =
      totalStudents > 0 ? Number(((totalPlaced / totalStudents) * 100).toFixed(2)) : 0;

    // Branch stats
    const branchStats = await Student.aggregate([
      { $match: studentMatch },
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          branch: '$branch',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$branch',
          totalStudents: { $sum: 1 },
          placed: { $sum: { $cond: ['$isPlaced', 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          branch: '$_id',
          totalStudents: 1,
          placed: 1,
          placementPercentage: {
            $cond: [
              { $gt: ['$totalStudents', 0] },
              {
                $round: [
                  {
                    $multiply: [{ $divide: ['$placed', '$totalStudents'] }, 100],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { branch: 1 } },
    ]);

    // Year stats
    const yearCounts = await Student.aggregate([
      { $match: studentMatch },
      {
        $lookup: {
          from: 'placements',
          localField: '_id',
          foreignField: 'student',
          as: 'placements',
        },
      },
      {
        $project: {
          batchYear: '$batchYear',
          isPlaced: { $gt: [{ $size: '$placements' }, 0] },
        },
      },
      {
        $group: {
          _id: '$batchYear',
          totalStudents: { $sum: 1 },
          placed: { $sum: { $cond: ['$isPlaced', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const yearPackageStats = await Placement.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      ...(studentMatch.batchYear || studentMatch.branch || studentMatch.college
        ? [
            {
              $match: {
                ...(studentMatch.batchYear && { 'student.batchYear': studentMatch.batchYear }),
                ...(studentMatch.branch && { 'student.branch': studentMatch.branch }),
                ...(studentMatch.college && { 'student.college': studentMatch.college }),
              },
            },
          ]
        : []),
      {
        $group: {
          _id: '$student.batchYear',
          avgPackage: { $avg: '$packageLpa' },
          highestPackage: { $max: '$packageLpa' },
        },
      },
    ]);

    const pkgMap = {};
    yearPackageStats.forEach((p) => {
      pkgMap[p._id] = {
        avgPackage: Number(p.avgPackage.toFixed(2)),
        highestPackage: p.highestPackage,
      };
    });

    const yearStats = yearCounts.map((item) => {
      const year = item._id;
      const total = item.totalStudents;
      const placed = item.placed;
      const pct = total > 0 ? Number(((placed / total) * 100).toFixed(2)) : 0;
      const pkg = pkgMap[year] || { avgPackage: 0, highestPackage: 0 };
      return {
        batchYear: year,
        totalStudents: total,
        placed,
        placementPercentage: pct,
        averagePackage: pkg.avgPackage,
        highestPackage: pkg.highestPackage,
      };
    });

    // Top companies (scoped to matching students if applicable)
    const topRecruiters = await Placement.aggregate([
      ...(studentIds.length > 0 ? [{ $match: { student: { $in: studentIds } } }] : []),
      {
        $group: {
          _id: '$company',
          hiresCount: { $sum: 1 },
          highestPackage: { $max: '$packageLpa' },
          avgPackage: { $avg: '$packageLpa' },
        },
      },
      {
        $lookup: {
          from: 'companies',
          localField: '_id',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: '$company' },
      {
        $project: {
          _id: 0,
          companyName: '$company.name',
          industry: '$company.industry',
          hiresCount: 1,
          highestPackage: 1,
          averagePackage: { $round: ['$avgPackage', 2] },
        },
      },
      { $sort: { hiresCount: -1, highestPackage: -1 } },
      { $limit: 10 },
    ]);

    // Create PDF Document
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=placement_summary_report_${Date.now()}.pdf`
    );

    doc.pipe(res);

    // Title & Header
    doc
      .fillColor('#1e1b4b')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('COLLEGE PLACEMENT RECORD MANAGEMENT SYSTEM', { align: 'center' });

    doc
      .fontSize(11)
      .fillColor('#4338ca')
      .font('Helvetica-Bold')
      .text('Training & Placement Cell • Executive Summary Report', { align: 'center' })
      .moveDown(0.5);

    const filterText = `Filters: Branch: ${req.query.branch || 'All Disciplines'} | Batch Year: ${req.query.batchYear || req.query.year || 'All Years'}`;
    doc
      .fontSize(8.5)
      .fillColor('#64748b')
      .font('Helvetica')
      .text(`Generated on: ${new Date().toLocaleString()} | ${filterText}`, { align: 'center' })
      .moveDown(0.8);

    // Divider
    doc
      .strokeColor('#cbd5e1')
      .lineWidth(1)
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke()
      .moveDown(0.8);

    // Section 1: Executive KPI Summary Box
    doc
      .fillColor('#0f172a')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('1. Institutional Placement Overview', 40)
      .moveDown(0.4);

    const kpiY = doc.y;
    doc
      .rect(40, kpiY, 515, 55)
      .fillAndStroke('#f8fafc', '#cbd5e1');

    doc
      .fillColor('#334155')
      .fontSize(9)
      .font('Helvetica')
      .text(`Total Candidates: ${totalStudents}`, 55, kpiY + 12)
      .text(`Total Placed: ${totalPlaced}`, 200, kpiY + 12)
      .text(`Placement Success: ${placementPercentage}%`, 360, kpiY + 12)
      .text(`Unique Applied: ${totalApplied}`, 55, kpiY + 32)
      .text(`Highest Package: ${placementData.highestPackage || 0} LPA`, 200, kpiY + 32)
      .text(`Average Package: ${placementData.averagePackage || 0} LPA`, 360, kpiY + 32);

    doc.y = kpiY + 70;

    // Section 2: Branch-Wise Placement Summary
    doc
      .fillColor('#0f172a')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('2. Branch-Wise Placement Performance', 40)
      .moveDown(0.4);

    let curY = doc.y;
    doc.rect(40, curY, 515, 18).fill('#4f46e5');

    doc
      .fillColor('#ffffff')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text('Discipline / Branch', 50, curY + 4)
      .text('Total Candidates', 200, curY + 4)
      .text('Students Placed', 320, curY + 4)
      .text('Placement Rate', 440, curY + 4);

    curY += 18;

    branchStats.forEach((b, idx) => {
      const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      doc.rect(40, curY, 515, 16).fill(rowBg);

      doc
        .fillColor('#1e293b')
        .fontSize(8)
        .font('Helvetica')
        .text(b.branch, 50, curY + 4)
        .text(String(b.totalStudents), 200, curY + 4)
        .text(String(b.placed), 320, curY + 4)
        .font('Helvetica-Bold')
        .text(`${b.placementPercentage}%`, 440, curY + 4);

      curY += 16;
    });

    doc.y = curY + 15;

    // Section 3: Year-Wise Placement Trajectory
    doc
      .fillColor('#0f172a')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('3. Year-Wise Placement Trajectory', 40)
      .moveDown(0.4);

    curY = doc.y;
    doc.rect(40, curY, 515, 18).fill('#0d9488');

    doc
      .fillColor('#ffffff')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text('Graduating Batch', 50, curY + 4)
      .text('Total Candidates', 170, curY + 4)
      .text('Total Placed', 280, curY + 4)
      .text('Placement Rate', 380, curY + 4)
      .text('Average CTC', 460, curY + 4);

    curY += 18;

    yearStats.forEach((y, idx) => {
      const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      doc.rect(40, curY, 515, 16).fill(rowBg);

      doc
        .fillColor('#1e293b')
        .fontSize(8)
        .font('Helvetica')
        .text(String(y.batchYear), 50, curY + 4)
        .text(String(y.totalStudents), 170, curY + 4)
        .text(String(y.placed), 280, curY + 4)
        .font('Helvetica-Bold')
        .text(`${y.placementPercentage}%`, 380, curY + 4)
        .font('Helvetica')
        .text(`${y.averagePackage} LPA`, 460, curY + 4);

      curY += 16;
    });

    doc.y = curY + 15;

    // Section 4: Top Recruiting Partners
    if (topRecruiters.length > 0) {
      doc
        .fillColor('#0f172a')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('4. Top Recruiting Partners', 40)
        .moveDown(0.4);

      curY = doc.y;
      doc.rect(40, curY, 515, 18).fill('#1e293b');

      doc
        .fillColor('#ffffff')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text('Recruiter Organization', 50, curY + 4)
        .text('Industry Domain', 220, curY + 4)
        .text('Total Hires', 360, curY + 4)
        .text('Highest Package', 460, curY + 4);

      curY += 18;

      topRecruiters.slice(0, 8).forEach((r, idx) => {
        const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(40, curY, 515, 16).fill(rowBg);

        doc
          .fillColor('#1e293b')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text(r.companyName, 50, curY + 4)
          .font('Helvetica')
          .text(r.industry, 220, curY + 4)
          .text(String(r.hiresCount), 360, curY + 4)
          .text(`${r.highestPackage} LPA`, 460, curY + 4);

        curY += 16;
      });
    }

    doc.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverviewStats,
  getStatsByBranch,
  getStatsByYear,
  getStatsByCompany,
  getTopCompanies,
  getPublicPlacementStats,
  exportSummaryPDF,
};

