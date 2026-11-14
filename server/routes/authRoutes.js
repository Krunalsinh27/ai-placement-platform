const express = require('express');
const router = express.Router();
const {
  register,
  registerTPO,
  registerCollege,
  registerRecruiter,
  registerAnalyst,
  registerAspirant,
  verifyEmail,
  resendOTP,
  forgotPassword,
  resetPassword,
  login,
  refreshToken,
  logout,
  getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const csrfProtection = require('../middleware/csrfProtection');
const {
  loginLimiter,
  accountLoginLimiter,
  otpVerifyLimiter,
  accountOtpLimiter,
  otpResendLimiter,
} = require('../middleware/rateLimitMiddleware');

// Public registration routes (return message & email, no JWT token)
router.post('/register', register);
router.post('/register/tpo', registerTPO);
router.post('/register-college', registerCollege);
router.post('/register/college', registerCollege);
router.post('/register-recruiter', registerRecruiter);
router.post('/register/recruiter', registerRecruiter);
router.post('/register-analyst', registerAnalyst);
router.post('/register/analyst', registerAnalyst);
router.post('/register-aspirant', registerAspirant);
router.post('/register/aspirant', registerAspirant);

// Email verification & OTP routes (rate-limited by IP and target account)
router.post('/verify-email', otpVerifyLimiter, accountOtpLimiter, verifyEmail);
router.post('/resend-otp', otpResendLimiter, accountOtpLimiter, resendOTP);

// Password recovery routes (rate-limited by IP and target account)
router.post('/forgot-password', otpResendLimiter, accountOtpLimiter, forgotPassword);
router.post('/reset-password', otpVerifyLimiter, accountOtpLimiter, resetPassword);

// Authentication route (rate-limited by IP and target account & lockout enabled)
router.post('/login', loginLimiter, accountLoginLimiter, login);

// Token refresh & session termination (CSRF protected)
router.post('/refresh', csrfProtection, refreshToken);
router.post('/logout', csrfProtection, logout);

// Protected routes
router.get('/me', protect, getMe);

module.exports = router;
