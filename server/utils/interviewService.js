const {
  InterviewSlot,
  InterviewPanel,
  Round,
  RoundParticipant,
  RoundBatch,
  Student,
} = require('../models');

/**
 * Check if a student has an overlapping interview slot or round batch across ANY drive
 */
const checkStudentSlotClash = async (studentId, startTime, endTime, excludeSlotId = null) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  // 1. Check against other interview slots across ALL drives
  const slotQuery = {
    student: studentId,
    status: { $nin: ['no_show', 'completed'] },
  };
  if (excludeSlotId) {
    slotQuery._id = { $ne: excludeSlotId };
  }

  const existingSlots = await InterviewSlot.find(slotQuery)
    .populate({
      path: 'round',
      populate: { path: 'drive', select: 'role' },
    })
    .populate('panel', 'name');

  for (const s of existingSlots) {
    const sStart = new Date(s.startTime).getTime();
    const sEnd = new Date(s.endTime).getTime();
    if (start < sEnd && end > sStart) {
      const driveRole = s.round?.drive?.role || 'Another drive';
      const roundName = s.round?.name || 'Interview Round';
      const panelName = s.panel?.name || 'Panel';
      const timeStr = `${new Date(s.startTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })} - ${new Date(s.endTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })}`;

      return {
        hasClash: true,
        clashInfo: `Student has an interview schedule clash with ${driveRole} (${roundName}, ${panelName}) at ${timeStr} IST.`,
      };
    }
  }

  // 2. Check against assessment RoundBatch assignments
  const batchParticipants = await RoundParticipant.find({
    student: studentId,
    batch: { $ne: null },
  }).populate({
    path: 'batch',
    populate: { path: 'drive', select: 'role' },
  });

  for (const p of batchParticipants) {
    if (!p.batch) continue;
    const bStart = new Date(p.batch.startTime).getTime();
    const bEnd = new Date(p.batch.endTime).getTime();
    if (start < bEnd && end > bStart) {
      const driveRole = p.batch.drive?.role || 'Another drive';
      const timeStr = `${new Date(p.batch.startTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })} - ${new Date(p.batch.endTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })}`;

      return {
        hasClash: true,
        clashInfo: `Student has an assessment batch clash with ${driveRole} (${p.batch.batchName}) at ${timeStr} IST.`,
      };
    }
  }

  return { hasClash: false };
};

/**
 * Check if an interview panel has an overlapping slot (prevent panel double-booking)
 */
const checkPanelClash = async (panelId, startTime, endTime, excludeSlotId = null) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  const panel = await InterviewPanel.findById(panelId);
  if (!panel) return { hasClash: false };

  const query = {
    panel: panelId,
    status: { $ne: 'no_show' },
  };
  if (excludeSlotId) {
    query._id = { $ne: excludeSlotId };
  }

  const existingSlots = await InterviewSlot.find(query);

  const overlapping = existingSlots.filter((s) => {
    const sStart = new Date(s.startTime).getTime();
    const sEnd = new Date(s.endTime).getTime();
    return start < sEnd && end > sStart;
  });

  const capacity = panel.capacity || 1;
  if (overlapping.length >= capacity) {
    const timeStr = `${new Date(startTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })} - ${new Date(endTime).toLocaleTimeString([], { timeZone: 'Asia/Kolkata' })}`;
    return {
      hasClash: true,
      clashInfo: `Panel "${panel.name}" is already fully booked (${overlapping.length}/${capacity}) during ${timeStr} IST. Double-booking prevented.`,
    };
  }

  return { hasClash: false };
};

module.exports = {
  checkStudentSlotClash,
  checkPanelClash,
};

