#!/usr/bin/env node
/**
 * Migration Script: Migrate ResumeVersions to Resume
 *
 * Usage:
 *   Dry-run (safe, read-only simulation):
 *     node server/scripts/migrateResumeVersionsToResume.js --dry-run
 *
 *   Live execution (persists changes):
 *     node server/scripts/migrateResumeVersionsToResume.js
 *
 * Description:
 *   Idempotently groups each student's unlinked ResumeVersion documents under
 *   one newly created primary Resume document in Resume Studio.
 *   - Selects primary candidate from version with isDefault: true, or the most
 *     recently updated version.
 *   - Links version documents by setting version.resume = newResume._id.
 *   - If student already has an active primary Resume, links versions to it without duplicating.
 *   - Skips versions that already have a non-null `resume` field.
 */

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Resume = require('../models/Resume');
const ResumeVersion = require('../models/ResumeVersion');

async function migrateResumeVersions(options = {}) {
  const isDryRun =
    options.dryRun !== undefined ? options.dryRun : process.argv.includes('--dry-run');
  const mongoUri =
    options.uri ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/placement_management';

  console.log('='.repeat(70));
  console.log(`RESUME STUDIO: RESUME VERSION MIGRATION`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (Read-Only Simulation)' : 'LIVE EXECUTION'}`);
  console.log(`Database: ${mongoUri.replace(/\/\/.*@/, '//<credentials>@')}`);
  console.log('='.repeat(70));

  const shouldManageConnection = mongoose.connection.readyState === 0;
  if (shouldManageConnection) {
    await mongoose.connect(mongoUri);
  }

  try {
    // 1. Scan unlinked versions
    const unlinkedVersions = await ResumeVersion.find({
      $or: [{ resume: null }, { resume: { $exists: false } }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    console.log(`\nFound ${unlinkedVersions.length} unlinked ResumeVersion document(s).`);

    if (unlinkedVersions.length === 0) {
      console.log('No unlinked versions to migrate. Database is already up to date.');
      return {
        isDryRun,
        totalScanned: 0,
        studentsCount: 0,
        resumesToCreate: 0,
        versionsToLink: 0,
      };
    }

    // 2. Group unlinked versions by student
    const studentMap = new Map();
    for (const version of unlinkedVersions) {
      const studentIdStr = String(version.student);
      if (!studentMap.has(studentIdStr)) {
        studentMap.set(studentIdStr, []);
      }
      studentMap.get(studentIdStr).push(version);
    }

    console.log(`Grouped versions across ${studentMap.size} unique student(s).\n`);

    let resumesToCreate = 0;
    let resumesReused = 0;
    let versionsToLink = 0;
    const migrationPlan = [];

    for (const [studentIdStr, versions] of studentMap.entries()) {
      // Check if student already has an active primary resume
      const existingPrimary = await Resume.findOne({
        student: studentIdStr,
        isPrimary: true,
        archived: false,
      }).lean();

      // Pick primary candidate: either isDefault === true, or newest version
      const defaultVersion = versions.find((v) => v.isDefault === true);
      const primaryCandidate = defaultVersion || versions[0];

      let targetResumeId = existingPrimary ? existingPrimary._id : null;
      let actionType = existingPrimary ? 'LINK_TO_EXISTING_PRIMARY' : 'CREATE_NEW_PRIMARY_AND_LINK';

      if (!existingPrimary) {
        resumesToCreate++;
      } else {
        resumesReused++;
      }
      versionsToLink += versions.length;

      migrationPlan.push({
        studentId: studentIdStr,
        action: actionType,
        existingResumeId: existingPrimary ? String(existingPrimary._id) : null,
        candidateVersionId: String(primaryCandidate._id),
        candidateName: primaryCandidate.name || 'Untitled Resume',
        candidateTemplate: primaryCandidate.templateId || 'modern',
        versionCount: versions.length,
        versionIds: versions.map((v) => v._id),
        newResumeDoc: !existingPrimary
          ? {
              student: primaryCandidate.student,
              college: primaryCandidate.college,
              title: primaryCandidate.name ? `${primaryCandidate.name}` : 'Primary Resume',
              templateId: primaryCandidate.templateId || 'modern',
              data: primaryCandidate.resumeData || {},
              isPrimary: true,
              archived: false,
              draftUpdatedAt: primaryCandidate.updatedAt || new Date(),
            }
          : null,
      });
    }

    // 3. Print breakdown
    console.log('--- Migration Breakdown Per Student ---');
    for (const plan of migrationPlan) {
      console.log(
        `• Student ${plan.studentId}: ${plan.action} | Versions: ${plan.versionCount} | Selected: "${plan.candidateName}" (${plan.candidateTemplate})`
      );
    }
    console.log('--------------------------------------\n');

    // 4. If LIVE, apply mutations
    if (!isDryRun) {
      console.log('Executing live database updates...');
      for (const plan of migrationPlan) {
        let resumeId = plan.existingResumeId;
        if (!resumeId && plan.newResumeDoc) {
          const createdResume = await Resume.create(plan.newResumeDoc);
          resumeId = createdResume._id;
        }

        await ResumeVersion.updateMany(
          { _id: { $in: plan.versionIds } },
          { $set: { resume: resumeId } }
        );
      }
      console.log('Live updates completed successfully.');
    } else {
      console.log('[DRY RUN] No changes were written to the database.');
    }

    // 5. Final Report
    const summary = {
      isDryRun,
      totalScanned: unlinkedVersions.length,
      studentsCount: studentMap.size,
      resumesToCreate,
      resumesReused,
      versionsToLink,
    };

    console.log('\n' + '='.repeat(70));
    console.log('MIGRATION SUMMARY');
    console.log(`  Mode:                        ${isDryRun ? 'DRY RUN (No writes)' : 'LIVE'}`);
    console.log(`  Total Unlinked Versions:     ${summary.totalScanned}`);
    console.log(`  Unique Students Affected:    ${summary.studentsCount}`);
    console.log(`  New Resumes to Create:       ${summary.resumesToCreate}`);
    console.log(`  Existing Resumes Reused:     ${summary.resumesReused}`);
    console.log(`  Versions to Link:            ${summary.versionsToLink}`);
    console.log('='.repeat(70) + '\n');

    return summary;
  } finally {
    if (shouldManageConnection) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  migrateResumeVersions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateResumeVersions };
