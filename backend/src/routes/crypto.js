/**
 * Cryptocurrency routes.
 * Provides price data, search, and Binance account sync.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cryptoService = require('../services/crypto');

const router = express.Router();

/**
 * GET /api/crypto/prices?ids=bitcoin,ethereum&currency=eur
 * Fetch current prices for a list of CoinGecko coin IDs.
 */
router.get('/prices', async (req, res) => {
  try {
    const { ids, currency = 'eur' } = req.query;

    if (!ids) {
      return res.status(400).json({ error: 'ids parameter is required (comma-separated CoinGecko IDs)' });
    }

    const idList = ids.split(',').map((id) => id.trim()).filter(Boolean);

    if (idList.length === 0) {
      return res.status(400).json({ error: 'At least one coin ID is required' });
    }

    if (idList.length > 250) {
      return res.status(400).json({ error: 'Maximum 250 coin IDs per request' });
    }

    const prices = await cryptoService.getCryptoPrices(idList, currency);
    res.json(prices);
  } catch (error) {
    console.error('[Crypto] Prices error:', error.message);
    res.status(500).json({ error: 'Failed to fetch crypto prices', details: error.message });
  }
});

/**
 * GET /api/crypto/search?query=bitcoin
 * Search for cryptocurrencies on CoinGecko.
 */
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 1) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await cryptoService.searchCryptos(query.trim());
    res.json(results);
  } catch (error) {
    console.error('[Crypto] Search error:', error.message);
    res.status(500).json({ error: 'Failed to search cryptos', details: error.message });
  }
});

/**
 * GET /api/crypto/top?limit=100&currency=eur
 * Get top cryptocurrencies by market cap.
 */
router.get('/top', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 250);
    const currency = req.query.currency || 'eur';

    const coins = await cryptoService.getTopCryptos(limit, currency);
    res.json(coins);
  } catch (error) {
    console.error('[Crypto] Top cryptos error:', error.message);
    res.status(500).json({ error: 'Failed to fetch top cryptos', details: error.message });
  }
});

/**
 * GET /api/crypto/:id
 * Get detailed information for a specific coin.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await cryptoService.getCoinDetail(id);
    res.json(detail);
  } catch (error) {
    console.error('[Crypto] Coin detail error:', error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: `Coin not found: ${req.params.id}` });
    }
    res.status(500).json({ error: 'Failed to fetch coin details', details: error.message });
  }
});

/**
 * GET /api/crypto/binance/sync
 * Sync the user's Binance account holdings.
 * Requires either:
 *   - Query params: apiKey and apiSecret
 *   - Or user-stored keys (future: from encrypted portfolio)
 */
router.get('/binance/sync', requireAuth, async (req, res) => {
  try {
    const { apiKey, apiSecret } = req.query;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'Binance API key and secret are required',
        hint: 'Pass apiKey and apiSecret as query parameters',
      });
    }

    const balances = await cryptoService.syncBinanceAccount(apiKey, apiSecret);

    res.json({
      balances,
      syncedAt: new Date().toISOString(),
      count: balances.length,
    });
  } catch (error) {
    console.error('[Crypto] Binance sync error:', error.message);

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid Binance API credentials' });
    }

    res.status(500).json({ error: 'Failed to sync Binance account', details: error.message });
  }
});

module.exports = router;
