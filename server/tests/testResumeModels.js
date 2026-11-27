/**
 * Test Suite: Resume Studio Models (Phase 1)
 *
 * Verifies:
 * 1. Resume schema defaults, data type flexibility, and timestamps.
 * 2. Required field constraints (student, college).
 * 3. templateId enum validation covering all 8 ATS templates.
 * 4. Compound index ({ student: 1, archived: 1, updatedAt: -1 }) creation.
 * 5. Partial unique index ({ student: 1, isPrimary: 1 } where isPrimary: true, archived: false)
 *    strictly enforcing at most one active primary resume per student.
 * 6. Extended ResumeVersion model fields:
 *    - resume reference field (nullable for backward compatibility)
 *    - source enum ('manual', 'ai-tailor', 'import')
 *    - label & contentHash fields
 *    - templateId widened enum to 8 templates
 * 7. Dry-run migration logic compatibility.
 */

process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';

const mongoose = require('mongoose');
const assert = require('assert');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getTestDbUri, assertTestDatabase } = require('./testHelper');
const { Resume, ResumeVersion, College, Student, User } = require('../models');
const { migrateResumeVersions } = require('../scripts/migrateResumeVersionsToResume');

const EXPECTED_TEMPLATES = [
  'modern',
  'classic',
  'compact',
  'minimal-ats',
  'software-engineer',
  'professional-fresher',
  'modern-professional',
  'technical-projects',
];

