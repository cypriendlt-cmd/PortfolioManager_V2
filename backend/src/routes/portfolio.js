/**
 * Portfolio routes.
 * Load and save user portfolio data from/to Google Drive.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const googleDrive = require('../services/googleDrive');

const router = express.Router();

/**
 * GET /api/portfolio
 * Load the authenticated user's portfolio from Google Drive.
 * Returns a default empty portfolio for first-time users.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { email, accessToken, refreshToken } = req.user;

    const portfolio = await googleDrive.loadPortfolio(accessToken, refreshToken);

    if (!portfolio) {
      // First-time user - return default empty portfolio
      const defaultPortfolio = googleDrive.createDefaultPortfolio(email);
      return res.json(defaultPortfolio);
    }

    res.json(portfolio);
  } catch (error) {
    console.error('[Portfolio] Load error:', error.message);
    res.status(500).json({
      error: 'Failed to load portfolio',
      details: config.server.isDev ? error.message : undefined,
    });
  }
});

/**
 * PUT /api/portfolio
 * Save the authenticated user's portfolio to Google Drive.
 * Merges lastUpdated timestamp before saving.
 */
router.put('/', requireAuth, async (req, res) => {
  try {
    const { accessToken, refreshToken } = req.user;
    const portfolioData = req.body;

    if (!portfolioData || typeof portfolioData !== 'object') {
      return res.status(400).json({ error: 'Invalid portfolio data' });
    }

    // Add/update timestamp
    portfolioData.lastUpdated = new Date().toISOString();

    await googleDrive.savePortfolio(accessToken, refreshToken, portfolioData);

    res.json({
      message: 'Portfolio saved successfully',
      lastUpdated: portfolioData.lastUpdated,
    });
  } catch (error) {
    console.error('[Portfolio] Save error:', error.message);
    res.status(500).json({
      error: 'Failed to save portfolio',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/portfolio/preferences
 * Load only user preferences from the portfolio.
 */
router.get('/preferences', requireAuth, async (req, res) => {
  try {
    const { email, accessToken, refreshToken } = req.user;

    const portfolio = await googleDrive.loadPortfolio(accessToken, refreshToken);

    if (!portfolio) {
      const defaultPortfolio = googleDrive.createDefaultPortfolio(email);
      return res.json(defaultPortfolio.user.preferences);
    }

    res.json(portfolio.user?.preferences || {});
  } catch (error) {
    console.error('[Portfolio] Preferences load error:', error.message);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

/**
 * PUT /api/portfolio/preferences
 * Save user preferences into the portfolio file.
 */
router.put('/preferences', requireAuth, async (req, res) => {
  try {
    const { email, accessToken, refreshToken } = req.user;
    const preferences = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences data' });
    }

    // Load existing portfolio
    let portfolio = await googleDrive.loadPortfolio(accessToken, refreshToken);
    if (!portfolio) {
      portfolio = googleDrive.createDefaultPortfolio(email);
    }

    // Merge preferences
    portfolio.user = portfolio.user || {};
    portfolio.user.preferences = { ...portfolio.user.preferences, ...preferences };
    portfolio.lastUpdated = new Date().toISOString();

    await googleDrive.savePortfolio(accessToken, refreshToken, portfolio);

    res.json({
      message: 'Preferences saved',
      preferences: portfolio.user.preferences,
    });
  } catch (error) {
    console.error('[Portfolio] Preferences save error:', error.message);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

module.exports = router;
