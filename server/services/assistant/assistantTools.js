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
  InterviewSlot,
  DriveRequest,
} = require('../../models');
const { normalizeSkill } = require('../ai/skillsDictionary');
const { computeMatchScore } = require('../ai/matchingEngine');

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

// =====================================================================
// STUDENT TOOLS (Strictly scoped to the calling student's own record)
// =====================================================================

/**
 * S1. My Applications
 * List of drives the student has applied to with current status.
 */
async function myApplications(student) {
  if (!student || !student._id) throw new Error('Student profile required');

  const applications = await Application.find({ student: student._id })
    .populate({
      path: 'drive',
      populate: { path: 'company', select: 'name' },
    })
    .sort({ createdAt: -1 })
    .lean();

  const items = applications.map((app) => ({
    applicationId: app._id.toString(),
    driveId: app.drive?._id?.toString(),
    role: app.drive?.role || app.drive?.title || 'Placement Drive',
    company: app.drive?.company?.name || 'Recruiting Partner',
    packageLpa: app.drive?.packageLpa,
    status: app.status || 'applied',
    currentRound: app.currentRound || null,
    appliedAt: app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A',
  }));

  const byStatus = {};
  items.forEach((item) => {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  });

  return {
    count: items.length,
    byStatus,
    applications: items,
  };
}

/**
 * S2. My Upcoming Interviews
 * Scheduled interview time slots and room links for the student.
 */
