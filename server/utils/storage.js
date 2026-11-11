const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Determine the active storage driver.
 * Returns 'gridfs' or 'local'.
 * Defaults:
 *   - 'gridfs' in production
 *   - 'local' in development and test
 * Can be explicitly overridden with STORAGE_DRIVER env variable ('local' or 'gridfs').
 */
const getStorageDriver = () => {
  if (process.env.STORAGE_DRIVER) {
    return process.env.STORAGE_DRIVER.toLowerCase().trim();
  }
  return process.env.NODE_ENV === 'production' ? 'gridfs' : 'local';
};

/**
 * Get the GridFS bucket for resumes
 */
const getGridFSBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB connection is not established for GridFS');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'resumes',
  });
};

/**
 * Validate that buffer or file has %PDF as first 4 bytes
 */
const isValidPdf = (file) => {
  try {
    if (file.buffer && Buffer.isBuffer(file.buffer)) {
      return file.buffer.subarray(0, 4).toString('utf8') === '%PDF';
    }
    if (file.path && fs.existsSync(file.path)) {
      const fd = fs.openSync(file.path, 'r');
      const buf = Buffer.alloc(4);
      fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);
      return buf.toString('utf8', 0, 4) === '%PDF';
    }
    return false;
  } catch (err) {
    return false;
  }
};

/**
 * Delete a resume file from either GridFS or local disk based on its URL/ID
 */
const deleteResumeFile = async (resumeUrl) => {
  if (!resumeUrl || typeof resumeUrl !== 'string') return;

  try {
    // 1. GridFS storage
    if (resumeUrl.startsWith('gridfs:')) {
      const idStr = resumeUrl.replace('gridfs:', '').trim();
      if (mongoose.Types.ObjectId.isValid(idStr)) {
        const bucket = getGridFSBucket();
        await bucket.delete(new mongoose.Types.ObjectId(idStr)).catch(() => {});
      }
      return;
    }

    // 2. Local disk storage
    if (resumeUrl.startsWith('/uploads/') || resumeUrl.startsWith('uploads/')) {
      const filename = path.basename(resumeUrl);
      const localFilePath = path.join(uploadDir, filename);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    }
  } catch (err) {
    console.warn(`[Storage] Warning: Failed to delete previous resume file (${resumeUrl}):`, err.message);
  }
};

/**
 * Save resume file to the active storage driver.
 * Automatically purges the previous resume from whichever store it was in.
 *
 * @param {Object} options
 * @param {Object} options.file - Multer file object (has buffer for gridfs, or path for disk)
 * @param {string|ObjectId} options.studentId - Student identifier
 * @param {string} [options.existingResumeUrl] - Old resume URL to clean up
 * @returns {Promise<string>} New resumeUrl
 */
const saveResumeFile = async (options) => {
  const file = options?.file || options || {};
  const studentId = options?.studentId || options?.student || 'candidate';
  const existingResumeUrl = options?.existingResumeUrl;
  const driver = getStorageDriver();

  // 1. Delete previous file if one existed
  if (existingResumeUrl) {
    await deleteResumeFile(existingResumeUrl);
  }

  // 2. Save using active driver
  if (driver === 'gridfs') {
    const bucket = getGridFSBucket();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `resume-${studentId}-${uniqueSuffix}.pdf`;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata: {
        studentId: String(studentId),
        originalName: file.originalname,
      },
    });

    const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
    if (!fileBuffer) {
      throw new Error('No file buffer available for GridFS upload');
    }

    await new Promise((resolve, reject) => {
      uploadStream.end(fileBuffer, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clean up temporary local file if it was on disk
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {}
    }

    return `gridfs:${uploadStream.id}`;
  }

  // Local disk driver
  if (file.path && fs.existsSync(file.path)) {
    return `/uploads/${file.filename}`;
  }

  // If multer memoryStorage was active but local driver requested
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const filename = `resume-${studentId}-${uniqueSuffix}.pdf`;
  const destination = path.join(uploadDir, filename);
  fs.writeFileSync(destination, file.buffer);
  return `/uploads/${filename}`;
};

/**
 * Stream a resume file by its stored resumeUrl.
 * Resolves with { stream, contentType, filename }.
 * Throws an error with status: 404 if not found.
 */
const getResumeStream = async (resumeUrl) => {
  if (!resumeUrl || typeof resumeUrl !== 'string') {
    const err = new Error('Resume not found for this student');
    err.status = 404;
    throw err;
  }

  // Handle GridFS files
  if (resumeUrl.startsWith('gridfs:')) {
    const idStr = resumeUrl.replace('gridfs:', '').trim();
    if (!mongoose.Types.ObjectId.isValid(idStr)) {
      const err = new Error('Invalid GridFS resume file ID');
      err.status = 404;
      throw err;
    }

    const bucket = getGridFSBucket();
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(idStr) }).toArray();
    if (!files || files.length === 0) {
      const err = new Error('Resume file not found in GridFS storage');
      err.status = 404;
      throw err;
    }

    const stream = bucket.openDownloadStream(new mongoose.Types.ObjectId(idStr));
    return {
      stream,
      contentType: files[0].contentType || 'application/pdf',
      filename: files[0].filename || 'resume.pdf',
    };
  }

  // Handle Local files
  const filename = path.basename(resumeUrl);
  const localFilePath = path.join(uploadDir, filename);

  if (fs.existsSync(localFilePath)) {
    return {
      stream: fs.createReadStream(localFilePath),
      contentType: 'application/pdf',
      filename,
    };
  }

  // Fallback: check if file was migrated to GridFS with that filename
  try {
    const bucket = getGridFSBucket();
    const files = await bucket.find({ filename }).toArray();
    if (files && files.length > 0) {
      return {
        stream: bucket.openDownloadStream(files[0]._id),
        contentType: files[0].contentType || 'application/pdf',
        filename: files[0].filename || 'resume.pdf',
      };
    }
  } catch (_) {}

  const err = new Error('Resume file not found on storage');
  err.status = 404;
  throw err;
};

/**
 * Resolves the original user-facing file name for a resumeUrl.
 * Queries GridFS metadata or extracts basename from local disk URL.
 *
 * @param {string} resumeUrl
 * @returns {Promise<string|null>}
 */
const resolveResumeOriginalName = async (resumeUrl) => {
  if (!resumeUrl || typeof resumeUrl !== 'string') return null;

  try {
    if (resumeUrl.startsWith('gridfs:')) {
      const idStr = resumeUrl.replace('gridfs:', '').trim();
      if (mongoose.Types.ObjectId.isValid(idStr)) {
        const bucket = getGridFSBucket();
        const files = await bucket.find({ _id: new mongoose.Types.ObjectId(idStr) }).toArray();
        if (files && files.length > 0) {
          return files[0].metadata?.originalName || files[0].filename || 'Resume.pdf';
        }
      }
      return 'Resume.pdf';
    }

    if (resumeUrl.startsWith('/uploads/') || resumeUrl.startsWith('uploads/') || resumeUrl.includes('/')) {
      const base = path.basename(resumeUrl);
      return base || 'Resume.pdf';
    }
  } catch (_) {
    return 'Resume.pdf';
  }

  return 'Resume.pdf';
};

module.exports = {
  getStorageDriver,
  getGridFSBucket,
  isValidPdf,
  saveResumeFile,
  deleteResumeFile,
  getResumeStream,
  resolveResumeOriginalName,
  uploadDir,
};
