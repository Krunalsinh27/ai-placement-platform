/**
 * TPO Insights Service
 *
 * Implements:
 * 1. 100% Explainable, rule-based "At-Risk Student" assessment (NO black-box AI model).
 * 2. Weekly Placement Intelligence Summary grounded STRICTLY in database metrics.
 * 3. Strict tenant isolation by college.
 * 4. k=5 small-cohort suppression for analyst views.
 *
 * ABSOLUTE FAIRNESS GUARANTEE:
 * Never uses name, gender, religion, category, caste, photo, or college in any scoring.
 */

const { z } = require('zod');
const Student = require('../../models/Student');
const Drive = require('../../models/Drive');
const Application = require('../../models/Application');
const { computeMatchScore } = require('../ai/matchingEngine');
const { callAiWithQuotaAndRetry } = require('../ai/aiClient');
const { getEndOfDayIST } = require('../../utils/pipelineService');

const WeeklySummaryZodSchema = z.object({
  weekEndingDate: z.string(),
  executiveSummary: z.string().min(10),
  keyHighlights: z.array(z.string()).min(1),
  areasOfConcern: z.array(z.string()).min(1),
  recommendedInterventions: z.array(z.string()).min(1),
});

/**
 * Small-cohort suppression helper for analyst privacy (k=5).
 */
function suppressCount(count) {
  if (typeof count === 'number' && count > 0 && count < 5) {
    return 'lt5';
  }
  return count;
}

/**
 * Evaluates risk for a single student profile against transparent, objective rules.
 *
 * FAIRNESS: Uses ONLY academic metrics (cgpa, backlogs), resume presence, applications count,
 * and skill match scores. Never touches name, gender, religion, category, photo, or college.
 */
function evaluateStudentRisk({ student, applicationsCount = 0, eligibleDrives = [] }) {
  const flags = [];
  const suggestions = [];

  // 1. Resume Presence Rule
  const hasResume = Boolean(student.resumeUrl && student.resumeUrl.trim());
  const hasParsedSkills =
    Array.isArray(student.resumeProfile?.skills) && student.resumeProfile.skills.length > 0;
  const hasSelfDeclaredSkills = Array.isArray(student.skills) && student.skills.length > 0;

  if (!hasResume && !hasParsedSkills && !hasSelfDeclaredSkills) {
    flags.push({
      code: 'NO_RESUME',
      severity: 'high',
      label: 'No Resume / Skills Profile',
      detail: 'No resume uploaded and no technical skills listed on profile.',
    });
    suggestions.push('Urge student to upload or create an ATS-friendly resume using Resume Builder.');
  }

  // 2. Zero Applications Rule
  const eligibleCount = eligibleDrives.length;
  if (applicationsCount === 0 && eligibleCount > 0) {
    flags.push({
      code: 'ZERO_APPLICATIONS',
      severity: 'high',
      label: 'Zero Applications Submitted',
      detail: `Student has applied to 0 placement drives despite having ${eligibleCount} open eligible drive(s).`,
    });
    suggestions.push('Send automated or manual reminder regarding upcoming eligible drive deadlines.');
  }

  // 3. Academic CGPA Rule (Standard threshold 6.0)
  const studentCgpa = typeof student.cgpa === 'number' ? student.cgpa : 0;
  if (studentCgpa < 6.0) {
    flags.push({
      code: 'LOW_CGPA',
      severity: 'medium',
      label: 'CGPA Below Threshold',
      detail: `Current CGPA (${studentCgpa}) is below the standard 6.0 cutoff for most campus drives.`,
    });
    suggestions.push('Guide student to academic remedial sessions and drives with flexible CGPA criteria.');
  }

  // 4. Backlog Rule
  const backlogs = typeof student.backlogs === 'number' ? student.backlogs : 0;
  if (backlogs > 0) {
    flags.push({
      code: 'ACTIVE_BACKLOGS',
      severity: 'medium',
      label: 'Active Backlogs',
      detail: `Student has ${backlogs} active backlog(s), disqualifying them from zero-backlog tier-1 companies.`,
    });
    suggestions.push('Encourage student to prioritize clearing standing backlogs in upcoming semester examinations.');
  }

  // 5. Skill Match Coverage Rule
  let totalMatchScore = 0;
  let computableMatches = 0;
  for (const drive of eligibleDrives) {
    try {
      const match = computeMatchScore(student, drive);
      if (typeof match.score === 'number') {
        totalMatchScore += match.score;
        computableMatches++;
      }
    } catch {
      // ignore individual match calculation failures
    }
  }

  const avgMatchScore = computableMatches > 0 ? totalMatchScore / computableMatches : null;
  if (eligibleCount > 0 && avgMatchScore !== null && avgMatchScore < 40) {
    flags.push({
      code: 'LOW_SKILL_MATCH',
      severity: 'medium',
      label: 'Low Technical Skill Match',
      detail: `Average skill match score across open eligible drives is ${Math.round(avgMatchScore)}% (< 40%).`,
    });
    suggestions.push('Assign personalized Skill-Gap Learning Plan targeting high-frequency missing skills.');
  }

  // Determine Risk Tier
  const flagCodes = flags.map((f) => f.code);
  const isNoResumeAndNoApps =
    flagCodes.includes('NO_RESUME') && flagCodes.includes('ZERO_APPLICATIONS') && eligibleCount > 0;
  const isHighRisk = flags.length >= 3 || isNoResumeAndNoApps;
  const isMediumRisk = !isHighRisk && flags.length >= 1;

  let riskTier = 'low';
  if (isHighRisk) riskTier = 'high';
  else if (isMediumRisk) riskTier = 'medium';

  return {
    studentId: student._id,
    enrollmentNo: student.enrollmentNo,
    branch: student.branch,
    cgpa: student.cgpa,
    backlogs: student.backlogs,
    applicationsCount,
    eligibleDrivesCount: eligibleCount,
    avgMatchScore: avgMatchScore !== null ? Math.round(avgMatchScore) : null,
    riskScore: flags.length,
    riskTier,
    flags,
    suggestions: Array.from(new Set(suggestions)),
  };
}

