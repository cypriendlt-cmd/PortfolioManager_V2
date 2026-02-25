/**
 * Market sentiment service.
 * Fetches Fear & Greed index data:
 * - Crypto: alternative.me API (reliable, free)
 * - Stock: CNN Fear & Greed JSON API
 */

const axios = require('axios');
const config = require('../config');

// In-memory cache (30 min TTL)
const cache = { crypto: null, stock: null, cryptoAt: 0, stockAt: 0 };
const CACHE_TTL = 30 * 60 * 1000;

/**
 * Fetch the current Crypto Fear & Greed Index from alternative.me.
 */
async function getCryptoFearGreed(limit = 1) {
  if (limit === 1 && cache.crypto && (Date.now() - cache.cryptoAt) < CACHE_TTL) {
    return cache.crypto;
  }

  const response = await axios.get(`${config.alternativeMe.baseUrl}/fng/`, {
    params: { limit, format: 'json' },
    timeout: 10000,
  });

  const data = response.data;
  if (!data || !data.data || data.data.length === 0) {
    throw new Error('Invalid response from Fear & Greed API');
  }

  const latest = data.data[0];
  const history = data.data.map((item) => ({
    value: parseInt(item.value, 10),
    classification: item.value_classification,
    timestamp: new Date(parseInt(item.timestamp, 10) * 1000).toISOString(),
  }));

  const result = {
    current: {
      value: parseInt(latest.value, 10),
      classification: latest.value_classification,
      timestamp: new Date(parseInt(latest.timestamp, 10) * 1000).toISOString(),
      emoji: getEmoji(parseInt(latest.value, 10)),
    },
    history,
    source: 'alternative.me',
    description: 'Index de peur et de cupidité du marché crypto (0 = Peur Extrême, 100 = Cupidité Extrême)',
  };

  if (limit === 1) {
    cache.crypto = result;
    cache.cryptoAt = Date.now();
  }
  return result;
}

/**
 * Fetch Stock Market Fear & Greed from CNN JSON API.
 */
async function getStockFearGreed() {
  if (cache.stock && (Date.now() - cache.stockAt) < CACHE_TTL) {
    return cache.stock;
  }

  try {
    const response = await axios.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
      },
    });

    const fg = response.data?.fear_and_greed;
    if (fg && typeof fg.score === 'number') {
      const value = Math.round(fg.score);
      const result = {
        current: {
          value,
          classification: getSentimentLabel(value),
          timestamp: fg.timestamp || new Date().toISOString(),
          emoji: getEmoji(value),
          rating: fg.rating,
        },
        source: 'cnn',
      };
      cache.stock = result;
      cache.stockAt = Date.now();
      return result;
    }
  } catch (err) {
    console.warn('[Market] CNN Fear & Greed error:', err.message);
  }

  return {
    current: { value: null, classification: 'Indisponible', timestamp: new Date().toISOString(), emoji: '❓' },
    source: 'unavailable',
  };
}

/**
 * Fetch historical Fear & Greed data for charting.
 */
async function getCryptoFearGreedHistory(days = 30) {
  return getCryptoFearGreed(days);
}

function getEmoji(value) {
  if (value <= 20) return '😱';
  if (value <= 40) return '😨';
  if (value <= 60) return '😐';
  if (value <= 80) return '😊';
  return '🤑';
}

function getColor(value) {
  if (value <= 20) return '#e74c3c';
  if (value <= 40) return '#e67e22';
  if (value <= 60) return '#f1c40f';
  if (value <= 80) return '#2ecc71';
  return '#27ae60';
}

async function getMarketSentiment() {
  const fearGreed = await getCryptoFearGreed(7);
  const currentValue = fearGreed.current.value;

  return {
    fearGreed: fearGreed.current,
    color: getColor(currentValue),
    sentiment: getSentimentLabel(currentValue),
    signals: { crypto: fearGreed.current },
    lastUpdated: new Date().toISOString(),
  };
}

function getSentimentLabel(value) {
  if (value <= 20) return 'Peur Extrême';
  if (value <= 40) return 'Peur';
  if (value <= 60) return 'Neutre';
  if (value <= 80) return 'Cupidité';
  return 'Cupidité Extrême';
}

module.exports = {
  getCryptoFearGreed,
  getCryptoFearGreedHistory,
  getStockFearGreed,
  getMarketSentiment,
  getSentimentLabel,
};
