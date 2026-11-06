/**
 * Email Templates & .ics Calendar Generator for Campus Placement Portal
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Format timestamp into clean IST date and time string
 */
const formatIST = (date) => {
  if (!date) return 'TBA';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'TBA';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' IST';
};

/**
 * Format IST Date only
 */
const formatISTDateOnly = (date) => {
  if (!date) return 'TBA';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Format UTC string for .ics calendar (YYYYMMDDTHHMMSSZ)
 */
const formatIcsDate = (date) => {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

/**
 * Generate standard RFC 5545 .ics Calendar invitation
 */
const generateIcsCalendar = ({
  uid,
  title,
  description = '',
  location = 'Virtual Interview Room',
  startTime,
  endTime,
  url = '',
  organizerName = 'Placement Cell',
  organizerEmail = 'placements@college.edu',
}) => {
  const dtStart = formatIcsDate(startTime);
  const dtEnd = formatIcsDate(endTime || new Date(new Date(startTime).getTime() + 30 * 60 * 1000));
  const dtStamp = formatIcsDate(new Date());
  const eventUid = uid || `interview-${Date.now()}@placementportal.edu`;

  // Escape special chars in text fields
  const cleanSummary = (title || 'Interview Session').replace(/[\n\r]/g, ' ');
  const cleanDescription = (description || '').replace(/\n/g, '\\n');
  const cleanLocation = (location || '').replace(/[\n\r]/g, ' ');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Placement Management System//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${eventUid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanSummary}`,
    `DESCRIPTION:${cleanDescription}`,
    `LOCATION:${cleanLocation}`,
    url ? `URL:${url}` : '',
    `ORGANIZER;CN="${organizerName}":mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview starting in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
};

/**
 * Master Responsive HTML Email Layout
 */
const renderBaseLayout = ({
  collegeName = 'Campus Training & Placement Cell',
  companyName = '',
  title,
  subtitle,
  studentName = 'Student',
  introMessage,
  detailsRows = [],
  buttonText,
  buttonUrl,
  noteText = '',
  replyToEmail = '',
}) => {
  const tableRowsHtml = detailsRows
    .map(
      ([label, value], idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #475569; width: 38%; border-bottom: 1px solid #e2e8f0;">
          ${label}
        </td>
        <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${value}
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); overflow: hidden; border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4338ca 0%, #312e81 100%); padding: 28px 32px; text-align: left;">
              <div style="font-size: 11px; font-weight: 800; color: #a5b4fc; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
                ${collegeName} ${companyName ? `• ${companyName}` : ''}
              </div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; line-height: 28px;">
                ${title}
              </h1>
              ${subtitle ? `<p style="color: #c7d2fe; font-size: 13px; margin: 6px 0 0 0; font-weight: 500;">${subtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <p style="font-size: 15px; line-height: 24px; margin: 0 0 16px 0; color: #334155;">
                Dear <strong>${studentName || 'Candidate'}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 22px; margin: 0 0 24px 0; color: #475569;">
                ${introMessage}
              </p>

              <!-- Details Table -->
              ${
                detailsRows.length > 0
                  ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; margin-bottom: 24px; border-collapse: separate; border-spacing: 0;">
                ${tableRowsHtml}
              </table>
              `
                  : ''
              }

              <!-- Note Alert Box -->
              ${
                noteText
                  ? `
              <div style="background-color: #fefce8; border-left: 4px solid #eab308; border-radius: 8px; padding: 12px 16px; margin-bottom: 26px;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #713f12;">
                  <strong>Important Note:</strong> ${noteText}
                </p>
              </div>
              `
                  : ''
              }

              <!-- One Call-to-Action Button -->
              ${
                buttonText && buttonUrl
                  ? `
              <div style="text-align: center; margin: 30px 0 20px 0;">
                <a href="${buttonUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
                  ${buttonText} &rarr;
                </a>
              </div>
              <p style="text-align: center; font-size: 11px; color: #94a3b8; margin: 0 0 10px 0;">
                Button not working? Copy and paste this link in your browser:<br>
                <a href="${buttonUrl}" style="color: #6366f1; word-break: break-all;">${buttonUrl}</a>
              </p>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: left;">
              <p style="font-size: 11px; line-height: 17px; color: #64748b; margin: 0 0 6px 0;">
                All schedule dates and times mentioned in this communication are in <strong>Indian Standard Time (IST)</strong>.
              </p>
              <p style="font-size: 11px; line-height: 17px; color: #94a3b8; margin: 0;">
                This is an automated notification from your college placement portal. Replies to this email are directed to your TPO ${replyToEmail ? `(${replyToEmail})` : ''}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

// =========================================================================
// 1. DRIVE PUBLISHED TO ELIGIBLE STUDENTS
// =========================================================================
const renderDrivePublishedTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  packageLpa,
  allowedBranches = [],
  minCgpa = 0,
  maxBacklogs = 0,
  lastDateToApply,
  driveId,
  replyToEmail,
}) => {
  const title = `New Placement Drive: ${companyName} is Hiring!`;
  const subtitle = `Role: ${role} (${packageLpa} LPA)`;
  const introMessage = `A new campus recruitment drive has been officially published and matches your academic branch and eligibility profile. Review the drive requirements below and submit your application before the deadline.`;

  const detailsRows = [
    ['Hiring Company', companyName || 'Corporate Partner'],
    ['Job Role / Designation', role || 'Campus Hire'],
    ['Compensation (CTC)', `${packageLpa} LPA`],
    ['Eligible Branches', allowedBranches.length > 0 ? allowedBranches.join(', ') : 'All Branches'],
    ['Academic Criteria', `Min CGPA: ${minCgpa} | Max Backlogs: ${maxBacklogs}`],
    ['Last Date to Apply (IST)', formatIST(lastDateToApply)],
  ];

  const buttonText = 'View Drive & Apply Now';
  const buttonUrl = `${FRONTEND_URL}/student/drives`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'Applications freeze strictly at 11:59 PM IST on the deadline date. Withdrawals or late submissions are not allowed after freezing.',
    replyToEmail,
  });
};

// =========================================================================
// 2. APPLICATIONS CLOSED & ROUND SCHEDULED
// =========================================================================
const renderRoundScheduledTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  roundType,
  mode = 'online',
  startTime,
  venueOrLink,
  instructions,
  replyToEmail,
}) => {
  const title = `Round Scheduled: ${roundName}`;
  const subtitle = `${companyName} • ${role}`;
  const introMessage = `Applications for this drive are now closed and the candidate roster is frozen. Your evaluation slot / batch for <strong>${roundName}</strong> has been scheduled.`;

  const detailsRows = [
    ['Company', companyName],
    ['Drive Role', role],
    ['Round Title', roundName],
    ['Round Type', (roundType || 'Assessment').toUpperCase()],
    ['Mode of Conduct', (mode || 'Online').toUpperCase()],
    ['Schedule Time (IST)', formatIST(startTime)],
    ['Venue / Meeting Link', venueOrLink || 'To be shared on portal'],
  ];

  const buttonText = 'View Pipeline & Schedule';
  const buttonUrl = `${FRONTEND_URL}/student/applications`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: instructions || 'Please ensure you are ready with a stable internet connection or report to the venue 15 minutes before your slot.',
    replyToEmail,
  });
};

