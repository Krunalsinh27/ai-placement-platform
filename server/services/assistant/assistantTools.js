/**
 * Pure functions for TPO Assistant Tools.
 * Each tool strictly enforces college isolation by taking collegeId as its first parameter.
 * Tools NEVER execute raw client-supplied SQL/queries or trust params for scoping.
 */

const mongoose = require('mongoose');
const {
  Student,
  Application,
  Offer,
  Drive,
  Company,
  RoundParticipant,
  User,
} = require('../../models');
const { normalizeSkill } = require('../ai/skillsDictionary');

/**
 * Ensures valid ObjectId format
 */
function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return null;
}

/**
 * 1. Placement Summary
 * Totals, placed count, percentage, average/median/highest package for the college cohort.
 */
async function placementSummary(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const batchYear = params.batch ? Number(params.batch) : null;
  const branch = params.department ? String(params.department).trim().toUpperCase() : null;

  // 1. Student cohort aggregation
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
  ]);

  const summary = studentAgg[0] || { totalStudents: 0, verifiedStudents: 0, studentIds: [] };
  const totalStudents = summary.totalStudents;
  const verifiedStudents = summary.verifiedStudents;
  const matchedStudentIds = summary.studentIds;

  // 2. Registered for Placement (unique students with at least 1 application)
  let registeredForPlacement = 0;
  if (matchedStudentIds.length > 0) {
    const regAgg = await Application.aggregate([
      { $match: { student: { $in: matchedStudentIds } } },
      { $group: { _id: '$student' } },
      { $count: 'count' },
    ]);
    registeredForPlacement = regAgg[0]?.count || 0;
  }

  // 3. Offers match pipeline for placed students
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
        $or: [{ college: collegeObjId }, { 'studentDoc.college': collegeObjId }],
        ...(batchYear && { 'studentDoc.batchYear': batchYear }),
        ...(branch && { 'studentDoc.branch': branch }),
      },
    },
  ];

  // Placed students (status === 'accepted')
  const placedStudentsAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    { $match: { status: 'accepted' } },
    {
      $group: {
        _id: '$student',
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
        highestPackage: {
          $cond: [{ $gt: [{ $size: '$packages' }, 0] }, { $max: '$packages' }, null],
        },
      },
    },
  ]);

  const placedStudents = placedStudentsAgg.length;
  const unplacedCount = Math.max(0, totalStudents - placedStudents);
  const placementPercentage =
    totalStudents > 0 ? Number(((placedStudents / totalStudents) * 100).toFixed(2)) : 0;

  // Total offers extended
  const totalOffersAgg = await Offer.aggregate([
    ...offerMatchPipeline,
    { $count: 'count' },
  ]);
  const totalOffers = totalOffersAgg[0]?.count || 0;

  // Package calculations over placed students' highest packages
  const packages = placedStudentsAgg
    .map((p) => p.highestPackage)
    .filter((p) => typeof p === 'number' && !isNaN(p) && p >= 0);

  let averagePackage = null;
  let medianPackage = null;
  let highestPackage = null;
  let lowestPackage = null;

  if (packages.length > 0) {
    packages.sort((a, b) => a - b);
    const sum = packages.reduce((acc, val) => acc + val, 0);
    averagePackage = Number((sum / packages.length).toFixed(2));
    highestPackage = packages[packages.length - 1];
    lowestPackage = packages[0];

    const mid = Math.floor(packages.length / 2);
    if (packages.length % 2 === 0) {
      medianPackage = Number(((packages[mid - 1] + packages[mid]) / 2).toFixed(2));
    } else {
      medianPackage = packages[mid];
    }
  }

  return {
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
    department: branch || 'All Departments',
    batch: batchYear || 'All Batches',
  };
}

/**
 * 2. Department Breakdown
 * Branch-wise comparison of total, placed, % and package statistics.
 */
