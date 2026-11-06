const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

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
} = require('../models');

async function runNotificationTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management');
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/notifications', require('../routes/notificationRoutes'));
  app.use('/api/drive-requests', require('../routes/driveRequestRoutes'));
  app.use('/api/drives', require('../routes/driveRoutes'));
  app.use('/api/applications', require('../routes/applicationRoutes'));

  const PORT = 5097;
  const server = app.listen(PORT);
  const BASE_URL = `http://127.0.0.1:${PORT}/api`;

  try {
    console.log('\n--- 1. Testing Notification Model & Direct API Operations ---');
    // Get seeded TPO user (admin@college.com)
    const tpoUser = await User.findOne({ email: 'admin@college.com' });
    if (!tpoUser) throw new Error('Seeded TPO user (admin@college.com) not found');

    // Clean up test notifications for this user
    await Notification.deleteMany({ user: tpoUser._id });

    // Login as TPO
    const tpoLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@college.com', password: 'Admin@123' }),
    });
    const tpoLoginData = await tpoLoginRes.json();
    const tpoToken = tpoLoginData.token || tpoLoginData.data?.token;

    // Create 2 test notifications directly
    const notif1 = await Notification.create({
      user: tpoUser._id,
      type: 'drive_request',
      message: 'Test notification 1: New drive request',
      link: '/admin/incoming-requests',
      read: false,
    });

    const notif2 = await Notification.create({
      user: tpoUser._id,
      type: 'general',
      message: 'Test notification 2: Institutional announcement',
      link: '/admin/dashboard',
      read: false,
    });

    // 1.1 GET /api/notifications
    const getRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const getData = await getRes.json();
    console.log('GET notifications status (expected 200):', getRes.status);
    console.log('Unread count (expected 2):', getData.unreadCount);
    if (getRes.status !== 200 || getData.unreadCount !== 2 || getData.notifications.length !== 2) {
      throw new Error('Failed to retrieve notifications');
    }

    // 1.2 PUT /api/notifications/:id/read
    const markReadRes = await fetch(`${BASE_URL}/notifications/${notif1._id}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const markReadData = await markReadRes.json();
    console.log('Mark read status (expected 200):', markReadRes.status);
    console.log('Notification read flag:', markReadData.notification?.read);
    if (markReadRes.status !== 200 || !markReadData.notification?.read) {
      throw new Error('Failed to mark single notification as read');
    }

    // Verify unread count is now 1
    const getResAfterSingle = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const getDataAfterSingle = await getResAfterSingle.json();
    console.log('Unread count after reading one (expected 1):', getDataAfterSingle.unreadCount);
    if (getDataAfterSingle.unreadCount !== 1) {
      throw new Error('Unread count mismatch after marking one read');
    }

    // 1.3 PUT /api/notifications/read-all
    const readAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const readAllData = await readAllRes.json();
    console.log('Mark all read status (expected 200):', readAllRes.status);

    const getResAfterAll = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${tpoToken}` },
    });
    const getDataAfterAll = await getResAfterAll.json();
    console.log('Unread count after read-all (expected 0):', getDataAfterAll.unreadCount);
    if (getDataAfterAll.unreadCount !== 0) {
      throw new Error('Unread count not zero after read-all');
    }

    console.log('\n--- 2. Testing Trigger 1: New Drive Request (Notifies TPO) ---');
    // Login as seeded recruiter (recruiter@google.com)
    const recLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recruiter@google.com', password: 'Recruiter@123' }),
    });
    const recLoginData = await recLoginRes.json();
    const recToken = recLoginData.token || recLoginData.data?.token;

    // Get an existing published requirement or create one
    let jobReq = await JobRequirement.findOne({ company: recLoginData.user?.company?._id || recLoginData.user?.company, status: 'published' });
    if (!jobReq) {
      jobReq = await JobRequirement.create({
        company: recLoginData.user?.company?._id || recLoginData.user?.company,
        title: 'Full Stack Cloud Engineer',
        packageLpa: 18,
        openings: 5,
        skills: ['React', 'Node.js'],
        minCgpa: 7.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        batchYear: 2026,
        status: 'published',
      });
    }

    // Clean prior notifications for TPO
    await Notification.deleteMany({ user: tpoUser._id });

    // Clean prior drive requests for this jobReq and college to prevent duplicates
    await DriveRequest.deleteMany({ jobRequirement: jobReq._id, college: tpoUser.college._id || tpoUser.college });

    // Send drive request
    const createReqRes = await fetch(`${BASE_URL}/drive-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`,
      },
      body: JSON.stringify({
        jobRequirementId: jobReq._id,
        collegeIds: [tpoUser.college._id || tpoUser.college],
        proposedDates: [new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()],
        mode: 'on-campus',
        initialMessage: 'Excited to visit your campus for recruitment!',
      }),
    });
    const createReqData = await createReqRes.json();
    console.log('Create drive request status (expected 201):', createReqRes.status);
    const createdRequestId = createReqData.requests?.[0]?._id;
    if (!createdRequestId) throw new Error('Failed to create drive request');

    // Verify TPO received a notification
    const tpoNotif = await Notification.findOne({
      user: tpoUser._id,
      type: 'drive_request',
    });
    console.log('TPO received drive_request notification:', !!tpoNotif);
    console.log('TPO notification message:', tpoNotif?.message);
    if (!tpoNotif) throw new Error('TPO was not notified of new drive request!');

    console.log('\n--- 3. Testing Trigger 2: Request Response (Notifies Recruiter) ---');
    // Clean recruiter's notifications
    const recUser = await User.findOne({ email: 'recruiter@google.com' });
    await Notification.deleteMany({ user: recUser._id });

    // TPO responds with accept
    const confirmedDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const respondRes = await fetch(`${BASE_URL}/drive-requests/${createdRequestId}/respond`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({
        action: 'accept',
        selectedDate: confirmedDate,
        note: 'Confirmed! We look forward to hosting your recruitment team.',
      }),
    });
    console.log('TPO respond status (expected 200):', respondRes.status);

    // Verify recruiter received notification
    const recNotif = await Notification.findOne({
      user: recUser._id,
      type: 'request_response',
    });
    console.log('Recruiter received request_response notification:', !!recNotif);
    console.log('Recruiter notification message:', recNotif?.message);
    if (!recNotif) throw new Error('Recruiter was not notified of TPO response!');

    console.log('\n--- 4. Testing Trigger 3: New Drive Published (Notifies Eligible Students) ---');
    // Find eligible student from NITD (aarav.sharma1@college.com)
    const studentUser = await User.findOne({ email: 'aarav.sharma1@college.com' });
    const studentProfile = await Student.findOne({ user: studentUser._id });
    await Notification.deleteMany({ user: studentUser._id });

    // Create a new drive for NITD matching this student's branch and CGPA
    const newDriveRes = await fetch(`${BASE_URL}/drives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({
        company: recUser.company,
        role: 'AI Research Associate',
        packageLpa: 24,
        location: 'Bengaluru Campus',
        minCgpa: 6.0,
        maxBacklogs: 2,
        allowedBranches: [studentProfile.branch],
        lastDateToApply: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        driveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
      }),
    });
    const newDriveData = await newDriveRes.json();
    console.log('Create drive status (expected 201):', newDriveRes.status);
    const createdDrive = newDriveData.drive;
    if (!createdDrive) throw new Error('Failed to create published drive');

    // Verify student received drive_published notification
    const studentDriveNotif = await Notification.findOne({
      user: studentUser._id,
      type: 'drive_published',
    });
    console.log('Student received drive_published notification:', !!studentDriveNotif);
    console.log('Student notification message:', studentDriveNotif?.message);
    if (!studentDriveNotif) throw new Error('Eligible student was not notified of published drive!');

    console.log('\n--- 5. Testing Trigger 4: New Applicant (Notifies Recruiter) ---');
    // Login as student
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aarav.sharma1@college.com', password: 'Student@123' }),
    });
    const studentLoginData = await studentLoginRes.json();
    const studentToken = studentLoginData.token || studentLoginData.data?.token;

    // Clean recruiter notifications
    await Notification.deleteMany({ user: recUser._id });

    // Student applies to the newly created drive
    const applyRes = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ driveId: createdDrive._id }),
    });
    const applyData = await applyRes.json();
    console.log('Student apply status (expected 201):', applyRes.status);
    const createdApplicationId = applyData.application?._id;
    if (!createdApplicationId) throw new Error('Failed to submit application');

    // Verify recruiter received new_applicant notification
    const applicantNotif = await Notification.findOne({
      user: recUser._id,
      type: 'new_applicant',
    });
    console.log('Recruiter received new_applicant notification:', !!applicantNotif);
    console.log('Applicant notification message:', applicantNotif?.message);
    if (!applicantNotif) throw new Error('Recruiter was not notified of new applicant!');

    console.log('\n--- 6. Testing Trigger 5: Status Change & Interview Schedule (Notifies Student) ---');
    // Clean student notifications
    await Notification.deleteMany({ user: studentUser._id });

    // Update status to 'interview' (interview schedule notification)
    const interviewRes = await fetch(`${BASE_URL}/applications/${createdApplicationId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ status: 'interview' }),
    });
    console.log('Update status to interview (expected 200):', interviewRes.status);

    // Verify student received interview_schedule notification
    const interviewNotif = await Notification.findOne({
      user: studentUser._id,
      type: 'interview_schedule',
    });
    console.log('Student received interview_schedule notification:', !!interviewNotif);
    console.log('Interview notification message:', interviewNotif?.message);
    if (!interviewNotif) throw new Error('Student was not notified of interview schedule!');

    // Update status to 'shortlisted' (status change notification)
    const shortlistRes = await fetch(`${BASE_URL}/applications/${createdApplicationId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tpoToken}`,
      },
      body: JSON.stringify({ status: 'shortlisted' }),
    });
    console.log('Update status to shortlisted (expected 200):', shortlistRes.status);

    const statusNotif = await Notification.findOne({
      user: studentUser._id,
      type: 'status_change',
    });
    console.log('Student received status_change notification:', !!statusNotif);
    console.log('Status change notification message:', statusNotif?.message);
    if (!statusNotif) throw new Error('Student was not notified of status change!');

    console.log('\n>>> ALL NOTIFICATION TESTS PASSED SUCCESSFULLY! <<<');
  } catch (err) {
    console.error('Notification Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.connection.close();
    console.log('Test connections closed.');
  }
}

runNotificationTests();

