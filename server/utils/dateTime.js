/**
 * server/utils/dateTime.js
 * Centralized Date & Time parsing and formatting for Asia/Kolkata (IST).
 */

/**
 * Checks whether a date string includes an explicit timezone indicator:
 * - 'Z' at the end (e.g. 2026-11-20T06:00:00Z)
 * - An offset (+hh:mm, -hh:mm, +hh, -hh) following a time component (e.g. 2026-11-20T06:00:00+05:30)
 *
 * @param {string} str
 * @returns {boolean}
 */
function hasTimezoneIndicator(str) {
  return /Z$/i.test(str) || /:\d{2}(?:\.\d+)?[+-]\d{2}(?::?\d{2})?$/.test(str);
}

/**
 * Parses an input value (string, Date, number) into a Date object.
 * If a string input does NOT contain an explicit timezone designator ('Z' or '[+-]HH:mm'),
 * it is interpreted as Asia/Kolkata (+05:30) for standard formats:
 * - YYYY-MM-DD (treated as YYYY-MM-DDT00:00:00+05:30)
 * - YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm (treated as YYYY-MM-DDTHH:mm:00+05:30)
 * - YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD HH:mm:ss (treated as YYYY-MM-DDTHH:mm:ss+05:30)
 *
 * If the string already contains 'Z' or an offset ('+05:30', '-05:00', etc.),
 * or if it is already a Date or number, it is parsed normally.
 * Returns an Invalid Date (isNaN(d.getTime())) for bad or unparseable input.
 *
 * @param {string|Date|number} value
 * @returns {Date}
 */
function parseISTDateTime(value) {
  if (value === null || value === undefined || value === '') {
    return new Date(NaN);
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date(NaN) : new Date(value.getTime());
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value !== 'string') {
    return new Date(NaN);
  }

  const str = value.trim();
  if (!str) {
    return new Date(NaN);
  }

  // If it already has an explicit timezone designator (Z or offset after time)
  if (hasTimezoneIndicator(str)) {
    return new Date(str);
  }

  // Format: YYYY-MM-DD (date only) -> interpret as start of day in IST (00:00:00+05:30)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T00:00:00+05:30`);
  }

  // Format: YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm (from <input type="datetime-local">)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(str)) {
    return new Date(`${str.replace(' ', 'T')}:00+05:30`);
  }

  // Format: YYYY-MM-DDTHH:mm:ss (or with fractional seconds)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(str)) {
    return new Date(`${str.replace(' ', 'T')}+05:30`);
  }

  // Fallback to standard Date parsing (which returns Invalid Date for unparseable text)
  return new Date(str);
}

/**
 * Returns date details (dateStr: YYYY-MM-DD, hour: 0-23, minute: 0-59) in Asia/Kolkata timezone.
 *
 * @param {Date|string|number} date
 * @returns {{ dateStr: string, timeStr: string, hour: number, minute: number }|null}
 */
function getISTTimeDetails(date) {
  if (!date) return null;
  const d = parseISTDateTime(date);
  if (isNaN(d.getTime())) return null;

  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }); // HH:MM:SS
  const [hourStr, minStr] = timeStr.split(':');

  return {
    dateStr,
    timeStr,
    hour: parseInt(hourStr, 10),
    minute: parseInt(minStr, 10),
  };
}

/**
 * Format a date object/string in Asia/Kolkata (IST).
 *
 * @param {Date|string|number} date
 * @param {object} options
 * @returns {string}
 */
function formatIST(date, options = {}) {
  if (!date) return '—';
  const d = parseISTDateTime(date);
  if (isNaN(d.getTime())) return '—';

  if (options.dateOnly) {
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

module.exports = {
  parseISTDateTime,
  hasTimezoneIndicator,
  getISTTimeDetails,
  formatIST,
};

