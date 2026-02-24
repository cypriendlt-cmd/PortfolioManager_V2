/**
 * Cryptocurrency service.
 * Fetches prices from CoinGecko free API.
 * Provides Binance account sync using user-provided API keys.
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

/**
 * Build CoinGecko API headers (adds key if available).
 *
 * @returns {Object} Headers object
 */
function getCoinGeckoHeaders() {
  const headers = { 'Accept': 'application/json' };
  if (config.coingecko.apiKey) {
    headers['x-cg-demo-api-key'] = config.coingecko.apiKey;
  }
  return headers;
}

/**
 * Fetch current prices for a list of cryptocurrencies from CoinGecko.
 *
 * @param {string[]} ids - CoinGecko coin IDs (e.g., ['bitcoin', 'ethereum'])
 * @param {string} [currency='eur'] - Target currency for prices
 * @returns {Promise<Object>} Map of coin ID to price data
 */
async function getCryptoPrices(ids, currency = 'eur') {
  if (!ids || ids.length === 0) {
    return {};
  }

  const idsParam = ids.join(',');
  const url = `${config.coingecko.baseUrl}/simple/price`;

  const response = await axios.get(url, {
    headers: getCoinGeckoHeaders(),
    params: {
      ids: idsParam,
      vs_currencies: currency,
      include_24hr_change: true,
      include_market_cap: true,
      include_24hr_vol: true,
    },
    timeout: 10000,
  });

  return response.data;
}

/**
 * Search CoinGecko for cryptocurrencies matching a query.
 *
 * @param {string} query - Search query string
 * @returns {Promise<Array>} List of matching coins
 */
async function searchCryptos(query) {
  const url = `${config.coingecko.baseUrl}/search`;

  const response = await axios.get(url, {
    headers: getCoinGeckoHeaders(),
    params: { query },
    timeout: 10000,
  });

  return (response.data.coins || []).slice(0, 20).map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    thumb: coin.thumb,
    marketCapRank: coin.market_cap_rank,
  }));
}

/**
 * Get a list of top cryptocurrencies by market cap.
 *
 * @param {number} [limit=100] - Number of coins to fetch
 * @param {string} [currency='eur'] - Target currency
 * @returns {Promise<Array>} List of top crypto coins with price data
 */
async function getTopCryptos(limit = 100, currency = 'eur') {
  const url = `${config.coingecko.baseUrl}/coins/markets`;

  const response = await axios.get(url, {
    headers: getCoinGeckoHeaders(),
    params: {
      vs_currency: currency,
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h',
    },
    timeout: 10000,
  });

  return response.data.map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    image: coin.image,
    currentPrice: coin.current_price,
    marketCap: coin.market_cap,
    marketCapRank: coin.market_cap_rank,
    priceChange24h: coin.price_change_24h,
    priceChangePercent24h: coin.price_change_percentage_24h,
    volume24h: coin.total_volume,
  }));
}

/**
 * Create a Binance API signature for authenticated requests.
 *
 * @param {string} queryString - Query string to sign
 * @param {string} secretKey - Binance API secret key
 * @returns {string} HMAC SHA256 signature
 */
function createBinanceSignature(queryString, secretKey) {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
}

/**
 * Sync user's Binance account holdings.
 * Requires user-provided API key and secret.
 *
 * @param {string} apiKey - User's Binance API key
 * @param {string} apiSecret - User's Binance API secret
 * @returns {Promise<Array>} List of non-zero crypto balances
 */
async function syncBinanceAccount(apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createBinanceSignature(queryString, apiSecret);

  const response = await axios.get(`${config.binance.baseUrl}/api/v3/account`, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
    params: {
      timestamp,
      signature,
    },
    timeout: 15000,
  });

  const balances = response.data.balances || [];

  // Filter out zero balances and format
  const nonZeroBalances = balances
    .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b) => ({
      symbol: b.asset,
      free: parseFloat(b.free),
      locked: parseFloat(b.locked),
      total: parseFloat(b.free) + parseFloat(b.locked),
    }));

  return nonZeroBalances;
}

/**
 * Get detailed coin info by CoinGecko ID.
 *
 * @param {string} id - CoinGecko coin ID
 * @returns {Promise<Object>} Coin detail data
 */
async function getCoinDetail(id) {
  const url = `${config.coingecko.baseUrl}/coins/${id}`;

  const response = await axios.get(url, {
    headers: getCoinGeckoHeaders(),
    params: {
      localization: false,
      tickers: false,
      community_data: false,
      developer_data: false,
    },
    timeout: 10000,
  });

  const data = response.data;
  return {
    id: data.id,
    symbol: data.symbol,
    name: data.name,
    description: data.description?.en || '',
    image: data.image?.large || '',
    currentPrice: data.market_data?.current_price || {},
    marketCap: data.market_data?.market_cap || {},
    priceChange24h: data.market_data?.price_change_percentage_24h || 0,
    priceChange7d: data.market_data?.price_change_percentage_7d || 0,
    priceChange30d: data.market_data?.price_change_percentage_30d || 0,
    allTimeHigh: data.market_data?.ath || {},
    allTimeLow: data.market_data?.atl || {},
  };
}

module.exports = {
  getCryptoPrices,
  searchCryptos,
  getTopCryptos,
  syncBinanceAccount,
  getCoinDetail,
};
