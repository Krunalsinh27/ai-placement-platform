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
const {
  loginLimiter,
  otpVerifyLimiter,
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

// Email verification & OTP routes (rate-limited)
router.post('/verify-email', otpVerifyLimiter, verifyEmail);
router.post('/resend-otp', otpResendLimiter, resendOTP);

// Password recovery routes (rate-limited)
router.post('/forgot-password', otpResendLimiter, forgotPassword);
router.post('/reset-password', otpVerifyLimiter, resetPassword);

// Authentication route (rate-limited & lockout enabled)
router.post('/login', loginLimiter, login);

// Token refresh & session termination
router.post('/refresh', refreshToken);
router.post('/logout', logout);

// Protected routes
router.get('/me', protect, getMe);

module.exports = router;
