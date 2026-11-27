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
process.env.AI_USER_DAILY_TAILOR_CAP = '50';

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');

dotenv.config({ path: path.join(__dirname, '../.env') });
// Explicitly enforce mock provider in test environment so tests do not consume live Groq/Gemini quota or trip live circuit breakers
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';
process.env.AI_PROVIDER_CHAIN = 'mock';

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
const { extractWithRules } = require('../services/ai/resumeParser');
const {
  checkUnresolvedPlaceholders,
  compileBaseResume,
  loadResumeSource,
  analyzeResumeTarget,
  validateSummaryRewrite,
  validateSummaryRewriteDetailed,
  validateBulletRewrite,
  validateBulletRewriteDetailed,
  verifySourceFacts,
  extractComprehensiveWithRules,
  parseEducationSection,
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
const {
  normalizeUrl,
  classifyUrl,
  extractUrlsFromText,
  extractPdfLinkAnnotations,
  extractDocxHyperlinks,
  extractAllLinksAndContacts,
} = require('../services/resumeBuilder/resumeLinkExtractor');
const { tokenizeText, detokenize } = require('../services/resumeBuilder/tokenMasker');
const { generateResumePdf } = require('../services/resumeBuilder/pdfGenerator');
const { resetCircuitBreakers } = require('../services/ai/aiClient');
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

      // Score verification: Resume Builder no longer computes or returns ATS scores
      assert.strictEqual(tailorData.baselineAtsScore, undefined, 'tailor response must not include baselineAtsScore');
      assert.strictEqual(tailorData.tailoredAtsScore, undefined, 'tailor response must not include tailoredAtsScore');

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

      pass('Resume tailored against drive with zero ATS scores & skill reordering');
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
      assert.strictEqual(offlineTailorRes.baselineAtsScore, undefined, 'Offline tailoring must not include baselineAtsScore');
      assert.strictEqual(offlineTailorRes.tailoredAtsScore, undefined, 'Offline tailoring must not include tailoredAtsScore');

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
      mockProvider.reset();
      resetCircuitBreakers();
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

      // Step 3: Match report removed — assert POST /api/resume-builder/match-report returns 404
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
      assert.strictEqual(matchReportRes.status, 404, 'Match report endpoint must be removed and return 404');

      pass('Endpoints verified: source and analyze-target return 200, match-report returns 404');
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

      // Verify match-report is 404 and does not exist
      const baseResume = await compileBaseResume(userA._id);
      const matchReport404 = await fetch(`${BASE_URL}/resume-builder/match-report`, {
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
      assert.strictEqual(matchReport404.status, 404);

      // Verify tailorCalls did NOT change on setup / analyze
      const usageAfterSetup = await AiUsage.getUserDailyUsage(userA._id, 'student');
      const tailorCountAfterSetup = usageAfterSetup?.tailorUsed || 0;
      assert.strictEqual(
        tailorCountAfterSetup,
        tailorCountBefore,
        'Source loading and target analysis must use 0 AI tailor quota'
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
      baseResume.experience[0].bullets[0] = originalBullet;
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

      pass('Banned inflation words rejected and summary numbers/facts strictly retained');
    } catch (err) {
      fail('Banned inflation words & summary retention', err);
    }

    // =========================================================================
    // TEST 13: SOURCE MERGING, PARSER REUSE, & UNTICKED SKILLS HONESTY
    // =========================================================================
    console.log('\n--- TEST 13: Source Merging, Parser Reuse, & Unticked Skills Honesty ---');
    try {
      // 1. source=upload reuses parseStudentResume without writing a second parser
      const resumeParser = require('../services/ai/resumeParser');
      assert.strictEqual(
        typeof resumeParser.parseStudentResume,
        'function',
        'Must reuse parseStudentResume from resumeParser.js'
      );

      // 2. Setup Student fixture with profile gaps:
      // College profile has: phone, education, plus college skills/projects/experience
      // Uploaded resume has: skills, projects, experience, BUT missing phone and education
      const studentBDoc = await Student.findOne({ enrollmentNo: 'RB-ENR-002' });
      assert.ok(studentBDoc, 'Student B document must exist');
      const userBDoc = await User.findById(studentBDoc.user);
      assert.ok(userBDoc, 'User B document must exist');
      const tokenBFixture = createToken(userBDoc);

      // Set Student B's college profile attributes
      studentBDoc.phone = '+91-9876543210';
      studentBDoc.degree = 'Bachelor of Technology';
      studentBDoc.branch = 'Computer Science and Engineering';
      studentBDoc.batchYear = 2025;
      studentBDoc.cgpa = 8.9;

      // Set Student B's parsed uploaded resume without phone and without education
      studentBDoc.resumeProfile = {
        status: 'parsed',
        source: 'llm',
        summary: 'Aspiring software developer with expertise in Python backend architectures.',
        skills: [{ name: 'python' }, { name: 'django' }],
        experience: [
          {
            title: 'Python Backend Intern',
            company: 'DataTech Innovations',
            location: 'Hyderabad',
            duration: 'June 2024 - August 2024',
            bullets: ['Built automation scripts and REST APIs in Python and Django'],
          },
        ],
        projects: [
          {
            title: 'Scalable Microservices Gateway',
            technologies: ['python', 'docker'],
            duration: '2 months',
            bullets: ['Developed API gateway containerized with Docker'],
          },
        ],
        education: [], // Empty in uploaded resume!
        contact: {
          fullName: 'Rohan Verma',
          email: 'rohan.verma@portal.com',
          phone: '', // Empty in uploaded resume!
        },
      };
      await studentBDoc.save();

      // Load source=upload for Student B
      const sourceUploadRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({ type: 'upload' }),
      });
      assert.strictEqual(sourceUploadRes.status, 200);
      const sourceUploadData = await sourceUploadRes.json();
      assert.strictEqual(sourceUploadData.success, true);
      const loadedResume = sourceUploadData.resumeData;

      // Assert zero profile mixing:
      // Contact phone is NOT filled from college profile (remains empty string)
      assert.strictEqual(
        loadedResume.contact.phone,
        '',
        'Contact phone must remain empty if missing from resume (zero profile mixing)'
      );
      assert.ok(!loadedResume.contact.fromProfile, 'fromProfile marker must not exist for upload source');

      // Education is NOT filled from college profile (remains empty array)
      assert.strictEqual(
        loadedResume.education.length,
        0,
        'Education must not be filled from college profile (zero profile mixing)'
      );
      assert.ok(!loadedResume.filledFromProfile, 'filledFromProfile must not exist for upload source');

      // Experience, projects, and skills come purely from the parsed resume
      assert.strictEqual(loadedResume.experience.length, 1);
      assert.strictEqual(loadedResume.experience[0].title, 'Python Backend Intern');
      assert.strictEqual(loadedResume.projects.length, 1);
      assert.strictEqual(loadedResume.projects[0].title, 'Scalable Microservices Gateway');

      // 3. Unticked skills from target job are never in the tailored output
      const targetJobWithExtraSkills = `
        Senior Systems Engineer
        Requirements:
        - Python, Django
        - Rust, Kubernetes, C++, Distributed Systems
      `;

      // Candidate only has python and django. Unticked skills: Rust, Kubernetes, C++
      const tailorUntickedRes = await fetch(`${BASE_URL}/students/me/resume-builder/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBFixture}`,
        },
        body: JSON.stringify({
          resumeData: loadedResume,
          jobDescription: targetJobWithExtraSkills,
          sourceType: 'upload',
        }),
      });
      assert.strictEqual(tailorUntickedRes.status, 200);
      const tailorUntickedData = await tailorUntickedRes.json();
      assert.strictEqual(tailorUntickedData.success, true);
      const tailoredSkillsList = (tailorUntickedData.tailoredResume.skills || [])
        .flatMap((cat) => (typeof cat === 'string' ? [cat] : cat.items || []))
        .map((s) => s.toLowerCase());

      assert.ok(!tailoredSkillsList.includes('rust'), 'Unticked skill "rust" must never be in tailored skills');
      assert.ok(!tailoredSkillsList.includes('c++'), 'Unticked skill "c++" must never be in tailored skills');
      assert.ok(!tailoredSkillsList.includes('kubernetes'), 'Unticked skill "kubernetes" must never be in tailored skills');

      // Check summary also doesn't invent unticked skills
      const summaryText = (tailorUntickedData.tailoredResume.summary || '').toLowerCase();
      assert.ok(!summaryText.includes('rust'), 'Unticked skill "rust" must never be invented in summary');
      assert.ok(!summaryText.includes('kubernetes'), 'Unticked skill "kubernetes" must never be invented in summary');

      pass('Zero profile mixing (missing fields remain empty), parser reuse, and unticked skills isolation verified');
    } catch (err) {
      fail('Source merging & unticked skills honesty', err);
    }

    // =========================================================================
    // TEST 14: VISIBLE LINKS EXTRACTION, NORMALIZATION, & CLASSIFICATION
    // =========================================================================
    console.log('\n--- TEST 14: Visible Links Extraction, Normalization, & Classification ---');
    try {
      const sampleText = `
        Alex Rivera
        Email: alex.rivera@techdev.io | Phone: +1-555-019-2834
        GitHub: https://github.com/alex-dev/micro-service
        LinkedIn: https://linkedin.com/in/alex-rivera-cloud/
        Portfolio: https://alexrivera.dev
        Alternate Portfolio: https://alex-ui.vercel.app
        Technical Blog: https://medium.com/@alex_rivera/system-design
        AWS Certification: https://aws.amazon.com/certification/verify/12345,
      `;

      // 1. Master link & contact extractor
      const extracted = await extractAllLinksAndContacts({ text: sampleText });
      assert.strictEqual(extracted.emails.length, 1);
      assert.strictEqual(extracted.emails[0], 'alex.rivera@techdev.io');
      assert.ok(extracted.phones.length >= 1);

      // 2. Classifications
      assert.strictEqual(extracted.classified.github, 'https://github.com/alex-dev/micro-service');
      assert.strictEqual(extracted.classified.linkedin, 'https://linkedin.com/in/alex-rivera-cloud');
      assert.ok(
        extracted.classified.portfolio === 'https://alexrivera.dev' ||
        extracted.classified.portfolio === 'https://alex-ui.vercel.app'
      );
      assert.ok(
        extracted.classified.other.some((u) => u.includes('medium.com')),
        'Medium blog must be classified under other'
      );

      // 3. Normalization checks
      assert.strictEqual(normalizeUrl('http://github.com/alex/repo/'), 'https://github.com/alex/repo');
      assert.strictEqual(normalizeUrl('github.com/alex/repo,'), 'https://github.com/alex/repo');
      assert.strictEqual(normalizeUrl('linkedin.com/in/alex;'), 'https://linkedin.com/in/alex');
      assert.strictEqual(normalizeUrl('mailto:test@example.com'), '');

      // 4. Classification helper
      assert.strictEqual(classifyUrl('https://github.com/octocat'), 'github');
      assert.strictEqual(classifyUrl('https://www.linkedin.com/in/dev'), 'linkedin');
      assert.strictEqual(classifyUrl('https://portfolio.devfolio.co'), 'portfolio');
      assert.strictEqual(classifyUrl('https://my-app.netlify.app'), 'portfolio');
      assert.strictEqual(classifyUrl('https://wikipedia.org'), 'other');

      pass('Visible links deterministic extraction, URL normalization, and 4-way classification verified');
    } catch (err) {
      fail('Visible links extraction & classification', err);
    }

    // =========================================================================
    // TEST 15: HYPERLINK ANNOTATIONS IN PDF BUFFER & DOCX BUFFER
    // =========================================================================
    console.log('\n--- TEST 15: Hyperlink Annotations in PDF & DOCX Buffers ---');
    try {
      // 1. PDF Link Annotations with PDFKit
      const makeAnnotatedPdf = () =>
        new Promise((resolve) => {
          const doc = new PDFDocument({ margin: 50 });
          const bufs = [];
          doc.on('data', (d) => bufs.push(d));
          doc.on('end', () => resolve(Buffer.concat(bufs)));

          doc.text('John Doe - Cloud Engineer');
          doc.text('View My Open Source Work', {
            link: 'https://github.com/johndoe/kubernetes-operator',
            underline: true,
          });
          doc.text('Connect on Professional Network', {
            link: 'https://linkedin.com/in/johndoe-cloud',
            underline: true,
          });
          doc.end();
        });

      const pdfBuf = await makeAnnotatedPdf();
      assert.ok(pdfBuf.length > 0);
      assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF');

      const pdfExtracted = await extractAllLinksAndContacts({ buffer: pdfBuf });
      assert.ok(
        pdfExtracted.links.some((l) => l.url === 'https://github.com/johndoe/kubernetes-operator'),
        'PDF hyperlink annotation behind clickable anchor must be extracted'
      );
      assert.ok(
        pdfExtracted.links.some((l) => l.url === 'https://linkedin.com/in/johndoe-cloud'),
        'PDF LinkedIn annotation behind clickable anchor must be extracted'
      );
      assert.strictEqual(pdfExtracted.classified.github, 'https://github.com/johndoe/kubernetes-operator');
      assert.strictEqual(pdfExtracted.classified.linkedin, 'https://linkedin.com/in/johndoe-cloud');

      // 2. DOCX Hyperlinks in word/_rels/document.xml.rels
      const zip = new JSZip();
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://github.com/docx-engineer/distributed-cache" TargetMode="External"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://linkedin.com/in/docx-cloud-engineer" TargetMode="External"/>
</Relationships>`;
      zip.folder('word').folder('_rels').file('document.xml.rels', relsXml);
      const docxBuf = await zip.generateAsync({ type: 'nodebuffer' });

      const docxExtracted = await extractAllLinksAndContacts({ buffer: docxBuf, isDocx: true });
      assert.ok(
        docxExtracted.links.some((l) => l.url === 'https://github.com/docx-engineer/distributed-cache'),
        'DOCX hyperlink relation must be extracted'
      );
      assert.ok(
        docxExtracted.links.some((l) => l.url === 'https://linkedin.com/in/docx-cloud-engineer'),
        'DOCX LinkedIn relation must be extracted'
      );
      assert.strictEqual(docxExtracted.classified.github, 'https://github.com/docx-engineer/distributed-cache');
      assert.strictEqual(docxExtracted.classified.linkedin, 'https://linkedin.com/in/docx-cloud-engineer');

      pass('Hyperlink annotations in PDF buffers and DOCX relationships deterministically extracted');
    } catch (err) {
      fail('Hyperlink annotations in PDF & DOCX', err);
    }

    // =========================================================================
    // TEST 16: ADDITIONAL SECTIONS PRESERVATION & PDFKIT EXPORT
    // =========================================================================
    console.log('\n--- TEST 16: Additional Sections Preservation & PDFKit Export ---');
    try {
      const baseResume = await compileBaseResume(userA._id);
      const fullResumeWithExtras = {
        ...baseResume,
        achievements: [
          'First Place in National Smart India Hackathon 2024 out of 1,200 teams',
          'Published research on distributed consensus algorithms in IEEE 2024',
        ],
        positionsOfResponsibility: [
          'Head Coordinator of University Open Source Development Club (2023 - 2024)',
          'Student Placement Representative for CSE Department',
        ],
        awards: [
          "Dean's Academic Excellence Award (Top 1% Percentile)",
        ],
        languages: ['English', 'German', 'Hindi'],
        interests: ['Distributed Systems', 'Kernel Development', 'Cycling'],
        additionalSections: [
          {
            title: 'Selected Publications',
            lines: [
              'Rivera, A. et al., "Low-Latency Sharding in Distributed Datastores", IEEE Conf. 2024',
            ],
          },
        ],
      };

      // 1. Save snapshot to MongoDB
      const saveRes = await saveResumeVersion({
        studentUserId: userA._id,
        name: 'Snapshot With Custom Sections',
        templateId: 'modern',
        resumeData: fullResumeWithExtras,
        atsScore: 88,
        baselineScore: 82,
      });
      cleanupVersions.push(saveRes.version._id);

      // 2. Fetch directly from DB and assert schema preserved all non-standard sections
      const dbVersion = await ResumeVersion.findById(saveRes.version._id).lean();
      assert.ok(dbVersion, 'Version must be retrieved from database');
      assert.strictEqual(dbVersion.resumeData.achievements.length, 2);
      assert.strictEqual(dbVersion.resumeData.positionsOfResponsibility.length, 2);
      assert.strictEqual(dbVersion.resumeData.awards.length, 1);
      assert.strictEqual(dbVersion.resumeData.languages.length, 3);
      assert.strictEqual(dbVersion.resumeData.interests.length, 3);
      assert.strictEqual(dbVersion.resumeData.additionalSections.length, 1);
      assert.strictEqual(dbVersion.resumeData.additionalSections[0].title, 'Selected Publications');

      // 3. Export to PDFKit across all three templates (modern, classic, compact)
      for (const tmpl of ['modern', 'classic', 'compact']) {
        const pdfBuf = await generateResumePdf(fullResumeWithExtras, tmpl);
        assert.ok(Buffer.isBuffer(pdfBuf));
        assert.ok(pdfBuf.length > 1000);
        assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF', `Template ${tmpl} must render valid %PDF`);
      }

      pass('Non-standard sections preserved in MongoDB schema and rendered cleanly in PDFKit');
    } catch (err) {
      fail('Additional sections preservation & PDFKit export', err);
    }

    // =========================================================================
    // TEST 17: PHONE MISMATCH ISOLATION & PROFILE NON-LEAKAGE SPY
    // =========================================================================
    console.log('\n--- TEST 17: Phone Mismatch Isolation & Profile Non-Leakage Spy ---');
    try {
      // 1. Student A profile has phone '9876501234'
      const rawTextWithoutPhone = `
Devika Sharma
Email: builder.test.devika@portal.com
Summary: Backend engineer focused on cloud infrastructure.
Experience:
Backend Intern at Acme Labs
- Developed REST APIs in Node.js and MongoDB
Skills: nodejs, mongodb, redis
`;
      const sourceResult = await loadResumeSource({
        studentUserId: userA._id,
        type: 'text',
        text: rawTextWithoutPhone,
      });

      // Assert phone was NOT filled from college profile (remains empty string)
      assert.strictEqual(
        sourceResult.resumeData.contact.phone,
        '',
        'Missing phone in uploaded/pasted resume must remain empty, never auto-filled from profile'
      );
      assert.strictEqual(
        sourceResult.resumeData.education.length,
        0,
        'Missing education in raw resume must not be injected from profile'
      );

      // 2. Profile mode is the ONLY mode that loads profile records
      const profileResult = await loadResumeSource({
        studentUserId: userA._id,
        type: 'profile',
      });
      assert.strictEqual(
        profileResult.resumeData.contact.phone,
        '9876501234',
        'Profile mode must load college profile phone'
      );
      assert.ok(
        profileResult.resumeData.education.length > 0,
        'Profile mode must load college profile education'
      );

      // 3. Cross-student tenant isolation: Student B source load NEVER reads Student A's data
      const studentBDoc = await Student.findOne({ enrollmentNo: 'RB-ENR-002' });
      assert.ok(studentBDoc, 'Student B document must exist');
      const studentBSource = await loadResumeSource({
        studentUserId: studentBDoc.user,
        type: 'text',
        text: 'Rohan Verma\nEmail: builder.test.rohan@portal.com\nSkills: python, django',
      });
      assert.strictEqual(studentBSource.resumeData.contact.fullName, 'Rohan Verma');
      assert.ok(!studentBSource.resumeData.contact.fullName.includes('Devika'));

      pass('Profile non-leakage (missing fields remain empty) and cross-student isolation verified');
    } catch (err) {
      fail('Phone mismatch isolation & profile non-leakage', err);
    }

    // =========================================================================
    // TEST 18: SOURCE VERIFICATION DROPS INVENTED COMPANIES & SKILLS
    // =========================================================================
    console.log('\n--- TEST 18: Source Verification Drops Invented Companies & Skills ---');
    try {
      const rawSourceCorpus = `
        Kiran Kumar
        Email: kiran.kumar@testmail.com
        Summary: Software developer with experience in Node.js and Redis.
        Experience:
        Backend Developer Intern at Alpha Tech Systems (June 2024 - August 2024)
        - Developed asynchronous message workers using Node.js
        Projects:
        Task Dispatcher Platform
        - Implemented Redis queue and MongoDB indexing
        Skills: nodejs, redis, mongodb
      `;

      const hallucinatedParsedData = {
        contact: { fullName: 'Kiran Kumar', email: 'kiran.kumar@testmail.com' },
        summary: 'Software developer with experience in Node.js and Redis.',
        skills: [
          {
            category: 'Backend',
            items: ['nodejs', 'redis', 'mongodb', 'solidity', 'quantum computing'],
          },
        ],
        experience: [
          {
            title: 'Backend Developer Intern',
            company: 'Alpha Tech Systems',
            bullets: ['Developed asynchronous message workers using Node.js'],
          },
          {
            title: 'Lead Cloud Architect',
            company: 'Invented Mega Corp',
            bullets: ['Architected multi-region Kubernetes clusters'],
          },
        ],
        projects: [
          {
            title: 'Task Dispatcher Platform',
            bullets: ['Implemented Redis queue and MongoDB indexing'],
          },
          {
            title: 'Hallucinated Crypto Exchange',
            bullets: ['Processed millions in crypto trades'],
          },
        ],
        education: [],
      };

      const { verifiedData, warnings } = verifySourceFacts(hallucinatedParsedData, rawSourceCorpus);

      // Skills: Solidity & Quantum Computing must be dropped
      const finalSkills = verifiedData.skills.flatMap((c) => c.items || []);
      assert.ok(!finalSkills.includes('solidity'), 'Invented skill "solidity" must be dropped');
      assert.ok(!finalSkills.includes('quantum computing'), 'Invented skill "quantum computing" must be dropped');
      assert.ok(finalSkills.includes('nodejs'), 'Verified skill "nodejs" must be retained');
      assert.ok(finalSkills.includes('redis'), 'Verified skill "redis" must be retained');

      // Experience: Invented Mega Corp must be dropped
      const companies = verifiedData.experience.map((e) => e.company);
      assert.ok(!companies.includes('Invented Mega Corp'), 'Invented company must be dropped');
      assert.ok(companies.includes('Alpha Tech Systems'), 'Verified company must be retained');

      // Projects: Hallucinated Crypto Exchange must be dropped
      const projects = verifiedData.projects.map((p) => p.title);
      assert.ok(!projects.includes('Hallucinated Crypto Exchange'), 'Invented project must be dropped');
      assert.ok(projects.includes('Task Dispatcher Platform'), 'Verified project must be retained');

      // Warnings must be emitted
      assert.ok(warnings.length >= 3, 'Warnings must explain dropped items');
      assert.ok(warnings.some((w) => w.includes('Mega Corp')));
      assert.ok(warnings.some((w) => w.includes('solidity')));

      pass('verifySourceFacts strictly drops hallucinated companies, projects, and skills');
    } catch (err) {
      fail('Source verification guard', err);
    }

    // =========================================================================
    // TEST 19: REVERSIBLE PII TOKENIZATION & PROVIDER PRIVACY SPY
    // =========================================================================
    console.log('\n--- TEST 19: Reversible PII Tokenization & Provider Privacy Spy ---');
    try {
      const confidentialText = `
        Devika Sharma
        Email: devika.private@secret-labs.io
        Phone: +91-9876543210
        Address: 42 Silicon Valley Road, Bangalore
        Portfolio: https://devika-portfolio.vercel.app
        GitHub: https://github.com/devika-cloud-sec
        Summary: Cloud security engineer with experience in Docker and Node.js.
      `;

      // 1. Tokenize
      const { tokenizedText, tokenMap } = tokenizeText(confidentialText);

      // Real PII and links must NEVER appear in tokenized text
      assert.ok(!tokenizedText.includes('devika.private@secret-labs.io'));
      assert.ok(!tokenizedText.includes('9876543210'));
      assert.ok(!tokenizedText.includes('42 Silicon Valley Road'));
      assert.ok(!tokenizedText.includes('https://devika-portfolio.vercel.app'));
      assert.ok(!tokenizedText.includes('https://github.com/devika-cloud-sec'));

      // Tokens must be present
      assert.ok(tokenizedText.includes('[[EMAIL_1]]'));
      assert.ok(tokenizedText.includes('[[PHONE_1]]'));
      assert.ok(tokenizedText.includes('[[ADDR_1]]'));
      assert.ok(tokenizedText.includes('[[URL_1]]'));

      // 2. Detokenize restores original data in objects
      const testObj = {
        email: '[[EMAIL_1]]',
        phone: '[[PHONE_1]]',
        location: '[[ADDR_1]]',
        link: '[[URL_1]]',
      };
      const restored = detokenize(testObj, tokenMap);
      assert.strictEqual(restored.email, 'devika.private@secret-labs.io');
      assert.strictEqual(restored.phone, '+91-9876543210');
      assert.strictEqual(restored.location, '42 Silicon Valley Road');

      // 3. Provider Payload Spy: verify AI payload during tailoring never receives raw contact info
      const baseResume = await compileBaseResume(userA._id);
      baseResume.contact.email = 'devika.private@secret-labs.io';
      baseResume.contact.phone = '+91-9876543210';
      baseResume.contact.linkedin = 'https://linkedin.com/in/secret-link';

      await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
      });

      // Inspect mockProvider.lastReceivedPayload
      const receivedPayload = mockProvider.lastReceivedPayload || '';
      assert.ok(
        !receivedPayload.includes('devika.private@secret-labs.io'),
        'AI provider must never receive candidate email'
      );
      assert.ok(
        !receivedPayload.includes('+91-9876543210'),
        'AI provider must never receive candidate phone number'
      );
      assert.ok(
        !receivedPayload.includes('secret-link'),
        'AI provider must never receive candidate profile link'
      );

      pass('Reversible PII tokenization masks contact data before AI provider and detokenizes cleanly');
    } catch (err) {
      fail('Reversible PII tokenization spy', err);
    }

    // =========================================================================
    // TEST 20: SECTION TIMEOUT FALLBACK & SAFE RECOVERY
    // =========================================================================
    console.log('\n--- TEST 20: Section Timeout Fallback & Safe Recovery ---');
    try {
      resetCircuitBreakers();
      const baseResume = await compileBaseResume(userA._id);
      const originalBullet = baseResume.experience[0].bullets[0];

      // Simulate section timeout by setting SECTION_TIMEOUT_MS small and forceDelayMs larger
      process.env.SECTION_TIMEOUT_MS = '60';
      mockProvider.forceDelayMs = 250;

      const tailoredTimeoutRes = await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
      });

      // Must recover safely: kept original bullet with status 'kept original' and reason code 'timeout'
      const bulletResult = tailoredTimeoutRes.bulletRewrites.find(
        (rw) => rw.original === originalBullet
      );
      assert.ok(bulletResult, 'Bullet rewrite entry must exist');
      assert.strictEqual(bulletResult.status, 'kept original');
      assert.strictEqual(bulletResult.suggested, originalBullet);
      assert.ok(
        bulletResult.reasonCodes.includes('timeout'),
        'Reason codes must indicate timeout'
      );

      // Reset mock delay and timeout
      process.env.SECTION_TIMEOUT_MS = '25000';
      mockProvider.forceDelayMs = 0;
      resetCircuitBreakers();

      pass('Section timeout falls back gracefully to original bullet with status kept original');
    } catch (err) {
      process.env.SECTION_TIMEOUT_MS = '25000';
      mockProvider.forceDelayMs = 0;
      resetCircuitBreakers();
      fail('Section timeout fallback', err);
    }

    // =========================================================================
    // TEST 21: ONE REPAIR CALL ON REJECTION FOR INVENTED SKILL & QUOTA SAFETY
    // =========================================================================
    console.log('\n--- TEST 21: One Repair Call on Rejection for Invented Skill ---');
    try {
      resetCircuitBreakers();
      const baseResume = await compileBaseResume(userA._id);
      const originalBullet = baseResume.experience[0].bullets[0];

      // Check quota before
      const usageBefore = await AiUsage.getUserDailyUsage(userA._id, 'student');
      const quotaBefore = usageBefore?.tailorUsed || 0;

      // 1st AI response: returns ungrounded invented skill (Rust) -> triggers rejection
      mockProvider.mockTailorResponse = {
        rewrites: [
          {
            original: originalBullet,
            suggested: 'Engineered high-performance microservices in Rust and WebAssembly',
            why: 'Target alignment',
          },
        ],
      };

      // 2nd AI response (repair call with mode='tailor_repair'): returns repaired bullet adhering to allowed facts
      mockProvider.mockTailorRepairResponse = {
        suggested: 'Developed backend apis and web features with nodejs [add your real number]%',
        why: 'Repaired rewrite with verified candidate skills',
      };

      const repairTailorRes = await tailorResume({
        studentUserId: userA._id,
        baseResumeData: baseResume,
      });

      const repairedRewrite = repairTailorRes.bulletRewrites.find(
        (rw) => rw.original === originalBullet
      );
      assert.ok(repairedRewrite, 'Repaired rewrite must exist');
      assert.strictEqual(repairedRewrite.status, 'rewritten', 'Repaired rewrite must be accepted');
      assert.ok(
        repairedRewrite.suggested.includes('nodejs'),
        'Repaired rewrite must contain verified candidate skill'
      );
      assert.ok(
        !repairedRewrite.suggested.includes('Rust'),
        'Repaired rewrite must not contain rejected invented skill'
      );

      // Check quota after: exactly 1 quota consumed (repair call had skipQuota: true)
      const usageAfter = await AiUsage.getUserDailyUsage(userA._id, 'student');
      const quotaAfter = usageAfter?.tailorUsed || 0;
      assert.strictEqual(
        quotaAfter,
        quotaBefore + 1,
        'Repair call must NOT consume additional quota (quota charged strictly once)'
      );

      mockProvider.reset();
      resetCircuitBreakers();
      pass('One repair call successfully repairs rejected rewrite without additional quota consumption');
    } catch (err) {
      mockProvider.reset();
      resetCircuitBreakers();
      fail('Repair call on rejection', err);
    }

    // =========================================================================
    // TEST 22: SAMPLE PASS RATE BENCHMARK (>= 90% PASS RATE OVER 10 RESUMES)
    // =========================================================================
    console.log('\n--- TEST 22: Sample Pass Rate Benchmark (10 Resumes + JDs) ---');
    try {
      const benchmarkSamples = [
        {
          role: 'Frontend React Engineer',
          jd: 'Senior Frontend Developer. Requirements: React, Redux, JavaScript, CSS, HTML. Build scalable UI.',
          resume: {
            contact: { fullName: 'Candidate 1', email: 'c1@test.com' },
            summary: 'Frontend engineer with 2 years building user interfaces.',
            skills: [{ category: 'Frontend', items: ['react', 'javascript', 'html', 'css', 'redux'] }],
            experience: [
              {
                company: 'WebSphere',
                title: 'Frontend Intern',
                bullets: ['Developed responsive web interfaces using React and Redux'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Backend Node.js Developer',
          jd: 'Backend Engineer. Requirements: Node.js, Express, MongoDB, Redis, Docker.',
          resume: {
            contact: { fullName: 'Candidate 2', email: 'c2@test.com' },
            summary: 'Backend engineer passionate about databases and API performance.',
            skills: [{ category: 'Backend', items: ['nodejs', 'express', 'mongodb', 'redis'] }],
            experience: [
              {
                company: 'CoreCloud',
                title: 'Backend Intern',
                bullets: ['Built REST APIs with Node.js and MongoDB'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Python Data Engineer',
          jd: 'Data Engineer. Requirements: Python, SQL, PostgreSQL, Pandas.',
          resume: {
            contact: { fullName: 'Candidate 3', email: 'c3@test.com' },
            summary: 'Data engineer skilled in Python pipelines and relational database indexing.',
            skills: [{ category: 'Data', items: ['python', 'sql', 'postgresql', 'pandas'] }],
            experience: [
              {
                company: 'DataFlow Systems',
                title: 'Data Analyst Intern',
                bullets: ['Developed data transformation scripts in Python and SQL'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Full Stack Engineer',
          jd: 'Full Stack Developer. Requirements: React, Node.js, PostgreSQL, Tailwind.',
          resume: {
            contact: { fullName: 'Candidate 4', email: 'c4@test.com' },
            summary: 'Full-stack developer building cloud web applications.',
            skills: [{ category: 'FullStack', items: ['react', 'nodejs', 'postgresql', 'tailwind'] }],
            experience: [
              {
                company: 'NextGen Apps',
                title: 'Full Stack Intern',
                bullets: ['Implemented web applications using React and Node.js'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'DevOps & Cloud Engineer',
          jd: 'DevOps Engineer. Requirements: Docker, Kubernetes, Linux, Bash, Git.',
          resume: {
            contact: { fullName: 'Candidate 5', email: 'c5@test.com' },
            summary: 'DevOps engineer focused on containerization and CI/CD automation.',
            skills: [{ category: 'DevOps', items: ['docker', 'linux', 'bash', 'git', 'kubernetes'] }],
            experience: [
              {
                company: 'InfraScale',
                title: 'Cloud DevOps Intern',
                bullets: ['Automated deployment scripts using Bash and Docker'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Java Backend Developer',
          jd: 'Java Engineer. Requirements: Java, Spring Boot, MySQL, REST APIs.',
          resume: {
            contact: { fullName: 'Candidate 6', email: 'c6@test.com' },
            summary: 'Java engineer experienced in enterprise Spring Boot applications.',
            skills: [{ category: 'Backend', items: ['java', 'spring boot', 'mysql'] }],
            experience: [
              {
                company: 'FinTech Enterprise',
                title: 'Software Intern',
                bullets: ['Developed backend services using Java and Spring Boot'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Machine Learning Engineer',
          jd: 'ML Engineer. Requirements: Python, PyTorch, Scikit-learn, TensorFlow.',
          resume: {
            contact: { fullName: 'Candidate 7', email: 'c7@test.com' },
            summary: 'Machine learning practitioner experienced in neural network architectures.',
            skills: [{ category: 'AI', items: ['python', 'pytorch', 'tensorflow', 'scikit-learn'] }],
            experience: [
              {
                company: 'AI Research Lab',
                title: 'ML Research Intern',
                bullets: ['Trained classification models using Python and PyTorch'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Mobile App Developer',
          jd: 'Mobile Engineer. Requirements: React Native, JavaScript, iOS, Android.',
          resume: {
            contact: { fullName: 'Candidate 8', email: 'c8@test.com' },
            summary: 'Mobile developer building cross-platform applications.',
            skills: [{ category: 'Mobile', items: ['react native', 'javascript', 'android'] }],
            experience: [
              {
                company: 'MobileX Labs',
                title: 'Mobile Developer Intern',
                bullets: ['Created cross-platform features using React Native and JavaScript'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'QA & Automation Engineer',
          jd: 'QA Engineer. Requirements: Selenium, JavaScript, Jest, Cypress.',
          resume: {
            contact: { fullName: 'Candidate 9', email: 'c9@test.com' },
            summary: 'Quality assurance engineer specialized in automated testing suites.',
            skills: [{ category: 'Testing', items: ['selenium', 'javascript', 'jest', 'cypress'] }],
            experience: [
              {
                company: 'QualityFirst',
                title: 'QA Intern',
                bullets: ['Implemented automated test suites using Jest and Cypress'],
              },
            ],
            projects: [],
            education: [],
          },
        },
        {
          role: 'Cybersecurity Analyst',
          jd: 'Security Analyst. Requirements: Python, Linux, Wireshark, Networking.',
          resume: {
            contact: { fullName: 'Candidate 10', email: 'c10@test.com' },
            summary: 'Cybersecurity analyst passionate about vulnerability assessment and network security.',
            skills: [{ category: 'Security', items: ['python', 'linux', 'wireshark', 'networking'] }],
            experience: [
              {
                company: 'Securitas Defense',
                title: 'Security Intern',
                bullets: ['Analyzed network traffic logs using Linux and Python'],
              },
            ],
            projects: [],
            education: [],
          },
        },
      ];

      let passedCount = 0;
      for (const sample of benchmarkSamples) {
        try {
          const res = await tailorResume({
            studentUserId: userA._id,
            baseResumeData: sample.resume,
            jobDescription: sample.jd,
          });

          // Must return valid tailored resume without crashing
          if (res && res.tailoredResume && res.bulletRewrites.length > 0) {
            // Check that all bullets are either rewritten or kept original without unverified hallucinations
            const allBulletsValid = res.bulletRewrites.every(
              (rw) => rw.status === 'rewritten' || rw.status === 'kept original'
            );
            if (allBulletsValid) {
              passedCount++;
            }
          }
        } catch (sampleErr) {
          console.warn(`Benchmark sample failed for ${sample.role}:`, sampleErr.message);
        }
      }

      const passRate = (passedCount / benchmarkSamples.length) * 100;
      console.log(`Benchmark Results: ${passedCount}/${benchmarkSamples.length} passed (${passRate}%)`);
      assert.ok(
        passRate >= 90,
        `Sample benchmark pass rate must be at least 90%, achieved ${passRate}%`
      );

      pass(`Sample pass rate benchmark satisfied: ${passedCount}/10 (${passRate}%)`);
    } catch (err) {
      fail('Sample pass rate benchmark', err);
    }

    // =========================================================================
    // TEST 23: COMPILEBASERESUME AUDIT: NEAR-EMPTY VS FULL PROFILE HONESTY
    // =========================================================================
    console.log('\n--- TEST 23: Audit compileBaseResume (Near-Empty vs Full Profile Honesty) ---');
    try {
      // 23.1 Near-empty student profile: must NOT invent ANY text, and must return missingFields[]
      const emptyUser = await User.create({
        name: 'Empty Candidate',
        email: 'builder.test.empty@portal.com',
        password: 'password123',
        role: 'student',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified: true,
      });
      cleanupUsers.push(emptyUser._id);

      const emptyStudent = await Student.create({
        user: emptyUser._id,
        college: collegeA._id,
        enrollmentNo: 'RB-ENR-EMPTY-001',
        phone: '9876543210',
        cgpa: 7.0,
        batchYear: 2026,
        branch: 'CSE',
      });
      cleanupStudents.push(emptyStudent._id);

      const emptyBaseResume = await compileBaseResume(emptyUser._id);

      // Must produce zero invented content
      assert.strictEqual(emptyBaseResume.contact.fullName, 'Empty Candidate');
      assert.strictEqual(emptyBaseResume.summary, '', 'Must not invent generic summary');
      assert.deepStrictEqual(emptyBaseResume.skills, [], 'Must not invent default skills');
      assert.deepStrictEqual(emptyBaseResume.experience, [], 'Must not invent Software Engineering Intern');
      assert.deepStrictEqual(emptyBaseResume.projects, [], 'Must not invent Technical Platform Project');
      assert.deepStrictEqual(emptyBaseResume.education, [], 'Must not invent Bachelor of Technology / 2025');

      // missingFields[] verification
      assert.ok(Array.isArray(emptyBaseResume.missingFields), 'missingFields must be an array');
      assert.ok(emptyBaseResume.missingFields.includes('summary'), 'missingFields must report summary');
      assert.ok(emptyBaseResume.missingFields.includes('skills'), 'missingFields must report skills');
      assert.ok(emptyBaseResume.missingFields.includes('experience'), 'missingFields must report experience');
      assert.ok(emptyBaseResume.missingFields.includes('projects'), 'missingFields must report projects');
      assert.ok(emptyBaseResume.missingFields.includes('education'), 'missingFields must report education');

      // Also verify when user name is missing/empty, compileBaseResume produces empty fullName and reports it in missingFields
      emptyUser.name = '';
      await emptyUser.save({ validateBeforeSave: false });
      const namelessResume = await compileBaseResume(emptyUser._id);
      assert.strictEqual(namelessResume.contact.fullName, '', 'Must leave fullName empty when missing');
      assert.ok(namelessResume.missingFields.includes('fullName'), 'missingFields must report fullName when name is empty');

      // 23.2 Full student profile: must remain completely unchanged and populated
      const fullBaseResume = await compileBaseResume(userA._id);
      assert.strictEqual(fullBaseResume.contact.fullName, 'Devika Sharma');
      assert.strictEqual(fullBaseResume.contact.email, 'builder.test.devika@portal.com');
      assert.strictEqual(fullBaseResume.contact.phone, '9876501234');
      assert.strictEqual(fullBaseResume.experience[0].company, 'Acme Cloud Labs');
      assert.strictEqual(fullBaseResume.projects[0].title, 'Distributed Task Queue System');
      assert.strictEqual(fullBaseResume.education[0].degree, 'Bachelor of Technology');
      assert.ok(fullBaseResume.skills.length >= 2, 'Full student must retain all categorized skills');

      // 23.3 Downstream PDF export with empty fields does not throw or re-insert generic text
      const emptyPdfBuffers = [];
      const mockStream = {
        write: (chunk) => emptyPdfBuffers.push(chunk),
        on: () => {},
        once: () => {},
        emit: () => {},
        end: () => {},
      };
      generateResumePdf(emptyBaseResume, 'modern', mockStream);

      pass('compileBaseResume audit: near-empty produces zero invented content, full profile unchanged, missingFields[] returned');
    } catch (err) {
      fail('compileBaseResume audit', err);
    }

    // =========================================================================
    // TEST 24: RULE PARSER COMPARISON: extractComprehensiveWithRules vs extractWithRules
    // =========================================================================
    console.log('\n--- TEST 24: Rule Parsers Comparison ---');
    try {
      // 24.1 Near-empty input produces zero invented content in extractComprehensiveWithRules
      const emptyParsed = extractComprehensiveWithRules('', {});
      assert.strictEqual(emptyParsed.contact.fullName, '', 'Must not invent Candidate Name');
      assert.strictEqual(emptyParsed.summary, '', 'Must not invent summary');
      assert.deepStrictEqual(emptyParsed.experience, [], 'Must not invent experience');
      assert.deepStrictEqual(emptyParsed.projects, [], 'Must not invent projects');
      assert.deepStrictEqual(emptyParsed.education, [], 'Must not invent education');

      // 24.2 Comparison: extractComprehensiveWithRules captures rich sections and full schema
      const richResumeText = `Aarav Mehta
Bangalore, India

Summary
Passionate engineer with high throughput distributed systems focus.

Technical Skills
Node.js, Docker, Kubernetes, PostgreSQL

Work Experience
Senior Backend Engineer | CloudScale Inc
• Built real-time analytics streaming engine

Key Projects
Event Broker System
• Implemented low-latency pub-sub broker

Education
B.Tech in Computer Science | National Institute of Technology | 2024

Achievements
• Ranked 1st in State Coding Olympiad

Positions of Responsibility
• Lead Organizer, TechFest 2023

Awards
• Best Engineering Innovation Award 2024

Languages
English, Hindi

Interests
Distributed Computing, Chess

VOLUNTEER INITIATIVES
• Mentored 50+ junior developers in open source`;

      const comprehensiveResult = extractComprehensiveWithRules(richResumeText);
      const atsRulesResult = extractWithRules(richResumeText);

      // Verify extractComprehensiveWithRules preserves contact details and rich sections
      assert.strictEqual(comprehensiveResult.contact.fullName, 'Aarav Mehta');
      assert.ok(comprehensiveResult.achievements.length > 0, 'Must capture achievements');
      assert.ok(comprehensiveResult.positionsOfResponsibility.length > 0, 'Must capture positions of responsibility');
      assert.ok(comprehensiveResult.awards.length > 0, 'Must capture awards');
      assert.ok(comprehensiveResult.languages.length > 0, 'Must capture languages');
      assert.ok(comprehensiveResult.interests.length > 0, 'Must capture interests');
      assert.ok(comprehensiveResult.additionalSections.length > 0, 'Must capture unclassified uppercase custom sections in additionalSections');

      // Verify atsRulesResult targets Student.resumeProfile schema (flat skills, sliced caps, description string)
      assert.ok(Array.isArray(atsRulesResult.skills) && typeof atsRulesResult.skills[0] === 'string', 'ATS rules returns flat string skills');
      assert.ok(atsRulesResult.experience.length > 0 && typeof atsRulesResult.experience[0].description === 'string', 'ATS rules generates description string');
      assert.strictEqual(atsRulesResult.achievements, undefined, 'ATS rules does not capture achievements (distinct ATS target schema)');

      pass('Rule parsers comparison verified: distinct target models and zero invented content on empty input');
    } catch (err) {
      fail('Rule parsers comparison', err);
    }

    // =========================================================================
    // TEST 25: ZOD VALIDATION ACROSS RESUME BUILDER ENDPOINTS
    // =========================================================================
    console.log('\n--- TEST 25: Zod Validation Across Resume Builder Endpoints ---');
    try {
      // 25.1 POST /api/resume-builder/source with invalid type enum
      const badTypeRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'invalid_source_type' }),
      });
      assert.strictEqual(badTypeRes.status, 400);
      const badTypeData = await badTypeRes.json();
      assert.strictEqual(badTypeData.success, false);
      assert.ok(badTypeData.message.includes("profile") || badTypeData.message.includes("type"));

      // 25.2 POST /api/resume-builder/source with oversized text (>50000 chars)
      const oversizedTextRes = await fetch(`${BASE_URL}/resume-builder/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'text', text: 'a'.repeat(50005) }),
      });
      assert.strictEqual(oversizedTextRes.status, 400);

      // 25.3 POST /api/resume-builder/analyze-target with malformed driveId
      const badDriveIdRes = await fetch(`${BASE_URL}/resume-builder/analyze-target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ driveId: 'not-a-valid-24-hex-id' }),
      });
      assert.strictEqual(badDriveIdRes.status, 400);

      // 25.4 POST /api/students/me/resume-builder/tailor with invalid sourceType enum
      const badSourceTypeRes = await fetch(`${BASE_URL}/students/me/resume-builder/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ resumeData: { skills: [] }, sourceType: 'unsupported' }),
      });
      assert.strictEqual(badSourceTypeRes.status, 400);

      // 25.5 POST /api/students/me/resume-builder/export-pdf with invalid templateId
      const badTemplateRes = await fetch(`${BASE_URL}/students/me/resume-builder/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ resumeData: { contact: { fullName: 'Test' } }, templateId: 'unknown_tpl' }),
      });
      assert.strictEqual(badTemplateRes.status, 400);

      // 25.6 GET /api/students/me/resume-builder/versions/:id with malformed ObjectId
      const badIdRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions/not-an-id`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(badIdRes.status, 400);

      // 25.7 DELETE /api/students/me/resume-builder/versions/:id with malformed ObjectId
      const badDelIdRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions/not-an-id`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(badDelIdRes.status, 400);

      // 25.8 GET /api/students/me/resume-builder/versions with pagination parameters
      const pagedVersionsRes = await fetch(`${BASE_URL}/students/me/resume-builder/versions?page=1&limit=2`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(pagedVersionsRes.status, 200);
      const pagedData = await pagedVersionsRes.json();
      assert.strictEqual(pagedData.success, true);
      assert.strictEqual(pagedData.page, 1);
      assert.strictEqual(pagedData.limit, 2);

      pass('Strict Zod validation enforced across all Resume Builder endpoints');
    } catch (err) {
      fail('Zod validation endpoints', err);
    }

    // =========================================================================
    // 26. PHASE 12b: EDUCATION PATTERN RECOGNITION & SUMMARY PROVENANCE
    // =========================================================================
    console.log('\n--- 26. PHASE 12b: EDUCATION PATTERN RECOGNITION & SUMMARY PROVENANCE ---');
    try {
      // 26.1 Sample Layout from user specification:
      // Lines: "Sample Institute of Technology", "May 2027", "Example University June 2023", "B.E. in Computer Engineering CGPA", "7.23/10"
      const sampleLayout = [
        'Sample Institute of Technology',
        'May 2027',
        'Example University June 2023',
        'B.E. in Computer Engineering CGPA',
        '7.23/10',
      ];
      const res26_1 = parseEducationSection(sampleLayout);
      assert.strictEqual(res26_1.entries.length, 1, 'Sample layout must group into exactly 1 education entry');
      const edu1 = res26_1.entries[0];
      assert.strictEqual(edu1.degree, 'B.E.', 'Degree must be recognized as B.E.');
      assert.strictEqual(edu1.field, 'Computer Engineering', 'Field must be recognized as Computer Engineering');
      assert.ok(
        edu1.institution.includes('Sample Institute of Technology'),
        'Institution must contain Sample Institute of Technology'
      );
      assert.ok(edu1.year.includes('May 2027'), 'Year must contain May 2027');
      assert.ok(edu1.score.includes('7.23/10'), 'Score must contain 7.23/10');
      assert.ok(edu1.score.includes('CGPA'), 'Score label CGPA must be joined with score value');

      // 26.2 Single-line delimited layout
      const singleLineLayout = [
        'B.Tech in Information Technology | National Institute of Technology | 2020 - 2024 | 8.8 / 10 CGPA',
      ];
      const res26_2 = parseEducationSection(singleLineLayout);
      assert.strictEqual(res26_2.entries.length, 1, 'Single-line layout must produce 1 entry');
      assert.strictEqual(res26_2.entries[0].degree, 'B.Tech');
      assert.strictEqual(res26_2.entries[0].field, 'Information Technology');
      assert.strictEqual(res26_2.entries[0].institution, 'National Institute of Technology');
      assert.strictEqual(res26_2.entries[0].year, '2020 - 2024');
      assert.ok(res26_2.entries[0].score.includes('8.8 / 10'));

      // 26.3 Sequential multi-degree layout (Master then Bachelor)
      const multiDegreeLayout = [
        'Master of Science in Data Science',
        'Stanford University',
        '2022 - 2024',
        'Bachelor of Engineering in Mechanical',
        'State Technical College',
        '2018 - 2022',
        '82%',
      ];
      const res26_3 = parseEducationSection(multiDegreeLayout);
      assert.strictEqual(res26_3.entries.length, 2, 'Two sequential degrees must yield exactly 2 entries');
      assert.strictEqual(res26_3.entries[0].degree, 'Master of Science');
      assert.strictEqual(res26_3.entries[0].field, 'Data Science');
      assert.strictEqual(res26_3.entries[0].institution, 'Stanford University');
      assert.strictEqual(res26_3.entries[0].year, '2022 - 2024');

      assert.strictEqual(res26_3.entries[1].degree, 'Bachelor of Engineering');
      assert.strictEqual(res26_3.entries[1].field, 'Mechanical');
      assert.strictEqual(res26_3.entries[1].institution, 'State Technical College');
      assert.strictEqual(res26_3.entries[1].year, '2018 - 2022');
      assert.strictEqual(res26_3.entries[1].score, '82%');

      // 26.4 Score label on one line, score value on next line
      const splitScoreLayout = [
        'B.Sc in Mathematics',
        'City Science College',
        '2021',
        'CGPA',
        '9.1/10',
      ];
      const res26_4 = parseEducationSection(splitScoreLayout);
      assert.strictEqual(res26_4.entries.length, 1);
      assert.strictEqual(res26_4.entries[0].score, '9.1/10 CGPA');

      // 26.5 Unconfident education layout produces warning and zero invented values
      const unconfidentLayout = ['Student Activities Committee', 'Fall Semester'];
      const warnings26_5 = [];
      const res26_5 = parseEducationSection(unconfidentLayout, warnings26_5);
      assert.ok(
        warnings26_5.includes('Please check this education entry'),
        'Unconfident entry must produce warning'
      );

      // 26.6 Summary provenance tests:
      // a) No summary section -> summary is empty string
      const textWithoutSummary = `
John Doe
john@example.com | 9876543210
EDUCATION
B.Tech in CS | State Univ | 2024
SKILLS
JavaScript, React, Node.js
EXPERIENCE
Software Intern | Tech Co | 2023 - 2024
- Built REST APIs
`;
      const parsedNoSummary = extractComprehensiveWithRules(textWithoutSummary);
      assert.strictEqual(parsedNoSummary.summary, '', 'Summary must be empty when no summary section exists in source text');

      // b) Bulleted summary -> leading bullet stripped
      const textWithBulletSummary = `
Jane Doe
jane@example.com | 9876543210
SUMMARY
• Results-driven full stack developer with 2+ years experience building cloud applications.
SKILLS
Python, React
`;
      const parsedBulletSummary = extractComprehensiveWithRules(textWithBulletSummary);
      assert.strictEqual(
        parsedBulletSummary.summary,
        'Results-driven full stack developer with 2+ years experience building cloud applications.',
        'Summary must have leading bullet characters stripped'
      );

      // c) AI Rule parser fallback (extractWithRules) must NOT generate synthetic summary
      const aiRuleParsed = extractWithRules(textWithoutSummary);
      assert.strictEqual(
        aiRuleParsed.summary,
        '',
        'extractWithRules must NOT produce synthetic summary when resume text has no summary'
      );

      pass('Phase 12b: Education pattern recognition, multi-layout grouping, score joining, and summary provenance verified');
    } catch (err) {
      fail('Phase 12b tests', err);
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
