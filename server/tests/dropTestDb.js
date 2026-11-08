/**
 * server/tests/dropTestDb.js
 * Safely drops the automated test database.
 * Strictly verifies that the URI and DB name contain the keyword "test" before dropping.
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const { getTestDbUri } = require('./testHelper');

async function dropTestDb() {
  const uri = getTestDbUri();
  console.log('Targeting test database URI:', uri);

  // Safety check 1: Target URI must contain "test"
  if (!uri.toLowerCase().includes('test')) {
    console.error('REFUSING TO DROP DATABASE: Target URI does not contain "test" keyword:', uri);
    process.exit(1);
  }

  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;

  // Safety check 2: Target database name must contain "test"
  if (!dbName.toLowerCase().includes('test')) {
    console.error(`REFUSING TO DROP DATABASE: Database name "${dbName}" does not contain "test" keyword!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.connection.dropDatabase();
  console.log(`✓ Test database "${dbName}" dropped successfully.`);
  await mongoose.disconnect();
}

dropTestDb().catch((err) => {
  console.error('Failed to drop test database:', err);
  process.exit(1);
});