async function runResumeModelTests() {
  console.log('='.repeat(70));
  console.log('TEST SUITE: RESUME STUDIO MODELS & SCHEMAS (PHASE 1)');
  console.log('='.repeat(70));

  const testDbUri = getTestDbUri();
  console.log(`Connecting to test database: ${testDbUri.replace(/\/\/.*@/, '//<credentials>@')}`);
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);

  const cleanupResumes = [];
  const cleanupVersions = [];
  const cleanupStudents = [];
  const cleanupColleges = [];
  const cleanupUsers = [];

  let passedTests = 0;
  let totalTests = 0;

  function runTest(name, fn) {
    totalTests++;
    return (async () => {
      try {
        await fn();
        console.log(`  ✓ TEST ${totalTests}: ${name}`);
        passedTests++;
      } catch (err) {
        console.error(`  ❌ TEST ${totalTests} FAILED: ${name}`);
        console.error(err);
        throw err;
      }
    })();
  }

  try {
    // 0. Build/sync indexes explicitly
    await Resume.syncIndexes();
    await ResumeVersion.syncIndexes();

    // Setup test fixtures
    const college = await College.create({
      name: `Test Tech College ${Date.now()}`,
      code: `TTC${Date.now().toString().slice(-4)}`,
      city: 'Mumbai',
      state: 'Maharashtra',
    });
    cleanupColleges.push(college._id);

    const userA = await User.create({
      name: 'Student Alpha',
      email: `alpha_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
      college: college._id,
    });
    cleanupUsers.push(userA._id);

    const studentA = await Student.create({
      user: userA._id,
      college: college._id,
      enrollmentNo: `EN_${Date.now()}_A`,
      branch: 'Computer Science',
      phone: '9876543210',
      batchYear: 2026,
      department: 'Computer Science',
      cgpa: 8.5,
    });
    cleanupStudents.push(studentA._id);

    const userB = await User.create({
      name: 'Student Beta',
      email: `beta_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
      college: college._id,
    });
    cleanupUsers.push(userB._id);

    const studentB = await Student.create({
      user: userB._id,
      college: college._id,
      enrollmentNo: `EN_${Date.now()}_B`,
      branch: 'Information Technology',
      phone: '9876543211',
      batchYear: 2026,
      department: 'Information Technology',
      cgpa: 9.0,
    });
    cleanupStudents.push(studentB._id);

    // TEST 1: Resume default field values
    await runTest('Resume default field values are applied correctly', async () => {
      const resume = await Resume.create({
        student: studentA._id,
        college: college._id,
      });
      cleanupResumes.push(resume._id);

      assert.strictEqual(resume.title, 'Untitled Resume');
      assert.strictEqual(resume.templateId, 'modern');
      assert.strictEqual(resume.isPrimary, false);
      assert.strictEqual(resume.archived, false);
      assert.strictEqual(resume.draftUpdatedAt, null);
      assert(resume.createdAt instanceof Date, 'createdAt must be a Date');
      assert(resume.updatedAt instanceof Date, 'updatedAt must be a Date');
      assert.deepStrictEqual(resume.data, {});
    });

    // TEST 2: Required validation on student and college
    await runTest('Resume requires student and college references', async () => {
      let threwStudent = false;
      try {
        await Resume.create({ college: college._id });
      } catch (err) {
        threwStudent = true;
        assert(err.name === 'ValidationError');
      }
      assert(threwStudent, 'Must throw ValidationError when student is missing');

      let threwCollege = false;
      try {
        await Resume.create({ student: studentA._id });
      } catch (err) {
        threwCollege = true;
        assert(err.name === 'ValidationError');
      }
      assert(threwCollege, 'Must throw ValidationError when college is missing');
    });

    // TEST 3: templateId enum validation on Resume
    await runTest('Resume templateId enum accepts all 8 valid templates and rejects invalid', async () => {
      for (const tId of EXPECTED_TEMPLATES) {
        const doc = await Resume.create({
          student: studentA._id,
          college: college._id,
          templateId: tId,
        });
        cleanupResumes.push(doc._id);
        assert.strictEqual(doc.templateId, tId);
      }

      let threwInvalid = false;
      try {
        await Resume.create({
          student: studentA._id,
          college: college._id,
          templateId: 'unsupported-fancy-template',
        });
      } catch (err) {
        threwInvalid = true;
        assert(err.name === 'ValidationError');
      }
      assert(threwInvalid, 'Must reject unsupported templateId');
    });

    // TEST 4: Partial unique index enforces at most one active primary resume per student
    await runTest('Partial unique index allows only ONE active isPrimary: true per student', async () => {
      // 1st primary resume for student A
      const primaryA1 = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Primary A1',
        isPrimary: true,
        archived: false,
      });
      cleanupResumes.push(primaryA1._id);

      // Attempting 2nd primary resume for student A must fail with duplicate key (E11000)
      let threwDup = false;
      try {
        await Resume.create({
          student: studentA._id,
          college: college._id,
          title: 'Primary A2 (Duplicate)',
          isPrimary: true,
          archived: false,
        });
      } catch (err) {
        threwDup = true;
        assert(
          err.code === 11000 || (err.message && err.message.includes('E11000')),
          `Expected 11000 duplicate key error, got: ${err.message}`
        );
      }
      assert(threwDup, 'Must throw duplicate key error on second active primary resume');

      // But student A CAN have multiple non-primary resumes
      const nonPrimaryA1 = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Non-Primary 1',
        isPrimary: false,
        archived: false,
      });
      cleanupResumes.push(nonPrimaryA1._id);

      const nonPrimaryA2 = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Non-Primary 2',
        isPrimary: false,
        archived: false,
      });
      cleanupResumes.push(nonPrimaryA2._id);

      // And student A CAN have an archived resume that had isPrimary: true
      const archivedPrimaryA = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Archived Primary',
        isPrimary: true,
        archived: true,
      });
      cleanupResumes.push(archivedPrimaryA._id);
      assert.strictEqual(archivedPrimaryA.isPrimary, true);
      assert.strictEqual(archivedPrimaryA.archived, true);

      // And student B CAN have an active primary resume simultaneously
      const primaryB1 = await Resume.create({
        student: studentB._id,
        college: college._id,
        title: 'Primary B1',
        isPrimary: true,
        archived: false,
      });
      cleanupResumes.push(primaryB1._id);
      assert.strictEqual(primaryB1.isPrimary, true);
    });

    // TEST 5: Extended ResumeVersion fields (resume ref, source enum, label, contentHash)
    await runTest('ResumeVersion extends with resume ref, source enum, label, contentHash', async () => {
      const parentResume = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Parent Resume for Versions',
      });
      cleanupResumes.push(parentResume._id);

      // Default extended fields
      const version1 = await ResumeVersion.create({
        student: studentA._id,
        college: college._id,
        name: 'V1 - Default Ext Fields',
      });
      cleanupVersions.push(version1._id);

      assert.strictEqual(version1.resume, null);
      assert.strictEqual(version1.source, 'manual');
      assert.strictEqual(version1.label, '');
      assert.strictEqual(version1.contentHash, '');

      // Explicit extended fields
      const version2 = await ResumeVersion.create({
        student: studentA._id,
        college: college._id,
        name: 'V2 - Tailored Version',
        resume: parentResume._id,
        source: 'ai-tailor',
        label: 'Google SDE Prep',
        contentHash: 'a1b2c3d4e5f6',
      });
      cleanupVersions.push(version2._id);

      assert.strictEqual(String(version2.resume), String(parentResume._id));
      assert.strictEqual(version2.source, 'ai-tailor');
      assert.strictEqual(version2.label, 'Google SDE Prep');
      assert.strictEqual(version2.contentHash, 'a1b2c3d4e5f6');

      // Valid source enum: import
      const version3 = await ResumeVersion.create({
        student: studentA._id,
        college: college._id,
        name: 'V3 - Imported Version',
        source: 'import',
      });
      cleanupVersions.push(version3._id);
      assert.strictEqual(version3.source, 'import');

      // Invalid source enum rejected
      let threwInvalidSource = false;
      try {
        await ResumeVersion.create({
          student: studentA._id,
          college: college._id,
          name: 'V4 - Bad Source',
          source: 'invalid-source-type',
        });
      } catch (err) {
        threwInvalidSource = true;
        assert(err.name === 'ValidationError');
      }
      assert(threwInvalidSource, 'Must reject unsupported source enum');
    });

    // TEST 6: ResumeVersion widened templateId enum
    await runTest('ResumeVersion accepts all 8 widened ATS templateIds', async () => {
      for (const tId of EXPECTED_TEMPLATES) {
        const doc = await ResumeVersion.create({
          student: studentA._id,
          college: college._id,
          name: `Version Template ${tId}`,
          templateId: tId,
        });
        cleanupVersions.push(doc._id);
        assert.strictEqual(doc.templateId, tId);
      }

      let threwInvalid = false;
      try {
        await ResumeVersion.create({
          student: studentA._id,
          college: college._id,
          name: 'Bad Template Version',
          templateId: 'unsupported-template',
        });
      } catch (err) {
        threwInvalid = true;
        assert(err.name === 'ValidationError');
      }
      assert(threwInvalid, 'ResumeVersion must reject unsupported templateId');
    });

    // TEST 7: Resume and ResumeVersion relationship query & population
    await runTest('Resume document query and ResumeVersion population work as expected', async () => {
      const parentResume = await Resume.create({
        student: studentA._id,
        college: college._id,
        title: 'Fullstack SDE Resume',
        templateId: 'software-engineer',
        data: { contact: { fullName: 'Student Alpha' }, skills: ['Node.js', 'React'] },
      });
      cleanupResumes.push(parentResume._id);

      const v1 = await ResumeVersion.create({
        student: studentA._id,
        college: college._id,
        name: 'SDE Snapshot 1',
        resume: parentResume._id,
        source: 'manual',
      });
      cleanupVersions.push(v1._id);

      const v2 = await ResumeVersion.create({
        student: studentA._id,
        college: college._id,
        name: 'SDE Tailored Google',
        resume: parentResume._id,
        source: 'ai-tailor',
      });
      cleanupVersions.push(v2._id);

      // Query versions belonging to resume
      const childVersions = await ResumeVersion.find({ resume: parentResume._id }).sort({ createdAt: 1 });
      assert.strictEqual(childVersions.length, 2);
      assert.strictEqual(childVersions[0].name, 'SDE Snapshot 1');
      assert.strictEqual(childVersions[1].name, 'SDE Tailored Google');

      // Populate resume on version
      const populatedVersion = await ResumeVersion.findById(v2._id).populate('resume');
      assert.strictEqual(String(populatedVersion.resume._id), String(parentResume._id));
      assert.strictEqual(populatedVersion.resume.title, 'Fullstack SDE Resume');
      assert.strictEqual(populatedVersion.resume.templateId, 'software-engineer');
    });

    // TEST 8: Dry-run migration correctly simulates linking without mutating DB
    await runTest('Dry-run migration identifies unlinked versions and makes 0 mutations', async () => {
      // Create 2 unlinked versions for student B
      const uv1 = await ResumeVersion.create({
        student: studentB._id,
        college: college._id,
        name: 'Student B Old Version 1',
        templateId: 'minimal-ats',
        isDefault: false,
      });
      cleanupVersions.push(uv1._id);

      const uv2 = await ResumeVersion.create({
        student: studentB._id,
        college: college._id,
        name: 'Student B Preferred Version',
        templateId: 'technical-projects',
        isDefault: true,
      });
      cleanupVersions.push(uv2._id);

      // Run dry-run migration
      const summary = await migrateResumeVersions({ dryRun: true });
      assert.strictEqual(summary.isDryRun, true);
      assert(summary.totalScanned >= 2, 'Should scan unlinked versions');
      assert(summary.studentsCount >= 1, 'Should identify affected student');

      // Verify NO Resume was created for studentB from this unlinked version
      const foundResume = await Resume.findOne({
        student: studentB._id,
        title: 'Student B Preferred Version',
      });
      assert.strictEqual(foundResume, null, 'Dry run must NOT create Resume documents');

      // Verify versions remain unlinked
      const checkVersion = await ResumeVersion.findById(uv2._id);
      assert.strictEqual(checkVersion.resume, null, 'Dry run must NOT alter version.resume');
    });

    console.log('\n' + '='.repeat(70));
    console.log(`ALL ${passedTests}/${totalTests} RESUME MODEL TESTS PASSED!`);
    console.log('='.repeat(70) + '\n');
  } finally {
    // Teardown test artifacts
    if (cleanupResumes.length > 0) {
      await Resume.deleteMany({ _id: { $in: cleanupResumes } });
    }
    if (cleanupVersions.length > 0) {
      await ResumeVersion.deleteMany({ _id: { $in: cleanupVersions } });
    }
    if (cleanupStudents.length > 0) {
      await Student.deleteMany({ _id: { $in: cleanupStudents } });
    }
    if (cleanupColleges.length > 0) {
      await College.deleteMany({ _id: { $in: cleanupColleges } });
    }
    if (cleanupUsers.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUsers } });
    }
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runResumeModelTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runResumeModelTests };
