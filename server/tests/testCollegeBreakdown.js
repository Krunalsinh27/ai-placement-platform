const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

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
  Application,
  JobRequirement,
  DriveRequest,
} = require('../models');

async function runCollegeBreakdownTests() {
  console.log('--- 1. Connecting to MongoDB Test Database ---');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  assertTestDatabase(mongoose.connection);
  console.log('✓ Connected safely to test DB:', mongoose.connection.name);

  // Set up Express test app
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/job-requirements', require('../routes/jobRequirementRoutes'));

  const PORT = 5124;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  JOB REQUIREMENT COLLEGE BREAKDOWN TEST SUITE        ');
    console.log('======================================================\n');

    const runId = Date.now();

    // Clean up any stale records from previous aborted runs
    await Company.deleteMany({ name: { $regex: /^Breakdown Test Company/ } });
    await College.deleteMany({ code: { $in: ['NITBD', 'PICTBD', 'IITBBD'] } });
    await User.deleteMany({ email: { $regex: /@breakdowntest\.(com|edu)$/ } });
    await Student.deleteMany({ enrollmentNo: { $regex: /^SECRET_ENROLL_/ } });

    // 2. Seed Companies
    const companyA = await Company.create({
      name: `Breakdown Test Company A ${runId}`,
      industry: 'Technology',
      verified: true,
    });

    const companyB = await Company.create({
      name: `Breakdown Test Company B ${runId}`,
      industry: 'Finance',
      verified: true,
    });

    // 3. Seed Colleges
    const college1 = await College.create({
      name: 'National Institute of Technology Breakdown Delhi',
      code: 'NITBD',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'approved',
    });

    const college2 = await College.create({
      name: 'Pune Institute of Breakdown Tech',
      code: 'PICTBD',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });

    const college3 = await College.create({
      name: 'IIT Breakdown Bombay',
      code: 'IITBBD',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });

    // 4. Seed Users and Tokens
    const recUserA = await User.create({
      name: 'Breakdown Recruiter A',
      email: 'recruiter.a@breakdowntest.com',
      password: 'Strong#Password!2026',
      role: 'recruiter',
      company: companyA._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tokenRecruiterA = jwt.sign({ id: recUserA._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const recUserB = await User.create({
      name: 'Breakdown Recruiter B',
      email: 'recruiter.b@breakdowntest.com',
      password: 'Strong#Password!2026',
      role: 'recruiter',
      company: companyB._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tokenRecruiterB = jwt.sign({ id: recUserB._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const tpoUser = await User.create({
      name: 'Breakdown TPO NITD',
      email: 'tpo@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'tpo',
      college: college1._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tokenTpo = jwt.sign({ id: tpoUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const studentUser = await User.create({
      name: 'Breakdown Student Tester',
      email: 'student.secret@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'student',
      college: college1._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const tokenStudent = jwt.sign({ id: studentUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const superadminUser = await User.create({
      name: 'Breakdown Super Admin',
      email: 'superadmin@breakdowntest.com',
      password: 'Strong#Password!2026',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });
    const tokenSuperadmin = jwt.sign({ id: superadminUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 5. Seed Job Requirement for Company A
    const requirementA = await JobRequirement.create({
      company: companyA._id,
      recruiter: recUserA._id,
      title: 'Cloud Systems Architect 2026',
      description: 'Design robust distributed infrastructure for scale.',
      packageLpa: 24.5,
      openings: 8,
      minCgpa: 7.5,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT', 'ECE'],
      batchYear: 2026,
      selectionRounds: ['Online Assessment', 'System Design', 'HR'],
      location: 'Bengaluru / Hybrid',
      status: 'published',
    });

    // 6. Seed Drives for College 1 and College 2
    const drive1 = await Drive.create({
      company: companyA._id,
      college: college1._id,
      jobRequirement: requirementA._id,
      role: 'Cloud Systems Architect',
      packageLpa: 24.5,
      minCgpa: 7.5,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 86400000 * 5),
      driveDate: new Date(Date.now() + 86400000 * 10),
      status: 'open',
      location: 'Campus Auditorium',
    });

    const drive2 = await Drive.create({
      company: companyA._id,
      college: college2._id,
      jobRequirement: requirementA._id,
      role: 'Cloud Systems Architect',
      packageLpa: 24.5,
      minCgpa: 7.5,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      lastDateToApply: new Date(Date.now() + 86400000 * 5),
      driveDate: new Date(Date.now() + 86400000 * 10),
      status: 'open',
      location: 'Seminar Hall 1',
    });

    // 7. Seed Drive Requests for the 3 Colleges
    // College 1: accepted, linked to drive1
    await DriveRequest.create({
      jobRequirement: requirementA._id,
      recruiter: recUserA._id,
      company: companyA._id,
      college: college1._id,
      proposedDates: [new Date(Date.now() + 86400000 * 7)],
      mode: 'on-campus',
      status: 'accepted',
      drive: drive1._id,
    });

    // College 2: scheduled, linked to drive2
    await DriveRequest.create({
      jobRequirement: requirementA._id,
      recruiter: recUserA._id,
      company: companyA._id,
      college: college2._id,
      proposedDates: [new Date(Date.now() + 86400000 * 8)],
      mode: 'on-campus',
      status: 'scheduled',
      drive: drive2._id,
    });

    // College 3: pending, NO drive created
    await DriveRequest.create({
      jobRequirement: requirementA._id,
      recruiter: recUserA._id,
      company: companyA._id,
      college: college3._id,
      proposedDates: [new Date(Date.now() + 86400000 * 9)],
      mode: 'on-campus',
      status: 'pending',
      drive: null,
    });

    // 8. Seed Students and Applications
    // College 1 has 3 applicants (shortlisted, interview, selected)
    const stCol1A = await Student.create({
      user: studentUser._id,
      college: college1._id,
      enrollmentNo: 'SECRET_ENROLL_001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.8,
      backlogs: 0,
      phone: '9888877771',
    });
    await Application.create({
      drive: drive1._id,
      student: stCol1A._id,
      status: 'shortlisted',
    });

    const userCol1B = await User.create({
      name: 'Private Student 2',
      email: 'secret2@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'student',
      college: college1._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const stCol1B = await Student.create({
      user: userCol1B._id,
      college: college1._id,
      enrollmentNo: 'SECRET_ENROLL_002',
      branch: 'IT',
      batchYear: 2026,
      cgpa: 8.2,
      backlogs: 0,
      phone: '9888877772',
    });
    await Application.create({
      drive: drive1._id,
      student: stCol1B._id,
      status: 'interview',
    });

    const userCol1C = await User.create({
      name: 'Private Student 3',
      email: 'secret3@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'student',
      college: college1._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const stCol1C = await Student.create({
      user: userCol1C._id,
      college: college1._id,
      enrollmentNo: 'SECRET_ENROLL_003',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 9.1,
      backlogs: 0,
      phone: '9888877773',
    });
    await Application.create({
      drive: drive1._id,
      student: stCol1C._id,
      status: 'selected',
    });

    // College 2 has 2 applicants (applied, shortlisted)
    const userCol2A = await User.create({
      name: 'Private Student 4',
      email: 'secret4@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'student',
      college: college2._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const stCol2A = await Student.create({
      user: userCol2A._id,
      college: college2._id,
      enrollmentNo: 'SECRET_ENROLL_004',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.0,
      backlogs: 0,
      phone: '9888877774',
    });
    await Application.create({
      drive: drive2._id,
      student: stCol2A._id,
      status: 'applied',
    });

    const userCol2B = await User.create({
      name: 'Private Student 5',
      email: 'secret5@breakdowntest.edu',
      password: 'Strong#Password!2026',
      role: 'student',
      college: college2._id,
      isApproved: true,
      isEmailVerified: true,
    });
    const stCol2B = await Student.create({
      user: userCol2B._id,
      college: college2._id,
      enrollmentNo: 'SECRET_ENROLL_005',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9888877775',
    });
    await Application.create({
      drive: drive2._id,
      student: stCol2B._id,
      status: 'shortlisted',
    });

    // College 3 has 0 applications.

    console.log('✓ Test data successfully seeded in test database\n');

    // =========================================================================
    // TEST 1: Recruiter A gets valid college breakdown with exact counts & zero PII
    // =========================================================================
    console.log('--- TEST 1: Recruiter A requests college breakdown (200 OK) ---');
    const resA = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenRecruiterA}` },
    });
    if (resA.status !== 200) {
      const errText = await resA.text();
      throw new Error(`TEST 1 Failed: Expected status 200, got ${resA.status}: ${errText}`);
    }
    const dataA = await resA.json();
    console.log('Totals returned:', JSON.stringify(dataA.totals));
    console.log('Rows returned:', dataA.rows.length);

    if (dataA.totals.colleges !== 3) throw new Error(`Expected 3 colleges, got ${dataA.totals.colleges}`);
    if (dataA.totals.requestsSent !== 3) throw new Error(`Expected 3 requestsSent, got ${dataA.totals.requestsSent}`);
    if (dataA.totals.drivesCreated !== 2) throw new Error(`Expected 2 drivesCreated, got ${dataA.totals.drivesCreated}`);
    if (dataA.totals.applicants !== 5) throw new Error(`Expected 5 total applicants, got ${dataA.totals.applicants}`);

    // Verify row ordering (applied desc, name asc)
    const row1 = dataA.rows[0];
    const row2 = dataA.rows[1];
    const row3 = dataA.rows[2];

    if (row1.applied !== 3 || row1.code !== 'NITBD') {
      throw new Error(`Expected row 1 to be NITBD with 3 applied, got ${row1.code} with ${row1.applied}`);
    }
    if (row1.statusCounts.shortlisted !== 1 || row1.statusCounts.interview !== 1 || row1.statusCounts.selected !== 1) {
      throw new Error(`Incorrect status counts for row 1: ${JSON.stringify(row1.statusCounts)}`);
    }

    if (row2.applied !== 2 || row2.code !== 'PICTBD') {
      throw new Error(`Expected row 2 to be PICTBD with 2 applied, got ${row2.code} with ${row2.applied}`);
    }

    if (row3.applied !== 0 || row3.code !== 'IITBBD') {
      throw new Error(`Expected row 3 to be IITBBD with 0 applied, got ${row3.code} with ${row3.applied}`);
    }
    if (row3.driveId !== null || row3.driveStatus !== null) {
      throw new Error(`Expected row 3 driveId and driveStatus to be null, got driveId=${row3.driveId}`);
    }
    if (row3.driveRequestStatus !== 'pending') {
      throw new Error(`Expected row 3 driveRequestStatus to be 'pending', got ${row3.driveRequestStatus}`);
    }

    // Verify Zero PII
    const rawJsonA = JSON.stringify(dataA);
    const piiMatches = [
      'SECRET_ENROLL',
      'secret@breakdowntest.edu',
      'secret2@breakdowntest.edu',
      '9888877771',
      'Breakdown Student Tester',
    ].filter((pii) => rawJsonA.includes(pii));

    if (piiMatches.length > 0) {
      throw new Error(`Privacy breach! Found student PII in breakdown response: ${piiMatches.join(', ')}`);
    }
    console.log('✓ TEST 1 Passed: Totals, rows, ordering, zero applicant handling, and Zero PII verified\n');

    // =========================================================================
    // TEST 2: Recruiter B (another company) is rejected with 403 Forbidden
    // =========================================================================
    console.log('--- TEST 2: Recruiter B of another company requests breakdown (403 Forbidden) ---');
    const resB = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenRecruiterB}` },
    });
    if (resB.status !== 403) {
      throw new Error(`TEST 2 Failed: Expected status 403, got ${resB.status}`);
    }
    const errB = await resB.json();
    if (!errB.message.includes('belongs to another company')) {
      throw new Error(`TEST 2 Failed: Unexpected message: ${errB.message}`);
    }
    console.log('✓ TEST 2 Passed: Cross-company access rejected with 403 Forbidden\n');

    // =========================================================================
    // TEST 3: TPO is rejected with 403 Forbidden
    // =========================================================================
    console.log('--- TEST 3: TPO requests breakdown (403 Forbidden) ---');
    const resTpo = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenTpo}` },
    });
    if (resTpo.status !== 403) {
      throw new Error(`TEST 3 Failed: Expected status 403, got ${resTpo.status}`);
    }
    console.log('✓ TEST 3 Passed: TPO role rejected with 403 Forbidden\n');

    // =========================================================================
    // TEST 4: Student is rejected with 403 Forbidden
    // =========================================================================
    console.log('--- TEST 4: Student requests breakdown (403 Forbidden) ---');
    const resStudent = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenStudent}` },
    });
    if (resStudent.status !== 403) {
      throw new Error(`TEST 4 Failed: Expected status 403, got ${resStudent.status}`);
    }
    console.log('✓ TEST 4 Passed: Student role rejected with 403 Forbidden\n');

    // =========================================================================
    // TEST 5: Superadmin can access requirement breakdown (200 OK)
    // =========================================================================
    console.log('--- TEST 5: Superadmin requests breakdown (200 OK) ---');
    const resAdmin = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenSuperadmin}` },
    });
    if (resAdmin.status !== 200) {
      throw new Error(`TEST 5 Failed: Expected status 200, got ${resAdmin.status}`);
    }
    const dataAdmin = await resAdmin.json();
    if (dataAdmin.totals.colleges !== 3 || dataAdmin.rows.length !== 3) {
      throw new Error(`TEST 5 Failed: Superadmin received unexpected totals: ${JSON.stringify(dataAdmin.totals)}`);
    }
    console.log('✓ TEST 5 Passed: Superadmin successfully accessed breakdown\n');

    // =========================================================================
    // TEST 6: Invalid ObjectId parameter returns 400 Bad Request
    // =========================================================================
    console.log('--- TEST 6: Invalid ObjectId parameter returns 400 Bad Request ---');
    const resInvalid = await fetch(`${BASE_URL}/job-requirements/not-a-valid-object-id/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenRecruiterA}` },
    });
    if (resInvalid.status !== 400) {
      throw new Error(`TEST 6 Failed: Expected status 400, got ${resInvalid.status}`);
    }
    console.log('✓ TEST 6 Passed: Invalid ObjectId rejected with 400 Bad Request\n');

    // =========================================================================
    // TEST 7: Non-existent ObjectId parameter returns 404 Not Found
    // =========================================================================
    console.log('--- TEST 7: Non-existent ObjectId parameter returns 404 Not Found ---');
    const nonExistentId = new mongoose.Types.ObjectId();
    const resNotFound = await fetch(`${BASE_URL}/job-requirements/${nonExistentId}/college-breakdown`, {
      headers: { Authorization: `Bearer ${tokenRecruiterA}` },
    });
    if (resNotFound.status !== 404) {
      throw new Error(`TEST 7 Failed: Expected status 404, got ${resNotFound.status}`);
    }
    console.log('✓ TEST 7 Passed: Non-existent ObjectId returns 404 Not Found\n');

    // =========================================================================
    // TEST 8: CSV Export format returns valid CSV attachment
    // =========================================================================
    console.log('--- TEST 8: CSV Export format returns 200 OK with text/csv ---');
    const resCsv = await fetch(`${BASE_URL}/job-requirements/${requirementA._id}/college-breakdown?format=csv`, {
      headers: { Authorization: `Bearer ${tokenRecruiterA}` },
    });
    if (resCsv.status !== 200) {
      throw new Error(`TEST 8 Failed: Expected status 200, got ${resCsv.status}`);
    }
    const contentType = resCsv.headers.get('content-type') || '';
    if (!contentType.includes('text/csv')) {
      throw new Error(`TEST 8 Failed: Expected content-type text/csv, got "${contentType}"`);
    }
    const csvContent = await resCsv.text();
    console.log('CSV Content Preview:\n' + csvContent.split('\r\n').slice(0, 4).join('\n'));

    if (!csvContent.includes('"College Name","College Code","City","Drive Request Status","Drive Status","Total Applied"')) {
      throw new Error('TEST 8 Failed: CSV header missing expected column names');
    }
    if (!csvContent.includes('NITBD') || !csvContent.includes('PICTBD') || !csvContent.includes('IITBBD')) {
      throw new Error('TEST 8 Failed: CSV body missing expected college codes');
    }
    console.log('✓ TEST 8 Passed: CSV export format returned valid CSV structure\n');

    // =========================================================================
    // Cleanup disposable test data
    // =========================================================================
    console.log('--- Cleaning up disposable test records ---');
    await Application.deleteMany({ drive: { $in: [drive1._id, drive2._id] } });
    await Student.deleteMany({ _id: { $in: [stCol1A._id, stCol1B._id, stCol1C._id, stCol2A._id, stCol2B._id] } });
    await User.deleteMany({ _id: { $in: [recUserA._id, recUserB._id, tpoUser._id, studentUser._id, superadminUser._id, userCol1B._id, userCol1C._id, userCol2A._id, userCol2B._id] } });
    await DriveRequest.deleteMany({ jobRequirement: requirementA._id });
    await Drive.deleteMany({ _id: { $in: [drive1._id, drive2._id] } });
    await JobRequirement.deleteMany({ _id: requirementA._id });
    await College.deleteMany({ _id: { $in: [college1._id, college2._id, college3._id] } });
    await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    console.log('✓ Test records cleaned up safely');

    console.log('\n======================================================');
    console.log('  ALL COLLEGE BREAKDOWN TESTS PASSED SUCCESSFULLY!    ');
    console.log('======================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runCollegeBreakdownTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
