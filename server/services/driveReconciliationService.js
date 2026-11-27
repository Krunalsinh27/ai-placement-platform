const mongoose = require('mongoose');
const { DriveRequest, Drive } = require('../models');

/**
 * Reusable Drive Request & Drive Reconciliation Service
 * Detects and safely resolves inconsistencies between DriveRequests and Drives.
 *
 * Detected Categories:
 *   A. Unlinked Drive on confirmed/scheduled request (Drive exists with driveRequest ID, but request.drive is missing).
 *   B. Broken Drive reference (DriveRequest references a Drive that no longer exists in DB).
 *   C. Orphaned Drive reference (Drive references a DriveRequest that no longer exists in DB).
 *   D. Duplicate Drive conflict (Multiple Drives reference the same DriveRequest).
 *   E. Status & Publication inconsistency (Request scheduled vs Drive isPublished mismatch).
 *
 * Recovery Rules:
 *   - Auto-repairs Category A if exactly 1 valid Drive exists. Preserves existing Drive ID, does not create new Drives.
 *   - Auto-repairs Category E ONLY if valid TPO authorization evidence (tpoPublishedAt) exists.
 *   - Categories B, C, D and unverified E are flagged for manual review. NEVER deletes any record.
 *
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} [options.collegeId] - Optional college scoping for multi-tenant isolation
 * @param {number} [options.limit=100] - Bounded batch limit
 * @param {boolean} [options.dryRun=false] - If true, only reports inconsistencies without applying fixes
 * @returns {Promise<Object>} Reconciliation summary report
 */
