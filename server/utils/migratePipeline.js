const { Drive, Application, Placement, Offer, RoundParticipant, Round } = require('../models');
const { initializeDriveRoundsAndRound1, getEndOfDayIST } = require('./pipelineService');

/**
 * Migration helper to ensure existing drives, applications, and placements
 * are backward-compatible with the Task 23 recruitment pipeline.
 */
const migrateExistingPipelineData = async () => {
  try {
    const now = new Date();

    // 1. Migrate expired drives to applicationsClosed: true & initialize default rounds
    // Only drives whose deadline has actually passed (end of day in IST)
    const openDrives = await Drive.find({
      applicationsClosed: { $ne: true },
    });

    for (const drive of openDrives) {
      const deadlineEnd = getEndOfDayIST(drive.lastDateToApply);
      if (deadlineEnd && now > deadlineEnd) {
        drive.applicationsClosed = true;
        drive.status = 'closed';
        if (!drive.listFrozenAt) drive.listFrozenAt = drive.lastDateToApply;
        await drive.save();

        try {
          await initializeDriveRoundsAndRound1(drive._id);
        } catch (e) {
          // Safe to ignore per-drive init errors during migration
        }
      }
    }

    // 2. Ensure existing placements have matching accepted Offer records
    const placements = await Placement.find().populate('drive');
    for (const p of placements) {
      if (!p.drive) continue;

      const existingOffer = await Offer.findOne({
        drive: p.drive._id,
        student: p.student,
      });

      if (!existingOffer) {
        const app = await Application.findOne({ drive: p.drive._id, student: p.student });
        if (app) {
          await Offer.create({
            drive: p.drive._id,
            company: p.company,
            college: p.drive.college,
            student: p.student,
            application: app._id,
            packageLpa: p.packageLpa,
            joiningDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            role: p.drive.role,
            status: 'accepted',
            placement: p._id,
            respondedAt: p.offerDate || new Date(),
          });
        }
      }
    }

    // 3. Ensure any participants without an assigned batch default strictly to attendance 'pending'
    await RoundParticipant.updateMany(
      { batch: null, attendance: { $ne: 'pending' } },
      { $set: { attendance: 'pending' } }
    );

    // 4. Migrate existing rounds lacking deliveryMode
    const unmigratedRounds = await Round.find({
      $or: [
        { deliveryMode: { $exists: false } },
        { deliveryMode: null },
        { deliveryMode: '' },
      ],
    });

    for (const r of unmigratedRounds) {
      const hasLink = (r.venueOrLink && (r.venueOrLink.startsWith('http://') || r.venueOrLink.startsWith('https://'))) || r.mode === 'online';
      r.deliveryMode = hasLink ? 'online_external' : 'offline_campus';
      if (!r.mode) {
        r.mode = hasLink ? 'online' : 'offline';
      }
      await r.save();
    }
  } catch (err) {
    console.warn('Pipeline migration notice:', err.message);
  }
};

module.exports = migrateExistingPipelineData;

