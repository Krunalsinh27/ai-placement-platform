const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { User } = require('../models');

dotenv.config();

const seedSuperadmin = async () => {
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Platform Superadmin';

  if (!email || !password) {
    console.error('ERROR: Both SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('ERROR: SUPERADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
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

seedSuperadmin();

