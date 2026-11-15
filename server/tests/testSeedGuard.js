process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const {
  parseMongoUri,
  isSafeSeedEnvironment,
  assertSafeSeedEnvironment,
} = require('../utils/seedGuard');

/**
 * Helper to spawn a script in a child process with specified environment
 */
function runScriptChild(scriptPath, envOverrides = {}) {
  const childEnv = { ...process.env, ...envOverrides };
  if (envOverrides.MONGO_URI && envOverrides.MONGO_URI_TEST === undefined) {
    childEnv.MONGO_URI_TEST = '';
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: childEnv,
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, output, errorOutput, combined: output + '\n' + errorOutput });
    });
  });
}

async function runSeedGuardTests() {
  console.log('======================================================');
  console.log('       TEST: SEED & MIGRATION SAFETY GUARD SUITE      ');
  console.log('======================================================\n');

  // ========================================================
  // 1. URI Parser & Credential Redaction Tests
  // ========================================================
  console.log('1. Testing parseMongoUri safe host & db parsing and credential redaction...');

  const localRes = parseMongoUri('mongodb://localhost:27017/placement_management');
  assert.strictEqual(localRes.isValid, true);
  assert.deepStrictEqual(localRes.hosts, ['localhost']);
  assert.strictEqual(localRes.hostString, 'localhost:27017');
  assert.strictEqual(localRes.database, 'placement_management');

  const ipRes = parseMongoUri('mongodb://127.0.0.1:27017/placement_management');
  assert.strictEqual(ipRes.isValid, true);
  assert.deepStrictEqual(ipRes.hosts, ['127.0.0.1']);
  assert.strictEqual(ipRes.hostString, '127.0.0.1:27017');

  const ipv6Res = parseMongoUri('mongodb://[::1]:27017/placement_management');
  assert.strictEqual(ipv6Res.isValid, true);
  assert.deepStrictEqual(ipv6Res.hosts, ['::1']);

  const secretUser = 'super_secret_admin_user';
  const secretPass = 'extremely_secret_password_98765';
  const atlasUri = `mongodb+srv://${secretUser}:${secretPass}@cluster0.abcde.mongodb.net/production_db?retryWrites=true&w=majority`;
  const atlasRes = parseMongoUri(atlasUri);

  assert.strictEqual(atlasRes.isValid, true);
  assert.deepStrictEqual(atlasRes.hosts, ['cluster0.abcde.mongodb.net']);
  assert.strictEqual(atlasRes.hostString, 'cluster0.abcde.mongodb.net');
  assert.strictEqual(atlasRes.database, 'production_db');
  assert.strictEqual(atlasRes.hostString.includes(secretUser), false, 'Host must never contain username');
  assert.strictEqual(atlasRes.hostString.includes(secretPass), false, 'Host must never contain password');

  const multiHostUri = `mongodb://${secretUser}:${secretPass}@mongo1.cloudcorp.internal:27017,mongo2.cloudcorp.internal:27017/corp_prod?replicaSet=rs0`;
  const multiRes = parseMongoUri(multiHostUri);
  assert.strictEqual(multiRes.isValid, true);
  assert.deepStrictEqual(multiRes.hosts, ['mongo1.cloudcorp.internal', 'mongo2.cloudcorp.internal']);
  assert.strictEqual(multiRes.hostString, 'mongo1.cloudcorp.internal:27017,mongo2.cloudcorp.internal:27017');
  assert.strictEqual(multiRes.database, 'corp_prod');
  assert.strictEqual(multiRes.hostString.includes(secretUser), false);
  assert.strictEqual(multiRes.hostString.includes(secretPass), false);

  console.log('✓ parseMongoUri extracts clean host and db names with zero credential leakage\n');

  // ========================================================
  // 2. Rule Enforcement Tests (Unit)
  // ========================================================
  console.log('2. Testing isSafeSeedEnvironment rule matrix...');

  // (a) Localhost / 127.0.0.1
  const checkLocal1 = isSafeSeedEnvironment('mongodb://localhost:27017/production_name', {});
  assert.strictEqual(checkLocal1.allowed, true, 'localhost must be allowed regardless of db name');

  const checkLocal2 = isSafeSeedEnvironment('mongodb://127.0.0.1:27017/any_db', {});
  assert.strictEqual(checkLocal2.allowed, true, '127.0.0.1 must be allowed regardless of db name');

  const checkLocal3 = isSafeSeedEnvironment('mongodb://[::1]:27017/any_db', {});
  assert.strictEqual(checkLocal3.allowed, true, '::1 must be allowed regardless of db name');

  // (b) Remote host with _test db
  const checkRemoteTest = isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/placement_management_test', {});
  assert.strictEqual(checkRemoteTest.allowed, true, 'Remote host with _test db must be allowed');

  // (c) Remote host with _dev db
  const checkRemoteDev = isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/placement_management_dev', {});
  assert.strictEqual(checkRemoteDev.allowed, true, 'Remote host with _dev db must be allowed');

  // (d) Remote host with non-test/dev db -> REFUSED
  const checkRemoteProd = isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db', {});
  assert.strictEqual(checkRemoteProd.allowed, false, 'Remote host with non-test/dev db must be refused');
  assert.strictEqual(checkRemoteProd.host, 'cluster0.abcde.mongodb.net');
  assert.strictEqual(checkRemoteProd.database, 'production_db');

  // (e) ALLOW_REMOTE_SEED=yes-i-am-sure override
  const checkOverride = isSafeSeedEnvironment(
    'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db',
    { ALLOW_REMOTE_SEED: 'yes-i-am-sure' }
  );
  assert.strictEqual(checkOverride.allowed, true, 'ALLOW_REMOTE_SEED=yes-i-am-sure must override and allow execution');

  // (f) Invalid overrides -> REFUSED
  assert.strictEqual(
    isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db', { ALLOW_REMOTE_SEED: 'true' }).allowed,
    false,
    'ALLOW_REMOTE_SEED=true must be rejected'
  );
  assert.strictEqual(
    isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db', { ALLOW_REMOTE_SEED: '1' }).allowed,
    false,
    'ALLOW_REMOTE_SEED=1 must be rejected'
  );
  assert.strictEqual(
    isSafeSeedEnvironment('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db', { ALLOW_REMOTE_SEED: 'yes' }).allowed,
    false,
    'ALLOW_REMOTE_SEED=yes must be rejected'
  );

  console.log('✓ Rule matrix verified: local allowed, _test/_dev allowed, remote refused unless yes-i-am-sure\n');

  // ========================================================
  // 3. assertSafeSeedEnvironment Exception & Message Content Tests
  // ========================================================
  console.log('3. Testing assertSafeSeedEnvironment exception details...');

  const remoteSecretPass = 'my_confidential_mongo_atlas_pass';
  const remoteTestUri = `mongodb+srv://admin_tester:${remoteSecretPass}@cluster0.abcde.mongodb.net/production_db`;

  let caughtError = null;
  try {
    assertSafeSeedEnvironment(remoteTestUri, {});
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError, 'assertSafeSeedEnvironment must throw an Error for remote production db');
  assert(caughtError.message.includes('Remote database write prevented'), 'Must include refusal header');
  assert(caughtError.message.includes('cluster0.abcde.mongodb.net'), 'Must include target database host');
  assert(caughtError.message.includes('production_db'), 'Must include target database name');
  assert(caughtError.message.includes('ALLOW_REMOTE_SEED=yes-i-am-sure'), 'Must mention exact override env var');
  assert(!caughtError.message.includes(remoteSecretPass), 'Must NEVER include password');
  assert(!caughtError.message.includes('admin_tester'), 'Must NEVER include username');

  console.log('✓ assertSafeSeedEnvironment prints clear host message with 0 credentials\n');

  // ========================================================
  // 4. Subprocess Execution Tests on Seed & Migration Scripts
  // ========================================================
  console.log('4. Testing child process guards on server/utils scripts...');

  const unsafeRemoteUri = 'mongodb+srv://app_user:secret_pwd_99@remote-db.production.net/enterprise_portal';

  // (a) seedData.js
  console.log('  Testing seedData.js guard...');
  const seedDataRes = await runScriptChild(path.join(__dirname, '../utils/seedData.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(seedDataRes.code, 1, 'seedData.js must exit with code 1 on remote database');
  assert(seedDataRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(seedDataRes.combined.includes('remote-db.production.net'));
  assert(!seedDataRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ seedData.js refused execution and logged clear host message');

  // (b) seedAdmin.js
  console.log('  Testing seedAdmin.js guard...');
  const seedAdminRes = await runScriptChild(path.join(__dirname, '../utils/seedAdmin.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(seedAdminRes.code, 1, 'seedAdmin.js must exit with code 1 on remote database');
  assert(seedAdminRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(seedAdminRes.combined.includes('remote-db.production.net'));
  assert(!seedAdminRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ seedAdmin.js refused execution and logged clear host message');

  // (c) seedSuperadmin.js
  console.log('  Testing seedSuperadmin.js guard...');
  const seedSuperadminRes = await runScriptChild(path.join(__dirname, '../utils/seedSuperadmin.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(seedSuperadminRes.code, 1, 'seedSuperadmin.js must exit with code 1 on remote database');
  assert(seedSuperadminRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(seedSuperadminRes.combined.includes('remote-db.production.net'));
  assert(!seedSuperadminRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ seedSuperadmin.js refused execution and logged clear host message');

  // (d) migrateAuth.js
  console.log('  Testing migrateAuth.js guard...');
  const migrateAuthRes = await runScriptChild(path.join(__dirname, '../utils/migrateAuth.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(migrateAuthRes.code, 1, 'migrateAuth.js must exit with code 1 on remote database');
  assert(migrateAuthRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(migrateAuthRes.combined.includes('remote-db.production.net'));
  assert(!migrateAuthRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ migrateAuth.js refused execution and logged clear host message');

  // (e) cleanupTestLeftovers.js
  console.log('  Testing cleanupTestLeftovers.js guard...');
  const cleanupRes = await runScriptChild(path.join(__dirname, '../utils/cleanupTestLeftovers.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(cleanupRes.code, 1, 'cleanupTestLeftovers.js must exit with code 1 on remote database');
  assert(cleanupRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(cleanupRes.combined.includes('remote-db.production.net'));
  assert(!cleanupRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ cleanupTestLeftovers.js refused execution and logged clear host message');

  // (f) migrateResumesToGridfs.js
  console.log('  Testing migrateResumesToGridfs.js guard...');
  const migrateResumesRes = await runScriptChild(path.join(__dirname, '../utils/migrateResumesToGridfs.js'), {
    MONGO_URI: unsafeRemoteUri,
  });
  assert.strictEqual(migrateResumesRes.code, 1, 'migrateResumesToGridfs.js must exit with code 1 on remote database');
  assert(migrateResumesRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  assert(migrateResumesRes.combined.includes('remote-db.production.net'));
  assert(!migrateResumesRes.combined.includes('secret_pwd_99'));
  console.log('  ✓ migrateResumesToGridfs.js refused execution and logged clear host message');

  // ========================================================
  // 5. Override Execution Test with ALLOW_REMOTE_SEED
  // ========================================================
  console.log('\n5. Testing ALLOW_REMOTE_SEED=yes-i-am-sure override in child process...');
  // Point to a local port with unreachable dummy DB to verify guard did NOT block it
  const dummyRemoteUri = 'mongodb://127.0.0.1:27017/production_db'; // 127.0.0.1 with production_db
  const overrideRes = await runScriptChild(path.join(__dirname, '../utils/seedAdmin.js'), {
    MONGO_URI: 'mongodb://remote-db.allowed.corp:27017/production_db?serverSelectionTimeoutMS=500',
    ALLOW_REMOTE_SEED: 'yes-i-am-sure',
  });
  // The process will not exit because of the safety guard (it will proceed past the guard to connection attempt)
  assert(!overrideRes.combined.includes('Remote database write prevented by seed/migration safety guard'));
  console.log('✓ Verified guard does NOT block when ALLOW_REMOTE_SEED=yes-i-am-sure is set');

  // ========================================================
  // 6. Production Startup & migrateAuth Isolation Tests
  // ========================================================
  console.log('\n6. Testing Production Startup & migrateAuth Isolation from seedGuard...');

  // (a) migrateAuthUsers() exported function on remote MONGO_URI with stubbed DB: must not throw or exit
  console.log('  Testing (a): migrateAuthUsers() exported function on remote MONGO_URI (stubbed DB)...');
  const originalEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.MONGO_URI = 'mongodb+srv://user:pass@cluster.example.net/placement_management';
    delete process.env.MONGO_URI_TEST;
    delete process.env.ALLOW_REMOTE_SEED;

    // Stub database models so no real connection is needed
    const { User, College, Company, Aspirant } = require('../models');
    const origCollegeUpdate = College.updateMany;
    const origCompanyUpdate = Company.updateMany;
    const origUserCount = User.countDocuments;
    const origUserUpdate = User.updateMany;
    const origUserFindOne = User.findOne;
    const origUserCreate = User.create;

    College.updateMany = async () => ({ modifiedCount: 0 });
    Company.updateMany = async () => ({ modifiedCount: 0 });
    User.countDocuments = async () => 0;
    User.updateMany = async () => ({ modifiedCount: 0 });
    User.findOne = async () => null;
    User.create = async () => ({ _id: 'stub_id', save: async () => {} });

    const { migrateAuthUsers } = require('../utils/migrateAuth');

    let threw = false;
    try {
      await migrateAuthUsers();
    } catch (err) {
      threw = true;
      assert.fail(`migrateAuthUsers() should not have thrown, but threw: ${err.message}`);
    }
    assert.strictEqual(threw, false, 'migrateAuthUsers() must not throw on remote MONGO_URI');
    console.log('  ✓ (a) migrateAuthUsers() exported function completed cleanly without throwing or exiting');

    // Restore stubs
    College.updateMany = origCollegeUpdate;
    Company.updateMany = origCompanyUpdate;
    User.countDocuments = origUserCount;
    User.updateMany = origUserUpdate;
    User.findOne = origUserFindOne;
    User.create = origUserCreate;
  } finally {
    process.env = originalEnv;
  }

  // (b) CLI wrapper (node utils/migrateAuth.js) with remote URI still refuses and exits 1
  console.log('  Testing (b): CLI wrapper (node utils/migrateAuth.js) refuses remote MONGO_URI...');
  const remoteCliTestUri = 'mongodb+srv://user:pass@cluster.example.net/placement_management';
  const cliRes = await runScriptChild(path.join(__dirname, '../utils/migrateAuth.js'), {
    MONGO_URI: remoteCliTestUri,
    MONGO_URI_TEST: '',
    ALLOW_REMOTE_SEED: '',
  });
  assert.strictEqual(cliRes.code, 1, 'CLI execution of migrateAuth.js must exit 1 on remote DB');
  assert(
    cliRes.combined.includes('Remote database write prevented by seed/migration safety guard'),
    'CLI output must include safety guard refusal notice'
  );
  assert(cliRes.combined.includes('cluster.example.net'), 'CLI output must include clean host');
  assert(!cliRes.combined.includes('pass'), 'CLI output must never log credentials');
  console.log('  ✓ (b) CLI execution of migrateAuth.js cleanly refused remote MONGO_URI and exited 1');

  // (c) Regression test: server startup path (mongoose stubbed) does not import seedGuard
  console.log('  Testing (c): server startup path regression test (does not import seedGuard)...');
  const serverCheckScript = `
    const path = require('path');
    const mongoose = require('mongoose');
    // Stub connect so no remote connection occurs
    mongoose.connect = async () => ({ connection: { host: 'mock-cluster.net' } });
    mongoose.connection.db = {
      collection: (name) => ({
        createIndex: () => Promise.resolve(),
        find: () => ({ toArray: () => Promise.resolve([]) }),
        updateMany: () => Promise.resolve({ modifiedCount: 0 }),
        countDocuments: () => Promise.resolve(0),
        findOne: () => Promise.resolve(null),
        create: () => Promise.resolve({}),
      })
    };
    mongoose.connection.readyState = 1;

    // Stub http server listen so no port is bound
    const http = require('http');
    http.Server.prototype.listen = function(port, cb) {
      if (typeof port === 'function') port();
      if (typeof cb === 'function') cb();
      return this;
    };
    process.env.NODE_ENV = 'production';
    process.env.MONGO_URI = 'mongodb+srv://user:pass@cluster.example.net/placement_management';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.PORT = '0';
    process.env.CLIENT_URL = 'https://app.example.com';
    delete process.env.MONGO_URI_TEST;
    delete process.env.ALLOW_REMOTE_SEED;

    require(path.join(__dirname, '../server.js'));

    setTimeout(() => {
      const loaded = Object.keys(require.cache).filter((m) => m.toLowerCase().includes('seedguard'));
      if (loaded.length > 0) {
        console.error('FAIL: seedGuard was imported in server startup path:', loaded);
        process.exit(1);
      }
      console.log('PASS: seedGuard was NOT imported in server startup path');
      process.exit(0);
    }, 1000);
  `;

  const serverStartupRes = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', serverCheckScript], {
      cwd: __dirname,
      env: { ...process.env },
    });
    let combined = '';
    child.stdout.on('data', (d) => (combined += d.toString()));
    child.stderr.on('data', (d) => (combined += d.toString()));
    child.on('close', (code) => resolve({ code, combined }));
  });

  assert.strictEqual(
    serverStartupRes.code,
    0,
    `Server startup regression check failed with exit code ${serverStartupRes.code}: ${serverStartupRes.combined}`
  );
  assert(
    serverStartupRes.combined.includes('PASS: seedGuard was NOT imported in server startup path'),
    'Server startup must confirm seedGuard was not imported'
  );
  console.log('  ✓ (c) Server startup path confirmed to have ZERO seedGuard imports');

  console.log('\n======================================================');
  console.log('      ALL SEED & MIGRATION GUARD TESTS PASSED (100%)  ');
  console.log('======================================================\n');
}

if (require.main === module) {
  runSeedGuardTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test failed:', err);
      process.exit(1);
    });
}

module.exports = runSeedGuardTests;

