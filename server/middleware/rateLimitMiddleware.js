const rateLimit = require('express-rate-limit');

const isTestEnv = () => process.env.NODE_ENV === 'test';

// Login rate limiter: 15 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP verify limiter: 25 attempts per 15 minutes per IP
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many verification attempts from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP resend & Forgot password limiter: 10 requests per 15 minutes per IP
const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  otpVerifyLimiter,
  otpResendLimiter,
};

