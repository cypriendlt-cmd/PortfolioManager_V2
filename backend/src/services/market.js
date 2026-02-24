/**
 * Market sentiment service.
 * Fetches Fear & Greed index data from alternative.me API.
 * Also provides general market sentiment indicators.
 */

const axios = require('axios');
const config = require('../config');

/**
 * Fetch the current Crypto Fear & Greed Index from alternative.me.
 * Scale: 0-100 where 0 = Extreme Fear, 100 = Extreme Greed.
 *
 * @param {number} [limit=1] - Number of historical data points to fetch
 * @returns {Promise<Object>} Fear & Greed index data
 */
async function getCryptoFearGreed(limit = 1) {
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

  return {
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
}

/**
 * Fetch historical Fear & Greed data for charting.
 *
 * @param {number} [days=30] - Number of days of history to fetch
 * @returns {Promise<Object>} Historical F&G data
 */
async function getCryptoFearGreedHistory(days = 30) {
  return getCryptoFearGreed(days);
}

/**
 * Get a descriptive emoji for a Fear & Greed value.
 *
 * @param {number} value - Fear & Greed index value (0-100)
 * @returns {string} Emoji representation
 */
function getEmoji(value) {
  if (value <= 20) return '😱'; // Extreme Fear
  if (value <= 40) return '😨'; // Fear
  if (value <= 60) return '😐'; // Neutral
  if (value <= 80) return '😊'; // Greed
  return '🤑'; // Extreme Greed
}

/**
 * Get color code for a Fear & Greed value (for UI display).
 *
 * @param {number} value - Fear & Greed index value (0-100)
 * @returns {string} CSS color
 */
function getColor(value) {
  if (value <= 20) return '#e74c3c'; // Red - Extreme Fear
  if (value <= 40) return '#e67e22'; // Orange - Fear
  if (value <= 60) return '#f1c40f'; // Yellow - Neutral
  if (value <= 80) return '#2ecc71'; // Green - Greed
  return '#27ae60'; // Dark Green - Extreme Greed
}

/**
 * Get overall market summary combining multiple sentiment signals.
 *
 * @returns {Promise<Object>} Aggregated market sentiment data
 */
async function getMarketSentiment() {
  const fearGreed = await getCryptoFearGreed(7);

  const currentValue = fearGreed.current.value;

  return {
    fearGreed: fearGreed.current,
    color: getColor(currentValue),
    sentiment: getSentimentLabel(currentValue),
    signals: {
      crypto: fearGreed.current,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get a French sentiment label for a given F&G value.
 *
 * @param {number} value
 * @returns {string}
 */
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
  getMarketSentiment,
};
