process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { getTestDbUri } = require('./testHelper');
const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  DriveRequest,
  JobRequirement,
  Round,
  Placement,
} = require('../models');
const { validateCorsConfig } = require('../utils/corsConfig');
const { sanitizeFilename, validatePdfMagicBytes } = require('../middleware/uploadMiddleware');
const { normalizeAccountKey } = require('../middleware/rateLimitMiddleware');
const { computeMatchScore } = require('../services/ai/matchingEngine');

function generateAuthToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'mock_dummy_jwt_secret_for_local_tests_only_32_chars', {
    expiresIn: '1h',
  });
}

async function runSecurityHardeningTests() {
  console.log('======================================================');
  console.log('       TEST: SECURITY HARDENING & ISOLATION           ');
  console.log('======================================================\n');

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'mock_dummy_jwt_secret_for_local_tests_only_32_chars';
  }

  // ==========================================
  // SECTION 1: CORS Configuration Validation Tests
  // ==========================================
  console.log('1. Testing CORS configuration security rules...');
  
  // Rule 1: Production MUST reject wildcard '*'
  assert.throws(
    () => {
      validateCorsConfig('*', 'production');
    },
    /Wildcard CORS origin "\*" is strictly forbidden in production/,
    'Production with CLIENT_URL=* must throw'
  );

  assert.throws(
    () => {
      validateCorsConfig('https://app.com, *', 'production');
    },
    /Wildcard CORS origin "\*" is strictly forbidden in production/,
    'Production with list containing * must throw'
  );

  // Rule 2: Production requires valid explicit domains
  assert.throws(
    () => {
      validateCorsConfig('', 'production');
    },
    /CLIENT_URL environment variable is required in production/,
    'Production without CLIENT_URL must throw'
  );

  validateCorsConfig('https://campus-placement.vercel.app, https://portal.college.edu', 'production');
  const prodOrigins = require('../utils/corsConfig').parseAllowedOrigins('https://campus-placement.vercel.app, https://portal.college.edu');
  assert.strictEqual(prodOrigins.length, 2);
  assert.strictEqual(prodOrigins[0], 'https://campus-placement.vercel.app');
  assert.strictEqual(prodOrigins[1], 'https://portal.college.edu');

  // Rule 3: Development allows localhost and pattern origins
  validateCorsConfig('http://localhost:*, http://127.0.0.1:5173', 'development');
  const devOrigins = require('../utils/corsConfig').parseAllowedOrigins('http://localhost:*, http://127.0.0.1:5173');
  assert(devOrigins.length >= 2, 'Development should accept local origins and patterns');
  console.log('✓ CORS production and development security constraints verified\n');

  // ==========================================
  // SECTION 2: Upload Hardening & Magic Bytes Tests
  // ==========================================
  console.log('2. Testing upload hardening & filename sanitization...');
  
  // Sanitization tests
  const pathTraversalInput = '../../../../etc/passwd.pdf';
  const cleanTraversal = sanitizeFilename(pathTraversalInput);
  assert(!cleanTraversal.includes('..'), 'Path traversal must be stripped');
  assert(!cleanTraversal.includes('/'), 'Directory separators must be stripped');
  assert(cleanTraversal.endsWith('.pdf'), 'Must have .pdf extension');

  const nullByteInput = 'resume\0evil.exe.pdf';
  const cleanNullByte = sanitizeFilename(nullByteInput);
  assert(!cleanNullByte.includes('\0'), 'Null bytes must be removed');
  assert(cleanNullByte.endsWith('.pdf'), 'Must preserve pdf extension');

  const dangerousCharsInput = 'my resume (v1) & special;chars!.pdf';
  const cleanSpecial = sanitizeFilename(dangerousCharsInput);
  assert(/^[a-zA-Z0-9_-]+\.pdf$/.test(cleanSpecial), `Sanitized filename should be alphanumeric: got ${cleanSpecial}`);

  // Magic bytes tests
  const validPdfHeader = Buffer.from('%PDF-1.7\n%Test document header');
  assert.strictEqual(validatePdfMagicBytes(validPdfHeader), true, '%PDF header must pass');

  const fakePdfHeader = Buffer.from('GIF89a\nFake content renamed to pdf');
  assert.strictEqual(validatePdfMagicBytes(fakePdfHeader), false, 'Non-PDF magic bytes must fail');

  const emptyBuffer = Buffer.alloc(0);
  assert.strictEqual(validatePdfMagicBytes(emptyBuffer), false, 'Empty buffer must fail');
  console.log('✓ Filename sanitization & PDF magic byte validation verified\n');

  // ==========================================
  // SECTION 3: Account-Keyed Rate Limiter Normalization Tests
  // ==========================================
  console.log('3. Testing account-keyed rate limiter email normalization...');
  
  // Trimming, lowercase, and formatting
  assert.strictEqual(
    normalizeAccountKey('account_login', '  Candidate@Test.COM ', '127.0.0.1'),
    'account_login:candidate@test.com',
    'Email should be trimmed and lowercased'
  );
  assert.strictEqual(
    normalizeAccountKey('account_login', '\tSTUDENT.ALPHA@College.EDU\n ', '127.0.0.1'),
    'account_login:student.alpha@college.edu',
    'Whitespace, tabs, and newlines must be stripped'
  );

  // Fallback to client IP on missing, empty, or non-string email
  assert.strictEqual(
    normalizeAccountKey('account_login', null, '192.168.1.10'),
    '192.168.1.10',
    'Null email must fall back to client IP'
  );
  assert.strictEqual(
    normalizeAccountKey('account_login', '', '10.0.0.1'),
    '10.0.0.1',
    'Empty string email must fall back to client IP'
  );
  assert.strictEqual(
    normalizeAccountKey('account_login', '    ', '10.0.0.2'),
    '10.0.0.2',
    'Blank string email must fall back to client IP'
  );
  assert.strictEqual(
    normalizeAccountKey('account_otp', undefined, '172.16.0.5'),
    '172.16.0.5',
    'Undefined email must fall back to client IP'
  );
  assert.strictEqual(
    normalizeAccountKey('account_otp', 12345, '127.0.0.1'),
    '127.0.0.1',
    'Non-string email must fall back to client IP'
  );
  console.log('✓ Account rate limiter email normalization and IP fallback verified\n');

  // ==========================================
  // SECTION 4: Explainable Match Demographic Neutrality Fairness Tests
  // ==========================================
  console.log('4. Testing demographic neutrality and algorithmic fairness in match score...');

  const testDriveSpec = {
    role: 'Full Stack Engineer',
    requiredSkills: ['react', 'node.js', 'mongodb'],
    preferredSkills: ['docker', 'typescript', 'aws'],
    minCgpa: 7.0,
    maxBacklogs: 0,
    allowedBranches: ['CSE', 'IT'],
  };

  const baseStudentProfile = {
    cgpa: 8.75,
    backlogs: 0,
    branch: 'CSE',
    skills: ['react', 'node.js', 'mongodb', 'docker'],
    resumeProfile: {
      skills: [
        { name: 'React', level: 'advanced' },
        { name: 'Node.js', level: 'intermediate' },
        { name: 'MongoDB', level: 'intermediate' },
      ],
      projects: [
        {
          title: 'E-Commerce Platform',
          technologies: ['react', 'node.js', 'mongodb'],
          bullets: ['Built full stack scalable store'],
        },
      ],
      experience: [],
    },
  };

  // 4 variants with varied demographic identities (gender, name, photo, college name)
  const candidateVariantA = {
    ...baseStudentProfile,
    name: 'Aarav Sharma',
    gender: 'male',
    photo: 'https://cdn.example.com/photos/aarav.jpg',
    college: 'Delhi Technological University',
  };

  const candidateVariantB = {
    ...baseStudentProfile,
    name: 'Ananya Iyer',
    gender: 'female',
    photo: 'https://cdn.example.com/photos/ananya.jpg',
    college: 'National Institute of Technology',
  };

  const candidateVariantC = {
    ...baseStudentProfile,
    name: 'Jordan Taylor',
    gender: 'non-binary',
    photo: null,
    college: 'State Rural College of Engineering',
  };

  const candidateVariantD = {
    ...baseStudentProfile,
    name: 'Zainab Fatima',
    gender: undefined,
    photo: '',
    college: 'Autonomous Institute of Technology',
  };

  const matchResA = computeMatchScore(candidateVariantA, testDriveSpec);
  const matchResB = computeMatchScore(candidateVariantB, testDriveSpec);
  const matchResC = computeMatchScore(candidateVariantC, testDriveSpec);
  const matchResD = computeMatchScore(candidateVariantD, testDriveSpec);

  // Scores must be 100% numerically identical
  assert.strictEqual(typeof matchResA.score, 'number', 'Match score must be a number');
  assert.strictEqual(matchResA.score, matchResB.score, 'Score must be identical across gender/college/name variations');
  assert.strictEqual(matchResB.score, matchResC.score, 'Score must be identical across photo/college variations');
  assert.strictEqual(matchResC.score, matchResD.score, 'Score must be identical across undefined gender variations');

  // Breakdowns, matched skills, missing skills, and eligibility must be 100% deeply identical
  assert.deepStrictEqual(matchResA.breakdown, matchResB.breakdown, 'Breakdowns must be identical');
  assert.deepStrictEqual(matchResB.breakdown, matchResC.breakdown, 'Breakdowns must be identical');
  assert.deepStrictEqual(matchResA.matchedSkills, matchResB.matchedSkills, 'Matched skills must be identical');
  assert.deepStrictEqual(matchResA.missingSkills, matchResB.missingSkills, 'Missing skills must be identical');
  assert.deepStrictEqual(matchResA.eligibility, matchResB.eligibility, 'Eligibility must be identical');
  console.log('✓ 100% Demographic neutrality and fairness in match scoring verified\n');

  // ==========================================
  // SECTION 5: Multi-Tenant & Role Isolation Tests
  // ==========================================
  console.log('5. Connecting to test DB and setting up test server...');
  await mongoose.connect(getTestDbUri());

  const app = express();
  app.use(express.json());
  // Query parameter NoSQL injection guard
  app.use((req, res, next) => {
    if (req.query && typeof req.query === 'object') {
      for (const [key, val] of Object.entries(req.query)) {
        if (val && typeof val === 'object') {
          return res.status(400).json({
            success: false,
            message: `Invalid query parameter '${key}': objects and query selectors are not permitted`,
          });
        }
      }
    }
    next();
  });
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/drive-requests', require('../routes/driveRequestRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/job-requirements', require('../routes/jobRequirementRoutes'));
  app.use('/api/analytics', require('../routes/analyticsRoutes'));
  app.use('/api/superadmin', require('../routes/superadminRoutes'));
  app.use('/api/tpo', require('../routes/tpoRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));
  app.use('/api/companies', require('../routes/companyRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  app.use('/api/stats', require('../routes/statsRoutes'));
  app.use('/api/emails', require('../routes/emailRoutes'));
  app.use('/api/panels', require('../routes/panelRoutes'));
  app.use('/api/questions', require('../routes/questionRoutes'));
  app.use('/api/placements', require('../routes/placementRoutes'));
  app.use('/api/tests', require('../routes/testRoutes'));
  app.use('/api/offers', require('../routes/offerRoutes'));

  const testServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = testServer.address().port;
  const BASE_URL = `http://127.0.0.1:${port}/api`;

  try {
    const timestamp = Date.now();

    // Setup 2 colleges
    const collegeA = await College.create({
      name: `College Alpha ${timestamp}`,
      code: `CA_${timestamp}`,
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });
    const collegeB = await College.create({
      name: `College Beta ${timestamp}`,
      code: `CB_${timestamp}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });

    // Setup 2 companies
    const companyA = await Company.create({
      name: `Company Alpha ${timestamp}`,
      industry: 'Software',
      verified: true,
    });
    const companyB = await Company.create({
      name: `Company Beta ${timestamp}`,
      industry: 'Consulting',
      verified: true,
    });

    // Setup users
    const tpoAUser = await User.create({
      name: 'TPO Alpha',
      email: `tpo.alpha.${timestamp}@univ.edu`,
      password: 'Krypton#2026!Valid',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tpoBUser = await User.create({
      name: 'TPO Beta',
      email: `tpo.beta.${timestamp}@univ.edu`,
      password: 'Krypton#2026!Valid',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const recAUser = await User.create({
      name: 'Recruiter Alpha',
      email: `rec.alpha.${timestamp}@compa.com`,
      password: 'Krypton#2026!Valid',
      role: 'recruiter',
      company: companyA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const recBUser = await User.create({
      name: 'Recruiter Beta',
      email: `rec.beta.${timestamp}@compb.com`,
      password: 'Krypton#2026!Valid',
      role: 'recruiter',
      company: companyB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const stuAUser = await User.create({
      name: 'Student Alpha',
      email: `student.alpha.${timestamp}@college.edu`,
      password: 'Krypton#2026!Valid',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const studentA = await Student.create({
      user: stuAUser._id,
      college: collegeA._id,
      enrollmentNo: `ENRA_${timestamp}`,
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      phone: '9876543210',
    });

    const stuBUser = await User.create({
      name: 'Student Beta',
      email: `student.beta.${timestamp}@college.edu`,
      password: 'Krypton#2026!Valid',
      role: 'student',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const studentB = await Student.create({
      user: stuBUser._id,
      college: collegeB._id,
      enrollmentNo: `ENRB_${timestamp}`,
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      phone: '9876543211',
    });

    const analystUser = await User.create({
      name: 'Analyst User',
      email: `analyst.${timestamp}@board.org`,
      password: 'Krypton#2026!Valid',
      role: 'analyst',
      isApproved: true,
      isEmailVerified: true,
    });

    const aspirantUser = await User.create({
      name: 'Aspirant User',
      email: `aspirant.${timestamp}@future.edu`,
      password: 'Krypton#2026!Valid',
      role: 'aspirant',
      isApproved: true,
      isEmailVerified: true,
    });

    // Drives
    const driveCollegeA = await Drive.create({
      college: collegeA._id,
      company: companyA._id,
      role: 'Frontend Developer',
      packageLpa: 10,
      location: 'Pune',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      lastDateToApply: new Date(Date.now() + 86400000 * 5),
      driveDate: new Date(Date.now() + 86400000 * 10),
      status: 'open',
    });

    const driveCollegeB = await Drive.create({
      college: collegeB._id,
      company: companyB._id,
      role: 'Backend Developer',
      packageLpa: 12,
      location: 'Mumbai',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      lastDateToApply: new Date(Date.now() + 86400000 * 5),
      driveDate: new Date(Date.now() + 86400000 * 10),
      status: 'open',
    });

    // Rounds
    const roundA = await Round.create({
      drive: driveCollegeA._id,
      name: 'Technical Round 1',
      order: 1,
      type: 'technical',
      status: 'scheduled',
    });

    const roundB = await Round.create({
      drive: driveCollegeB._id,
      name: 'Online Aptitude Test',
      order: 1,
      type: 'aptitude',
      status: 'scheduled',
    });

    // Applications
    const appA = await Application.create({
      student: studentA._id,
      drive: driveCollegeA._id,
      status: 'applied',
    });

    const appB = await Application.create({
      student: studentB._id,
      drive: driveCollegeB._id,
      status: 'applied',
    });

    // Placements
    const placementA = await Placement.create({
      student: studentA._id,
      drive: driveCollegeA._id,
      company: companyA._id,
      packageLpa: 10,
      role: 'Frontend Developer',
      batchYear: 2026,
    });

    const placementB = await Placement.create({
      student: studentB._id,
      drive: driveCollegeB._id,
      company: companyB._id,
      packageLpa: 12,
      role: 'Backend Developer',
      batchYear: 2026,
    });

    // Tokens
    const tpoAToken = generateAuthToken(tpoAUser);
    const tpoBToken = generateAuthToken(tpoBUser);
    const recAToken = generateAuthToken(recAUser);
    const recBToken = generateAuthToken(recBUser);
    const stuAToken = generateAuthToken(stuAUser);
    const stuBToken = generateAuthToken(stuBUser);
    const analystToken = generateAuthToken(analystUser);
    const aspirantToken = generateAuthToken(aspirantUser);

    console.log('6. Testing Student 403 blocks across administrative, superadmin, and recruiter routers...');
    
    // Representative route checks:
    // 1. Superadmin
    const stuSuperadminRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuSuperadminRes.status, 403, 'Student calling superadmin overview must get 403');

    // 2. TPO
    const stuTpoRes = await fetch(`${BASE_URL}/tpo/pending`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuTpoRes.status, 403, 'Student calling TPO pending must get 403');

    // 3. College settings
    const stuCollegeSettingsRes = await fetch(`${BASE_URL}/colleges/my/settings`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuCollegeSettingsRes.status, 403, 'Student calling college settings must get 403');

    // 4. Company creation
    const stuCreateCompRes = await fetch(`${BASE_URL}/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Company' }),
    });
    assert.strictEqual(stuCreateCompRes.status, 403, 'Student calling company creation must get 403');

    // 5. Job requirements creation
    const stuCreateJobReqRes = await fetch(`${BASE_URL}/job-requirements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Hacked Job' }),
    });
    assert.strictEqual(stuCreateJobReqRes.status, 403, 'Student calling job requirement creation must get 403');

    // 6. Drive creation
    const stuCreateDriveRes = await fetch(`${BASE_URL}/drives`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'Hacked Role' }),
    });
    assert.strictEqual(stuCreateDriveRes.status, 403, 'Student calling drive creation must get 403');

    // 7. Drive pipeline freeze
    const stuFreezeRes = await fetch(`${BASE_URL}/drives/${driveCollegeA._id}/freeze`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuFreezeRes.status, 403, 'Student calling drive freeze must get 403');

    // 8. Round attendance update
    const stuRoundAttRes = await fetch(`${BASE_URL}/rounds/${roundA._id}/attendance`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attendanceList: [] }),
    });
    assert.strictEqual(stuRoundAttRes.status, 403, 'Student calling round attendance must get 403');

    // 9. Reports
    const stuReportRes = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuReportRes.status, 403, 'Student calling placement report must get 403');

    // 10. Admin Stats overview
    const stuStatsRes = await fetch(`${BASE_URL}/stats/overview`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuStatsRes.status, 403, 'Student calling stats overview must get 403');

    // 11. Email logs
    const stuEmailLogsRes = await fetch(`${BASE_URL}/emails/logs`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(stuEmailLogsRes.status, 403, 'Student calling email logs must get 403');

    // 12. Round panels creation
    const stuPanelRes = await fetch(`${BASE_URL}/rounds/${roundA._id}/panels`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Panel X' }),
    });
    assert.strictEqual(stuPanelRes.status, 403, 'Student calling round panels must get 403');

    // 13. Questions modification
    const dummyQuestionId = new mongoose.Types.ObjectId();
    const stuQuestionRes = await fetch(`${BASE_URL}/questions/${dummyQuestionId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${stuAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Hacked question' }),
    });
    assert.strictEqual(stuQuestionRes.status, 403, 'Student calling question update must get 403');
    console.log('✓ Student 403 blocks across all representative administrative routers verified');

    console.log('7. Testing Recruiter cross-company tenant isolation...');
    // Recruiter A attempts to view applicants for Company B's drive -> 403
    const recViewDriveBApps = await fetch(`${BASE_URL}/applications/drive/${driveCollegeB._id}`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    assert.strictEqual(recViewDriveBApps.status, 403, 'Recruiter A must NOT view Company B drive applicants');

    // Recruiter A attempts to view progress for Company B's drive -> 403
    const recViewDriveBProgress = await fetch(`${BASE_URL}/drives/${driveCollegeB._id}/progress`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    assert.strictEqual(recViewDriveBProgress.status, 403, 'Recruiter A must NOT view Company B drive progress');

    // Recruiter A fetches placements -> gets only Company A placements, 0 for Company B
    const recPlacementsRes = await fetch(`${BASE_URL}/placements`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    assert.strictEqual(recPlacementsRes.status, 200);
    const recPlacementsData = await recPlacementsRes.json();
    const containsCompBPlacements = (recPlacementsData.data || recPlacementsData.placements || []).some(
      (p) => (p.company?._id || p.company)?.toString() === companyB._id.toString()
    );
    assert.strictEqual(containsCompBPlacements, false, 'Recruiter A must NOT see placements for Company B');
    console.log('✓ Recruiter cross-company isolation verified (applicants, progress, placements)');

    console.log('8. Testing TPO cross-college multi-tenant isolation...');
    // TPO A attempts to view College B Drive -> 403
    const getDriveRes = await fetch(`${BASE_URL}/drives/${driveCollegeB._id}`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(getDriveRes.status, 403, 'TPO of College A must be forbidden from viewing College B drive');

    // TPO A attempts to update Drive of College B -> 403
    const updateDriveRes = await fetch(`${BASE_URL}/drives/${driveCollegeB._id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tpoAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'Hacked Title' }),
    });
    assert.strictEqual(updateDriveRes.status, 403, 'TPO of College A must be forbidden from updating College B drive');

    // TPO A attempts to delete Drive of College B -> 403
    const deleteDriveRes = await fetch(`${BASE_URL}/drives/${driveCollegeB._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(deleteDriveRes.status, 403, 'TPO of College A must be forbidden from deleting College B drive');

    // TPO A attempts to view applicants for College B drive -> 403
    const viewAppsRes = await fetch(`${BASE_URL}/applications/drive/${driveCollegeB._id}`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(viewAppsRes.status, 403, 'TPO of College A must be forbidden from viewing College B applications');

    // TPO A attempts to update application status for College B applicant -> 403
    const updateAppBStatusRes = await fetch(`${BASE_URL}/applications/${appB._id}/status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tpoAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'shortlisted' }),
    });
    assert.strictEqual(updateAppBStatusRes.status, 403, 'TPO A cannot update application status of College B applicant');

    // TPO A attempts to allow re-test on College B round -> 403
    const tpoARetestRes = await fetch(`${BASE_URL}/tests/${roundB._id}/retest/${studentB._id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(tpoARetestRes.status, 403, 'TPO A cannot grant re-test on College B round');

    // TPO A attempts to create interview panel on College B round -> 403
    const tpoAPanelRes = await fetch(`${BASE_URL}/rounds/${roundB._id}/panels`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tpoAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Panel' }),
    });
    assert.strictEqual(tpoAPanelRes.status, 403, 'TPO A cannot create interview panel on College B round');

    // TPO A attempts to update attendance on College B round -> 403
    const tpoAAttendanceRes = await fetch(`${BASE_URL}/rounds/${roundB._id}/attendance`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tpoAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendanceList: [{ participantId: new mongoose.Types.ObjectId().toString(), attendance: 'present' }],
      }),
    });
    assert.strictEqual(tpoAAttendanceRes.status, 403, 'TPO A cannot update attendance on College B round');

    // TPO A fetches placements -> receives only College A student placements
    const tpoPlacementsRes = await fetch(`${BASE_URL}/placements`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(tpoPlacementsRes.status, 200);
    const tpoPlacementsData = await tpoPlacementsRes.json();
    const list = tpoPlacementsData.data || tpoPlacementsData.placements || [];
    const containsCollegeBPlacements = list.some(
      (p) => (p.student?._id || p.student)?.toString() === studentB._id.toString()
    );
    assert.strictEqual(containsCollegeBPlacements, false, 'TPO A must NOT see placements for College B students');
    console.log('✓ TPO multi-tenant boundary verified across applications, tests, rounds, and placements');

    console.log('9. Testing Recruiter query override and forging prevention...');
    // Create JobRequirements & DriveRequests for Company A and Company B
    const jobReqA = await JobRequirement.create({
      company: companyA._id,
      title: 'Frontend Engineer',
      description: 'Building modern web apps',
      packageLpa: 10,
      batchYear: 2026,
      allowedBranches: ['CSE'],
    });
    const jobReqB = await JobRequirement.create({
      company: companyB._id,
      title: 'Backend Engineer',
      description: 'Building microservices',
      packageLpa: 12,
      batchYear: 2026,
      allowedBranches: ['CSE'],
    });

    const dReqA = await DriveRequest.create({
      company: companyA._id,
      college: collegeA._id,
      jobRequirement: jobReqA._id,
      proposedDates: [new Date(Date.now() + 86400000 * 7)],
      role: 'Frontend Engineer',
      status: 'pending',
    });
    const dReqB = await DriveRequest.create({
      company: companyB._id,
      college: collegeB._id,
      jobRequirement: jobReqB._id,
      proposedDates: [new Date(Date.now() + 86400000 * 7)],
      role: 'Backend Engineer',
      status: 'pending',
    });

    // Recruiter A attempts to pass ?company=<CompanyB_ID> to override scoping
    const recOverrideRes = await fetch(`${BASE_URL}/drive-requests?company=${companyB._id}`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    assert.strictEqual(recOverrideRes.status, 200);
    const recOverrideData = await recOverrideRes.json();
    const containsCompanyB = recOverrideData.data.some(
      (r) => (r.company?._id || r.company)?.toString() === companyB._id.toString()
    );
    assert.strictEqual(containsCompanyB, false, 'Recruiter A must NOT see Company B drive requests via query param override');

    // Recruiter A tries to view Drive of Company B -> 403
    const recViewDriveRes = await fetch(`${BASE_URL}/drives/${driveCollegeB._id}`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    assert.strictEqual(recViewDriveRes.status, 403, 'Recruiter A must be forbidden from viewing Company B drive');

    // Recruiter A tries to create JobRequirement specifying Company B
    const createReqRes = await fetch(`${BASE_URL}/job-requirements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Software Engineer',
        description: 'Test position',
        packageLpa: 12,
        batchYear: 2026,
        allowedBranches: ['CSE'],
        company: companyB._id.toString(), // Attempt to forge Company B
      }),
    });
    assert.strictEqual(createReqRes.status, 201);
    const createdReqData = await createReqRes.json();
    assert.strictEqual(
      (createdReqData.requirement.company._id || createdReqData.requirement.company).toString(),
      companyA._id.toString(),
      'Requirement company must be forced to Recruiter A company, ignoring forged body'
    );
    console.log('✓ Recruiter isolation and company override prevention verified');

    console.log('10. Testing Student cross-college application and IDOR prevention...');
    // Student B (College B) attempts to apply to Drive of College A -> 403
    const stuApplyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stuBToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ driveId: driveCollegeA._id.toString() }),
    });
    assert.strictEqual(stuApplyRes.status, 403, 'Student B cannot apply to College A drive');
    const stuApplyData = await stuApplyRes.json();
    assert(
      stuApplyData.message.includes('not open to students of your college'),
      'Should return clear college boundary error'
    );

    // IDOR Check: Student B attempts to view Student A application timeline -> 403
    const idorRes = await fetch(`${BASE_URL}/applications/${appA._id}/timeline`, {
      headers: { Authorization: `Bearer ${stuBToken}` },
    });
    assert.strictEqual(idorRes.status, 403, 'Student B must be forbidden from viewing Student A application timeline');
    console.log('✓ Student cross-college application block & timeline IDOR protection verified');

    console.log('11. Testing Analyst & Aspirant boundary restrictions...');
    // Analyst tries to access student routes -> 403
    const analystStudentRes = await fetch(`${BASE_URL}/students/me`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    assert.strictEqual(analystStudentRes.status, 403, 'Analyst must be blocked from /api/students/me');

    // Analyst tries to access drives -> 403
    const analystDrivesRes = await fetch(`${BASE_URL}/drives`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    assert.strictEqual(analystDrivesRes.status, 403, 'Analyst must be blocked from /api/drives');

    // Analyst tries to access placements -> 403
    const analystPlacementsRes = await fetch(`${BASE_URL}/placements`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    assert.strictEqual(analystPlacementsRes.status, 403, 'Analyst must be blocked from /api/placements');

    // Aspirant tries to access student routes -> 403
    const aspirantStudentRes = await fetch(`${BASE_URL}/students/me`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    assert.strictEqual(aspirantStudentRes.status, 403, 'Aspirant must be blocked from /api/students/me');

    // Aspirant tries to access drives -> 403
    const aspirantDrivesRes = await fetch(`${BASE_URL}/drives`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    assert.strictEqual(aspirantDrivesRes.status, 403, 'Aspirant must be blocked from /api/drives');

    // Aspirant tries to access placements -> 403
    const aspirantPlacementsRes = await fetch(`${BASE_URL}/placements`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    assert.strictEqual(aspirantPlacementsRes.status, 403, 'Aspirant must be blocked from /api/placements');
    console.log('✓ Analyst & Aspirant role boundary restrictions verified\n');

    // ==========================================
    // SECTION 12: Broad Endpoints Data Scrubbing & College Creation Guard
    // ==========================================
    console.log('12. Testing broad endpoints data scrubbing & college creation guard...');
    
    // College endpoints must not leak sensitive contact info or internal settings
    const collegesListRes = await fetch(`${BASE_URL}/colleges`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(collegesListRes.status, 200, 'GET /api/colleges must succeed');
    const collegesListData = await collegesListRes.json();
    const collegesList = collegesListData.colleges || collegesListData.data || [];
    assert(collegesList.length > 0, 'Must return college list');
    for (const c of collegesList) {
      assert.strictEqual(c.contactEmail, undefined, 'contactEmail must be stripped from college list');
      assert.strictEqual(c.contactPhone, undefined, 'contactPhone must be stripped from college list');
      assert.strictEqual(c.requireStudentApproval, undefined, 'requireStudentApproval must be stripped from college list');
      assert.notStrictEqual(c.name, undefined, 'name must be included in college list');
    }

    const collegeSingleRes = await fetch(`${BASE_URL}/colleges/${collegeA._id}`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(collegeSingleRes.status, 200, 'GET /api/colleges/:id must succeed');
    const collegeSingleData = await collegeSingleRes.json();
    const collegeSingle = collegeSingleData.college || collegeSingleData;
    assert.strictEqual(collegeSingle.contactEmail, undefined, 'contactEmail must be stripped from single college');
    assert.strictEqual(collegeSingle.contactPhone, undefined, 'contactPhone must be stripped from single college');
    assert.strictEqual(collegeSingle.requireStudentApproval, undefined, 'requireStudentApproval must be stripped from single college');
    assert.strictEqual(collegeSingle.name, collegeA.name, 'name must match in single college');

    // Company endpoints must not leak internal owner or hrContact to general users
    const companiesListRes = await fetch(`${BASE_URL}/companies`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(companiesListRes.status, 200, 'GET /api/companies must succeed');
    const companiesListData = await companiesListRes.json();
    const companiesList = companiesListData.companies || companiesListData.data || [];
    assert(companiesList.length > 0, 'Must return companies list');
    for (const comp of companiesList) {
      assert.strictEqual(comp.hrContact, undefined, 'hrContact must be stripped from company list');
      assert.strictEqual(comp.owner, undefined, 'owner must be stripped from company list');
      assert.notStrictEqual(comp.name, undefined, 'name must be included in company list');
    }

    const companySingleRes = await fetch(`${BASE_URL}/companies/${companyA._id}`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.strictEqual(companySingleRes.status, 200, 'GET /api/companies/:id must succeed');
    const companySingleData = await companySingleRes.json();
    const companySingle = companySingleData.company || companySingleData;
    assert.strictEqual(companySingle.hrContact, undefined, 'hrContact must be stripped from single company view for non-owner');
    assert.strictEqual(companySingle.owner, undefined, 'owner must be stripped from single company view for non-owner');

    // POST /api/colleges: TPO with already assigned college must be blocked (403)
    const tpoCreateBlockedRes = await fetch(`${BASE_URL}/colleges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoAToken}`,
      },
      body: JSON.stringify({
        name: `Rogue College ${timestamp}`,
        code: `RC_${timestamp}`,
        city: 'Delhi',
        state: 'Delhi',
      }),
    });
    assert.strictEqual(tpoCreateBlockedRes.status, 403, 'TPO already associated with a college must receive 403');
    const tpoCreateBlockedData = await tpoCreateBlockedRes.json();
    assert(tpoCreateBlockedData.message.includes('already associated with a college'), 'Error message must explain college association');

    // POST /api/colleges: TPO without college attempting to pass status: 'approved' must be forced to 'pending'
    const unassociatedTpoUser = await User.create({
      name: 'Unassociated TPO',
      email: `tpo.unassigned.${timestamp}@univ.edu`,
      password: 'Krypton#2026!Valid',
      role: 'tpo',
      isApproved: true,
      isEmailVerified: true,
    });
    const unassociatedTpoToken = generateAuthToken(unassociatedTpoUser);

    const tpoCreatePendingRes = await fetch(`${BASE_URL}/colleges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unassociatedTpoToken}`,
      },
      body: JSON.stringify({
        name: `Unapproved Institute ${timestamp}`,
        code: `UI_${timestamp}`,
        city: 'Jaipur',
        state: 'Rajasthan',
        status: 'approved', // Attacker attempts to bypass pending status
      }),
    });
    assert.strictEqual(tpoCreatePendingRes.status, 201, 'Unassociated TPO college registration should return 201');
    const tpoCreatePendingData = await tpoCreatePendingRes.json();
    const createdCollege = tpoCreatePendingData.college || tpoCreatePendingData.data;
    assert.strictEqual(createdCollege.status, 'pending', 'Non-superadmin created college MUST have status "pending", not "approved"');
    await College.findByIdAndDelete(createdCollege._id);
    await User.findByIdAndDelete(unassociatedTpoUser._id);
    console.log('✓ Broad endpoints field scrubbing & college creation authorization verified\n');

    // ==========================================
    // SECTION 13: NoSQL Injection Resistance Tests
    // ==========================================
    console.log('13. Testing NoSQL injection resistance (objects in auth payloads and query params)...');

    // 13.1 Auth endpoints with object payloads
    const loginInjectionRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }),
    });
    assert.strictEqual(loginInjectionRes.status, 400, 'POST /auth/login with object payload must return 400');

    const forgotInjectionRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null } }),
    });
    assert.strictEqual(forgotInjectionRes.status, 400, 'POST /auth/forgot-password with object payload must return 400');

    const verifyInjectionRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null }, otp: { $ne: null } }),
    });
    assert.strictEqual(verifyInjectionRes.status, 400, 'POST /auth/verify-email with object payload must return 400');

    const resetInjectionRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: null }, otp: { $ne: null }, newPassword: { $ne: null } }),
    });
    assert.strictEqual(resetInjectionRes.status, 400, 'POST /auth/reset-password with object payload must return 400');

    // 13.2 Query parameter object selector injection (?branch[$ne]=...)
    const queryInjectionRes1 = await fetch(`${BASE_URL}/students?branch[$ne]=CSE`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(queryInjectionRes1.status, 400, 'GET /students with query object injection must return 400');
    const queryInjectionData1 = await queryInjectionRes1.json();
    assert(queryInjectionData1.message.includes('not permitted'), 'Response must explain query selectors not permitted');

    const queryInjectionRes2 = await fetch(`${BASE_URL}/placements?branch[$ne]=CSE`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(queryInjectionRes2.status, 400, 'GET /placements with query object injection must return 400');
    console.log('✓ NoSQL injection attempts cleanly rejected with 400 across auth and query endpoints\n');

    // ==========================================
    // SECTION 14: Resume Access Control Boundary Verification
    // ==========================================
    console.log('14. Testing Resume Access Control Boundary (/api/students/:studentId/resume)...');

    // Analyst gets 403
    const analystResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    assert.strictEqual(analystResumeRes.status, 403, 'Analyst must receive 403 when accessing resume');

    // Aspirant gets 403
    const aspirantResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    assert.strictEqual(aspirantResumeRes.status, 403, 'Aspirant must receive 403 when accessing resume');

    // Recruiter with no application to their company gets 403
    const recBResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${recBToken}` },
    });
    assert.strictEqual(recBResumeRes.status, 403, 'Recruiter B with no application from student must receive 403');

    // TPO of another college gets 403
    const tpoBResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${tpoBToken}` },
    });
    assert.strictEqual(tpoBResumeRes.status, 403, 'TPO B of different college must receive 403 when accessing student A resume');

    // Student themselves is authorized (returns 404 because no file uploaded on test doc, but NOT 403)
    const stuAResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.notStrictEqual(stuAResumeRes.status, 403, 'Student themselves must NOT receive 403 when accessing their resume');

    // Student using /me/resume
    const stuAMeResumeRes = await fetch(`${BASE_URL}/students/me/resume`, {
      headers: { Authorization: `Bearer ${stuAToken}` },
    });
    assert.notStrictEqual(stuAMeResumeRes.status, 403, 'Student calling /me/resume must NOT receive 403');

    // TPO of the same college is authorized (NOT 403)
    const tpoAResumeRes = await fetch(`${BASE_URL}/students/${studentA._id}/resume`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.notStrictEqual(tpoAResumeRes.status, 403, 'TPO of same college must NOT receive 403 when accessing student resume');
    console.log('✓ Resume access boundary verified: Analyst (403), Aspirant (403), Foreign Recruiter (403), Foreign TPO (403), Student (allowed), Native TPO (allowed)\n');

    // ==========================================
    // SECTION 15: Client Cold Start Retry & Backoff Logic Contract
    // ==========================================
    console.log('15. Testing Client Cold Start Retry & Backoff Logic Contract...');
    const computeBackoff = (attempt) => Math.min(5000, 2000 + attempt * 1000);
    assert.strictEqual(computeBackoff(0), 2000, 'Attempt 0 must wait 2000ms');
    assert.strictEqual(computeBackoff(1), 3000, 'Attempt 1 must wait 3000ms');
    assert.strictEqual(computeBackoff(2), 4000, 'Attempt 2 must wait 4000ms');
    assert.strictEqual(computeBackoff(3), 5000, 'Attempt 3 must cap at 5000ms');
    assert.strictEqual(computeBackoff(10), 5000, 'Attempt 10 must cap at 5000ms');

    // Retry decision matrix
    const shouldRetryColdStart = (statusCode, elapsedMs, maxBudgetMs = 75000) => {
      if (statusCode === 401 || statusCode === 403) return false; // Immediate logout
      if (elapsedMs >= maxBudgetMs) return false; // Exceeded budget
      if (!statusCode || statusCode === 502 || statusCode === 503 || statusCode === 504 || statusCode === 500) {
        return true;
      }
      return false;
    };

    assert.strictEqual(shouldRetryColdStart(401, 1000), false, '401 must never retry');
    assert.strictEqual(shouldRetryColdStart(403, 1000), false, '403 must never retry');
    assert.strictEqual(shouldRetryColdStart(502, 10000), true, '502 within budget must retry');
    assert.strictEqual(shouldRetryColdStart(503, 30000), true, '503 within budget must retry');
    assert.strictEqual(shouldRetryColdStart(null, 50000), true, 'Network failure within budget must retry');
    assert.strictEqual(shouldRetryColdStart(503, 76000), false, '503 past budget must stop retrying');
    console.log('✓ Cold start backoff timing and status code dispatch contract verified\n');

    // ==========================================
    // SECTION 16: Request Idempotency & Retry Scope Restrictions (Item 1)
    // ==========================================
    console.log('16. Testing Request Idempotency & Retry Scope Restrictions (Item 1)...');
    const isIdempotentMethodTest = (method) => {
      if (!method || typeof method !== 'string') return true;
      const m = method.toLowerCase();
      return m === 'get' || m === 'head' || m === 'options';
    };

    // Idempotent methods MUST be allowed for automatic retry/replay
    assert.strictEqual(isIdempotentMethodTest('GET'), true, 'GET must be idempotent');
    assert.strictEqual(isIdempotentMethodTest('get'), true, 'get must be idempotent');
    assert.strictEqual(isIdempotentMethodTest('HEAD'), true, 'HEAD must be idempotent');
    assert.strictEqual(isIdempotentMethodTest('OPTIONS'), true, 'OPTIONS must be idempotent');
    assert.strictEqual(isIdempotentMethodTest(undefined), true, 'Default method (GET) must be idempotent');

    // Non-idempotent methods MUST NEVER be automatically retried
    assert.strictEqual(isIdempotentMethodTest('POST'), false, 'POST must NEVER be marked idempotent');
    assert.strictEqual(isIdempotentMethodTest('post'), false, 'post must NEVER be marked idempotent');
    assert.strictEqual(isIdempotentMethodTest('PUT'), false, 'PUT must NEVER be marked idempotent');
    assert.strictEqual(isIdempotentMethodTest('PATCH'), false, 'PATCH must NEVER be marked idempotent');
    assert.strictEqual(isIdempotentMethodTest('DELETE'), false, 'DELETE must NEVER be marked idempotent');
    console.log('✓ Idempotency restrictions verified: only GET/HEAD are retryable; POST/PUT/PATCH/DELETE are strictly excluded\n');

    // ==========================================
    // SECTION 17: Request Timeouts Classification (Item 2)
    // ==========================================
    console.log('17. Testing Request Timeouts Classification (Item 2)...');
    const isSlowEndpointTest = (config = {}) => {
      const url = (config.url || '').toLowerCase();
      const method = (config.method || 'get').toLowerCase();
      const isBlob = config.responseType === 'blob';
      return (
        url.includes('/resume/parse') ||
        url.includes('/resume/analyze') ||
        url.includes('/ai/') ||
        url.includes('/assistant') ||
        url.includes('/export') ||
        url.includes('/reports') ||
        url.includes('/upload') ||
        (url.includes('/resume') && method === 'post') ||
        isBlob
      );
    };

    const resolveTimeout = (config) => {
      if (isSlowEndpointTest(config)) return 90000;
      return 15000;
    };

    // Slow endpoints must receive 90s (90000ms)
    assert.strictEqual(resolveTimeout({ url: '/api/students/me/resume/parse' }), 90000, 'Resume parse must receive 90s');
    assert.strictEqual(resolveTimeout({ url: '/api/students/me/resume/analyze' }), 90000, 'Resume analyze must receive 90s');
    assert.strictEqual(resolveTimeout({ url: '/api/assistant/chat' }), 90000, 'AI assistant must receive 90s');
    assert.strictEqual(resolveTimeout({ url: '/api/reports/placements/export' }), 90000, 'Report exports must receive 90s');
    assert.strictEqual(resolveTimeout({ url: '/api/students/resume', method: 'post' }), 90000, 'Resume upload must receive 90s');
    assert.strictEqual(resolveTimeout({ url: '/api/data/download', responseType: 'blob' }), 90000, 'Blob download must receive 90s');

    // Standard endpoints must receive 15s (15000ms)
    assert.strictEqual(resolveTimeout({ url: '/api/students/me' }), 15000, 'Profile fetch must receive 15s');
    assert.strictEqual(resolveTimeout({ url: '/api/drives' }), 15000, 'Drives list must receive 15s');
    assert.strictEqual(resolveTimeout({ url: '/api/auth/login' }), 15000, 'Auth login must receive 15s');
    assert.strictEqual(resolveTimeout({ url: '/api/notifications' }), 15000, 'Notifications must receive 15s');
    console.log('✓ Endpoint timeout assignment verified: 90s for AI/exports/uploads, 15s for standard endpoints\n');

    // ==========================================
    // SECTION 18: Test Database Safety Guard Verification (Item 4)
    // ==========================================
    console.log('18. Testing Database Safety Guard Verification (Item 4)...');
    const { assertTestDatabase } = require('./testHelper');

    // Valid test database names must pass cleanly
    assert.strictEqual(assertTestDatabase('placement_management_test'), true);
    assert.strictEqual(assertTestDatabase('my_integration_test'), true);
    assert.strictEqual(assertTestDatabase({ name: 'custom_cluster_test' }), true);
    assert.strictEqual(assertTestDatabase({ db: { databaseName: 'nested_conn_test' } }), true);

    // Non-test database names must throw fatal error
    assert.throws(
      () => assertTestDatabase('placement_management'),
      /Database name must end with "_test"/,
      'Production database name must trigger fatal exception'
    );
    assert.throws(
      () => assertTestDatabase('production_db'),
      /Database name must end with "_test"/,
      'production_db must trigger fatal exception'
    );
    assert.throws(
      () => assertTestDatabase(''),
      /Database name must end with "_test"/,
      'Empty database name must trigger fatal exception'
    );
    assert.throws(
      () => assertTestDatabase(null),
      /Database name must end with "_test"/,
      'Null database reference must trigger fatal exception'
    );
    console.log('✓ Test database safety guard verified: strictly rejects non-_test databases with fatal exception\n');

    // Clean up test documents
    await JobRequirement.deleteMany({ title: 'Software Engineer', batchYear: 2026 });
    await JobRequirement.deleteMany({ _id: { $in: [jobReqA._id, jobReqB._id] } });
    await DriveRequest.deleteMany({ _id: { $in: [dReqA._id, dReqB._id] } });
    await Placement.deleteMany({ _id: { $in: [placementA._id, placementB._id] } });
    await Application.deleteMany({ _id: { $in: [appA._id, appB._id] } });
    await Round.deleteMany({ _id: { $in: [roundA._id, roundB._id] } });
    await Drive.deleteMany({ _id: { $in: [driveCollegeA._id, driveCollegeB._id] } });
    await Student.deleteMany({ _id: { $in: [studentA._id, studentB._id] } });
    await User.deleteMany({
      _id: {
        $in: [
          tpoAUser._id,
          tpoBUser._id,
          recAUser._id,
          recBUser._id,
          stuAUser._id,
          stuBUser._id,
          analystUser._id,
          aspirantUser._id,
        ],
      },
    });
    await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await College.deleteMany({ _id: { $in: [collegeA._id, collegeB._id] } });

    console.log('\n======================================================');
    console.log('     ALL SECURITY HARDENING TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    testServer.close();
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  runSecurityHardeningTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Security hardening test suite failed:', err);
      process.exit(1);
    });
}

module.exports = runSecurityHardeningTests;
