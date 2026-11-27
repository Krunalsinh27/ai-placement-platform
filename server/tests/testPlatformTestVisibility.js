const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

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
  Round,
  RoundParticipant,
  Question,
  TestAttempt,
} = require('../models');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

async function runTest() {
  console.log('Connecting to Test Database...');
  const testDbUri = getTestDbUri();
  assertTestDatabase(testDbUri);
  await mongoose.connect(testDbUri);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/tests', require('../routes/testRoutes'));
  app.use('/api/questions', require('../routes/questionRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.statusCode || err.status || 500).json({
      success: false,
      message: err.message,
    });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const BASE_URL = `http://127.0.0.1:${port}/api`;
  console.log(`Test server running at ${BASE_URL}`);

  try {
    console.log('\n======================================================');
    console.log('   STEP 1 REPRODUCTION: PLATFORM TEST VISIBILITY      ');
    console.log('======================================================\n');

    // Clean test data
    await User.deleteMany({ email: /@test-vis\.edu/ });
    await Student.deleteMany({ enrollmentNo: /VIS/ });
    await College.deleteMany({ code: 'VIS_COL' });
    await Company.deleteMany({ name: 'Vis Corp' });
    await Drive.deleteMany({ role: 'Vis Test Engineer' });
    await Round.deleteMany({});
    await RoundParticipant.deleteMany({});
    await Question.deleteMany({});
    await Application.deleteMany({});
    await TestAttempt.deleteMany({});

    // 1. Fixture Setup
    const college = await College.create({
      name: 'Visibility Test Engineering College',
      code: 'VIS_COL',
      city: 'Vadodara',
      state: 'Gujarat',
      status: 'approved',
    });

    const company = await Company.create({
      name: 'Vis Corp',
      industry: 'Technology',
      status: 'approved',
    });

    const recruiterUser = await User.create({
      name: 'Vis Recruiter',
      email: 'recruiter@test-vis.edu',
      password: 'Password123!',
      role: 'recruiter',
      company: company._id,
      isEmailVerified: true,
      isApproved: true,
    });
    const recruiterToken = createToken(recruiterUser);

    const tpoUser = await User.create({
      name: 'Vis TPO',
      email: 'tpo@test-vis.edu',
      password: 'Password123!',
      role: 'tpo',
      college: college._id,
      isEmailVerified: true,
      isApproved: true,
    });
    const tpoToken = createToken(tpoUser);

    const studentUser = await User.create({
      name: 'Vis Student 1',
      email: 'student1@test-vis.edu',
      password: 'Password123!',
      role: 'student',
      college: college._id,
      isEmailVerified: true,
      isApproved: true,
    });
    const studentToken = createToken(studentUser);

    const student = await Student.create({
      user: studentUser._id,
      college: college._id,
      enrollmentNo: 'VIS001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
    });

    const drive = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Vis Test Engineer',
      title: 'Vis Test Engineer',
      packageLpa: 12,
      location: 'Vadodara',
      minCgpa: 6.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 86400000),
      status: 'open',
      driveDate: new Date(),
    });

    const application = await Application.create({
      drive: drive._id,
      student: student._id,
      status: 'applied',
    });

    console.log('✓ Fixture created: Drive, Student, Recruiter, TPO');

    // 2. Initialize Pipeline via TPO freeze
    const freezeRes = await fetch(`${BASE_URL}/drives/${drive._id}/freeze`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}`, 'Content-Type': 'application/json' },
    });
    const freezeData = await freezeRes.json();
    console.log('✓ Pipeline initialized:', freezeData.message);

    const rounds = await Round.find({ drive: drive._id }).sort({ order: 1 });
    console.log(`✓ Drive has ${rounds.length} rounds created`);
    const round1 = rounds[0];
    const round2 = rounds[1];

    const r1Participants = await RoundParticipant.find({ round: round1._id });
    console.log(`✓ Round 1 participant count: ${r1Participants.length}`);
    if (r1Participants.length === 0) {
      throw new Error('FAIL: Round 1 has no participants after pipeline initialization');
    }

    // 3. Recruiter sets Round 1 to platform_test with valid test window starting in 2 seconds
    const now = new Date();
    const windowStart = new Date(now.getTime() + 2000).toISOString(); // starts in 2 seconds
    const windowEnd = new Date(now.getTime() + 120 * 60 * 1000).toISOString(); // ends in 2h

    console.log('\n--- Step A: Recruiter updates Round 1 settings to platform_test ---');
    const settingsRes = await fetch(`${BASE_URL}/rounds/${round1._id}/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Round 1: Online Aptitude Assessment',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        testWindowStart: windowStart,
        testWindowEnd: windowEnd,
        durationMinutes: 45,
        notifyStudents: false,
      }),
    });
    const settingsData = await settingsRes.json();
    console.log('✓ Round 1 settings update response:', settingsRes.status, settingsData.message);

    const updatedRound1 = await Round.findById(round1._id);
    console.log(`✓ Round 1 in DB: deliveryMode="${updatedRound1.deliveryMode}", type="${updatedRound1.type}", windowStart=${updatedRound1.testWindowStart}, windowEnd=${updatedRound1.testWindowEnd}`);

    // 4. Recruiter adds question 1 manually
    console.log('\n--- Step B: Recruiter adds Question 1 manually ---');
    const q1Res = await fetch(`${BASE_URL}/rounds/${round1._id}/questions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'What is the worst-case time complexity of QuickSort?',
        options: ['O(n log n)', 'O(n^2)', 'O(n)', 'O(1)'],
        correctIndex: 1,
        marks: 2,
        section: 'Algorithms',
      }),
    });
    const q1Data = await q1Res.json();
    console.log('✓ Question 1 added:', q1Res.status, `QuestionCount=${q1Data.questionCount}, TotalMarks=${q1Data.totalMarks}`);

    // 5. Recruiter imports questions via CSV
    console.log('\n--- Step C: Recruiter imports questions via CSV ---');
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      'What data structure uses FIFO?,Queue,Stack,Tree,Graph,A,1,0,Data Structures',
      'Which sorting algorithm is stable?,MergeSort,QuickSort,HeapSort,SelectionSort,A,1,0,Data Structures',
    ].join('\n');

    const importRes = await fetch(`${BASE_URL}/rounds/${round1._id}/questions/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvData,
        answerFormat: 'letter',
      }),
    });
    const importData = await importRes.json();
    console.log('✓ CSV Import response:', importRes.status, importData.message);

    const questionsInDb = await Question.find({ round: round1._id });
    console.log(`✓ Questions in DB for Round 1: ${questionsInDb.length}`);

    // Wait for window to open
    console.log('Waiting 2.5s for test window to open...');
    await new Promise((r) => setTimeout(r, 2500));

    // 5B. Test Readiness Endpoint for Round 1
    console.log('\n--- Step C2: Recruiter & TPO call GET /api/rounds/:id/test-readiness ---');
    const r1ReadinessRes = await fetch(`${BASE_URL}/rounds/${round1._id}/test-readiness`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    const r1Readiness = await r1ReadinessRes.json();
    console.log('✓ Round 1 Test Readiness (Recruiter):', r1ReadinessRes.status, {
      isPlatformTest: r1Readiness.isPlatformTest,
      isReady: r1Readiness.isReady,
      visibleStudentCount: r1Readiness.visibleStudentCount,
      checks: r1Readiness.checks?.map((c) => ({ key: c.key, ok: c.ok, message: c.message })),
    });

    if (!r1Readiness.isReady || r1Readiness.visibleStudentCount !== 1) {
      throw new Error(`FAIL: Expected Round 1 isReady=true, visibleStudentCount=1, got isReady=${r1Readiness.isReady}, count=${r1Readiness.visibleStudentCount}`);
    }

    const tpoReadinessRes = await fetch(`${BASE_URL}/rounds/${round1._id}/test-readiness`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    console.log('✓ Round 1 Test Readiness (TPO):', tpoReadinessRes.status);
    if (tpoReadinessRes.status !== 200) {
      throw new Error(`FAIL: Expected TPO to access test-readiness with 200, got ${tpoReadinessRes.status}`);
    }

    // Invalid ObjectId Zod check
    const invalidIdRes = await fetch(`${BASE_URL}/rounds/invalid-id/test-readiness`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    const invalidIdBody = await invalidIdRes.json();
    console.log('✓ Invalid ID validation check:', invalidIdRes.status, invalidIdBody);
    if (invalidIdRes.status !== 400) {
      throw new Error(`FAIL: Expected 400 for invalid ID format, got ${invalidIdRes.status}`);
    }

    // Tenant Isolation Check: foreign company recruiter & foreign college TPO
    const foreignCompany = await Company.create({ name: 'Foreign Corp', industry: 'Finance', status: 'approved' });
    const foreignRecruiter = await User.create({
      name: 'Foreign Recruiter',
      email: 'recruiter2@test-vis.edu',
      password: 'Password123!',
      role: 'recruiter',
      company: foreignCompany._id,
      isEmailVerified: true,
      isApproved: true,
    });
    const foreignRecruiterToken = createToken(foreignRecruiter);

    const foreignRecruiterRes = await fetch(`${BASE_URL}/rounds/${round1._id}/test-readiness`, {
      headers: { Authorization: `Bearer ${foreignRecruiterToken}` },
    });
    console.log('✓ Foreign recruiter tenant isolation check:', foreignRecruiterRes.status);
    if (foreignRecruiterRes.status !== 403) {
      throw new Error(`FAIL: Expected 403 for foreign recruiter, got ${foreignRecruiterRes.status}`);
    }

    const foreignCollege = await College.create({ name: 'Foreign College', code: 'FOR_COL', city: 'Surat', state: 'Gujarat', status: 'approved' });
    const foreignTpo = await User.create({
      name: 'Foreign TPO',
      email: 'tpo2@test-vis.edu',
      password: 'Password123!',
      role: 'tpo',
      college: foreignCollege._id,
      isEmailVerified: true,
      isApproved: true,
    });
    const foreignTpoToken = createToken(foreignTpo);

    const foreignTpoRes = await fetch(`${BASE_URL}/rounds/${round1._id}/test-readiness`, {
      headers: { Authorization: `Bearer ${foreignTpoToken}` },
    });
    console.log('✓ Foreign TPO college isolation check:', foreignTpoRes.status);
    if (foreignTpoRes.status !== 403) {
      throw new Error(`FAIL: Expected 403 for foreign TPO, got ${foreignTpoRes.status}`);
    }

    // 6. Student calls GET /api/students/my-tests
    console.log('\n--- Step D: Student calls GET /api/students/my-tests ---');
    const studentTestsRes = await fetch(`${BASE_URL}/students/my-tests`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentTestsData = await studentTestsRes.json();
    console.log('✓ Student my-tests response:', studentTestsRes.status, `Returned ${studentTestsData.tests?.length} tests`);
    const foundR1Test = studentTestsData.tests?.find(
      (t) => t.roundId.toString() === round1._id.toString()
    );

    if (!foundR1Test) {
      console.error('❌ BUG CONFIRMED: Student CANNOT see Round 1 test in GET /api/students/my-tests!');
      console.log('Returned tests array:', JSON.stringify(studentTestsData.tests, null, 2));
    } else {
      console.log('✓ Round 1 Test found for student:', {
        roundId: foundR1Test.roundId,
        roundName: foundR1Test.roundName,
        attemptStatus: foundR1Test.attemptStatus,
        status: foundR1Test.status,
        questionCount: foundR1Test.questionCount,
        totalMarks: foundR1Test.totalMarks,
      });
    }

    // 7. Student calls POST /api/tests/:roundId/start
    console.log('\n--- Step E: Student starts Round 1 test ---');
    const startRes = await fetch(`${BASE_URL}/tests/${round1._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    });
    const startData = await startRes.json();
    console.log('✓ Test start response:', startRes.status, startData.message);

    // 8. Round 2 Test: Student not yet enrolled until Round 1 results published
    console.log('\n--- Step F: Round 2 Visibility Check Before Results Published ---');
    if (round2) {
      const r2Start = new Date(Date.now() + 1000).toISOString();
      const r2End = new Date(Date.now() + 120 * 60 * 1000).toISOString();

      // Recruiter configures Round 2 as platform_test with valid window
      await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Round 2: Coding Assessment',
          type: 'coding',
          deliveryMode: 'platform_test',
          testWindowStart: r2Start,
          testWindowEnd: r2End,
          durationMinutes: 60,
        }),
      });

      await fetch(`${BASE_URL}/rounds/${round2._id}/questions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Implement binary search in JavaScript',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex: 0,
          marks: 5,
        }),
      });

      const r2StudentTests1 = await fetch(`${BASE_URL}/students/my-tests`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const r2Data1 = await r2StudentTests1.json();
      const foundR2Test1 = r2Data1.tests?.find(
        (t) => t.roundId.toString() === round2._id.toString()
      );
      console.log(`✓ Student sees Round 2 before Round 1 published? ${Boolean(foundR2Test1)} (Expected: false)`);

      // Verify Round 2 Readiness BEFORE results published
      const r2ReadinessBeforeRes = await fetch(`${BASE_URL}/rounds/${round2._id}/test-readiness`, {
        headers: { Authorization: `Bearer ${recruiterToken}` },
      });
      const r2ReadinessBefore = await r2ReadinessBeforeRes.json();
      console.log('✓ Round 2 Readiness before Round 1 published:', {
        isReady: r2ReadinessBefore.isReady,
        visibleStudentCount: r2ReadinessBefore.visibleStudentCount,
        participantsMessage: r2ReadinessBefore.checks?.find((c) => c.key === 'participants')?.message,
      });

      if (r2ReadinessBefore.visibleStudentCount !== 0) {
        throw new Error(`FAIL: Expected visibleStudentCount=0 for Round 2 before Round 1 published, got ${r2ReadinessBefore.visibleStudentCount}`);
      }
      if (!r2ReadinessBefore.checks?.find((c) => c.key === 'participants')?.message?.includes('Students join this round only after Round 1 results are published')) {
        throw new Error(`FAIL: Expected Round 2 message to inform that students join after Round 1 results published`);
      }

      // Recruiter publishes Round 1 results with student cleared
      console.log('\n--- Step G: Recruiter publishes Round 1 results (clearing student) ---');
      await fetch(`${BASE_URL}/rounds/${round1._id}/results`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultsList: [
            {
              participantId: r1Participants[0]._id,
              result: 'cleared',
              score: 90,
            },
          ],
        }),
      });

      const pubRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-results`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${recruiterToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendAnnouncement: false }),
      });
      const pubData = await pubRes.json();
      console.log('✓ Round 1 results published:', pubData.message);

      const r2Participants = await RoundParticipant.find({ round: round2._id });
      console.log(`✓ Round 2 participant count now: ${r2Participants.length}`);

      const r2StudentTests2 = await fetch(`${BASE_URL}/students/my-tests`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const r2Data2 = await r2StudentTests2.json();
      const foundR2Test2 = r2Data2.tests?.find(
        (t) => t.roundId.toString() === round2._id.toString()
      );
      console.log(`✓ Student sees Round 2 after Round 1 published? ${Boolean(foundR2Test2)} (Expected: true)`);
      if (foundR2Test2) {
        console.log('✓ Round 2 Test details for student:', {
          roundId: foundR2Test2.roundId,
          roundName: foundR2Test2.roundName,
          status: foundR2Test2.status,
        });
      }
    }

    console.log('\n======================================================');
    console.log('             REPRODUCTION RUN FINISHED                ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ REPRODUCTION ERROR:', err);
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTest();
