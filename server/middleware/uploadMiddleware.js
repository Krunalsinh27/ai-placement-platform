const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getStorageDriver, uploadDir } = require('../utils/storage');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Sanitize original filename to prevent path traversal, hidden characters,
 * shell meta-characters or overly long filenames.
 */
const sanitizeFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return 'resume.pdf';
  }
  // Strip null bytes and directory components
  let clean = path.basename(filename).replace(/\0/g, '');
  const ext = path.extname(clean).toLowerCase();
  let base = path.basename(clean, ext);
  // Keep only alphanumeric characters, hyphen, underscore
  base = base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').substring(0, 60);
  if (!base || base === '_') {
    base = 'resume';
  }
  return `${base}${ext === '.pdf' ? '.pdf' : '.pdf'}`;
};

/**
 * Validate that buffer or file on disk starts with the %PDF magic bytes (0x25, 0x50, 0x44, 0x46)
 */
const validatePdfMagicBytes = (fileOrPathOrBuffer) => {
  if (!fileOrPathOrBuffer) return false;
  try {
    if (Buffer.isBuffer(fileOrPathOrBuffer)) {
      return fileOrPathOrBuffer.length >= 4 && fileOrPathOrBuffer.subarray(0, 4).toString('utf8') === '%PDF';
    }
    if (fileOrPathOrBuffer.buffer && Buffer.isBuffer(fileOrPathOrBuffer.buffer)) {
      return fileOrPathOrBuffer.buffer.length >= 4 && fileOrPathOrBuffer.buffer.subarray(0, 4).toString('utf8') === '%PDF';
    }
    const targetPath = typeof fileOrPathOrBuffer === 'string' ? fileOrPathOrBuffer : fileOrPathOrBuffer.path;
    if (targetPath && fs.existsSync(targetPath)) {
      const fd = fs.openSync(targetPath, 'r');
      const buf = Buffer.alloc(4);
      const bytesRead = fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);
      return bytesRead >= 4 && buf.toString('utf8', 0, 4) === '%PDF';
    }
    return false;
  } catch (err) {
    return false;
  }
};

// Disk storage for local driver
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = sanitizeFilename(file.originalname);
    const safeBase = safeName.replace(/\.pdf$/i, '');
    cb(null, `resume-${uniqueSuffix}-${safeBase}.pdf`);
  },
});

// Memory storage for gridfs driver
const memoryStorage = multer.memoryStorage();

// Dynamic storage engine that selects driver based on getStorageDriver()
const dynamicStorage = {
  _handleFile(req, file, cb) {
    if (getStorageDriver() === 'gridfs') {
      memoryStorage._handleFile(req, file, cb);
    } else {
      diskStorage._handleFile(req, file, cb);
    }
  },
  _removeFile(req, file, cb) {
    if (getStorageDriver() === 'gridfs') {
      memoryStorage._removeFile(req, file, cb);
    } else {
      diskStorage._removeFile(req, file, cb);
    }
  },
};

// File filter: accept only PDF
const fileFilter = (req, file, cb) => {
  const isPdfMime = file.mimetype === 'application/pdf';
  const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';

  if (isPdfMime && isPdfExt) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents (.pdf) are allowed!'), false);
  }
};

// Multer upload instance with 5MB cap
const uploadResume = multer({
  storage: dynamicStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

/**
 * Express middleware to verify PDF magic bytes post-upload
 */
const verifyPdfMagicBytes = (req, res, next) => {
  if (!req.file) {
    return next();
  }
  if (!validatePdfMagicBytes(req.file)) {
    if (req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    return res.status(400).json({
      success: false,
      message: 'Uploaded file must be a valid PDF document with %PDF magic bytes',
    });
  }
  next();
};

uploadResume.sanitizeFilename = sanitizeFilename;
uploadResume.validatePdfMagicBytes = validatePdfMagicBytes;
uploadResume.verifyPdfMagicBytes = verifyPdfMagicBytes;

module.exports = uploadResume;
module.exports.sanitizeFilename = sanitizeFilename;
module.exports.validatePdfMagicBytes = validatePdfMagicBytes;
module.exports.verifyPdfMagicBytes = verifyPdfMagicBytes;

