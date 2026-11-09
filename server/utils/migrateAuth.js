const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { User, College, Company } = require('../models');

/**
 * Migration helper to ensure all existing seeded and registered users have
 * isEmailVerified = true and isApproved = true (unless explicitly unapproved TPO),
 * ensure existing colleges have status = 'approved',
 * ensure existing companies are verified,
 * and seed superadmin & approved analyst accounts.
 */
const migrateAuthUsers = async () => {
  try {
    // 1. Migrate existing colleges to 'approved'
    const collegeUpdateResult = await College.updateMany(
      { $or: [{ status: { $exists: false } }, { status: null }] },
      { $set: { status: 'approved' } }
    );
    if (collegeUpdateResult.modifiedCount > 0) {
      console.log(`[Migration] Migrated ${collegeUpdateResult.modifiedCount} college(s) to status='approved'`);
    }

    // 1b. Migrate existing companies to verified: true if missing
    if (Company) {
      const companyUpdateResult = await Company.updateMany(
        { verified: { $exists: false } },
        { $set: { verified: true } }
      );
      if (companyUpdateResult.modifiedCount > 0) {
        console.log(`[Migration] Migrated ${companyUpdateResult.modifiedCount} company(ies) to verified=true`);
      }
      // Ensure Google is verified
      await Company.updateMany({ name: /^Google$/i }, { $set: { verified: true } });
    }

    const unverifiedCount = await User.countDocuments({ isEmailVerified: { $ne: true } });
    if (unverifiedCount > 0) {
      // Mark existing accounts as verified
      const result = await User.updateMany(
        { isEmailVerified: { $ne: true } },
        { $set: { isEmailVerified: true } }
      );
      console.log(`[Migration] Marked ${result.modifiedCount} existing user(s) as isEmailVerified=true`);
    }

    // Also ensure existing core accounts (admin@college.com, recruiters, etc.) have isApproved=true
    await User.updateMany(
      { email: { $in: ['admin@college.com', 'tpo.pict@college.com', 'recruiter@google.com'] } },
      { $set: { isApproved: true, isEmailVerified: true } }
    );

    // SECURITY GUARD:
    // In production (NODE_ENV=production), startup migration must NEVER create default users or profiles.
    // Superadmin accounts in production must be provisioned exclusively via seed:superadmin with env credentials.
    if (process.env.NODE_ENV === 'production') {
      console.log('[Migration] Production environment detected: skipping default user and profile creation.');
      return;
    }

    // 2. Development/test only: Ensure Superadmin account exists
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
      console.log(`[Migration] Created default superadmin: ${superadminEmail}`);
    } else {
      let needSave = false;
      if (superadmin.role !== 'superadmin') { superadmin.role = 'superadmin'; needSave = true; }
      if (!superadmin.isApproved) { superadmin.isApproved = true; needSave = true; }
      if (!superadmin.isEmailVerified) { superadmin.isEmailVerified = true; needSave = true; }
      if (needSave) await superadmin.save();
    }

    // 3. Development/test only: Ensure Approved Analyst account exists
    const analystEmail = 'analyst@portal.com';
    let analyst = await User.findOne({ email: analystEmail });
    if (!analyst) {
      await User.create({
        name: 'Chief Higher Education Analyst',
        email: analystEmail,
        password: 'Analyst@123',
        role: 'analyst',
        organisation: 'National Higher Education Research Consortium',
        organisationType: 'Accreditation body',
        purpose: 'Institutional accreditation benchmarking & national recruitment trends analysis',
        designation: 'Senior Placement Analyst',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`[Migration] Created default approved analyst: ${analystEmail}`);
    } else {
      let needSave = false;
      if (analyst.role !== 'analyst') { analyst.role = 'analyst'; needSave = true; }
      if (!analyst.organisationType) { analyst.organisationType = 'Accreditation body'; needSave = true; }
      if (!analyst.purpose) { analyst.purpose = 'Institutional accreditation benchmarking & national recruitment trends analysis'; needSave = true; }
      if (!analyst.isApproved) { analyst.isApproved = true; needSave = true; }
      if (!analyst.isEmailVerified) { analyst.isEmailVerified = true; needSave = true; }
      if (needSave) await analyst.save();
    }

    // 4. Development/test only: Ensure Aspirant account exists
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
      console.log(`[Migration] Created default aspirant: ${aspirantEmail}`);
    } else {
      let needSave = false;
      if (aspirantUser.role !== 'aspirant') { aspirantUser.role = 'aspirant'; needSave = true; }
      if (!aspirantUser.isApproved) { aspirantUser.isApproved = true; needSave = true; }
      if (!aspirantUser.isEmailVerified) { aspirantUser.isEmailVerified = true; needSave = true; }
      if (needSave) await aspirantUser.save();
    }

    let aspirantProfile = await Aspirant.findOne({ user: aspirantUser._id });
    if (!aspirantProfile) {
      await Aspirant.create({
        user: aspirantUser._id,
        state: 'Delhi',
        interestedBranches: ['CSE', 'IT'],
        twelfthStream: 'Science (PCM)',
        shortlistedColleges: [],
        savedComparisons: [],
      });
      console.log(`[Migration] Created default aspirant profile for: ${aspirantEmail}`);
    }
  } catch (error) {
    console.error('[Migration] Auth migration error:', error);
  }
};

if (require.main === module) {
  (async () => {
    try {
      const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_management';
      await mongoose.connect(uri);
      console.log('Connected to MongoDB for auth migration...');
      await migrateAuthUsers();
      await mongoose.disconnect();
      console.log('Auth migration complete.');
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

module.exports = { migrateAuthUsers };

