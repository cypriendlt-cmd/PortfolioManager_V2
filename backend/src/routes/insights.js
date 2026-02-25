/**
 * AI Insights routes.
 * Generates daily market summaries and portfolio insights.
 */

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const insightsService = require('../services/insights');
const marketService = require('../services/market');
const cryptoService = require('../services/crypto');

const router = express.Router();

// Simple in-memory cache to avoid hammering APIs
let insightsCache = null;
let lastCacheTime = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/insights
 * Get daily market summary and AI insights.
 * Optionally includes portfolio context if user is authenticated.
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const now = Date.now();

    // Return cached insights if fresh enough
    if (insightsCache && lastCacheTime && (now - lastCacheTime) < CACHE_TTL_MS) {
      return res.json({ ...insightsCache, cached: true });
    }

    // Gather market context for the AI prompt
    let marketContext = {};

    try {
      const fearGreed = await marketService.getCryptoFearGreed(1);
      marketContext.fearGreed = fearGreed.current;
    } catch (err) {
      console.warn('[Insights] Could not fetch Fear & Greed:', err.message);
    }

    try {
      const btcData = await cryptoService.getCryptoPrices(['bitcoin', 'ethereum'], 'eur');
      if (btcData.bitcoin) {
        marketContext.btcPrice = btcData.bitcoin.eur;
      }
      if (btcData.ethereum) {
        marketContext.ethPrice = btcData.ethereum.eur;
      }
    } catch (err) {
      console.warn('[Insights] Could not fetch crypto prices:', err.message);
    }

    // Generate insights
    const insights = await insightsService.getDailyInsights(marketContext);

    // Update cache
    insightsCache = { ...insights, marketContext };
    lastCacheTime = now;

    res.json({ ...insightsCache, cached: false });
  } catch (error) {
    console.error('[Insights] Error:', error.message);
    res.status(500).json({ error: 'Failed to generate insights', details: error.message });
  }
});

/**
 * POST /api/insights/refresh
 * Force a cache refresh and generate new insights.
 * Useful for manual refresh button in the UI.
 */
router.post('/refresh', async (req, res) => {
  try {
    // Clear cache
    insightsCache = null;
    lastCacheTime = null;

    // Gather fresh market context
    let marketContext = {};

    try {
      const fearGreed = await marketService.getCryptoFearGreed(1);
      marketContext.fearGreed = fearGreed.current;
    } catch {}

    try {
      const prices = await cryptoService.getCryptoPrices(['bitcoin', 'ethereum'], 'eur');
      if (prices.bitcoin) marketContext.btcPrice = prices.bitcoin.eur;
      if (prices.ethereum) marketContext.ethPrice = prices.ethereum.eur;
    } catch {}

    const insights = await insightsService.getDailyInsights(marketContext);
    insightsCache = { ...insights, marketContext };
    lastCacheTime = Date.now();

    res.json({ ...insightsCache, cached: false, refreshed: true });
  } catch (error) {
    console.error('[Insights] Refresh error:', error.message);
    res.status(500).json({ error: 'Failed to refresh insights', details: error.message });
  }
});

/**
 * GET /api/insights/providers
 * Returns available AI providers and which one is active.
 */
router.get('/providers', (req, res) => {
  const aiOrchestrator = require('../services/ai');
  res.json({
    providers: aiOrchestrator.getProvidersStatus(),
    active: aiOrchestrator.getActiveProvider(),
  });
});

/**
 * POST /api/insights/analyze
 * Analyze a user's portfolio using AI.
 * Accepts { portfolio } in the request body.
 */
router.post('/analyze', async (req, res) => {
  try {
    const { portfolio } = req.body;
    if (!portfolio) {
      return res.status(400).json({ error: 'Portfolio data is required' });
    }

    const analysis = await insightsService.analyzePortfolio(portfolio);
    res.json(analysis);
  } catch (error) {
    console.error('[Insights] Analyze error:', error.message);
    res.status(500).json({ error: 'Failed to analyze portfolio', details: error.message });
  }
});

module.exports = router;
