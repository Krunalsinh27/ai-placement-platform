const { Notification, User, Student, Company, College } = require('../models');
const emailQueue = require('./emailQueue');
const {
  renderDrivePublishedTemplate,
  renderRoundScheduledTemplate,
  renderSlotAssignedTemplate,
  renderReminderTemplate,
  renderCalledNextTemplate,
  renderResultDeclaredTemplate,
  renderOfferReceivedTemplate,
  renderOfferExpiringTemplate,
  renderAnnouncementTemplate,
  renderScheduleUpdatedTemplate,
  generateIcsCalendar,
  formatIST,
  FRONTEND_URL,
} = require('./emailTemplates');

/**
 * Universal User Notification & Email Dispatcher
 * Dispatches an in-app notification AND queues a responsive HTML email.
 *
 * @param {ObjectId|string|Object} user - User document or ID
 * @param {string} type - Notification type identifier
 * @param {Object} data - Context data for notification & email templates
 */
const notifyUser = async (user, type, data = {}) => {
  try {
    if (!user) return null;

    // Resolve user document
    let userDoc = user;
    if (typeof user === 'string' || (user._id && !user.email)) {
      const uId = user._id || user;
      userDoc = await User.findById(uId).populate('college company');
    }
    if (!userDoc || !userDoc._id) return null;

    // 1. Create In-App Notification
    const notifMessage = data.message || `New update regarding your placement process.`;
    const notifLink = data.link || (userDoc.role === 'student' ? '/student/dashboard' : '/admin/dashboard');

    const notificationTypeMap = {
      drive_published: 'drive_published',
      round_scheduled: 'general',
      slot_assigned: 'slot_assigned',
      slot_reminder_24h: 'slot_assigned',
      slot_reminder_1h: 'slot_assigned',
      batch_reminder_24h: 'general',
      batch_reminder_1h: 'general',
      called_next: 'called_next',
      result_declared: 'status_change',
      offer_received: 'general',
      offer_expiring_48h: 'general',
      announcement: 'general',
      schedule_updated: 'general',
      drive_request: 'drive_request',
      request_response: 'request_response',
      new_applicant: 'new_applicant',
      status_change: 'status_change',
      interview_schedule: 'interview_schedule',
    };

    const notif = await Notification.create({
      user: userDoc._id,
      type: notificationTypeMap[type] || 'general',
      message: notifMessage,
      link: notifLink,
      read: false,
    });

    // 2. Email Delivery Checks
    if (!userDoc.email) return notif;

    // Student settings check: "Send me reminder emails" (offers and result emails always on)
    let studentDoc = null;
    if (userDoc.role === 'student') {
      studentDoc = await Student.findOne({ user: userDoc._id });
      const isReminder = ['slot_reminder_24h', 'slot_reminder_1h', 'batch_reminder_24h', 'batch_reminder_1h'].includes(type);
      if (isReminder && studentDoc && studentDoc.sendReminderEmails === false) {
        // Student opted out of reminder emails, return in-app notification only
        return notif;
      }
    }

    // Resolve College TPO email for Reply-To (never expose recruiter personal email to students)
    const collegeId = data.collegeId || (userDoc.college?._id || userDoc.college) || studentDoc?.college;
    let replyToEmail = '';
    let collegeName = data.collegeName || userDoc.college?.name || 'Campus Placement Cell';

    if (collegeId) {
      const tpoUser = await User.findOne({
        college: collegeId,
        role: { $in: ['tpo', 'admin'] },
        isApproved: true,
      }).select('email name');

      if (tpoUser?.email) {
        replyToEmail = tpoUser.email;
      }

      if (!data.collegeName && userDoc.college?.name) {
        collegeName = userDoc.college.name;
      } else if (!data.collegeName) {
        const col = await College.findById(collegeId).select('name');
        if (col?.name) collegeName = col.name;
      }
    }

    const companyName = data.companyName || userDoc.company?.name || '';

    // 3. Render HTML Template according to email type
    let htmlBody = '';
    let emailSubject = data.subject || notifMessage;
    let attachments = [];

    switch (type) {
      case 'drive_published':
        emailSubject = `New Placement Drive: ${companyName} is Hiring!`;
        htmlBody = renderDrivePublishedTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          packageLpa: data.packageLpa,
          allowedBranches: data.allowedBranches,
          minCgpa: data.minCgpa,
          maxBacklogs: data.maxBacklogs,
          lastDateToApply: data.lastDateToApply,
          driveId: data.driveId,
          replyToEmail,
        });
        break;

      case 'round_scheduled':
        emailSubject = `Round Scheduled: ${data.roundName || 'Recruitment Round'}`;
        htmlBody = renderRoundScheduledTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          roundType: data.roundType,
          mode: data.mode,
          startTime: data.startTime,
          venueOrLink: data.venueOrLink,
          instructions: data.instructions,
          replyToEmail,
        });
        break;

      case 'slot_assigned':
        emailSubject = `Interview Slot Assigned: ${data.roundName || 'Interview'} with ${companyName}`;
        htmlBody = renderSlotAssignedTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          panelName: data.panelName,
          queueNumber: data.queueNumber,
          startTime: data.startTime,
          endTime: data.endTime,
          venueOrLink: data.venueOrLink,
          mode: data.mode,
          slotId: data.slotId,
          replyToEmail,
        });

        // Generate .ics calendar attachment
        if (data.startTime) {
          const icsContent = generateIcsCalendar({
            title: `${companyName}: ${data.roundName || 'Interview'}`,
            description: `Interview slot for ${data.role || 'Position'} with ${companyName}. Panel: ${data.panelName}. Queue #${data.queueNumber}.\nRoom: ${FRONTEND_URL}/student/interview/${data.slotId}`,
            location: data.venueOrLink || 'Virtual Meeting Room',
            startTime: data.startTime,
            endTime: data.endTime,
            url: `${FRONTEND_URL}/student/interview/${data.slotId}`,
            organizerName: `${collegeName} TPO`,
            organizerEmail: replyToEmail || 'placements@college.edu',
          });

          attachments.push({
            filename: 'interview-slot.ics',
            content: icsContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          });
        }
        break;

      case 'slot_reminder_24h':
      case 'slot_reminder_1h':
      case 'batch_reminder_24h':
      case 'batch_reminder_1h': {
        const is1h = type.includes('1h');
        const isBatch = type.startsWith('batch');
        emailSubject = is1h
          ? `🚨 Reminder: ${data.roundName || 'Interview'} Starting in 1 Hour (${companyName})`
          : `Upcoming Interview Reminder (24 Hours): ${companyName} - ${data.roundName}`;
        htmlBody = renderReminderTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          targetName: data.targetName || data.panelName || data.batchName,
          startTime: data.startTime,
          endTime: data.endTime,
          venueOrLink: data.venueOrLink,
          timeframe: is1h ? '1h' : '24h',
          mode: data.mode,
          slotId: data.slotId,
          isBatch,
          replyToEmail,
        });
        break;
      }

      case 'called_next':
        emailSubject = `🔔 YOU ARE CALLED: Enter Meeting Room Immediately (${companyName})`;
        htmlBody = renderCalledNextTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          panelName: data.panelName,
          slotId: data.slotId,
          replyToEmail,
        });
        break;

      case 'result_declared':
        emailSubject = data.result === 'cleared'
          ? `🎉 Congratulations! Cleared ${data.roundName} with ${companyName}`
          : `Update on ${data.roundName} Results (${companyName})`;
        htmlBody = renderResultDeclaredTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          result: data.result,
          score: data.score,
          feedback: data.feedback,
          nextRoundName: data.nextRoundName,
          replyToEmail,
        });
        break;

      case 'schedule_updated':
        emailSubject = `⚠️ Schedule Updated: ${data.roundName || 'Recruitment Round'}`;
        htmlBody = renderScheduleUpdatedTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          roundName: data.roundName,
          deliveryMode: data.deliveryMode,
          changes: data.changes || [],
          newScheduleTime: data.newScheduleTime,
          newVenueOrLink: data.newVenueOrLink,
          instructions: data.instructions,
          replyToEmail,
        });
        break;

      case 'offer_received':
        emailSubject = `🎉 Employment Offer Received from ${companyName}!`;
        htmlBody = renderOfferReceivedTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          packageLpa: data.packageLpa,
          deadline: data.deadline,
          replyToEmail,
        });
        break;

      case 'offer_expiring_48h':
        emailSubject = `⚠️ Action Required: Employment Offer Expiring in 48 Hours (${companyName})`;
        htmlBody = renderOfferExpiringTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          role: data.role,
          packageLpa: data.packageLpa,
          deadline: data.deadline,
          replyToEmail,
        });
        break;

      case 'announcement':
        emailSubject = `Announcement: ${data.subject || 'Important Placement Update'}`;
        htmlBody = renderAnnouncementTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          senderName: data.senderName,
          senderRole: data.senderRole,
          driveRole: data.driveRole,
          roundName: data.roundName,
          subject: data.subject,
          message: data.message,
          replyToEmail,
        });
        break;

      default:
        // Generic fallback using announcement layout
        htmlBody = renderAnnouncementTemplate({
          studentName: userDoc.name,
          companyName,
          collegeName,
          senderName: 'Placement Cell',
          senderRole: 'Coordinator',
          driveRole: data.role,
          roundName: data.roundName,
          subject: emailSubject,
          message: notifMessage,
          replyToEmail,
        });
        break;
    }

    // 4. Dispatch Email through Background Queue (non-blocking)
    const validEmailTypes = [
      'drive_published',
      'round_scheduled',
      'slot_assigned',
      'slot_reminder_24h',
      'slot_reminder_1h',
      'batch_reminder_24h',
      'batch_reminder_1h',
      'called_next',
      'result_declared',
      'offer_received',
      'offer_expiring_48h',
      'announcement',
      'schedule_updated',
      'status_change',
      'drive_request',
      'request_response',
      'new_applicant',
      'interview_schedule',
      'verification_otp',
      'password_reset',
    ];
    const emailLogType = validEmailTypes.includes(type) ? type : 'general_notification';

    await emailQueue.enqueueEmail({
      user: userDoc._id,
      recipientEmail: userDoc.email,
      recipientName: userDoc.name,
      type: emailLogType,
      subject: emailSubject,
      htmlBody,
      textBody: notifMessage,
      attachments,
      replyTo: replyToEmail,
      college: collegeId,
      company: data.companyId || (userDoc.company?._id || userDoc.company),
      metadata: {
        link: notifLink,
        driveId: data.driveId,
        roundId: data.roundId,
        slotId: data.slotId,
      },
    });

    return notif;
  } catch (error) {
    console.error('[notifyUser] Error:', error.message);
    return null;
  }
};

