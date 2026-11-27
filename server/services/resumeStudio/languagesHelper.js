/**
 * Languages Normalization Helper (Backend)
 */

function formatLanguageName(str) {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLanguages(input) {
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

module.exports = {
  formatLanguageName,
  normalizeLanguages,
};
