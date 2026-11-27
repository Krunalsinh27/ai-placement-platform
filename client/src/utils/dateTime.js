/**
 * client/src/utils/dateTime.js
 * Centralized Date & Time helpers for Asia/Kolkata (IST).
 */

/**
 * Format a Date, ISO string, or timestamp into an input value suitable for:
 * - <input type="datetime-local"> -> 'YYYY-MM-DDTHH:mm'
 * - <input type="date"> (with { dateOnly: true }) -> 'YYYY-MM-DD'
 *
 * Guarantees that the calendar date and time shown in the input match Asia/Kolkata (IST)
 * regardless of the user's browser system timezone.
 *
 * @param {Date|string|number} dateVal
 * @param {{ dateOnly?: boolean }} [options]
 * @returns {string}
 */
export function toISTInputValue(dateVal, options = {}) {
  if (!dateVal) return '';

  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';

  const datePart = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

  if (options.dateOnly) {
    return datePart;
  }

  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // HH:mm

  return `${datePart}T${timePart}`;
}

/**
 * Formats a date in Asia/Kolkata (IST) e.g. "20 Nov 2026"
 *
 * @param {Date|string|number} dateVal
 * @param {Intl.DateTimeFormatOptions} [customOptions]
 * @returns {string}
 */
export function formatISTDate(dateVal, customOptions = {}) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...customOptions,
  });
}

/**
 * Formats a time in Asia/Kolkata (IST) e.g. "06:00 AM"
 *
 * @param {Date|string|number} dateVal
 * @param {Intl.DateTimeFormatOptions} [customOptions]
 * @returns {string}
 */
export function formatISTTime(dateVal, customOptions = {}) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...customOptions,
  });
}

/**
 * Formats date and time in Asia/Kolkata (IST) e.g. "20 Nov 2026, 06:00 AM"
 *
 * @param {Date|string|number} dateVal
 * @param {Intl.DateTimeFormatOptions} [customOptions]
 * @returns {string}
 */
export function formatISTDateTime(dateVal, customOptions = {}) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...customOptions,
  });
}

/**
 * Parses an input value (e.g. 'YYYY-MM-DDTHH:mm') explicitly as Asia/Kolkata (IST, UTC+05:30).
 *
 * @param {string|Date} val
 * @returns {Date|null}
 */
export function parseISTInputValue(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return new Date(val);
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(`${trimmed}${trimmed.length === 16 ? ':00' : ''}+05:30`);
  }
  return new Date(trimmed);
}

