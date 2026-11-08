const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Student } = require('../models');
const { getGridFSBucket, uploadDir } = require('./storage');

/**
 * One-time migration script to transfer existing local resume files to MongoDB GridFS.
 * Designed to be idempotent and safe to run multiple times.
 */
async function migrateResumesToGridfs() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGO_URI_TEST ||
    'mongodb://127.0.0.1:27017/placement_management';

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    console.log(`[Migrate] Connected to MongoDB database: ${mongoose.connection.name}`);
  }

  const bucket = getGridFSBucket();

  // Find all students who have a resumeUrl
  const students = await Student.find({
    resumeUrl: { $exists: true, $ne: null, $ne: '' },
  });

  console.log(`[Migrate] Found ${students.length} student profile(s) with resume records.`);

  let migratedCount = 0;
  let alreadyGridFsCount = 0;
  let missingFilesCount = 0;

  for (const student of students) {
    // 1. If already in GridFS, verify file existence (safe to run twice)
    if (student.resumeUrl.startsWith('gridfs:')) {
      const fileIdStr = student.resumeUrl.replace('gridfs:', '').trim();
      if (mongoose.Types.ObjectId.isValid(fileIdStr)) {
        const existing = await bucket.find({ _id: new mongoose.Types.ObjectId(fileIdStr) }).toArray();
        if (existing.length > 0) {
          alreadyGridFsCount++;
          continue;
        }
      }
    }

    // 2. Identify local file path
    const filename = path.basename(student.resumeUrl);
    const localFilePath = path.join(uploadDir, filename);

    if (!fs.existsSync(localFilePath)) {
      missingFilesCount++;
      console.warn(`[Migrate] Local file not found on disk for student (${student.enrollmentNo}): ${localFilePath}`);
      continue;
    }

    // 3. Check if file with same filename is already uploaded in GridFS
    const existingInBucket = await bucket.find({ filename }).toArray();
    let fileId;

    if (existingInBucket.length > 0) {
      fileId = existingInBucket[0]._id;
    } else {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: 'application/pdf',
        metadata: {
          studentId: String(student._id),
          migratedFrom: student.resumeUrl,
          migratedAt: new Date(),
        },
      });

      const fileBuffer = fs.readFileSync(localFilePath);
      await new Promise((resolve, reject) => {
        uploadStream.end(fileBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      fileId = uploadStream.id;
    }

    // 4. Update student record with new gridfs reference
    student.resumeUrl = `gridfs:${fileId}`;
    await student.save();
    migratedCount++;
    console.log(`[Migrate] Migrated student ${student.enrollmentNo} -> gridfs:${fileId}`);
  }

  const summary = {
    totalChecked: students.length,
    migrated: migratedCount,
    alreadyGridFs: alreadyGridFsCount,
    missingFiles: missingFilesCount,
    failed: missingFilesCount,
  };

  console.log('\n======================================================');
  console.log('         RESUME GRIDFS MIGRATION SUMMARY              ');
  console.log('======================================================');
  console.log(` Total Students Checked : ${summary.totalChecked}`);
  console.log(` Successfully Migrated  : ${summary.migrated}`);
  console.log(` Already on GridFS      : ${summary.alreadyGridFs}`);
  console.log(` Missing Local Files    : ${summary.missingFiles}`);
  console.log('======================================================\n');

  return summary;
}

if (require.main === module) {
  migrateResumesToGridfs()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Migrate] Fatal Error:', err);
      try {
        await mongoose.disconnect();
      } catch (_) {}
      process.exit(1);
    });
}

module.exports = { migrateResumesToGridfs };