/**
 * Retrieves transparent at-risk student list for a college.
 * Enforces strict tenant isolation.
 */
async function getAtRiskStudents({ collegeId, filters = {} }) {
  if (!collegeId) {
    throw new Error('Tenant isolation violation: collegeId is required');
  }

  const query = { college: collegeId };
  if (filters.branch && filters.branch !== 'ALL') {
    query.branch = String(filters.branch).toUpperCase().trim();
  }
  if (filters.batchYear) {
    query.batchYear = Number(filters.batchYear);
  }

  const students = await Student.find(query)
    .populate('user', 'name email role')
    .sort({ cgpa: 1 });

  const now = new Date();
  const eligibleDrives = await Drive.find({
    status: 'open',
    $or: [{ college: collegeId }, { colleges: collegeId }],
  }).populate('company', 'name');

  const activeEligibleDrives = eligibleDrives.filter((d) => {
    const deadlineEnd = getEndOfDayIST(d.lastDateToApply);
    return deadlineEnd && deadlineEnd >= now;
  });

  // Fetch all applications for these students
  const studentIds = students.map((s) => s._id);
  const applications = await Application.find({
    student: { $in: studentIds },
  });

  const appCountByStudent = new Map();
  for (const app of applications) {
    const sid = app.student.toString();
    appCountByStudent.set(sid, (appCountByStudent.get(sid) || 0) + 1);
  }

  const results = [];
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;

  for (const student of students) {
    // Filter eligible drives matching this student's academic criteria
    const studentBranch = (student.branch || '').toUpperCase().trim();
    const studentCgpa = typeof student.cgpa === 'number' ? student.cgpa : 0;
    const studentBacklogs = typeof student.backlogs === 'number' ? student.backlogs : 0;

    const studentEligibleDrives = activeEligibleDrives.filter((d) => {
      const minCgpa = typeof d.minCgpa === 'number' ? d.minCgpa : 0;
      const maxBacklogs = typeof d.maxBacklogs === 'number' ? d.maxBacklogs : 0;
      const allowedBranches = Array.isArray(d.allowedBranches)
        ? d.allowedBranches.map((b) => String(b).toUpperCase().trim())
        : [];
      return (
        studentCgpa >= minCgpa &&
        studentBacklogs <= maxBacklogs &&
        (allowedBranches.length === 0 || allowedBranches.includes(studentBranch))
      );
    });

    const appsCount = appCountByStudent.get(student._id.toString()) || 0;
    const evaluation = evaluateStudentRisk({
      student,
      applicationsCount: appsCount,
      eligibleDrives: studentEligibleDrives,
    });

    if (evaluation.riskTier === 'high') highRiskCount++;
    else if (evaluation.riskTier === 'medium') mediumRiskCount++;
    else lowRiskCount++;

    // Only include in student table if requested tier matches or if returning all
    if (!filters.riskTier || filters.riskTier === 'ALL' || filters.riskTier === evaluation.riskTier) {
      results.push({
        ...evaluation,
        studentName: student.user?.name || student.enrollmentNo,
        studentEmail: student.user?.email || '',
      });
    }
  }

  // Sort: High risk first, then by risk score descending, then lowest CGPA
  results.sort((a, b) => {
    const tierWeight = { high: 3, medium: 2, low: 1 };
    if (tierWeight[b.riskTier] !== tierWeight[a.riskTier]) {
      return tierWeight[b.riskTier] - tierWeight[a.riskTier];
    }
    if (b.riskScore !== a.riskScore) {
      return b.riskScore - a.riskScore;
    }
    return a.cgpa - b.cgpa;
  });

  return {
    totalStudents: students.length,
    counts: {
      high: highRiskCount,
      medium: mediumRiskCount,
      low: lowRiskCount,
      atRiskTotal: highRiskCount + mediumRiskCount,
    },
    students: results,
  };
}

