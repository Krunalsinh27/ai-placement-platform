const mongoose = require('mongoose');
const {
  Round,
  RoundParticipant,
  Drive,
  Student,
  InterviewPanel,
  InterviewSlot,
  Evaluation,
  Notification,
  User,
} = require('../models');
const { checkStudentSlotClash, checkPanelClash } = require('../utils/interviewService');
const { createNotification, notifyUser } = require('../utils/notificationService');

/**
 * Check if the user is a recruiter from the company owning the drive (or superadmin)
 */
const verifyOwningRecruiter = (drive, user) => {
  if (user.role === 'superadmin') return { allowed: true };

  if (user.role === 'tpo' || user.role === 'admin') {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: TPO has read-only access to rounds (except attendance)',
    };
  }

  if (user.role !== 'recruiter') {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: Only recruiters from the hiring company can manage interviews',
    };
  }

  const userCompanyId = (user.company?._id || user.company)?.toString();
  const driveCompanyId = (drive.company?._id || drive.company)?.toString();
  if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: Only recruiters from the hiring company can manage interviews',
    };
  }

  return { allowed: true };
};

/**
 * Check general drive access for TPO, Recruiter, or Superadmin
 */
const verifyDriveAccess = (drive, user) => {
  if (user.role === 'superadmin') return true;

  if (user.role === 'tpo' || user.role === 'admin') {
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const driveCollegeId = (drive.college?._id || drive.college)?.toString();
    return userCollegeId && driveCollegeId && userCollegeId === driveCollegeId;
  }

  if (user.role === 'recruiter') {
    const userCompanyId = (user.company?._id || user.company)?.toString();
    const driveCompanyId = (drive.company?._id || drive.company)?.toString();
    return userCompanyId && driveCompanyId && userCompanyId === driveCompanyId;
  }

  return false;
};

/**
 * Helper to get hour, minute, and date string in Asia/Kolkata timezone
 */
const getISTTimeDetails = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const timeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }); // HH:MM:SS
  const [hourStr, minStr] = timeStr.split(':');

  return {
    dateStr,
    hour: parseInt(hourStr, 10),
    minute: parseInt(minStr, 10),
  };
};

// =========================================================================
// 1. PANEL MANAGEMENT
// =========================================================================

/**
 * Create a new interview panel for an interview round
 * @route POST /api/rounds/:id/panels
 * @access Private (Recruiter only)
 */