const reconcileDriveRequests = async (options = {}) => {
  const { collegeId = null, limit = 100, dryRun = false } = options;
  const startTime = Date.now();

  const report = {
    timestamp: new Date().toISOString(),
    dryRun: Boolean(dryRun),
    collegeId: collegeId ? collegeId.toString() : null,
    scanned: { requests: 0, drives: 0 },
    inconsistenciesDetected: [],
    repaired: [],
    manualReviewRequired: [],
    summary: {
      totalInconsistencies: 0,
      autoRepairedCount: 0,
      manualReviewCount: 0,
    },
    durationMs: 0,
  };

  try {
    const requestFilter = {};
    const driveFilter = {};

    if (collegeId) {
      requestFilter.college = collegeId;
      driveFilter.$or = [{ college: collegeId }, { colleges: collegeId }];
    }

    // ------------------------------------------------------------------------
    // CHECK D: Detect Duplicate Drive Documents referencing same DriveRequest
    // ------------------------------------------------------------------------
    const duplicateMatch = { driveRequest: { $ne: null } };
    if (collegeId) {
      duplicateMatch.college = new mongoose.Types.ObjectId(collegeId);
    }

    const duplicateGroups = await Drive.aggregate([
      { $match: duplicateMatch },
      { $group: { _id: '$driveRequest', driveIds: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: limit },
    ]);

    const duplicateReqIds = new Set();
    for (const group of duplicateGroups) {
      duplicateReqIds.add(group._id.toString());
      const item = {
        type: 'DUPLICATE_DRIVE_REFERENCES',
        category: 'D',
        driveRequestId: group._id.toString(),
        driveIds: group.driveIds.map((id) => id.toString()),
        count: group.count,
        requiresManualReview: true,
        reason: `Multiple Drive documents (${group.count}) reference the same DriveRequest. No automated deletion performed to preserve historical data.`,
      };
      report.inconsistenciesDetected.push(item);
      report.manualReviewRequired.push(item);
    }

    // ------------------------------------------------------------------------
    // CHECK A & E: Inspect DriveRequests with status in ['recruiter_confirmed', 'scheduled']
    // ------------------------------------------------------------------------
    const activeRequests = await DriveRequest.find({
      ...requestFilter,
      status: { $in: ['recruiter_confirmed', 'scheduled'] },
    })
      .select('_id status drive college company confirmedDate tpoPublishedAt timeline')
      .limit(limit)
      .lean();

    report.scanned.requests = activeRequests.length;

    for (const reqDoc of activeRequests) {
      // Skip requests flagged under Check D duplicate conflicts
      if (duplicateReqIds.has(reqDoc._id.toString())) {
        continue;
      }

      // Check A: request.drive is missing or null
      if (!reqDoc.drive) {
        // Find if a Drive was created for this DriveRequest
        const matchingDrives = await Drive.find({ driveRequest: reqDoc._id }).lean();

        if (matchingDrives.length === 1) {
          const matchingDrive = matchingDrives[0];
          const inconsistency = {
            type: 'UNLINKED_DRIVE_ON_CONFIRMED_REQUEST',
            category: 'A',
            driveRequestId: reqDoc._id.toString(),
            driveId: matchingDrive._id.toString(),
            requestStatus: reqDoc.status,
            driveIsPublished: matchingDrive.isPublished,
            reason: `DriveRequest is "${reqDoc.status}" and has matching Drive ${matchingDrive._id}, but request.drive field is unlinked.`,
          };
          report.inconsistenciesDetected.push(inconsistency);

          if (!dryRun) {
            // Apply recovery rule: restore request.drive reference
            const updateSet = { drive: matchingDrive._id };
            let statusChanged = false;

            // If drive was already published and request has publication evidence or drive is live, transition to scheduled
            if (matchingDrive.isPublished && reqDoc.status === 'recruiter_confirmed') {
              updateSet.status = 'scheduled';
              statusChanged = true;
            }

            await DriveRequest.updateOne(
              { _id: reqDoc._id },
              {
                $set: updateSet,
                $push: {
                  timeline: {
                    status: statusChanged ? 'scheduled' : reqDoc.status,
                    updatedByRole: 'system',
                    updatedByName: 'Reconciliation Service',
                    note: `Reconciliation: Safely restored request.drive link to existing Drive ${matchingDrive._id}.${statusChanged ? ' Transitioned request status to scheduled.' : ''}`,
                    date: new Date(),
                  },
                },
              }
            );

            report.repaired.push({
              category: 'A',
              driveRequestId: reqDoc._id.toString(),
              driveId: matchingDrive._id.toString(),
              action: `Restored request.drive reference to Drive ${matchingDrive._id}${statusChanged ? ' and moved request status to scheduled' : ''}`,
              timestamp: new Date().toISOString(),
            });
          } else {
            report.repaired.push({
              category: 'A',
              driveRequestId: reqDoc._id.toString(),
              driveId: matchingDrive._id.toString(),
              action: `[Dry Run] Would restore request.drive reference to Drive ${matchingDrive._id}`,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (matchingDrives.length === 0 && reqDoc.status === 'scheduled') {
          // Status is scheduled, but NO drive exists at all
          const item = {
            type: 'SCHEDULED_REQUEST_MISSING_ALL_DRIVES',
            category: 'A',
            driveRequestId: reqDoc._id.toString(),
            requiresManualReview: true,
            reason: 'DriveRequest is marked "scheduled" but no corresponding Drive document exists. Requires explicit administrative action.',
          };
          report.inconsistenciesDetected.push(item);
          report.manualReviewRequired.push(item);
        }
      } else {
        // Check B: Request references a Drive — verify Drive actually exists in DB
        const linkedDrive = await Drive.findById(reqDoc.drive).lean();

        if (!linkedDrive) {
          const item = {
            type: 'BROKEN_DRIVE_REFERENCE',
            category: 'B',
            driveRequestId: reqDoc._id.toString(),
            missingDriveId: reqDoc.drive.toString(),
            requiresManualReview: true,
            reason: `DriveRequest references Drive ${reqDoc.drive}, but the Drive document does not exist in the database.`,
          };
          report.inconsistenciesDetected.push(item);
          report.manualReviewRequired.push(item);
        } else {
          // Check E: Publication state consistency between linked Drive and DriveRequest
          if (reqDoc.status === 'scheduled' && linkedDrive.isPublished === false) {
            // DriveRequest is published/scheduled, but Drive is unpublished
            const hasValidTpoEvidence = Boolean(reqDoc.tpoPublishedAt && !isNaN(new Date(reqDoc.tpoPublishedAt).getTime()));

            const item = {
              type: 'REQUEST_SCHEDULED_BUT_DRIVE_UNPUBLISHED',
              category: 'E',
              driveRequestId: reqDoc._id.toString(),
              driveId: linkedDrive._id.toString(),
              hasValidTpoEvidence,
              reason: `DriveRequest is scheduled but linked Drive ${linkedDrive._id} has isPublished: false.`,
            };
            report.inconsistenciesDetected.push(item);

            if (hasValidTpoEvidence && !dryRun) {
              // Valid TPO publication timestamp exists on request -> safe to publish drive
              await Drive.updateOne(
                { _id: linkedDrive._id },
                {
                  $set: {
                    isPublished: true,
                    publishedAt: linkedDrive.publishedAt || reqDoc.tpoPublishedAt,
                  },
                }
              );
              report.repaired.push({
                category: 'E',
                driveRequestId: reqDoc._id.toString(),
                driveId: linkedDrive._id.toString(),
                action: `Published Drive ${linkedDrive._id} based on verified TPO publication evidence (${new Date(reqDoc.tpoPublishedAt).toISOString()})`,
                timestamp: new Date().toISOString(),
              });
            } else {
              // No valid TPO authorization evidence -> DO NOT auto-publish. Require manual review.
              item.requiresManualReview = true;
              item.reason += ' No verified TPO publication authorization evidence found. Drive not automatically published.';
              report.manualReviewRequired.push(item);
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // CHECK C: Detect Orphaned Drives referencing non-existent DriveRequests
    // ------------------------------------------------------------------------
    const drivesWithReq = await Drive.find({
      ...driveFilter,
      driveRequest: { $ne: null },
    })
      .select('_id role driveRequest college')
      .limit(limit)
      .lean();

    report.scanned.drives = drivesWithReq.length;

    for (const dDoc of drivesWithReq) {
      const parentReq = await DriveRequest.findById(dDoc.driveRequest).select('_id').lean();
      if (!parentReq) {
        const item = {
          type: 'ORPHANED_DRIVE_REQUEST_REFERENCE',
          category: 'C',
          driveId: dDoc._id.toString(),
          missingDriveRequestId: dDoc.driveRequest.toString(),
          requiresManualReview: true,
          reason: `Drive ${dDoc._id} ("${dDoc.role}") references DriveRequest ${dDoc.driveRequest}, which does not exist in the database. Historical record preserved.`,
        };
        report.inconsistenciesDetected.push(item);
        report.manualReviewRequired.push(item);
      }
    }

    // Compile summary
    report.summary.totalInconsistencies = report.inconsistenciesDetected.length;
    report.summary.autoRepairedCount = report.repaired.length;
    report.summary.manualReviewCount = report.manualReviewRequired.length;
    report.durationMs = Date.now() - startTime;

    return report;
  } catch (error) {
    console.error('[ReconciliationService] Error during reconciliation:', error);
    report.error = error.message;
    report.durationMs = Date.now() - startTime;
    return report;
  }
};

module.exports = {
  reconcileDriveRequests,
};
