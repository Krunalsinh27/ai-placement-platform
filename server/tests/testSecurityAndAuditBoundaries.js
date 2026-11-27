const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri, assertTestDatabase } = require('./testHelper');

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  JobRequirement,
  DriveRequest,
  Round,
  RoundParticipant,
  Question,
  TestAttempt,
} = require('../models');

async function runSecurityAuditTests() {
  console.log('--- 1. Connecting to MongoDB Test Database ---');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);
  console.log('✓ Connected safely to test DB:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/job-requirements', require('../routes/jobRequirementRoutes'));
  app.use('/api/drive-requests', require('../routes/driveRequestRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/tests', require('../routes/testRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));

  const PORT = 5130;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  SECURITY, CROSS-TENANT & BOUNDARY AUDIT TEST SUITE   ');
    console.log('======================================================\n');

    const runId = Date.now();

    // 2. Clean up old test data
    await Company.deleteMany({ name: { $regex: /^Audit Company/ } });
    await College.deleteMany({ code: { $in: [`AUD_A_${runId}`.slice(0, 10), `AUD_B_${runId}`.slice(0, 10)] } });
    await User.deleteMany({ email: { $regex: /@audittest\.(com|edu)$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^AUD_/ } });

    // 3. Create Companies and Colleges
    const company1 = await Company.create({
      name: `Audit Company 1 ${runId}`,
      industry: 'Cybersecurity',
      verified: true,
    });

    const company2 = await Company.create({
      name: `Audit Company 2 ${runId}`,
      industry: 'Finance',
      verified: true,
    });

    const collegeA = await College.create({
      name: `Audit College A ${runId}`,
      code: `AUDA${runId % 10000}`,
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
      verified: true,
    });

    const collegeB = await College.create({
      name: `Audit College B ${runId}`,
      code: `AUDB${runId % 10000}`,
      city: 'Chennai',
      state: 'Tamil Nadu',
      status: 'approved',
      verified: true,
    });

    // 4. Create Users
    const recruiter1 = await User.create({
      name: 'Recruiter 1',
      email: `rec1_${runId}@audittest.com`,
      password: 'Password123!',
      role: 'recruiter',
      company: company1._id,
      isApproved: true,
    });

    const recruiter2 = await User.create({
      name: 'Recruiter 2',
      email: `rec2_${runId}@audittest.com`,
      password: 'Password123!',
      role: 'recruiter',
      company: company2._id,
      isApproved: true,
    });

    const tpoA = await User.create({
      name: 'TPO College A',
      email: `tpo_a_${runId}@audittest.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
    });

    const tpoB = await User.create({
      name: 'TPO College B',
      email: `tpo_b_${runId}@audittest.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
    });

    const studentUser = await User.create({
      name: 'Audit Student 1',
      email: `stud_${runId}@audittest.edu`,
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
    });

    const studentProfile = await Student.create({
      user: studentUser._id,
      college: collegeA._id,
      enrollmentNo: `AUD_${runId % 100000}`,
      department: 'CSE',
      branch: 'CSE',
      phone: '9876543210',
      batchYear: 2026,
      degree: 'B.Tech',
      cgpa: 9.0,
      skills: ['Security', 'Node.js'],
    });

    // Helper: generate auth header
    const tokenFor = (user) => {
      const token = jwt.sign(
        { id: user._id, role: user.role, college: user.college, company: user.company },
        process.env.JWT_SECRET || 'testsecret',
        { expiresIn: '1h' }
      );
      return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    };

    const headersRec1 = tokenFor(recruiter1);
    const headersRec2 = tokenFor(recruiter2);
    const headersTpoA = tokenFor(tpoA);
    const headersTpoB = tokenFor(tpoB);
    const headersStudent = tokenFor(studentUser);

    console.log('✓ Test fixtures, users, and tokens initialized');

    // 5. Create Job Requirement & Initial Drive Request
    const jobReq = await JobRequirement.create({
      company: company1._id,
      title: 'Security Analyst 2026',
      description: 'Analyze vulnerabilities and harden infrastructure',
      packageLpa: 15.0,
      openings: 3,
      batchYear: 2026,
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      location: 'Bangalore',
      selectionRounds: ['Round 1: Online Aptitude', 'Round 2: Technical'],
      status: 'published',
    });

    const driveReq = await DriveRequest.create({
      jobRequirement: jobReq._id,
      company: company1._id,
      college: collegeA._id,
      title: 'Security Drive - College A',
      status: 'pending',
      proposedDates: [new Date(Date.now() + 86400000)],
    });

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 1: Early TPO Finalization Guard ---');
    // ------------------------------------------------------------------------
    const finalizePayload = {
      finalDriveDate: new Date(Date.now() + 86400000).toISOString(),
      venueOrMeetingLink: 'Campus Auditorium',
      lastDateToApply: new Date(Date.now() + 43200000).toISOString(),
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      note: 'Attempting finalize',
    };

    // TPO A attempts to finalize a 'pending' request
    let earlyFinalizeRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
      method: 'PUT',
      headers: headersTpoA,
      body: JSON.stringify(finalizePayload),
    });
    assert.strictEqual(earlyFinalizeRes.status, 400, 'TPO should not be able to finalize pending request');
    const earlyFinalizeJson = await earlyFinalizeRes.json();
    assert.ok(
      earlyFinalizeJson.message.includes('before recruiter confirms'),
      `Expected confirmation guard error message, got: ${earlyFinalizeJson.message}`
    );
    console.log('✓ Guard verified: TPO blocked with 400 when attempting to finalize pending request');

    // TPO A accepts the request (transitions to 'accepted')
    const proposedDate = new Date(Date.now() + 2 * 86400000);
    const acceptRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/respond`, {
      method: 'PUT',
      headers: headersTpoA,
      body: JSON.stringify({
        action: 'accept',
        selectedDate: proposedDate.toISOString(),
        note: 'Accepted by TPO A',
      }),
    });
    assert.strictEqual(acceptRes.status, 200, 'TPO A accept should succeed');

    // TPO A attempts to finalize while request is in 'accepted' (before recruiter confirmation)
    earlyFinalizeRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
      method: 'PUT',
      headers: headersTpoA,
      body: JSON.stringify(finalizePayload),
    });
    assert.strictEqual(earlyFinalizeRes.status, 400, 'TPO should not be able to finalize accepted request before recruiter confirms');
    console.log('✓ Guard verified: TPO blocked with 400 when attempting to finalize accepted (unconfirmed) request');

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 2: Cross-Tenant Isolation Security ---');
    // ------------------------------------------------------------------------
    // Recruiter 2 (from Company 2) attempts to confirm Company 1's request
    const crossRecConfirmRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/confirm-schedule`, {
      method: 'PUT',
      headers: headersRec2,
      body: JSON.stringify({ selectedDate: proposedDate.toISOString(), note: 'Malicious confirm from wrong company' }),
    });
    assert.strictEqual(crossRecConfirmRes.status, 403, 'Cross-company recruiter confirmation must be rejected with 403');
    console.log('✓ Cross-tenant check passed: Unauthorized recruiter blocked with 403');

    // Legitimate Recruiter 1 confirms the request
    const legitConfirmRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/confirm-schedule`, {
      method: 'PUT',
      headers: headersRec1,
      body: JSON.stringify({ selectedDate: proposedDate.toISOString(), note: 'Schedule confirmed by Company 1' }),
    });
    assert.strictEqual(legitConfirmRes.status, 200, 'Recruiter 1 confirmation must succeed');
    console.log('✓ Recruiter 1 confirmed request successfully (status is recruiter_confirmed)');

    // TPO B (from College B) attempts to finalize College A's request
    const crossTpoFinalizeRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
      method: 'PUT',
      headers: headersTpoB,
      body: JSON.stringify(finalizePayload),
    });
    assert.strictEqual(crossTpoFinalizeRes.status, 403, 'Cross-college TPO finalize must be rejected with 403');
    console.log('✓ Cross-tenant check passed: Unauthorized TPO blocked with 403');

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 3: Finalize Idempotency & Drive Publication ---');
    // ------------------------------------------------------------------------
    // TPO A finalizes legitimately
    const legitFinalizeRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
      method: 'PUT',
      headers: headersTpoA,
      body: JSON.stringify(finalizePayload),
    });
    assert.strictEqual(legitFinalizeRes.status, 200, 'Legitimate TPO finalize must succeed');
    const legitFinalizeJson = await legitFinalizeRes.json();
    const createdDriveId = legitFinalizeJson.drive._id;
    assert.ok(createdDriveId, 'Created drive ID should be returned');
    assert.strictEqual(legitFinalizeJson.drive.isPublished, true, 'Published drive must have isPublished: true');
    console.log('✓ TPO A finalized and published drive:', createdDriveId);

    // Call finalize a second time (idempotency check)
    const repeatFinalizeRes = await fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
      method: 'PUT',
      headers: headersTpoA,
      body: JSON.stringify(finalizePayload),
    });
    assert.strictEqual(repeatFinalizeRes.status, 200, 'Repeated finalize must succeed idempotently');
    const repeatFinalizeJson = await repeatFinalizeRes.json();
    assert.strictEqual(
      repeatFinalizeJson.drive._id.toString(),
      createdDriveId.toString(),
      'Repeated finalize must return existing drive and not duplicate'
    );
    const driveCount = await Drive.countDocuments({ company: company1._id, college: collegeA._id });
    assert.strictEqual(driveCount, 1, 'Only exactly 1 drive should exist for this request');
    console.log('✓ Idempotency verified: Repeat finalize call returned existing drive without duplicates');

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 4: Drive Publication Safety Filter ---');
    // ------------------------------------------------------------------------
    // Create an unpublished draft drive (isPublished: false)
    const draftDrive = await Drive.create({
      company: company2._id,
      college: collegeA._id,
      role: 'Secret Agent',
      packageLpa: 12.0,
      location: 'Remote',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 86400000),
      driveDate: new Date(Date.now() + 2 * 86400000),
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
      isPublished: false,
    });

    // Create a historical drive with undefined isPublished (simulating pre-existing record on disk)
    const historicalDrive = await Drive.create({
      company: company1._id,
      college: collegeA._id,
      role: 'Developer',
      packageLpa: 10.0,
      location: 'Bangalore',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 86400000),
      driveDate: new Date(Date.now() + 2 * 86400000),
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
    });
    // Remove the field directly at MongoDB driver level to simulate legacy disk state
    await Drive.collection.updateOne({ _id: historicalDrive._id }, { $unset: { isPublished: '' } });

    // Student fetches eligible drives
    const studentDrivesRes = await fetch(`${BASE_URL}/drives/eligible`, {
      headers: headersStudent,
    });
    assert.strictEqual(studentDrivesRes.status, 200);
    const studentDrivesJson = await studentDrivesRes.json();
    console.log('Visible drive IDs:', studentDrivesJson.data.map(d => ({ id: d._id, title: d.role || d.title, isPublished: d.isPublished })));
    const driveIdsVisible = studentDrivesJson.data.map((d) => d._id.toString());

    assert.ok(
      driveIdsVisible.includes(createdDriveId.toString()),
      'Student must see published drive (isPublished: true)'
    );
    assert.ok(
      driveIdsVisible.includes(historicalDrive._id.toString()),
      'Student must see historical drive (isPublished: undefined)'
    );
    assert.ok(
      !driveIdsVisible.includes(draftDrive._id.toString()),
      'Student MUST NOT see unpublished draft drive (isPublished: false)'
    );
    console.log('✓ Publication safety verified: isPublished:false is hidden; isPublished:true and legacy records are visible');

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 5: Application Deadline vs Enrolled Assessment Window ---');
    // ------------------------------------------------------------------------
    // Apply student to the published drive
    const applyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: headersStudent,
      body: JSON.stringify({ driveId: createdDriveId }),
    });
    assert.strictEqual(applyRes.status, 201, 'Student application must succeed');
    console.log('✓ Student applied to published drive');

    // Create Round 1
    const testStart = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago (open now)
    const testEnd = new Date(Date.now() + 60 * 60 * 1000);   // 60 mins from now

    const round1 = await Round.create({
      drive: createdDriveId,
      name: 'Round 1: Security Aptitude',
      order: 1,
      type: 'aptitude',
      deliveryMode: 'platform_test',
      testWindowStart: testStart,
      testWindowEnd: testEnd,
      durationMinutes: 30,
      totalMarks: 4,
      questionCount: 1,
      cutoffScore: 50,
      showScoreToStudents: true,
      status: 'scheduled',
    });

    const q1 = await Question.create({
      round: round1._id,
      text: 'Which protocol secures web traffic?',
      options: ['HTTP', 'HTTPS', 'FTP', 'SMTP'],
      correctIndex: 1,
      marks: 4,
      order: 1,
    });

    // Recruiter publishes assessment (auto-enrolls existing applicants)
    const publishAssessRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-assessment`, {
      method: 'PUT',
      headers: headersRec1,
    });
    assert.strictEqual(publishAssessRes.status, 200, 'Publish assessment should succeed');
    console.log('✓ Round 1 configured and assessment published (applicant enrolled)');

    // Now CLOSE the drive's application window
    await Drive.findByIdAndUpdate(createdDriveId, {
      applicationsClosed: true,
      lastDateToApply: new Date(Date.now() - 3600000), // deadline passed 1 hr ago
    });
    console.log('✓ Drive application window closed (applicationsClosed: true, deadline in past)');

    // Verify non-enrolled student is blocked from applying now
    const studentUser2 = await User.create({
      name: 'Late Student',
      email: `late_${runId}@audittest.edu`,
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
    });
    await Student.create({
      user: studentUser2._id,
      college: collegeA._id,
      enrollmentNo: `AUD_LATE_${runId % 10000}`,
      department: 'CSE',
      branch: 'CSE',
      phone: '9876543211',
      batchYear: 2026,
      degree: 'B.Tech',
      cgpa: 8.5,
      skills: ['Java'],
    });
    const headersStudent2 = tokenFor(studentUser2);

    const lateApplyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: headersStudent2,
      body: JSON.stringify({ driveId: createdDriveId }),
    });
    assert.strictEqual(lateApplyRes.status, 400, 'Late application should be rejected with 400');
    console.log('✓ Late application blocked when applicationsClosed is true');

    // Enrolled student starts test despite closed application window
    const startTestRes = await fetch(`${BASE_URL}/tests/${round1._id}/start`, {
      method: 'POST',
      headers: headersStudent,
    });
    assert.strictEqual(startTestRes.status, 200, 'Enrolled candidate MUST be able to start test despite closed application window');
    const startTestJson = await startTestRes.json();
    assert.ok(startTestJson.attemptId, 'Attempt ID created successfully');
    console.log('✓ Boundary check passed: Enrolled student starts test despite closed drive application window');

    // Submit test answers
    const ansRes = await fetch(`${BASE_URL}/tests/${round1._id}/answer`, {
      method: 'PUT',
      headers: headersStudent,
      body: JSON.stringify({ questionId: q1._id, selectedIndex: 1 }),
    });
    assert.strictEqual(ansRes.status, 200, 'Answer save must succeed');

    const submitRes = await fetch(`${BASE_URL}/tests/${round1._id}/submit`, {
      method: 'POST',
      headers: headersStudent,
      body: JSON.stringify({ reason: 'normal' }),
    });
    assert.strictEqual(submitRes.status, 200, 'Test submission must succeed');
    console.log('✓ Boundary check passed: Enrolled student submitted test successfully');

    // ------------------------------------------------------------------------
    console.log('\n--- AUDIT 6: Student Score Privacy & Results Publication Guard ---');
    // ------------------------------------------------------------------------
    // Student checks tests
    const myTestsRes = await fetch(`${BASE_URL}/students/my-tests`, {
      headers: headersStudent,
    });
    assert.strictEqual(myTestsRes.status, 200);
    const myTestsJson = await myTestsRes.json();
    const candidateTest = myTestsJson.tests.find((t) => t.roundId.toString() === round1._id.toString());
    assert.ok(candidateTest, 'Candidate test found in my-tests');
    assert.strictEqual(candidateTest.status, 'submitted', 'Test status is submitted');

    // Participant result must remain 'pending' before recruiter publishes results
    const participantDoc = await RoundParticipant.findOne({ round: round1._id, student: studentProfile._id });
    assert.strictEqual(participantDoc.result, 'pending', 'Candidate round result must be pending prior to explicit publication');

    const roundDoc = await Round.findById(round1._id);
    assert.strictEqual(roundDoc.resultsPublished, false, 'Round resultsPublished must be false prior to recruiter publication');
    console.log('✓ Privacy verified: Candidate outcome is "pending" and round results are unpublished');

    console.log('\n======================================================');
    console.log('  ALL AUDIT & SECURITY BOUNDARY CHECKS PASSED!        ');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('✓ Disconnected from test database');
  }
}

runSecurityAuditTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Audit Test Failed:', err);
    process.exit(1);
  });
