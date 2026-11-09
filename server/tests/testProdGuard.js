process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { getTestDbUri } = require('./testHelper');
const { migrateAuthUsers } = require('../utils/migrateAuth');
const { User, College, Aspirant } = require('../models');

function runSeedSuperadminProcess(envOverrides) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '../utils/seedSuperadmin.js')],
      {
        env: {
          ...process.env,
          MONGO_URI: getTestDbUri(),
          ...envOverrides,
        },
      }
    );

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, output, errorOutput });
    });
  });
}

function runSeedAdminProcess(envOverrides) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '../utils/seedAdmin.js')],
      {
        env: {
          ...process.env,
          MONGO_URI: getTestDbUri(),
          ...envOverrides,
        },
      }
    );

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, output, errorOutput });
    });
  });
}

async function runProdGuardTests() {
  console.log('======================================================');
  console.log('       TEST: PRODUCTION CREDENTIALS & STARTUP GUARD    ');
  console.log('======================================================\n');

  console.log('1. Connecting to test database...');
  await mongoose.connect(getTestDbUri());
  console.log('✓ Connected to test database\n');

  try {
    // Clean up default accounts to start from a clean baseline
    const DEFAULT_EMAILS = [
      'superadmin@portal.com',
      'analyst@portal.com',
      'aspirant@portal.com',
      'prod_guard_superadmin@securecorp.com',
    ];

    await User.deleteMany({ email: { $in: DEFAULT_EMAILS } });
    await Aspirant.deleteMany({});

    // ========================================================
    // PART 1: Migration with NODE_ENV=production
    // Proves NO default users or profiles are created
    // ========================================================
    console.log('2. Running migrateAuth with NODE_ENV=production on clean database...');
    process.env.NODE_ENV = 'production';

    // Create a dummy unapproved college and an unverified user to prove harmless repair still runs
    const testCollege = await College.create({
      name: `ProdGuard College ${Date.now()}`,
      code: `PGC_${Date.now()}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: null,
    });

    const testLegacyUser = await User.create({
      name: 'Legacy Admin User',
      email: `legacy.admin.${Date.now()}@college.com`,
      password: 'SecurePassword123!',
      role: 'tpo',
      isApproved: true,
      isEmailVerified: false,
    });

    await migrateAuthUsers();

    // Verify harmless data repair worked
    const updatedCollege = await College.findById(testCollege._id);
    assert.strictEqual(updatedCollege.status, 'approved', 'Harmless data repair must set college status=approved');

    const updatedUser = await User.findById(testLegacyUser._id);
    assert.strictEqual(updatedUser.isEmailVerified, true, 'Harmless data repair must set isEmailVerified=true');

    // Prove NO default users or aspirant profiles were created
    const prodDefaultUsers = await User.find({
      email: { $in: ['superadmin@portal.com', 'analyst@portal.com', 'aspirant@portal.com'] },
    });
    assert.strictEqual(
      prodDefaultUsers.length,
      0,
      'CRITICAL: In NODE_ENV=production, migrateAuth must NOT create any default users'
    );

    const prodAspirantProfiles = await Aspirant.find({});
    assert.strictEqual(
      prodAspirantProfiles.length,
      0,
      'CRITICAL: In NODE_ENV=production, migrateAuth must NOT create any default aspirant profiles'
    );

    console.log('✓ Production mode verified: 0 default users created, 0 demo profiles created');
    console.log('✓ Harmless schema and data repairs ran successfully in production mode\n');

    // Clean up test college & legacy user
    await College.findByIdAndDelete(testCollege._id);
    await User.findByIdAndDelete(testLegacyUser._id);

    // ========================================================
    // PART 2: Migration with NODE_ENV=development
    // Proves default accounts are still created for local dev
    // ========================================================
    console.log('3. Running migrateAuth with NODE_ENV=development...');
    process.env.NODE_ENV = 'development';

    await migrateAuthUsers();

    const devDefaultUsers = await User.find({
      email: { $in: ['superadmin@portal.com', 'analyst@portal.com', 'aspirant@portal.com'] },
    });
    assert.strictEqual(
      devDefaultUsers.length,
      3,
      'In NODE_ENV=development, migrateAuth must create all 3 default accounts for developer convenience'
    );

    const devSuperadmin = devDefaultUsers.find((u) => u.email === 'superadmin@portal.com');
    assert.strictEqual(devSuperadmin.role, 'superadmin');
    assert.strictEqual(devSuperadmin.isApproved, true);

    const devAnalyst = devDefaultUsers.find((u) => u.email === 'analyst@portal.com');
    assert.strictEqual(devAnalyst.role, 'analyst');
    assert.strictEqual(devAnalyst.isApproved, true);

    const devAspirant = devDefaultUsers.find((u) => u.email === 'aspirant@portal.com');
    assert.strictEqual(devAspirant.role, 'aspirant');

    const devAspirantProfile = await Aspirant.findOne({ user: devAspirant._id });
    assert(devAspirantProfile !== null, 'Aspirant profile must be created in development');

    console.log('✓ Development mode verified: default superadmin, analyst, and aspirant accounts seeded properly\n');

    // ========================================================
    // PART 3: seedSuperadmin password strength & default checks
    // ========================================================
    console.log('4. Testing seed:superadmin password security guards...');

    // 4.1 Refuses password shorter than 12 characters
    const shortPassRes = await runSeedSuperadminProcess({
      SUPERADMIN_EMAIL: 'prod_guard_superadmin@securecorp.com',
      SUPERADMIN_PASSWORD: 'Short@123',
    });
    assert.strictEqual(shortPassRes.code, 1, 'seedSuperadmin must exit with code 1 for password < 12 characters');
    assert(
      shortPassRes.errorOutput.includes('at least 12 characters'),
      'Must log error indicating password must be at least 12 characters'
    );
    console.log('✓ Password < 12 characters refused with exit code 1');

    // 4.2 Refuses known default repo password ("Super@12345")
    const knownPassRes1 = await runSeedSuperadminProcess({
      SUPERADMIN_EMAIL: 'prod_guard_superadmin@securecorp.com',
      SUPERADMIN_PASSWORD: 'Super@12345',
    });
    assert.strictEqual(knownPassRes1.code, 1, 'seedSuperadmin must exit with code 1 for known default password');
    assert(
      knownPassRes1.errorOutput.includes('cannot be a known default'),
      'Must log error indicating password cannot be a known default'
    );
    console.log('✓ Known default password "Super@12345" refused with exit code 1');

    // 4.3 Refuses case-insensitive known default repo password
    const knownPassRes2 = await runSeedSuperadminProcess({
      SUPERADMIN_EMAIL: 'prod_guard_superadmin@securecorp.com',
      SUPERADMIN_PASSWORD: 'superadmin@12345',
    });
    assert.strictEqual(knownPassRes2.code, 1, 'seedSuperadmin must reject case-insensitive known default');
    console.log('✓ Case-insensitive default password "superadmin@12345" refused with exit code 1');

    // 4.4 Accepts strong 12+ character non-default password
    const validPassRes = await runSeedSuperadminProcess({
      SUPERADMIN_EMAIL: 'prod_guard_superadmin@securecorp.com',
      SUPERADMIN_PASSWORD: 'UniqueStrongPassword2026!#',
      SUPERADMIN_NAME: 'Production Root Superadmin',
    });
    assert.strictEqual(validPassRes.code, 0, 'seedSuperadmin must succeed with exit code 0 for valid credentials');

    const createdSuperadmin = await User.findOne({ email: 'prod_guard_superadmin@securecorp.com' });
    assert(createdSuperadmin !== null, 'Superadmin must exist in database after valid seeding');
    assert.strictEqual(createdSuperadmin.role, 'superadmin');
    assert.strictEqual(createdSuperadmin.isApproved, true);
    assert.strictEqual(createdSuperadmin.isEmailVerified, true);
    console.log('✓ Strong 12+ character non-default password accepted and superadmin created\n');

    // ========================================================
    // PART 4: seedAdmin refuses execution in production
    // ========================================================
    console.log('5. Testing seedAdmin execution guard in production mode...');
    const seedAdminProdRes = await runSeedAdminProcess({
      NODE_ENV: 'production',
    });
    assert.strictEqual(seedAdminProdRes.code, 1, 'seedAdmin must exit with code 1 when NODE_ENV=production');
    assert(
      seedAdminProdRes.errorOutput.includes('REFUSING TO SEED ADMIN IN PRODUCTION'),
      'seedAdmin must log refusal in production'
    );
    console.log('✓ seedAdmin refused in production mode with exit code 1\n');

    // Cleanup created test records
    await User.deleteMany({ email: { $in: DEFAULT_EMAILS } });
    await Aspirant.deleteMany({});

    console.log('======================================================');
    console.log('       ALL PRODUCTION GUARD TESTS PASSED (100%)       ');
    console.log('======================================================\n');
  } finally {
    process.env.NODE_ENV = 'test';
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  runProdGuardTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

module.exports = runProdGuardTests;

