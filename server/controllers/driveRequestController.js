const mongoose = require('mongoose');
const { DriveRequest, JobRequirement, Company, College, Drive } = require('../models');
const {
  notifyNewDriveRequest,
  notifyDriveRequestResponse,
  notifyDrivePublished,
} = require('../utils/notificationService');
const { getEndOfDayIST } = require('../utils/pipelineService');
const { parseISTDateTime } = require('../utils/dateTime');

/**
 * Helper to format status timeline with human-readable labels
 */
const formatTimeline = (timeline) => {
  const statusLabels = {
    pending: 'Request Sent',
    accepted: 'Drive Accepted',
    rejected: 'Drive Rejected',
    reschedule_proposed: 'Reschedule Proposed',
    scheduled: 'Drive Confirmed & Scheduled',
    completed: 'Drive Completed',
    cancelled: 'Request Cancelled',
  };

  return (timeline || []).map((t) => ({
    status: t.status,
    label: statusLabels[t.status] || t.status,
    updatedBy: t.updatedBy,
    updatedByRole: t.updatedByRole,
    updatedByName: t.updatedByName || (t.updatedByRole === 'recruiter' ? 'Recruiter' : 'TPO Officer'),
    note: t.note,
    date: t.date,
  }));
};

/**
 * @desc    Create and send DriveRequest(s) to one or many colleges
 * @route   POST /api/drive-requests
 * @access  Private (Recruiter only)
 */
