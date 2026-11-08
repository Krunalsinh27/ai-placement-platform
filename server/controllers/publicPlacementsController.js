const mongoose = require('mongoose');
const { College, Student, Application, Offer, Company } = require('../models');
const { INDIAN_STATES_AND_UTS } = require('../utils/constants');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const suppressCount = (count) => {
  if (typeof count === 'number' && count > 0 && count < 5) {
    return 'lt5';
  }
  return count;
};

const calculatePackageStats = (packages) => {
  if (!packages || packages.length === 0) {
    return { highestPackage: 0, averagePackage: 0, medianPackage: 0 };
  }
  const sorted = [...packages].sort((a, b) => a - b);
  const highest = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const average = Number((sum / sorted.length).toFixed(2));
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  return { highestPackage: highest, averagePackage: average, medianPackage: median };
};

/**
 * @desc    Get public placement benchmarks for all approved colleges
 * @route   GET /api/colleges/public/placements
 * @access  Public (No auth required)
 */
const getPublicCollegesPlacements = async (req, res, next) => {
  try {
    const { search, state, sortBy = 'placementPercentage', order = 'desc' } = req.query;

    const query = { status: 'approved' };

    if (state && typeof state === 'string' && state.trim()) {
      query.state = { $regex: new RegExp(`^${escapeRegex(state.trim())}$`, 'i') };
    }

    const colleges = await College.find(query)
      .select('_id name code city state website accreditation')
      .lean();

    const collegeIds = colleges.map((c) => c._id);

    // Fetch students without personal information (only _id, college, branch, batchYear)
    const students = await Student.find({ college: { $in: collegeIds } })
      .select('_id college branch batchYear')
      .lean();

    const studentIds = students.map((s) => s._id);

    // Fetch accepted offers only
    const acceptedOffers = await Offer.find({
      status: 'accepted',
      student: { $in: studentIds },
    })
      .select('student college packageLpa status')
      .lean();

    const placedStudentSet = new Set(acceptedOffers.map((o) => o.student.toString()));

    let rows = colleges.map((college) => {
      const cStudents = students.filter(
        (s) => s.college.toString() === college._id.toString()
      );
      const totalCount = cStudents.length;
      const placedCount = cStudents.filter((s) =>
        placedStudentSet.has(s._id.toString())
      ).length;

      const cOffers = acceptedOffers.filter((o) =>
        cStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

      if (isSubgroupSmall || isPlacedSubgroupSmall) {
        return {
          _id: college._id,
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          website: college.website,
          accreditation: college.accreditation,
          students: isSubgroupSmall ? 'lt5' : totalCount,
          totalStudents: isSubgroupSmall ? 'lt5' : totalCount,
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
          _rawStudents: totalCount,
          _rawPlaced: placedCount,
          _rawRate: -1,
          _rawAvg: -1,
        };
      }

      const stats = calculatePackageStats(cPackages);
      const rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;

      return {
        _id: college._id,
        name: college.name,
        code: college.code,
        city: college.city,
        state: college.state,
        website: college.website,
        accreditation: college.accreditation,
        students: totalCount,
        totalStudents: totalCount,
        placed: placedCount,
        placementPercentage: rate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
        _rawStudents: totalCount,
        _rawPlaced: placedCount,
        _rawRate: rate,
        _rawAvg: stats.averagePackage,
      };
    });

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q)
      );
    }

    // Sort
    const isAsc = String(order).toLowerCase() === 'asc';
    rows.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'students') {
        valA = a._rawStudents;
        valB = b._rawStudents;
      } else if (sortBy === 'averagePackage') {
        valA = a._rawAvg;
        valB = b._rawAvg;
      } else if (sortBy === 'name') {
        return isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else {
        // default: placementPercentage
        valA = a._rawRate;
        valB = b._rawRate;
      }
      return isAsc ? valA - valB : valB - valA;
    });

    const cleanRows = rows.map(({ _rawStudents, _rawPlaced, _rawRate, _rawAvg, ...rest }) => rest);

    const total = cleanRows.length;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const paginatedRows = cleanRows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.status(200).json({
      success: true,
      data: paginatedRows,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: paginatedRows.length,
      colleges: paginatedRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get public placement details for a single approved college by code or id
 * @route   GET /api/colleges/public/placements/:code
 * @access  Public (No auth required)
 */
const getPublicCollegeDetailsByCode = async (req, res, next) => {
  try {
    const { code } = req.params;

    let college = null;
    if (mongoose.Types.ObjectId.isValid(code)) {
      college = await College.findOne({ _id: code, status: 'approved' }).lean();
    }
    if (!college) {
      college = await College.findOne({
        code: { $regex: new RegExp(`^${escapeRegex(code.trim())}$`, 'i') },
        status: 'approved',
      }).lean();
    }

    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'Approved college not found with specified code',
      });
    }

    // Fetch students without personal information
    const students = await Student.find({ college: college._id })
      .select('_id branch batchYear')
      .lean();

    const studentIds = students.map((s) => s._id);

    // Fetch accepted offers only
    const acceptedOffers = await Offer.find({
      status: 'accepted',
      student: { $in: studentIds },
    })
      .populate('company', 'name industry')
      .select('student company packageLpa status')
      .lean();

    const placedStudentSet = new Set(acceptedOffers.map((o) => o.student.toString()));

    const totalStudents = students.length;
    const placedStudents = placedStudentSet.size;
    const isSubgroupSmall = totalStudents > 0 && totalStudents < 5;
    const isPlacedSmall = placedStudents > 0 && placedStudents < 5;

    const packages = acceptedOffers
      .map((o) => o.packageLpa)
      .filter((p) => typeof p === 'number');

    const stats =
      isSubgroupSmall || isPlacedSmall
        ? { highestPackage: null, averagePackage: null, medianPackage: null }
        : calculatePackageStats(packages);

    const placementRate =
      isSubgroupSmall || isPlacedSmall
        ? 'lt5'
        : totalStudents > 0
        ? Number(((placedStudents / totalStudents) * 100).toFixed(1))
        : 0;

    // Branch breakdown
    const branches = Array.from(new Set(students.map((s) => s.branch))).sort();
    const byBranch = branches.map((br) => {
      const brStudents = students.filter((s) => s.branch === br);
      const brTotal = brStudents.length;
      const brPlaced = brStudents.filter((s) =>
        placedStudentSet.has(s._id.toString())
      ).length;
      const isBrSmall = brTotal > 0 && brTotal < 5;
      const isBrPlacedSmall = brPlaced > 0 && brPlaced < 5;

      return {
        branch: br,
        students: isBrSmall ? 'lt5' : brTotal,
        placed: isBrSmall || isBrPlacedSmall ? 'lt5' : brPlaced,
        placementPercentage:
          isBrSmall || isBrPlacedSmall
            ? 'lt5'
            : brTotal > 0
            ? Number(((brPlaced / brTotal) * 100).toFixed(1))
            : 0,
      };
    });

    // Year-wise trend
    const years = Array.from(new Set(students.map((s) => s.batchYear))).sort((a, b) => a - b);
    const byYear = years.map((y) => {
      const yStudents = students.filter((s) => s.batchYear === y);
      const yTotal = yStudents.length;
      const yPlaced = yStudents.filter((s) =>
        placedStudentSet.has(s._id.toString())
      ).length;
      const isYSmall = yTotal > 0 && yTotal < 5;
      const isYPlacedSmall = yPlaced > 0 && yPlaced < 5;

      return {
        batchYear: y,
        students: isYSmall ? 'lt5' : yTotal,
        placed: isYSmall || isYPlacedSmall ? 'lt5' : yPlaced,
        placementPercentage:
          isYSmall || isYPlacedSmall
            ? 'lt5'
            : yTotal > 0
            ? Number(((yPlaced / yTotal) * 100).toFixed(1))
            : 0,
      };
    });

    // Top Recruiters for this college
    const companyMap = new Map();
    for (const offer of acceptedOffers) {
      if (!offer.company) continue;
      const compId = offer.company._id.toString();
      const compName = offer.company.name;
      if (!companyMap.has(compId)) {
        companyMap.set(compId, {
          companyName: compName,
          placedStudents: new Set(),
          packages: [],
        });
      }
      const entry = companyMap.get(compId);
      entry.placedStudents.add(offer.student.toString());
      if (typeof offer.packageLpa === 'number') entry.packages.push(offer.packageLpa);
    }

    const topRecruiters = Array.from(companyMap.values())
      .map((c) => {
        const hires = c.placedStudents.size;
        const compStats = calculatePackageStats(c.packages);
        const isRecSmall = hires > 0 && hires < 5;
        return {
          companyName: c.companyName,
          hires: isRecSmall ? 'lt5' : hires,
          averagePackage: isRecSmall ? null : compStats.averagePackage,
          _rawHires: hires,
        };
      })
      .sort((a, b) => b._rawHires - a._rawHires)
      .slice(0, 10)
      .map(({ _rawHires, ...rest }) => rest);

    res.status(200).json({
      success: true,
      college: {
        _id: college._id,
        name: college.name,
        code: college.code,
        city: college.city,
        state: college.state,
        website: college.website,
        accreditation: college.accreditation,
      },
      overview: {
        students: isSubgroupSmall ? 'lt5' : totalStudents,
        totalStudents: isSubgroupSmall ? 'lt5' : totalStudents,
        placed: isSubgroupSmall || isPlacedSmall ? 'lt5' : placedStudents,
        placementPercentage: placementRate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
        medianPackage: stats.medianPackage,
      },
      byBranch,
      byYear,
      topRecruiters,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Public comparison for up to 3 colleges
 * @route   GET /api/colleges/public/compare
 * @access  Public (No auth required)
 */
const getPublicCompareColleges = async (req, res, next) => {
  try {
    const collegesParam = req.query.colleges || req.query.collegeIds;
    if (!collegesParam || !String(collegesParam).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide college codes or IDs to compare',
      });
    }

    const identifiers = String(collegesParam)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (identifiers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide college codes or IDs to compare',
      });
    }

    if (identifiers.length > 3) {
      return res.status(400).json({
        success: false,
        message: 'Comparison is limited to a maximum of 3 colleges',
      });
    }

    // Find colleges matching IDs or codes
    const collegeQuery = {
      status: 'approved',
      $or: [
        { _id: { $in: identifiers.filter((id) => mongoose.Types.ObjectId.isValid(id)) } },
        { code: { $in: identifiers.map((c) => c.toUpperCase()) } },
      ],
    };

    const colleges = await College.find(collegeQuery)
      .select('_id name code city state website accreditation')
      .lean();

    if (colleges.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'None of the specified colleges are found or approved',
      });
    }

    // Load comparison data per college
    const comparisonResults = await Promise.all(
      colleges.map(async (college) => {
        const students = await Student.find({ college: college._id })
          .select('_id branch batchYear')
          .lean();

        const studentIds = students.map((s) => s._id);

        const acceptedOffers = await Offer.find({
          status: 'accepted',
          student: { $in: studentIds },
        })
          .select('student packageLpa status')
          .lean();

        const placedStudentSet = new Set(acceptedOffers.map((o) => o.student.toString()));
        const totalStudents = students.length;
        const placedStudents = placedStudentSet.size;

        const isSubgroupSmall = totalStudents > 0 && totalStudents < 5;
        const isPlacedSmall = placedStudents > 0 && placedStudents < 5;

        const packages = acceptedOffers
          .map((o) => o.packageLpa)
          .filter((p) => typeof p === 'number');

        const stats =
          isSubgroupSmall || isPlacedSmall
            ? { highestPackage: null, averagePackage: null, medianPackage: null }
            : calculatePackageStats(packages);

        const placementRate =
          isSubgroupSmall || isPlacedSmall
            ? 'lt5'
            : totalStudents > 0
            ? Number(((placedStudents / totalStudents) * 100).toFixed(1))
            : 0;

        // Aggregate by branch with small-group privacy suppression
        const branchMap = new Map();
        for (const student of students) {
          const br = student.branch || 'Unknown';
          if (!branchMap.has(br)) {
            branchMap.set(br, { total: 0, placed: 0, packages: [] });
          }
          const entry = branchMap.get(br);
          entry.total += 1;
          if (placedStudentSet.has(student._id.toString())) {
            entry.placed += 1;
          }
        }

        for (const offer of acceptedOffers) {
          const student = students.find((s) => s._id.toString() === offer.student.toString());
          if (student && typeof offer.packageLpa === 'number') {
            const br = student.branch || 'Unknown';
            if (branchMap.has(br)) {
              branchMap.get(br).packages.push(offer.packageLpa);
            }
          }
        }

        const byBranch = Array.from(branchMap.entries()).map(([branch, data]) => {
          const isBrSmall = data.total > 0 && data.total < 5;
          const isBrPlacedSmall = data.placed > 0 && data.placed < 5;
          const branchStats = calculatePackageStats(data.packages);
          return {
            branch,
            students: isBrSmall ? 'lt5' : data.total,
            totalStudents: isBrSmall ? 'lt5' : data.total,
            placed: isBrSmall || isBrPlacedSmall ? 'lt5' : data.placed,
            placementPercentage:
              isBrSmall || isBrPlacedSmall
                ? 'lt5'
                : data.total > 0
                ? Number(((data.placed / data.total) * 100).toFixed(1))
                : 0,
            averagePackage: isBrSmall || isBrPlacedSmall ? null : branchStats.averagePackage,
            highestPackage: isBrSmall || isBrPlacedSmall ? null : branchStats.highestPackage,
          };
        });

        return {
          _id: college._id,
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          website: college.website,
          accreditation: college.accreditation,
          students: isSubgroupSmall ? 'lt5' : totalStudents,
          totalStudents: isSubgroupSmall ? 'lt5' : totalStudents,
          placed: isSubgroupSmall || isPlacedSmall ? 'lt5' : placedStudents,
          placementPercentage: placementRate,
          averagePackage: stats.averagePackage,
          highestPackage: stats.highestPackage,
          medianPackage: stats.medianPackage,
          byBranch,
        };
      })
    );

    res.status(200).json({
      success: true,
      colleges: comparisonResults,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get public state filter options with approved college counts
 * @route   GET /api/colleges/public/filters
 * @access  Public (No auth required)
 */
const getPublicFilterOptions = async (req, res, next) => {
  try {
    const colleges = await College.find({ status: 'approved' }).select('state').lean();
    const stateCounts = {};
    for (const c of colleges) {
      if (c.state) {
        const raw = c.state.trim();
        const canonical =
          INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase() === raw.toLowerCase()) || raw;
        stateCounts[canonical] = (stateCounts[canonical] || 0) + 1;
      }
    }

    const states = INDIAN_STATES_AND_UTS.map((st) => ({
      state: st,
      count: stateCounts[st] || 0,
    }));

    res.status(200).json({
      success: true,
      states,
      statesList: INDIAN_STATES_AND_UTS,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicCollegesPlacements,
  getPublicCollegeDetailsByCode,
  getPublicCompareColleges,
  getPublicFilterOptions,
};

