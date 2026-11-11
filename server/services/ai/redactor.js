/**
 * PII Redaction utility for resumes.
 * Strips emails, phone numbers, street addresses, and national ID patterns before LLM transmission.
 */

// Common email regex
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

// Phone number regex (covers Indian 10-digit, +91, international, dashes, parentheses)
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}\b/g;

// Aadhaar card pattern: 12 digits with or without spaces
const AADHAAR_REGEX = /\b\d{4}\s\d{4}\s\d{4}\b/g;

// Indian PAN card pattern: 5 uppercase letters, 4 digits, 1 uppercase letter
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;

// US SSN pattern: 3 digits, 2 digits, 4 digits
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Street addresses patterns (e.g. 123 Main St, Sector 21, Road, Avenue, etc.)
const ADDRESS_REGEX = /\b\d+[\w\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Nagar|Colony|Lane|Drive|Dr|Sector|Block|Apartment|Apt|Plot)\b/gi;

/**
 * Redacts personal identifying information from the input text
 * @param {string} text - Raw resume text
 * @returns {string} Redacted text safe for LLM consumption
 */
function redactPII(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Redact Emails
  sanitized = sanitized.replace(EMAIL_REGEX, '[EMAIL_REDACTED]');

  // 2. Redact Aadhaar, PAN, SSN
  sanitized = sanitized.replace(AADHAAR_REGEX, '[ID_REDACTED]');
  sanitized = sanitized.replace(PAN_REGEX, '[ID_REDACTED]');
  sanitized = sanitized.replace(SSN_REGEX, '[ID_REDACTED]');

  // 3. Redact Phone numbers
  sanitized = sanitized.replace(PHONE_REGEX, (match) => {
    // Only redact if the match has at least 7 digits to avoid matching small numbers
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      return '[PHONE_REDACTED]';
    }
    return match;
  });

  // 4. Redact Addresses
  sanitized = sanitized.replace(ADDRESS_REGEX, '[ADDRESS_REDACTED]');

  return sanitized;
}

module.exports = {
  redactPII,
  EMAIL_REGEX,
  PHONE_REGEX,
  AADHAAR_REGEX,
  PAN_REGEX,
  SSN_REGEX,
};

