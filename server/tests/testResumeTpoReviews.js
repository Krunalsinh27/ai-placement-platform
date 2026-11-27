/**
 * Resume Studio Phase 11: TPO & Admin Resume Reviews & Feedback Tests
 *
 * Verifies:
 * 1. TPO/admin of same college can list students' resumes (paginated & searchable)
 * 2. TPO/admin of same college can view a student resume read-only
 * 3. TPO/admin can see which version each applicant submitted to which drive
 * 4. TPO/admin can create a ResumeReview feedback record (comment, status)
 * 5. TPO of a DIFFERENT college is strictly DENIED (403 Forbidden)
 * 6. Student CAN see feedback on their own resume
 * 7. Student is strictly DENIED (403) from reading feedback on other students' resumes
 * 8. Student is strictly DENIED (403) from accessing /api/resume-studio/tpo/* endpoints
 * 9. Recruiter is strictly DENIED (403) from accessing /api/resume-studio/tpo/* and review endpoints
 * 10. Zod validation enforces required non-empty comment and valid review status enum
 */

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const {
  User,
  Student,
  Company,
  Drive,
  College,
  Application,
  Resume,
  ResumeVersion,
  ResumeReview,
  Notification,
} = require('../models');

const resumeStudioRoutes = require('../routes/resumeStudioRoutes');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_dev_mode_only_change_in_production';

let server;
let baseUrl;
let testsPassed = 0;
let testsFailed = 0;