async function departmentBreakdown(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const batchYear = params.batch ? Number(params.batch) : null;

  const studentMatch = { college: collegeObjId };
  if (batchYear) studentMatch.batchYear = batchYear;

  // 1. Total students per department
  const deptTotals = await Student.aggregate([
    { $match: studentMatch },
    {
      $group: {
        _id: '$branch',
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // 2. Placed students and packages per department
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
        $or: [{ college: collegeObjId }, { 'studentDoc.college': collegeObjId }],
        ...(batchYear && { 'studentDoc.batchYear': batchYear }),
        status: 'accepted',
      },
    },
    {
      $group: {
        _id: '$student',
        branch: { $first: '$studentDoc.branch' },
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
        branch: 1,
        highestPackage: {
          $cond: [{ $gt: [{ $size: '$packages' }, 0] }, { $max: '$packages' }, null],
        },
      },
    },
  ];

  const placedPerStudent = await Offer.aggregate(offerMatchPipeline);

  // Group placed by branch
  const branchPlacedMap = new Map();
  for (const item of placedPerStudent) {
    const b = item.branch || 'OTHER';
    if (!branchPlacedMap.has(b)) {
      branchPlacedMap.set(b, []);
    }
    if (typeof item.highestPackage === 'number') {
      branchPlacedMap.get(b).push(item.highestPackage);
    } else {
      branchPlacedMap.get(b).push(null);
    }
  }

  const result = deptTotals.map((dt) => {
    const dept = dt._id || 'Unknown';
    const total = dt.total || 0;
    const placedPkgs = branchPlacedMap.get(dept) || [];
    const placed = placedPkgs.length;
    const placementPercentage =
      total > 0 ? Number(((placed / total) * 100).toFixed(2)) : 0;

    const validPkgs = placedPkgs.filter((p) => typeof p === 'number' && !isNaN(p) && p >= 0);
    let avgPackage = null;
    let highestPackage = null;

    if (validPkgs.length > 0) {
      const sum = validPkgs.reduce((a, b) => a + b, 0);
      avgPackage = Number((sum / validPkgs.length).toFixed(2));
      highestPackage = Math.max(...validPkgs);
    }

    return {
      department: dept,
      total,
      placed,
      placementPercentage,
      avgPackage,
      highestPackage,
    };
  });

  return result;
}

/**
 * 3. Unplaced Students
 * Returns count plus a short list (name, enrollmentNo, branch, cgpa; nothing else).
 */
async function unplacedStudents(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const limit = Math.min(20, Math.max(1, Number(params.limit) || 20));
  const batchYear = params.batch ? Number(params.batch) : null;
  const branch = params.department ? String(params.department).trim().toUpperCase() : null;

  // 1. Get placed student IDs for this college
  const placedAgg = await Offer.aggregate([
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
        $or: [{ college: collegeObjId }, { 'studentDoc.college': collegeObjId }],
        status: 'accepted',
      },
    },
    {
      $group: {
        _id: '$student',
      },
    },
  ]);

  const placedIds = placedAgg.map((p) => p._id);

  // 2. Query unplaced students
  const query = {
    college: collegeObjId,
    _id: { $nin: placedIds },
  };
  if (batchYear) query.batchYear = batchYear;
  if (branch) query.branch = branch;

  const totalCount = await Student.countDocuments(query);

  const studentsDocs = await Student.find(query)
    .populate('user', 'name')
    .sort({ cgpa: -1, enrollmentNo: 1 })
    .limit(limit)
    .lean();

  const students = studentsDocs.map((s) => ({
    name: s.user?.name || 'Student',
    enrollmentNo: s.enrollmentNo || '',
    branch: s.branch || '',
    cgpa: typeof s.cgpa === 'number' ? s.cgpa : null,
  }));

  return {
    count: totalCount,
    department: branch || 'All Departments',
    batch: batchYear || 'All Batches',
    students,
  };
}

/**
 * 4. Company Stats
 * Drives, applicants, offers, accepted, avg package per company partner.
 */
