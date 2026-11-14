const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { User } = require('../models');

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

const seedSuperadmin = async () => {
  const isProd = process.env.NODE_ENV === 'production';
  let email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  let password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Platform Superadmin';
  let isGenerated = false;

  if (isProd) {
    if (!email) {
      console.error('ERROR: SUPERADMIN_EMAIL environment variable is required in production.');
      process.exit(1);
    }
    if (!password) {
      password = generateSecureRandomPassword();
      isGenerated = true;
    }
  } else {
    email = email || 'superadmin@portal.com';
    password = password || 'Apex#2026!Shielded';
  }

  if (password) {
    const isKnownDefault = KNOWN_DEFAULT_PASSWORDS.some(
      (known) => known.toLowerCase() === password.trim().toLowerCase()
    );
    if (isKnownDefault && (isProd || process.env.SUPERADMIN_PASSWORD)) {
      console.error('ERROR: SUPERADMIN_PASSWORD cannot be a known default repository password.');
      process.exit(1);
    }
    if (password.length < 12 && (isProd || process.env.SUPERADMIN_PASSWORD)) {
      console.error('ERROR: SUPERADMIN_PASSWORD must be at least 12 characters long for production security.');
      process.exit(1);
    }
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/placement_management';

  try {
    console.log(`Connecting to database to provision superadmin (${email})...`);
    await mongoose.connect(mongoUri);

    let user = await User.findOne({ email });

    if (user) {
      console.log(`User ${email} already exists with role: "${user.role}". Updating to superadmin...`);
      user.role = 'superadmin';
      user.isApproved = true;
      user.isEmailVerified = true;
      user.password = password; // pre-save hook will hash this
      await user.save();
      console.log(`Successfully upgraded user "${email}" to superadmin.`);
    } else {
      user = await User.create({
        name,
        email,
        password,
        role: 'superadmin',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log(`Successfully created initial superadmin: "${email}" (ID: ${user._id}).`);
    }

    if (isGenerated) {
      console.log('\n======================================================');
      console.log(' [SUPERADMIN PROVISIONED] ONE-TIME INITIAL PASSWORD:');
      console.log(`   ${password}`);
      console.log(' Please save this password immediately; it cannot be recovered.');
      console.log('======================================================\n');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed superadmin:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

if (require.main === module) {
  seedSuperadmin();
}

module.exports = {
  seedSuperadmin,
  KNOWN_DEFAULT_PASSWORDS,
};

