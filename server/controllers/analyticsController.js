const mongoose = require('mongoose');
const { College, Student, Application, Offer, Company } = require('../models');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

/**
 * Escape string for RegExp
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Small-group suppression helper:
 * If a subgroup has < 5 students (1-4), return 'lt5' to prevent individual re-identification.
 * 0 is returned as 0.
 */
const suppressCount = (count) => {
  if (typeof count === 'number' && count > 0 && count < 5) {
    return 'lt5';
  }
  return count;
};

/**
 * Calculate highest, average, and median package from an array of numbers
 */
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
 * Universal Filter Scope Resolver:
 * Applies filters: state, batchYear, branch, collegeIds across approved colleges ONLY.
 */
const getFilteredScope = async (query = {}) => {
  const { state, batchYear, branch, collegeIds, colleges: collegesParam } = query;

  // 1. Colleges Filter - Strictly approved colleges only
  const collegeQuery = { status: 'approved' };

  if (state && typeof state === 'string' && state.trim()) {
    collegeQuery.state = { $regex: new RegExp(`^${escapeRegex(state.trim())}$`, 'i') };
  }

  const rawCollegeIds = collegeIds || collegesParam;
  if (rawCollegeIds) {
    const idList = String(rawCollegeIds)
      .split(',')
      .map((s) => s.trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (idList.length > 0) {
      collegeQuery._id = { $in: idList };
    }
  }

  const colleges = await College.find(collegeQuery)
    .select('_id name code city state website accreditation status')
    .lean();

  const collegeIdList = colleges.map((c) => c._id);
  const collegeIdSet = new Set(colleges.map((c) => c._id.toString()));

  if (collegeIdList.length === 0) {
    return {
      colleges: [],
      collegeIdSet,
      students: [],
      studentIdSet: new Set(),
      appliedStudentSet: new Set(),
      acceptedOffers: [],
      placedStudentMap: new Map(),
      placedStudentSet: new Set(),
    };
  }

  // 2. Students Filter
  const studentQuery = { college: { $in: collegeIdList } };

  if (batchYear && !isNaN(Number(batchYear))) {
    studentQuery.batchYear = Number(batchYear);
  }

  if (branch && typeof branch === 'string' && branch.trim()) {
    studentQuery.branch = { $regex: new RegExp(`^${escapeRegex(branch.trim())}$`, 'i') };
  }

  // Fetch only non-PII grouping attributes
  const students = await Student.find(studentQuery)
    .select('_id college branch batchYear')
    .lean();

  const studentIdList = students.map((s) => s._id);
  const studentIdSet = new Set(students.map((s) => s._id.toString()));

  if (studentIdList.length === 0) {
    return {
      colleges,
      collegeIdSet,
      students: [],
      studentIdSet,
      appliedStudentSet: new Set(),
      acceptedOffers: [],
      placedStudentMap: new Map(),
      placedStudentSet: new Set(),
    };
  }

  // 3. Unique Applied Students
  const appliedStudentIds = await Application.distinct('student', {
    student: { $in: studentIdList },
  });
  const appliedStudentSet = new Set(appliedStudentIds.map((id) => id.toString()));

  // 4. Accepted Offers (Only for matched students)
  const acceptedOffers = await Offer.find({
    status: 'accepted',
    student: { $in: studentIdList },
  })
    .populate('company', 'name industry')
    .select('student college company packageLpa status')
    .lean();

  // Map offers per unique placed student
  const placedStudentMap = new Map();
  for (const offer of acceptedOffers) {
    const sId = offer.student.toString();
    if (!placedStudentMap.has(sId)) {
      placedStudentMap.set(sId, []);
    }
    placedStudentMap.get(sId).push(offer);
  }
  const placedStudentSet = new Set(placedStudentMap.keys());

  return {
    colleges,
    collegeIdSet,
    students,
    studentIdSet,
    appliedStudentSet,
    acceptedOffers,
    placedStudentMap,
    placedStudentSet,
  };
};

/**
 * @desc    Get system-wide placement analytics overview
 * @route   GET /api/analytics/overview
 * @access  Private (Analyst & Superadmin only)
 */
const getOverview = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);

    const collegesCount = scope.colleges.length;
    const totalStudentsCount = scope.students.length;
    const appliedCount = scope.appliedStudentSet.size;
    const placedCount = scope.placedStudentSet.size;

    // Small group suppression check for whole cohort
    const isCohortSmall = totalStudentsCount > 0 && totalStudentsCount < 5;
    const isPlacedSmall = placedCount > 0 && placedCount < 5;

    // Placed packages (all accepted offers of placed students in scope)
    const placedPackages = scope.acceptedOffers
      .map((o) => o.packageLpa)
      .filter((p) => typeof p === 'number');

    let packageStats = { highestPackage: 0, averagePackage: 0, medianPackage: 0 };
    if (!isCohortSmall && !isPlacedSmall && placedPackages.length > 0) {
      packageStats = calculatePackageStats(placedPackages);
    }

    const placementRate =
      totalStudentsCount > 0
        ? Number(((placedCount / totalStudentsCount) * 100).toFixed(1))
        : 0;

    res.status(200).json({
      success: true,
      collegesCount,
      totalStudents: suppressCount(totalStudentsCount),
      applied: suppressCount(appliedCount),
      appliedStudents: suppressCount(appliedCount),
      placed: suppressCount(placedCount),
      placedStudents: suppressCount(placedCount),
      placementPercentage: isCohortSmall || isPlacedSmall ? 'lt5' : placementRate,
      placementRate: isCohortSmall || isPlacedSmall ? 'lt5' : placementRate,
      highestPackage: isCohortSmall || isPlacedSmall ? null : packageStats.highestPackage,
      averagePackage: isCohortSmall || isPlacedSmall ? null : packageStats.averagePackage,
      medianPackage: isCohortSmall || isPlacedSmall ? null : packageStats.medianPackage,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get paginated, sortable list of approved colleges with placement metrics
 * @route   GET /api/analytics/colleges
 * @access  Private (Analyst & Superadmin only)
 */
const getColleges = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);
    const { search, sortBy = 'students', order = 'desc', page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    // Map metrics for each college
    let rows = scope.colleges.map((college) => {
      const cStudents = scope.students.filter(
        (s) => s.college.toString() === college._id.toString()
      );
      const totalCount = cStudents.length;
      const appliedCount = cStudents.filter((s) =>
        scope.appliedStudentSet.has(s._id.toString())
      ).length;
      const placedCount = cStudents.filter((s) =>
        scope.placedStudentSet.has(s._id.toString())
      ).length;

      // Accepted offers for this college's students
      const cOffers = scope.acceptedOffers.filter((o) =>
        cStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

      if (isSubgroupSmall) {
        return {
          _id: college._id,
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          totalStudents: 'lt5',
          students: 'lt5',
          applied: 'lt5',
          appliedStudents: 'lt5',
          placed: 'lt5',
          placedStudents: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
          _rawStudents: totalCount,
          _rawPlaced: placedCount,
        };
      }

      if (isPlacedSubgroupSmall) {
        return {
          _id: college._id,
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          totalStudents: totalCount,
          students: totalCount,
          applied: appliedCount,
          appliedStudents: appliedCount,
          placed: 'lt5',
          placedStudents: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
          _rawStudents: totalCount,
          _rawPlaced: placedCount,
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
        totalStudents: totalCount,
        students: totalCount,
        applied: appliedCount,
        appliedStudents: appliedCount,
        placed: placedCount,
        placedStudents: placedCount,
        placementPercentage: rate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
        _rawStudents: totalCount,
        _rawPlaced: placedCount,
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
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'students' || sortBy === 'totalStudents') {
        valA = a._rawStudents;
        valB = b._rawStudents;
      } else if (sortBy === 'placed' || sortBy === 'placedStudents') {
        valA = a._rawPlaced;
        valB = b._rawPlaced;
      }

      if (valA === 'lt5' || valA === null || valA === undefined) valA = -1;
      if (valB === 'lt5' || valB === null || valB === undefined) valB = -1;

      if (typeof valA === 'string') {
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return isAsc ? valA - valB : valB - valA;
    });

    // Remove internal sort keys
    const cleanRows = rows.map(({ _rawStudents, _rawPlaced, ...rest }) => rest);

    // Paginate
    const totalColleges = cleanRows.length;
    const totalPages = Math.ceil(totalColleges / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = cleanRows.slice(startIndex, startIndex + limitNum);

    res.status(200).json({
      success: true,
      totalColleges,
      totalPages,
      page: pageNum,
      limit: limitNum,
      colleges: paginated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get aggregate placement metrics grouped by branch across all colleges
 * @route   GET /api/analytics/by-branch
 * @access  Private (Analyst & Superadmin only)
 */
const getByBranch = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);

    // Distinct branches from matching students
    const branchSet = new Set(scope.students.map((s) => s.branch));
    const branches = Array.from(branchSet).sort();

    const byBranch = branches.map((branch) => {
      const bStudents = scope.students.filter((s) => s.branch === branch);
      const totalCount = bStudents.length;
      const appliedCount = bStudents.filter((s) =>
        scope.appliedStudentSet.has(s._id.toString())
      ).length;
      const placedCount = bStudents.filter((s) =>
        scope.placedStudentSet.has(s._id.toString())
      ).length;

      const bOffers = scope.acceptedOffers.filter((o) =>
        bStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const bPackages = bOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

      if (isSubgroupSmall) {
        return {
          branch,
          totalStudents: 'lt5',
          students: 'lt5',
          applied: 'lt5',
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
        };
      }

      if (isPlacedSubgroupSmall) {
        return {
          branch,
          totalStudents: totalCount,
          students: totalCount,
          applied: appliedCount,
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
        };
      }

      const stats = calculatePackageStats(bPackages);
      const rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;

      return {
        branch,
        totalStudents: totalCount,
        students: totalCount,
        applied: appliedCount,
        placed: placedCount,
        placementPercentage: rate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
      };
    });

    res.status(200).json({
      success: true,
      byBranch,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get aggregate placement metrics grouped by batch year across all colleges
 * @route   GET /api/analytics/by-year
 * @access  Private (Analyst & Superadmin only)
 */
const getByYear = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);

    // Distinct batch years from matching students
    const yearSet = new Set(scope.students.map((s) => s.batchYear));
    const years = Array.from(yearSet).sort((a, b) => a - b);

    const byYear = years.map((year) => {
      const yStudents = scope.students.filter((s) => s.batchYear === year);
      const totalCount = yStudents.length;
      const appliedCount = yStudents.filter((s) =>
        scope.appliedStudentSet.has(s._id.toString())
      ).length;
      const placedCount = yStudents.filter((s) =>
        scope.placedStudentSet.has(s._id.toString())
      ).length;

      const yOffers = scope.acceptedOffers.filter((o) =>
        yStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const yPackages = yOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

      if (isSubgroupSmall) {
        return {
          batchYear: year,
          year,
          totalStudents: 'lt5',
          students: 'lt5',
          applied: 'lt5',
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
        };
      }

      if (isPlacedSubgroupSmall) {
        return {
          batchYear: year,
          year,
          totalStudents: totalCount,
          students: totalCount,
          applied: appliedCount,
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: null,
          highestPackage: null,
        };
      }

      const stats = calculatePackageStats(yPackages);
      const rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;

      return {
        batchYear: year,
        year,
        totalStudents: totalCount,
        students: totalCount,
        applied: appliedCount,
        placed: placedCount,
        placementPercentage: rate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
      };
    });

    res.status(200).json({
      success: true,
      byYear,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get top recruiting companies across colleges
 * @route   GET /api/analytics/top-recruiters
 * @access  Private (Analyst & Superadmin only)
 */
const getTopRecruiters = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);
    const limitNum = Math.max(1, parseInt(req.query.limit, 10) || 10);

    // Group accepted offers by company
    const companyMap = new Map();

    for (const offer of scope.acceptedOffers) {
      if (!offer.company) continue;
      const compId = offer.company._id ? offer.company._id.toString() : offer.company.toString();
      const compName = offer.company.name || 'Unknown Recruiter';
      const compIndustry = offer.company.industry || 'Technology';

      if (!companyMap.has(compId)) {
        companyMap.set(compId, {
          companyId: compId,
          companyName: compName,
          industry: compIndustry,
          placedStudents: new Set(),
          colleges: new Set(),
          packages: [],
        });
      }

      const entry = companyMap.get(compId);
      entry.placedStudents.add(offer.student.toString());
      if (offer.college) {
        entry.colleges.add(offer.college.toString());
      }
      if (typeof offer.packageLpa === 'number') {
        entry.packages.push(offer.packageLpa);
      }
    }

    const recruiters = Array.from(companyMap.values()).map((c) => {
      const hiresCount = c.placedStudents.size;
      const collegesCount = c.colleges.size;
      const stats = calculatePackageStats(c.packages);

      const isSubgroupSmall = hiresCount > 0 && hiresCount < 5;

      if (isSubgroupSmall) {
        return {
          companyId: c.companyId,
          company: c.companyName,
          companyName: c.companyName,
          industry: c.industry,
          collegesHiredFrom: 'lt5',
          hires: 'lt5',
          averagePackage: null,
          highestPackage: null,
          _rawHires: hiresCount,
        };
      }

      return {
        companyId: c.companyId,
        company: c.companyName,
        companyName: c.companyName,
        industry: c.industry,
        collegesHiredFrom: collegesCount,
        hires: hiresCount,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
        _rawHires: hiresCount,
      };
    });

    // Sort by hires descending
    recruiters.sort((a, b) => b._rawHires - a._rawHires);

    const cleanRecruiters = recruiters
      .slice(0, limitNum)
      .map(({ _rawHires, ...rest }) => rest);

    res.status(200).json({
      success: true,
      recruiters: cleanRecruiters,
      topRecruiters: cleanRecruiters,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Side-by-side comparison for up to 3 colleges
 * @route   GET /api/analytics/compare
 * @access  Private (Analyst & Superadmin only)
 */
const compareColleges = async (req, res, next) => {
  try {
    const collegesParam = req.query.colleges || req.query.collegeIds;

    if (!collegesParam || !String(collegesParam).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide college IDs to compare',
      });
    }

    const collegeIds = String(collegesParam)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (collegeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide college IDs to compare',
      });
    }

    if (collegeIds.length > 3) {
      return res.status(400).json({
        success: false,
        message: 'Comparison is limited to a maximum of 3 colleges',
      });
    }

    // Validate ObjectIds
    for (const id of collegeIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: `Invalid college ID format: ${id}`,
        });
      }
    }

    // Load colleges - must be approved
    const colleges = await College.find({
      _id: { $in: collegeIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: 'approved',
    })
      .select('_id name code city state website accreditation status')
      .lean();

    if (colleges.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'None of the specified colleges exist or have approved status',
      });
    }

    // Load scope for these colleges with any additional query filters (branch, batchYear)
    const scope = await getFilteredScope({ ...req.query, collegesParam: collegeIds.join(',') });

    const results = colleges.map((college) => {
      const cStudents = scope.students.filter(
        (s) => s.college.toString() === college._id.toString()
      );
      const totalCount = cStudents.length;
      const appliedCount = cStudents.filter((s) =>
        scope.appliedStudentSet.has(s._id.toString())
      ).length;
      const placedCount = cStudents.filter((s) =>
        scope.placedStudentSet.has(s._id.toString())
      ).length;

      const cOffers = scope.acceptedOffers.filter((o) =>
        cStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placedCount > 0 && placedCount < 5;

      // College-level branch breakdown
      const cBranches = Array.from(new Set(cStudents.map((s) => s.branch))).sort();
      const byBranch = cBranches.map((br) => {
        const brStudents = cStudents.filter((s) => s.branch === br);
        const brTotal = brStudents.length;
        const brPlaced = brStudents.filter((s) =>
          scope.placedStudentSet.has(s._id.toString())
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

      if (isSubgroupSmall || isPlacedSubgroupSmall) {
        return {
          _id: college._id,
          collegeId: college._id,
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          totalStudents: isSubgroupSmall ? 'lt5' : totalCount,
          students: isSubgroupSmall ? 'lt5' : totalCount,
          applied: isSubgroupSmall ? 'lt5' : appliedCount,
          appliedStudents: isSubgroupSmall ? 'lt5' : appliedCount,
          placed: 'lt5',
          placedStudents: 'lt5',
          placementPercentage: 'lt5',
          placementRate: 'lt5',
          averagePackage: null,
          highestPackage: null,
          medianPackage: null,
          byBranch,
        };
      }

      const stats = calculatePackageStats(cPackages);
      const rate = totalCount > 0 ? Number(((placedCount / totalCount) * 100).toFixed(1)) : 0;

      return {
        _id: college._id,
        collegeId: college._id,
        name: college.name,
        code: college.code,
        city: college.city,
        state: college.state,
        totalStudents: totalCount,
        students: totalCount,
        applied: appliedCount,
        appliedStudents: appliedCount,
        placed: placedCount,
        placedStudents: placedCount,
        placementPercentage: rate,
        placementRate: rate,
        averagePackage: stats.averagePackage,
        highestPackage: stats.highestPackage,
        medianPackage: stats.medianPackage,
        byBranch,
      };
    });

    res.status(200).json({
      success: true,
      colleges: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export analytics dataset as an Excel workbook
 * @route   GET /api/analytics/export/excel
 * @access  Private (Analyst & Superadmin only)
 */
const exportExcel = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Placement Analytics Portal';
    workbook.created = new Date();

    // 1. Overview Sheet
    const overviewSheet = workbook.addWorksheet('Overview');
    overviewSheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 25 },
    ];

    const collegesCount = scope.colleges.length;
    const totalStudentsCount = scope.students.length;
    const appliedCount = scope.appliedStudentSet.size;
    const placedCount = scope.placedStudentSet.size;
    const isCohortSmall = totalStudentsCount > 0 && totalStudentsCount < 5;
    const isPlacedSmall = placedCount > 0 && placedCount < 5;

    const placedPackages = scope.acceptedOffers
      .map((o) => o.packageLpa)
      .filter((p) => typeof p === 'number');

    let packageStats = { highestPackage: 0, averagePackage: 0, medianPackage: 0 };
    if (!isCohortSmall && !isPlacedSmall && placedPackages.length > 0) {
      packageStats = calculatePackageStats(placedPackages);
    }

    overviewSheet.addRows([
      { metric: 'Total Approved Colleges', value: collegesCount },
      { metric: 'Total Students', value: suppressCount(totalStudentsCount) },
      { metric: 'Applied Students (Unique)', value: suppressCount(appliedCount) },
      { metric: 'Placed Students (Accepted Offer)', value: suppressCount(placedCount) },
      {
        metric: 'Placement Percentage',
        value:
          isCohortSmall || isPlacedSmall
            ? 'lt5'
            : totalStudentsCount > 0
            ? `${((placedCount / totalStudentsCount) * 100).toFixed(1)}%`
            : '0%',
      },
      {
        metric: 'Highest Package (LPA)',
        value: isCohortSmall || isPlacedSmall ? '-' : packageStats.highestPackage,
      },
      {
        metric: 'Average Package (LPA)',
        value: isCohortSmall || isPlacedSmall ? '-' : packageStats.averagePackage,
      },
      {
        metric: 'Median Package (LPA)',
        value: isCohortSmall || isPlacedSmall ? '-' : packageStats.medianPackage,
      },
    ]);

    // 2. Colleges Sheet
    const collegesSheet = workbook.addWorksheet('Colleges');
    collegesSheet.columns = [
      { header: 'College Name', key: 'name', width: 35 },
      { header: 'Code', key: 'code', width: 12 },
      { header: 'City', key: 'city', width: 18 },
      { header: 'State', key: 'state', width: 18 },
      { header: 'Total Students', key: 'students', width: 15 },
      { header: 'Applied', key: 'applied', width: 15 },
      { header: 'Placed', key: 'placed', width: 15 },
      { header: 'Placement %', key: 'placementPercentage', width: 16 },
      { header: 'Average Package (LPA)', key: 'averagePackage', width: 22 },
      { header: 'Highest Package (LPA)', key: 'highestPackage', width: 22 },
    ];

    for (const college of scope.colleges) {
      const cStudents = scope.students.filter(
        (s) => s.college.toString() === college._id.toString()
      );
      const totalCount = cStudents.length;
      const applied = cStudents.filter((s) => scope.appliedStudentSet.has(s._id.toString())).length;
      const placed = cStudents.filter((s) => scope.placedStudentSet.has(s._id.toString())).length;
      const cOffers = scope.acceptedOffers.filter((o) =>
        cStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = totalCount > 0 && totalCount < 5;
      const isPlacedSubgroupSmall = placed > 0 && placed < 5;

      if (isSubgroupSmall || isPlacedSubgroupSmall) {
        collegesSheet.addRow({
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          students: isSubgroupSmall ? 'lt5' : totalCount,
          applied: isSubgroupSmall ? 'lt5' : applied,
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: '-',
          highestPackage: '-',
        });
      } else {
        const stats = calculatePackageStats(cPackages);
        const rate = totalCount > 0 ? Number(((placed / totalCount) * 100).toFixed(1)) : 0;
        collegesSheet.addRow({
          name: college.name,
          code: college.code,
          city: college.city,
          state: college.state,
          students: totalCount,
          applied,
          placed,
          placementPercentage: `${rate}%`,
          averagePackage: stats.averagePackage,
          highestPackage: stats.highestPackage,
        });
      }
    }

    // 3. Branch Sheet
    const branchSheet = workbook.addWorksheet('By Branch');
    branchSheet.columns = [
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Students', key: 'students', width: 15 },
      { header: 'Applied', key: 'applied', width: 15 },
      { header: 'Placed', key: 'placed', width: 15 },
      { header: 'Placement %', key: 'placementPercentage', width: 16 },
      { header: 'Average Package (LPA)', key: 'averagePackage', width: 22 },
      { header: 'Highest Package (LPA)', key: 'highestPackage', width: 22 },
    ];

    const branches = Array.from(new Set(scope.students.map((s) => s.branch))).sort();
    for (const br of branches) {
      const bStudents = scope.students.filter((s) => s.branch === br);
      const bTotal = bStudents.length;
      const bApplied = bStudents.filter((s) =>
        scope.appliedStudentSet.has(s._id.toString())
      ).length;
      const bPlaced = bStudents.filter((s) => scope.placedStudentSet.has(s._id.toString())).length;
      const bOffers = scope.acceptedOffers.filter((o) =>
        bStudents.some((s) => s._id.toString() === o.student.toString())
      );
      const bPackages = bOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

      const isSubgroupSmall = bTotal > 0 && bTotal < 5;
      const isPlacedSubgroupSmall = bPlaced > 0 && bPlaced < 5;

      if (isSubgroupSmall || isPlacedSubgroupSmall) {
        branchSheet.addRow({
          branch: br,
          students: isSubgroupSmall ? 'lt5' : bTotal,
          applied: isSubgroupSmall ? 'lt5' : bApplied,
          placed: 'lt5',
          placementPercentage: 'lt5',
          averagePackage: '-',
          highestPackage: '-',
        });
      } else {
        const stats = calculatePackageStats(bPackages);
        const rate = bTotal > 0 ? Number(((bPlaced / bTotal) * 100).toFixed(1)) : 0;
        branchSheet.addRow({
          branch: br,
          students: bTotal,
          applied: bApplied,
          placed: bPlaced,
          placementPercentage: `${rate}%`,
          averagePackage: stats.averagePackage,
          highestPackage: stats.highestPackage,
        });
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=placement_analytics.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export analytics summary as a PDF report
 * @route   GET /api/analytics/export/pdf
 * @access  Private (Analyst & Superadmin only)
 */
const exportPdf = async (req, res, next) => {
  try {
    const scope = await getFilteredScope(req.query);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=placement_analytics.pdf');

    doc.pipe(res);

    // Title & Header
    doc.fontSize(18).text('Cross-College Placement Analytics Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#64748b').text(
      `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST  |  Confidential Aggregated Analytics`,
      { align: 'center' }
    );
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    // Overview KPIs
    const collegesCount = scope.colleges.length;
    const totalStudentsCount = scope.students.length;
    const appliedCount = scope.appliedStudentSet.size;
    const placedCount = scope.placedStudentSet.size;
    const isCohortSmall = totalStudentsCount > 0 && totalStudentsCount < 5;
    const isPlacedSmall = placedCount > 0 && placedCount < 5;

    const placedPackages = scope.acceptedOffers
      .map((o) => o.packageLpa)
      .filter((p) => typeof p === 'number');

    let packageStats = { highestPackage: 0, averagePackage: 0, medianPackage: 0 };
    if (!isCohortSmall && !isPlacedSmall && placedPackages.length > 0) {
      packageStats = calculatePackageStats(placedPackages);
    }

    const rate =
      isCohortSmall || isPlacedSmall
        ? 'lt5'
        : totalStudentsCount > 0
        ? `${((placedCount / totalStudentsCount) * 100).toFixed(1)}%`
        : '0%';

    doc.fontSize(12).text('1. System-Wide Overview Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    doc.text(`• Total Approved Colleges: ${collegesCount}`);
    doc.text(`• Total Enrolled Students: ${suppressCount(totalStudentsCount)}`);
    doc.text(`• Unique Applied Students: ${suppressCount(appliedCount)}`);
    doc.text(`• Unique Placed Students (Accepted Offers): ${suppressCount(placedCount)}`);
    doc.text(`• Placement Rate: ${rate}`);
    doc.text(
      `• Package Statistics (LPA): Highest: ${
        isCohortSmall || isPlacedSmall ? '-' : packageStats.highestPackage
      } | Average: ${
        isCohortSmall || isPlacedSmall ? '-' : packageStats.averagePackage
      } | Median: ${isCohortSmall || isPlacedSmall ? '-' : packageStats.medianPackage}`
    );
    doc.moveDown(1.5);

    // Colleges Breakdown
    doc.fontSize(12).text('2. Approved Colleges Breakdown', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(8);

    if (scope.colleges.length === 0) {
      doc.text('No approved colleges match the selected filters.');
    } else {
      for (const college of scope.colleges.slice(0, 20)) {
        const cStudents = scope.students.filter(
          (s) => s.college.toString() === college._id.toString()
        );
        const totalCount = cStudents.length;
        const placed = cStudents.filter((s) =>
          scope.placedStudentSet.has(s._id.toString())
        ).length;
        const cOffers = scope.acceptedOffers.filter((o) =>
          cStudents.some((s) => s._id.toString() === o.student.toString())
        );
        const cPackages = cOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

        const isSubgroupSmall = totalCount > 0 && totalCount < 5;
        const isPlacedSubgroupSmall = placed > 0 && placed < 5;

        if (isSubgroupSmall || isPlacedSubgroupSmall) {
          doc.text(
            `${college.name} (${college.code}) - ${college.city}, ${college.state} | Students: ${
              isSubgroupSmall ? 'lt5' : totalCount
            } | Placed: lt5 | Rate: lt5 | Avg: -`
          );
        } else {
          const stats = calculatePackageStats(cPackages);
          const cRate = totalCount > 0 ? `${((placed / totalCount) * 100).toFixed(1)}%` : '0%';
          doc.text(
            `${college.name} (${college.code}) - ${college.city}, ${college.state} | Students: ${totalCount} | Placed: ${placed} | Rate: ${cRate} | Avg: ${stats.averagePackage} LPA`
          );
        }
      }
    }
    doc.moveDown(1.5);

    // Branch Breakdown
    doc.fontSize(12).text('3. Branch-Wise Distribution', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(8);

    const branches = Array.from(new Set(scope.students.map((s) => s.branch))).sort();
    if (branches.length === 0) {
      doc.text('No student branch records found for the current selection.');
    } else {
      for (const br of branches) {
        const bStudents = scope.students.filter((s) => s.branch === br);
        const bTotal = bStudents.length;
        const bPlaced = bStudents.filter((s) =>
          scope.placedStudentSet.has(s._id.toString())
        ).length;
        const bOffers = scope.acceptedOffers.filter((o) =>
          bStudents.some((s) => s._id.toString() === o.student.toString())
        );
        const bPackages = bOffers.map((o) => o.packageLpa).filter((p) => typeof p === 'number');

        const isSubgroupSmall = bTotal > 0 && bTotal < 5;
        const isPlacedSubgroupSmall = bPlaced > 0 && bPlaced < 5;

        if (isSubgroupSmall || isPlacedSubgroupSmall) {
          doc.text(
            `Branch: ${br} | Students: ${
              isSubgroupSmall ? 'lt5' : bTotal
            } | Placed: lt5 | Rate: lt5 | Avg: -`
          );
        } else {
          const stats = calculatePackageStats(bPackages);
          const bRate = bTotal > 0 ? `${((bPlaced / bTotal) * 100).toFixed(1)}%` : '0%';
          doc.text(
            `Branch: ${br} | Students: ${bTotal} | Placed: ${bPlaced} | Rate: ${bRate} | Avg: ${stats.averagePackage} LPA`
          );
        }
      }
    }

    doc.end();
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get dynamically resolved filter values (states from approved colleges, batch years from students)
 * @route   GET /api/analytics/filters
 * @access  Private (Analyst & Superadmin)
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const rawStates = await College.find({ status: 'approved' }).distinct('state');
    const states = rawStates
      .filter((s) => s && typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort();

    const rawYears = await Student.find().distinct('batchYear');
    const batchYears = rawYears
      .filter((y) => y && !isNaN(Number(y)))
      .map(Number)
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort((a, b) => b - a);

    const rawBranches = await Student.find().distinct('branch');
    const branches = rawBranches
      .filter((b) => b && typeof b === 'string' && b.trim())
      .map((b) => b.trim())
      .filter((val, idx, arr) => arr.indexOf(val) === idx)
      .sort();

    res.status(200).json({
      success: true,
      states,
      batchYears,
      branches,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getColleges,
  getByBranch,
  getByYear,
  getTopRecruiters,
  compareColleges,
  exportExcel,
  exportPdf,
  getFilterOptions,
};

