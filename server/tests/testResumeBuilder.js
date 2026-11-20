/**
 * Test Suite: AI Resume Builder & Tailoring Feature
 *
 * Verifies:
 * 1. Base resume compilation from Student profile + parsed resumeProfile.
 * 2. Tailoring against Drive & Job Description with Before/After ATS scores.
 * 3. Anti-hallucination guard (validateBulletRewrite strictly rejects invented skills/numbers).
 * 4. Export blocker when '[add your real number]' placeholder exists, and successful PDFKit export across all 3 templates.
 * 5. Version control (strictly capped at max 5 versions, save, list, load, delete, cross-student isolation).
 * 6. Truthful cover letter generator grounded only in candidate profile data.
 * 7. Offline deterministic fallback.
 */

process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';
process.env.AI_USER_DAILY_TAILOR_CAP = '10';

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');

dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  User,
  Student,
  College,
  Company,
  Drive,
  AiUsage,
  ResumeVersion,
  JdAnalysisCache,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const {
  checkUnresolvedPlaceholders,
  compileBaseResume,
  loadResumeSource,
  analyzeResumeTarget,
  generateMatchReport,
  validateSummaryRewrite,
  validateBulletRewrite,
  BANNED_INFLATION_WORDS,
  ALLOW_LISTED_OPENING_VERBS,
  CONDITIONALLY_BANNED_WORDS,
  tailorResume,
  generateCoverLetter,
  saveResumeVersion,
  listResumeVersions,
  getResumeVersion,
  deleteResumeVersion,
  MAX_VERSIONS_PER_STUDENT,
} = require('../services/resumeBuilder/resumeBuilderService');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');
const { getTestDbUri, assertTestDatabase } = require('./testHelper');

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

