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
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const { validateBulletRewrite } = require('../services/ai/resumeAnalyzer');
const {
  checkUnresolvedPlaceholders,
  compileBaseResume,
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
        suggested: 'Architected and optimized REST APIs delivering [add your real number]% faster response latency',
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