/**
 * Builds weekly placement intelligence metrics strictly from the database.
 */
async function buildCollegeWeeklyMetrics({ collegeId, userRole = 'tpo' }) {
  if (!collegeId) {
    throw new Error('Tenant isolation violation: collegeId is required');
  }

  const isAnalyst = userRole === 'analyst';

  // 1. Total enrolled students in tenant
  const totalStudentsCount = await Student.countDocuments({ college: collegeId });

  // 2. Active and recent placement drives
  const drives = await Drive.find({
    $or: [{ college: collegeId }, { colleges: collegeId }],
  }).populate('company', 'name industry');

  const openDrivesCount = drives.filter((d) => d.status === 'open').length;

  // 3. Applications and offers
  const applications = await Application.find()
    .populate({
      path: 'student',
      match: { college: collegeId },
      select: 'branch cgpa backlogs',
    })
    .populate('drive', 'role packageLpa company status');

  const collegeApplications = applications.filter((a) => a.student !== null);
  const totalApplicationsCount = collegeApplications.length;

  const appliedStudentSet = new Set(collegeApplications.map((a) => a.student._id.toString()));
  const appliedStudentsCount = appliedStudentSet.size;

  const selectedOffers = collegeApplications.filter((a) => a.status === 'selected');
  const placedStudentSet = new Set(selectedOffers.map((a) => a.student._id.toString()));
  const placedStudentsCount = placedStudentSet.size;

  const rawPlacementRate =
    totalStudentsCount > 0 ? Math.round((placedStudentsCount / totalStudentsCount) * 100) : 0;

  // Calculate salary packages
  const packages = selectedOffers
    .map((o) => o.drive?.packageLpa)
    .filter((p) => typeof p === 'number' && p > 0);

  const highestPackage = packages.length > 0 ? Math.max(...packages) : 0;
  const lowestPackage = packages.length > 0 ? Math.min(...packages) : 0;
  const averagePackage =
    packages.length > 0
      ? Number((packages.reduce((sum, p) => sum + p, 0) / packages.length).toFixed(2))
      : 0;

  // Top hiring companies
  const companyOfferCounts = {};
  for (const offer of selectedOffers) {
    const compName = offer.drive?.company?.name || 'Partner Company';
    companyOfferCounts[compName] = (companyOfferCounts[compName] || 0) + 1;
  }

  const topHiringCompanies = Object.entries(companyOfferCounts)
    .map(([company, hires]) => ({
      company,
      hires: isAnalyst ? suppressCount(hires) : hires,
    }))
    .sort((a, b) => (typeof b.hires === 'number' ? b.hires : 0) - (typeof a.hires === 'number' ? a.hires : 0))
    .slice(0, 5);

  // At-risk student stats
  const atRiskData = await getAtRiskStudents({ collegeId });

  // Apply k=5 suppression for analysts
  const metrics = {
    collegeId: String(collegeId),
    totalStudents: isAnalyst ? suppressCount(totalStudentsCount) : totalStudentsCount,
    appliedStudents: isAnalyst ? suppressCount(appliedStudentsCount) : appliedStudentsCount,
    placedStudents: isAnalyst ? suppressCount(placedStudentsCount) : placedStudentsCount,
    totalApplications: isAnalyst ? suppressCount(totalApplicationsCount) : totalApplicationsCount,
    openDrivesCount,
    placementRate:
      isAnalyst && totalStudentsCount > 0 && totalStudentsCount < 5
        ? 'lt5'
        : `${rawPlacementRate}%`,
    highestPackage: `${highestPackage} LPA`,
    lowestPackage: `${lowestPackage} LPA`,
    averagePackage: `${averagePackage} LPA`,
    topHiringCompanies,
    atRiskCounts: {
      high: isAnalyst ? suppressCount(atRiskData.counts.high) : atRiskData.counts.high,
      medium: isAnalyst ? suppressCount(atRiskData.counts.medium) : atRiskData.counts.medium,
      low: isAnalyst ? suppressCount(atRiskData.counts.low) : atRiskData.counts.low,
      totalAtRisk:
        isAnalyst ? suppressCount(atRiskData.counts.atRiskTotal) : atRiskData.counts.atRiskTotal,
    },
  };

  return metrics;
}

