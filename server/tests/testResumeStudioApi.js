/**
 * Test Suite: Resume Studio Backend API (Phase 2)
 *
 * Verifies:
 * 1. Authentication & Student-Only Role Authorization (401, 403).
 * 2. Cross-Student & Multi-College Isolation (other student denied, other college denied).
 * 3. Resume CRUD:
 *    - GET /resumes (pagination, active vs archived filter)
 *    - POST /resumes (first resume auto-primary, unique primary enforcement)
 *    - GET /resumes/:id (ownership checks)
 *    - PATCH /resumes/:id (updates, primary switching)
 *    - DELETE /resumes/:id (soft delete archive, unsets primary)
 *    - POST /resumes/:id/duplicate (creates non-primary copy with template & content)
 *    - POST /resumes/:id/primary (sets primary and clears previous primary)
 * 4. Version Management & Rules:
 *    - GET /resumes/:id/versions (pagination, isSubmitted annotation)
 *    - POST /resumes/:id/versions (snapshot creation)
 *    - Pruning unsubmitted versions at configurable cap (default 20, tested with cap 3)
 *    - Pruning NEVER touches submitted versions (flagged submitted: true or Application reference)
 *    - Deletion BLOCKED for submitted versions (flagged submitted: true or Application reference)
 *    - Deletion of unsubmitted versions succeeds
 *    - POST /resumes/:id/versions/:vid/restore (creates a NEW version, updates resume data)
 * 5. Zod schema validation on invalid params, body, and query selectors.
 */

process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getTestDbUri, assertTestDatabase } = require('./testHelper');
const {
  User,
  Student,
  College,
  Drive,
  Company,
  Application,
  Resume,
  ResumeVersion,
} = require('../models');

const resumeStudioRoutes = require('../routes/resumeStudioRoutes');

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      college: user.college?._id || user.college,
      company: user.company?._id || user.company,
    },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026_at_least_32_chars',
    { expiresIn: '1d' }
  );
}

