/**
 * priceService.js
 * Client-side price fetching for stocks (Yahoo Finance) and crypto (CoinGecko).
 * Runs entirely in the browser — no server required.
 *
 * STOCKS flow (Yahoo Finance via CORS proxy):
 *   1. Search ISIN via Yahoo Finance search API → get Yahoo ticker (e.g. "PSP5.PA")
 *   2. Fetch chart data → get OHLC, current price, previous close
 *
 * CRYPTO flow (CoinGecko - CORS-friendly, no proxy needed):
 *   CoinGecko /coins/markets endpoint
 */

const CORS_PROXY = 'https://api.allorigins.win/get?url='
const YAHOO_BASE = 'https://query2.finance.yahoo.com'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_KEY_CRYPTO = 'pm_prices_crypto'
const CACHE_KEY_STOCKS = 'pm_prices_stocks'
const CACHE_KEY_TICKERS = 'pm_yahoo_tickers' // ISIN → Yahoo ticker mapping
const CACHE_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return data
  } catch { return null }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

function readCacheNoExpiry(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw).data
  } catch { return null }
}

/** Fetch JSON via CORS proxy (allorigins wraps content in {contents: "..."}) */
async function proxiedFetch(url, timeoutMs = 15000) {
  const proxied = `${CORS_PROXY}${encodeURIComponent(url)}`
  const res = await fetch(proxied, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  const wrapper = await res.json()
  const text = wrapper.contents || ''
  if (!text) throw new Error('Empty proxy response')
  return JSON.parse(text)
}

// ---------------------------------------------------------------------------
// STOCKS — Yahoo Finance via CORS proxy
// ---------------------------------------------------------------------------

/**
 * Search Yahoo Finance for an ISIN to get the Yahoo ticker symbol.
 * Returns { name, symbol (Yahoo ticker), exchange } or null.
 */
export async function searchISIN(isin) {
  // Check ticker cache first (ISIN→ticker doesn't change)
  const tickerCache = readCacheNoExpiry(CACHE_KEY_TICKERS) || {}
  if (tickerCache[isin]) return tickerCache[isin]

  const searchUrl = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`
  const data = await proxiedFetch(searchUrl)

  if (!data.quotes || data.quotes.length === 0) return null

  // Prefer Paris exchange, then any European exchange
  const quotes = data.quotes.filter(q => q.isYahooFinance)
  const match =
    quotes.find(q => q.exchange === 'PAR') ||
    quotes.find(q => ['PAR', 'AMS', 'BRU', 'MIL', 'ETR', 'FRA', 'MAD', 'LSE'].includes(q.exchange)) ||
    quotes[0]

  if (!match) return null

  const result = {
    name: match.shortname || match.longname || isin,
    symbol: match.symbol, // e.g. "PSP5.PA"
    exchange: match.exchDisp || match.exchange,
    type: match.typeDisp || match.quoteType,
  }

  // Cache the mapping
  tickerCache[isin] = result
  writeCache(CACHE_KEY_TICKERS, tickerCache)

  return result
}

/**
 * Fetch OHLC price data from Yahoo Finance chart API.
 * Returns { currentPrice, openPrice, previousClose, dayHigh, dayLow, name, volume }
 */
async function fetchYahooChart(yahooSymbol) {
  const chartUrl = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`
  const data = await proxiedFetch(chartUrl)

  if (!data.chart?.result?.[0]) throw new Error('No chart data')

  const r = data.chart.result[0]
  const meta = r.meta || {}
  const quote = r.indicators?.quote?.[0] || {}
  const last = (quote.open?.length || 1) - 1

  return {
    name: meta.shortName || meta.longName || yahooSymbol,
    currentPrice: meta.regularMarketPrice || quote.close?.[last] || null,
    openPrice: quote.open?.[last] ?? null,
    dayHigh: quote.high?.[last] ?? null,
    dayLow: quote.low?.[last] ?? null,
    previousClose: meta.chartPreviousClose ?? (last > 0 ? quote.close?.[last - 1] : null),
    volume: quote.volume?.[last] ?? null,
    currency: meta.currency || 'EUR',
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Full stock price fetch: search ISIN → Yahoo ticker → chart data.
 * Falls back to cached price on error.
 */
export async function fetchStockPrice(isin) {
  const cacheAll = readCacheNoExpiry(CACHE_KEY_STOCKS) || {}
  try {
    const searchResult = await searchISIN(isin)
    if (!searchResult?.symbol) throw new Error(`ISIN ${isin} not found`)

    const priceData = await fetchYahooChart(searchResult.symbol)
    if (!priceData?.currentPrice) throw new Error(`No price for ${isin}`)

    const result = {
      ...priceData,
      name: searchResult.name || priceData.name,
      isin,
      yahooSymbol: searchResult.symbol,
      exchange: searchResult.exchange,
    }

    cacheAll[isin] = { ...result, cachedAt: Date.now() }
    writeCache(CACHE_KEY_STOCKS, cacheAll)
    return result
  } catch (err) {
    if (cacheAll[isin]) {
      console.warn(`Using stale cache for ${isin}:`, err.message)
      return { ...cacheAll[isin], stale: true }
    }
    throw err
  }
}

/**
 * Batch fetch stock prices for multiple ISINs.
 * Returns a map: { [isin]: priceData }
 */
export async function fetchStockPrices(isins) {
  const results = {}
  for (const isin of isins) {
    try {
      results[isin] = await fetchStockPrice(isin)
    } catch (err) {
      console.warn(`Failed to fetch price for ${isin}:`, err.message)
      results[isin] = null
    }
    // Delay between requests to be polite to the proxy
    if (isins.indexOf(isin) < isins.length - 1) {
      await new Promise(r => setTimeout(r, 800))
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// CRYPTO — CoinGecko (CORS-friendly, no proxy needed)
// ---------------------------------------------------------------------------

/**
 * Search CoinGecko for a coin by query string.
 * Returns array of { id, name, symbol, thumb, marketCapRank }
 */
export async function searchCoinGecko(query) {
  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`CoinGecko search HTTP ${res.status}`)
  const json = await res.json()
  return (json.coins || []).slice(0, 10).map(c => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol?.toUpperCase(),
    thumb: c.thumb,
    marketCapRank: c.market_cap_rank,
  }))
}

/**
 * Fetch market data for a list of CoinGecko coin IDs.
 * Returns a map: { [coinId]: { currentPrice, change24h, high24h, low24h, ... } }
 */
export async function fetchCryptoPrices(coinIds) {
  if (!coinIds || coinIds.length === 0) return {}

  const cached = readCache(CACHE_KEY_CRYPTO)
  const cachedAll = readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}

  if (cached && coinIds.every(id => cached[id])) return cached

  try {
    const ids = coinIds.join(',')
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=eur&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=24h`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })

    if (res.status === 429) {
      console.warn('CoinGecko rate limit hit, using cache')
      return cachedAll
    }
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)

    const data = await res.json()
    const result = {}
    for (const coin of data) {
      result[coin.id] = {
        currentPrice: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        marketCap: coin.market_cap,
        volume: coin.total_volume,
        name: coin.name,
        symbol: coin.symbol?.toUpperCase(),
        image: coin.image,
        lastUpdated: coin.last_updated || new Date().toISOString(),
      }
    }

    const merged = { ...cachedAll, ...result }
    writeCache(CACHE_KEY_CRYPTO, merged)
    return result
  } catch (err) {
    console.warn('CoinGecko fetch failed, using stale cache:', err.message)
    const stale = {}
    for (const id of coinIds) {
      if (cachedAll[id]) stale[id] = { ...cachedAll[id], stale: true }
    }
    return stale
  }
}

export function getCachedCryptoPrices() {
  return readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}
}

export function getCachedStockPrices() {
  return readCacheNoExpiry(CACHE_KEY_STOCKS) || {}
}
