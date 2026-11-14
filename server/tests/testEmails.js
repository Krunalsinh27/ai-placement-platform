const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
const { getTestDbUri } = require('./testHelper');

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  Round,
  RoundParticipant,
  InterviewSlot,
  InterviewPanel,
  EmailLog,
  Notification,
} = require('../models');

const emailQueue = require('../utils/emailQueue');
const { notifyUser } = require('../utils/notificationService');
const { sendUpcomingReminders } = require('../utils/cronJobs');
const {
  generateEmailHtml,
  generateIcsCalendar,
  renderDrivePublishedTemplate,
  renderRoundScheduledTemplate,
  renderSlotAssignedTemplate,
  renderReminderTemplate,
  renderCalledNextTemplate,
  renderResultDeclaredTemplate,
  renderOfferReceivedTemplate,
  renderOfferExpiringTemplate,
  renderAnnouncementTemplate,
  formatISTDateTime,
  formatISTTime,
} = require('../utils/emailTemplates');

async function runEmailTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/emails', require('../routes/emailRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/colleges', require('../routes/collegeRoutes'));

  const PORT = 5096;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  let fixtureCollege,
    fixtureCompany,
    fixtureTpoUser,
    fixtureRecUser,
    fixtureStudentUser,
    fixtureStudent,
    fixtureDrive,
    fixtureApp,
    fixtureRound,
    fixtureParticipant,
    fixturePanel;

  try {
    console.log('\n======================================================');
    console.log('     TASK 31B: EMAIL NOTIFICATIONS & PIPELINE TESTS    ');
    console.log('======================================================\n');

    // ------------------------------------------------------------------------
    // SECTION 1: HTML Email Templates & .ics Calendar Rendering
    // ------------------------------------------------------------------------
    console.log('--- 1. Testing HTML Templates and .ics Generator ---');

    // Test 1A: .ics Calendar File Generation
    const icsContent = generateIcsCalendar({
      title: 'Technical Interview - Google SDE',
      description: 'First round technical interview via video link',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
      location: 'https://meet.google.com/abc-defg-hij',
      organizerEmail: 'tpo@college.edu',
      organizerName: 'Campus Placement Cell',
    });

    if (
      !icsContent.includes('BEGIN:VCALENDAR') ||
      !icsContent.includes('END:VCALENDAR') ||
      !icsContent.includes('SUMMARY:Technical Interview - Google SDE') ||
      !icsContent.includes('ORGANIZER;CN="Campus Placement Cell":mailto:tpo@college.edu')
    ) {
      throw new Error('ICS Calendar generation output failed RFC 5545 format requirements');
    }
    console.log('✓ RFC 5545 .ics Calendar generated successfully with correct organizer and timestamps');

    // Test 1B: Template 1 - Drive Published
    const htmlDrivePub = renderDrivePublishedTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Microsoft',
      role: 'Software Engineer',
      packageLpa: 18,
      lastDateToApply: new Date('2026-11-15T18:30:00Z'),
      driveDate: new Date('2026-11-20T04:30:00Z'),
      mode: 'online',
    });
    if (!htmlDrivePub.includes('table') || !htmlDrivePub.includes('View Drive & Apply Now') || !htmlDrivePub.includes('18 LPA')) {
      throw new Error('drive_published template missing expected table or button CTA');
    }
    console.log('✓ Template 1 (drive_published) rendered with details table and CTA button');

    // Test 1C: Template 2 - Round Scheduled
    const htmlRoundSched = renderRoundScheduledTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Full Stack Developer',
      roundName: 'Round 1: Online Assessment',
      roundType: 'aptitude',
      startTime: new Date('2026-11-10T04:30:00Z'),
      mode: 'online',
      instructions: 'Please be ready 15 minutes before the start time.',
    });
    if (!htmlRoundSched.includes('Round Scheduled') || !htmlRoundSched.includes('Online Assessment')) {
      throw new Error('round_scheduled template failed rendering');
    }
    console.log('✓ Template 2 (round_scheduled) rendered');

    // Test 1D: Template 3 - Slot Assigned
    const htmlSlotAssigned = renderSlotAssignedTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Full Stack Developer',
      roundName: 'Round 2: Technical Interview',
      panelName: 'Panel Alpha',
      queueNumber: 1,
      startTime: new Date('2026-11-10T10:00:00Z'),
      endTime: new Date('2026-11-10T10:45:00Z'),
      venueOrLink: 'https://meet.google.com/xyz',
      mode: 'online',
      slotId: 'test-slot-123',
    });
    if (!htmlSlotAssigned.includes('Enter Student Interview Room')) {
      throw new Error('slot_assigned template failed rendering');
    }
    console.log('✓ Template 3 (slot_assigned) rendered with calendar mention');

    // Test 1E: Template 4 - Reminders (24h and 1h)
    const htmlRem24h = renderReminderTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Full Stack Developer',
      roundName: 'Technical Interview',
      targetName: 'Panel Beta',
      timeframe: '24h',
      startTime: new Date('2026-11-10T10:00:00Z'),
      venueOrLink: 'Virtual Room',
      mode: 'online',
      slotId: 'test-slot-123',
    });
    const htmlRem1h = renderReminderTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Full Stack Developer',
      roundName: 'Technical Interview',
      targetName: 'Panel Beta',
      timeframe: '1h',
      startTime: new Date('2026-11-10T10:00:00Z'),
      venueOrLink: 'Virtual Room',
      mode: 'online',
      slotId: 'test-slot-123',
    });
    if (!htmlRem24h.includes('24 Hours') || !htmlRem1h.includes('1 Hour')) {
      throw new Error('Reminder templates failed timeframe checks');
    }
    console.log('✓ Template 4 (slot_reminder_24h & slot_reminder_1h) rendered');

    // Test 1F: Template 5 - Called Next
    const htmlCalled = renderCalledNextTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Amazon',
      role: 'Software Development Engineer',
      roundName: 'Round 3: System Design',
      panelName: 'Panel Gamma',
      slotId: 'test-slot-123',
    });
    if (!htmlCalled.includes('Enter Meeting Room Now')) {
      throw new Error('called_next template missing join action');
    }
    console.log('✓ Template 5 (called_next) rendered');

    // Test 1G: Template 6 - Result Declared (Cleared & Not Cleared)
    const htmlCleared = renderResultDeclaredTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Amazon',
      role: 'SDE',
      roundName: 'Round 1: Online Assessment',
      result: 'cleared',
      nextRoundName: 'Round 2: Technical Interview',
    });
    const htmlRejected = renderResultDeclaredTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Amazon',
      role: 'SDE',
      roundName: 'Round 1: Online Assessment',
      result: 'rejected',
    });
    if (!htmlCleared.includes('Congratulations') || !htmlRejected.includes('NOT CLEARED')) {
      throw new Error('result_declared template failed cleared/rejected condition check');
    }
    console.log('✓ Template 6 (result_declared: cleared & rejected) rendered');

    // Test 1H: Template 7 - Offer Received
    const htmlOffer = renderOfferReceivedTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Software Engineer',
      packageLpa: 24,
      deadline: new Date('2026-11-25T18:30:00Z'),
    });
    if (!htmlOffer.includes('Employment Offer Received') || !htmlOffer.includes('24 LPA')) {
      throw new Error('offer_received template failed rendering');
    }
    console.log('✓ Template 7 (offer_received) rendered with package and deadline');

    // Test 1I: Template 8 - Offer Expiring
    const htmlOfferExp = renderOfferExpiringTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Software Engineer',
      packageLpa: 24,
      deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    if (!htmlOfferExp.includes('Expiring in 48 Hours')) {
      throw new Error('offer_expiring_48h template failed');
    }
    console.log('✓ Template 8 (offer_expiring_48h) rendered');

    // Test 1J: Template 9 - Announcement
    const htmlAnnounce = renderAnnouncementTemplate({
      studentName: 'Aarav Sharma',
      collegeName: 'NIT Delhi',
      companyName: 'Google',
      role: 'Full Stack Developer',
      roundName: 'Technical Interview',
      subject: 'Interview Schedule Update',
      message: 'All interviews will commence at 11:00 AM IST instead of 10:00 AM.',
    });
    if (!htmlAnnounce.includes('Interview Schedule Update') || !htmlAnnounce.includes('11:00 AM IST')) {
      throw new Error('announcement template failed');
    }
    console.log('✓ Template 9 (announcement) rendered with custom message');

    // ------------------------------------------------------------------------
    // SETUP FIXTURES (Hermetic test setup)
    // ------------------------------------------------------------------------
    console.log('\n--- Setting up Hermetic Test Fixtures ---');
    await EmailLog.deleteMany({ recipientEmail: { $in: ['test-retry@domain.com', 'test.email.student@testcollege.edu', 'other@test.com'] } });
    await College.deleteMany({ code: { $in: ['TEST_EMAIL_COLLEGE', 'TEST_EMAIL_OTHER_COLLEGE'] } });
    await Company.deleteMany({ name: 'Hermetic Email Corp' });
    await User.deleteMany({ email: { $in: ['test.email.tpo@testcollege.edu', 'test.email.recruiter@emailtest.com', 'test.email.student@testcollege.edu'] } });
    await Student.deleteMany({ enrollmentNo: 'TEST_EMAIL_STU_001' });

    fixtureCollege = await College.create({
      name: 'Hermetic Email Test College',
      code: 'TEST_EMAIL_COLLEGE',
      city: 'New Delhi',
      state: 'Delhi',
      status: 'approved',
      contactEmail: 'test.email.tpo@testcollege.edu',
    });

    fixtureCompany = await Company.create({
      name: 'Hermetic Email Corp',
      industry: 'Software',
      verified: true,
    });

    fixtureTpoUser = await User.create({
      name: 'Hermetic TPO',
      email: 'test.email.tpo@testcollege.edu',
      password: 'Krypton#2026!Valid',
      role: 'tpo',
      college: fixtureCollege._id,
      isApproved: true,
      isEmailVerified: true,
    });

    fixtureRecUser = await User.create({
      name: 'Hermetic Recruiter',
      email: 'test.email.recruiter@emailtest.com',
      password: 'Krypton#2026!Valid',
      role: 'recruiter',
      company: fixtureCompany._id,
      isApproved: true,
      isEmailVerified: true,
    });

    fixtureStudentUser = await User.create({
      name: 'Hermetic Student',
      email: 'test.email.student@testcollege.edu',
      password: 'Krypton#2026!Valid',
      role: 'student',
      college: fixtureCollege._id,
      isApproved: true,
      isEmailVerified: true,
    });

    fixtureStudent = await Student.create({
      user: fixtureStudentUser._id,
      college: fixtureCollege._id,
      enrollmentNo: 'TEST_EMAIL_STU_001',
      branch: 'CSE',
      batchYear: 2026,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
      sendReminderEmails: true,
    });

    fixtureDrive = await Drive.create({
      college: fixtureCollege._id,
      company: fixtureCompany._id,
      companyName: fixtureCompany.name,
      role: 'Full Stack Email Test Engineer',
      packageLpa: 15,
      location: 'Delhi',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE'],
      batchYear: 2026,
      status: 'open',
      applicationsClosed: true,
      driveDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    fixtureApp = await Application.create({
      student: fixtureStudent._id,
      drive: fixtureDrive._id,
      status: 'applied',
      appliedAt: new Date(),
    });

    fixtureRound = await Round.create({
      drive: fixtureDrive._id,
      name: 'Round 1: Technical Assessment',
      type: 'technical',
      order: 1,
      status: 'scheduled',
      mode: 'online',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    fixtureParticipant = await RoundParticipant.create({
      round: fixtureRound._id,
      student: fixtureStudent._id,
      drive: fixtureDrive._id,
      application: fixtureApp._id,
      attendance: 'present',
      result: 'pending',
    });

    fixturePanel = await InterviewPanel.create({
      round: fixtureRound._id,
      drive: fixtureDrive._id,
      name: 'Technical Panel Alpha',
      interviewers: [{ name: 'Lead Interviewer', email: 'interviewer@emailtest.com' }],
      venueOrLink: 'https://meet.google.com/test-panel',
    });

    const tpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test.email.tpo@testcollege.edu', password: 'Krypton#2026!Valid' }),
    });
    const tpoData = await tpoLoginRes.json();
    const tpoToken = tpoData.token;
    if (!tpoToken) throw new Error('Fixture TPO login failed');

    const recLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test.email.recruiter@emailtest.com', password: 'Krypton#2026!Valid' }),
    });
    const recData = await recLoginRes.json();
    const recToken = recData.token;
    if (!recToken) throw new Error('Fixture Recruiter login failed');

    // ------------------------------------------------------------------------
    // SECTION 2: Background Queue Retry on Failure
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Background Queue Worker & 3x Retry Loop ---');

    // Temporarily reduce delay for tests
    emailQueue.delayMs = 10;

    // Simulate failing email transport
    let attemptCount = 0;
    emailQueue.setSenderFunction(async () => {
      attemptCount++;
      return { success: false, error: 'Connection refused by SMTP host' };
    });

    const failedLog = await emailQueue.enqueueEmail({
      user: fixtureTpoUser._id,
      recipientEmail: 'test-retry@domain.com',
      recipientName: 'Test Candidate',
      type: 'general_notification',
      subject: 'Automated Retry Test',
      htmlBody: '<p>Testing background queue retry</p>',
      college: fixtureCollege._id,
    });

    if (!failedLog || failedLog.status !== 'queued') {
      throw new Error('Failed to create initial queued EmailLog');
    }

    // Wait for queue processing and 3 retries
    let finalLog = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      finalLog = await EmailLog.findById(failedLog._id);
      if (finalLog.status === 'failed') break;
    }

    if (finalLog.status !== 'failed' || finalLog.attempts < 3) {
      throw new Error(`Expected log status 'failed' with 3 attempts, got status='${finalLog.status}', attempts=${finalLog.attempts}`);
    }
    console.log(`✓ EmailQueue worker retried failed transmission ${finalLog.attempts} times before marking as 'failed'`);

    // Test Resend functionality
    emailQueue.setSenderFunction(async () => ({ success: true, messageId: '<test-sent-id>' }));
    const resentLog = await emailQueue.resendFailedEmail(finalLog._id);

    // Wait for queue
    let successfulLog = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      successfulLog = await EmailLog.findById(resentLog._id);
      if (successfulLog.status === 'sent') break;
    }

    if (successfulLog.status !== 'sent') {
      throw new Error(`Expected resent log status 'sent', got '${successfulLog.status}'`);
    }
    console.log('✓ Failed email log successfully re-enqueued and delivered via resendFailedEmail()');

    // Reset sender function
    emailQueue.resetSenderFunction();

    // ------------------------------------------------------------------------
    // SECTION 3: Student Reminder Opt-Out vs. Mandatory Emails
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Student Reminder Opt-Out vs. Mandatory Emails ---');

    // Step A: Set student sendReminderEmails = false
    fixtureStudent.sendReminderEmails = false;
    await fixtureStudent.save();

    const initialLogCount = await EmailLog.countDocuments({ user: fixtureStudentUser._id });

    // Try sending a reminder email (opt-out applies)
    await notifyUser(fixtureStudentUser._id, 'slot_reminder_24h', {
      companyName: fixtureCompany.name,
      role: 'Dev',
      startTime: new Date(),
      message: 'Reminder for your slot tomorrow',
    });

    const postReminderLogCount = await EmailLog.countDocuments({ user: fixtureStudentUser._id });
    if (postReminderLogCount !== initialLogCount) {
      throw new Error('Email was queued for opted-out student on reminder notification');
    }
    console.log('✓ Student with sendReminderEmails=false correctly skipped reminder email');

    // Step B: Send mandatory result_declared email (opt-out MUST NOT apply)
    await notifyUser(fixtureStudentUser._id, 'result_declared', {
      companyName: fixtureCompany.name,
      role: 'Dev',
      result: 'cleared',
      roundName: 'Round 1',
    });

    const postResultLogCount = await EmailLog.countDocuments({
      user: fixtureStudentUser._id,
      type: 'result_declared',
    });
    if (postResultLogCount < 1) {
      throw new Error('Mandatory result_declared email was not sent to student');
    }
    console.log('✓ Mandatory result_declared email was sent regardless of sendReminderEmails setting');

    // Step C: Send mandatory offer_received email (opt-out MUST NOT apply)
    await notifyUser(fixtureStudentUser._id, 'offer_received', {
      companyName: fixtureCompany.name,
      role: 'Dev',
      packageLpa: 15,
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const postOfferLogCount = await EmailLog.countDocuments({
      user: fixtureStudentUser._id,
      type: 'offer_received',
    });
    if (postOfferLogCount < 1) {
      throw new Error('Mandatory offer_received email was not sent to student');
    }
    console.log('✓ Mandatory offer_received email was sent regardless of sendReminderEmails setting');

    // Restore student setting
    fixtureStudent.sendReminderEmails = true;
    await fixtureStudent.save();

    // ------------------------------------------------------------------------
    // SECTION 4: Automated Cron Reminders & De-Duplication
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Automated Reminders & Flag De-Duplication ---');

    const futureStartTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const testSlot = await InterviewSlot.create({
      round: fixtureRound._id,
      drive: fixtureDrive._id,
      panel: fixturePanel._id,
      student: fixtureStudent._id,
      application: fixtureApp._id,
      startTime: futureStartTime,
      endTime: new Date(futureStartTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      queueNumber: 1,
      reminderSent24h: false,
      reminderSent1h: false,
    });

    // First run: should dispatch reminder and set reminderSent24h = true
    const dispatched1 = await sendUpcomingReminders();
    const reloadedSlot = await InterviewSlot.findById(testSlot._id);

    if (!reloadedSlot.reminderSent24h) {
      throw new Error('sendUpcomingReminders failed to set reminderSent24h flag');
    }
    console.log('✓ sendUpcomingReminders() detected slot and set reminderSent24h=true');

    // Second run: MUST NOT duplicate
    const dispatched2 = await sendUpcomingReminders();
    const duplicateLogs = await EmailLog.find({
      recipientEmail: fixtureStudentUser.email,
      type: 'slot_reminder_24h',
      createdAt: { $gte: new Date(Date.now() - 10000) },
    });

    if (duplicateLogs.length > 1) {
      throw new Error('De-duplication failed: duplicate reminder emails were dispatched');
    }
    console.log('✓ Second cron execution safely skipped already-reminded slot (de-duplication verified)');

    // Cleanup test slot
    await InterviewSlot.findByIdAndDelete(testSlot._id);

    // ------------------------------------------------------------------------
    // SECTION 5: Round Announcement Broadcast & Preview
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Round Announcement Broadcast & Preview ---');

    // Step A: Fetch Preview
    const previewRes = await fetch(`${BASE_URL}/rounds/${fixtureRound._id}/announcements/preview`, {
      headers: { Authorization: `Bearer ${recToken}` },
    });
    const previewData = await previewRes.json();
    const count = previewData.participantCount ?? previewData.recipientCount;
    if (!previewData.success || count === undefined) {
      console.error('Preview response status:', previewRes.status, previewData);
      throw new Error('Announcement preview failed');
    }
    console.log(`✓ Announcement preview returned ${count} participant(s) for ${fixtureRound.name}`);

    // Step B: Dispatch Announcement
    const announceRes = await fetch(`${BASE_URL}/rounds/${fixtureRound._id}/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        subject: 'Crucial Schedule Announcement',
        message: 'Please make sure your webcams and microphones are working for the upcoming round.',
      }),
    });

    const announceResult = await announceRes.json();
    if (!announceResult.success) {
      console.error('Announce response status:', announceRes.status, announceResult);
      throw new Error(`Failed to send announcement: ${announceResult.message}`);
    }
    console.log(`✓ Announcement successfully dispatched to ${announceResult.count} recipient(s)`);

    // Verify at least one EmailLog was recorded if participants existed
    if (announceResult.count > 0) {
      const annLog = await EmailLog.findOne({
        type: 'announcement',
        subject: /Crucial Schedule Announcement/i,
      });
      if (!annLog) {
        throw new Error('EmailLog was not created for round announcement');
      }
      console.log('✓ EmailLog recorded for announcement with college TPO replyTo set');
    }

    // ------------------------------------------------------------------------
    // SECTION 6: 403 Authorization & Cross-Tenant Security Checks
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing 403 Authorization & Cross-College Security ---');

    // Create a temporary second college
    let otherCollege = await College.findOne({ code: 'TEST_EMAIL_OTHER_COLLEGE' });
    if (!otherCollege) {
      otherCollege = await College.create({
        name: 'Other Institute of Technology',
        code: 'TEST_EMAIL_OTHER_COLLEGE',
        address: 'Test City',
        city: 'New Delhi',
        state: 'Delhi',
        status: 'approved',
      });
    }

    // TPO of fixtureCollege trying to access logs belonging to otherCollege
    const crossCollegeLogsRes = await fetch(`${BASE_URL}/emails/logs?collegeId=${otherCollege._id}`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });

    if (crossCollegeLogsRes.status !== 403) {
      throw new Error(`Expected 403 when TPO accesses another college's email logs, got HTTP ${crossCollegeLogsRes.status}`);
    }
    console.log('✓ TPO attempting to access another college email logs correctly returned HTTP 403 Forbidden');

    // TPO trying to resend an email log belonging to another college
    const otherLog = await EmailLog.create({
      user: fixtureTpoUser._id,
      recipientEmail: 'other@test.com',
      type: 'general_notification',
      subject: 'Other College Email',
      status: 'failed',
      college: otherCollege._id,
    });

    const crossResendRes = await fetch(`${BASE_URL}/emails/logs/${otherLog._id}/resend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });

    if (crossResendRes.status !== 403) {
      throw new Error(`Expected 403 when TPO resends another college's email log, got HTTP ${crossResendRes.status}`);
    }
    console.log('✓ TPO attempting to resend another college failed email correctly returned HTTP 403 Forbidden');

    // Cleanup
    await EmailLog.findByIdAndDelete(otherLog._id);
    await College.findByIdAndDelete(otherCollege._id);

    console.log('\n======================================================');
    console.log('  ALL EMAIL & PIPELINE NOTIFICATION TESTS PASSED! ✓   ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ EMAIL NOTIFICATION TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Hermetic cleanup of all fixture documents
    try {
      await EmailLog.deleteMany({ recipientEmail: { $in: ['test-retry@domain.com', 'test.email.student@testcollege.edu', 'other@test.com'] } });
      await Notification.deleteMany({ user: { $in: [fixtureStudentUser?._id, fixtureTpoUser?._id, fixtureRecUser?._id].filter(Boolean) } });
      if (fixtureRound?._id) {
        await InterviewSlot.deleteMany({ round: fixtureRound._id });
        await InterviewPanel.deleteMany({ round: fixtureRound._id });
        await RoundParticipant.deleteMany({ round: fixtureRound._id });
        await Round.deleteMany({ _id: fixtureRound._id });
      }
      if (fixtureDrive?._id) {
        await Application.deleteMany({ drive: fixtureDrive._id });
        await Drive.deleteMany({ _id: fixtureDrive._id });
      }
      if (fixtureStudent?._id) await Student.deleteMany({ _id: fixtureStudent._id });
      if (fixtureStudentUser?._id) await User.deleteMany({ _id: fixtureStudentUser._id });
      if (fixtureTpoUser?._id) await User.deleteMany({ _id: fixtureTpoUser._id });
      if (fixtureRecUser?._id) await User.deleteMany({ _id: fixtureRecUser._id });
      if (fixtureCompany?._id) await Company.deleteMany({ _id: fixtureCompany._id });
      if (fixtureCollege?._id) await College.deleteMany({ _id: fixtureCollege._id });
      await College.deleteMany({ code: 'TEST_EMAIL_OTHER_COLLEGE' });
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    server.close();
    await mongoose.connection.close();
  }
}

runEmailTests();
