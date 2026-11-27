/**
 * server/tests/testTenantIsolation.js
 *
 * Comprehensive Tenant Isolation & Ownership Security Regression Test Suite.
 * Covers all 10 scenarios mandated in Phase 0 Step 3:
 * 1. Student A cannot access Student B's resume.
 * 2. Student A cannot access Student B's AI job.
 * 3. Student A cannot access Student B's private mock interview result.
 * 4. College A TPO cannot access College B student data.
 * 5. College A TPO cannot access College B resume records.
 * 6. College A analytics cannot include unauthorized College B records.
 * 7. Client-supplied college ID cannot bypass tenant restrictions.
 * 8. Assistant tools cannot retrieve unauthorized cross-tenant information (and multi-college driveFunnel correctly isolates).
 * 9. Authorized global administrative access continues to work.
 * 10. Existing valid student and TPO workflows remain functional.
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri } = require('./testHelper');
const { User, Student, College, Drive, Application, Offer, RoundParticipant } = require('../models');
const Resume = require('../models/Resume');
const MockInterviewSession = require('../models/MockInterviewSession');
const { dispatchAiJob, getAiJobStatus, setAiQueueForTesting, createMockAiQueue } = require('../services/ai/aiQueue');
setAiQueueForTesting(createMockAiQueue());
const assistantTools = require('../services/assistant/assistantTools');
const { getTenantScope, assertTenantAccess, assertResourceOwner } = require('../utils/tenantHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'testsecret_at_least_32_characters_long_for_test';

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runTenantIsolationTests() {
  console.log('======================================================');
  console.log('    TEST: TENANT ISOLATION & RESOURCE OWNERSHIP       ');
  console.log('======================================================\n');

  await mongoose.connect(getTestDbUri());
  console.log('Connected to test DB:', mongoose.connection.name);

  // Set up Express test application mounting the relevant routes
  const app = express();
  app.use(express.json());
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/mock-interviews', require('../routes/mockInterviewRoutes'));
  app.use('/api/resume-studio', require('../routes/resumeStudioRoutes'));
  app.use('/api/assistant', require('../routes/assistantRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));

  // Standard JSON error handling middleware
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err.message,
    });
  });

  const PORT = 5096;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    // -------------------------------------------------------------------------
    // Setup Isolated Test Fixtures
    // -------------------------------------------------------------------------
    console.log('Setting up isolated multi-tenant fixtures...');

    // Clean up any lingering fixtures from previous runs
    await College.deleteMany({ code: { $in: ['TENANT_A', 'TENANT_B'] } });
    await Student.deleteMany({ enrollmentNo: { $in: ['ENROLL_ALPHA_001', 'ENROLL_BETA_002'] } });
    await User.deleteMany({
      email: {
        $in: [
          'tpo_a@tenant-a.edu',
          'admin_a@tenant-a.edu',
          'tpo_b@tenant-b.edu',
          'student_a@tenant-a.edu',
          'student_b@tenant-b.edu',
          'superadmin_tenant@portal.com',
        ],
      },
    });

    const collegeA = await College.create({
      name: 'Tenant College Alpha',
      code: 'TENANT_A',
      city: 'Delhi',
      state: 'Delhi',
      website: 'https://tenant-a.edu',
      status: 'approved',
    });

    const collegeB = await College.create({
      name: 'Tenant College Beta',
      code: 'TENANT_B',
      city: 'Mumbai',
      state: 'Maharashtra',
      website: 'https://tenant-b.edu',
      status: 'approved',
    });

    const userTpoA = await User.create({
      name: 'TPO College Alpha',
      email: 'tpo_a@tenant-a.edu',
      password: 'StrongPassword123!',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const userAdminA = await User.create({
      name: 'Admin College Alpha',
      email: 'admin_a@tenant-a.edu',
      password: 'StrongPassword123!',
      role: 'admin',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const userTpoB = await User.create({
      name: 'TPO College Beta',
      email: 'tpo_b@tenant-b.edu',
      password: 'StrongPassword123!',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const userStudentA = await User.create({
      name: 'Alice Alpha',
      email: 'student_a@tenant-a.edu',
      password: 'StrongPassword123!',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'ENROLL_ALPHA_001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.8,
      backlogs: 0,
      phone: '9876543211',
      resumeUrl: 'uploads/resumes/alpha_resume.pdf',
    });

    const userStudentB = await User.create({
      name: 'Bob Beta',
      email: 'student_b@tenant-b.edu',
      password: 'StrongPassword123!',
      role: 'student',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'ENROLL_BETA_002',
      branch: 'IT',
      batchYear: 2026,
      cgpa: 8.2,
      backlogs: 0,
      phone: '9876543222',
      resumeUrl: 'uploads/resumes/beta_resume.pdf',
    });

    const userSuperadmin = await User.create({
      name: 'Global Superadmin',
      email: 'superadmin_tenant@portal.com',
      password: 'Apex#2026!Shielded',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });

    const tokenStudentA = generateToken(userStudentA);
    const tokenStudentB = generateToken(userStudentB);
    const tokenTpoA = generateToken(userTpoA);
    const tokenAdminA = generateToken(userAdminA);
    const tokenTpoB = generateToken(userTpoB);
    const tokenSuperadmin = generateToken(userSuperadmin);

    // Create a Resume in Resume Studio for Student B
    const resumeB = await Resume.create({
      student: studentB._id,
      college: collegeB._id,
      title: "Bob's FullStack CV",
      templateId: 'modern',
      data: {
        personal: { name: 'Bob Beta', email: 'student_b@tenant-b.edu' },
        skills: { technical: ['React', 'Node.js'] },
      },
      isPrimary: true,
      archived: false,
    });

    // Create a mock interview session for Student B
    const interviewSessionB = await MockInterviewSession.create({
      student: studentB._id,
      college: collegeB._id,
      targetRole: 'Backend Engineer',
      type: 'technical',
      difficulty: 'intermediate',
      totalQuestions: 1,
      status: 'completed',
      questions: [
        {
          questionId: 'q-1',
          question: 'Explain database indexing.',
          category: 'technical',
        },
      ],
      answers: [
        {
          questionId: 'q-1',
          answer: 'Indexes speed up search using B-trees.',
          score: { correctness: 90, clarity: 85, depth: 80, structure: 85, overall: 85 },
        },
      ],
    });

    // Dispatch an AI job owned by Student B
    const aiJobB = await dispatchAiJob('resume_analyze', { candidateSkills: ['react'] }, userStudentB._id, collegeB._id);

    console.log('✓ Test fixtures created successfully.\n');

    // =========================================================================
    // SCENARIO 1: Student A cannot access Student B's resume
    // =========================================================================
    console.log('--- SCENARIO 1: Student A cannot access Student B resume ---');
    const resS1 = await fetch(`${BASE_URL}/students/${studentB._id}/resume`, {
      headers: { Authorization: `Bearer ${tokenStudentA}` },
    });
    assert.strictEqual(resS1.status, 403, `Expected 403 when Student A tries to stream Student B's resume, got ${resS1.status}`);
    const jsonS1 = await resS1.json();
    assert.strictEqual(jsonS1.success, false);
    console.log('✓ Student A accessing Student B resume was strictly blocked (HTTP 403)');

    // =========================================================================
    // SCENARIO 2: Student A cannot access Student B's AI job
    // =========================================================================
    console.log('\n--- SCENARIO 2: Student A cannot access Student B AI job ---');
    const resS2 = await fetch(`${BASE_URL}/students/me/ai-jobs/${aiJobB.jobId}`, {
      headers: { Authorization: `Bearer ${tokenStudentA}` },
    });
    assert.strictEqual(resS2.status, 403, `Expected 403 when Student A polls Student B's AI job, got ${resS2.status}`);
    const jsonS2 = await resS2.json();
    assert.strictEqual(jsonS2.success, false);
    assert.strictEqual(jsonS2.status, undefined, 'Result/status payload must never leak in 403');
    console.log('✓ Student A polling Student B AI job was strictly blocked (HTTP 403)');

    // =========================================================================
    // SCENARIO 3: Student A cannot access Student B's private interview result
    // =========================================================================
    console.log('\n--- SCENARIO 3: Student A cannot access Student B mock interview ---');
    const resS3 = await fetch(`${BASE_URL}/mock-interviews/${interviewSessionB._id}`, {
      headers: { Authorization: `Bearer ${tokenStudentA}` },
    });
    assert.strictEqual(resS3.status, 403, `Expected 403 when Student A views Student B's interview session, got ${resS3.status}`);
    const jsonS3 = await resS3.json();
    assert.strictEqual(jsonS3.success, false);
    console.log('✓ Student A accessing Student B private interview result was strictly blocked (HTTP 403)');

    // =========================================================================
    // SCENARIO 4: College A TPO cannot access College B student data
    // =========================================================================
    console.log('\n--- SCENARIO 4: College A TPO cannot access College B student data ---');
    const resS4 = await fetch(`${BASE_URL}/students/${studentB._id}`, {
      headers: { Authorization: `Bearer ${tokenTpoA}` },
    });
    assert.strictEqual(resS4.status, 403, `Expected 403 when College A TPO accesses College B student, got ${resS4.status}`);
    const jsonS4 = await resS4.json();
    assert.strictEqual(jsonS4.success, false);

    // Also verify legacy Admin role from College A is blocked
    const resS4Admin = await fetch(`${BASE_URL}/students/${studentB._id}`, {
      headers: { Authorization: `Bearer ${tokenAdminA}` },
    });
    assert.strictEqual(resS4Admin.status, 403, `Expected 403 when College A Admin accesses College B student, got ${resS4Admin.status}`);
    console.log('✓ College A TPO and Admin accessing College B student data were strictly blocked (HTTP 403)');

    // =========================================================================
    // SCENARIO 5: College A TPO cannot access College B resume records
    // =========================================================================
    console.log('\n--- SCENARIO 5: College A TPO cannot access College B resume records ---');
    // 5a. Via Resume Studio TPO view
    const resS5Studio = await fetch(`${BASE_URL}/resume-studio/tpo/resumes/${resumeB._id}`, {
      headers: { Authorization: `Bearer ${tokenTpoA}` },
    });
    assert.strictEqual(resS5Studio.status, 403, `Expected 403 when College A TPO views College B Resume Studio document, got ${resS5Studio.status}`);

    // 5b. Via streamResume route
    const resS5Stream = await fetch(`${BASE_URL}/students/${studentB._id}/resume`, {
      headers: { Authorization: `Bearer ${tokenTpoA}` },
    });
    assert.strictEqual(resS5Stream.status, 403, `Expected 403 when College A TPO streams College B resume, got ${resS5Stream.status}`);

    // 5c. Via Admin role streamResume route (verifying our patch)
    const resS5StreamAdmin = await fetch(`${BASE_URL}/students/${studentB._id}/resume`, {
      headers: { Authorization: `Bearer ${tokenAdminA}` },
    });
    assert.strictEqual(resS5StreamAdmin.status, 403, `Expected 403 when College A Admin streams College B resume, got ${resS5StreamAdmin.status}`);
    console.log('✓ College A TPO and Admin accessing College B resume records were strictly blocked (HTTP 403)');

    // =========================================================================
    // SCENARIO 6: College A analytics cannot include unauthorized College B records
    // =========================================================================
    console.log('\n--- SCENARIO 6: College A analytics cannot include College B records ---');
    const analyticsScopeA = getTenantScope({ user: userTpoA });
    assert.strictEqual(analyticsScopeA.isGlobalAdmin, false);
    assert.strictEqual(analyticsScopeA.collegeId.toString(), collegeA._id.toString());
    assert.strictEqual(analyticsScopeA.filter.college.toString(), collegeA._id.toString());

    // Analytics tool test: placementSummary for College A
    const summaryA = await assistantTools.placementSummary(collegeA._id);
    assert.strictEqual(summaryA.totalStudents, 1, 'College A must only see 1 student (Alice)');
    const unplacedA = await assistantTools.unplacedStudents(collegeA._id);
    assert.strictEqual(unplacedA.count, 1);
    assert.strictEqual(unplacedA.students[0].name, 'Alice Alpha');
    console.log('✓ College A analytics and assistant tool summaries strictly scoped to College A records');

    // =========================================================================
    // SCENARIO 7: Client-supplied college ID cannot bypass tenant restrictions
    // =========================================================================
    console.log('\n--- SCENARIO 7: Client-supplied college ID cannot bypass tenant restrictions ---');
    // Simulate TPO A trying to pass College B's ID in query or body
    const spoofReq = {
      user: userTpoA,
      query: { collegeId: collegeB._id.toString() },
      body: { collegeId: collegeB._id.toString() },
    };
    const spoofScope = getTenantScope(spoofReq);
    assert.strictEqual(
      spoofScope.collegeId.toString(),
      collegeA._id.toString(),
      'Tenant scope must strictly ignore spoofed collegeId and use authenticated user.college'
    );
    assert.strictEqual(
      spoofScope.filter.college.toString(),
      collegeA._id.toString(),
      'Filter must remain locked to College A'
    );
    console.log('✓ Client-supplied collegeId spoofing attempt was overridden by server-side identity');

    // =========================================================================
    // SCENARIO 8: Assistant tools cannot retrieve unauthorized cross-tenant info
    //             & Multi-college driveFunnel correctly isolates
    // =========================================================================
    console.log('\n--- SCENARIO 8: Assistant tools & multi-college driveFunnel isolation ---');
    const Company = require('../models/Company');
    let testComp = await Company.findOne({ name: 'OmniCorp Global' });
    if (!testComp) {
      testComp = await Company.create({
        name: 'OmniCorp Global',
        industry: 'IT',
        website: 'https://omnicorp.example.com',
      });
    }

    // Create a multi-college drive open to College A and College B
    const multiDrive = await Drive.create({
      title: 'Mega Joint Drive 2026',
      role: 'Cloud Architect',
      company: testComp._id,
      college: collegeA._id,
      colleges: [collegeA._id, collegeB._id],
      status: 'open',
      location: 'Bengaluru / Remote',
      packageLpa: 15.0,
      allowedBranches: ['CSE', 'IT'],
      driveDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    // Create applications: Student A applies, Student B applies
    const appA = await Application.create({
      drive: multiDrive._id,
      student: studentA._id,
      status: 'applied',
    });

    const appB = await Application.create({
      drive: multiDrive._id,
      student: studentB._id,
      status: 'applied',
    });

    // Create offer for Student B only
    await Offer.create({
      drive: multiDrive._id,
      company: testComp._id,
      college: collegeB._id,
      student: studentB._id,
      application: appB._id,
      packageLpa: 14.5,
      role: 'Cloud Architect',
      status: 'accepted',
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    // Execute driveFunnel as College A TPO
    const funnelCollegeA = await assistantTools.driveFunnel(collegeA._id, { driveId: multiDrive._id });
    assert.strictEqual(funnelCollegeA.found, true);
    assert.strictEqual(funnelCollegeA.applied, 1, `College A should see applied=1 (Alice), got ${funnelCollegeA.applied}`);
    assert.strictEqual(funnelCollegeA.accepted, 0, `College A should see accepted=0, got ${funnelCollegeA.accepted}`);

    // Execute driveFunnel as College B TPO
    const funnelCollegeB = await assistantTools.driveFunnel(collegeB._id, { driveId: multiDrive._id });
    assert.strictEqual(funnelCollegeB.found, true);
    assert.strictEqual(funnelCollegeB.applied, 1, `College B should see applied=1 (Bob), got ${funnelCollegeB.applied}`);
    assert.strictEqual(funnelCollegeB.accepted, 1, `College B should see accepted=1, got ${funnelCollegeB.accepted}`);
    console.log('✓ Multi-college driveFunnel correctly isolated counts per college tenant without leaking cross-college numbers');

    // =========================================================================
    // SCENARIO 9: Authorized global administrative access continues to work
    // =========================================================================
    console.log('\n--- SCENARIO 9: Authorized global administrative access ---');
    const superScope = getTenantScope({ user: userSuperadmin });
    assert.strictEqual(superScope.isGlobalAdmin, true);
    assert.deepStrictEqual(superScope.filter, {});

    // Superadmin can query Student B
    const resS9Student = await fetch(`${BASE_URL}/students/${studentB._id}`, {
      headers: { Authorization: `Bearer ${tokenSuperadmin}` },
    });
    assert.strictEqual(resS9Student.status, 200, 'Superadmin must have access to Student B');

    // Superadmin can view Resume Studio document of Student B
    const resS9Resume = await fetch(`${BASE_URL}/resume-studio/tpo/resumes/${resumeB._id}`, {
      headers: { Authorization: `Bearer ${tokenSuperadmin}` },
    });
    assert.strictEqual(resS9Resume.status, 200, 'Superadmin must have access to Resume Studio doc');

    // Superadmin can poll Student B's AI job
    const jobStatusSuper = await getAiJobStatus(aiJobB.jobId, userSuperadmin);
    assert.strictEqual(jobStatusSuper.status, 'completed');
    console.log('✓ Global Superadmin platform access verified across tenants');

    // =========================================================================
    // SCENARIO 10: Existing valid student and TPO workflows remain functional
    // =========================================================================
    console.log('\n--- SCENARIO 10: Existing valid workflows remain functional ---');
    // 10a. Student B can poll their own AI job
    const resS10Job = await fetch(`${BASE_URL}/students/me/ai-jobs/${aiJobB.jobId}`, {
      headers: { Authorization: `Bearer ${tokenStudentB}` },
    });
    assert.strictEqual(resS10Job.status, 200, 'Student B must successfully poll own AI job');
    const jsonS10Job = await resS10Job.json();
    assert.strictEqual(jsonS10Job.success, true);
    assert.strictEqual(jsonS10Job.status, 'completed');

    // 10b. Student B can view their own mock interview session
    const resS10Interview = await fetch(`${BASE_URL}/mock-interviews/${interviewSessionB._id}`, {
      headers: { Authorization: `Bearer ${tokenStudentB}` },
    });
    assert.strictEqual(resS10Interview.status, 200, 'Student B must successfully view own mock interview');

    // 10c. College B TPO can view Student B's resume
    const resS10Tpo = await fetch(`${BASE_URL}/resume-studio/tpo/resumes/${resumeB._id}`, {
      headers: { Authorization: `Bearer ${tokenTpoB}` },
    });
    assert.strictEqual(resS10Tpo.status, 200, 'College B TPO must successfully view Student B resume');

    // 10d. College A TPO can view Student A
    const resS10TpoA = await fetch(`${BASE_URL}/students/${studentA._id}`, {
      headers: { Authorization: `Bearer ${tokenTpoA}` },
    });
    assert.strictEqual(resS10TpoA.status, 200, 'College A TPO must successfully view Student A');
    console.log('✓ Valid owner and same-college TPO workflows operate normally (HTTP 200)');

    console.log('\n======================================================');
    console.log('  ALL 10 TENANT ISOLATION SECURITY TESTS PASSED (100%)');
    console.log('======================================================\n');
  } finally {
    // Clean up test fixtures
    await College.deleteMany({ code: { $in: ['TENANT_A', 'TENANT_B'] } });
    await User.deleteMany({
      email: {
        $in: [
          'tpo_a@tenant-a.edu',
          'admin_a@tenant-a.edu',
          'tpo_b@tenant-b.edu',
          'student_a@tenant-a.edu',
          'student_b@tenant-b.edu',
          'superadmin_tenant@portal.com',
        ],
      },
    });
    setAiQueueForTesting(null);
    const { closeRedisConnections } = require('../config/redis');
    await closeRedisConnections();
    await server.close();
    await mongoose.disconnect();
  }
}

runTenantIsolationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TENANT ISOLATION TEST FAILED:', err);
    process.exit(1);
  });
