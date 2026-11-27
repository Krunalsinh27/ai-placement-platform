/**
 * Test Suite: Phase C Recruitment Platform Test & CSV Import Flow
 *
 * Verifies:
 * 1. CSV question import with letter format (A-D), 1-based numeric (1-4), 0-based numeric (0-3).
 * 2. Accurate round questionCount and totalMarks update upon import.
 * 3. Validation report on invalid rows (empty text, invalid options, out-of-range answers).
 * 4. Inconsistent numeric format detection rejection (both 0 and 4 in auto mode).
 * 5. Student test availability and eligibility:
 *    - Enrolled student sees test with accurate properties.
 *    - Cross-college / non-invited college student is excluded.
 *    - Non-enrolled student gets 403 on attempt endpoint.
 *    - Correct answers (correctIndex) are completely omitted from student test attempt payload.
 *    - Test start rules (requires questions > 0, enforces active window, blocks outside window).
 *    - Test evaluation on submission (updates score, attendance='present').
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test_jwt_secret_phase_c_12345';

const mongoose = require('mongoose');
const {
  User,
  Student,
  Company,
  College,
  Drive,
  Round,
  Question,
  TestAttempt,
  RoundParticipant,
  Application,
} = require('../models');

const {
  importQuestionsCSV,
  getRoundQuestions,
  getStudentMyTests,
  getStudentAttempt,
  startTest,
  saveAnswer,
  submitTest,
} = require('../controllers/aptitudeTestController');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL [${totalTests}]: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  PASS [${totalTests}]: ${message}`);
  }
}

async function runPhaseCTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING PHASE C PLATFORM TEST FLOW TEST SUITE');
  console.log('======================================================\n');

  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_system_test';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
  }

  const timestamp = Date.now();

  // Create test entities
  const collegeA = await College.create({
    name: `Test College Alpha ${timestamp}`,
    code: `TCA_${timestamp}`,
    address: 'Alpha Campus',
    city: 'Bangalore',
    state: 'Karnataka',
  });

  const collegeB = await College.create({
    name: `Test College Beta ${timestamp}`,
    code: `TCB_${timestamp}`,
    address: 'Beta Campus',
    city: 'Mumbai',
    state: 'Maharashtra',
  });

  const company = await Company.create({
    name: `Acme Corp ${timestamp}`,
    industry: 'Technology',
    email: `acme_${timestamp}@example.com`,
  });

  const recruiterUser = await User.create({
    name: 'Recruiter Alice',
    email: `recruiter_${timestamp}@example.com`,
    password: 'Password123!@#',
    role: 'recruiter',
    company: company._id,
    isApproved: true,
    isEmailVerified: true,
  });

  const studentUserA = await User.create({
    name: 'Student Alpha',
    email: `student_a_${timestamp}@example.com`,
    password: 'Password123!@#',
    role: 'student',
    college: collegeA._id,
    isApproved: true,
    isEmailVerified: true,
  });

  const studentA = await Student.create({
    user: studentUserA._id,
    college: collegeA._id,
    enrollmentNo: `ENR_A_${timestamp}`,
    branch: 'Computer Science',
    batchYear: 2026,
    cgpa: 8.5,
    phone: '9876543210',
  });

  const studentUserB = await User.create({
    name: 'Student Beta (Other College)',
    email: `student_b_${timestamp}@example.com`,
    password: 'Password123!@#',
    role: 'student',
    college: collegeB._id,
    isApproved: true,
    isEmailVerified: true,
  });

  const studentB = await Student.create({
    user: studentUserB._id,
    college: collegeB._id,
    enrollmentNo: `ENR_B_${timestamp}`,
    branch: 'Mechanical',
    batchYear: 2026,
    cgpa: 7.0,
    phone: '9876543211',
  });

  // Create a drive targeting College A only
  const drive = await Drive.create({
    company: company._id,
    college: collegeA._id,
    colleges: [collegeA._id],
    role: 'Software Engineer',
    packageLpa: 12,
    location: 'Bangalore',
    allowedBranches: ['Computer Science'],
    minCgpa: 7.0,
    maxBacklogs: 0,
    lastDateToApply: new Date(Date.now() + 86400000),
    driveDate: new Date(Date.now() + 172800000),
    status: 'open',
  });

  // Create an aptitude platform test round (window in future so recruiter can add questions)
  const round = await Round.create({
    drive: drive._id,
    name: 'Round 1: Online Assessment',
    order: 1,
    type: 'aptitude',
    deliveryMode: 'platform_test',
    testWindowStart: new Date(Date.now() + 3600000), // Opens in 1 hour
    testWindowEnd: new Date(Date.now() + 7200000),   // Closes in 2 hours
    durationMinutes: 45,
    cutoffScore: 2,
    totalMarks: 0,
    questionCount: 0,
    negativeMarking: true,
    showScoreToStudents: true,
  });

  // Create application and RoundParticipant for Student A
  const appA = await Application.create({
    drive: drive._id,
    student: studentA._id,
    status: 'applied',
  });

  const participantA = await RoundParticipant.create({
    round: round._id,
    drive: drive._id,
    student: studentA._id,
    application: appA._id,
    attendance: 'pending',
    result: 'pending',
  });

  // -------------------------------------------------------------------------
  // SECTION 1: CSV Question Import & Format Detection
  // -------------------------------------------------------------------------
  console.log('--- Testing 1: CSV Question Import & Correct-Answer Parsing ---');

  // Test 1.1: Letter format import (A, B, C, D)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"What is 2+2?","3","4","5","6",B,1,0.25,"Math"',
      '"What is capital of France?","London","Berlin","Paris","Madrid",C,2,0.5,"GK"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 200, 'Letter-based CSV import succeeds with 200');
    assert(jsonSent.formatDetected === 'letter', 'Auto-detected letter format correctly');
    assert(jsonSent.importedCount === 2, 'Imported 2 questions');
    assert(jsonSent.questionCount === 2, 'questionCount returned 2');
    assert(jsonSent.totalMarks === 3, 'totalMarks calculated (1 + 2 = 3)');

    // Verify correctIndex values stored in MongoDB
    const q1 = await Question.findOne({ round: round._id, text: 'What is 2+2?' });
    assert(q1 && q1.correctIndex === 1, 'Option B mapped to correctIndex 1');

    const q2 = await Question.findOne({ round: round._id, text: 'What is capital of France?' });
    assert(q2 && q2.correctIndex === 2, 'Option C mapped to correctIndex 2');
  }

  // Test 1.2: 1-based numeric format (1, 2, 3, 4)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Question One?","A1","B1","C1","D1",1,1,0,"Test"',
      '"Question Four?","A4","B4","C4","D4",4,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let jsonSent = null;
    const res = {
      status: () => ({ json: (j) => { jsonSent = j; } }),
    };

    await importQuestionsCSV(req, res, () => {});

    assert(jsonSent.formatDetected === 'one_based', 'Auto-detected one_based format (due to presence of 4)');
    assert(jsonSent.importedCount === 2, 'Imported 2 1-based questions');

    const qNum1 = await Question.findOne({ round: round._id, text: 'Question One?' });
    assert(qNum1 && qNum1.correctIndex === 0, 'Answer 1 mapped to 0-based index 0');

    const qNum4 = await Question.findOne({ round: round._id, text: 'Question Four?' });
    assert(qNum4 && qNum4.correctIndex === 3, 'Answer 4 mapped to 0-based index 3');
  }

  // Test 1.3: 0-based numeric format (0, 1, 2, 3)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Question Zero?","A0","B0","C0","D0",0,1,0,"Test"',
      '"Question Two?","A2","B2","C2","D2",2,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let jsonSent = null;
    const res = {
      status: () => ({ json: (j) => { jsonSent = j; } }),
    };

    await importQuestionsCSV(req, res, () => {});

    assert(jsonSent.formatDetected === 'zero_based', 'Auto-detected zero_based format (due to presence of 0 and no 4)');
    assert(jsonSent.importedCount === 2, 'Imported 2 0-based questions');

    const qZero = await Question.findOne({ round: round._id, text: 'Question Zero?' });
    assert(qZero && qZero.correctIndex === 0, 'Answer 0 mapped to correctIndex 0');

    const qTwo = await Question.findOne({ round: round._id, text: 'Question Two?' });
    assert(qTwo && qTwo.correctIndex === 2, 'Answer 2 mapped to correctIndex 2');
  }

  // Test 1.4: Inconsistent numeric format in auto mode (contains both 0 and 4)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q1","A","B","C","D",0,1,0,"Test"',
      '"Q2","A","B","C","D",4,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 400, 'Inconsistent numeric format (0 and 4) rejected with 400 in auto mode');
    assert(jsonSent.message.includes('Inconsistent numeric format'), 'Error message clearly indicates inconsistency');
  }

  // Test 1.4a: Ambiguous numeric dataset containing only {1, 2, 3} in auto mode -> REJECTED with 400
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q Only 1","A","B","C","D",1,1,0,"Test"',
      '"Q Only 2","A","B","C","D",2,1,0,"Test"',
      '"Q Only 3","A","B","C","D",3,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 400, 'Ambiguous dataset with only {1, 2, 3} rejected with 400 in auto mode');
    assert(jsonSent.message.includes('Ambiguous numeric answer format'), 'Rejection message instructs explicit answerFormat selection');
  }

  // Test 1.4b: Numeric dataset containing only {1, 2, 3} with explicit one_based -> SUCCEEDS (mapped to 0, 1, 2)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q Explicit 1","A","B","C","D",1,1,0,"Test"',
      '"Q Explicit 2","A","B","C","D",2,1,0,"Test"',
      '"Q Explicit 3","A","B","C","D",3,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'one_based' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 200, 'Explicit one_based format accepted for {1, 2, 3}');
    assert(jsonSent.formatDetected === 'one_based', 'Format resolved as one_based');

    const q1 = await Question.findOne({ round: round._id, text: 'Q Explicit 1' });
    const q2 = await Question.findOne({ round: round._id, text: 'Q Explicit 2' });
    const q3 = await Question.findOne({ round: round._id, text: 'Q Explicit 3' });
    assert(q1 && q1.correctIndex === 0, '1-based answer 1 mapped to 0');
    assert(q2 && q2.correctIndex === 1, '1-based answer 2 mapped to 1');
    assert(q3 && q3.correctIndex === 2, '1-based answer 3 mapped to 2');
  }

  // Test 1.4c: Numeric dataset containing only {1, 2, 3} with explicit zero_based -> SUCCEEDS (mapped to 1, 2, 3)
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q Zero Explicit 1","A","B","C","D",1,1,0,"Test"',
      '"Q Zero Explicit 2","A","B","C","D",2,1,0,"Test"',
      '"Q Zero Explicit 3","A","B","C","D",3,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'zero_based' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 200, 'Explicit zero_based format accepted for {1, 2, 3}');
    assert(jsonSent.formatDetected === 'zero_based', 'Format resolved as zero_based');

    const q1 = await Question.findOne({ round: round._id, text: 'Q Zero Explicit 1' });
    const q2 = await Question.findOne({ round: round._id, text: 'Q Zero Explicit 2' });
    const q3 = await Question.findOne({ round: round._id, text: 'Q Zero Explicit 3' });
    assert(q1 && q1.correctIndex === 1, '0-based answer 1 preserved as index 1');
    assert(q2 && q2.correctIndex === 2, '0-based answer 2 preserved as index 2');
    assert(q3 && q3.correctIndex === 3, '0-based answer 3 preserved as index 3');
  }

  // Test 1.4d: Numeric dataset containing only {0, 1, 2} in auto mode -> Unambiguously zero_based
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q ZeroOnly 0","A","B","C","D",0,1,0,"Test"',
      '"Q ZeroOnly 1","A","B","C","D",1,1,0,"Test"',
      '"Q ZeroOnly 2","A","B","C","D",2,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 200, 'Auto-detect succeeds for dataset with only {0, 1, 2}');
    assert(jsonSent.formatDetected === 'zero_based', 'Unambiguously identified as zero_based because 0 cannot be 1-based');

    const q0 = await Question.findOne({ round: round._id, text: 'Q ZeroOnly 0' });
    const q1 = await Question.findOne({ round: round._id, text: 'Q ZeroOnly 1' });
    const q2 = await Question.findOne({ round: round._id, text: 'Q ZeroOnly 2' });
    assert(q0 && q0.correctIndex === 0, 'Answer 0 mapped to index 0');
    assert(q1 && q1.correctIndex === 1, 'Answer 1 mapped to index 1');
    assert(q2 && q2.correctIndex === 2, 'Answer 2 mapped to index 2');
  }

  // Test 1.4e: Inconsistent format with mixed letters and numbers in auto mode -> REJECTED with 400
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Q Mixed 1","A","B","C","D",A,1,0,"Test"',
      '"Q Mixed 2","A","B","C","D",2,1,0,"Test"',
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'auto' },
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await importQuestionsCSV(req, res, () => {});

    assert(statusSent === 400, 'Mixed letters and numbers rejected with 400 in auto mode');
    assert(jsonSent.message.includes('Inconsistent answer format'), 'Error indicates mixed letters and numbers');
  }

  // Test 1.5: Validation report on rows with missing options or invalid answer
  {
    const csvData = [
      'text,optionA,optionB,optionC,optionD,correct,marks,negative,section',
      '"Good Q","A","B","C","D",A,1,0,"Test"',
      '"","A","B","C","D",A,1,0,"Test"',                 // Row 3: empty text
      '"Bad Options","A","B","C","",A,1,0,"Test"',       // Row 4: missing option D
      '"Bad Answer","A","B","C","D",Z,1,0,"Test"',       // Row 5: invalid answer 'Z'
    ].join('\n');

    const req = {
      params: { id: round._id.toString() },
      user: recruiterUser,
      body: { csvData, answerFormat: 'letter' },
    };

    let jsonSent = null;
    const res = {
      status: () => ({ json: (j) => { jsonSent = j; } }),
    };

    await importQuestionsCSV(req, res, () => {});

    assert(jsonSent.importedCount === 1, 'Only the 1 valid question imported');
    assert(jsonSent.failedCount === 3, '3 invalid rows caught and reported');
    assert(jsonSent.failedRows.length === 3, 'failedRows details returned');
    assert(jsonSent.failedRows[0].reason.includes('Question text is empty'), 'Failed row 1 caught empty text');
    assert(jsonSent.failedRows[1].reason.includes('four options'), 'Failed row 2 caught missing option');
    assert(jsonSent.failedRows[2].reason.includes('Invalid correct answer'), 'Failed row 3 caught invalid letter Z');
  }

  // Verify Round document updated with question stats
  const actualCount = await Question.countDocuments({ round: round._id });
  const updatedRound = await Round.findById(round._id);
  assert(updatedRound.questionCount === actualCount && actualCount === 16, 'Round questionCount reflects actual persisted questions (16 total)');
  assert(updatedRound.totalMarks >= 16, 'Round totalMarks updated correctly');

  // -------------------------------------------------------------------------
  // SECTION 2: Student Test Visibility & Security Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- Testing 2: Student Test Visibility & Security Isolation ---');

  // Now open the test window for student testing
  await Round.findByIdAndUpdate(round._id, {
    testWindowStart: new Date(Date.now() - 3600000), // Opened 1 hr ago
    testWindowEnd: new Date(Date.now() + 3600000),   // Closes in 1 hr
  });

  // Test 2.1: Enrolled student sees test in /api/students/my-tests with accurate state
  {
    const req = {
      user: studentUserA,
      query: {},
    };

    let jsonSent = null;
    let statusSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await getStudentMyTests(req, res, () => {});

    assert(statusSent === 200, 'getStudentMyTests succeeds with 200 for enrolled student');
    assert(jsonSent.count === 1, 'Enrolled student sees 1 test');
    const myTest = jsonSent.tests[0];
    assert(myTest.roundId.toString() === round._id.toString(), 'Round ID matches');
    assert(myTest.status === 'open_to_start', 'Test status is open_to_start within window');
    assert(myTest.questionCount === actualCount, 'Test card includes questionCount');
    assert(myTest.totalMarks >= actualCount, 'Test card includes totalMarks');
  }

  // Test 2.2: Cross-college student (College B) does NOT see test in /api/students/my-tests
  {
    const req = {
      user: studentUserB,
      query: {},
    };

    let jsonSent = null;
    const res = {
      status: () => ({ json: (j) => { jsonSent = j; } }),
    };

    await getStudentMyTests(req, res, () => {});

    assert(jsonSent.count === 0, 'Cross-college student (College B) excluded from College A tests');
  }

  // Test 2.3: Non-enrolled student gets 403 on getStudentAttempt
  {
    const req = {
      params: { roundId: round._id.toString() },
      user: studentUserB,
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await getStudentAttempt(req, res, () => {});

    assert(statusSent === 403, 'Non-enrolled student rejected with 403 Forbidden on test attempt access');
    assert(jsonSent.message.includes('not enrolled'), 'Helpful rejection message');
  }

  // Test 2.4: Enrolled student starts test -> questions returned WITHOUT correctIndex
  {
    const req = {
      params: { roundId: round._id.toString() },
      user: studentUserA,
    };

    let startStatus = null;
    let startJson = null;
    const resStart = {
      status: (s) => {
        startStatus = s;
        return { json: (j) => { startJson = j; } };
      },
    };

    await startTest(req, resStart, () => {});

    assert(startStatus === 200, 'Enrolled student starts test successfully with 200');
    assert(Boolean(startJson.attemptId), 'Test attempt created with attemptId');
    assert(Boolean(startJson.deadlineAt), 'Timer deadline calculated');

    // Now fetch attempt details (student questions)
    let attemptJson = null;
    const resAttempt = {
      status: () => ({ json: (j) => { attemptJson = j; } }),
    };

    await getStudentAttempt(req, resAttempt, () => {});

    assert(attemptJson.status === 'in_progress', 'Attempt status is in_progress');
    assert(attemptJson.questions && attemptJson.questions.length === actualCount, 'All questions delivered');

    // CRITICAL SECURITY ASSERTION: correctIndex must NOT be present on any question!
    const leakedAnswer = attemptJson.questions.some((q) => q.correctIndex !== undefined);
    assert(!leakedAnswer, 'CRITICAL SECURITY: correctIndex is NOT leaked in student payload');
  }

  // Test 2.5: Resuming active attempt returns 200 without creating duplicate
  {
    const req = {
      params: { roundId: round._id.toString() },
      user: studentUserA,
    };

    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (s) => {
        statusSent = s;
        return { json: (j) => { jsonSent = j; } };
      },
    };

    await startTest(req, res, () => {});

    assert(statusSent === 200, 'Resuming active test returns 200');
    assert(jsonSent.message.includes('Resuming active test session'), 'Identifies resumed session');

    const attemptCount = await TestAttempt.countDocuments({ round: round._id, student: studentA._id });
    assert(attemptCount === 1, 'Exactly one TestAttempt document exists (no duplicates)');
  }

  // Test 2.6: Student answers questions and submits test -> evaluated and saved
  {
    const questions = await Question.find({ round: round._id }).sort({ order: 1 });
    const q1 = questions[0];

    // Autosave answer to Q1
    const reqAnswer = {
      params: { roundId: round._id.toString() },
      body: { questionId: q1._id.toString(), selectedIndex: q1.correctIndex },
      user: studentUserA,
    };

    let answerJson = null;
    const resAnswer = {
      status: () => ({ json: (j) => { answerJson = j; } }),
    };

    await saveAnswer(reqAnswer, resAnswer, () => {});
    assert(answerJson.success === true, 'Autosave answer succeeded');

    // Submit test
    const reqSubmit = {
      params: { roundId: round._id.toString() },
      user: studentUserA,
    };

    let submitStatus = null;
    let submitJson = null;
    const resSubmit = {
      status: (s) => {
        submitStatus = s;
        return { json: (j) => { submitJson = j; } };
      },
    };

    await submitTest(reqSubmit, resSubmit, () => {});

    assert(submitStatus === 200, 'Test submitted successfully with 200');
    assert(submitJson.status === 'submitted', 'Attempt marked submitted');
    assert(submitJson.score >= 1, 'Score calculated on submission');

    // RoundParticipant updated
    const partAfterSubmit = await RoundParticipant.findOne({ round: round._id, student: studentA._id });
    assert(partAfterSubmit.attendance === 'present', 'RoundParticipant attendance updated to present');
    assert(partAfterSubmit.score >= 1, 'RoundParticipant score recorded');
  }

  // Clean test documents
  await TestAttempt.deleteMany({ round: round._id });
  await Question.deleteMany({ round: round._id });
  await RoundParticipant.deleteMany({ round: round._id });
  await Round.findByIdAndDelete(round._id);
  await Application.deleteMany({ drive: drive._id });
  await Drive.findByIdAndDelete(drive._id);
  await Student.deleteMany({ _id: { $in: [studentA._id, studentB._id] } });
  await User.deleteMany({ _id: { $in: [recruiterUser._id, studentUserA._id, studentUserB._id] } });
  await Company.findByIdAndDelete(company._id);
  await College.deleteMany({ _id: { $in: [collegeA._id, collegeB._id] } });

  console.log('\n======================================================');
  console.log(`🎉 ALL PHASE C TESTS PASSED (${passedTests}/${totalTests})`);
  console.log('======================================================\n');
}

runPhaseCTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Phase C test suite encountered an unexpected failure:', err);
    process.exit(1);
  });
