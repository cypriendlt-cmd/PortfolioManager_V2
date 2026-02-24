/**
 * Stocks and ETF routes.
 * Provides price lookup by symbol or ISIN, and search functionality.
 */

const express = require('express');
const stocksService = require('../services/stocks');

const router = express.Router();

/**
 * GET /api/stocks/search/:query
 * Search for stocks or ETFs by name, symbol, or ISIN.
 */
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;

    if (!query || query.trim().length < 1) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await stocksService.searchStocks(query.trim());
    res.json(results);
  } catch (error) {
    console.error('[Stocks] Search error:', error.message);
    res.status(500).json({ error: 'Failed to search stocks', details: error.message });
  }
});

/**
 * GET /api/stocks/symbol/:symbol
 * Get current price and info for a specific ticker symbol.
 * Example: /api/stocks/symbol/TTE.PA
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await stocksService.getStockBySymbol(symbol.toUpperCase());
    res.json(data);
  } catch (error) {
    console.error('[Stocks] Symbol lookup error:', error.message);
    if (error.message?.includes('No fundamentals data')) {
      return res.status(404).json({ error: `Symbol not found: ${req.params.symbol}` });
    }
    res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
  }
});

/**
 * GET /api/stocks/:isin
 * Get current price and info for a stock by ISIN.
 * Example: /api/stocks/FR0000120271
 *
 * Note: Must be placed AFTER /search and /symbol routes to avoid conflicts.
 */
router.get('/:isin', async (req, res) => {
  try {
    const { isin } = req.params;

    // Basic ISIN validation: 2 letter country code + 10 alphanumeric chars
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{10}$/;
    if (!isinRegex.test(isin.toUpperCase())) {
      return res.status(400).json({
        error: 'Invalid ISIN format',
        hint: 'ISIN should be 12 characters: 2-letter country code + 10 alphanumeric chars (e.g., FR0000120271)',
      });
    }

    const data = await stocksService.getStockByISIN(isin.toUpperCase());
    res.json(data);
  } catch (error) {
    console.error('[Stocks] ISIN lookup error:', error.message);
    if (error.message?.includes('No stock found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
  }
});

/**
 * GET /api/stocks/history/:symbol?period=1y&interval=1d
 * Get historical price data for a stock symbol.
 */
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1y', interval = '1d' } = req.query;

    const validPeriods = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y'];
    const validIntervals = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: `Invalid period. Valid values: ${validPeriods.join(', ')}` });
    }

    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ error: `Invalid interval. Valid values: ${validIntervals.join(', ')}` });
    }

    const data = await stocksService.getStockHistory(symbol.toUpperCase(), period, interval);
    res.json(data);
  } catch (error) {
    console.error('[Stocks] History error:', error.message);
    res.status(500).json({ error: 'Failed to fetch stock history', details: error.message });
  }
});

module.exports = router;
