const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
const { getTestDbUri } = require('./testHelper');

const User = require('../models/User');
const College = require('../models/College');
const Drive = require('../models/Drive');

async function runTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));
  app.use('/api/tpo', require('../routes/tpoRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));
  app.use('/api/placements', require('../routes/placementRoutes'));
  app.use('/api/stats', require('../routes/statsRoutes'));

  const PORT = 5098;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    // Clean up test records
    await College.deleteMany({ code: { $in: ['TEST_COLLEGE', 'IITD_TEST', 'DUPLICATE_CODE', 'BRAND_NEW_1', 'DIFFERENT_CODE', 'ISO_COLLEGE'] } });
    await User.deleteMany({ email: { $in: [
      'lead_tpo@testcollege.edu',
      'second_tpo@testcollege.edu',
      'third_tpo@testcollege.edu',
      'legacy_tpo@testcollege.edu',
      'isolated_tpo@isocollege.edu',
      'diff2@testcollege.edu',
      'different_email@testcollege.edu'
    ] } });

    console.log('\n--- 1. Testing Register New College & First TPO ---');
    const regRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Engineering Institute',
        code: 'test_college', // lowercase to test uppercase conversion
        city: 'Bengaluru',
        state: 'Karnataka',
        website: 'https://testcollege.edu',
        contactEmail: 'contact@testcollege.edu',
        contactPhone: '9876543210',
        tpoName: 'Lead TPO Officer',
        tpoEmail: 'lead_tpo@testcollege.edu',
        tpoPassword: 'Password@123',
        tpoPhone: '9988776655'
      })
    });
    const regData = await regRes.json();
    console.log('Register College Status:', regRes.status);
    console.log('Success:', regData.success);

    // In Task 28 verification workflow, registration creates unverified user and returns 201 without token
    const leadUser = await User.findOne({ email: 'lead_tpo@testcollege.edu' }).populate('college');
    console.log('TPO Role:', leadUser?.role);
    console.log('TPO Approved:', leadUser?.isApproved);
    console.log('College Code:', leadUser?.college?.code);

    if (regRes.status !== 201 || leadUser?.role !== 'tpo' || !leadUser?.isApproved) {
      throw new Error('Failed to register new college or first TPO not approved');
    }
    const testCollegeId = leadUser.college._id;

    // Mark verified, approve college (Task 33B approval flow), and authenticate to obtain leadToken
    leadUser.isEmailVerified = true;
    await leadUser.save();
    await College.findByIdAndUpdate(testCollegeId, { status: 'approved' });

    const leadLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lead_tpo@testcollege.edu', password: 'Password@123' }),
    });
    const leadLoginData = await leadLoginRes.json();
    const leadToken = leadLoginData.token;
    if (!leadToken) throw new Error('Lead TPO login failed');

    console.log('\n--- 2. Testing Uniqueness Validations ---');
    // Test duplicate code
    const dupCodeRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another College With Duplicate Code',
        code: 'TEST_COLLEGE',
        city: 'Mumbai',
        state: 'Maharashtra',
        tpoName: 'Another TPO',
        tpoEmail: 'different_email@testcollege.edu',
        tpoPassword: 'Password@123'
      })
    });
    console.log('Duplicate Code Status (expected 400):', dupCodeRes.status);
    if (dupCodeRes.status !== 400) throw new Error('Duplicate code check failed');

    // Test duplicate college name (case-insensitive)
    const dupNameRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test engineering institute',
        code: 'DIFFERENT_CODE',
        city: 'Pune',
        state: 'Maharashtra',
        tpoName: 'Another TPO',
        tpoEmail: 'diff2@testcollege.edu',
        tpoPassword: 'Password@123'
      })
    });
    console.log('Duplicate Name Status (expected 400):', dupNameRes.status);
    if (dupNameRes.status !== 400) throw new Error('Duplicate name check failed');

    // Test duplicate TPO email
    const dupEmailRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unique Brand New College',
        code: 'BRAND_NEW_1',
        city: 'Delhi',
        state: 'Delhi',
        tpoName: 'Another TPO',
        tpoEmail: 'lead_tpo@testcollege.edu',
        tpoPassword: 'Password@123'
      })
    });
    console.log('Duplicate Email Status (expected 400 or 409):', dupEmailRes.status);
    if (dupEmailRes.status !== 400 && dupEmailRes.status !== 409) throw new Error('Duplicate email check failed');

    console.log('\n--- 3. Testing TPO Registration for Existing College (Pending Approval) ---');
    const secondTpoRes = await fetch(`${BASE_URL}/auth/register/tpo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second TPO Colleague',
        email: 'second_tpo@testcollege.edu',
        password: 'Password@123',
        college: testCollegeId,
        phone: '9123456780'
      })
    });
    const secondTpoData = await secondTpoRes.json();
    const secondUser = secondTpoData.user || secondTpoData.data?.user;
    console.log('Second TPO Status:', secondTpoRes.status);
    console.log('isApproved (expected false):', secondUser?.isApproved);

    if (secondUser?.isApproved !== false) {
      throw new Error('Second TPO was not created with isApproved: false');
    }
    const secondTpoId = secondUser._id;

    // Verify unapproved TPO cannot log in
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'second_tpo@testcollege.edu',
        password: 'Password@123'
      })
    });
    console.log('Unapproved TPO login status (expected 403):', loginRes.status);
    if (loginRes.status !== 403) throw new Error('Unapproved TPO was able to log in!');

    console.log('\n--- 4. Testing GET /api/tpo/pending ---');
    const pendingRes = await fetch(`${BASE_URL}/tpo/pending`, {
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    const pendingData = await pendingRes.json();
    console.log('Pending count:', pendingData.count);
    const foundPending = pendingData.data.find(u => u._id.toString() === secondTpoId.toString());
    console.log('Found second TPO in pending list:', !!foundPending);
    if (!foundPending) throw new Error('Pending TPO not found in GET /api/tpo/pending');

    console.log('\n--- 5. Testing Cross-College Approval Protection ---');
    // Login as NITD TPO
    const nitdLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@college.com',
        password: 'Admin@123'
      })
    });
    const nitdData = await nitdLoginRes.json();
    const nitdToken = nitdData.token || nitdData.data?.token;

    const crossApproveRes = await fetch(`${BASE_URL}/tpo/${secondTpoId}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${nitdToken}` }
    });
    console.log('Cross-college approval status (expected 403):', crossApproveRes.status);
    if (crossApproveRes.status !== 403) throw new Error('Cross-college approval was not blocked!');

    console.log('\n--- 6. Testing Successful Approval by Own College TPO ---');
    const approveRes = await fetch(`${BASE_URL}/tpo/${secondTpoId}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    const approveData = await approveRes.json();
    console.log('Approval status:', approveRes.status);
    const approvedUser = approveData.data || approveData.user;
    console.log('Approved user isApproved:', approvedUser?.isApproved);
    if (approveRes.status !== 200 || !approvedUser?.isApproved) {
      throw new Error('Failed to approve TPO');
    }

    // In Task 28, verify second TPO email before logging in
    await User.updateOne({ email: 'second_tpo@testcollege.edu' }, { $set: { isEmailVerified: true } });

    // Now verify second TPO can log in
    const secondLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'second_tpo@testcollege.edu',
        password: 'Password@123'
      })
    });
    console.log('Approved TPO login status (expected 200):', secondLoginRes.status);
    if (secondLoginRes.status !== 200) throw new Error('Approved TPO could not log in!');

    console.log('\n--- 7. Testing PUT /api/tpo/:id/reject ---');
    // Register a 3rd TPO colleague to test rejection
    const thirdTpoRes = await fetch(`${BASE_URL}/auth/register/tpo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Third TPO Candidate',
        email: 'third_tpo@testcollege.edu',
        password: 'Password@123',
        college: testCollegeId,
        phone: '9555112233'
      })
    });
    const thirdTpoData = await thirdTpoRes.json();
    const thirdUser = thirdTpoData.user || thirdTpoData.data?.user;
    const thirdTpoId = thirdUser._id;

    // Cross-college reject attempt by NITD TPO must fail (403)
    const crossRejectRes = await fetch(`${BASE_URL}/tpo/${thirdTpoId}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${nitdToken}` }
    });
    console.log('Cross-college rejection status (expected 403):', crossRejectRes.status);
    if (crossRejectRes.status !== 403) throw new Error('Cross-college reject was not blocked!');

    // Attempt to reject already approved second TPO must fail (400)
    const rejectApprovedRes = await fetch(`${BASE_URL}/tpo/${secondTpoId}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    console.log('Reject already approved TPO status (expected 400):', rejectApprovedRes.status);
    if (rejectApprovedRes.status !== 400) throw new Error('Rejecting approved TPO was not blocked!');

    // Legitimate rejection by own college TPO
    const rejectRes = await fetch(`${BASE_URL}/tpo/${thirdTpoId}/reject`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    const rejectData = await rejectRes.json();
    console.log('Rejection status (expected 200):', rejectRes.status);
    console.log('Rejection message:', rejectData.message);
    if (rejectRes.status !== 200 || !rejectData.success) throw new Error('Failed to reject pending TPO');

    // Verify user document has been deleted from MongoDB
    const deletedUserCheck = await User.findById(thirdTpoId);
    console.log('Third TPO deleted from DB (expected null):', deletedUserCheck);
    if (deletedUserCheck !== null) throw new Error('Rejected TPO user was not deleted from DB!');

    console.log('\n--- 8. Testing Legacy TPO without isApproved Field ---');
    // Create a TPO user and explicitly remove isApproved from DB document
    const legacyUser = await User.create({
      name: 'Legacy TPO Officer',
      email: 'legacy_tpo@testcollege.edu',
      password: 'Password@123',
      role: 'tpo',
      college: testCollegeId,
      isEmailVerified: true,
    });
    // Unset isApproved directly in DB to simulate pre-existing record
    await User.collection.updateOne({ _id: legacyUser._id }, { $unset: { isApproved: 1 } });

    // Verify Mongoose post('init') safe check treats legacy record as approved
    const fetchedLegacy = await User.findById(legacyUser._id);
    console.log('Fetched legacy TPO isApproved (expected true):', fetchedLegacy.isApproved);
    if (fetchedLegacy.isApproved !== true) {
      throw new Error('Legacy TPO without isApproved was not treated as approved!');
    }

    // Verify legacy TPO can log in
    const legacyLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'legacy_tpo@testcollege.edu',
        password: 'Password@123'
      })
    });
    console.log('Legacy TPO login status (expected 200):', legacyLoginRes.status);
    if (legacyLoginRes.status !== 200) throw new Error('Legacy TPO was unable to log in!');

    // Verify legacy TPO does NOT appear in pending list
    const pendingAfterLegacyRes = await fetch(`${BASE_URL}/tpo/pending`, {
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    const pendingAfterLegacyData = await pendingAfterLegacyRes.json();
    const legacyInPending = pendingAfterLegacyData.data.find(u => u._id.toString() === legacyUser._id.toString());
    console.log('Legacy TPO in pending list (expected false):', !!legacyInPending);
    if (legacyInPending) throw new Error('Legacy TPO appeared in pending list!');

    console.log('\n--- 9. Testing Public GET /api/colleges ---');
    const pubCollegesRes = await fetch(`${BASE_URL}/colleges`);
    const pubCollegesData = await pubCollegesRes.json();
    const testCollegeFound = pubCollegesData.colleges?.find(c => c.code === 'TEST_COLLEGE') ||
                             pubCollegesData.data?.find(c => c.code === 'TEST_COLLEGE');
    console.log('New college appears in public dropdown list:', !!testCollegeFound);
    if (!testCollegeFound) throw new Error('Newly created college not found in public list');

    console.log('\n--- 10. Testing Data Scoping for Newly Registered College (Zero External Records) ---');
    // Register another brand new college: "Isolated Engineering College"
    const isoRegRes = await fetch(`${BASE_URL}/auth/register-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Isolated Engineering College',
        code: 'ISO_COLLEGE',
        city: 'Kolkata',
        state: 'West Bengal',
        tpoName: 'Isolated TPO Officer',
        tpoEmail: 'isolated_tpo@isocollege.edu',
        tpoPassword: 'Password@123'
      })
    });
    const isoRegData = await isoRegRes.json();
    const isoUser = await User.findOne({ email: 'isolated_tpo@isocollege.edu' });
    if (!isoUser) throw new Error('Failed to find isolated college TPO in database');
    isoUser.isEmailVerified = true;
    await isoUser.save();
    await College.findByIdAndUpdate(isoUser.college, { status: 'approved' });

    const isoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'isolated_tpo@isocollege.edu', password: 'Password@123' }),
    });
    const isoLoginData = await isoLoginRes.json();
    const isoToken = isoLoginData.token;
    if (!isoToken) throw new Error('Failed to authenticate isolated college TPO');

    // 10.1 Students check
    const isoStudentsRes = await fetch(`${BASE_URL}/students`, {
      headers: { Authorization: `Bearer ${isoToken}` }
    });
    const isoStudentsData = await isoStudentsRes.json();
    console.log('Isolated TPO Students count (expected 0):', isoStudentsData.total || isoStudentsData.students?.length);
    if ((isoStudentsData.total || 0) !== 0 || (isoStudentsData.students && isoStudentsData.students.length !== 0)) {
      throw new Error(`Isolated college TPO sees other college students! Count: ${isoStudentsData.total}`);
    }

    // 10.2 Drives check
    const isoDrivesRes = await fetch(`${BASE_URL}/drives`, {
      headers: { Authorization: `Bearer ${isoToken}` }
    });
    const isoDrivesData = await isoDrivesRes.json();
    console.log('Isolated TPO Drives count (expected 0):', isoDrivesData.count || isoDrivesData.drives?.length);
    if ((isoDrivesData.count || 0) !== 0 || (isoDrivesData.drives && isoDrivesData.drives.length !== 0)) {
      throw new Error(`Isolated college TPO sees other college drives! Count: ${isoDrivesData.count}`);
    }

    // 10.3 Placements check
    const isoPlacementsRes = await fetch(`${BASE_URL}/placements`, {
      headers: { Authorization: `Bearer ${isoToken}` }
    });
    const isoPlacementsData = await isoPlacementsRes.json();
    console.log('Isolated TPO Placements count (expected 0):', isoPlacementsData.total || isoPlacementsData.placements?.length);
    if ((isoPlacementsData.total || 0) !== 0 || (isoPlacementsData.placements && isoPlacementsData.placements.length !== 0)) {
      throw new Error(`Isolated college TPO sees other college placements! Count: ${isoPlacementsData.total}`);
    }

    // 10.4 Stats Overview check
    const isoStatsRes = await fetch(`${BASE_URL}/stats/overview`, {
      headers: { Authorization: `Bearer ${isoToken}` }
    });
    const isoStatsData = await isoStatsRes.json();
    console.log('Isolated TPO Stats totalStudents (expected 0):', isoStatsData.data?.totalStudents);
    console.log('Isolated TPO Stats totalPlaced (expected 0):', isoStatsData.data?.totalPlaced);
    if (isoStatsData.data?.totalStudents !== 0 || isoStatsData.data?.totalPlaced !== 0) {
      throw new Error('Isolated college TPO stats are not zeroed!');
    }

    // 10.5 Cross-college drive applications check
    // Find an existing drive from NITD/PICT
    const existingExternalDrive = await Drive.findOne({});
    if (existingExternalDrive) {
      const extDriveAppsRes = await fetch(`${BASE_URL}/applications/drive/${existingExternalDrive._id}`, {
        headers: { Authorization: `Bearer ${isoToken}` }
      });
      const extDriveAppsData = await extDriveAppsRes.json();
      console.log('Applications visible from other college drive (expected 0):', extDriveAppsData.count || extDriveAppsData.applications?.length);
      if ((extDriveAppsData.count || 0) !== 0) {
        throw new Error('Isolated college TPO saw applicants from another college drive!');
      }
    }

    // 11. Testing College Settings & Cross-College Security (PUT /api/colleges/my/settings)
    console.log('\n--- 11. Testing College Settings & Cross-College Security ---');
    // 11.1 Own college TPO updates requireStudentApproval
    const updateSettingsRes = await fetch(`${BASE_URL}/colleges/my/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ requireStudentApproval: true }),
    });
    const updateSettingsData = await updateSettingsRes.json();
    console.log('Update Settings Status (expected 200):', updateSettingsRes.status);
    console.log('Updated requireStudentApproval (expected true):', updateSettingsData.settings?.requireStudentApproval);
    if (updateSettingsRes.status !== 200 || updateSettingsData.settings?.requireStudentApproval !== true) {
      throw new Error('Failed to update college settings');
    }

    // Verify GET /api/colleges/my/settings returns the updated value
    const getSettingsRes = await fetch(`${BASE_URL}/colleges/my/settings`, {
      headers: { Authorization: `Bearer ${leadToken}` },
    });
    const getSettingsData = await getSettingsRes.json();
    if (getSettingsRes.status !== 200 || getSettingsData.settings?.requireStudentApproval !== true) {
      throw new Error('GET /api/colleges/my/settings did not return updated settings');
    }
    console.log('GET /api/colleges/my/settings verified: requireStudentApproval=true');

    // 11.2 Cross-college TPO (ISO TPO) attempts to update another college's settings -> MUST get 403
    const crossUpdateRes = await fetch(`${BASE_URL}/colleges/${testCollegeId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${isoToken}`,
      },
      body: JSON.stringify({ requireStudentApproval: false }),
    });
    console.log('Cross-college update status (expected 403):', crossUpdateRes.status);
    if (crossUpdateRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-college settings update, got: ${crossUpdateRes.status}`);
    }

    // 11.3 Cross-college attempt via PUT /api/colleges/my/settings passing another college's ID in body
    const crossUpdateBodyRes = await fetch(`${BASE_URL}/colleges/my/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${isoToken}`,
      },
      body: JSON.stringify({ collegeId: testCollegeId, requireStudentApproval: false }),
    });
    console.log('Cross-college body ID status (expected 403):', crossUpdateBodyRes.status);
    if (crossUpdateBodyRes.status !== 403) {
      throw new Error(`Expected 403 when passing another college's ID, got: ${crossUpdateBodyRes.status}`);
    }
    console.log('✓ Cross-college settings protection verified (HTTP 403)');

    console.log('\n>>> ALL 11 COLLEGE, SETTINGS & MULTI-TENANCY TESTS PASSED SUCCESSFULLY! <<<');
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test data
    await College.deleteMany({ code: { $in: ['TEST_COLLEGE', 'IITD_TEST', 'DUPLICATE_CODE', 'BRAND_NEW_1', 'DIFFERENT_CODE', 'ISO_COLLEGE'] } });
    await User.deleteMany({ email: { $in: [
      'lead_tpo@testcollege.edu',
      'second_tpo@testcollege.edu',
      'third_tpo@testcollege.edu',
      'legacy_tpo@testcollege.edu',
      'isolated_tpo@isocollege.edu',
      'diff2@testcollege.edu',
      'different_email@testcollege.edu'
    ] } });
    server.close();
    await mongoose.connection.close();
    console.log('Test connections closed and test database records cleaned.');
  }
}

runTests();

