const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri } = require('./testHelper');

const testSuites = [
  { name: 'test:datetime', file: 'tests/testDateTime.js' },
  { name: 'test:emailguard', file: 'tests/testEmailGuard.js' },
  { name: 'test:auth', file: 'tests/testAuth.js' },
  { name: 'test:colleges', file: 'tests/testColleges.js' },
  { name: 'test:notifications', file: 'tests/testNotifications.js' },
  { name: 'test:pipeline', file: 'tests/testPipeline.js' },
  { name: 'test:interviews', file: 'tests/testInterviews.js' },
  { name: 'test:emails', file: 'tests/testEmails.js' },
  { name: 'test:delivery', file: 'tests/testDeliveryModes.js' },
  { name: 'test:aptitude', file: 'tests/testAptitude.js' },
  { name: 'test:analyst', file: 'tests/testAnalyst.js' },
  { name: 'test:superadmin', file: 'tests/testSuperadmin.js' },
  { name: 'test:aspirant', file: 'tests/testAspirant.js' },
  { name: 'test:storage', file: 'tests/testStorage.js' },
  { name: 'test:deploy', file: 'tests/testDeployConfig.js' },
  { name: 'test:prodguard', file: 'tests/testProdGuard.js' },
  { name: 'test:reports', file: 'tests/testReports.js' },
  { name: 'test:ai', file: 'tests/testAiFeatures.js' },
];

async function ensureSeedInTestDb() {
  const uri = getTestDbUri();
  await mongoose.connect(uri);
  const User = mongoose.model(
    'User_Check',
    new mongoose.Schema({ email: String }),
    'users'
  );
  const existing = await User.findOne({ email: 'admin@college.com' });
  await mongoose.disconnect();

  if (!existing) {
    console.log('Seeding initial test database records for automated test runner...');
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(__dirname, '../utils/seedData.js')],
        {
          env: {
            ...process.env,
            MONGO_URI: uri,
            NODE_ENV: 'test',
            EMAIL_MODE: 'console',
          },
          stdio: 'inherit',
        }
      );
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Seeding test DB exited with code ${code}`));
      });
    });
  }
}

async function runSingleTest(suite) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    console.log(`\n======================================================`);
    console.log(`  STARTING SUITE: ${suite.name} (${suite.file})`);
    console.log(`======================================================`);

    const child = spawn(process.execPath, [path.join(__dirname, '..', suite.file)], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        EMAIL_MODE: 'console',
        MONGO_URI_TEST: getTestDbUri(),
      },
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      resolve({
        name: suite.name,
        file: suite.file,
        passed: code === 0,
        exitCode: code,
        duration: `${duration}s`,
      });
    });

    child.on('error', (err) => {
      resolve({
        name: suite.name,
        file: suite.file,
        passed: false,
        error: err.message,
        duration: '0s',
      });
    });
  });
}

async function runAll() {
  console.log('======================================================');
  console.log('       RUNNING ALL AUTOMATED TEST SUITES (CI)         ');
  console.log('======================================================');
  console.log(`Target Database: ${getTestDbUri()}`);
  console.log(`Email Mode:      ${process.env.EMAIL_MODE || 'console'}`);
  console.log(`Node Env:        ${process.env.NODE_ENV || 'test'}\n`);

  try {
    await ensureSeedInTestDb();
  } catch (err) {
    console.error('Failed to ensure test DB seed:', err);
    process.exit(1);
  }

  const results = [];
  for (const suite of testSuites) {
    const res = await runSingleTest(suite);
    results.push(res);
    if (!res.passed) {
      console.error(`\n❌ Suite ${suite.name} failed with exit code ${res.exitCode}`);
      break;
    }
  }

  console.log('\n======================================================');
  console.log('               TEST RUNNER SUMMARY                    ');
  console.log('======================================================');
  console.table(
    results.map((r) => ({
      Suite: r.name,
      Status: r.passed ? 'PASSED ✓' : 'FAILED ✗',
      Duration: r.duration,
      ExitCode: r.exitCode !== undefined ? r.exitCode : 'ERR',
    }))
  );

  const allPassed = results.length === testSuites.length && results.every((r) => r.passed);
  if (allPassed) {
    console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY (100%)\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TEST SUITES FAILED.\n');
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

