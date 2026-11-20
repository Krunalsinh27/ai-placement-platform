/**
 * Resume Link & Deterministic Contact Extractor
 *
 * Deterministically extracts:
 * 1. Emails & Phone numbers via strict regex from visible text.
 * 2. URLs from visible text (regex).
 * 3. PDF Link Annotations from PDF buffer (using pdfjs-dist legacy getAnnotations and PDF dictionary fallback).
 * 4. DOCX Hyperlinks from DOCX buffer (using jszip parsing word/_rels/document.xml.rels).
 *
 * Normalizes URLs (https://, trailing punctuation) and classifies into:
 * - github
 * - linkedin
 * - portfolio
 * - other
 */

const { EMAIL_REGEX, PHONE_REGEX } = require('../ai/redactor');

// Regex for visible URLs in raw text
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|in|me|co|app|tech|ai|xyz|online|page|site)(?:\/[^\s<>"'{}|\\^`]*)?/gi;

// Trailing punctuation to strip from extracted URLs
const TRAILING_PUNCT_REGEX = /[.,;:!?)"'\]}>]+$/;

/**
 * Normalizes a URL:
 * - strips surrounding whitespace and trailing punctuation
 * - ensures https:// scheme if missing
 * - returns cleaned URL
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  url = url.replace(TRAILING_PUNCT_REGEX, '').trim();

  if (!url) return '';

  // Filter out mailto:
  if (url.toLowerCase().startsWith('mailto:')) {
    return '';
  }

  // Prepend or upgrade to https://
  if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://');
  } else if (!/^https:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Remove trailing slashes (except root domain)
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      return `${parsed.protocol}//${parsed.host}`;
    }
    // Clean trailing slash
    return url.replace(/\/+$/, '');
  } catch (_) {
    return url.replace(/\/+$/, '');
  }
}

/**
 * Classifies a normalized URL into github | linkedin | portfolio | other
 */
function classifyUrl(url) {
  if (!url) return 'other';
  const lower = url.toLowerCase();

  if (lower.includes('github.com')) return 'github';
  if (lower.includes('linkedin.com')) return 'linkedin';

  // Portfolio & developer profiles
  if (
    lower.includes('portfolio') ||
    lower.includes('devfolio') ||
    lower.includes('vercel.app') ||
    lower.includes('netlify.app') ||
    lower.includes('pages.dev') ||
    lower.includes('github.io') ||
    lower.includes('gitlab.io') ||
    lower.includes('gitlab.com') ||
    lower.includes('behance.net') ||
    lower.includes('dribbble.com') ||
    lower.includes('about.me') ||
    lower.includes('notion.site') ||
    lower.includes('.me/') ||
    lower.endsWith('.me') ||
    lower.includes('.dev/') ||
    lower.endsWith('.dev') ||
    lower.includes('linktree') ||
    lower.includes('bento.me')
  ) {
    return 'portfolio';
  }

  return 'other';
}

/**
 * Extracts visible URLs from text
 */
function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(URL_REGEX) || [];
  const urls = [];

  for (const match of matches) {
    // Exclude emails
    if (match.includes('@') && !match.toLowerCase().startsWith('http')) continue;
    const norm = normalizeUrl(match);
    if (norm && (norm.startsWith('http://') || norm.startsWith('https://'))) {
      urls.push(norm);
    }
  }

  return Array.from(new Set(urls));
}

/**
 * Extracts PDF Link annotations from buffer using pdfjs-dist with buffer dictionary regex fallback
 */
async function extractPdfLinkAnnotations(buffer) {
  const urls = [];
  if (!buffer || !Buffer.isBuffer(buffer)) return urls;

  // 1. pdfjs-dist page annotations
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      stopAtErrors: false,
    });

    const doc = await loadingTask.promise;
    const maxPages = Math.min(doc.numPages, 15);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const annotations = await page.getAnnotations({ intent: 'display' }).catch(() => []);
      for (const ann of annotations) {
        if (ann.subtype === 'Link' && ann.url) {
          const norm = normalizeUrl(ann.url);
          if (norm) urls.push(norm);
        }
      }
    }
  } catch (err) {
    // pdfjs extraction threw or wasn't available; proceed to buffer regex fallback
  }

  // 2. Raw PDF buffer regex fallback for /URI (http...) actions
  try {
    const bufStr = buffer.toString('binary');
    const uriRegex = /\/URI\s*\(([^)]+)\)/gi;
    let match;
    while ((match = uriRegex.exec(bufStr)) !== null) {
      const norm = normalizeUrl(match[1]);
      if (norm) urls.push(norm);
    }

    // Also check hex-encoded or bracketed URI objects: /URI <hex>
    const hexUriRegex = /\/URI\s*<([0-9a-fA-F]+)>/gi;
    while ((match = hexUriRegex.exec(bufStr)) !== null) {
      try {
        const decoded = Buffer.from(match[1], 'hex').toString('utf8');
        const norm = normalizeUrl(decoded);
        if (norm) urls.push(norm);
      } catch (_) {}
    }
  } catch (_) {}

  return Array.from(new Set(urls));
}

