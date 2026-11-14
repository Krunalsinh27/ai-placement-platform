import commonPasswordsList from './commonPasswords.json';

const commonPasswordsSet = new Set(commonPasswordsList.map((p) => p.toLowerCase().trim()));

/**
 * Validate password on client according to system policy:
 * 1. Minimum 10 characters
 * 2. Not in common-passwords list (200+ entries)
 * 3. Must not contain the email local-part or name
 *
 * @param {string} password
 * @param {Object} [options]
 * @param {string} [options.email]
 * @param {string} [options.name]
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePasswordPolicy(password, { email = '', name = '' } = {}) {
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      message: 'Password is required.',
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

  if (email && typeof email === 'string') {
    const rawLocal = email.split('@')[0] || '';
    const localPart = rawLocal.toLowerCase().trim();
    if (localPart.length >= 3 && normalizedPwd.includes(localPart)) {
      return {
        valid: false,
        message: 'Password must not contain parts of your email address.',
      };
    }
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

