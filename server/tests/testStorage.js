process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { getTestDbUri } = require('./testHelper');
const {
  getStorageDriver,
  getGridFSBucket,
  isValidPdf,
  saveResumeFile,
  deleteResumeFile,
  getResumeStream,
} = require('../utils/storage');
const { migrateResumesToGridfs } = require('../utils/migrateResumesToGridfs');
const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
} = require('../models');

// Valid PDF buffer starting with %PDF-1.4
const DUMMY_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<\n/Title (Test Resume)\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF'
);

const DUMMY_PDF_V2_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<<\n/Title (Test Resume Version 2)\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF'
);

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function generateAuthToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'testsecret_at_least_32_characters_long_for_test', {
    expiresIn: '1h',
  });
}

async function runStorageTests() {
  console.log('======================================================');
  console.log('      TEST: PERSISTENT STORAGE & GRIDFS TESTS         ');
  console.log('======================================================\n');

  console.log('1. Connecting to test database...');
  await mongoose.connect(getTestDbUri());
  console.log('✓ Connected to test database\n');

  // Set JWT_SECRET if unset in test
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'testsecret_at_least_32_characters_long_for_test';
  }

  try {
    // ==========================================
    // PART A: Direct storage.js driver tests
    // ==========================================
    console.log('2. Testing storage.js driver validation and basic operations...');
    assert(isValidPdf({ buffer: DUMMY_PDF_BUFFER }), 'Valid PDF buffer should pass validation');
    assert(!isValidPdf({ buffer: Buffer.from('NOT A PDF FILE') }), 'Invalid buffer should fail validation');

    // 2.1 Local Storage Driver
    process.env.STORAGE_DRIVER = 'local';
    assert.strictEqual(getStorageDriver(), 'local');

    const localSaved = await saveResumeFile({
      buffer: DUMMY_PDF_BUFFER,
      originalname: 'candidate_resume.pdf',
    });
    assert(localSaved.startsWith('/uploads/'), 'Local driver should return path starting with /uploads/');
    const localDiskPath = path.join(__dirname, '..', localSaved);
    assert(fs.existsSync(localDiskPath), 'File must exist on disk in uploads/');

    const localStreamObj = await getResumeStream(localSaved);
    const localDownloadedBuffer = await streamToBuffer(localStreamObj.stream);
    assert.deepStrictEqual(localDownloadedBuffer, DUMMY_PDF_BUFFER, 'Downloaded local buffer must match original');

    await deleteResumeFile(localSaved);
    assert(!fs.existsSync(localDiskPath), 'deleteResumeFile must remove file from disk');
    console.log('✓ Local storage driver: save, read stream, and delete verified');

    // 2.2 GridFS Storage Driver
    process.env.STORAGE_DRIVER = 'gridfs';
    assert.strictEqual(getStorageDriver(), 'gridfs');

    const gridfsSaved = await saveResumeFile({
      buffer: DUMMY_PDF_BUFFER,
      originalname: 'candidate_gridfs.pdf',
    });
    assert(gridfsSaved.startsWith('gridfs:'), 'GridFS driver should return path starting with gridfs:');
    const fileId = gridfsSaved.replace('gridfs:', '');
    const bucket = getGridFSBucket();
    const foundFiles = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    assert.strictEqual(foundFiles.length, 1, 'File must exist in GridFS resumes.files collection');

    const gridfsStreamObj = await getResumeStream(gridfsSaved);
    const gridfsDownloadedBuffer = await streamToBuffer(gridfsStreamObj.stream);
    assert.deepStrictEqual(gridfsDownloadedBuffer, DUMMY_PDF_BUFFER, 'Downloaded GridFS buffer must match original');

    await deleteResumeFile(gridfsSaved);
    const remainingFiles = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    assert.strictEqual(remainingFiles.length, 0, 'deleteResumeFile must remove file from GridFS');
    console.log('✓ GridFS storage driver: save, read stream, and delete verified\n');

    // ==========================================
    // PART B: Migration script idempotency
    // ==========================================
    console.log('3. Testing migrateResumesToGridfs.js migration & idempotency...');
    // Create temporary local file
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const migLocalFilename = `resume-mig-test-${Date.now()}.pdf`;
    const migLocalPath = path.join(uploadsDir, migLocalFilename);
    fs.writeFileSync(migLocalPath, DUMMY_PDF_BUFFER);

    // Create college & student for migration test
    const migCollege = await College.create({
      name: `Migration Test College ${Date.now()}`,
      code: `MIG_${Date.now()}`,
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });
    const migUser = await User.create({
      name: 'Migration Student',
      email: `mig.student.${Date.now()}@example.com`,
      password: 'Password@123',
      role: 'student',
      college: migCollege._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const migStudent = await Student.create({
      user: migUser._id,
      college: migCollege._id,
      enrollmentNo: `ENR_MIG_${Date.now()}`,
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.0,
      phone: '9876543210',
      resumeUrl: `/uploads/${migLocalFilename}`,
    });

    // Run migration
    const migResult1 = await migrateResumesToGridfs();
    assert(migResult1.migrated >= 1, 'Should have migrated at least 1 resume');
    assert.strictEqual(migResult1.failed, 0, 'Migration should have 0 failures');

    const updatedMigStudent = await Student.findById(migStudent._id);
    assert(updatedMigStudent.resumeUrl.startsWith('gridfs:'), 'Student resumeUrl should now be gridfs:<id>');

    // Verify stream works for newly migrated file
    const migStreamObj = await getResumeStream(updatedMigStudent.resumeUrl);
    const migBuffer = await streamToBuffer(migStreamObj.stream);
    assert.deepStrictEqual(migBuffer, DUMMY_PDF_BUFFER, 'Migrated GridFS buffer must match original');

    // Test Idempotency: Run migration a second time
    const migResult2 = await migrateResumesToGridfs();
    assert.strictEqual(migResult2.migrated, 0, 'Second migration run should migrate 0 files');
    assert.strictEqual(migResult2.failed, 0, 'Second run should have 0 failures');
    console.log('✓ Migration script safely migrated local resume to GridFS and is completely idempotent\n');

    // Clean up migration test records
    await deleteResumeFile(updatedMigStudent.resumeUrl);
    if (fs.existsSync(migLocalPath)) fs.unlinkSync(migLocalPath);
    await Student.findByIdAndDelete(migStudent._id);
    await User.findByIdAndDelete(migUser._id);
    await College.findByIdAndDelete(migCollege._id);

    // ==========================================
    // PART C: Hermetic RBAC & Stream API Tests
    // ==========================================
    console.log('4. Setting up fixtures for RBAC & streaming endpoint tests...');
    const app = express();
    app.use(express.json());
    app.use('/api/students', require('../routes/studentRoutes'));

    const serverPort = 5095;
    const testServer = app.listen(serverPort);
    const BASE_URL = `http://127.0.0.1:${serverPort}/api/students`;

    // Fixtures
    const collegeA = await College.create({
      name: `College Alpha ${Date.now()}`,
      code: `ALPH_${Date.now()}`,
      city: 'Delhi',
      state: 'Delhi',
      status: 'approved',
    });
    const collegeB = await College.create({
      name: `College Beta ${Date.now()}`,
      code: `BETA_${Date.now()}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });

    const userStudent1 = await User.create({
      name: 'Student One',
      email: `student1.${Date.now()}@alpha.edu`,
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const student1 = await Student.create({
      user: userStudent1._id,
      college: collegeA._id,
      enrollmentNo: `S1_${Date.now()}`,
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      phone: '9876543210',
    });

    const userStudent2 = await User.create({
      name: 'Student Two',
      email: `student2.${Date.now()}@alpha.edu`,
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const student2 = await Student.create({
      user: userStudent2._id,
      college: collegeA._id,
      enrollmentNo: `S2_${Date.now()}`,
      branch: 'IT',
      batchYear: 2026,
      cgpa: 8.2,
      phone: '9876543211',
    });

    const userTpoA = await User.create({
      name: 'TPO Alpha',
      email: `tpo.alpha.${Date.now()}@alpha.edu`,
      password: 'Password@123',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const userTpoB = await User.create({
      name: 'TPO Beta',
      email: `tpo.beta.${Date.now()}@beta.edu`,
      password: 'Password@123',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const companyA = await Company.create({
      name: `Corp Alpha ${Date.now()}`,
      industry: 'IT Services',
      verified: true,
    });
    const userRecruiter1 = await User.create({
      name: 'Recruiter Alpha',
      email: `rec.alpha.${Date.now()}@corp.com`,
      password: 'Password@123',
      role: 'recruiter',
      company: companyA._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const companyB = await Company.create({
      name: `Corp Beta ${Date.now()}`,
      industry: 'IT Services',
      verified: true,
    });
    const userRecruiter2 = await User.create({
      name: 'Recruiter Beta',
      email: `rec.beta.${Date.now()}@corp.com`,
      password: 'Password@123',
      role: 'recruiter',
      company: companyB._id,
      isApproved: true,
      isEmailVerified: true,
    });

    const userSuperadmin = await User.create({
      name: 'Super Admin',
      email: `super.${Date.now()}@portal.com`,
      password: 'Password@123',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });

    // Drive for Company A at College A, and Student 1 has applied
    const driveA = await Drive.create({
      college: collegeA._id,
      company: companyA._id,
      role: 'Software Engineer',
      packageLpa: 12,
      location: 'Bengaluru',
      minCgpa: 7.0,
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 86400000 * 5),
      driveDate: new Date(Date.now() + 86400000 * 10),
      status: 'open',
    });

    const appStudent1 = await Application.create({
      student: student1._id,
      drive: driveA._id,
      status: 'applied',
    });

    const tokenStudent1 = generateAuthToken(userStudent1);
    const tokenStudent2 = generateAuthToken(userStudent2);
    const tokenTpoA = generateAuthToken(userTpoA);
    const tokenTpoB = generateAuthToken(userTpoB);
    const tokenRecruiter1 = generateAuthToken(userRecruiter1);
    const tokenRecruiter2 = generateAuthToken(userRecruiter2);
    const tokenSuperadmin = generateAuthToken(userSuperadmin);

    try {
      // ----------------------------------------
      // TEST WITH LOCAL STORAGE DRIVER
      // ----------------------------------------
      console.log('5. Testing RBAC with STORAGE_DRIVER=local...');
      process.env.STORAGE_DRIVER = 'local';

      const localResumeUrl = await saveResumeFile({
        buffer: DUMMY_PDF_BUFFER,
        originalname: 's1_resume.pdf',
      });
      student1.resumeUrl = localResumeUrl;
      await student1.save();

      // Test 1: Unauthenticated -> 401
      const resUnauth = await fetch(`${BASE_URL}/${student1._id}/resume`);
      assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request should return 401');

      // Test 2: Owner Student -> 200
      const resOwner = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenStudent1}` },
      });
      assert.strictEqual(resOwner.status, 200, 'Student owner should download resume (200)');
      assert(resOwner.headers.get('content-type').includes('application/pdf'), 'Content-type must be application/pdf');
      const downloadedOwner = Buffer.from(await resOwner.arrayBuffer());
      assert.deepStrictEqual(downloadedOwner, DUMMY_PDF_BUFFER);

      // Test 3: Other Student -> 403
      const resOtherStudent = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenStudent2}` },
      });
      assert.strictEqual(resOtherStudent.status, 403, 'Other student must be forbidden (403)');

      // Test 4: Same College TPO -> 200
      const resSameTpo = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenTpoA}` },
      });
      assert.strictEqual(resSameTpo.status, 200, 'Same college TPO should access resume (200)');

      // Test 5: Different College TPO -> 403
      const resDiffTpo = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenTpoB}` },
      });
      assert.strictEqual(resDiffTpo.status, 403, 'Different college TPO must be forbidden (403)');

      // Test 6: Recruiter with candidate application -> 200
      const resRec1 = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(resRec1.status, 200, 'Recruiter with student application should access resume (200)');

      // Test 7: Recruiter without candidate application -> 403
      const resRec2 = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenRecruiter2}` },
      });
      assert.strictEqual(resRec2.status, 403, 'Recruiter without application must be forbidden (403)');

      // Test 8: Superadmin -> 200
      const resSuper = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenSuperadmin}` },
      });
      assert.strictEqual(resSuper.status, 200, 'Superadmin should access resume (200)');

      console.log('✓ All 8 RBAC checks passed with STORAGE_DRIVER=local');

      // ----------------------------------------
      // TEST WITH GRIDFS STORAGE DRIVER & FILE REPLACEMENT
      // ----------------------------------------
      console.log('6. Testing RBAC & file replacement with STORAGE_DRIVER=gridfs...');
      process.env.STORAGE_DRIVER = 'gridfs';

      // Save new file to GridFS
      const oldLocalDiskPath = path.join(__dirname, '..', localResumeUrl);
      assert(fs.existsSync(oldLocalDiskPath), 'Old local file should still exist prior to replacement');

      // Delete old file via deleteResumeFile (simulating student re-upload behavior)
      await deleteResumeFile(student1.resumeUrl);
      assert(!fs.existsSync(oldLocalDiskPath), 'Old local file must be deleted upon replacement');

      const gridfsResumeUrl = await saveResumeFile({
        buffer: DUMMY_PDF_V2_BUFFER,
        originalname: 's1_resume_v2.pdf',
      });
      student1.resumeUrl = gridfsResumeUrl;
      await student1.save();

      // Verify Student 1 can stream new GridFS version
      const resGridfsOwner = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenStudent1}` },
      });
      assert.strictEqual(resGridfsOwner.status, 200, 'Owner can download GridFS resume (200)');
      const gridfsDownloaded = Buffer.from(await resGridfsOwner.arrayBuffer());
      assert.deepStrictEqual(gridfsDownloaded, DUMMY_PDF_V2_BUFFER, 'GridFS streamed bytes must match version 2');

      // Verify RBAC enforcement on GridFS stream
      const resGridfsOther = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenStudent2}` },
      });
      assert.strictEqual(resGridfsOther.status, 403, 'Other student forbidden on GridFS stream (403)');

      const resGridfsTpo = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenTpoA}` },
      });
      assert.strictEqual(resGridfsTpo.status, 200, 'Same college TPO permitted on GridFS stream (200)');

      const resGridfsRec1 = await fetch(`${BASE_URL}/${student1._id}/resume`, {
        headers: { Authorization: `Bearer ${tokenRecruiter1}` },
      });
      assert.strictEqual(resGridfsRec1.status, 200, 'Recruiter permitted on GridFS stream (200)');

      // Verify replacement when switching GridFS to GridFS
      const oldGridfsId = student1.resumeUrl.replace('gridfs:', '');
      await deleteResumeFile(student1.resumeUrl);
      const gridfsFileCheck = await bucket.find({ _id: new mongoose.Types.ObjectId(oldGridfsId) }).toArray();
      assert.strictEqual(gridfsFileCheck.length, 0, 'Re-upload should delete previous GridFS document');

      console.log('✓ All RBAC checks and file replacement cleanups passed with STORAGE_DRIVER=gridfs\n');
    } finally {
      testServer.close();

      // Clean up fixtures
      await Application.deleteMany({ drive: driveA._id });
      await Drive.findByIdAndDelete(driveA._id);
      await Student.deleteMany({ _id: { $in: [student1._id, student2._id] } });
      await User.deleteMany({
        _id: {
          $in: [
            userStudent1._id,
            userStudent2._id,
            userTpoA._id,
            userTpoB._id,
            userRecruiter1._id,
            userRecruiter2._id,
            userSuperadmin._id,
          ],
        },
      });
      await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
      await College.deleteMany({ _id: { $in: [collegeA._id, collegeB._id] } });
    }

    console.log('======================================================');
    console.log('     ALL STORAGE & GRIDFS TESTS PASSED (100%)         ');
    console.log('======================================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  runStorageTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Storage test suite failed:', err);
      process.exit(1);
    });
}

module.exports = runStorageTests;
