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
const {
  isRedisConfigured,
  getRedisStatus,
  closeRedisConnections,
  validateRedisConfig,
} = require('./config/redis');
const { startQueueWorkers, closeQueueWorkers } = require('./utils/queueWorkers');
const emailQueue = require('./utils/emailQueue');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { initCronJobs } = require('./utils/cronJobs');
const { migrateAuthUsers } = require('./utils/migrateAuth');
const { verifyTransporter } = require('./utils/emailService');
const { publicApiLimiter } = require('./middleware/rateLimitMiddleware');
const { validateCorsConfig, parseAllowedOrigins, isOriginAllowed } = require('./utils/corsConfig');
const { waitForPendingNotifications, getNotificationJobCounts } = require('./utils/notificationService');

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

// Fail fast in production if REDIS_URL is missing
if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
  console.error('FATAL: REDIS_URL environment variable is required in production');
  process.exit(1);
}

// Validate CORS configuration at startup (fails fast if wildcard '*' is used in production)
try {
  validateCorsConfig(process.env.CLIENT_URL, process.env.NODE_ENV);
} catch (corsErr) {
  console.error(corsErr.message);
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

// Reject NoSQL injection attempts via objects in query parameters (e.g. ?branch[$ne]=val)
app.use((req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === 'object' && req.query[key] !== null) {
        return res.status(400).json({
          success: false,
          message: `Invalid query parameter '${key}': objects and query selectors are not permitted`,
        });
      }
    }
  }
  next();
});

// Restricted CORS with credentials (supports comma-separated list of origins for preview URLs)
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);
const isProduction = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins, isProduction)) {
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
app.get('/api/health', async (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const isRedisConnected = getRedisStatus() === 'connected';

  const responseBody = {
    status: 'ok',
    db: isDbConnected ? 'connected' : 'disconnected',
    redis: isRedisConnected,
  };

  const healthDetailKey = process.env.HEALTH_DETAIL_KEY && process.env.HEALTH_DETAIL_KEY.trim();
  const providedKey = req.headers['x-health-key'];

  if (healthDetailKey && providedKey && providedKey === healthDetailKey) {
    let emailCounts = { waiting: 0, active: 0, failed: 0 };
    let notifCounts = { waiting: 0, active: 0, failed: 0 };

    try {
      emailCounts = await emailQueue.getJobCounts();
    } catch (_) {}

    try {
      notifCounts = await getNotificationJobCounts();
    } catch (_) {}

    responseBody.queues = {
      email: emailCounts,
      notification: notifCounts,
    };
  }

  res.status(200).json(responseBody);
});

// Enforce Cache-Control: no-store on all authenticated API responses
app.use('/api', (req, res, next) => {
  const hasAuth = Boolean(
    req.headers.authorization ||
    req.cookies?.token ||
    req.cookies?.refreshToken
  );
  if (hasAuth) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });
  }
  next();
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
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/assistant', require('./routes/assistantRoutes'));
app.use('/api/mock-interviews', require('./routes/mockInterviewRoutes'));
app.use('/api/admin/mock-interviews', require('./routes/mockInterviewRoutes'));
app.use('/api/resume-builder', require('./routes/resumeBuilderRoutes'));

// 404 Handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

const runWorkerInApi = process.env.RUN_WORKER_IN_API !== 'false';

// Server listener
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    await emailQueue.recoverPendingEmails();
    emailQueue.startPeriodicRecovery(5, 2);
    if (runWorkerInApi) {
      await initCronJobs();
      if (isRedisConfigured()) {
        startQueueWorkers();
      }
    }
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

let isShuttingDown = false;
const handleShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (runWorkerInApi) {
      await closeQueueWorkers();
    }
    emailQueue.stopPeriodicRecovery();
    await waitForPendingNotifications(5000);
    await closeRedisConnections();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(0);
  } catch (err) {
    console.error(`Error during graceful shutdown on ${signal}:`, err.message);
    process.exit(1);
  }
};
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = app;

