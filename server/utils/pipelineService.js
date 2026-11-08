const mongoose = require('mongoose');
const {
  Drive,
  Round,
  RoundBatch,
  RoundParticipant,
  Application,
  Student,
  JobRequirement,
  Notification,
  User,
} = require('../models');
const { createNotification, notifyUser } = require('./notificationService');
const { parseISTDateTime } = require('./dateTime');

/**
 * Calculate the exact end of day in India Standard Time (IST, UTC+05:30)
 * 23:59:59.999 IST corresponds to 18:29:59.999 UTC of the same day.
 */
const getEndOfDayIST = (dateInput) => {
  if (!dateInput) return null;

  // If already formatted as YYYY-MM-DD
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [year, month, day] = dateInput.trim().split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5.5 * 3600 * 1000));
  }

  const d = parseISTDateTime(dateInput);
  if (isNaN(d.getTime())) return null;

  // Format in Asia/Kolkata timezone to get the calendar date in IST
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [year, month, day] = formatter.format(d).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5.5 * 3600 * 1000));
};

/**
 * Maps round title/string to Round.type enum
 */
const mapSelectionRoundToType = (roundName) => {
  const lower = (roundName || '').toLowerCase();
  // Assessment / Aptitude / Online Assessment
  if (
    lower.includes('aptitude') ||
    lower.includes('assessment') ||
    lower.includes('online test') ||
    lower.includes('quiz') ||
    lower.includes('mcq')
  ) {
    return 'aptitude';
  }
  // Coding / Programming / DSA
  if (
    lower.includes('coding') ||
    lower.includes('programming') ||
    lower.includes('dsa') ||
    lower.includes('hackathon')
  ) {
    return 'coding';
  }
  // Group Discussion / GD
  if (
    lower.includes('group') ||
    lower.includes('gd') ||
    lower.includes('discussion')
  ) {
    return 'group_discussion';
  }
  // HR Interview / HR
  if (
    lower.includes('hr') ||
    lower.includes('culture') ||
    lower.includes('behavioral') ||
    lower.includes('manager')
  ) {
    return 'hr';
  }
  // Pre-placement talk
  if (
    lower.includes('talk') ||
    lower.includes('ppt') ||
    lower.includes('presentation')
  ) {
    return 'pre_placement_talk';
  }
  // Technical Interview / Technical
  if (
    lower.includes('tech') ||
    lower.includes('interview') ||
    lower.includes('system design') ||
    lower.includes('architecture')
  ) {
    return 'technical';
  }
  return 'technical';
};

/**
 * Freeze drive applications and auto-create rounds from JobRequirement + populate Round 1
 */
