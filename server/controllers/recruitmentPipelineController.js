const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const {
  Drive,
  Round,
  RoundBatch,
  RoundParticipant,
  Application,
  Student,
  Placement,
  Offer,
  Company,
  College,
  User,
  InterviewPanel,
  InterviewSlot,
} = require('../models');
const {
  getEndOfDayIST,
  initializeDriveRoundsAndRound1,
  autoSplitParticipants,
  advanceClearedStudentsToNextRound,
  generateDailyClashReport,
  checkStudentClash,
  checkVenueClash,
} = require('../utils/pipelineService');
const { createNotification, notifyUser } = require('../utils/notificationService');
const { formatIST } = require('../utils/emailTemplates');
const { parseISTDateTime } = require('../utils/dateTime');

/**
 * Helper to check TPO or Recruiter drive ownership
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
 * Helper to ensure only the owning company's recruiter (or superadmin) can update rounds
 */
const verifyOwningRecruiterAccess = (drive, user) => {
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
      message: 'Not authorized: Only recruiters from the hiring company can update rounds',
    };
  }

  const userCompanyId = (user.company?._id || user.company)?.toString();
  const driveCompanyId = (drive.company?._id || drive.company)?.toString();
  if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
    return {
      allowed: false,
      status: 403,
      message: 'Not authorized: Only recruiters from the hiring company can update rounds',
    };
  }

  return { allowed: true };
};

/**
 * 1. TPO closes applications and freezes candidate list
 * @route PUT /api/drives/:id/freeze
 * @access Private (TPO / Admin only)
 */
