const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.EMAIL_MODE = 'console'; // Default to console mode so automated tests don't exhaust SMTP quota
process.env.NODE_ENV = 'test';

const emailService = require('../utils/emailService');
const bcrypt = require('bcryptjs');

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Offer,
  Application,
  Aspirant,
} = require('../models');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

function getTestDbUri() {
  if (process.env.MONGO_URI_TEST) return process.env.MONGO_URI_TEST;
  const base = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  if (base.includes('?')) {
    const [dbPart, query] = base.split('?');
    return `${dbPart.replace(/_test$/, '')}_test?${query}`;
  }
  return `${base.replace(/_test$/, '')}_test`;
}

// Deep inspection helper to verify zero student PII leaks
function auditPrivacy(obj, path = '') {
  const forbiddenKeys = [
    'enrollmentno',
    'rollnumber',
    'resumeurl',
    'cgpa',
    'backlogs',
    'chatmessages',
    'driverequests',
  ];

  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => auditPrivacy(item, `${path}[${idx}]`));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (forbiddenKeys.includes(lowerKey)) {
      throw new Error(`[PRIVACY VIOLATION] Forbidden student field "${key}" found at path "${path}.${key}"`);
    }

    if (obj.role === 'student' && (obj.email || obj.name)) {
      throw new Error(`[PRIVACY VIOLATION] Student user object exposed at path "${path}"`);
    }

    auditPrivacy(value, path ? `${path}.${key}` : key);
  }
}

