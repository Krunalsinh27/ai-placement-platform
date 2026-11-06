const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { initCronJobs } = require('./utils/cronJobs');
const { migrateAuthUsers } = require('./utils/migrateAuth');
const { verifyTransporter } = require('./utils/emailService');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', { skip: (req, res) => res.statusCode < 400 }));
  // app.use(morgan('dev'));
}

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/colleges', require('./routes/collegeRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/company', require('./routes/companyRoutes'));
app.use('/api/drives', require('./routes/driveRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/placements', require('./routes/placementRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/job-requirements', require('./routes/jobRequirementRoutes'));
app.use('/api/requirements', require('./routes/jobRequirementRoutes'));
app.use('/api/drive-requests', require('./routes/driveRequestRoutes'));
app.use('/api/tpo', require('./routes/tpoRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/rounds', require('./routes/roundRoutes'));
app.use('/api/panels', require('./routes/panelRoutes'));
app.use('/api/slots', require('./routes/slotRoutes'));
app.use('/api/offers', require('./routes/offerRoutes'));
app.use('/api/emails', require('./routes/emailRoutes'));
app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/questions', require('./routes/questionRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/superadmin', require('./routes/superadminRoutes'));
app.use('/api/aspirant', require('./routes/aspirantRoutes'));

// 404 Handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

// Server listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    initCronJobs();
    migrateAuthUsers();
    verifyTransporter()
      .then((res) => {
        if (res.ok) {
          console.log(`Email mode: SMTP (${res.host}) - verified`);
        } else {
          console.log(`Email mode: console (${res.reason})`);
        }
      })
      .catch((err) => {
        console.log(`Email mode: console (verification failed: ${err.message})`);
      });
  }
});

module.exports = app;

