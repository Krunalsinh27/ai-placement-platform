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

module.exports = {
  getTestDbUri,
};

