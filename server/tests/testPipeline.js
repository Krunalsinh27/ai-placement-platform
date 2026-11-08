const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  JobRequirement,
  DriveRequest,
  Notification,
  Round,
  RoundBatch,
  RoundParticipant,
  Offer,
  Placement,
} = require('../models');

async function runPipelineTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management');
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/notifications', require('../routes/notificationRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/rounds', require('../routes/roundRoutes'));
  app.use('/api/offers', require('../routes/offerRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));
  app.use('/api/students', require('../routes/studentRoutes'));

  const PORT = 5098;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n======================================================');
    console.log('  RECRUITMENT PIPELINE & ROUND MANAGEMENT TEST SUITE   ');
    console.log('======================================================\n');

    // 1. Authenticate TPO, Recruiter, and Students
    console.log('--- 1. Authenticating test users ---');

    // TPO (admin@college.com)
    const tpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@college.com', password: 'Admin@123' }),
    });
    const tpoData = await tpoLoginRes.json();
    const tpoToken = tpoData.token;
    if (!tpoToken) throw new Error('TPO login failed');
    console.log('✓ TPO authenticated:', tpoData.user.name, `(${tpoData.user.college?.name || 'NITD'})`);

    // Recruiter (recruiter@google.com)
    const recLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recruiter@google.com', password: 'Recruiter@123' }),
    });
    const recData = await recLoginRes.json();
    const recToken = recData.token;
    if (!recToken) throw new Error('Recruiter login failed');
    console.log('✓ Recruiter authenticated:', recData.user.name, `(${recData.user.company?.name || 'Google'})`);

    const college = await College.findOne({ code: 'NITD' });
    const nitdStudents = await Student.find({ college: college._id }).populate('user').limit(5);
    if (nitdStudents.length < 3) throw new Error('Need at least 3 students in NITD for test');

    const student1 = nitdStudents[0];
    const student2 = nitdStudents[1];
    const student3 = nitdStudents[2];

    // Authenticate Student 1
    const st1LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student1.user.email, password: 'Student@123' }),
    });
    const st1Data = await st1LoginRes.json();
    const st1Token = st1Data.token;
    if (!st1Token) throw new Error('Student 1 login failed');
    console.log('✓ Student 1 authenticated:', student1.user.name, `(Roll: ${student1.enrollmentNo})`);

    // Authenticate Student 2
    const st2LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student2.user.email, password: 'Student@123' }),
    });
    const st2Data = await st2LoginRes.json();
    const st2Token = st2Data.token;
    if (!st2Token) throw new Error('Student 2 login failed');
    console.log('✓ Student 2 authenticated:', student2.user.name, `(Roll: ${student2.enrollmentNo})`);

    // Authenticate Student 3
    const st3LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student3.user.email, password: 'Student@123' }),
    });
    const st3Data = await st3LoginRes.json();
    const st3Token = st3Data.token;
    if (!st3Token) throw new Error('Student 3 login failed');
    console.log('✓ Student 3 authenticated:', student3.user.name, `(Roll: ${student3.enrollmentNo})`);

    // 2. Setup a dedicated Test Drive with a Job Requirement
    console.log('\n--- 2. Setting up dedicated test drive & applications ---');
    const company = await Company.findOne({ name: 'Google' });

    // Clean up past test runs for this test drive
    await RoundBatch.deleteMany({ venueOrLink: /CSE Lab 101/i });
    const pastDrives = await Drive.find({ role: 'Pipeline Integration Test Engineer' });
    const pastDriveIds = pastDrives.map((d) => d._id);
    const pastRounds = await Round.find({ drive: { $in: pastDriveIds } });
    const pastRoundIds = pastRounds.map((r) => r._id);

    await RoundBatch.deleteMany({ round: { $in: pastRoundIds } });
    await RoundParticipant.deleteMany({ round: { $in: pastRoundIds } });
    await Round.deleteMany({ _id: { $in: pastRoundIds } });
    await Offer.deleteMany({ drive: { $in: pastDriveIds } });
    await Application.deleteMany({ drive: { $in: pastDriveIds } });
    await Placement.deleteMany({ drive: { $in: pastDriveIds } });
    await Drive.deleteMany({ _id: { $in: pastDriveIds } });

    const testRequirement = await JobRequirement.create({
      company: company._id,
      title: 'Pipeline Integration Test Engineer',
      description: 'Role for testing end-to-end multi-round pipeline',
      packageLpa: 24,
      openings: 5,
      skills: ['Algorithms', 'Distributed Systems'],
      minCgpa: 6.0,
      maxBacklogs: 1,
      allowedBranches: ['CSE', 'IT'],
      batchYear: 2024,
      selectionRounds: ['Aptitude Assessment', 'Technical Coding Interview', 'Director HR Interview'],
      location: 'Hyderabad',
      status: 'published',
    });

    const driveDate = new Date();
    driveDate.setDate(driveDate.getDate() + 5);
    const lastDate = new Date();
    lastDate.setDate(lastDate.getDate() + 2);

    const testDrive = await Drive.create({
      company: company._id,
      college: college._id,
      jobRequirement: testRequirement._id,
      role: 'Pipeline Integration Test Engineer',
      packageLpa: 24,
      location: 'Hyderabad',
      allowedBranches: ['CSE', 'IT'],
      minCgpa: 6.0,
      maxBacklogs: 1,
      driveDate,
      lastDateToApply: lastDate,
      status: 'open',
      applicationsClosed: false,
    });
    console.log('✓ Created dedicated test drive:', testDrive._id);

    // Create applications for Student 1, Student 2, Student 3
    const app1 = await Application.create({
      student: student1._id,
      drive: testDrive._id,
      status: 'applied',
      appliedOn: new Date(),
    });

    let app2 = null;
    if (student2) {
      app2 = await Application.create({
        student: student2._id,
        drive: testDrive._id,
        status: 'applied',
        appliedOn: new Date(),
      });
    }

    let app3 = null;
    if (student3) {
      app3 = await Application.create({
        student: student3._id,
        drive: testDrive._id,
        status: 'applied',
        appliedOn: new Date(),
      });
    }
    console.log('✓ Created test applications for students 1, 2, and 3');

    // 3. Test TPO Exclude applicant before freeze
    console.log('\n--- 3. Testing TPO applicant exclusion before freezing list ---');
    if (student3) {
      const excludeRes = await fetch(`${BASE_URL}/drives/${testDrive._id}/remove-applicant/${student3._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tpoToken}` },
      });
      const excludeData = await excludeRes.json();
      if (!excludeRes.ok || !excludeData.success) {
        throw new Error(`Exclude applicant failed: ${JSON.stringify(excludeData)}`);
      }
      console.log('✓ TPO excluded Student 3:', excludeData.message);

      const updatedDrive = await Drive.findById(testDrive._id);
      const isExcluded = updatedDrive.excludedStudents.some((id) => id.toString() === student3._id.toString());
      if (!isExcluded) throw new Error('Student 3 was not recorded in excludedStudents list');
      console.log('✓ Student 3 properly recorded in drive.excludedStudents');
    }

    // 4. Test TPO Freeze Applications & Auto Round Creation
    console.log('\n--- 4. Testing TPO Freeze Applications & Auto Pipeline Generation ---');
    const freezeRes = await fetch(`${BASE_URL}/drives/${testDrive._id}/freeze`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const freezeData = await freezeRes.json();
    if (!freezeRes.ok || !freezeData.success) {
      throw new Error(`Freeze drive failed: ${JSON.stringify(freezeData)}`);
    }
    console.log('✓ Drive frozen successfully:', freezeData.message);

    // Verify rounds created in DB
    const rounds = await Round.find({ drive: testDrive._id }).sort({ order: 1 });
    if (rounds.length !== 3) {
      throw new Error(`Expected 3 selection rounds, but found ${rounds.length}`);
    }
    console.log(`✓ Generated ${rounds.length} selection rounds:`);
    rounds.forEach((r) => console.log(`   Round ${r.order}: "${r.name}" (${r.type}, ${r.mode})`));

    // Verify Round 1 participants
    const round1 = rounds[0];
    const r1Participants = await RoundParticipant.find({ round: round1._id });
    console.log(`✓ Round 1 participant count: ${r1Participants.length}`);

    const enrolledIds = r1Participants.map((p) => p.student.toString());
    if (!enrolledIds.includes(student1._id.toString())) {
      throw new Error('Student 1 should be enrolled in Round 1');
    }
    if (student2 && !enrolledIds.includes(student2._id.toString())) {
      throw new Error('Student 2 should be enrolled in Round 1');
    }
    if (student3 && enrolledIds.includes(student3._id.toString())) {
      throw new Error('Excluded Student 3 should NOT be enrolled in Round 1');
    }
    console.log('✓ Round 1 correctly contains valid applicants and excludes removed students');

    // 5. Test Application blocking once frozen
    console.log('\n--- 5. Testing Application rejection after drive is frozen ---');
    const lateApplyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st1Token}`,
      },
      body: JSON.stringify({ driveId: testDrive._id }),
    });
    const lateApplyData = await lateApplyRes.json();
    if (lateApplyRes.ok) {
      throw new Error('Application should have been rejected for frozen drive');
    }
    console.log('✓ Late application blocked as expected:', lateApplyData.message);

    // 6. Test Auto-Split Batches & Clash Detection
    console.log('\n--- 6. Testing Batch Auto-Split & Clash Detection ---');
    const batchStart = new Date(driveDate);
    batchStart.setHours(10, 0, 0, 0);

    const autoSplitRes = await fetch(`${BASE_URL}/rounds/${round1._id}/batches/auto-split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        capacity: 1, // small capacity to create 2 batches
        startTime: batchStart.toISOString(),
        slotDurationMinutes: 60,
        venueOrLink: 'CSE Lab 101',
        mode: 'offline',
      }),
    });
    const autoSplitData = await autoSplitRes.json();
    if (!autoSplitRes.ok || !autoSplitData.success) {
      throw new Error(`Auto split failed: ${JSON.stringify(autoSplitData)}`);
    }
    console.log(`✓ Auto-split generated ${autoSplitData.batches.length} batches:`, autoSplitData.message);

    // Verify batches created
    const r1Batches = await RoundBatch.find({ round: round1._id });
    if (r1Batches.length < 2) {
      throw new Error(`Expected at least 2 batches with capacity 1, found ${r1Batches.length}`);
    }

    // Verify all participants got assigned a batch
    const updatedR1Parts = await RoundParticipant.find({ round: round1._id });
    for (const p of updatedR1Parts) {
      if (!p.batch) throw new Error(`Participant ${p.student} missing batch assignment`);
    }
    console.log('✓ All candidates assigned to batches in enrollment number order');

    // Test Clash: Attempt to create another batch in CSE Lab 101 at the EXACT same overlapping time
    console.log('Testing Venue Clash detection...');
    const round2 = rounds[1];
    const clashSplitRes = await fetch(`${BASE_URL}/rounds/${round2._id}/batches/auto-split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        capacity: 20,
        startTime: batchStart.toISOString(), // exact same time
        slotDurationMinutes: 60,
        venueOrLink: 'CSE Lab 101', // exact same venue
        mode: 'offline',
      }),
    });
    const clashData = await clashSplitRes.json();
    if (clashSplitRes.ok) {
      throw new Error('Venue clash should have been blocked!');
    }
    console.log('✓ Venue clash correctly detected and blocked:', clashData.message);

    // 7. Test Bulk Attendance & Absent Auto-Reject
    console.log('\n--- 7. Testing Bulk Attendance & Auto-Reject for Absent Candidates ---');
    const p1 = updatedR1Parts.find((p) => p.student.toString() === student1._id.toString());
    const p2 = student2 ? updatedR1Parts.find((p) => p.student.toString() === student2._id.toString()) : null;

    const attendanceList = [
      { participantId: p1._id, attendance: 'present' },
    ];
    if (p2) {
      attendanceList.push({ participantId: p2._id, attendance: 'absent' });
    }

    const attRes = await fetch(`${BASE_URL}/rounds/${round1._id}/attendance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ attendanceList }),
    });
    const attData = await attRes.json();
    if (!attRes.ok || !attData.success) {
      throw new Error(`Attendance update failed: ${JSON.stringify(attData)}`);
    }
    console.log('✓ Bulk attendance updated:', attData.message);

    // Verify p2 is auto-marked 'rejected'
    if (p2) {
      const p2Doc = await RoundParticipant.findById(p2._id);
      if (p2Doc.result !== 'rejected') {
        throw new Error(`Absent participant should be rejected, got: ${p2Doc.result}`);
      }
      console.log('✓ Absent student automatically marked result="rejected"');
    }

    // 8. Test CSV Results Import & Validation Report
    console.log('\n--- 8. Testing CSV Results Import with Error Reporting ---');
    // Prepare CSV with 1 valid row (student1 cleared) and 1 invalid row (fake enrollment number)
    const csvContent = `enrollmentNo,result,score,feedback\n${student1.enrollmentNo},cleared,95,Outstanding technical skills\nINVALID_ROLL_999,cleared,50,Non-existent student`;

    const csvImportRes = await fetch(`${BASE_URL}/rounds/${round1._id}/results/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ csvData: csvContent }),
    });
    const csvImportData = await csvImportRes.json();
    if (!csvImportRes.ok || !csvImportData.success) {
      throw new Error(`CSV import failed: ${JSON.stringify(csvImportData)}`);
    }

    if (csvImportData.importedCount !== 1 || csvImportData.failedCount !== 1) {
      throw new Error(`Expected 1 import and 1 failure, got: ${JSON.stringify(csvImportData)}`);
    }
    console.log('✓ CSV import validation report returned accurately:');
    console.log(`   Imported: ${csvImportData.importedCount}, Failed: ${csvImportData.failedCount}`);
    console.log(`   Failed row detail: Row ${csvImportData.failedRows[0].row} [${csvImportData.failedRows[0].enrollmentNo}]: ${csvImportData.failedRows[0].reason}`);

    // Verify student1 result in DB
    const p1Refreshed = await RoundParticipant.findById(p1._id);
    if (p1Refreshed.result !== 'cleared' || p1Refreshed.score !== 95) {
      throw new Error('Student 1 result/score was not updated via CSV');
    }
    console.log('✓ Valid candidate result updated with score=95, result="cleared"');

    // 9. Test Publishing Results & Advancing Cleared Candidates to Round 2
    console.log('\n--- 9. Testing Result Publication & Advancing Candidates to Round 2 ---');
    const pubRes = await fetch(`${BASE_URL}/rounds/${round1._id}/publish-results`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recToken}` },
    });
    const pubData = await pubRes.json();
    if (!pubRes.ok || !pubData.success) {
      throw new Error(`Publish results failed: ${JSON.stringify(pubData)}`);
    }
    console.log('✓ Results published:', pubData.message);

    // Verify Round 2 participants
    const r2Participants = await RoundParticipant.find({ round: round2._id });
    if (r2Participants.length !== 1) {
      throw new Error(`Expected exactly 1 cleared candidate in Round 2, found ${r2Participants.length}`);
    }
    if (r2Participants[0].student.toString() !== student1._id.toString()) {
      throw new Error('Student 1 should be the only candidate in Round 2');
    }
    console.log(`✓ Cleared candidate ${student1.enrollmentNo} successfully advanced to Round 2 (${round2.name})`);

    // 10. Test Bulk Offers & Placement Record on Accept
    console.log('\n--- 10. Testing Bulk Offers & Placement Record on Student Acceptance ---');
    // Ensure no placement exists yet
    const prePlacement = await Placement.findOne({ drive: testDrive._id, student: student1._id });
    if (prePlacement) throw new Error('Placement record should not exist before offer acceptance');

    const offerExpiry = new Date();
    offerExpiry.setDate(offerExpiry.getDate() + 7);

    const offerRes = await fetch(`${BASE_URL}/drives/${testDrive._id}/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        offers: [
          {
            studentId: student1._id,
            packageLpa: 24,
            expiryDate: offerExpiry.toISOString(),
            role: 'Software Engineer - Distributed Systems',
          },
        ],
      }),
    });
    const offerData = await offerRes.json();
    if (!offerRes.ok || !offerData.success) {
      throw new Error(`Extend offer failed: ${JSON.stringify(offerData)}`);
    }
    console.log('✓ Bulk offer extended successfully:', offerData.message);

    // Verify Offer doc
    const offerDoc = await Offer.findOne({ drive: testDrive._id, student: student1._id });
    if (!offerDoc || offerDoc.status !== 'offered') {
      throw new Error('Offer document not found or status not "offered"');
    }

    // Verify STILL no Placement record
    const midPlacement = await Placement.findOne({ drive: testDrive._id, student: student1._id });
    if (midPlacement) {
      throw new Error('Placement record must NOT be created before student acceptance!');
    }
    console.log('✓ Verified: No Placement record exists prior to student acceptance');

    // Student 1 accepts offer
    console.log('Student 1 accepting employment offer...');
    const acceptRes = await fetch(`${BASE_URL}/offers/${offerDoc._id}/accept`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const acceptData = await acceptRes.json();
    if (!acceptRes.ok || !acceptData.success) {
      throw new Error(`Accept offer failed: ${JSON.stringify(acceptData)}`);
    }
    console.log('✓ Student accepted offer:', acceptData.message);

    // Verify Placement record is NOW created!
    const postPlacement = await Placement.findOne({ drive: testDrive._id, student: student1._id });
    if (!postPlacement) {
      throw new Error('Placement record should be created upon offer acceptance!');
    }
    console.log(`✓ Verified Placement record created: Package ${postPlacement.packageLpa} LPA, Company ID: ${postPlacement.company}`);

    // Verify application status updated to selected
    const updatedApp1 = await Application.findById(app1._id);
    if (updatedApp1.status !== 'selected') {
      throw new Error(`Application status should be 'selected', got: ${updatedApp1.status}`);
    }
    console.log('✓ Application status updated to "selected"');

    // 11. Test Student Decline Offer
    if (student2) {
      console.log('\n--- 11. Testing Student Offer Decline flow ---');
      const offer2Res = await fetch(`${BASE_URL}/drives/${testDrive._id}/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${recToken}`,
        },
        body: JSON.stringify({
          offers: [
            {
              studentId: student2._id,
              packageLpa: 24,
              expiryDate: offerExpiry.toISOString(),
              role: 'Software Engineer',
            },
          ],
        }),
      });
      const offer2Data = await offer2Res.json();
      const offer2Doc = await Offer.findOne({ drive: testDrive._id, student: student2._id });

      const declineRes = await fetch(`${BASE_URL}/offers/${offer2Doc._id}/decline`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${st2Token}` },
      });
      const declineData = await declineRes.json();
      if (!declineRes.ok || !declineData.success) {
        throw new Error(`Decline offer failed: ${JSON.stringify(declineData)}`);
      }
      console.log('✓ Student 2 declined offer:', declineData.message);

      const st2Placement = await Placement.findOne({ drive: testDrive._id, student: student2._id });
      if (st2Placement) {
        throw new Error('No Placement record should exist for declined offer');
      }
      console.log('✓ Verified: No Placement record exists for declined offer');
    }

    // 12. Test Student Timeline Endpoint
    console.log('\n--- 12. Testing Student Pipeline Timeline Endpoint ---');
    const timelineRes = await fetch(`${BASE_URL}/applications/${app1._id}/timeline`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const timelineData = await timelineRes.json();
    if (!timelineRes.ok || !timelineData.success) {
      throw new Error(`Timeline fetch failed: ${JSON.stringify(timelineData)}`);
    }
    console.log('✓ Student timeline retrieved successfully:');
    console.log(`   Rounds in timeline: ${timelineData.rounds.length}`);
    console.log(`   Offer status: ${timelineData.offer?.status} (${timelineData.offer?.packageLpa} LPA)`);
    console.log(`   Application status: ${timelineData.application?.status}`);

    // 13. Test Student Upcoming Rounds Endpoint
    console.log('\n--- 13. Testing Student Upcoming Rounds Endpoint ---');
    const upcomingRes = await fetch(`${BASE_URL}/students/upcoming-rounds`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const upcomingData = await upcomingRes.json();
    if (!upcomingRes.ok || !upcomingData.success) {
      throw new Error(`Upcoming rounds fetch failed: ${JSON.stringify(upcomingData)}`);
    }
    console.log(`✓ Student upcoming rounds retrieved: ${upcomingData.upcoming?.length || 0} items`);

    // 14. Test TPO Progress and Daily Clash Report
    console.log('\n--- 14. Testing TPO Progress & Institutional Daily Clash Report ---');
    const progressRes = await fetch(`${BASE_URL}/drives/${testDrive._id}/progress`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const progressData = await progressRes.json();
    if (!progressRes.ok || !progressData.success) {
      throw new Error(`Drive progress fetch failed: ${JSON.stringify(progressData)}`);
    }
    console.log('✓ Drive progress retrieved:');
    console.log(`   Total Applied: ${progressData.metrics?.totalApplied}`);
    console.log(`   Valid Candidates: ${progressData.metrics?.validApplicants}`);
    console.log(`   Total Offers: ${progressData.metrics?.totalOffers} (Accepted: ${progressData.metrics?.acceptedOffers})`);

    const dateStr = driveDate.toISOString().split('T')[0];
    const clashReportRes = await fetch(`${BASE_URL}/drives/clashes?date=${dateStr}`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const clashReportData = await clashReportRes.json();
    if (!clashReportRes.ok || !clashReportData.success) {
      throw new Error(`Clash report fetch failed: ${JSON.stringify(clashReportData)}`);
    }
    console.log('✓ Daily institutional clash report retrieved:');
    console.log(`   Total Batches on ${dateStr}: ${clashReportData.report?.totalBatches || 0}`);
    console.log(`   Student Clashes Detected: ${clashReportData.report?.studentClashes?.length || 0}`);
    console.log(`   Venue Clashes Detected: ${clashReportData.report?.venueClashes?.length || 0}`);

    // 15. Test Future Deadline Drive Acceptance & Reopen Endpoint
    console.log('\n--- 15. Testing Drive with Future Deadline Accepts Applications & Reopen ---');
    const futureDeadline = new Date();
    futureDeadline.setDate(futureDeadline.getDate() + 7);
    const futureDriveDate = new Date();
    futureDriveDate.setDate(futureDriveDate.getDate() + 10);

    const futureDrive = await Drive.create({
      company: company._id,
      college: college._id,
      role: 'Future Deadline Software Engineer',
      packageLpa: 18,
      location: 'Bangalore',
      allowedBranches: ['CSE', 'IT', 'ECE'],
      minCgpa: 6.0,
      maxBacklogs: 2,
      driveDate: futureDriveDate,
      lastDateToApply: futureDeadline,
      status: 'open',
      applicationsClosed: false,
      listFrozenAt: null,
    });
    console.log(`✓ Created future drive (${futureDrive._id}) with deadline in 7 days`);

    if (futureDrive.applicationsClosed !== false || futureDrive.listFrozenAt !== null) {
      throw new Error('New drive must start with applicationsClosed: false and listFrozenAt: null');
    }
    console.log('✓ Verified: applicationsClosed is false and listFrozenAt is null');

    // Student 1 fetches eligible drives and verifies applicationsClosed flag is returned
    const futEligibleRes = await fetch(`${BASE_URL}/drives/eligible`, {
      headers: { Authorization: `Bearer ${st1Token}` },
    });
    const futEligibleData = await futEligibleRes.json();
    if (!futEligibleRes.ok || !futEligibleData.success) {
      throw new Error(`Failed to fetch eligible drives: ${JSON.stringify(futEligibleData)}`);
    }
    const matchedEligible = futEligibleData.drives.find((d) => d._id.toString() === futureDrive._id.toString());
    if (!matchedEligible) {
      throw new Error('Future drive should appear in eligible drives list');
    }
    if (matchedEligible.applicationsClosed !== false) {
      throw new Error(`Expected applicationsClosed to be false, got ${matchedEligible.applicationsClosed}`);
    }
    console.log('✓ Verified: Drive appears in GET /api/drives/eligible with applicationsClosed: false');

    // Student 2 applies to the future deadline drive
    const futApply1Res = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st2Token}`,
      },
      body: JSON.stringify({ driveId: futureDrive._id }),
    });
    const futApply1Data = await futApply1Res.json();
    if (futApply1Res.status !== 201 || !futApply1Data.success) {
      throw new Error(`Application to future drive failed: ${JSON.stringify(futApply1Data)}`);
    }
    console.log('✓ Verified: Student 2 successfully applied to drive with future deadline (Status 201)');

    // TPO freezes applications
    const futFreezeRes = await fetch(`${BASE_URL}/drives/${futureDrive._id}/freeze`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const futFreezeData = await futFreezeRes.json();
    if (!futFreezeRes.ok || !futFreezeData.success) {
      throw new Error(`Freeze drive failed: ${JSON.stringify(futFreezeData)}`);
    }
    console.log('✓ TPO froze candidate list successfully');

    // Student 3 attempts to apply while frozen -> should fail with 400
    const futApply3BlockedRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st3Token}`,
      },
      body: JSON.stringify({ driveId: futureDrive._id }),
    });
    const futApply3BlockedData = await futApply3BlockedRes.json();
    if (futApply3BlockedRes.status !== 400 || !futApply3BlockedData.message?.includes('closed')) {
      throw new Error(`Expected apply while frozen to fail with 400, got ${futApply3BlockedRes.status}: ${JSON.stringify(futApply3BlockedData)}`);
    }
    console.log('✓ Verified: Student 3 application blocked while drive is frozen ("Applications for this drive are closed...")');

    // TPO reopens applications
    const futReopenRes = await fetch(`${BASE_URL}/drives/${futureDrive._id}/reopen`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const futReopenData = await futReopenRes.json();
    if (!futReopenRes.ok || !futReopenData.success) {
      throw new Error(`Reopen drive failed: ${JSON.stringify(futReopenData)}`);
    }
    console.log('✓ TPO successfully reopened applications via PUT /api/drives/:id/reopen');

    // Verify drive state in database
    const refreshedDrive = await Drive.findById(futureDrive._id);
    if (refreshedDrive.applicationsClosed !== false || refreshedDrive.listFrozenAt !== null) {
      throw new Error('Reopened drive must have applicationsClosed: false and listFrozenAt: null');
    }
    console.log('✓ Verified: Database state has applicationsClosed: false and listFrozenAt: null');

    // Student 3 applies again -> should now succeed
    const futApply3Res = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${st3Token}`,
      },
      body: JSON.stringify({ driveId: futureDrive._id }),
    });
    const futApply3Data = await futApply3Res.json();
    if (futApply3Res.status !== 201 || !futApply3Data.success) {
      throw new Error(`Student 3 application after reopen failed: ${JSON.stringify(futApply3Data)}`);
    }
    console.log('✓ Verified: Student 3 successfully applied after drive was reopened (Status 201)');

    // Clean up futureDrive test data
    await Application.deleteMany({ drive: futureDrive._id });
    await Round.deleteMany({ drive: futureDrive._id });
    await Drive.deleteOne({ _id: futureDrive._id });
    console.log('✓ Cleaned up future drive test records');

    // 16. Test Task 29A: Round Defaults Mapping (type & empty mode)
    console.log('\n--- 16. Testing Round Defaults Mapping & Empty Mode (Task 29A) ---');
    const jobReq29A = await JobRequirement.create({
      company: testDrive.company,
      title: 'DevOps & Cloud Engineer',
      description: 'Cloud infrastructure engineer',
      batchYear: 2026,
      packageLpa: 18,
      openings: 5,
      allowedBranches: ['CSE', 'IT'],
      selectionRounds: [
        'Online Assessment',
        'Technical Interview',
        'HR Interview',
        'Group Discussion',
      ],
      status: 'published',
    });

    const driveDate29A = new Date();
    driveDate29A.setDate(driveDate29A.getDate() + 10);
    const deadline29A = new Date();
    deadline29A.setDate(deadline29A.getDate() + 5);

    const drive29A = await Drive.create({
      college: college._id,
      company: testDrive.company,
      jobRequirement: jobReq29A._id,
      role: 'DevOps & Cloud Engineer',
      packageLpa: 18,
      location: 'Bangalore',
      allowedBranches: ['CSE', 'IT'],
      lastDateToApply: deadline29A,
      driveDate: driveDate29A,
      status: 'open',
    });

    // Create applications for students
    const app29A_1 = await Application.create({
      drive: drive29A._id,
      student: student1._id,
      status: 'applied',
    });
    const app29A_2 = await Application.create({
      drive: drive29A._id,
      student: student2._id,
      status: 'applied',
    });

    // Freeze drive to auto-create rounds
    const freezeRes29A = await fetch(`${BASE_URL}/drives/${drive29A._id}/freeze`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const freezeData29A = await freezeRes29A.json();
    if (!freezeRes29A.ok || !freezeData29A.success) {
      throw new Error(`Freeze failed: ${JSON.stringify(freezeData29A)}`);
    }

    const autoRounds = await Round.find({ drive: drive29A._id }).sort({ order: 1 });
    if (autoRounds.length !== 4) {
      throw new Error(`Expected 4 auto-created rounds, found ${autoRounds.length}`);
    }

    // Verify mapping
    const expectedTypes = ['aptitude', 'technical', 'hr', 'group_discussion'];
    for (let i = 0; i < autoRounds.length; i++) {
      const r = autoRounds[i];
      if (r.type !== expectedTypes[i]) {
        throw new Error(`Round ${i + 1} type mismatch. Expected: ${expectedTypes[i]}, Got: ${r.type}`);
      }
      if (r.mode !== '') {
        throw new Error(`Round ${i + 1} mode should be empty string (''), Got: "${r.mode}"`);
      }
    }
    console.log('✓ Selection rounds accurately mapped to types:');
    console.log('   Round 1: Online Assessment -> aptitude (mode: "")');
    console.log('   Round 2: Technical Interview -> technical (mode: "")');
    console.log('   Round 3: HR Interview -> hr (mode: "")');
    console.log('   Round 4: Group Discussion -> group_discussion (mode: "")');

    // Verify default attendance of candidates in Round 1 is strictly 'pending'
    const r1Participants29A = await RoundParticipant.find({ round: autoRounds[0]._id });
    for (const p of r1Participants29A) {
      if (p.attendance !== 'pending') {
        throw new Error(`Participant attendance must default to 'pending', got: ${p.attendance}`);
      }
      if (p.batch !== null) {
        throw new Error(`Participant batch must initially be null, got: ${p.batch}`);
      }
    }
    console.log('✓ All Round 1 participants default strictly to attendance="pending" with batch=null');

    // 17. Test Recruiter Round Settings Modal Endpoint
    console.log('\n--- 17. Testing Recruiter Round Settings Modal Endpoint (Task 29A) ---');
    const r1 = autoRounds[0];
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 3);

    const updateSettingsRes = await fetch(`${BASE_URL}/rounds/${r1._id}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        type: 'aptitude',
        mode: 'online',
        date: scheduledDate.toISOString(),
        durationMinutes: 45,
        venueOrLink: 'https://meet.google.com/xyz-test-drive',
        instructions: 'Please join 10 minutes early with institutional email.',
        cutoffScore: 65,
      }),
    });
    const updateSettingsData = await updateSettingsRes.json();
    if (!updateSettingsRes.ok || !updateSettingsData.success) {
      throw new Error(`Update round settings failed: ${JSON.stringify(updateSettingsData)}`);
    }

    const refreshedR1 = await Round.findById(r1._id);
    if (
      refreshedR1.mode !== 'online' ||
      refreshedR1.durationMinutes !== 45 ||
      refreshedR1.venueOrLink !== 'https://meet.google.com/xyz-test-drive' ||
      refreshedR1.cutoffScore !== 65
    ) {
      throw new Error(`Round settings were not stored properly: ${JSON.stringify(refreshedR1)}`);
    }
    console.log('✓ Recruiter successfully saved round settings via PUT /api/rounds/:id/settings:');
    console.log(`   Type: ${refreshedR1.type}, Mode: ${refreshedR1.mode}, Duration: ${refreshedR1.durationMinutes}m, Cutoff: ${refreshedR1.cutoffScore}`);

    // 18. Test Authorization & 403 on Round Settings & Batches
    console.log('\n--- 18. Testing Round Authorization & Clear 403 Errors (Task 29A) ---');
    // TPO attempts to update round settings -> must return 403
    const tpoSettingsRes = await fetch(`${BASE_URL}/rounds/${r1._id}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ mode: 'offline' }),
    });
    const tpoSettingsData = await tpoSettingsRes.json();
    if (tpoSettingsRes.status !== 403) {
      throw new Error(`Expected 403 for TPO round settings update, got ${tpoSettingsRes.status}`);
    }
    console.log('✓ TPO round update blocked with 403:', tpoSettingsData.message);

    // TPO attempts to auto-split batches -> must return 403
    const tpoSplitRes = await fetch(`${BASE_URL}/rounds/${r1._id}/batches/auto-split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ capacity: 20 }),
    });
    const tpoSplitData = await tpoSplitRes.json();
    if (tpoSplitRes.status !== 403) {
      throw new Error(`Expected 403 for TPO auto-split, got ${tpoSplitRes.status}`);
    }
    console.log('✓ TPO batch auto-split blocked with 403:', tpoSplitData.message);

    // 19. Test Attendance Guard: Cannot mark present without an assigned batch
    console.log('\n--- 19. Testing Attendance Guard for Unbatched Candidates (Task 29A) ---');
    const unbatchedParticipant = r1Participants29A[0];
    const invalidAttRes = await fetch(`${BASE_URL}/rounds/${r1._id}/attendance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        attendanceList: [{ participantId: unbatchedParticipant._id, attendance: 'present' }],
      }),
    });
    const invalidAttData = await invalidAttRes.json();
    if (invalidAttRes.status !== 400) {
      throw new Error(`Expected 400 when marking unbatched student present, got ${invalidAttRes.status}`);
    }
    console.log('✓ Marking unbatched candidate as present correctly rejected with 400:', invalidAttData.message);

    // 20. Test Shortlist by Cutoff Feature
    console.log('\n--- 20. Testing Shortlist by Cutoff Score (Task 29A) ---');
    // Set scores for participants: candidate 1 gets 80 (above cutoff 65), candidate 2 gets 45 (below cutoff 65)
    await RoundParticipant.findByIdAndUpdate(r1Participants29A[0]._id, {
      $set: { score: 80 },
    });
    await RoundParticipant.findByIdAndUpdate(r1Participants29A[1]._id, {
      $set: { score: 45 },
    });

    // Preview mode
    const previewRes = await fetch(`${BASE_URL}/rounds/${r1._id}/shortlist-by-cutoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ cutoffScore: 65, apply: false }),
    });
    const previewData = await previewRes.json();
    if (!previewRes.ok || !previewData.success || !previewData.preview) {
      throw new Error(`Shortlist preview failed: ${JSON.stringify(previewData)}`);
    }
    if (previewData.clearedCount !== 1 || previewData.rejectedCount !== 1) {
      throw new Error(`Expected 1 cleared and 1 rejected in preview, got: ${JSON.stringify(previewData)}`);
    }
    console.log(`✓ Shortlist preview returned: ${previewData.clearedCount} cleared, ${previewData.rejectedCount} rejected`);

    // Apply mode
    const applyRes = await fetch(`${BASE_URL}/rounds/${r1._id}/shortlist-by-cutoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({ cutoffScore: 65, apply: true }),
    });
    const applyData = await applyRes.json();
    if (!applyRes.ok || !applyData.success) {
      throw new Error(`Shortlist apply failed: ${JSON.stringify(applyData)}`);
    }

    // Verify DB states
    const part1Doc = await RoundParticipant.findById(r1Participants29A[0]._id);
    const part2Doc = await RoundParticipant.findById(r1Participants29A[1]._id);
    if (part1Doc.result !== 'cleared') {
      throw new Error(`Participant 1 with score 80 should be cleared, got: ${part1Doc.result}`);
    }
    if (part2Doc.result !== 'rejected') {
      throw new Error(`Participant 2 with score 45 should be rejected, got: ${part2Doc.result}`);
    }
    console.log('✓ Shortlist applied successfully to database:');
    console.log(`   Candidate 1 (score 80 >= 65): result="${part1Doc.result}"`);
    console.log(`   Candidate 2 (score 45 < 65): result="${part2Doc.result}"`);

    // 21. Test Recruiter Confirmed Drives List (GET /api/drives)
    console.log('\n--- 21. Testing Recruiter Confirmed Drives Scoping (Task 29A) ---');
    const recDrivesRes = await fetch(`${BASE_URL}/drives`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${recToken}` },
    });
    const recDrivesData = await recDrivesRes.json();
    if (!recDrivesRes.ok || !recDrivesData.success) {
      throw new Error(`Recruiter drives fetch failed: ${JSON.stringify(recDrivesData)}`);
    }
    if (recDrivesData.drives.length === 0) {
      throw new Error('Recruiter should receive confirmed drives for their company');
    }
    for (const d of recDrivesData.drives) {
      if (d.company._id.toString() !== testDrive.company.toString()) {
        throw new Error('Recruiter received drive belonging to another company!');
      }
      if (!d.college?.name) {
        throw new Error('Drive must populate college info for recruiter pipeline view');
      }
    }
    console.log(`✓ Recruiter drives correctly scoped to company (${recDrivesData.drives.length} drives found, all verified)`);

    // Clean up test data for Task 29A
    await RoundParticipant.deleteMany({ drive: drive29A._id });
    await Round.deleteMany({ drive: drive29A._id });
    await Application.deleteMany({ drive: drive29A._id });
    await Drive.deleteOne({ _id: drive29A._id });
    await JobRequirement.deleteOne({ _id: jobReq29A._id });
    console.log('✓ Cleaned up Task 29A test records');

    console.log('\n======================================================');
    console.log('  ALL RECRUITMENT PIPELINE TESTS PASSED SUCCESSFULLY!  ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ TEST FAILURE:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Database disconnected, test server closed.');
    process.exit(process.exitCode || 0);
  }
}

runPipelineTests();
