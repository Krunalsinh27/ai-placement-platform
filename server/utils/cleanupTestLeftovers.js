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
  Offer,
  Placement,
  JobRequirement,
  DriveRequest,
  Round,
  RoundBatch,
  RoundParticipant,
  Aspirant,
} = require('../models');

async function cleanupLeftovers() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
  console.log('Connecting to dev database:', mongoUri);
  await mongoose.connect(mongoUri);

  const report = {
    colleges: 0,
    students: 0,
    users: 0,
    drives: 0,
    applications: 0,
    offers: 0,
    companies: 0,
    deletedCollegesList: [],
  };

  try {
    // 1. Identify test colleges
    const testCollegeQuery = {
      $or: [
        { code: { $regex: /^TEST_/i } },
        { code: { $regex: /^NTI_/i } },
        { name: { $regex: /Alpha Institute/i } },
        { name: { $regex: /Beta Engineering/i } },
        { name: { $regex: /Gamma Pending/i } },
        { name: { $regex: /New Tech/i } },
      ],
    };

    const testColleges = await College.find(testCollegeQuery);
    const testCollegeIds = testColleges.map((c) => c._id);
    report.colleges = testColleges.length;
    report.deletedCollegesList = testColleges.map((c) => `${c.name} (${c.code})`);

    if (testCollegeIds.length > 0) {
      // Find students in these colleges
      const students = await Student.find({ college: { $in: testCollegeIds } });
      const studentIds = students.map((s) => s._id);
      const studentUserIds = students.map((s) => s.user).filter(Boolean);

      report.students = students.length;

      // Delete student applications, offers, placements
      const delApps = await Application.deleteMany({
        $or: [{ student: { $in: studentIds } }, { college: { $in: testCollegeIds } }],
      });
      report.applications = delApps.deletedCount || 0;

      const delOffers = await Offer.deleteMany({
        $or: [{ student: { $in: studentIds } }, { college: { $in: testCollegeIds } }],
      });
      report.offers = delOffers.deletedCount || 0;

      await Placement.deleteMany({
        $or: [{ student: { $in: studentIds } }, { college: { $in: testCollegeIds } }],
      });

      // Delete drives in these colleges
      const delDrives = await Drive.deleteMany({ college: { $in: testCollegeIds } });
      report.drives = delDrives.deletedCount || 0;

      await DriveRequest.deleteMany({ college: { $in: testCollegeIds } });

      // Delete students and their users
      await Student.deleteMany({ _id: { $in: studentIds } });
      const delStudentUsers = await User.deleteMany({ _id: { $in: studentUserIds } });
      report.users += delStudentUsers.deletedCount || 0;

      // Delete TPO users for these colleges
      const delTpos = await User.deleteMany({ college: { $in: testCollegeIds } });
      report.users += delTpos.deletedCount || 0;

      // Delete test colleges
      await College.deleteMany({ _id: { $in: testCollegeIds } });
    }

    // 2. Delete test users with test email domains
    const delTestUsers = await User.deleteMany({
      email: { $regex: /@(analyst-test|superadmin-test|aspirant-test)\.com$/i },
    });
    report.users += delTestUsers.deletedCount || 0;

    // 3. Delete test companies
    const delCompanies = await Company.deleteMany({
      name: { $regex: /Test Analytics/i },
    });
    report.companies = delCompanies.deletedCount || 0;

    console.log('\n======================================================');
    console.log('   ONE-TIME DEV DATABASE CLEANUP SUMMARY              ');
    console.log('======================================================');
    console.log(`Colleges removed:      ${report.colleges} (${report.deletedCollegesList.join(', ') || 'None'})`);
    console.log(`Students removed:      ${report.students}`);
    console.log(`Users removed:         ${report.users}`);
    console.log(`Drives removed:        ${report.drives}`);
    console.log(`Applications removed:  ${report.applications}`);
    console.log(`Offers removed:        ${report.offers}`);
    console.log(`Companies removed:     ${report.companies}`);
    console.log('======================================================\n');
  } finally {
    await mongoose.disconnect();
  }

  return report;
}

if (require.main === module) {
  cleanupLeftovers().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = cleanupLeftovers;