async function runAspirantTests() {
  console.log('Connecting to MongoDB Test Database...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));
  app.use('/api/aspirant', require('../routes/aspirantRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));
  app.use('/api/placements', require('../routes/placementRoutes'));
  app.use('/api/analytics', require('../routes/analyticsRoutes'));
  app.use('/api/superadmin', require('../routes/superadminRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5098;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('     TASK 34: ASPIRANT ROLE & REGISTRATION TESTS      ');
    console.log('======================================================\n');

    // Clean test leftovers
    await User.deleteMany({ email: { $regex: /@aspirant-test\.com$/ } });
    await College.deleteMany({ code: { $regex: /^TEST_ASP_/ } });

    // Seed 2 Approved Colleges for test
    const colA = await College.create({
      name: 'Delhi Institute of Engineering',
      code: 'TEST_ASP_A',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'approved',
    });

    const colB = await College.create({
      name: 'Mumbai Polytechnic College',
      code: 'TEST_ASP_B',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });

    const colC = await College.create({
      name: 'Bengaluru Tech University',
      code: 'TEST_ASP_C',
      city: 'Bengaluru',
      state: 'Karnataka',
      status: 'approved',
    });

    const colD = await College.create({
      name: 'Chennai College of Tech',
      code: 'TEST_ASP_D',
      city: 'Chennai',
      state: 'Tamil Nadu',
      status: 'approved',
    });

    // ------------------------------------------------------------------------
    // TEST 1: Aspirant Registration, OTP Verification, and Auto-Approval
    // ------------------------------------------------------------------------
    console.log('--- TEST 1: Aspirant Registration & OTP Auto-Approval ---');
    const aspirantEmail = 'raj.aspirant@aspirant-test.com';

    const regRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Raj Verma',
        email: aspirantEmail,
        password: 'Password@123',
        state: 'Delhi',
        interestedBranches: ['CSE', 'IT', 'AI & DS'],
        twelfthStream: 'Science (PCM)',
      }),
    });
    const regData = await regRes.json();
    console.log('Registration status:', regRes.status, 'success:', regData.success);
    if (regRes.status !== 201 || !regData.success) {
      throw new Error(`Aspirant registration failed: ${JSON.stringify(regData)}`);
    }

    // Verify Aspirant record in DB
    const createdUser = await User.findOne({ email: aspirantEmail });
    if (!createdUser || createdUser.role !== 'aspirant' || !createdUser.isApproved) {
      throw new Error('Aspirant user must have role="aspirant" and isApproved=true');
    }
    console.log('✓ Aspirant registered with isApproved: true and role: "aspirant"');

    const aspirantProfile = await Aspirant.findOne({ user: createdUser._id });
    if (!aspirantProfile || aspirantProfile.state !== 'Delhi') {
      throw new Error('Aspirant model document not created properly');
    }
    console.log('✓ Aspirant document created with preferences (state: Delhi, branches: CSE, IT, AI & DS)');

    // Attempt login before OTP verification -> Must be rejected (403 unverified)
    const preVerifyLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aspirantEmail, password: 'Password@123' }),
    });
    console.log('Pre-verification login status:', preVerifyLoginRes.status);
    if (preVerifyLoginRes.status !== 403) {
      throw new Error('Unverified aspirant must not be allowed to log in');
    }
    console.log('✓ Unverified aspirant blocked from login with HTTP 403');

    // Simulate OTP verification
    createdUser.isEmailVerified = true;
    createdUser.otpHash = null;
    await createdUser.save();

    // Login after OTP verification -> Must succeed immediately with HTTP 200
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aspirantEmail, password: 'Password@123' }),
    });
    const loginData = await loginRes.json();
    console.log('Post-verification login status:', loginRes.status, 'token received:', !!loginData.token);
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Aspirant login failed: ${JSON.stringify(loginData)}`);
    }
    console.log('✓ Verified aspirant logs in successfully without admin approval wait');

    const aspirantToken = loginData.token;

    // ------------------------------------------------------------------------
    // TEST 2: Aspirant Preferences GET & PUT
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Aspirant Preferences (GET / PUT /api/aspirant/me) ---');
    const meRes = await fetch(`${BASE_URL}/aspirant/me`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const meData = await meRes.json();
    console.log('Aspirant get me status:', meRes.status, 'branches:', meData.aspirant?.interestedBranches);
    if (meRes.status !== 200 || meData.aspirant?.state !== 'Delhi') {
      throw new Error('Failed to retrieve aspirant preferences');
    }

    const updatePrefRes = await fetch(`${BASE_URL}/aspirant/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aspirantToken}`,
      },
      body: JSON.stringify({
        state: 'Maharashtra',
        interestedBranches: ['CSE', 'ECE'],
        twelfthStream: 'Science',
      }),
    });
    const updatePrefData = await updatePrefRes.json();
    console.log('Update preferences status:', updatePrefRes.status, 'updated state:', updatePrefData.aspirant?.state);
    if (updatePrefRes.status !== 200 || updatePrefData.aspirant?.state !== 'Maharashtra') {
      throw new Error('Failed to update aspirant preferences');
    }
    console.log('✓ Aspirant preferences successfully updated');

    // ------------------------------------------------------------------------
    // TEST 3: Shortlist College CRUD & Public Aggregates
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Shortlist College Management ---');
    const addShortlistRes = await fetch(`${BASE_URL}/aspirant/shortlist/${colA._id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const addShortlistData = await addShortlistRes.json();
    console.log('Add to shortlist status:', addShortlistRes.status, 'message:', addShortlistData.message);
    if (addShortlistRes.status !== 200) {
      throw new Error('Failed to add college to shortlist');
    }

    // Add second college
    await fetch(`${BASE_URL}/aspirant/shortlist/${colB._id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });

    // Get Shortlist
    const getShortlistRes = await fetch(`${BASE_URL}/aspirant/shortlist`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const getShortlistData = await getShortlistRes.json();
    console.log('Get shortlist count:', getShortlistData.count);
    if (getShortlistRes.status !== 200 || getShortlistData.count !== 2) {
      throw new Error('Shortlist count mismatch');
    }
    console.log('✓ Shortlist successfully returned aggregate college cards');

    // Remove from shortlist
    const removeShortlistRes = await fetch(`${BASE_URL}/aspirant/shortlist/${colA._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    console.log('Remove from shortlist status:', removeShortlistRes.status);
    if (removeShortlistRes.status !== 200) {
      throw new Error('Failed to remove college from shortlist');
    }
    console.log('✓ College removed from shortlist');

    // ------------------------------------------------------------------------
    // TEST 4: Comparison Save & Max 3 Limit
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Comparison Feature & Max 3 Limits ---');
    // Attempt to save comparison with 4 colleges (Must return 400)
    const overLimitCompRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aspirantToken}`,
      },
      body: JSON.stringify({
        name: 'Top 4 Universities',
        colleges: [colA._id, colB._id, colC._id, colD._id],
      }),
    });
    console.log('4-college comparison status (expected 400):', overLimitCompRes.status);
    if (overLimitCompRes.status !== 400) {
      throw new Error('Comparison must enforce max 3 colleges limit with HTTP 400');
    }
    console.log('✓ Comparison correctly rejected when > 3 colleges selected');

    // Save valid comparison with 2 colleges
    const validCompRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aspirantToken}`,
      },
      body: JSON.stringify({
        name: 'Delhi vs Mumbai Tech',
        colleges: [colA._id, colB._id],
      }),
    });
    const validCompData = await validCompRes.json();
    console.log('Valid comparison status:', validCompRes.status, 'name:', validCompData.comparison?.name);
    if (validCompRes.status !== 201 || !validCompData.comparison) {
      throw new Error('Failed to save comparison');
    }

    const savedCompId = validCompData.comparison._id;

    // Get saved comparisons
    const getCompRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const getCompData = await getCompRes.json();
    console.log('Saved comparisons count:', getCompData.comparisons?.length);
    if (getCompRes.status !== 200 || getCompData.comparisons?.length !== 1) {
      throw new Error('Failed to list saved comparisons');
    }
    console.log('✓ Saved comparison listed with benchmark metrics');

    // Delete comparison
    const delCompRes = await fetch(`${BASE_URL}/aspirant/comparisons/${savedCompId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    console.log('Delete comparison status:', delCompRes.status);
    if (delCompRes.status !== 200) {
      throw new Error('Failed to delete saved comparison');
    }
    console.log('✓ Saved comparison deleted successfully');

    // ------------------------------------------------------------------------
    // TEST 5: RBAC Security - Aspirant Access to Other Protected APIs (Must be 403)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Strict RBAC - Aspirant Blocked from Other APIs (403) ---');
    const blockedEndpoints = [
      { name: 'Students', url: `${BASE_URL}/students` },
      { name: 'Drives', url: `${BASE_URL}/drives` },
      { name: 'Applications', url: `${BASE_URL}/applications/my` },
      { name: 'Placements', url: `${BASE_URL}/placements` },
      { name: 'Analytics', url: `${BASE_URL}/analytics/overview` },
      { name: 'Superadmin', url: `${BASE_URL}/superadmin/overview` },
    ];

    for (const ep of blockedEndpoints) {
      const res = await fetch(ep.url, {
        headers: { Authorization: `Bearer ${aspirantToken}` },
      });
      console.log(`Aspirant access to ${ep.name} status:`, res.status);
      if (res.status !== 403) {
        throw new Error(`Aspirant must get 403 on ${ep.name}, got ${res.status}`);
      }
    }
    console.log('✓ Aspirant receives HTTP 403 on every other API group');

    // ------------------------------------------------------------------------
    // TEST 6: RBAC Security - Other Roles Blocked from Aspirant APIs (Must be 403)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Strict RBAC - Other Roles Blocked from Aspirant APIs (403) ---');
    const otherUsers = [
      { role: 'student', email: 'stu@aspirant-test.com' },
      { role: 'tpo', email: 'tpo@aspirant-test.com' },
      { role: 'recruiter', email: 'rec@aspirant-test.com' },
      { role: 'analyst', email: 'ana@aspirant-test.com' },
    ];

    for (const u of otherUsers) {
      const dbUser = await User.create({
        name: `${u.role} user`,
        email: u.email,
        password: 'Password@123',
        role: u.role,
        isApproved: true,
        isEmailVerified: true,
      });
      const tkn = createToken(dbUser);
      const res = await fetch(`${BASE_URL}/aspirant/me`, {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      console.log(`${u.role} access to /api/aspirant/me status:`, res.status);
      if (res.status !== 403) {
        throw new Error(`Role ${u.role} must get 403 on aspirant API, got ${res.status}`);
      }
    }
    console.log('✓ Non-aspirant roles strictly blocked with 403 on aspirant endpoints');

    // ------------------------------------------------------------------------
    // TEST 7: Zero Student PII Audit on Aspirant Responses
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Zero Student PII Audit in Aspirant Responses ---');
    // Add college back to shortlist to test cards
    await fetch(`${BASE_URL}/aspirant/shortlist/${colA._id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const shortlistAuditRes = await fetch(`${BASE_URL}/aspirant/shortlist`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const shortlistAuditData = await shortlistAuditRes.json();
    auditPrivacy(shortlistAuditData);
    console.log('✓ Privacy verified: Zero student PII found in aspirant response');

    // ------------------------------------------------------------------------
    // TEST 8: Dynamic Filter Values Endpoint
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Dynamic Filter Values Endpoint ---');
    // Superadmin token to test analytics filter options
    const saUser = await User.create({
      name: 'SA Filter Test',
      email: 'sa.filter@aspirant-test.com',
      password: 'Super@12345',
      role: 'superadmin',
      isApproved: true,
      isEmailVerified: true,
    });
    const saToken = createToken(saUser);

    const filterRes = await fetch(`${BASE_URL}/analytics/filters`, {
      headers: { Authorization: `Bearer ${saToken}` },
    });
    const filterData = await filterRes.json();
    console.log('Filter values status:', filterRes.status, 'states count:', filterData.states?.length, 'batchYears:', filterData.batchYears?.length);
    if (filterRes.status !== 200 || !Array.isArray(filterData.states) || !Array.isArray(filterData.batchYears)) {
      throw new Error('Analytics filter options endpoint failed');
    }
    console.log('✓ Filter options returned dynamic states and batchYears');

    // ------------------------------------------------------------------------
    // TEST 9: Seeded Aspirant Endpoints Verification (aspirant@portal.com)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Seeded Aspirant Endpoints Verification ---');
    const seededAspirantEmail = 'aspirant@portal.com';
    let seededUser = await User.findOne({ email: seededAspirantEmail });

    if (!seededUser) {
      seededUser = await User.create({
        name: 'Aspirant Demo User',
        email: seededAspirantEmail,
        password: 'Aspirant@123',
        role: 'aspirant',
        isApproved: true,
        isEmailVerified: true,
      });
    } else {
      seededUser.password = 'Aspirant@123';
      seededUser.failedLoginAttempts = 0;
      seededUser.lockUntil = null;
      seededUser.isApproved = true;
      seededUser.isEmailVerified = true;
      await seededUser.save();
    }

    let seededProfile = await Aspirant.findOne({ user: seededUser._id });
    if (!seededProfile) {
      seededProfile = await Aspirant.create({
        user: seededUser._id,
        state: 'Delhi',
        twelfthStream: 'PCM',
        interestedBranches: ['CSE', 'IT'],
        shortlistedColleges: [colA._id, colB._id],
        savedComparisons: [
          {
            name: 'NIT Delhi vs PICT Pune',
            colleges: [colA._id, colB._id],
          },
        ],
      });
    } else {
      seededProfile.shortlistedColleges = [colA._id, colB._id];
      seededProfile.savedComparisons = [
        {
          name: 'NIT Delhi vs PICT Pune',
          colleges: [colA._id, colB._id],
        },
      ];
      await seededProfile.save();
    }

    // 1. Login as aspirant@portal.com
    const seededLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: seededAspirantEmail, password: 'Aspirant@123' }),
    });
    const seededLoginData = await seededLoginRes.json();
    console.log('Seeded aspirant login status:', seededLoginRes.status, 'token received:', !!seededLoginData.token);
    if (seededLoginRes.status !== 200 || !seededLoginData.token) {
      throw new Error(`Seeded aspirant login failed: ${JSON.stringify(seededLoginData)}`);
    }
    const portalToken = seededLoginData.token;

    // 2. Call GET /api/aspirant/me
    const portalMeRes = await fetch(`${BASE_URL}/aspirant/me`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const portalMeData = await portalMeRes.json();
    console.log('GET /aspirant/me status:', portalMeRes.status, 'user name:', portalMeData.aspirant?.user?.name);
    if (portalMeRes.status !== 200 || !portalMeData.aspirant) {
      throw new Error('Failed to retrieve seeded aspirant profile');
    }

    // 3. Call GET /api/aspirant/shortlist
    const portalShortlistRes = await fetch(`${BASE_URL}/aspirant/shortlist`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const portalShortlistData = await portalShortlistRes.json();
    console.log('GET /aspirant/shortlist status:', portalShortlistRes.status, 'count:', portalShortlistData.count);
    if (portalShortlistRes.status !== 200 || portalShortlistData.count < 2) {
      throw new Error('Seeded aspirant shortlist failed or missing colleges');
    }

    // 4. Call GET /api/aspirant/comparisons (assert colleges length is 2, not 0!)
    const portalCompRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const portalCompData = await portalCompRes.json();
    console.log('GET /aspirant/comparisons status:', portalCompRes.status, 'comparisons count:', portalCompData.comparisons?.length);
    if (portalCompRes.status !== 200 || !portalCompData.comparisons || portalCompData.comparisons.length === 0) {
      throw new Error('Seeded comparisons empty');
    }
    const firstComp = portalCompData.comparisons[0];
    console.log(`Comparison "${firstComp.name}" colleges count:`, firstComp.colleges?.length);
    if (firstComp.name === 'NIT Delhi vs PICT Pune' && firstComp.colleges?.length !== 2) {
      throw new Error(`Expected 2 populated colleges for "NIT Delhi vs PICT Pune", but got ${firstComp.colleges?.length}`);
    }
    console.log('✓ Seeded comparison verified: returns 2 colleges, not 0');

    // 5. Call GET /api/aspirant/filters
    const portalFiltersRes = await fetch(`${BASE_URL}/aspirant/filters`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const portalFiltersData = await portalFiltersRes.json();
    console.log('GET /aspirant/filters status:', portalFiltersRes.status, 'states count:', portalFiltersData.states?.length);
    if (portalFiltersRes.status !== 200 || !Array.isArray(portalFiltersData.states)) {
      throw new Error('GET /api/aspirant/filters failed');
    }
    // Verify ALL 36 Indian states and UTs are present with counts
    if (portalFiltersData.states.length < 36) {
      throw new Error(`Expected at least 36 states, got ${portalFiltersData.states.length}`);
    }
    const goaEntry = portalFiltersData.states.find((s) => s.state === 'Goa');
    if (!goaEntry || goaEntry.count !== 0) {
      throw new Error(`Expected Goa count 0, got: ${JSON.stringify(goaEntry)}`);
    }
    const delhiEntry = portalFiltersData.states.find((s) => s.state === 'Delhi');
    if (!delhiEntry || delhiEntry.count < 1) {
      throw new Error(`Expected Delhi count >= 1, got: ${JSON.stringify(delhiEntry)}`);
    }
    console.log('✓ Filters endpoint returns all 36 states with correct counts (including zeros)');

    // 5.1 Query public placements with state having 0 colleges (e.g. Goa) -> Must return empty list without error
    const emptyStateRes = await fetch(`${BASE_URL}/colleges/public/placements?state=Goa`);
    const emptyStateData = await emptyStateRes.json();
    console.log('GET /colleges/public/placements?state=Goa status:', emptyStateRes.status, 'count:', emptyStateData.colleges?.length);
    if (emptyStateRes.status !== 200 || !Array.isArray(emptyStateData.colleges) || emptyStateData.colleges.length !== 0) {
      throw new Error('State with no colleges must return empty list with 200 OK');
    }
    console.log('✓ State with 0 colleges returns empty array with 200 OK without error');

    // 6. Call GET /api/colleges/public/compare with 2 and 3 colleges (with aspirant bearer token)
    const compare2Res = await fetch(`${BASE_URL}/colleges/public/compare?colleges=${colA._id},${colB._id}`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const compare2Data = await compare2Res.json();
    console.log('GET /colleges/public/compare (2 colleges) status:', compare2Res.status, 'colleges count:', compare2Data.colleges?.length);
    if (compare2Res.status !== 200 || compare2Data.colleges?.length !== 2) {
      throw new Error(`Comparison for 2 colleges failed or returned 403: ${JSON.stringify(compare2Data)}`);
    }

    const compare3Res = await fetch(`${BASE_URL}/colleges/public/compare?colleges=${colA.code},${colB.code},${colC.code}`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const compare3Data = await compare3Res.json();
    console.log('GET /colleges/public/compare (3 colleges) status:', compare3Res.status, 'colleges count:', compare3Data.colleges?.length);
    if (compare3Res.status !== 200 || compare3Data.colleges?.length !== 3) {
      throw new Error(`Comparison for 3 colleges failed or returned 403: ${JSON.stringify(compare3Data)}`);
    }
    console.log('✓ Aspirant token successfully accesses public comparison with 2 and 3 colleges');

    // 7. Saved comparison round-trip with 3 colleges
    const save3CompRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${portalToken}`,
      },
      body: JSON.stringify({
        name: 'Trio Tech Comparison',
        colleges: [colA._id, colB._id, colC._id],
      }),
    });
    const save3CompData = await save3CompRes.json();
    console.log('Save 3-college comparison status:', save3CompRes.status);
    if (save3CompRes.status !== 201) {
      throw new Error(`Failed to save 3-college comparison: ${JSON.stringify(save3CompData)}`);
    }

    const checkSaveRes = await fetch(`${BASE_URL}/aspirant/comparisons`, {
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    const checkSaveData = await checkSaveRes.json();
    const createdTrio = checkSaveData.comparisons?.find((c) => c.name === 'Trio Tech Comparison');
    if (!createdTrio || createdTrio.colleges?.length !== 3) {
      throw new Error('Saved 3-college comparison not found or college count mismatch');
    }
    console.log('✓ Saved comparison round-trip confirmed with 3 colleges');

    // Delete the trio comparison
    await fetch(`${BASE_URL}/aspirant/comparisons/${createdTrio._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${portalToken}` },
    });
    console.log('✓ Deleted trio comparison cleanly');

    // ------------------------------------------------------------------------
    // TEST 10: Part B - Registration Recovery (Unverified re-registration & 409)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Registration Recovery (Unverified Re-registration & 409) ---');
    const recoveryEmail = 'recovery.test@aspirant-test.com';

    // 1. Initial registration (unverified)
    const initRegRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Initial Name',
        email: recoveryEmail,
        password: 'Password@123',
        state: 'Delhi',
        interestedBranches: ['CSE'],
        twelfthStream: 'Science',
      }),
    });
    const initRegData = await initRegRes.json();
    console.log('Initial unverified registration status:', initRegRes.status, 'success:', initRegData.success);
    if (initRegRes.status !== 201) {
      throw new Error('Failed initial registration in recovery test');
    }

    // 2. Re-register with same email while unverified -> Must succeed 201, update profile, fresh OTP
    const reRegRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Name',
        email: recoveryEmail,
        password: 'NewPassword@456',
        state: 'Maharashtra',
        interestedBranches: ['ECE', 'ME'],
        twelfthStream: 'Commerce',
      }),
    });
    const reRegData = await reRegRes.json();
    console.log('Re-registration status (expected 200/201):', reRegRes.status, 'success:', reRegData.success);
    if (![200, 201].includes(reRegRes.status) || !reRegData.success) {
      throw new Error(`Unverified re-registration should succeed with 200 or 201, got ${reRegRes.status}: ${JSON.stringify(reRegData)}`);
    }

    const updatedUserDoc = await User.findOne({ email: recoveryEmail });
    if (updatedUserDoc.name !== 'Updated Name') {
      throw new Error(`Expected updated name 'Updated Name', found '${updatedUserDoc.name}'`);
    }
    const updatedAspirantDoc = await Aspirant.findOne({ user: updatedUserDoc._id });
    if (updatedAspirantDoc.state !== 'Maharashtra') {
      throw new Error(`Expected updated state 'Maharashtra', found '${updatedAspirantDoc.state}'`);
    }
    console.log('✓ Unverified re-registration successfully updated account and profile without "user already exists" error');

    // 3. Verify the account
    updatedUserDoc.isEmailVerified = true;
    updatedUserDoc.otpHash = null;
    await updatedUserDoc.save();

    // 4. Registering with a verified email -> Must return 409 Conflict with exact prompt text
    const conflictRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Should Fail Name',
        email: recoveryEmail,
        password: 'Password@789',
        state: 'Karnataka',
        interestedBranches: ['CSE'],
        twelfthStream: 'Science',
      }),
    });
    const conflictData = await conflictRes.json();
    console.log('Verified email registration status (expected 409):', conflictRes.status, 'message:', conflictData.message);
    if (conflictRes.status !== 409) {
      throw new Error(`Expected 409 for verified email registration, got ${conflictRes.status}`);
    }
    if (conflictData.message !== 'This email is already registered. Log in, or use Forgot password.') {
      throw new Error(`Unexpected message for 409: "${conflictData.message}"`);
    }
    console.log('✓ Verified email registration correctly returns HTTP 409 with links prompt');

    // ------------------------------------------------------------------------
    // TEST 11: Part A - Failed Email Send Handling & Cooldown Preservation
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Failed Email Send Handling & Cooldown Preservation ---');
    const originalSendVerificationEmail = emailService.sendVerificationEmail;
    try {
      // Mock email failure
      emailService.sendVerificationEmail = async () => ({
        success: false,
        error: 'Simulated SMTP connection failure',
      });

      const failedSendEmail = 'failsend@aspirant-test.com';
      const failRegRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fail Send User',
          email: failedSendEmail,
          password: 'Password@123',
          state: 'Delhi',
          interestedBranches: ['CSE'],
          twelfthStream: 'Science',
        }),
      });
      const failRegData = await failRegRes.json();
      console.log('Registration with failed email send status (expected 500):', failRegRes.status, 'message:', failRegData.message);
      if (failRegRes.status !== 500) {
        throw new Error(`Expected 500 when email sending fails, got ${failRegRes.status}`);
      }
      if (failRegData.message !== 'We could not send the verification email. Please use Resend.') {
        throw new Error(`Unexpected failure message: "${failRegData.message}"`);
      }

      // Check DB: account exists and unverified, cooldown not consumed
      const failedUser = await User.findOne({ email: failedSendEmail });
      if (!failedUser || failedUser.isEmailVerified) {
        throw new Error('Unverified account must be retained so user can use Resend');
      }
      if (failedUser.lastOtpSentAt) {
        throw new Error('Failed email send must NOT set lastOtpSentAt cooldown');
      }
      console.log('✓ Failed email returns 500, preserves unverified account, and does not consume 60s cooldown');
    } finally {
      emailService.sendVerificationEmail = originalSendVerificationEmail;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Part A - Console Fallback When SMTP Unconfigured
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Console Fallback Mode ---');
    const prevMode = process.env.EMAIL_MODE;
    try {
      process.env.EMAIL_MODE = 'console';
      const consoleSendResult = await emailService.sendEmail({
        to: 'console.test@aspirant-test.com',
        name: 'Console Tester',
        subject: 'Console Verification Test',
        otp: '987654',
        purpose: 'VERIFY EMAIL',
        purposeText: 'Testing console fallback delivery.',
      });
      console.log('Console send result mode:', consoleSendResult.mode, 'success:', consoleSendResult.success);
      if (!consoleSendResult.success || consoleSendResult.mode !== 'console') {
        throw new Error(`Expected successful console fallback, got ${JSON.stringify(consoleSendResult)}`);
      }
      console.log('✓ Console fallback works properly when SMTP is in console mode');
    } finally {
      process.env.EMAIL_MODE = prevMode;
    }

    // ------------------------------------------------------------------------
    // TEST 13: Preferences Round-Trip (Registration Gujarat -> GET /me -> PUT /me)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Aspirant Preferences Round-Trip & User Fields ---');
    const gujaratEmail = 'gujarat.student@aspirant-test.com';

    // 1. Register with state Gujarat, stream "Commerce with Mathematics", branches ['CSE', 'ECE']
    const gujRegRes = await fetch(`${BASE_URL}/auth/register-aspirant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Patel Aarav',
        email: gujaratEmail,
        password: 'Password@123',
        state: 'Gujarat',
        interestedBranches: ['CSE', 'ECE'],
        twelfthStream: 'Commerce with Mathematics',
      }),
    });
    const gujRegData = await gujRegRes.json();
    console.log('Register Gujarat status:', gujRegRes.status, 'success:', gujRegData.success);
    if (gujRegRes.status !== 201) {
      throw new Error(`Failed to register Gujarat aspirant: ${JSON.stringify(gujRegData)}`);
    }

    // Verify email directly in DB
    const gujUser = await User.findOne({ email: gujaratEmail });
    gujUser.isEmailVerified = true;
    gujUser.otpHash = null;
    await gujUser.save();

    // 2. Login to get token
    const gujLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: gujaratEmail, password: 'Password@123' }),
    });
    const gujLoginData = await gujLoginRes.json();
    const gujToken = gujLoginData.token;

    // 3. GET /api/aspirant/me - assert state, stream, branches, and user fields name & email
    const gujMeRes = await fetch(`${BASE_URL}/aspirant/me`, {
      headers: { Authorization: `Bearer ${gujToken}` },
    });
    const gujMeData = await gujMeRes.json();
    console.log('GET /me status:', gujMeRes.status);
    console.log('User name:', gujMeData.user?.name, 'email:', gujMeData.user?.email);
    console.log('Aspirant state:', gujMeData.aspirant?.state, 'stream:', gujMeData.aspirant?.twelfthStream, 'branches:', gujMeData.aspirant?.interestedBranches);

    if (gujMeRes.status !== 200) {
      throw new Error('Failed to get aspirant profile');
    }

    // Check user fields are present in response (root user and aspirant.user)
    if (!gujMeData.user?.name || gujMeData.user.name !== 'Patel Aarav') {
      throw new Error(`Expected user.name 'Patel Aarav', got '${gujMeData.user?.name}'`);
    }
    if (!gujMeData.user?.email || gujMeData.user.email !== gujaratEmail) {
      throw new Error(`Expected user.email '${gujaratEmail}', got '${gujMeData.user?.email}'`);
    }
    if (!gujMeData.aspirant?.user?.name || gujMeData.aspirant.user.name !== 'Patel Aarav') {
      throw new Error(`Expected aspirant.user.name 'Patel Aarav', got '${gujMeData.aspirant?.user?.name}'`);
    }

    // Check saved preferences match registration payload
    if (gujMeData.aspirant?.state !== 'Gujarat') {
      throw new Error(`Expected state 'Gujarat', got '${gujMeData.aspirant?.state}'`);
    }
    if (gujMeData.aspirant?.twelfthStream !== 'Commerce with Mathematics') {
      throw new Error(`Expected stream 'Commerce with Mathematics', got '${gujMeData.aspirant?.twelfthStream}'`);
    }
    if (
      !Array.isArray(gujMeData.aspirant?.interestedBranches) ||
      gujMeData.aspirant.interestedBranches.length !== 2 ||
      !gujMeData.aspirant.interestedBranches.includes('CSE') ||
      !gujMeData.aspirant.interestedBranches.includes('ECE')
    ) {
      throw new Error(`Expected branches ['CSE', 'ECE'], got ${JSON.stringify(gujMeData.aspirant?.interestedBranches)}`);
    }
    console.log('✓ Registration values (state: Gujarat, stream, branches) and user fields (name, email) correctly returned by GET /me');

    // 4. PUT /api/aspirant/me with empty state and empty stream -> Must NEVER overwrite existing saved values with empty ones
    const emptyPutRes = await fetch(`${BASE_URL}/aspirant/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gujToken}`,
      },
      body: JSON.stringify({
        state: '',
        twelfthStream: '',
        interestedBranches: ['CSE', 'AI & DS'],
      }),
    });
    const emptyPutData = await emptyPutRes.json();
    console.log('PUT /me (empty state & stream test) status:', emptyPutRes.status);

    if (emptyPutData.aspirant?.state !== 'Gujarat') {
      throw new Error(`State was overwritten by empty string! Got: '${emptyPutData.aspirant?.state}'`);
    }
    if (emptyPutData.aspirant?.twelfthStream !== 'Commerce with Mathematics') {
      throw new Error(`TwelfthStream was overwritten by empty string! Got: '${emptyPutData.aspirant?.twelfthStream}'`);
    }
    if (!emptyPutData.aspirant?.interestedBranches.includes('AI & DS')) {
      throw new Error('Branches update failed');
    }
    if (!emptyPutData.user?.name || !emptyPutData.aspirant?.user?.name) {
      throw new Error('User name missing from PUT response');
    }
    console.log('✓ PUT /me safely preserved non-empty state and stream when empty values were submitted');

    // ------------------------------------------------------------------------
    // TEST 14: Aspirant Recommendations Endpoint (GET /api/aspirant/recommendations)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 14: Aspirant Recommendations Endpoint ---');

    // 1. Setup company and drive for test offers
    const recCompany = await Company.create({
      name: 'Test Recommendations Tech Corp',
      industry: 'Software',
      verified: true,
    });

    // Seed Colleges for Recommendations:
    // College A (Delhi, Approved): 6 CSE students (6 placed, 12 LPA), 5 ECE students (3 placed, 8 LPA)
    // Average branch placement rate = (100% + 60%) / 2 = 80.0%
    const recColA = await College.create({
      name: 'Delhi Premier Engineering Institute',
      code: 'TEST_ASP_REC_A',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'approved',
    });

    // College B (Maharashtra, Approved): 10 CSE students (7 placed, 14 LPA)
    // Average branch placement rate = 70.0%
    const recColB = await College.create({
      name: 'Maharashtra Institute of Science',
      code: 'TEST_ASP_REC_B',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });

    // College C (Karnataka, Approved): 4 CSE students (< 5, small cohort), 3 placed (10 LPA)
    // Excluded from ranking (small-group suppression 'lt5', hasSufficientData: false)
    const recColC = await College.create({
      name: 'Karnataka Rural Polytech',
      code: 'TEST_ASP_REC_C',
      city: 'Hubli',
      state: 'Karnataka',
      status: 'approved',
    });

    // College D (Delhi, Pending): 10 CSE students (10 placed). Must NOT appear in recommendations!
    const recColD = await College.create({
      name: 'Pending Unapproved Institute',
      code: 'TEST_ASP_REC_D_PENDING',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'pending',
    });

    // College E (Tamil Nadu, Approved): 10 Civil students (no CSE/ECE students). Must NOT appear!
    const recColE = await College.create({
      name: 'Chennai Civil College',
      code: 'TEST_ASP_REC_E_CIVIL',
      city: 'Chennai',
      state: 'Tamil Nadu',
      status: 'approved',
    });

    // College F (Delhi, Approved): Home-state college with 0 students (insufficient branch data).
    // Appears in inStateCollegesWithoutData so the aspirant can still open its page!
    const recColF = await College.create({
      name: 'Delhi New Technical Campus',
      code: 'TEST_ASP_REC_F_INSTATE',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'approved',
    });

    // Drives
    const driveA = await Drive.create({
      company: recCompany._id,
      college: recColA._id,
      role: 'Rec Test Dev A',
      location: 'Delhi',
      allowedBranches: ['CSE', 'ECE'],
      packageLpa: 12.0,
      status: 'closed',
      driveDate: new Date(),
      lastDateToApply: new Date(),
    });

    const driveB = await Drive.create({
      company: recCompany._id,
      college: recColB._id,
      role: 'Rec Test Dev B',
      location: 'Pune',
      allowedBranches: ['CSE', 'ECE'],
      packageLpa: 14.0,
      status: 'closed',
      driveDate: new Date(),
      lastDateToApply: new Date(),
    });

    const driveC = await Drive.create({
      company: recCompany._id,
      college: recColC._id,
      role: 'Rec Test Dev C',
      location: 'Hubli',
      allowedBranches: ['CSE'],
      packageLpa: 10.0,
      status: 'closed',
      driveDate: new Date(),
      lastDateToApply: new Date(),
    });

    // Seed students for Col A (6 CSE + 5 ECE)
    for (let i = 1; i <= 6; i++) {
      const u = await User.create({
        name: `ColA CSE Student ${i}`,
        email: `cola.cse${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColA._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: recColA._id,
        enrollmentNo: `TEST_ASP_COLA_CSE_${i}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 8.5,
        backlogs: 0,
        phone: `980000100${i}`,
      });

      // All 6 CSE students get accepted offer (12 LPA)
      const app = await Application.create({
        student: st._id,
        drive: driveA._id,
      });
      await Offer.create({
        drive: driveA._id,
        company: recCompany._id,
        college: recColA._id,
        student: st._id,
        application: app._id,
        packageLpa: 12.0,
        expiryDate: new Date(Date.now() + 864000000),
        status: 'accepted',
      });
    }

    for (let i = 1; i <= 10; i++) {
      const u = await User.create({
        name: `ColA ECE Student ${i}`,
        email: `cola.ece${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColA._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: recColA._id,
        enrollmentNo: `TEST_ASP_COLA_ECE_${i}`,
        branch: 'ECE',
        batchYear: 2025,
        cgpa: 8.0,
        backlogs: 0,
        phone: `980000200${i}`,
      });

      // First 6 ECE students get accepted offer (8 LPA)
      if (i <= 6) {
        const app = await Application.create({
          student: st._id,
          drive: driveA._id,
        });
        await Offer.create({
          drive: driveA._id,
          company: recCompany._id,
          college: recColA._id,
          student: st._id,
          application: app._id,
          packageLpa: 8.0,
          expiryDate: new Date(Date.now() + 864000000),
          status: 'accepted',
        });
      }
    }

    // Seed students for Col B (10 CSE, 7 placed with 14 LPA)
    for (let i = 1; i <= 10; i++) {
      const u = await User.create({
        name: `ColB CSE Student ${i}`,
        email: `colb.cse${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColB._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: recColB._id,
        enrollmentNo: `TEST_ASP_COLB_CSE_${i}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 8.0,
        backlogs: 0,
        phone: `980000300${i}`,
      });

      if (i <= 7) {
        const app = await Application.create({
          student: st._id,
          drive: driveB._id,
        });
        await Offer.create({
          drive: driveB._id,
          company: recCompany._id,
          college: recColB._id,
          student: st._id,
          application: app._id,
          packageLpa: 14.0,
          expiryDate: new Date(Date.now() + 864000000),
          status: 'accepted',
        });
      }
    }

    // Seed students for Col C (4 CSE students, 3 placed with 10 LPA) -> < 5 Small Group
    for (let i = 1; i <= 4; i++) {
      const u = await User.create({
        name: `ColC CSE Student ${i}`,
        email: `colc.cse${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColC._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const st = await Student.create({
        user: u._id,
        college: recColC._id,
        enrollmentNo: `TEST_ASP_COLC_CSE_${i}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 7.5,
        backlogs: 0,
        phone: `980000400${i}`,
      });

      if (i <= 3) {
        const app = await Application.create({
          student: st._id,
          drive: driveC._id,
        });
        await Offer.create({
          drive: driveC._id,
          company: recCompany._id,
          college: recColC._id,
          student: st._id,
          application: app._id,
          packageLpa: 10.0,
          expiryDate: new Date(Date.now() + 864000000),
          status: 'accepted',
        });
      }
    }

    // Seed students for Col D (Pending college)
    for (let i = 1; i <= 5; i++) {
      const u = await User.create({
        name: `ColD CSE Student ${i}`,
        email: `cold.cse${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColD._id,
        isApproved: true,
        isEmailVerified: true,
      });
      await Student.create({
        user: u._id,
        college: recColD._id,
        enrollmentNo: `TEST_ASP_COLD_CSE_${i}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 8.0,
        backlogs: 0,
        phone: `980000500${i}`,
      });
    }

    // Seed students for Col E (Civil branch only)
    for (let i = 1; i <= 5; i++) {
      const u = await User.create({
        name: `ColE Civil Student ${i}`,
        email: `cole.civ${i}@aspirant-test.com`,
        password: 'Password@123',
        role: 'student',
        college: recColE._id,
        isApproved: true,
        isEmailVerified: true,
      });
      await Student.create({
        user: u._id,
        college: recColE._id,
        enrollmentNo: `TEST_ASP_COLE_CIV_${i}`,
        branch: 'CIVIL',
        batchYear: 2025,
        cgpa: 8.0,
        backlogs: 0,
        phone: `980000600${i}`,
      });
    }

    // Set aspirant preferences: State = Delhi, Branches = ['CSE', 'ECE']
    const testAspirantUser = await User.findOne({ email: aspirantEmail });
    await Aspirant.findOneAndUpdate(
      { user: testAspirantUser._id },
      {
        state: 'Delhi',
        interestedBranches: ['CSE', 'ECE'],
        twelfthStream: 'Science (PCM)',
      }
    );

    // Call GET /api/aspirant/recommendations with aspirantToken
    const recRes = await fetch(`${BASE_URL}/aspirant/recommendations`, {
      headers: { Authorization: `Bearer ${aspirantToken}` },
    });
    const recData = await recRes.json();
    console.log('GET /recommendations status:', recRes.status, 'colleges count:', recData.colleges?.length);

    if (recRes.status !== 200 || !recData.success) {
      throw new Error(`Recommendations endpoint failed: ${JSON.stringify(recData)}`);
    }

    // 1. Privacy audit: zero student PII leaks
    auditPrivacy(recData);
    console.log('✓ Privacy verified: Zero student personal fields in recommendations response');

    // 2. Only approved colleges returned
    const returnedCodes = recData.colleges.map((c) => c.code);
    if (returnedCodes.includes('TEST_ASP_REC_D_PENDING')) {
      throw new Error('Pending college was returned in recommendations!');
    }
    console.log('✓ Pending college correctly excluded from recommendations');

    // 3. Only colleges offering at least 1 interested branch returned
    if (returnedCodes.includes('TEST_ASP_REC_E_CIVIL')) {
      throw new Error('College without interested branches was returned!');
    }
    console.log('✓ College without target branches correctly excluded');

    // 4. Ranking verification:
    // Ranked list should have Col A (80%) first, then Col B (70%) second
    const rankedColleges = recData.colleges.filter((c) => c.hasSufficientData);
    const testRankedColleges = rankedColleges.filter((c) => c.code.startsWith('TEST_ASP_REC_'));
    if (testRankedColleges.length < 2) {
      throw new Error(`Expected at least 2 test ranked colleges, got ${testRankedColleges.length}`);
    }
    if (testRankedColleges[0].code !== 'TEST_ASP_REC_A' || testRankedColleges[1].code !== 'TEST_ASP_REC_B') {
      throw new Error(`Expected ranking [TEST_ASP_REC_A, TEST_ASP_REC_B], got [${testRankedColleges[0]?.code}, ${testRankedColleges[1]?.code}]`);
    }
    if (testRankedColleges[0].avgBranchPlacementRate !== 80 || testRankedColleges[1].avgBranchPlacementRate !== 70) {
      throw new Error(`Expected rates 80 and 70, got ${testRankedColleges[0].avgBranchPlacementRate} and ${testRankedColleges[1].avgBranchPlacementRate}`);
    }
    if (!testRankedColleges[0].isHomeState) {
      throw new Error('Col A (Delhi) must have isHomeState: true for Delhi aspirant');
    }
    console.log('✓ Colleges correctly ranked by average placement percentage of target branches (80% > 70%) with Home state badge');

    // 5. Small-group suppression verification (< 5 students):
    const unrankedColleges = recData.colleges.filter((c) => !c.hasSufficientData);
    const colCEntry = unrankedColleges.find((c) => c.code === 'TEST_ASP_REC_C');
    if (!colCEntry) {
      throw new Error('Small-cohort College C not found in unranked list');
    }
    const cseStats = colCEntry.myBranchStats.find((b) => b.branch === 'CSE');
    if (!cseStats || cseStats.students !== 'lt5' || cseStats.placementPercentage !== 'lt5' || cseStats.averagePackage !== null) {
      throw new Error(`Expected 'lt5' suppression for < 5 students in Col C, got: ${JSON.stringify(cseStats)}`);
    }
    console.log('✓ Small-group privacy rule correctly applied: branches with < 5 students return "lt5" and are excluded from ranking');

    // 5.1 In-state college with insufficient data (TEST_ASP_REC_F_INSTATE)
    const instateNoData = recData.inStateCollegesWithoutData?.find((c) => c.code === 'TEST_ASP_REC_F_INSTATE');
    if (!instateNoData || instateNoData.note !== 'Not enough branch data to show yet') {
      throw new Error(`Expected inStateCollegesWithoutData to contain TEST_ASP_REC_F_INSTATE with note, got: ${JSON.stringify(instateNoData)}`);
    }
    console.log('✓ In-state college with insufficient branch data returned with note "Not enough branch data to show yet"');

    // 6. Strict RBAC verification on GET /api/aspirant/recommendations
    console.log('--- Verifying RBAC on GET /api/aspirant/recommendations ---');
    for (const u of otherUsers) {
      const dbUser = await User.findOne({ email: u.email });
      const tkn = createToken(dbUser);
      const res = await fetch(`${BASE_URL}/aspirant/recommendations`, {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      console.log(`Role ${u.role} access to /recommendations status:`, res.status);
      if (res.status !== 403) {
        throw new Error(`Role ${u.role} must get 403 on /recommendations, got ${res.status}`);
      }
    }

    // Superadmin access -> 403
    const saRecRes = await fetch(`${BASE_URL}/aspirant/recommendations`, {
      headers: { Authorization: `Bearer ${saToken}` },
    });
    console.log('Superadmin access to /recommendations status:', saRecRes.status);
    if (saRecRes.status !== 403) {
      throw new Error(`Superadmin must get 403 on /recommendations, got ${saRecRes.status}`);
    }
    console.log('✓ Non-aspirant roles (student, tpo, recruiter, analyst, superadmin) strictly blocked with 403');

    // 7. Aspirant with empty preferences returns empty recommendations
    const emptyAspirantUser = await User.create({
      name: 'Empty Prefs Aspirant',
      email: 'empty.prefs@aspirant-test.com',
      password: 'Password@123',
      role: 'aspirant',
      isApproved: true,
      isEmailVerified: true,
    });
    const emptyAspirantToken = createToken(emptyAspirantUser);
    const emptyRecRes = await fetch(`${BASE_URL}/aspirant/recommendations`, {
      headers: { Authorization: `Bearer ${emptyAspirantToken}` },
    });
    const emptyRecData = await emptyRecRes.json();
    console.log('Empty preferences recommendations status:', emptyRecRes.status, 'count:', emptyRecData.count);
    if (emptyRecRes.status !== 200 || emptyRecData.count !== 0 || emptyRecData.colleges?.length !== 0) {
      throw new Error(`Expected 0 colleges for aspirant with no preferences, got count ${emptyRecData.count}`);
    }
    console.log('✓ Aspirant with no preferences receives 200 OK with empty recommendations');

    // 8. Recommendations nationwide fallback when home-state list has no matching colleges
    console.log('--- Verifying Recommendations Nationwide Fallback when Home State has No Matches ---');
    const goaAspirantUser = await User.create({
      name: 'Goa Resident Aspirant',
      email: 'goa.aspirant@aspirant-test.com',
      password: 'Password@123',
      role: 'aspirant',
      isApproved: true,
      isEmailVerified: true,
    });
    await Aspirant.create({
      user: goaAspirantUser._id,
      state: 'Goa', // No colleges in Goa!
      interestedBranches: ['CSE', 'ECE'],
      twelfthStream: 'Science (PCM)',
    });
    const goaAspirantToken = createToken(goaAspirantUser);

    const goaRecRes = await fetch(`${BASE_URL}/aspirant/recommendations`, {
      headers: { Authorization: `Bearer ${goaAspirantToken}` },
    });
    const goaRecData = await goaRecRes.json();
    console.log('Goa recommendations status:', goaRecRes.status, 'hasHomeStateRankedMatches:', goaRecData.hasHomeStateRankedMatches, 'colleges count:', goaRecData.colleges?.length);

    if (goaRecRes.status !== 200 || goaRecData.hasHomeStateRankedMatches !== false) {
      throw new Error('Expected hasHomeStateRankedMatches: false for Goa');
    }
    const goaRanked = goaRecData.colleges.filter((c) => c.hasSufficientData);
    const testGoaRanked = goaRanked.filter((c) => c.code.startsWith('TEST_ASP_REC_'));
    if (testGoaRanked.length < 2) {
      throw new Error(`Expected nationwide ranked fallback results, got ${testGoaRanked.length}`);
    }
    if (testGoaRanked[0].code !== 'TEST_ASP_REC_A' || testGoaRanked[1].code !== 'TEST_ASP_REC_B') {
      throw new Error('Expected nationwide ranked colleges in fallback');
    }
    console.log('✓ Recommendations endpoint returns nationwide ranked matches when home-state list is empty');

    console.log('\n======================================================');
    console.log('       ALL TASK 34 ASPIRANT TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    try {
      await User.deleteMany({ email: { $regex: /@aspirant-test\.com$/ } });
      await College.deleteMany({ code: { $regex: /^TEST_ASP_/ } });
      await Student.deleteMany({ enrollmentNo: { $regex: /^TEST_ASP_/ } });
      await Offer.deleteMany({});
      await Application.deleteMany({});
      await Drive.deleteMany({ role: { $regex: /^Rec Test/ } });
      await Company.deleteMany({ name: { $regex: /^Test Recommendations/ } });
      await Aspirant.deleteMany({});
    } catch (_) {}
    server.close();
    await mongoose.connection.close();
  }
}

runAspirantTests().catch((err) => {
  console.error('\n❌ ASPIRANT TEST SUITE FAILED:', err);
  process.exit(1);
});

