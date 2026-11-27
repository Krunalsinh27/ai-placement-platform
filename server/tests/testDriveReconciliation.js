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
  College,
  Company,
  Drive,
  JobRequirement,
  DriveRequest,
} = require('../models');
const { reconcileDriveRequests } = require('../services/driveReconciliationService');

async function runDriveReconciliationTests() {
  console.log('--- 1. Connecting to MongoDB Test Database ---');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);
  console.log('✓ Connected safely to test DB:', mongoose.connection.name);

  // Ensure Drive indexes are built
  await Drive.init();

  const app = express();
  app.use(express.json());
  app.use('/api/drive-requests', require('../routes/driveRequestRoutes'));

  const PORT = 5142;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  TEST SUITE: DRIVE REQUEST RECONCILIATION & RECOVERY ');
    console.log('======================================================\n');

    const runId = Date.now();

    // Cleanup previous test data
    await Company.deleteMany({ name: { $regex: /^Reconcile Company/ } });
    await College.deleteMany({ code: { $regex: /^REC_/ } });
    await User.deleteMany({ email: { $regex: /@reconcile\.(com|edu)$/ } });
    await DriveRequest.deleteMany({ 'timeline.note': { $regex: /Reconcile/ } });

    // Seed test entities
    const company = await Company.create({
      name: `Reconcile Company ${runId}`,
      industry: 'Software',
      verified: true,
    });

    const collegeA = await College.create({
      name: `Reconcile College A ${runId}`,
      code: `REC_A_${runId % 10000}`,
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
      verified: true,
    });

    const collegeB = await College.create({
      name: `Reconcile College B ${runId}`,
      code: `REC_B_${runId % 10000}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
      verified: true,
    });

    const tpoUserA = await User.create({
      name: 'TPO Officer A',
      email: `tpoA_${runId}@reconcile.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
    });

    const tpoUserB = await User.create({
      name: 'TPO Officer B',
      email: `tpoB_${runId}@reconcile.edu`,
      password: 'Password123!',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
    });

    const superadminUser = await User.create({
      name: 'Super Admin',
      email: `superadmin_${runId}@reconcile.com`,
      password: 'Password123!',
      role: 'superadmin',
      isApproved: true,
    });

    const jobReq = await JobRequirement.create({
      company: company._id,
      title: `Reconciliation Engineer ${runId}`,
      description: 'Testing reconciliation',
      type: 'full-time',
      workplaceType: 'on-site',
      location: 'Bangalore',
      packageLpa: 15,
      batchYear: 2026,
      minCgpa: 6.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      openings: 5,
      status: 'published',
    });

    const defaultDriveFields = {
      company: company._id,
      college: collegeA._id,
      jobRequirement: jobReq._id,
      packageLpa: 15,
      location: 'Bangalore',
      allowedBranches: ['CSE'],
      lastDateToApply: new Date(Date.now() + 86400000),
      driveDate: new Date(Date.now() + 2 * 86400000),
      minCgpa: 6.0,
      maxBacklogs: 0,
      status: 'open',
    };

    const defaultDriveRequestFields = {
      jobRequirement: jobReq._id,
      company: company._id,
      college: collegeA._id,
      mode: 'on-campus',
      proposedDates: [new Date(Date.now() + 5 * 86400000)],
      confirmedDate: new Date(Date.now() + 5 * 86400000),
    };

    const tokenFor = (user) => {
      const token = jwt.sign(
        { id: user._id, role: user.role, college: user.college, company: user.company },
        process.env.JWT_SECRET || 'testsecret',
        { expiresIn: '1h' }
      );
      return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    };

    const headersTpoA = tokenFor(tpoUserA);
    const headersTpoB = tokenFor(tpoUserB);
    const headersSuperadmin = tokenFor(superadminUser);

    console.log('✓ Seeded College A, College B, TPO A, TPO B, Superadmin fixtures');

    // ------------------------------------------------------------------------
    // SCENARIO 1: Normal Finalized Request (Healthy Baseline)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Normal Finalized Request (Healthy Baseline) ---');
    const normalReq = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'scheduled',
      tpoPublishedAt: new Date(),
      tpoPublishedBy: tpoUserA._id,
    });

    const normalDrive = await Drive.create({
      ...defaultDriveFields,
      driveRequest: normalReq._id,
      role: 'Normal Engineer',
      isPublished: true,
      publishedAt: new Date(),
    });

    normalReq.drive = normalDrive._id;
    await normalReq.save();

    const report1 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    assert.strictEqual(report1.summary.totalInconsistencies, 0, 'Scenario 1: Expected 0 inconsistencies on normal finalized drive');
    assert.strictEqual(report1.summary.autoRepairedCount, 0, 'Scenario 1: Expected 0 repaired');
    console.log('✓ Scenario 1 passed: Normal finalized drive request is recognized as healthy');

    // ------------------------------------------------------------------------
    // SCENARIO 2: Drive Created But Request Link Missing (Category A Auto-Repair)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Drive Created But Request Link Missing (Category A Auto-Repair) ---');
    const reqUnlinked = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'recruiter_confirmed',
      drive: null, // Link missing!
      tpoPublishedAt: new Date(),
      tpoPublishedBy: tpoUserA._id,
      timeline: [{ status: 'recruiter_confirmed', note: 'Reconcile test: Confirmed by recruiter' }],
    });

    const driveCreated = await Drive.create({
      ...defaultDriveFields,
      driveRequest: reqUnlinked._id,
      role: 'Backend Architect',
      isPublished: true, // Already published
      publishedAt: new Date(),
    });

    const drivesBeforeRepairCount = await Drive.countDocuments({ driveRequest: reqUnlinked._id });
    assert.strictEqual(drivesBeforeRepairCount, 1, 'Drive count before repair must be exactly 1');

    const report2 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    assert.strictEqual(report2.summary.totalInconsistencies, 1, 'Scenario 2: Expected 1 inconsistency detected');
    assert.strictEqual(report2.inconsistenciesDetected[0].category, 'A', 'Scenario 2: Category must be A');
    assert.strictEqual(report2.summary.autoRepairedCount, 1, 'Scenario 2: Expected 1 auto-repaired');

    // Verify DriveRequest document in DB
    const reqAfterRepair = await DriveRequest.findById(reqUnlinked._id);
    assert.ok(reqAfterRepair.drive, 'DriveRequest.drive must be populated after auto-repair');
    assert.strictEqual(reqAfterRepair.drive.toString(), driveCreated._id.toString(), 'DriveRequest.drive must match existing Drive ID');
    assert.strictEqual(reqAfterRepair.status, 'scheduled', 'DriveRequest status must transition to scheduled because drive is live');

    // Verify timeline has system audit note
    const latestTimeline = reqAfterRepair.timeline[reqAfterRepair.timeline.length - 1];
    assert.strictEqual(latestTimeline.updatedByRole, 'system');
    assert.ok(latestTimeline.note.includes('Reconciliation: Safely restored request.drive link'));

    // Verify NO new drive was created
    const drivesAfterRepairCount = await Drive.countDocuments({ driveRequest: reqUnlinked._id });
    assert.strictEqual(drivesAfterRepairCount, 1, 'Scenario 2: Auto-repair must never create duplicate Drive documents');
    console.log('✓ Scenario 2 passed: Category A unlinked drive auto-repaired, linked restored, zero duplicate drives');

    // ------------------------------------------------------------------------
    // SCENARIO 3: Request Linked to Existing Drive (Healthy Verification)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Request Linked to Existing Drive (Healthy Verification) ---');
    const report3 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    assert.strictEqual(report3.summary.totalInconsistencies, 0, 'Scenario 3: Expected 0 inconsistencies on re-scan after repair');
    console.log('✓ Scenario 3 passed: Re-scan confirms repaired records are completely healthy');

    // ------------------------------------------------------------------------
    // SCENARIO 4: Request Linked to Missing Drive (Category B Manual Review)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Request Linked to Missing Drive (Category B Manual Review) ---');
    const nonExistentDriveId = new mongoose.Types.ObjectId();
    const reqBrokenDrive = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'scheduled',
      drive: nonExistentDriveId, // Missing drive!
    });

    const report4 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const catB = report4.inconsistenciesDetected.find((i) => i.category === 'B');
    assert.ok(catB, 'Scenario 4: Must detect Category B broken drive reference');
    assert.strictEqual(catB.missingDriveId, nonExistentDriveId.toString());
    assert.strictEqual(catB.requiresManualReview, true);
    assert.strictEqual(report4.summary.autoRepairedCount, 0, 'Scenario 4: Must NOT auto-repair Category B');

    // Verify record in DB is preserved (not deleted)
    const reqStillExists = await DriveRequest.findById(reqBrokenDrive._id);
    assert.ok(reqStillExists, 'Scenario 4: DriveRequest must NOT be deleted');
    console.log('✓ Scenario 4 passed: Category B broken drive reference flagged for manual review with 0 deletions');

    // Clean up reqBrokenDrive so it doesn't clutter subsequent scenarios
    await DriveRequest.deleteOne({ _id: reqBrokenDrive._id });

    // ------------------------------------------------------------------------
    // SCENARIO 5: Orphaned Drive Referencing Missing DriveRequest (Category C Manual Review)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Orphaned Drive Referencing Missing DriveRequest (Category C) ---');
    const nonExistentReqId = new mongoose.Types.ObjectId();
    const orphanDrive = await Drive.create({
      ...defaultDriveFields,
      driveRequest: nonExistentReqId, // Non-existent request!
      role: 'Orphaned Role',
      isPublished: true,
    });

    const report5 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const catC = report5.inconsistenciesDetected.find((i) => i.category === 'C');
    assert.ok(catC, 'Scenario 5: Must detect Category C orphaned drive request reference');
    assert.strictEqual(catC.missingDriveRequestId, nonExistentReqId.toString());
    assert.strictEqual(catC.requiresManualReview, true);

    // Verify Drive is NOT deleted
    const driveStillExists = await Drive.findById(orphanDrive._id);
    assert.ok(driveStillExists, 'Scenario 5: Historical Drive must NOT be deleted');
    console.log('✓ Scenario 5 passed: Category C orphaned drive flagged for manual review; record strictly preserved');

    // Clean up orphanDrive
    await Drive.deleteOne({ _id: orphanDrive._id });

    // ------------------------------------------------------------------------
    // SCENARIO 6: Duplicate Drive References (Category D Manual Review)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Duplicate Drive References (Category D Manual Review) ---');
    // Drop unique index temporarily to simulate legacy duplicate data
    await Drive.collection.dropIndex('driveRequest_1').catch(() => {});

    const reqForDuplicates = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'recruiter_confirmed',
    });

    const dupDrive1 = await Drive.create({
      ...defaultDriveFields,
      driveRequest: reqForDuplicates._id,
      role: 'Duplicate Drive 1',
      isPublished: true,
    });

    const dupDrive2 = await Drive.create({
      ...defaultDriveFields,
      driveRequest: reqForDuplicates._id,
      role: 'Duplicate Drive 2',
      isPublished: true,
    });

    const report6 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const catD = report6.inconsistenciesDetected.find((i) => i.category === 'D');
    assert.ok(catD, 'Scenario 6: Must detect Category D duplicate drive references');
    assert.strictEqual(catD.count, 2, 'Category D count must be 2');
    assert.strictEqual(catD.requiresManualReview, true);

    // Verify neither drive was deleted
    const d1 = await Drive.findById(dupDrive1._id);
    const d2 = await Drive.findById(dupDrive2._id);
    assert.ok(d1 && d2, 'Scenario 6: Neither duplicate drive may be automatically deleted');

    // Clean up duplicate and recreate unique partial index
    await Drive.deleteOne({ _id: dupDrive2._id });
    await Drive.deleteOne({ _id: dupDrive1._id });
    await DriveRequest.deleteOne({ _id: reqForDuplicates._id });
    await Drive.collection.createIndex(
      { driveRequest: 1 },
      { unique: true, partialFilterExpression: { driveRequest: { $type: 'objectId' } } }
    );
    console.log('✓ Scenario 6 passed: Category D duplicate drives flagged for manual review with 0 deletions');

    // ------------------------------------------------------------------------
    // SCENARIO 7: Unpublished Drive Protection (Category E)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 7: Unpublished Drive Protection (Category E) ---');
    // Subcase 7A: No valid TPO authorization -> MUST NOT publish
    const reqNoTpoAuth = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'scheduled',
      tpoPublishedAt: null, // NO authorization!
    });

    const unpublishedDriveA = await Drive.create({
      ...defaultDriveFields,
      driveRequest: reqNoTpoAuth._id,
      role: 'Unpublished Engineer A',
      isPublished: false,
    });

    reqNoTpoAuth.drive = unpublishedDriveA._id;
    await reqNoTpoAuth.save();

    const report7A = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const catE_A = report7A.inconsistenciesDetected.find((i) => i.category === 'E');
    assert.ok(catE_A, 'Scenario 7A: Must detect Category E mismatch');
    assert.strictEqual(catE_A.hasValidTpoEvidence, false, '7A: hasValidTpoEvidence must be false');
    assert.strictEqual(catE_A.requiresManualReview, true, '7A: Must require manual review');

    const driveStillUnpublished = await Drive.findById(unpublishedDriveA._id);
    assert.strictEqual(driveStillUnpublished.isPublished, false, '7A: Drive MUST NOT be published without TPO evidence');
    console.log('✓ Scenario 7A passed: Unpublished Drive is NOT published without verified TPO authorization');

    // Subcase 7B: Valid TPO authorization exists -> Safe to auto-publish
    const tpoPublishDate = new Date();
    const reqWithTpoAuth = await DriveRequest.create({
      ...defaultDriveRequestFields,
      status: 'scheduled',
      tpoPublishedAt: tpoPublishDate, // Valid TPO authorization!
      tpoPublishedBy: tpoUserA._id,
    });

    const unpublishedDriveB = await Drive.create({
      ...defaultDriveFields,
      driveRequest: reqWithTpoAuth._id,
      role: 'Unpublished Engineer B',
      isPublished: false,
    });

    reqWithTpoAuth.drive = unpublishedDriveB._id;
    await reqWithTpoAuth.save();

    const report7B = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const catE_B = report7B.repaired.find((r) => r.category === 'E' && r.driveId === unpublishedDriveB._id.toString());
    assert.ok(catE_B, 'Scenario 7B: Must auto-repair Category E when TPO authorization exists');

    const driveNowPublished = await Drive.findById(unpublishedDriveB._id);
    assert.strictEqual(driveNowPublished.isPublished, true, '7B: Drive is safely auto-published');
    console.log('✓ Scenario 7B passed: Drive safely auto-published when valid TPO authorization is verified');

    // Clean up Scenario 7 test drives/requests
    await Drive.deleteMany({ _id: { $in: [unpublishedDriveA._id, unpublishedDriveB._id] } });
    await DriveRequest.deleteMany({ _id: { $in: [reqNoTpoAuth._id, reqWithTpoAuth._id] } });

    // ------------------------------------------------------------------------
    // SCENARIO 8: Idempotency Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Idempotency Verification ---');
    const run1 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });
    const run2 = await reconcileDriveRequests({ collegeId: collegeA._id, dryRun: false });

    assert.strictEqual(run2.summary.autoRepairedCount, 0, 'Scenario 8: Run 2 must have 0 repairs (idempotent)');
    assert.strictEqual(run2.summary.totalInconsistencies, run1.summary.totalInconsistencies, 'Inconsistencies must remain constant');
    console.log('✓ Scenario 8 passed: Reconciliation is strictly idempotent across consecutive executions');

    // ------------------------------------------------------------------------
    // SCENARIO 9: Multi-tenant Security & API Endpoints
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 9: Multi-tenant Security & API Endpoints ---');

    // 9.1: TPO A views their own college report -> 200 OK
    const resTpoOwn = await fetch(`${BASE_URL}/drive-requests/reconciliation/report`, {
      headers: headersTpoA,
    });
    const dataTpoOwn = await resTpoOwn.json();
    assert.strictEqual(resTpoOwn.status, 200, 'TPO querying own report must be 200');
    assert.strictEqual(dataTpoOwn.success, true);
    assert.strictEqual(dataTpoOwn.report.collegeId, collegeA._id.toString());
    console.log('✓ 9.1: TPO successfully queried own college reconciliation report');

    // 9.2: TPO A attempts to view College B report -> 403 Forbidden
    const resTpoCross = await fetch(
      `${BASE_URL}/drive-requests/reconciliation/report?collegeId=${collegeB._id}`,
      { headers: headersTpoA }
    );
    const dataTpoCross = await resTpoCross.json();
    assert.strictEqual(resTpoCross.status, 403, 'Cross-college report query must return 403');
    assert.strictEqual(dataTpoCross.success, false);
    assert.ok(dataTpoCross.message.includes('Not authorized to view reconciliation report for another college'));
    console.log('✓ 9.2: Cross-college report access strictly rejected with 403 Forbidden');

    // 9.3: TPO A attempts to run reconciliation for College B -> 403 Forbidden
    const resRunCross = await fetch(`${BASE_URL}/drive-requests/reconciliation/run`, {
      method: 'POST',
      headers: headersTpoA,
      body: JSON.stringify({ collegeId: collegeB._id }),
    });
    const dataRunCross = await resRunCross.json();
    assert.strictEqual(resRunCross.status, 403, 'Cross-college run execution must return 403');
    assert.strictEqual(dataRunCross.success, false);
    assert.ok(dataRunCross.message.includes('Not authorized to run reconciliation for another college'));
    console.log('✓ 9.3: Cross-college run execution strictly rejected with 403 Forbidden');

    // 9.4: Superadmin queries College B report -> 200 OK
    const resSuperadmin = await fetch(
      `${BASE_URL}/drive-requests/reconciliation/report?collegeId=${collegeB._id}`,
      { headers: headersSuperadmin }
    );
    const dataSuperadmin = await resSuperadmin.json();
    assert.strictEqual(resSuperadmin.status, 200, 'Superadmin querying college report must be 200');
    assert.strictEqual(dataSuperadmin.success, true);
    assert.strictEqual(dataSuperadmin.report.collegeId, collegeB._id.toString());
    console.log('✓ 9.4: Superadmin successfully queried cross-college report');

    // 9.5: TPO A runs reconciliation for own college -> 200 OK
    const resRunOwn = await fetch(`${BASE_URL}/drive-requests/reconciliation/run`, {
      method: 'POST',
      headers: headersTpoA,
      body: JSON.stringify({}),
    });
    const dataRunOwn = await resRunOwn.json();
    assert.strictEqual(resRunOwn.status, 200, 'TPO running own college reconciliation must be 200');
    assert.strictEqual(dataRunOwn.success, true);
    assert.strictEqual(dataRunOwn.report.dryRun, false);
    console.log('✓ 9.5: TPO successfully ran reconciliation for own college');

    console.log('\n======================================================');
    console.log('  ALL 9 RECONCILIATION SCENARIOS PASSED WITH ZERO ERRORS');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.connection.close();
  }
}

runDriveReconciliationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
