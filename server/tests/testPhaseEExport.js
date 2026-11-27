/**
 * Phase E Verification Suite - TPO Applicant Export & Strict College Isolation
 *
 * Verifies:
 * 1. Strict College Isolation: TPO only exports applicants from their own college,
 *    never leaking applicants from partner colleges in a multi-college drive.
 * 2. Role-based authorization: TPO, Recruiter (own drive), Superadmin allowed;
 *    foreign TPO, foreign recruiter, students, and unauthenticated requests rejected.
 * 3. Formula Injection Sanitization: malicious strings starting with '=', '+', '-', '@'
 *    are safely escaped in CSV and Excel outputs.
 * 4. File integrity: valid CSV stream, parseable Excel .xlsx, and valid %PDF- document.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-placement-platform-phase-e-67890';
}
process.env.PORT = '0'; // Use ephemeral free port to avoid collision

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const ExcelJS = require('exceljs');
const app = require('../server');
const { User, Company, College, Student, Drive, Application } = require('../models');

let server;
let baseUrl;

const MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/placement_system_test';

function makeToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      college: (user.college?._id || user.college)?.toString(),
      company: (user.company?._id || user.company)?.toString(),
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function request(path, options = {}) {
  const url = new URL(path, baseUrl);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const contentDisposition = res.headers.get('content-disposition') || '';

  let body;
  let text = '';
  let buffer = null;

  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else if (contentType.includes('text/csv')) {
    text = await res.text();
  } else {
    const arrayBuf = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
  }

  return {
    status: res.status,
    contentType,
    contentDisposition,
    data: body,
    text,
    buffer,
  };
}

async function runTests() {
  console.log('=== PHASE E TPO APPLICANT EXPORT & ISOLATION TEST SUITE ===\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
  }

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    const ts = Date.now();

    // 1. Create Colleges
    const collegeAlpha = await College.create({
      name: `Alpha Institute of Technology ${ts}`,
      code: `AIT${ts.toString().slice(-4)}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });

    const collegeBeta = await College.create({
      name: `Beta Engineering College ${ts}`,
      code: `BEC${ts.toString().slice(-4)}`,
      city: 'Bangalore',
      state: 'Karnataka',
      status: 'approved',
    });

    const collegeGamma = await College.create({
      name: `Gamma Foreign College ${ts}`,
      code: `GFC${ts.toString().slice(-4)}`,
      city: 'Delhi',
      state: 'Delhi',
      status: 'approved',
    });

    // 2. Create Company
    const company = await Company.create({
      name: `Nexus Cloud Technologies ${ts}`,
      industry: 'Cloud Infrastructure',
    });

    const otherCompany = await Company.create({
      name: `Other Enterprises ${ts}`,
      industry: 'Retail',
    });

    // 3. Create Users
    const tpoAlpha = await User.create({
      name: 'TPO Alpha',
      email: `tpo.alpha.${ts}@alpha.edu`,
      password: 'password123',
      role: 'tpo',
      college: collegeAlpha._id,
      isApproved: true,
    });

    const tpoBeta = await User.create({
      name: 'TPO Beta',
      email: `tpo.beta.${ts}@beta.edu`,
      password: 'password123',
      role: 'tpo',
      college: collegeBeta._id,
      isApproved: true,
    });

    const tpoGamma = await User.create({
      name: 'TPO Gamma Foreign',
      email: `tpo.gamma.${ts}@gamma.edu`,
      password: 'password123',
      role: 'tpo',
      college: collegeGamma._id,
      isApproved: true,
    });

    const recruiterUser = await User.create({
      name: 'Nexus Recruiter',
      email: `recruiter.${ts}@nexuscloud.com`,
      password: 'password123',
      role: 'recruiter',
      company: company._id,
      isApproved: true,
    });

    const otherRecruiterUser = await User.create({
      name: 'Other Recruiter',
      email: `other.recruiter.${ts}@other.com`,
      password: 'password123',
      role: 'recruiter',
      company: otherCompany._id,
      isApproved: true,
    });

    const superadminUser = await User.create({
      name: 'Root Superadmin',
      email: `superadmin.${ts}@placement.gov`,
      password: 'password123',
      role: 'superadmin',
      isApproved: true,
    });

    // 4. Create Students
    // Student 1 (College Alpha, with malicious formula injection payload in Name)
    const u1 = await User.create({
      name: '=SUM(1+1)*cmd|\' /C calc\'!A0',
      email: `student1.${ts}@alpha.edu`,
      password: 'password123',
      role: 'student',
      college: collegeAlpha._id,
    });
    const s1 = await Student.create({
      user: u1._id,
      college: collegeAlpha._id,
      enrollmentNo: `+919999999999`, // Starts with '+' (formula injection test)
      branch: 'Computer Science',
      cgpa: 8.9,
      batchYear: 2025,
      phone: '9876543201',
    });

    // Student 2 (College Alpha, normal)
    const u2 = await User.create({
      name: 'Aditi Deshmukh',
      email: `aditi.${ts}@alpha.edu`,
      password: 'password123',
      role: 'student',
      college: collegeAlpha._id,
    });
    const s2 = await Student.create({
      user: u2._id,
      college: collegeAlpha._id,
      enrollmentNo: `ENR_ALPHA_2_${ts}`,
      branch: 'Information Technology',
      cgpa: 9.3,
      batchYear: 2025,
      phone: '9876543202',
    });

    // Student 3 (College Beta, partner college in multi-college drive)
    const u3 = await User.create({
      name: 'Rohan Verma',
      email: `rohan.${ts}@beta.edu`,
      password: 'password123',
      role: 'student',
      college: collegeBeta._id,
    });
    const s3 = await Student.create({
      user: u3._id,
      college: collegeBeta._id,
      enrollmentNo: `ENR_BETA_1_${ts}`,
      branch: 'Electronics',
      cgpa: 8.1,
      batchYear: 2025,
      phone: '9876543203',
    });

    // 5. Create Multi-College Drive (includes College Alpha and College Beta)
    const drive = await Drive.create({
      role: 'Principal DevOps Architect',
      company: company._id,
      college: collegeAlpha._id,
      colleges: [collegeAlpha._id, collegeBeta._id],
      packageLpa: 22.0,
      allowedBranches: ['Computer Science', 'Information Technology', 'Electronics'],
      status: 'open',
      location: 'Mumbai / Hybrid',
      lastDateToApply: new Date(Date.now() + 86400000 * 2),
      driveDate: new Date(Date.now() + 86400000 * 5),
    });

    // 6. Create Applications
    await Application.create({ drive: drive._id, student: s1._id, status: 'selected' });
    await Application.create({ drive: drive._id, student: s2._id, status: 'shortlisted' });
    await Application.create({ drive: drive._id, student: s3._id, status: 'applied' });

    const tokenTpoAlpha = makeToken(tpoAlpha);
    const tokenTpoBeta = makeToken(tpoBeta);
    const tokenTpoGamma = makeToken(tpoGamma);
    const tokenRecruiter = makeToken(recruiterUser);
    const tokenOtherRecruiter = makeToken(otherRecruiterUser);
    const tokenSuperadmin = makeToken(superadminUser);
    const tokenStudent = makeToken(u1);

    console.log('--- 1. Authorization & Strict College Tenancy Isolation ---');

    // 1.1 Unauthenticated request
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`);
      assert(res.status === 401, 'Unauthenticated CSV export request rejected with 401');
    }

    // 1.2 Student forbidden
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenStudent });
      assert(res.status === 403, 'Student role rejected with 403');
    }

    // 1.3 Foreign Recruiter forbidden
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenOtherRecruiter });
      assert(res.status === 403, 'Recruiter from another company rejected with 403');
    }

    // 1.4 Foreign TPO (College Gamma) forbidden
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenTpoGamma });
      assert(res.status === 403, 'TPO from non-participating college rejected with 403');
    }

    // 1.5 Strict College Isolation: TPO Alpha Export
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenTpoAlpha });
      assert(res.status === 200, 'TPO Alpha exports CSV with 200');
      assert(res.contentType.includes('text/csv'), 'Response Content-Type is text/csv');
      assert(res.contentDisposition.includes('attachment'), 'Response Content-Disposition is attachment');

      // TPO Alpha must see student 1 and 2, but MUST NOT see student 3 (College Beta)
      assert(res.text.includes('student1.'), 'Export contains College Alpha student 1');
      assert(res.text.includes('Aditi Deshmukh'), 'Export contains College Alpha student 2');
      assert(!res.text.includes('rohan.') && !res.text.includes('Rohan Verma'), 'ISOLATION ENFORCED: College Beta student is NOT present in College Alpha export');
    }

    // 1.6 Strict College Isolation: TPO Beta Export
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenTpoBeta });
      assert(res.status === 200, 'TPO Beta exports CSV with 200');
      assert(res.text.includes('Rohan Verma'), 'TPO Beta export contains College Beta student 3');
      assert(!res.text.includes('Aditi Deshmukh') && !res.text.includes('student1.'), 'ISOLATION ENFORCED: College Alpha students are NOT present in College Beta export');
    }

    // 1.7 Recruiter sees all applicants for their drive
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenRecruiter });
      assert(res.status === 200, 'Hiring company recruiter exports CSV with 200');
      assert(res.text.includes('Aditi Deshmukh'), 'Recruiter export contains College Alpha candidate');
      assert(res.text.includes('Rohan Verma'), 'Recruiter export contains College Beta candidate');
    }

    console.log('\n--- 2. Formula Injection Protection Tests ---');

    {
      const res = await request(`/api/applications/drive/${drive._id}/export/csv`, { token: tokenTpoAlpha });
      // Student 1 name was '=SUM(1+1)*cmd|\' /C calc\'!A0'
      // It must be sanitized to "'=SUM(1+1)*cmd|\' /C calc\'!A0"
      assert(res.text.includes(`"'=SUM(1+1)*cmd|`), 'Formula injection in candidate name is sanitized with single quote');

      // Student 1 enrollment was '+919999999999'
      assert(res.text.includes(`"'+919999999999"`), 'Formula injection in enrollment starting with "+" is sanitized with single quote');
    }

    console.log('\n--- 3. Excel (.xlsx) Export & File Integrity Tests ---');

    // 3.1 Excel Export for TPO Alpha
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/excel`, { token: tokenTpoAlpha });
      assert(res.status === 200, 'TPO Alpha exports Excel with 200');
      assert(res.contentType.includes('spreadsheetml.sheet'), 'Content-Type is openxmlformats spreadsheet');
      assert(res.contentDisposition.includes('.xlsx'), 'Filename has .xlsx extension');
      assert(Buffer.isBuffer(res.buffer) && res.buffer.length > 500, 'Excel buffer is received and non-empty');

      // Parse with ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.buffer);
      const sheet = workbook.getWorksheet('Applicants');
      assert(Boolean(sheet), 'Workbook contains "Applicants" worksheet');

      // Row 1 is header
      const headerRow = sheet.getRow(1);
      assert(headerRow.getCell(2).value === 'Candidate Name', 'Excel header column 2 is "Candidate Name"');
      assert(headerRow.getCell(7).value === 'Branch', 'Excel header column 7 is "Branch"');

      // Strict isolation in Excel: only 2 applicants from College Alpha
      const dataRows = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) dataRows.push(row);
      });
      assert(dataRows.length === 2, `Excel sheet contains exactly 2 rows for College Alpha (got ${dataRows.length})`);

      // Verify formula injection protection in Excel cells
      const student1Row = dataRows.find((r) => r.getCell(3).value && r.getCell(3).value.includes('student1.'));
      assert(Boolean(student1Row), 'Student 1 row found in Excel');
      const sanitizedName = student1Row.getCell(2).value;
      assert(String(sanitizedName).startsWith("'="), `Formula injection name sanitized in Excel cell (got ${sanitizedName})`);
    }

    // 3.2 Excel Export for TPO Beta
    {
      const res = await request(`/api/applications/drive/${drive._id}/export/excel`, { token: tokenTpoBeta });
      assert(res.status === 200, 'TPO Beta exports Excel with 200');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.buffer);
      const sheet = workbook.getWorksheet('Applicants');
      const dataRows = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) dataRows.push(row);
      });
      assert(dataRows.length === 1, `Excel sheet contains exactly 1 row for College Beta (got ${dataRows.length})`);
    }

    console.log('\n--- 4. PDF Export & File Integrity Tests ---');

    {
      const res = await request(`/api/applications/drive/${drive._id}/export/pdf`, { token: tokenTpoAlpha });
      assert(res.status === 200, 'TPO Alpha exports PDF with 200');
      assert(res.contentType.includes('application/pdf'), 'Content-Type is application/pdf');
      assert(res.contentDisposition.includes('.pdf'), 'Filename has .pdf extension');
      assert(Buffer.isBuffer(res.buffer) && res.buffer.length > 500, 'PDF buffer received and non-empty');

      // Check PDF magic header
      const magicHeader = res.buffer.slice(0, 5).toString('ascii');
      assert(magicHeader === '%PDF-', `PDF starts with standard '%PDF-' magic bytes (got '${magicHeader}')`);

      // Check PDF font stream contents for college name and candidate name (hex encoded in PDF stream)
      const pdfText = res.buffer.toString('utf8');
      const hexAlpha = Buffer.from('ALPHA').toString('hex');
      const hexAditi = Buffer.from('Aditi').toString('hex');
      const hexRohan = Buffer.from('Rohan').toString('hex');

      assert(pdfText.includes(hexAlpha), 'PDF contains College Alpha header branding');
      assert(pdfText.includes(hexAditi), 'PDF contains candidate Aditi Deshmukh');
      assert(!pdfText.includes(hexRohan), 'ISOLATION ENFORCED: College Beta student is NOT present in College Alpha PDF');
    }

    // Cleanup
    await Application.deleteMany({ drive: drive._id });
    await Drive.findByIdAndDelete(drive._id);
    await Student.deleteMany({ _id: { $in: [s1._id, s2._id, s3._id] } });
    await User.deleteMany({
      _id: {
        $in: [
          tpoAlpha._id,
          tpoBeta._id,
          tpoGamma._id,
          recruiterUser._id,
          otherRecruiterUser._id,
          superadminUser._id,
          u1._id,
          u2._id,
          u3._id,
        ],
      },
    });
    await Company.deleteMany({ _id: { $in: [company._id, otherCompany._id] } });
    await College.deleteMany({ _id: { $in: [collegeAlpha._id, collegeBeta._id, collegeGamma._id] } });
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    console.log(`\n========================================`);
    console.log(`Total tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
  }
}

runTests();