const createDriveRequests = async (req, res, next) => {
  try {
    const {
      jobRequirementId,
      collegeIds,
      collegeId,
      proposedDates,
      mode = 'on-campus',
      initialMessage,
    } = req.body;

    // 1. Recruiter company validation
    const companyId = req.user.company?._id || req.user.company;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'No company profile linked to your recruiter account',
      });
    }

    // 2. JobRequirement validation
    if (!jobRequirementId || !mongoose.Types.ObjectId.isValid(jobRequirementId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Job Requirement ID is required',
      });
    }

    const jobReq = await JobRequirement.findById(jobRequirementId);
    if (!jobReq) {
      return res.status(404).json({
        success: false,
        message: 'Referenced Job Requirement not found',
      });
    }

    // Ownership check
    if (jobReq.company.toString() !== companyId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only send drive requests for your own company requirements',
      });
    }

    // Must be published
    if (jobReq.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: `Cannot send drive request for a ${jobReq.status} requirement. Please publish it first.`,
      });
    }

    // 3. College(s) validation
    let targetColleges = [];
    if (Array.isArray(collegeIds) && collegeIds.length > 0) {
      targetColleges = collegeIds;
    } else if (collegeId) {
      targetColleges = [collegeId];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one target college (collegeIds)',
      });
    }

    // Verify all college IDs are valid ObjectIds
    for (const cId of targetColleges) {
      if (!mongoose.Types.ObjectId.isValid(cId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid college ID format: ${cId}`,
        });
      }
    }

    const collegesInDb = await College.find({ _id: { $in: targetColleges } });
    if (collegesInDb.length !== targetColleges.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more selected colleges do not exist',
      });
    }

    // 4. Proposed dates validation
    if (!proposedDates || !Array.isArray(proposedDates) || proposedDates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one proposed date for the drive',
      });
    }

    const parsedDates = proposedDates
      .map((d) => parseISTDateTime(d))
      .filter((d) => !isNaN(d.getTime()));

    if (parsedDates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Proposed dates must be valid calendar dates',
      });
    }

    // 5. Block duplicate requests for the same jobRequirement + college
    const existingRequests = await DriveRequest.find({
      jobRequirement: jobReq._id,
      college: { $in: targetColleges },
      status: { $nin: ['cancelled'] }, // Active or pending requests
    }).populate('college', 'name');

    if (existingRequests.length > 0) {
      const duplicateDetails = existingRequests
        .map((r) => `${r.college?.name || r.college} (${r.status})`)
        .join(', ');

      return res.status(400).json({
        success: false,
        message: `A drive request for "${jobReq.title}" already exists for: ${duplicateDetails}. Duplicate requests are blocked.`,
        duplicates: existingRequests.map((r) => ({
          requestId: r._id,
          collegeId: r.college?._id || r.college,
          collegeName: r.college?.name,
          status: r.status,
        })),
      });
    }

    // 6. Create DriveRequest document(s)
    const createdRequests = [];

    for (const col of collegesInDb) {
      const initialTimeline = [
        {
          status: 'pending',
          updatedBy: req.user._id,
          updatedByRole: 'recruiter',
          updatedByName: req.user.name,
          note: `Drive request initiated for ${parsedDates.length} proposed date(s)`,
          date: new Date(),
        },
      ];

      const initialMessages = [];
      if (initialMessage && initialMessage.trim()) {
        initialMessages.push({
          sender: req.user._id,
          senderRole: 'recruiter',
          senderName: req.user.name,
          text: initialMessage.trim(),
          date: new Date(),
        });
      }

      const driveRequest = await DriveRequest.create({
        jobRequirement: jobReq._id,
        company: companyId,
        college: col._id,
        proposedDates: parsedDates,
        mode: ['on-campus', 'virtual'].includes(mode) ? mode : 'on-campus',
        status: 'pending',
        timeline: initialTimeline,
        messages: initialMessages,
      });

      createdRequests.push(driveRequest);
    }

    // Populate for response
    const populated = await DriveRequest.find({
      _id: { $in: createdRequests.map((r) => r._id) },
    })
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone');

    const formattedRequests = populated.map((r) => {
      const doc = r.toObject();
      doc.statusTimeline = formatTimeline(doc.timeline);
      return doc;
    });

    // Notify TPOs of target colleges
    const companyDoc = await Company.findById(companyId);
    await Promise.all(
      collegesInDb.map((col) =>
        notifyNewDriveRequest({
          collegeId: col._id,
          companyName: companyDoc?.name || 'Corporate Partner',
          jobTitle: jobReq.title,
        })
      )
    );

    res.status(201).json({
      success: true,
      message: `Drive request successfully sent to ${createdRequests.length} college(s)`,
      count: createdRequests.length,
      requests: formattedRequests,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get drive requests (scoped by role: Recruiter sees own company; TPO sees own college)
 * @route   GET /api/drive-requests
 * @access  Private (Recruiter, TPO, Admin, Superadmin)
 */
const getDriveRequests = async (req, res, next) => {
  try {
    const { status, mode, college, company, jobRequirement } = req.query;
    const filter = {};

    // Role-based scoping
    if (req.user.role === 'recruiter') {
      const companyId = req.user.company?._id || req.user.company;
      if (!companyId) {
        return res.status(200).json({ success: true, count: 0, requests: [] });
      }
      filter.company = companyId;
    } else if (req.user.role === 'tpo' || req.user.role === 'admin') {
      const collegeId = req.user.college?._id || req.user.college;
      if (!collegeId) {
        return res.status(200).json({ success: true, count: 0, requests: [] });
      }
      filter.college = collegeId;
    }

    // Optional query filters
    if (status) {
      filter.status = status;
    }
    if (mode) {
      filter.mode = mode;
    }
    if (college && mongoose.Types.ObjectId.isValid(college)) {
      filter.college = college;
    }
    if (company && mongoose.Types.ObjectId.isValid(company)) {
      filter.company = company;
    }
    if (jobRequirement && mongoose.Types.ObjectId.isValid(jobRequirement)) {
      filter.jobRequirement = jobRequirement;
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await DriveRequest.countDocuments(filter);
    const requests = await DriveRequest.find(filter)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('drive', 'role driveDate status')
      .populate('messages.sender', 'name role email')
      .populate('timeline.updatedBy', 'name role')
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedRequests = requests.map((r) => {
      const doc = r.toObject();
      doc.statusTimeline = formatTimeline(doc.timeline);
      return doc;
    });

    res.status(200).json({
      success: true,
      data: formattedRequests,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      count: formattedRequests.length,
      requests: formattedRequests,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single drive request by ID with full timeline and messages
 * @route   GET /api/drive-requests/:id
 * @access  Private (Recruiter, TPO, Superadmin)
 */
const getDriveRequestById = async (req, res, next) => {
  try {
    const request = await DriveRequest.findById(req.params.id)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('drive', 'role driveDate status')
      .populate('messages.sender', 'name role email')
      .populate('timeline.updatedBy', 'name role');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // Enforce authorization
    if (req.user.role === 'recruiter') {
      const companyId = req.user.company?._id || req.user.company;
      if (!companyId || request.company._id.toString() !== companyId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this company drive request',
        });
      }
    } else if (req.user.role === 'tpo' || req.user.role === 'admin') {
      const collegeId = req.user.college?._id || req.user.college;
      if (!collegeId || request.college._id.toString() !== collegeId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view drive request for another college',
        });
      }
    }

    const doc = request.toObject();
    doc.statusTimeline = formatTimeline(doc.timeline);

    res.status(200).json({
      success: true,
      request: doc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Recruiter cancels a drive request
 * @route   PATCH /api/drive-requests/:id/cancel
 * @access  Private (Recruiter only)
 */
const cancelDriveRequest = async (req, res, next) => {
  try {
    const request = await DriveRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // Company ownership check
    const companyId = req.user.company?._id || req.user.company;
    if (
      req.user.role !== 'superadmin' &&
      (!companyId || request.company.toString() !== companyId.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this drive request',
      });
    }

    if (request.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a completed placement drive',
      });
    }

    if (request.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Drive request is already cancelled',
      });
    }

    const cancelReason = req.body.reason || 'Cancelled by recruiter';

    request.status = 'cancelled';
    request.cancelledReason = cancelReason;
    request.timeline.push({
      status: 'cancelled',
      updatedBy: req.user._id,
      updatedByRole: req.user.role,
      updatedByName: req.user.name,
      note: cancelReason,
      date: new Date(),
    });

    await request.save();

    const updated = await DriveRequest.findById(request._id)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone');

    const doc = updated.toObject();
    doc.statusTimeline = formatTimeline(doc.timeline);

    res.status(200).json({
      success: true,
      message: 'Drive request cancelled successfully',
      request: doc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    TPO responds to an incoming drive request (accept / reject / propose reschedule)
 * @route   PUT /api/drive-requests/:id/respond
 * @access  Private (TPO / Admin only)
 */
const respondToDriveRequest = async (req, res, next) => {
  try {
    const { action, selectedDate, rejectionReason, proposedDates, note, message } = req.body;

    const request = await DriveRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // College ownership check
    const collegeId = req.user.college?._id || req.user.college;
    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || request.college.toString() !== collegeId.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to respond to drive request for another college',
      });
    }

    if (['completed', 'cancelled'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot respond to a ${request.status} drive request`,
      });
    }

    if (!['accept', 'reject', 'propose_reschedule'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be 'accept', 'reject', or 'propose_reschedule'",
      });
    }

    // Handle ACCEPT
    if (action === 'accept') {
      if (!selectedDate) {
        return res.status(400).json({
          success: false,
          message: 'Please choose or provide a confirmed drive date',
        });
      }

      const confirmed = parseISTDateTime(selectedDate);
      if (isNaN(confirmed.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format provided for confirmedDate',
        });
      }

      request.status = 'accepted';
      request.confirmedDate = confirmed;
      request.timeline.push({
        status: 'accepted',
        updatedBy: req.user._id,
        updatedByRole: 'tpo',
        updatedByName: req.user.name,
        note: note || `Drive accepted for confirmed date: ${confirmed.toLocaleDateString()}`,
        date: new Date(),
      });

      // Synchronize with college Drive system
      const jobReq = await JobRequirement.findById(request.jobRequirement);
      if (jobReq && !request.drive) {
        // Last date to apply is 24 hours prior to drive date by default
        const applyDeadline = new Date(confirmed.getTime() - 24 * 60 * 60 * 1000);
        const deadlineDate = applyDeadline > new Date() ? applyDeadline : new Date(confirmed);
        const driveDoc = await Drive.create({
          company: request.company,
          college: request.college,
          jobRequirement: jobReq._id,
          driveRequest: request._id,
          role: jobReq.title,
          packageLpa: jobReq.packageLpa,
          location: jobReq.location || (request.mode === 'virtual' ? 'Virtual / Remote' : 'Campus Placement'),
          venueOrMeetingLink: request.mode === 'virtual' ? 'Virtual Meeting' : 'Campus Placement Cell',
          mode: request.mode || 'on-campus',
          minCgpa: jobReq.minCgpa || 0,
          maxBacklogs: jobReq.maxBacklogs || 0,
          allowedBranches: jobReq.allowedBranches || ['CSE', 'IT'],
          lastDateToApply: getEndOfDayIST(deadlineDate),
          driveDate: confirmed,
          status: 'open',
          applicationsClosed: false,
          listFrozenAt: null,
        });
        request.drive = driveDoc._id;
      }
    }

    // Handle REJECT
    else if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({
          success: false,
          message: 'A rejection reason is required when declining a drive request',
        });
      }

      request.status = 'rejected';
      request.rejectionReason = rejectionReason.trim();
      request.timeline.push({
        status: 'rejected',
        updatedBy: req.user._id,
        updatedByRole: 'tpo',
        updatedByName: req.user.name,
        note: `Drive request rejected: ${rejectionReason.trim()}`,
        date: new Date(),
      });
    }

    // Handle PROPOSE RESCHEDULE
    else if (action === 'propose_reschedule') {
      if (!proposedDates || !Array.isArray(proposedDates) || proposedDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide at least one alternative date when proposing a reschedule',
        });
      }

      const parsedTpoDates = proposedDates
        .map((d) => parseISTDateTime(d))
        .filter((d) => !isNaN(d.getTime()));

      if (parsedTpoDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Alternative dates must be valid calendar dates',
        });
      }

      request.status = 'reschedule_proposed';
      request.tpoProposedDates = parsedTpoDates;
      request.timeline.push({
        status: 'reschedule_proposed',
        updatedBy: req.user._id,
        updatedByRole: 'tpo',
        updatedByName: req.user.name,
        note:
          note ||
          `TPO proposed ${parsedTpoDates.length} alternative date(s): ${parsedTpoDates
            .map((d) => d.toLocaleDateString())
            .join(', ')}`,
        date: new Date(),
      });
    }

    // Optional direct message append
    if (message && message.trim()) {
      request.messages.push({
        sender: req.user._id,
        senderRole: 'tpo',
        senderName: req.user.name,
        text: message.trim(),
        date: new Date(),
      });
    }

    await request.save();

    const updated = await DriveRequest.findById(request._id)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('drive', 'role driveDate status')
      .populate('messages.sender', 'name role email');

    const doc = updated.toObject();
    doc.statusTimeline = formatTimeline(doc.timeline);

    // Notify Recruiter of TPO response
    await notifyDriveRequestResponse({
      companyId: request.company,
      collegeName: updated.college?.name || req.user.college?.name,
      jobTitle: updated.jobRequirement?.title,
      action,
      statusNote: note || rejectionReason,
    });

    res.status(200).json({
      success: true,
      message: `Drive request response saved (${action})`,
      request: doc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Recruiter accepts a TPO's proposed reschedule date
 * @route   PATCH /api/drive-requests/:id/accept-date
 * @access  Private (Recruiter only)
 */
const acceptTpoProposedDate = async (req, res, next) => {
  try {
    const { selectedDate, note, message } = req.body;

    const request = await DriveRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // Company ownership check
    const companyId = req.user.company?._id || req.user.company;
    if (
      req.user.role !== 'superadmin' &&
      (!companyId || request.company.toString() !== companyId.toString())
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this drive request',
      });
    }

    if (request.status !== 'reschedule_proposed' && (!request.tpoProposedDates || request.tpoProposedDates.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'No reschedule was proposed by the TPO for this request',
      });
    }

    if (!selectedDate) {
      return res.status(400).json({
        success: false,
        message: 'Please choose one of the proposed dates',
      });
    }

    const confirmed = parseISTDateTime(selectedDate);
    if (isNaN(confirmed.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format for selectedDate',
      });
    }

    request.status = 'scheduled';
    request.confirmedDate = confirmed;
    request.timeline.push({
      status: 'scheduled',
      updatedBy: req.user._id,
      updatedByRole: 'recruiter',
      updatedByName: req.user.name,
      note: note || `Recruiter accepted TPO proposed date: ${confirmed.toLocaleDateString()}`,
      date: new Date(),
    });

    if (message && message.trim()) {
      request.messages.push({
        sender: req.user._id,
        senderRole: 'recruiter',
        senderName: req.user.name,
        text: message.trim(),
        date: new Date(),
      });
    }

    // Create / link Drive if not yet linked
    const jobReq = await JobRequirement.findById(request.jobRequirement);
    if (jobReq && !request.drive) {
      const applyDeadline = new Date(confirmed.getTime() - 24 * 60 * 60 * 1000);
      const driveDoc = await Drive.create({
        company: request.company,
        college: request.college,
        jobRequirement: jobReq._id,
        driveRequest: request._id,
        role: jobReq.title,
        packageLpa: jobReq.packageLpa,
        location: jobReq.location || (request.mode === 'virtual' ? 'Virtual / Remote' : 'Campus Placement'),
        venueOrMeetingLink: request.mode === 'virtual' ? 'Virtual Meeting' : 'Campus Placement Cell',
        mode: request.mode || 'on-campus',
        minCgpa: jobReq.minCgpa || 0,
        maxBacklogs: jobReq.maxBacklogs || 0,
        allowedBranches: jobReq.allowedBranches || ['CSE', 'IT'],
        lastDateToApply: applyDeadline > new Date() ? applyDeadline : new Date(confirmed),
        driveDate: confirmed,
        status: 'open',
      });
      request.drive = driveDoc._id;
    }

    await request.save();

    const updated = await DriveRequest.findById(request._id)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('drive', 'role driveDate status')
      .populate('messages.sender', 'name role email');

    const doc = updated.toObject();
    doc.statusTimeline = formatTimeline(doc.timeline);

    // Notify TPOs that recruiter confirmed the proposed date
    const tpoOfficers = await require('../models').User.find({
      college: request.college,
      role: { $in: ['tpo', 'admin'] },
      isApproved: true,
    }).select('_id');

    for (const tpo of tpoOfficers) {
      require('../utils/notificationService').createNotification({
        user: tpo._id,
        type: 'request_response',
        message: `${updated.company?.name || 'Recruiter'} confirmed and accepted your proposed drive date for "${updated.jobRequirement?.title}" (${confirmed.toLocaleDateString()})`,
        link: '/admin/drive-requests',
      }).catch((err) => console.error('Failed to notify TPO:', err));
    }

    res.status(200).json({
      success: true,
      message: `Drive officially confirmed and scheduled for ${confirmed.toLocaleDateString()}`,
      request: doc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add a message to the DriveRequest discussion thread
 * @route   POST /api/drive-requests/:id/messages
 * @access  Private (Recruiter, TPO, Superadmin)
 */
const addMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required',
      });
    }

    const request = await DriveRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // Authorization check: must be the recruiter company or the college TPO
    const userCompanyId = (req.user.company?._id || req.user.company)?.toString();
    const userCollegeId = (req.user.college?._id || req.user.college)?.toString();

    const isCompanyRecruiter = userCompanyId && request.company.toString() === userCompanyId;
    const isCollegeTpo = userCollegeId && request.college.toString() === userCollegeId;
    const isSuperadmin = req.user.role === 'superadmin';

    if (!isCompanyRecruiter && !isCollegeTpo && !isSuperadmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages on this drive request',
      });
    }

    const senderRole = req.user.role === 'recruiter' ? 'recruiter' : 'tpo';

    const newMessage = {
      sender: req.user._id,
      senderRole,
      senderName: req.user.name,
      text: text.trim(),
      date: new Date(),
    };

    request.messages.push(newMessage);
    await request.save();

    res.status(201).json({
      success: true,
      message: 'Message posted successfully',
      newMessage,
      messages: request.messages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    TPO finalizes and publishes an accepted DriveRequest into a live campus Drive
 * @route   PUT /api/drive-requests/:id/finalize
 * @access  Private (TPO / Admin only)
 */
const finalizeAndPublishDrive = async (req, res, next) => {
  try {
    const {
      finalDriveDate,
      venueOrMeetingLink,
      lastDateToApply,
      minCgpa,
      maxBacklogs,
      allowedBranches,
      note,
      message,
    } = req.body;

    const request = await DriveRequest.findById(req.params.id)
      .populate('jobRequirement')
      .populate('company');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Drive request not found',
      });
    }

    // College ownership check
    const collegeId = (req.user.college?._id || req.user.college)?.toString();
    if (
      req.user.role !== 'superadmin' &&
      (!collegeId || request.college.toString() !== collegeId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to finalize drive request for another college',
      });
    }

    if (['rejected', 'cancelled'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot finalize a ${request.status} drive request`,
      });
    }

    const jobReq = request.jobRequirement;
    if (!jobReq) {
      return res.status(400).json({
        success: false,
        message: 'Referenced Job Requirement not found',
      });
    }

    // 1. Validate finalDriveDate
    if (!finalDriveDate) {
      return res.status(400).json({
        success: false,
        message: 'Final drive date is required',
      });
    }
    const driveDateObj = parseISTDateTime(finalDriveDate);
    if (isNaN(driveDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid final drive date format',
      });
    }

    // 2. Validate venueOrMeetingLink
    if (!venueOrMeetingLink || !venueOrMeetingLink.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Venue or meeting link is required to finalize drive',
      });
    }

    // 3. Validate lastDateToApply
    if (!lastDateToApply) {
      return res.status(400).json({
        success: false,
        message: 'Last date to apply is required',
      });
    }
    const lastDateObj = parseISTDateTime(lastDateToApply);
    if (isNaN(lastDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid last date to apply format',
      });
    }

    if (lastDateObj.getTime() > driveDateObj.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'Last date to apply cannot be after the final drive date',
      });
    }

    // 4. Stricter eligibility checks (cannot be weaker than company requirement)
    // CGPA: cannot be lower than jobReq.minCgpa
    let finalMinCgpa = jobReq.minCgpa || 0;
    if (minCgpa !== undefined && minCgpa !== null && minCgpa !== '') {
      const parsedCgpa = Number(minCgpa);
      if (isNaN(parsedCgpa) || parsedCgpa < 0 || parsedCgpa > 10) {
        return res.status(400).json({
          success: false,
          message: 'Minimum CGPA must be a valid number between 0 and 10',
        });
      }
      if (parsedCgpa < (jobReq.minCgpa || 0)) {
        return res.status(400).json({
          success: false,
          message: `Stricter eligibility error: College cutoff CGPA (${parsedCgpa}) cannot be lower than company requirement (${jobReq.minCgpa || 0})`,
        });
      }
      finalMinCgpa = parsedCgpa;
    }

    // Backlogs: cannot be higher than jobReq.maxBacklogs
    let finalMaxBacklogs = jobReq.maxBacklogs || 0;
    if (maxBacklogs !== undefined && maxBacklogs !== null && maxBacklogs !== '') {
      const parsedBacklogs = Number(maxBacklogs);
      if (isNaN(parsedBacklogs) || parsedBacklogs < 0) {
        return res.status(400).json({
          success: false,
          message: 'Maximum backlogs must be a non-negative number',
        });
      }
      if (parsedBacklogs > (jobReq.maxBacklogs || 0)) {
        return res.status(400).json({
          success: false,
          message: `Stricter eligibility error: College allowed backlogs (${parsedBacklogs}) cannot be higher than company limit (${jobReq.maxBacklogs || 0})`,
        });
      }
      finalMaxBacklogs = parsedBacklogs;
    }

    // Branches: must be subset of jobReq.allowedBranches
    let finalBranches = jobReq.allowedBranches || ['CSE', 'IT'];
    if (allowedBranches && Array.isArray(allowedBranches) && allowedBranches.length > 0) {
      const companyBranchesUpper = (jobReq.allowedBranches || []).map((b) => b.toUpperCase());
      const selectedBranchesUpper = allowedBranches.map((b) => b.trim().toUpperCase());

      const invalidBranches = selectedBranchesUpper.filter(
        (b) => !companyBranchesUpper.includes(b)
      );

      if (invalidBranches.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Stricter eligibility error: Cannot include branches not approved by company (${invalidBranches.join(', ')}). Allowed by company: ${companyBranchesUpper.join(', ')}`,
        });
      }
      finalBranches = selectedBranchesUpper;
    }

    // 5. Create or Update Drive
    let driveDoc;
    if (request.drive) {
      driveDoc = await Drive.findById(request.drive);
    }

    if (driveDoc) {
      driveDoc.college = request.college;
      driveDoc.jobRequirement = jobReq._id;
      driveDoc.driveRequest = request._id;
      driveDoc.role = jobReq.title;
      driveDoc.packageLpa = jobReq.packageLpa;
      driveDoc.location = jobReq.location || 'College Campus';
      const finalLastDateObj = getEndOfDayIST(lastDateObj);

      driveDoc.venueOrMeetingLink = venueOrMeetingLink.trim();
      driveDoc.mode = request.mode || 'on-campus';
      driveDoc.minCgpa = finalMinCgpa;
      driveDoc.maxBacklogs = finalMaxBacklogs;
      driveDoc.allowedBranches = finalBranches;
      driveDoc.lastDateToApply = finalLastDateObj;
      driveDoc.driveDate = driveDateObj;
      driveDoc.status = 'open';
      driveDoc.applicationsClosed = false;
      driveDoc.listFrozenAt = null;
      await driveDoc.save();
    } else {
      const finalLastDateObj = getEndOfDayIST(lastDateObj);

      driveDoc = await Drive.create({
        company: request.company._id || request.company,
        college: request.college,
        jobRequirement: jobReq._id,
        driveRequest: request._id,
        role: jobReq.title,
        packageLpa: jobReq.packageLpa,
        location: jobReq.location || 'College Campus',
        venueOrMeetingLink: venueOrMeetingLink.trim(),
        mode: request.mode || 'on-campus',
        minCgpa: finalMinCgpa,
        maxBacklogs: finalMaxBacklogs,
        allowedBranches: finalBranches,
        lastDateToApply: finalLastDateObj,
        driveDate: driveDateObj,
        status: 'open',
        applicationsClosed: false,
        listFrozenAt: null,
      });
      request.drive = driveDoc._id;
    }

    // 6. Update DriveRequest status to scheduled
    request.status = 'scheduled';
    request.confirmedDate = driveDateObj;

    request.timeline.push({
      status: 'scheduled',
      updatedBy: req.user._id,
      updatedByRole: 'tpo',
      updatedByName: req.user.name,
      note:
        note ||
        `Drive finalized and published by TPO for ${driveDateObj.toLocaleDateString()}. Venue: ${venueOrMeetingLink.trim()}`,
      date: new Date(),
    });

    if (message && message.trim()) {
      request.messages.push({
        sender: req.user._id,
        senderRole: 'tpo',
        senderName: req.user.name,
        text: message.trim(),
        date: new Date(),
      });
    }

    await request.save();

    const updated = await DriveRequest.findById(request._id)
      .populate('jobRequirement')
      .populate('company', 'name logoUrl industry website hrContact')
      .populate('college', 'name code city state contactEmail contactPhone')
      .populate('drive');

    const doc = updated.toObject();
    doc.statusTimeline = formatTimeline(doc.timeline);

    // Notify Recruiter that drive is finalized and scheduled
    await notifyDriveRequestResponse({
      companyId: request.company,
      collegeName: updated.college?.name || req.user.college?.name,
      jobTitle: jobReq.title,
      action: 'scheduled',
      statusNote: `Drive officially finalized and scheduled for ${driveDateObj.toLocaleDateString()}`,
    });

    // Notify eligible students of the newly published drive
    await notifyDrivePublished(driveDoc);

    res.status(200).json({
      success: true,
      message: `Drive officially finalized and published! Students from your college can now apply.`,
      drive: driveDoc,
      request: doc,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDriveRequests,
  getDriveRequests,
  getDriveRequestById,
  cancelDriveRequest,
  respondToDriveRequest,
  acceptTpoProposedDate,
  finalizeAndPublishDrive,
  addMessage,
};
