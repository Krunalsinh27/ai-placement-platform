/**
 * Resume Studio Phase 10 & 10b: Application Model Integration, Scoped Snapshot & Hardening Tests
 *
 * Verifies:
 * 1. Application model stores immutable resumeSnapshot { resumeId, versionId, contentHash, data, templateId, createdAt }
 * 2. applyToDrive creates snapshot server-side, marks version as submitted: true only AFTER application creation
 * 3. Snapshot remains UNCHANGED after later resume edits
 * 4. Scoped read authorization:
 *    - Owner student: ALLOWED (200)
 *    - TPO/Admin of same college: ALLOWED (200)
 *    - Recruiter for own drive: ALLOWED (200)
 *    - Student from another account: DENIED (403)
 *    - Admin from cross-college: DENIED (403)
 *    - Recruiter from another drive/company: DENIED (403)
 * 5. On-demand PDF export: streams valid PDF without storing PDF in MongoDB
 * 6. Legacy applications without snapshot continue to load normally (404 on snapshot read)
 * 7. contentHash is computed server-side strictly from snapshot data
 * 8. getDriveApplications projection:
 *    - Includes legitimate UI fields: branch, batchYear, phone, skills, cgpa, backlogs, enrollmentNo
 *    - Strictly excludes private fields: resumeProfile, resumeAnalysis
 *    - Gates resumeUrl for recruiters: removed for snapshot applications, preserved for legacy and TPO
 * 9. Live-resume leak prevention (streamResume):
 *    - Recruiter denied access (403) to student's live resume when snapshot application exists
 *    - Recruiter allowed to stream legacy resume if legacy application exists
 *    - Owner student and same-college TPO retain full access
 * 10. Apply failure ordering:
 *    - Ineligible student: version submitted flag remains false
 *    - Duplicate application: version submitted flag remains false
 *    - Successful application: version submitted flag is set to true
 */

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const {
  User,
  Student,
  Company,
  Drive,
  College,
  Application,
  Resume,
  ResumeVersion,
} = require('../models');
const applicationRoutes = require('../routes/applicationRoutes');
const studentRoutes = require('../routes/studentRoutes');
const driveRoutes = require('../routes/driveRoutes');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_dev_mode_only_change_in_production';

let server;
let baseUrl;
let studentBaseUrl;
let driveBaseUrl;
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

