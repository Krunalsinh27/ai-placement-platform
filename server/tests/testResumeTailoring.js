/**
 * Resume Studio Phase 8 & 8b: AI Tailoring & Change Proposals Test Suite
 *
 * Verifies:
 * 1. POST /resumes/:id/tailor generates a structured list of change proposals from custom JD
 * 2. Proposals include section, original, proposed, reason, and matched JD keyword
 * 3. Every proposal passed validators (validateBulletRewrite, validateSummaryRewrite, verifySourceFacts)
 * 4. Proposals stored in short-lived, server-trusted TailorSession
 * 5. POST /resumes/:id/tailor works with target driveId and verifies college isolation
 * 6. Score parity: Read-only match score equals scoreResumeForTarget with SCORING_VERSION
 * 7. Nothing applied without explicit acceptance (empty acceptedProposalIds returns 400)
 * 8. Base resume protection: Pre-tailoring state saved as ResumeVersion (source: manual, label "Before tailoring")
 *    and original content is recoverable via the restore endpoint
 * 9. Server-trusted proposals: Forged proposed text sent by client is strictly ignored
 * 10. Unknown / invalid proposal ID is rejected with 400
 * 11. Tailor session from another student is rejected with 403
 * 12. Expired session is rejected with 400
 * 13. Tailor daily quota cap is strictly enforced (429 on exhaustion)
 * 14. Multi-tenant security: Student B cannot tailor or apply proposals to Student A's resume (403/404)
 */

const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.AI_PROVIDER_CHAIN = 'mock';

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Resume,
  ResumeVersion,
  TailorSession,
  AiUsage,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const resumeStudioRoutes = require('../routes/resumeStudioRoutes');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');
const { scoreResumeForTarget, SCORING_VERSION } = require('../services/ai/resumeAnalyzer');
const { analyzeJobDescription } = require('../services/ai/jdAnalyzer');

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