/**
 * 1. Create a single notification for a user (compatibility)
 */
const createNotification = async ({ user, type, message, link = '' }) => {
  return await notifyUser(user, type, { message, link });
};

/**
 * 2. Create bulk notifications
 */
const createBulkNotifications = async (notifications) => {
  try {
    if (!Array.isArray(notifications) || notifications.length === 0) return [];
    return await Notification.insertMany(notifications);
  } catch (error) {
    console.error('Error creating bulk notifications:', error.message);
    return [];
  }
};

/**
 * 3. Notify TPOs of a new Drive Request from Recruiter
 */
const notifyNewDriveRequest = async ({ collegeId, companyName, jobTitle }) => {
  try {
    if (!collegeId) return;
    const tpoUsers = await User.find({
      college: collegeId,
      role: { $in: ['tpo', 'admin'] },
      isApproved: true,
    });

    for (const tpo of tpoUsers) {
      await notifyUser(tpo, 'drive_request', {
        collegeId,
        companyName,
        message: `New campus drive request from ${companyName || 'Corporate Partner'} for "${jobTitle || 'Placement Drive'}"`,
        link: '/admin/drive-requests',
      });
    }
  } catch (error) {
    console.error('Error in notifyNewDriveRequest:', error.message);
  }
};

/**
 * 4. Notify Recruiter when TPO responds to Drive Request
 */
