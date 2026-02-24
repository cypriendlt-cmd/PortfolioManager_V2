/**
 * Authentication routes.
 * Handles Google OAuth 2.0 flow and JWT token issuance.
 */

const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configure Passport Google OAuth Strategy only if credentials are available.
// Without credentials, OAuth routes will return 503 instead of crashing on startup.
if (config.google.clientId && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        passReqToCallback: true,
      },
      (req, accessToken, refreshToken, profile, done) => {
        // Build user object from Google profile
        const user = {
          id: profile.id,
          email: profile.emails?.[0]?.value || '',
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value || '',
          accessToken,
          refreshToken: refreshToken || null,
        };
        return done(null, user);
      }
    )
  );
} else {
  console.warn('[Auth] Google OAuth not configured - set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
}

/**
 * Middleware that returns 503 when Google OAuth is not configured.
 */
function requireGoogleOAuth(req, res, next) {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.status(503).json({
      error: 'Google OAuth not configured',
      hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file',
    });
  }
  next();
}

// Passport session serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

/**
 * GET /auth/google
 * Initiate Google OAuth flow.
 */
router.get(
  '/google',
  requireGoogleOAuth,
  passport.authenticate('google', {
    scope: config.google.scopes,
    accessType: 'offline',
    prompt: 'consent',
  })
);

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback, issue JWT, redirect to frontend.
 */
router.get(
  '/google/callback',
  requireGoogleOAuth,
  passport.authenticate('google', { failureRedirect: `${config.frontend.url}/login?error=auth_failed` }),
  (req, res) => {
    const user = req.user;

    // Generate JWT token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
    };

    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // Store user in session as well
    req.session.user = tokenPayload;

    // Redirect to frontend with token
    res.redirect(`${config.frontend.url}/auth/callback?token=${token}`);
  }
);

/**
 * GET /auth/me
 * Return current authenticated user info.
 */
router.get('/me', requireAuth, (req, res) => {
  const { id, email, name, avatar } = req.user;
  res.json({
    id,
    email,
    name,
    avatar,
  });
});

/**
 * POST /auth/logout
 * Clear session and return success.
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

/**
 * GET /auth/logout
 * Support GET-based logout (some clients prefer this).
 */
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(`${config.frontend.url}/login`);
  });
});

module.exports = router;
