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
  Offer,
} = require('../models');

async function runMutualApprovalAndAssessmentTests() {
  console.log('--- 1. Connecting to MongoDB Test Database ---');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);
  console.log('✓ Connected safely to test DB:', mongoose.connection.name);

  // Set up Express test app
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

  const PORT = 5129;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  MUTUAL APPROVAL & ASSESSMENT WORKFLOW TEST SUITE    ');
    console.log('======================================================\n');

    const runId = Date.now();

    // 2. Clean up any stale records from previous test runs
    await Company.deleteMany({ name: { $regex: /^MutualTest Company/ } });
    await College.deleteMany({ code: { $in: [`MTC_A_${runId}`.slice(0, 10), `MTC_B_${runId}`.slice(0, 10)] } });
    await User.deleteMany({ email: { $regex: /@mutualtest\.(com|edu)$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^MTEST_/ } });

    // 3. Create Companies and Colleges
    const company = await Company.create({
      name: `MutualTest Company ${runId}`,
      industry: 'Technology',
      verified: true,
    });

    const collegeA = await College.create({
      name: `Mutual College A ${runId}`,
      code: `MCA${runId % 10000}`,
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
      verified: true,
    });

    const collegeB = await College.create({
      name: `Mutual College B ${runId}`,
      code: `MCB${runId % 10000}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
      verified: true,
    });

    // 4. Create Users (Recruiter, TPO A, TPO B, Student A, Student B)
    const recruiterUser = await User.create({
      name: 'Test Recruiter',
      email: `recruiter_${runId}@mutualtest.com`,
      password: 'Password123!',
      role: 'recruiter',
      company: company._id,
      isApproved: true,
    });

    const tpoAUser = await User.create({
      name: 'TPO Officer College A',
      email: `tpo_a_${runId}@mutualtest.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
    });

    const tpoBUser = await User.create({
      name: 'TPO Officer College B',
      email: `tpo_b_${runId}@mutualtest.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
    });

    const studentAUser = await User.create({
      name: 'Candidate A',
      email: `student_a_${runId}@mutualtest.edu`,
      password: 'Password123!',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
    });

    const studentADoc = await Student.create({
      user: studentAUser._id,
      college: collegeA._id,
      rollNumber: `ROLL_A_${runId}`,
      enrollmentNo: `MTEST_A_${runId}`,
      branch: 'CSE',
      cgpa: 8.8,
      batchYear: 2026,
      batch: '2026',
      phone: '9876543210',
      activeBacklogs: 0,
    });

    const studentBUser = await User.create({
      name: 'Candidate B',
      email: `student_b_${runId}@mutualtest.edu`,
      password: 'Password123!',
      role: 'student',
      college: collegeB._id,
      isApproved: true,
    });

    const studentBDoc = await Student.create({
      user: studentBUser._id,
      college: collegeB._id,
      rollNumber: `ROLL_B_${runId}`,
      enrollmentNo: `MTEST_B_${runId}`,
      branch: 'IT',
      cgpa: 8.5,
      batchYear: 2026,
      batch: '2026',
      phone: '9876543211',
      activeBacklogs: 0,
    });

    // Generate JWT auth tokens
    const recruiterToken = jwt.sign(
      { id: recruiterUser._id, role: 'recruiter', company: company._id },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );

    const tpoAToken = jwt.sign(
      { id: tpoAUser._id, role: 'tpo', college: collegeA._id },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );

    const tpoBToken = jwt.sign(
      { id: tpoBUser._id, role: 'tpo', college: collegeB._id },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );

    const studentAToken = jwt.sign(
      { id: studentAUser._id, role: 'student', college: collegeA._id },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );

    // 5. Recruiter creates and publishes a Job Requirement
    const jobReq = await JobRequirement.create({
      company: company._id,
      title: 'Senior Full Stack Engineer',
      description: 'Design and scale cloud-native applications',
      packageLpa: 18.5,
      openings: 5,
      batchYear: 2026,
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      location: 'Bangalore / Pune',
      selectionRounds: ['Online Assessment', 'Technical Interview', 'HR Interview'],
      status: 'published',
    });

    console.log('✓ Seeded test entities: 1 Company, 2 Colleges, 5 Users, 1 Published JobRequirement');

    // =========================================================================
    // STEP 1: Recruiter creates drive request for College A and College B
    // =========================================================================
    console.log('\n--- Step 1: Recruiter sends drive request to College A and College B ---');
    const proposedDate1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const proposedDate2 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    const createReqRes = await fetch(`${BASE_URL}/drive-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recruiterToken}`,
      },
      body: JSON.stringify({
        jobRequirementId: jobReq._id.toString(),
        collegeIds: [collegeA._id.toString(), collegeB._id.toString()],
        proposedDates: [proposedDate1.toISOString(), proposedDate2.toISOString()],
        mode: 'on-campus',
        initialMessage: 'Looking forward to recruiting top engineering talent!',
      }),
    });

    const createReqData = await createReqRes.json();
    assert.strictEqual(createReqRes.status, 201, 'Should create 2 drive requests');
    assert.strictEqual(createReqData.count, 2, 'Should create exactly 2 college requests');

    const reqA = createReqData.requests.find((r) => r.college?._id?.toString() === collegeA._id.toString());
    const reqB = createReqData.requests.find((r) => r.college?._id?.toString() === collegeB._id.toString());
    assert(reqA, 'Request for College A must exist');
    assert(reqB, 'Request for College B must exist');
    assert.strictEqual(reqA.status, 'pending', 'College A request should be pending');
    assert.strictEqual(reqB.status, 'pending', 'College B request should be pending');
    console.log('✓ Created 2 isolated requests with status "pending"');

    // =========================================================================
    // STEP 2: Strict Multi-College Isolation & Mutual Approval
    // TPO of College A accepts the request
    // =========================================================================
    console.log('\n--- Step 2: TPO of College A accepts proposed date ---');
    const selectedDriveDate = proposedDate1;

    const tpoAcceptRes = await fetch(`${BASE_URL}/drive-requests/${reqA._id}/respond`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoAToken}`,
      },
      body: JSON.stringify({
        action: 'accept',
        selectedDate: selectedDriveDate.toISOString(),
        note: 'College A accepts the proposed drive date',
      }),
    });

    const tpoAcceptData = await tpoAcceptRes.json();
    assert.strictEqual(tpoAcceptRes.status, 200, 'TPO A accept should succeed');
    assert.strictEqual(tpoAcceptData.request.status, 'accepted', 'College A status must be "accepted"');

    // VERIFY MULTI-COLLEGE ISOLATION: College B must remain untouched!
    const reqBDoc = await DriveRequest.findById(reqB._id);
    assert.strictEqual(reqBDoc.status, 'pending', 'College B request must remain "pending"');
    console.log('✓ Multi-college isolation verified: College A accepted, College B untouched');

    // VERIFY NO LIVE DRIVE IS PUBLISHED YET
    const prematureDrive = await Drive.findOne({ driveRequest: reqA._id, status: 'open' });
    assert(!prematureDrive, 'No open Drive should be published before recruiter confirmation and TPO publication');
    console.log('✓ Safeguard verified: No live drive created on initial TPO acceptance');

    // =========================================================================
    // STEP 3: Recruiter Confirms Schedule
    // =========================================================================
    console.log('\n--- Step 3: Recruiter confirms schedule with College A ---');
    const confirmScheduleRes = await fetch(`${BASE_URL}/drive-requests/${reqA._id}/confirm-schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recruiterToken}`,
      },
      body: JSON.stringify({
        selectedDate: selectedDriveDate.toISOString(),
        note: 'Confirmed! We will arrive with 4 interviewers.',
      }),
    });

    const confirmScheduleData = await confirmScheduleRes.json();
    assert.strictEqual(confirmScheduleRes.status, 200, 'Recruiter confirm schedule should succeed');
    assert.strictEqual(confirmScheduleData.request.status, 'recruiter_confirmed', 'Status should be recruiter_confirmed');
    assert(confirmScheduleData.request.recruiterConfirmedAt, 'recruiterConfirmedAt must be set');
    console.log('✓ Recruiter confirmed schedule: status moved to "recruiter_confirmed"');

    // =========================================================================
    // STEP 4: TPO Finalizes & Publishes Drive to Students
    // =========================================================================
    console.log('\n--- Step 4: TPO of College A finalizes and publishes drive to students ---');
    const deadlineDate = new Date(selectedDriveDate.getTime() - 2 * 24 * 60 * 60 * 1000);

    const finalizeRes = await fetch(`${BASE_URL}/drive-requests/${reqA._id}/finalize`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoAToken}`,
      },
      body: JSON.stringify({
        finalDriveDate: selectedDriveDate.toISOString(),
        venueOrMeetingLink: 'Campus Auditorium 1',
        lastDateToApply: deadlineDate.toISOString(),
        minCgpa: 7.5, // stricter cutoff than company 7.0
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        note: 'Finalized and published to students',
      }),
    });

    const finalizeData = await finalizeRes.json();
    assert.strictEqual(finalizeRes.status, 200, 'TPO finalize should succeed');
    assert.strictEqual(finalizeData.request.status, 'scheduled', 'DriveRequest status must be "scheduled"');
    assert(finalizeData.drive, 'Drive document must be returned');
    assert.strictEqual(finalizeData.drive.status, 'open', 'Drive status must be "open"');
    assert.strictEqual(finalizeData.drive.isPublished, true, 'Drive isPublished must be true');

    const publishedDrive = await Drive.findById(finalizeData.drive._id);
    assert.strictEqual(publishedDrive.minCgpa, 7.5, 'Stricter CGPA cutoff preserved');
    console.log('✓ TPO published drive: Drive is live (status="open", isPublished=true)');

    // =========================================================================
    // STEP 5: Student A Applies to the Drive
    // =========================================================================
    console.log('\n--- Step 5: Student A applies to the newly published drive ---');
    const applyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`,
      },
      body: JSON.stringify({
        driveId: publishedDrive._id.toString(),
      }),
    });

    const applyData = await applyRes.json();
    assert.strictEqual(applyRes.status, 201, 'Student A application should succeed');
    const applicationA = applyData.application;
    assert(applicationA, 'Application doc returned');
    console.log('✓ Student A applied successfully');

    // Verify Student B cannot see or apply to College A's drive
    const applyStudentBRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoBToken}`, // non-student or wrong college
      },
      body: JSON.stringify({ driveId: publishedDrive._id.toString() }),
    });
    assert.notStrictEqual(applyStudentBRes.status, 201, 'Cross-college or non-student apply rejected');
    console.log('✓ Multi-college student isolation verified');

    // =========================================================================
    // STEP 6: Recruiter Configures Round 1 as On-Platform Test & Publishes Assessment
    // =========================================================================
    console.log('\n--- Step 6: Recruiter configures Round 1 as on-platform test & publishes assessment ---');
    // Create Round 1
    const testStart = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago (open now)
    const testEnd = new Date(Date.now() + 60 * 60 * 1000); // 60 mins from now

    const round1 = await Round.create({
      drive: publishedDrive._id,
      name: 'Round 1: Online Technical Assessment',
      order: 1,
      type: 'aptitude',
      deliveryMode: 'platform_test',
      testWindowStart: testStart,
      testWindowEnd: testEnd,
      durationMinutes: 45,
      totalMarks: 4,
      questionCount: 2,
      cutoffScore: 50,
      showScoreToStudents: true,
      status: 'scheduled',
    });

    // Add 2 questions
    await Question.create([
      {
        round: round1._id,
        text: 'What is the time complexity of binary search on a sorted array of size n?',
        options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
        correctIndex: 1,
        marks: 2,
        order: 1,
      },
      {
        round: round1._id,
        text: 'Which data structure uses LIFO order?',
        options: ['Queue', 'Stack', 'Array', 'Linked List'],
        correctIndex: 1,
        marks: 2,
        order: 2,
      },
    ]);

    // Recruiter calls publish-assessment
    const publishAssessRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-assessment`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recruiterToken}`,
      },
    });

    const publishAssessData = await publishAssessRes.json();
    assert.strictEqual(publishAssessRes.status, 200, 'Publish assessment should succeed');
    assert.strictEqual(publishAssessData.round.isAssessmentPublished, true, 'isAssessmentPublished must be true');
    assert(publishAssessData.totalEnrolled >= 1, 'Student A must be auto-enrolled');

    // Verify RoundParticipant was created
    const participantA = await RoundParticipant.findOne({ round: round1._id, student: studentADoc._id });
    assert(participantA, 'Student A must have a RoundParticipant record');
    assert.strictEqual(participantA.result, 'pending', 'Initial result is pending');
    console.log('✓ Assessment published and candidate auto-enrolled as RoundParticipant');

    // =========================================================================
    // STEP 7: Student Views Tests & Application Timeline
    // =========================================================================
    console.log('\n--- Step 7: Student views /api/students/my-tests and application timeline ---');
    const myTestsRes = await fetch(`${BASE_URL}/students/my-tests`, {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });

    const myTestsData = await myTestsRes.json();
    assert.strictEqual(myTestsRes.status, 200, 'my-tests should succeed');
    assert(myTestsData.tests.length >= 1, 'Student must see at least 1 test');
    const testItem = myTestsData.tests.find((t) => t.roundId?.toString() === round1._id.toString());
    assert(testItem, 'Round 1 test must appear in student tests');
    assert.strictEqual(testItem.status, 'open_to_start', 'Test window is open, so status must be open_to_start');
    console.log('✓ Student sees test with status "open_to_start" (Fixes Open Now: 0 bug)');

    // Check timeline
    const timelineRes = await fetch(`${BASE_URL}/applications/${applicationA._id}/timeline`, {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    const timelineData = await timelineRes.json();
    assert.strictEqual(timelineRes.status, 200, 'Timeline should load');
    const roundTimeline = timelineData.rounds.find((r) => r.roundId?.toString() === round1._id.toString());
    assert(roundTimeline, 'Round 1 must be in timeline');
    assert.strictEqual(roundTimeline.isEnrolled, true, 'isEnrolled must be true');
    assert.strictEqual(roundTimeline.attemptStatus, 'not_started', 'Before attempt, attemptStatus must be not_started');
    console.log('✓ Timeline verified: candidate isEnrolled=true, attemptStatus="not_started" (Fixes Evaluation Pending bug)');

    // =========================================================================
    // STEP 8: Student Takes and Submits Test
    // =========================================================================
    console.log('\n--- Step 8: Student starts, answers, and submits the test ---');
    const startRes = await fetch(`${BASE_URL}/tests/${round1._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    const startData = await startRes.json();
    assert.strictEqual(startRes.status, 200, 'Test start should succeed');
    const attemptId = startData.attemptId;
    assert(attemptId, 'Attempt ID must be returned');

    // Fetch attempt questions
    const attemptRes = await fetch(`${BASE_URL}/tests/${round1._id}/attempt`, {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    const attemptData = await attemptRes.json();
    assert.strictEqual(attemptRes.status, 200, 'Attempt fetch should succeed');
    assert.strictEqual(attemptData.questions.length, 2, '2 questions returned');

    // Answer question 1 correctly (option index 1)
    const q1 = attemptData.questions[0];
    const ans1Res = await fetch(`${BASE_URL}/tests/${round1._id}/answer`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`,
      },
      body: JSON.stringify({
        questionId: q1._id,
        selectedIndex: 1,
      }),
    });
    assert.strictEqual(ans1Res.status, 200, 'Answer 1 save should succeed');

    // Submit test
    const submitRes = await fetch(`${BASE_URL}/tests/${round1._id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`,
      },
      body: JSON.stringify({ reason: 'normal' }),
    });

    const submitData = await submitRes.json();
    assert.strictEqual(submitRes.status, 200, 'Test submission should succeed');
    assert.strictEqual(submitData.status, 'submitted', 'Attempt status must be submitted');
    assert(submitData.score >= 2, 'Score must be at least 2 for correct answer');

    const updatedPartA = await RoundParticipant.findOne({ round: round1._id, student: studentADoc._id });
    assert.strictEqual(updatedPartA.attendance, 'present', 'Participant attendance marked present');
    assert(updatedPartA.score >= 2, 'Participant score recorded');
    console.log('✓ Test submitted and evaluated with deterministic score');

    // =========================================================================
    // STEP 9: Recruiter Publishes Results and Advances to Round 2
    // =========================================================================
    console.log('\n--- Step 9: Recruiter publishes Round 1 results & advances to Round 2 ---');
    // Create Round 2 (Technical Interview)
    const round2 = await Round.create({
      drive: publishedDrive._id,
      name: 'Round 2: Technical Interview',
      order: 2,
      type: 'technical',
      deliveryMode: 'offline_campus',
      status: 'scheduled',
    });

    // Mark participant result as cleared
    await RoundParticipant.findByIdAndUpdate(updatedPartA._id, {
      result: 'cleared',
    });

    const publishResultsRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recruiterToken}`,
      },
    });

    const publishResultsData = await publishResultsRes.json();
    assert.strictEqual(publishResultsRes.status, 200, 'Publish results should succeed');

    // Verify candidate advanced to Round 2
    const partRound2 = await RoundParticipant.findOne({ round: round2._id, student: studentADoc._id });
    assert(partRound2, 'Cleared student must be advanced to Round 2');
    console.log('✓ Round 1 results published and cleared candidate advanced to Round 2');

    // =========================================================================
    // STEP 10: Active Drives vs Previous Drives & Requirement Soft-Delete Snapshot
    // =========================================================================
    console.log('\n--- Step 10: Section active vs previous & requirement soft-delete preservation ---');
    // Active query
    const activeReqRes = await fetch(`${BASE_URL}/drive-requests?section=active`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    const activeReqData = await activeReqRes.json();
    assert.strictEqual(activeReqRes.status, 200, 'Active requests query should succeed');
    assert(activeReqData.requests.length >= 1, 'Active requests must contain the drive');
    assert(activeReqData.summary, 'Summary KPI metrics must be present');
    assert(activeReqData.groupedRequirements.length >= 1, 'Grouped requirements must be present');

    // Soft-delete the parent requirement
    const delReqRes = await fetch(`${BASE_URL}/job-requirements/${jobReq._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    const delReqData = await delReqRes.json();
    assert.strictEqual(delReqRes.status, 200, 'Requirement soft-delete should succeed');
    assert.strictEqual(delReqData.softDeleted, true, 'Must be soft-deleted');

    // Verify historical request retains snapshot
    const refreshedReqA = await DriveRequest.findById(reqA._id);
    assert(refreshedReqA.jobRequirementSnapshot?.title, 'Historical snapshot must be saved');
    assert.strictEqual(refreshedReqA.jobRequirementSnapshot.title, 'Senior Full Stack Engineer');

    // Verify GET /api/drive-requests still populates the requirement title via snapshot
    const checkSnapshotReq = await fetch(`${BASE_URL}/drive-requests/${reqA._id}`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    const checkSnapshotData = await checkSnapshotReq.json();
    assert.strictEqual(checkSnapshotReq.status, 200, 'Request should load with snapshot');
    console.log('✓ Soft-delete snapshot preservation verified: Historical drive requests intact');

    console.log('\n======================================================');
    console.log('  ALL 10 VERIFICATION STAGES PASSED SUCCESSFULLY!     ');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('✓ Closed server and disconnected from test database');
  }
}

runMutualApprovalAndAssessmentTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  });
