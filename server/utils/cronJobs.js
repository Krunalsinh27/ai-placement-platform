const cron = require('node-cron');
const {
  User,
  Student,
  InterviewSlot,
  RoundBatch,
  RoundParticipant,
  Offer,
  Round,
  TestAttempt,
} = require('../models');
const { notifyUser } = require('./notificationService');
const { evaluateAttempt } = require('../controllers/aptitudeTestController');

/**
 * Delete unverified accounts older than 24 hours
 */
const deleteExpiredUnverifiedAccounts = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unverifiedUsers = await User.find({
      isEmailVerified: false,
      createdAt: { $lt: cutoff },
    });

    if (unverifiedUsers.length > 0) {
      const userIds = unverifiedUsers.map((u) => u._id);
      await Student.deleteMany({ user: { $in: userIds } });
      const res = await User.deleteMany({ _id: { $in: userIds } });
      console.log(`[CRON] Cleaned up ${res.deletedCount} unverified account(s) older than 24 hours.`);
      return res.deletedCount;
    }
    return 0;
  } catch (error) {
    console.error('[CRON] Error deleting expired unverified accounts:', error);
    return 0;
  }
};

/**
 * Process automated 24-hour and 1-hour reminders for interview slots & round batches
 * Also checks 48-hour offer expiration alerts
 */
const sendUpcomingReminders = async () => {
  const now = new Date();
  let dispatchedCount = 0;

  try {
    // 1. Process 24-Hour Interview Slot Reminders (Window: 23h - 25h)
    const slot24hMin = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const slot24hMax = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const slots24h = await InterviewSlot.find({
      status: { $nin: ['completed', 'no_show', 'cancelled'] },
      startTime: { $gte: slot24hMin, $lte: slot24hMax },
      reminderSent24h: false,
    })
      .populate('panel')
      .populate({
        path: 'round',
        populate: { path: 'drive', populate: { path: 'company college' } },
      })
      .populate({
        path: 'student',
        populate: { path: 'user' },
      });

    for (const slot of slots24h) {
      slot.reminderSent24h = true;
      await slot.save();

      if (slot.student?.user?._id) {
        await notifyUser(slot.student.user._id, 'slot_reminder_24h', {
          companyName: slot.round?.drive?.company?.name || 'Recruiter',
          collegeId: slot.round?.drive?.college?._id || slot.round?.drive?.college,
          role: slot.round?.drive?.role,
          roundName: slot.round?.name,
          panelName: slot.panel?.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          venueOrLink: slot.meetingLink || slot.panel?.venueOrLink,
          slotId: slot._id,
          mode: slot.round?.mode,
          message: `Reminder: Your interview with ${slot.round?.drive?.company?.name || 'the recruiter'} for ${slot.round?.name} is scheduled for tomorrow at ${slot.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST.`,
          link: `/student/interview/${slot._id}`,
        });
        dispatchedCount++;
      }
    }

    // 2. Process 1-Hour Interview Slot Reminders (Window: now to now + 75m)
    const slot1hMin = now;
    const slot1hMax = new Date(now.getTime() + 75 * 60 * 1000);

    const slots1h = await InterviewSlot.find({
      status: { $nin: ['completed', 'no_show', 'cancelled'] },
      startTime: { $gte: slot1hMin, $lte: slot1hMax },
      reminderSent1h: false,
    })
      .populate('panel')
      .populate({
        path: 'round',
        populate: { path: 'drive', populate: { path: 'company college' } },
      })
      .populate({
        path: 'student',
        populate: { path: 'user' },
      });

    for (const slot of slots1h) {
      slot.reminderSent1h = true;
      await slot.save();

      if (slot.student?.user?._id) {
        await notifyUser(slot.student.user._id, 'slot_reminder_1h', {
          companyName: slot.round?.drive?.company?.name || 'Recruiter',
          collegeId: slot.round?.drive?.college?._id || slot.round?.drive?.college,
          role: slot.round?.drive?.role,
          roundName: slot.round?.name,
          panelName: slot.panel?.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          venueOrLink: slot.meetingLink || slot.panel?.venueOrLink,
          slotId: slot._id,
          mode: slot.round?.mode,
          message: `🚨 Urgent: Your interview with ${slot.round?.drive?.company?.name || 'the recruiter'} for ${slot.round?.name} starts in 1 hour at ${slot.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST.`,
          link: `/student/interview/${slot._id}`,
        });
        dispatchedCount++;
      }
    }

    // 3. Process 24-Hour Batch Reminders (Window: 23h - 25h)
    const batches24h = await RoundBatch.find({
      startTime: { $gte: slot24hMin, $lte: slot24hMax },
      reminderSent24h: false,
    }).populate({
      path: 'round',
      populate: { path: 'drive', populate: { path: 'company college' } },
    });

    for (const batch of batches24h) {
      batch.reminderSent24h = true;
      await batch.save();

      const participants = await RoundParticipant.find({ batch: batch._id }).populate({
        path: 'student',
        populate: { path: 'user' },
      });

      for (const p of participants) {
        if (p.student?.user?._id) {
          await notifyUser(p.student.user._id, 'batch_reminder_24h', {
            companyName: batch.round?.drive?.company?.name || 'Recruiter',
            collegeId: batch.round?.drive?.college?._id || batch.round?.drive?.college,
            role: batch.round?.drive?.role,
            roundName: batch.round?.name,
            batchName: batch.batchName,
            targetName: batch.batchName,
            startTime: batch.startTime,
            endTime: batch.endTime,
            venueOrLink: batch.venueOrLink,
            mode: batch.mode,
            message: `Reminder: Batch "${batch.batchName}" for ${batch.round?.name} is scheduled for tomorrow at ${batch.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST.`,
            link: '/student/applications',
          });
          dispatchedCount++;
        }
      }
    }

    // 4. Process 1-Hour Batch Reminders (Window: now to now + 75m)
    const batches1h = await RoundBatch.find({
      startTime: { $gte: slot1hMin, $lte: slot1hMax },
      reminderSent1h: false,
    }).populate({
      path: 'round',
      populate: { path: 'drive', populate: { path: 'company college' } },
    });

    for (const batch of batches1h) {
      batch.reminderSent1h = true;
      await batch.save();

      const participants = await RoundParticipant.find({ batch: batch._id }).populate({
        path: 'student',
        populate: { path: 'user' },
      });

      for (const p of participants) {
        if (p.student?.user?._id) {
          await notifyUser(p.student.user._id, 'batch_reminder_1h', {
            companyName: batch.round?.drive?.company?.name || 'Recruiter',
            collegeId: batch.round?.drive?.college?._id || batch.round?.drive?.college,
            role: batch.round?.drive?.role,
            roundName: batch.round?.name,
            batchName: batch.batchName,
            targetName: batch.batchName,
            startTime: batch.startTime,
            endTime: batch.endTime,
            venueOrLink: batch.venueOrLink,
            mode: batch.mode,
            message: `🚨 Urgent: Batch "${batch.batchName}" for ${batch.round?.name} begins in 1 hour at ${batch.startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })} IST.`,
            link: '/student/applications',
          });
          dispatchedCount++;
        }
      }
    }

    // 5. Process 48-Hour Offer Expiry Alerts
    const offer48hMin = now;
    const offer48hMax = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const pendingOffers48h = await Offer.find({
      status: 'offered',
      expiryDate: { $gte: offer48hMin, $lte: offer48hMax },
      reminderSent48h: { $ne: true },
    })
      .populate('company')
      .populate('college')
      .populate({ path: 'student', populate: { path: 'user' } });

    for (const offer of pendingOffers48h) {
      offer.reminderSent48h = true;
      await offer.save();

      if (offer.student?.user?._id) {
        await notifyUser(offer.student.user._id, 'offer_expiring_48h', {
          companyName: offer.company?.name || 'Hiring Partner',
          collegeId: offer.college?._id || offer.college,
          role: offer.role,
          packageLpa: offer.packageLpa,
          deadline: offer.expiryDate,
          message: `Action Required: Your offer from ${offer.company?.name || 'Recruiter'} for ${offer.role} expires in less than 48 hours. Please submit your decision.`,
          link: '/student/dashboard',
        });
        dispatchedCount++;
      }
    }

    if (dispatchedCount > 0) {
      console.log(`[CRON] Processed and queued ${dispatchedCount} upcoming reminder notification(s).`);
    }
  } catch (error) {
    console.error('[CRON] Error sending upcoming reminders:', error);
  }

  return dispatchedCount;
};