/**
 * Extracts DOCX Hyperlinks from buffer (word/_rels/document.xml.rels)
 */
async function extractDocxHyperlinks(buffer) {
  const urls = [];
  if (!buffer || !Buffer.isBuffer(buffer)) return urls;

  try {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      // Matches: <Relationship ... Target="https://..." ... Type=".../hyperlink"
      // or Type before Target
      const relRegex = /<Relationship\b([^>]+)\/?>/gi;
      let relMatch;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        const attrs = relMatch[1];
        if (/Type="[^"]*hyperlink"/i.test(attrs)) {
          const targetMatch = attrs.match(/Target="([^"]+)"/i);
          if (targetMatch && targetMatch[1]) {
            const norm = normalizeUrl(targetMatch[1]);
            if (norm) urls.push(norm);
          }
        }
      }
    }
  } catch (_) {}

  return Array.from(new Set(urls));
}

/**
 * Extracts emails from visible text using regex
 */
function extractEmailsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(EMAIL_REGEX) || [];
  return Array.from(new Set(matches.map((m) => m.trim().toLowerCase())));
}

/**
 * Extracts phone numbers from visible text using regex
 */
function extractPhonesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const phones = [];
  const matches = text.match(PHONE_REGEX) || [];
  for (const m of matches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) {
      phones.push(m.trim());
    }
  }
  return Array.from(new Set(phones));
}

/**
 * Master link and contact extractor
 * Deterministically extracts contacts, PDF/DOCX links, and visible URLs from raw text and buffer
 *
 * @param {Object} params
 * @param {Buffer} [params.buffer]
 * @param {string} [params.text]
 * @param {boolean} [params.isDocx=false]
 * @returns {Promise<{
 *   emails: string[],
 *   phones: string[],
 *   links: Array<{ url: string, type: 'github'|'linkedin'|'portfolio'|'other' }>,
 *   classified: { github: string, linkedin: string, portfolio: string, other: string[] }
 * }>}
 */
async function extractAllLinksAndContacts({ buffer = null, text = '', isDocx = false } = {}) {
  const emails = extractEmailsFromText(text);
  const phones = extractPhonesFromText(text);

  const rawUrls = new Set(extractUrlsFromText(text));

  if (buffer && Buffer.isBuffer(buffer)) {
    if (isDocx) {
      const docxUrls = await extractDocxHyperlinks(buffer);
      docxUrls.forEach((u) => rawUrls.add(u));
    } else {
      const pdfUrls = await extractPdfLinkAnnotations(buffer);
      pdfUrls.forEach((u) => rawUrls.add(u));
    }
  }

  const classified = {
    github: '',
    linkedin: '',
    portfolio: '',
    other: [],
  };

  const links = [];

  for (const url of Array.from(rawUrls)) {
    const type = classifyUrl(url);
    links.push({ url, type });

    if (type === 'github' && !classified.github) {
      classified.github = url;
    } else if (type === 'linkedin' && !classified.linkedin) {
      classified.linkedin = url;
    } else if (type === 'portfolio' && !classified.portfolio) {
      classified.portfolio = url;
    } else {
      classified.other.push(url);
    }
  }

  // If github/linkedin was not yet set, check if one of the 'other' is github/linkedin
  for (const item of links) {
    if (item.type === 'github' && !classified.github) classified.github = item.url;
    if (item.type === 'linkedin' && !classified.linkedin) classified.linkedin = item.url;
    if (item.type === 'portfolio' && !classified.portfolio) classified.portfolio = item.url;
  }

  return {
    emails,
    phones,
    links,
    classified,
  };
}

module.exports = {
  normalizeUrl,
  classifyUrl,
  extractUrlsFromText,
  extractPdfLinkAnnotations,
  extractDocxHyperlinks,
  extractEmailsFromText,
  extractPhonesFromText,
  extractAllLinksAndContacts,
  URL_REGEX,
};
