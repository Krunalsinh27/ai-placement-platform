const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate a signed JWT access token (15 minutes)
 * @param {string} id - User ID
 * @returns {string} - JWT Token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

/**
 * Generate a signed JWT refresh token (7 days)
 * @param {string} id - User ID
 * @returns {string} - JWT Refresh Token
 */
const generateRefreshToken = (id) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign({ id, tokenType: 'refresh' }, secret, {
    expiresIn: '7d',
  });
};

/**
 * Hash a token using SHA-256 for secure DB storage
 * @param {string} token
 * @returns {string}
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

generateToken.generateToken = generateToken;
generateToken.generateRefreshToken = generateRefreshToken;
generateToken.hashToken = hashToken;

module.exports = generateToken;
