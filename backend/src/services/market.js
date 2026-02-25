/**
 * Market sentiment service.
 * Fetches Fear & Greed index data from multiple sources:
 * - Crypto: CoinMarketCap scraping with alternative.me fallback
 * - Stock: CNN Fear & Greed scraping
 */

const axios = require('axios');
const config = require('../config');

// In-memory cache for scraped values (30 min TTL)
const cache = { crypto: null, stock: null, cryptoAt: 0, stockAt: 0 };
const CACHE_TTL = 30 * 60 * 1000;

/**
 * Scrape Crypto Fear & Greed from CoinMarketCap.
 * Returns a number 0-100 or null on failure.
 */
async function scrapeCryptoFearGreed() {
  try {
    const { data: html } = await axios.get('https://coinmarketcap.com/charts/fear-and-greed-index/', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    // CMC embeds the value in various ways; try common patterns
    const patterns = [
      /fear.*?greed.*?index.*?(\d{1,3})/i,
      /"value"\s*:\s*(\d{1,3})/,
      /indexValue["\s:]+(\d{1,3})/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val >= 0 && val <= 100) return val;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scrape Stock Fear & Greed from CNN.
 * Returns a number 0-100 or null on failure.
 */
async function scrapeStockFearGreed() {
  try {
    const { data: html } = await axios.get('https://edition.cnn.com/markets/fear-and-greed', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const patterns = [
      /fear.*?greed.*?score.*?(\d{1,3})/i,
      /"score"\s*:\s*(\d{1,3})/,
      /market-fng-gauge__dial-number[^>]*>(\d{1,3})</i,
      /data-score="(\d{1,3})"/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val >= 0 && val <= 100) return val;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the current Crypto Fear & Greed Index.
 * Tries CoinMarketCap scraping first, falls back to alternative.me.
 */
async function getCryptoFearGreed(limit = 1) {
  // Check cache for single value requests
  if (limit === 1 && cache.crypto && (Date.now() - cache.cryptoAt) < CACHE_TTL) {
    return cache.crypto;
  }

  let value = null;
  let source = 'alternative.me';

  // Try CMC scraping first (only for current value)
  if (limit === 1) {
    value = await scrapeCryptoFearGreed();
    if (value !== null) source = 'coinmarketcap';
  }

  // Fallback to alternative.me (also provides history)
  if (value === null) {
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
      source,
      description: 'Index de peur et de cupidité du marché crypto (0 = Peur Extrême, 100 = Cupidité Extrême)',
    };

    if (limit === 1) {
      cache.crypto = result;
      cache.cryptoAt = Date.now();
    }
    return result;
  }

  // CMC scraping succeeded
  const result = {
    current: {
      value,
      classification: getSentimentLabel(value),
      timestamp: new Date().toISOString(),
      emoji: getEmoji(value),
    },
    history: [{ value, classification: getSentimentLabel(value), timestamp: new Date().toISOString() }],
    source,
    description: 'Index de peur et de cupidité du marché crypto (0 = Peur Extrême, 100 = Cupidité Extrême)',
  };

  cache.crypto = result;
  cache.cryptoAt = Date.now();
  return result;
}

/**
 * Get Stock Market Fear & Greed (CNN).
 * Returns structured data similar to crypto F&G.
 */
async function getStockFearGreed() {
  if (cache.stock && (Date.now() - cache.stockAt) < CACHE_TTL) {
    return cache.stock;
  }

  const value = await scrapeStockFearGreed();

  if (value !== null) {
    const result = {
      current: {
        value,
        classification: getSentimentLabel(value),
        timestamp: new Date().toISOString(),
        emoji: getEmoji(value),
      },
      source: 'cnn',
    };
    cache.stock = result;
    cache.stockAt = Date.now();
    return result;
  }

  // Return null data if scraping fails
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
