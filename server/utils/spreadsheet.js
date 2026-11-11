/**
 * server/utils/spreadsheet.js
 * Helpers for safe spreadsheet (Excel & CSV) exports and formula injection prevention.
 */

/**
 * Sanitizes a cell value to prevent CSV / Spreadsheet Formula Injection in Excel, LibreOffice, and Sheets.
 * If a string begins with =, +, -, @, \t, or \r, prefixes it with a single quote (')
 * so spreadsheet applications treat it as literal text rather than an executable formula or command.
 *
 * @param {*} val
 * @returns {*}
 */
function sanitizeSpreadsheetValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Formats a value as a safely escaped and quoted RFC 4180 CSV cell.
 * Neutralizes formula injection characters, escapes embedded double quotes (" -> ""),
 * and properly wraps multi-line strings or special characters in double quotes.
 *
 * @param {*} val
 * @returns {string}
 */
function escapeCsvCell(val) {
  const sanitized = sanitizeSpreadsheetValue(val);
  const str = String(sanitized);
  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = {
  sanitizeSpreadsheetValue,
  escapeCsvCell,
};