const initializeDriveRoundsAndRound1 = async (driveId) => {
  const drive = await Drive.findById(driveId).populate('jobRequirement');
  if (!drive) return null;

  // Mark drive applications closed & frozen
  drive.applicationsClosed = true;
  if (!drive.listFrozenAt) drive.listFrozenAt = new Date();
  if (drive.status === 'open') drive.status = 'closed';
  await drive.save();

  // 1. Create default rounds if none exist for this drive
  let existingRounds = await Round.find({ drive: driveId }).sort({ order: 1 });
  if (existingRounds.length === 0) {
    const rawRounds =
      drive.jobRequirement?.selectionRounds && drive.jobRequirement.selectionRounds.length > 0
        ? drive.jobRequirement.selectionRounds
        : ['Online Assessment', 'Technical Interview', 'HR Interview'];

    const roundDocs = rawRounds.map((rName, idx) => ({
      drive: drive._id,
      name: `Round ${idx + 1}: ${rName}`,
      order: idx + 1,
      type: mapSelectionRoundToType(rName),
      date: drive.driveDate,
      mode: '', // leave mode empty until recruiter schedules the round
      status: 'scheduled',
      instructions: `Please arrive on time. Ensure you carry your institutional ID and necessary materials.`,
    }));

    existingRounds = await Round.insertMany(roundDocs);
  }

  // 2. Auto-populate Round 1 with all valid applicants
  const round1 = existingRounds.find((r) => r.order === 1) || existingRounds[0];
  if (round1) {
    const excludedIds = (drive.excludedStudents || []).map((id) => id.toString());
    const applications = await Application.find({ drive: driveId });

    for (const app of applications) {
      if (excludedIds.includes(app.student.toString())) continue;

      const alreadyRegistered = await RoundParticipant.findOne({
        round: round1._id,
        student: app.student,
      });

      if (!alreadyRegistered) {
        await RoundParticipant.create({
          round: round1._id,
          drive: drive._id,
          student: app.student,
          application: app._id,
          attendance: 'pending',
          result: 'pending',
        });

        // Notify student of round 1 schedule & applications closed
        const studentDoc = await Student.findById(app.student).populate('user');
        if (studentDoc?.user?._id) {
          notifyUser(studentDoc.user._id, 'round_scheduled', {
            collegeId: drive.college,
            companyName: drive.company?.name || 'Recruiter',
            role: drive.role,
            roundName: round1.name,
            roundType: round1.type,
            mode: round1.mode,
            startTime: round1.date,
            venueOrLink: round1.venueOrLink,
            instructions: round1.instructions,
            message: `Applications are closed for ${drive.role} (${drive.company?.name || 'Company'}). ${round1.name} has been scheduled.`,
            link: '/student/applications',
          }).catch((err) => console.error('Failed to notify candidate of round 1:', err));
        }
      }
    }
  }

  return { drive, rounds: existingRounds };
};

/**
 * Check if a student has an overlapping batch scheduled across ANY drive
 */
