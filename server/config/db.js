const mongoose = require('mongoose');

/**
 * Connect to MongoDB Database
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

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
    // Do not terminate process in development if Mongo is down, but log warning
    // In production you may exit: process.exit(1);
  }
};

module.exports = connectDB;

