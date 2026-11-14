const jwt = require('jsonwebtoken');
const { User, Student } = require('../models');

/**
 * Protect routes - Verifies JWT in Authorization header
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract token from "Bearer <token>"
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user from DB, excluding password
      req.user = await User.findById(decoded.id)
        .select('-password')
        .populate('college')
        .populate('company');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists',
        });
      }

      // Check college status for TPOs
      if (
        req.user.role === 'tpo' &&
        req.user.college &&
        req.user.college.status === 'pending'
      ) {
        return res.status(403).json({
          success: false,
          message: 'Waiting for college approval',
        });
      }

      // Check account approval status
      if (req.user.isApproved === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending administrator approval',
        });
      }

      // Aspirant role boundary: Can only access /api/aspirant/*, /api/auth/me, /api/colleges/public/*, and /api/colleges
      if (req.user.role === 'aspirant') {
        const url = req.originalUrl || req.url;
        const isAllowedAspirantPath =
          url.startsWith('/api/aspirant') ||
          url.startsWith('/api/auth/me') ||
          url.startsWith('/api/colleges/public') ||
          url === '/api/colleges' ||
          url.startsWith('/api/colleges?');
        if (!isAllowedAspirantPath) {
          return res.status(403).json({
            success: false,
            message: `User role 'aspirant' is not authorized to access this resource`,
          });
        }
      }

      // Analyst role boundary: Can only access /api/analytics/*, /api/auth/*, /api/colleges/public/*, and /api/colleges
      if (req.user.role === 'analyst') {
        const url = req.originalUrl || req.url;
        const isAllowedAnalystPath =
          url.startsWith('/api/analytics') ||
          url.startsWith('/api/auth') ||
          url.startsWith('/api/colleges/public') ||
          url === '/api/colleges' ||
          url.startsWith('/api/colleges?');
        if (!isAllowedAnalystPath) {
          return res.status(403).json({
            success: false,
            message: `User role 'analyst' is not authorized to access this resource`,
          });
        }
      }

      // If user is a student, attach student profile if found
      if (req.user.role === 'student') {
        const studentProfile = await Student.findOne({ user: req.user._id }).populate('college');
        req.student = studentProfile;
      }

      next();
    } catch (error) {
      console.error('JWT verification error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed or expired',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }
};

/**
 * Grant access to specific roles
 * @param  {...string} roles - e.g. 'admin', 'tpo', 'student', 'recruiter', 'superadmin'
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized',
      });
    }

    const userRole = req.user.role;
    // Build set of authorized roles with alias inheritance:
    // admin, tpo, superadmin share administrative privileges across management routes
    const allowed = new Set(roles);
    if (allowed.has('admin') || allowed.has('tpo')) {
      allowed.add('admin');
      allowed.add('tpo');
      allowed.add('superadmin');
    }

    if (!allowed.has(userRole)) {
      return res.status(403).json({
        success: false,
        message: `User role '${userRole}' is not authorized to access this resource`,
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};
