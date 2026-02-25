/**
 * Market sentiment routes.
 * Provides Fear & Greed index and overall market sentiment data.
 */

const express = require('express');
const marketService = require('../services/market');

const router = express.Router();

/**
 * GET /api/market/fear-greed
 * Get both Crypto and Stock Fear & Greed indexes.
 * Returns: { crypto: { value, label }, stock: { value, label } }
 */
router.get('/fear-greed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 1, 365);

    // Fetch both in parallel
    const [cryptoData, stockData] = await Promise.allSettled([
      marketService.getCryptoFearGreed(limit),
      marketService.getStockFearGreed(),
    ]);

    const crypto = cryptoData.status === 'fulfilled' ? cryptoData.value : null;
    const stock = stockData.status === 'fulfilled' ? stockData.value : null;

    res.json({
      crypto: crypto ? {
        value: crypto.current.value,
        label: crypto.current.classification,
        source: crypto.source,
      } : { value: null, label: 'Indisponible' },
      stock: stock ? {
        value: stock.current.value,
        label: stock.current.classification,
        source: stock.source,
      } : { value: null, label: 'Indisponible' },
      // Keep legacy fields for backward compatibility
      current: crypto?.current || null,
      history: crypto?.history || [],
      source: crypto?.source || 'unavailable',
    });
  } catch (error) {
    console.error('[Market] Fear & Greed error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Fear & Greed index', details: error.message });
  }
});

/**
 * GET /api/market/fear-greed/history?days=30
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