// =========================================================================
// 3. INTERVIEW SLOT ASSIGNED (WITH .ICS CALENDAR ATTACHMENT)
// =========================================================================
const renderSlotAssignedTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  panelName,
  queueNumber,
  startTime,
  endTime,
  venueOrLink,
  mode = 'online',
  slotId,
  replyToEmail,
}) => {
  const title = `Interview Slot Assigned: ${roundName}`;
  const subtitle = `${companyName} • Queue #${queueNumber}`;
  const introMessage = `Your 1-on-1 interview slot for <strong>${roundName}</strong> has been officially confirmed by the recruiter. A calendar invite (.ics) has been attached to this email.`;

  const detailsRows = [
    ['Company', companyName],
    ['Position', role],
    ['Interview Round', roundName],
    ['Assigned Panel', panelName || 'Interview Panel'],
    ['Queue Position', `Queue #${queueNumber}`],
    ['Interview Time (IST)', `${formatIST(startTime)} - ${endTime ? new Date(endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : ''}`],
    ['Format / Mode', (mode || 'Online').toUpperCase()],
    ['Venue / Meeting Room', venueOrLink || 'Virtual Meeting Room'],
  ];

  const buttonText = 'Enter Student Interview Room';
  const buttonUrl = `${FRONTEND_URL}/student/interview/${slotId}`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'The virtual meeting room unlocks 10 minutes before your slot or as soon as the panel calls your queue number.',
    replyToEmail,
  });
};

