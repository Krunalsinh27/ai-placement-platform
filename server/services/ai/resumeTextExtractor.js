/**
 * Extracts raw text from stored resumes (PDF via pdf-parse, DOCX via mammoth).
 * Integrates directly with getResumeStream from utils/storage.js.
 */

const crypto = require('crypto');
const mammoth = require('mammoth');
const { getResumeStream } = require('../../utils/storage');

const MAX_CHARACTERS = 50000;
const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_PAGES = 15;
const EXTRACTION_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Robust PDF text extractor enforcing max pages constraint
 */
async function parsePdfBuffer(buffer, maxPages = MAX_PDF_PAGES) {
  const pdfModule = require('pdf-parse');

  if (typeof pdfModule === 'function') {
    const data = await pdfModule(buffer, { max: maxPages });
    if (data.numpages && data.numpages > maxPages) {
      const err = new Error(`Resume exceeds maximum length of ${maxPages} pages.`);
      err.code = 'PAGE_LIMIT_EXCEEDED';
      throw err;
    }
    return data.text || '';
  }

  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo().catch(() => null);
      if (info && info.total && info.total > maxPages) {
        const err = new Error(`Resume exceeds maximum length of ${maxPages} pages.`);
        err.code = 'PAGE_LIMIT_EXCEEDED';
        throw err;
      }
      const res = await parser.getText();
      if (res.pages && res.pages.length > maxPages) {
        const err = new Error(`Resume exceeds maximum length of ${maxPages} pages.`);
        err.code = 'PAGE_LIMIT_EXCEEDED';
        throw err;
      }
      return res.text || '';
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy().catch(() => {});
      }
    }
  }

  if (pdfModule.default && typeof pdfModule.default === 'function') {
    const data = await pdfModule.default(buffer, { max: maxPages });
    if (data.numpages && data.numpages > maxPages) {
      const err = new Error(`Resume exceeds maximum length of ${maxPages} pages.`);
      err.code = 'PAGE_LIMIT_EXCEEDED';
      throw err;
    }
    return data.text || '';
  }

  throw new Error('Unsupported pdf-parse module format');
}

/**
 * Stream to Buffer helper with strict size limit check
 */
async function streamToBuffer(stream, maxBytes = MAX_RESUME_SIZE) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;

    if (totalBytes > maxBytes) {
      const err = new Error('Resume file size exceeds the 5MB limit for parsing.');
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

/**
 * Computes SHA-256 hash of a buffer
 */
function computeBufferHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Default text extraction pipeline: loads stream from storage, reads buffer, parses PDF/DOCX
 */
async function defaultExtractor(resumeUrl, { maxBytes = MAX_RESUME_SIZE, maxPages = MAX_PDF_PAGES } = {}) {
  const { stream, filename } = await getResumeStream(resumeUrl);
  const buffer = await streamToBuffer(stream, maxBytes);
  const hash = computeBufferHash(buffer);

  const lowerName = (filename || '').toLowerCase();
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');

  let text = '';
  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  } else {
    text = await parsePdfBuffer(buffer, maxPages);
  }

  const cleaned = text.trim();
  if (cleaned.length < 20) {
    const err = new Error('Resume appears to be empty, scanned, or contains no extractable text.');
    err.code = 'NO_TEXT';
    throw err;
  }

  // Enforce character limit
  const truncated = cleaned.slice(0, MAX_CHARACTERS);
  return { text: truncated, hash };
}

/**
 * Extract text from a student's stored resume URL with limits:
 * - Max file size: 5 MB
 * - Max PDF pages: 15
 * - Timeout: 10 seconds
 *
 * @param {string} resumeUrl
 * @param {Object} [options={}]
 * @param {number} [options.timeoutMs=10000]
 * @param {number} [options.maxBytes=5242880]
 * @param {number} [options.maxPages=15]
 * @param {Function} [options.extractorFn=defaultExtractor]
 * @returns {Promise<{ text: string, hash: string, unreadable: boolean, error?: string, code?: string }>}
 */
async function extractResumeText(resumeUrl, options = {}) {
  const timeoutMs = options.timeoutMs || EXTRACTION_TIMEOUT_MS;
  const maxBytes = options.maxBytes || MAX_RESUME_SIZE;
  const maxPages = options.maxPages || MAX_PDF_PAGES;
  const extractorFn = options.extractorFn || defaultExtractor;

  if (!resumeUrl) {
    return {
      text: '',
      hash: '',
      unreadable: true,
      error: 'No resume URL provided',
      code: 'NO_RESUME_URL',
    };
  }

  let hash = '';
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Resume text extraction timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      err.code = 'EXTRACTION_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  try {
    const extractionPromise = extractorFn(resumeUrl, { maxBytes, maxPages });
    const result = await Promise.race([extractionPromise, timeoutPromise]);
    return {
      text: result.text,
      hash: result.hash || '',
      unreadable: false,
    };
  } catch (err) {
    return {
      text: '',
      hash: hash || '',
      unreadable: true,
      error: err.message || 'Failed to extract resume text',
      code: err.code || 'EXTRACTION_ERROR',
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  extractResumeText,
  defaultExtractor,
  parsePdfBuffer,
  streamToBuffer,
  computeBufferHash,
  MAX_RESUME_SIZE,
  MAX_PDF_PAGES,
  EXTRACTION_TIMEOUT_MS,
  MAX_CHARACTERS,
};
