const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri, assertTestDatabase } = require('./testHelper');

const {
  User,
  Student,
  College,
  Company,
  Drive,
  JobRequirement,
  DriveRequest,
} = require('../models');

async function runSafetyAuditFixesTest() {
  console.log('--- 1. Connecting to MongoDB Test Database ---');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);
  console.log('✓ Connected safely to test DB:', mongoose.connection.name);

  // Ensure unique index is built in test DB
  await Drive.init();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/job-requirements', require('../routes/jobRequirementRoutes'));
  app.use('/api/drive-requests', require('../routes/driveRequestRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));

  const PORT = 5135;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  REGRESSION SUITE: DRIVE VISIBILITY & CONCURRENCY    ');
    console.log('======================================================\n');

    const runId = Date.now();

    // Clean up previous runs
    await Company.deleteMany({ name: { $regex: /^SafetyFix Company/ } });
    await College.deleteMany({ code: { $regex: /^SFC_/ } });
    await User.deleteMany({ email: { $regex: /@safetyfix\.(com|edu)$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^SF_/ } });

    // Seed test entities
    const company = await Company.create({
      name: `SafetyFix Company ${runId}`,
      industry: 'Software',
      verified: true,
    });

    const college = await College.create({
      name: `SafetyFix College ${runId}`,
      code: `SFC_${runId % 10000}`,
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
      verified: true,
    });

    const recruiterUser = await User.create({
      name: 'Safety Recruiter',
      email: `rec_${runId}@safetyfix.com`,
      password: 'Password123!',
      role: 'recruiter',
      company: company._id,
      isApproved: true,
    });

    const tpoUser = await User.create({
      name: 'Safety TPO',
      email: `tpo_${runId}@safetyfix.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: college._id,
      isApproved: true,
    });

    const studentUser = await User.create({
      name: 'Safety Student',
      email: `stud_${runId}@safetyfix.edu`,
      password: 'Password123!',
      role: 'student',
      college: college._id,
      isApproved: true,
    });

    const studentDoc = await Student.create({
      user: studentUser._id,
      college: college._id,
      enrollmentNo: `SF_${runId % 100000}`,
      department: 'CSE',
      branch: 'CSE',
      batchYear: 2026,
      degree: 'B.Tech',
      cgpa: 9.0,
      backlogs: 0,
      phone: '9876543210',
      skills: ['Node.js', 'React'],
    });

    const tokenFor = (user) => {
      const token = jwt.sign(
        { id: user._id, role: user.role, college: user.college, company: user.company },
        process.env.JWT_SECRET || 'testsecret',
        { expiresIn: '1h' }
      );
      return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    };

    const headersRec = tokenFor(recruiterUser);
    const headersTpo = tokenFor(tpoUser);
    const headersStudent = tokenFor(studentUser);

    console.log('✓ Seeded Company, College, Recruiter, TPO, Student fixtures');

    // =========================================================================
    // ISSUE 1: Exact Student Drive Visibility Matrix
    // =========================================================================
    console.log('\n--- ISSUE 1: Testing 5 Drive Visibility Records Separately ---');

    const futureDeadline = new Date(Date.now() + 86400000);
    const pastDeadline = new Date(Date.now() - 86400000);
    const driveDate = new Date(Date.now() + 2 * 86400000);

    // Record 1: isPublished = false, status = open (Explicitly unpublished draft)
    const rec1 = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Record 1: Unpublished Draft Drive',
      packageLpa: 10,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: futureDeadline,
      driveDate,
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
      isPublished: false,
    });

    // Record 2: isPublished = true, status = open (Explicitly published drive)
    const rec2 = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Record 2: Explicitly Published Drive',
      packageLpa: 12,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: futureDeadline,
      driveDate,
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
      isPublished: true,
      publishedAt: new Date(),
    });

    // Record 3: isPublished = undefined (Legacy record on disk), status = open
    const rec3 = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Record 3: Historical Legacy Drive (undefined on disk)',
      packageLpa: 14,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: futureDeadline,
      driveDate,
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
    });
    // Remove isPublished at MongoDB storage engine level to simulate real pre-migration records
    await Drive.collection.updateOne({ _id: rec3._id }, { $unset: { isPublished: '' } });

    // Verify raw database state of Record 3
    const rawRec3 = await Drive.collection.findOne({ _id: rec3._id });
    assert.strictEqual(rawRec3.isPublished, undefined, 'Record 3 must literally have undefined isPublished on disk');

    // Record 4: status = closed, isPublished = true (Closed drive)
    const rec4 = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Record 4: Closed Drive Past Deadline',
      packageLpa: 16,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: pastDeadline,
      driveDate,
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'closed',
      isPublished: true,
      applicationsClosed: true,
    });

    // Record 5: status = open, isPublished = false (Open but unpublished drive)
    const rec5 = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Record 5: Open Status But Unpublished',
      packageLpa: 18,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: futureDeadline,
      driveDate,
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
      isPublished: false,
    });

    console.log('Seeded 5 test records:');
    console.log(`  Record 1 (isPublished=false, status=open): ${rec1._id}`);
    console.log(`  Record 2 (isPublished=true,  status=open): ${rec2._id}`);
    console.log(`  Record 3 (isPublished=undef, status=open): ${rec3._id}`);
    console.log(`  Record 4 (isPublished=true,  status=closed): ${rec4._id}`);
    console.log(`  Record 5 (isPublished=false, status=open): ${rec5._id}`);

    // Call student endpoint: GET /api/drives/eligible
    const eligibleRes = await fetch(`${BASE_URL}/drives/eligible`, { headers: headersStudent });
    assert.strictEqual(eligibleRes.status, 200);
    const eligibleJson = await eligibleRes.json();
    const eligibleItems = eligibleJson.data || eligibleJson.drives || [];
    const eligibleIds = eligibleItems.map((d) => d._id.toString());

    console.log('\n--- Actual GET /api/drives/eligible Response Items ---');
    for (const item of eligibleItems) {
      console.log(`  -> ID: ${item._id} | Role: ${item.role} | isPublished: ${item.isPublished} | status: ${item.status}`);
    }

    // Assertions for eligible-drives
    assert.ok(
      !eligibleIds.includes(rec1._id.toString()),
      'Record 1 (isPublished=false) must NEVER appear in eligible drives'
    );
    assert.ok(
      eligibleIds.includes(rec2._id.toString()),
      'Record 2 (isPublished=true) MUST appear in eligible drives'
    );
    assert.ok(
      eligibleIds.includes(rec3._id.toString()),
      'Record 3 (legacy undefined on disk) MUST appear under backward-compatible policy'
    );
    assert.ok(
      !eligibleIds.includes(rec4._id.toString()),
      'Record 4 (closed drive) must NEVER appear in eligible drives'
    );
    assert.ok(
      !eligibleIds.includes(rec5._id.toString()),
      'Record 5 (open, isPublished=false) must NEVER appear in eligible drives'
    );

    // Assert that the returned legacy drive has isPublished: true in the API payload
    const returnedLegacyDrive = eligibleItems.find((d) => d._id.toString() === rec3._id.toString());
    assert.strictEqual(
      returnedLegacyDrive.isPublished,
      true,
      'Legacy record in student API must be serialized with isPublished: true, never false'
    );
    console.log('✓ ISSUE 1 (eligible-drives) passed: Unpublished & closed drives hidden; published & legacy drives visible with isPublished: true');

    // Also verify GET /api/drives for students
    const studentDrivesRes = await fetch(`${BASE_URL}/drives`, { headers: headersStudent });
    assert.strictEqual(studentDrivesRes.status, 200);
    const studentDrivesJson = await studentDrivesRes.json();
    const studentDriveItems = studentDrivesJson.data || studentDrivesJson.drives || [];
    const studentDriveIds = studentDriveItems.map((d) => d._id.toString());

    assert.ok(!studentDriveIds.includes(rec1._id.toString()), 'Record 1 must not appear in /api/drives for student');
    assert.ok(studentDriveIds.includes(rec2._id.toString()), 'Record 2 must appear in /api/drives for student');
    assert.ok(studentDriveIds.includes(rec3._id.toString()), 'Record 3 must appear in /api/drives for student');
    assert.ok(!studentDriveIds.includes(rec4._id.toString()), 'Record 4 must not appear in /api/drives for student (closed)');
    assert.ok(!studentDriveIds.includes(rec5._id.toString()), 'Record 5 must not appear in /api/drives for student (unpublished)');
    console.log('✓ ISSUE 1 (/api/drives student scoping) passed completely');

    // =========================================================================
    // ISSUE 2: Atomic and Concurrent Drive Finalization (10 simultaneous requests)
    // =========================================================================
    console.log('\n--- ISSUE 2: Testing 10 Simultaneous Finalize Requests ---');

    const jobReq = await JobRequirement.create({
      company: company._id,
      title: 'Concurrency Architect 2026',
      description: 'Distributed systems engineer',
      packageLpa: 22.0,
      openings: 5,
      batchYear: 2026,
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      location: 'Hyderabad',
      selectionRounds: ['Online Assessment', 'System Design'],
      status: 'published',
    });

    const proposedDate = new Date(Date.now() + 5 * 86400000);

    const driveReq = await DriveRequest.create({
      jobRequirement: jobReq._id,
      company: company._id,
      college: college._id,
      title: 'Concurrency Architect Drive',
      status: 'recruiter_confirmed', // already confirmed, ready for TPO publication
      proposedDates: [proposedDate],
      confirmedDate: proposedDate,
    });

    const finalizePayload = {
      finalDriveDate: proposedDate.toISOString(),
      venueOrMeetingLink: 'Auditorium Cluster A',
      lastDateToApply: new Date(Date.now() + 3 * 86400000).toISOString(),
      minCgpa: 7.5,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      note: 'Finalizing via simultaneous requests',
    };

    console.log(`Firing 10 simultaneous finalize requests for DriveRequest ${driveReq._id}...`);

    const concurrentPromises = Array.from({ length: 10 }, (_, index) =>
      fetch(`${BASE_URL}/drive-requests/${driveReq._id}/finalize`, {
        method: 'PUT',
        headers: headersTpo,
        body: JSON.stringify({ ...finalizePayload, note: `Concurrent attempt #${index + 1}` }),
      }).then(async (res) => ({
        status: res.status,
        data: await res.json(),
        index: index + 1,
      }))
    );

    const results = await Promise.all(concurrentPromises);

    console.log('Results from 10 simultaneous finalize requests:');
    const returnedDriveIds = new Set();
    for (const r of results) {
      console.log(`  Request #${r.index}: HTTP ${r.status} | Drive ID: ${r.data?.drive?._id}`);
      assert.strictEqual(r.status, 200, `Request #${r.index} must succeed with 200 OK`);
      assert.ok(r.data.drive?._id, `Request #${r.index} must return a valid drive object`);
      returnedDriveIds.add(r.data.drive._id.toString());
    }

    assert.strictEqual(
      returnedDriveIds.size,
      1,
      `Expected exactly 1 distinct Drive ID across all 10 responses, got: ${Array.from(returnedDriveIds)}`
    );

    const createdDriveId = Array.from(returnedDriveIds)[0];

    // Check database count
    const totalDrivesForRequest = await Drive.countDocuments({ driveRequest: driveReq._id });
    console.log(`Total Drives in DB for driveRequest ${driveReq._id}: ${totalDrivesForRequest}`);
    assert.strictEqual(
      totalDrivesForRequest,
      1,
      'CRITICAL: Exactly ONE Drive record must exist in MongoDB for this DriveRequest!'
    );

    // Verify DriveRequest document points to the same Drive
    const updatedDriveReq = await DriveRequest.findById(driveReq._id);
    assert.strictEqual(updatedDriveReq.status, 'scheduled');
    assert.strictEqual(updatedDriveReq.drive.toString(), createdDriveId);
    console.log('✓ ISSUE 2 passed: All 10 simultaneous requests returned identical Drive ID, exactly 1 Drive created, atomic unique index holds');

    // =========================================================================
    // ISSUE 3: Direct TPO Drive Creation vs Recruiter Mutual Approval
    // =========================================================================
    console.log('\n--- ISSUE 3: Direct TPO Drive Creation vs Recruiter Mutual Approval ---');

    // Attempt 1: TPO attempts to directly create a drive linking to a recruiter JobRequirement
    const bypassJobReqRes = await fetch(`${BASE_URL}/drives`, {
      method: 'POST',
      headers: headersTpo,
      body: JSON.stringify({
        company: company._id,
        role: 'Hijacked Role',
        packageLpa: 15,
        location: 'Bangalore',
        allowedBranches: ['CSE'],
        lastDateToApply: futureDeadline.toISOString(),
        driveDate: driveDate.toISOString(),
        jobRequirement: jobReq._id.toString(), // FORBIDDEN BYPASS
      }),
    });
    assert.strictEqual(bypassJobReqRes.status, 400, 'Direct creation with jobRequirement must be rejected with 400');
    const bypassJobReqJson = await bypassJobReqRes.json();
    assert.ok(
      bypassJobReqJson.message.includes('Direct drive creation cannot be linked'),
      `Expected bypass rejection message, got: ${bypassJobReqJson.message}`
    );
    console.log('✓ Bypass attempt 1 blocked: Direct creation with jobRequirement rejected with 400');

    // Attempt 2: TPO attempts to directly create a drive linking to a recruiter DriveRequest
    const bypassDriveReqRes = await fetch(`${BASE_URL}/drives`, {
      method: 'POST',
      headers: headersTpo,
      body: JSON.stringify({
        company: company._id,
        role: 'Hijacked Role 2',
        packageLpa: 15,
        location: 'Bangalore',
        allowedBranches: ['CSE'],
        lastDateToApply: futureDeadline.toISOString(),
        driveDate: driveDate.toISOString(),
        driveRequest: driveReq._id.toString(), // FORBIDDEN BYPASS
      }),
    });
    assert.strictEqual(bypassDriveReqRes.status, 400, 'Direct creation with driveRequest must be rejected with 400');
    console.log('✓ Bypass attempt 2 blocked: Direct creation with driveRequest rejected with 400');

    // Attempt 3: Legitimate independent college-created drive (no jobRequirement, no driveRequest)
    const legitDirectDriveRes = await fetch(`${BASE_URL}/drives`, {
      method: 'POST',
      headers: headersTpo,
      body: JSON.stringify({
        company: company._id,
        role: 'Independent Campus Placement Role',
        packageLpa: 11,
        location: 'Campus Ground',
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: futureDeadline.toISOString(),
        driveDate: driveDate.toISOString(),
      }),
    });
    assert.strictEqual(legitDirectDriveRes.status, 201, 'Legitimate independent college drive creation must succeed');
    const legitDirectDriveJson = await legitDirectDriveRes.json();
    const directDrive = legitDirectDriveJson.drive;
    assert.strictEqual(directDrive.jobRequirement, null, 'Independent drive must have jobRequirement: null');
    assert.strictEqual(directDrive.driveRequest, null, 'Independent drive must have driveRequest: null');
    assert.strictEqual(directDrive.college.toString(), college._id.toString(), 'Independent drive owned by creating college');
    console.log('✓ Legitimate independent direct drive created successfully with jobRequirement:null and driveRequest:null');
    console.log('✓ ISSUE 3 passed: Mutual approval cannot be bypassed; legitimate college drives remain fully functional');

    console.log('\n======================================================');
    console.log('  ALL 3 ISSUE AUDIT & REGRESSION TESTS PASSED!        ');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('✓ Disconnected from test database');
  }
}

runSafetyAuditFixesTest()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test Failed:', err);
    process.exit(1);
  });
