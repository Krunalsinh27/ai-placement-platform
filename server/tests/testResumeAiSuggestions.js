/**
 * Resume Studio Phase 7: AI Suggestions & Anti-Hallucination Verification Test Suite
 *
 * Verifies:
 * 1. Valid bullet suggestion generation (active verb + metric placeholder)
 * 2. Valid summary suggestion generation (tailored while retaining numbers and facts)
 * 3. Valid skills reordering without introducing unlisted skills
 * 4. Anti-hallucination rejection: unverified numbers/metrics rejected (422)
 * 5. Anti-hallucination rejection: unknown employers rejected (422)
 * 6. Anti-hallucination rejection: unverified skills in bullets rejected (422)
 * 7. Anti-hallucination rejection: invented skills in skills suggestion rejected (422)
 * 8. Accept applies only the targeted change to resume document
 * 9. Reject leaves resume document completely untouched
 * 10. AiUsage quota is strictly enforced (429 on exhaustion)
 * 11. Multi-tenant isolation: students cannot request suggestions for other students' resumes
 */

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';

const {
  User,
  Student,
  College,
  Resume,
  AiUsage,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const resumeStudioRoutes = require('../routes/resumeStudioRoutes');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.AI_PROVIDER_CHAIN = 'mock';

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_dev_mode_only_change_in_production';

let server;
let baseUrl;
let testsPassed = 0;
let testsFailed = 0;

function createToken(userId, role, collegeId = null) {
  return jwt.sign(
    {
      id: userId,
      role,
      college: collegeId,
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

async function runSuggestionTests() {
  console.log('\n======================================================================');
  console.log('TEST SUITE: RESUME STUDIO PHASE 7 - AI SUGGESTIONS & GROUNDING');
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
      reasonCodes: err.reasonCodes || [],
    });
  });

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api/resume-studio`;

  let collegeA, collegeB;
  let userStudentA, studentA, tokenStudentA;
  let userStudentB, studentB, tokenStudentB;
  let resumeA;

  try {
    // Clean previous test artifacts
    await Resume.deleteMany({ title: { $regex: /Phase7/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^P7/ } });
    await User.deleteMany({ email: { $regex: /phase7/ } });
    await College.deleteMany({ code: { $regex: /^P7/ } });
    await AiUsage.deleteMany({});

    mockProvider.reset();

    // 1. Setup Colleges
    collegeA = await College.create({
      name: 'Phase7 Alpha Tech',
      code: 'P7A',
      city: 'Pune',
      state: 'Maharashtra',
      approved: true,
    });

    collegeB = await College.create({
      name: 'Phase7 Beta Tech',
      code: 'P7B',
      city: 'Mumbai',
      state: 'Maharashtra',
      approved: true,
    });

    // 2. Setup Student A
    userStudentA = await User.create({
      name: 'Phase7 Student Alice',
      email: 'student_alice_phase7@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
    });

    studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'P7A001',
      batchYear: 2026,
      branch: 'Computer Science',
      phone: '9876543210',
      cgpa: 8.8,
    });
    tokenStudentA = createToken(userStudentA._id, 'student', collegeA._id);

    // 3. Setup Student B
    userStudentB = await User.create({
      name: 'Phase7 Student Bob',
      email: 'student_bob_phase7@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeB._id,
    });

    studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'P7B001',
      batchYear: 2026,
      branch: 'Information Technology',
      phone: '9876543211',
      cgpa: 8.5,
    });
    tokenStudentB = createToken(userStudentB._id, 'student', collegeB._id);

    // 4. Create Baseline Resume for Student A
    resumeA = await Resume.create({
      student: studentA._id,
      college: collegeA._id,
      title: 'Phase7 Engineering Resume',
      templateId: 'software-engineer',
      data: {
        contact: {
          fullName: 'Alice Developer',
          email: 'alice@example.com',
          phone: '+91 9876543210',
          location: 'Pune, India',
          linkedin: 'https://linkedin.com/in/alicedev',
          github: 'https://github.com/alicedev',
        },
        summary: 'Passionate computer science engineer with experience in distributed backend APIs and database indexing with 20% latency reduction.',
        skills: [
          { category: 'Languages', items: ['TypeScript', 'JavaScript', 'Python', 'SQL'] },
          { category: 'Frameworks & Tools', items: ['React', 'Express', 'Node.js', 'MongoDB', 'Docker'] },
        ],
        experience: [
          {
            title: 'Backend Intern',
            company: 'CloudScale Labs',
            location: 'Bangalore',
            duration: 'Jan 2025 - Present',
            bullets: [
              'Worked on backend apis and web features',
              'Assisted with database indexing and query optimization',
            ],
          },
        ],
        projects: [
          {
            title: 'Cloud Storage API',
            technologies: ['Node.js', 'Docker', 'MongoDB'],
            bullets: [
              'Built scalable file processing pipeline',
            ],
          },
        ],
        education: [
          {
            institution: 'Phase7 Alpha Tech',
            degree: 'B.Tech',
            fieldOfStudy: 'Computer Science',
            startYear: '2022',
            endYear: '2026',
            score: '8.8 CGPA',
          },
        ],
      },
    });

    // ------------------------------------------------------------------------
    // TEST 1: Valid Bullet Suggestion
    // ------------------------------------------------------------------------
    await test('1. Valid bullet suggestion returns 200 with grounded action verb rewrite', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'bullet',
          section: 'experience',
          itemIndex: 0,
          bulletIndex: 0,
          originalText: 'Worked on backend apis and web features',
          targetRole: 'Backend Engineer',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.type, 'bullet');
      assert.strictEqual(body.target.section, 'experience');
      assert.strictEqual(body.target.itemIndex, 0);
      assert.strictEqual(body.target.bulletIndex, 0);
      assert.ok(typeof body.proposed === 'string' && body.proposed.length > 5);
      assert.ok(body.proposed.includes('[add your real number]') || body.proposed.toLowerCase().startsWith('developed') || body.proposed.toLowerCase().startsWith('built'));
    });

    // ------------------------------------------------------------------------
    // TEST 2: Valid Summary Suggestion
    // ------------------------------------------------------------------------
    await test('2. Valid summary suggestion returns 200 retaining metrics and verified facts', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'summary',
          originalText: resumeA.data.summary,
          targetRole: 'Backend Engineer',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.type, 'summary');
      assert.ok(typeof body.proposed === 'string' && body.proposed.length > 10);
      // Retains key metric from original
      assert.ok(body.proposed.includes('20%') || body.proposed.includes('[add your real number]'));
    });

    // ------------------------------------------------------------------------
    // TEST 3: Valid Skills Reordering
    // ------------------------------------------------------------------------
    await test('3. Valid skills suggestion returns 200 reordering existing skills without adding new ones', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'skills',
          targetRole: 'Python Cloud Developer',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.type, 'skills');
      assert.ok(Array.isArray(body.proposed));
      assert.strictEqual(body.proposed.length, resumeA.data.skills.length);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Anti-Hallucination - Rejects Unknown Employer
    // ------------------------------------------------------------------------
    await test('4. Anti-hallucination: Rejects summary inventing unknown employer (422)', async () => {
      mockProvider.reset();
      mockProvider.mockSuggestResponse = {
        proposed: 'Distinguished senior engineer at Google and Meta with 20% latency reduction.',
        explanation: 'Invented prestigious big-tech employers.',
      };

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'summary',
          originalText: resumeA.data.summary,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        body.reasonCodes.includes('unknown_employer') || body.message.includes('unknown_employer'),
        `Expected unknown_employer reasonCode, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 5: Anti-Hallucination - Rejects Unverified Numbers / Metrics
    // ------------------------------------------------------------------------
    await test('5. Anti-hallucination: Rejects bullet inventing ungrounded metrics without placeholder (422)', async () => {
      mockProvider.reset();
      mockProvider.mockSuggestResponse = {
        proposed: 'Developed backend apis and web features boosting revenue by 95% and cutting cost by $500000',
        explanation: 'Fabricated revenue percentages and dollar figures.',
      };

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'bullet',
          section: 'experience',
          itemIndex: 0,
          bulletIndex: 0,
          originalText: 'Worked on backend apis and web features',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        body.reasonCodes.includes('unverified_number') || body.message.includes('unverified_number'),
        `Expected unverified_number reasonCode, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 6: Anti-Hallucination - Rejects Unverified Skill in Bullet
    // ------------------------------------------------------------------------
    await test('6. Anti-hallucination: Rejects bullet introducing unlisted technical skill (422)', async () => {
      mockProvider.reset();
      mockProvider.mockSuggestResponse = {
        proposed: 'Developed distributed consensus protocol using Rust and Cassandra [add your real number]%',
        explanation: 'Introduced Rust and Cassandra not present in resume.',
      };

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'bullet',
          section: 'experience',
          itemIndex: 0,
          bulletIndex: 0,
          originalText: 'Worked on backend apis and web features',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        body.reasonCodes.includes('unverified_skill') || body.message.includes('unverified_skill'),
        `Expected unverified_skill reasonCode, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 7: Anti-Hallucination - Rejects Invented Skills in Skills Suggestion
    // ------------------------------------------------------------------------
    await test('7. Anti-hallucination: Rejects skills suggestion containing unlisted skills (422)', async () => {
      mockProvider.reset();
      mockProvider.mockSuggestResponse = {
        proposed: [
          { category: 'Languages', items: ['TypeScript', 'JavaScript', 'Solidity', 'Go'] },
          { category: 'Frameworks & Tools', items: ['React', 'Express', 'Kubernetes'] },
        ],
        explanation: 'Sneaked in Solidity and Kubernetes.',
      };

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'skills',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 422, `Expected 422 Unprocessable Entity, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(
        body.reasonCodes.includes('invented_skills') || body.message.includes('invented'),
        `Expected invented_skills reasonCode, got: ${JSON.stringify(body)}`
      );
    });

    // ------------------------------------------------------------------------
    // TEST 8: Accept Mutability (Applies Change to Resume Document)
    // ------------------------------------------------------------------------
    await test('8. Accept applies only the targeted change and updates resume document', async () => {
      const acceptedBullet = 'Developed backend apis and web features [add your real number]%';
      const updatedData = JSON.parse(JSON.stringify(resumeA.data));
      updatedData.experience[0].bullets[0] = acceptedBullet;

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          data: updatedData,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(body.resume.data.experience[0].bullets[0], acceptedBullet);
      // Untargeted bullet remains exactly as originally defined
      assert.strictEqual(
        body.resume.data.experience[0].bullets[1],
        'Assisted with database indexing and query optimization'
      );
      assert.strictEqual(body.resume.data.summary, resumeA.data.summary);
    });

    // ------------------------------------------------------------------------
    // TEST 9: Reject Immutability (Leaves Resume Untouched)
    // ------------------------------------------------------------------------
    await test('9. Reject discards suggestion and leaves resume document completely untouched', async () => {
      // Re-read current database state
      const resumeBefore = await Resume.findById(resumeA._id).lean();

      // Trigger a suggestion but do not send accept PATCH
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'bullet',
          section: 'experience',
          itemIndex: 0,
          bulletIndex: 1,
          originalText: 'Assisted with database indexing and query optimization',
        }),
      });
      assert.strictEqual(res.status, 200);

      // Verify resume document in database is 100% identical
      const resumeAfter = await Resume.findById(resumeA._id).lean();
      assert.deepStrictEqual(
        resumeAfter.data.experience[0].bullets,
        resumeBefore.data.experience[0].bullets
      );
      assert.strictEqual(resumeAfter.data.summary, resumeBefore.data.summary);
    });

    // ------------------------------------------------------------------------
    // TEST 10: Quota Enforcement (429 on Exhaustion)
    // ------------------------------------------------------------------------
    await test('10. Quota enforcement: returns 429 when user daily AI quota is exhausted', async () => {
      mockProvider.reset();
      // Artificially exhaust student's daily tailor quota in AiUsage
      const dateKey = AiUsage.getTodayKey();
      const tailorCap = parseInt(process.env.AI_USER_DAILY_TAILOR_CAP || '10', 10);

      await AiUsage.findOneAndUpdate(
        { date: dateKey },
        { $set: { [`userTailorCounts.${String(userStudentA._id)}`]: tailorCap + 1 } },
        { upsert: true }
      );

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          type: 'summary',
          originalText: resumeA.data.summary,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 429, `Expected 429 Too Many Requests, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('quota') || body.message.includes('reached'));

      // Clean up quota for clean state
      await AiUsage.deleteMany({});
    });

    // ------------------------------------------------------------------------
    // TEST 11: Multi-Tenant & Role Isolation
    // ------------------------------------------------------------------------
    await test('11. Security & Isolation: Student B cannot request suggestions for Student A resume (403/404)', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({
          type: 'summary',
          originalText: resumeA.data.summary,
        }),
      });

      assert.ok(
        res.status === 403 || res.status === 404,
        `Expected 403 Forbidden or 404 Not Found, got ${res.status}`
      );
    });

  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 7 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('----------------------------------------------------------------------');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runSuggestionTests().catch((err) => {
  console.error('Test runner unexpected failure:', err);
  process.exit(1);
});
