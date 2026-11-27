/**
 * Reversible Tokenizer for Resume PII & Links
 *
 * Replaces sensitive contact info and URLs with non-PII tokens:
 * [[EMAIL_1]], [[PHONE_1]], [[URL_1]], [[ADDR_1]], etc.
 * before dispatching to any external AI provider.
 *
 * Retains reversible mapping strictly in memory for the duration of the request.
 * Restores original values after validation.
 * NEVER logs text, tokens, or the token map.
 */

const { EMAIL_REGEX, PHONE_REGEX, ADDRESS_REGEX, isYearRangeOrDate } = require('../ai/redactor');
const { URL_REGEX } = require('./resumeLinkExtractor');

/**
 * Tokenizes text and structured data, returning tokenized text and reversible tokenMap.
 *
 * @param {string} text
 * @param {Object} [hints]
 * @param {string[]} [hints.emails]
 * @param {string[]} [hints.phones]
 * @param {string[]} [hints.urls]
 * @param {string[]} [hints.addresses]
 * @returns {{ tokenizedText: string, tokenMap: Record<string, string> }}
 */
function tokenizeText(text = '', hints = {}) {
  if (!text || typeof text !== 'string') {
    return { tokenizedText: '', tokenMap: {} };
  }

  const tokenMap = {};
  let tokenized = text;

  let emailCounter = 1;
  let phoneCounter = 1;
  let urlCounter = 1;
  let addrCounter = 1;

  // 1. Emails first (to prevent URL regex matching domain inside an email address)
  const allEmails = new Set([...(hints.emails || [])]);
  const textEmails = text.match(EMAIL_REGEX) || [];
  textEmails.forEach((e) => allEmails.add(e));

  const sortedEmails = Array.from(allEmails).sort((a, b) => b.length - a.length);
  for (const email of sortedEmails) {
    if (!email) continue;
    const token = `[[EMAIL_${emailCounter++}]]`;
    tokenMap[token] = email;
    tokenized = tokenized.split(email).join(token);
  }

  // 2. Addresses next
  const allAddrs = new Set([...(hints.addresses || [])]);
  const textAddrs = text.match(ADDRESS_REGEX) || [];
  textAddrs.forEach((a) => allAddrs.add(a));

  const sortedAddrs = Array.from(allAddrs).sort((a, b) => b.length - a.length);
  for (const addr of sortedAddrs) {
    if (!addr || addr.length < 6) continue;
    const token = `[[ADDR_${addrCounter++}]]`;
    tokenMap[token] = addr;
    tokenized = tokenized.split(addr).join(token);
  }

  // 3. Phones next
  const allPhones = new Set([...(hints.phones || [])]);
  const textPhones = text.match(PHONE_REGEX) || [];
  textPhones.forEach((p) => {
    if (isYearRangeOrDate(p)) return;
    const digits = p.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      allPhones.add(p);
    }
  });

  const sortedPhones = Array.from(allPhones).sort((a, b) => b.length - a.length);
  for (const phone of sortedPhones) {
    if (!phone) continue;
    const token = `[[PHONE_${phoneCounter++}]]`;
    tokenMap[token] = phone;
    tokenized = tokenized.split(phone).join(token);
  }

  // 4. URLs (now that emails are safely masked as [[EMAIL_n]])
  const allUrls = new Set([...(hints.urls || [])]);
  const textUrls = tokenized.match(URL_REGEX) || [];
  textUrls.forEach((u) => {
    if (!u.includes('@') && !u.startsWith('[[')) {
      allUrls.add(u);
    }
  });

  const sortedUrls = Array.from(allUrls).sort((a, b) => b.length - a.length);
  for (const url of sortedUrls) {
    if (!url || url.length < 4 || url.startsWith('[[')) continue;
    const token = `[[URL_${urlCounter++}]]`;
    tokenMap[token] = url;
    tokenized = tokenized.split(url).join(token);
  }

  return {
    tokenizedText: tokenized,
    tokenMap,
  };
}

/**
 * Recursively restores tokenized values back to original strings
 *
 * @param {any} target - string, array, object, or primitive
 * @param {Record<string, string>} tokenMap
 * @returns {any} Detokenized output with original values restored
 */
function detokenize(target, tokenMap = {}) {
  if (!tokenMap || Object.keys(tokenMap).length === 0 || target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    let result = target;
    for (const [token, original] of Object.entries(tokenMap)) {
      if (result.includes(token)) {
        result = result.split(token).join(original);
      }
    }
    return result;
  }

  if (Array.isArray(target)) {
    return target.map((item) => detokenize(item, tokenMap));
  }

  if (typeof target === 'object') {
    const output = {};
    for (const [key, val] of Object.entries(target)) {
      output[key] = detokenize(val, tokenMap);
    }
    return output;
  }

  return target;
}

module.exports = {
  tokenizeText,
  detokenize,
};
