/**
 * Stocks and ETF service.
 * Uses yahoo-finance2 to fetch prices by symbol or ISIN.
 * yahoo-finance2 is ESM-only, so we use a dynamic import wrapper.
 */

let _yahooFinance = null;

/**
 * Lazily load yahoo-finance2 (ESM module) into a CJS context.
 *
 * @returns {Promise<Object>} yahoo-finance2 default export
 */
async function getYahooFinance() {
  if (_yahooFinance) return _yahooFinance;
  const mod = await import('yahoo-finance2');
  _yahooFinance = mod.default;
  return _yahooFinance;
}

/**
 * Fetch current stock/ETF price by ticker symbol.
 *
 * @param {string} symbol - Ticker symbol (e.g., 'TTE.PA', 'AAPL')
 * @returns {Promise<Object>} Stock price data
 */
async function getStockBySymbol(symbol) {
  const yahooFinance = await getYahooFinance();
  const quote = await yahooFinance.quote(symbol);

  return {
    symbol: quote.symbol,
    name: quote.longName || quote.shortName || symbol,
    price: quote.regularMarketPrice,
    currency: quote.currency,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    open: quote.regularMarketOpen,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    volume: quote.regularMarketVolume,
    marketCap: quote.marketCap,
    exchange: quote.fullExchangeName,
    previousClose: quote.regularMarketPreviousClose,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    pe: quote.trailingPE,
    dividendYield: quote.dividendYield,
  };
}

/**
 * Search for stocks/ETFs matching a query string.
 * Returns a list of matching symbols and names.
 *
 * @param {string} query - Search query (company name, ISIN, or symbol)
 * @returns {Promise<Array>} Matching securities
 */
async function searchStocks(query) {
  const yahooFinance = await getYahooFinance();
  const results = await yahooFinance.search(query, {
    quotesCount: 15,
    newsCount: 0,
  });

  return (results.quotes || [])
    .filter((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND')
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchange,
      type: q.quoteType,
      isin: q.isin || null,
    }));
}

/**
 * Get stock price by ISIN.
 * Yahoo Finance doesn't natively support ISIN lookup, so we search first.
 *
 * @param {string} isin - ISIN code (e.g., 'FR0000120271')
 * @returns {Promise<Object>} Stock price data
 */
async function getStockByISIN(isin) {
  const searchResults = await searchStocks(isin);

  if (!searchResults || searchResults.length === 0) {
    throw new Error(`No stock found for ISIN: ${isin}`);
  }

  const { symbol } = searchResults[0];
  const data = await getStockBySymbol(symbol);
  return { ...data, isin };
}

/**
 * Get historical price data for a stock.
 *
 * @param {string} symbol - Ticker symbol
 * @param {string} [period='1y'] - Period: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y'
 * @param {string} [interval='1d'] - Data interval: '1m', '5m', '15m', '1h', '1d', '1wk', '1mo'
 * @returns {Promise<Array>} Historical OHLCV data
 */
async function getStockHistory(symbol, period = '1y', interval = '1d') {
  const yahooFinance = await getYahooFinance();
  const queryOptions = { period1: getStartDate(period), interval };
  const result = await yahooFinance.historical(symbol, queryOptions);

  return result.map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    adjClose: bar.adjClose,
  }));
}

/**
 * Convert a period string to a start Date object.
 *
 * @param {string} period - Period string like '1y', '6mo', '3mo'
 * @returns {Date} Start date
 */
function getStartDate(period) {
  const now = new Date();
  const map = {
    '1d': 1,
    '5d': 5,
    '1mo': 30,
    '3mo': 90,
    '6mo': 180,
    '1y': 365,
    '2y': 730,
    '5y': 1825,
    '10y': 3650,
  };
  const days = map[period] || 365;
  now.setDate(now.getDate() - days);
  return now;
}

module.exports = {
  getStockBySymbol,
  getStockByISIN,
  searchStocks,
  getStockHistory,
};
