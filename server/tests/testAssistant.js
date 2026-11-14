process.env.NODE_ENV = 'test';
process.env.EMAIL_MODE = 'console';
process.env.AI_PROVIDER = 'mock';

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const assert = require('assert');

dotenv.config({ path: path.join(__dirname, '../.env') });

const {
  User,
  Student,
  College,
  Company,
  Drive,
  Application,
  Offer,
  Round,
  RoundParticipant,
  InterviewPanel,
  InterviewSlot,
  JobRequirement,
  DriveRequest,
  AiUsage,
  ChatLog,
} = require('../models');

const mockProvider = require('../services/ai/providers/mockProvider');
const assistantTools = require('../services/assistant/assistantTools');
const {
  validateToolAndParams,
  matchRuleBasedIntent,
  routeIntent,
  formatAssistantAnswer,
  getSuggestedQuestions,
} = require('../services/assistant/intentRouter');
const { getTestDbUri } = require('./testHelper');

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      college: user.college?._id || user.college,
      company: user.company?._id || user.company,
    },
    process.env.JWT_SECRET || 'supersecretjwtkey_placement_system_2026_at_least_32_chars',
    { expiresIn: '1d' }
  );
}

async function runAssistantTests() {
  console.log('Connecting to MongoDB Test Database for Assistant Tests...');
  const testDbUri = getTestDbUri();
  await mongoose.connect(testDbUri);
  console.log('Connected to MongoDB successfully:', mongoose.connection.name);

  // Set up Express test server
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', require('../routes/assistantRoutes'));

  const server = app.listen(0);
  const port = server.address().port;
  const BASE_URL = `http://localhost:${port}/api/assistant`;

  const createdUserIds = [];
  const createdStudentIds = [];
  const createdDriveIds = [];
  const createdOfferIds = [];
  const createdAppIds = [];
  const createdCollegeIds = [];
  const createdCompanyIds = [];
  const createdParticipantIds = [];
  const createdRoundIds = [];
  const createdPanelIds = [];
  const createdSlotIds = [];
  const createdJobReqIds = [];
  const createdDriveReqIds = [];

  try {
    console.log('1. Setting up test fixtures for multi-role assistant...');
    await College.deleteMany({ code: { $in: ['ASST-COL-A', 'ASST-COL-B'] } });
    await Company.deleteMany({ name: { $in: ['AlphaCorp', 'BetaTech', 'MegaCorp'] } });
    await Student.deleteMany({ enrollmentNo: { $in: ['EN-A1', 'EN-A2', 'EN-A3', 'EN-A4', 'EN-B1'] } });

    // College A
    const collegeA = await College.create({
      name: 'Alpha Engineering College',
      code: 'ASST-COL-A',
      city: 'Pune',
      state: 'Maharashtra',
      status: 'approved',
    });
    createdCollegeIds.push(collegeA._id);

    // College B (for isolation tests)
    const collegeB = await College.create({
      name: 'Beta Technology Institute',
      code: 'ASST-COL-B',
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'approved',
    });
    createdCollegeIds.push(collegeB._id);

    // TPO User A
    const tpoUserA = await User.create({
      name: 'TPO Officer A',
      email: `tpo.a.${Date.now()}@collegea.edu`,
      role: 'tpo',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(tpoUserA._id);
    const tokenTpoA = createToken(tpoUserA);

    // TPO User B
    const tpoUserB = await User.create({
      name: 'TPO Officer B',
      email: `tpo.b.${Date.now()}@collegeb.edu`,
      role: 'tpo',
      college: collegeB._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(tpoUserB._id);
    const tokenTpoB = createToken(tpoUserB);

    // Superadmin
    const superadminUser = await User.create({
      name: 'Platform Superadmin',
      email: `super.${Date.now()}@portal.com`,
      role: 'superadmin',
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(superadminUser._id);
    const tokenSuperadmin = createToken(superadminUser);

    // Companies
    const company1 = await Company.create({
      name: 'AlphaCorp',
      industry: 'Information Technology',
      verified: true,
    });
    createdCompanyIds.push(company1._id);

    const company2 = await Company.create({
      name: 'BetaTech',
      industry: 'Information Technology',
      verified: true,
    });
    createdCompanyIds.push(company2._id);

    const companyMega = await Company.create({
      name: 'MegaCorp',
      industry: 'Information Technology',
      verified: true,
    });
    createdCompanyIds.push(companyMega._id);

    // Recruiter 1 (AlphaCorp)
    const recruiterUser1 = await User.create({
      name: 'Recruiter Alpha',
      email: `recruiter1.${Date.now()}@alphacorp.com`,
      role: 'recruiter',
      company: company1._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(recruiterUser1._id);
    const tokenRecruiter1 = createToken(recruiterUser1);

    // Recruiter 2 (BetaTech - for isolation)
    const recruiterUser2 = await User.create({
      name: 'Recruiter Beta',
      email: `recruiter2.${Date.now()}@betatech.com`,
      role: 'recruiter',
      company: company2._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(recruiterUser2._id);
    const tokenRecruiter2 = createToken(recruiterUser2);

    // Recruiter without company (error test)
    const recruiterUserNoComp = await User.create({
      name: 'Recruiter Unassigned',
      email: `recruiter.nocomp.${Date.now()}@company.com`,
      role: 'recruiter',
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(recruiterUserNoComp._id);
    const tokenRecruiterNoComp = createToken(recruiterUserNoComp);

    // Analyst User (RBAC 403 test)
    const analystUser = await User.create({
      name: 'Analyst Unauthorized',
      email: `analyst.${Date.now()}@analytics.com`,
      role: 'analyst',
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(analystUser._id);
    const tokenAnalyst = createToken(analystUser);

    // Aspirant User (RBAC 403 test)
    const aspirantUser = await User.create({
      name: 'Aspirant Unauthorized',
      email: `aspirant.${Date.now()}@aspirant.com`,
      role: 'aspirant',
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(aspirantUser._id);
    const tokenAspirant = createToken(aspirantUser);

    // Seed Students in College A:
    // S1: CSE, 2025, cgpa 8.5, parsed skills: python, react
    const userS1 = await User.create({
      name: 'Aarav Sharma',
      email: `aarav.${Date.now()}@collegea.edu`,
      role: 'student',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(userS1._id);
    const tokenStudent1 = createToken(userS1);

    const student1 = await Student.create({
      user: userS1._id,
      college: collegeA._id,
      enrollmentNo: 'EN-A1',
      branch: 'CSE',
      batchYear: 2025,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543210',
      resumeUrl: '/uploads/res1.pdf',
      resumeProfile: {
        status: 'parsed',
        source: 'llm',
        skills: [{ name: 'python' }, { name: 'react' }],
      },
      resumeAnalysis: {
        cacheKey: 'test-cache-key-1',
        atsScore: 85,
        target: { type: 'drive', title: 'Software Engineer' },
        missingRequired: ['docker'],
        missingPreferred: ['aws'],
        breakdown: { keywordMatch: 35, structure: 20, impact: 12, actionVerbs: 8, formatting: 10 },
      },
    });
    createdStudentIds.push(student1._id);

    // S2: CSE, 2025, cgpa 7.8, parsed skills: python, nodejs
    const userS2 = await User.create({
      name: 'Bhavna Patel',
      email: `bhavna.${Date.now()}@collegea.edu`,
      role: 'student',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(userS2._id);
    const tokenStudent2 = createToken(userS2);

    const student2 = await Student.create({
      user: userS2._id,
      college: collegeA._id,
      enrollmentNo: 'EN-A2',
      branch: 'CSE',
      batchYear: 2025,
      cgpa: 7.8,
      backlogs: 0,
      phone: '9876543211',
      resumeUrl: '/uploads/res2.pdf',
      resumeProfile: {
        status: 'parsed',
        source: 'llm',
        skills: [{ name: 'python' }, { name: 'nodejs' }],
      },
    });
    createdStudentIds.push(student2._id);

    // S3: ECE, 2025, cgpa 8.0, parsed skills: c++, python
    const userS3 = await User.create({
      name: 'Chirag Desai',
      email: `chirag.${Date.now()}@collegea.edu`,
      role: 'student',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(userS3._id);

    const student3 = await Student.create({
      user: userS3._id,
      college: collegeA._id,
      enrollmentNo: 'EN-A3',
      branch: 'ECE',
      batchYear: 2025,
      cgpa: 8.0,
      backlogs: 0,
      phone: '9876543212',
      resumeUrl: '/uploads/res3.pdf',
      resumeProfile: {
        status: 'parsed',
        source: 'llm',
        skills: [{ name: 'c++' }, { name: 'python' }],
      },
    });
    createdStudentIds.push(student3._id);

    // S4: ECE, 2025, cgpa 7.2, NO resume
    const userS4 = await User.create({
      name: 'Deepa Rao',
      email: `deepa.${Date.now()}@collegea.edu`,
      role: 'student',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(userS4._id);
    const tokenStudent4 = createToken(userS4);

    const student4 = await Student.create({
      user: userS4._id,
      college: collegeA._id,
      enrollmentNo: 'EN-A4',
      branch: 'ECE',
      batchYear: 2025,
      cgpa: 7.2,
      backlogs: 0,
      phone: '9876543213',
      resumeUrl: null,
      resumeProfile: { status: 'none', skills: [] },
    });
    createdStudentIds.push(student4._id);

    // Student in College B (isolation test):
    const userB1 = await User.create({
      name: 'Zack Beta',
      email: `zack.${Date.now()}@collegeb.edu`,
      role: 'student',
      college: collegeB._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(userB1._id);

    const studentB1 = await Student.create({
      user: userB1._id,
      college: collegeB._id,
      enrollmentNo: 'EN-B1',
      branch: 'CSE',
      batchYear: 2025,
      cgpa: 9.0,
      backlogs: 0,
      phone: '9876543214',
      resumeUrl: '/uploads/resB1.pdf',
      resumeProfile: {
        status: 'parsed',
        source: 'llm',
        skills: [{ name: 'python' }],
      },
    });
    createdStudentIds.push(studentB1._id);

    // Seed Drives for College A:
    const drive1 = await Drive.create({
      company: company1._id,
      college: collegeA._id,
      role: 'Software Engineer',
      title: 'AlphaCorp Campus Drive 2025',
      packageLpa: 12.0,
      location: 'Pune',
      driveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      allowedBranches: ['CSE', 'ECE'],
      status: 'open',
      minCgpa: 7.0,
      maxBacklogs: 0,
      requiredSkills: ['python', 'react'],
      preferredSkills: ['docker'],
    });
    createdDriveIds.push(drive1._id);

    const drive2 = await Drive.create({
      company: company2._id,
      college: collegeA._id,
      role: 'Systems Engineer',
      title: 'BetaTech Engineering Drive',
      packageLpa: 10.0,
      location: 'Bangalore',
      driveDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      allowedBranches: ['ECE', 'CSE'],
      status: 'open',
      minCgpa: 7.5,
      maxBacklogs: 0,
      requiredSkills: ['c++', 'linux'],
    });
    createdDriveIds.push(drive2._id);

    // Seed Drive for College B:
    const driveB = await Drive.create({
      company: companyMega._id,
      college: collegeB._id,
      role: 'Cloud Architect',
      title: 'MegaCorp Cloud Drive',
      packageLpa: 15.0,
      location: 'Mumbai',
      driveDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      lastDateToApply: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      allowedBranches: ['CSE'],
      status: 'open',
      minCgpa: 8.0,
      maxBacklogs: 0,
    });
    createdDriveIds.push(driveB._id);

    // Rounds for Drive 1 and 2
    const round1 = await Round.create({
      drive: drive1._id,
      name: 'Technical Round 1',
      order: 1,
      type: 'technical',
    });
    createdRoundIds.push(round1._id);

    const round2 = await Round.create({
      drive: drive2._id,
      name: 'Technical Round',
      order: 1,
      type: 'technical',
    });
    createdRoundIds.push(round2._id);

    // Seed Applications & Offers:
    // S1 applied to Drive 1, received offer 12.0 LPA, accepted
    const app1 = await Application.create({
      drive: drive1._id,
      student: student1._id,
      status: 'shortlisted',
    });
    createdAppIds.push(app1._id);

    const part1 = await RoundParticipant.create({
      round: round1._id,
      drive: drive1._id,
      student: student1._id,
      application: app1._id,
      result: 'cleared',
      status: 'cleared',
    });
    createdParticipantIds.push(part1._id);

    const offer1 = await Offer.create({
      drive: drive1._id,
      student: student1._id,
      company: company1._id,
      college: collegeA._id,
      packageLpa: 12.0,
      role: 'Software Engineer',
      status: 'accepted',
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    createdOfferIds.push(offer1._id);

    // S2 applied to Drive 1, received offer 10.0 LPA, pending
    const app2 = await Application.create({
      drive: drive1._id,
      student: student2._id,
      status: 'shortlisted',
    });
    createdAppIds.push(app2._id);

    const part2 = await RoundParticipant.create({
      round: round1._id,
      drive: drive1._id,
      student: student2._id,
      application: app2._id,
      result: 'cleared',
      status: 'cleared',
    });
    createdParticipantIds.push(part2._id);

    const offer2 = await Offer.create({
      drive: drive1._id,
      student: student2._id,
      company: company1._id,
      college: collegeA._id,
      packageLpa: 10.0,
      role: 'Associate Software Engineer',
      status: 'offered',
      expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdOfferIds.push(offer2._id);

    // S3 applied to Drive 2, received offer 18.0 LPA, accepted
    const app3 = await Application.create({
      drive: drive2._id,
      student: student3._id,
      status: 'shortlisted',
    });
    createdAppIds.push(app3._id);

    const part3 = await RoundParticipant.create({
      round: round2._id,
      drive: drive2._id,
      student: student3._id,
      application: app3._id,
      result: 'cleared',
      status: 'cleared',
    });
    createdParticipantIds.push(part3._id);

    const offer3 = await Offer.create({
      drive: drive2._id,
      student: student3._id,
      company: company2._id,
      college: collegeA._id,
      packageLpa: 18.0,
      role: 'Systems Engineer',
      status: 'accepted',
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    createdOfferIds.push(offer3._id);

    // College B: Student B1 applied to Drive B, received offer 40.0 LPA, accepted
    const appB = await Application.create({
      drive: driveB._id,
      student: studentB1._id,
      status: 'shortlisted',
    });
    createdAppIds.push(appB._id);

    const offerB = await Offer.create({
      drive: driveB._id,
      student: studentB1._id,
      company: companyMega._id,
      college: collegeB._id,
      packageLpa: 40.0,
      role: 'Cloud Architect',
      status: 'accepted',
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    createdOfferIds.push(offerB._id);

    // Seed InterviewPanel & InterviewSlot for Student 1
    const panel1 = await InterviewPanel.create({
      round: round1._id,
      drive: drive1._id,
      name: 'Technical Panel 1',
      interviewers: [{ name: 'Alex Lead', email: 'alex@alphacorp.com' }],
      venueOrLink: 'https://meet.google.com/abc-defg-hij',
      room: 'Virtual Room 1',
    });
    createdPanelIds.push(panel1._id);

    const slot1 = await InterviewSlot.create({
      round: round1._id,
      drive: drive1._id,
      panel: panel1._id,
      student: student1._id,
      application: app1._id,
      startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      meetingLink: 'https://meet.google.com/abc-defg-hij',
      status: 'scheduled',
      queueNumber: 1,
    });
    createdSlotIds.push(slot1._id);

    // Seed JobRequirement & DriveRequest for Recruiter 1
    const jobReq1 = await JobRequirement.create({
      company: company1._id,
      title: 'Full Stack Engineer',
      description: 'Hiring full-stack software engineers',
      packageLpa: 12.0,
      openings: 5,
      skills: ['react', 'node.js', 'python'],
      minCgpa: 7.0,
      maxBacklogs: 0,
      allowedBranches: ['CSE', 'ECE'],
      batchYear: 2025,
    });
    createdJobReqIds.push(jobReq1._id);

    const driveReq1 = await DriveRequest.create({
      jobRequirement: jobReq1._id,
      company: company1._id,
      college: collegeA._id,
      proposedDates: [new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)],
      mode: 'on-campus',
      status: 'pending',
    });
    createdDriveReqIds.push(driveReq1._id);

    console.log('✓ Multi-role test fixtures successfully created.\n');

    // =================================================================
    // TEST 1: Pure Functions Tool Verification on Known Dataset
    // =================================================================
    console.log('TEST 1: Pure functions tool verification (TPO, Student, Recruiter)...');

    // --- TPO Pure Tools ---
    const summaryAll = await assistantTools.placementSummary(collegeA._id);
    assert.strictEqual(summaryAll.totalStudents, 4, 'College A has 4 total students');
    assert.strictEqual(summaryAll.placedStudents, 2, '2 students have accepted offers');
    assert.strictEqual(summaryAll.placementPercentage, 50.0, 'Placement rate is 50%');

    const deptBreakdown = await assistantTools.departmentBreakdown(collegeA._id);
    assert.strictEqual(deptBreakdown.length, 2, '2 departments (CSE and ECE)');

    const unplaced = await assistantTools.unplacedStudents(collegeA._id);
    assert.strictEqual(unplaced.count, 2, 'Total 2 unplaced students');
    assert.strictEqual(unplaced.students[0].phone, undefined, 'phone must NOT be leaked');
    assert.strictEqual(unplaced.students[0].email, undefined, 'email must NOT be leaked');

    const compStats = await assistantTools.companyStats(collegeA._id);
    assert.strictEqual(compStats.length, 2, '2 companies recruited from College A');

    const funnel = await assistantTools.driveFunnel(collegeA._id, { company: 'AlphaCorp' });
    assert.strictEqual(funnel.found, true);
    assert.strictEqual(funnel.applied, 2);
    assert.strictEqual(funnel.accepted, 1);

    const upcoming = await assistantTools.upcomingDrives(collegeA._id, { days: 30 });
    assert.strictEqual(upcoming.length, 2, '2 upcoming drives at College A');

    const offers = await assistantTools.offerStatus(collegeA._id);
    assert.strictEqual(offers.total, 3);
    assert.strictEqual(offers.expiringSoon, 1);

    const pyStudents = await assistantTools.studentsWithSkill(collegeA._id, { skill: 'python' });
    assert.strictEqual(pyStudents.count, 3);

    const noResume = await assistantTools.studentsWithoutResume(collegeA._id);
    assert.strictEqual(noResume.count, 1);
    assert.strictEqual(noResume.students[0].name, 'Deepa Rao');

    const top = await assistantTools.topPackages(collegeA._id, { limit: 5 });
    assert.strictEqual(top.length, 2);
    assert.strictEqual(top[0].packageLpa, 18.0);

    // --- Student Pure Tools ---
    const s1Apps = await assistantTools.myApplications(student1);
    assert.strictEqual(s1Apps.count, 1, 'Student 1 has 1 application');
    assert.strictEqual(s1Apps.applications[0].company, 'AlphaCorp');
    assert.strictEqual(s1Apps.applications[0].status, 'shortlisted');

    const s1Interviews = await assistantTools.myUpcomingInterviews(student1);
    assert.strictEqual(s1Interviews.count, 1, 'Student 1 has 1 scheduled interview');
    assert.strictEqual(s1Interviews.interviews[0].company, 'AlphaCorp');
    assert.strictEqual(s1Interviews.interviews[0].meetingLink, 'https://meet.google.com/abc-defg-hij');

    const s1Eligible = await assistantTools.upcomingEligibleDrives(student1);
    assert(s1Eligible.count >= 1, 'Student 1 is eligible for drives');
    const eligibleCompNames = s1Eligible.drives.map((d) => d.company);
    assert(eligibleCompNames.includes('AlphaCorp'));

    const s1EligCheckAlpha = await assistantTools.myEligibility(student1, { company: 'AlphaCorp' });
    assert.strictEqual(s1EligCheckAlpha.isEligible, true, 'Student 1 is eligible for AlphaCorp');
    assert.strictEqual(s1EligCheckAlpha.checks.cgpa.pass, true);
    assert.strictEqual(s1EligCheckAlpha.checks.branch.pass, true);

    const s4EligCheckBeta = await assistantTools.myEligibility(student4, { company: 'BetaTech' });
    assert.strictEqual(s4EligCheckBeta.isEligible, false, 'Student 4 has CGPA 7.2 < 7.5 minCgpa');
    assert.strictEqual(s4EligCheckBeta.checks.cgpa.pass, false);

    const s1Resume = await assistantTools.myResumeStatus(student1);
    assert.strictEqual(s1Resume.hasResume, true);
    assert.strictEqual(s1Resume.isParsed, true);
    assert.strictEqual(s1Resume.skillsCount, 2);
    assert.strictEqual(s1Resume.atsScore, 85);

    const s4Resume = await assistantTools.myResumeStatus(student4);
    assert.strictEqual(s4Resume.hasResume, false);
    assert.strictEqual(s4Resume.isParsed, false);
    assert.strictEqual(s4Resume.skillsCount, 0);

    // --- Recruiter Pure Tools ---
    const rSummary = await assistantTools.myDrivesSummary(company1._id);
    assert.strictEqual(rSummary.totalDrives, 1);
    assert.strictEqual(rSummary.totalApplicants, 2);
    assert.strictEqual(rSummary.totalOffers, 1);

    const rFunnel = await assistantTools.myDriveFunnel(company1._id, { driveId: drive1._id });
    assert.strictEqual(rFunnel.applied, 2);
    assert.strictEqual(rFunnel.shortlisted, 2);
    assert.strictEqual(rFunnel.accepted, 1);
    assert.strictEqual(rFunnel.conversionRate, 50);

    const rTopApplicants = await assistantTools.myTopApplicants(company1._id, { driveId: drive1._id, limit: 5 });
    assert.strictEqual(rTopApplicants.totalApplicants, 2);
    assert(rTopApplicants.applicants.length <= 5);
    assert(rTopApplicants.applicants[0].name, 'Applicant name must be present');

    const rRequests = await assistantTools.myDriveRequests(company1._id);
    assert.strictEqual(rRequests.totalRequests, 1);
    assert.strictEqual(rRequests.statusCounts.pending, 1);

    console.log('✓ All pure tool functions (TPO, Student, Recruiter) return accurate data\n');

    // =================================================================
    // TEST 2: College Scope Isolation via API (TPO)
    // =================================================================
    console.log('TEST 2: College isolation & security guards (TPO)...');

    const resA = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoA}`,
      },
      body: JSON.stringify({ question: 'What is our placement summary?' }),
    });
    assert.strictEqual(resA.status, 200);
    const jsonA = await resA.json();
    assert.strictEqual(jsonA.success, true);
    assert.strictEqual(jsonA.data.totalStudents, 4, 'TPO A sees College A total students');

    // Mock Provider attempts to spoof collegeId in params
    mockProvider.mockAssistantResponse = {
      tool: 'placementSummary',
      params: { collegeId: collegeB._id.toString(), batch: 2025 },
    };

    const resSpoof = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoA}`,
      },
      body: JSON.stringify({ question: 'Show placement summary' }),
    });
    assert.strictEqual(resSpoof.status, 200);
    const jsonSpoof = await resSpoof.json();
    assert.strictEqual(jsonSpoof.data.totalStudents, 4, 'College scope must ignore spoofed collegeId');
    mockProvider.reset();

    const resB = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoB}`,
      },
      body: JSON.stringify({ question: 'What is our placement summary?' }),
    });
    assert.strictEqual(resB.status, 200);
    const jsonB = await resB.json();
    assert.strictEqual(jsonB.data.totalStudents, 1, 'TPO B sees only College B student');
    console.log('✓ College isolation confirmed: cross-college params strictly neutralized\n');

    // =================================================================
    // TEST 3: Student Tools & Student Isolation via API
    // =================================================================
    console.log('TEST 3: Student tools and student data isolation...');

    // 1. Student 1 queries myApplications
    const resS1Apps = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'What is the status of my drive applications?' }),
    });
    assert.strictEqual(resS1Apps.status, 200);
    const jsonS1Apps = await resS1Apps.json();
    assert.strictEqual(jsonS1Apps.tool, 'myApplications');
    assert.strictEqual(jsonS1Apps.data.count, 1, 'Student 1 has 1 application');
    assert.strictEqual(jsonS1Apps.data.applications[0].company, 'AlphaCorp');

    // 2. Student 1 queries myUpcomingInterviews
    const resS1Int = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'When is my upcoming interview?' }),
    });
    assert.strictEqual(resS1Int.status, 200);
    const jsonS1Int = await resS1Int.json();
    assert.strictEqual(jsonS1Int.tool, 'myUpcomingInterviews');
    assert.strictEqual(jsonS1Int.data.count, 1);
    assert.strictEqual(jsonS1Int.data.interviews[0].company, 'AlphaCorp');

    // 3. Student 1 queries upcomingEligibleDrives
    const resS1Drives = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'What drives can I apply for?' }),
    });
    assert.strictEqual(resS1Drives.status, 200);
    const jsonS1Drives = await resS1Drives.json();
    assert.strictEqual(jsonS1Drives.tool, 'upcomingEligibleDrives');
    assert(jsonS1Drives.data.count >= 1);

    // 4. Student 1 queries myEligibility for AlphaCorp
    const resS1Elig = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'Am I eligible for AlphaCorp?' }),
    });
    assert.strictEqual(resS1Elig.status, 200);
    const jsonS1Elig = await resS1Elig.json();
    assert.strictEqual(jsonS1Elig.tool, 'myEligibility');
    assert.strictEqual(jsonS1Elig.data.isEligible, true);

    // 5. Student 1 queries myResumeStatus
    const resS1Resume = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'Check my resume status and ats score' }),
    });
    assert.strictEqual(resS1Resume.status, 200);
    const jsonS1Resume = await resS1Resume.json();
    assert.strictEqual(jsonS1Resume.tool, 'myResumeStatus');
    assert.strictEqual(jsonS1Resume.data.skillsCount, 2);
    assert.strictEqual(jsonS1Resume.data.atsScore, 85);

    // 6. Student Isolation: Student 4 (no applications, no resume)
    const resS4Apps = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent4}`,
      },
      body: JSON.stringify({ question: 'Show my applications' }),
    });
    assert.strictEqual(resS4Apps.status, 200);
    const jsonS4Apps = await resS4Apps.json();
    assert.strictEqual(jsonS4Apps.data.count, 0, 'Student 4 has 0 applications and cannot see Student 1 apps');

    // 7. Student Spoofing Defense: Student 4 tries to pass studentId: student1._id
    mockProvider.mockAssistantResponse = {
      tool: 'myApplications',
      params: { studentId: student1._id.toString() },
    };
    const resS4Spoof = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent4}`,
      },
      body: JSON.stringify({ question: 'Show my applications' }),
    });
    assert.strictEqual(resS4Spoof.status, 200);
    const jsonS4Spoof = await resS4Spoof.json();
    assert.strictEqual(
      jsonS4Spoof.data.count,
      0,
      'Student scope must be strictly bound to authenticated token; spoofed studentId ignored'
    );
    mockProvider.reset();
    console.log('✓ Student tools verified and cross-student data access strictly isolated\n');

    // =================================================================
    // TEST 4: Recruiter Tools & Recruiter Isolation via API
    // =================================================================
    console.log('TEST 4: Recruiter tools and recruiter company isolation...');

    // 1. Recruiter 1 (AlphaCorp) queries myDrivesSummary
    const resR1Summary = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'Show my drives summary' }),
    });
    assert.strictEqual(resR1Summary.status, 200);
    const jsonR1Summary = await resR1Summary.json();
    assert.strictEqual(jsonR1Summary.tool, 'myDrivesSummary');
    assert.strictEqual(jsonR1Summary.data.totalDrives, 1);
    assert.strictEqual(jsonR1Summary.data.totalApplicants, 2);

    // 2. Recruiter 1 queries myDriveFunnel
    const resR1Funnel = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'Show applicant recruitment funnel' }),
    });
    assert.strictEqual(resR1Funnel.status, 200);
    const jsonR1Funnel = await resR1Funnel.json();
    assert.strictEqual(jsonR1Funnel.tool, 'myDriveFunnel');
    assert.strictEqual(jsonR1Funnel.data.applied, 2);
    assert.strictEqual(jsonR1Funnel.data.accepted, 1);

    // 3. Recruiter 1 queries myTopApplicants
    const resR1Top = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'Show top candidates for my drive' }),
    });
    assert.strictEqual(resR1Top.status, 200);
    const jsonR1Top = await resR1Top.json();
    assert.strictEqual(jsonR1Top.tool, 'myTopApplicants');
    assert.strictEqual(jsonR1Top.data.totalApplicants, 2);

    // 4. Recruiter 1 queries myDriveRequests
    const resR1Reqs = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'What is the status of my drive requests?' }),
    });
    assert.strictEqual(resR1Reqs.status, 200);
    const jsonR1Reqs = await resR1Reqs.json();
    assert.strictEqual(jsonR1Reqs.tool, 'myDriveRequests');
    assert.strictEqual(jsonR1Reqs.data.totalRequests, 1);

    // 5. Recruiter Isolation: Recruiter 2 (BetaTech) sees only BetaTech drives
    const resR2Summary = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter2}`,
      },
      body: JSON.stringify({ question: 'Show my drives summary' }),
    });
    assert.strictEqual(resR2Summary.status, 200);
    const jsonR2Summary = await resR2Summary.json();
    assert.strictEqual(jsonR2Summary.data.totalDrives, 1);
    assert.strictEqual(jsonR2Summary.data.drives[0].role, 'Systems Engineer');

    // 6. Recruiter Spoofing Defense: Recruiter 2 tries to pass companyId of Company 1
    mockProvider.mockAssistantResponse = {
      tool: 'myDrivesSummary',
      params: { companyId: company1._id.toString() },
    };
    const resR2Spoof = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter2}`,
      },
      body: JSON.stringify({ question: 'Show my drives summary' }),
    });
    assert.strictEqual(resR2Spoof.status, 200);
    const jsonR2Spoof = await resR2Spoof.json();
    assert.strictEqual(
      jsonR2Spoof.data.drives[0].role,
      'Systems Engineer',
      'Recruiter scope must be strictly bound to authenticated token; spoofed companyId ignored'
    );
    mockProvider.reset();
    console.log('✓ Recruiter tools verified and cross-company drives strictly isolated\n');

    // =================================================================
    // TEST 5: Strict Role Enforcement & Cross-Role Denial
    // =================================================================
    console.log('TEST 5: Role authorization matrix and cross-role denial...');

    // 1. Mock provider returns a TPO tool (placementSummary) when called by Student -> Rejected
    mockProvider.mockAssistantResponse = {
      tool: 'placementSummary',
      params: {},
    };
    const resStudentTpoTool = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'Show placement summary' }),
    });
    assert.strictEqual(resStudentTpoTool.status, 200);
    const jsonStudentTpoTool = await resStudentTpoTool.json();
    assert.strictEqual(jsonStudentTpoTool.canAnswer, false, 'Student cannot run TPO tools; friendly refusal returned');
    assert(jsonStudentTpoTool.answer.includes('student placement assistant'));
    mockProvider.reset();

    // 2. Mock provider returns a Student tool (myApplications) when called by Recruiter -> Rejected
    mockProvider.mockAssistantResponse = {
      tool: 'myApplications',
      params: {},
    };
    const resRecruiterStudentTool = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'Show applications' }),
    });
    assert.strictEqual(resRecruiterStudentTool.status, 200);
    const jsonRecruiterStudentTool = await resRecruiterStudentTool.json();
    assert.strictEqual(jsonRecruiterStudentTool.canAnswer, false, 'Recruiter cannot run Student tools');
    assert(jsonRecruiterStudentTool.answer.includes('recruiter assistant'));
    mockProvider.reset();

    // 3. Analyst User -> 403 Forbidden
    const resAnalyst = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAnalyst}`,
      },
      body: JSON.stringify({ question: 'Show summary' }),
    });
    assert.strictEqual(resAnalyst.status, 403, 'Analyst must receive 403 Forbidden');

    // 4. Aspirant User -> 403 Forbidden
    const resAspirant = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAspirant}`,
      },
      body: JSON.stringify({ question: 'Show summary' }),
    });
    assert.strictEqual(resAspirant.status, 403, 'Aspirant must receive 403 Forbidden');

    // 5. Recruiter without company -> 403 Forbidden
    const resRecruiterNoComp = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiterNoComp}`,
      },
      body: JSON.stringify({ question: 'Show summary' }),
    });
    assert.strictEqual(resRecruiterNoComp.status, 403, 'Recruiter without company must receive 403 Forbidden');

    // 6. Superadmin without collegeId -> 400 Bad Request
    const resSuperNoCol = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperadmin}`,
      },
      body: JSON.stringify({ question: 'Show summary' }),
    });
    assert.strictEqual(resSuperNoCol.status, 400);

    // 7. Superadmin with collegeId -> 200 OK
    const resSuperWithCol = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuperadmin}`,
      },
      body: JSON.stringify({
        question: 'Show summary',
        collegeId: collegeA._id.toString(),
      }),
    });
    assert.strictEqual(resSuperWithCol.status, 200);
    const jsonSuperWithCol = await resSuperWithCol.json();
    assert.strictEqual(jsonSuperWithCol.data.totalStudents, 4);
    console.log('✓ Strict role enforcement verified: cross-role tools refused, unauthorized roles rejected with 403\n');

    // =================================================================
    // TEST 6: Help Mode (Deterministic, 0 extra LLM calls)
    // =================================================================
    console.log('TEST 6: Curated help mode across all roles...');

    // 1. TPO asks "How to schedule the campus drive?"
    const resTpoHelp = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoA}`,
      },
      body: JSON.stringify({ question: 'How to schedule the campus drive?' }),
    });
    assert.strictEqual(resTpoHelp.status, 200);
    const jsonTpoHelp = await resTpoHelp.json();
    assert.strictEqual(jsonTpoHelp.tool, 'help');
    assert.strictEqual(jsonTpoHelp.source, 'help');
    assert.strictEqual(jsonTpoHelp.data.topicId, 'tpo-schedule-drive');
    assert(jsonTpoHelp.answer.includes('Campus Drive'));

    // 2. Student asks "How do I apply for a placement drive?"
    const resStudentHelp = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'How do I apply for a placement drive?' }),
    });
    assert.strictEqual(resStudentHelp.status, 200);
    const jsonStudentHelp = await resStudentHelp.json();
    assert.strictEqual(jsonStudentHelp.tool, 'help');
    assert.strictEqual(jsonStudentHelp.source, 'help');
    assert.strictEqual(jsonStudentHelp.data.topicId, 'student-apply-drive');
    assert(jsonStudentHelp.answer.includes('Eligible Drives'));

    // 3. Recruiter asks "How do I request a campus drive?"
    const resRecruiterHelp = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
      body: JSON.stringify({ question: 'How do I request a campus drive with colleges?' }),
    });
    assert.strictEqual(resRecruiterHelp.status, 200);
    const jsonRecruiterHelp = await resRecruiterHelp.json();
    assert.strictEqual(jsonRecruiterHelp.tool, 'help');
    assert.strictEqual(jsonRecruiterHelp.source, 'help');
    assert.strictEqual(jsonRecruiterHelp.data.topicId, 'recruiter-request-campus-drive');
    assert(jsonRecruiterHelp.answer.toLowerCase().includes('campus drive'));
    console.log('✓ Curated help mode verified with 0 extra LLM calls across all roles\n');

    // =================================================================
    // TEST 7: General Mode (Placement & Career Advisor)
    // =================================================================
    console.log('TEST 7: General career advisor and off-topic rejection...');

    // 1. Placement preparation question answered concisely
    const resGeneralPrep = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'How should I prepare for a behavioral interview?' }),
    });
    assert.strictEqual(resGeneralPrep.status, 200);
    const jsonGeneralPrep = await resGeneralPrep.json();
    assert.strictEqual(jsonGeneralPrep.tool, 'general');
    assert.strictEqual(jsonGeneralPrep.source, 'general');
    assert(jsonGeneralPrep.answer.length > 20);
    assert(!jsonGeneralPrep.answer.includes('http'), 'No URLs allowed in general answers');

    // 2. Off-topic question refused politely
    const resGeneralOffTopic = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStudent1}`,
      },
      body: JSON.stringify({ question: 'What is the capital of France and recipe for pizza?' }),
    });
    assert.strictEqual(resGeneralOffTopic.status, 200);
    const jsonOffTopic = await resGeneralOffTopic.json();
    assert.strictEqual(jsonOffTopic.tool, 'general');
    assert(
      jsonOffTopic.answer.includes('only answer questions related to careers') ||
      jsonOffTopic.answer.includes('placements')
    );

    // 3. Provider failure simulation handles error gracefully
    mockProvider.forceInvalidJsonCount = 2;
    const resFailure = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoA}`,
      },
      body: JSON.stringify({ question: 'What is our placement summary?' }),
    });
    assert.strictEqual(resFailure.status, 200);
    const jsonFailure = await resFailure.json();
    assert.strictEqual(jsonFailure.success, true);
    assert.strictEqual(jsonFailure.source, 'rules');
    mockProvider.reset();
    console.log('✓ General mode verified: on-topic answers, off-topic refusal, provider failure resilience\n');

    // =================================================================
    // TEST 8: Assistant Daily Chat Quota (AI_USER_DAILY_CHAT_CAP)
    // =================================================================
    console.log('TEST 8: Assistant daily chat cap and direct /run zero-quota verification...');

    // 1. Direct /run consumes 0 chat quota
    const usageBeforeRun = await AiUsage.getUserDailyUsage(tpoUserA._id);
    const resDirectRun = await fetch(`${BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTpoA}`,
      },
      body: JSON.stringify({
        tool: 'upcomingDrives',
        params: { days: 30 },
      }),
    });
    assert.strictEqual(resDirectRun.status, 200);
    const jsonDirectRun = await resDirectRun.json();
    assert.strictEqual(jsonDirectRun.source, 'direct');
    const usageAfterRun = await AiUsage.getUserDailyUsage(tpoUserA._id);
    assert.strictEqual(
      usageAfterRun.chat.used,
      usageBeforeRun.chat.used,
      'Direct /run must consume 0 chat quota'
    );

    // 2. Exhaust chat quota for a dedicated test user
    const chatQuotaUser = await User.create({
      name: 'Quota Exhausted User',
      email: `quota.${Date.now()}@collegea.edu`,
      role: 'student',
      college: collegeA._id,
      password: 'Krypton#2026!Valid',
      isVerified: true,
      isApproved: true,
    });
    createdUserIds.push(chatQuotaUser._id);
    const tokenQuotaUser = createToken(chatQuotaUser);

    const studentQuota = await Student.create({
      user: chatQuotaUser._id,
      college: collegeA._id,
      enrollmentNo: `EN-Q-${Date.now()}`,
      branch: 'CSE',
      batchYear: 2025,
      cgpa: 8.0,
      backlogs: 0,
      phone: '9876543299',
      resumeUrl: '/uploads/resQ.pdf',
      resumeProfile: { status: 'parsed', skills: [{ name: 'python' }] },
    });
    createdStudentIds.push(studentQuota._id);

    // Artificially record 30 chat calls to exhaust the default 30 daily cap
    const todayKey = AiUsage.getTodayKey();
    let usageDoc = await AiUsage.findOne({ date: todayKey });
    if (!usageDoc) {
      usageDoc = await AiUsage.create({ date: todayKey });
    }
    usageDoc.userChatCounts.set(String(chatQuotaUser._id), 30);
    await usageDoc.save();

    const userUsage = await AiUsage.getUserDailyUsage(chatQuotaUser._id);
    assert.strictEqual(userUsage.chat.remaining, 0, 'Chat quota should be 0 remaining');
    assert.strictEqual(userUsage.remaining, 5, 'Resume parse quota must remain untouched (5 remaining)');
    assert.strictEqual(userUsage.analyze.remaining, 10, 'Resume analyze quota must remain untouched (10 remaining)');

    // 3. User with 0 chat quota calls /ask on general question -> 429 Rate Limited
    const resExhausted = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenQuotaUser}`,
      },
      body: JSON.stringify({ question: 'How should I prepare for interview?' }),
    });
    assert.strictEqual(resExhausted.status, 429, 'Exhausted chat quota must return 429 Rate Limited');
    const jsonExhausted = await resExhausted.json();
    assert.strictEqual(jsonExhausted.status, 'rate_limited');
    assert.strictEqual(jsonExhausted.dailyUsage.chat.remaining, 0);

    // 4. Help topic remains accessible with 0 quota (help hits consume 0 quota)
    const resExhaustedHelp = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenQuotaUser}`,
      },
      body: JSON.stringify({ question: 'How do I apply for a placement drive?' }),
    });
    assert.strictEqual(resExhaustedHelp.status, 200);
    const jsonExhaustedHelp = await resExhaustedHelp.json();
    assert.strictEqual(jsonExhaustedHelp.source, 'help', 'Help queries remain available even with 0 chat quota');

    // 5. Direct /run remains accessible with 0 quota
    const resExhaustedRun = await fetch(`${BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenQuotaUser}`,
      },
      body: JSON.stringify({
        tool: 'myApplications',
        params: {},
      }),
    });
    assert.strictEqual(resExhaustedRun.status, 200);
    const jsonExhaustedRun = await resExhaustedRun.json();
    assert.strictEqual(jsonExhaustedRun.source, 'direct');

    // 6. Confirm and verify: questions answered purely by rules matcher (no provider call) consume 0 quota
    const freshUserRes = await User.create({
      name: 'Rules Matcher Quota Tester',
      email: `rules_quota_${Date.now()}@college-a.edu`,
      password: 'Krypton#2026!Valid',
      role: 'student',
      college: collegeA._id,
      isVerified: true,
    });
    createdUserIds.push(freshUserRes._id);
    const tokenFreshUser = jwt.sign(
      { id: freshUserRes._id, role: 'student', college: collegeA._id },
      process.env.JWT_SECRET || 'testsecret'
    );
    const freshStudentDoc = await Student.create({
      user: freshUserRes._id,
      college: collegeA._id,
      enrollmentNo: `EN-RQ-${Date.now()}`,
      branch: 'CSE',
      batchYear: 2025,
      cgpa: 8.5,
      backlogs: 0,
      phone: '9876543298',
      resumeUrl: '/uploads/resRQ.pdf',
      resumeProfile: { status: 'parsed', skills: [{ name: 'react' }] },
    });
    createdStudentIds.push(freshStudentDoc._id);

    const initialUsage = await AiUsage.getUserDailyUsage(freshUserRes._id);
    assert.strictEqual(initialUsage.chat.used, 0, 'Initial chat usage should be 0');

    // (a) Ask deterministic help question -> answered purely by knowledge base, 0 provider calls
    const resHelpOnly = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFreshUser}`,
      },
      body: JSON.stringify({ question: 'How to apply for a placement drive?' }),
    });
    assert.strictEqual(resHelpOnly.status, 200);
    const jsonHelpOnly = await resHelpOnly.json();
    assert.strictEqual(jsonHelpOnly.source, 'help');
    const usageAfterHelp = await AiUsage.getUserDailyUsage(freshUserRes._id);
    assert.strictEqual(usageAfterHelp.chat.used, 0, 'Help topic must NOT consume AI_USER_DAILY_CHAT_CAP');

    // (b) Ask question when mock provider fails (forceInvalidJsonCount=2) -> rules matcher fallback
    mockProvider.forceInvalidJsonCount = 2;
    const resRuleFallback = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFreshUser}`,
      },
      body: JSON.stringify({ question: 'What is the status of my drive applications?' }),
    });
    assert.strictEqual(resRuleFallback.status, 200);
    const jsonRuleFallback = await resRuleFallback.json();
    assert.strictEqual(jsonRuleFallback.source, 'rules');
    const usageAfterRule = await AiUsage.getUserDailyUsage(freshUserRes._id);
    assert.strictEqual(usageAfterRule.chat.used, 0, 'Pure rules matcher fallback must NOT consume AI_USER_DAILY_CHAT_CAP');
    mockProvider.reset();

    // (c) Ask data query routed by AI -> actively calls provider for routing -> consumes exactly 1 call
    const resActualLlm = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFreshUser}`,
      },
      body: JSON.stringify({ question: 'What is the status of my drive applications?' }),
    });
    assert.strictEqual(resActualLlm.status, 200);
    const jsonActualLlm = await resActualLlm.json();
    assert.strictEqual(jsonActualLlm.source, 'ai');
    const usageAfterLlm = await AiUsage.getUserDailyUsage(freshUserRes._id);
    assert.strictEqual(usageAfterLlm.chat.used, 1, 'Actual AI router completion MUST increment chat quota by exactly 1');

    // (d) General career advisor question -> AI router (1) + bounded career advisor completion (1) = 2 calls
    const resAdvisor = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFreshUser}`,
      },
      body: JSON.stringify({ question: 'How should I prepare for interview?' }),
    });
    assert.strictEqual(resAdvisor.status, 200);
    const jsonAdvisor = await resAdvisor.json();
    assert.strictEqual(jsonAdvisor.source, 'general');
    const usageAfterAdvisor = await AiUsage.getUserDailyUsage(freshUserRes._id);
    assert.strictEqual(usageAfterAdvisor.chat.used, 3, 'AI router + career advisor completion increments by 2 (total 3)');
    console.log('✓ Quota non-consumption on rules/help matcher confirmed and verified against real LLM calls\n');
    console.log('✓ Chat cap enforcement verified: 429 on exhaustion, zero-quota help & direct paths intact\n');

    // =================================================================
    // TEST 9: Dynamic Department Suggestions & ChatLog Audit
    // =================================================================
    console.log('TEST 9: Dynamic department suggestions and ChatLog audit...');

    // 1. TPO suggestions dynamically use College A's real departments (CSE, ECE)
    const resTpoSugg = await fetch(`${BASE_URL}/suggestions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenTpoA}`,
      },
    });
    assert.strictEqual(resTpoSugg.status, 200);
    const jsonTpoSugg = await resTpoSugg.json();
    assert.strictEqual(jsonTpoSugg.success, true);
    assert.strictEqual(jsonTpoSugg.role, 'tpo');
    assert(Array.isArray(jsonTpoSugg.suggestions));
    const unplacedChip = jsonTpoSugg.suggestions.find((s) => s.tool === 'unplacedStudents');
    assert(unplacedChip, 'Unplaced chip must exist in TPO suggestions');
    assert(
      unplacedChip.params.department === 'CSE' || unplacedChip.params.department === 'ECE',
      'Unplaced chip department must be dynamically queried from College A students'
    );

    // 2. Student suggestions
    const resStudentSugg = await fetch(`${BASE_URL}/suggestions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenStudent1}`,
      },
    });
    assert.strictEqual(resStudentSugg.status, 200);
    const jsonStudentSugg = await resStudentSugg.json();
    assert.strictEqual(jsonStudentSugg.role, 'student');
    const studentTools = jsonStudentSugg.suggestions.map((s) => s.tool);
    assert(studentTools.includes('myApplications'));
    assert(studentTools.includes('upcomingEligibleDrives'));

    // 3. Recruiter suggestions
    const resRecruiterSugg = await fetch(`${BASE_URL}/suggestions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenRecruiter1}`,
      },
    });
    assert.strictEqual(resRecruiterSugg.status, 200);
    const jsonRecruiterSugg = await resRecruiterSugg.json();
    assert.strictEqual(jsonRecruiterSugg.role, 'recruiter');
    const recruiterTools = jsonRecruiterSugg.suggestions.map((s) => s.tool);
    assert(recruiterTools.includes('myDrivesSummary'));
    assert(recruiterTools.includes('myDriveFunnel'));

    // 4. ChatLog audit records check across roles
    const studentLogs = await ChatLog.find({ user: userS1._id }).lean();
    assert(studentLogs.length > 0, 'Student logs must exist');
    assert.strictEqual(studentLogs[0].role, 'student');
    assert.strictEqual(studentLogs[0].data, undefined, 'Results must NEVER be stored');
    assert.strictEqual(studentLogs[0].result, undefined, 'Results must NEVER be stored');

    const recruiterLogs = await ChatLog.find({ user: recruiterUser1._id }).lean();
    assert(recruiterLogs.length > 0, 'Recruiter logs must exist');
    assert.strictEqual(recruiterLogs[0].role, 'recruiter');
    assert.strictEqual(recruiterLogs[0].college, undefined, 'Recruiter college is optional/undefined');
    assert(recruiterLogs[0].company, 'Recruiter company reference must be populated');
    assert.strictEqual(recruiterLogs[0].data, undefined);

    const tpoLogs = await ChatLog.find({ user: tpoUserA._id }).lean();
    assert(tpoLogs.length > 0, 'TPO logs must exist');
    assert.strictEqual(tpoLogs[0].role, 'tpo');
    assert(tpoLogs[0].college, 'TPO college reference must be populated');

    // 5. TTL Index confirmed on ChatLog
    const indexes = await ChatLog.collection.indexes();
    const ttlIndex = indexes.find((idx) => idx.expireAfterSeconds !== undefined);
    assert(ttlIndex, 'TTL index must exist on ChatLog');
    assert.strictEqual(
      ttlIndex.expireAfterSeconds,
      30 * 24 * 60 * 60,
      'TTL index must be set to 30 days'
    );
    console.log('✓ Dynamic suggestions, multi-role ChatLog auditing, and TTL index verified\n');

    console.log('=================================================================');
    console.log('   ALL MULTI-ROLE ASSISTANT TESTS PASSED SUCCESSFULLY (100%)    ');
    console.log('=================================================================\n');
  } finally {
    console.log('Cleaning up assistant test fixtures...');
    await User.deleteMany({ _id: { $in: createdUserIds } });
    await Student.deleteMany({ _id: { $in: createdStudentIds } });
    await Drive.deleteMany({ _id: { $in: createdDriveIds } });
    await Offer.deleteMany({ _id: { $in: createdOfferIds } });
    await Application.deleteMany({ _id: { $in: createdAppIds } });
    await RoundParticipant.deleteMany({ _id: { $in: createdParticipantIds } });
    await Round.deleteMany({ _id: { $in: createdRoundIds } });
    await InterviewPanel.deleteMany({ _id: { $in: createdPanelIds } });
    await InterviewSlot.deleteMany({ _id: { $in: createdSlotIds } });
    await JobRequirement.deleteMany({ _id: { $in: createdJobReqIds } });
    await DriveRequest.deleteMany({ _id: { $in: createdDriveReqIds } });
    await College.deleteMany({ _id: { $in: createdCollegeIds } });
    await Company.deleteMany({ _id: { $in: createdCompanyIds } });
    await ChatLog.deleteMany({});
    await AiUsage.deleteMany({});

    mockProvider.reset();
    server.close();
    await mongoose.connection.close();
    console.log('Cleanup complete.');
  }
}

if (require.main === module) {
  runAssistantTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Assistant Test Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = runAssistantTests;