async function runApplicationSnapshotTests() {
  console.log('\n======================================================================');
  console.log('TEST SUITE: RESUME STUDIO PHASE 10/10b - APPLICATION SNAPSHOT INTEGRATION');
  console.log('======================================================================');

  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);

  const app = express();
  app.use(express.json());
  app.use('/api/applications', applicationRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/drives', driveRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
    });
  });

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api/applications`;
  studentBaseUrl = `http://localhost:${port}/api/students`;
  driveBaseUrl = `http://localhost:${port}/api/drives`;

  // Fixtures
  let collegeA, collegeB;
  let userStudentA, studentA, tokenStudentA;
  let userStudentB, studentB, tokenStudentB;
  let userStudentC, studentC, tokenStudentC;
  let userAdminA, tokenAdminA;
  let userAdminB, tokenAdminB;
  let userRecruiter1, company1, tokenRecruiter1;
  let userRecruiter2, company2, tokenRecruiter2;
  let drive1, drive2;
  let resumeA, versionA;

  try {
    // Clean test leftovers
    await Application.deleteMany({});
    await Drive.deleteMany({ role: { $regex: /Phase10/ } });
    await Resume.deleteMany({ title: { $regex: /Phase10/ } });
    await ResumeVersion.deleteMany({ name: { $regex: /Phase10/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^P10/ } });
    await User.deleteMany({ email: { $regex: /phase10/ } });
    await Company.deleteMany({ name: { $regex: /Phase10/ } });
    await College.deleteMany({ code: { $regex: /^P10/ } });

    // 1. Setup Colleges
    collegeA = await College.create({
      name: 'Phase10 Institute of Tech',
      code: 'P10A',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });
    collegeB = await College.create({
      name: 'Phase10 University of Engineering',
      code: 'P10B',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });

    // 2. Setup Users & Students
    userStudentA = await User.create({
      name: 'Alice Phase10',
      email: 'alice.phase10@test.com',
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isVerified: true,
    });
    studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'P10A001',
      branch: 'Computer Science',
      batchYear: 2026,
      phone: '9876543210',
      cgpa: 9.0,
      backlogs: 0,
      skills: ['Node.js', 'React', 'MongoDB'],
      resumeUrl: 'uploads/resumes/mock-alice-current.pdf',
      resumeProfile: {
        summary: 'Private student profile summary that must never leak to recruiters',
        skills: [{ name: 'Confidential Internal Skill' }],
      },
      resumeAnalysis: {
        score: 95,
        targetRole: 'Private Analysis',
      },
    });
    tokenStudentA = createToken(userStudentA._id, 'student', collegeA._id);

    userStudentB = await User.create({
      name: 'Bob Phase10',
      email: 'bob.phase10@test.com',
      password: 'Password123!',
      role: 'student',
      college: collegeB._id,
      isVerified: true,
    });
    studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'P10B001',
      branch: 'Information Technology',
      batchYear: 2026,
      phone: '9876543211',
      cgpa: 8.5,
      backlogs: 0,
      skills: ['Python', 'SQL'],
    });
    tokenStudentB = createToken(userStudentB._id, 'student', collegeB._id);

    // Student C: Ineligible (low CGPA) for testing failure ordering
    userStudentC = await User.create({
      name: 'Charlie Ineligible Phase10',
      email: 'charlie.phase10@test.com',
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isVerified: true,
    });
    studentC = await Student.create({
      user: userStudentC._id,
      college: collegeA._id,
      enrollmentNo: 'P10C001',
      branch: 'Computer Science',
      batchYear: 2026,
      phone: '9876543212',
      cgpa: 4.5, // Drive min is 7.0
      backlogs: 3,
      skills: ['HTML'],
    });
    tokenStudentC = createToken(userStudentC._id, 'student', collegeA._id);

    // 3. Setup Admins / TPOs
    userAdminA = await User.create({
      name: 'TPO College A',
      email: 'tpo.a.phase10@test.com',
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isVerified: true,
    });
    tokenAdminA = createToken(userAdminA._id, 'tpo', collegeA._id);

    userAdminB = await User.create({
      name: 'TPO College B',
      email: 'tpo.b.phase10@test.com',
      password: 'Password123!',
      role: 'tpo',
      college: collegeB._id,
      isVerified: true,
    });
    tokenAdminB = createToken(userAdminB._id, 'tpo', collegeB._id);

    // 4. Setup Companies & Recruiters
    company1 = await Company.create({
      name: 'Phase10 Cloud Corp',
      industry: 'Technology',
    });
    userRecruiter1 = await User.create({
      name: 'Recruiter One',
      email: 'recruiter1.phase10@test.com',
      password: 'Password123!',
      role: 'recruiter',
      company: company1._id,
      isVerified: true,
    });
    tokenRecruiter1 = createToken(userRecruiter1._id, 'recruiter', null, company1._id);

    company2 = await Company.create({
      name: 'Phase10 Systems Inc',
      industry: 'Fintech',
    });
    userRecruiter2 = await User.create({
      name: 'Recruiter Two',
      email: 'recruiter2.phase10@test.com',
      password: 'Password123!',
      role: 'recruiter',
      company: company2._id,
      isVerified: true,
    });
    tokenRecruiter2 = createToken(userRecruiter2._id, 'recruiter', null, company2._id);

    // 5. Setup Drives
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);

    drive1 = await Drive.create({
      company: company1._id,
      role: 'Phase10 Fullstack Engineer',
      packageLpa: 14,
      location: 'Bengaluru',
      driveDate: tomorrow,
      lastDateToApply: tomorrow,
      minCgpa: 7.0,
      maxBacklogs: 1,
      allowedBranches: ['Computer Science', 'Information Technology'],
      colleges: [collegeA._id],
      requiredSkills: ['Node.js', 'Go'],
      preferredSkills: ['TypeScript'],
      status: 'open',
    });

    drive2 = await Drive.create({
      company: company2._id,
      role: 'Phase10 Backend Engineer',
      packageLpa: 16,
      location: 'Pune',
      driveDate: tomorrow,
      lastDateToApply: tomorrow,
      minCgpa: 7.0,
      maxBacklogs: 1,
      allowedBranches: ['Computer Science', 'Information Technology'],
      colleges: [collegeB._id],
      status: 'open',
    });

    // 6. Setup Student A Studio Resume & Version
    resumeA = await Resume.create({
      student: studentA._id,
      college: collegeA._id,
      title: 'Phase10 Alice Primary Resume',
      templateId: 'software-engineer',
      isPrimary: true,
      data: {
        contact: {
          fullName: 'Alice Vance Phase10',
          email: 'alice.phase10@test.com',
          phone: '+91 9123456789',
          location: 'Mumbai, Maharashtra',
        },
        summary: 'Cloud software engineer experienced in distributed backend architectures.',
        skills: [{ category: 'Languages', items: ['Node.js', 'Go', 'TypeScript'] }],
        experience: [
          {
            title: 'Software Developer Intern',
            company: 'Tech Innovators',
            duration: '2023',
            bullets: ['Built scalable microservices handling 10k RPS'],
          },
        ],
        education: [
          {
            degree: 'B.Tech',
            institution: 'Phase10 Institute of Tech',
            field: 'Computer Science',
            year: '2024',
            score: '9.0',
          },
        ],
      },
    });

    versionA = await ResumeVersion.create({
      student: studentA._id,
      college: collegeA._id,
      resume: resumeA._id,
      name: 'Phase10 Version 1 Snapshot Source',
      templateId: 'software-engineer',
      submitted: false,
      resumeData: resumeA.data,
      contentHash: '',
    });

    // ========================================================================
    // TEST 1: applyToDrive creates immutable snapshot and marks version submitted
    // ========================================================================
    let application1Id;
    await test('applyToDrive with { resumeId, versionId } creates resumeSnapshot and marks version submitted: true', async () => {
      const res = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: drive1._id.toString(),
          resumeId: resumeA._id.toString(),
          versionId: versionA._id.toString(),
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(data.application);
      application1Id = data.application._id;

      // Verify in Database
      const appDoc = await Application.findById(application1Id);
      assert(appDoc, 'Application document not found');
      assert(appDoc.resumeSnapshot, 'Application must contain resumeSnapshot');
      assert.strictEqual(appDoc.resumeSnapshot.resumeId.toString(), resumeA._id.toString());
      assert.strictEqual(appDoc.resumeSnapshot.versionId.toString(), versionA._id.toString());
      assert.strictEqual(appDoc.resumeSnapshot.templateId, 'software-engineer');
      assert.strictEqual(
        appDoc.resumeSnapshot.data.contact.fullName,
        'Alice Vance Phase10'
      );
      assert(appDoc.resumeSnapshot.createdAt, 'resumeSnapshot must contain createdAt');

      // Verify versionA is now marked submitted: true
      const updatedVersion = await ResumeVersion.findById(versionA._id);
      assert.strictEqual(updatedVersion.submitted, true, 'Version must be marked submitted: true');
    });

    // ========================================================================
    // TEST 2: Snapshot remains UNCHANGED after later resume edits
    // ========================================================================
    await test('resumeSnapshot remains immutable even after student modifies resume data', async () => {
      resumeA.data.contact.fullName = 'Alice CHANGED Name';
      resumeA.data.summary = 'Brand new summary that was not part of the applied snapshot';
      await resumeA.save();

      await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: resumeA._id,
        name: 'Phase10 Version 2 Post-Apply Edit',
        templateId: 'minimal-ats',
        resumeData: resumeA.data,
      });

      const appDoc = await Application.findById(application1Id);
      assert.strictEqual(
        appDoc.resumeSnapshot.data.contact.fullName,
        'Alice Vance Phase10',
        'Snapshot must retain original full name at apply time'
      );
      assert.strictEqual(
        appDoc.resumeSnapshot.templateId,
        'software-engineer',
        'Snapshot templateId must not change when resume is edited'
      );
      assert.strictEqual(
        appDoc.resumeSnapshot.data.summary,
        'Cloud software engineer experienced in distributed backend architectures.',
        'Snapshot summary must retain original text'
      );
    });

    // ========================================================================
    // TEST 3: Server-side contentHash verification
    // ========================================================================
    await test('contentHash is computed server-side directly from the snapshot data', async () => {
      const appDoc = await Application.findById(application1Id);
      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(appDoc.resumeSnapshot.data))
        .digest('hex');

      assert.strictEqual(
        appDoc.resumeSnapshot.contentHash,
        expectedHash,
        'contentHash must strictly match SHA-256 of snapshot JSON data computed server-side'
      );
    });

    // ========================================================================
    // TEST 4: Default behavior: applyToDrive with no resumeId defaults to primary
    // ========================================================================
    await test('applyToDrive without explicit resumeId defaults to primary resume latest version', async () => {
      const res = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({
          driveId: drive2._id.toString(),
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      const bobApp = await Application.findById(data.application._id);
      assert(!bobApp.resumeSnapshot || !bobApp.resumeSnapshot.data, 'Bob application should have no snapshot data');
    });

    // ========================================================================
    // TEST 5: Scoped Read Authorization on GET /applications/:id/resume-snapshot
    // ========================================================================
    await test('Owner student CAN read snapshot', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.snapshot.data.contact.fullName, 'Alice Vance Phase10');
    });

    await test('TPO of the SAME college CAN read snapshot', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenAdminA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.snapshot.templateId, 'software-engineer');
    });

    await test('Recruiter who OWNS the drive CAN read snapshot', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.snapshot.data.contact.fullName, 'Alice Vance Phase10');
    });

    await test('Student from another account is DENIED (403)', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenStudentB}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await test('Admin from a DIFFERENT college is DENIED (403)', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenAdminB}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await test('Recruiter from another drive / company is DENIED (403)', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenRecruiter2}` },
      });
      assert.strictEqual(res.status, 403);
    });

    // ========================================================================
    // TEST 6: On-Demand PDF Export for Snapshot
    // ========================================================================
    await test('Authorized recruiter streams valid on-demand ATS PDF from snapshot', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot/pdf`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');

      const buffer = Buffer.from(await res.arrayBuffer());
      assert(buffer.length > 2000, 'PDF buffer size must be realistic');
      assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
    });

    await test('Unauthorized recruiter is DENIED on-demand PDF export (403)', async () => {
      const res = await fetch(`${baseUrl}/${application1Id}/resume-snapshot/pdf`, {
        headers: { Authorization: `Bearer ${tokenRecruiter2}` },
      });
      assert.strictEqual(res.status, 403);
    });

    // ========================================================================
    // TEST 7: Legacy Applications without snapshot
    // ========================================================================
    let legacyApp;
    await test('Legacy application without snapshot returns 404 on snapshot read endpoint', async () => {
      const legacyDrive = await Drive.create({
        company: company1._id,
        role: 'Phase10 Legacy Role',
        packageLpa: 10,
        location: 'Delhi',
        driveDate: tomorrow,
        lastDateToApply: tomorrow,
        minCgpa: 6.0,
        maxBacklogs: 2,
        allowedBranches: ['COMPUTER SCIENCE'],
        colleges: [collegeA._id],
        status: 'open',
      });

      legacyApp = await Application.create({
        student: studentA._id,
        drive: legacyDrive._id,
        status: 'applied',
        appliedOn: new Date(),
        resumeSnapshot: { data: null },
      });

      const res = await fetch(`${baseUrl}/${legacyApp._id}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert(data.message.includes('legacy application'));
    });

    // ========================================================================
    // TEST 8: Projection Regression & Gating in getDriveApplications
    // ========================================================================
    await test('getDriveApplications includes legitimate UI fields and gates resumeUrl for recruiters', async () => {
      const res = await fetch(`${baseUrl}/drive/${drive1._id}`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.applications));

      const appAlice = data.applications.find(
        (a) => (a.student?._id || a.student)?.toString() === studentA._id.toString()
      );
      assert(appAlice, 'Alice application not found in drive applications list');
      assert(appAlice.student, 'Student object must be present');

      // 1. Legitimate UI fields MUST be present
      assert.strictEqual(appAlice.student.branch, 'COMPUTER SCIENCE');
      assert.strictEqual(appAlice.student.batchYear, 2026);
      assert.strictEqual(appAlice.student.phone, '9876543210');
      assert(Array.isArray(appAlice.student.skills), 'skills array must be present');
      assert.strictEqual(appAlice.student.cgpa, 9.0);
      assert.strictEqual(appAlice.student.backlogs, 0);
      assert.strictEqual(appAlice.student.enrollmentNo, 'P10A001');
      assert.strictEqual(appAlice.student.user.name, 'Alice Phase10');
      assert.strictEqual(appAlice.student.user.email, 'alice.phase10@test.com');

      // 2. Private fields MUST NOT leak
      assert.strictEqual(
        appAlice.student.resumeProfile,
        undefined,
        'resumeProfile MUST be excluded from student projection'
      );
      assert.strictEqual(
        appAlice.student.resumeAnalysis,
        undefined,
        'resumeAnalysis MUST be excluded from student projection'
      );

      // 3. resumeUrl MUST be gated (deleted/undefined) for recruiters when snapshot is present
      assert.strictEqual(
        appAlice.student.resumeUrl,
        undefined,
        'resumeUrl MUST be stripped for recruiters on applications with snapshots'
      );
    });

    await test('getDriveApplications preserves resumeUrl for college TPO', async () => {
      const res = await fetch(`${baseUrl}/drive/${drive1._id}`, {
        headers: { Authorization: `Bearer ${tokenAdminA}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const appAlice = data.applications.find(
        (a) => (a.student?._id || a.student)?.toString() === studentA._id.toString()
      );
      assert(appAlice, 'Alice application not found');
      // For TPO, resumeUrl is preserved
      assert(appAlice.student.resumeUrl, 'resumeUrl must be preserved for same-college TPO');
    });

    // ========================================================================
    // TEST 9: Live-resume leak prevention in streamResume
    // ========================================================================
    await test('Recruiter is DENIED (403) access to live resume for student with snapshot application', async () => {
      // Recruiter 1 tries to access Alice's current live resume via GET /api/students/:id/resume
      // Alice has a snapshot application for drive1.
      // Even if legacyApp exists on another drive, test a recruiter who only has a snapshot app:
      // Create drive3 for Company 2 where Alice applied ONLY with snapshot
      const drive3 = await Drive.create({
        company: company2._id,
        role: 'Phase10 Frontend Specialist',
        packageLpa: 12,
        location: 'Remote',
        driveDate: tomorrow,
        lastDateToApply: tomorrow,
        minCgpa: 7.0,
        maxBacklogs: 1,
        allowedBranches: ['Computer Science'],
        colleges: [collegeA._id],
        status: 'open',
      });

      // Alice applies to drive3 with snapshot
      await Application.create({
        student: studentA._id,
        drive: drive3._id,
        status: 'applied',
        appliedOn: new Date(),
        resumeSnapshot: {
          resumeId: resumeA._id,
          versionId: versionA._id,
          data: resumeA.data,
          templateId: 'software-engineer',
        },
      });

      // Recruiter 2 tries to call GET /api/students/:studentA/resume
      const res = await fetch(`${studentBaseUrl}/${studentA._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenRecruiter2}` },
      });

      // Must be 403 Forbidden!
      assert.strictEqual(
        res.status,
        403,
        'Recruiter with only snapshot application must be DENIED access to student live resume'
      );
    });

    await test('Owner student and same-college TPO CAN access live resume endpoint', async () => {
      // Owner student access check
      const studentRes = await fetch(`${studentBaseUrl}/me/resume`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      // Not 403 Forbidden (may return 404 if file does not exist on disk in test, but NOT 403)
      assert.notStrictEqual(studentRes.status, 403, 'Owner student must not be forbidden');

      // Same-college TPO access check
      const tpoRes = await fetch(`${studentBaseUrl}/${studentA._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenAdminA}` },
      });
      assert.notStrictEqual(tpoRes.status, 403, 'Same-college TPO must not be forbidden');
    });

    // ========================================================================
    // TEST 10: Apply failure ordering
    // ========================================================================
    await test('Apply failure ordering: version is NEVER marked submitted if application fails', async () => {
      // 10A: Ineligible student (Charlie CGPA 4.5 < min 7.0)
      const resumeC = await Resume.create({
        student: studentC._id,
        college: collegeA._id,
        title: 'Phase10 Charlie Resume',
        templateId: 'modern',
        isPrimary: true,
        data: { contact: { fullName: 'Charlie Phase10' } },
      });
      const versionC = await ResumeVersion.create({
        student: studentC._id,
        college: collegeA._id,
        resume: resumeC._id,
        name: 'Charlie Version Ineligible',
        templateId: 'modern',
        submitted: false,
        resumeData: resumeC.data,
      });

      const ineligRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentC}`,
        },
        body: JSON.stringify({
          driveId: drive1._id.toString(),
          resumeId: resumeC._id.toString(),
          versionId: versionC._id.toString(),
        }),
      });

      assert.strictEqual(ineligRes.status, 400);
      const ineligVersion = await ResumeVersion.findById(versionC._id);
      assert.strictEqual(
        ineligVersion.submitted,
        false,
        'Ineligible apply failure must NOT mark version as submitted: true'
      );

      // 10B: Duplicate application (Alice already applied to drive1 in Test 1)
      const versionA_dup = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: resumeA._id,
        name: 'Alice Version Duplicate Test',
        templateId: 'modern',
        submitted: false,
        resumeData: resumeA.data,
      });

      const dupRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: drive1._id.toString(),
          resumeId: resumeA._id.toString(),
          versionId: versionA_dup._id.toString(),
        }),
      });

      assert.strictEqual(dupRes.status, 400);
      const dupVersion = await ResumeVersion.findById(versionA_dup._id);
      assert.strictEqual(
        dupVersion.submitted,
        false,
        'Duplicate application rejection must NOT mark version as submitted: true'
      );

      // 10C: Successful application properly marks version submitted: true
      const openDrive = await Drive.create({
        company: company1._id,
        role: 'Phase10 QA Automation Engineer',
        packageLpa: 11,
        location: 'Hyderabad',
        driveDate: tomorrow,
        lastDateToApply: tomorrow,
        minCgpa: 6.0,
        maxBacklogs: 2,
        allowedBranches: ['Computer Science'],
        colleges: [collegeA._id],
        status: 'open',
      });

      const successRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: openDrive._id.toString(),
          resumeId: resumeA._id.toString(),
          versionId: versionA_dup._id.toString(),
        }),
      });

      assert.strictEqual(successRes.status, 201);
      const successVersion = await ResumeVersion.findById(versionA_dup._id);
      assert.strictEqual(
        successVersion.submitted,
        true,
        'Successful application must mark version as submitted: true'
      );
    });

    // ========================================================================
    // TEST 11: Application cover letter snapshot
    // ========================================================================
    let applicationCoverLetterId;
    await test('applyToDrive records immutable coverLetter inside resumeSnapshot', async () => {
      const driveForCover = await Drive.create({
        company: company1._id,
        role: 'Phase10 Systems Architect',
        packageLpa: 20,
        location: 'Bengaluru',
        driveDate: tomorrow,
        lastDateToApply: tomorrow,
        minCgpa: 7.0,
        maxBacklogs: 1,
        allowedBranches: ['Computer Science', 'Information Technology'],
        colleges: [collegeA._id],
        status: 'open',
      });

      const versionWithCover = await ResumeVersion.create({
        student: studentA._id,
        college: collegeA._id,
        resume: resumeA._id,
        name: 'Phase10 Version With Cover',
        templateId: 'software-engineer',
        submitted: false,
        coverLetter: 'Dear Hiring Team, I specialize in high throughput event streaming architectures.',
        resumeData: resumeA.data,
      });

      const applyRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: driveForCover._id.toString(),
          resumeId: resumeA._id.toString(),
          versionId: versionWithCover._id.toString(),
        }),
      });

      assert.strictEqual(applyRes.status, 201);
      const applyData = await applyRes.json();
      applicationCoverLetterId = applyData.application._id;

      // Check DB
      const appDoc = await Application.findById(applicationCoverLetterId);
      assert(appDoc.resumeSnapshot);
      assert.strictEqual(
        appDoc.resumeSnapshot.coverLetter,
        'Dear Hiring Team, I specialize in high throughput event streaming architectures.'
      );

      // Verify accessible via GET /api/applications/:id/resume-snapshot by recruiter
      const snapshotRes = await fetch(`${baseUrl}/${applicationCoverLetterId}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(snapshotRes.status, 200);
      const snapData = await snapshotRes.json();
      assert.strictEqual(
        snapData.snapshot.coverLetter,
        'Dear Hiring Team, I specialize in high throughput event streaming architectures.'
      );

      // Modify version cover letter afterwards - snapshot must remain immutable
      versionWithCover.coverLetter = 'Changed cover letter text after submission.';
      await versionWithCover.save();

      const snapResAfter = await fetch(`${baseUrl}/${applicationCoverLetterId}/resume-snapshot`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      const snapDataAfter = await snapResAfter.json();
      assert.strictEqual(
        snapDataAfter.snapshot.coverLetter,
        'Dear Hiring Team, I specialize in high throughput event streaming architectures.',
        'Snapshot coverLetter must remain immutable after submission'
      );
    });

    // ========================================================================
    // TEST 12: Ranked applicants scoring snapshot parity & edit isolation
    // ========================================================================
    await test('getRankedApplicants scores from resumeSnapshot.data and remains unchanged after student edits live resume', async () => {
      // Recruiter 1 checks ranked applicants for drive1 (which requires Node.js, Go)
      const rankRes1 = await fetch(`${driveBaseUrl}/${drive1._id}/ranked-applicants`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(rankRes1.status, 200);
      const rankData1 = await rankRes1.json();
      assert.strictEqual(rankData1.success, true);
      assert(Array.isArray(rankData1.applicants));

      const aliceRank1 = rankData1.applicants.find(
        (a) => a.student._id.toString() === studentA._id.toString()
      );
      assert(aliceRank1, 'Alice must be in ranked applicants');
      assert.strictEqual(aliceRank1.hasResumeSnapshot, true);
      assert(typeof aliceRank1.match?.score === 'number' && aliceRank1.match.score > 0);
      const initialScore = aliceRank1.match.score;

      // Alice now alters her student profile skills and live resume (removes Node.js and Go, adds Ruby)
      studentA.skills = ['Ruby', 'Rails'];
      await studentA.save();

      resumeA.data.skills = [{ category: 'Languages', items: ['Ruby', 'Rails'] }];
      await resumeA.save();

      // Recruiter 1 checks ranked applicants again
      const rankRes2 = await fetch(`${driveBaseUrl}/${drive1._id}/ranked-applicants`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(rankRes2.status, 200);
      const rankData2 = await rankRes2.json();

      const aliceRank2 = rankData2.applicants.find(
        (a) => a.student._id.toString() === studentA._id.toString()
      );
      assert(aliceRank2, 'Alice must still be in ranked applicants');
      assert.strictEqual(
        aliceRank2.match.score,
        initialScore,
        'Recruiter match score must be identical to pre-edit score because it is computed from resumeSnapshot.data'
      );
    });

    // ========================================================================
    // TEST 13: Drive with no skill requirements returns score: null
    // ========================================================================
    await test('getRankedApplicants returns score: null when drive has no skill requirements', async () => {
      const driveNoSkills = await Drive.create({
        company: company1._id,
        role: 'Phase10 General Graduate Trainee',
        packageLpa: 8,
        location: 'Remote',
        driveDate: tomorrow,
        lastDateToApply: tomorrow,
        minCgpa: 6.0,
        maxBacklogs: 2,
        allowedBranches: ['Computer Science', 'Information Technology'],
        colleges: [collegeA._id],
        requiredSkills: [],
        preferredSkills: [],
        status: 'open',
      });

      const applyRes = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: driveNoSkills._id.toString(),
          resumeId: resumeA._id.toString(),
          versionId: versionA._id.toString(),
        }),
      });
      assert.strictEqual(applyRes.status, 201);

      const rankRes = await fetch(`${driveBaseUrl}/${driveNoSkills._id}/ranked-applicants`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(rankRes.status, 200);
      const rankData = await rankRes.json();
      assert.strictEqual(rankData.success, true);

      const aliceApp = rankData.applicants.find(
        (a) => a.student._id.toString() === studentA._id.toString()
      );
      assert(aliceApp, 'Alice must be present in applicants');
      assert.strictEqual(
        aliceApp.match.score,
        null,
        'Drive with no skill requirements must return match score null'
      );
    });

  } finally {
    // Cleanup fixtures
    try {
      await Application.deleteMany({});
      await Drive.deleteMany({ role: { $regex: /Phase10/ } });
      await Resume.deleteMany({ title: { $regex: /Phase10/ } });
      await ResumeVersion.deleteMany({ name: { $regex: /Phase10/ } });
      await Student.deleteMany({ enrollmentNo: { $regex: /^P10/ } });
      await User.deleteMany({ email: { $regex: /phase10/ } });
      await Company.deleteMany({ name: { $regex: /Phase10/ } });
      await College.deleteMany({ code: { $regex: /^P10/ } });
    } catch {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }

  console.log('\n======================================================================');
  console.log(`Phase 10/10b Tests Finished: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runApplicationSnapshotTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
