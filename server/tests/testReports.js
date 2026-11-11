const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const ExcelJS = require('exceljs');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  Offer,
  Placement,
  Notification,
} = require('../models');

const { getTestDbUri } = require('./testHelper');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

async function runReportTests() {
  console.log('Connecting to MongoDB Test Database...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup Express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/reports', require('../routes/reportRoutes'));
  app.use('/api/offers', require('../routes/offerRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5098;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  let collegeA, collegeB;
  let tpoAUser, tpoBUser, studentUser, recruiterUser, superadminUser;
  let company1, company2;
  let driveA1, driveA2, driveB1;
  const createdUserIds = [];
  const createdStudentIds = [];
  const createdOfferIds = [];
  const createdDriveIds = [];
  const createdAppIds = [];
  const createdCompanyIds = [];
  const createdCollegeIds = [];
  const createdPlacementIds = [];
  const createdNotificationIds = [];

  try {
    console.log('\n======================================================');
    console.log('       TEST SUITE: TPO PLACEMENT REPORT & EXPORT       ');
    console.log('======================================================\n');

    // ------------------------------------------------------------------------
    // CLEANUP PREVIOUS RUN ARTIFACTS
    // ------------------------------------------------------------------------
    await College.deleteMany({ code: { $in: ['REP_COL_A', 'REP_COL_B'] } });
    await Company.deleteMany({ name: { $in: ['Report Acme Corp', 'Report Global Tech'] } });
    await User.deleteMany({ email: { $regex: /@report-test\.com$/ } });

    // ------------------------------------------------------------------------
    // 1. FIXTURE SETUP
    // ------------------------------------------------------------------------
    console.log('--- 1. Setting up Hermetic Test Fixtures ---');

    collegeA = await College.create({
      name: 'College Alpha of Technology',
      code: 'REP_COL_A',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });
    createdCollegeIds.push(collegeA._id);

    collegeB = await College.create({
      name: 'College Beta of Engineering',
      code: 'REP_COL_B',
      city: 'Delhi',
      state: 'Delhi',
      status: 'approved',
    });
    createdCollegeIds.push(collegeB._id);

    // TPO A
    tpoAUser = await User.create({
      name: 'TPO Alpha',
      email: 'tpo.alpha@report-test.com',
      password: 'Password@123',
      role: 'tpo',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(tpoAUser._id);

    // TPO B
    tpoBUser = await User.create({
      name: 'TPO Beta',
      email: 'tpo.beta@report-test.com',
      password: 'Password@123',
      role: 'tpo',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(tpoBUser._id);

    // Superadmin
    superadminUser = await User.create({
      name: 'Root Superadmin',
      email: 'superadmin@report-test.com',
      password: 'Password@123',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(superadminUser._id);

    // Student Role User (for RBAC test)
    studentUser = await User.create({
      name: 'Test Student',
      email: 'student.rbac@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(studentUser._id);

    // Companies
    company1 = await Company.create({
      name: 'Report Acme Corp',
      industry: 'Technology',
      verified: true,
    });
    createdCompanyIds.push(company1._id);

    company2 = await Company.create({
      name: 'Report Global Tech',
      industry: 'Consulting',
      verified: true,
    });
    createdCompanyIds.push(company2._id);

    // Recruiter User (for RBAC test)
    recruiterUser = await User.create({
      name: 'Recruiter Acme',
      email: 'recruiter@report-test.com',
      password: 'Password@123',
      role: 'recruiter',
      company: company1._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterUser._id);

    // Setup 5 Students for College A:
    // St1: CSE, Batch 2026, Verified email -> Offer 1 (10 LPA), accepted
    // St2: CSE, Batch 2026, Verified email -> Offer 2 (20 LPA), accepted
    // St3: ECE, Batch 2026, Verified email -> Offer 3 (30 LPA), accepted + Offer 4 (15 LPA, lower, accepted)
    // St4: ECE, Batch 2026, Verified email -> Offer 5 (null package), accepted
    // St5: ME,  Batch 2025, Unverified email -> Applied, NO offers (unplaced)

    const createStudentFixture = async ({ name, email, roll, branch, batchYear, isEmailVerified }) => {
      const u = await User.create({
        name,
        email,
        password: 'Password@123',
        role: 'student',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified,
      });
      createdUserIds.push(u._id);

      const s = await Student.create({
        user: u._id,
        college: collegeA._id,
        enrollmentNo: roll,
        branch,
        batchYear,
        cgpa: 8.5,
        backlogs: 0,
        phone: '9876543210',
      });
      createdStudentIds.push(s._id);
      return { user: u, student: s };
    };

    const st1 = await createStudentFixture({
      name: 'Aarav CSE',
      email: 'aarav.cse@report-test.com',
      roll: 'REP_CSE_01',
      branch: 'CSE',
      batchYear: 2026,
      isEmailVerified: true,
    });

    const st2 = await createStudentFixture({
      name: 'Bhavya CSE',
      email: 'bhavya.cse@report-test.com',
      roll: 'REP_CSE_02',
      branch: 'CSE',
      batchYear: 2026,
      isEmailVerified: true,
    });

    const st3 = await createStudentFixture({
      name: 'Chetan ECE',
      email: 'chetan.ece@report-test.com',
      roll: 'REP_ECE_01',
      branch: 'ECE',
      batchYear: 2026,
      isEmailVerified: true,
    });

    const st4 = await createStudentFixture({
      name: 'Divya ECE',
      email: 'divya.ece@report-test.com',
      roll: 'REP_ECE_02',
      branch: 'ECE',
      batchYear: 2026,
      isEmailVerified: true,
    });

    const st5 = await createStudentFixture({
      name: 'Eshan ME',
      email: 'eshan.me@report-test.com',
      roll: 'REP_ME_01',
      branch: 'ME',
      batchYear: 2025,
      isEmailVerified: false,
    });

    // Student for College B (to test isolation)
    const stBUser = await User.create({
      name: 'Student Beta',
      email: 'student.beta@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeB._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(stBUser._id);

    const stB = await Student.create({
      user: stBUser._id,
      college: collegeB._id,
      enrollmentNo: 'REP_COL_B_01',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 9.0,
      backlogs: 0,
      phone: '9876543211',
    });
    createdStudentIds.push(stB._id);

    // Drives
    driveA1 = await Drive.create({
      college: collegeA._id,
      company: company1._id,
      role: 'Software Engineer',
      packageLpa: 15,
      location: 'Pune',
      allowedBranches: ['CSE', 'ECE', 'ME'],
      lastDateToApply: new Date('2026-11-20'),
      driveDate: new Date('2026-11-25'),
      status: 'closed',
    });
    createdDriveIds.push(driveA1._id);

    driveA2 = await Drive.create({
      college: collegeA._id,
      company: company2._id,
      role: 'Consulting Analyst',
      packageLpa: 25,
      location: 'Mumbai',
      allowedBranches: ['CSE', 'ECE'],
      lastDateToApply: new Date('2026-11-20'),
      driveDate: new Date('2026-11-28'),
      status: 'closed',
    });
    createdDriveIds.push(driveA2._id);

    driveB1 = await Drive.create({
      college: collegeB._id,
      company: company1._id,
      role: 'Backend Developer',
      packageLpa: 40,
      location: 'Delhi',
      allowedBranches: ['CSE'],
      lastDateToApply: new Date('2026-11-20'),
      driveDate: new Date('2026-11-25'),
      status: 'closed',
    });
    createdDriveIds.push(driveB1._id);

    // Applications for College A
    const app1 = await Application.create({ student: st1.student._id, drive: driveA1._id, status: 'selected' });
    const app2 = await Application.create({ student: st2.student._id, drive: driveA1._id, status: 'selected' });
    const app3a = await Application.create({ student: st3.student._id, drive: driveA1._id, status: 'selected' });
    const app3b = await Application.create({ student: st3.student._id, drive: driveA2._id, status: 'selected' });
    const app4 = await Application.create({ student: st4.student._id, drive: driveA1._id, status: 'selected' });
    const app5 = await Application.create({ student: st5.student._id, drive: driveA1._id, status: 'applied' });
    createdAppIds.push(app1._id, app2._id, app3a._id, app3b._id, app4._id, app5._id);

    // College B application
    const appB = await Application.create({ student: stB._id, drive: driveB1._id, status: 'selected' });
    createdAppIds.push(appB._id);

    // Offers for College A:
    // St1 -> 10 LPA accepted
    const off1 = await Offer.create({
      college: collegeA._id,
      company: company1._id,
      drive: driveA1._id,
      student: st1.student._id,
      application: app1._id,
      packageLpa: 10,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-10-15'),
      respondedAt: new Date('2026-10-16'),
    });

    // St2 -> 20 LPA accepted
    const off2 = await Offer.create({
      college: collegeA._id,
      company: company1._id,
      drive: driveA1._id,
      student: st2.student._id,
      application: app2._id,
      packageLpa: 20,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-10-18'),
      respondedAt: new Date('2026-10-19'),
    });

    // St3 -> 2 offers:
    // Offer 3a: 15 LPA accepted
    // Offer 3b: 30 LPA accepted (Highest accepted package for St3 = 30 LPA!)
    const off3a = await Offer.create({
      college: collegeA._id,
      company: company1._id,
      drive: driveA1._id,
      student: st3.student._id,
      application: app3a._id,
      packageLpa: 15,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-01'),
      respondedAt: new Date('2026-11-02'),
    });

    const off3b = await Offer.create({
      college: collegeA._id,
      company: company2._id,
      drive: driveA2._id,
      student: st3.student._id,
      application: app3b._id,
      packageLpa: 30,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-05'),
      respondedAt: new Date('2026-11-06'),
    });

    // St4 -> Offer with NO package value (null package)
    const off4 = await Offer.create({
      college: collegeA._id,
      company: company1._id,
      drive: driveA1._id,
      student: st4.student._id,
      application: app4._id,
      packageLpa: null,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-08'),
      respondedAt: new Date('2026-11-09'),
    });

    createdOfferIds.push(off1._id, off2._id, off3a._id, off3b._id, off4._id);

    // College B Offer: 50 LPA
    const offB = await Offer.create({
      college: collegeB._id,
      company: company1._id,
      drive: driveB1._id,
      student: stB._id,
      application: appB._id,
      packageLpa: 50,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-01'),
    });
    createdOfferIds.push(offB._id);

    console.log('✓ Hermetic test fixtures successfully seeded.');

    const tpoAToken = createToken(tpoAUser);
    const tpoBToken = createToken(tpoBUser);
    const superadminToken = createToken(superadminUser);
    const studentToken = createToken(studentUser);
    const recruiterToken = createToken(recruiterUser);

    // ------------------------------------------------------------------------
    // 2. KNOWN DATASET & SUMMARY METRICS TEST
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Known Dataset Summary Metrics (College A) ---');
    const resA = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    const dataA = await resA.json();
    assert.strictEqual(resA.status, 200, 'GET /reports/placement should return 200');
    assert.strictEqual(dataA.success, true);

    const sA = dataA.data?.summary || dataA.summary;
    assert.ok(sA, 'Summary data must exist in response');

    // Expected numbers for College A:
    // Total students = 5
    // Verified students = 4 (st1, st2, st3, st4 are verified; st5 is unverified)
    // Registered for placement = 5 (all 5 applied to at least 1 drive)
    // Placed students = 4 (st1, st2, st3, st4 have accepted offers; st3 has 2 offers but is counted ONCE)
    // Unplaced count = 1 (st5)
    // Placement percentage = 80% (4 / 5 * 100)
    // Total offers = 5 (off1, off2, off3a, off3b, off4)
    // Valid student packages: st1 = 10, st2 = 20, st3 = 30 (max of 15 & 30). st4 has null package and is EXCLUDED.
    // Packages array = [10, 20, 30]
    // Average package = (10 + 20 + 30) / 3 = 20.0 LPA
    // Median package = 20.0 LPA
    // Highest package = 30.0 LPA
    // Lowest package = 10.0 LPA

    assert.strictEqual(sA.totalStudents, 5, 'totalStudents must be 5');
    assert.strictEqual(sA.verifiedStudents, 4, 'verifiedStudents must be 4');
    assert.strictEqual(sA.registeredForPlacement, 5, 'registeredForPlacement must be 5');
    assert.strictEqual(sA.placedStudents, 4, 'placedStudents must be 4');
    assert.strictEqual(sA.unplacedCount, 1, 'unplacedCount must be 1');
    assert.strictEqual(sA.placementPercentage, 80, 'placementPercentage must be 80%');
    assert.strictEqual(sA.totalOffers, 5, 'totalOffers must be 5');
    assert.strictEqual(sA.averagePackage, 20, 'averagePackage must be 20 LPA');
    assert.strictEqual(sA.medianPackage, 20, 'medianPackage must be 20 LPA');
    assert.strictEqual(sA.highestPackage, 30, 'highestPackage must be 30 LPA');
    assert.strictEqual(sA.lowestPackage, 10, 'lowestPackage must be 10 LPA');
    console.log('✓ Summary metrics accurately match known dataset:');
    console.log(`   Total: ${sA.totalStudents}, Placed: ${sA.placedStudents} (${sA.placementPercentage}%), Avg: ${sA.averagePackage} LPA, Median: ${sA.medianPackage} LPA, Max: ${sA.highestPackage} LPA`);

    // ------------------------------------------------------------------------
    // 3. DEPARTMENT-WISE, COMPANY-WISE, DRIVE-WISE & MONTHLY TREND
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Breakdown Sections ---');
    const deptWise = dataA.data?.departmentWise || dataA.departmentWise;
    assert.ok(Array.isArray(deptWise), 'departmentWise must be an array');
    const cseDept = deptWise.find((d) => d.department === 'CSE');
    assert.ok(cseDept, 'CSE department must be present');
    assert.strictEqual(cseDept.total, 2, 'CSE total students must be 2');
    assert.strictEqual(cseDept.placed, 2, 'CSE placed students must be 2');
    assert.strictEqual(cseDept.placementPercentage, 100);
    assert.strictEqual(cseDept.avgPackage, 15, 'CSE avgPackage must be 15 LPA ((10+20)/2)');
    assert.strictEqual(cseDept.highestPackage, 20);

    const eceDept = deptWise.find((d) => d.department === 'ECE');
    assert.ok(eceDept, 'ECE department must be present');
    assert.strictEqual(eceDept.total, 2, 'ECE total students must be 2');
    assert.strictEqual(eceDept.placed, 2, 'ECE placed students must be 2 (st3 & st4)');
    // st3 package = 30, st4 package = null (excluded). Avg = 30
    assert.strictEqual(eceDept.avgPackage, 30, 'ECE avgPackage must be 30 (excluding null package)');
    assert.strictEqual(eceDept.highestPackage, 30);
    console.log('✓ Department-wise breakdown verified (CSE: 100%, ECE: 100%, null package excluded from average).');

    const compWise = dataA.data?.companyWise || dataA.companyWise;
    assert.ok(Array.isArray(compWise), 'companyWise must be an array');
    const acmeComp = compWise.find((c) => c.company === 'Report Acme Corp');
    assert.ok(acmeComp, 'Report Acme Corp must be in companyWise');
    assert.strictEqual(acmeComp.offers, 4, 'Acme offers must be 4');
    assert.strictEqual(acmeComp.accepted, 4, 'Acme accepted offers must be 4');

    const globalComp = compWise.find((c) => c.company === 'Report Global Tech');
    assert.ok(globalComp, 'Report Global Tech must be in companyWise');
    assert.strictEqual(globalComp.offers, 1);
    assert.strictEqual(globalComp.accepted, 1);
    assert.strictEqual(globalComp.avgPackage, 30);
    console.log('✓ Company-wise breakdown verified.');

    const driveWise = dataA.data?.driveWise || dataA.driveWise;
    assert.ok(Array.isArray(driveWise), 'driveWise must be an array');
    assert.strictEqual(driveWise.length, 2, 'College A has 2 drives');
    console.log('✓ Drive-wise breakdown verified.');

    const monthlyTrend = dataA.data?.monthlyTrend || dataA.monthlyTrend;
    assert.ok(Array.isArray(monthlyTrend), 'monthlyTrend must be an array');
    assert.ok(monthlyTrend.length >= 2, 'Must have monthly trends for Oct and Nov 2026');
    console.log('✓ Monthly trend verified:', monthlyTrend);

    // ------------------------------------------------------------------------
    // 4. QUERY FILTERS (batchYear and department)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Query Filters ---');
    // Filter by batch 2025: should only return st5 (ME, 2025, unplaced)
    const resFilter2025 = await fetch(`${BASE_URL}/reports/placement?batch=2025`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    const dataFilter2025 = await resFilter2025.json();
    const s2025 = dataFilter2025.data?.summary || dataFilter2025.summary;
    assert.strictEqual(s2025.totalStudents, 1, 'Batch 2025 has 1 student');
    assert.strictEqual(s2025.placedStudents, 0, 'Batch 2025 has 0 placed students');
    assert.strictEqual(s2025.placementPercentage, 0);
    assert.strictEqual(s2025.averagePackage, 0);
    console.log('✓ Batch year filter (?batch=2025) successfully isolated 2025 cohort.');

    // Filter by department=CSE
    const resFilterCSE = await fetch(`${BASE_URL}/reports/placement?department=CSE`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    const dataFilterCSE = await resFilterCSE.json();
    const sCSE = dataFilterCSE.data?.summary || dataFilterCSE.summary;
    assert.strictEqual(sCSE.totalStudents, 2, 'CSE has 2 students');
    assert.strictEqual(sCSE.placedStudents, 2, 'CSE has 2 placed students');
    assert.strictEqual(sCSE.placementPercentage, 100);
    assert.strictEqual(sCSE.averagePackage, 15);
    console.log('✓ Department filter (?department=CSE) successfully isolated CSE cohort.');

    // ------------------------------------------------------------------------
    // 5. MULTI-TENANCY & DATA ISOLATION
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Multi-Tenancy & College Isolation ---');
    // TPO B requests their report: should ONLY see College B data (stB, 50 LPA)
    const resB = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${tpoBToken}` },
    });
    const dataB = await resB.json();
    const sB = dataB.data?.summary || dataB.summary;
    assert.strictEqual(sB.totalStudents, 1, 'College B has 1 student');
    assert.strictEqual(sB.placedStudents, 1, 'College B has 1 placed student');
    assert.strictEqual(sB.highestPackage, 50, 'College B highestPackage is 50 LPA');
    assert.strictEqual(sB.averagePackage, 50);

    // TPO A attempting to pass College B id in query must NOT see College B data
    const resSpoof = await fetch(`${BASE_URL}/reports/placement?collegeId=${collegeB._id}`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    const dataSpoof = await resSpoof.json();
    const sSpoof = dataSpoof.data?.summary || dataSpoof.summary;
    assert.strictEqual(
      sSpoof.totalStudents,
      5,
      'TPO A must strictly see College A data regardless of ?collegeId query param'
    );
    console.log('✓ Multi-tenancy verified: TPO is strictly scoped to own college.');

    // ------------------------------------------------------------------------
    // 6. RBAC & ACCESS CONTROL (403 for student & recruiter)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing RBAC Access Control ---');
    const resStudent = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(resStudent.status, 403, 'Student access must be rejected with 403');

    const resRecruiter = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${recruiterToken}` },
    });
    assert.strictEqual(resRecruiter.status, 403, 'Recruiter access must be rejected with 403');
    console.log('✓ Student and Recruiter roles are strictly blocked with 403 Forbidden.');

    // ------------------------------------------------------------------------
    // 7. SUPERADMIN ACCESS
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Superadmin Access ---');
    // Superadmin without collegeId -> 400
    const resSuperNoId = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    assert.strictEqual(resSuperNoId.status, 400, 'Superadmin without collegeId must return 400');

    // Superadmin with collegeId -> 200 with specified college report
    const resSuperWithId = await fetch(`${BASE_URL}/reports/placement?collegeId=${collegeA._id}`, {
      headers: { Authorization: `Bearer ${superadminToken}` },
    });
    assert.strictEqual(resSuperWithId.status, 200);
    const dataSuper = await resSuperWithId.json();
    const sSuper = dataSuper.data?.summary || dataSuper.summary;
    assert.strictEqual(sSuper.totalStudents, 5);
    console.log('✓ Superadmin requires collegeId and can query any college placement report.');

    // ------------------------------------------------------------------------
    // 8. EXPORT TESTS (XLSX & CSV)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing Export Endpoints (XLSX & CSV) ---');

    // 8a. Excel Export (format=xlsx)
    const resXlsx = await fetch(`${BASE_URL}/reports/placement/export?format=xlsx`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(resXlsx.status, 200, 'Excel export must return 200');
    assert.ok(
      resXlsx.headers.get('content-type').includes('spreadsheetml'),
      'Content-Type must be openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert.ok(
      resXlsx.headers.get('content-disposition').includes('attachment'),
      'Content-Disposition must be attachment'
    );

    const xlsxBuffer = Buffer.from(await resXlsx.arrayBuffer());
    // Check zip magic bytes 'PK' (0x50, 0x4B)
    assert.strictEqual(xlsxBuffer[0], 0x50, 'Excel file must start with PK zip signature');
    assert.strictEqual(xlsxBuffer[1], 0x4b, 'Excel file must start with PK zip signature');

    // Parse with exceljs
    const testWorkbook = new ExcelJS.Workbook();
    await testWorkbook.xlsx.load(xlsxBuffer);
    const sheetNames = testWorkbook.worksheets.map((w) => w.name);
    assert.ok(sheetNames.includes('Summary'), 'Summary sheet missing');
    assert.ok(sheetNames.includes('Department-wise'), 'Department-wise sheet missing');
    assert.ok(sheetNames.includes('Company-wise'), 'Company-wise sheet missing');
    assert.ok(sheetNames.includes('Drive-wise'), 'Drive-wise sheet missing');
    assert.ok(sheetNames.includes('Placed Students'), 'Placed Students sheet missing');
    console.log('✓ Excel export generated valid .xlsx workbook with all 5 required sheets:', sheetNames);

    // 8b. CSV Export (format=csv)
    const resCsv = await fetch(`${BASE_URL}/reports/placement/export?format=csv`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    assert.strictEqual(resCsv.status, 200, 'CSV export must return 200');
    assert.ok(resCsv.headers.get('content-type').includes('text/csv'), 'Content-Type must be text/csv');

    const csvText = await resCsv.text();
    assert.ok(
      csvText.startsWith('Name,Roll No,Department,Company,Package (LPA)'),
      'CSV must start with proper header row'
    );
    assert.ok(csvText.includes('Aarav CSE'), 'CSV must contain placed student name');
    assert.ok(csvText.includes('REP_CSE_01'), 'CSV must contain student roll no');
    console.log('✓ CSV export generated valid placed students list.');

    // 8c. Sensitive Fields Audit
    console.log('\n--- 8c. Verifying Zero Sensitive Fields in Export ---');
    const sensitiveTokens = [
      'password',
      'otphash',
      'refreshtokenhash',
      'supersecret',
      'secret',
      'hash',
    ];
    for (const token of sensitiveTokens) {
      if (csvText.toLowerCase().includes(token)) {
        throw new Error(`[SECURITY LEAK] CSV export contains sensitive token: "${token}"`);
      }
    }
    console.log('✓ Privacy verified: zero passwords, hashes, or tokens exposed in export.');

    // ------------------------------------------------------------------------
    // 9. SPREADSHEET FORMULA INJECTION NEUTRALIZATION (XLSX & CSV)
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Testing Spreadsheet Formula Injection Neutralization ---');
    // Create dedicated college and students with malicious formula names:
    // '=HYPERLINK("http://evil","x")' and '+1+1'
    const collegeSec = await College.create({
      name: 'College Security Institute',
      code: 'REP_COL_SEC',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });
    createdCollegeIds.push(collegeSec._id);

    const tpoSecUser = await User.create({
      name: 'TPO Security',
      email: 'tpo.security@report-test.com',
      password: 'Password@123',
      role: 'tpo',
      college: collegeSec._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(tpoSecUser._id);
    const tpoSecToken = createToken(tpoSecUser);

    const evilUser1 = await User.create({
      name: '=HYPERLINK("http://evil","x")',
      email: 'evil1@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeSec._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(evilUser1._id);

    const evilStudent1 = await Student.create({
      user: evilUser1._id,
      college: collegeSec._id,
      enrollmentNo: 'REP_SEC_01',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
    });
    createdStudentIds.push(evilStudent1._id);

    const evilUser2 = await User.create({
      name: '+1+1',
      email: 'evil2@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeSec._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(evilUser2._id);

    const evilStudent2 = await Student.create({
      user: evilUser2._id,
      college: collegeSec._id,
      enrollmentNo: 'REP_SEC_02',
      branch: 'IT',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
    });
    createdStudentIds.push(evilStudent2._id);

    const driveSec = await Drive.create({
      college: collegeSec._id,
      company: company1._id,
      role: 'Security Engineer',
      packageLpa: 22,
      location: 'Mumbai',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date('2026-11-20'),
      driveDate: new Date('2026-11-25'),
      status: 'closed',
    });
    createdDriveIds.push(driveSec._id);

    const appSec1 = await Application.create({ student: evilStudent1._id, drive: driveSec._id, status: 'selected' });
    const appSec2 = await Application.create({ student: evilStudent2._id, drive: driveSec._id, status: 'selected' });
    createdAppIds.push(appSec1._id, appSec2._id);

    const offSec1 = await Offer.create({
      college: collegeSec._id,
      company: company1._id,
      drive: driveSec._id,
      student: evilStudent1._id,
      application: appSec1._id,
      packageLpa: 25,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-01'),
    });
    const offSec2 = await Offer.create({
      college: collegeSec._id,
      company: company1._id,
      drive: driveSec._id,
      student: evilStudent2._id,
      application: appSec2._id,
      packageLpa: 18,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-01'),
    });
    createdOfferIds.push(offSec1._id, offSec2._id);

    // 9a. Verify CSV export formula neutralization & RFC 4180 quote escaping
    const resSecCsv = await fetch(`${BASE_URL}/reports/placement/export?format=csv`, {
      headers: { Authorization: `Bearer ${tpoSecToken}` },
    });
    assert.strictEqual(resSecCsv.status, 200, 'Security CSV export must return 200');
    const secCsvText = await resSecCsv.text();

    // Check that '=HYPERLINK("http://evil","x")' was neutralized with single quote prefix and double quotes were escaped
    // Formatted CSV cell: "'=HYPERLINK(""http://evil"",""x"")"
    assert.ok(
      secCsvText.includes('"\'=HYPERLINK(""http://evil"",""x"")"'),
      'CSV export must neutralize =HYPERLINK formula with single-quote prefix and double-quote escaping'
    );

    // Check that '+1+1' was neutralized with single quote prefix
    // Formatted CSV cell: "'+1+1"
    assert.ok(
      secCsvText.includes('"\'\+1+1"'),
      'CSV export must neutralize +1+1 formula with single-quote prefix'
    );
    console.log('✓ CSV formula injection neutralization verified for =HYPERLINK and +1+1.');

    // 9b. Verify XLSX export formula neutralization
    const resSecXlsx = await fetch(`${BASE_URL}/reports/placement/export?format=xlsx`, {
      headers: { Authorization: `Bearer ${tpoSecToken}` },
    });
    assert.strictEqual(resSecXlsx.status, 200, 'Security XLSX export must return 200');
    const secXlsxBuffer = Buffer.from(await resSecXlsx.arrayBuffer());
    const secWorkbook = new ExcelJS.Workbook();
    await secWorkbook.xlsx.load(secXlsxBuffer);

    const secPlacedSheet = secWorkbook.getWorksheet('Placed Students');
    assert.ok(secPlacedSheet, 'Placed Students sheet must exist in security workbook');

    let foundEvil1Xlsx = false;
    let foundEvil2Xlsx = false;
    secPlacedSheet.eachRow((row) => {
      const cellVal = String(row.getCell(1).value || '');
      if (cellVal.includes('HYPERLINK')) {
        // Must start with single quote prefix
        assert.strictEqual(
          cellVal,
          '\'=HYPERLINK("http://evil","x")',
          'XLSX student name must be neutralized with leading single quote'
        );
        foundEvil1Xlsx = true;
      }
      if (cellVal === '\'+1+1') {
        foundEvil2Xlsx = true;
      }
    });
    assert.ok(foundEvil1Xlsx, 'XLSX must contain neutralized =HYPERLINK cell');
    assert.ok(foundEvil2Xlsx, 'XLSX must contain neutralized +1+1 cell');
    console.log('✓ XLSX formula injection neutralization verified in Excel cells.');

    // ------------------------------------------------------------------------
    // 10. HONEST registeredForPlacement (NO ARTIFICIAL FLOOR)
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Testing Honest registeredForPlacement (Floor Removed) ---');
    // Scenario: Placed student has NO Application record.
    // Confirm report returns registeredForPlacement: 0, placedStudents: 1
    const collegeHonest = await College.create({
      name: 'College Honest Metrics',
      code: 'REP_COL_HONEST',
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
    });
    createdCollegeIds.push(collegeHonest._id);

    const tpoHonestUser = await User.create({
      name: 'TPO Honest',
      email: 'tpo.honest@report-test.com',
      password: 'Password@123',
      role: 'tpo',
      college: collegeHonest._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(tpoHonestUser._id);
    const tpoHonestToken = createToken(tpoHonestUser);

    const honestStudentUser = await User.create({
      name: 'Honest Solo Student',
      email: 'honest.solo@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeHonest._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(honestStudentUser._id);

    const honestStudent = await Student.create({
      user: honestStudentUser._id,
      college: collegeHonest._id,
      enrollmentNo: 'REP_HONEST_01',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
    });
    createdStudentIds.push(honestStudent._id);

    // Create accepted Offer for honestStudent WITHOUT creating any Application record
    const honestDrive = await Drive.create({
      college: collegeHonest._id,
      company: company1._id,
      role: 'Direct Placed Engineer',
      packageLpa: 16,
      location: 'Bangalore',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date('2026-11-20'),
      driveDate: new Date('2026-11-25'),
      status: 'closed',
    });
    createdDriveIds.push(honestDrive._id);

    const honestOffer = await Offer.create({
      college: collegeHonest._id,
      company: company1._id,
      drive: honestDrive._id,
      student: honestStudent._id,
      packageLpa: 16,
      expiryDate: new Date('2026-12-01'),
      status: 'accepted',
      offeredAt: new Date('2026-11-01'),
    });
    createdOfferIds.push(honestOffer._id);

    const resHonest = await fetch(`${BASE_URL}/reports/placement`, {
      headers: { Authorization: `Bearer ${tpoHonestToken}` },
    });
    assert.strictEqual(resHonest.status, 200);
    const dataHonest = await resHonest.json();
    const sHonest = dataHonest.data?.summary || dataHonest.summary;

    assert.strictEqual(sHonest.totalStudents, 1, 'totalStudents must be 1');
    assert.strictEqual(sHonest.placedStudents, 1, 'placedStudents must be 1');
    assert.strictEqual(
      sHonest.registeredForPlacement,
      0,
      'registeredForPlacement must honestly be 0 because the student has 0 applications'
    );
    assert.ok(
      sHonest.registeredForPlacement < sHonest.placedStudents,
      'registeredForPlacement can be less than placedStudents now that the floor is removed'
    );
    console.log(`✓ Floor removal verified: registeredForPlacement (${sHonest.registeredForPlacement}) < placedStudents (${sHonest.placedStudents}) reported honestly as they are.`);

    // ------------------------------------------------------------------------
    // 11. NULL-SAFE Offer.packageLpa IN SERVER LOGIC & ACCEPTANCE FLOW
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Testing Null-safe Offer.packageLpa in Acceptance & Notifications ---');
    // Student accepts an offer where packageLpa is null
    const studentNullUser = await User.create({
      name: 'Null Pkg Student',
      email: 'nullpkg.student@report-test.com',
      password: 'Password@123',
      role: 'student',
      college: collegeA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    createdUserIds.push(studentNullUser._id);
    const studentNullToken = createToken(studentNullUser);

    const studentNullDoc = await Student.create({
      user: studentNullUser._id,
      college: collegeA._id,
      enrollmentNo: 'REP_NULL_01',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
    });
    createdStudentIds.push(studentNullDoc._id);

    const appNull = await Application.create({
      student: studentNullDoc._id,
      drive: driveA1._id,
      status: 'applied',
    });
    createdAppIds.push(appNull._id);

    const offerNull = await Offer.create({
      college: collegeA._id,
      company: company1._id,
      drive: driveA1._id,
      student: studentNullDoc._id,
      application: appNull._id,
      role: 'Staff Engineer',
      packageLpa: null,
      expiryDate: new Date('2026-12-01'),
      status: 'offered',
    });
    createdOfferIds.push(offerNull._id);

    const resAccept = await fetch(`${BASE_URL}/offers/${offerNull._id}/accept`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${studentNullToken}`,
        'Content-Type': 'application/json',
      },
    });
    const acceptData = await resAccept.json();
    assert.strictEqual(resAccept.status, 200, 'Accepting offer with null packageLpa should succeed');
    assert.strictEqual(acceptData.success, true);
    assert.ok(acceptData.placement, 'Placement record must be created');

    if (acceptData.placement?._id) {
      createdPlacementIds.push(acceptData.placement._id);
    }

    // Verify Placement record in DB
    const dbPlacement = await Placement.findById(acceptData.placement._id);
    assert.ok(dbPlacement, 'Placement record must exist in DB');
    assert.strictEqual(dbPlacement.packageLpa, null, 'Placement packageLpa should be null without error');

    // Wait brief tick for fire-and-forget notification creation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify Notification generated does NOT contain 'null LPA'
    const notifs = await Notification.find({ user: recruiterUser._id }).sort({ createdAt: -1 });
    const latestNotif = notifs[0];
    assert.ok(latestNotif, 'Recruiter notification should exist');
    assert.ok(!latestNotif.message.includes('null LPA'), 'Notification message must not contain "null LPA"');
    console.log(`✓ Null-safe offer acceptance verified: Placement created with packageLpa: null, Notification: "${latestNotif.message}"`);

    console.log('\n======================================================');
    console.log('      ALL TPO PLACEMENT REPORT TESTS PASSED (100%)     ');
    console.log('======================================================\n');
  } finally {
    // Clean up created test data
    console.log('Cleaning up report test fixtures...');
    if (createdPlacementIds.length > 0) await Placement.deleteMany({ _id: { $in: createdPlacementIds } });
    if (createdNotificationIds.length > 0) await Notification.deleteMany({ _id: { $in: createdNotificationIds } });
    if (createdOfferIds.length > 0) await Offer.deleteMany({ _id: { $in: createdOfferIds } });
    if (createdAppIds.length > 0) await Application.deleteMany({ _id: { $in: createdAppIds } });
    if (createdDriveIds.length > 0) await Drive.deleteMany({ _id: { $in: createdDriveIds } });
    if (createdStudentIds.length > 0) await Student.deleteMany({ _id: { $in: createdStudentIds } });
    if (createdUserIds.length > 0) await User.deleteMany({ _id: { $in: createdUserIds } });
    if (createdCompanyIds.length > 0) await Company.deleteMany({ _id: { $in: createdCompanyIds } });
    if (createdCollegeIds.length > 0) await College.deleteMany({ _id: { $in: createdCollegeIds } });

    server.close();
    await mongoose.disconnect();
    console.log('Report test teardown complete.');
  }
}

if (require.main === module) {
  runReportTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Report Test Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = runReportTests;

