/**
 * Regression Test Suite: Resume Retrieval & Soft-Delete Trash Integrity
 *
 * Validates:
 * 1. create -> list -> get-by-id roundtrip test.
 * 2. Old-style resume doc (no deleted field in DB) opens successfully with HTTP 200.
 * 3. Trashed resume returns clear HTTP 410 message & isDeleted flag.
 * 4. Restore from trash returns HTTP 200 and get-by-id succeeds again.
 * 5. Cross-student access is rejected with HTTP 403.
 * 6. Non-existent resume ID returns HTTP 404.
 * 7. Invalid ObjectId format returns HTTP 400.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const http = require('http');

async function runRegressionSuite() {
  console.log('======================================================================');
  console.log('REGRESSION TEST SUITE: RESUME RETRIEVAL & SOFT-DELETE INTEGRITY');
  console.log('======================================================================');

  process.env.PORT = '0';
  const app = require('../server');
  const { User, Student, College, Resume } = require('../models');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const disposableResumeIds = [];

  try {
    // 1. Authorize primary student
    const studentUser = await User.findOne({ email: 's91453604@gmail.com' });
    assert.ok(studentUser, 'Primary test student user must exist');
    const student = await Student.findOne({ user: studentUser._id });
    assert.ok(student, 'Student document must exist');

    const studentToken = jwt.sign(
      {
        id: studentUser._id.toString(),
        role: studentUser.role,
        college: (studentUser.college?._id || studentUser.college)?.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 2. Authorize secondary student (cross-student check)
    let otherStudentUser = await User.findOne({ email: { $ne: 's91453604@gmail.com' }, role: 'student' });
    let otherStudentToken = null;
    if (otherStudentUser) {
      otherStudentToken = jwt.sign(
        {
          id: otherStudentUser._id.toString(),
          role: otherStudentUser.role,
          college: (otherStudentUser.college?._id || otherStudentUser.college)?.toString(),
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 1: create -> list -> get-by-id roundtrip
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: create -> list -> get-by-id Roundtrip ---');
    const createRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Roundtrip Test Resume',
        templateId: 'software-engineer',
        isPrimary: false,
        data: {
          contact: { fullName: 'Test Candidate', email: 'test@candidate.com' },
          skills: [{ category: 'Programming Languages', items: ['TypeScript', 'Python'] }],
        },
      }),
    });
    assert.strictEqual(createRes.status, 201, 'Create resume must return HTTP 201');
    const createData = await createRes.json();
    assert.strictEqual(createData.success, true);
    const createdId = createData.resume._id;
    disposableResumeIds.push(createdId);
    console.log(`  ✓ Created resume: ${createdId}`);

    // Verify in list
    const listRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(listRes.status, 200, 'List resumes must return HTTP 200');
    const listData = await listRes.json();
    assert.ok(
      listData.resumes.some((r) => r._id === createdId),
      'Created resume must appear in active list'
    );
    console.log('  ✓ Resume confirmed present in Active list');

    // Fetch by ID
    const getRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(getRes.status, 200, 'Get by ID must return HTTP 200');
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.resume._id, createdId);
    assert.strictEqual(getData.resume.title, 'Roundtrip Test Resume');
    console.log('  ✓ Fetched resume by ID with complete document payload');

    // -------------------------------------------------------------------------
    // TEST 2: Old-style resume doc without deleted field opens successfully
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Old-Style Resume (No deleted Field) Retrieval ---');
    // Direct raw collection insert to bypass schema defaults and simulate pre-Trash legacy document
    const rawResume = await mongoose.connection.db.collection('resumes').insertOne({
      student: student._id,
      college: student.college,
      title: 'Legacy Pre-Trash Resume',
      templateId: 'classic',
      data: { summary: 'Legacy document created before soft-delete field existed' },
      isPrimary: false,
      archived: false,
      // Intentionally omitting `deleted` and `deletedAt`
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const legacyId = rawResume.insertedId.toString();
    disposableResumeIds.push(legacyId);

    const legacyGetRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${legacyId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(legacyGetRes.status, 200, 'Legacy resume must open successfully with HTTP 200');
    const legacyGetData = await legacyGetRes.json();
    assert.strictEqual(legacyGetData.success, true);
    assert.strictEqual(legacyGetData.resume.title, 'Legacy Pre-Trash Resume');
    console.log(`  ✓ Old-style resume without deleted field retrieved cleanly (HTTP 200)`);

    // -------------------------------------------------------------------------
    // TEST 3: Trashed resume returns clear 410 Gone message & isDeleted metadata
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Trashed Resume Returns HTTP 410 with Restore Metadata ---');
    const trashActionRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}/trash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(trashActionRes.status, 200, 'Moving resume to trash must return HTTP 200');

    // Try to get the trashed resume by ID
    const trashedGetRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(trashedGetRes.status, 410, 'Trashed resume must return HTTP 410 Gone');
    const trashedGetData = await trashedGetRes.json();
    assert.strictEqual(trashedGetData.success, false);
    assert.strictEqual(trashedGetData.isDeleted, true);
    assert.ok(
      trashedGetData.message.toLowerCase().includes('trash'),
      'Error message must clearly state the resume is in Trash'
    );
    console.log(`  ✓ Trashed resume correctly returned HTTP 410: "${trashedGetData.message}"`);

    // -------------------------------------------------------------------------
    // TEST 4: Restore from Trash brings resume back to accessible active state
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Restore from Trash Restores Retrieval Access ---');
    const restoreActionRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}/restore-trash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(restoreActionRes.status, 200, 'Restore from trash must return HTTP 200');

    const restoredGetRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(restoredGetRes.status, 200, 'Restored resume must open successfully with HTTP 200');
    const restoredGetData = await restoredGetRes.json();
    assert.strictEqual(restoredGetData.success, true);
    assert.strictEqual(restoredGetData.resume.deleted, false);
    console.log('  ✓ Restored resume immediately retrievable via GET by ID');

    // -------------------------------------------------------------------------
    // TEST 5: Cross-student access is rejected (403/404)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Cross-Student Access Rejection ---');
    if (otherStudentToken) {
      const crossRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${createdId}`, {
        headers: { Authorization: `Bearer ${otherStudentToken}` },
      });
      assert.ok(
        [403, 404].includes(crossRes.status),
        `Cross-student access must return HTTP 403 or 404 (received ${crossRes.status})`
      );
      const crossData = await crossRes.json();
      assert.strictEqual(crossData.success, false);
      console.log(`  ✓ Cross-student request rejected with HTTP ${crossRes.status}: "${crossData.message}"`);
    } else {
      console.log('  ℹ Skipped cross-student check: single student in DB');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Non-existent resume ID returns HTTP 404
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Non-Existent Resume ID Returns HTTP 404 ---');
    const fakeId = new mongoose.Types.ObjectId().toString();
    const notFoundRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${fakeId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(notFoundRes.status, 404, 'Non-existent ID must return HTTP 404');
    const notFoundData = await notFoundRes.json();
    assert.strictEqual(notFoundData.success, false);
    assert.strictEqual(notFoundData.message, 'Resume not found');
    console.log(`  ✓ Non-existent resume returns HTTP 404: "${notFoundData.message}"`);

    // -------------------------------------------------------------------------
    // TEST 7: Invalid ObjectId format returns HTTP 400
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Invalid ObjectId Format Returns HTTP 400 ---');
    const invalidRes = await fetch(`${baseUrl}/api/resume-studio/resumes/not-a-valid-id`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(invalidRes.status, 400, 'Invalid format must return HTTP 400');
    const invalidData = await invalidRes.json();
    assert.strictEqual(invalidData.success, false);
    console.log(`  ✓ Invalid ID format rejected with HTTP 400: "${invalidData.message}"`);

    console.log('\n======================================================================');
    console.log('ALL 7 RESUME RETRIEVAL & TRASH REGRESSION ASSERTIONS PASSED!');
    console.log('======================================================================');
  } finally {
    // Clean up disposable test documents
    for (const id of disposableResumeIds) {
      await mongoose.connection.db.collection('resumes').deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    server.close();
  }
}

runRegressionSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('REGRESSION TEST FAILED:', err);
    process.exit(1);
  });