async function myUpcomingInterviews(student) {
  if (!student || !student._id) throw new Error('Student profile required');

  const now = new Date();
  const slots = await InterviewSlot.find({
    student: student._id,
    status: { $in: ['scheduled', 'checked_in', 'in_progress'] },
    startTime: { $gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
  })
    .populate({
      path: 'drive',
      populate: { path: 'company', select: 'name' },
    })
    .populate('round', 'name roundNumber')
    .sort({ startTime: 1 })
    .lean();

  const interviews = slots.map((s) => ({
    slotId: s._id.toString(),
    company: s.drive?.company?.name || 'Company',
    role: s.drive?.role || s.drive?.title || 'Drive',
    round: s.round?.name || `Round ${s.round?.roundNumber || ''}`.trim() || 'Interview Round',
    startTime: s.startTime,
    endTime: s.endTime,
    queueNumber: s.queueNumber,
    status: s.status,
    meetingLink: s.meetingLink || '',
  }));

  return {
    count: interviews.length,
    interviews,
  };
}

/**
 * S3. Upcoming Eligible Drives
 * Open campus drives at the student's college that match academic criteria.
 */
async function upcomingEligibleDrives(student) {
  if (!student || !student._id) throw new Error('Student profile required');

  const studentCollegeId = student.college?._id || student.college;
  const eligibleQuery = {
    minCgpa: { $lte: typeof student.cgpa === 'number' ? student.cgpa : 0 },
    maxBacklogs: { $gte: typeof student.backlogs === 'number' ? student.backlogs : 0 },
  };

  if (student.branch) {
    eligibleQuery.allowedBranches = String(student.branch).toUpperCase().trim();
  }

  if (studentCollegeId) {
    eligibleQuery.$or = [{ college: studentCollegeId }, { colleges: studentCollegeId }];
  }

  const drives = await Drive.find(eligibleQuery)
    .populate('company', 'name')
    .sort({ lastDateToApply: 1 })
    .lean();

  const now = new Date();
  const validDrives = drives
    .filter((d) => {
      if (!d.lastDateToApply) return true;
      return new Date(d.lastDateToApply) >= now;
    })
    .map((d) => {
      let match;
      try {
        match = computeMatchScore(student, d);
      } catch (_) {
        match = { score: null };
      }
      return {
        driveId: d._id.toString(),
        company: d.company?.name || 'Corporate Partner',
        role: d.role,
        packageLpa: d.packageLpa,
        lastDateToApply: d.lastDateToApply ? new Date(d.lastDateToApply).toLocaleDateString() : 'TBD',
        driveDate: d.driveDate ? new Date(d.driveDate).toLocaleDateString() : 'TBD',
        matchScore: match?.score !== undefined ? match.score : null,
      };
    });

  return {
    count: validDrives.length,
    drives: validDrives.slice(0, 10),
  };
}

/**
 * S4. My Eligibility
 * Deterministically explains eligibility for a specific drive with exact reasons.
 */
async function myEligibility(student, params = {}) {
  if (!student || !student._id) throw new Error('Student profile required');

  const studentCollegeId = student.college?._id || student.college;
  const targetTerm = String(params.company || params.driveId || params.drive || '').trim();

  const query = {};
  if (studentCollegeId) {
    query.$or = [{ college: studentCollegeId }, { colleges: studentCollegeId }];
  }

  if (params.driveId && mongoose.Types.ObjectId.isValid(params.driveId)) {
    query._id = toObjectId(params.driveId);
  } else if (targetTerm) {
    if (mongoose.Types.ObjectId.isValid(targetTerm)) {
      query._id = toObjectId(targetTerm);
    } else {
      const comp = await Company.findOne({ name: new RegExp(targetTerm, 'i') });
      if (comp) {
        query.company = comp._id;
      } else {
        query.$or = [
          { role: new RegExp(targetTerm, 'i') },
          { title: new RegExp(targetTerm, 'i') },
        ];
      }
    }
  }

  const drive = await Drive.findOne(query).populate('company', 'name').sort({ createdAt: -1 });

  if (!drive) {
    return {
      found: false,
      message: targetTerm
        ? `No placement drive found matching "${targetTerm}" at your college.`
        : 'Please specify the company or drive name to check your eligibility.',
    };
  }

  const reasons = [];
  const checks = {};

  // 1. Branch
  const studentBranch = String(student.branch || '').toUpperCase().trim();
  const allowedBranches = (drive.allowedBranches || []).map((b) => String(b).toUpperCase().trim());
  const branchPass = allowedBranches.length === 0 || allowedBranches.includes(studentBranch);
  checks.branch = {
    pass: branchPass,
    studentValue: studentBranch,
    required: allowedBranches,
  };
  if (!branchPass) {
    reasons.push(
      `Your department (${studentBranch || 'Unspecified'}) is not included in allowed branches: ${allowedBranches.join(', ')}`
    );
  }

  // 2. CGPA
  const studentCgpa = typeof student.cgpa === 'number' ? student.cgpa : 0;
  const minCgpa = typeof drive.minCgpa === 'number' ? drive.minCgpa : 0;
  const cgpaPass = studentCgpa >= minCgpa;
  checks.cgpa = {
    pass: cgpaPass,
    studentValue: studentCgpa,
    requiredMin: minCgpa,
  };
  if (!cgpaPass) {
    reasons.push(`Your CGPA (${studentCgpa}) is below the required minimum of ${minCgpa}`);
  }

  // 3. Backlogs
  const studentBacklogs = typeof student.backlogs === 'number' ? student.backlogs : 0;
  const maxBacklogs = typeof drive.maxBacklogs === 'number' ? drive.maxBacklogs : 0;
  const backlogsPass = studentBacklogs <= maxBacklogs;
  checks.backlogs = {
    pass: backlogsPass,
    studentValue: studentBacklogs,
    allowedMax: maxBacklogs,
  };
  if (!backlogsPass) {
    reasons.push(`You have ${studentBacklogs} backlog(s), exceeding the maximum allowed limit of ${maxBacklogs}`);
  }

  // 4. Deadline
  const now = new Date();
  const deadlinePass = !drive.lastDateToApply || new Date(drive.lastDateToApply) >= now;
  checks.deadline = {
    pass: deadlinePass,
    lastDateToApply: drive.lastDateToApply,
  };
  if (!deadlinePass) {
    reasons.push(`Application deadline closed on ${new Date(drive.lastDateToApply).toLocaleDateString()}`);
  }

  const existingApp = await Application.findOne({ drive: drive._id, student: student._id });

  const isEligible = reasons.length === 0;

  return {
    found: true,
    driveId: drive._id.toString(),
    company: drive.company?.name || 'Company',
    role: drive.role,
    packageLpa: drive.packageLpa,
    isEligible,
    alreadyApplied: Boolean(existingApp),
    applicationStatus: existingApp?.status || null,
    reasons,
    checks,
  };
}

/**
 * S5. My Resume Status
 * Reads stored resume profile and ATS readiness analysis (no new LLM invocation).
 */
async function myResumeStatus(student) {
  if (!student || !student._id) throw new Error('Student profile required');

  const hasResume = Boolean(student.resumeUrl);
  const profile = student.resumeProfile;
  const isParsed = Boolean(profile && profile.status === 'parsed');
  const analysis = student.resumeAnalysis;

  const skillsCount = profile?.skills?.length || 0;
  const confirmedSkillsCount = (profile?.skills || []).filter((s) => s.confirmedByStudent).length;

  return {
    hasResume,
    isParsed,
    source: profile?.source || null,
    parsedAt: profile?.parsedAt || null,
    skillsCount,
    confirmedSkillsCount,
    hasAnalysis: Boolean(analysis),
    atsScore: analysis ? analysis.atsScore : null,
    targetTitle: analysis?.target?.title || null,
    missingRequiredSkills: analysis?.missingRequired || [],
    missingPreferredSkills: analysis?.missingPreferred || [],
    breakdown: analysis?.breakdown || null,
  };
}

// =====================================================================
// RECRUITER TOOLS (Strictly scoped to the recruiter's company)
// =====================================================================

/**
 * R1. My Drives Summary
 * Overview of drives, applicants, and offers for the recruiter's company.
 */
async function myDrivesSummary(companyId) {
  const compObjId = toObjectId(companyId);
  if (!compObjId) throw new Error('Invalid companyId');

  const drives = await Drive.find({ company: compObjId })
    .populate('college', 'name code')
    .sort({ createdAt: -1 })
    .lean();

  const driveIds = drives.map((d) => d._id);
  const totalApplicants = driveIds.length > 0 ? await Application.countDocuments({ drive: { $in: driveIds } }) : 0;
  const totalOffers = driveIds.length > 0 ? await Offer.countDocuments({ drive: { $in: driveIds }, status: 'accepted' }) : 0;

  const now = new Date();
  const activeDrives = drives.filter(
    (d) => d.status === 'open' && (!d.lastDateToApply || new Date(d.lastDateToApply) >= now)
  );
  const completedDrives = drives.filter((d) => d.status === 'completed');

  return {
    totalDrives: drives.length,
    activeDrivesCount: activeDrives.length,
    completedDrivesCount: completedDrives.length,
    totalApplicants,
    totalOffers,
    drives: drives.slice(0, 10).map((d) => ({
      id: d._id.toString(),
      role: d.role,
      title: d.title,
      packageLpa: d.packageLpa,
      status: d.status,
      college: d.college?.name || 'Campus Drive',
      driveDate: d.driveDate ? new Date(d.driveDate).toLocaleDateString() : 'TBD',
    })),
  };
}

/**
 * R2. My Drive Funnel
 * Conversion funnel (applied -> shortlisted -> offered -> accepted) for a recruiter drive.
 */
async function myDriveFunnel(companyId, params = {}) {
  const compObjId = toObjectId(companyId);
  if (!compObjId) throw new Error('Invalid companyId');

  const driveQuery = { company: compObjId };
  if (params.driveId && mongoose.Types.ObjectId.isValid(params.driveId)) {
    driveQuery._id = toObjectId(params.driveId);
  } else if (params.driveName || params.drive) {
    const term = String(params.driveName || params.drive).trim();
    if (mongoose.Types.ObjectId.isValid(term)) {
      driveQuery._id = toObjectId(term);
    } else {
      driveQuery.$or = [
        { role: new RegExp(term, 'i') },
        { title: new RegExp(term, 'i') },
      ];
    }
  }

  const drive = await Drive.findOne(driveQuery).sort({ createdAt: -1 });
  if (!drive) {
    return {
      found: false,
      message: 'No matching placement drive found under your recruiter account.',
    };
  }

  const totalApplied = await Application.countDocuments({ drive: drive._id });
  const shortlisted = await Application.countDocuments({
    drive: drive._id,
    status: { $in: ['shortlisted', 'in_round', 'selected', 'offered'] },
  });
  const offered = await Application.countDocuments({
    drive: drive._id,
    status: { $in: ['selected', 'offered'] },
  });
  const accepted = await Offer.countDocuments({
    drive: drive._id,
    status: 'accepted',
  });

  const conversionRate = totalApplied > 0 ? Math.round((accepted / totalApplied) * 100) : 0;

  return {
    found: true,
    driveId: drive._id.toString(),
    driveTitle: drive.title || drive.role,
    role: drive.role,
    applied: totalApplied,
    shortlisted,
    offered,
    accepted,
    conversionRate,
  };
}

/**
 * R3. My Top Applicants
 * Top ranked candidates for a recruiter drive using deterministic AI scoring.
 */
async function myTopApplicants(companyId, params = {}) {
  const compObjId = toObjectId(companyId);
  if (!compObjId) throw new Error('Invalid companyId');

  const limit = Math.min(10, Math.max(1, Number(params.limit) || 5));

  const driveQuery = { company: compObjId };
  if (params.driveId && mongoose.Types.ObjectId.isValid(params.driveId)) {
    driveQuery._id = toObjectId(params.driveId);
  } else if (params.drive) {
    if (mongoose.Types.ObjectId.isValid(params.drive)) {
      driveQuery._id = toObjectId(params.drive);
    } else {
      driveQuery.$or = [
        { role: new RegExp(String(params.drive).trim(), 'i') },
        { title: new RegExp(String(params.drive).trim(), 'i') },
      ];
    }
  }

  const drive = await Drive.findOne(driveQuery).sort({ createdAt: -1 });
  if (!drive) {
    return {
      found: false,
      message: 'No matching placement drive found under your recruiter account.',
      applicants: [],
    };
  }

  const applications = await Application.find({ drive: drive._id })
    .populate({
      path: 'student',
      populate: [
        { path: 'user', select: 'name email' },
        { path: 'college', select: 'name code' },
      ],
    })
    .lean();

  const ranked = applications
    .filter((app) => app.student)
    .map((app) => {
      let match;
      try {
        match = computeMatchScore(app.student, drive);
      } catch (_) {
        match = { score: null, missingSkills: [] };
      }
      return {
        studentId: app.student._id,
        name: app.student.user?.name || 'Applicant',
        enrollmentNo: app.student.enrollmentNo || '',
        branch: app.student.branch || '',
        college: app.student.college?.name || 'College',
        collegeCode: app.student.college?.code || '',
        cgpa: typeof app.student.cgpa === 'number' ? app.student.cgpa : null,
        status: app.status || 'applied',
        matchScore: match?.score !== undefined ? match.score : null,
        missingSkills: match?.missingSkills || [],
        appliedAt: app.createdAt,
      };
    })
    .sort((a, b) => {
      const scoreA = a.matchScore !== null ? a.matchScore : -1;
      const scoreB = b.matchScore !== null ? b.matchScore : -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.cgpa || 0) - (a.cgpa || 0);
    })
    .slice(0, limit);

  return {
    found: true,
    driveId: drive._id.toString(),
    driveTitle: drive.title || drive.role,
    role: drive.role,
    totalApplicants: applications.length,
    applicants: ranked,
  };
}