async function runResumeBuilderTests() {
  console.log('Connecting to MongoDB Test Database for Resume Builder Tests...');
  await mongoose.connect(getTestDbUri());
  assertTestDatabase(mongoose.connection);
  console.log('Connected to test database:', mongoose.connection.name);

  // Setup Express test application
  const app = express();
  app.use(express.json());
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/resume-builder', require('../routes/resumeBuilderRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  });

  const server = app.listen(0);
  const PORT = server.address().port;
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  const cleanupColleges = [];
  const cleanupUsers = [];
  const cleanupStudents = [];
  const cleanupDrives = [];
  const cleanupVersions = [];

  let testPassedCount = 0;
  let testFailedCount = 0;

  function pass(testName) {
    testPassedCount++;
    console.log(`  ✓ ${testName}`);
  }

  function fail(testName, error) {
    testFailedCount++;
    console.error(`  ✗ ${testName}:`, error.message);
    if (error.stack) console.error(error.stack);
  }

  try {
    mockProvider.reset();

    // Pre-cleanup
    await College.deleteMany({ code: { $in: ['RB-COL-A', 'RB-COL-B'] } });
    await Company.deleteMany({ name: 'CloudScale Technologies Ltd' });
    await User.deleteMany({ email: { $regex: /builder\.test.*@portal\.com$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^RB-ENR-/ } });
    await ResumeVersion.deleteMany({});
    const dateKey = AiUsage.getTodayKey();
    await AiUsage.deleteMany({ date: dateKey });

    console.log('\n--- SETUP TEST FIXTURES ---');

    const collegeA = await College.create({
      name: 'Apex Institute of Technology',
      code: 'RB-COL-A',
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
    });
    cleanupColleges.push(collegeA._id);

    const companyA = await Company.create({
      name: 'CloudScale Technologies Ltd',
      email: 'careers@cloudscale.com',
      industry: 'Cloud Infrastructure',
      status: 'approved',
    });

    const testDrive = await Drive.create({
      company: companyA._id,
      college: collegeA._id,
      role: 'Backend Systems Engineer',
      requiredSkills: ['nodejs', 'mongodb', 'redis'],
      preferredSkills: ['docker', 'aws'],
      packageLpa: 14,
      location: 'Bangalore',
      driveDate: new Date(Date.now() + 7 * 86400000),
      lastDateToApply: new Date(Date.now() + 3 * 86400000),
      status: 'open',
      allowedBranches: ['CS', 'IT'],
    });
    cleanupDrives.push(testDrive._id);

    // Student A (Primary Candidate)
    const userA = await User.create({
      name: 'Devika Sharma',
      email: 'builder.test.devika@portal.com',
      password: 'password123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    cleanupUsers.push(userA._id);

    const studentA = await Student.create({
      user: userA._id,
      college: collegeA._id,
      enrollmentNo: 'RB-ENR-001',
      branch: 'Computer Science',
      batchYear: 2025,
      cgpa: 8.8,
      phone: '9876501234',
      skills: ['javascript', 'nodejs', 'mongodb', 'react'],
      resumeProfile: {
        status: 'parsed',
        source: 'llm',
        summary: 'Passionate computer science engineer with experience in distributed backend APIs and database indexing.',
        skills: [{ name: 'javascript' }, { name: 'nodejs' }, { name: 'mongodb' }, { name: 'react' }, { name: 'redis' }],
        experience: [
          {
            title: 'Backend Developer Intern',
            company: 'Acme Cloud Labs',
            location: 'Bangalore',
            duration: 'May 2024 - July 2024',
            bullets: [
              'Worked on backend apis and web features',
              'Collaborated with senior engineers on database query optimization',
            ],
          },
        ],
        projects: [
          {
            title: 'Distributed Task Queue System',
            technologies: ['nodejs', 'redis', 'mongodb'],
            duration: '3 months',
            bullets: [
              'Engineered an asynchronous task queue with retry backoff and message deduplication',
              'Built dashboard for monitoring worker processing times',
            ],
          },
        ],
        education: [
          {
            degree: 'Bachelor of Technology',
            institution: 'Apex Institute of Technology',
            field: 'Computer Science and Engineering',
            year: '2025',
          },
        ],
        certifications: ['AWS Certified Cloud Practitioner'],
      },
    });
    cleanupStudents.push(studentA._id);

    // Student B (Isolation test student)
    const userB = await User.create({
      name: 'Rohan Verma',
      email: 'builder.test.rohan@portal.com',
      password: 'password123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    cleanupUsers.push(userB._id);

    const studentB = await Student.create({
      user: userB._id,
      college: collegeA._id,
      enrollmentNo: 'RB-ENR-002',
      branch: 'IT',
      batchYear: 2025,
      cgpa: 7.9,
      phone: '9876501235',
      skills: ['python', 'django'],
    });
    cleanupStudents.push(studentB._id);

    const tokenA = createToken(userA);
    const tokenB = createToken(userB);

    console.log('Fixtures initialized successfully.\n');

    // =========================================================================
    // TEST 1: BASE RESUME COMPILATION
    // =========================================================================
    console.log('--- TEST 1: Base Resume Compilation ---');
    try {
      const res = await fetch(`${BASE_URL}/students/me/resume-builder/base`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.resumeData, 'resumeData should be present');

      // Contact assertions
      assert.strictEqual(data.resumeData.contact.fullName, 'Devika Sharma');
      assert.strictEqual(data.resumeData.contact.email, 'builder.test.devika@portal.com');
      assert.strictEqual(data.resumeData.contact.phone, '9876501234');
      assert.ok(data.resumeData.contact.location.includes('Bangalore'));

      // Skills categorization
      assert.ok(Array.isArray(data.resumeData.skills), 'Skills must be grouped into categories');
      assert.ok(data.resumeData.skills.length >= 2, 'Should have multiple skill categories');

      // Experience & Projects
      assert.strictEqual(data.resumeData.experience.length, 1);
      assert.strictEqual(data.resumeData.experience[0].company, 'Acme Cloud Labs');
      assert.strictEqual(data.resumeData.projects.length, 1);
      assert.strictEqual(data.resumeData.projects[0].title, 'Distributed Task Queue System');

      // Education
      assert.strictEqual(data.resumeData.education[0].degree, 'Bachelor of Technology');
      assert.ok(data.resumeData.education[0].score.includes('8.8'), 'CGPA should be present in education');

      pass('Base resume compilation from Student profile and resumeProfile');
    } catch (err) {
      fail('Base resume compilation', err);
    }

    // =========================================================================
    // TEST 2: TAILORING AGAINST DRIVE & JD WITH BEFORE/AFTER ATS SCORES
    // =========================================================================
    console.log('\n--- TEST 2: Tailoring against Drive & Before/After ATS Scores ---');
    try {
      const tailorRes = await fetch(`${BASE_URL}/students/me/resume-builder/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          driveId: testDrive._id.toString(),
        }),
      });

      assert.strictEqual(tailorRes.status, 200);
      const tailorData = await tailorRes.json();
      assert.strictEqual(tailorData.success, true);

      // Score verification
      assert.ok(typeof tailorData.baselineAtsScore === 'number', 'Baseline ATS score must be a number');
      assert.ok(typeof tailorData.tailoredAtsScore === 'number', 'Tailored ATS score must be a number');
      assert.ok(
        tailorData.tailoredAtsScore >= tailorData.baselineAtsScore,
        `Tailored score (${tailorData.tailoredAtsScore}) must be >= baseline (${tailorData.baselineAtsScore})`
      );

      // Skills reordering: Drive requiredSkills ('nodejs', 'mongodb', 'redis') should come first in categories
      const tailoredSkills = tailorData.tailoredResume.skills;
      const dbCategory = tailoredSkills.find((c) => c.category.includes('Databases') || c.category.includes('Cloud'));
      if (dbCategory && dbCategory.items.length >= 2) {
        assert.ok(
          dbCategory.items[0].toLowerCase() === 'mongodb' || dbCategory.items[0].toLowerCase() === 'redis',
          'Matching drive skills should be prioritized at index 0 of category'
        );
      }

      // Bullet rewrites presence
      assert.ok(Array.isArray(tailorData.bulletRewrites), 'bulletRewrites must be an array');
      assert.ok(tailorData.bulletRewrites.length > 0, 'Should suggest optimized bullet rewrites');
      assert.ok(tailorData.bulletRewrites[0].suggested.includes('[add your real number]'));

      pass('Resume tailored against drive with before/after ATS scores & skill reordering');
    } catch (err) {
      fail('Resume tailoring against drive', err);
    }

    // =========================================================================
    // TEST 3: ANTI-HALLUCINATION GUARD (validateBulletRewrite)
    // =========================================================================
    console.log('\n--- TEST 3: Anti-Hallucination Guard (validateBulletRewrite) ---');
    try {
      const existingBullets = ['Worked on backend apis and web features'];
      const candidateSkillsSet = new Set(['javascript', 'nodejs', 'mongodb', 'react', 'rest api']);
      const resumeCorpus = 'devika sharma acme cloud labs javascript nodejs mongodb react rest api 8.8 cgpa';

      // 3.1 Legitimate rewrite with placeholder -> MUST PASS
      const validRewrite = {
        original: 'Worked on backend apis and web features',
        suggested: 'Built backend apis and web features with nodejs [add your real number]%',
      };
      assert.strictEqual(
        validateBulletRewrite(validRewrite, resumeCorpus, candidateSkillsSet, existingBullets),
        true,
        'Valid rewrite with placeholder must pass'
      );

      // 3.2 Hallucinating an unverified concrete number -> MUST FAIL
      const fakeNumberRewrite = {
        original: 'Worked on backend apis and web features',
        suggested: 'Architected and optimized REST APIs delivering 65% faster response latency',
      };
      assert.strictEqual(
        validateBulletRewrite(fakeNumberRewrite, resumeCorpus, candidateSkillsSet, existingBullets),
        false,
        'Inventing concrete numbers without placeholder must be rejected'
      );

      // 3.3 Hallucinating an unverified technical skill -> MUST FAIL
      const fakeSkillRewrite = {
        original: 'Worked on backend apis and web features',
        suggested: 'Engineered Kubernetes microservices delivering [add your real number]% uptime',
      };
      assert.strictEqual(
        validateBulletRewrite(fakeSkillRewrite, resumeCorpus, candidateSkillsSet, existingBullets),
        false,
        'Inventing unverified skills (kubernetes) must be rejected'
      );

      // 3.4 Rewrite referencing a non-existent original bullet -> MUST FAIL
      const fakeOriginalRewrite = {
        original: 'Led a team of 10 senior cloud architects',
        suggested: 'Managed engineering personnel delivering [add your real number]% growth',
      };
      assert.strictEqual(
        validateBulletRewrite(fakeOriginalRewrite, resumeCorpus, candidateSkillsSet, existingBullets),
        false,
        'Rewrites not mapping to candidate original bullets must be rejected'
      );

      pass('validateBulletRewrite strictly prevents hallucinated skills, unverified numbers, and fake bullets');
    } catch (err) {
      fail('Anti-hallucination guard', err);
    }

    // =========================================================================
    // TEST 4: HARD EXPORT BLOCKER ON PLACEHOLDERS & SUCCESSFUL PDFKIT EXPORT
    // =========================================================================
    console.log('\n--- TEST 4: Export Blocker on Placeholders & PDFKit Export ---');
    try {
      const baseResume = await compileBaseResume(userA._id);

      // 4.1 Resume containing unresolved placeholder -> MUST RETURN 400
      const placeholderResume = JSON.parse(JSON.stringify(baseResume));
      placeholderResume.experience[0].bullets[0] =
        'Optimized core APIs delivering [add your real number]% throughput improvement';

      const blockRes = await fetch(`${BASE_URL}/students/me/resume-builder/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: placeholderResume,
          templateId: 'modern',
        }),
      });

      assert.strictEqual(blockRes.status, 400, `Expected 400 on unresolved placeholder, got ${blockRes.status}`);
      const blockData = await blockRes.json();
      assert.strictEqual(blockData.success, false);
      assert.ok(
        blockData.message.includes('[add your real number]'),
        'Message must explain placeholder resolution required'
      );

      // 4.2 Clean resume with resolved real numbers across all 3 templates -> MUST RETURN 200 with valid PDF
      const cleanResume = JSON.parse(JSON.stringify(baseResume));
      cleanResume.experience[0].bullets[0] = 'Optimized core APIs delivering 35% throughput improvement';

      for (const tmpl of ['modern', 'classic', 'compact']) {
        const exportRes = await fetch(`${BASE_URL}/students/me/resume-builder/export-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({
            resumeData: cleanResume,
            templateId: tmpl,
          }),
        });

        assert.strictEqual(exportRes.status, 200, `Template ${tmpl} should export with status 200`);
        assert.strictEqual(exportRes.headers.get('content-type'), 'application/pdf');

        const pdfBuffer = Buffer.from(await exportRes.arrayBuffer());
        assert.ok(pdfBuffer.length > 500, `PDF buffer for ${tmpl} must contain data`);
        assert.strictEqual(pdfBuffer.slice(0, 4).toString(), '%PDF', 'Exported stream must begin with %PDF magic bytes');
      }

      pass('Hard export blocker prevents exporting placeholders & PDFKit renders modern, classic, and compact templates');
    } catch (err) {
      fail('Export blocker & PDFKit export', err);
    }

    // =========================================================================
    // TEST 5: VERSION CONTROL (MAX 5 VERSIONS PER STUDENT)
    // =========================================================================
    console.log('\n--- TEST 5: Version Control & Max 5 Snapshots Enforced ---');
    try {
      const baseResume = await compileBaseResume(userA._id);

      // 5.1 Save 5 distinct versions
      for (let i = 1; i <= 5; i++) {
        const saveRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({
            name: `Snapshot Version ${i}`,
            templateId: i % 2 === 0 ? 'classic' : 'modern',
            resumeData: baseResume,
            atsScore: 70 + i,
            baselineScore: 65,
          }),
        });

        assert.strictEqual(saveRes.status, 201);
        const saved = await saveRes.json();
        cleanupVersions.push(saved.version._id);
      }

      // 5.2 Verify exactly 5 versions listed
      const listRes1 = await fetch(`${BASE_URL}/students/me/resume-builder/versions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(listRes1.status, 200);
      const listData1 = await listRes1.json();
      assert.strictEqual(listData1.count, 5, 'Must report exactly 5 versions');
      assert.strictEqual(listData1.maxVersions, 5);

      // 5.3 Save 6th version -> triggers auto-prune of oldest version (count remains 5)
      const save6Res = await fetch(`${BASE_URL}/students/me/resume-builder/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          name: 'Snapshot Version 6 (Exceeding Cap)',
          templateId: 'compact',
          resumeData: baseResume,
          atsScore: 85,
        }),
      });

      assert.strictEqual(save6Res.status, 201);
      const save6Data = await save6Res.json();
      assert.strictEqual(save6Data.totalVersions, 5, 'Total versions must be strictly capped at 5');
      cleanupVersions.push(save6Data.version._id);

      // 5.4 Revert / Load a specific version
      const loadRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions/${save6Data.version._id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(loadRes.status, 200);
      const loadData = await loadRes.json();
      assert.strictEqual(loadData.version.name, 'Snapshot Version 6 (Exceeding Cap)');

      // 5.5 Cross-student access isolation: Student B cannot view Student A's version
      const crossRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions/${save6Data.version._id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.strictEqual(crossRes.status, 404, 'Cross-student version access must return 404/403');

      // 5.6 Delete a version
      const delRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions/${save6Data.version._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(delRes.status, 200);
      const delData = await delRes.json();
      assert.strictEqual(delData.success, true);

      pass('Version control strictly enforces max 5 snapshots per student, save, list, load, delete, and tenant isolation');
    } catch (err) {
      fail('Version control', err);
    }

    // =========================================================================
    // TEST 6: TRUTHFUL COVER LETTER GENERATOR
    // =========================================================================
    console.log('\n--- TEST 6: Truthful Cover Letter Generator ---');
    try {
      const coverRes = await fetch(`${BASE_URL}/students/me/resume-builder/cover-letter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          driveId: testDrive._id.toString(),
        }),
      });

      assert.strictEqual(coverRes.status, 200);
      const coverData = await coverRes.json();
      assert.strictEqual(coverData.success, true);
      assert.ok(coverData.coverLetter && coverData.coverLetter.length > 100, 'Cover letter text must be generated');

      // Truthfulness check: references real college, branch, or verified projects
      assert.ok(
        coverData.coverLetter.includes('Apex Institute of Technology') ||
          coverData.coverLetter.includes('Computer Science') ||
          coverData.coverLetter.includes('CloudScale Technologies Ltd'),
        'Cover letter must reference candidate real college, branch, or target company'
      );

      pass('Truthful cover letter generator based strictly on verified candidate profile records');
    } catch (err) {
      fail('Cover letter generator', err);
    }

    // =========================================================================
    // TEST 7: OFFLINE DETERMINISTIC FALLBACK
    // =========================================================================
    console.log('\n--- TEST 7: Offline Deterministic Fallback ---');
    try {
      // Force rate limit in mock provider to simulate complete AI provider downtime
      mockProvider.forceRateLimit = true;

      const baseResume = await compileBaseResume(userA._id);

      // Tailoring must degrade gracefully to rule-based fallback without throwing 500
      const offlineTailorRes = await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
        driveId: testDrive._id,
      });

      assert.ok(offlineTailorRes.tailoredResume, 'Offline tailoring must return tailoredResume');
      assert.ok(offlineTailorRes.bulletRewrites.length > 0, 'Offline tailoring must provide rule-based rewrites');
      assert.ok(offlineTailorRes.tailoredAtsScore >= offlineTailorRes.baselineAtsScore);

      // Cover letter must also degrade gracefully to truthful template
      const offlineCover = await generateCoverLetter({
        studentUserId: userA._id,
        role: 'Backend Systems Engineer',
        company: 'CloudScale Technologies Ltd',
      });
      assert.ok(offlineCover.coverLetter.includes('Apex Institute of Technology'));
      assert.ok(offlineCover.coverLetter.includes('CloudScale Technologies Ltd'));

      pass('Offline deterministic fallback for resume tailoring and cover letters');
    } catch (err) {
      fail('Offline fallback', err);
    } finally {
      mockProvider.forceRateLimit = false;
    }

    // =========================================================================
    // TEST 8: GUIDED WIZARD STEPS 1, 2, AND 3 ENDPOINTS & NORMALIZATION
    // =========================================================================
    console.log('\n--- TEST 8: Guided Wizard Steps 1, 2, and 3 Endpoints ---');
    try {
      // Step 1: POST /api/resume-builder/source with type: 'profile'
      const srcProfRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ type: 'profile' }),
      });
      assert.strictEqual(srcProfRes.status, 200);
      const srcProfData = await srcProfRes.json();
      assert.strictEqual(srcProfData.success, true);
      assert.ok(srcProfData.resumeData, 'Must return normalized resumeData');
      assert.strictEqual(srcProfData.resumeData.contact.fullName, 'Devika Sharma');
      assert.strictEqual(srcProfData.parseConfidence, 1.0);
      assert.ok(Array.isArray(srcProfData.warnings), 'Must return warnings array');

      // Step 1: POST /api/resume-builder/source with type: 'text'
      const sampleText = `
        Devika Sharma
        devika@portal.com
        Education:
        B.Tech Computer Science, Apex Institute, 2025
        Experience:
        Backend Engineer at TechCorp (2024)
        - Developed REST APIs in Node.js and MongoDB
        Projects:
        Distributed Cache (2024)
        - Built key-value store using Redis
        Skills: Node.js, MongoDB, Redis, JavaScript
      `;
      const srcTextRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ type: 'text', text: sampleText }),
      });
      assert.strictEqual(srcTextRes.status, 200);
      const srcTextData = await srcTextRes.json();
      assert.strictEqual(srcTextData.success, true);
      assert.ok(srcTextData.resumeData.skills.length > 0, 'Must extract structured skills with rules');

      // Invalid source type -> 400
      const invalidSrcRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ type: 'unsupported_source' }),
      });
      assert.strictEqual(invalidSrcRes.status, 400);

      // Step 2: POST /api/resume-builder/analyze-target
      const targetDriveRes = await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ driveId: testDrive._id.toString() }),
      });
      assert.strictEqual(targetDriveRes.status, 200);
      const targetDriveData = await targetDriveRes.json();
      assert.strictEqual(targetDriveData.success, true);
      assert.strictEqual(targetDriveData.target.type, 'drive');
      assert.strictEqual(targetDriveData.target.roleTitle, 'Backend Systems Engineer');
      assert.ok(targetDriveData.target.requiredSkills.includes('nodejs'));

      // Step 3: POST /api/resume-builder/match-report
      const matchReportRes = await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: srcProfData.resumeData,
          target: targetDriveData.target,
        }),
      });
      assert.strictEqual(matchReportRes.status, 200);
      const matchReportData = await matchReportRes.json();
      assert.strictEqual(matchReportData.success, true);
      assert.ok(typeof matchReportData.matchReport.atsScore === 'number');
      assert.ok(Array.isArray(matchReportData.matchReport.matchedSkills));
      assert.ok(Array.isArray(matchReportData.matchReport.learningResources));

      pass('Guided wizard Steps 1, 2, and 3 endpoints and data normalization verified');
    } catch (err) {
      fail('Guided wizard endpoints', err);
    }

    // =========================================================================
    // TEST 9: CROSS-STUDENT ISOLATION (source=upload) & PII LOGGING PROTECTION
    // =========================================================================
    console.log('\n--- TEST 9: Cross-Student Isolation & Zero PII Logging ---');
    try {
      // 1. Create Student B
      await User.deleteMany({ email: 'builder.test.rohan@portal.com' });
      await Student.deleteMany({ enrollmentNo: 'RB-ENR-002' });

      const userB = await User.create({
        name: 'Rohan Verma',
        email: 'builder.test.rohan@portal.com',
        password: 'password123',
        role: 'student',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified: true,
      });
      cleanupUsers.push(userB._id);

      const studentB = await Student.create({
        user: userB._id,
        college: collegeA._id,
        enrollmentNo: 'RB-ENR-002',
        branch: 'Information Technology',
        batchYear: 2025,
        cgpa: 7.9,
        phone: '9123456789',
        skills: ['python', 'django'],
      });
      cleanupStudents.push(studentB._id);

      const tokenB = createToken(userB);

      // Student B calls source=upload when no resume is uploaded -> 400
      const bUploadNoRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({ type: 'upload' }),
      });
      assert.strictEqual(bUploadNoRes.status, 400);
      const bUploadNoData = await bUploadNoRes.json();
      assert.strictEqual(bUploadNoData.success, false);
      assert.ok(bUploadNoData.message.includes('No uploaded resume found'));

      // Attach student B's own resumeProfile
      studentB.resumeProfile = {
        status: 'parsed',
        source: 'rules',
        summary: 'Aspiring IT developer specialized in Python and Django backends.',
        skills: [{ name: 'python' }, { name: 'django' }],
        experience: [
          {
            title: 'Python Intern',
            company: 'DataTech Innovations',
            bullets: ['Built automation scripts in Python'],
          },
        ],
      };
      await studentB.save();

      // Student B loads source=upload -> strictly returns Student B's data
      const bUploadRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({ type: 'upload' }),
      });
      assert.strictEqual(bUploadRes.status, 200);
      const bUploadData = await bUploadRes.json();
      assert.strictEqual(bUploadData.resumeData.contact.fullName, 'Rohan Verma');
      assert.ok(
        bUploadData.resumeData.summary.includes('Python and Django'),
        'Student B must only see their own summary'
      );
      assert.ok(
        !bUploadData.resumeData.summary.includes('Devika'),
        'Student B must never see Student A resume data'
      );

      // 2. Logging Protection: Spy on console to verify raw resume text is never logged
      const loggedMessages = [];
      const originalLog = console.log;
      const originalInfo = console.info;
      const originalWarn = console.warn;
      const originalError = console.error;

      const captureLog = (...args) => {
        loggedMessages.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      };

      console.log = captureLog;
      console.info = captureLog;
      console.warn = captureLog;
      console.error = captureLog;

      try {
        await fetch(`${BASE_URL}/resume-builder/source`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({ type: 'profile' }),
        });

        await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({ driveId: testDrive._id.toString() }),
        });
      } finally {
        console.log = originalLog;
        console.info = originalInfo;
        console.warn = originalWarn;
        console.error = originalError;
      }

      const allLogs = loggedMessages.join('\n');
      assert.ok(
        !allLogs.includes('Passionate computer science engineer with experience in distributed backend APIs'),
        'Endpoints must never log confidential candidate resume text'
      );
      assert.ok(
        !allLogs.includes('9876501234'),
        'Endpoints must never log candidate contact phone number'
      );

      pass('Cross-student isolation on source=upload and zero PII logging verified');
    } catch (err) {
      fail('Cross-student isolation & zero PII logging', err);
    }

    // =========================================================================
    // TEST 10: ZERO AI QUOTA ON STEPS 1-3, ONLY STEP 4 CONSUMES TAILOR QUOTA
    // =========================================================================
    console.log('\n--- TEST 10: AI Quota Consumption Verification ---');
    try {
      const usageBefore = await AiUsage.getUserDailyUsage(userA._id, 'student');
      const tailorCountBefore = usageBefore?.tailorUsed || 0;

      // Execute Step 1 (Source: text, uses extractWithRules)
      await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ type: 'text', text: 'Devika Sharma\nSkills: Node.js, Redis' }),
      });

      // Execute Step 2 (Target: rules/drive)
      await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ driveId: testDrive._id.toString() }),
      });

      // Execute Step 3 (Match report: computeAtsScore deterministic rules)
      const baseResume = await compileBaseResume(userA._id);
      await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: baseResume,
          target: { requiredSkills: ['nodejs', 'redis'] },
        }),
      });

      // Verify tailorCalls did NOT change
      const usageAfter123 = await AiUsage.getUserDailyUsage(userA._id, 'student');
      const tailorCountAfter123 = usageAfter123?.tailorUsed || 0;
      assert.strictEqual(
        tailorCountAfter123,
        tailorCountBefore,
        'Steps 1, 2, and 3 must use 0 AI tailor quota'
      );

      // Execute Step 4 (Tailor Resume)
      const tailorRes = await fetch(`${BASE_URL}/students/me/resume-builder/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: baseResume,
          driveId: testDrive._id.toString(),
        }),
      });
      assert.strictEqual(tailorRes.status, 200);

      // Verify tailorCalls incremented by exactly 1
      const usageAfterStep4 = await AiUsage.getUserDailyUsage(userA._id, 'student');
      assert.strictEqual(
        usageAfterStep4?.tailorUsed,
        tailorCountBefore + 1,
        'Only Step 4 must consume tailor quota'
      );

      pass('Wizard consumes zero AI quota on Steps 1-3, and strictly increments quota on Step 4');
    } catch (err) {
      fail('AI quota consumption', err);
    }

    // =========================================================================
    // TEST 11: GENERAL RESUME MODE & ANTI-HALLUCINATION ACROSS SUMMARY, BULLETS, AND SKILLS
    // =========================================================================
    console.log('\n--- TEST 11: General Resume Mode & Anti-Hallucination Guard ---');
    try {
      // 1. General Mode Target Analysis
      const genTargetRes = await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(genTargetRes.status, 200);
      const genTargetData = await genTargetRes.json();
      assert.strictEqual(genTargetData.target.type, 'general');
      assert.strictEqual(genTargetData.target.roleTitle, 'General Software Engineer');

      // 2. Tailor in General Mode
      const baseResume = await compileBaseResume(userA._id);
      const genTailorRes = await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
      });
      assert.ok(genTailorRes.tailoredResume, 'General mode must successfully tailor resume');

      // 3. Anti-Hallucination: Summary Rewrite Guard
      const candidateSkillsSet = new Set(['javascript', 'nodejs', 'mongodb', 'react', 'redis']);
      const resumeCorpus = 'Passionate computer science engineer with experience in distributed backend APIs, database indexing, and reducing latency.';
      const knownEmployers = ['Apex Technology'];

      // Invented Skill -> Reject
      const inventedSkillSummary = 'Expert engineer with 3 years writing Solidity smart contracts and Rust compilers.';
      assert.strictEqual(
        validateSummaryRewrite(inventedSkillSummary, baseResume.summary, resumeCorpus, candidateSkillsSet, knownEmployers),
        false,
        'Must reject invented skill in summary'
      );

      // Invented Number without placeholder -> Reject
      const inventedNumberSummary = 'Engineered distributed APIs serving 500,000 active users with 99.99% uptime.';
      assert.strictEqual(
        validateSummaryRewrite(inventedNumberSummary, baseResume.summary, resumeCorpus, candidateSkillsSet, knownEmployers),
        false,
        'Must reject invented numbers without placeholder in summary'
      );

      // Invented Employer -> Reject
      const inventedEmployerSummary = 'Former senior backend engineering intern at Google and Meta.';
      assert.strictEqual(
        validateSummaryRewrite(inventedEmployerSummary, baseResume.summary, resumeCorpus, candidateSkillsSet, knownEmployers),
        false,
        'Must reject unverified employers in summary'
      );

      // Valid Summary with allowed placeholder and verified skills -> Accept
      const validSummary = 'Full-stack software engineer skilled in Node.js, MongoDB, and Redis with [add your real number]% latency reduction.';
      assert.strictEqual(
        validateSummaryRewrite(validSummary, baseResume.summary, resumeCorpus, candidateSkillsSet, knownEmployers),
        true,
        'Must accept truthful summary using allowed placeholder and verified skills'
      );

      // 4. Anti-Hallucination: Bullet Rewrites Guard
      const existingBullet = 'Developed REST APIs using Node.js and MongoDB.';
      const existingBullets = [existingBullet];

      // Invented Skill in bullet -> Reject
      assert.strictEqual(
        validateBulletRewrite(
          { original: existingBullet, suggested: 'Architected distributed consensus protocol in Rust.' },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets
        ),
        false,
        'Must reject invented skill in bullet'
      );

      // Invented Metric in bullet -> Reject
      assert.strictEqual(
        validateBulletRewrite(
          { original: existingBullet, suggested: 'Developed REST APIs reducing server latency by 45%.' },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets
        ),
        false,
        'Must reject invented metric number in bullet'
      );

      // Allowed placeholder in bullet -> Accept
      assert.strictEqual(
        validateBulletRewrite(
          { original: existingBullet, suggested: 'Built REST APIs using Node.js and MongoDB [add your real number]%' },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets
        ),
        true,
        'Must accept bullet rewrite containing [add your real number] placeholder'
      );

      pass('General resume mode and anti-hallucination guard across summary, bullets, and skills verified');
    } catch (err) {
      fail('General mode & anti-hallucination guard', err);
    }

    // =========================================================================
    // TEST 12: BANNED INFLATION WORDS, SUMMARY NUMBER RETENTION, & NUMERIC MATCH REPORT
    // =========================================================================
    console.log('\n--- TEST 12: Banned Inflation Words, Summary Retention, & Numeric Match Report ---');
    try {
      const originalBullet = 'Developed backend apis and web features with Node.js and MongoDB.';
      const existingBullets = [originalBullet];
      const candidateSkillsSet = new Set(['javascript', 'nodejs', 'mongodb', 'react', 'redis']);
      const resumeCorpus = 'Passionate computer science engineer with experience in distributed backend APIs, database indexing, and reducing latency.';
      const entryContext = 'Backend Developer Intern at Acme Cloud Labs';

      // 1. Strict rejection of exact banned inflation words / ungrounded claims
      const bannedExamples = [
        'Built backend APIs delivering cross-device compatibility',
        'Built backend APIs using collaborative version control',
        'Architected REST APIs with Node.js [add your real number]%',
        'Orchestrated container deployment for backend APIs',
        'Built backend APIs and seamlessly integrated payment gateways',
        'Built comprehensive unit test suite for backend APIs',
        'Built backend APIs using cutting-edge algorithms',
        'Built robust data pipelines for backend APIs',
        'Spearheaded frontend migration for web features',
        'Pioneered backend architecture with Node.js',
        'Leveraged React state across web features',
      ];

      for (const suggested of bannedExamples) {
        const isValid = validateBulletRewrite(
          { original: originalBullet, suggested },
          resumeCorpus,
          candidateSkillsSet,
          existingBullets,
          entryContext
        );
        assert.strictEqual(
          isValid,
          false,
          `validateBulletRewrite must reject ungrounded/inflated phrase: "${suggested}"`
        );
      }

      // Truthful rewrite adhering to allow-list synonym and content word diff check
      const validSynonymRewrite = {
        original: originalBullet,
        suggested: 'Implemented backend apis and web features with nodejs [add your real number]%',
      };
      assert.strictEqual(
        validateBulletRewrite(validSynonymRewrite, resumeCorpus, candidateSkillsSet, existingBullets, entryContext),
        true,
        'Must accept rewrite with allow-listed verb and verified content words'
      );

      // Rejection during tailorResume falls back to original bullet marked "kept original"
      mockProvider.mockTailorResponse = {
        summary: resumeCorpus,
        rewrites: [
          {
            original: originalBullet,
            suggested: 'Architected and orchestrated cutting-edge backend APIs',
            why: 'Banned inflation words test',
          },
        ],
      };

      const baseResume = await compileBaseResume(userA._id);
      const tailoredWithFallback = await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
      });

      const fallbackRewrite = tailoredWithFallback.bulletRewrites.find(
        (rw) => rw.original === originalBullet
      );
      assert.ok(fallbackRewrite, 'Must return rewrite entry');
      assert.strictEqual(
        fallbackRewrite.status,
        'kept original',
        'Rejected rewrite must fall back to original with status: kept original'
      );
      assert.strictEqual(
        fallbackRewrite.suggested,
        originalBullet,
        'Suggested text must fall back to original bullet text'
      );
      mockProvider.reset();

      // 2. Summary rewrite: must preserve numbers and facts (e.g. "250+ problems on LeetCode")
      const originalSummaryWithFacts =
        'Passionate software engineer who solved 250+ problems on LeetCode and built full-stack applications with Node.js and MongoDB.';

      // Dropping 250+ -> must reject
      const droppedNumberSummary =
        'Passionate software engineer who solved problems on LeetCode and built full-stack applications with Node.js and MongoDB.';
      assert.strictEqual(
        validateSummaryRewrite(
          droppedNumberSummary,
          originalSummaryWithFacts,
          resumeCorpus,
          candidateSkillsSet,
          ['Acme Cloud Labs']
        ),
        false,
        'Summary rewrite dropping "250+" must be rejected'
      );

      // Dropping LeetCode -> must reject
      const droppedFactSummary =
        'Passionate software engineer who solved 250+ problems and built full-stack applications with Node.js and MongoDB.';
      assert.strictEqual(
        validateSummaryRewrite(
          droppedFactSummary,
          originalSummaryWithFacts,
          resumeCorpus,
          candidateSkillsSet,
          ['Acme Cloud Labs']
        ),
        false,
        'Summary rewrite dropping "LeetCode" platform fact must be rejected'
      );

      // Retaining both 250+ and LeetCode -> must accept
      const truthfulSummary =
        'Software engineer who solved 250+ problems on LeetCode and built full-stack applications with Node.js and MongoDB with [add your real number]% latency reduction.';
      assert.strictEqual(
        validateSummaryRewrite(
          truthfulSummary,
          originalSummaryWithFacts,
          resumeCorpus,
          candidateSkillsSet,
          ['Acme Cloud Labs']
        ),
        true,
        'Summary rewrite retaining "250+" and "LeetCode" must be accepted'
      );

      // 3. Match report response always returns numeric fields across all 7 rubric parts and General mode
      // 3.1 Targeted Drive Match Report
      const driveMatchRes = await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: baseResume,
          target: {
            type: 'drive',
            driveId: testDrive._id.toString(),
            requiredSkills: ['nodejs', 'mongodb', 'redis'],
            preferredSkills: ['docker', 'aws'],
          },
        }),
      });
      assert.strictEqual(driveMatchRes.status, 200);
      const driveMatchData = await driveMatchRes.json();
      assert.strictEqual(driveMatchData.success, true);
      const driveReport = driveMatchData.matchReport;

      // Numeric atsScore
      assert.strictEqual(typeof driveReport.atsScore, 'number', 'atsScore must be numeric');
      assert.ok(!isNaN(driveReport.atsScore), 'atsScore must not be NaN');
      assert.ok(driveReport.atsScore >= 0 && driveReport.atsScore <= 100);

      // Numeric breakdown for all 7 parts
      assert.strictEqual(typeof driveReport.breakdown.keywordMatch, 'number');
      assert.strictEqual(typeof driveReport.breakdown.experience, 'number');
      assert.strictEqual(typeof driveReport.breakdown.education, 'number');
      assert.strictEqual(typeof driveReport.breakdown.structure, 'number');
      assert.strictEqual(typeof driveReport.breakdown.impact, 'number');
      assert.strictEqual(typeof driveReport.breakdown.actionVerbs, 'number');
      assert.strictEqual(typeof driveReport.breakdown.formatting, 'number');

      // 3.2 General Mode Match Report
      const genMatchRes = await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: baseResume,
          target: { type: 'general' },
        }),
      });
      assert.strictEqual(genMatchRes.status, 200);
      const genMatchData = await genMatchRes.json();
      assert.strictEqual(genMatchData.success, true);
      const genReport = genMatchData.matchReport;

      // General mode numeric total and flag
      assert.strictEqual(typeof genReport.atsScore, 'number', 'General atsScore must be numeric');
      assert.ok(!isNaN(genReport.atsScore), 'General atsScore must not be NaN');
      assert.strictEqual(genReport.isGeneral, true, 'isGeneral flag must be true');
      assert.strictEqual(genReport.generalNote, 'score excludes keyword match, no job selected');
      assert.strictEqual(genReport.breakdown.keywordMatch, null, 'keywordMatch in general mode is null');
      assert.strictEqual(typeof genReport.breakdown.experience, 'number');
      assert.strictEqual(typeof genReport.breakdown.education, 'number');
      assert.strictEqual(typeof genReport.breakdown.structure, 'number');
      assert.strictEqual(typeof genReport.breakdown.impact, 'number');
      assert.strictEqual(typeof genReport.breakdown.actionVerbs, 'number');
      assert.strictEqual(typeof genReport.breakdown.formatting, 'number');

      pass('Banned inflation words rejected, summary numbers/facts retained, and match report always returns numeric fields');
    } catch (err) {
      fail('Banned inflation words & match report numeric fields', err);
    }

    // =========================================================================
    // TEST 13: ATS Score Parity between Resume AI and Resume Builder Before
    // Verifies parity across two distinct student fixtures and JDs
    // =========================================================================
    console.log('\n--- TEST 13: Resume AI vs Resume Builder Before Parity (Two Fixtures) ---');
    try {
      // -----------------------------------------------------------------------
      // Fixture 1: Student A (Node.js/Full Stack) against Full Stack JD
      // -----------------------------------------------------------------------
      const jdFixture1 = `
        Full Stack Node.js Engineer
        Tech Innovators Inc.
        Requirements:
        - Strong experience in Node.js, Express, MongoDB, and Redis.
        - Familiarity with React and REST APIs.
        - Bachelor's degree in Computer Science.
      `;

      // 1.1 Resume AI analysis
      const aiRes1 = await fetch(`${BASE_URL}/students/me/resume/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ jdText: jdFixture1, force: true }),
      });
      assert.strictEqual(aiRes1.status, 200, 'Resume AI analyze must return 200 for Fixture 1');
      const aiData1 = await aiRes1.json();
      assert.strictEqual(aiData1.success, true);
      assert.strictEqual(typeof aiData1.atsScore, 'number');

      // 1.2 Resume Builder wizard Steps 1-3 with source=upload
      const srcRes1 = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ type: 'upload' }),
      });
      assert.strictEqual(srcRes1.status, 200, 'Resume Builder source=upload must return 200');
      const srcData1 = await srcRes1.json();

      const targetRes1 = await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ jobDescription: jdFixture1 }),
      });
      assert.strictEqual(targetRes1.status, 200);
      const targetData1 = await targetRes1.json();

      const matchRes1 = await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          resumeData: srcData1.resumeData,
          target: targetData1.target,
          sourceType: 'upload',
        }),
      });
      assert.strictEqual(matchRes1.status, 200);
      const matchData1 = await matchRes1.json();

      assert.strictEqual(
        matchData1.matchReport.atsScore,
        aiData1.atsScore,
        `Fixture 1: Builder Before (${matchData1.matchReport.atsScore}%) must equal Resume AI (${aiData1.atsScore}%)`
      );
      assert.strictEqual(
        matchData1.matchReport.breakdown.keywordMatch,
        aiData1.breakdown.keywordMatch,
        'Fixture 1 keywordMatch breakdown must match exactly'
      );
      assert.strictEqual(
        matchData1.matchReport.breakdown.structure,
        aiData1.breakdown.structure,
        'Fixture 1 structure breakdown must match exactly'
      );
      assert.strictEqual(
        matchData1.matchReport.breakdown.impact,
        aiData1.breakdown.impact,
        'Fixture 1 impact breakdown must match exactly'
      );

      // -----------------------------------------------------------------------
      // Fixture 2: Student B (Python Backend) against Python/Django JD
      // -----------------------------------------------------------------------
      const studentBDoc = await Student.findOne({ enrollmentNo: 'RB-ENR-002' });
      assert.ok(studentBDoc, 'Student B document must exist');
      const userBDoc = await User.findById(studentBDoc.user);
      assert.ok(userBDoc, 'User B document must exist');
      const tokenBFixture = createToken(userBDoc);

      studentBDoc.resumeProfile = {
        status: 'parsed',
        source: 'llm',
        summary: 'Aspiring software developer with expertise in Python backend architectures, Django REST framework, and PostgreSQL databases.',
        skills: [{ name: 'python' }, { name: 'django' }, { name: 'postgresql' }, { name: 'docker' }, { name: 'rest api' }],
        experience: [
          {
            title: 'Python Backend Intern',
            company: 'DataTech Innovations',
            location: 'Hyderabad',
            duration: 'June 2024 - August 2024',
            bullets: [
              'Built automation scripts and REST APIs in Python and Django',
              'Collaborated on database schema design and migrations in PostgreSQL',
            ],
          },
        ],
        projects: [
          {
            title: 'Scalable Microservices Gateway',
            technologies: ['python', 'docker', 'postgresql'],
            duration: '2 months',
            bullets: [
              'Developed API gateway containerized with Docker for load balancing',
            ],
          },
        ],
        education: [
          {
            degree: 'Bachelor of Technology',
            institution: 'Apex Institute of Technology',
            field: 'Information Technology',
            year: '2025',
          },
        ],
      };
      await studentBDoc.save();

      const jdFixture2 = `
        Python Backend Engineer
        PyScale Data Systems
        Requirements:
        - Strong experience in Python, Django, and PostgreSQL.
        - Knowledge of REST APIs and Docker.
        - Bachelor's degree in Information Technology.
      `;

      // 2.1 Resume AI analysis
      const aiRes2 = await fetch(`${BASE_URL}/students/me/resume/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({ jdText: jdFixture2, force: true }),
      });
      assert.strictEqual(aiRes2.status, 200, 'Resume AI analyze must return 200 for Fixture 2');
      const aiData2 = await aiRes2.json();
      assert.strictEqual(aiData2.success, true);
      assert.strictEqual(typeof aiData2.atsScore, 'number');

      // 2.2 Resume Builder wizard Steps 1-3 with source=upload
      const srcRes2 = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({ type: 'upload' }),
      });
      assert.strictEqual(srcRes2.status, 200);
      const srcData2 = await srcRes2.json();

      const targetRes2 = await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({ jobDescription: jdFixture2 }),
      });
      assert.strictEqual(targetRes2.status, 200);
      const targetData2 = await targetRes2.json();

      const matchRes2 = await fetch(`${BASE_URL}/resume-builder/match-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({
          resumeData: srcData2.resumeData,
          target: targetData2.target,
          sourceType: 'upload',
        }),
      });
      assert.strictEqual(matchRes2.status, 200);
      const matchData2 = await matchRes2.json();

      assert.strictEqual(
        matchData2.matchReport.atsScore,
        aiData2.atsScore,
        `Fixture 2: Builder Before (${matchData2.matchReport.atsScore}%) must equal Resume AI (${aiData2.atsScore}%)`
      );
      assert.strictEqual(
        matchData2.matchReport.breakdown.keywordMatch,
        aiData2.breakdown.keywordMatch,
        'Fixture 2 keywordMatch breakdown must match exactly'
      );
      assert.strictEqual(
        matchData2.matchReport.breakdown.structure,
        aiData2.breakdown.structure,
        'Fixture 2 structure breakdown must match exactly'
      );
      assert.strictEqual(
        matchData2.matchReport.breakdown.impact,
        aiData2.breakdown.impact,
        'Fixture 2 impact breakdown must match exactly'
      );

      pass(`Builder before score equals Resume AI score for same uploaded resume + JD across two different fixtures (Fixture 1: ${aiData1.atsScore}%, Fixture 2: ${aiData2.atsScore}%)`);
    } catch (err) {
      fail('Resume AI vs Resume Builder Before Parity', err);
    }
  } finally {
    console.log('\n--- CLEANING UP TEST FIXTURES ---');
    try {
      if (cleanupVersions.length > 0) {
        await ResumeVersion.deleteMany({ _id: { $in: cleanupVersions } });
      }
      if (cleanupStudents.length > 0) {
        await Student.deleteMany({ _id: { $in: cleanupStudents } });
      }
      if (cleanupUsers.length > 0) {
        await User.deleteMany({ _id: { $in: cleanupUsers } });
      }
      if (cleanupDrives.length > 0) {
        await Drive.deleteMany({ _id: { $in: cleanupDrives } });
      }
      if (cleanupColleges.length > 0) {
        await College.deleteMany({ _id: { $in: cleanupColleges } });
      }
      await Company.deleteMany({ name: 'CloudScale Technologies Ltd' });
      await JdAnalysisCache.deleteMany({});
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr.message);
    }

    server.close();
    await mongoose.connection.close();
  }

  console.log(`\n========================================`);
  console.log(`Resume Builder Tests Finished`);
  console.log(`Passed: ${testPassedCount} | Failed: ${testFailedCount}`);
  console.log(`========================================\n`);

  if (testFailedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  runResumeBuilderTests().catch((err) => {
    console.error('Unhandled error in resume builder test suite:', err);
    process.exit(1);
  });
}

module.exports = { runResumeBuilderTests };
