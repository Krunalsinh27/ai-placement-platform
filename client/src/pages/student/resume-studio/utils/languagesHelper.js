/**
 * Languages Normalization Helper
 */

/**
 * Capitalizes the first letter of each word in a language name
 */
export function formatLanguageName(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalizes language input from string (comma/newline separated) or array
 * into a clean deduplicated string array: ["English", "Hindi", "Gujarati"]
 */
export function normalizeLanguages(input) {
  if (!input) return [];

  let rawList = [];
  if (typeof input === 'string') {
    rawList = input.split(/[\r\n,]+/);
  } else if (Array.isArray(input)) {
    rawList = input.flatMap((item) => (typeof item === 'string' ? item.split(/[\r\n,]+/) : []));
  } else {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const item of rawList) {
    const formatted = formatLanguageName(item);
    if (!formatted) continue;
    const lower = formatted.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(formatted);
    }
  }

  return result;
}

export const COMMON_LANGUAGE_SUGGESTIONS = [
  'English',
  'Hindi',
  'Gujarati',
  'Marathi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Bengali',
  'Punjabi',
  'Malayalam',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Mandarin',
];