async function companyStats(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const companyFilter = params.company ? String(params.company).trim() : null;

  // 1. Drives associated with this college
  const driveMatch = {
    $or: [{ college: collegeObjId }, { colleges: collegeObjId }],
  };

  const drives = await Drive.find(driveMatch)
    .populate('company', 'name')
    .lean();

  if (drives.length === 0) {
    return [];
  }

  const driveIds = drives.map((d) => d._id);

  // Map drive to company name
  const driveCompanyMap = new Map();
  drives.forEach((d) => {
    const compName = d.company?.name || d.companyName || 'Corporate Partner';
    driveCompanyMap.set(d._id.toString(), compName);
  });

  // 2. Applications count per drive
  const appAgg = await Application.aggregate([
    { $match: { drive: { $in: driveIds } } },
    {
      $lookup: {
        from: 'students',
        localField: 'student',
        foreignField: '_id',
        as: 'studentDoc',
      },
    },
    { $unwind: '$studentDoc' },
    { $match: { 'studentDoc.college': collegeObjId } },
    {
      $group: {
        _id: '$drive',
        count: { $sum: 1 },
      },
    },
  ]);

  const driveAppMap = new Map();
  appAgg.forEach((a) => driveAppMap.set(a._id.toString(), a.count));

  // 3. Offers count and packages per drive
  const offerAgg = await Offer.aggregate([
    { $match: { drive: { $in: driveIds } } },
    {
      $lookup: {
        from: 'students',
        localField: 'student',
        foreignField: '_id',
        as: 'studentDoc',
      },
    },
    { $unwind: '$studentDoc' },
    { $match: { 'studentDoc.college': collegeObjId } },
    {
      $group: {
        _id: '$drive',
        offers: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        packages: {
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

  const driveOfferMap = new Map();
  offerAgg.forEach((o) => driveOfferMap.set(o._id.toString(), o));

  // Aggregate by company
  const companyMap = new Map();
  drives.forEach((d) => {
    const cName = driveCompanyMap.get(d._id.toString());
    if (companyFilter && !new RegExp(companyFilter, 'i').test(cName)) {
      return;
    }

    if (!companyMap.has(cName)) {
      companyMap.set(cName, {
        company: cName,
        drives: 0,
        applicants: 0,
        offers: 0,
        accepted: 0,
        packages: [],
      });
    }

    const cData = companyMap.get(cName);
    cData.drives += 1;
    cData.applicants += driveAppMap.get(d._id.toString()) || 0;

    const oData = driveOfferMap.get(d._id.toString());
    if (oData) {
      cData.offers += oData.offers || 0;
      cData.accepted += oData.accepted || 0;
      if (Array.isArray(oData.packages)) {
        cData.packages.push(...oData.packages);
      }
    }
  });

  const result = Array.from(companyMap.values()).map((c) => {
    let avgPackage = null;
    if (c.packages.length > 0) {
      const sum = c.packages.reduce((acc, p) => acc + p, 0);
      avgPackage = Number((sum / c.packages.length).toFixed(2));
    }
    return {
      company: c.company,
      drives: c.drives,
      applicants: c.applicants,
      offers: c.offers,
      accepted: c.accepted,
      avgPackage,
    };
  });

  result.sort((a, b) => b.offers - a.offers || b.drives - a.drives);
  return result;
}

/**
 * 5. Drive Funnel
 * Conversion funnel (applied -> shortlisted -> offered -> accepted) for a drive.
 */
async function driveFunnel(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  // Search drive within college
  let drive = null;
  const driveScope = {
    $or: [{ college: collegeObjId }, { colleges: collegeObjId }],
  };

  if (params.driveId && mongoose.Types.ObjectId.isValid(params.driveId)) {
    drive = await Drive.findOne({ _id: params.driveId, ...driveScope })
      .populate('company', 'name')
      .lean();
  }

  if (!drive && (params.driveName || params.company)) {
    const term = params.driveName || params.company;
    const regex = new RegExp(term.trim(), 'i');

    // First try matching drive role/title
    drive = await Drive.findOne({
      ...driveScope,
      $or: [{ role: regex }, { title: regex }],
    })
      .populate('company', 'name')
      .lean();

    // If not found, try matching company name
    if (!drive) {
      const matchingCompanies = await Company.find({ name: regex }, '_id').lean();
      const compIds = matchingCompanies.map((c) => c._id);
      if (compIds.length > 0) {
        drive = await Drive.findOne({
          ...driveScope,
          company: { $in: compIds },
        })
          .populate('company', 'name')
          .sort({ createdAt: -1 })
          .lean();
      }
    }
  }

  // Fallback to most recent drive if none specified
  if (!drive && !params.driveId && !params.driveName && !params.company) {
    drive = await Drive.findOne(driveScope)
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!drive) {
    return {
      found: false,
      message: 'No matching placement drive found at your college.',
    };
  }

  const compName = drive.company?.name || drive.companyName || 'Corporate Partner';
  const driveTitle = drive.title || drive.role || 'Placement Drive';

  // 1. Applied
  const applied = await Application.countDocuments({ drive: drive._id });

  // 2. Shortlisted (students who cleared at least one round or were marked shortlisted)
  const shortlistedStudents = await RoundParticipant.distinct('student', {
    drive: drive._id,
    $or: [{ result: 'cleared' }, { status: 'shortlisted' }],
  });
  const shortlisted = shortlistedStudents.length;

  // 3. Offered
  const offered = await Offer.countDocuments({ drive: drive._id });

  // 4. Accepted
  const accepted = await Offer.countDocuments({ drive: drive._id, status: 'accepted' });

  const conversionRate = applied > 0 ? Number(((accepted / applied) * 100).toFixed(1)) : 0;

  return {
    found: true,
    driveId: drive._id.toString(),
    driveTitle,
    company: compName,
    applied,
    shortlisted,
    offered,
    accepted,
    conversionRate,
  };
}

/**
 * 6. Upcoming Drives
 * Scheduled drives within the next N days (max 60).
 */
async function upcomingDrives(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const days = Math.min(60, Math.max(1, Number(params.days) || 30));
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(startOfToday.getTime() + days * 24 * 60 * 60 * 1000);

  const query = {
    $and: [
      {
        $or: [{ college: collegeObjId }, { colleges: collegeObjId }],
      },
      {
        status: { $in: ['open', 'active', 'upcoming', 'pending'] },
      },
      {
        $or: [
          { driveDate: { $gte: startOfToday, $lte: windowEnd } },
          { lastDateToApply: { $gte: startOfToday, $lte: windowEnd } },
          { applicationDeadline: { $gte: startOfToday, $lte: windowEnd } },
        ],
      },
    ],
  };

  const drives = await Drive.find(query)
    .populate('company', 'name')
    .sort({ driveDate: 1, applicationDeadline: 1 })
    .lean();

  return drives.map((d) => ({
    driveId: d._id.toString(),
    company: d.company?.name || d.companyName || 'Corporate Partner',
    role: d.role || 'Software Engineer',
    driveDate: d.driveDate ? d.driveDate.toISOString().split('T')[0] : 'TBD',
    applicationDeadline: d.lastDateToApply
      ? d.lastDateToApply.toISOString().split('T')[0]
      : d.applicationDeadline
        ? d.applicationDeadline.toISOString().split('T')[0]
        : 'Open',
    eligibleBranches: d.allowedBranches || d.eligibleBranches || [],
    status: d.status,
  }));
}

/**
 * 7. Offer Status
 * Status overview: pending, accepted, declined, expiring soon (next 7 days).
 */
async function offerStatus(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const batchYear = params.batch ? Number(params.batch) : null;
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const offerAgg = await Offer.aggregate([
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
        $or: [{ college: collegeObjId }, { 'studentDoc.college': collegeObjId }],
        ...(batchYear && { 'studentDoc.batchYear': batchYear }),
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $in: ['$status', ['offered', 'pending']] }, 1, 0] },
        },
        declined: {
          $sum: {
            $cond: [{ $in: ['$status', ['rejected', 'declined', 'revoked', 'expired']] }, 1, 0],
          },
        },
        expiringSoon: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$status', ['offered', 'pending']] },
                  { $gte: ['$expiryDate', now] },
                  { $lte: ['$expiryDate', nextWeek] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const res = offerAgg[0] || {
    total: 0,
    accepted: 0,
    pending: 0,
    declined: 0,
    expiringSoon: 0,
  };

  return {
    total: res.total,
    accepted: res.accepted,
    pending: res.pending,
    declined: res.declined,
    expiringSoon: res.expiringSoon,
  };
}

/**
 * 8. Students With Skill
 * Count and first 20 names for students who analyzed their resume and have the normalized skill.
 */
async function studentsWithSkill(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const normSkill = normalizeSkill(params.skill);
  if (!normSkill) {
    return {
      skill: params.skill || '',
      count: 0,
      students: [],
    };
  }

  const query = {
    college: collegeObjId,
    'resumeProfile.status': 'parsed',
    'resumeProfile.skills.name': normSkill,
  };

  const totalCount = await Student.countDocuments(query);

  const studentsDocs = await Student.find(query)
    .populate('user', 'name')
    .sort({ cgpa: -1, enrollmentNo: 1 })
    .limit(20)
    .lean();

  const students = studentsDocs.map((s) => ({
    name: s.user?.name || 'Student',
    enrollmentNo: s.enrollmentNo || '',
    branch: s.branch || '',
    cgpa: typeof s.cgpa === 'number' ? s.cgpa : null,
  }));

  return {
    skill: normSkill,
    count: totalCount,
    students,
  };
}

/**
 * 9. Students Without Resume
 * Count and first 20 students who haven't uploaded or analyzed their resume.
 */
async function studentsWithoutResume(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const branch = params.department ? String(params.department).trim().toUpperCase() : null;

  const query = {
    college: collegeObjId,
    $or: [
      { resumeUrl: { $in: [null, ''] } },
      { 'resumeProfile.status': { $in: ['none', null] } },
      { resumeProfile: { $exists: false } },
    ],
  };

  if (branch) {
    query.branch = branch;
  }

  const totalCount = await Student.countDocuments(query);

  const studentsDocs = await Student.find(query)
    .populate('user', 'name')
    .sort({ enrollmentNo: 1 })
    .limit(20)
    .lean();

  const students = studentsDocs.map((s) => ({
    name: s.user?.name || 'Student',
    enrollmentNo: s.enrollmentNo || '',
    branch: s.branch || '',
    cgpa: typeof s.cgpa === 'number' ? s.cgpa : null,
  }));

  return {
    department: branch || 'All Departments',
    count: totalCount,
    students,
  };
}

/**
 * 10. Top Packages
 * Highest accepted packages at the college (limit <= 10).
 */
async function topPackages(collegeId, params = {}) {
  const collegeObjId = toObjectId(collegeId);
  if (!collegeObjId) throw new Error('Invalid collegeId');

  const limit = Math.min(10, Math.max(1, Number(params.limit) || 5));

  const offers = await Offer.find({
    college: collegeObjId,
    status: 'accepted',
    packageLpa: { $gt: 0 },
  })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name' },
    })
    .populate('company', 'name')
    .populate('drive', 'role title')
    .sort({ packageLpa: -1 })
    .limit(limit)
    .lean();

  return offers.map((o) => ({
    studentName: o.student?.user?.name || 'Candidate',
    branch: o.student?.branch || 'N/A',
    company: o.company?.name || o.companyName || 'Corporate Partner',
    role: o.role || o.drive?.role || o.drive?.title || 'Offer',
    packageLpa: typeof o.packageLpa === 'number' ? o.packageLpa : null,
  }));
}

module.exports = {
  placementSummary,
  departmentBreakdown,
  unplacedStudents,
  companyStats,
  driveFunnel,
  upcomingDrives,
  offerStatus,
  studentsWithSkill,
  studentsWithoutResume,
  topPackages,
};
