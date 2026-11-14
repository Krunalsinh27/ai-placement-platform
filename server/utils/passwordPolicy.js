const commonPasswordsList = require('./commonPasswords.json');

const commonPasswordsSet = new Set(commonPasswordsList.map((p) => p.toLowerCase().trim()));

/**
 * Validate password according to system policy:
 * 1. Minimum 10 characters
 * 2. Not in common-passwords list (200+ entries)
 * 3. Must not contain the email local-part (or sub-tokens >= 3 chars)
 * 4. Must not contain the user's name (tokens >= 3 chars)
 *
 * @param {string} password - Raw password to check
 * @param {Object} [options]
 * @param {string} [options.email] - User's email
 * @param {string} [options.name] - User's full name
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordPolicy(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return {
      valid: false,
      message: 'Password is required and must be a string.',
    };
  }

  if (password.length < 10) {
    return {
      valid: false,
      message: 'Password must be at least 10 characters long.',
    };
  }

  const normalizedPwd = password.toLowerCase().trim();

  if (commonPasswordsSet.has(normalizedPwd)) {
    return {
      valid: false,
      message: 'Password is too common or easily guessed. Please choose a more unique password.',
    };
  }

  // Check email local-part
  if (email && typeof email === 'string') {
    const rawLocal = email.split('@')[0] || '';
    const localPart = rawLocal.toLowerCase().trim();
    if (localPart.length >= 3 && normalizedPwd.includes(localPart)) {
      return {
        valid: false,
        message: 'Password must not contain your email username.',
      };
    }
    // Also check alphanumeric subparts of email local part (e.g. "john" in "john.doe")
    const emailParts = localPart.split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
    for (const part of emailParts) {
      if (normalizedPwd.includes(part)) {
        return {
          valid: false,
          message: 'Password must not contain parts of your email address.',
        };
      }
    }
  }

  // Check name tokens
  if (name && typeof name === 'string') {
    const nameTokens = name
      .toLowerCase()
      .trim()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    for (const token of nameTokens) {
      if (normalizedPwd.includes(token)) {
        return {
          valid: false,
          message: 'Password must not contain your name.',
        };
      }
    }
  }

  return { valid: true };
}

module.exports = {
  validatePasswordPolicy,
  commonPasswordsSet,
};