/**
 * Auto-submit expired in_progress test attempts
 */
const autoSubmitExpiredTestAttempts = async () => {
  const now = new Date();
  let count = 0;
  try {
    const expiredAttempts = await TestAttempt.find({
      status: 'in_progress',
      deadlineAt: { $lte: now },
    }).populate('round');

    for (const attempt of expiredAttempts) {
      if (!attempt.round) continue;
      attempt.status = 'auto_submitted';
      attempt.submittedAt = new Date(attempt.deadlineAt);
      await evaluateAttempt(attempt, attempt.round);
      await attempt.save();
      count++;
    }

    if (count > 0) {
      console.log(`[CRON] Auto-submitted ${count} expired aptitude test attempt(s).`);
    }
  } catch (error) {
    console.error('[CRON] Error auto-submitting expired test attempts:', error);
  }
  return count;
};

/**
 * Handle students who never started their platform test by window end
 * Marked as absent and rejected automatically
 */
const handleWindowEndAbsentees = async () => {
  const now = new Date();
  let markedCount = 0;
  try {
    const closedRounds = await Round.find({
      deliveryMode: 'platform_test',
      testWindowEnd: { $ne: null, $lt: now },
    });

    for (const round of closedRounds) {
      const pendingParticipants = await RoundParticipant.find({
        round: round._id,
        attendance: 'pending',
      });

      for (const p of pendingParticipants) {
        const attempt = await TestAttempt.findOne({ round: round._id, student: p.student });
        if (!attempt) {
          p.attendance = 'absent';
          p.result = 'rejected';
          p.feedback = 'Absent: Did not start test before window closed';
          await p.save();
          markedCount++;
        }
      }
    }

    if (markedCount > 0) {
      console.log(`[CRON] Marked ${markedCount} candidate(s) as absent/rejected after test window ended.`);
    }
  } catch (error) {
    console.error('[CRON] Error handling window-end absentees:', error);
  }
  return markedCount;
};

/**
 * Initialize background cron tasks
 */
const initCronJobs = () => {
  // 1. Run once every hour at minute 0: cleanup unverified accounts
  cron.schedule('0 * * * *', async () => {
    await deleteExpiredUnverifiedAccounts();
  });

  // 2. Run every 5 minutes: send 24h/1h reminders and 48h offer expiry alerts
  cron.schedule('*/5 * * * *', async () => {
    await sendUpcomingReminders();
  });

  // 3. Run every minute: auto-submit expired aptitude test attempts & mark window-end absentees
  cron.schedule('* * * * *', async () => {
    await autoSubmitExpiredTestAttempts();
    await handleWindowEndAbsentees();
  });

  console.log('[CRON] Initialized: Hourly account cleanup, 5-minute reminder scanner, and 1-minute aptitude test monitor active.');
};

module.exports = {
  initCronJobs,
  deleteExpiredUnverifiedAccounts,
  sendUpcomingReminders,
  autoSubmitExpiredTestAttempts,
  handleWindowEndAbsentees,
};