// =========================================================================
// 4. REMINDERS (24 HOURS & 1 HOUR BEFORE SLOT OR BATCH)
// =========================================================================
const renderReminderTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  targetName, // Panel name or batch name
  startTime,
  endTime,
  venueOrLink,
  timeframe = '24h', // '24h' or '1h'
  mode = 'online',
  slotId,
  isBatch = false,
  replyToEmail,
}) => {
  const is1Hour = timeframe === '1h';
  const title = is1Hour
    ? `🚨 Reminder: Interview / Round Starting in 1 Hour!`
    : `Upcoming Interview Reminder (24 Hours): ${companyName}`;
  const subtitle = `${roundName} • ${formatIST(startTime)}`;
  const introMessage = is1Hour
    ? `Your interview session with <strong>${companyName}</strong> is scheduled to commence in approximately <strong>1 hour</strong>. Please complete your hardware check and be ready.`
    : `This is a reminder that your scheduled session with <strong>${companyName}</strong> for <strong>${roundName}</strong> is coming up tomorrow.`;

  const detailsRows = [
    ['Company', companyName],
    ['Job Role', role],
    ['Round', roundName],
    [isBatch ? 'Assigned Batch' : 'Interview Panel', targetName || 'Assigned Session'],
    ['Scheduled Time (IST)', `${formatIST(startTime)} ${endTime ? `- ${new Date(endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}` : ''}`],
    ['Venue / Meeting Room', venueOrLink || 'Virtual Room'],
  ];

  const buttonText = slotId ? 'Open Interview Room' : 'View Application Details';
  const buttonUrl = slotId ? `${FRONTEND_URL}/student/interview/${slotId}` : `${FRONTEND_URL}/student/applications`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: is1Hour
      ? 'Ensure your webcam, microphone, and internet connectivity are tested beforehand in your Interview Room.'
      : 'You can test your camera and microphone in advance on your candidate interview room dashboard.',
    replyToEmail,
  });
};

// =========================================================================
// 5. YOU ARE CALLED (CALL NEXT IN QUEUE)
// =========================================================================
const renderCalledNextTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  panelName,
  slotId,
  replyToEmail,
}) => {
  const title = `🔔 YOU ARE CALLED: Enter Meeting Room Immediately`;
  const subtitle = `${panelName} is waiting for you`;
  const introMessage = `The interviewers at <strong>${panelName}</strong> for <strong>${companyName}</strong> are ready to conduct your interview right now. Your turn in queue has arrived.`;

  const detailsRows = [
    ['Company', companyName],
    ['Interview Round', roundName],
    ['Panel', panelName],
    ['Status', 'IN PROGRESS (CURRENTLY CALLED)'],
  ];

  const buttonText = 'Enter Meeting Room Now';
  const buttonUrl = `${FRONTEND_URL}/student/interview/${slotId}`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'Please enter immediately to avoid being marked as no-show by the recruiter.',
    replyToEmail,
  });
};

// =========================================================================
// 6. RESULT DECLARED (CLEARED OR NOT CLEARED)
// =========================================================================
const renderResultDeclaredTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  result, // 'cleared' or 'rejected'
  score,
  feedback,
  nextRoundName,
  replyToEmail,
}) => {
  const isCleared = result === 'cleared';
  const title = isCleared
    ? `🎉 Congratulations! Cleared ${roundName}`
    : `Update on ${roundName} Results`;
  const subtitle = `${companyName} • ${role}`;
  const introMessage = isCleared
    ? `You are shortlisted for the next round, schedule will follow.`
    : `Thank you for your participation in <strong>${roundName}</strong> with ${companyName}. The recruiter has published the results.`;

  const detailsRows = [
    ['Company', companyName],
    ['Role', role],
    ['Round Evaluated', roundName],
    ['Result Status', isCleared ? 'CLEARED / SHORTLISTED' : 'NOT CLEARED'],
    ...(score !== undefined && score !== null ? [['Score Awarded', `${score}%`]] : []),
    ...(isCleared && nextRoundName ? [['Advanced To', nextRoundName]] : []),
  ];

  const buttonText = 'View Application & Pipeline';
  const buttonUrl = `${FRONTEND_URL}/student/applications`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: feedback ? `Interviewer Feedback: "${feedback}"` : (isCleared ? 'Keep an eye on your email for the next round schedule.' : 'Keep learning and best of luck for upcoming recruitment opportunities!'),
    replyToEmail,
  });
};

// =========================================================================
// 7. OFFER RECEIVED
// =========================================================================
const renderOfferReceivedTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  packageLpa,
  deadline,
  replyToEmail,
}) => {
  const title = `🎉 Employment Offer Received from ${companyName}!`;
  const subtitle = `Congratulations on your campus selection!`;
  const introMessage = `Heartiest congratulations! <strong>${companyName}</strong> has extended an official campus employment offer for the position of <strong>${role}</strong>.`;

  const detailsRows = [
    ['Hiring Company', companyName],
    ['Designation / Role', role],
    ['Offered Package (CTC)', `${packageLpa} LPA`],
    ['Response Deadline (IST)', formatIST(deadline)],
    ['Status', 'OFFER EXTENDED (ACTION REQUIRED)'],
  ];

  const buttonText = 'Review & Accept Offer';
  const buttonUrl = `${FRONTEND_URL}/student/dashboard`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'Please review the offer details and accept or decline prior to the specified response deadline.',
    replyToEmail,
  });
};