async function runResumeStudioTests() {
  console.log('='.repeat(70));
  console.log('TEST SUITE: RESUME STUDIO BACKEND API (PHASE 2)');
  console.log('='.repeat(70));

  const testDbUri = getTestDbUri();
  console.log(`Connecting to test database: ${testDbUri.replace(/\/\/.*@/, '//<credentials>@')}`);
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);

  await Resume.syncIndexes();
  await ResumeVersion.syncIndexes();

  // Create Express test app
  const app = express();
  app.use(express.json());
  app.use('/api/resume-studio', resumeStudioRoutes);

  // Global test error handler
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      success: false,
      message: err.message,
    });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/resume-studio`;

  const cleanupColleges = [];
  const cleanupCompanies = [];
  const cleanupUsers = [];
  const cleanupStudents = [];
  const cleanupDrives = [];
  const cleanupApplications = [];
  const cleanupResumes = [];
  const cleanupVersions = [];

  let passedTests = 0;
  let totalTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ TEST ${totalTests}: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ TEST ${totalTests} FAILED: ${name}`);
      console.error(err);
      throw err;
    }
  }

  try {
    // Setup Colleges
    const collegeA = await College.create({
      name: `College Alpha ${Date.now()}`,
      code: `CLA${Date.now().toString().slice(-4)}`,
      city: 'Pune',
      state: 'Maharashtra',
    });
    cleanupColleges.push(collegeA._id);

    const collegeB = await College.create({
      name: `College Beta ${Date.now()}`,
      code: `CLB${Date.now().toString().slice(-4)}`,
      city: 'Bangalore',
      state: 'Karnataka',
    });
    cleanupColleges.push(collegeB._id);

    // Setup Students
    const userA = await User.create({
      name: 'Alice Student',
      email: `alice_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
    });
    cleanupUsers.push(userA._id);

    const studentA = await Student.create({
      user: userA._id,
      college: collegeA._id,
      enrollmentNo: `EN_A_${Date.now()}`,
      branch: 'Computer Science',
      phone: '9876543201',
      batchYear: 2026,
      department: 'Computer Science',
      cgpa: 8.8,
    });
    cleanupStudents.push(studentA._id);

    const userB = await User.create({
      name: 'Bob Student (Same College)',
      email: `bob_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
    });
    cleanupUsers.push(userB._id);

    const studentB = await Student.create({
      user: userB._id,
      college: collegeA._id,
      enrollmentNo: `EN_B_${Date.now()}`,
      branch: 'Information Technology',
      phone: '9876543202',
      batchYear: 2026,
      department: 'Information Technology',
      cgpa: 7.9,
    });
    cleanupStudents.push(studentB._id);

    const userC = await User.create({
      name: 'Charlie Student (College Beta)',
      email: `charlie_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
      college: collegeB._id,
    });
    cleanupUsers.push(userC._id);

    const studentC = await Student.create({
      user: userC._id,
      college: collegeB._id,
      enrollmentNo: `EN_C_${Date.now()}`,
      branch: 'Electronics',
      phone: '9876543203',
      batchYear: 2026,
      department: 'Electronics',
      cgpa: 8.2,
    });
    cleanupStudents.push(studentC._id);

    // Recruiter & TPO users for role checks
    const company = await Company.create({
      name: `TechCorp ${Date.now()}`,
      email: `recruiter_${Date.now()}@techcorp.com`,
      industry: 'Software',
    });
    cleanupCompanies.push(company._id);

    const recruiterUser = await User.create({
      name: 'Recruiter Ray',
      email: `recruiter_${Date.now()}@techcorp.com`,
      password: 'Password123!',
      role: 'recruiter',
      company: company._id,
    });
    cleanupUsers.push(recruiterUser._id);

    const tpoUser = await User.create({
      name: 'TPO Officer',
      email: `tpo_${Date.now()}@college.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
    });
    cleanupUsers.push(tpoUser._id);

    // Drives & Application for submission tests
    const drive = await Drive.create({
      company: company._id,
      college: collegeA._id,
      role: 'Fullstack Developer',
      packageLpa: 12,
      location: 'Bangalore',
      driveDate: new Date(Date.now() + 86400000),
      lastDateToApply: new Date(Date.now() + 43200000),
      allowedBranches: ['Computer Science', 'Information Technology'],
      eligibleBatches: [2026],
      minCgpa: 7.0,
      status: 'open',
    });
    cleanupDrives.push(drive._id);

    const tokenA = createToken(userA);
    const tokenB = createToken(userB);
    const tokenC = createToken(userC);
    const tokenRecruiter = createToken(recruiterUser);
    const tokenTpo = createToken(tpoUser);

    let aliceResumeId = null;
    let aliceResume2Id = null;

    // TEST 1: Authentication and role authorization
    await test('Unauthenticated requests and non-student roles are rejected', async () => {
      // 1. Unauthenticated
      const unauthRes = await fetch(`${baseUrl}/resumes`);
      assert.strictEqual(unauthRes.status, 401, 'Must return 401 Unauthorized without token');

      // 2. Recruiter role
      const recruiterRes = await fetch(`${baseUrl}/resumes`, {
        headers: { Authorization: `Bearer ${tokenRecruiter}` },
      });
      assert.strictEqual(recruiterRes.status, 403, 'Must return 403 Forbidden for recruiter role');

      // 3. TPO role
      const tpoRes = await fetch(`${baseUrl}/resumes`, {
        headers: { Authorization: `Bearer ${tokenTpo}` },
      });
      assert.strictEqual(tpoRes.status, 403, 'Must return 403 Forbidden for tpo role');
    });

    // TEST 2: POST /resumes - Create first resume (auto-primary)
    await test('POST /resumes creates resume and automatically makes first resume primary', async () => {
      const res = await fetch(`${baseUrl}/resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Full Stack Web Developer',
          templateId: 'software-engineer',
          data: {
            contact: { fullName: 'Alice Student', email: 'alice@example.com' },
            skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
          },
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.resume.title, 'Full Stack Web Developer');
      assert.strictEqual(json.resume.templateId, 'software-engineer');
      assert.strictEqual(json.resume.isPrimary, true, 'First resume must be primary');
      assert.strictEqual(json.resume.archived, false);
      aliceResumeId = json.resume._id;
      cleanupResumes.push(aliceResumeId);
    });

    // TEST 3: POST /resumes - Create second resume with isPrimary: true (unsets previous primary)
    await test('POST /resumes with isPrimary: true unsets previous primary without index violation', async () => {
      const res = await fetch(`${baseUrl}/resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Machine Learning Resume',
          templateId: 'technical-projects',
          isPrimary: true,
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.resume.isPrimary, true);
      aliceResume2Id = json.resume._id;
      cleanupResumes.push(aliceResume2Id);

      // Verify original resume is no longer primary
      const firstResume = await Resume.findById(aliceResumeId);
      assert.strictEqual(firstResume.isPrimary, false, 'Previous primary must be unset');
    });

    // TEST 4: GET /resumes - List resumes with pagination
    await test('GET /resumes lists student resumes with pagination and active filter', async () => {
      const res = await fetch(`${baseUrl}/resumes?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.resumes.length, 2);
      assert.strictEqual(json.pagination.total, 2);
      assert.strictEqual(json.pagination.page, 1);
      assert.strictEqual(json.pagination.limit, 10);
    });

    // TEST 5: GET /resumes/:id & Ownership check
    await test('GET /resumes/:id fetches resume and blocks other students & other colleges', async () => {
      // 1. Owner Alice can fetch
      const ownerRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(ownerRes.status, 200);
      const ownerJson = await ownerRes.json();
      assert.strictEqual(ownerJson.resume._id, aliceResumeId);

      // 2. Student Bob (same college) is denied
      const bobRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.strictEqual(bobRes.status, 403, 'Other student must be denied 403');

      // 3. Student Charlie (different college) is denied
      const charlieRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        headers: { Authorization: `Bearer ${tokenC}` },
      });
      assert.strictEqual(charlieRes.status, 403, 'Different college student must be denied 403');
    });

    // TEST 6: PATCH /resumes/:id
    await test('PATCH /resumes/:id updates fields and enforces ownership', async () => {
      const res = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Senior Full Stack Web Developer',
          templateId: 'modern-professional',
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.resume.title, 'Senior Full Stack Web Developer');
      assert.strictEqual(json.resume.templateId, 'modern-professional');

      // Bob cannot patch Alice's resume
      const bobRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({ title: 'Hacked Title' }),
      });
      assert.strictEqual(bobRes.status, 403);
    });

    // TEST 7: POST /resumes/:id/primary
    await test('POST /resumes/:id/primary sets primary and unsets any previous primary', async () => {
      const res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/primary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.resume.isPrimary, true);

      // Alice's 2nd resume should now be false
      const r2 = await Resume.findById(aliceResume2Id);
      assert.strictEqual(r2.isPrimary, false);

      // Only 1 primary active resume exists in DB for Alice
      const primaryCount = await Resume.countDocuments({
        student: studentA._id,
        isPrimary: true,
        archived: false,
      });
      assert.strictEqual(primaryCount, 1, 'Strictly 1 active primary resume must exist');
    });

    // TEST 8: POST /resumes/:id/duplicate
    let duplicatedResumeId = null;
    await test('POST /resumes/:id/duplicate copies template and data without stealing primary', async () => {
      const res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.resume.title, 'Senior Full Stack Web Developer (Copy)');
      assert.strictEqual(json.resume.templateId, 'modern-professional');
      assert.strictEqual(json.resume.isPrimary, false, 'Duplicate must never be primary');
      duplicatedResumeId = json.resume._id;
      cleanupResumes.push(duplicatedResumeId);
    });

    // TEST 9: DELETE /resumes/:id (Archive)
    await test('DELETE /resumes/:id archives resume and unsets primary', async () => {
      // Archive the duplicated resume
      const res = await fetch(`${baseUrl}/resumes/${duplicatedResumeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.resume.archived, true);
      assert.strictEqual(json.resume.isPrimary, false);

      // Cannot make an archived resume primary
      const primRes = await fetch(`${baseUrl}/resumes/${duplicatedResumeId}/primary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(primRes.status, 400);

      // Active resumes list does not include archived resume
      const listActive = await fetch(`${baseUrl}/resumes?archived=false`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const activeData = await listActive.json();
      assert(!activeData.resumes.some((r) => r._id === duplicatedResumeId));

      // Archived list contains it
      const listArchived = await fetch(`${baseUrl}/resumes?archived=true`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const archData = await listArchived.json();
      assert(archData.resumes.some((r) => r._id === duplicatedResumeId));
    });

    // TEST 10: Version Management - Create, List, and Check isSubmitted annotation
    let version1Id = null;
    let version2Id = null;
    let version3SubmittedId = null;
    let version4AppRefId = null;

    await test('POST & GET /resumes/:id/versions manage snapshots and annotate submission status', async () => {
      // Version 1: Normal unsubmitted
      const v1Res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'V1 - Google SDE',
          source: 'manual',
          templateId: 'minimal-ats',
        }),
      });
      assert.strictEqual(v1Res.status, 201);
      const v1Data = await v1Res.json();
      version1Id = v1Data.version._id;
      cleanupVersions.push(version1Id);

      // Version 2: Another unsubmitted
      const v2Res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'V2 - Amazon Tailored',
          source: 'ai-tailor',
          templateId: 'software-engineer',
        }),
      });
      assert.strictEqual(v2Res.status, 201);
      const v2Data = await v2Res.json();
      version2Id = v2Data.version._id;
      cleanupVersions.push(version2Id);

      // Version 3: Flagged submitted directly
      const v3 = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: aliceResumeId,
        name: 'V3 - Microsoft Submitted Direct',
        submitted: true,
      });
      version3SubmittedId = v3._id;
      cleanupVersions.push(version3SubmittedId);

      // Version 4: Referenced by an Application
      const v4 = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: aliceResumeId,
        name: 'V4 - Apple Via Application',
        submitted: false,
      });
      version4AppRefId = v4._id;
      cleanupVersions.push(version4AppRefId);

      const appDoc = await Application.create({
        student: studentA._id,
        drive: drive._id,
        resumeVersion: v4._id,
        status: 'applied',
      });
      cleanupApplications.push(appDoc._id);

      // List versions and verify isSubmitted
      const listRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(listRes.status, 200);
      const listData = await listRes.json();
      assert.strictEqual(listData.versions.length, 4);

      const itemV1 = listData.versions.find((v) => String(v._id) === String(version1Id));
      assert.strictEqual(itemV1.isSubmitted, false);

      const itemV3 = listData.versions.find((v) => String(v._id) === String(version3SubmittedId));
      assert.strictEqual(itemV3.isSubmitted, true, 'Flagged submitted version must report isSubmitted: true');

      const itemV4 = listData.versions.find((v) => String(v._id) === String(version4AppRefId));
      assert.strictEqual(itemV4.isSubmitted, true, 'Application-referenced version must report isSubmitted: true');
    });

    // TEST 11: Submitted versions cannot be deleted
    await test('DELETE /resumes/:id/versions/:vid blocks deleting submitted or app-referenced versions', async () => {
      // 1. Version 3 (submitted: true) cannot be deleted
      const delV3 = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions/${version3SubmittedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(delV3.status, 400, 'Must block deleting version with submitted: true');

      // 2. Version 4 (referenced by Application) cannot be deleted
      const delV4 = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions/${version4AppRefId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(delV4.status, 400, 'Must block deleting application-referenced version');

      // 3. Unsubmitted Version 1 CAN be deleted
      const delV1 = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions/${version1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(delV1.status, 200);
      const checkV1 = await ResumeVersion.findById(version1Id);
      assert.strictEqual(checkV1, null, 'Unsubmitted version must be deleted');
    });

    // TEST 12: Pruning unsubmitted versions at limit (and never touching submitted)
    await test('Pruning unsubmitted versions triggers at limit and NEVER touches submitted versions', async () => {
      // Set cap to 3 for this test
      process.env.RESUME_STUDIO_MAX_VERSIONS = '3';

      // Create a fresh test resume
      const pruneResume = await Resume.create({
        student: studentA._id,
        college: collegeA._id,
        title: 'Pruning Test Resume',
      });
      cleanupResumes.push(pruneResume._id);

      // Add a submitted version FIRST (oldest)
      const oldestSubmitted = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: pruneResume._id,
        name: 'Historic Submitted Snapshot (DO NOT TOUCH)',
        submitted: true,
        createdAt: new Date(Date.now() - 50000),
      });
      cleanupVersions.push(oldestSubmitted._id);

      // Add 3 unsubmitted versions (reaching cap of 3)
      const unsubmitted1 = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: pruneResume._id,
        name: 'Unsubmitted Snapshot 1 (Oldest Unsubmitted)',
        submitted: false,
        createdAt: new Date(Date.now() - 40000),
      });
      cleanupVersions.push(unsubmitted1._id);

      const unsubmitted2 = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: pruneResume._id,
        name: 'Unsubmitted Snapshot 2',
        submitted: false,
        createdAt: new Date(Date.now() - 30000),
      });
      cleanupVersions.push(unsubmitted2._id);

      const unsubmitted3 = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: pruneResume._id,
        name: 'Unsubmitted Snapshot 3',
        submitted: false,
        createdAt: new Date(Date.now() - 20000),
      });
      cleanupVersions.push(unsubmitted3._id);

      // Now create 4th unsubmitted version via API - MUST prune unsubmitted1, NOT oldestSubmitted
      const res = await fetch(`${baseUrl}/resumes/${pruneResume._id}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'Unsubmitted Snapshot 4 (Triggers Prune)',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert(data.warning, 'Response must include warning about pruning');
      cleanupVersions.push(data.version._id);

      // Check oldestSubmitted is STILL PRESENT
      const checkSubmitted = await ResumeVersion.findById(oldestSubmitted._id);
      assert(checkSubmitted !== null, 'Submitted version must NEVER be pruned');

      // Check unsubmitted1 WAS PRUNED
      const checkUnsub1 = await ResumeVersion.findById(unsubmitted1._id);
      assert.strictEqual(checkUnsub1, null, 'Oldest unsubmitted version must be pruned');

      // Check unsubmitted2, 3, 4 are still present
      assert((await ResumeVersion.findById(unsubmitted2._id)) !== null);
      assert((await ResumeVersion.findById(unsubmitted3._id)) !== null);

      // Reset env var
      delete process.env.RESUME_STUDIO_MAX_VERSIONS;
    });

    // TEST 13: POST /resumes/:id/versions/:vid/restore creates a NEW version
    await test('POST /resumes/:id/versions/:vid/restore creates a NEW version and updates resume data', async () => {
      // Restore Version 2
      const res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/versions/${version2Id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'Restored V2 Snapshot',
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert(json.version, 'Must return new version');
      assert.strictEqual(json.version.name, 'Restored V2 Snapshot');
      assert.notStrictEqual(String(json.version._id), String(version2Id), 'Restore must create a NEW version ID');
      cleanupVersions.push(json.version._id);

      // Verify resume data was restored
      const updatedResume = await Resume.findById(aliceResumeId);
      assert.strictEqual(updatedResume.templateId, 'software-engineer');
    });

    // TEST 14: Zod validation error handling across endpoints
    await test('Strict Zod validation handles invalid parameters and bodies gracefully', async () => {
      // Invalid ObjectId param
      const badIdRes = await fetch(`${baseUrl}/resumes/not-a-valid-id`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(badIdRes.status, 400);
      const badIdJson = await badIdRes.json();
      assert.strictEqual(badIdJson.success, false);

      // Invalid templateId enum in body
      const badTemplateRes = await fetch(`${baseUrl}/resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: 'Bad Template',
          templateId: 'unsupported-template-design',
        }),
      });
      assert.strictEqual(badTemplateRes.status, 400);

      // Disallow unknown fields in PATCH (strict)
      const badPatchRes = await fetch(`${baseUrl}/resumes/${aliceResumeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          maliciousField: 'exploit',
        }),
      });
      assert.strictEqual(badPatchRes.status, 400);
    });

    // TEST 15: GET /api/resume-studio/templates returns canonical template metadata
    await test('GET /templates returns canonical metadata for ATS templates', async () => {
      const res = await fetch(`${baseUrl}/templates`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.templates));
      assert.strictEqual(data.templates.length, 8);
      const ids = data.templates.map((t) => t.id);
      assert(ids.includes('modern'));
      assert(ids.includes('classic'));
      assert(ids.includes('compact'));
      assert(ids.includes('minimal-ats'));
      assert(ids.includes('software-engineer'));
      assert(ids.includes('professional-fresher'));
      assert(ids.includes('modern-professional'));
      assert(ids.includes('technical-projects'));
    });

    // TEST 16: POST /api/resume-studio/resumes/:id/export-pdf generates valid PDF stream
    await test('POST /resumes/:id/export-pdf streams ATS-compliant PDF document', async () => {
      const res = await fetch(`${baseUrl}/resumes/${aliceResumeId}/export-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
      const buffer = await res.arrayBuffer();
      assert(buffer.byteLength > 100, 'PDF buffer must have non-zero content');
      const headerStr = Buffer.from(buffer.slice(0, 5)).toString();
      assert.strictEqual(headerStr, '%PDF-', 'Must start with PDF magic bytes %PDF-');
    });

    console.log('\n' + '='.repeat(70));
    console.log(`ALL ${passedTests}/${totalTests} RESUME STUDIO TESTS PASSED!`);
    console.log('='.repeat(70) + '\n');
  } finally {
    server.close();

    // Clean up all test fixtures
    if (cleanupVersions.length > 0) {
      await ResumeVersion.deleteMany({ _id: { $in: cleanupVersions } });
    }
    if (cleanupResumes.length > 0) {
      await Resume.deleteMany({ _id: { $in: cleanupResumes } });
    }
    if (cleanupApplications.length > 0) {
      await Application.deleteMany({ _id: { $in: cleanupApplications } });
    }
    if (cleanupDrives.length > 0) {
      await Drive.deleteMany({ _id: { $in: cleanupDrives } });
    }
    if (cleanupStudents.length > 0) {
      await Student.deleteMany({ _id: { $in: cleanupStudents } });
    }
    if (cleanupUsers.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUsers } });
    }
    if (cleanupCompanies.length > 0) {
      await Company.deleteMany({ _id: { $in: cleanupCompanies } });
    }
    if (cleanupColleges.length > 0) {
      await College.deleteMany({ _id: { $in: cleanupColleges } });
    }

    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runResumeStudioTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runResumeStudioTests };
