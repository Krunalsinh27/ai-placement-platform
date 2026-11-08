process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const assert = require('assert');
const { parseISTDateTime, getISTTimeDetails, formatIST } = require('../utils/dateTime');

console.log('======================================================');
console.log('       TEST: IST DATE-TIME PARSER & UTILITIES          ');
console.log('======================================================\n');

// 1. Naive string (no timezone designator, e.g. from <input type="datetime-local">)
const naive1 = parseISTDateTime('2026-11-20T06:00');
assert(!isNaN(naive1.getTime()), 'Naive datetime string should be valid');
assert.strictEqual(
  naive1.toISOString(),
  '2026-11-20T00:30:00.000Z',
  '2026-11-20T06:00 without timezone must be parsed as 06:00 IST (00:30 UTC)'
);
const naive1Details = getISTTimeDetails(naive1);
assert.strictEqual(naive1Details.hour, 6, 'IST hour must be 6');
assert.strictEqual(naive1Details.minute, 0, 'IST minute must be 0');
assert.strictEqual(naive1Details.dateStr, '2026-11-20', 'IST dateStr must be 2026-11-20');
console.log('✓ Naive datetime string (YYYY-MM-DDTHH:mm) parsed as Asia/Kolkata (+05:30)');

// 2. Naive string with seconds
const naiveWithSec = parseISTDateTime('2026-11-20T14:30:45');
assert.strictEqual(
  naiveWithSec.toISOString(),
  '2026-11-20T09:00:45.000Z',
  '2026-11-20T14:30:45 must be parsed as 14:30:45 IST (09:00:45 UTC)'
);
console.log('✓ Naive datetime string with seconds parsed as Asia/Kolkata (+05:30)');

// 3. Date-only string (YYYY-MM-DD)
const dateOnly = parseISTDateTime('2026-11-20');
assert.strictEqual(
  dateOnly.toISOString(),
  '2026-11-19T18:30:00.000Z',
  '2026-11-20 date-only must be parsed as 2026-11-20 00:00:00 IST (18:30 UTC previous day)'
);
const dateOnlyDetails = getISTTimeDetails(dateOnly);
assert.strictEqual(dateOnlyDetails.dateStr, '2026-11-20', 'IST dateStr for date-only input must be 2026-11-20');
assert.strictEqual(dateOnlyDetails.hour, 0, 'IST hour must be 0');
console.log('✓ Date-only string (YYYY-MM-DD) parsed as start-of-day in Asia/Kolkata');

// 4. String with explicit 'Z' (UTC)
const withZ = parseISTDateTime('2026-11-20T06:00:00Z');
assert.strictEqual(
  withZ.toISOString(),
  '2026-11-20T06:00:00.000Z',
  'String with explicit Z must be parsed as UTC without adding +05:30'
);
const withZDetails = getISTTimeDetails(withZ);
assert.strictEqual(withZDetails.hour, 11, '06:00 UTC must be 11:30 in IST');
assert.strictEqual(withZDetails.minute, 30, '06:00 UTC must be 11:30 in IST');
console.log('✓ Explicit UTC (Z) string parsed correctly without alteration');

// 5. String with explicit +05:30 offset
const withISTOffset = parseISTDateTime('2026-11-20T06:00:00+05:30');
assert.strictEqual(
  withISTOffset.toISOString(),
  '2026-11-20T00:30:00.000Z',
  'String with +05:30 must parse to 00:30 UTC'
);
console.log('✓ Explicit +05:30 offset string parsed correctly');

// 6. String with other explicit offset (-05:00)
const withOtherOffset = parseISTDateTime('2026-11-20T06:00:00-05:00');
assert.strictEqual(
  withOtherOffset.toISOString(),
  '2026-11-20T11:00:00.000Z',
  'String with -05:00 must parse to 11:00 UTC'
);
console.log('✓ Non-IST explicit offset string parsed correctly');

// 7. Invalid string input
const invalid1 = parseISTDateTime('invalid-date-string');
assert(isNaN(invalid1.getTime()), 'Invalid string must return Invalid Date');
const invalid2 = parseISTDateTime('');
assert(isNaN(invalid2.getTime()), 'Empty string must return Invalid Date');
const invalid3 = parseISTDateTime(null);
assert(isNaN(invalid3.getTime()), 'Null must return Invalid Date');
const invalid4 = parseISTDateTime(undefined);
assert(isNaN(invalid4.getTime()), 'Undefined must return Invalid Date');
console.log('✓ Invalid, empty, null, and undefined values safely return Invalid Date');

// 8. Date instance and Number timestamp inputs
const now = new Date();
const fromDate = parseISTDateTime(now);
assert.strictEqual(fromDate.getTime(), now.getTime(), 'Date object must be preserved');
const fromTimestamp = parseISTDateTime(now.getTime());
assert.strictEqual(fromTimestamp.getTime(), now.getTime(), 'Timestamp number must be preserved');
console.log('✓ Existing Date objects and numeric timestamps handled seamlessly');

// 9. Format IST helper
const formatted = formatIST('2026-11-20T06:00');
assert(formatted.includes('Nov') || formatted.includes('11'), 'Formatted output must contain month');
console.log(`✓ formatIST output verified: "${formatted}"`);

console.log('\n======================================================');
console.log('      ALL DATE-TIME UNIT TESTS PASSED (100%)          ');
console.log('======================================================\n');

