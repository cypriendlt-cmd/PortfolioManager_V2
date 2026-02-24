/**
 * French livret savings accounts routes.
 * Provides current rates and interest calculation utilities.
 */

const express = require('express');
const livretService = require('../services/livrets');

const router = express.Router();

/**
 * GET /api/livrets/rates
 * Get all current French livret savings account rates.
 */
router.get('/rates', (req, res) => {
  const rates = livretService.getAllRates();
  res.json({
    rates,
    lastUpdated: '2025-02-01', // Official rate review dates
    source: 'Banque de France - Taux réglementés',
    note: 'Les taux du Livret A et LDDS sont révisés le 1er février et le 1er août.',
  });
});

/**
 * GET /api/livrets/rates/:type
 * Get rate for a specific livret type.
 */
router.get('/rates/:type', (req, res) => {
  const { type } = req.params;
  const rate = livretService.getRateByType(type.toLowerCase());

  if (!rate) {
    return res.status(404).json({
      error: `Livret type not found: ${type}`,
      validTypes: ['livret-a', 'ldds', 'lep', 'cel', 'pel'],
    });
  }

  res.json(rate);
});

/**
 * POST /api/livrets/calculate
 * Calculate interest for a livret account.
 *
 * Request body:
 * {
 *   balance: number,     // Account balance in euros
 *   rate: number,        // Annual rate as decimal (e.g., 0.024) OR omit to use type's rate
 *   type: string,        // Livret type (optional if rate is provided)
 *   period: string       // 'annual' | 'monthly' | 'quinzaine'
 * }
 */
router.post('/calculate', (req, res) => {
  const { balance, rate: customRate, type, period = 'annual' } = req.body;

  if (!balance || isNaN(Number(balance)) || Number(balance) < 0) {
    return res.status(400).json({ error: 'balance must be a positive number' });
  }

  let rate = customRate;

  // If type provided but no custom rate, use the official rate
  if (!rate && type) {
    const livretData = livretService.getRateByType(type.toLowerCase());
    if (!livretData) {
      return res.status(400).json({
        error: `Unknown livret type: ${type}`,
        validTypes: ['livret-a', 'ldds', 'lep', 'cel', 'pel'],
      });
    }
    rate = livretData.rate;
  }

  if (!rate || isNaN(Number(rate)) || Number(rate) < 0) {
    return res.status(400).json({
      error: 'Either provide a rate (decimal, e.g. 0.024) or a valid livret type',
    });
  }

  const validPeriods = ['annual', 'monthly', 'quinzaine'];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      error: `Invalid period. Valid values: ${validPeriods.join(', ')}`,
    });
  }

  const result = livretService.calculateInterest(
    Number(balance),
    Number(rate),
    period
  );

  res.json(result);
});

/**
 * POST /api/livrets/calculate-from-date
 * Calculate interest earned since a specific date.
 *
 * Request body:
 * {
 *   balance: number,
 *   rate: number,       // Optional: override with custom rate
 *   type: string,       // Livret type (to auto-select rate)
 *   startDate: string   // ISO date string
 * }
 */
router.post('/calculate-from-date', (req, res) => {
  const { balance, rate: customRate, type, startDate } = req.body;

  if (!balance || isNaN(Number(balance))) {
    return res.status(400).json({ error: 'balance must be a number' });
  }

  if (!startDate) {
    return res.status(400).json({ error: 'startDate is required (ISO format: YYYY-MM-DD)' });
  }

  const parsedDate = new Date(startDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' });
  }

  let rate = customRate;
  if (!rate && type) {
    const livretData = livretService.getRateByType(type.toLowerCase());
    if (!livretData) {
      return res.status(400).json({ error: `Unknown livret type: ${type}` });
    }
    rate = livretData.rate;
  }

  if (!rate) {
    return res.status(400).json({ error: 'Provide either rate or a valid livret type' });
  }

  const result = livretService.calculateInterestSinceDate(
    Number(balance),
    Number(rate),
    parsedDate
  );

  res.json(result);
});

module.exports = router;
