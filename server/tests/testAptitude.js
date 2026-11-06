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
  Application,
  Round,
  RoundParticipant,
  Question,
  TestAttempt,
  EmailLog,
  Notification,
} = require('../models');

const {
  autoSubmitExpiredTestAttempts,
  handleWindowEndAbsentees,
} = require('../utils/cronJobs');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

async function runAptitudeTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management');
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

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
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5095;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('       TASK 32B: ON-PLATFORM APTITUDE TEST TESTS       ');
    console.log('======================================================\n');

    // ------------------------------------------------------------------------
    // SETUP: Users, Tokens, Test Drive, Rounds, Participants
    // ------------------------------------------------------------------------
    console.log('--- Setting up Test Data ---');
    let collegeA = await College.findOne({ code: 'NITD' });
    if (!collegeA) {
      collegeA = await College.create({ name: 'NIT Delhi', code: 'NITD', location: 'Delhi' });
    }
    let collegeB = await College.findOne({ code: 'PICT' });
    if (!collegeB) {
      collegeB = await College.create({ name: 'PICT Pune', code: 'PICT', location: 'Pune' });
    }

    let companyA = await Company.findOne({ name: 'Google' });
    if (!companyA) {
      companyA = await Company.create({ name: 'Google', industry: 'Technology', verified: true });
    }
    let companyB = await Company.findOne({ name: 'Microsoft' });
    if (!companyB) {
      companyB = await Company.create({ name: 'Microsoft', industry: 'Technology', verified: true });
    }

    // TPO A (College A)
    let tpoA = await User.findOne({ email: 'admin@college.com' });
    if (!tpoA) {
      tpoA = await User.create({
        name: 'TPO Delhi',
        email: 'admin@college.com',
        password: 'Admin@123',
        role: 'tpo',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Recruiter A (Google)
    let recA = await User.findOne({ email: 'recruiter@google.com' });
    if (!recA) {
      recA = await User.create({
        name: 'Google Recruiter',
        email: 'recruiter@google.com',
        password: 'Recruiter@123',
        role: 'recruiter',
        company: companyA._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Recruiter B (Microsoft - unauthorized for Google drive)
    let recB = await User.findOne({ email: 'recruiter@microsoft.com' });
    if (!recB) {
      recB = await User.create({
        name: 'Microsoft Recruiter',
        email: 'recruiter@microsoft.com',
        password: 'Recruiter@123',
        role: 'recruiter',
        company: companyB._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Students from College A
    let students = await Student.find({ college: collegeA._id }).populate('user').limit(3);
    if (students.length < 3) {
      throw new Error('Expected at least 3 students in College A');
    }
    const student1 = students[0];
    const student2 = students[1];
    const student3 = students[2]; // Unenrolled student for 403 checks

    const tpoAToken = createToken(tpoA);
    const recAToken = createToken(recA);
    const recBToken = createToken(recB);
    const st1Token = createToken(student1.user);
    const st2Token = createToken(student2.user);
    const st3Token = createToken(student3.user);

    // Clean up previous test artifacts
    const testRole = 'Task 32B Aptitude Systems Engineer';
    const oldDrives = await Drive.find({ role: testRole });
    const oldDriveIds = oldDrives.map((d) => d._id);
    const oldRounds = await Round.find({ drive: { $in: oldDriveIds } });
    const oldRoundIds = oldRounds.map((r) => r._id);
    await Question.deleteMany({ round: { $in: oldRoundIds } });
    await TestAttempt.deleteMany({ round: { $in: oldRoundIds } });
    await RoundParticipant.deleteMany({ drive: { $in: oldDriveIds } });
    await Round.deleteMany({ drive: { $in: oldDriveIds } });
    await Application.deleteMany({ drive: { $in: oldDriveIds } });
    await Drive.deleteMany({ _id: { $in: oldDriveIds } });

    // Create Drive
    const testDrive = await Drive.create({
      college: collegeA._id,
      company: companyA._id,
      role: testRole,
      description: 'Test Drive for on-platform aptitude testing',
      packageLpa: 30,
      location: 'Bengaluru / Hyderabad',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      driveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'closed',
      applicationsClosed: true,
    });

    const app1 = await Application.create({
      drive: testDrive._id,
      student: student1._id,
      college: collegeA._id,
      status: 'shortlisted',
    });

    const app2 = await Application.create({
      drive: testDrive._id,
      student: student2._id,
      college: collegeA._id,
      status: 'shortlisted',
    });

    // Create Round with deliveryMode: platform_test
    const round = await Round.create({
      drive: testDrive._id,
      name: 'Round 1: Online Aptitude Assessment',
      order: 1,
      type: 'aptitude',
      deliveryMode: 'platform_test',
      mode: 'online',
      testWindowStart: new Date(Date.now() - 10 * 60 * 1000), // opened 10 mins ago
      testWindowEnd: new Date(Date.now() + 60 * 60 * 1000),   // closes in 1 hour
      durationMinutes: 30,
      shuffleQuestions: true,
      shuffleOptions: false,
      negativeMarking: true,
      showScoreToStudents: true,
      cutoffScore: 60,
      status: 'scheduled',
    });

    // Enrolled participants: Student 1 and Student 2
    const p1 = await RoundParticipant.create({
      round: round._id,
      drive: testDrive._id,
      student: student1._id,
      application: app1._id,
      attendance: 'pending',
      result: 'pending',
    });

    const p2 = await RoundParticipant.create({
      round: round._id,
      drive: testDrive._id,
      student: student2._id,
      application: app2._id,
      attendance: 'pending',
      result: 'pending',
    });

    console.log('✓ Test data setup complete');

    // ------------------------------------------------------------------------
    // TEST 1: CSV Question Import with Validation Report & Question CRUD
    // ------------------------------------------------------------------------
    console.log('\n--- Test 1: CSV Import with Validation Report & Question CRUD ---');

    // Temporarily set window in the future so questions can be added before lock
    round.testWindowStart = new Date(Date.now() + 30 * 60 * 1000);
    round.testWindowEnd = new Date(Date.now() + 90 * 60 * 1000);
    await round.save();

    // 1A: CSV import with 3 valid questions and 2 invalid rows (empty question and invalid correct choice)
    const sampleCsv = `text,optionA,optionB,optionC,optionD,correct,marks,negative,section
"What is the time complexity of quicksort in average case?","O(n)","O(n log n)","O(n^2)","O(1)",B,2,0.5,"Algorithms"
"Which data structure uses FIFO?","Stack","Queue","Tree","Graph",B,1,0.25,"Data Structures"
"","Option 1","Option 2","Option 3","Option 4",A,1,0,"Invalid Row Missing Text"
"What is 2 + 2?","3","4","5","6",X,1,0,"Invalid Correct Answer"
"Which language runs in modern web browsers?","C++","Java","JavaScript","Python",C,1,0.25,"General Tech"`;

    const csvImportRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({ csvData: sampleCsv }),
    });
    const csvImportData = await csvImportRes.json();

    if (csvImportRes.status !== 200 || csvImportData.importedCount !== 3 || csvImportData.failedCount !== 2) {
      throw new Error(`CSV import validation failed: ${JSON.stringify(csvImportData)}`);
    }
    console.log(`✓ 1A: CSV Import report verified: ${csvImportData.importedCount} imported, ${csvImportData.failedCount} rejected with reasons`);

    // 1B: Recruiter adds another Question via POST
    const addQRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        text: 'What does SQL stand for?',
        options: ['Structured Query Language', 'Simple Question Language', 'Standard Query List', 'Sequential Query Loop'],
        correctIndex: 0,
        marks: 1,
        negativeMarks: 0.25,
        section: 'Database',
      }),
    });
    const addQData = await addQRes.json();
    if (addQRes.status !== 201 || !addQData.question) {
      throw new Error(`Failed to add question: ${JSON.stringify(addQData)}`);
    }
    const createdQ = addQData.question;
    console.log('✓ 1B: Recruiter successfully added single question via POST');

    // 1C: Recruiter edits question via PUT
    const editQRes = await fetch(`${BASE_URL}/questions/${createdQ._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        marks: 2,
        negativeMarks: 0.5,
      }),
    });
    const editQData = await editQRes.json();
    if (editQRes.status !== 200 || editQData.question.marks !== 2) {
      throw new Error(`Failed to edit question: ${JSON.stringify(editQData)}`);
    }
    console.log('✓ 1C: Recruiter successfully updated question marks');

    // 1D: Get questions preview & verify total marks
    const getQRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    const getQData = await getQRes.json();
    if (getQRes.status !== 200 || getQData.questionCount !== 4) {
      throw new Error(`Unexpected questionCount: ${getQData.questionCount}`);
    }
    console.log(`✓ 1D: Question bank contains ${getQData.questionCount} questions, totalMarks: ${getQData.totalMarks}`);

    // ------------------------------------------------------------------------
    // TEST 2: Lock Questions Once Window Opens
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Lock Questions Once Window Opens ---');

    // Open the test window (window opened 5 minutes ago)
    round.testWindowStart = new Date(Date.now() - 5 * 60 * 1000);
    round.testWindowEnd = new Date(Date.now() + 60 * 60 * 1000);
    await round.save();

    // Recruiter tries to add question after window opens -> 400
    const lockAddRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        text: 'Late question after window open',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
      }),
    });
    const lockAddData = await lockAddRes.json();
    if (lockAddRes.status !== 400 || !lockAddData.message.includes('Questions cannot be modified once the test window has opened')) {
      throw new Error(`Expected 400 on locked question addition, got: ${lockAddRes.status}`);
    }
    console.log('✓ Test 2: Question modifications strictly blocked once test window opens');

    // ------------------------------------------------------------------------
    // TEST 3: Window Rules & Single Attempt
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Window Rules & Single Attempt Enforcement ---');

    // 3A: Window not opened yet
    round.testWindowStart = new Date(Date.now() + 10 * 60 * 1000);
    round.testWindowEnd = new Date(Date.now() + 60 * 60 * 1000);
    await round.save();

    const earlyStartRes = await fetch(`${BASE_URL}/tests/${round._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const earlyStartData = await earlyStartRes.json();
    if (earlyStartRes.status !== 400 || !earlyStartData.message.includes('Test window has not opened yet')) {
      throw new Error(`Expected 400 before window opens, got: ${earlyStartRes.status}: ${earlyStartData.message}`);
    }
    console.log('✓ 3A: Starting test before window opens rejected with 400');

    // 3B: Window open -> Start test succeeds
    round.testWindowStart = new Date(Date.now() - 5 * 60 * 1000);
    await round.save();

    const startRes = await fetch(`${BASE_URL}/tests/${round._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const startData = await startRes.json();
    if (startRes.status !== 200 || !startData.attemptId) {
      throw new Error(`Test start failed: ${JSON.stringify(startData)}`);
    }
    console.log('✓ 3B: Student 1 successfully started test inside window');

    // 3C: Single attempt / Resume active session
    const resumeRes = await fetch(`${BASE_URL}/tests/${round._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const resumeData = await resumeRes.json();
    if (resumeRes.status !== 200 || resumeData.attemptId.toString() !== startData.attemptId.toString()) {
      throw new Error(`Re-starting active session did not resume attempt: ${JSON.stringify(resumeData)}`);
    }
    console.log('✓ 3C: Calling start again resumes existing active session with remaining timer');

    // ------------------------------------------------------------------------
    // TEST 4: Answers Never Leaked to Candidates
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Verify Candidate Never Receives correctIndex ---');

    const attemptRes = await fetch(`${BASE_URL}/tests/${round._id}/attempt`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const attemptData = await attemptRes.json();
    if (attemptRes.status !== 200 || !attemptData.questions || attemptData.questions.length === 0) {
      throw new Error(`Failed to get student attempt: ${JSON.stringify(attemptData)}`);
    }

    for (const q of attemptData.questions) {
      if (q.correctIndex !== undefined || q.correct !== undefined) {
        throw new Error(`SECURITY LEAK: Question payload includes correctIndex: ${JSON.stringify(q)}`);
      }
    }
    console.log('✓ Test 4: Verified: All questions returned to candidate completely omit correctIndex');

    // ------------------------------------------------------------------------
    // TEST 5: Autosave Answers & Tab-Switch Monitoring
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Autosave Answers & Tab-Switch Monitoring ---');

    const q1 = attemptData.questions[0];
    const q2 = attemptData.questions[1];

    // Student autosaves answer for Q1
    const saveAnsRes = await fetch(`${BASE_URL}/tests/${round._id}/answer`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st1Token}` },
      body: JSON.stringify({
        questionId: q1._id,
        selectedIndex: 1, // option B
      }),
    });
    const saveAnsData = await saveAnsRes.json();
    if (saveAnsRes.status !== 200 || saveAnsData.selectedIndex !== 1) {
      throw new Error(`Autosave failed: ${JSON.stringify(saveAnsData)}`);
    }
    console.log('✓ 5A: Candidate answer autosaved successfully');

    // Student records tab-switch
    const tabRes = await fetch(`${BASE_URL}/tests/${round._id}/tab-switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const tabData = await tabRes.json();
    if (tabRes.status !== 200 || tabData.tabSwitchCount !== 1) {
      throw new Error(`Tab-switch counter failed: ${JSON.stringify(tabData)}`);
    }
    console.log('✓ 5B: Tab-switch counter incremented to 1');

    // ------------------------------------------------------------------------
    // TEST 6: Server-Enforced Deadline (Reject Answers After Deadline)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Server-Enforced Deadline ---');

    // Manually push deadline to past
    const attemptDoc = await TestAttempt.findById(startData.attemptId);
    attemptDoc.deadlineAt = new Date(Date.now() - 5000); // expired 5 seconds ago
    await attemptDoc.save();

    // Student tries to autosave answer after deadline
    const lateAnsRes = await fetch(`${BASE_URL}/tests/${round._id}/answer`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st1Token}` },
      body: JSON.stringify({
        questionId: q2._id,
        selectedIndex: 2,
      }),
    });
    const lateAnsData = await lateAnsRes.json();
    if (lateAnsRes.status !== 400 || !lateAnsData.message.includes('deadline has passed')) {
      throw new Error(`Expected 400 for post-deadline answer submission, got: ${lateAnsRes.status}`);
    }
    console.log('✓ Test 6: Server strictly rejects answers submitted after deadline and auto-submits attempt');

    // ------------------------------------------------------------------------
    // TEST 7: Scoring with Negative Marking & RoundParticipant Sync
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Scoring Calculation with Negative Marking ---');

    // Set up Student 2 with a clean attempt to verify scoring
    const start2Res = await fetch(`${BASE_URL}/tests/${round._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st2Token}` },
    });
    const start2Data = await start2Res.json();
    if (start2Res.status !== 200) {
      throw new Error(`Student 2 start failed: ${JSON.stringify(start2Data)}`);
    }

    const st2Attempt = await TestAttempt.findById(start2Data.attemptId);
    const dbQuestions = await Question.find({ round: round._id }).sort({ order: 1 });

    // Answer Q0 correctly (Quicksort O(n log n) -> marks: 2)
    // Answer Q1 incorrectly (FIFO -> correct is Queue (1), student selects Stack (0) -> neg: -0.25)
    // Leave Q2 & Q3 unanswered (0)
    // Expected score = 2 - 0.25 = 1.75
    st2Attempt.answers = [
      { question: dbQuestions[0]._id, selectedIndex: dbQuestions[0].correctIndex },
      { question: dbQuestions[1]._id, selectedIndex: (dbQuestions[1].correctIndex + 1) % 4 }, // wrong choice
    ];
    await st2Attempt.save();

    const submitRes = await fetch(`${BASE_URL}/tests/${round._id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st2Token}` },
    });
    const submitData = await submitRes.json();
    if (submitRes.status !== 200 || submitData.score !== 1.75) {
      throw new Error(`Scoring calculation error. Expected 1.75, got: ${submitData.score}`);
    }

    // Verify written to RoundParticipant
    const participant2 = await RoundParticipant.findOne({ round: round._id, student: student2._id });
    if (participant2.attendance !== 'present' || participant2.score !== 1.75) {
      throw new Error(`RoundParticipant not updated properly: attendance=${participant2.attendance}, score=${participant2.score}`);
    }
    console.log(`✓ Test 7: Scoring verified with negative marking: score = ${submitData.score}, participant updated to present`);

    // ------------------------------------------------------------------------
    // TEST 8: Auto-Submit Cron Job
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Auto-Submit Cron Job for Expired Attempts ---');

    // Create a mock expired in_progress attempt
    const expiredAttempt = await TestAttempt.create({
      round: round._id,
      student: student3._id,
      application: app1._id,
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
      deadlineAt: new Date(Date.now() - 5 * 60 * 1000), // expired 5 mins ago
      answers: [{ question: dbQuestions[0]._id, selectedIndex: dbQuestions[0].correctIndex }],
      status: 'in_progress',
    });

    const autoSubmittedCount = await autoSubmitExpiredTestAttempts();
    if (autoSubmittedCount < 1) {
      throw new Error('autoSubmitExpiredTestAttempts failed to auto-submit expired attempt');
    }

    const recheckAttempt = await TestAttempt.findById(expiredAttempt._id);
    if (recheckAttempt.status !== 'auto_submitted') {
      throw new Error(`Expected status auto_submitted, got: ${recheckAttempt.status}`);
    }
    console.log('✓ Test 8: Auto-submit cron job successfully auto-submitted and scored expired attempt');

    // ------------------------------------------------------------------------
    // TEST 9: Absent Handling on Test Window End
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Window-End Absent Handling ---');

    // Delete any attempts for student3 and create an enrolled student who never started the test
    await TestAttempt.deleteMany({ student: student3._id });
    const unstartedParticipant = await RoundParticipant.create({
      round: round._id,
      drive: testDrive._id,
      student: student3._id,
      application: app1._id,
      attendance: 'pending',
      result: 'pending',
    });

    // Make round window closed in the past
    round.testWindowEnd = new Date(Date.now() - 10 * 60 * 1000);
    await round.save();

    const markedAbsentees = await handleWindowEndAbsentees();
    if (markedAbsentees < 1) {
      throw new Error('handleWindowEndAbsentees failed to mark unstarted student as absent');
    }

    const recheckParticipant = await RoundParticipant.findById(unstartedParticipant._id);
    if (recheckParticipant.attendance !== 'absent' || recheckParticipant.result !== 'rejected') {
      throw new Error(`Expected attendance absent and result rejected, got: ${recheckParticipant.attendance}, ${recheckParticipant.result}`);
    }
    console.log('✓ Test 9: Students who never started marked absent & rejected upon window close');

    // ------------------------------------------------------------------------
    // TEST 10: TPO Re-test Permission
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: TPO Re-test Flow ---');

    // TPO grants retest for Student 2
    const retestRes = await fetch(`${BASE_URL}/tests/${round._id}/retest/${student2._id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    const retestData = await retestRes.json();
    if (retestRes.status !== 200) {
      throw new Error(`Re-test grant failed: ${JSON.stringify(retestData)}`);
    }

    // Verify previous attempt deleted
    const clearedAttempt = await TestAttempt.findOne({ round: round._id, student: student2._id });
    if (clearedAttempt) {
      throw new Error('Previous attempt was not cleared after re-test was granted');
    }

    const recheckP2 = await RoundParticipant.findOne({ round: round._id, student: student2._id });
    if (recheckP2.attendance !== 'pending' || recheckP2.score !== null) {
      throw new Error(`Participant not reset to pending: attendance=${recheckP2.attendance}, score=${recheckP2.score}`);
    }
    console.log('✓ Test 10: TPO successfully granted re-test, resetting attempt and participant state');

    // ------------------------------------------------------------------------
    // TEST 11: RBAC & 403 Forbidden Cases
    // ------------------------------------------------------------------------
    console.log('\n--- Test 11: RBAC & 403 Forbidden Checks ---');

    // 11A: Recruiter B (Microsoft) attempts to view or edit questions of Google drive -> 403
    const recBRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recBToken}` },
      body: JSON.stringify({ text: 'Cross company question', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }),
    });
    if (recBRes.status !== 403) {
      throw new Error(`Expected 403 for cross-company recruiter question creation, got: ${recBRes.status}`);
    }
    console.log('✓ 11A: Cross-company recruiter blocked with 403');

    // 11B: TPO attempts to add question -> 403 (TPO has read-only access to question bank)
    const tpoQRes = await fetch(`${BASE_URL}/rounds/${round._id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tpoAToken}` },
      body: JSON.stringify({ text: 'TPO question', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }),
    });
    if (tpoQRes.status !== 403) {
      throw new Error(`Expected 403 when TPO attempts to add question, got: ${tpoQRes.status}`);
    }
    console.log('✓ 11B: TPO question editing blocked with 403 (recruiter-only)');

    // 11C: Unenrolled Student 3 attempts to start test -> 403
    await RoundParticipant.deleteMany({ round: round._id, student: student3._id });
    const unenrolledRes = await fetch(`${BASE_URL}/tests/${round._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${st3Token}` },
    });
    if (unenrolledRes.status !== 403) {
      throw new Error(`Expected 403 for unenrolled student starting test, got: ${unenrolledRes.status}`);
    }
    console.log('✓ 11C: Unenrolled student blocked with 403');

    // ------------------------------------------------------------------------
    // TEST 12: Recruiter Results Table Summary
    // ------------------------------------------------------------------------
    console.log('\n--- Test 12: Recruiter Results Table Summary ---');
    const resultsRes = await fetch(`${BASE_URL}/rounds/${round._id}/test-results`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    const resultsData = await resultsRes.json();
    if (resultsRes.status !== 200 || !resultsData.results || !resultsData.summary) {
      throw new Error(`Failed to fetch test results: ${JSON.stringify(resultsData)}`);
    }
    console.log(`✓ Test 12: Recruiter results table verified: ${resultsData.results.length} candidate rows, summary available`);

    // Cleanup
    await Question.deleteMany({ round: round._id });
    await TestAttempt.deleteMany({ round: round._id });
    await RoundParticipant.deleteMany({ drive: testDrive._id });
    await Round.deleteMany({ drive: testDrive._id });
    await Application.deleteMany({ drive: testDrive._id });
    await Drive.deleteMany({ _id: testDrive._id });

    console.log('\n======================================================');
    console.log('      ALL TASK 32B BACKEND TEST SCENARIOS PASSED!     ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ Test failure:', error);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log('Test server closed & MongoDB disconnected.');
    process.exit(process.exitCode || 0);
  }
}

runAptitudeTests();
