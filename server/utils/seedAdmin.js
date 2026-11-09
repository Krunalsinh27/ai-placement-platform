const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { User, College } = require('../models');

// Load environment variables
dotenv.config();

const seedAdmin = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('REFUSING TO SEED ADMIN IN PRODUCTION: Default accounts with hardcoded passwords are not permitted in production. Use seed:superadmin instead.');
    process.exit(1);
  }
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/placement_management';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for admin seeding...');

    // Ensure a default college exists
    let defaultCollege = await College.findOne({ code: 'NITD' });
    if (!defaultCollege) {
      defaultCollege = await College.create({
        name: 'National Institute of Technology Delhi',
        code: 'NITD',
        city: 'New Delhi',
        state: 'Delhi',
        website: 'https://nitdelhi.ac.in',
        accreditation: 'NAAC A+ Accredited / NBA Tier-1',
        contactEmail: 'tpo@nitdelhi.ac.in',
        contactPhone: '+91-11-33861000',
      });
      console.log('Created default college: NITD');
    }

    const adminEmail = 'admin@college.com';
    const adminPassword = 'Admin@123';

    let existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      // Migrate role to 'tpo' and attach college if not set
      existingAdmin.role = 'tpo';
      if (!existingAdmin.college) {
        existingAdmin.college = defaultCollege._id;
      }
      existingAdmin.isApproved = true;
      existingAdmin.isEmailVerified = true;
      await existingAdmin.save();
      console.log(`Updated admin user (${adminEmail}) to role 'tpo' with college ${defaultCollege.name}.`);
    } else {
      await User.create({
        name: 'TPO Administrator',
        email: adminEmail,
        password: adminPassword,
        role: 'tpo',
        college: defaultCollege._id,
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default TPO created successfully!`);
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
    }

    // Ensure Superadmin exists
    const superadminEmail = 'superadmin@portal.com';
    let superadmin = await User.findOne({ email: superadminEmail });
    if (!superadmin) {
      await User.create({
        name: 'System Superadmin',
        email: superadminEmail,
        password: 'Super@12345',
        role: 'superadmin',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default Superadmin created: ${superadminEmail}`);
    } else {
      superadmin.role = 'superadmin';
      superadmin.isApproved = true;
      superadmin.isEmailVerified = true;
      await superadmin.save();
    }

    // Ensure Analyst exists
    const analystEmail = 'analyst@portal.com';
    let analyst = await User.findOne({ email: analystEmail });
    if (!analyst) {
      await User.create({
        name: 'Lead Placement Analyst',
        email: analystEmail,
        password: 'Analyst@123',
        role: 'analyst',
        organisation: 'Higher Education Analytics Board',
        organisationType: 'Accreditation body',
        purpose: 'Institutional accreditation benchmarking & national recruitment trends analysis',
        designation: 'Senior Placement Analyst',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default Analyst created: ${analystEmail}`);
    } else {
      analyst.role = 'analyst';
      analyst.organisationType = analyst.organisationType || 'Accreditation body';
      analyst.purpose = analyst.purpose || 'Institutional accreditation benchmarking & national recruitment trends analysis';
      analyst.isApproved = true;
      analyst.isEmailVerified = true;
      await analyst.save();
    }

    // Ensure Aspirant exists
    const { Aspirant } = require('../models');
    const aspirantEmail = 'aspirant@portal.com';
    let aspirantUser = await User.findOne({ email: aspirantEmail });
    if (!aspirantUser) {
      aspirantUser = await User.create({
        name: 'Aarav Sharma (Prospective Student)',
        email: aspirantEmail,
        password: 'Aspirant@123',
        role: 'aspirant',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default Aspirant created: ${aspirantEmail}`);
    } else {
      aspirantUser.role = 'aspirant';
      aspirantUser.isApproved = true;
      aspirantUser.isEmailVerified = true;
      await aspirantUser.save();
    }

    let aspirantProfile = await Aspirant.findOne({ user: aspirantUser._id });
    if (!aspirantProfile) {
      await Aspirant.create({
        user: aspirantUser._id,
        state: 'Delhi',
        interestedBranches: ['CSE', 'IT'],
        twelfthStream: 'Science (PCM)',
        shortlistedColleges: [defaultCollege._id],
        savedComparisons: [],
      });
      console.log(`Default Aspirant profile created: ${aspirantEmail}`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error.message);
    process.exit(1);
  }
};

seedAdmin();