const checkStudentClash = async (studentId, startTime, endTime, excludeBatchId = null) => {
  const query = {
    student: studentId,
    batch: { $ne: null },
  };

  const participantRecords = await RoundParticipant.find(query)
    .populate({
      path: 'batch',
      populate: [
        { path: 'round', select: 'name order' },
        { path: 'drive', select: 'role' },
      ],
    })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name' },
    });

  const start = parseISTDateTime(startTime).getTime();
  const end = parseISTDateTime(endTime).getTime();

  for (const record of participantRecords) {
    const b = record.batch;
    if (!b) continue;
    if (excludeBatchId && b._id.toString() === excludeBatchId.toString()) continue;

    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();

    // Check overlap: start < bEnd && end > bStart
    if (start < bEnd && end > bStart) {
      const studentName = record.student?.user?.name || 'Student';
      const enrollmentNo = record.student?.enrollmentNo || '';
      const driveRole = b.drive?.role || 'Placement Drive';
      const roundName = b.round?.name || 'Interview Round';

      return {
        hasClash: true,
        clashInfo: `Student clash: ${studentName} (${enrollmentNo}) has overlapping batch "${b.batchName}" for "${driveRole} - ${roundName}" from ${new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      };
    }
  }

  return { hasClash: false, clashInfo: null };
};

/**
 * Check if a physical offline venue is double-booked across ANY drive at the same time
 */
const checkVenueClash = async (venueOrLink, startTime, endTime, mode = 'offline', excludeBatchId = null, excludeRoundId = null) => {
  if (mode === 'online') return { hasClash: false, clashInfo: null };
  if (!venueOrLink || !venueOrLink.trim()) return { hasClash: false, clashInfo: null };

  const trimmedVenue = venueOrLink.trim();
  const start = parseISTDateTime(startTime);
  const end = parseISTDateTime(endTime);

  const query = {
    venueOrLink: { $regex: new RegExp(`^${trimmedVenue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    mode: { $ne: 'online' },
    startTime: { $lt: end },
    endTime: { $gt: start },
  };

  if (excludeBatchId) {
    query._id = { $ne: excludeBatchId };
  }
  if (excludeRoundId) {
    query.round = { $ne: excludeRoundId };
  }

  const clashingBatch = await RoundBatch.findOne(query)
    .populate('round', 'name order')
    .populate('drive', 'role');

  if (clashingBatch) {
    const driveRole = clashingBatch.drive?.role || 'Drive';
    const roundName = clashingBatch.round?.name || 'Round';
    return {
      hasClash: true,
      clashInfo: `Venue clash: Venue "${trimmedVenue}" is already booked for "${driveRole} - ${roundName}" (${clashingBatch.batchName}) from ${new Date(clashingBatch.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(clashingBatch.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    };
  }

  return { hasClash: false, clashInfo: null };
};

/**
 * Split participants in a round into batches by capacity and time slots, sorted by enrollmentNo
 */
const autoSplitParticipants = async ({
  roundId,
  slots,
  capacityPerBatch,
  startTime,
  durationMinutes,
  breakMinutes = 0,
  venueOrLink,
  mode = 'offline',
}) => {
  const round = await Round.findById(roundId).populate('drive');
  if (!round) throw new Error('Round not found');

  // Fetch all participants in this round, sorted by student enrollmentNo
  const participants = await RoundParticipant.find({ round: roundId })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    });

  if (participants.length === 0) {
    throw new Error('No participants enrolled in this round to split into batches');
  }

  // Sort by student enrollmentNo
  participants.sort((a, b) => {
    const enA = (a.student?.enrollmentNo || '').toUpperCase();
    const enB = (b.student?.enrollmentNo || '').toUpperCase();
    return enA.localeCompare(enB);
  });

  // Generate slots if not explicitly passed
  let batchSlots = [];
  if (Array.isArray(slots) && slots.length > 0) {
    batchSlots = slots;
  } else {
    const cap = parseInt(capacityPerBatch, 10) || 50;
    const dur = parseInt(durationMinutes, 10) || 60;
    const brk = parseInt(breakMinutes, 10) || 0;
    const totalBatches = Math.ceil(participants.length / cap);

    let currentStart = parseISTDateTime(startTime || round.date || new Date());

    for (let i = 0; i < totalBatches; i++) {
      const currentEnd = new Date(currentStart.getTime() + dur * 60 * 1000);
      batchSlots.push({
        batchName: `Batch ${String.fromCharCode(65 + i)}`, // Batch A, Batch B...
        startTime: new Date(currentStart),
        endTime: new Date(currentEnd),
        venueOrLink: venueOrLink || round.drive?.venueOrMeetingLink || 'Placement Hall',
        capacity: cap,
        mode: mode || round.mode || 'offline',
      });
      currentStart = new Date(currentEnd.getTime() + brk * 60 * 1000);
    }
  }

  // 1. Verify venue clashes for all created batch slots (excluding this round's own existing batches)
  for (const slot of batchSlots) {
    const venueCheck = await checkVenueClash(
      slot.venueOrLink,
      slot.startTime,
      slot.endTime,
      slot.mode,
      null,
      roundId
    );
    if (venueCheck.hasClash) {
      throw new Error(venueCheck.clashInfo);
    }
  }

  // 2. Pre-verify student clashes (excluding previous batch for same participant)
  let participantIdx = 0;
  for (const slot of batchSlots) {
    const batchCap = slot.capacity || 50;
    const countToAssign = Math.min(batchCap, participants.length - participantIdx);

    for (let j = 0; j < countToAssign; j++) {
      const p = participants[participantIdx + j];
      const studentClash = await checkStudentClash(p.student._id, slot.startTime, slot.endTime, p.batch);
      if (studentClash.hasClash) {
        throw new Error(studentClash.clashInfo);
      }
    }
    participantIdx += countToAssign;
  }

  // Clear previous batches for this round before creating the new split
  await RoundBatch.deleteMany({ round: roundId });

  // 3. Create RoundBatch documents and assign participants
  const createdBatches = [];
  let pIdx = 0;

  for (const slot of batchSlots) {
    const batchDoc = await RoundBatch.create({
      round: round._id,
      drive: round.drive._id,
      batchName: slot.batchName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      venueOrLink: slot.venueOrLink,
      capacity: slot.capacity,
      mode: slot.mode,
    });

    createdBatches.push(batchDoc);

    const countToAssign = Math.min(slot.capacity, participants.length - pIdx);
    const assignedIds = [];

    for (let j = 0; j < countToAssign; j++) {
      const p = participants[pIdx + j];
      p.batch = batchDoc._id;
      await p.save();
      assignedIds.push(p);

      // Notify student of assigned batch
      if (p.student?.user?._id) {
        createNotification({
          user: p.student.user._id,
          type: 'general',
          message: `You have been scheduled for ${round.name}: ${batchDoc.batchName} on ${new Date(batchDoc.startTime).toLocaleDateString()} at ${new Date(batchDoc.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Venue: ${batchDoc.venueOrLink}.`,
          link: '/student/applications',
        }).catch((err) => console.error('Failed to notify student:', err));
      }
    }
    pIdx += countToAssign;
  }

  return { createdBatches, assignedCount: pIdx };
};

/**
 * Publish results of Round N & advance cleared students to Round N+1
 */
const advanceClearedStudentsToNextRound = async (roundId) => {
  const currentRound = await Round.findById(roundId).populate('drive');
  if (!currentRound) throw new Error('Round not found');

  // 1. Any participant with attendance: 'absent' is automatically marked rejected
  await RoundParticipant.updateMany(
    { round: roundId, attendance: 'absent' },
    { $set: { result: 'rejected' } }
  );

  // 2. Fetch all participants of this round
  const participants = await RoundParticipant.find({ round: roundId })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    });

  // Check that all participants have a non-pending result
  const pendingResults = participants.filter((p) => p.result === 'pending');
  if (pendingResults.length > 0) {
    throw new Error(
      `Cannot publish results: ${pendingResults.length} participant(s) still have result "pending". Please record cleared or rejected for all candidates.`
    );
  }

  // 3. Mark current round as completed & results published
  currentRound.status = 'completed';
  currentRound.resultsPublished = true;
  await currentRound.save();

  // 4. Find Round N+1 for this drive
  const nextRound = await Round.findOne({
    drive: currentRound.drive._id,
    order: currentRound.order + 1,
  });

  const clearedParticipants = participants.filter((p) => p.result === 'cleared');
  const advancedCount = clearedParticipants.length;

  if (nextRound && clearedParticipants.length > 0) {
    for (const p of clearedParticipants) {
      const alreadyInNext = await RoundParticipant.findOne({
        round: nextRound._id,
        student: p.student._id,
      });

      if (!alreadyInNext) {
        await RoundParticipant.create({
          round: nextRound._id,
          drive: currentRound.drive._id,
          student: p.student._id,
          application: p.application,
          attendance: 'pending',
          result: 'pending',
        });
      }
    }
  }

  // 5. Notify all participants of their results via in-app & email
  for (const p of participants) {
    if (p.student?.user?._id) {
      const isCleared = p.result === 'cleared';
      const msg = isCleared
        ? 'You are shortlisted for the next round, schedule will follow.'
        : `Update on ${currentRound.name} for ${currentRound.drive.role}: You were not selected for the next round.`;

      notifyUser(p.student.user._id, 'result_declared', {
        collegeId: currentRound.drive?.college,
        companyName: currentRound.drive?.company?.name || 'Recruiter',
        role: currentRound.drive?.role,
        roundName: currentRound.name,
        result: p.result,
        score: p.score,
        feedback: p.feedback,
        nextRoundName: nextRound?.name,
        message: msg,
        link: '/student/applications',
      }).catch((err) => console.error('Failed to notify student of result:', err));
    }
  }

  return {
    currentRound,
    nextRound,
    clearedCount: advancedCount,
    totalEvaluated: participants.length,
  };
};

/**
 * Generate daily clash report for a college across all drives and offline venues
 */
const generateDailyClashReport = async (collegeId, targetDate) => {
  const dayStart = parseISTDateTime(targetDate);
  if (isNaN(dayStart.getTime())) {
    return {
      date: targetDate,
      totalBatches: 0,
      studentClashes: [],
      venueClashes: [],
      totalClashes: 0,
    };
  }
  const dayEnd = getEndOfDayIST(targetDate) || new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  // 1. Find all drives belonging to this college
  const collegeDrives = await Drive.find({ college: collegeId }).select('_id role company');
  const driveIds = collegeDrives.map((d) => d._id);

  // 2. Find all batches on this date for these drives
  const batches = await RoundBatch.find({
    drive: { $in: driveIds },
    startTime: { $gte: dayStart, $lte: dayEnd },
  })
    .populate('round', 'name order')
    .populate('drive', 'role')
    .sort({ startTime: 1 });

  const studentClashes = [];
  const venueClashes = [];

  // Check venue clashes
  for (let i = 0; i < batches.length; i++) {
    for (let j = i + 1; j < batches.length; j++) {
      const b1 = batches[i];
      const b2 = batches[j];

      // If both are offline and have same venue
      if (
        b1.mode !== 'online' &&
        b2.mode !== 'online' &&
        b1.venueOrLink.trim().toLowerCase() === b2.venueOrLink.trim().toLowerCase()
      ) {
        const s1 = new Date(b1.startTime).getTime();
        const e1 = new Date(b1.endTime).getTime();
        const s2 = new Date(b2.startTime).getTime();
        const e2 = new Date(b2.endTime).getTime();

        if (s1 < e2 && e1 > s2) {
          venueClashes.push({
            venue: b1.venueOrLink,
            batch1: {
              batchId: b1._id,
              batchName: b1.batchName,
              driveRole: b1.drive?.role,
              roundName: b1.round?.name,
              time: `${new Date(b1.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(b1.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            },
            batch2: {
              batchId: b2._id,
              batchName: b2.batchName,
              driveRole: b2.drive?.role,
              roundName: b2.round?.name,
              time: `${new Date(b2.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(b2.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            },
          });
        }
      }
    }
  }

  // Check student clashes
  const batchIds = batches.map((b) => b._id);
  const participants = await RoundParticipant.find({
    batch: { $in: batchIds },
  })
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    })
    .populate('batch');

  // Group participants by student ID
  const studentMap = {};
  for (const p of participants) {
    const sId = p.student._id.toString();
    if (!studentMap[sId]) studentMap[sId] = [];
    studentMap[sId].push(p);
  }

  for (const [sId, pList] of Object.entries(studentMap)) {
    if (pList.length < 2) continue;

    for (let i = 0; i < pList.length; i++) {
      for (let j = i + 1; j < pList.length; j++) {
        const p1 = pList[i];
        const p2 = pList[j];

        const s1 = new Date(p1.batch.startTime).getTime();
        const e1 = new Date(p1.batch.endTime).getTime();
        const s2 = new Date(p2.batch.startTime).getTime();
        const e2 = new Date(p2.batch.endTime).getTime();

        if (s1 < e2 && e1 > s2) {
          studentClashes.push({
            studentId: sId,
            studentName: p1.student?.user?.name,
            enrollmentNo: p1.student?.enrollmentNo,
            branch: p1.student?.branch,
            conflict: [
              {
                batchName: p1.batch.batchName,
                venue: p1.batch.venueOrLink,
                time: `${new Date(p1.batch.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(p1.batch.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              },
              {
                batchName: p2.batch.batchName,
                venue: p2.batch.venueOrLink,
                time: `${new Date(p2.batch.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(p2.batch.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              },
            ],
          });
        }
      }
    }
  }

  return {
    date: targetDate,
    totalBatches: batches.length,
    studentClashes,
    venueClashes,
    totalClashes: studentClashes.length + venueClashes.length,
  };
};

module.exports = {
  getEndOfDayIST,
  mapSelectionRoundToType,
  initializeDriveRoundsAndRound1,
  checkStudentClash,
  checkVenueClash,
  autoSplitParticipants,
  advanceClearedStudentsToNextRound,
  generateDailyClashReport,
};
