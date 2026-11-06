const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Offer,
  Application,
} = require('../models');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
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

async function runSuperadminTests() {
  console.log('Connecting to MongoDB Test Database...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));
  app.use('/api/superadmin', require('../routes/superadminRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5093;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('   TASK 33B: SUPERADMIN ROLE & PUBLIC PLACEMENTS TESTS ');
    console.log('======================================================\n');

    // Clean previous test users
    await User.deleteMany({ email: { $regex: /@superadmin-test\.com$/ } });
    await College.deleteMany({ code: { $regex: /^TEST_SA_/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^ENROLL_SA_/ } });

    // ------------------------------------------------------------------------
    // SETUP: Superadmin, TPO, Recruiter, Student, Analyst users
    // ------------------------------------------------------------------------
    const superadminUser = await User.create({
      name: 'Super Admin Test',
      email: 'sa@superadmin-test.com',
      password: 'Password123!',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });
    const superadminToken = createToken(superadminUser);

    const tpoUser = await User.create({
      name: 'TPO Test',
      email: 'tpo@superadmin-test.com',
      password: 'Password123!',
      role: 'tpo',
      isApproved: true,
      isEmailVerified: true,
    });
    const tpoToken = createToken(tpoUser);

    const recruiterUser = await User.create({
      name: 'Recruiter Test',
      email: 'recruiter@superadmin-test.com',
      password: 'Password123!',
      role: 'recruiter',
      isApproved: true,
      isEmailVerified: true,
    });
    const recruiterToken = createToken(recruiterUser);

    const analystUser = await User.create({
      name: 'Analyst Test',
      email: 'analyst@superadmin-test.com',
      password: 'Password123!',
      role: 'analyst',
      isApproved: true,
      isEmailVerified: true,
    });
    const analystToken = createToken(analystUser);

    // ------------------------------------------------------------------------
    // TEST 1: SUPERADMIN RBAC AUTHORIZATION CHECKS
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Superadmin Authorization RBAC (Only Superadmin allowed) ---');

    // TPO access -> 403
    const tpoRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    console.log('TPO access status:', tpoRes.status);
    if (tpoRes.status !== 403) throw new Error(`TPO should receive 403, got ${tpoRes.status}`);

    // Recruiter access -> 403
    const recruiterRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    console.log('Recruiter access status:', recruiterRes.status);
    if (recruiterRes.status !== 403) throw new Error(`Recruiter should receive 403, got ${recruiterRes.status}`);

    // Analyst access -> 403
    const analystRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    console.log('Analyst access status:', analystRes.status);
    if (analystRes.status !== 403) throw new Error(`Analyst should receive 403, got ${analystRes.status}`);

    // Superadmin access -> 200
    const saRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    console.log('Superadmin access status:', saRes.status);
    if (saRes.status !== 200) throw new Error(`Superadmin should receive 200, got ${saRes.status}`);

    console.log('✓ Authorization verified: Only superadmin can access /api/superadmin/*; everyone else gets 403');

    // ------------------------------------------------------------------------
    // TEST 2: NEW COLLEGE REGISTRATION (DEFAULT PENDING & TPO WAITING APPROVAL)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: New College Registration Default Status & TPO Login ---');

    // Register a new college via POST /api/auth/register-college
    const regCollegeRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collegeName: 'New Test Engineering College',
        collegeCode: 'TEST_SA_NEW',
        city: 'Ahmedabad',
        state: 'Gujarat',
        tpoName: 'TPO New College',
        tpoEmail: 'tpo.new@superadmin-test.com',
        tpoPassword: 'Password123!',
        tpoPhone: '9876543210',
      }),
    });
    const regCollegeData = await regCollegeRes.json();
    console.log('Register college status:', regCollegeRes.status, 'success:', regCollegeData.success);
    if (regCollegeRes.status !== 201) throw new Error('Failed to register new college');

    // Check college in DB has status: 'pending'
    const newCollege = await College.findOne({ code: 'TEST_SA_NEW' });
    if (!newCollege || newCollege.status !== 'pending') {
      throw new Error(`New college status should default to "pending", got "${newCollege?.status}"`);
    }
    console.log('✓ New college default status set to "pending"');

    // Verify email for this new TPO so we can test the college approval check on login
    const newTpoUser = await User.findOne({ email: 'tpo.new@superadmin-test.com' });
    newTpoUser.isEmailVerified = true;
    await newTpoUser.save();

    // New TPO tries to log in -> should see "Waiting for college approval" (403)
    const tpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tpo.new@superadmin-test.com',
        password: 'Password123!',
      }),
    });
    const tpoLoginData = await tpoLoginRes.json();
    console.log('New TPO login status:', tpoLoginRes.status, 'message:', tpoLoginData.message);
    if (tpoLoginRes.status !== 403 || !tpoLoginData.message.includes('Waiting for college approval')) {
      throw new Error(`Expected 403 "Waiting for college approval", got "${tpoLoginData.message}"`);
    }
    console.log('✓ New TPO sees "Waiting for college approval" on login');

    // ------------------------------------------------------------------------
    // TEST 3: SUPERADMIN APPROVES COLLEGE -> TPO CAN NOW LOG IN
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Superadmin Approves College ---');

    // Non-superadmin cannot approve college
    const unauthorizedApproveRes = await fetch(`${BASE_URL}/superadmin/colleges/${newCollege._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (unauthorizedApproveRes.status !== 403) {
      throw new Error('Non-superadmin must be blocked with 403 from approving college');
    }

    // Superadmin approves college
    const approveCollegeRes = await fetch(`${BASE_URL}/superadmin/colleges/${newCollege._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superadminToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    });
    const approveCollegeData = await approveCollegeRes.json();
    console.log('Superadmin approve college status:', approveCollegeRes.status, 'success:', approveCollegeData.success);
    if (approveCollegeRes.status !== 200 || approveCollegeData.college?.status !== 'approved') {
      throw new Error('Failed to approve college');
    }

    // Now TPO logs in -> should succeed with 200!
    const approvedTpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tpo.new@superadmin-test.com',
        password: 'Password123!',
      }),
    });
    const approvedTpoLoginData = await approvedTpoLoginRes.json();
    console.log('Approved TPO login status:', approvedTpoLoginRes.status, 'token received:', !!approvedTpoLoginData.token);
    if (approvedTpoLoginRes.status !== 200 || !approvedTpoLoginData.token) {
      throw new Error('Approved TPO should log in successfully with 200');
    }
    console.log('✓ Approved college allows TPO to log in successfully');

    // ------------------------------------------------------------------------
    // TEST 4: PENDING ANALYST APPROVAL WORKFLOW
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Superadmin Approves Pending Analyst ---');

    // Create a pending analyst
    const pendingAnalyst = await User.create({
      name: 'Dr. Pending Analyst',
      email: 'pending.analyst@superadmin-test.com',
      password: 'Password123!',
      role: 'analyst',
      organisation: 'Policy Commission',
      designation: 'Research Fellow',
      isApproved: false,
      isEmailVerified: true,
    });

    // Superadmin fetches pending analysts
    const pendingAnalystsRes = await fetch(`${BASE_URL}/superadmin/analysts?status=pending`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const pendingAnalystsData = await pendingAnalystsRes.json();
    const foundPending = pendingAnalystsData.analysts?.some((a) => a.email === 'pending.analyst@superadmin-test.com');
    if (!foundPending) throw new Error('Pending analyst not found in superadmin pending list');
    console.log('✓ Superadmin successfully lists pending analysts');

    // Superadmin approves analyst
    const approveAnalystRes = await fetch(`${BASE_URL}/superadmin/analysts/${pendingAnalyst._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superadminToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    });
    const approveAnalystData = await approveAnalystRes.json();
    console.log('Superadmin approve analyst status:', approveAnalystRes.status, 'isApproved:', approveAnalystData.analyst?.isApproved);
    if (approveAnalystRes.status !== 200 || !approveAnalystData.analyst?.isApproved) {
      throw new Error('Superadmin failed to approve analyst');
    }

    // Approved analyst logs in
    const analystLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pending.analyst@superadmin-test.com',
        password: 'Password123!',
      }),
    });
    if (analystLoginRes.status !== 200) {
      throw new Error('Approved analyst should be able to log in');
    }
    console.log('✓ Superadmin successfully approved analyst, who can now log in');

    // ------------------------------------------------------------------------
    // TEST 5: COMPANY VERIFY / UNVERIFY TOGGLE
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Company Verify / Unverify Toggle ---');

    let testCompany = await Company.findOne({ name: 'Superadmin Test Company' });
    if (!testCompany) {
      testCompany = await Company.create({
        name: 'Superadmin Test Company',
        industry: 'FinTech',
        verified: false,
      });
    }

    // Superadmin verifies company
    const verifyCompRes = await fetch(`${BASE_URL}/superadmin/companies/${testCompany._id}/verify`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superadminToken}`,
      },
      body: JSON.stringify({ verified: true }),
    });
    const verifyCompData = await verifyCompRes.json();
    console.log('Company verify status:', verifyCompRes.status, 'verified:', verifyCompData.company?.verified);
    if (verifyCompRes.status !== 200 || verifyCompData.company?.verified !== true) {
      throw new Error('Failed to verify company');
    }

    // Non-superadmin cannot verify company
    const unauthorizedVerifyRes = await fetch(`${BASE_URL}/superadmin/companies/${testCompany._id}/verify`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recruiterToken}`,
      },
      body: JSON.stringify({ verified: false }),
    });
    if (unauthorizedVerifyRes.status !== 403) {
      throw new Error('Non-superadmin must be blocked with 403 from verifying company');
    }
    console.log('✓ Company verification toggle verified with superadmin-only protection');

    // ------------------------------------------------------------------------
    // TEST 6: PLATFORM OVERVIEW TOTALS
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Platform Overview Totals ---');

    const overviewRes = await fetch(`${BASE_URL}/superadmin/overview`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const overviewData = await overviewRes.json();
    console.log('Overview totals:', overviewData.totals);
    if (
      typeof overviewData.totals?.colleges?.total !== 'number' ||
      typeof overviewData.totals?.students !== 'number' ||
      typeof overviewData.totals?.recruiters?.totalUsers !== 'number' ||
      typeof overviewData.totals?.drives !== 'number' ||
      typeof overviewData.totals?.placements !== 'number'
    ) {
      throw new Error('Overview response missing required platform total counters');
    }
    console.log('✓ Superadmin overview provides totals for colleges, students, recruiters, drives, placements');

    // ------------------------------------------------------------------------
    // TEST 7: PUBLIC PLACEMENTS ALL-COLLEGES API & PRIVACY
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Public Placements All-Colleges API (No Login Required) ---');

    // Fetch public colleges placements without authorization header
    const publicCollegesRes = await fetch(`${BASE_URL}/colleges/public/placements`);
    const publicCollegesData = await publicCollegesRes.json();
    console.log('Public placements status:', publicCollegesRes.status, 'count:', publicCollegesData.colleges?.length);
    if (publicCollegesRes.status !== 200 || !Array.isArray(publicCollegesData.colleges)) {
      throw new Error('Public placements API must return 200 and array of colleges without login');
    }

    // Verify all returned colleges have status approved and no unapproved college is leaked
    const hasUnapproved = publicCollegesData.colleges.some((c) => c.status && c.status !== 'approved');
    if (hasUnapproved) throw new Error('Unapproved college found in public placement listing');

    // Check college details by code
    const collegeCode = publicCollegesData.colleges[0]?.code;
    if (collegeCode) {
      const publicDetailRes = await fetch(`${BASE_URL}/colleges/public/placements/${collegeCode}`);
      const publicDetailData = await publicDetailRes.json();
      console.log('Public college detail status:', publicDetailRes.status, 'name:', publicDetailData.college?.name);
      if (publicDetailRes.status !== 200 || !publicDetailData.college) {
        throw new Error('Public single college details failed');
      }
      console.log('✓ Public single college details endpoint verified');
    }

    // Check public comparison endpoint (up to 3 colleges)
    const compareCodes = publicCollegesData.colleges.slice(0, 2).map((c) => c.code).join(',');
    const publicCompareRes = await fetch(`${BASE_URL}/colleges/public/compare?colleges=${compareCodes}`);
    const publicCompareData = await publicCompareRes.json();
    console.log('Public compare status:', publicCompareRes.status, 'colleges compared:', publicCompareData.colleges?.length);
    if (publicCompareRes.status !== 200 || publicCompareData.colleges?.length < 1) {
      throw new Error('Public comparison endpoint failed');
    }

    // Check > 3 comparison returns 400
    const overLimitCompareRes = await fetch(`${BASE_URL}/colleges/public/compare?colleges=C1,C2,C3,C4`);
    if (overLimitCompareRes.status !== 400) {
      throw new Error('Public comparison must enforce max 3 limit with 400');
    }
    console.log('✓ Public compare enforces max 3 limit and returns side-by-side metrics');

    // ------------------------------------------------------------------------
    // TEST 8: SUPERADMIN PENDING ACCOUNTS OVERRIDE & RBAC VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Superadmin Pending Accounts Override & RBAC ---');

    // Create an approved college that currently has 0 approved TPOs
    const zeroTpoCollege = await College.create({
      name: 'Zero Approved TPO Institute',
      code: 'TEST_SA_ZERO_TPO',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
      requireStudentApproval: true,
    });

    // Create 1st pending TPO (registered earlier)
    const pendingTpoUser1 = await User.create({
      name: 'First Pending TPO',
      email: 'first_pending_tpo@superadmin-test.com',
      password: 'Password123!',
      role: 'tpo',
      college: zeroTpoCollege._id,
      isApproved: false,
      isEmailVerified: true,
      createdAt: new Date(Date.now() - 10000),
    });

    // Create 2nd pending TPO (registered later)
    const pendingTpoUser2 = await User.create({
      name: 'Second Pending TPO',
      email: 'second_pending_tpo@superadmin-test.com',
      password: 'Password123!',
      role: 'tpo',
      college: zeroTpoCollege._id,
      isApproved: false,
      isEmailVerified: true,
      createdAt: new Date(Date.now() - 5000),
    });

    // Create a pending student under this college
    const pendingStudentUser = await User.create({
      name: 'Pending College Student',
      email: 'pending_student@superadmin-test.com',
      password: 'Password123!',
      role: 'student',
      college: zeroTpoCollege._id,
      isApproved: false,
      isEmailVerified: true,
    });
    await Student.create({
      user: pendingStudentUser._id,
      college: zeroTpoCollege._id,
      enrollmentNo: 'ENROLL_SA_001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      phone: '9876543210',
    });

    // 8.1 RBAC: Other roles receive 403 on /api/superadmin/pending-accounts
    const unauthorizedTpoGet = await fetch(`${BASE_URL}/superadmin/pending-accounts`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    if (unauthorizedTpoGet.status !== 403) {
      throw new Error(`Expected 403 for TPO accessing pending accounts, got ${unauthorizedTpoGet.status}`);
    }

    const unauthorizedRecruiterApprove = await fetch(`${BASE_URL}/superadmin/pending-accounts/${pendingTpoUser1._id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    if (unauthorizedRecruiterApprove.status !== 403) {
      throw new Error(`Expected 403 for Recruiter approving pending account, got ${unauthorizedRecruiterApprove.status}`);
    }
    console.log('✓ RBAC: Non-superadmins receive 403 when accessing or modifying pending accounts');

    // 8.2 Verify clear unapproved messages at login
    const tpoLoginAttempt = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingTpoUser1.email, password: 'Password123!' }),
    });
    const pendingTpoLoginData = await tpoLoginAttempt.json();
    console.log('Pending TPO login status:', tpoLoginAttempt.status, 'message:', pendingTpoLoginData.message);
    if (
      tpoLoginAttempt.status !== 403 ||
      !pendingTpoLoginData.message.includes('waiting for approval from an existing TPO') ||
      pendingTpoLoginData.collegeName !== zeroTpoCollege.name
    ) {
      throw new Error(`Pending TPO login message/collegeName failed: ${JSON.stringify(pendingTpoLoginData)}`);
    }

    const studentLoginAttempt = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingStudentUser.email, password: 'Password123!' }),
    });
    const studentLoginData = await studentLoginAttempt.json();
    console.log('Pending Student login status:', studentLoginAttempt.status, 'message:', studentLoginData.message);
    if (
      studentLoginAttempt.status !== 403 ||
      !studentLoginData.message.includes('waiting for approval by the Training & Placement Office') ||
      studentLoginData.collegeName !== zeroTpoCollege.name
    ) {
      throw new Error(`Pending Student login message/collegeName failed: ${JSON.stringify(studentLoginData)}`);
    }
    console.log('✓ Pending TPO and Student receive clear college-specific login messages and collegeName');

    // 8.3 Superadmin lists pending accounts & checks "No active TPO for this college" label
    const pendingListRes = await fetch(`${BASE_URL}/superadmin/pending-accounts`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const pendingListData = await pendingListRes.json();
    console.log('Pending accounts count:', pendingListData.count);
    if (pendingListRes.status !== 200 || !Array.isArray(pendingListData.accounts)) {
      throw new Error(`Failed to list pending accounts: ${JSON.stringify(pendingListData)}`);
    }

    const foundTpo1 = pendingListData.accounts.find((a) => a._id.toString() === pendingTpoUser1._id.toString());
    const foundTpo2 = pendingListData.accounts.find((a) => a._id.toString() === pendingTpoUser2._id.toString());
    const foundStudent = pendingListData.accounts.find((a) => a._id.toString() === pendingStudentUser._id.toString());

    if (!foundTpo1 || !foundTpo2 || !foundStudent) {
      throw new Error('Pending accounts list did not return newly created pending TPOs and student');
    }

    // Check Requirement 3: First pending TPO has "No active TPO for this college"
    console.log('TPO 1 noActiveTpo label:', foundTpo1.noActiveTpoLabel);
    console.log('TPO 2 noActiveTpo label:', foundTpo2.noActiveTpoLabel);
    if (
      foundTpo1.noActiveTpo !== true ||
      foundTpo1.noActiveTpoLabel !== 'No active TPO for this college'
    ) {
      throw new Error('First pending TPO of college with 0 active TPOs must have "No active TPO for this college" label');
    }
    if (foundTpo2.noActiveTpo === true) {
      throw new Error('Second pending TPO should NOT have "No active TPO for this college" label');
    }
    console.log('✓ First pending TPO of 0-active-TPO college labeled "No active TPO for this college"');

    // 8.4 Superadmin approves pending TPO across college
    const approveTpoRes = await fetch(`${BASE_URL}/superadmin/pending-accounts/${pendingTpoUser1._id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const approveTpoData = await approveTpoRes.json();
    console.log('Superadmin approve TPO status:', approveTpoRes.status, 'success:', approveTpoData.success);
    if (approveTpoRes.status !== 200 || !approveTpoData.success) {
      throw new Error(`Superadmin approve TPO failed: ${JSON.stringify(approveTpoData)}`);
    }

    // 8.5 Superadmin approves pending Student across college
    const approveStudentRes = await fetch(`${BASE_URL}/superadmin/pending-accounts/${pendingStudentUser._id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    const approveStudentData = await approveStudentRes.json();
    console.log('Superadmin approve Student status:', approveStudentRes.status, 'success:', approveStudentData.success);
    if (approveStudentRes.status !== 200 || !approveStudentData.success) {
      throw new Error(`Superadmin approve Student failed: ${JSON.stringify(approveStudentData)}`);
    }
    console.log('✓ Superadmin successfully approved pending TPO and pending Student');

    // 8.6 Approved users can now log in
    const approvedTpoLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingTpoUser1.email, password: 'Password123!' }),
    });
    const approvedTpoData = await approvedTpoLogin.json();
    console.log('Approved TPO login status:', approvedTpoLogin.status, 'token received:', !!approvedTpoData.token);
    if (approvedTpoLogin.status !== 200 || !approvedTpoData.token) {
      throw new Error(`Approved TPO could not log in: ${JSON.stringify(approvedTpoData)}`);
    }

    const approvedStudentLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingStudentUser.email, password: 'Password123!' }),
    });
    const approvedStudentData = await approvedStudentLogin.json();
    console.log('Approved Student login status:', approvedStudentLogin.status, 'token received:', !!approvedStudentData.token);
    if (approvedStudentLogin.status !== 200 || !approvedStudentData.token) {
      throw new Error(`Approved Student could not log in: ${JSON.stringify(approvedStudentData)}`);
    }
    console.log('✓ Approved TPO and approved Student can successfully log in and receive token');

    // 8.7 Superadmin rejects 2nd pending TPO
    const rejectTpoRes = await fetch(`${BASE_URL}/superadmin/pending-accounts/${pendingTpoUser2._id}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    if (rejectTpoRes.status !== 200) {
      throw new Error(`Superadmin reject TPO failed: got ${rejectTpoRes.status}`);
    }
    const tpo2InDb = await User.findById(pendingTpoUser2._id);
    if (tpo2InDb) throw new Error('Rejected TPO should be deleted from DB');
    console.log('✓ Superadmin successfully rejected and removed pending account');

    console.log('\n======================================================');
    console.log('      ALL TASK 33B BACKEND TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    try {
      await User.deleteMany({ email: { $regex: /@superadmin-test\.com$/ } });
      await College.deleteMany({ code: { $regex: /^TEST_SA_/ } });
      await Student.deleteMany({ enrollmentNo: { $regex: /^ENROLL_SA_/ } });
    } catch (_) {}
    server.close();
    await mongoose.connection.close();
  }
}

runSuperadminTests().catch((err) => {
  console.error('\n❌ SUPERADMIN TEST RUN FAILED:', err);
  process.exit(1);
});