/**
 * Deterministic offline rule-based generator for weekly placement summary.
 */
function generateRuleBasedWeeklySummary(metrics) {
  const dateStr = new Date().toISOString().split('T')[0];
  const total = metrics.totalStudents;
  const placed = metrics.placedStudents;
  const rate = metrics.placementRate;
  const openDrives = metrics.openDrivesCount;
  const atRisk = metrics.atRiskCounts?.totalAtRisk || 0;
  const avgPkg = metrics.averagePackage;

  return {
    weekEndingDate: dateStr,
    executiveSummary: `This week placement operations tracked across ${total} enrolled students. Currently ${placed} students have secured accepted offers, representing an overall placement conversion of ${rate} with an average package of ${avgPkg}. There are currently ${openDrives} active campus drives.`,
    keyHighlights: [
      `Overall placement rate currently stands at ${rate} with ${placed} placed students.`,
      `Active recruitment pipeline with ${openDrives} open campus placement drive(s).`,
      metrics.topHiringCompanies.length > 0
        ? `Leading recruitment partners include ${metrics.topHiringCompanies
            .map((c) => c.company)
            .slice(0, 3)
            .join(', ')}.`
        : 'Recruitment partner coordination ongoing for upcoming recruitment cycles.',
    ],
    areasOfConcern: [
      `${atRisk} student(s) currently flagged as needing attention due to missing resumes, low application frequency, or academic cutoffs.`,
      openDrives === 0
        ? 'No active placement drives currently open; new corporate outreach required.'
        : 'Ensure students submit applications prior to closing deadlines.',
    ],
    recommendedInterventions: [
      'Conduct a targeted outreach session for high-risk students lacking uploaded ATS resumes.',
      'Encourage unplaced candidates to utilize the Skill-Gap Learning Plan for high-demand technical requirements.',
      'Engage corporate partners to schedule additional technical interviews for shortlisted candidates.',
    ],
  };
}

/**
 * Generates an executive weekly placement summary grounded STRICTLY in database metrics.
 */
async function getWeeklyPlacementSummary({ collegeId, userRole = 'tpo', userId = null }) {
  const metrics = await buildCollegeWeeklyMetrics({ collegeId, userRole });

  const metricsBlock = JSON.stringify(metrics, null, 2);

  const systemPrompt = `You are a university placement director analytics agent. Generate a concise weekly executive placement summary grounded STRICTLY in the provided database metrics.
CRITICAL INSTRUCTIONS:
1. Valid JSON only matching this schema:
{
  "weekEndingDate": string (YYYY-MM-DD),
  "executiveSummary": string (2-3 sentences overviewing placement health),
  "keyHighlights": [string],
  "areasOfConcern": [string],
  "recommendedInterventions": [string]
}
2. GROUNDING RULE: Never invent, extrapolate, or hallucinate numbers, student identities, or company names that are not in <METRICS_BLOCK>.
3. If any metric is "lt5", report it respectfully as a small privacy-protected cohort without speculating on exact values.`;

  const userPrompt = `Database metrics block:\n<METRICS_BLOCK>\n${metricsBlock}\n</METRICS_BLOCK>\n\nGenerate weekly placement summary JSON:`;

  const aiResult = await callAiWithQuotaAndRetry({
    systemPrompt,
    userPrompt,
    mode: 'weekly_placement_summary',
    userId,
    validateFn: (data) => WeeklySummaryZodSchema.parse(data),
  });

  if (aiResult.success && aiResult.data) {
    return {
      summary: aiResult.data,
      metrics,
    };
  }

  // Fallback to grounded rule-based summary
  return {
    summary: generateRuleBasedWeeklySummary(metrics),
    metrics,
  };
}

module.exports = {
  WeeklySummaryZodSchema,
  suppressCount,
  evaluateStudentRisk,
  getAtRiskStudents,
  buildCollegeWeeklyMetrics,
  generateRuleBasedWeeklySummary,
  getWeeklyPlacementSummary,
};