const notifyDriveRequestResponse = async ({ companyId, collegeName, jobTitle, action, statusNote }) => {
  try {
    if (!companyId) return;
    const recruiters = await User.find({
      company: companyId,
      role: 'recruiter',
      isApproved: true,
    });

    const actionText =
      action === 'accept'
        ? 'accepted your drive request'
        : action === 'reject'
        ? 'declined your drive request'
        : action === 'propose_reschedule'
        ? 'proposed alternative date(s) for your drive request'
        : 'responded to your drive request';

    const message = `${collegeName || 'College TPO'} has ${actionText} for "${jobTitle || 'Placement Drive'}"${statusNote ? `: ${statusNote}` : '.'}`;

    for (const recruiter of recruiters) {
      await notifyUser(recruiter, 'request_response', {
        companyId,
        message,
        link: '/recruiter/drive-requests',
      });
    }
  } catch (error) {
    console.error('Error in notifyDriveRequestResponse:', error.message);
  }
};

/**
 * 5. Notify eligible students when a new drive is published
 */
const notifyDrivePublished = async (drive) => {
  try {
    if (!drive || !drive.college) return;

    const studentQuery = {
      college: drive.college,
      cgpa: { $gte: drive.minCgpa || 0 },
      backlogs: { $lte: drive.maxBacklogs || 0 },
    };

    if (drive.allowedBranches && drive.allowedBranches.length > 0 && !drive.allowedBranches.includes('ALL')) {
      studentQuery.branch = { $in: drive.allowedBranches };
    }

    const eligibleStudents = await Student.find(studentQuery).populate('user');
    let companyName = 'Partner Recruiter';

    if (drive.company) {
      const comp = await Company.findById(drive.company?._id || drive.company).select('name');
      if (comp?.name) companyName = comp.name;
    }

    const col = await College.findById(drive.college).select('name');
    const collegeName = col?.name || 'College Placement Cell';

    for (const s of eligibleStudents) {
      if (s.user) {
        notifyUser(s.user, 'drive_published', {
          collegeId: drive.college,
          collegeName,
          companyId: drive.company?._id || drive.company,
          companyName,
          role: drive.role,
          packageLpa: drive.packageLpa,
          allowedBranches: drive.allowedBranches,
          minCgpa: drive.minCgpa,
          maxBacklogs: drive.maxBacklogs,
          lastDateToApply: drive.lastDateToApply,
          driveId: drive._id,
          message: `New campus drive published: ${companyName} is hiring for ${drive.role} (${drive.packageLpa} LPA)! Apply by ${new Date(drive.lastDateToApply).toLocaleDateString()}.`,
          link: '/student/drives',
        }).catch((err) => console.error('Failed to notify student of drive published:', err));
      }
    }
  } catch (error) {
    console.error('Error in notifyDrivePublished:', error.message);
  }
};