/**
 * R4. My Drive Requests
 * Summary of campus drive invitations sent by the recruiter to colleges.
 */
async function myDriveRequests(companyId, params = {}) {
  const compObjId = toObjectId(companyId);
  if (!compObjId) throw new Error('Invalid companyId');

  const query = { company: compObjId };
  if (params.status) {
    query.status = String(params.status).trim().toLowerCase();
  }

  const requests = await DriveRequest.find(query)
    .populate('college', 'name code')
    .populate('jobRequirement', 'title role packageLpa')
    .sort({ createdAt: -1 })
    .lean();

  const statusCounts = {
    pending: 0,
    accepted: 0,
    rejected: 0,
    reschedule_proposed: 0,
  };

  requests.forEach((r) => {
    if (statusCounts[r.status] !== undefined) {
      statusCounts[r.status]++;
    }
  });

  return {
    totalRequests: requests.length,
    statusCounts,
    requests: requests.slice(0, 10).map((r) => ({
      id: r._id.toString(),
      college: r.college?.name || 'Partner College',
      role: r.jobRequirement?.role || r.jobRequirement?.title || 'Drive Request',
      status: r.status,
      mode: r.mode,
      proposedDates: (r.proposedDates || []).map((d) => new Date(d).toLocaleDateString()),
      createdAt: r.createdAt,
    })),
  };
}

module.exports = {
  // TPO Tools
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
  // Student Tools
  myApplications,
  myUpcomingInterviews,
  upcomingEligibleDrives,
  myEligibility,
  myResumeStatus,
  // Recruiter Tools
  myDrivesSummary,
  myDriveFunnel,
  myTopApplicants,
  myDriveRequests,
};