const createRoundPanel = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiter(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { name, interviewers = [], venueOrLink = '', capacity = 1, room = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Panel name is required' });
    }

    const panel = await InterviewPanel.create({
      round: round._id,
      drive: round.drive._id,
      name: name.trim(),
      interviewers: Array.isArray(interviewers) ? interviewers : [],
      venueOrLink: venueOrLink.trim(),
      room: (room || '').trim(),
      capacity: Number(capacity) || 1,
    });

    res.status(201).json({
      success: true,
      message: `Interview panel "${panel.name}" created successfully`,
      panel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all panels for a round
 * @route GET /api/rounds/:id/panels
 * @access Private (Recruiter, TPO, Superadmin)
 */
const getRoundPanels = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this round' });
    }

    const panels = await InterviewPanel.find({ round: round._id }).sort({ createdAt: 1 });

    // Attach slot count metrics per panel
    const panelsWithMetrics = await Promise.all(
      panels.map(async (panel) => {
        const slots = await InterviewSlot.find({ panel: panel._id });
        const scheduledCount = slots.filter((s) => s.status === 'scheduled').length;
        const inProgressCount = slots.filter((s) => s.status === 'in_progress').length;
        const completedCount = slots.filter((s) => s.status === 'completed').length;
        const noShowCount = slots.filter((s) => s.status === 'no_show').length;

        return {
          ...panel.toObject(),
          metrics: {
            totalSlots: slots.length,
            scheduledCount,
            inProgressCount,
            completedCount,
            noShowCount,
          },
        };
      })
    );

    res.status(200).json({
      success: true,
      count: panelsWithMetrics.length,
      panels: panelsWithMetrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing interview panel
 * @route PUT /api/panels/:id
 * @access Private (Recruiter only)
 */
const updatePanel = async (req, res, next) => {
  try {
    const panel = await InterviewPanel.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!panel) return res.status(404).json({ success: false, message: 'Panel not found' });

    const authCheck = verifyOwningRecruiter(panel.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { name, interviewers, venueOrLink, capacity, room } = req.body;
    if (name) panel.name = name.trim();
    if (Array.isArray(interviewers)) panel.interviewers = interviewers;
    if (room !== undefined) panel.room = room ? room.trim() : '';
    if (venueOrLink !== undefined) {
      const oldLink = panel.venueOrLink;
      panel.venueOrLink = venueOrLink.trim();
      // Update slot links when panel link changes
      if (panel.venueOrLink !== oldLink) {
        await InterviewSlot.updateMany(
          { panel: panel._id },
          { $set: { meetingLink: panel.venueOrLink } }
        );
      }
    }
    if (capacity !== undefined) panel.capacity = Number(capacity) || 1;

    await panel.save();

    res.status(200).json({
      success: true,
      message: 'Panel updated successfully',
      panel,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an interview panel
 * @route DELETE /api/panels/:id
 * @access Private (Recruiter only)
 */
const deletePanel = async (req, res, next) => {
  try {
    const panel = await InterviewPanel.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!panel) return res.status(404).json({ success: false, message: 'Panel not found' });

    const authCheck = verifyOwningRecruiter(panel.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const activeSlots = await InterviewSlot.countDocuments({ panel: panel._id });
    if (activeSlots > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete panel "${panel.name}": It has ${activeSlots} interview slot(s) assigned. Please reschedule or delete the slots first.`,
      });
    }

    await InterviewPanel.findByIdAndDelete(panel._id);

    res.status(200).json({
      success: true,
      message: `Panel "${panel.name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// 2. AUTO-SCHEDULING SLOTS & CLASH DETECTION
// =========================================================================

/**
 * Auto-distribute round participants across panels in time slots with clash detection & Jitsi link generation
 * @route POST /api/rounds/:id/slots/auto-schedule
 * @access Private (Recruiter only)
 */
const autoScheduleInterviewSlots = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiter(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const {
      startTime,
      slotDurationMinutes = round.slotDurationMinutes || 30,
      breakMinutes = 0,
      panelIds = [],
    } = req.body;

    if (!startTime) {
      return res.status(400).json({ success: false, message: 'Interview start date & time is required' });
    }

    const startDateTime = new Date(startTime);
    if (isNaN(startDateTime.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid start date and time format' });
    }

    const duration = Number(slotDurationMinutes) || 30;
    const breakDuration = Number(breakMinutes) || 0;

    // Fetch panels for this round
    const panelQuery = { round: round._id };
    if (Array.isArray(panelIds) && panelIds.length > 0) {
      panelQuery._id = { $in: panelIds };
    }

    const panels = await InterviewPanel.find(panelQuery).sort({ createdAt: 1 });
    if (panels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No interview panels found for this round. Please create at least one panel first.',
      });
    }

    // Fetch enrolled participants for this round (excluding already rejected or absent)
    const participants = await RoundParticipant.find({
      round: round._id,
      attendance: { $ne: 'absent' },
      result: { $ne: 'rejected' },
    })
      .populate('student')
      .populate('application');

    if (participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No eligible candidates found enrolled in this round to schedule.',
      });
    }

    // Clear existing slots for this round to prevent duplicates
    await InterviewSlot.deleteMany({ round: round._id });
    await Evaluation.deleteMany({ round: round._id });

    // Distribute participants across panels in time slots
    const createdSlots = [];
    const clashErrors = [];
    let participantIndex = 0;
    let slotIndex = 0;

    // Track queue numbers per panel
    const panelQueueCounters = {};
    panels.forEach((p) => {
      panelQueueCounters[p._id.toString()] = 1;
    });

    while (participantIndex < participants.length) {
      const slotStart = new Date(startDateTime.getTime() + slotIndex * (duration + breakDuration) * 60000);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      for (const panel of panels) {
        if (participantIndex >= participants.length) break;

        const capacity = panel.capacity || 1;
        for (let cap = 0; cap < capacity; cap++) {
          if (participantIndex >= participants.length) break;

          const p = participants[participantIndex];
          participantIndex++;

          // 1. Clash Check for Student across other drives
          const studentClash = await checkStudentSlotClash(p.student._id, slotStart, slotEnd);
          if (studentClash.hasClash) {
            clashErrors.push({
              student: p.student.enrollmentNo,
              reason: studentClash.clashInfo,
            });
          }

          // 2. Clash Check for Panel double-booking
          const panelClash = await checkPanelClash(panel._id, slotStart, slotEnd);
          if (panelClash.hasClash) {
            clashErrors.push({
              panel: panel.name,
              reason: panelClash.clashInfo,
            });
          }

          // Meeting Link / Venue assignment
          let meetingLink = panel.venueOrLink || round.venueOrLink || '';
          if (!meetingLink && (round.deliveryMode === 'offline_campus' || round.mode === 'offline')) {
            meetingLink = round.venueOrLink || (panel.room ? `Room ${panel.room}` : 'Campus Venue');
          } else if (!meetingLink) {
            const safeRoomName = `Placement-${round._id.toString().slice(-6)}-${panel._id.toString().slice(-4)}-${p.student._id.toString().slice(-4)}`;
            meetingLink = `https://meet.jit.si/${safeRoomName}`;
          }

          const queueNumber = panelQueueCounters[panel._id.toString()]++;

          const slotDoc = await InterviewSlot.create({
            round: round._id,
            drive: round.drive._id,
            panel: panel._id,
            student: p.student._id,
            application: p.application._id,
            startTime: slotStart,
            endTime: slotEnd,
            meetingLink,
            status: 'scheduled',
            queueNumber,
          });

          createdSlots.push(slotDoc);

          // Notify student of assigned slot with .ics calendar invite & email
          if (p.student.user) {
            const timeStr = slotStart.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
            await notifyUser(p.student.user, 'slot_assigned', {
              companyName: round.drive?.company?.name || 'Recruiter',
              collegeId: round.drive?.college,
              role: round.drive?.role,
              roundName: round.name,
              panelName: panel.name,
              queueNumber,
              startTime: slotStart,
              endTime: slotEnd,
              venueOrLink: meetingLink,
              mode: round.mode,
              slotId: slotDoc._id,
              message: `Your interview slot for ${round.name} with ${panel.name} is scheduled for ${timeStr} IST. Queue #${queueNumber}.`,
              link: `/student/interview/${slotDoc._id}`,
            });
          }
        }
      }

      slotIndex++;
    }

    // Time Warnings Check (Requirement 3: warn before 8:00 AM, after 9:00 PM IST, or outside drive date)
    const timeWarnings = [];
    let hasEarlySlot = false;
    let hasLateSlot = false;
    let hasOutsideDriveDateSlot = false;
    const driveDateIST = round.drive?.driveDate ? getISTTimeDetails(round.drive.driveDate)?.dateStr : null;

    for (const slot of createdSlots) {
      const startIST = getISTTimeDetails(slot.startTime);
      const endIST = getISTTimeDetails(slot.endTime);
      if (startIST) {
        if (startIST.hour < 8) {
          hasEarlySlot = true;
        }
        if (driveDateIST && startIST.dateStr !== driveDateIST) {
          hasOutsideDriveDateSlot = true;
        }
      }
      if (endIST) {
        if (endIST.hour > 21 || (endIST.hour === 21 && endIST.minute > 0)) {
          hasLateSlot = true;
        }
      }
    }

    if (hasEarlySlot) {
      timeWarnings.push('Warning: Some interview slots are scheduled before 8:00 AM IST.');
    }
    if (hasLateSlot) {
      timeWarnings.push('Warning: Some interview slots extend after 9:00 PM IST.');
    }
    if (hasOutsideDriveDateSlot) {
      timeWarnings.push('Warning: Some interview slots are scheduled on a date outside the official drive date.');
    }

    res.status(201).json({
      success: true,
      message: `Successfully scheduled ${createdSlots.length} interview slots across ${panels.length} panel(s).`,
      slotsCount: createdSlots.length,
      panelsCount: panels.length,
      clashWarnings: clashErrors,
      timeWarnings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all interview slots for a round
 * @route GET /api/rounds/:id/slots
 * @access Private (Recruiter, TPO, Student)
 */
const getRoundSlots = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const query = { round: round._id };

    // Role scoping:
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id });
      if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
      query.student = student._id;
    } else {
      if (!verifyDriveAccess(round.drive, req.user)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view slots for this round' });
      }
    }

    if (req.query.panel && mongoose.Types.ObjectId.isValid(req.query.panel)) {
      query.panel = req.query.panel;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    const slots = await InterviewSlot.find(query)
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('panel')
      .sort({ queueNumber: 1, startTime: 1 });

    // Populate evaluations for slots
    const slotIds = slots.map((s) => s._id);
    const evaluations = await Evaluation.find({ slot: { $in: slotIds } });
    const evalMap = {};
    evaluations.forEach((ev) => {
      evalMap[ev.slot.toString()] = ev;
    });

    const slotsWithEvaluations = slots.map((s) => ({
      ...s.toObject(),
      evaluation: evalMap[s._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      count: slotsWithEvaluations.length,
      slots: slotsWithEvaluations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logged-in student gets their assigned interview slots
 * @route GET /api/students/my-interview-slots
 * @access Private (Student only)
 */
const getStudentMyInterviewSlots = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const slots = await InterviewSlot.find({ student: student._id })
      .populate({
        path: 'round',
        select: 'name order type mode deliveryMode reportByTime testWindowStart testWindowEnd instructions evaluationCriteria',
        populate: {
          path: 'drive',
          select: 'role packageLpa venueOrMeetingLink mode',
          populate: { path: 'company', select: 'name logoUrl industry' },
        },
      })
      .populate('panel', 'name venueOrLink room interviewers')
      .sort({ startTime: 1 });

    // Fetch shared evaluations
    const slotIds = slots.map((s) => s._id);
    const evaluations = await Evaluation.find({
      slot: { $in: slotIds },
      sharedWithStudent: true,
    });
    const evalMap = {};
    evaluations.forEach((ev) => {
      evalMap[ev.slot.toString()] = ev;
    });

    const enriched = slots.map((s) => ({
      ...s.toObject(),
      evaluation: evalMap[s._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      count: enriched.length,
      slots: enriched,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// 3. QUEUE STATUS, "CALL NEXT", & NO-SHOW MANAGEMENT
// =========================================================================

/**
 * Update slot status (check-in, in-progress, completed, no-show)
 * @route PUT /api/slots/:id/status
 * @access Private (Recruiter, TPO)
 */
const updateSlotStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || !['scheduled', 'checked_in', 'in_progress', 'completed', 'no_show'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status required: scheduled, checked_in, in_progress, completed, or no_show',
      });
    }

    const slot = await InterviewSlot.findById(req.params.id)
      .populate({
        path: 'round',
        populate: 'drive',
      })
      .populate('panel')
      .populate({
        path: 'student',
        populate: 'user',
      });

    if (!slot) return res.status(404).json({ success: false, message: 'Interview slot not found' });

    // Authorization checks:
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id });
      if (!student || student._id.toString() !== slot.student._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized for this slot' });
      }
      if (status !== 'checked_in') {
        return res.status(403).json({ success: false, message: 'Students are only permitted to check in' });
      }
    } else if (req.user.role === 'recruiter') {
      const authCheck = verifyOwningRecruiter(slot.round?.drive, req.user);
      if (!authCheck.allowed) {
        return res.status(authCheck.status).json({ success: false, message: authCheck.message });
      }
    } else if (req.user.role === 'tpo' || req.user.role === 'admin') {
      if (!verifyDriveAccess(slot.round?.drive, req.user)) {
        return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
      }
      // TPOs can update attendance and mark no-show
      if (!['no_show', 'checked_in'].includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'TPO is only authorized to record check-in, attendance, or no-show status',
        });
      }
    } else if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    slot.status = status;
    await slot.save();

    // Side-effects:
    if (status === 'in_progress') {
      // Notify candidate that they are called into the interview room
      if (slot.student?.user?._id) {
        await notifyUser(slot.student.user._id, 'called_next', {
          companyName: slot.round?.drive?.company?.name || 'Recruiter',
          collegeId: slot.round?.drive?.college,
          role: slot.round?.drive?.role,
          roundName: slot.round?.name,
          panelName: slot.panel?.name,
          slotId: slot._id,
          message: `You have been called for your interview with ${slot.panel?.name || 'the panel'}! Please join the meeting room immediately.`,
          link: `/student/interview/${slot._id}`,
        });
      }
    } else if (status === 'no_show') {
      // Mark RoundParticipant as absent & rejected
      await RoundParticipant.findOneAndUpdate(
        { round: slot.round._id, student: slot.student._id },
        { $set: { attendance: 'absent', result: 'rejected' } }
      );

      if (slot.student?.user?._id) {
        await createNotification({
          user: slot.student.user._id,
          type: 'status_change',
          message: `You were marked as no-show for your interview in ${slot.round?.name}. Contact your college TPO if you require a re-test.`,
          link: `/student/interview/${slot._id}`,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Slot status updated to "${status}"`,
      slot,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recruiter calls the next candidate waiting in queue for a panel
 * @route POST /api/panels/:id/call-next
 * @access Private (Recruiter only)
 */
const callNextCandidate = async (req, res, next) => {
  try {
    const panel = await InterviewPanel.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!panel) return res.status(404).json({ success: false, message: 'Panel not found' });

    const authCheck = verifyOwningRecruiter(panel.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    // Find the next candidate in queue with status 'checked_in' or 'scheduled'
    const nextSlot = await InterviewSlot.findOne({
      panel: panel._id,
      status: { $in: ['checked_in', 'scheduled'] },
    })
      .populate({
        path: 'student',
        populate: 'user',
      })
      .sort({ queueNumber: 1, startTime: 1 });

    if (!nextSlot) {
      return res.status(200).json({
        success: false,
        message: 'No candidates currently waiting in queue for this panel.',
      });
    }

    nextSlot.status = 'in_progress';
    await nextSlot.save();

    // Send instant notification & email alert
    if (nextSlot.student?.user?._id) {
      await notifyUser(nextSlot.student.user._id, 'called_next', {
        companyName: panel.round?.drive?.company?.name || 'Recruiter',
        collegeId: panel.round?.drive?.college,
        role: panel.round?.drive?.role,
        roundName: panel.round?.name,
        panelName: panel.name,
        slotId: nextSlot._id,
        message: `Queue alert: You are called next for your interview with ${panel.name}! Please enter the meeting room now.`,
        link: `/student/interview/${nextSlot._id}`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Called candidate ${nextSlot.student?.user?.name || ''} (Queue #${nextSlot.queueNumber}) into interview!`,
      slot: nextSlot,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Allow a re-test for a candidate marked as no-show (TPO or Recruiter)
 * @route PUT /api/slots/:id/allow-retest
 * @access Private (TPO, Recruiter)
 */
const allowSlotRetest = async (req, res, next) => {
  try {
    const slot = await InterviewSlot.findById(req.params.id)
      .populate({
        path: 'round',
        populate: 'drive',
      })
      .populate({
        path: 'student',
        populate: 'user',
      });

    if (!slot) return res.status(404).json({ success: false, message: 'Interview slot not found' });

    if (!verifyDriveAccess(slot.round?.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    if (slot.status !== 'no_show') {
      return res.status(400).json({
        success: false,
        message: `Slot status is currently "${slot.status}". Re-test can only be granted for candidates marked as no-show.`,
      });
    }

    // Reset slot back to scheduled
    slot.status = 'scheduled';
    await slot.save();

    // Reset RoundParticipant back to pending
    await RoundParticipant.findOneAndUpdate(
      { round: slot.round._id, student: slot.student._id },
      { $set: { attendance: 'pending', result: 'pending' } }
    );

    // Notify student
    if (slot.student?.user?._id) {
      await createNotification({
        user: slot.student.user._id,
        type: 'status_change',
        message: `Your college TPO has granted you a re-test for ${slot.round?.name}. Please be prepared for your rescheduled interview.`,
        link: `/student/interview/${slot._id}`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Re-test granted for candidate ${slot.student?.user?.name || ''}. Status reset to scheduled.`,
      slot,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// 4. EVALUATION SUBMISSION & RESULT SUGGESTIONS
// =========================================================================

/**
 * Recruiter submits criteria evaluation for an interview slot
 * @route POST /api/slots/:id/evaluation
 * @access Private (Recruiter only)
 */
const submitSlotEvaluation = async (req, res, next) => {
  try {
    const slot = await InterviewSlot.findById(req.params.id)
      .populate({
        path: 'round',
        populate: 'drive',
      })
      .populate('student');

    if (!slot) return res.status(404).json({ success: false, message: 'Interview slot not found' });

    const authCheck = verifyOwningRecruiter(slot.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { criteriaScores, comments = '', recommendation, sharedWithStudent = false } = req.body;

    if (!criteriaScores || typeof criteriaScores !== 'object') {
      return res.status(400).json({ success: false, message: 'Evaluation criteria scores are required' });
    }

    const technical = Number(criteriaScores.technical);
    const problemSolving = Number(criteriaScores.problemSolving);
    const communication = Number(criteriaScores.communication);

    if ([technical, problemSolving, communication].some((s) => isNaN(s) || s < 1 || s > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Each criterion (technical, problemSolving, communication) must be scored between 1 and 5',
      });
    }

    if (!recommendation || !['strong_hire', 'hire', 'hold', 'reject'].includes(recommendation)) {
      return res.status(400).json({
        success: false,
        message: 'Valid recommendation required: strong_hire, hire, hold, or reject',
      });
    }

    // Compute aggregate score out of 100
    const calculatedScore = Math.round(((technical + problemSolving + communication) / 15) * 100);

    // Save or update Evaluation record
    let evaluation = await Evaluation.findOne({ slot: slot._id });
    if (!evaluation) {
      evaluation = new Evaluation({
        slot: slot._id,
        round: slot.round._id,
        drive: slot.round.drive._id,
        student: slot.student._id,
        evaluator: req.user._id,
        evaluatorName: req.user.name,
      });
    }

    evaluation.criteriaScores = { technical, problemSolving, communication };
    evaluation.score = calculatedScore;
    evaluation.comments = comments.trim();
    evaluation.recommendation = recommendation;
    evaluation.sharedWithStudent = Boolean(sharedWithStudent);
    await evaluation.save();

    // Mark slot as completed
    slot.status = 'completed';
    await slot.save();

    // Determine result suggestion for RoundParticipant
    let suggestedResult = 'pending';
    if (recommendation === 'strong_hire' || recommendation === 'hire') {
      suggestedResult = 'cleared';
    } else if (recommendation === 'reject') {
      suggestedResult = 'rejected';
    }

    // Update RoundParticipant score and result
    await RoundParticipant.findOneAndUpdate(
      { round: slot.round._id, student: slot.student._id },
      {
        $set: {
          attendance: 'present',
          score: calculatedScore,
          feedback: comments.trim(),
          result: suggestedResult,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: `Evaluation saved (${calculatedScore}/100, ${recommendation}). Candidate outcome set to "${suggestedResult}".`,
      evaluation,
      calculatedScore,
      suggestedResult,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get evaluation for a slot
 * @route GET /api/slots/:id/evaluation
 * @access Private (Recruiter, TPO, Student if shared)
 */
const getSlotEvaluation = async (req, res, next) => {
  try {
    const slot = await InterviewSlot.findById(req.params.id).populate({
      path: 'round',
      populate: 'drive',
    });
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });

    const evaluation = await Evaluation.findOne({ slot: slot._id }).populate('evaluator', 'name email');

    if (!evaluation) {
      return res.status(200).json({ success: true, evaluation: null });
    }

    if (req.user.role === 'student') {
      if (!evaluation.sharedWithStudent) {
        return res.status(403).json({
          success: false,
          message: 'Evaluation has not been shared with the student yet',
        });
      }
    } else if (!verifyDriveAccess(slot.round?.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.status(200).json({
      success: true,
      evaluation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed information for a single interview slot (Student Interview Room & Recruiter view)
 * @route GET /api/slots/:id
 * @access Private (Student, Recruiter, TPO, Admin, Superadmin)
 */
const getSlotDetails = async (req, res, next) => {
  try {
    const slot = await InterviewSlot.findById(req.params.id)
      .populate({
        path: 'round',
        select: 'name order type mode deliveryMode testWindowStart testWindowEnd reportByTime instructions evaluationCriteria date startTime venueOrLink',
        populate: {
          path: 'drive',
          select: 'role packageLpa venueOrMeetingLink mode driveDate college company',
          populate: { path: 'company', select: 'name logoUrl industry' },
        },
      })
      .populate('panel', 'name venueOrLink room interviewers capacity')
      .populate({
        path: 'student',
        select: 'name rollNumber branch user cgpa',
        populate: { path: 'user', select: 'name email' },
      });

    if (!slot) return res.status(404).json({ success: false, message: 'Interview slot not found' });

    // Authorization checks:
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id });
      if (!student || student._id.toString() !== slot.student?._id?.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this interview slot' });
      }
    } else {
      if (!verifyDriveAccess(slot.round?.drive, req.user)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this slot' });
      }
    }

    // Queue position details: count slots ahead in the same panel with status scheduled, checked_in, or in_progress
    const panelId = slot.panel?._id || slot.panel;
    const candidatesAhead = await InterviewSlot.countDocuments({
      panel: panelId,
      queueNumber: { $lt: slot.queueNumber },
      status: { $in: ['scheduled', 'checked_in', 'in_progress'] },
    });

    const currentCalledSlot = await InterviewSlot.findOne({
      panel: panelId,
      status: 'in_progress',
    }).select('queueNumber startTime');

    // Join window rule: enabled 10 minutes before slot OR as soon as recruiter calls candidate (in_progress)
    // Never joinable if completed, no_show, or cancelled
    const now = Date.now();
    const slotStartMs = new Date(slot.startTime).getTime();
    const isTenMinsBefore = now >= slotStartMs - 10 * 60 * 1000;
    const isCalledOrInProgress = slot.status === 'in_progress';
    const isCompleted = slot.status === 'completed';
    const isNoShow = slot.status === 'no_show';
    const isCancelled = slot.status === 'cancelled';
    const canJoin = !isCompleted && !isNoShow && !isCancelled && (isCalledOrInProgress || isTenMinsBefore);

    // Fetch evaluation if exists
    const evaluation = await Evaluation.findOne({ slot: slot._id }).populate('evaluator', 'name email');
    const returnEvaluation = req.user.role === 'student' && !evaluation?.sharedWithStudent ? null : evaluation;

    res.status(200).json({
      success: true,
      slot,
      candidatesAhead,
      currentCalledSlot: currentCalledSlot ? { queueNumber: currentCalledSlot.queueNumber } : null,
      canJoin: Boolean(canJoin && slot.meetingLink),
      evaluation: returnEvaluation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoundPanel,
  getRoundPanels,
  updatePanel,
  deletePanel,
  autoScheduleInterviewSlots,
  getRoundSlots,
  getStudentMyInterviewSlots,
  updateSlotStatus,
  callNextCandidate,
  allowSlotRetest,
  submitSlotEvaluation,
  getSlotEvaluation,
  getSlotDetails,
};

