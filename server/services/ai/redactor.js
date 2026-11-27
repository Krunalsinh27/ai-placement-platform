/**
 * PII Redaction utility for resumes, assistant prompts, and AI payloads.
 * Strips emails, phone numbers, street addresses, national ID patterns,
 * and credentials (API keys, tokens, private keys) before external transmission.
 */

// Common email regex
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

// Phone number regex (covers Indian 10-digit, +91, international, dashes, parentheses)
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}(?:[-.\s]?\d{3,5})?\b/g;

// Aadhaar card pattern: 12 digits with or without spaces
const AADHAAR_REGEX = /\b\d{4}\s\d{4}\s\d{4}\b/g;

// Indian PAN card pattern: 5 uppercase letters, 4 digits, 1 uppercase letter
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;

// US SSN pattern: 3 digits, 2 digits, 4 digits
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Street addresses patterns with bounded repetition to prevent ReDoS / polynomial backtracking
const ADDRESS_REGEX = /\b\d{1,5}[,\s]+[A-Za-z0-9\s,.-]{3,60}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Nagar|Colony|Lane|Drive|Dr\.?|Sector\s+\d+|Block\s+[A-Za-z0-9]+|Apartment|Apt\.?|Plot)\b/gi;

// API keys and Credentials patterns (Google AIza, Groq gsk_, OpenAI sk-, GitHub tokens, AWS keys, Bearer tokens, PEM private keys)
const CREDENTIALS_REGEX = /(?:AIza[0-9A-Za-z\-_]{30,45}|gsk_[a-zA-Z0-9]{20,}|sk-(?:proj-|live-)?[a-zA-Z0-9_\-]{20,}|(?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{50,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9\-._~+/]+=*|-----BEGIN (?:[A-Z\s]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z\s]+)?PRIVATE KEY-----)/gi;

// Maximum string size processed by redaction to avoid catastrophic memory consumption
const MAX_REDACT_TEXT_LENGTH = 100000;

/**
 * Checks if a string pattern represents an educational/work year range (e.g. 2019-2023) or calendar date
 * to prevent false-positive phone number redactions.
 *
 * @param {string} match - Substring matched by PHONE_REGEX
 * @returns {boolean} True if the match is a date or year range
 */
function isYearRangeOrDate(match) {
  if (!match || typeof match !== 'string') return false;
  const trimmed = match.trim().replace(/^[\(\[\{]/, '').replace(/[\)\]\}]$/, '').trim();

  // Year ranges: 2019-2023, 2020 - 2024, 2018-22, 1998 - 2002, 2020/2024
  if (/^(?:19|20)\d{2}\s*[-–—/]\s*(?:(?:19|20)\d{2}|\d{2})$/.test(trimmed)) {
    return true;
  }

  // Full calendar dates: YYYY-MM-DD, DD-MM-YYYY, YYYY/MM/DD, DD/MM/YYYY
  if (
    /^(?:19|20)\d{2}[-–—/](?:0?[1-9]|1[0-2])[-–—/](?:0?[1-9]|[12]\d|3[01])$/.test(trimmed) ||
    /^(?:0?[1-9]|[12]\d|3[01])[-–—/](?:0?[1-9]|1[0-2])[-–—/](?:19|20)\d{2}$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Redacts personal identifying information from the input text
 * @param {string} text - Raw input text
 * @returns {string} Redacted text safe for LLM consumption
 */
function redactPII(text) {
  if (!text || typeof text !== 'string') return '';

  // Bound text length to prevent memory exhaustion
  let sanitized = text.length > MAX_REDACT_TEXT_LENGTH ? text.slice(0, MAX_REDACT_TEXT_LENGTH) : text;

  // 1. Redact API keys and Credentials first
  sanitized = sanitized.replace(CREDENTIALS_REGEX, '[CREDENTIAL_REDACTED]');

  // 2. Redact Emails
  sanitized = sanitized.replace(EMAIL_REGEX, '[EMAIL_REDACTED]');

  // 3. Redact Aadhaar, PAN, SSN
  sanitized = sanitized.replace(AADHAAR_REGEX, '[ID_REDACTED]');
  sanitized = sanitized.replace(PAN_REGEX, '[ID_REDACTED]');
  sanitized = sanitized.replace(SSN_REGEX, '[ID_REDACTED]');

  // 4. Redact Phone numbers (with year-range protection)
  sanitized = sanitized.replace(PHONE_REGEX, (match) => {
    if (isYearRangeOrDate(match)) {
      return match;
    }
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      return '[PHONE_REDACTED]';
    }
    return match;
  });

  // 5. Redact Addresses
  sanitized = sanitized.replace(ADDRESS_REGEX, '[ADDRESS_REDACTED]');

  return sanitized;
}

module.exports = {
  redactPII,
  isYearRangeOrDate,
  EMAIL_REGEX,
  PHONE_REGEX,
  AADHAAR_REGEX,
  PAN_REGEX,
  SSN_REGEX,
  ADDRESS_REGEX,
  CREDENTIALS_REGEX,
  MAX_REDACT_TEXT_LENGTH,
};
