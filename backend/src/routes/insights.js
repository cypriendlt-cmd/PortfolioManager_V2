/**
 * AI Insights routes.
 * Uses file-based cache for persistence across restarts.
 */

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const insightsService = require('../services/insights');
const marketService = require('../services/market');
const cryptoService = require('../services/crypto');
const insightsCache = require('../services/insightsCache');
const stockScreener = require('../services/stockScreener');

const router = express.Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Gather market context for AI prompts.
 */
async function gatherMarketContext() {
  const ctx = {};

  try {
    const fearGreed = await marketService.getCryptoFearGreed(1);
    ctx.fearGreed = fearGreed.current;
  } catch (err) {
    console.warn('[Insights] Could not fetch Crypto Fear & Greed:', err.message);
  }

  try {
    const stockFG = await marketService.getStockFearGreed();
    if (stockFG.current.value !== null) ctx.stockFearGreed = stockFG.current;
  } catch (err) {
    console.warn('[Insights] Could not fetch Stock Fear & Greed:', err.message);
  }

  try {
    const btcData = await cryptoService.getCryptoPrices(['bitcoin', 'ethereum'], 'eur');
    if (btcData.bitcoin) ctx.btcPrice = btcData.bitcoin.eur;
    if (btcData.ethereum) ctx.ethPrice = btcData.ethereum.eur;
  } catch (err) {
    console.warn('[Insights] Could not fetch crypto prices:', err.message);
  }

  return ctx;
}

/**
 * GET /api/insights
 * Returns cached insights if fresh (< 24h), otherwise generates new ones.
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Check file cache
    if (insightsCache.isCacheFresh(CACHE_TTL_MS)) {
      const cached = insightsCache.loadCache();
      return res.json({ ...cached, cached: true });
    }

    // Generate fresh insights
    const marketContext = await gatherMarketContext();
    const insights = await insightsService.getDailyInsights(marketContext);

    const cacheData = {
      insights,
      fearGreed: {
        crypto: marketContext.fearGreed || null,
        stock: marketContext.stockFearGreed || null,
      },
      marketContext,
      updatedAt: new Date().toISOString(),
    };

    insightsCache.saveCache(cacheData);

    res.json({ ...cacheData, cached: false });
  } catch (error) {
    console.error('[Insights] Error:', error.message);
    res.status(500).json({ error: 'Failed to generate insights', details: error.message });
  }
});

/**
 * POST /api/insights/refresh
 * Force a cache refresh.
 */
router.post('/refresh', async (req, res) => {
  try {
    const marketContext = await gatherMarketContext();
    const insights = await insightsService.getDailyInsights(marketContext);

    const cacheData = {
      insights,
      fearGreed: {
        crypto: marketContext.fearGreed || null,
        stock: marketContext.stockFearGreed || null,
      },
      marketContext,
      updatedAt: new Date().toISOString(),
    };

    insightsCache.saveCache(cacheData);

    res.json({ ...cacheData, cached: false, refreshed: true });
  } catch (error) {
    console.error('[Insights] Refresh error:', error.message);
    res.status(500).json({ error: 'Failed to refresh insights', details: error.message });
  }
});

/**
 * GET /api/insights/providers
 */
router.get('/providers', (req, res) => {
  const aiOrchestrator = require('../services/ai');
  res.json({
    providers: aiOrchestrator.getProvidersStatus(),
    active: aiOrchestrator.getActiveProvider(),
  });
});

/**
 * POST /api/insights/dashboard-summary
 * Generate a compact portfolio summary for the dashboard (independent from full analysis).
 */
router.post('/dashboard-summary', async (req, res) => {
  try {
    const { portfolio } = req.body;
    if (!portfolio) {
      return res.status(400).json({ error: 'Portfolio data is required' });
    }

    // Check if we have a cached dashboard summary (< 24h)
    const existing = insightsCache.loadCache() || {};
    if (existing.dashboardSummary && existing.dashboardSummaryAt) {
      const age = Date.now() - new Date(existing.dashboardSummaryAt).getTime();
      if (age < CACHE_TTL_MS) {
        return res.json({ ...existing.dashboardSummary, cached: true });
      }
    }

    const summary = await insightsService.getDashboardSummary(portfolio);

    // Cache it separately from the full analysis
    insightsCache.saveCache({
      ...existing,
      dashboardSummary: summary,
      dashboardSummaryAt: new Date().toISOString(),
    });

    res.json({ ...summary, cached: false });
  } catch (error) {
    console.error('[Insights] Dashboard summary error:', error.message);
    res.status(500).json({ error: 'Failed to generate dashboard summary', details: error.message });
  }
});

/**
 * POST /api/insights/analyze
 * Analyze a user's portfolio using AI.
 */
router.post('/analyze', async (req, res) => {
  try {
    const { portfolio } = req.body;
    if (!portfolio) {
      return res.status(400).json({ error: 'Portfolio data is required' });
    }

    const analysis = await insightsService.analyzePortfolio(portfolio);

    // Also save analysis in cache alongside existing insights
    const existing = insightsCache.loadCache() || {};
    insightsCache.saveCache({ ...existing, analysis, updatedAt: existing.updatedAt || new Date().toISOString() });

    res.json(analysis);
  } catch (error) {
    console.error('[Insights] Analyze error:', error.message);
    res.status(500).json({ error: 'Failed to analyze portfolio', details: error.message });
  }
});

// ─── Stock Screener (Claude AI) ──────────────────────────────────────────────

const screenerRateLimit = new Map();
const SCREENER_COOLDOWN_MS = 30_000;

router.post('/stocks', async (req, res) => {
  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
  const lastCall = screenerRateLimit.get(clientIP);
  if (lastCall && Date.now() - lastCall < SCREENER_COOLDOWN_MS) {
    const waitSec = Math.ceil((SCREENER_COOLDOWN_MS - (Date.now() - lastCall)) / 1000);
    return res.status(429).json({
      error: `Veuillez patienter ${waitSec}s avant de relancer une analyse.`,
    });
  }

  const { anthropicApiKey, ...profile } = req.body;

  const errors = stockScreener.validateProfile(profile);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Profil invalide', details: errors });
  }

  screenerRateLimit.set(clientIP, Date.now());

  try {
    const result = await stockScreener.analyzeStocks(profile, anthropicApiKey);
    res.json(result);
  } catch (error) {
    console.error('[StockScreener] Error:', error.message);
    const statusCode = error.message.includes('non configurée') ? 503 : 500;
    res.status(statusCode).json({
      error: error.message || 'Erreur lors de l\'analyse stock screener.',
    });
  }
});

module.exports = router;
