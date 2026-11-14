const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { User, College } = require('../models');

// Load environment variables
dotenv.config();

const KNOWN_DEFAULT_PASSWORDS = [
  'Super@12345',
  'Admin@123',
  'Recruiter@123',
  'Analyst@123',
  'Aspirant@123',
  'Student@123',
  'Password@123',
  'Superadmin@123',
  'Superadmin@12345',
  'Apex#2026!Shielded',
  'Falcon#2026!Secured',
  'Vanguard#2026!Access',
  'Horizon#2026!Metric',
  'Gateway#2026!Pathway',
  'Quantum#2026!Target',
  'admin123',
  'password',
  '12345678',
  '1234567890',
  '123456789012',
];

function generateSecureRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(16);
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result + 'A1!';
}

const seedAdmin = async () => {
  const isProd = process.env.NODE_ENV === 'production';
  let adminPassword = process.env.ADMIN_PASSWORD || process.env.TPO_PASSWORD;
  let isGenerated = false;

  if (isProd) {
    if (!adminPassword && !process.env.ALLOW_PROD_SEED) {
      console.error('REFUSING TO SEED ADMIN IN PRODUCTION: Default accounts with hardcoded passwords are not permitted in production. Use seed:superadmin or provide ADMIN_PASSWORD instead.');
      process.exit(1);
    }
    if (!adminPassword) {
      adminPassword = generateSecureRandomPassword();
      isGenerated = true;
    }
  } else {
    adminPassword = adminPassword || 'Falcon#2026!Secured';
  }

  if (adminPassword) {
    const isKnown = KNOWN_DEFAULT_PASSWORDS.some(
      (k) => k.toLowerCase() === adminPassword.trim().toLowerCase()
    );
    if (isKnown && (isProd || process.env.ADMIN_PASSWORD || process.env.TPO_PASSWORD)) {
      console.error('ERROR: Refusing to seed admin with a published demo password. Set a unique ADMIN_PASSWORD or leave unset to auto-generate.');
      process.exit(1);
    }
    if (adminPassword.length < 12 && (isProd || process.env.ADMIN_PASSWORD || process.env.TPO_PASSWORD)) {
      console.error('ERROR: ADMIN_PASSWORD must be at least 12 characters long for production security.');
      process.exit(1);
    }
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

    let existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      // Migrate role to 'tpo' and attach college if not set
      existingAdmin.role = 'tpo';
      existingAdmin.password = adminPassword;
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
        password: 'Apex#2026!Shielded',
        role: 'superadmin',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default Superadmin created: ${superadminEmail}`);
    } else {
      superadmin.role = 'superadmin';
      superadmin.password = 'Apex#2026!Shielded';
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
        password: 'Horizon#2026!Metric',
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
      analyst.password = 'Horizon#2026!Metric';
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
        password: 'Gateway#2026!Pathway',
        role: 'aspirant',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Default Aspirant created: ${aspirantEmail}`);
    } else {
      aspirantUser.role = 'aspirant';
      aspirantUser.password = 'Gateway#2026!Pathway';
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

    if (isGenerated) {
      console.log('\n======================================================');
      console.log(' [TPO ADMIN PROVISIONED] ONE-TIME INITIAL PASSWORD:');
      console.log(`   ${adminPassword}`);
      console.log(' Please save this password immediately; it cannot be recovered.');
      console.log('======================================================\n');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error.message);
    process.exit(1);
  }
};

seedAdmin();
