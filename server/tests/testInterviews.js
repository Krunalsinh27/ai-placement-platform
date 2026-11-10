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
  JobRequirement,
  Notification,
  Round,
  RoundParticipant,
  InterviewPanel,
  InterviewSlot,
  Evaluation,
} = require('../models');

async function runInterviewTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(getTestDbUri());
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/notifications', require('../routes/notificationRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/panels', require('../routes/panelRoutes'));
  app.use('/api/slots', require('../routes/slotRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));

  const PORT = 5097;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('    TASK 29B: INTERVIEW CONDUCT & MANAGEMENT TESTS     ');
    console.log('======================================================\n');

    // 1. Authenticate TPO, Google Recruiter, and Students
    console.log('--- 1. Authenticating test users ---');

    let college = await College.findOne({ code: 'NITD' });
    if (!college) {
      college = await College.create({
        name: 'National Institute of Technology Delhi',
        code: 'NITD',
        city: 'New Delhi',
        state: 'Delhi',
        status: 'approved',
      });
    }

    let googleCompany = await Company.findOne({ name: /Google/i });
    if (!googleCompany) {
      googleCompany = await Company.create({
        name: 'Google',
        industry: 'Technology',
        verified: true,
      });
    }

    let tpoUser = await User.findOne({ email: 'admin@college.com' });
    if (!tpoUser) {
      tpoUser = await User.create({
        name: 'TPO Administrator',
        email: 'admin@college.com',
        password: 'Admin@123',
        role: 'tpo',
        college: college._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    let recUser = await User.findOne({ email: 'recruiter@google.com' });
    if (!recUser) {
      recUser = await User.create({
        name: 'Google Recruiter',
        email: 'recruiter@google.com',
        password: 'Recruiter@123',
        role: 'recruiter',
        company: googleCompany._id,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    let students = await Student.find({ college: college._id }).populate('user').limit(4);
    while (students.length < 3) {
      const idx = students.length + 1;
      const u = await User.create({
        name: `Interview Student ${idx}`,
        email: `interview.student${idx}@nitd.edu`,
        password: 'Student@123',
        role: 'student',
        college: college._id,
        isApproved: true,
        isEmailVerified: true,
      });
      const s = await Student.create({
        user: u._id,
        college: college._id,
        enrollmentNo: `NITD_INT_${idx}`,
        branch: 'CSE',
        batchYear: 2026,
        cgpa: 8.5,
        backlogs: 0,
        phone: '9876543210',
      });
      s.user = u;
      students.push(s);
    }

    const tpoRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@college.com', password: 'Admin@123' }),
    });
    const tpoData = await tpoRes.json();
    const tpoToken = tpoData.token;
    if (!tpoToken) throw new Error('TPO login failed');
    console.log('✓ TPO authenticated:', tpoData.user.name);

    const recRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recruiter@google.com', password: 'Recruiter@123' }),
    });
    const recData = await recRes.json();
    const recToken = recData.token;
    if (!recToken) throw new Error('Google Recruiter login failed');
    console.log('✓ Recruiter authenticated:', recData.user.name, `(${recData.user.company?.name})`);

    const student1 = students[0];
    const student2 = students[1];
    const student3 = students[2];

    const st1Login = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student1.user.email, password: 'Student@123' }),
    });
    const st1Data = await st1Login.json();
    const st1Token = st1Data.token;

    // Cleanup any lingering artifacts from previous test runs
    const oldDrives = await Drive.find({ role: 'Full Stack Systems Engineer' });
    const oldDriveIds = oldDrives.map((d) => d._id);
    await Evaluation.deleteMany({ drive: { $in: oldDriveIds } });
    await InterviewSlot.deleteMany({ drive: { $in: oldDriveIds } });
    await InterviewPanel.deleteMany({ drive: { $in: oldDriveIds } });
    await RoundParticipant.deleteMany({ drive: { $in: oldDriveIds } });
    await Round.deleteMany({ drive: { $in: oldDriveIds } });
    await Application.deleteMany({ drive: { $in: oldDriveIds } });
    await Drive.deleteMany({ _id: { $in: oldDriveIds } });
    await JobRequirement.deleteMany({ title: 'Full Stack Systems Engineer' });

    // 2. Setup Test Drive & Interview Round
    console.log('\n--- 2. Setting up Test Drive & Technical Interview Round ---');
    googleCompany = await Company.findOne({ name: /Google/i });
    if (!googleCompany) throw new Error('Google company profile not found');

    const jobReq = await JobRequirement.create({
      company: googleCompany._id,
      title: 'Full Stack Systems Engineer',
      description: 'Distributed systems engineering',
      batchYear: 2026,
      packageLpa: 26,
      openings: 3,
      allowedBranches: ['CSE', 'IT'],
      selectionRounds: ['Online Assessment', 'Technical Interview', 'HR Interview'],
      status: 'published',
    });

    const testDrive = await Drive.create({
      college: college._id,
      company: googleCompany._id,
      jobRequirement: jobReq._id,
      role: 'Full Stack Systems Engineer',
      packageLpa: 26,
      location: 'Hyderabad',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: new Date(Date.now() + 5 * 86400000),
      driveDate: new Date(Date.now() + 10 * 86400000),
      status: 'closed',
      applicationsClosed: true,
      listFrozenAt: new Date(),
    });

    const interviewRound = await Round.create({
      drive: testDrive._id,
      name: 'Round 2: Technical Interview',
      order: 2,
      type: 'technical',
      mode: 'online',
      status: 'scheduled',
      slotDurationMinutes: 30,
      evaluationCriteria: ['technical', 'problemSolving', 'communication'],
    });

    // Enroll students into the round
    const app1 = await Application.create({ drive: testDrive._id, student: student1._id, status: 'applied' });
    const app2 = await Application.create({ drive: testDrive._id, student: student2._id, status: 'applied' });
    const app3 = await Application.create({ drive: testDrive._id, student: student3._id, status: 'applied' });

    await RoundParticipant.create({
      round: interviewRound._id,
      drive: testDrive._id,
      student: student1._id,
      application: app1._id,
      attendance: 'pending',
      result: 'pending',
    });
    await RoundParticipant.create({
      round: interviewRound._id,
      drive: testDrive._id,
      student: student2._id,
      application: app2._id,
      attendance: 'pending',
      result: 'pending',
    });
    await RoundParticipant.create({
      round: interviewRound._id,
      drive: testDrive._id,
      student: student3._id,
      application: app3._id,
      attendance: 'pending',
      result: 'pending',
    });

    console.log('✓ Test drive and Technical Interview round created with 3 enrolled candidates');

    // 3. Test Panel Management (CRUD)
    console.log('\n--- 3. Testing Interview Panel CRUD ---');
    // Create Panel Alpha
    const p1Res = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        name: 'Panel Alpha - Core Systems',
        interviewers: [
          { name: 'Dr. Vikram Seth', email: 'vikram.seth@google.com' },
          { name: 'Priya Raman', email: 'priya.raman@google.com' },
        ],
        venueOrLink: 'https://meet.google.com/panel-alpha-default',
        capacity: 1,
      }),
    });
    const p1Data = await p1Res.json();
    if (!p1Res.ok || !p1Data.success) {
      throw new Error(`Create panel failed: ${JSON.stringify(p1Data)}`);
    }
    const panelAlpha = p1Data.panel;
    console.log('✓ Panel Alpha created:', panelAlpha.name, `(${panelAlpha.interviewers.length} interviewers)`);

    // Create Panel Beta
    const p2Res = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        name: 'Panel Beta - Architecture',
        interviewers: [{ name: 'Ananya Deshmukh', email: 'ananya.d@google.com' }],
        capacity: 1,
      }),
    });
    const p2Data = await p2Res.json();
    const panelBeta = p2Data.panel;
    console.log('✓ Panel Beta created:', panelBeta.name);

    // Get Panels
    const getPanelsRes = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/panels`, {
      headers: { Authorization: `Bearer ${recToken}` },
    });
    const getPanelsData = await getPanelsRes.json();
    if (!getPanelsRes.ok || getPanelsData.panels.length !== 2) {
      throw new Error(`Expected 2 panels, found ${getPanelsData.panels?.length}`);
    }
    console.log(`✓ GET panels returned ${getPanelsData.panels.length} panels with live metrics`);

    // Update Panel
    const updatePanelRes = await fetch(`${BASE_URL}/panels/${panelAlpha._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ venueOrLink: 'https://meet.jit.si/panel-alpha-301' }),
    });
    const updatePanelData = await updatePanelRes.json();
    if (!updatePanelRes.ok || updatePanelData.panel.venueOrLink !== 'https://meet.jit.si/panel-alpha-301') {
      throw new Error('Panel update failed');
    }
    console.log('✓ Panel Alpha updated successfully with venue link');

    // 4. Test Auto-Schedule Interview Slots & Jitsi Link Generation
    console.log('\n--- 4. Testing Auto-Scheduling Slots with Unique Jitsi Links ---');
    const scheduleStartTime = new Date();
    scheduleStartTime.setHours(scheduleStartTime.getHours() + 2);

    const autoScheduleRes = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/slots/auto-schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        startTime: scheduleStartTime.toISOString(),
        slotDurationMinutes: 30,
        breakMinutes: 10,
      }),
    });
    const autoScheduleData = await autoScheduleRes.json();
    if (!autoScheduleRes.ok || !autoScheduleData.success) {
      throw new Error(`Auto-schedule failed: ${JSON.stringify(autoScheduleData)}`);
    }
    console.log(`✓ Auto-schedule generated ${autoScheduleData.slotsCount} slots across ${autoScheduleData.panelsCount} panels:`, autoScheduleData.message);

    // Verify slots in database
    const slots = await InterviewSlot.find({ round: interviewRound._id }).sort({ queueNumber: 1 });
    if (slots.length !== 3) {
      throw new Error(`Expected 3 slots for 3 candidates, found ${slots.length}`);
    }

    // Verify unique Jitsi meeting links
    for (const s of slots) {
      if (!s.meetingLink.includes('meet.jit.si')) {
        throw new Error(`Expected online mode to generate unique Jitsi link, got: ${s.meetingLink}`);
      }
    }
    console.log('✓ Verified: Each online interview slot received a unique Jitsi meeting room link:');
    console.log(`   Sample Link: ${slots[0].meetingLink}`);

    // Verify student 1 notification
    const st1Notif = await Notification.findOne({ user: student1.user._id, type: 'slot_assigned' });
    if (!st1Notif) {
      throw new Error('Student 1 should have received slot_assigned notification');
    }
    console.log('✓ Student received slot assignment notification:', st1Notif.message);

    // 5. Test Clash Detection: Prevent Panel Double-Booking
    console.log('\n--- 5. Testing Clash Detection (Panel Double-Booking) ---');
    const panelClashCheck = await InterviewSlot.create({
      round: interviewRound._id,
      drive: testDrive._id,
      panel: panelAlpha._id,
      student: new mongoose.Types.ObjectId(),
      application: new mongoose.Types.ObjectId(),
      startTime: slots[0].startTime,
      endTime: slots[0].endTime,
      meetingLink: 'https://meet.jit.si/clash-test',
      status: 'scheduled',
      queueNumber: 99,
    });

    const { checkPanelClash } = require('../utils/interviewService');
    const clashResult = await checkPanelClash(panelAlpha._id, slots[0].startTime, slots[0].endTime);
    if (!clashResult.hasClash) {
      throw new Error('Panel clash should have been detected for overlapping slot');
    }
    console.log('✓ Panel double-booking clash detected and prevented:', clashResult.clashInfo);
    await InterviewSlot.findByIdAndDelete(panelClashCheck._id);

    // 6. Test Queue Flow: Check-in, "Call Next", & Status Transitions
    console.log('\n--- 6. Testing Live Queue Flow & "Call Next" ---');
    const slot1 = slots[0];

    // Check-in
    const checkinRes = await fetch(`${BASE_URL}/slots/${slot1._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ status: 'checked_in' }),
    });
    const checkinData = await checkinRes.json();
    if (!checkinRes.ok || checkinData.slot.status !== 'checked_in') {
      throw new Error('Check-in status transition failed');
    }
    console.log('✓ Candidate checked in for slot 1');

    // Call Next candidate for Panel Alpha
    const callNextRes = await fetch(`${BASE_URL}/panels/${slot1.panel._id}/call-next`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
    });
    const callNextData = await callNextRes.json();
    if (!callNextRes.ok || !callNextData.success) {
      throw new Error(`Call next failed: ${JSON.stringify(callNextData)}`);
    }
    if (callNextData.slot.status !== 'in_progress') {
      throw new Error(`Expected status in_progress, got ${callNextData.slot.status}`);
    }
    console.log('✓ "Call next candidate" triggered:', callNextData.message);

    // Verify called_next notification
    const calledNotif = await Notification.findOne({ user: slot1.student, type: 'called_next' });
    console.log('✓ Candidate notified of in-progress interview call');

    // 7. Test Evaluation Submission & Outcome Calculation
    console.log('\n--- 7. Testing Evaluation Submission & RoundParticipant Update ---');
    const evalRes = await fetch(`${BASE_URL}/slots/${slot1._id}/evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        criteriaScores: {
          technical: 5,
          problemSolving: 4,
          communication: 5,
        },
        comments: 'Exceptional deep knowledge of distributed systems and clean API design.',
        recommendation: 'strong_hire',
        sharedWithStudent: true,
      }),
    });
    const evalData = await evalRes.json();
    if (!evalRes.ok || !evalData.success) {
      throw new Error(`Evaluation submission failed: ${JSON.stringify(evalData)}`);
    }

    // Expected score: ((5+4+5)/15)*100 = 93
    if (evalData.calculatedScore !== 93) {
      throw new Error(`Expected score 93, got: ${evalData.calculatedScore}`);
    }
    if (evalData.suggestedResult !== 'cleared') {
      throw new Error(`Expected suggestedResult cleared, got: ${evalData.suggestedResult}`);
    }
    console.log(`✓ Evaluation saved with aggregate score: ${evalData.calculatedScore}/100, recommendation: strong_hire`);

    // Verify slot marked completed
    const refreshedSlot1 = await InterviewSlot.findById(slot1._id);
    if (refreshedSlot1.status !== 'completed') {
      throw new Error(`Slot should be completed, got: ${refreshedSlot1.status}`);
    }

    // Verify RoundParticipant updated
    const r1Part = await RoundParticipant.findOne({ round: interviewRound._id, student: slot1.student });
    if (r1Part.result !== 'cleared' || r1Part.score !== 93 || r1Part.attendance !== 'present') {
      throw new Error(`RoundParticipant not updated properly: ${JSON.stringify(r1Part)}`);
    }
    console.log('✓ Verified: RoundParticipant automatically updated with attendance="present", score=93, result="cleared"');

    // 8. Test No-Show & TPO Re-Test Authorization
    console.log('\n--- 8. Testing No-Show Flow & TPO Re-Test Grant ---');
    const slot2 = slots[1];

    // Mark slot 2 as no_show
    const noShowRes = await fetch(`${BASE_URL}/slots/${slot2._id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ status: 'no_show' }),
    });
    const noShowData = await noShowRes.json();
    if (!noShowRes.ok || noShowData.slot.status !== 'no_show') {
      throw new Error('No-show status transition failed');
    }
    console.log('✓ Slot 2 marked as no-show');

    // Verify RoundParticipant is rejected and marked absent
    const r2Part = await RoundParticipant.findOne({ round: interviewRound._id, student: slot2.student });
    if (r2Part.result !== 'rejected' || r2Part.attendance !== 'absent') {
      throw new Error(`No-show candidate should be rejected and absent, got: ${r2Part.result}, ${r2Part.attendance}`);
    }
    console.log('✓ Candidate marked absent & rejected upon no-show');

    // TPO grants re-test
    const retestRes = await fetch(`${BASE_URL}/slots/${slot2._id}/allow-retest`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const retestData = await retestRes.json();
    if (!retestRes.ok || !retestData.success) {
      throw new Error(`Allow retest failed: ${JSON.stringify(retestData)}`);
    }
    console.log('✓ TPO granted re-test:', retestData.message);

    // Verify reset to scheduled and pending
    const refreshedSlot2 = await InterviewSlot.findById(slot2._id);
    const refreshedR2Part = await RoundParticipant.findOne({ round: interviewRound._id, student: slot2.student });
    if (refreshedSlot2.status !== 'scheduled' || refreshedR2Part.result !== 'pending' || refreshedR2Part.attendance !== 'pending') {
      throw new Error('Re-test state reset failed');
    }
    console.log('✓ Verified: Slot reset to "scheduled" and participant result reset to "pending"');

    // 9. Test Permissions & 403 Access Control
    console.log('\n--- 9. Testing Permissions & 403 Access Control ---');

    // TPO attempts to create panel -> must get 403
    const tpoPanelRes = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ name: 'Unauthorized TPO Panel' }),
    });
    const tpoPanelData = await tpoPanelRes.json();
    if (tpoPanelRes.status !== 403) {
      throw new Error(`Expected 403 for TPO panel creation, got ${tpoPanelRes.status}`);
    }
    console.log('✓ TPO panel creation blocked with 403:', tpoPanelData.message);

    // TPO attempts to submit evaluation -> must get 403
    const tpoEvalRes = await fetch(`${BASE_URL}/slots/${slot1._id}/evaluation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({
        criteriaScores: { technical: 5, problemSolving: 5, communication: 5 },
        recommendation: 'hire',
      }),
    });
    const tpoEvalData = await tpoEvalRes.json();
    if (tpoEvalRes.status !== 403) {
      throw new Error(`Expected 403 for TPO evaluation submission, got ${tpoEvalRes.status}`);
    }
    console.log('✓ TPO evaluation submission blocked with 403:', tpoEvalData.message);

    // 10. Test Student Slot Scoping (Student only sees their own slot)
    console.log('\n--- 10. Testing Student Slot Scoping Endpoint ---');
    const stSlotsRes = await fetch(`${BASE_URL}/students/my-interview-slots`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const stSlotsData = await stSlotsRes.json();
    if (!stSlotsRes.ok || !stSlotsData.success) {
      throw new Error(`Student slots fetch failed: ${JSON.stringify(stSlotsData)}`);
    }

    if (stSlotsData.slots.length !== 1) {
      throw new Error(`Student should only see their 1 slot, found ${stSlotsData.slots.length}`);
    }
    if (stSlotsData.slots[0].student.toString() !== student1._id.toString()) {
      throw new Error('Student received another candidate\'s interview slot!');
    }
    console.log(`✓ Student only receives their own interview slot (${stSlotsData.slots[0].meetingLink})`);

    // 11. Task 31A: Join-Window Rule, Time Warnings, and Panel Link Cascading
    console.log('\n--- 11. Task 31A: Testing Slot Details, Join-Window Rule & Time Warnings ---');
    const slot1Id = stSlotsData.slots[0]._id;

    // 11.1 Slot details endpoint and join-window locked when in future (>10 mins)
    const slotDetailsRes1 = await fetch(`${BASE_URL}/slots/${slot1Id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotDetails1 = await slotDetailsRes1.json();
    if (!slotDetailsRes1.ok || !slotDetails1.success) {
      throw new Error(`Failed to fetch slot details: ${JSON.stringify(slotDetails1)}`);
    }

    // Set slot time to 2 hours in the future with status scheduled
    const twoHoursFuture = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await InterviewSlot.findByIdAndUpdate(slot1Id, {
      startTime: twoHoursFuture,
      endTime: new Date(twoHoursFuture.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
    });

    const slotLockedRes = await fetch(`${BASE_URL}/slots/${slot1Id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotLockedData = await slotLockedRes.json();
    if (slotLockedData.canJoin !== false) {
      throw new Error(`Expected canJoin to be false for slot 2 hours away, got ${slotLockedData.canJoin}`);
    }
    console.log('✓ Join-window is locked when slot is >10 minutes before start time (canJoin=false)');

    // 11.2 Student self check-in
    const checkInRes = await fetch(`${BASE_URL}/slots/${slot1Id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st1Token}`,
      },
      body: JSON.stringify({ status: 'checked_in' }),
    });
    const checkInData = await checkInRes.json();
    if (!checkInRes.ok || checkInData.slot?.status !== 'checked_in') {
      throw new Error(`Student self check-in failed: ${JSON.stringify(checkInData)}`);
    }
    console.log('✓ Student self check-in successful (status=checked_in)');

    // 11.3 Recruiter "Start now" helper unlocks Join immediately
    const startNowRes = await fetch(`${BASE_URL}/slots/${slot1Id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    const startNowData = await startNowRes.json();
    if (!startNowRes.ok || startNowData.slot?.status !== 'in_progress') {
      throw new Error(`Recruiter Start now failed: ${JSON.stringify(startNowData)}`);
    }

    const slotUnlockedRes = await fetch(`${BASE_URL}/slots/${slot1Id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotUnlockedData = await slotUnlockedRes.json();
    if (slotUnlockedData.canJoin !== true) {
      throw new Error(`Expected canJoin to be true immediately when in_progress, got ${slotUnlockedData.canJoin}`);
    }
    console.log('✓ Recruiter "Start now" sets status=in_progress and unlocks Join button immediately (canJoin=true)');

    // 11.4 Automatic unlock within 10 minutes window
    const fiveMinsFuture = new Date(Date.now() + 5 * 60 * 1000);
    await InterviewSlot.findByIdAndUpdate(slot1Id, {
      startTime: fiveMinsFuture,
      endTime: new Date(fiveMinsFuture.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
    });
    const slotTenMinRes = await fetch(`${BASE_URL}/slots/${slot1Id}`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const slotTenMinData = await slotTenMinRes.json();
    if (slotTenMinData.canJoin !== true) {
      throw new Error(`Expected canJoin to be true when within 10 mins of start, got ${slotTenMinData.canJoin}`);
    }
    console.log('✓ Join-window automatically unlocks within 10 minutes of start time (canJoin=true)');

    // 11.5 Panel link update cascades to existing slots
    console.log('\n--- 11.5 Testing Panel Meeting Link Cascade to Slots ---');
    const panelToUpdate = await InterviewPanel.findOne({ round: interviewRound._id });
    const newMeetingLink = 'https://meet.google.com/abc-wxyz-123';
    const updatePanelCascadeRes = await fetch(`${BASE_URL}/panels/${panelToUpdate._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        name: panelToUpdate.name,
        capacity: panelToUpdate.capacity,
        venueOrLink: newMeetingLink,
      }),
    });
    const updatePanelCascadeData = await updatePanelCascadeRes.json();
    if (!updatePanelCascadeRes.ok || !updatePanelCascadeData.success) {
      throw new Error(`Panel update failed: ${JSON.stringify(updatePanelCascadeData)}`);
    }

    const cascadedSlot = await InterviewSlot.findOne({ panel: panelToUpdate._id });
    if (!cascadedSlot || cascadedSlot.meetingLink !== newMeetingLink) {
      throw new Error(`Slot meetingLink was not cascaded! Found: ${cascadedSlot?.meetingLink}, expected: ${newMeetingLink}`);
    }
    console.log('✓ Updating panel venueOrLink successfully cascades to all existing InterviewSlot records');

    // 11.6 Auto-schedule time warnings (before 8 AM IST, after 9 PM IST, outside drive date)
    console.log('\n--- 11.6 Testing Auto-Schedule IST Time Warnings ---');
    // Clear slots first
    await InterviewSlot.deleteMany({ round: interviewRound._id });

    // Schedule at 06:00 AM IST (before 8:00 AM) and on a date outside driveDate (e.g. driveDate + 1 day)
    const { getISTTimeDetails } = require('../utils/dateTime');
    const outsideDriveDate = new Date(testDrive.driveDate.getTime() + 86400000);
    const outsideDetails = getISTTimeDetails(outsideDriveDate);
    const earlyMorningIST = `${outsideDetails.dateStr}T06:00`;
    const autoScheduleWarnRes = await fetch(`${BASE_URL}/rounds/${interviewRound._id}/slots/auto-schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        startTime: earlyMorningIST,
        slotDurationMinutes: 30,
        breakMinutes: 0,
      }),
    });
    const autoScheduleWarnData = await autoScheduleWarnRes.json();
    if (!autoScheduleWarnRes.ok || !autoScheduleWarnData.success) {
      throw new Error(`Auto-schedule failed: ${JSON.stringify(autoScheduleWarnData)}`);
    }

    const warnings = autoScheduleWarnData.timeWarnings || [];
    const hasEarlyWarn = warnings.some((w) => w.includes('before 8:00 AM IST'));
    const hasOutsideDateWarn = warnings.some((w) => w.includes('outside the official drive date'));

    if (!hasEarlyWarn) {
      throw new Error(`Expected timeWarning for slots before 8:00 AM IST, received: ${JSON.stringify(warnings)}`);
    }
    if (!hasOutsideDateWarn) {
      throw new Error(`Expected timeWarning for slots outside drive date, received: ${JSON.stringify(warnings)}`);
    }
    console.log('✓ Auto-scheduler generates appropriate IST timeWarnings:', warnings);

    // Clean up test records
    await Evaluation.deleteMany({ round: interviewRound._id });
    await InterviewSlot.deleteMany({ round: interviewRound._id });
    await InterviewPanel.deleteMany({ round: interviewRound._id });
    await RoundParticipant.deleteMany({ drive: testDrive._id });
    await Round.deleteMany({ drive: testDrive._id });
    await Application.deleteMany({ drive: testDrive._id });
    await Drive.deleteOne({ _id: testDrive._id });
    await JobRequirement.deleteOne({ _id: jobReq._id });
    console.log('✓ Cleaned up Task 29B test records');

    console.log('\n======================================================');
    console.log('   ALL TASK 29B INTERVIEW TESTS PASSED SUCCESSFULLY!  ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ INTERVIEW TEST FAILURE:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Database disconnected, test server closed.');
    process.exit(process.exitCode || 0);
  }
}

runInterviewTests();

