/**
 * Phase D Verification Suite - Recruiter College-Wise Applicant Analytics
 *
 * Verifies:
 * 1. Role-based and tenancy authorization (company recruiter, superadmin, participating TPO, foreign recruiter/TPO).
 * 2. Multi-college drive metrics aggregation (applications, unique applicants, selection rates, status counts).
 * 3. Empty/unregistered invited college handling (0 applications reported gracefully).
 * 4. Filtering by collegeId, status, search query, and pagination.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-placement-platform-phase-d-12345';
}
process.env.PORT = '0'; // Use ephemeral free port to avoid collision

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
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
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

async function runTests() {
  console.log('=== PHASE D RECRUITER APPLICANT ANALYTICS TEST SUITE ===\n');

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
    // 1. Seed Test Data
    const ts = Date.now();
    const collegeA = await College.create({
      name: `Apex Engineering Institute ${ts}`,
      code: `AEI${ts.toString().slice(-4)}`,
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });

    const collegeB = await College.create({
      name: `Beacon Institute of Tech ${ts}`,
      code: `BIT${ts.toString().slice(-4)}`,
      city: 'Bengaluru',
      state: 'Karnataka',
      status: 'approved',
    });

    const collegeC = await College.create({
      name: `Crest University ${ts}`,
      code: `CU${ts.toString().slice(-4)}`,
      city: 'Hyderabad',
      state: 'Telangana',
      status: 'approved',
    });

    const collegeForeign = await College.create({
      name: `Foreign Tech College ${ts}`,
      code: `FTC${ts.toString().slice(-4)}`,
      city: 'Chennai',
      state: 'Tamil Nadu',
      status: 'approved',
    });

    const companyA = await Company.create({
      name: `CloudScale Systems ${ts}`,
      industry: 'Software',
    });

    const companyB = await Company.create({
      name: `DataStream Global ${ts}`,
      industry: 'Data Analytics',
    });

    // Users
    const recruiterUser = await User.create({
      name: 'Sarah Recruiter',
      email: `sarah.recruiter.${ts}@cloudscale.com`,
      password: 'password123',
      role: 'recruiter',
      company: companyA._id,
    });

    const otherRecruiterUser = await User.create({
      name: 'Bob Other Recruiter',
      email: `bob.recruiter.${ts}@datastream.com`,
      password: 'password123',
      role: 'recruiter',
      company: companyB._id,
    });

    const tpoUserA = await User.create({
      name: 'Prof. TPO Apex',
      email: `tpo.apex.${ts}@apex.edu`,
      password: 'password123',
      role: 'tpo',
      college: collegeA._id,
    });

    const foreignTpoUser = await User.create({
      name: 'Prof. TPO Foreign',
      email: `tpo.foreign.${ts}@foreign.edu`,
      password: 'password123',
      role: 'tpo',
      college: collegeForeign._id,
    });

    const superadminUser = await User.create({
      name: 'System Superadmin',
      email: `superadmin.${ts}@platform.gov`,
      password: 'password123',
      role: 'superadmin',
    });

    // Students
    // Student 1 (College A, Computer Science, CGPA 8.5)
    const u1 = await User.create({
      name: 'Alice Sharma',
      email: `alice.${ts}@apex.edu`,
      password: 'password123',
      role: 'student',
      college: collegeA._id,
    });
    const s1 = await Student.create({
      user: u1._id,
      college: collegeA._id,
      enrollmentNo: `ENR_A1_${ts}`,
      branch: 'Computer Science',
      cgpa: 8.5,
      phone: '9876543210',
      batchYear: 2025,
    });

    // Student 2 (College A, Information Technology, CGPA 9.1)
    const u2 = await User.create({
      name: 'Aman Patel',
      email: `aman.${ts}@apex.edu`,
      password: 'password123',
      role: 'student',
      college: collegeA._id,
    });
    const s2 = await Student.create({
      user: u2._id,
      college: collegeA._id,
      enrollmentNo: `ENR_A2_${ts}`,
      branch: 'Information Technology',
      cgpa: 9.1,
      phone: '9876543211',
      batchYear: 2025,
    });

    // Student 3 (College B, Electronics, CGPA 7.8)
    const u3 = await User.create({
      name: 'Bhavna Reddy',
      email: `bhavna.${ts}@beacon.edu`,
      password: 'password123',
      role: 'student',
      college: collegeB._id,
    });
    const s3 = await Student.create({
      user: u3._id,
      college: collegeB._id,
      enrollmentNo: `ENR_B1_${ts}`,
      branch: 'Electronics',
      cgpa: 7.8,
      phone: '9876543212',
      batchYear: 2025,
    });

    // Multi-college drive: includes collegeA (primary), collegeB, and collegeC (invited, but no applications yet)
    const drive = await Drive.create({
      role: 'Full Stack Cloud Engineer',
      company: companyA._id,
      college: collegeA._id,
      colleges: [collegeA._id, collegeB._id, collegeC._id],
      packageLpa: 14.5,
      allowedBranches: ['Computer Science', 'Information Technology', 'Electronics'],
      status: 'open',
      location: 'Pune / Remote',
      lastDateToApply: new Date(Date.now() + 86400000 * 2),
      driveDate: new Date(Date.now() + 86400000 * 3),
      applicationsClosed: true,
    });

    // Applications:
    // s1 (College A): selected
    const app1 = await Application.create({
      drive: drive._id,
      student: s1._id,
      status: 'selected',
    });

    // s2 (College A): interview
    const app2 = await Application.create({
      drive: drive._id,
      student: s2._id,
      status: 'interview',
    });

    // s3 (College B): applied
    const app3 = await Application.create({
      drive: drive._id,
      student: s3._id,
      status: 'applied',
    });

    const recruiterToken = makeToken(recruiterUser);
    const otherRecruiterToken = makeToken(otherRecruiterUser);
    const tpoTokenA = makeToken(tpoUserA);
    const foreignTpoToken = makeToken(foreignTpoUser);
    const superadminToken = makeToken(superadminUser);
    const studentToken = makeToken(u1);

    console.log('--- 1. Authorization Tests ---');

    // 1.1 Unauthenticated
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`);
      assert(res.status === 401, 'Unauthenticated request is rejected with 401');
    }

    // 1.2 Student role
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: studentToken });
      assert(res.status === 403, 'Student cannot view recruiter applicant analytics (403)');
    }

    // 1.3 Foreign company recruiter
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: otherRecruiterToken });
      assert(res.status === 403, 'Recruiter from another company is denied (403)');
    }

    // 1.4 Foreign college TPO
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: foreignTpoToken });
      assert(res.status === 403, 'TPO from non-participating college is denied (403)');
    }

    // 1.5 Drive company recruiter
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: recruiterToken });
      assert(res.status === 200, 'Recruiter from hiring company accesses analytics with 200');
      assert(res.data.success === true, 'Response contains success: true');
    }

    // 1.6 Participating college TPO
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: tpoTokenA });
      assert(res.status === 200, 'TPO from participating college A accesses analytics with 200');
    }

    // 1.7 Superadmin
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: superadminToken });
      assert(res.status === 200, 'Superadmin accesses analytics with 200');
    }

    // 1.8 Invalid Drive ID
    {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(`/api/drives/${fakeId}/applicant-analytics`, { token: recruiterToken });
      assert(res.status === 404, 'Non-existent drive returns 404');
    }

    console.log('\n--- 2. Metrics & Aggregation Accuracy Tests ---');

    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, { token: recruiterToken });
      const summary = res.data.summary;
      const colleges = res.data.colleges;

      assert(summary.totalApplications === 3, `Summary totalApplications is 3 (got ${summary.totalApplications})`);
      assert(summary.uniqueApplicants === 3, `Summary uniqueApplicants is 3 (got ${summary.uniqueApplicants})`);
      assert(summary.invitedCollegesCount === 3, `Summary invitedCollegesCount is 3 (got ${summary.invitedCollegesCount})`);
      assert(summary.participatingCollegesCount === 2, `Summary participatingCollegesCount is 2 (got ${summary.participatingCollegesCount})`);
      assert(summary.statuses.selected === 1, 'Summary has 1 selected candidate');
      assert(summary.statuses.interview === 1, 'Summary has 1 interview candidate');
      assert(summary.statuses.applied === 1, 'Summary has 1 applied candidate');

      // Verify college array breakdown
      assert(Array.isArray(colleges), 'colleges is an array');
      assert(colleges.length === 3, `All 3 invited colleges are returned in colleges array (got ${colleges.length})`);

      const colAStat = colleges.find((c) => c.collegeId === collegeA._id.toString());
      assert(Boolean(colAStat), 'College A is present in colleges report');
      assert(colAStat.totalApplications === 2, `College A has 2 applications (got ${colAStat.totalApplications})`);
      assert(colAStat.uniqueApplicants === 2, `College A has 2 unique applicants (got ${colAStat.uniqueApplicants})`);
      assert(colAStat.statuses.selected === 1, 'College A has 1 selected');
      assert(colAStat.statuses.interview === 1, 'College A has 1 interview');
      assert(colAStat.selectionRate === 50, `College A selection rate is 50% (got ${colAStat.selectionRate}%)`);
      assert(colAStat.averageCgpa === 8.8, `College A average CGPA is (8.5+9.1)/2 = 8.8 (got ${colAStat.averageCgpa})`);
      assert(colAStat.branches['COMPUTER SCIENCE'] === 1, 'College A has 1 Computer Science student');
      assert(colAStat.branches['INFORMATION TECHNOLOGY'] === 1, 'College A has 1 Information Technology student');

      const colBStat = colleges.find((c) => c.collegeId === collegeB._id.toString());
      assert(Boolean(colBStat), 'College B is present in colleges report');
      assert(colBStat.totalApplications === 1, 'College B has 1 application');
      assert(colBStat.uniqueApplicants === 1, 'College B has 1 unique applicant');
      assert(colBStat.statuses.applied === 1, 'College B has 1 applied candidate');
      assert(colBStat.selectionRate === 0, 'College B selection rate is 0%');
      assert(colBStat.averageCgpa === 7.8, `College B average CGPA is 7.8 (got ${colBStat.averageCgpa})`);
      assert(colBStat.branches['ELECTRONICS'] === 1, 'College B has 1 Electronics student');

      // College C had zero applications
      const colCStat = colleges.find((c) => c.collegeId === collegeC._id.toString());
      assert(Boolean(colCStat), 'Invited College C with 0 applications is present');
      assert(colCStat.totalApplications === 0, 'College C has 0 applications');
      assert(colCStat.uniqueApplicants === 0, 'College C has 0 unique applicants');
      assert(colCStat.selectionRate === 0, 'College C has 0% selection rate');
      assert(colCStat.averageCgpa === null, 'College C has null average CGPA');
    }

    console.log('\n--- 3. Filtering & Pagination Tests ---');

    // 3.1 Filter by College A
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, {
        token: recruiterToken,
        params: { collegeId: collegeA._id.toString() },
      });
      assert(res.data.applicants.length === 2, `Filtering by College A returns 2 applicants (got ${res.data.applicants.length})`);
      assert(res.data.applicants.every((a) => a.collegeId === collegeA._id.toString()), 'All returned applicants belong to College A');
    }

    // 3.2 Filter by Status = 'selected'
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, {
        token: recruiterToken,
        params: { status: 'selected' },
      });
      assert(res.data.applicants.length === 1, `Filtering by status selected returns 1 applicant (got ${res.data.applicants.length})`);
      assert(res.data.applicants[0].status === 'selected', 'Applicant has status selected');
      assert(res.data.applicants[0].name === 'Alice Sharma', `Applicant is Alice Sharma (got ${res.data.applicants[0].name})`);
    }

    // 3.3 Search by Enrollment No
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, {
        token: recruiterToken,
        params: { search: `ENR_B1_${ts}` },
      });
      assert(res.data.applicants.length === 1, `Search by enrollment returns 1 applicant (got ${res.data.applicants.length})`);
      assert(res.data.applicants[0].name === 'Bhavna Reddy', 'Found Bhavna Reddy');
    }

    // 3.4 Search by Branch
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, {
        token: recruiterToken,
        params: { search: 'Information Technology' },
      });
      assert(res.data.applicants.length === 1, `Search by branch returns 1 applicant (got ${res.data.applicants.length})`);
      assert(res.data.applicants[0].name === 'Aman Patel', 'Found Aman Patel');
    }

    // 3.5 Pagination (limit = 1, page = 2)
    {
      const res = await request(`/api/drives/${drive._id}/applicant-analytics`, {
        token: recruiterToken,
        params: { limit: 1, page: 2 },
      });
      assert(res.data.applicants.length === 1, 'Pagination limit 1 returns 1 applicant');
      assert(res.data.pagination.page === 2, 'Pagination page is 2');
      assert(res.data.pagination.limit === 1, 'Pagination limit is 1');
      assert(res.data.pagination.total === 3, 'Pagination total is 3');
      assert(res.data.pagination.pages === 3, 'Pagination pages is 3');
    }

    // Clean up created entities
    await Application.deleteMany({ drive: drive._id });
    await Drive.findByIdAndDelete(drive._id);
    await Student.deleteMany({ _id: { $in: [s1._id, s2._id, s3._id] } });
    await User.deleteMany({
      _id: {
        $in: [
          recruiterUser._id,
          otherRecruiterUser._id,
          tpoUserA._id,
          foreignTpoUser._id,
          superadminUser._id,
          u1._id,
          u2._id,
          u3._id,
        ],
      },
    });
    await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await College.deleteMany({ _id: { $in: [collegeA._id, collegeB._id, collegeC._id, collegeForeign._id] } });
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
