/**
 * Middleware to handle 404 Not Found routes
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Error Handling Middleware
 * Respects explicit error status codes (400, 401, 403, 404, 409, 422, 429, etc.)
 * Validates status code ranges (400-599) and defaults unexpected errors to HTTP 500.
 * Never leaks stack traces in production.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;

  // 1. Check explicit error statusCode or status property
  const explicitStatus = err.statusCode || err.status;
  if (typeof explicitStatus === 'number' && explicitStatus >= 400 && explicitStatus <= 599) {
    statusCode = explicitStatus;
  } else if (typeof res.statusCode === 'number' && res.statusCode >= 400 && res.statusCode <= 599) {
    statusCode = res.statusCode;
  }

  // 2. Handle known Mongoose errors gracefully if not explicitly assigned
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.code === 11000) {
    statusCode = 409;
  }

  const payload = {
    success: false,
    message: err.message || 'Server Error',
    ...(err.isDeleted ? { isDeleted: true } : {}),
    ...(err.resume ? { resume: err.resume } : {}),
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  };

  res.status(statusCode).json(payload);
};

module.exports = {
  notFound,
  errorHandler,
};

