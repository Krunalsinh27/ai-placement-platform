const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { initCronJobs } = require('./utils/cronJobs');
const { migrateAuthUsers } = require('./utils/migrateAuth');
const { verifyTransporter } = require('./utils/emailService');
const { publicApiLimiter } = require('./middleware/rateLimitMiddleware');

// Load environment variables
dotenv.config();

// Fail fast in production if MONGO_URI is missing
if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
  console.error('FATAL: MONGO_URI environment variable is required in production');
  process.exit(1);
}

// Fail fast in production if JWT_SECRET is missing or insufficiently long
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long in production');
  process.exit(1);
}

// Connect to MongoDB
connectDB();

const app = express();

// Trust reverse proxy (Render, Heroku, etc.) for accurate client IP and secure cookies
app.set('trust proxy', 1);

// Security Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(mongoSanitize());

// Restricted CORS with credentials (supports comma-separated list of origins for preview URLs)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, '');
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === '*' || allowed === normalizedOrigin) return true;
        if (allowed.includes('*')) {
          const regex = new RegExp('^' + allowed.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(normalizedOrigin);
        }
        return false;
      });
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Static uploads route removed for security: resumes are served via protected streaming route GET /api/students/:studentId/resume

// HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', { skip: (req, res) => res.statusCode < 400 }));
}

// Health check route
app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'ok',
    db: isDbConnected ? 'connected' : 'disconnected',
  });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/colleges/public', publicApiLimiter);
app.use('/api/colleges', require('./routes/collegeRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/drives', require('./routes/driveRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/placements', require('./routes/placementRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api/job-requirements', require('./routes/jobRequirementRoutes'));
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
app.use('/api/aspirant', publicApiLimiter, require('./routes/aspirantRoutes'));

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

