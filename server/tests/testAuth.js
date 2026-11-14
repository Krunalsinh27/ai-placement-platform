const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test'; // Disables IP rate-limiting so automated tests can run without delay
process.env.EMAIL_MODE = 'console';

const { User, Student, College, Company } = require('../models');

function getTestDbUri() {
  if (process.env.MONGO_URI_TEST) return process.env.MONGO_URI_TEST;
  const base = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  if (base.includes('?')) {
    const [dbPart, query] = base.split('?');
    return `${dbPart.replace(/_test$/, '')}_test?${query}`;
  }
  return `${base.replace(/_test$/, '')}_test`;
}

async function runAuthTests() {
  console.log('Connecting to MongoDB Test Database...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/tpo', require('../routes/tpoRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));

  const PORT = 5097;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('    TASK 28: AUTHENTICATION & LOGIN SECURITY TESTS     ');
    console.log('======================================================\n');

    // Clean up test data from any previous test run
    const testEmails = [
      'auth_test_student@testcollege.edu',
      'auth_test_recruiter@corp.com',
      'auth_test_approval_student@testcollege.edu',
      'auth_test_reject_student@testcollege.edu',
      'strict_tpo@testcollege.edu',
    ];
    await Student.deleteMany({ enrollmentNo: { $regex: /^TESTAUTH/ } });
    await User.deleteMany({ email: { $in: testEmails } });
    await College.deleteMany({ code: 'AUTH_TEST_COLLEGE' });

    // Ensure a default college exists for student registration
    let defaultCollege = await College.findOne({ code: 'NITD' });
    if (!defaultCollege) {
      defaultCollege = await College.create({
        name: 'National Institute of Technology Delhi',
        code: 'NITD',
        city: 'New Delhi',
        state: 'Delhi',
        status: 'approved',
        requireStudentApproval: false,
      });
    } else {
      defaultCollege.status = 'approved';
      await defaultCollege.save();
    }

    // Ensure default TPO exists for test runner
    let tpoUser = await User.findOne({ email: 'admin@college.com' });
    if (!tpoUser) {
      tpoUser = await User.create({
        name: 'TPO Administrator',
        email: 'admin@college.com',
        password: 'Falcon#2026!Secured',
        role: 'tpo',
        college: defaultCollege._id,
        isApproved: true,
        isEmailVerified: true,
      });
    } else {
      tpoUser.password = 'Falcon#2026!Secured';
      tpoUser.failedLoginAttempts = 0;
      tpoUser.lockUntil = null;
      await tpoUser.save();
    }

    // Authenticate existing TPO (admin@college.com) for TPO approval tests
    const tpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@college.com', password: 'Falcon#2026!Secured' }),
    });
    const tpoLoginData = await tpoLoginRes.json();
    console.log('TPO login response:', tpoLoginRes.status, tpoLoginData);
    const tpoToken = tpoLoginData.token;
    if (!tpoToken) throw new Error('Existing TPO login failed for test runner');

    // -------------------------------------------------------------------
    // 1. Password Policy Validation on Registration
    // -------------------------------------------------------------------
    console.log('--- 1. Testing Password Policy Validation (min 10 chars, not common, no name/email) ---');
    const weakPassRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Weak Pass Student',
        email: 'weakpass@test.com',
        password: 'short', // less than 10 chars
        college: defaultCollege._id,
        enrollmentNo: 'TESTAUTH000',
        branch: 'CSE',
        batchYear: 2026,
        cgpa: 8.5,
        phone: '9876543210',
      }),
    });
    const weakPassData = await weakPassRes.json();
    if (weakPassRes.status !== 400 || !weakPassData.message?.includes('10 characters')) {
      throw new Error(`Expected weak password rejection, got ${weakPassRes.status}: ${JSON.stringify(weakPassData)}`);
    }
    console.log('✓ Rejected password under 10 characters');

    const commonPassRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Common Pass Student',
        email: 'commonpass@test.com',
        password: 'password123', // common password
        college: defaultCollege._id,
        enrollmentNo: 'TESTAUTH000A',
        branch: 'CSE',
        batchYear: 2026,
        cgpa: 8.5,
        phone: '9876543210',
      }),
    });
    const commonPassData = await commonPassRes.json();
    if (commonPassRes.status !== 400 || !commonPassData.message?.includes('common')) {
      throw new Error(`Expected common password rejection, got ${commonPassRes.status}: ${JSON.stringify(commonPassData)}`);
    }
    console.log('✓ Rejected common password');

    const namePassRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rohan Sharma',
        email: 'unique_candidate_email@test.com',
        password: 'Secure#2026!RohanPass', // contains name token "rohan"
        college: defaultCollege._id,
        enrollmentNo: 'TESTAUTH000B',
        branch: 'CSE',
        batchYear: 2026,
        cgpa: 8.5,
        phone: '9876543210',
      }),
    });
    const namePassData = await namePassRes.json();
    if (namePassRes.status !== 400 || !namePassData.message?.includes('name')) {
      throw new Error(`Expected name in password rejection, got ${namePassRes.status}: ${JSON.stringify(namePassData)}`);
    }
    console.log('✓ Rejected password containing user name');

    // -------------------------------------------------------------------
    // 2. Registration Returns No Token & Dispatches OTP
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Registration Without Auto-Login (No JWT Returned) ---');
    const studentEmail = 'auth_test_student@testcollege.edu';
    const studentPassword = 'Quantum#2026!Alpha';

    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aarav Auth Test',
        email: studentEmail,
        password: studentPassword,
        college: defaultCollege._id,
        enrollmentNo: 'TESTAUTH001',
        branch: 'CSE',
        batchYear: 2026,
        cgpa: 8.2,
        phone: '9876543211',
      }),
    });
    const regData = await regRes.json();
    if (regRes.status !== 201 || !regData.success) {
      throw new Error(`Student registration failed: ${JSON.stringify(regData)}`);
    }
    if (regData.token !== undefined) {
      throw new Error('Registration endpoint must NOT return a JWT token or log user in');
    }
    if (regData.email !== studentEmail) {
      throw new Error('Registration should return user email');
    }
    console.log('✓ Student registered with 201 status and NO JWT token returned');

    const createdUser = await User.findOne({ email: studentEmail });
    if (!createdUser || createdUser.isEmailVerified !== false) {
      throw new Error('Registered user must start with isEmailVerified: false');
    }
    if (!createdUser.otpHash || createdUser.otpPurpose !== 'verify_email') {
      throw new Error('Registered user must have hashed OTP with purpose verify_email');
    }
    console.log('✓ Database record confirmed: isEmailVerified=false, otpHash stored');

    // -------------------------------------------------------------------
    // 3. Unverified Login is Rejected
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Unverified User Login Rejection ---');
    const unverifiedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: studentPassword }),
    });
    const unverifiedLoginData = await unverifiedLoginRes.json();
    if (unverifiedLoginRes.status !== 403 || !unverifiedLoginData.unverified) {
      throw new Error(`Expected 403 unverified rejection, got ${unverifiedLoginRes.status}: ${JSON.stringify(unverifiedLoginData)}`);
    }
    console.log('✓ Unverified login rejected with status 403 and unverified flag');

    // -------------------------------------------------------------------
    // 4. OTP Verification: Wrong Attempts, Max Limit & Expiry
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing OTP Attempts, Invalidation & Expiry ---');
    // Wrong OTP 1-4
    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrongOtpRes = await fetch(`${BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail, otp: '000000' }),
      });
      const wrongOtpData = await wrongOtpRes.json();
      if (wrongOtpRes.status !== 400 || !wrongOtpData.message?.includes('remaining')) {
        throw new Error(`Expected wrong OTP error on attempt ${attempt}, got: ${JSON.stringify(wrongOtpData)}`);
      }
    }
    console.log('✓ Wrong OTP attempts tracked (4 wrong attempts)');

    // 5th wrong attempt should invalidate code
    const fifthWrongRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, otp: '000000' }),
    });
    const fifthWrongData = await fifthWrongRes.json();
    if (fifthWrongRes.status !== 400 || !fifthWrongData.message?.includes('invalidated')) {
      throw new Error(`Expected OTP invalidation on 5th attempt, got: ${JSON.stringify(fifthWrongData)}`);
    }
    console.log('✓ 5th wrong attempt invalidated the verification code');

    // Check DB that otpHash is cleared
    const invalidatedUser = await User.findOne({ email: studentEmail });
    if (invalidatedUser.otpHash !== null) {
      throw new Error('User otpHash should be cleared after 5 failed attempts');
    }
    console.log('✓ OTP cleared in database after invalidation');

    // Test Expired OTP check
    const expiredOtp = '654321';
    invalidatedUser.otpHash = await bcrypt.hash(expiredOtp, 10);
    invalidatedUser.otpExpiresAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    invalidatedUser.otpPurpose = 'verify_email';
    invalidatedUser.otpAttempts = 0;
    await invalidatedUser.save();

    const expiredRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, otp: expiredOtp }),
    });
    const expiredData = await expiredRes.json();
    if (expiredRes.status !== 400 || !expiredData.message?.includes('expired')) {
      throw new Error(`Expected expired OTP rejection, got ${expiredRes.status}: ${JSON.stringify(expiredData)}`);
    }
    console.log('✓ Expired OTP correctly rejected with clear error message');

    // -------------------------------------------------------------------
    // 5. Resend OTP & 60-second Cooldown
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing Resend OTP & 60-Second Cooldown ---');
    // Clear lastOtpSentAt so resend is allowed
    await User.updateOne({ email: studentEmail }, { $set: { lastOtpSentAt: null } });

    const resendRes1 = await fetch(`${BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail }),
    });
    const resendData1 = await resendRes1.json();
    if (resendRes1.status !== 200 || !resendData1.success) {
      throw new Error(`Resend OTP failed: ${JSON.stringify(resendData1)}`);
    }
    console.log('✓ First resend request succeeded');

    // Immediate second resend should hit 60-second cooldown (HTTP 429)
    const resendRes2 = await fetch(`${BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail }),
    });
    const resendData2 = await resendRes2.json();
    if (resendRes2.status !== 429 || !resendData2.message?.includes('seconds')) {
      throw new Error(`Expected 429 cooldown error, got ${resendRes2.status}: ${JSON.stringify(resendData2)}`);
    }
    console.log('✓ Immediate resend blocked by 60s cooldown (HTTP 429)');

    // Privacy test: Non-existent email should still return 200
    const ghostResend = await fetch(`${BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost.nobody@gmail.com' }),
    });
    const ghostData = await ghostResend.json();
    if (ghostResend.status !== 200 || !ghostData.success) {
      throw new Error('Resend OTP should never reveal whether email exists');
    }
    console.log('✓ Privacy protected: Resend returns generic success for unknown email');

    // -------------------------------------------------------------------
    // 6. Successful Email Verification & Login
    // -------------------------------------------------------------------
    console.log('\n--- 6. Testing Successful Email Verification & Login ---');
    // Generate known valid OTP
    const validOtp = '123456';
    const validHash = await bcrypt.hash(validOtp, 10);
    await User.updateOne(
      { email: studentEmail },
      {
        $set: {
          otpHash: validHash,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpPurpose: 'verify_email',
          otpAttempts: 0,
        },
      }
    );

    const verifySuccessRes = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, otp: validOtp }),
    });
    const verifySuccessData = await verifySuccessRes.json();
    if (verifySuccessRes.status !== 200 || !verifySuccessData.success) {
      throw new Error(`Email verification failed: ${JSON.stringify(verifySuccessData)}`);
    }
    console.log('✓ Email verified successfully with valid OTP');

    const verifiedUser = await User.findOne({ email: studentEmail });
    if (verifiedUser.isEmailVerified !== true || verifiedUser.otpHash !== null) {
      throw new Error('User isEmailVerified must be true and OTP fields cleared');
    }
    console.log('✓ Database state verified: isEmailVerified=true, otpHash=null');

    // Now login must succeed!
    const verifiedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: studentPassword }),
    });
    const verifiedLoginData = await verifiedLoginRes.json();
    if (verifiedLoginRes.status !== 200 || !verifiedLoginData.token) {
      throw new Error(`Login after verification failed: ${JSON.stringify(verifiedLoginData)}`);
    }
    console.log('✓ Login succeeded after email verification! Received JWT token');

    // -------------------------------------------------------------------
    // 7. Account Lockout After 5 Wrong Passwords (15 Minutes)
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing Account Lockout (5 Wrong Passwords -> 15 min lock) ---');
    for (let wrongPass = 1; wrongPass <= 4; wrongPass++) {
      const failRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail, password: 'WrongPassword@999' }),
      });
      const failData = await failRes.json();
      if (failRes.status !== 401 || !failData.message?.includes('remaining')) {
        throw new Error(`Expected 401 on failed attempt ${wrongPass}, got ${failRes.status}`);
      }
    }
    console.log('✓ 4 wrong passwords logged with remaining attempts warning');

    // 5th wrong password triggers account lockout (HTTP 423)
    const lockRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: 'WrongPassword@999' }),
    });
    const lockData = await lockRes.json();
    if (lockRes.status !== 423 || !lockData.message?.includes('Account locked for 15 minutes')) {
      throw new Error(`Expected 423 lockout, got ${lockRes.status}: ${JSON.stringify(lockData)}`);
    }
    console.log('✓ 5th wrong password triggered 15-minute account lockout (HTTP 423)');

    // Even with CORRECT password, account remains locked
    const lockedAttemptRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: studentPassword }),
    });
    const lockedAttemptData = await lockedAttemptRes.json();
    if (lockedAttemptRes.status !== 423 || !lockedAttemptData.message?.includes('locked')) {
      throw new Error('Account should remain locked even with correct password');
    }
    console.log('✓ Locked account blocks correct password attempts until timer expires');

    // Unlock account
    await User.updateOne({ email: studentEmail }, { $set: { lockUntil: null, failedLoginAttempts: 0 } });
    console.log('✓ Account unlocked for next tests');

    // -------------------------------------------------------------------
    // 8. Forgot Password & Reset Password Flow
    // -------------------------------------------------------------------
    console.log('\n--- 8. Testing Forgot & Reset Password Flow ---');
    // Clear cooldown for forgot password test
    await User.updateOne({ email: studentEmail }, { $set: { lastOtpSentAt: null } });

    const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail }),
    });
    const forgotData = await forgotRes.json();
    if (forgotRes.status !== 200 || !forgotData.success) {
      throw new Error(`Forgot password request failed: ${JSON.stringify(forgotData)}`);
    }
    console.log('✓ Forgot password request succeeded');

    // Privacy test: Non-existent email returns 200
    const ghostForgot = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody.registered@test.com' }),
    });
    const ghostForgotData = await ghostForgot.json();
    if (ghostForgot.status !== 200 || !ghostForgotData.success) {
      throw new Error('Forgot password must never reveal if email exists');
    }
    console.log('✓ Privacy protected: Forgot password returns generic success for unknown email');

    // Reset password with known OTP
    const resetOtp = '654987';
    const resetHash = await bcrypt.hash(resetOtp, 10);
    await User.updateOne(
      { email: studentEmail },
      {
        $set: {
          otpHash: resetHash,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpPurpose: 'reset_password',
          otpAttempts: 0,
        },
      }
    );

    const newStudentPassword = 'BrandNew#2026!Beta';
    const resetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: studentEmail,
        otp: resetOtp,
        newPassword: newStudentPassword,
      }),
    });
    const resetData = await resetRes.json();
    if (resetRes.status !== 200 || !resetData.success) {
      throw new Error(`Password reset failed: ${JSON.stringify(resetData)}`);
    }
    console.log('✓ Password reset succeeded with valid OTP and strong password');

    // Verify old password no longer works
    const oldPassLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: studentPassword }),
    });
    if (oldPassLoginRes.status === 200) {
      throw new Error('Old password must NOT work after password reset');
    }
    console.log('✓ Verified: Old password rejected');

    // Verify new password works
    const newPassLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: newStudentPassword }),
    });
    const newPassLoginData = await newPassLoginRes.json();
    if (newPassLoginRes.status !== 200 || !newPassLoginData.token) {
      throw new Error(`Login with new password failed: ${JSON.stringify(newPassLoginData)}`);
    }
    console.log('✓ Verified: Login successful with new password');

    // -------------------------------------------------------------------
    // 9. Student Approval Flow When requireStudentApproval is True
    // -------------------------------------------------------------------
    console.log('\n--- 9. Testing Student Approval Workflow (requireStudentApproval: true) ---');
    // Create dedicated college with requireStudentApproval: true
    const approvalCollege = await College.create({
      name: 'Strict Verification University',
      code: 'AUTH_TEST_COLLEGE',
      city: 'Delhi',
      state: 'Delhi',
      status: 'approved',
      requireStudentApproval: true,
    });

    // Create and approve a TPO for this college
    const collegeTpo = await User.create({
      name: 'Strict College TPO',
      email: 'strict_tpo@testcollege.edu',
      password: 'Falcon#2026!Secured',
      role: 'tpo',
      college: approvalCollege._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const strictTpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'strict_tpo@testcollege.edu', password: 'Falcon#2026!Secured' }),
    });
    const strictTpoLoginData = await strictTpoLoginRes.json();
    const strictTpoToken = strictTpoLoginData.token;

    // Register student under this strict college
    const approvalStudentEmail = 'auth_test_approval_student@testcollege.edu';
    const approvalStudentPassword = 'Quantum#2026!Gamma';
    const approvalRegRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pending Approval Candidate',
        email: approvalStudentEmail,
        password: approvalStudentPassword,
        college: approvalCollege._id,
        enrollmentNo: 'TESTAUTH002',
        branch: 'IT',
        batchYear: 2026,
        cgpa: 9.0,
        phone: '9876543212',
      }),
    });
    const approvalRegData = await approvalRegRes.json();
    if (approvalRegRes.status !== 201) {
      throw new Error(`Registration under approval college failed: ${JSON.stringify(approvalRegData)}`);
    }
    console.log('✓ Registered student under college with requireStudentApproval: true');

    // Student verifies email
    const studentUser = await User.findOne({ email: approvalStudentEmail });
    studentUser.isEmailVerified = true;
    await studentUser.save();

    // Student tries to log in -> should be rejected with "Waiting for TPO approval"
    const pendingStudentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: approvalStudentEmail, password: approvalStudentPassword }),
    });
    const pendingStudentLoginData = await pendingStudentLoginRes.json();
    if (
      pendingStudentLoginRes.status !== 403 ||
      (!pendingStudentLoginData.message.includes('waiting for approval by the Training & Placement Office') &&
       pendingStudentLoginData.message !== 'Waiting for TPO approval')
    ) {
      throw new Error(`Expected "Waiting for TPO approval" error, got ${pendingStudentLoginRes.status}: ${JSON.stringify(pendingStudentLoginData)}`);
    }
    console.log('✓ Verified: Unapproved student blocked with clear college approval message:', pendingStudentLoginData.message);

    // TPO checks GET /api/tpo/pending-students
    const pendingStudentsRes = await fetch(`${BASE_URL}/tpo/pending-students`, {
      headers: { Authorization: `Bearer ${strictTpoToken}` },
    });
    const pendingStudentsData = await pendingStudentsRes.json();
    if (pendingStudentsRes.status !== 200 || pendingStudentsData.count < 1) {
      throw new Error(`Expected at least 1 pending student, got: ${JSON.stringify(pendingStudentsData)}`);
    }
    const foundPendingStudent = pendingStudentsData.pendingStudents.find(
      (s) => s.user?.email === approvalStudentEmail
    );
    if (!foundPendingStudent) {
      throw new Error('Newly registered student not found in pending-students list');
    }
    console.log('✓ Verified: Pending student visible on TPO GET /api/tpo/pending-students');

    // Cross-college TPO cannot approve
    const crossApproveRes = await fetch(`${BASE_URL}/tpo/students/${foundPendingStudent._id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` }, // NITD TPO
    });
    if (crossApproveRes.status !== 403) {
      throw new Error(`Expected 403 for cross-college student approval, got ${crossApproveRes.status}`);
    }
    console.log('✓ Verified: Cross-college student approval blocked (HTTP 403)');

    // Own college TPO approves student
    const approveRes = await fetch(`${BASE_URL}/tpo/students/${foundPendingStudent._id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${strictTpoToken}` },
    });
    const approveData = await approveRes.json();
    if (approveRes.status !== 200 || !approveData.success) {
      throw new Error(`Approval failed: ${JSON.stringify(approveData)}`);
    }
    console.log('✓ Verified: TPO approved student registration successfully');

    // Student can now log in successfully!
    const approvedStudentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: approvalStudentEmail, password: approvalStudentPassword }),
    });
    const approvedStudentLoginData = await approvedStudentLoginRes.json();
    if (approvedStudentLoginRes.status !== 200 || !approvedStudentLoginData.token) {
      throw new Error(`Student login after TPO approval failed: ${JSON.stringify(approvedStudentLoginData)}`);
    }
    console.log('✓ Verified: Student logged in successfully after TPO approval');

    // Test Student Rejection flow
    const rejectStudentEmail = 'auth_test_reject_student@testcollege.edu';
    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Reject Candidate',
        email: rejectStudentEmail,
        password: 'Krypton#2026!Valid',
        college: approvalCollege._id,
        enrollmentNo: 'TESTAUTH003',
        branch: 'ME',
        batchYear: 2026,
        cgpa: 7.0,
        phone: '9876543213',
      }),
    });
    const rejectTargetStudent = await Student.findOne({ enrollmentNo: 'TESTAUTH003' });
    const rejectRes = await fetch(`${BASE_URL}/tpo/students/${rejectTargetStudent._id}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${strictTpoToken}` },
    });
    const rejectData = await rejectRes.json();
    if (rejectRes.status !== 200 || !rejectData.success) {
      throw new Error(`Student rejection failed: ${JSON.stringify(rejectData)}`);
    }
    const deletedStudent = await Student.findOne({ enrollmentNo: 'TESTAUTH003' });
    const deletedUser = await User.findOne({ email: rejectStudentEmail });
    if (deletedStudent !== null || deletedUser !== null) {
      throw new Error('Student and user records should be permanently deleted on rejection');
    }
    console.log('✓ Verified: Student account and profile permanently deleted on TPO rejection');

    // Clean up test records
    await Student.deleteMany({ enrollmentNo: { $regex: /^TESTAUTH/ } });
    await User.deleteMany({ email: { $in: [...testEmails, 'strict_tpo@testcollege.edu'] } });
    await College.deleteOne({ _id: approvalCollege._id });

    console.log('\n======================================================');
    console.log('      ALL TASK 28 AUTH TESTS PASSED SUCCESSFULLY!     ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ TEST FAILURE:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Database disconnected, test server closed.');
    process.exit(process.exitCode || 0);
  }
}

runAuthTests();