// =========================================================================
// 8. OFFER EXPIRING IN 48 HOURS
// =========================================================================
const renderOfferExpiringTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  packageLpa,
  deadline,
  replyToEmail,
}) => {
  const title = `⚠️ Action Required: Employment Offer Expiring in 48 Hours`;
  const subtitle = `${companyName} • ${role}`;
  const introMessage = `Your pending employment offer from <strong>${companyName}</strong> is expiring soon. You must record your official decision before the deadline to secure your placement.`;

  const detailsRows = [
    ['Company', companyName],
    ['Offered Position', role],
    ['Compensation', `${packageLpa} LPA`],
    ['Deadline Expiry (IST)', formatIST(deadline)],
  ];

  const buttonText = 'Respond to Offer Now';
  const buttonUrl = `${FRONTEND_URL}/student/dashboard`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'Unanswered offers will automatically lapse after the deadline passes.',
    replyToEmail,
  });
};

// =========================================================================
// 9. CUSTOM ANNOUNCEMENT
// =========================================================================
const renderAnnouncementTemplate = ({
  studentName,
  companyName,
  collegeName,
  senderName,
  senderRole,
  driveRole,
  roundName,
  subject,
  message,
  replyToEmail,
}) => {
  const title = `Announcement: ${subject}`;
  const subtitle = `${collegeName} • ${companyName || 'Placement Cell'}`;
  const introMessage = `A new announcement has been issued regarding your participation in <strong>${roundName || driveRole || 'the placement process'}</strong>.`;

  const detailsRows = [
    ...(companyName ? [['Drive Company', companyName]] : []),
    ...(driveRole ? [['Role', driveRole]] : []),
    ...(roundName ? [['Round', roundName]] : []),
    ['Issued By', `${senderName || 'Official'} (${senderRole || 'Placement Team'})`],
    ['Date & Time (IST)', formatIST(new Date())],
  ];

  const buttonText = 'View Application Portal';
  const buttonUrl = `${FRONTEND_URL}/student/applications`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage: `${introMessage}<div style="margin-top: 14px; padding: 14px; background-color: #f8fafc; border-left: 3px solid #6366f1; border-radius: 6px; font-size: 14px; line-height: 22px; color: #1e293b; white-space: pre-line;">${message}</div>`,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: 'If you have inquiries regarding this announcement, reply directly to your college TPO.',
    replyToEmail,
  });
};

// =========================================================================
// 10. UPDATED SCHEDULE (CHANGE TO DATE, TIME, LINK, VENUE, OR MODE)
// =========================================================================
const renderScheduleUpdatedTemplate = ({
  studentName,
  companyName,
  collegeName,
  role,
  roundName,
  deliveryMode,
  changes = [],
  newScheduleTime,
  newVenueOrLink,
  instructions,
  replyToEmail,
}) => {
  const title = `⚠️ Schedule Updated: ${roundName}`;
  const subtitle = `${companyName} • ${role}`;
  const introMessage = `Please note that the schedule, mode, or venue for <strong>${roundName}</strong> with <strong>${companyName}</strong> has been updated by the recruitment team. Review the changes below:`;

  const detailsRows = [
    ['Company', companyName],
    ['Drive Role', role],
    ['Round Title', roundName],
    ...(deliveryMode ? [['Delivery Mode', deliveryMode.replace('_', ' ').toUpperCase()]] : []),
    ...changes.map((c) => [`Updated ${c.label}`, `Was: ${c.oldVal || 'None'} → Now: ${c.newVal || 'None'}`]),
    ...(newScheduleTime ? [['Current Schedule (IST)', formatIST(newScheduleTime)]] : []),
    ...(newVenueOrLink ? [['Venue / Link', newVenueOrLink]] : []),
  ];

  const buttonText = 'View Updated Schedule';
  const buttonUrl = `${FRONTEND_URL}/student/applications`;

  return renderBaseLayout({
    collegeName,
    companyName,
    title,
    subtitle,
    studentName,
    introMessage,
    detailsRows,
    buttonText,
    buttonUrl,
    noteText: instructions || 'Please check your portal for the latest instructions and report at the revised time/venue.',
    replyToEmail,
  });
};

module.exports = {
  FRONTEND_URL,
  formatIST,
  formatISTDateOnly,
  generateIcsCalendar,
  renderBaseLayout,
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
};

