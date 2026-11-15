/**
 * Safety Guard for Database Seed and Migration Scripts
 *
 * Protects remote databases (staging, production) from accidental data overwrites or test data pollution.
 * Refuses execution UNLESS:
 *   1. MONGO_URI points to localhost or 127.0.0.1 (or ::1), OR
 *   2. The target database name ends in "_test" or "_dev", OR
 *   3. Environment variable ALLOW_REMOTE_SEED=yes-i-am-sure is explicitly set.
 *
 * SECURITY GUARANTEE: Never prints or logs username or password credentials.
 */

/**
 * Safely parse a MongoDB connection URI without exposing credentials.
 *
 * @param {string} rawUri - MongoDB connection string
 * @returns {{ isValid: boolean, hosts: string[], hostString: string, database: string }}
 */
function parseMongoUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') {
    return {
      isValid: false,
      hosts: [],
      hostString: 'unknown',
      database: '',
    };
  }

  const uri = rawUri.trim();

  // Match MongoDB URI pattern:
  // (mongodb(+srv)?://)(optional credentials@)(hosts)(optional /database)(optional ?options)
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)(?:(.*)@)?([^/?#]+)(?:\/([^?#]*))?/i);
  if (!match) {
    return {
      isValid: false,
      hosts: [],
      hostString: 'unknown',
      database: '',
    };
  }

  const hostPart = match[3] || '';
  const rawDb = match[4] || '';
  const dbName = rawDb.split('?')[0].split('/')[0].trim();

  // Split multiple hosts for replica sets (e.g. host1:27017,host2:27017)
  const hostList = hostPart
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  const cleanHosts = hostList.map((h) => {
    if (h.startsWith('[')) {
      const closing = h.indexOf(']');
      return closing > -1 ? h.substring(1, closing) : h;
    }
    return h.split(':')[0].toLowerCase();
  });

  return {
    isValid: true,
    hosts: cleanHosts,
    hostString: hostPart, // Credential-free host string (e.g. "cluster0.abcde.mongodb.net" or "localhost:27017")
    database: dbName,
  };
}

/**
 * Check if the target Mongo URI and environment are safe for seeding/migration.
 *
 * @param {string} rawUri - MongoDB URI
 * @param {Object} env - Environment variables object (defaults to process.env)
 * @returns {{ allowed: boolean, reason: string, host: string, database: string }}
 */
function isSafeSeedEnvironment(rawUri, env = process.env) {
  const uri = rawUri || env.MONGO_URI || 'mongodb://localhost:27017/placement_management';
  const parsed = parseMongoUri(uri);

  // 1. Explicit override check: ALLOW_REMOTE_SEED=yes-i-am-sure
  if (env.ALLOW_REMOTE_SEED === 'yes-i-am-sure') {
    return {
      allowed: true,
      reason: 'ALLOW_REMOTE_SEED override active',
      host: parsed.hostString,
      database: parsed.database,
    };
  }

  // 2. Localhost / 127.0.0.1 / ::1 check
  const isLocalHost =
    parsed.hosts.length > 0 &&
    parsed.hosts.every((h) => h === 'localhost' || h === '127.0.0.1' || h === '::1');

  if (isLocalHost) {
    return {
      allowed: true,
      reason: 'Points to local host (localhost / 127.0.0.1)',
      host: parsed.hostString,
      database: parsed.database,
    };
  }

  // 3. Database name check: ends with _test or _dev
  const db = parsed.database.toLowerCase();
  const isSafeDbName = db.endsWith('_test') || db.endsWith('_dev');

  if (isSafeDbName) {
    return {
      allowed: true,
      reason: 'Database name ends with _test or _dev',
      host: parsed.hostString,
      database: parsed.database,
    };
  }

  // Otherwise, refuse
  return {
    allowed: false,
    reason: `Target database host "${parsed.hostString}" is remote and database "${parsed.database || '(default)'}" does not end with _test or _dev`,
    host: parsed.hostString,
    database: parsed.database,
  };
}

/**
 * Enforces the safety guard. Throws an Error with a clear message if unsafe.
 *
 * @param {string} rawUri - MongoDB URI
 * @param {Object} env - Environment variables object (defaults to process.env)
 * @returns {boolean} true if safe
 * @throws {Error} if unsafe
 */
function assertSafeSeedEnvironment(rawUri, env = process.env) {
  const check = isSafeSeedEnvironment(rawUri, env);
  if (!check.allowed) {
    const errorMsg =
      `FATAL: Remote database write prevented by seed/migration safety guard.\n` +
      `Target database host: "${check.host}"\n` +
      `Database name:        "${check.database || '(default)'}"\n` +
      `Refusing to run seed or migration script: target is not localhost/127.0.0.1 and database does not end in _test or _dev.\n` +
      `To explicitly allow running against this remote database, set environment variable:\n` +
      `  ALLOW_REMOTE_SEED=yes-i-am-sure`;

    console.error(`\n❌ ${errorMsg}\n`);
    throw new Error(errorMsg);
  }
  return true;
}

module.exports = {
  parseMongoUri,
  isSafeSeedEnvironment,
  assertSafeSeedEnvironment,
};

