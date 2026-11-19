const {
  User,
  College,
  Company,
  Student,
  Drive,
  Offer,
  Application,
} = require('../models');
const { sendAccountApprovedEmail, sendAccountRejectedEmail } = require('../utils/emailService');

/**
 * @desc    Get platform-wide overview statistics for Superadmin
 * @route   GET /api/superadmin/overview
 * @access  Private (Superadmin only)
 */
const getPlatformOverview = async (req, res, next) => {
  try {
    const [
      totalColleges,
      approvedColleges,
      pendingColleges,
      rejectedColleges,
      totalStudents,
      totalRecruiters,
      totalCompanies,
      verifiedCompanies,
      totalDrives,
      totalPlacements,
      pendingAnalystsCount,
      pendingAccountsCount,
      pendingTposCount,
      pendingStudentsCount,
      pendingRecruitersCount,
    ] = await Promise.all([
      College.countDocuments(),
      College.countDocuments({ status: 'approved' }),
      College.countDocuments({ status: 'pending' }),
      College.countDocuments({ status: 'rejected' }),
      Student.countDocuments(),
      User.countDocuments({ role: 'recruiter' }),
      Company.countDocuments(),
      Company.countDocuments({ verified: true }),
      Drive.countDocuments(),
      Offer.countDocuments({ status: 'accepted' }),
      User.countDocuments({ role: 'analyst', isApproved: false }),
      User.countDocuments({ isApproved: false, role: { $in: ['tpo', 'student', 'recruiter'] } }),
      User.countDocuments({ isApproved: false, role: 'tpo' }),
      User.countDocuments({ isApproved: false, role: 'student' }),
      User.countDocuments({ isApproved: false, role: 'recruiter' }),
    ]);

    // Fetch recent pending approvals (colleges, analysts, and accounts)
    const [recentPendingColleges, recentPendingAnalysts, recentPendingAccounts] = await Promise.all([
      College.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean(),
      User.find({ role: 'analyst', isApproved: false })
        .sort({ createdAt: -1 })
        .select('_id name email organisation designation createdAt')
        .limit(5)
        .lean(),
      User.find({ isApproved: false, role: { $in: ['tpo', 'student', 'recruiter'] } })
        .populate('college', 'name code')
        .populate('company', 'name industry')
        .sort({ createdAt: -1 })
        .select('_id name email role college company createdAt')
        .limit(5)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      totals: {
        colleges: {
          total: totalColleges,
          approved: approvedColleges,
          pending: pendingColleges,
          rejected: rejectedColleges,
        },
        students: totalStudents,
        recruiters: {
          totalUsers: totalRecruiters,
          totalCompanies: totalCompanies,
          verifiedCompanies: verifiedCompanies,
        },
        drives: totalDrives,
        placements: totalPlacements,
        pendingAccounts: pendingAccountsCount,
      },
      pendingCounts: {
        analysts: pendingAnalystsCount,
        colleges: pendingColleges,
        accounts: pendingAccountsCount,
        tpos: pendingTposCount,
        students: pendingStudentsCount,
        recruiters: pendingRecruitersCount,
      },
      recentPending: {
        colleges: recentPendingColleges,
        analysts: recentPendingAnalysts,
        accounts: recentPendingAccounts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of analysts (filter by pending, approved, or all)
 * @route   GET /api/superadmin/analysts
 * @access  Private (Superadmin only)
 */
const getAnalysts = async (req, res, next) => {
  try {
    const { status = 'all' } = req.query;
    const query = { role: 'analyst' };

    if (status === 'pending') {
      query.isApproved = false;
    } else if (status === 'approved') {
      query.isApproved = true;
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await User.countDocuments(query);
    const analysts = await User.find(query)
      .select('_id name email organisation organisationType purpose designation isApproved isEmailVerified createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      success: true,
      data: analysts,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: analysts.length,
      analysts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve or reject an analyst account
 * @route   PUT /api/superadmin/analysts/:id/status
 * @access  Private (Superadmin only)
 */
const updateAnalystStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, approve } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== 'analyst') {
      return res.status(404).json({
        success: false,
        message: 'Analyst account not found',
      });
    }

    const isApprove = approve === true || status === 'approved';
    user.isApproved = isApprove;
    await user.save();

    res.status(200).json({
      success: true,
      message: isApprove
        ? 'Analyst account approved successfully'
        : 'Analyst account marked as unapproved / rejected',
      analyst: {
        _id: user._id,
        name: user.name,
        email: user.email,
        organisation: user.organisation,
        designation: user.designation,
        isApproved: user.isApproved,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all colleges with their status & TPO details
 * @route   GET /api/superadmin/colleges
 * @access  Private (Superadmin only)
 */
const getColleges = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await College.countDocuments(query);
    const colleges = await College.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Attach TPO information if present
    const collegesWithTpo = await Promise.all(
      colleges.map(async (college) => {
        const tpo = await User.findOne({ college: college._id, role: 'tpo' })
          .select('name email phone isApproved isEmailVerified')
          .lean();
        const studentsCount = await Student.countDocuments({ college: college._id });
        return {
          ...college,
          tpo: tpo || null,
          studentsCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: collegesWithTpo,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: collegesWithTpo.length,
      colleges: collegesWithTpo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve or reject a college
 * @route   PUT /api/superadmin/colleges/:id/status
 * @access  Private (Superadmin only)
 */
const updateCollegeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Allowed values: pending, approved, rejected',
      });
    }

    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
      });
    }

    college.status = status;
    await college.save();

    // If college is approved, ensure its administrator TPO user is also approved so they can log in
    if (status === 'approved') {
      await User.updateMany(
        { college: college._id, role: 'tpo' },
        { $set: { isApproved: true } }
      );
    }

    res.status(200).json({
      success: true,
      message: `College status updated to "${status}" successfully`,
      college,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get companies list for Superadmin verification
 * @route   GET /api/superadmin/companies
 * @access  Private (Superadmin only)
 */
const getCompanies = async (req, res, next) => {
  try {
    const { verified } = req.query;
    const query = {};

    if (verified === 'true') query.verified = true;
    if (verified === 'false') query.verified = false;

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Company.countDocuments(query);
    const companies = await Company.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const drivesCount = await Drive.countDocuments({ company: company._id });
        return {
          ...company,
          drivesCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: companiesWithStats,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: companiesWithStats.length,
      companies: companiesWithStats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify or unverify a company
 * @route   PUT /api/superadmin/companies/:id/verify
 * @access  Private (Superadmin only)
 */
const updateCompanyVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    const isVerified = typeof verified === 'boolean' ? verified : !company.verified;
    company.verified = isVerified;
    await company.save();

    res.status(200).json({
      success: true,
      message: `Company ${isVerified ? 'verified' : 'unverified'} successfully`,
      company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all pending unapproved TPO and student accounts across all colleges
 * @route   GET /api/superadmin/pending-accounts
 * @access  Private (Superadmin only)
 */
const getPendingAccounts = async (req, res, next) => {
  try {
    const { role = 'all' } = req.query;
    const query = {
      isApproved: false,
      role: { $in: ['tpo', 'student', 'recruiter'] },
    };

    if (['tpo', 'student', 'recruiter'].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('_id name email role phone college company createdAt isApproved isEmailVerified')
      .populate('college', 'name code city state status')
      .populate('company', 'name industry verified')
      .sort({ createdAt: -1 })
      .lean();

    // Map student details (enrollmentNo, branch, etc.) if student
    const studentUserIds = users.filter((u) => u.role === 'student').map((u) => u._id);
    let studentMap = {};
    if (studentUserIds.length > 0) {
      const studentDocs = await Student.find({ user: { $in: studentUserIds } })
        .select('user enrollmentNo branch batchYear')
        .lean();
      studentDocs.forEach((s) => {
        studentMap[s.user.toString()] = s;
      });
    }

    // Determine colleges with zero approved TPOs for Requirement 3
    const tpoCollegeIds = [
      ...new Set(
        users
          .filter((u) => u.role === 'tpo' && u.college)
          .map((u) => (u.college._id || u.college).toString())
      ),
    ];

    // For each college, check how many approved TPOs exist
    const collegeApprovedTpoCounts = {};
    const firstPendingTpoByCollege = {};

    await Promise.all(
      tpoCollegeIds.map(async (collegeId) => {
        const approvedCount = await User.countDocuments({
          college: collegeId,
          role: 'tpo',
          isApproved: true,
        });
        collegeApprovedTpoCounts[collegeId] = approvedCount;

        if (approvedCount === 0) {
          // Find earliest registered pending TPO for this college
          const earliest = await User.findOne({
            college: collegeId,
            role: 'tpo',
            isApproved: false,
          })
            .sort({ createdAt: 1 })
            .select('_id')
            .lean();
          if (earliest) {
            firstPendingTpoByCollege[collegeId] = earliest._id.toString();
          }
        }
      })
    );

    const accounts = users.map((user) => {
      const collegeId = (user.college?._id || user.college)?.toString();
      const isFirstPendingTpoWithNoActive =
        user.role === 'tpo' &&
        collegeId &&
        collegeApprovedTpoCounts[collegeId] === 0 &&
        firstPendingTpoByCollege[collegeId] === user._id.toString();

      return {
        ...user,
        studentProfile: studentMap[user._id.toString()] || null,
        noActiveTpo: Boolean(isFirstPendingTpoWithNoActive),
        noActiveTpoLabel: isFirstPendingTpoWithNoActive
          ? 'No active TPO for this college'
          : null,
      };
    });

    const total = accounts.length;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const paginatedAccounts = accounts.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.status(200).json({
      success: true,
      data: paginatedAccounts,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: paginatedAccounts.length,
      accounts: paginatedAccounts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Superadmin approve a pending TPO, student, or recruiter account
 * @route   PUT /api/superadmin/pending-accounts/:id/approve
 * @access  Private (Superadmin only)
 */
const approvePendingAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).populate('college').populate('company');

    if (!user || !['tpo', 'student', 'recruiter'].includes(user.role)) {
      return res.status(404).json({
        success: false,
        message: 'Pending account not found or not eligible for approval',
      });
    }

    user.isApproved = true;
    await user.save();

    const orgName = user.role === 'recruiter' ? user.company?.name : user.college?.name;

    // Send email notification to user
    sendAccountApprovedEmail({
      to: user.email,
      name: user.name,
      role: user.role,
      collegeName: orgName,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Account for ${user.name} (${user.role.toUpperCase()}) approved successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        college: user.college,
        company: user.company,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Superadmin reject and delete a pending TPO, student, or recruiter account
 * @route   PUT /api/superadmin/pending-accounts/:id/reject
 * @access  Private (Superadmin only)
 */
const rejectPendingAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).populate('college').populate('company');

    if (!user || !['tpo', 'student', 'recruiter'].includes(user.role)) {
      return res.status(404).json({
        success: false,
        message: 'Pending account not found or not eligible for rejection',
      });
    }

    const userName = user.name;
    const userEmail = user.email;
    const userRole = user.role;
    const orgName = user.role === 'recruiter' ? user.company?.name : user.college?.name;

    // Send rejection email notification to user
    sendAccountRejectedEmail({
      to: userEmail,
      name: userName,
      role: userRole,
      collegeName: orgName,
    }).catch(() => {});

    if (user.role === 'student') {
      await Student.deleteOne({ user: user._id });
    }
    await User.findByIdAndDelete(user._id);

    res.status(200).json({
      success: true,
      message: `Pending ${userRole.toUpperCase()} account for ${userName} (${userEmail}) was rejected and removed`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get AI subsystem production analytics and telemetry for Superadmin
 * @route   GET /api/superadmin/ai-analytics
 * @access  Private (Superadmin only)
 */
const getAiAnalytics = async (req, res, next) => {
  try {
    const { AiCallLog, AiUsage } = require('../models');
    const { getCircuitBreakerStatus } = require('../services/ai/aiClient');
    const { getAllAiFeatureFlags } = require('../utils/featureFlags');

    const days = Math.min(30, Math.max(1, parseInt(req.query.days || '7', 10)));
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await AiCallLog.find({ timestamp: { $gte: sinceDate } }).lean();

    const totalCalls = logs.length;
    let successfulCalls = 0;
    let fallbackCalls = 0;
    let failedCalls = 0;
    let rateLimitedCalls = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;

    const featureStats = {};
    const providerStats = {};

    for (const log of logs) {
      if (log.status === 'success') successfulCalls++;
      else if (log.status === 'fallback') fallbackCalls++;
      else if (log.status === 'failed') failedCalls++;
      else if (log.status === 'rate_limited') rateLimitedCalls++;

      totalTokens += (log.promptTokensEstimated || 0) + (log.completionTokensEstimated || 0);
      totalCostUsd += log.costEstimateUsd || 0;
      totalLatencyMs += log.latencyMs || 0;

      // Feature breakdown
      const feat = log.feature || 'other';
      if (!featureStats[feat]) {
        featureStats[feat] = { calls: 0, totalLatency: 0, errors: 0, costUsd: 0 };
      }
      featureStats[feat].calls += 1;
      featureStats[feat].totalLatency += log.latencyMs || 0;
      featureStats[feat].costUsd += log.costEstimateUsd || 0;
      if (log.status === 'failed') featureStats[feat].errors += 1;

      // Provider breakdown
      const prov = log.provider || 'unknown';
      if (!providerStats[prov]) {
        providerStats[prov] = { calls: 0, errors: 0, fallbacks: 0 };
      }
      providerStats[prov].calls += 1;
      if (log.status === 'failed') providerStats[prov].errors += 1;
      if (log.status === 'fallback') providerStats[prov].fallbacks += 1;
    }

    const featureBreakdown = Object.entries(featureStats).map(([feature, s]) => ({
      feature,
      calls: s.calls,
      avgLatencyMs: s.calls > 0 ? Math.round(s.totalLatency / s.calls) : 0,
      failureRate: s.calls > 0 ? Number(((s.errors / s.calls) * 100).toFixed(1)) : 0,
      costEstimateUsd: Number(s.costUsd.toFixed(4)),
    }));

    // Today's quota usage
    const todayKey = AiUsage.getTodayKey();
    const todayUsage = await AiUsage.findOne({ date: todayKey }).lean();
    const globalCap = parseInt(process.env.AI_DAILY_CALL_CAP || '400', 10);
    const globalUsageCount = todayUsage?.globalCount || 0;

    res.status(200).json({
      success: true,
      timeWindowDays: days,
      overview: {
        totalCalls,
        successfulCalls,
        fallbackCalls,
        failedCalls,
        rateLimitedCalls,
        successRate: totalCalls > 0 ? Number(((successfulCalls / totalCalls) * 100).toFixed(1)) : 100,
        failureRate: totalCalls > 0 ? Number(((failedCalls / totalCalls) * 100).toFixed(1)) : 0,
        fallbackRate: totalCalls > 0 ? Number(((fallbackCalls / totalCalls) * 100).toFixed(1)) : 0,
        totalTokensEstimated: totalTokens,
        totalCostEstimateUsd: Number(totalCostUsd.toFixed(4)),
        avgLatencyMs: totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0,
      },
      quota: {
        todayCalls: globalUsageCount,
        dailyCap: globalCap,
        utilizationPercentage: globalCap > 0 ? Number(((globalUsageCount / globalCap) * 100).toFixed(1)) : 0,
      },
      featureBreakdown,
      providerStats,
      circuitBreakers: getCircuitBreakerStatus(),
      featureFlags: getAllAiFeatureFlags(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlatformOverview,
  getAnalysts,
  updateAnalystStatus,
  getColleges,
  updateCollegeStatus,
  getCompanies,
  updateCompanyVerification,
  getPendingAccounts,
  approvePendingAccount,
  rejectPendingAccount,
  getAiAnalytics,
};

