/**
 * Authentication middleware for protecting routes.
 * Validates JWT tokens from Authorization header or session.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Middleware to require authentication on protected routes.
 * Accepts JWT via Bearer token or session cookie.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  // Check Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Fall back to session-based auth
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * Middleware that attaches user if authenticated, but doesn't block.
 * Useful for routes that work for both authenticated and anonymous users.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = decoded;
    } catch {
      // Ignore invalid token for optional auth
    }
  } else if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