const freezeDriveAndInitializePipeline = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id);
    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    if (!verifyDriveAccess(drive, req.user) || req.user.role === 'recruiter') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Only college TPO can freeze the applicant list for this drive',
      });
    }

    const { drive: frozenDrive, rounds } = await initializeDriveRoundsAndRound1(drive._id);

    const round1 = rounds.find((r) => r.order === 1) || rounds[0];
    const round1Count = round1 ? await RoundParticipant.countDocuments({ round: round1._id }) : 0;

    res.status(200).json({
      success: true,
      message: `Applications closed and applicant list frozen for "${drive.role}". Round 1 populated with ${round1Count} candidates.`,
      drive: frozenDrive,
      rounds,
      participantsCount: round1Count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. TPO removes/excludes an applicant before freezing
 * @route PUT /api/drives/:id/remove-applicant/:studentId
 * @access Private (TPO / Admin only)
 */
const removeApplicantBeforeFreeze = async (req, res, next) => {
  try {
    const { id: driveId, studentId } = req.params;
    const drive = await Drive.findById(driveId);

    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    if (!verifyDriveAccess(drive, req.user) || req.user.role === 'recruiter') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized: Only college TPO can manage applicants for this drive',
      });
    }

    if (drive.applicationsClosed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove applicant: Applications are already closed and candidate list is frozen.',
      });
    }

    // Add to excluded list
    if (!drive.excludedStudents.includes(studentId)) {
      drive.excludedStudents.push(studentId);
      await drive.save();
    }

    // Update Application status to rejected
    await Application.findOneAndUpdate(
      { drive: driveId, student: studentId },
      { $set: { status: 'rejected' } }
    );

    // If Round 1 participants exist, delete them
    const round1 = await Round.findOne({ drive: driveId, order: 1 });
    if (round1) {
      await RoundParticipant.findOneAndDelete({ round: round1._id, student: studentId });
    }

    res.status(200).json({
      success: true,
      message: 'Applicant successfully excluded from drive.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Get full pipeline progress, rounds, batches, and metrics
 * @route GET /api/drives/:id/progress
 * @access Private (TPO, Recruiter, Superadmin)
 */
const getDriveProgress = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id)
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state');

    if (!drive) {
      return res.status(404).json({ success: false, message: 'Drive not found' });
    }

    if (!verifyDriveAccess(drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view progress for this drive' });
    }

    // Auto-check if deadline has passed (end of day in IST) and freeze if not yet done
    const deadlineEnd = getEndOfDayIST(drive.lastDateToApply);
    if (!drive.applicationsClosed && deadlineEnd && new Date() > deadlineEnd) {
      await initializeDriveRoundsAndRound1(drive._id);
    }

    // Fetch rounds
    const rounds = await Round.find({ drive: drive._id }).sort({ order: 1 });

    // Fetch batches for each round
    const roundsWithBatches = await Promise.all(
      rounds.map(async (round) => {
        const batches = await RoundBatch.find({ round: round._id }).sort({ startTime: 1 });
        const participants = await RoundParticipant.find({ round: round._id })
          .populate({
            path: 'student',
            populate: { path: 'user', select: 'name email' },
          })
          .populate('batch', 'batchName startTime endTime venueOrLink');

        const totalEnrolled = participants.length;
        const presentCount = participants.filter((p) => p.attendance === 'present').length;
        const absentCount = participants.filter((p) => p.attendance === 'absent').length;
        const clearedCount = participants.filter((p) => p.result === 'cleared').length;
        const rejectedCount = participants.filter((p) => p.result === 'rejected').length;

        return {
          ...round.toObject(),
          batches,
          participants,
          metrics: {
            totalEnrolled,
            presentCount,
            absentCount,
            clearedCount,
            rejectedCount,
          },
        };
      })
    );

    // Fetch total applications
    const applications = await Application.find({ drive: drive._id })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .sort({ appliedOn: 1 });

    const excludedIds = (drive.excludedStudents || []).map((id) => id.toString());
    const validApplications = applications.filter((app) => !excludedIds.includes(app.student._id.toString()));

    // Offers count
    const offers = await Offer.find({ drive: drive._id });
    const acceptedOffers = offers.filter((o) => o.status === 'accepted');

    res.status(200).json({
      success: true,
      drive,
      rounds: roundsWithBatches,
      applications: applications.map((a) => ({
        ...a.toObject(),
        isExcluded: excludedIds.includes(a.student._id.toString()),
      })),
      metrics: {
        totalApplied: applications.length,
        validApplicants: validApplications.length,
        excludedCount: excludedIds.length,
        roundsCount: rounds.length,
        totalOffers: offers.length,
        acceptedOffers: acceptedOffers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Get specific round details & participants
 * @route GET /api/rounds/:id
 * @access Private (TPO, Recruiter, Superadmin)
 */
const getRoundDetails = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate({
      path: 'drive',
      populate: ['company', 'college'],
    });

    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const batches = await RoundBatch.find({ round: round._id }).sort({ startTime: 1 });

    const participants = await RoundParticipant.find({ round: round._id })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('batch');

    res.status(200).json({
      success: true,
      round,
      batches,
      participants,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Auto-split participants into batches by capacity and time slots
 * @route POST /api/rounds/:id/batches/auto-split
 * @access Private (Recruiter, TPO)
 */
const autoSplitRoundBatches = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const {
      slots,
      capacity,
      capacityPerBatch = capacity || 50,
      startTime,
      slotDurationMinutes,
      durationMinutes = slotDurationMinutes || 60,
      breakMinutes = 0,
      venueOrLink,
      mode = 'offline',
    } = req.body;

    const result = await autoSplitParticipants({
      roundId: round._id,
      slots,
      capacityPerBatch,
      startTime,
      durationMinutes,
      breakMinutes,
      venueOrLink,
      mode,
    });

    res.status(200).json({
      success: true,
      message: `Successfully created ${result.createdBatches.length} batch(es) and assigned ${result.assignedCount} candidates in enrollment order.`,
      batches: result.createdBatches,
      assignedCount: result.assignedCount,
    });
  } catch (error) {
    // If clash or custom error, return 400 with message
    if (error.message.includes('clash') || error.message.includes('participants')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * 6. Manually move participant between batches
 * @route PUT /api/rounds/:id/move-participant
 * @access Private (Recruiter only)
 */
const moveParticipantBatch = async (req, res, next) => {
  try {
    const { participantId, targetBatchId } = req.body;

    const participant = await RoundParticipant.findById(participantId)
      .populate({
        path: 'round',
        populate: 'drive',
      })
      .populate('student');

    if (!participant) {
      return res.status(404).json({ success: false, message: 'Participant not found' });
    }

    const authCheck = verifyOwningRecruiterAccess(participant.round?.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const targetBatch = await RoundBatch.findById(targetBatchId);
    if (!targetBatch) {
      return res.status(404).json({ success: false, message: 'Target batch not found' });
    }

    // Check capacity
    const currentEnrolled = await RoundParticipant.countDocuments({ batch: targetBatchId });
    if (currentEnrolled >= targetBatch.capacity) {
      return res.status(400).json({
        success: false,
        message: `Batch "${targetBatch.batchName}" is already at full capacity (${targetBatch.capacity}).`,
      });
    }

    // Check student clash
    const clashCheck = await checkStudentClash(
      participant.student._id,
      targetBatch.startTime,
      targetBatch.endTime,
      participant.batch // exclude previous batch
    );

    if (clashCheck.hasClash) {
      return res.status(400).json({ success: false, message: clashCheck.clashInfo });
    }

    participant.batch = targetBatch._id;
    await participant.save();

    res.status(200).json({
      success: true,
      message: `Participant moved to ${targetBatch.batchName} successfully.`,
      participant,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. Bulk attendance update (Recruiter or College TPO)
 * @route PUT /api/rounds/:id/attendance
 * @access Private (Recruiter, TPO)
 */
const updateBulkAttendance = async (req, res, next) => {
  try {
    const { attendanceList } = req.body;
    if (!Array.isArray(attendanceList) || attendanceList.length === 0) {
      return res.status(400).json({ success: false, message: 'attendanceList array is required' });
    }

    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    let updatedCount = 0;
    for (const item of attendanceList) {
      const { participantId, attendance } = item;
      if (!participantId || !['pending', 'present', 'absent'].includes(attendance)) continue;

      const pDoc = await RoundParticipant.findById(participantId);
      if (!pDoc) continue;

      // Candidate must have a batch assigned before being marked present
      if (attendance === 'present' && !pDoc.batch) {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark candidate as present without an assigned batch slot. Please assign candidates to batches first.',
        });
      }

      pDoc.attendance = attendance;
      // Absent students are automatically marked rejected
      if (attendance === 'absent') {
        pDoc.result = 'rejected';
      }

      await pDoc.save();
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Updated attendance for ${updatedCount} candidates. Absent candidates were automatically marked rejected.`,
      updatedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8. Update round settings (type, deliveryMode, mode, date, duration, venue/link, instructions, cutoffScore, test windows)
 * @route PUT /api/rounds/:id
 * @access Private (Recruiter only)
 */
const updateRoundSettings = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate({
      path: 'drive',
      populate: [
        { path: 'company', select: 'name' },
        { path: 'college', select: 'name' },
      ],
    });
    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const {
      name,
      type,
      mode,
      deliveryMode,
      testWindowStart,
      testWindowEnd,
      reportByTime,
      date,
      durationMinutes,
      venueOrLink,
      instructions,
      cutoffScore,
      shuffleQuestions,
      shuffleOptions,
      negativeMarking,
      showScoreToStudents,
      notifyStudents,
    } = req.body;

    const targetType = type || round.type;
    const targetDeliveryMode = deliveryMode !== undefined ? deliveryMode : round.deliveryMode;

    if (type) {
      const allowedTypes = [
        'aptitude',
        'coding',
        'technical',
        'hr',
        'group_discussion',
        'pre_placement_talk',
      ];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid round type "${type}". Allowed: ${allowedTypes.join(', ')}`,
        });
      }
    }

    // Validation for deliveryMode
    if (deliveryMode !== undefined && deliveryMode !== '') {
      const allowedModes = ['platform_test', 'online_external', 'offline_campus'];
      if (!allowedModes.includes(deliveryMode)) {
        return res.status(400).json({
          success: false,
          message: `Invalid delivery mode "${deliveryMode}". Allowed: ${allowedModes.join(', ')}`,
        });
      }
    }

    // Delivery mode specific validations
    if (targetDeliveryMode === 'platform_test') {
      if (targetType !== 'aptitude' && targetType !== 'coding') {
        return res.status(400).json({
          success: false,
          message: 'Platform test delivery mode is only allowed for aptitude and coding rounds. Interviews and group discussions cannot use platform test.',
        });
      }
    }

    if (targetDeliveryMode === 'online_external') {
      const linkToCheck = venueOrLink !== undefined ? venueOrLink : round.venueOrLink;
      if (linkToCheck && linkToCheck.trim() && !/^https?:\/\//i.test(linkToCheck.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Online meeting link must be a valid URL starting with http:// or https://',
        });
      }
    }

    if (targetDeliveryMode === 'offline_campus') {
      const venueToCheck = venueOrLink !== undefined ? venueOrLink : round.venueOrLink;
      if (!venueToCheck || !venueToCheck.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Venue is required for offline campus rounds.',
        });
      }
    }

    // Detect changes for schedule_updated notification
    const changes = [];

    if (deliveryMode !== undefined && (round.deliveryMode || '') !== (deliveryMode || '')) {
      changes.push({
        field: 'Delivery Mode',
        oldValue: round.deliveryMode ? round.deliveryMode.replace('_', ' ') : 'Not set',
        newValue: deliveryMode ? deliveryMode.replace('_', ' ') : 'Cleared',
      });
    }

    const oldDateStr = round.date ? round.date.toISOString().slice(0, 10) : '';
    const newDateStr = date !== undefined ? (date ? parseISTDateTime(date).toISOString().slice(0, 10) : '') : oldDateStr;
    if (date !== undefined && oldDateStr !== newDateStr) {
      changes.push({
        field: 'Date',
        oldValue: round.date ? formatIST(round.date, { dateOnly: true }) : 'Not set',
        newValue: date ? formatIST(parseISTDateTime(date), { dateOnly: true }) : 'Cleared',
      });
    }

    const effectiveMode = targetDeliveryMode || round.mode;
    const isOffline = effectiveMode === 'offline_campus' || effectiveMode === 'offline';
    if (venueOrLink !== undefined && (round.venueOrLink || '').trim() !== (venueOrLink || '').trim()) {
      changes.push({
        field: isOffline ? 'Venue' : 'Meeting Link',
        oldValue: round.venueOrLink || 'Not set',
        newValue: (venueOrLink || '').trim() || 'Cleared',
      });
    }

    if (reportByTime !== undefined && (round.reportByTime || '').trim() !== (reportByTime || '').trim()) {
      changes.push({
        field: 'Report-by Time',
        oldValue: round.reportByTime || 'Not set',
        newValue: (reportByTime || '').trim() || 'Cleared',
      });
    }

    const oldWinStart = round.testWindowStart ? round.testWindowStart.getTime() : null;
    const newWinStart = testWindowStart !== undefined ? (testWindowStart ? parseISTDateTime(testWindowStart).getTime() : null) : oldWinStart;
    if (testWindowStart !== undefined && oldWinStart !== newWinStart) {
      changes.push({
        field: 'Test Window Start',
        oldValue: round.testWindowStart ? formatIST(round.testWindowStart) : 'Not set',
        newValue: testWindowStart ? formatIST(parseISTDateTime(testWindowStart)) : 'Cleared',
      });
    }

    const oldWinEnd = round.testWindowEnd ? round.testWindowEnd.getTime() : null;
    const newWinEnd = testWindowEnd !== undefined ? (testWindowEnd ? parseISTDateTime(testWindowEnd).getTime() : null) : oldWinEnd;
    if (testWindowEnd !== undefined && oldWinEnd !== newWinEnd) {
      changes.push({
        field: 'Test Window End',
        oldValue: round.testWindowEnd ? formatIST(round.testWindowEnd) : 'Not set',
        newValue: testWindowEnd ? formatIST(parseISTDateTime(testWindowEnd)) : 'Cleared',
      });
    }

    // Apply updates
    if (type) round.type = type;
    if (deliveryMode !== undefined) {
      round.deliveryMode = deliveryMode;
      if (deliveryMode === 'platform_test' || deliveryMode === 'online_external') {
        round.mode = 'online';
      } else if (deliveryMode === 'offline_campus') {
        round.mode = 'offline';
      }
    }
    if (mode !== undefined && !deliveryMode) {
      if (mode && !['online', 'offline'].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: 'Round mode must be either "online" or "offline"',
        });
      }
      round.mode = mode || '';
    }

    if (testWindowStart !== undefined) {
      round.testWindowStart = testWindowStart ? parseISTDateTime(testWindowStart) : null;
    }
    if (testWindowEnd !== undefined) {
      round.testWindowEnd = testWindowEnd ? parseISTDateTime(testWindowEnd) : null;
    }
    if (reportByTime !== undefined) {
      round.reportByTime = reportByTime ? reportByTime.trim() : '';
    }
    if (date !== undefined) {
      round.date = date ? parseISTDateTime(date) : null;
    }
    if (durationMinutes !== undefined) {
      round.durationMinutes =
        durationMinutes !== '' && durationMinutes !== null ? Number(durationMinutes) : null;
    }
    if (venueOrLink !== undefined) {
      round.venueOrLink = venueOrLink ? venueOrLink.trim() : '';
    }
    if (instructions !== undefined) {
      round.instructions = instructions ? instructions.trim() : '';
    }
    if (cutoffScore !== undefined) {
      round.cutoffScore =
        cutoffScore !== '' && cutoffScore !== null ? Number(cutoffScore) : null;
    }
    if (shuffleQuestions !== undefined) {
      round.shuffleQuestions = Boolean(shuffleQuestions);
    }
    if (shuffleOptions !== undefined) {
      round.shuffleOptions = Boolean(shuffleOptions);
    }
    if (negativeMarking !== undefined) {
      round.negativeMarking = Boolean(negativeMarking);
    }
    if (showScoreToStudents !== undefined) {
      round.showScoreToStudents = Boolean(showScoreToStudents);
    }
    if (name && name.trim()) {
      round.name = name.trim();
    }

    await round.save();

    // If notifyStudents is requested AND there are actual schedule changes, notify all participants
    let notifiedCount = 0;
    if (notifyStudents && changes.length > 0) {
      const participants = await RoundParticipant.find({ round: round._id }).populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      });

      for (const p of participants) {
        if (p.student?.user?._id) {
          notifyUser(p.student.user._id, 'schedule_updated', {
            collegeId: round.drive?.college?._id || round.drive?.college,
            companyName: round.drive?.company?.name || 'Recruiter',
            collegeName: round.drive?.college?.name,
            role: round.drive?.role,
            roundName: round.name,
            deliveryMode: round.deliveryMode,
            changes,
            newScheduleTime: round.date ? formatIST(round.date) : (round.testWindowStart ? formatIST(round.testWindowStart) : 'TBD'),
            newVenueOrLink: round.venueOrLink || round.reportByTime || 'TBD',
            instructions: round.instructions,
            message: `Schedule updated for ${round.name} (${round.drive?.role || 'Drive'}). Please review the new details.`,
            link: '/student/applications',
          }).catch((err) => console.error('Schedule update notification error:', err));
          notifiedCount++;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Round settings updated successfully',
      round,
      changes,
      notifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8B. Export printable attendance sheet PDF for offline rounds
 * @route GET /api/rounds/:id/attendance/pdf
 * @access Private (Recruiter, TPO, Admin, Superadmin)
 */
const exportRoundAttendancePdf = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate({
      path: 'drive',
      populate: [
        { path: 'company', select: 'name' },
        { path: 'college', select: 'name' },
      ],
    });

    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    if (!verifyDriveAccess(round.drive, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this drive' });
    }

    const participants = await RoundParticipant.find({ round: round._id })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      })
      .populate('batch', 'batchName venueOrLink');

    const slots = await InterviewSlot.find({ round: round._id }).populate('panel');
    const slotMap = new Map();
    slots.forEach((s) => {
      if (s.student) slotMap.set(s.student.toString(), s);
    });

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const safeRoundName = (round.name || 'Round').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Attendance_${safeRoundName}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fillColor('#1e293b').fontSize(16).font('Helvetica-Bold').text(round.drive?.college?.name || 'CAMPUS RECRUITMENT DRIVE', { align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#4f46e5').text('CANDIDATE ATTENDANCE & VERIFICATION SHEET', { align: 'center' });
    doc.moveDown(0.5);

    // Metadata Box
    const boxY = doc.y;
    doc.rect(36, boxY, 522, 60).fillAndStroke('#f8fafc', '#cbd5e1');
    const metaY = boxY + 6;
    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold');
    doc.text(`Company: ${round.drive?.company?.name || 'N/A'}`, 44, metaY);
    doc.text(`Role: ${round.drive?.role || 'N/A'}`, 44, metaY + 14);
    doc.text(`Round: ${round.name} (${round.type || 'N/A'})`, 44, metaY + 28);
    doc.text(`Delivery Mode: ${round.deliveryMode || round.mode || 'offline_campus'}`, 44, metaY + 42);

    doc.text(`Date: ${round.date ? formatIST(round.date, { dateOnly: true }) : 'TBD'}`, 310, metaY);
    doc.text(`Venue: ${round.venueOrLink || 'Campus Venue'}`, 310, metaY + 14);
    doc.text(`Report-by Time: ${round.reportByTime || 'As scheduled'}`, 310, metaY + 28);
    doc.text(`Total Candidates: ${participants.length}`, 310, metaY + 42);

    doc.y = boxY + 68;

    // Table Header
    const tableTop = doc.y;
    const colX = {
      sr: 40,
      roll: 65,
      name: 145,
      branch: 260,
      room: 320,
      present: 395,
      absent: 435,
      sig: 475,
    };

    doc.rect(36, tableTop, 522, 20).fillAndStroke('#e2e8f0', '#94a3b8');
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
    doc.text('#', colX.sr, tableTop + 5);
    doc.text('Roll No', colX.roll, tableTop + 5);
    doc.text('Candidate Name', colX.name, tableTop + 5);
    doc.text('Branch', colX.branch, tableTop + 5);
    doc.text('Room / Batch', colX.room, tableTop + 5);
    doc.text('Present', colX.present, tableTop + 5);
    doc.text('Absent', colX.absent, tableTop + 5);
    doc.text('Signature', colX.sig, tableTop + 5);

    let curY = tableTop + 20;

    participants.forEach((p, idx) => {
      if (curY > 750) {
        doc.addPage();
        curY = 36;
        doc.rect(36, curY, 522, 20).fillAndStroke('#e2e8f0', '#94a3b8');
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
        doc.text('#', colX.sr, curY + 5);
        doc.text('Roll No', colX.roll, curY + 5);
        doc.text('Candidate Name', colX.name, curY + 5);
        doc.text('Branch', colX.branch, curY + 5);
        doc.text('Room / Batch', colX.room, curY + 5);
        doc.text('Present', colX.present, curY + 5);
        doc.text('Absent', colX.absent, curY + 5);
        doc.text('Signature', colX.sig, curY + 5);
        curY += 20;
      }

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(36, curY, 522, 22).fillAndStroke(rowBg, '#e2e8f0');

      doc.fillColor('#1e293b').fontSize(8).font('Helvetica');
      doc.text(String(idx + 1), colX.sr, curY + 6);
      doc.text(p.student?.rollNumber || '-', colX.roll, curY + 6);
      doc.text((p.student?.user?.name || '-').slice(0, 22), colX.name, curY + 6);
      doc.text((p.student?.branch || '-').slice(0, 10), colX.branch, curY + 6);

      const slot = p.student ? slotMap.get(p.student._id?.toString()) : null;
      const roomOrBatch = (slot?.panel?.room ? `Room ${slot.panel.room}` : '') ||
                          slot?.panel?.name ||
                          p.batch?.batchName ||
                          '-';
      doc.text(roomOrBatch.slice(0, 14), colX.room, curY + 6);

      // Present checkbox [ ]
      const isPres = p.attendance === 'present';
      const isAbs = p.attendance === 'absent';
      doc.rect(colX.present + 4, curY + 4, 12, 12).stroke('#64748b');
      if (isPres) {
        doc.fontSize(8).font('Helvetica-Bold').text('P', colX.present + 7, curY + 6);
      }

      // Absent checkbox [ ]
      doc.rect(colX.absent + 4, curY + 4, 12, 12).stroke('#64748b');
      if (isAbs) {
        doc.fontSize(8).font('Helvetica-Bold').text('A', colX.absent + 7, curY + 6);
      }

      // Signature line
      doc.moveTo(colX.sig, curY + 16).lineTo(colX.sig + 60, curY + 16).stroke('#94a3b8');

      curY += 22;
    });

    if (curY > 700) {
      doc.addPage();
      curY = 40;
    } else {
      curY += 15;
    }
    doc.rect(36, curY, 522, 45).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
    doc.text('Verified by TPO / Coordinator: ____________________', 45, curY + 12);
    doc.text('Recruiter Representative: ____________________', 300, curY + 12);
    doc.text('Date & Stamp: ____________________', 45, curY + 28);

    doc.end();
  } catch (error) {
    next(error);
  }
};

/**
 * 9. Bulk results update (Recruiter only)
 * @route PUT /api/rounds/:id/results
 * @access Private (Recruiter only)
 */
const updateBulkResults = async (req, res, next) => {
  try {
    const { resultsList } = req.body;
    if (!Array.isArray(resultsList) || resultsList.length === 0) {
      return res.status(400).json({ success: false, message: 'resultsList array is required' });
    }

    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    let updatedCount = 0;
    for (const item of resultsList) {
      const { participantId, result, score, feedback } = item;
      if (!participantId || !['pending', 'cleared', 'rejected'].includes(result)) continue;

      const pDoc = await RoundParticipant.findById(participantId);
      if (!pDoc) continue;

      // Rule: Absent students are marked rejected automatically
      const finalResult = pDoc.attendance === 'absent' ? 'rejected' : result;

      pDoc.result = finalResult;
      if (score !== undefined) pDoc.score = score !== '' && score !== null ? Number(score) : null;
      if (feedback !== undefined) pDoc.feedback = feedback.trim();
      await pDoc.save();
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Recorded evaluation results for ${updatedCount} candidates.`,
      updatedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10. Shortlist candidates in round by cutoff score (Recruiter only)
 * @route POST /api/rounds/:id/shortlist-by-cutoff
 * @access Private (Recruiter only)
 */
const shortlistParticipantsByCutoff = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) {
      return res.status(404).json({ success: false, message: 'Round not found' });
    }

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { cutoffScore, apply = false } = req.body;
    const numCutoff = Number(cutoffScore);
    if (cutoffScore === undefined || cutoffScore === null || isNaN(numCutoff) || numCutoff < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid non-negative cutoff score is required',
      });
    }

    const participants = await RoundParticipant.find({ round: round._id }).populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    });

    let clearedCount = 0;
    let rejectedCount = 0;
    const updates = [];

    for (const p of participants) {
      // Absent candidates or missing scores are rejected
      if (p.attendance === 'absent') {
        rejectedCount++;
        updates.push({ participantId: p._id, result: 'rejected', reason: 'absent' });
      } else if (p.score !== null && p.score >= numCutoff) {
        clearedCount++;
        updates.push({ participantId: p._id, result: 'cleared', score: p.score });
      } else {
        rejectedCount++;
        updates.push({ participantId: p._id, result: 'rejected', score: p.score });
      }
    }

    if (apply) {
      for (const u of updates) {
        await RoundParticipant.findByIdAndUpdate(u.participantId, {
          $set: { result: u.result },
        });
      }
      round.cutoffScore = numCutoff;
      await round.save();

      return res.status(200).json({
        success: true,
        message: `Shortlist applied: ${clearedCount} cleared (score >= ${numCutoff}), ${rejectedCount} rejected.`,
        cutoffScore: numCutoff,
        clearedCount,
        rejectedCount,
        totalEvaluated: participants.length,
      });
    }

    // Preview mode
    return res.status(200).json({
      success: true,
      preview: true,
      cutoffScore: numCutoff,
      clearedCount,
      rejectedCount,
      totalEvaluated: participants.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 11. Import results from CSV (Recruiter only)
 * @route POST /api/rounds/:id/results/import
 * @access Private (Recruiter only)
 */
const importResultsCSV = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    let rawText = req.body.csvData;
    if (!rawText && req.file) {
      rawText = req.file.buffer.toString('utf-8');
    }

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ success: false, message: 'CSV data or file is required' });
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return res.status(400).json({ success: false, message: 'CSV must contain a header and at least one row' });
    }

    // Get all participants of this round populated with student enrollmentNo
    const participants = await RoundParticipant.find({ round: round._id }).populate('student');
    const studentMap = {};
    for (const p of participants) {
      if (p.student?.enrollmentNo) {
        studentMap[p.student.enrollmentNo.trim().toUpperCase()] = p;
      }
    }

    const failedRows = [];
    let importedCount = 0;

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const enrollmentNo = cols[0]?.toUpperCase();
      const resultRaw = cols[1]?.toLowerCase();
      const scoreRaw = cols[2];
      const feedback = cols[3] || '';

      if (!enrollmentNo) {
        failedRows.push({ row: i + 1, enrollmentNo: '', reason: 'Missing enrollment number' });
        continue;
      }

      const pDoc = studentMap[enrollmentNo];
      if (!pDoc) {
        failedRows.push({
          row: i + 1,
          enrollmentNo,
          reason: `No participant with enrollment number "${enrollmentNo}" enrolled in this round`,
        });
        continue;
      }

      if (!['cleared', 'rejected', 'pending'].includes(resultRaw)) {
        failedRows.push({
          row: i + 1,
          enrollmentNo,
          reason: `Invalid result status "${resultRaw}". Must be 'cleared', 'rejected', or 'pending'.`,
        });
        continue;
      }

      // Rule: Absent students are marked rejected automatically
      const finalResult = pDoc.attendance === 'absent' ? 'rejected' : resultRaw;

      pDoc.result = finalResult;
      if (scoreRaw !== undefined && scoreRaw !== '') {
        const parsedScore = Number(scoreRaw);
        if (!isNaN(parsedScore)) pDoc.score = parsedScore;
      }
      pDoc.feedback = feedback;
      await pDoc.save();
      importedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Import processed: ${importedCount} successfully updated, ${failedRows.length} failed.`,
      importedCount,
      failedCount: failedRows.length,
      failedRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 12. Publish round results and advance cleared candidates to Round N+1
 * @route POST /api/rounds/:id/publish-results
 * @access Private (Recruiter only)
 */
const publishRoundResults = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate('drive');
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyOwningRecruiterAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const result = await advanceClearedStudentsToNextRound(round._id);

    res.status(200).json({
      success: true,
      message: `Results published for ${round.name}! ${result.clearedCount} candidate(s) cleared and moved to ${result.nextRound ? result.nextRound.name : 'final selection stage'}.`,
      round: result.currentRound,
      nextRound: result.nextRound,
      clearedCount: result.clearedCount,
    });
  } catch (error) {
    if (error.message.includes('pending') || error.message.includes('Cannot publish')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * 11. TPO Daily Clash Report
 * @route GET /api/drives/clashes
 * @access Private (TPO / Admin only)
 */
const getDailyClashes = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter (YYYY-MM-DD) is required' });
    }

    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    if (!collegeId && req.user.role !== 'superadmin') {
      return res.status(400).json({ success: false, message: 'No college profile linked to your account' });
    }

    const report = await generateDailyClashReport(collegeId, date);

    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 12. Extend bulk offers (Recruiter only)
 * @route POST /api/drives/:id/offers
 * @access Private (Recruiter only)
 */
const extendBulkOffers = async (req, res, next) => {
  try {
    const drive = await Drive.findById(req.params.id).populate('company');
    if (!drive) return res.status(404).json({ success: false, message: 'Drive not found' });

    if (!verifyDriveAccess(drive, req.user) || req.user.role !== 'recruiter') {
      return res.status(403).json({ success: false, message: 'Only company recruiter can extend offers' });
    }

    const { offers } = req.body;
    if (!Array.isArray(offers) || offers.length === 0) {
      return res.status(400).json({ success: false, message: 'offers array is required' });
    }

    const createdOffers = [];

    for (const item of offers) {
      const { studentId, packageLpa, joiningDate, expiryDate, role, designation } = item;
      if (!studentId || !expiryDate) continue;

      const application = await Application.findOne({ drive: drive._id, student: studentId });
      if (!application) continue;

      // Check if offer already extended
      let offerDoc = await Offer.findOne({ drive: drive._id, student: studentId });
      if (!offerDoc) {
        offerDoc = await Offer.create({
          drive: drive._id,
          company: drive.company._id || drive.company,
          college: drive.college,
          student: studentId,
          application: application._id,
          packageLpa: packageLpa ? Number(packageLpa) : drive.packageLpa,
          joiningDate: joiningDate ? parseISTDateTime(joiningDate) : null,
          expiryDate: parseISTDateTime(expiryDate),
          role: role || drive.role,
          designation: designation || role || drive.role,
          status: 'offered',
        });
      } else {
        offerDoc.packageLpa = packageLpa ? Number(packageLpa) : drive.packageLpa;
        offerDoc.expiryDate = parseISTDateTime(expiryDate);
        if (joiningDate) offerDoc.joiningDate = parseISTDateTime(joiningDate);
        offerDoc.status = 'offered';
        await offerDoc.save();
      }

      createdOffers.push(offerDoc);

      // Notify student with in-app notification & official offer email
      const student = await Student.findById(studentId).populate('user');
      if (student?.user?._id) {
        const pkgText = typeof offerDoc.packageLpa === 'number' ? ` (${offerDoc.packageLpa} LPA)` : '';
        notifyUser(student.user._id, 'offer_received', {
          collegeId: drive.college,
          companyName: drive.company?.name || 'Recruiter',
          role: offerDoc.role,
          packageLpa: offerDoc.packageLpa,
          deadline: offerDoc.expiryDate,
          message: `Congratulations! ${drive.company?.name || 'Recruiter'} has extended you an employment offer for ${offerDoc.role}${pkgText}. Accept before ${new Date(offerDoc.expiryDate).toLocaleDateString()}.`,
          link: '/student/dashboard',
        }).catch((err) => console.error('Failed to notify student of offer:', err));
      }
    }

    res.status(201).json({
      success: true,
      message: `Successfully extended ${createdOffers.length} employment offer(s).`,
      offers: createdOffers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 13. Student accepts offer
 * @route PUT /api/offers/:id/accept
 * @access Private (Student only)
 */
const acceptOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('drive')
      .populate('company')
      .populate('student');

    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

    // Verify ownership
    const studentProfile = await Student.findOne({ user: req.user._id });
    if (!studentProfile || offer.student._id.toString() !== studentProfile._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to respond to this offer' });
    }

    if (offer.status === 'accepted') {
      return res.status(400).json({ success: false, message: 'Offer is already accepted' });
    }

    if (new Date() > parseISTDateTime(offer.expiryDate)) {
      offer.status = 'expired';
      await offer.save();
      return res.status(400).json({ success: false, message: 'Offer has expired' });
    }

    // 1. Mark offer accepted
    offer.status = 'accepted';
    offer.respondedAt = new Date();

    // 2. Create Placement record (Placement record is created ONLY on accept)
    let placement = await Placement.findOne({
      student: offer.student._id,
      drive: offer.drive._id,
    });

    if (!placement) {
      placement = await Placement.create({
        student: offer.student._id,
        drive: offer.drive._id,
        company: offer.company._id,
        packageLpa: offer.packageLpa,
        offerDate: new Date(),
      });
    }

    offer.placement = placement._id;
    await offer.save();

    // 3. Update application status
    if (offer.application) {
      await Application.findByIdAndUpdate(offer.application, { $set: { status: 'selected' } });
    }

    // 4. Notify recruiter & TPO
    const companyRecruiters = await User.find({ company: offer.company._id, role: 'recruiter' });
    const acceptedPkgText = typeof offer.packageLpa === 'number' ? ` (${offer.packageLpa} LPA)` : '';
    for (const r of companyRecruiters) {
      createNotification({
        user: r._id,
        type: 'general',
        message: `${req.user.name} has ACCEPTED your placement offer for ${offer.role}${acceptedPkgText}!`,
        link: '/recruiter/dashboard',
      }).catch((err) => console.error('Failed to notify recruiter of offer acceptance:', err));
    }

    res.status(200).json({
      success: true,
      message: `Offer accepted! Congratulations on being placed with ${offer.company.name}!`,
      offer,
      placement,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 14. Student declines offer
 * @route PUT /api/offers/:id/decline
 * @access Private (Student only)
 */
const declineOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('company')
      .populate('student');

    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

    const studentProfile = await Student.findOne({ user: req.user._id });
    if (!studentProfile || offer.student._id.toString() !== studentProfile._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to respond to this offer' });
    }

    offer.status = 'declined';
    offer.respondedAt = new Date();
    await offer.save();

    // If placement record existed, remove it
    if (offer.placement) {
      await Placement.findByIdAndDelete(offer.placement);
      offer.placement = null;
      await offer.save();
    }

    // Notify recruiter
    const companyRecruiters = await User.find({ company: offer.company._id, role: 'recruiter' });
    for (const r of companyRecruiters) {
      createNotification({
        user: r._id,
        type: 'general',
        message: `${req.user.name} has declined the placement offer for ${offer.role}.`,
        link: '/recruiter/dashboard',
      }).catch((err) => console.error('Failed to notify recruiter:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Offer declined.',
      offer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 15. Student gets timeline for a specific application
 * @route GET /api/applications/:id/timeline
 * @access Private (Student, TPO, Recruiter)
 */
const getApplicationTimeline = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate({
        path: 'drive',
        populate: ['company', 'college'],
      })
      .populate({
        path: 'student',
        populate: { path: 'user', select: 'name email' },
      });

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const driveId = application.drive._id;
    const studentId = application.student._id;

    // Fetch all rounds for drive
    const rounds = await Round.find({ drive: driveId }).sort({ order: 1 });

    // Fetch participant records for this student in each round
    const roundTimeline = await Promise.all(
      rounds.map(async (round) => {
        const participant = await RoundParticipant.findOne({
          round: round._id,
          student: studentId,
        }).populate('batch');

        return {
          roundId: round._id,
          order: round.order,
          name: round.name,
          type: round.type,
          date: round.date,
          mode: round.mode,
          instructions: round.instructions,
          status: round.status,
          isEnrolled: !!participant,
          batch: participant?.batch || null,
          attendance: participant?.attendance || 'pending',
          result: participant?.result || 'pending',
          score: participant?.score ?? null,
          feedback: participant?.feedback || '',
        };
      })
    );

    // Fetch any offer extended
    const offer = await Offer.findOne({ drive: driveId, student: studentId });

    res.status(200).json({
      success: true,
      application,
      rounds: roundTimeline,
      offer: offer || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 16. Student gets upcoming round batches
 * @route GET /api/students/upcoming-rounds
 * @access Private (Student only)
 */
const getStudentUpcomingRounds = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const participants = await RoundParticipant.find({
      student: student._id,
      batch: { $ne: null },
    })
      .populate({
        path: 'round',
        populate: {
          path: 'drive',
          populate: 'company',
        },
      })
      .populate('batch');

    const upcoming = participants
      .filter((p) => p.round && p.batch && p.batch.startTime && new Date(p.batch.endTime) >= new Date())
      .sort((a, b) => new Date(a.batch.startTime) - new Date(b.batch.startTime))
      .map((p) => ({
        participantId: p._id,
        roundId: p.round._id,
        roundName: p.round.name,
        roundType: p.round.type,
        instructions: p.round.instructions,
        driveRole: p.round.drive?.role,
        companyName: p.round.drive?.company?.name,
        companyLogo: p.round.drive?.company?.logoUrl,
        batchName: p.batch.batchName,
        startTime: p.batch.startTime,
        endTime: p.batch.endTime,
        venueOrLink: p.batch.venueOrLink,
        mode: p.batch.mode,
        attendance: p.attendance,
        round: {
          _id: p.round._id,
          name: p.round.name,
          type: p.round.type,
          instructions: p.round.instructions,
        },
        drive: {
          role: p.round.drive?.role,
          company: p.round.drive?.company,
        },
        batch: {
          _id: p.batch._id,
          batchName: p.batch.batchName,
          startTime: p.batch.startTime,
          endTime: p.batch.endTime,
          venueOrLink: p.batch.venueOrLink,
          mode: p.batch.mode,
        },
      }));

    res.status(200).json({
      success: true,
      upcoming,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 17. Student gets all received offers
 * @route GET /api/offers/my
 * @access Private (Student only)
 */
const getMyOffers = async (req, res, next) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const offers = await Offer.find({ student: student._id })
      .populate('company', 'name logoUrl industry')
      .populate('drive', 'role packageLpa')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      offers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Drive access for Round Announcement (TPO of drive college or Recruiter of drive company)
 */
const verifyRoundAnnouncementAccess = (drive, user) => {
  if (user.role === 'superadmin') return { allowed: true };

  if (user.role === 'recruiter') {
    const userCompanyId = (user.company?._id || user.company)?.toString();
    const driveCompanyId = (drive.company?._id || drive.company)?.toString();
    if (!userCompanyId || !driveCompanyId || userCompanyId !== driveCompanyId) {
      return {
        allowed: false,
        status: 403,
        message: 'Not authorized: Only recruiters from the hiring company can announce to this round',
      };
    }
    return { allowed: true };
  }

  if (user.role === 'tpo' || user.role === 'admin') {
    const userCollegeId = (user.college?._id || user.college)?.toString();
    const driveCollegeId = (drive.college?._id || drive.college)?.toString();
    if (!userCollegeId || !driveCollegeId || userCollegeId !== driveCollegeId) {
      return {
        allowed: false,
        status: 403,
        message: "Not authorized: You do not have access to this drive's college",
      };
    }
    return { allowed: true };
  }

  return { allowed: false, status: 403, message: 'Not authorized' };
};

/**
 * Preview announcement details and recipient count for a round
 * @route GET /api/rounds/:id/announcements/preview
 * @access Private (Recruiter, TPO)
 */
const getRoundAnnouncementPreview = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate({
      path: 'drive',
      populate: { path: 'company college' },
    });
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyRoundAnnouncementAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const recipientCount = await RoundParticipant.countDocuments({ round: round._id });

    res.status(200).json({
      success: true,
      recipientCount,
      participantCount: recipientCount,
      roundName: round.name,
      roundOrder: round.order,
      role: round.drive?.role,
      companyName: round.drive?.company?.name,
      collegeName: round.drive?.college?.name,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send an official announcement to all participants of a round
 * @route POST /api/rounds/:id/announcements
 * @access Private (Recruiter, TPO)
 */
const sendRoundAnnouncement = async (req, res, next) => {
  try {
    const round = await Round.findById(req.params.id).populate({
      path: 'drive',
      populate: { path: 'company college' },
    });
    if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

    const authCheck = verifyRoundAnnouncementAccess(round.drive, req.user);
    if (!authCheck.allowed) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { subject, message } = req.body;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Announcement message body is required' });
    }

    const participants = await RoundParticipant.find({ round: round._id }).populate({
      path: 'student',
      populate: { path: 'user' },
    });

    if (participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No candidates currently enrolled in this round to receive the announcement.',
      });
    }

    const senderRole = req.user.role === 'recruiter' ? 'Campus Recruiter' : 'Placement Cell (TPO)';
    let queuedCount = 0;

    for (const p of participants) {
      if (p.student?.user?._id) {
        await notifyUser(p.student.user._id, 'announcement', {
          collegeId: round.drive?.college?._id || round.drive?.college,
          companyId: round.drive?.company?._id || round.drive?.company,
          companyName: round.drive?.company?.name || 'Recruiter',
          collegeName: round.drive?.college?.name || 'Placement Cell',
          senderName: req.user.name,
          senderRole,
          driveRole: round.drive?.role,
          roundName: round.name,
          subject: subject.trim(),
          message: message.trim(),
          link: '/student/applications',
        });
        queuedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Announcement successfully dispatched to ${queuedCount} candidate(s).`,
      count: queuedCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  freezeDriveAndInitializePipeline,
  removeApplicantBeforeFreeze,
  getDriveProgress,
  getRoundDetails,
  updateRoundSettings,
  exportRoundAttendancePdf,
  autoSplitRoundBatches,
  moveParticipantBatch,
  updateBulkAttendance,
  updateBulkResults,
  shortlistParticipantsByCutoff,
  importResultsCSV,
  publishRoundResults,
  getDailyClashes,
  extendBulkOffers,
  acceptOffer,
  declineOffer,
  getApplicationTimeline,
  getStudentUpcomingRounds,
  getMyOffers,
  getRoundAnnouncementPreview,
  sendRoundAnnouncement,
};