/**
 * 6. Notify student on application status change or interview schedule
 */
const notifyApplicationStatusChange = async ({ studentUserId, companyName, role, status, customNote, collegeId }) => {
  try {
    if (!studentUserId) return;

    const isInterview = status === 'interview' || status === 'interview_scheduled';
    const type = isInterview ? 'interview_schedule' : 'status_change';

    const message = isInterview
      ? `Interview scheduled for your application with ${companyName || 'Recruiter'} for ${role || 'Position'}!`
      : `Your application status for ${companyName || 'Recruiter'} (${role || 'Drive'}) has been updated to: ${status.toUpperCase()}${customNote ? ` - ${customNote}` : '.'}`;

    await notifyUser(studentUserId, type, {
      companyName,
      role,
      status,
      collegeId,
      message,
      link: '/student/applications',
    });
  } catch (error) {
    console.error('Error in notifyApplicationStatusChange:', error.message);
  }
};

/**
 * 7. Notify recruiter on new applicant submission
 */
const notifyNewApplicant = async ({ companyId, applicantName, branch, cgpa, role }) => {
  try {
    if (!companyId) return;

    const recruiters = await User.find({
      company: companyId,
      role: 'recruiter',
      isApproved: true,
    });

    const message = `New candidate applied: ${applicantName || 'Student'} (${branch || 'Engineering'}, CGPA ${cgpa || 'N/A'}) applied for ${role || 'Placement Drive'}.`;

    for (const r of recruiters) {
      await notifyUser(r, 'new_applicant', {
        companyId,
        message,
        link: '/recruiter/dashboard',
      });
    }
  } catch (error) {
    console.error('Error in notifyNewApplicant:', error.message);
  }
};

module.exports = {
  notifyUser,
  createNotification,
  createBulkNotifications,
  notifyNewDriveRequest,
  notifyDriveRequestResponse,
  notifyDrivePublished,
  notifyApplicationStatusChange,
  notifyNewApplicant,
};
