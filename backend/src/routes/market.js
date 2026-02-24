/**
 * Market sentiment routes.
 * Provides Fear & Greed index and overall market sentiment data.
 */

const express = require('express');
const marketService = require('../services/market');

const router = express.Router();

/**
 * GET /api/market/fear-greed
 * Get the current Crypto Fear & Greed Index.
 * Optional query param: limit (number of historical data points, default 1)
 */
router.get('/fear-greed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 1, 365);
    const data = await marketService.getCryptoFearGreed(limit);
    res.json(data);
  } catch (error) {
    console.error('[Market] Fear & Greed error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Fear & Greed index', details: error.message });
  }
});

/**
 * GET /api/market/fear-greed/history?days=30
 * Get historical Fear & Greed data for charting.
 */
router.get('/fear-greed/history', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
    const data = await marketService.getCryptoFearGreedHistory(days);
    res.json(data);
  } catch (error) {
    console.error('[Market] Fear & Greed history error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Fear & Greed history', details: error.message });
  }
});

/**
 * GET /api/market/sentiment
 * Get aggregated market sentiment from multiple sources.
 */
router.get('/sentiment', async (req, res) => {
  try {
    const sentiment = await marketService.getMarketSentiment();
    res.json(sentiment);
  } catch (error) {
    console.error('[Market] Sentiment error:', error.message);
    res.status(500).json({ error: 'Failed to fetch market sentiment', details: error.message });
  }
});

module.exports = router;
