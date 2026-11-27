const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Ensure environment variables are loaded if not already initialized
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

/**
 * Connect to MongoDB Database
 */
const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    const errorMsg = 'FATAL: MONGO_URI is not defined. Refusing to connect to unconfigured database.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    const sanitizedHost = (conn.connection.host || '').replace(/:\/\/.*@/, '://***:***@');
    console.log(`MongoDB Connected: ${sanitizedHost} [database: ${conn.connection.name}]`);

    // Safe migration: ensure existing TPO/admin users without isApproved field are marked approved
    try {
      const User = require('../models/User');
      await User.updateMany(
        { role: { $in: ['tpo', 'admin'] }, isApproved: { $exists: false } },
        { $set: { isApproved: true } }
      );

      // Safe migration: migrate existing pipeline data for Task 23
      const migrateExistingPipelineData = require('../utils/migratePipeline');
      await migrateExistingPipelineData();
    } catch (migErr) {
      // Safe to ignore if DB is initializing
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;