function createToken(userId, role, collegeId = null, companyId = null) {
  return jwt.sign(
    {
      id: userId,
      role,
      college: collegeId,
      company: companyId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ ${name} FAILED:`);
    console.error(err);
    testsFailed++;
  }
}

async function runTpoReviewTests() {
  console.log('\n======================================================================');
  console.log('TEST SUITE: RESUME STUDIO PHASE 11 - TPO REVIEWS & ISOLATION');
  console.log('======================================================================');

  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);

  const app = express();
  app.use(express.json());
  app.use('/api/resume-studio', resumeStudioRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
    });
  });

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api/resume-studio`;

  // Fixtures
  let collegeA, collegeB;
  let userStudentA, studentA, tokenStudentA;
  let userStudentB, studentB, tokenStudentB;
  let userTpoA, tokenTpoA;
  let userTpoB, tokenTpoB;
  let userRecruiter, company, tokenRecruiter;
  let drive1;
  let resumeA, versionA1, versionA2;
  let resumeB;

  try {
    // Clean test leftovers
    await ResumeReview.deleteMany({});
    await Application.deleteMany({});
    await Drive.deleteMany({ role: { $regex: /Phase11/ } });
    await Resume.deleteMany({ title: { $regex: /Phase11/ } });
    await ResumeVersion.deleteMany({ name: { $regex: /Phase11/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^P11/ } });
    await User.deleteMany({ email: { $regex: /phase11/ } });
    await Company.deleteMany({ name: { $regex: /Phase11/ } });
    await College.deleteMany({ code: { $regex: /^P11/ } });

    // 1. Setup Colleges (Approved)
    collegeA = await College.create({
      name: 'Phase11 Alpha Institute',
      code: 'P11A',
      city: 'Delhi',
      state: 'Delhi',
      status: 'approved',
    });
    collegeB = await College.create({
      name: 'Phase11 Beta University',
      code: 'P11B',
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
    });

    // 2. Setup Students
    userStudentA = await User.create({
      name: 'Alice Phase11',
      email: 'alice.phase11@test.com',
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isVerified: true,
    });
    studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'P11A001',
      branch: 'Computer Science',
      batchYear: 2026,
      phone: '9876543210',
      cgpa: 9.2,
      backlogs: 0,
      skills: ['React', 'Node.js'],
    });
    tokenStudentA = createToken(userStudentA._id, 'student', collegeA._id);

    userStudentB = await User.create({
      name: 'Bob Phase11',
      email: 'bob.phase11@test.com',
      password: 'Password123!',
      role: 'student',
      college: collegeB._id,
      isVerified: true,
    });
    studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'P11B001',
      branch: 'Information Technology',
      batchYear: 2026,
      phone: '9876543211',
      cgpa: 8.7,
      backlogs: 0,
      skills: ['Python', 'Django'],
    });
    tokenStudentB = createToken(userStudentB._id, 'student', collegeB._id);

    // 3. Setup TPOs
    userTpoA = await User.create({
      name: 'TPO College A Phase11',
      email: 'tpo.a.phase11@test.com',
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isVerified: true,
    });
    tokenTpoA = createToken(userTpoA._id, 'tpo', collegeA._id);

    userTpoB = await User.create({
      name: 'TPO College B Phase11',
      email: 'tpo.b.phase11@test.com',
      password: 'Password123!',
      role: 'tpo',
      college: collegeB._id,
      isVerified: true,
    });
    tokenTpoB = createToken(userTpoB._id, 'tpo', collegeB._id);

    // 4. Setup Recruiter & Company
    company = await Company.create({
      name: 'Phase11 Global Systems',
      industry: 'Software',
    });
    userRecruiter = await User.create({
      name: 'Recruiter Phase11',
      email: 'recruiter.phase11@test.com',
      password: 'Password123!',
      role: 'recruiter',
      company: company._id,
      isVerified: true,
    });
    tokenRecruiter = createToken(userRecruiter._id, 'recruiter', null, company._id);

    // 5. Setup Drive
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    drive1 = await Drive.create({
      company: company._id,
      role: 'Phase11 Systems Architect',
      packageLpa: 20,
      location: 'Hyderabad',
      driveDate: tomorrow,
      lastDateToApply: tomorrow,
      minCgpa: 7.5,
      maxBacklogs: 0,
      allowedBranches: ['Computer Science'],
      colleges: [collegeA._id],
      status: 'open',
    });

    // 6. Setup Student Resumes & Versions
    resumeA = await Resume.create({
      student: studentA._id,
      college: collegeA._id,
      title: 'Phase11 Alice Cloud Resume',
      templateId: 'software-engineer',
      isPrimary: true,
      data: {
        contact: { fullName: 'Alice Phase11', email: 'alice.phase11@test.com' },
        summary: 'Cloud specialist experienced in distributed backends.',
      },
    });

    versionA1 = await ResumeVersion.create({
      student: studentA._id,
      college: collegeA._id,
      resume: resumeA._id,
      name: 'Phase11 Version 1',
      templateId: 'software-engineer',
      submitted: false,
      resumeData: resumeA.data,
    });

    versionA2 = await ResumeVersion.create({
      student: studentA._id,
      college: collegeA._id,
      resume: resumeA._id,
      name: 'Phase11 Submitted Version 2',
      templateId: 'software-engineer',
      submitted: true,
      targetDrive: drive1._id,
      resumeData: resumeA.data,
    });

    // Alice submitted application to drive1 using versionA2
    await Application.create({
      student: studentA._id,
      drive: drive1._id,
      status: 'applied',
      appliedOn: new Date(),
      resumeVersion: versionA2._id,
      resumeSnapshot: {
        resumeId: resumeA._id,
        versionId: versionA2._id,
        contentHash: 'hash-p11-snapshot',
        data: resumeA.data,
        templateId: 'software-engineer',
        createdAt: new Date(),
      },
    });

    resumeB = await Resume.create({
      student: studentB._id,
      college: collegeB._id,
      title: 'Phase11 Bob Python Resume',
      templateId: 'classic',
      isPrimary: true,
      data: {
        contact: { fullName: 'Bob Phase11', email: 'bob.phase11@test.com' },
      },
    });

    // ========================================================================
    // TEST 1: TPO of same college can list student resumes
    // ========================================================================
    await test('TPO of same college can list student resumes with pagination and search', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes?page=1&limit=10&search=Alice`, {
        headers: { Authorization: `Bearer ${tokenTpoA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.resumes));
      assert.strictEqual(data.resumes.length, 1);
      assert.strictEqual(data.resumes[0].title, 'Phase11 Alice Cloud Resume');
      assert.strictEqual(data.resumes[0].student.user.name, 'Alice Phase11');
      assert.strictEqual(data.resumes[0].submissionCount, 1);
    });

    // ========================================================================
    // TEST 2: TPO of another college is strictly DENIED from listing / seeing resumes
    // ========================================================================
    await test('TPO of College B cannot see College A resumes in their list', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes?search=Alice`, {
        headers: { Authorization: `Bearer ${tokenTpoB}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      // Alice is in College A, so College B TPO gets 0 matches
      assert.strictEqual(data.resumes.length, 0);
    });

    // ========================================================================
    // TEST 3: TPO read-only resume view with submitted versions & drives
    // ========================================================================
    await test('TPO can view resume read-only and see which version was submitted to which drive', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}`, {
        headers: { Authorization: `Bearer ${tokenTpoA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.resume.title, 'Phase11 Alice Cloud Resume');
      assert(Array.isArray(data.submittedApplications));
      assert.strictEqual(data.submittedApplications.length, 1);
      assert.strictEqual(data.submittedApplications[0].drive.role, 'Phase11 Systems Architect');
      assert.strictEqual(data.submittedApplications[0].resumeVersion.name, 'Phase11 Submitted Version 2');
      assert.strictEqual(data.submittedApplications[0].resumeVersion.submitted, true);
    });

    // ========================================================================
    // TEST 4: TPO of another college is DENIED (403) from accessing resume details
    // ========================================================================
    await test('TPO of College B is DENIED (403) from viewing College A student resume', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}`, {
        headers: { Authorization: `Bearer ${tokenTpoB}` },
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert(data.message.includes('college mismatch') || data.message.includes('denied'));
    });

    // ========================================================================
    // TEST 5: TPO creates feedback review
    // ========================================================================
    let reviewId;
    await test('TPO can post review feedback on student resume', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTpoA}`,
        },
        body: JSON.stringify({
          comment: 'Strong technical depth. Expand the metrics in your summary bullet points.',
          status: 'needs_revision',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(data.review);
      assert.strictEqual(data.review.status, 'needs_revision');
      assert.strictEqual(data.review.comment, 'Strong technical depth. Expand the metrics in your summary bullet points.');
      assert.strictEqual(data.review.tpo.name, 'TPO College A Phase11');
      reviewId = data.review._id;

      // Verify in DB
      const dbReview = await ResumeReview.findById(reviewId);
      assert(dbReview);
      assert.strictEqual(dbReview.resume.toString(), resumeA._id.toString());
      assert.strictEqual(dbReview.tpo.toString(), userTpoA._id.toString());
      assert.strictEqual(dbReview.college.toString(), collegeA._id.toString());

      // Verify Notification dispatched to student
      const notif = await Notification.findOne({ user: userStudentA._id });
      assert(notif, 'Student notification must be created on TPO review');
      assert.strictEqual(notif.type, 'general');
      assert(notif.message.includes('needs revision'));
      assert.strictEqual(notif.link, `/student/resume-studio/${resumeA._id}`);
    });

    // ========================================================================
    // TEST 6: Cross-college TPO cannot post review
    // ========================================================================
    await test('TPO of another college is DENIED (403) from posting review on foreign resume', async () => {
      const res = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTpoB}`,
        },
        body: JSON.stringify({
          comment: 'Illegal cross-college review attempt',
          status: 'approved',
        }),
      });
      assert.strictEqual(res.status, 403);
    });

    // ========================================================================
    // TEST 7: Student can view feedback on their own resume
    // ========================================================================
    await test('Student CAN view reviews / feedback on their own resume', async () => {
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/reviews`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.reviews));
      assert.strictEqual(data.reviews.length, 1);
      assert.strictEqual(data.reviews[0].comment, 'Strong technical depth. Expand the metrics in your summary bullet points.');
      assert.strictEqual(data.reviews[0].tpo.name, 'TPO College A Phase11');
    });

    // ========================================================================
    // TEST 8: Student cannot view feedback on another student's resume
    // ========================================================================
    await test('Student is DENIED (403) from viewing another student resume feedback', async () => {
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/reviews`, {
        headers: { Authorization: `Bearer ${tokenStudentB}` },
      });
      assert.strictEqual(res.status, 403);
    });

    // ========================================================================
    // TEST 9: Student cannot access TPO review management endpoints
    // ========================================================================
    await test('Student is DENIED (403) from calling /api/resume-studio/tpo/*', async () => {
      const resList = await fetch(`${baseUrl}/tpo/resumes`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(resList.status, 403);

      const resPost = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ comment: 'Illegal review', status: 'approved' }),
      });
      assert.strictEqual(resPost.status, 403);
    });

    // ========================================================================
    // TEST 10: Recruiter has NO access to resume review endpoints
    // ========================================================================
    await test('Recruiter is DENIED (403) from calling /api/resume-studio/tpo/* and reviews', async () => {
      const resTpo = await fetch(`${baseUrl}/tpo/resumes`, {
        headers: { Authorization: `Bearer ${tokenRecruiter}` },
      });
      assert.strictEqual(resTpo.status, 403);

      const resReviews = await fetch(`${baseUrl}/resumes/${resumeA._id}/reviews`, {
        headers: { Authorization: `Bearer ${tokenRecruiter}` },
      });
      assert.strictEqual(resReviews.status, 403);
    });

    // ========================================================================
    // TEST 11: Zod validation on review payload
    // ========================================================================
    await test('Zod validation blocks empty comment or invalid review status', async () => {
      // Empty comment
      const res1 = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTpoA}`,
        },
        body: JSON.stringify({ comment: '', status: 'approved' }),
      });
      assert.strictEqual(res1.status, 400);

      // Invalid status
      const res2 = await fetch(`${baseUrl}/tpo/resumes/${resumeA._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTpoA}`,
        },
        body: JSON.stringify({ comment: 'Looks okay', status: 'super_approved' }),
      });
      assert.strictEqual(res2.status, 400);
    });

  } finally {
    // Cleanup fixtures
    try {
      await ResumeReview.deleteMany({});
      await Application.deleteMany({});
      await Drive.deleteMany({ role: { $regex: /Phase11/ } });
      await Resume.deleteMany({ title: { $regex: /Phase11/ } });
      await ResumeVersion.deleteMany({ name: { $regex: /Phase11/ } });
      await Student.deleteMany({ enrollmentNo: { $regex: /^P11/ } });
      await User.deleteMany({ email: { $regex: /phase11/ } });
      await Company.deleteMany({ name: { $regex: /Phase11/ } });
      await College.deleteMany({ code: { $regex: /^P11/ } });
    } catch {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }

  console.log('\n======================================================================');
  console.log(`Phase 11 Tests Finished: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTpoReviewTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
