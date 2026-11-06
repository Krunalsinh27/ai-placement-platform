const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  Round,
  RoundParticipant,
  InterviewPanel,
  InterviewSlot,
  EmailLog,
  Notification,
} = require('../models');

const migrateExistingPipelineData = require('../utils/migratePipeline');

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026',
    { expiresIn: '1d' }
  );
}

async function runDeliveryTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management');
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/slots', require('../routes/slotRoutes'));
  app.use('/api/panels', require('../routes/panelRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/notifications', require('../routes/notificationRoutes'));

  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const PORT = 5099;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('    TASK 32A: DELIVERY MODES & INTERVIEW CLEANUP TESTS ');
    console.log('======================================================\n');

    // ------------------------------------------------------------------------
    // SETUP: Colleges, Companies, Users, Tokens
    // ------------------------------------------------------------------------
    console.log('--- Setting up Test Data ---');
    let collegeA = await College.findOne({ code: 'NITD' });
    if (!collegeA) {
      collegeA = await College.create({ name: 'NIT Delhi', code: 'NITD', location: 'Delhi' });
    }
    let collegeB = await College.findOne({ code: 'PICT' });
    if (!collegeB) {
      collegeB = await College.create({ name: 'PICT Pune', code: 'PICT', location: 'Pune' });
    }

    let companyA = await Company.findOne({ name: 'Google' });
    if (!companyA) {
      companyA = await Company.create({ name: 'Google', industry: 'Technology', verified: true });
    }
    let companyB = await Company.findOne({ name: 'Microsoft' });
    if (!companyB) {
      companyB = await Company.create({ name: 'Microsoft', industry: 'Technology', verified: true });
    }

    // TPO A (College A)
    let tpoA = await User.findOne({ email: 'admin@college.com' });
    if (!tpoA) {
      tpoA = await User.create({
        name: 'TPO Delhi',
        email: 'admin@college.com',
        password: 'Admin@123',
        role: 'tpo',
        college: collegeA._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // TPO B (College B)
    let tpoB = await User.findOne({ email: 'tpo.pict@college.com' });
    if (!tpoB) {
      tpoB = await User.create({
        name: 'TPO Pune',
        email: 'tpo.pict@college.com',
        password: 'Admin@123',
        role: 'tpo',
        college: collegeB._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Recruiter A (Google)
    let recA = await User.findOne({ email: 'recruiter@google.com' });
    if (!recA) {
      recA = await User.create({
        name: 'Google Recruiter',
        email: 'recruiter@google.com',
        password: 'Recruiter@123',
        role: 'recruiter',
        company: companyA._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Recruiter B (Microsoft)
    let recB = await User.findOne({ email: 'recruiter@microsoft.com' });
    if (!recB) {
      recB = await User.create({
        name: 'Microsoft Recruiter',
        email: 'recruiter@microsoft.com',
        password: 'Recruiter@123',
        role: 'recruiter',
        company: companyB._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    // Students from College A
    let students = await Student.find({ college: collegeA._id }).populate('user').limit(2);
    if (students.length < 2) {
      throw new Error('Expected at least 2 students in College A');
    }
    const student1 = students[0];
    const student2 = students[1];

    const tpoAToken = createToken(tpoA);
    const tpoBToken = createToken(tpoB);
    const recAToken = createToken(recA);
    const recBToken = createToken(recB);
    const st1Token = createToken(student1.user);
    const st2Token = createToken(student2.user);

    console.log('✓ Users authenticated & tokens generated');

    // Clean up previous test artifacts
    const testRole = 'Task 32A Platform Systems Specialist';
    const oldDrives = await Drive.find({ role: testRole });
    const oldDriveIds = oldDrives.map((d) => d._id);
    await InterviewSlot.deleteMany({ drive: { $in: oldDriveIds } });
    await InterviewPanel.deleteMany({ drive: { $in: oldDriveIds } });
    await RoundParticipant.deleteMany({ drive: { $in: oldDriveIds } });
    await Round.deleteMany({ drive: { $in: oldDriveIds } });
    await Application.deleteMany({ drive: { $in: oldDriveIds } });
    await Drive.deleteMany({ _id: { $in: oldDriveIds } });

    // Create Drive for Company A at College A
    const testDrive = await Drive.create({
      college: collegeA._id,
      company: companyA._id,
      role: testRole,
      description: 'Test Drive for delivery mode validation',
      packageLpa: 28,
      location: 'Bengaluru / Hybrid',
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      driveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'closed',
      applicationsClosed: true,
    });

    const app1 = await Application.create({
      drive: testDrive._id,
      student: student1._id,
      college: collegeA._id,
      status: 'shortlisted',
    });
    const app2 = await Application.create({
      drive: testDrive._id,
      student: student2._id,
      college: collegeA._id,
      status: 'shortlisted',
    });

    // Create Round 1 (Aptitude) & Round 2 (Technical Interview)
    const round1 = await Round.create({
      drive: testDrive._id,
      name: 'Round 1: Online Aptitude',
      order: 1,
      type: 'aptitude',
      status: 'ongoing',
    });

    const round2 = await Round.create({
      drive: testDrive._id,
      name: 'Round 2: Technical Interview',
      order: 2,
      type: 'technical',
      status: 'scheduled',
    });

    const p1 = await RoundParticipant.create({
      round: round1._id,
      drive: testDrive._id,
      student: student1._id,
      application: app1._id,
      attendance: 'present',
      result: 'pending',
    });

    const p2 = await RoundParticipant.create({
      round: round1._id,
      drive: testDrive._id,
      student: student2._id,
      application: app2._id,
      attendance: 'present',
      result: 'pending',
    });

    console.log('✓ Test drive, applications, and rounds seeded successfully');

    // ------------------------------------------------------------------------
    // SCENARIO 1: Delivery Mode API Validations
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Delivery Mode API Validations ---');

    // 1A: Attempt platform_test on a technical interview round -> 400
    const res1A = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({ deliveryMode: 'platform_test' }),
    });
    const data1A = await res1A.json();
    if (res1A.status !== 400 || !data1A.message.includes('Platform test delivery mode is only allowed for aptitude and coding rounds')) {
      throw new Error(`1A failed: expected 400 for platform_test on interview round, got ${res1A.status}: ${data1A.message}`);
    }
    console.log('✓ 1A: platform_test blocked for interview rounds with 400');

    // 1B: Attempt online_external with invalid link URL -> 400
    const res1B = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({ deliveryMode: 'online_external', venueOrLink: 'invalid-external-meeting-url' }),
    });
    const data1B = await res1B.json();
    if (res1B.status !== 400 || !data1B.message.includes('valid URL starting with http:// or https://')) {
      throw new Error(`1B failed: expected 400 for invalid link URL, got ${res1B.status}: ${data1B.message}`);
    }
    console.log('✓ 1B: online_external validated URL format with 400');

    // 1C: Attempt offline_campus with empty venue -> 400
    const res1C = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({ deliveryMode: 'offline_campus', venueOrLink: '' }),
    });
    const data1C = await res1C.json();
    if (res1C.status !== 400 || !data1C.message.includes('Venue is required for offline campus rounds')) {
      throw new Error(`1C failed: expected 400 for empty venue in offline_campus, got ${res1C.status}: ${data1C.message}`);
    }
    console.log('✓ 1C: offline_campus requires venue with 400');

    // 1D: Valid update: Round 1 platform_test with duration and cutoff -> 200
    const winStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const winEnd = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const res1D = await fetch(`${BASE_URL}/rounds/${round1._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        deliveryMode: 'platform_test',
        durationMinutes: 45,
        cutoffScore: 65,
        testWindowStart: winStart.toISOString(),
        testWindowEnd: winEnd.toISOString(),
      }),
    });
    const data1D = await res1D.json();
    if (res1D.status !== 200 || data1D.round.deliveryMode !== 'platform_test' || data1D.round.mode !== 'online') {
      throw new Error(`1D failed: platform_test update failed: ${JSON.stringify(data1D)}`);
    }
    console.log('✓ 1D: platform_test successfully configured on aptitude round');

    // 1E: Valid update: Round 2 offline_campus with venue and reportByTime -> 200
    const res1E = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        deliveryMode: 'offline_campus',
        venueOrLink: 'Seminar Hall Block B',
        reportByTime: '09:00 AM',
      }),
    });
    const data1E = await res1E.json();
    if (res1E.status !== 200 || data1E.round.deliveryMode !== 'offline_campus' || data1E.round.mode !== 'offline' || data1E.round.reportByTime !== '09:00 AM') {
      throw new Error(`1E failed: offline_campus update failed: ${JSON.stringify(data1E)}`);
    }
    console.log('✓ 1E: offline_campus successfully configured with venue and reportByTime');

    // 1F: Valid update: Round 2 switched to online_external with valid meeting link -> 200
    const res1F = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        deliveryMode: 'online_external',
        venueOrLink: 'https://meet.google.com/test-valid-meeting-link',
      }),
    });
    const data1F = await res1F.json();
    if (res1F.status !== 200 || data1F.round.deliveryMode !== 'online_external' || data1F.round.mode !== 'online') {
      throw new Error(`1F failed: online_external update failed: ${JSON.stringify(data1F)}`);
    }
    console.log('✓ 1F: online_external successfully configured with valid meeting link');

    // ------------------------------------------------------------------------
    // SCENARIO 2: Slot Responses (No Embedded-Room Data & Completed Slots Non-Joinable)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Slot Responses & Embedded-Room Removal ---');

    // Enroll students in Round 2 for slot auto-scheduling
    const pRound2St1 = await RoundParticipant.create({
      round: round2._id,
      drive: testDrive._id,
      student: student1._id,
      application: app1._id,
      attendance: 'pending',
      result: 'pending',
    });

    // Create interview panel with room
    const panelRes = await fetch(`${BASE_URL}/rounds/${round2._id}/panels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        name: 'Technical Panel 1',
        room: 'Cabin 304',
        venueOrLink: 'https://meet.google.com/panel-cabin-304',
        interviewers: [{ name: 'Senior Architect', email: 'architect@google.com' }],
        capacity: 10,
      }),
    });
    const panelData = await panelRes.json();
    if (panelRes.status !== 201 || !panelData.panel) {
      throw new Error(`Panel creation failed: ${JSON.stringify(panelData)}`);
    }
    const panel = panelData.panel;
    console.log('✓ Interview panel created with room: Cabin 304');

    // Auto-schedule slots
    const slotStartTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduleRes = await fetch(`${BASE_URL}/rounds/${round2._id}/slots/auto-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        startTime: slotStartTime.toISOString(),
        slotDurationMinutes: 30,
      }),
    });
    const scheduleData = await scheduleRes.json();
    if (scheduleRes.status !== 201 || !scheduleData.slotsCount || scheduleData.slotsCount === 0) {
      throw new Error(`Slot scheduling failed: ${JSON.stringify(scheduleData)}`);
    }
    const slot = await InterviewSlot.findOne({ round: round2._id });
    if (!slot) {
      throw new Error('InterviewSlot was not created in database');
    }

    // Assert meetingLink does NOT contain random Jitsi URL
    if (slot.meetingLink.includes('meet.jit.si')) {
      throw new Error(`Auto-scheduled slot contains legacy random Jitsi link: ${slot.meetingLink}`);
    }
    if (slot.meetingLink !== 'https://meet.google.com/panel-cabin-304') {
      throw new Error(`Slot meeting link should match panel link, got: ${slot.meetingLink}`);
    }
    console.log('✓ Slot created without random Jitsi generator; stored meeting link accurately');

    // Student 1 checks slot details via GET /api/slots/:id
    const slotDetailsRes = await fetch(`${BASE_URL}/slots/${slot._id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotDetails = await slotDetailsRes.json();
    if (slotDetailsRes.status !== 200 || !slotDetails.slot) {
      throw new Error(`Failed to fetch slot details: ${JSON.stringify(slotDetails)}`);
    }

    // Verify response contains NO embedded room token or iframe properties
    if (slotDetails.slot.embedToken || slotDetails.slot.jaasToken || slotDetails.slot.iframeUrl) {
      throw new Error('Slot details still return legacy embedded iframe/JaaS tokens');
    }
    console.log('✓ GET /api/slots/:id verified: no iframe/JaaS embed tokens returned');

    // Recruiter updates slot status to 'completed'
    const completeRes = await fetch(`${BASE_URL}/slots/${slot._id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({ status: 'completed' }),
    });
    const completeData = await completeRes.json();
    if (completeRes.status !== 200 || completeData.slot.status !== 'completed') {
      throw new Error(`Failed to set slot status to completed: ${JSON.stringify(completeData)}`);
    }

    // Student checks slot details again -> canJoin MUST be false for completed slot
    const slotCompletedRes = await fetch(`${BASE_URL}/slots/${slot._id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotCompletedData = await slotCompletedRes.json();
    if (slotCompletedData.canJoin !== false) {
      throw new Error(`Completed slot returned canJoin: ${slotCompletedData.canJoin}, expected false`);
    }
    console.log('✓ Completed slot strictly returns canJoin: false (no join button/room rendered)');

    // ------------------------------------------------------------------------
    // SCENARIO 3: Schedule-Change Notification & Email Diff
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Schedule-Change Notification & Email Diff ---');

    // Clear previous schedule_updated emails for clean counting
    await EmailLog.deleteMany({ type: 'schedule_updated' });

    // Update Round 2 schedule with notifyStudents: true and modified fields
    const updatedDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const newMeetingLink = 'https://meet.google.com/updated-room-link-999';

    const notifyUpdateRes = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        date: updatedDate.toISOString(),
        venueOrLink: newMeetingLink,
        notifyStudents: true,
      }),
    });
    const notifyUpdateData = await notifyUpdateRes.json();
    if (notifyUpdateRes.status !== 200) {
      throw new Error(`Failed to update round settings: ${JSON.stringify(notifyUpdateData)}`);
    }

    if (!notifyUpdateData.changes || notifyUpdateData.changes.length === 0) {
      throw new Error('Expected changes array to contain changed fields');
    }
    if (notifyUpdateData.notifiedCount < 1) {
      throw new Error(`Expected notifiedCount >= 1, got ${notifyUpdateData.notifiedCount}`);
    }

    // Allow background async notification/email queuing to finish
    await new Promise((r) => setTimeout(r, 400));

    const emailLogs = await EmailLog.find({ type: 'schedule_updated' });
    if (emailLogs.length === 0) {
      throw new Error('Expected schedule_updated EmailLog entry to be created');
    }

    const firstEmail = emailLogs[0];
    const emailContent = firstEmail.htmlBody || firstEmail.textBody || '';
    if (!firstEmail.subject.includes('Schedule Updated') || !emailContent.includes('updated-room-link-999')) {
      throw new Error(`Email diff missing updated value. Subject: ${firstEmail.subject}`);
    }
    console.log(`✓ Schedule update notification & email diff sent successfully (${emailLogs.length} logged)`);

    // Resend IDENTICAL payload with notifyStudents: true (No changes)
    const noChangeRes = await fetch(`${BASE_URL}/rounds/${round2._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
      body: JSON.stringify({
        date: updatedDate.toISOString(),
        venueOrLink: newMeetingLink,
        notifyStudents: true,
      }),
    });
    const noChangeData = await noChangeRes.json();
    if (noChangeData.changes.length !== 0 || noChangeData.notifiedCount !== 0) {
      throw new Error(`Expected 0 changes and 0 notifications for duplicate save, got changes: ${noChangeData.changes.length}, notified: ${noChangeData.notifiedCount}`);
    }

    const emailCountAfter = await EmailLog.countDocuments({ type: 'schedule_updated' });
    if (emailCountAfter !== emailLogs.length) {
      throw new Error('Duplicate email was sent when no schedule fields were modified');
    }
    console.log('✓ Duplicate check passed: no emails sent when schedule values did not change');

    // ------------------------------------------------------------------------
    // SCENARIO 4: Cleared vs Not-Cleared Results Notification
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Cleared vs Not-Cleared Results Notification ---');

    // Update Round 1 participants: student1 cleared, student2 rejected
    p1.attendance = 'present';
    p1.result = 'cleared';
    p1.score = 88;
    await p1.save();

    p2.attendance = 'present';
    p2.result = 'rejected';
    p2.score = 42;
    await p2.save();

    // Clear previous notifications for students
    await Notification.deleteMany({ user: { $in: [student1.user._id, student2.user._id] } });

    // Recruiter publishes round results
    const publishRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recAToken}` },
    });
    const publishData = await publishRes.json();
    if (publishRes.status !== 200) {
      throw new Error(`Publish results failed: ${JSON.stringify(publishData)}`);
    }

    await new Promise((r) => setTimeout(r, 400));

    // Verify student 1 received shortlisted notification
    const st1Notif = await Notification.findOne({ user: student1.user._id, type: 'status_change' });
    if (!st1Notif || !st1Notif.message.includes('You are shortlisted for the next round, schedule will follow')) {
      throw new Error(`Student 1 missing shortlist message: ${st1Notif?.message}`);
    }
    console.log('✓ Cleared student received exact message: "You are shortlisted for the next round, schedule will follow."');

    // Verify student 2 received not selected notification
    const st2Notif = await Notification.findOne({ user: student2.user._id, type: 'status_change' });
    if (!st2Notif || !st2Notif.message.includes('not selected')) {
      throw new Error(`Student 2 missing not-selected notification: ${st2Notif?.message}`);
    }
    console.log('✓ Rejected student received result notification indicating not selected');

    // ------------------------------------------------------------------------
    // SCENARIO 5: Printable Attendance Sheet PDF & Authorization Checks
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Printable Attendance Sheet PDF & RBAC ---');

    // 5A: Recruiter A (Google) downloads attendance PDF -> 200
    const recPdfRes = await fetch(`${BASE_URL}/rounds/${round1._id}/attendance/pdf`, {
      headers: { Authorization: `Bearer ${recAToken}` },
    });
    if (recPdfRes.status !== 200) {
      throw new Error(`Recruiter A PDF download failed with status ${recPdfRes.status}`);
    }
    const recContentType = recPdfRes.headers.get('content-type');
    if (!recContentType || !recContentType.includes('application/pdf')) {
      throw new Error(`Expected application/pdf content type, got: ${recContentType}`);
    }
    const pdfArrayBuffer = await recPdfRes.arrayBuffer();
    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    if (!pdfBuffer.slice(0, 4).toString().startsWith('%PDF')) {
      throw new Error('Downloaded file does not start with %PDF magic header');
    }
    console.log(`✓ Recruiter A successfully generated attendance PDF (${pdfBuffer.length} bytes)`);

    // 5B: TPO A (NITD) downloads attendance PDF -> 200
    const tpoPdfRes = await fetch(`${BASE_URL}/rounds/${round1._id}/attendance/pdf`, {
      headers: { Authorization: `Bearer ${tpoAToken}` },
    });
    if (tpoPdfRes.status !== 200) {
      throw new Error(`TPO A PDF download failed with status ${tpoPdfRes.status}`);
    }
    console.log('✓ College TPO A successfully downloaded attendance PDF');

    // 5C: Recruiter B (Microsoft) attempts attendance PDF -> 403
    const recBPdfRes = await fetch(`${BASE_URL}/rounds/${round1._id}/attendance/pdf`, {
      headers: { Authorization: `Bearer ${recBToken}` },
    });
    if (recBPdfRes.status !== 403) {
      throw new Error(`Expected 403 for Recruiter B on other company round, got ${recBPdfRes.status}`);
    }
    console.log('✓ Cross-company Recruiter B blocked with 403 Forbidden');

    // 5D: TPO B (PICT Pune) attempts attendance PDF -> 403
    const tpoBPdfRes = await fetch(`${BASE_URL}/rounds/${round1._id}/attendance/pdf`, {
      headers: { Authorization: `Bearer ${tpoBToken}` },
    });
    if (tpoBPdfRes.status !== 403) {
      throw new Error(`Expected 403 for TPO B on other college round, got ${tpoBPdfRes.status}`);
    }
    console.log('✓ Cross-college TPO B blocked with 403 Forbidden');

    // 5E: TPO A attempts to modify round settings -> 403
    const tpoUpdateRes = await fetch(`${BASE_URL}/rounds/${round1._id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tpoAToken}` },
      body: JSON.stringify({ name: 'Hacked Round Name' }),
    });
    if (tpoUpdateRes.status !== 403) {
      throw new Error(`Expected 403 when TPO attempts to modify round settings, got ${tpoUpdateRes.status}`);
    }
    console.log('✓ TPO modification of round settings blocked with 403 Forbidden (Recruiter only)');

    // ------------------------------------------------------------------------
    // SCENARIO 6: Data Migration (migrateExistingPipelineData)
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Data Migration for Existing Rounds ---');

    // Create unmigrated rounds lacking deliveryMode
    const unmigratedOnline = await Round.create({
      drive: testDrive._id,
      name: 'Unmigrated Online Round',
      order: 10,
      type: 'technical',
      venueOrLink: 'https://teams.microsoft.com/l/meetup-join/test-room',
      deliveryMode: '',
    });

    const unmigratedOffline = await Round.create({
      drive: testDrive._id,
      name: 'Unmigrated Offline Round',
      order: 11,
      type: 'technical',
      venueOrLink: 'Seminar Hall 3',
      deliveryMode: '',
    });

    await migrateExistingPipelineData();

    const migratedOnline = await Round.findById(unmigratedOnline._id);
    const migratedOffline = await Round.findById(unmigratedOffline._id);

    if (migratedOnline.deliveryMode !== 'online_external' || migratedOnline.mode !== 'online') {
      throw new Error(`Online round failed migration: deliveryMode=${migratedOnline.deliveryMode}, mode=${migratedOnline.mode}`);
    }
    if (migratedOffline.deliveryMode !== 'offline_campus' || migratedOffline.mode !== 'offline') {
      throw new Error(`Offline round failed migration: deliveryMode=${migratedOffline.deliveryMode}, mode=${migratedOffline.mode}`);
    }
    console.log('✓ Migration verified: online link mapped to online_external, campus venue mapped to offline_campus');

    // Cleanup test data
    await Round.deleteMany({ _id: { $in: [unmigratedOnline._id, unmigratedOffline._id, round1._id, round2._id] } });
    await InterviewSlot.deleteMany({ drive: testDrive._id });
    await InterviewPanel.deleteMany({ drive: testDrive._id });
    await RoundParticipant.deleteMany({ drive: testDrive._id });
    await Application.deleteMany({ drive: testDrive._id });
    await Drive.deleteMany({ _id: testDrive._id });

    console.log('\n======================================================');
    console.log('       ALL 6 TASK 32A TEST SCENARIOS PASSED!          ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ Test failure:', error);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log('Test server closed & MongoDB disconnected.');
    process.exit(process.exitCode || 0);
  }
}

runDeliveryTests();
