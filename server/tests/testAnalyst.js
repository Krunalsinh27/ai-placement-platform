const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  Offer,
} = require('../models');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

// Deep inspection helper to verify zero student PII leaks
function auditPrivacy(obj, path = '') {
  const forbiddenKeys = [
    'enrollmentno',
    'rollnumber',
    'resumeurl',
    'cgpa',
    'backlogs',
    'chatmessages',
    'driverequests',
  ];

  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => auditPrivacy(item, `${path}[${idx}]`));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (forbiddenKeys.includes(lowerKey)) {
      throw new Error(`[PRIVACY VIOLATION] Forbidden student field "${key}" found at path "${path}.${key}"`);
    }

    // Ensure no individual student object with both student name and email exists
    if (obj.role === 'student' && (obj.email || obj.name)) {
      throw new Error(`[PRIVACY VIOLATION] Student user object exposed at path "${path}"`);
    }

    auditPrivacy(value, path ? `${path}.${key}` : key);
  }
}

function getTestDbUri() {
  if (process.env.MONGO_URI_TEST) return process.env.MONGO_URI_TEST;
  const base = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  if (base.includes('?')) {
    const [dbPart, query] = base.split('?');
    return `${dbPart.replace(/_test$/, '')}_test?${query}`;
  }
  return `${base.replace(/_test$/, '')}_test`;
}

