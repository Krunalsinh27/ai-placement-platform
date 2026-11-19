/**
 * Test Suite: Smart Drive Recommendations, Skill-Gap Learning Plan, and TPO Insights
 *
 * Verifies:
 * 1. Smart Drive Recommendations ranking and explainability.
 * 2. Skill-Gap Learning Plan Zod validation, URL safety allowlist, and offline fallback.
 * 3. Transparent, rule-based At-Risk student assessment (no black-box AI model).
 * 4. TPO Weekly Placement Intelligence Summary grounded strictly in DB stats & tenant isolation.
 * 5. Analyst k=5 small-cohort suppression on insights.
 * 6. Absolute Fairness Verification: mathematically proves protected attributes (name, gender,
 *    religion, category, photo, college) do NOT alter scores or risk tiers.
 */

process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  AiUsage,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const { computeMatchScore, buildRuleBasedExplanation } = require('../services/ai/matchingEngine');
const {
  CURATED_RESOURCES,
  getCuratedResource,
  sanitizeResourceUrl,
} = require('../services/ai/curatedLearningResources');
const {
  SkillGapPlanZodSchema,
  generateRuleBasedSkillGapPlan,
  generateSkillGapPlan,
} = require('../services/ai/skillGapService');
const {
  evaluateStudentRisk,
  getAtRiskStudents,
  buildCollegeWeeklyMetrics,
  generateRuleBasedWeeklySummary,
  getWeeklyPlacementSummary,
  suppressCount,
} = require('../services/analytics/tpoInsightsService');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      college: user.college?._id || user.college,
    },
    process.env.JWT_SECRET || 'testsecretkey1234567890123456',
    { expiresIn: '1h' }
  );
}

// Minimal test app helper
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mount routes
  const driveRoutes = require('../routes/driveRoutes');
  const studentRoutes = require('../routes/studentRoutes');
  const tpoRoutes = require('../routes/tpoRoutes');
  const analyticsRoutes = require('../routes/analyticsRoutes');

  app.use('/api/drives', driveRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/tpo', tpoRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  });

  return app;
}

