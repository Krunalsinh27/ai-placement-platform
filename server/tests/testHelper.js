const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

function getTestDbUri() {
  if (process.env.MONGO_URI_TEST) return process.env.MONGO_URI_TEST;
  const base = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  if (base.includes('?')) {
    const [dbPart, query] = base.split('?');
    return `${dbPart.replace(/_test$/, '')}_test?${query}`;
  }
  return `${base.replace(/_test$/, '')}_test`;
}

/**
 * Test database safety guard:
 * Refuses to run destructive test cleanup operations unless the target database
 * name strictly ends with "_test". Aborts the entire process/suite with a clear message otherwise.
 *
 * @param {string|Object} connectionOrDbName - Mongoose connection, database instance, or database name string
 */
function assertTestDatabase(connectionOrDbName) {
  let dbName = '';
  if (typeof connectionOrDbName === 'string') {
    dbName = connectionOrDbName;
  } else if (connectionOrDbName?.name) {
    dbName = connectionOrDbName.name;
  } else if (connectionOrDbName?.db?.databaseName) {
    dbName = connectionOrDbName.db.databaseName;
  }

  if (!dbName || !dbName.endsWith('_test')) {
    const errorMsg = `FATAL: Test cleanup refused to run on non-test database "${dbName || 'unknown'}". Database name must end with "_test" to prevent accidental data deletion in development or production. Aborting test suite.`;
    console.error(`\n❌ ${errorMsg}\n`);
    throw new Error(errorMsg);
  }
  return true;
}

module.exports = {
  getTestDbUri,
  assertTestDatabase,
};