async function runAnalystTests() {
  console.log('Connecting to MongoDB Test Database...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/analytics', require('../routes/analyticsRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5094;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('       TASK 33A: ANALYST ROLE & ANALYTICS TESTS       ');
    console.log('======================================================\n');

    // ------------------------------------------------------------------------
    // SETUP TEST DATA
    // ------------------------------------------------------------------------
    console.log('--- Setting up Test Data ---');

    // 1. Colleges
    // Approved College A (Delhi)
    let collegeA = await College.findOne({ code: 'TEST_COL_A' });
    if (!collegeA) {
      collegeA = await College.create({
        name: 'Alpha Institute of Tech',
        code: 'TEST_COL_A',
        city: 'New Delhi',
        state: 'Delhi',
        status: 'approved',
      });
    }

    // Approved College B (Maharashtra) - Small cohort (< 5)
    let collegeB = await College.findOne({ code: 'TEST_COL_B' });
    if (!collegeB) {
      collegeB = await College.create({
        name: 'Beta Engineering College',
        code: 'TEST_COL_B',
        city: 'Pune',
        state: 'Maharashtra',
        status: 'approved',
      });
    }

    // Pending College C (Must be excluded from all analytics!)
    let collegeC = await College.findOne({ code: 'TEST_COL_C' });
    if (!collegeC) {
      collegeC = await College.create({
        name: 'Gamma Pending College',
        code: 'TEST_COL_C',
        city: 'Mumbai',
        state: 'Maharashtra',
        status: 'pending',
      });
    }

    // 2. Companies
    let companyGoogle = await Company.findOne({ name: 'Google Test Analytics' });
    if (!companyGoogle) {
      companyGoogle = await Company.create({
        name: 'Google Test Analytics',
        industry: 'Technology',
        verified: true,
      });
    }

    let companyAmazon = await Company.findOne({ name: 'Amazon Test Analytics' });
    if (!companyAmazon) {
      companyAmazon = await Company.create({
        name: 'Amazon Test Analytics',
        industry: 'Cloud & E-Commerce',
        verified: true,
      });
    }

    // 3. Drives
    let driveGoogleA = await Drive.findOne({ role: 'Software Engineer Analyst Test' });
    if (!driveGoogleA) {
      driveGoogleA = await Drive.create({
        company: companyGoogle._id,
        college: collegeA._id,
        role: 'Software Engineer Analyst Test',
        packageLpa: 18.0,
        location: 'Bangalore',
        status: 'closed',
        driveDate: new Date(),
        lastDateToApply: new Date(),
        allowedBranches: ['CSE', 'ECE', 'IT', 'MECH', 'CIVIL'],
      });
    }

    // 4. Clean up previous test users for clean test run
    await User.deleteMany({ email: { $regex: /@analyst-test\.com$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^TEST_ANALYST_/ } });

    // Create 8 Students in College A (Cohort >= 5)
    // 6 in CSE (batch 2025), 2 in ECE (batch 2024)
    const collegeAStudents = [];
    for (let i = 1; i <= 8; i++) {
      const u = await User.create({
        name: `Student A${i}`,
        email: `studentA${i}@analyst-test.com`,
        password: 'Password123!',
        role: 'student',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: collegeA._id,
        enrollmentNo: `TEST_ANALYST_A${i}`,
        branch: i <= 6 ? 'CSE' : 'ECE',
        batchYear: i <= 6 ? 2025 : 2024,
        cgpa: 8.5,
        backlogs: 0,
        phone: `987654321${i}`,
      });
      collegeAStudents.push(st);
    }

    // Create 3 Students in College B (Cohort < 5, should be suppressed to 'lt5')
    // 2 in CIVIL, 1 in MECH
    const collegeBStudents = [];
    for (let i = 1; i <= 3; i++) {
      const u = await User.create({
        name: `Student B${i}`,
        email: `studentB${i}@analyst-test.com`,
        password: 'Password123!',
        role: 'student',
        college: collegeB._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: collegeB._id,
        enrollmentNo: `TEST_ANALYST_B${i}`,
        branch: i <= 2 ? 'CIVIL' : 'MECH',
        batchYear: 2025,
        cgpa: 7.8,
        backlogs: 0,
        phone: `912345678${i}`,
      });
      collegeBStudents.push(st);
    }

    // Create 2 Students in Pending College C (Must NOT be counted anywhere)
    for (let i = 1; i <= 2; i++) {
      const u = await User.create({
        name: `Student C${i}`,
        email: `studentC${i}@analyst-test.com`,
        password: 'Password123!',
        role: 'student',
        college: collegeC._id,
        isApproved: true,
        isEmailVerified: true,
      });
      await Student.create({
        user: u._id,
        college: collegeC._id,
        enrollmentNo: `TEST_ANALYST_C${i}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 9.0,
        backlogs: 0,
        phone: `900000000${i}`,
      });
    }

    // 5. Applications & Offers Setup
    // Clear old applications/offers for these students
    const allTestStudentIds = [...collegeAStudents, ...collegeBStudents].map((s) => s._id);
    await Application.deleteMany({ student: { $in: allTestStudentIds } });
    await Offer.deleteMany({ student: { $in: allTestStudentIds } });

    // Applications for College A: Students 1 to 7 apply
    const apps = [];
    for (let i = 0; i < 7; i++) {
      const app = await Application.create({
        student: collegeAStudents[i]._id,
        drive: driveGoogleA._id,
      });
      apps.push(app);
    }

    // Offers for College A:
    // Student 1 gets 2 accepted offers (18 LPA from Google, 20 LPA from Amazon) -> Must count as 1 placed student!
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[0]._id,
      application: apps[0]._id,
      packageLpa: 18.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyAmazon._id,
      college: collegeA._id,
      student: collegeAStudents[0]._id,
      application: apps[0]._id,
      packageLpa: 20.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });

    // Students 2, 3, 4, 5 get accepted offers (14, 12, 16, 22 LPA) -> Placed
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[1]._id,
      application: apps[1]._id,
      packageLpa: 14.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[2]._id,
      application: apps[2]._id,
      packageLpa: 12.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[3]._id,
      application: apps[3]._id,
      packageLpa: 16.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[4]._id,
      application: apps[4]._id,
      packageLpa: 22.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'accepted',
    });

    // Student 6 gets 1 declined offer -> NOT placed
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[5]._id,
      application: apps[5]._id,
      packageLpa: 15.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'declined',
    });

    // Student 7 gets 1 OFFERED (not accepted) -> NOT placed
    await Offer.create({
      drive: driveGoogleA._id,
      company: companyGoogle._id,
      college: collegeA._id,
      student: collegeAStudents[6]._id,
      application: apps[6]._id,
      packageLpa: 10.0,
      expiryDate: new Date(Date.now() + 86400000),
      status: 'offered',
    });

    // Role test users
    const tpoUser = await User.create({
      name: 'TPO Analyst Test',
      email: 'tpo@analyst-test.com',
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tpoToken = createToken(tpoUser);

    const recruiterUser = await User.create({
      name: 'Recruiter Analyst Test',
      email: 'recruiter@analyst-test.com',
      password: 'Password123!',
      role: 'recruiter',
      company: companyGoogle._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const recruiterToken = createToken(recruiterUser);

    const studentUser = collegeAStudents[0];
    const studentToken = createToken(await User.findById(studentUser.user));

    const superadminUser = await User.create({
      name: 'SuperAdmin Analyst Test',
      email: 'superadmin@analyst-test.com',
      password: 'Password123!',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });
    const superadminToken = createToken(superadminUser);

    // ------------------------------------------------------------------------
    // TEST 1: ANALYST REGISTRATION & APPROVAL WORKFLOW
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Analyst Registration & Approval Workflow ---');

    const regRes = await fetch(`${BASE_URL}/auth/register-analyst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dr. Jane Analyst',
        email: 'jane.analyst@analyst-test.com',
        organisation: 'Higher Ed Research Council',
        organisationType: 'Researcher',
        purpose: 'Academic research on higher education placement trends',
        designation: 'Senior Placement Analyst',
        password: 'Password123!',
      }),
    });
    const regData = await regRes.json();
    console.log('Register analyst response status:', regRes.status, 'success:', regData.success);
    if (regRes.status !== 201) throw new Error('Failed to register analyst');

    let analystUser = await User.findOne({ email: 'jane.analyst@analyst-test.com' });
    if (!analystUser) throw new Error('Analyst user not found in DB');
    if (analystUser.role !== 'analyst') throw new Error(`Role should be analyst, got ${analystUser.role}`);
    if (analystUser.isApproved !== false) throw new Error('Analyst should have isApproved=false on registration');
    if (analystUser.isEmailVerified !== false) throw new Error('Analyst should have isEmailVerified=false on registration');
    console.log('✓ Analyst registered with isApproved: false and role: "analyst"');

    // Attempt login before email verified
    const unverifiedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.analyst@analyst-test.com',
        password: 'Password123!',
      }),
    });
    const unverifiedLoginData = await unverifiedLoginRes.json();
    console.log('Unverified analyst login status:', unverifiedLoginRes.status, 'message:', unverifiedLoginData.message);
    if (unverifiedLoginRes.status !== 403 || !unverifiedLoginData.unverified) {
      throw new Error('Unverified email must return 403 with unverified=true');
    }
    console.log('✓ Unverified analyst blocked from logging in');

    // Verify email
    analystUser.isEmailVerified = true;
    await analystUser.save();

    // Attempt login when email is verified but isApproved is still false
    const unapprovedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.analyst@analyst-test.com',
        password: 'Password123!',
      }),
    });
    const unapprovedLoginData = await unapprovedLoginRes.json();
    console.log('Unapproved analyst login status:', unapprovedLoginRes.status, 'message:', unapprovedLoginData.message);
    if (unapprovedLoginRes.status !== 403 || !unapprovedLoginData.message.includes('Waiting for approval')) {
      throw new Error(`Expected 403 with "Waiting for approval", got ${unapprovedLoginData.message}`);
    }
    console.log('✓ Unapproved analyst receives 403 "Waiting for approval"');

    // Superadmin approves analyst
    analystUser.isApproved = true;
    await analystUser.save();

    // Approved analyst login succeeds
    const approvedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.analyst@analyst-test.com',
        password: 'Password123!',
      }),
    });
    const approvedLoginData = await approvedLoginRes.json();
    console.log('Approved analyst login status:', approvedLoginRes.status, 'token received:', !!approvedLoginData.token);
    if (approvedLoginRes.status !== 200 || !approvedLoginData.token) {
      throw new Error('Approved analyst login should succeed with 200 and token');
    }
    const analystToken = approvedLoginData.token;
    console.log('✓ Approved analyst logs in successfully and receives JWT token');

    // ------------------------------------------------------------------------
    // TEST 2: RBAC ACCESS RESTRICTION ON /api/analytics
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: RBAC Access Restriction on /api/analytics ---');

    // TPO access -> 403
    const tpoRes = await fetch(`${BASE_URL}/analytics/overview`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    console.log('TPO access status:', tpoRes.status);
    if (tpoRes.status !== 403) throw new Error(`TPO must receive 403, got ${tpoRes.status}`);

    // Student access -> 403
    const studentRes = await fetch(`${BASE_URL}/analytics/overview`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    console.log('Student access status:', studentRes.status);
    if (studentRes.status !== 403) throw new Error(`Student must receive 403, got ${studentRes.status}`);

    // Recruiter access -> 403
    const recruiterRes = await fetch(`${BASE_URL}/analytics/overview`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    console.log('Recruiter access status:', recruiterRes.status);
    if (recruiterRes.status !== 403) throw new Error(`Recruiter must receive 403, got ${recruiterRes.status}`);

    // Analyst access -> 200
    const analystRes = await fetch(`${BASE_URL}/analytics/overview`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    console.log('Analyst access status:', analystRes.status);
    if (analystRes.status !== 200) throw new Error(`Analyst must receive 200, got ${analystRes.status}`);

    // Superadmin access -> 200
    const superadminRes = await fetch(`${BASE_URL}/analytics/overview`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    console.log('Superadmin access status:', superadminRes.status);
    if (superadminRes.status !== 200) throw new Error(`Superadmin must receive 200, got ${superadminRes.status}`);

    console.log('✓ Role access control verified: 403 for TPO, Student, Recruiter; 200 for Analyst & Superadmin');

    // ------------------------------------------------------------------------
    // TEST 3: UNAPPROVED COLLEGES EXCLUDED FROM AGGREGATES
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Unapproved Colleges Exclusion ---');

    const colRes = await fetch(`${BASE_URL}/analytics/colleges`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const colData = await colRes.json();
    console.log('Colleges returned count:', colData.colleges.length);
    const hasPendingCollege = colData.colleges.some((c) => c.code === 'TEST_COL_C');
    if (hasPendingCollege) {
      throw new Error('Unapproved (pending) college was included in /api/analytics/colleges!');
    }
    console.log('✓ Unapproved colleges are strictly excluded from aggregates');

    // ------------------------------------------------------------------------
    // TEST 4: DATA PRIVACY & ZERO PII VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Zero Student PII Audit ---');

    const endpointsToAudit = [
      '/analytics/overview',
      '/analytics/colleges',
      '/analytics/by-branch',
      '/analytics/by-year',
      '/analytics/top-recruiters',
      `/analytics/compare?colleges=${collegeA._id},${collegeB._id}`,
    ];

    for (const ep of endpointsToAudit) {
      const res = await fetch(`${BASE_URL}${ep}`, {
        headers: { Authorization: `Bearer ${analystToken}` },
      });
      const data = await res.json();
      auditPrivacy(data, ep);
    }
    console.log('✓ Strict Data Privacy verified: zero personal student fields in any analytics response');

    // ------------------------------------------------------------------------
    // TEST 5: SMALL-GROUP SUPPRESSION (<5 STUDENTS)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Small-Group Suppression (<5 Students) ---');

    // College B has 3 students (< 5)
    const collegeBEntry = colData.colleges.find((c) => c.code === 'TEST_COL_B');
    console.log('College B metrics:', collegeBEntry);
    if (!collegeBEntry) throw new Error('College B not found in colleges response');
    if (collegeBEntry.students !== 'lt5') {
      throw new Error(`Expected College B students to be "lt5", got ${collegeBEntry.students}`);
    }
    if (collegeBEntry.placed !== 'lt5') {
      throw new Error(`Expected College B placed to be "lt5", got ${collegeBEntry.placed}`);
    }
    if (collegeBEntry.averagePackage !== null) {
      throw new Error(`Expected College B averagePackage to be null, got ${collegeBEntry.averagePackage}`);
    }
    console.log('✓ College with <5 students returns "lt5" for counts and null for package stats');

    // Branch CIVIL has 2 students (< 5)
    const branchRes = await fetch(`${BASE_URL}/analytics/by-branch`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const branchData = await branchRes.json();
    const civilBranch = branchData.byBranch.find((b) => b.branch === 'CIVIL');
    console.log('Civil branch metrics:', civilBranch);
    if (!civilBranch || civilBranch.students !== 'lt5') {
      throw new Error(`Expected CIVIL branch students to be "lt5", got ${civilBranch?.students}`);
    }
    console.log('✓ Branch with <5 students returns "lt5" for counts');

    // ------------------------------------------------------------------------
    // TEST 6: PLACED STUDENTS & ACCEPTED OFFERS COUNTING
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Placed Students Counting (Accepted Offers Only) ---');

    // Filter to College A only
    const overviewRes = await fetch(`${BASE_URL}/analytics/overview?collegeIds=${collegeA._id}`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const overviewData = await overviewRes.json();
    console.log('College A Overview metrics:', overviewData);

    // College A has 8 students
    if (overviewData.totalStudents !== 8) {
      throw new Error(`Expected 8 students in College A, got ${overviewData.totalStudents}`);
    }

    // 7 students applied
    if (overviewData.applied !== 7) {
      throw new Error(`Expected 7 applied in College A, got ${overviewData.applied}`);
    }

    // Student 1 has 2 accepted offers, Students 2,3,4,5 have 1 accepted offer each -> exactly 5 unique placed students!
    // Student 6 has 'declined', Student 7 has 'offered' -> not placed
    if (overviewData.placed !== 5) {
      throw new Error(`Expected 5 unique placed students (accepted offers only), got ${overviewData.placed}`);
    }

    // Check Placement %
    if (overviewData.placementPercentage !== 62.5) {
      throw new Error(`Expected 62.5% placement rate, got ${overviewData.placementPercentage}`);
    }

    // Check Highest Package
    if (overviewData.highestPackage !== 22.0) {
      throw new Error(`Expected 22.0 LPA highest package, got ${overviewData.highestPackage}`);
    }

    console.log('✓ Unique placed counting verified: multiple accepted offers counted once, non-accepted offers ignored');

    // ------------------------------------------------------------------------
    // TEST 7: UNIVERSAL FILTERS (State, BatchYear, Branch, CollegeIds)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Universal Filters Application ---');

    // Filter by State = Delhi
    const delhiRes = await fetch(`${BASE_URL}/analytics/colleges?state=Delhi`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const delhiData = await delhiRes.json();
    console.log('Delhi filter colleges count:', delhiData.colleges.length);
    if (delhiData.colleges.length < 1) {
      throw new Error(`Expected at least 1 college in Delhi, got ${delhiData.colleges.length}`);
    }
    const allDelhi = delhiData.colleges.every((c) => c.state.toLowerCase() === 'delhi');
    if (!allDelhi) {
      throw new Error('Not all colleges in state=Delhi filter belong to Delhi');
    }

    // Filter by BatchYear = 2024 & College A (College A has 2 students in 2024) -> <5 so returns 'lt5'
    const yearRes = await fetch(`${BASE_URL}/analytics/overview?collegeIds=${collegeA._id}&batchYear=2024`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const yearData = await yearRes.json();
    console.log('BatchYear 2024 filter totalStudents in College A:', yearData.totalStudents);
    if (yearData.totalStudents !== 'lt5') {
      throw new Error(`Expected 'lt5' for 2 students in 2024, got ${yearData.totalStudents}`);
    }

    // Filter by Branch = CSE & College A (6 students -> numeric 6)
    const cseRes = await fetch(`${BASE_URL}/analytics/overview?collegeIds=${collegeA._id}&branch=CSE`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const cseData = await cseRes.json();
    console.log('Branch CSE filter totalStudents:', cseData.totalStudents);
    if (cseData.totalStudents !== 6) {
      throw new Error(`Expected 6 for 6 CSE students in College A, got ${cseData.totalStudents}`);
    }

    // Filter by Branch = ECE & College A (2 students -> 'lt5')
    const eceRes = await fetch(`${BASE_URL}/analytics/overview?collegeIds=${collegeA._id}&branch=ECE`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    const eceData = await eceRes.json();
    console.log('Branch ECE filter totalStudents:', eceData.totalStudents);
    if (eceData.totalStudents !== 'lt5') {
      throw new Error(`Expected 'lt5' for 2 ECE students in College A, got ${eceData.totalStudents}`);
    }

    console.log('✓ Universal filters (state, batchYear, branch, collegeIds) successfully filter datasets');

    // ------------------------------------------------------------------------
    // TEST 8: COLLEGE COMPARISON LIMIT & SIDE-BY-SIDE METRICS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: College Comparison Limit & Side-by-Side ---');

    // Missing parameter -> 400
    const missingRes = await fetch(`${BASE_URL}/analytics/compare`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    console.log('Missing colleges query status:', missingRes.status);
    if (missingRes.status !== 400) throw new Error('Expected 400 when colleges parameter is missing');

    // More than 3 colleges -> 400
    const dummyId1 = new mongoose.Types.ObjectId();
    const dummyId2 = new mongoose.Types.ObjectId();
    const dummyId3 = new mongoose.Types.ObjectId();
    const dummyId4 = new mongoose.Types.ObjectId();
    const overLimitRes = await fetch(
      `${BASE_URL}/analytics/compare?colleges=${dummyId1},${dummyId2},${dummyId3},${dummyId4}`,
      { headers: { Authorization: `Bearer ${analystToken}` } }
    );
    const overLimitData = await overLimitRes.json();
    console.log('Over-limit compare status:', overLimitRes.status, 'message:', overLimitData.message);
    if (overLimitRes.status !== 400 || !overLimitData.message.includes('maximum of 3')) {
      throw new Error('Expected 400 with "maximum of 3" message');
    }
    console.log('✓ Enforced limit: comparison with >3 colleges returns 400');

    // Valid comparison: 2 colleges
    const compareRes = await fetch(
      `${BASE_URL}/analytics/compare?colleges=${collegeA._id},${collegeB._id}`,
      { headers: { Authorization: `Bearer ${analystToken}` } }
    );
    const compareData = await compareRes.json();
    console.log('Compare status:', compareRes.status, 'colleges compared:', compareData.colleges?.length);
    if (compareRes.status !== 200 || compareData.colleges.length !== 2) {
      throw new Error('Valid comparison must return 200 with 2 colleges');
    }
    console.log('✓ Side-by-side comparison returned successfully for valid selection');

    // ------------------------------------------------------------------------
    // TEST 9: EXPORT EXCEL & PDF
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Analytics Export (Excel & PDF) ---');

    // Export Excel
    const excelRes = await fetch(`${BASE_URL}/analytics/export/excel`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    console.log('Excel export status:', excelRes.status, 'Content-Type:', excelRes.headers.get('content-type'));
    if (
      excelRes.status !== 200 ||
      !excelRes.headers.get('content-type')?.includes('spreadsheetml')
    ) {
      throw new Error('Excel export failed or invalid Content-Type');
    }
    const excelBuffer = await excelRes.arrayBuffer();
    if (excelBuffer.byteLength < 100) {
      throw new Error('Excel export file buffer too small');
    }
    console.log('✓ Excel export generated successfully (buffer size:', excelBuffer.byteLength, 'bytes)');

    // Export PDF
    const pdfRes = await fetch(`${BASE_URL}/analytics/export/pdf`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    console.log('PDF export status:', pdfRes.status, 'Content-Type:', pdfRes.headers.get('content-type'));
    if (pdfRes.status !== 200 || !pdfRes.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('PDF export failed or invalid Content-Type');
    }
    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfHeader = Buffer.from(pdfBuffer.slice(0, 4)).toString();
    if (pdfHeader !== '%PDF') {
      throw new Error(`Expected PDF to start with %PDF, got "${pdfHeader}"`);
    }
    console.log('✓ PDF export generated successfully with valid %PDF signature (buffer size:', pdfBuffer.byteLength, 'bytes)');

    console.log('\n======================================================');
    console.log('      ALL TASK 33A BACKEND TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    try {
      const testColleges = await College.find({ code: { $in: ['TEST_COL_A', 'TEST_COL_B', 'TEST_COL_C'] } });
      const testColIds = testColleges.map((c) => c._id);
      await Student.deleteMany({ college: { $in: testColIds } });
      await User.deleteMany({
        $or: [
          { email: { $regex: /@analyst-test\.com$/ } },
          { college: { $in: testColIds } },
        ],
      });
      await College.deleteMany({ _id: { $in: testColIds } });
      await Company.deleteMany({ name: { $in: ['Google Test Analytics', 'Amazon Test Analytics'] } });
    } catch (_) {}
    server.close();
    await mongoose.connection.close();
  }
}

runAnalystTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
