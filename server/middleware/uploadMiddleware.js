const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getStorageDriver, uploadDir } = require('../utils/storage');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk storage for local driver
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedExt = path.extname(file.originalname).toLowerCase();
    cb(null, `resume-${uniqueSuffix}${sanitizedExt}`);
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

// Multer upload instance
const uploadResume = multer({
  storage: dynamicStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: fileFilter,
});

module.exports = uploadResume;