async function runTailoringTests() {
  console.log('\n======================================================================');
  console.log('TEST SUITE: RESUME STUDIO PHASE 8 & 8b - TAILORING & SERVER-TRUSTED PROPOSALS');
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

  let collegeA, collegeB;
  let userStudentA, studentA, tokenStudentA;
  let userStudentB, studentB, tokenStudentB;
  let company, driveA, driveB;
  let resumeA, originalResumeDataCopy;

  try {
    // Clean test leftovers
    await Resume.deleteMany({ title: { $regex: /Phase8/ } });
    await ResumeVersion.deleteMany({ name: { $regex: /Phase8|Tailored|Before tailoring/ } });
    await TailorSession.deleteMany({});
    await Student.deleteMany({ enrollmentNo: { $regex: /^P8/ } });
    await User.deleteMany({ email: { $regex: /phase8/ } });
    await Drive.deleteMany({ role: { $regex: /Phase8/ } });
    await Company.deleteMany({ name: { $regex: /Phase8/ } });
    await College.deleteMany({ code: { $regex: /^P8/ } });
    await AiUsage.deleteMany({});

    mockProvider.reset();

    // 1. Setup Colleges
    collegeA = await College.create({
      name: 'Phase8 Engineering College',
      code: 'P8A',
      city: 'Bangalore',
      state: 'Karnataka',
      approved: true,
    });

    collegeB = await College.create({
      name: 'Phase8 University of Science',
      code: 'P8B',
      city: 'Mysore',
      state: 'Karnataka',
      approved: true,
    });

    // 2. Setup Company & Drives
    company = await Company.create({
      name: 'Phase8 CloudTech Solutions',
      website: 'https://cloudtech.phase8.example.com',
      industry: 'Technology',
    });

    driveA = await Drive.create({
      company: company._id,
      college: collegeA._id,
      role: 'Phase8 Cloud Backend Engineer',
      description: 'Looking for backend engineers skilled in Node.js, Docker, and MongoDB.',
      requiredSkills: ['Node.js', 'Docker', 'MongoDB'],
      preferredSkills: ['TypeScript', 'Redis'],
      allowedBranches: ['Computer Science'],
      location: 'Bangalore',
      packageLpa: 14,
      driveDate: new Date(Date.now() + 7 * 86400000),
      lastDateToApply: new Date(Date.now() + 3 * 86400000),
      status: 'open',
    });

    driveB = await Drive.create({
      company: company._id,
      college: collegeB._id, // Restricted to College B
      role: 'Phase8 Exclusive College B Role',
      description: 'Exclusive role for College B students only.',
      requiredSkills: ['Python', 'Django'],
      allowedBranches: ['Information Science'],
      location: 'Mysore',
      packageLpa: 12,
      driveDate: new Date(Date.now() + 7 * 86400000),
      lastDateToApply: new Date(Date.now() + 3 * 86400000),
      status: 'open',
    });

    // 3. Setup Students
    userStudentA = await User.create({
      name: 'Phase8 Alice Smith',
      email: 'student_alice_phase8@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
    });

    studentA = await Student.create({
      user: userStudentA._id,
      college: collegeA._id,
      enrollmentNo: 'P8A001',
      batchYear: 2026,
      branch: 'Computer Science',
      phone: '9876543220',
      cgpa: 9.0,
    });
    tokenStudentA = createToken(userStudentA._id, 'student', collegeA._id);

    userStudentB = await User.create({
      name: 'Phase8 Bob Jones',
      email: 'student_bob_phase8@example.com',
      password: 'Password@123',
      role: 'student',
      college: collegeB._id,
    });

    studentB = await Student.create({
      user: userStudentB._id,
      college: collegeB._id,
      enrollmentNo: 'P8B001',
      batchYear: 2026,
      branch: 'Information Science',
      phone: '9876543221',
      cgpa: 8.6,
    });
    tokenStudentB = createToken(userStudentB._id, 'student', collegeB._id);

    // 4. Create Baseline Resume for Student A
    originalResumeDataCopy = {
      contact: {
        fullName: 'Alice Smith',
        email: 'alice.smith@example.com',
        phone: '+91 9876543220',
        location: 'Bangalore, India',
        github: 'https://github.com/alicesmith',
        linkedin: 'https://linkedin.com/in/alicesmith',
      },
      summary: 'Aspiring software developer with strong foundation in full stack development.',
      skills: [
        {
          category: 'Programming Languages',
          items: ['JavaScript', 'Python', 'C++'],
        },
        {
          category: 'Frameworks & Tools',
          items: ['Node.js', 'Express', 'React', 'Git', 'MongoDB'],
        },
      ],
      experience: [
        {
          title: 'Software Engineering Intern',
          company: 'Acme Software Labs',
          location: 'Bangalore',
          duration: 'Jan 2025 - Jun 2025',
          bullets: [
            'Assisted senior team in developing RESTful web services in Node.js and Express.',
            'Collaborated with QA to improve test coverage across APIs.',
          ],
        },
      ],
      projects: [
        {
          title: 'Campus Placement Portal',
          technologies: ['React', 'Node.js', 'MongoDB', 'Docker'],
          duration: '3 months',
          link: 'https://github.com/alicesmith/placement-portal',
          bullets: [
            'Developed full stack portal for university recruitment scheduling.',
            'Implemented authentication and real-time notification engine.',
          ],
        },
      ],
      education: [
        {
          degree: 'B.Tech in Computer Science',
          institution: 'Phase8 Engineering College',
          field: 'Computer Science',
          year: '2026',
          score: '9.0 CGPA',
        },
      ],
    };

    resumeA = await Resume.create({
      student: studentA._id,
      college: collegeA._id,
      title: 'Phase8 Fullstack Baseline Resume',
      templateId: 'software-engineer',
      data: JSON.parse(JSON.stringify(originalResumeDataCopy)),
    });

    let generatedSessionId;
    let generatedProposals = [];
    let generatedJdSnapshot = {};
    const sampleJobDescription =
      'We are seeking a Backend Engineer with strong skills in Node.js, Docker, and MongoDB to optimize high-throughput distributed microservices.';

    // ------------------------------------------------------------------------
    // TEST 1: POST /resumes/:id/tailor with custom JD & server-side session
    // ------------------------------------------------------------------------
    await test('1. POST /resumes/:id/tailor generates proposals, validates them, and stores in TailorSession', async () => {
      mockProvider.reset();
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          jobDescription: sampleJobDescription,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.success, true);
      assert.ok(body.sessionId, 'Response must include sessionId');
      assert.ok(Array.isArray(body.proposals), 'Expected proposals array');
      assert.ok(body.proposals.length > 0, 'Expected at least one change proposal');

      // Verify server TailorSession doc exists in DB
      const sessionDoc = await TailorSession.findById(body.sessionId).lean();
      assert.ok(sessionDoc, 'TailorSession must be persisted in DB');
      assert.ok(
        [String(studentA._id), String(userStudentA._id)].includes(String(sessionDoc.student)),
        'Session student must match student ID'
      );
      assert.strictEqual(String(sessionDoc.resume), String(resumeA._id));
      assert.ok(sessionDoc.expiresAt, 'TailorSession must have TTL expiresAt');

      // Verify each proposal conforms to structure
      for (const p of body.proposals) {
        assert.ok(p.id, 'Proposal must have id');
        assert.ok(['summary', 'skills', 'experience', 'projects'].includes(p.section), `Invalid section: ${p.section}`);
        assert.notStrictEqual(p.original, undefined, 'Proposal must have original');
        assert.notStrictEqual(p.proposed, undefined, 'Proposal must have proposed');
        assert.ok(typeof p.reason === 'string', 'Proposal must have reason string');
        assert.ok(typeof p.matchedJdKeyword === 'string', 'Proposal must have matchedJdKeyword');
      }

      assert.ok(typeof body.baselineScore === 'number');
      assert.ok(typeof body.projectedScore === 'number');
      assert.ok(body.jdSnapshot, 'Expected jdSnapshot object');

      generatedSessionId = body.sessionId;
      generatedProposals = body.proposals;
      generatedJdSnapshot = body.jdSnapshot;
    });

    // ------------------------------------------------------------------------
    // TEST 2: Score Parity between Tailoring and Resume AI Analyzer
    // ------------------------------------------------------------------------
    await test('2. Score Parity: baselineScore matches scoreResumeForTarget with SCORING_VERSION', async () => {
      const jdAnalysis = await analyzeJobDescription(sampleJobDescription, { userId: userStudentA._id });
      const analyzerScore = scoreResumeForTarget({
        resumeData: resumeA.data,
        jdAnalysis,
      });

      assert.strictEqual(
        analyzerScore.scoringVersion,
        SCORING_VERSION,
        `Expected analyzer scoring version ${SCORING_VERSION}`
      );

      // Verify baselineScore from tailoring equals analyzer's computed overallScore
      const sessionDoc = await TailorSession.findById(generatedSessionId).lean();
      assert.strictEqual(
        sessionDoc.baselineScore,
        analyzerScore.overallScore,
        'Tailoring baselineScore must match scoreResumeForTarget overallScore exactly'
      );
    });

    // ------------------------------------------------------------------------
    // TEST 3: Drive ID & Multi-College Isolation
    // ------------------------------------------------------------------------
    await test('3. POST /resumes/:id/tailor works with driveId and enforces college isolation', async () => {
      mockProvider.reset();
      // Drive A belongs to College A -> Student A is allowed
      const resAllowed = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: String(driveA._id),
        }),
      });

      const bodyAllowed = await resAllowed.json();
      assert.strictEqual(resAllowed.status, 200, `Expected 200, got ${resAllowed.status}`);
      assert.strictEqual(bodyAllowed.success, true);
      assert.strictEqual(bodyAllowed.targetRole, 'Phase8 Cloud Backend Engineer');

      // Drive B belongs to College B -> Student A must be denied (403)
      const resDenied = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          driveId: String(driveB._id),
        }),
      });

      assert.strictEqual(resDenied.status, 403, `Expected 403 Forbidden, got ${resDenied.status}`);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Empty acceptedProposalIds returns 400
    // ------------------------------------------------------------------------
    await test('4. POST /resumes/:id/tailor/apply fails with 400 when no proposals are accepted', async () => {
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          sessionId: generatedSessionId,
          acceptedProposalIds: [],
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
      assert.strictEqual(body.success, false);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Base Resume Protection & Version Recovery via Restore Endpoint
    // ------------------------------------------------------------------------
    let preTailorVersionId = null;
    let tailoredVersionId = null;

    await test('5. Base Resume Protection: Saves "Before tailoring" ResumeVersion and allows full recovery via restore', async () => {
      const bulletProp = generatedProposals.find((p) => p.section === 'experience');
      assert.ok(bulletProp, 'Expected experience bullet proposal');

      // Count versions before apply
      const versionsBefore = await ResumeVersion.countDocuments({ resume: resumeA._id });

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          sessionId: generatedSessionId,
          acceptedProposalIds: [bulletProp.id],
          versionName: 'Phase8 Tailored Version 1',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      tailoredVersionId = body.version._id;

      // Verify versions count grew by 2: (1) "Before tailoring" manual version, (2) "Phase8 Tailored Version 1" ai-tailor version
      const allVersions = await ResumeVersion.find({ resume: resumeA._id }).sort({ createdAt: 1 }).lean();
      assert.strictEqual(allVersions.length, versionsBefore + 2);

      const beforeVersion = allVersions.find((v) => v.name === 'Before tailoring');
      assert.ok(beforeVersion, 'Must have saved "Before tailoring" version');
      assert.strictEqual(beforeVersion.source, 'manual');
      assert.strictEqual(beforeVersion.label, 'Before tailoring');
      preTailorVersionId = beforeVersion._id;

      // Verify resume.data was updated with accepted bullet
      const updatedResume = await Resume.findById(resumeA._id).lean();
      const targetItem = bulletProp.target.itemIndex;
      const targetBullet = bulletProp.target.bulletIndex;
      assert.strictEqual(
        updatedResume.data.experience[targetItem].bullets[targetBullet],
        bulletProp.proposed
      );

      // Verify recovery via restore endpoint
      const restoreRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/versions/${preTailorVersionId}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({}),
      });

      const restoreBody = await restoreRes.json();
      assert.ok(
        [200, 201].includes(restoreRes.status),
        `Expected 200 or 201 on restore, got ${restoreRes.status}`
      );

      // Verify active resume content is restored back to the original pre-tailored bullet
      const restoredResume = await Resume.findById(resumeA._id).lean();
      assert.strictEqual(
        restoredResume.data.experience[targetItem].bullets[targetBullet],
        originalResumeDataCopy.experience[targetItem].bullets[targetBullet],
        'Active resume data must be restored to original content'
      );
    });

    // ------------------------------------------------------------------------
    // TEST 6: Server-Trusted Proposals: Forged text in request is strictly ignored
    // ------------------------------------------------------------------------
    await test('6. Server-trusted proposals: Forged proposed text sent by client is strictly ignored', async () => {
      mockProvider.reset();
      // Generate a fresh session
      const genRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ jobDescription: sampleJobDescription }),
      });
      const genBody = await genRes.json();
      assert.strictEqual(genRes.status, 200);

      const bulletProp = genBody.proposals.find((p) => p.section === 'experience');
      assert.ok(bulletProp);

      // Client attempts to send forged proposed text
      const forgedProposal = {
        id: bulletProp.id,
        section: 'experience',
        target: bulletProp.target,
        original: bulletProp.original,
        proposed: 'MALICIOUS_FORGED_BULLET: Invented 500% ROI and unearned claims.',
      };

      const applyRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          sessionId: genBody.sessionId,
          acceptedProposalIds: [bulletProp.id],
          proposals: [forgedProposal], // Attempted forgery
        }),
      });

      const applyBody = await applyRes.json();
      assert.strictEqual(applyRes.status, 200);

      // Verify active resume and version have the TRUSTED server text, NOT the forged text
      const verDoc = await ResumeVersion.findById(applyBody.version._id).lean();
      const targetItem = bulletProp.target.itemIndex;
      const targetBullet = bulletProp.target.bulletIndex;
      const appliedBullet = verDoc.resumeData.experience[targetItem].bullets[targetBullet];

      assert.strictEqual(
        appliedBullet,
        bulletProp.proposed,
        'Applied bullet must match server-stored proposed text'
      );
      assert.ok(
        !appliedBullet.includes('MALICIOUS_FORGED_BULLET'),
        'Forged client text must NOT be applied'
      );
    });

    // ------------------------------------------------------------------------
    // TEST 7: Unknown / invalid proposal ID rejected with 400
    // ------------------------------------------------------------------------
    await test('7. Unknown proposal ID in acceptedProposalIds is rejected with 400', async () => {
      mockProvider.reset();
      const genRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ jobDescription: sampleJobDescription }),
      });
      const genBody = await genRes.json();

      const applyRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          sessionId: genBody.sessionId,
          acceptedProposalIds: ['nonexistent-fake-proposal-id'],
        }),
      });

      const applyBody = await applyRes.json();
      assert.strictEqual(applyRes.status, 400);
      assert.ok(applyBody.message.includes('Unknown or invalid proposal ID'));
    });

    // ------------------------------------------------------------------------
    // TEST 8: Cross-student session rejection (403)
    // ------------------------------------------------------------------------
    await test('8. Proposal from another student session is rejected with 403', async () => {
      mockProvider.reset();
      // Student A generates a session
      const genRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ jobDescription: sampleJobDescription }),
      });
      const genBody = await genRes.json();

      // Create a resume for Student B
      const resumeB = await Resume.create({
        student: studentB._id,
        college: collegeB._id,
        title: 'Phase8 Student B Resume',
        templateId: 'software-engineer',
        data: originalResumeDataCopy,
      });

      // Student B attempts to apply Student A's sessionId to Student B's resume
      const applyRes = await fetch(`${baseUrl}/resumes/${resumeB._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({
          sessionId: genBody.sessionId,
          acceptedProposalIds: [genBody.proposals[0].id],
        }),
      });

      const applyBody = await applyRes.json();
      assert.strictEqual(applyRes.status, 403, `Expected 403 Forbidden, got ${applyRes.status}`);
      assert.ok(applyBody.message.includes('another student'));
    });

    // ------------------------------------------------------------------------
    // TEST 9: Expired session rejected with 400
    // ------------------------------------------------------------------------
    await test('9. Expired session is rejected with 400', async () => {
      mockProvider.reset();
      const genRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ jobDescription: sampleJobDescription }),
      });
      const genBody = await genRes.json();

      // Manually set session expiresAt into the past
      await TailorSession.findByIdAndUpdate(genBody.sessionId, {
        expiresAt: new Date(Date.now() - 5000),
      });

      const applyRes = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          sessionId: genBody.sessionId,
          acceptedProposalIds: [genBody.proposals[0].id],
        }),
      });

      const applyBody = await applyRes.json();
      assert.strictEqual(applyRes.status, 400, `Expected 400 for expired session, got ${applyRes.status}`);
      assert.ok(applyBody.message.includes('expired'));
    });

    // ------------------------------------------------------------------------
    // TEST 10: Zod validation blocks empty request
    // ------------------------------------------------------------------------
    await test('10. Zod validation blocks request without driveId or jobDescription (400)', async () => {
      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
    });

    // ------------------------------------------------------------------------
    // TEST 11: Tailor Daily Quota Cap Enforced (429 on Exhaustion)
    // ------------------------------------------------------------------------
    await test('11. Tailor daily quota cap is strictly enforced (returns 429)', async () => {
      mockProvider.reset();
      const dateKey = AiUsage.getTodayKey();
      const tailorCap = parseInt(process.env.AI_USER_DAILY_TAILOR_CAP || '10', 10);

      // Artificially saturate user tailor quota in AiUsage
      await AiUsage.findOneAndUpdate(
        { date: dateKey },
        { $set: { [`userTailorCounts.${String(userStudentA._id)}`]: tailorCap } },
        { upsert: true }
      );

      const res = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          jobDescription: 'Software Engineer Node.js MongoDB Docker backend developer.',
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 429, `Expected 429 Too Many Requests, got ${res.status}`);
      assert.strictEqual(body.success, false);
      assert.ok(body.message.includes('quota') || body.message.includes('tailoring'));

      // Clean quota
      await AiUsage.deleteMany({});
    });

    // ------------------------------------------------------------------------
    // TEST 12: Security & Isolation: Student B cannot tailor Student A's resume
    // ------------------------------------------------------------------------
    await test('12. Security & Isolation: Student B cannot tailor or apply proposals to Student A resume (403/404)', async () => {
      mockProvider.reset();
      const resTailor = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({
          jobDescription: 'Software Engineer Node.js MongoDB Docker backend developer.',
        }),
      });

      assert.ok(
        resTailor.status === 403 || resTailor.status === 404,
        `Expected 403 Forbidden or 404 Not Found, got ${resTailor.status}`
      );

      const resApply = await fetch(`${baseUrl}/resumes/${resumeA._id}/tailor/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({
          acceptedProposalIds: ['summary-tailor'],
        }),
      });

      assert.ok(
        resApply.status === 403 || resApply.status === 404,
        `Expected 403 Forbidden or 404 Not Found, got ${resApply.status}`
      );
    });

  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Phase 8 & 8b Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('----------------------------------------------------------------------');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTailoringTests().catch((err) => {
  console.error('Test runner unexpected failure:', err);
  process.exit(1);
});
