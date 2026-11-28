/**
 * testRoundTimingAndCompletion.js
 * Comprehensive integration tests for Round Timing, Validation, and Auto-Completion
 * Uses a dedicated _test database on local MongoDB.
 */
const mongoose = require('mongoose');
const {
  User,
  Company,
  College,
  Drive,
  Round,
  RoundParticipant,
  TestAttempt,
  Question,
  Application,
} = require('../models');
const {
  autoCompletePlatformTestRounds,
  deriveRoundStatus,
} = require('../services/roundCompletionService');
const {
  updateRoundSettings,
  autoSplitRoundBatches,
  moveParticipantBatch,
} = require('../controllers/recruitmentPipelineController');
const {
  startTest,
  allowStudentRetest,
  publishAssessment,
  getStudentMyTests,
  updateQuestion,
} = require('../controllers/aptitudeTestController');

const TEST_DB_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_timing_test';

const runTests = async () => {
  console.log('Connecting to Test DB:', TEST_DB_URI);
  await mongoose.connect(TEST_DB_URI);
  console.log('Connected to Test DB successfully.');

  let passed = 0;
  let failed = 0;

  const assert = (condition, desc) => {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  };

  try {
    // Clean up test collections
    await mongoose.connection.dropDatabase();

    // 1. Setup Base Entities (Company, College, Recruiter User, Student User)
    const college = await College.create({
      name: 'Timing Test Engineering College',
      code: 'TTEC',
      city: 'Mumbai',
      state: 'Maharashtra',
    });

    const company = await Company.create({
      name: 'Timing Test Corp',
      industry: 'Software',
      website: 'https://timingtest.example.com',
    });

    const recruiterUser = await User.create({
      name: 'Recruiter Timing',
      email: 'recruiter.timing@test.com',
      password: 'password123',
      role: 'recruiter',
      company: company._id,
    });

    const studentUser1 = await User.create({
      name: 'Student Candidate 1',
      email: 'student1.timing@test.com',
      password: 'password123',
      role: 'student',
      college: college._id,
    });

    const studentUser2 = await User.create({
      name: 'Student Candidate 2',
      email: 'student2.timing@test.com',
      password: 'password123',
      role: 'student',
      college: college._id,
    });

    const studentProfile1 = await mongoose.model('Student').create({
      user: studentUser1._id,
      college: college._id,
      rollNumber: 'ROLL-T1',
      enrollmentNo: 'ENROLL-T1',
      department: 'Computer Science',
      branch: 'Computer Science',
      batchYear: 2026,
      batch: 2026,
      phone: '9876543210',
      cgpa: 8.5,
    });

    const studentProfile2 = await mongoose.model('Student').create({
      user: studentUser2._id,
      college: college._id,
      rollNumber: 'ROLL-T2',
      enrollmentNo: 'ENROLL-T2',
      department: 'Computer Science',
      branch: 'Computer Science',
      batchYear: 2026,
      batch: 2026,
      phone: '9876543211',
      cgpa: 7.8,
    });

    const drive = await Drive.create({
      company: company._id,
      college: college._id,
      createdBy: recruiterUser._id,
      role: 'Backend Systems Engineer',
      title: 'Backend Systems Engineer Drive',
      location: 'Mumbai',
      packageLpa: 12,
      driveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: 'open',
      isPublished: true,
      allowedBranches: ['Computer Science'],
    });

    console.log('\n--- TEST SUITE 1: Test Window Timing & Validation ---');

    // Create a round
    const round1 = await Round.create({
      drive: drive._id,
      name: 'Online Aptitude Test',
      type: 'aptitude',
      deliveryMode: 'platform_test',
      order: 1,
      status: 'scheduled',
      durationMinutes: 60,
    });

    // Helper mock req/res
    const mockReqRes = (body, params = { id: round1._id.toString() }, user = recruiterUser) => {
      let resStatus = 200;
      let resJson = null;
      const req = {
        params,
        body,
        user,
      };
      const res = {
        status: (code) => {
          resStatus = code;
          return res;
        },
        json: (data) => {
          resJson = data;
          return res;
        },
      };
      const next = (err) => {
        if (err) {
          resStatus = 500;
          resJson = { success: false, message: err.message };
        }
      };
      return { req, res, next, getResult: () => ({ status: resStatus, json: resJson }) };
    };

    // 1A. Window Start in Past (> 2 min) must return 400
    {
      const pastStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { req, res, next, getResult } = mockReqRes({
        deliveryMode: 'platform_test',
        testWindowStart: pastStart,
        testWindowEnd: futureEnd,
        durationMinutes: 60,
      });

      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 400, 'Start time > 2 min in past is rejected with HTTP 400');
      assert(
        json.message.includes('Test Window Start cannot be in the past'),
        `Returned clear error: "${json.message}"`
      );
    }

    // 1B. Window End <= Window Start must return 400
    {
      const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const pastEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { req, res, next, getResult } = mockReqRes({
        deliveryMode: 'platform_test',
        testWindowStart: futureStart,
        testWindowEnd: pastEnd,
        durationMinutes: 30,
      });

      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 400, 'End time <= Start time is rejected with HTTP 400');
      assert(
        json.message.includes('Test Window End must be after Test Window Start'),
        `Returned clear error: "${json.message}"`
      );
    }

    // 1C. Duration > Window Length must return 400
    {
      const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 120 * 60 * 1000).toISOString(); // 60 min window
      const { req, res, next, getResult } = mockReqRes({
        deliveryMode: 'platform_test',
        testWindowStart: futureStart,
        testWindowEnd: futureEnd,
        durationMinutes: 90, // exceeds 60 mins!
      });

      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 400, 'Duration exceeding window length is rejected with HTTP 400');
      assert(
        json.message.includes('cannot exceed test window length'),
        `Returned clear error: "${json.message}"`
      );
    }

    // 1D. Valid Schedule Derives Status Correctly
    {
      // 1D-i: Future window -> scheduled
      const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 180 * 60 * 1000).toISOString();
      const { req, res, next, getResult } = mockReqRes({
        deliveryMode: 'platform_test',
        testWindowStart: futureStart,
        testWindowEnd: futureEnd,
        durationMinutes: 60,
      });

      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 200, 'Valid future schedule accepted with HTTP 200');
      assert(json.round.status === 'scheduled', `Derived status is "scheduled" (got: ${json.round.status})`);
    }

    {
      // 1D-ii: Active window (with 1-min grace start) -> live
      const justStarted = new Date(Date.now() - 30 * 1000).toISOString(); // 30 sec ago (within grace)
      const futureEnd = new Date(Date.now() + 120 * 60 * 1000).toISOString();
      const { req, res, next, getResult } = mockReqRes({
        deliveryMode: 'platform_test',
        testWindowStart: justStarted,
        testWindowEnd: futureEnd,
        durationMinutes: 60,
      });

      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 200, 'Window started within grace accepted with HTTP 200');
      assert(json.round.status === 'live', `Derived status is "live" (got: ${json.round.status})`);
    }

    console.log('\n--- TEST SUITE 2: Test Attempt Effective End Capping ---');

    // Create questions for round1
    const q1 = await Question.create({
      round: round1._id,
      text: 'What is 2 + 2?',
      options: ['1', '2', '3', '4'],
      correctIndex: 3,
      marks: 10,
    });

    const q2 = await Question.create({
      round: round1._id,
      text: 'What is 5 * 5?',
      options: ['20', '25', '30', '35'],
      correctIndex: 1,
      marks: 10,
    });

    round1.questionCount = 2;
    round1.totalMarks = 20;
    round1.cutoffScore = 10;
    round1.durationMinutes = 60; // 60 min test
    // But test window ends in 15 minutes!
    round1.testWindowStart = new Date(Date.now() - 45 * 60 * 1000);
    round1.testWindowEnd = new Date(Date.now() + 15 * 60 * 1000);
    round1.status = 'live';
    await round1.save();

    // Enroll candidate 1 & candidate 2
    const app1 = await Application.create({
      student: studentProfile1._id,
      drive: drive._id,
      status: 'shortlisted',
    });

    const app2 = await Application.create({
      student: studentProfile2._id,
      drive: drive._id,
      status: 'shortlisted',
    });

    const p1 = await RoundParticipant.create({
      round: round1._id,
      drive: drive._id,
      student: studentProfile1._id,
      application: app1._id,
      attendance: 'pending',
      result: 'pending',
    });

    const p2 = await RoundParticipant.create({
      round: round1._id,
      drive: drive._id,
      student: studentProfile2._id,
      application: app2._id,
      attendance: 'pending',
      result: 'pending',
    });

    // Student 1 starts test late: only 15 mins left in window
    {
      let startStatus = 200;
      let startJson = null;
      const reqStart = {
        params: { roundId: round1._id.toString() },
        user: studentUser1,
      };
      const resStart = {
        status: (code) => {
          startStatus = code;
          return resStart;
        },
        json: (data) => {
          startJson = data;
          return resStart;
        },
      };
      await startTest(reqStart, resStart, (err) => console.error(err));

      assert(startStatus === 200, 'Student 1 starts test successfully (200 OK)');
      const attempt1 = await TestAttempt.findOne({ round: round1._id, student: studentProfile1._id });
      assert(attempt1 !== null, 'Attempt record created in MongoDB');

      // The attempt deadline must NOT be now + 60 min; it must be capped at windowEnd!
      const deadlineDiff = Math.abs(attempt1.deadlineAt.getTime() - round1.testWindowEnd.getTime());
      assert(
        deadlineDiff < 2000,
        `Effective attempt end capped at windowEnd (diff: ${deadlineDiff}ms, deadline: ${attempt1.deadlineAt.toISOString()})`
      );

      // Student answer q1 correctly
      attempt1.answers = [{ question: q1._id, selectedIndex: 3 }];
      await attempt1.save();
    }

    console.log('\n--- TEST SUITE 3: Auto-Complete Round Service ---');

    // Now advance time so window has expired
    const pastWindowEnd = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
    round1.testWindowEnd = pastWindowEnd;
    await round1.save();

    // Run auto-complete service
    const completionResult = await autoCompletePlatformTestRounds({
      roundId: round1._id,
      now: new Date(),
    });

    assert(
      completionResult.completedRoundIds.includes(round1._id.toString()),
      'Round ID included in completedRoundIds'
    );
    assert(completionResult.autoSubmittedCount === 1, 'In-progress attempt was auto-submitted');
    assert(completionResult.absentCount === 1, 'Non-starter candidate was marked absent');

    // Verify round1 status & resultsPublished
    const updatedRound1 = await Round.findById(round1._id);
    assert(updatedRound1.status === 'completed', 'round.status is now "completed"');
    assert(
      updatedRound1.resultsPublished === false,
      'round.resultsPublished remains FALSE (requires explicit recruiter action)'
    );

    // Verify Student 1 attempt & score
    const updatedAttempt1 = await TestAttempt.findOne({ round: round1._id, student: studentProfile1._id });
    assert(updatedAttempt1.status === 'auto_submitted', 'Attempt 1 status is auto_submitted');
    assert(updatedAttempt1.score === 10, `Attempt 1 score evaluated to 10 points (got: ${updatedAttempt1.score})`);

    const updatedP1 = await RoundParticipant.findById(p1._id);
    assert(updatedP1.attendance === 'present', 'Candidate 1 attendance is "present"');
    assert(updatedP1.score === 10, 'Candidate 1 score updated to 10');
    assert(updatedP1.result === 'cleared', 'Candidate 1 cleared against cutoff (10 >= 10)');

    // Verify Student 2 (non-starter)
    const updatedP2 = await RoundParticipant.findById(p2._id);
    assert(updatedP2.attendance === 'absent', 'Candidate 2 attendance is "absent"');
    assert(updatedP2.result === 'rejected', 'Candidate 2 result is "rejected"');

    // Verify IDEMPOTENCY: running auto-complete again must produce no double submissions or errors
    const secondRun = await autoCompletePlatformTestRounds({
      roundId: round1._id,
      now: new Date(),
    });
    assert(secondRun.autoSubmittedCount === 0, 'Idempotent: 0 attempts auto-submitted on second run');
    assert(secondRun.absentCount === 0, 'Idempotent: 0 non-starters marked on second run');

    console.log('\n--- TEST SUITE 4: Server-Side Blockers on Completed Round ---');

    // 4A. Server blocks startTest on completed round
    {
      let status = 200;
      let json = null;
      const req = {
        params: { roundId: round1._id.toString() },
        user: studentUser2,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await startTest(req, res, () => {});
      assert(status === 400 || status === 403, 'startTest on completed round is blocked');
    }

    // 4B. Server blocks allowStudentRetest on completed round
    {
      let status = 200;
      let json = null;
      const req = {
        params: { roundId: round1._id.toString(), studentId: studentProfile1._id.toString() },
        user: recruiterUser,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await allowStudentRetest(req, res, () => {});
      assert(status === 400, 'allowStudentRetest on completed round is blocked with 400');
      assert(json.message.includes('Cannot grant retest for a completed round'), `Block message: "${json.message}"`);
    }

    // 4C. Server blocks updateRoundSettings on completed round
    {
      const { req, res, next, getResult } = mockReqRes({
        name: 'Attempted Name Change',
      });
      await updateRoundSettings(req, res, next);
      const { status, json } = getResult();
      assert(status === 400, 'updateRoundSettings on completed round is blocked with 400');
      assert(json.message.includes('Round is completed'), `Block message: "${json.message}"`);
    }

    // 4D. Server blocks autoSplitRoundBatches on completed round
    {
      let status = 200;
      let json = null;
      const req = {
        params: { id: round1._id.toString() },
        body: { capacity: 20 },
        user: recruiterUser,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await autoSplitRoundBatches(req, res, () => {});
      assert(status === 400, 'autoSplitRoundBatches on completed round is blocked with 400');
      assert(json.message.includes('Round is completed'), `Block message: "${json.message}"`);
    }

    // 4E. Server blocks moveParticipantBatch on completed round
    {
      let status = 200;
      let json = null;
      const req = {
        body: { participantId: p1._id.toString(), targetBatchId: new mongoose.Types.ObjectId() },
        user: recruiterUser,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await moveParticipantBatch(req, res, () => {});
      assert(status === 400, 'moveParticipantBatch on completed round is blocked with 400');
      assert(json.message.includes('Round is completed'), `Block message: "${json.message}"`);
    }

    console.log('\n--- TEST SUITE 5: Student My Tests Score Visibility ---');

    // 5A. When resultsPublished = false, score is NOT exposed on My Tests
    {
      let status = 200;
      let json = null;
      const req = {
        query: {},
        user: studentUser1,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await getStudentMyTests(req, res, () => {});
      assert(status === 200, 'getStudentMyTests succeeds (200 OK)');
      assert(json.tests.length === 1, `Found enrolled test card for student 1 (count: ${json.tests.length})`);
      const testCard = json.tests[0];
      assert(testCard.showScore === false, 'testCard.showScore is FALSE while results unpublished');
      assert(testCard.score === undefined, 'testCard.score is undefined (hidden)');
      assert(testCard.resultsPublished === false, 'testCard.resultsPublished is FALSE');
    }

    // 5B. When recruiter publishes results (resultsPublished = true, showScoreToStudents = true), score is visible
    {
      round1.resultsPublished = true;
      round1.showScoreToStudents = true;
      await round1.save();

      let status = 200;
      let json = null;
      const req = {
        query: {},
        user: studentUser1,
      };
      const res = {
        status: (code) => {
          status = code;
          return res;
        },
        json: (data) => {
          json = data;
          return res;
        },
      };
      await getStudentMyTests(req, res, () => {});
      const testCard = json.tests[0];
      assert(testCard.showScore === true, 'testCard.showScore is TRUE after results published');
      assert(testCard.score === 10, `testCard.score is exposed as 10 (got: ${testCard.score})`);
      assert(testCard.resultsPublished === true, 'testCard.resultsPublished is TRUE');
    }

    console.log('\n--- TEST SUITE 6: Concurrent Save Safety, Live Validation & Race-Safe Finalizer ---');

    // 6A. Backend double-save safety: fire 2 concurrent updateRoundSettings calls
    {
      const concurrentRound = await Round.create({
        drive: drive._id,
        name: 'Concurrent Save Test Round',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 10,
        status: 'scheduled',
        testWindowStart: new Date(Date.now() + 2 * 3600 * 1000),
        testWindowEnd: new Date(Date.now() + 4 * 3600 * 1000),
        durationMinutes: 60,
        cutoffScore: 50,
      });

      const makeRequest = (cutoffVal, instructionsVal) => {
        let status = 200;
        let json = null;
        let errPassed = null;
        const req = {
          params: { id: concurrentRound._id.toString() },
          body: {
            cutoffScore: cutoffVal,
            instructions: instructionsVal,
          },
          user: recruiterUser,
        };
        const res = {
          status: (code) => {
            status = code;
            return res;
          },
          json: (data) => {
            json = data;
            return res;
          },
        };
        const next = (err) => {
          errPassed = err;
        };
        return updateRoundSettings(req, res, next).then(() => ({ status, json, errPassed }));
      };

      const [res1, res2] = await Promise.all([
        makeRequest(65, 'Instructions from Call 1'),
        makeRequest(75, 'Instructions from Call 2'),
      ]);

      assert(res1.status !== 500 && res2.status !== 500, 'Neither concurrent save returns HTTP 500');
      assert(res1.errPassed === null && res2.errPassed === null, 'Neither concurrent save passes unhandled error to next()');
      assert([200, 409].includes(res1.status), `Call 1 returned valid status (${res1.status})`);
      assert([200, 409].includes(res2.status), `Call 2 returned valid status (${res2.status})`);

      const freshRound = await Round.findById(concurrentRound._id);
      assert(freshRound !== null, 'Round exists in DB');
      assert([65, 75].includes(freshRound.cutoffScore), `DB state is consistent with one of the saves (cutoffScore: ${freshRound.cutoffScore})`);
      assert(['Instructions from Call 1', 'Instructions from Call 2'].includes(freshRound.instructions), `DB instructions consistent (${freshRound.instructions})`);
    }

    // 6B. Selective validation on live round
    {
      const liveRound = await Round.create({
        drive: drive._id,
        name: 'Live Round Validation Test',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 11,
        status: 'live',
        testWindowStart: new Date(Date.now() - 30 * 60 * 1000), // started 30 mins ago
        testWindowEnd: new Date(Date.now() + 30 * 60 * 1000),   // ends in 30 mins
        durationMinutes: 60,
        cutoffScore: 50,
      });

      const question = await Question.create({
        round: liveRound._id,
        text: 'What is O(1) complexity?',
        options: ['Constant', 'Linear', 'Quadratic', 'Logarithmic'],
        correctIndex: 0,
        marks: 2,
      });

      // 6B-1: Updating non-window fields (cutoff, instructions, name) on LIVE round succeeds
      {
        let status = 200;
        let json = null;
        const req = {
          params: { id: liveRound._id.toString() },
          body: {
            cutoffScore: 70,
            instructions: 'Live instructions updated by recruiter',
            name: 'Live Round Validation Test (Updated)',
          },
          user: recruiterUser,
        };
        const res = {
          status: (code) => {
            status = code;
            return res;
          },
          json: (data) => {
            json = data;
            return res;
          },
        };
        await updateRoundSettings(req, res, () => {});
        assert(status === 200, `Updating cutoff & instructions on live round succeeds with 200 (got: ${status})`);
        const updated = await Round.findById(liveRound._id);
        assert(updated.cutoffScore === 70, `DB cutoffScore updated to 70 (got: ${updated.cutoffScore})`);
        assert(updated.name === 'Live Round Validation Test (Updated)', 'DB round name updated successfully');
      }

      // 6B-2: Modifying window or duration on LIVE round is blocked
      {
        let status = 200;
        let json = null;
        const req = {
          params: { id: liveRound._id.toString() },
          body: {
            testWindowEnd: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
          },
          user: recruiterUser,
        };
        const res = {
          status: (code) => {
            status = code;
            return res;
          },
          json: (data) => {
            json = data;
            return res;
          },
        };
        await updateRoundSettings(req, res, () => {});
        assert(status === 400, `Modifying testWindowEnd while round is live is blocked with 400 (got: ${status})`);
        assert(json.message.includes('Cannot modify test window schedule or duration while the test is live'), `Block message: "${json.message}"`);
      }

      // 6B-3: Modifying questions on LIVE round is blocked
      {
        let status = 200;
        let json = null;
        const req = {
          params: { id: question._id.toString() },
          body: {
            text: 'Modified question text?',
          },
          user: recruiterUser,
        };
        const res = {
          status: (code) => {
            status = code;
            return res;
          },
          json: (data) => {
            json = data;
            return res;
          },
        };
        await updateQuestion(req, res, () => {});
        assert(status === 400, `Modifying question on live round is blocked with 400 (got: ${status})`);
        assert(json.message.includes('Questions cannot be modified once the test window has opened'), `Block message: "${json.message}"`);
      }
    }

    // 6C. Race-safe round finalizer: 5 parallel calls via Promise.all
    {
      const expiredRound = await Round.create({
        drive: drive._id,
        name: 'Race-Safe Finalizer Test Round',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 12,
        status: 'scheduled',
        testWindowStart: new Date(Date.now() - 3 * 3600 * 1000), // started 3h ago
        testWindowEnd: new Date(Date.now() - 1 * 3600 * 1000),   // ended 1h ago
        durationMinutes: 60,
        cutoffScore: 1,
      });

      const qRace = await Question.create({
        round: expiredRound._id,
        text: 'Race Question 1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        marks: 5,
      });

      // Participant 1: In progress attempt (should be auto-submitted)
      const part1 = await RoundParticipant.create({
        round: expiredRound._id,
        drive: drive._id,
        student: studentProfile1._id,
        application: app1._id,
        status: 'enrolled',
        attendance: 'pending',
        result: 'pending',
      });

      await TestAttempt.create({
        round: expiredRound._id,
        student: studentProfile1._id,
        application: app1._id,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 2 * 3600 * 1000),
        deadlineAt: new Date(Date.now() - 1 * 3600 * 1000),
        answers: [{ question: qRace._id, selectedIndex: 0 }],
      });

      // Participant 2: Never started (should be marked absent)
      const part2 = await RoundParticipant.create({
        round: expiredRound._id,
        drive: drive._id,
        student: studentProfile2._id,
        application: app2._id,
        status: 'enrolled',
        attendance: 'pending',
        result: 'pending',
      });

      // Execute 5 concurrent finalizer calls
      const results = await Promise.all([
        autoCompletePlatformTestRounds({ roundId: expiredRound._id }),
        autoCompletePlatformTestRounds({ roundId: expiredRound._id }),
        autoCompletePlatformTestRounds({ roundId: expiredRound._id }),
        autoCompletePlatformTestRounds({ roundId: expiredRound._id }),
        autoCompletePlatformTestRounds({ roundId: expiredRound._id }),
      ]);

      const totalAutoSubmitted = results.reduce((acc, r) => acc + r.autoSubmittedCount, 0);
      const totalAbsent = results.reduce((acc, r) => acc + r.absentCount, 0);
      const allCompletedIds = results.flatMap((r) => r.completedRoundIds);

      assert(totalAutoSubmitted === 1, `Attempts auto-submitted exactly once across all 5 runs (got: ${totalAutoSubmitted})`);
      assert(totalAbsent === 1, `Students marked absent exactly once across all 5 runs (got: ${totalAbsent})`);
      assert(allCompletedIds.length === 1, `Round reported as completed exactly once (count: ${allCompletedIds.length})`);
      assert(allCompletedIds[0] === expiredRound._id.toString(), 'Completed round ID matches expiredRound');

      // Check DB integrity
      const finalRound = await Round.findById(expiredRound._id);
      assert(finalRound.status === 'completed', 'Round status in DB is "completed"');
      assert(finalRound.isFinalizing === false, 'Round isFinalizing lock flag is cleared (false)');

      const finalAttempt1 = await TestAttempt.findOne({ round: expiredRound._id, student: studentProfile1._id });
      assert(finalAttempt1.status === 'auto_submitted', 'Attempt 1 is auto_submitted');
      assert(finalAttempt1.score === 5, `Attempt 1 score evaluated as 5 (got: ${finalAttempt1.score})`);

      const finalPart1 = await RoundParticipant.findById(part1._id);
      assert(finalPart1.attendance === 'present', 'Participant 1 attendance is present');
      assert(finalPart1.result === 'cleared', 'Participant 1 result is cleared (score 5 >= cutoff 1)');

      const finalPart2 = await RoundParticipant.findById(part2._id);
      assert(finalPart2.attendance === 'absent', 'Participant 2 attendance is absent');
      assert(finalPart2.result === 'rejected', 'Participant 2 result is rejected');

      // Verify no duplicate participants were created
      const allParticipants = await RoundParticipant.find({ round: expiredRound._id });
      assert(allParticipants.length === 2, `Participant count remained exactly 2 (zero duplicates, got: ${allParticipants.length})`);
    }

    console.log('\n--- TEST SUITE 7: Finalizer Robustness, Schema Validation & Multi-Round Resilience ---');

    // 7A: Direct schema validation: setting result = 'shortlisted' fails validation on .save()
    {
      const invalidPart = new RoundParticipant({
        round: round1._id,
        drive: drive._id,
        student: studentProfile1._id,
        application: app1._id,
        status: 'enrolled',
        attendance: 'present',
        result: 'shortlisted', // invalid enum!
      });

      let caughtError = null;
      try {
        await invalidPart.save();
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError !== null, 'Saving RoundParticipant with result: "shortlisted" is rejected');
      assert(caughtError?.name === 'ValidationError', `Throws ValidationError (got: ${caughtError?.name})`);
      assert(
        caughtError?.message?.includes('is not a valid enum value') ||
        caughtError?.message?.includes('is not a valid result status') ||
        caughtError?.message?.includes('validation failed'),
        `Error contains clear validation failure message: "${caughtError?.message}"`
      );
    }

    // 7B: Valid enum assignment: completed round sets result to 'cleared' for >= cutoff
    {
      const testRound7B = await Round.create({
        drive: drive._id,
        name: 'Enum Assignment Test Round',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 20,
        status: 'scheduled',
        testWindowStart: new Date(Date.now() - 2 * 3600 * 1000),
        testWindowEnd: new Date(Date.now() - 1 * 3600 * 1000),
        durationMinutes: 45,
        cutoffScore: 10,
      });

      const q7B = await Question.create({
        round: testRound7B._id,
        text: 'Question 7B',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correctIndex: 0,
        marks: 10,
      });

      const partPass = await RoundParticipant.create({
        round: testRound7B._id,
        drive: drive._id,
        student: studentProfile1._id,
        application: app1._id,
        status: 'enrolled',
        attendance: 'pending',
        result: 'pending',
      });

      await TestAttempt.create({
        round: testRound7B._id,
        student: studentProfile1._id,
        application: app1._id,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 90 * 60 * 1000),
        deadlineAt: new Date(Date.now() - 70 * 60 * 1000),
        answers: [{ question: q7B._id, selectedIndex: 0 }],
      });

      const res7B = await autoCompletePlatformTestRounds({ roundId: testRound7B._id });
      assert(res7B.completedRoundIds.includes(testRound7B._id.toString()), 'testRound7B completed successfully');

      const updatedPartPass = await RoundParticipant.findById(partPass._id);
      assert(updatedPartPass.result === 'cleared', `Passing participant received valid enum 'cleared' (got: ${updatedPartPass.result})`);
      assert(updatedPartPass.attendance === 'present', 'Passing participant attendance is present');
      assert(updatedPartPass.score === 10, 'Passing participant score is 10');
    }

    // 7C: Multi-round batch resilience: failing round does not block other rounds in batch
    {
      const roundA = await Round.create({
        drive: drive._id,
        name: 'Sabotaged Round A',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 21,
        status: 'scheduled',
        testWindowStart: new Date(Date.now() - 3 * 3600 * 1000),
        testWindowEnd: new Date(Date.now() - 2 * 3600 * 1000),
        durationMinutes: 30,
        cutoffScore: 10,
      });

      const roundB = await Round.create({
        drive: drive._id,
        name: 'Valid Round B',
        type: 'aptitude',
        deliveryMode: 'platform_test',
        mode: 'online',
        order: 22,
        status: 'scheduled',
        testWindowStart: new Date(Date.now() - 3 * 3600 * 1000),
        testWindowEnd: new Date(Date.now() - 2 * 3600 * 1000),
        durationMinutes: 30,
        cutoffScore: 5,
      });

      // Insert raw participant missing required 'drive' reference so p.save() fails schema validation
      await RoundParticipant.collection.insertOne({
        round: roundA._id,
        student: studentProfile1._id,
        application: app1._id,
        attendance: 'pending',
        result: 'pending',
        drive: null,
      });

      // Valid participant for round B
      await RoundParticipant.create({
        round: roundB._id,
        drive: drive._id,
        student: studentProfile2._id,
        application: app2._id,
        status: 'enrolled',
        attendance: 'pending',
        result: 'pending',
      });

      // Run finalizer across the entire batch (no roundId filter)
      const batchResult = await autoCompletePlatformTestRounds();

      // Round B MUST complete successfully
      assert(batchResult.completedRoundIds.includes(roundB._id.toString()), 'Valid Round B completed despite Round A failure');

      const checkRoundB = await Round.findById(roundB._id);
      assert(checkRoundB.status === 'completed', 'Round B status is "completed"');
      assert(checkRoundB.isFinalizing === false, 'Round B lock released');

      // Round A should NOT be marked completed, and its isFinalizing lock must be released
      const checkRoundA = await Round.findById(roundA._id);
      assert(checkRoundA.status !== 'completed', 'Round A did not falsely complete');
      assert(checkRoundA.isFinalizing === false, 'Round A isFinalizing lock was released after failure');

      // Cleanup test records
      await RoundParticipant.deleteOne({ round: roundA._id });
      await Round.deleteOne({ _id: roundA._id });
    }

    // 7D: Idempotency: Repeated execution is a safe no-op
    {
      const idemRun1 = await autoCompletePlatformTestRounds();
      const idemRun2 = await autoCompletePlatformTestRounds();

      assert(idemRun1.autoSubmittedCount === 0, 'No extra auto-submissions on already-completed rounds');
      assert(idemRun2.autoSubmittedCount === 0, 'Repeated call remains completely idempotent');
      assert(idemRun2.completedRoundIds.length === 0, 'No repeated round completions');
    }

    console.log('\n======================================================');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('======================================================\n');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runTests();