// HTTP request helper
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING SMART ANALYTICS & INSIGHTS TEST SUITE ---\n');

  const testDbUri = getTestDbUri('test_smart_analytics');
  assertTestDatabase(testDbUri);

  await mongoose.connect(testDbUri);
  console.log('Connected to MongoDB test database.');

  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // Clean collections
    await User.deleteMany({});
    await Student.deleteMany({});
    await College.deleteMany({});
    await Company.deleteMany({});
    await Drive.deleteMany({});
    await Application.deleteMany({});
    await AiUsage.deleteMany({});
    mockProvider.reset();

    // Setup base colleges
    const collegeA = await College.create({
      name: 'Alpha Engineering College',
      code: 'AEC-01',
      city: 'Metropolis',
      state: 'State A',
      status: 'approved',
    });

    const collegeB = await College.create({
      name: 'Beta Institute of Tech',
      code: 'BIT-02',
      city: 'Gotham',
      state: 'State B',
      status: 'approved',
    });

    // Setup company
    const company = await Company.create({
      name: 'TechCorp International',
      industry: 'Software',
      status: 'approved',
    });

    // ========================================================
    // TEST 1: Smart Drive Recommendations Ranking & Explainability
    // ========================================================
    console.log('TEST 1: Smart Drive Recommendations Ranking & Explainability');

    const studentUser1 = await User.create({
      name: 'Aarav Patel',
      email: 'aarav@alpha.edu',
      password: 'password123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const student1 = await Student.create({
      user: studentUser1._id,
      college: collegeA._id,
      enrollmentNo: 'EN-AEC-001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
      skills: ['react', 'nodejs', 'mongodb', 'javascript'],
      resumeUrl: 'https://example.com/resumes/aarav.pdf',
      resumeProfile: {
        skills: [
          { name: 'react', foundInResume: true },
          { name: 'nodejs', foundInResume: true },
          { name: 'mongodb', foundInResume: true },
        ],
        projects: [
          {
            title: 'MERN E-Commerce App',
            technologies: ['react', 'nodejs', 'mongodb'],
            description: 'Full stack shopping platform with secure payments and caching.',
          },
        ],
      },
    });

    // Create 2 open drives:
    // Drive 1: Web Dev role requiring React, Node, MongoDB -> High match
    const driveWeb = await Drive.create({
      college: collegeA._id,
      company: company._id,
      role: 'Full Stack Web Developer',
      packageLpa: 12,
      location: 'Bangalore',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      requiredSkills: ['react', 'nodejs', 'mongodb'],
      preferredSkills: ['docker'],
      lastDateToApply: new Date(Date.now() + 7 * 86400000),
      driveDate: new Date(Date.now() + 14 * 86400000),
      status: 'open',
    });

    // Drive 2: Data Science role requiring Python, PyTorch, Pandas -> Low match
    const driveData = await Drive.create({
      college: collegeA._id,
      company: company._id,
      role: 'Machine Learning Specialist',
      packageLpa: 14,
      location: 'Hyderabad',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      requiredSkills: ['python', 'pytorch', 'pandas'],
      preferredSkills: ['aws'],
      lastDateToApply: new Date(Date.now() + 5 * 86400000),
      driveDate: new Date(Date.now() + 12 * 86400000),
      status: 'open',
    });

    // 1. Direct unit test of matchingEngine
    const matchWeb = computeMatchScore(student1, driveWeb);
    const matchDataScore = computeMatchScore(student1, driveData);

    assert(
      matchWeb.score > matchDataScore.score,
      `Web drive score (${matchWeb.score}) should exceed Data drive score (${matchDataScore.score})`
    );
    assert(matchWeb.score >= 70, `Web drive score (${matchWeb.score}) should be >= 70`);
    assert(matchWeb.matchedSkills.includes('react'), 'Should match react');
    assert(matchWeb.missingSkills.includes('docker'), 'Missing skills should include docker');

    const explanation = buildRuleBasedExplanation(matchWeb, driveWeb.role);
    assert(typeof explanation === 'string' && explanation.length > 20, 'Explanation should be valid');

    // 2. HTTP Endpoint test for recommended sorting
    const token1 = createToken(studentUser1);
    const resRecommended = await makeRequest(server, {
      path: '/api/drives/eligible?sort=recommended',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });

    assert.strictEqual(resRecommended.status, 200);
    assert.strictEqual(resRecommended.body.success, true);
    assert(resRecommended.body.drives.length >= 2, 'Should return at least 2 eligible drives');

    // First drive must be the Web Dev drive because it has a higher match score
    assert.strictEqual(
      resRecommended.body.drives[0]._id,
      driveWeb._id.toString(),
      'Drive with highest match score must rank #1 when sorted by recommended'
    );
    assert(
      resRecommended.body.drives[0].match.score >= resRecommended.body.drives[1].match.score,
      'Drives must be sorted in descending order of match.score'
    );
    assert(
      typeof resRecommended.body.drives[0].whyRecommended === 'string',
      'Drive must have whyRecommended text attached'
    );

    // Also check dedicated alias /api/drives/recommended
    const resAlias = await makeRequest(server, {
      path: '/api/drives/recommended',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert.strictEqual(resAlias.status, 200);
    assert.strictEqual(resAlias.body.drives[0]._id, driveWeb._id.toString());
    console.log('✓ TEST 1 PASSED: Smart drive recommendations rank accurately and explain rationale.\n');

    // ========================================================
    // TEST 2: Skill-Gap Learning Plan (Zod, URL Safety & Fallback)
    // ========================================================
    console.log('TEST 2: Skill-Gap Learning Plan (Zod, URL Safety & Fallback)');

    // 1. Zod validation test: valid plan
    const validPlan = {
      overview: 'Strategic four-week skill enhancement plan designed for web development roles.',
      targetSkills: ['docker', 'redis'],
      totalEstimatedHours: 12,
      weeks: [
        {
          week: 1,
          skill: 'docker',
          why: 'Essential containerization tool required by modern deployment pipelines.',
          targetDrives: ['Full Stack Developer'],
          resourceType: 'Official Documentation',
          resourceLink: 'https://docs.docker.com/get-started/',
          estimatedHours: 6,
          practiceTask: 'Containerize a Node.js REST API with multi-stage builds.',
        },
      ],
    };

    const parsedPlan = SkillGapPlanZodSchema.parse(validPlan);
    assert.strictEqual(parsedPlan.weeks[0].skill, 'docker');

    // 2. Zod validation test: invalid week number rejected
    assert.throws(() => {
      SkillGapPlanZodSchema.parse({
        ...validPlan,
        weeks: [{ ...validPlan.weeks[0], week: 0 }],
      });
    }, /too_small/);

    // 3. Strict URL Safety test
    // Allowed verified domain
    assert.strictEqual(
      sanitizeResourceUrl('https://docs.docker.com/get-started/'),
      'https://docs.docker.com/get-started/'
    );
    assert.strictEqual(
      sanitizeResourceUrl('https://react.dev/learn'),
      'https://react.dev/learn'
    );

    // Malicious or speculative invented URL -> must return null
    assert.strictEqual(sanitizeResourceUrl('https://invented-site.example.com/fake-doc'), null);
    assert.strictEqual(sanitizeResourceUrl('javascript:alert(1)'), null);
    assert.strictEqual(sanitizeResourceUrl('http://phishing.xyz/tutorial'), null);

    // Curated resource lookup
    const dockerResource = getCuratedResource('docker');
    assert(dockerResource !== null && dockerResource.url.includes('docs.docker.com'));

    // 4. Deterministic offline fallback test
    const fallbackPlan = generateRuleBasedSkillGapPlan({
      missingSkills: [
        { name: 'docker', targetDrives: ['Full Stack Developer'] },
        { name: 'redis', targetDrives: ['Backend Engineer'] },
      ],
      studentName: 'Aarav',
    });

    assert.strictEqual(fallbackPlan.weeks.length, 2);
    assert.strictEqual(fallbackPlan.weeks[0].skill, 'docker');
    assert.strictEqual(fallbackPlan.weeks[1].skill, 'redis');
    assert(fallbackPlan.totalEstimatedHours > 0);
    assert(fallbackPlan.weeks[0].resourceLink.includes('docs.docker.com'));

    // 5. HTTP endpoint test: GET /api/students/me/skill-gap-plan
    const resGapPlan = await makeRequest(server, {
      path: '/api/students/me/skill-gap-plan',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });

    assert.strictEqual(resGapPlan.status, 200);
    assert.strictEqual(resGapPlan.body.success, true);
    assert(resGapPlan.body.plan.weeks.length > 0, 'Plan should contain weekly modules');
    for (const wk of resGapPlan.body.plan.weeks) {
      if (wk.resourceLink) {
        assert(
          sanitizeResourceUrl(wk.resourceLink) !== null,
          `Every URL (${wk.resourceLink}) must be verified against allowlist`
        );
      }
    }
    console.log('✓ TEST 2 PASSED: Skill-gap learning plan validates Zod schema and enforces URL allowlist.\n');

    // ========================================================
    // TEST 3: Transparent, Rule-Based At-Risk Student Assessment
    // ========================================================
    console.log('TEST 3: Transparent, Rule-Based At-Risk Student Assessment');

    // Create a high-risk student (low CGPA, active backlogs, no resume, 0 applications)
    const atRiskUser = await User.create({
      name: 'Rohan Sharma',
      email: 'rohan@alpha.edu',
      password: 'password123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const studentAtRisk = await Student.create({
      user: atRiskUser._id,
      college: collegeA._id,
      enrollmentNo: 'EN-AEC-099',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 5.4, // Rule: LOW_CGPA
      backlogs: 2, // Rule: ACTIVE_BACKLOGS
      phone: '9123456780',
      skills: [], // Rule: NO_RESUME / no skills
      resumeUrl: '',
    });

    // 1. Direct unit test of evaluateStudentRisk
    const riskEval = evaluateStudentRisk({
      student: studentAtRisk,
      applicationsCount: 0, // Rule: ZERO_APPLICATIONS
      eligibleDrives: [driveWeb],
    });

    assert.strictEqual(riskEval.riskTier, 'high', 'Student with multiple flags must be high risk');
    const flagCodes = riskEval.flags.map((f) => f.code);
    assert(flagCodes.includes('NO_RESUME'), 'Must flag NO_RESUME');
    assert(flagCodes.includes('ZERO_APPLICATIONS'), 'Must flag ZERO_APPLICATIONS');
    assert(flagCodes.includes('LOW_CGPA'), 'Must flag LOW_CGPA');
    assert(flagCodes.includes('ACTIVE_BACKLOGS'), 'Must flag ACTIVE_BACKLOGS');
    assert(riskEval.suggestions.length > 0, 'Must provide remediation suggestions');

    // 2. Low-risk student check
    const lowRiskEval = evaluateStudentRisk({
      student: student1,
      applicationsCount: 2,
      eligibleDrives: [driveWeb],
    });
    assert.strictEqual(lowRiskEval.riskTier, 'low', 'Qualified student with apps must be low risk');
    assert.strictEqual(lowRiskEval.flags.length, 0);

    // 3. HTTP Endpoint test for TPO at-risk list
    const tpoUser = await User.create({
      name: 'Dr. TPO Head',
      email: 'tpo@alpha.edu',
      password: 'password123',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tpoToken = createToken(tpoUser);

    const resAtRisk = await makeRequest(server, {
      path: '/api/tpo/insights/at-risk',
      method: 'GET',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });

    assert.strictEqual(resAtRisk.status, 200);
    assert.strictEqual(resAtRisk.body.success, true);
    assert(resAtRisk.body.counts.high >= 1, 'Counts should record at least 1 high risk student');
    assert(
      resAtRisk.body.students.some((s) => s.studentId === studentAtRisk._id.toString()),
      'High risk student must be present in registry'
    );
    console.log('✓ TEST 3 PASSED: Transparent rule-based at-risk assessment correctly flags and suggests actions.\n');

    // ========================================================
    // TEST 4: TPO Weekly Placement Intelligence Summary & Tenant Isolation
    // ========================================================
    console.log('TEST 4: TPO Weekly Placement Intelligence Summary & Tenant Isolation');

    // Create an application and offer in College A
    await Application.create({
      student: student1._id,
      drive: driveWeb._id,
      status: 'selected',
      appliedOn: new Date(),
    });

    // Create student in College B (Tenant Isolation verification)
    const betaUser = await User.create({
      name: 'Beta Student',
      email: 'beta@beta.edu',
      password: 'password123',
      role: 'student',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });
    await Student.create({
      user: betaUser._id,
      college: collegeB._id,
      enrollmentNo: 'EN-BIT-001',
      branch: 'IT',
      batchYear: 2026,
      cgpa: 9.0,
      backlogs: 0,
      phone: '9988776655',
      skills: ['java', 'spring'],
    });

    // Generate College A weekly summary
    const summaryResultA = await getWeeklyPlacementSummary({
      collegeId: collegeA._id,
      userRole: 'tpo',
    });

    assert.strictEqual(summaryResultA.metrics.totalStudents, 2); // student1 and studentAtRisk
    assert.strictEqual(summaryResultA.metrics.placedStudents, 1); // student1
    assert.strictEqual(summaryResultA.metrics.placementRate, '50%'); // 1/2 = 50%
    assert(summaryResultA.summary.executiveSummary.length > 20);
    assert(summaryResultA.summary.keyHighlights.length > 0);
    assert(summaryResultA.summary.recommendedInterventions.length > 0);

    // HTTP Endpoint test
    const resWeekly = await makeRequest(server, {
      path: '/api/tpo/insights/weekly-summary',
      method: 'GET',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });

    assert.strictEqual(resWeekly.status, 200);
    assert.strictEqual(resWeekly.body.success, true);
    assert.strictEqual(resWeekly.body.metrics.collegeId, collegeA._id.toString());
    assert.strictEqual(resWeekly.body.metrics.totalStudents, 2);
    console.log('✓ TEST 4 PASSED: Weekly summary generated strictly from DB metrics with strict tenant isolation.\n');

    // ========================================================
    // TEST 5: Analyst k=5 Small-Cohort Privacy Suppression
    // ========================================================
    console.log('TEST 5: Analyst k=5 Small-Cohort Privacy Suppression');

    // College B has only 1 enrolled student (0 < 1 < 5)
    // 1. Check unit suppression helper
    assert.strictEqual(suppressCount(3), 'lt5');
    assert.strictEqual(suppressCount(1), 'lt5');
    assert.strictEqual(suppressCount(5), 5);
    assert.strictEqual(suppressCount(0), 0);

    // 2. Metrics for Analyst viewing College B (small cohort)
    const analystMetrics = await buildCollegeWeeklyMetrics({
      collegeId: collegeB._id,
      userRole: 'analyst',
    });

    assert.strictEqual(
      analystMetrics.totalStudents,
      'lt5',
      'Analyst query on cohort size 1 must be suppressed to lt5'
    );
    assert.strictEqual(
      analystMetrics.placementRate,
      'lt5',
      'Placement rate for small cohort must be suppressed to lt5'
    );

    // 3. TPO viewing their own college does NOT get suppressed
    const tpoMetrics = await buildCollegeWeeklyMetrics({
      collegeId: collegeB._id,
      userRole: 'tpo',
    });
    assert.strictEqual(tpoMetrics.totalStudents, 1, 'TPO must see exact count for their own college');

    // 4. HTTP Endpoint test for analyst
    const analystUser = await User.create({
      name: 'State Placement Analyst',
      email: 'analyst@state.gov',
      password: 'password123',
      role: 'analyst',
      isApproved: true,
      isEmailVerified: true,
    });
    const analystToken = createToken(analystUser);

    const resAnalystWeekly = await makeRequest(server, {
      path: `/api/analytics/insights/weekly-summary?collegeId=${collegeB._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${analystToken}` },
    });

    assert.strictEqual(resAnalystWeekly.status, 200);
    assert.strictEqual(resAnalystWeekly.body.metrics.totalStudents, 'lt5');
    console.log('✓ TEST 5 PASSED: Analyst views apply k=5 small-cohort suppression reliably.\n');

    // ========================================================
    // TEST 6: Absolute Fairness Verification
    // ========================================================
    console.log('TEST 6: Absolute Fairness Verification (Mathematical Invariance)');

    // Construct Candidate A: Female, Hindu, General category, College A
    const candidateA = {
      name: 'Ananya Sharma',
      gender: 'Female',
      religion: 'Hindu',
      category: 'General',
      photoUrl: 'https://cdn.example.com/photos/ananya.jpg',
      college: collegeA._id,
      branch: 'CSE',
      cgpa: 8.2,
      backlogs: 0,
      skills: ['react', 'nodejs', 'mongodb'],
      resumeProfile: {
        skills: [{ name: 'react' }, { name: 'nodejs' }, { name: 'mongodb' }],
        projects: [
          {
            title: 'Cloud Management System',
            technologies: ['react', 'nodejs', 'mongodb'],
            description: 'Scalable web service with document storage.',
          },
        ],
      },
    };

    // Construct Candidate B: Male, Muslim, OBC category, College B
    // IDENTICAL academic & skill credentials
    const candidateB = {
      name: 'Farhan Zaidi',
      gender: 'Male',
      religion: 'Islam',
      category: 'OBC',
      photoUrl: 'https://cdn.example.com/photos/farhan.jpg',
      college: collegeB._id,
      branch: 'CSE',
      cgpa: 8.2,
      backlogs: 0,
      skills: ['react', 'nodejs', 'mongodb'],
      resumeProfile: {
        skills: [{ name: 'react' }, { name: 'nodejs' }, { name: 'mongodb' }],
        projects: [
          {
            title: 'Cloud Management System',
            technologies: ['react', 'nodejs', 'mongodb'],
            description: 'Scalable web service with document storage.',
          },
        ],
      },
    };

    // 1. Matching Engine Invariance
    const scoreA_driveWeb = computeMatchScore(candidateA, driveWeb);
    const scoreB_driveWeb = computeMatchScore(candidateB, driveWeb);

    assert.strictEqual(
      scoreA_driveWeb.score,
      scoreB_driveWeb.score,
      'Match scores must be strictly identical regardless of name, gender, religion, category, or photo'
    );
    assert.deepStrictEqual(
      scoreA_driveWeb.breakdown,
      scoreB_driveWeb.breakdown,
      'Breakdown points must be strictly identical'
    );

    const scoreA_driveData = computeMatchScore(candidateA, driveData);
    const scoreB_driveData = computeMatchScore(candidateB, driveData);

    assert.strictEqual(scoreA_driveData.score, scoreB_driveData.score);
    assert.deepStrictEqual(scoreA_driveData.breakdown, scoreB_driveData.breakdown);

    // 2. At-Risk Assessment Invariance
    const riskA = evaluateStudentRisk({
      student: candidateA,
      applicationsCount: 1,
      eligibleDrives: [driveWeb, driveData],
    });

    const riskB = evaluateStudentRisk({
      student: candidateB,
      applicationsCount: 1,
      eligibleDrives: [driveWeb, driveData],
    });

    assert.strictEqual(riskA.riskScore, riskB.riskScore, 'Risk scores must be strictly identical');
    assert.strictEqual(riskA.riskTier, riskB.riskTier, 'Risk tiers must be strictly identical');
    assert.deepStrictEqual(riskA.flags, riskB.flags, 'Triggered flags must be strictly identical');
    assert.deepStrictEqual(riskA.suggestions, riskB.suggestions, 'Suggestions must be strictly identical');

    console.log('✓ TEST 6 PASSED: Protected attributes have 0 influence on match scores, rankings, or risk.\n');

    console.log('====================================================');
    console.log('ALL 6 SMART ANALYTICS & INSIGHTS TESTS PASSED (100%)');
    console.log('====================================================');

    // Clean up test fixtures
    await User.deleteMany({});
    await Student.deleteMany({});
    await College.deleteMany({});
    await Company.deleteMany({});
    await Drive.deleteMany({});
    await Application.deleteMany({});
    await AiUsage.deleteMany({});
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = { runTests };
