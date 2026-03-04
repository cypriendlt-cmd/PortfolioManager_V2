/**
 * priceService.js
 * Client-side price fetching for stocks (Yahoo Finance) and crypto (CoinGecko).
 *
 * STOCKS: Yahoo Finance search (ISIN → ticker) + chart API (OHLC)
 * CRYPTO: CoinGecko /coins/markets (CORS-friendly)
 *
 * For Yahoo Finance (no CORS), uses proxy with fallback chain.
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const YAHOO_BASE = 'https://query2.finance.yahoo.com'
const CACHE_KEY_CRYPTO = 'pm_prices_crypto'
const CACHE_KEY_STOCKS = 'pm_prices_stocks'
const CACHE_KEY_TICKERS = 'pm_yahoo_tickers'
const CACHE_TTL_MS = 5 * 60 * 1000

// Proxy configuration
const CF_WORKER_KEY = 'pm_cors_proxy_url'
const DEFAULT_PROXY = 'https://portfolio-cors-proxy.cypriendlt.workers.dev'
function getProxyUrl() {
  return localStorage.getItem(CF_WORKER_KEY) || DEFAULT_PROXY
}

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

// ---------------------------------------------------------------------------
// Proxied fetch with fallback chain
// ---------------------------------------------------------------------------

/**
 * Fetch a URL through CORS proxy.
 * Tries: 1) Cloudflare Worker  2) allorigins /raw  3) direct (may fail CORS)
 */
async function proxiedFetchJSON(url, timeoutMs = 12000) {
  const errors = []

  // 1) Cloudflare Worker proxy (best option if configured)
  const cfProxy = getProxyUrl()
  if (cfProxy) {
    try {
      const proxyUrl = `${cfProxy}?url=${encodeURIComponent(url)}`
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return await res.json()
      errors.push(`CF Worker: HTTP ${res.status}`)
    } catch (e) {
      errors.push(`CF Worker: ${e.message}`)
    }
  }

  // 2) allorigins /raw (public, free, supports CORS)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) {
      const text = await res.text()
      return JSON.parse(text)
    }
    errors.push(`allorigins: HTTP ${res.status}`)
  } catch (e) {
    errors.push(`allorigins: ${e.message}`)
  }

  // 3) Direct fetch (works if the API supports CORS or same-origin)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return await res.json()
    errors.push(`direct: HTTP ${res.status}`)
  } catch (e) {
    errors.push(`direct: ${e.message}`)
  }

  throw new Error(`All proxies failed for ${url}: ${errors.join(' | ')}`)
}

// ---------------------------------------------------------------------------
// STOCKS — Yahoo Finance
// ---------------------------------------------------------------------------

/**
 * Search Yahoo Finance for an ISIN → returns { name, symbol, exchange } or null.
 */
export async function searchISIN(isin) {
  const tickerCache = readCacheNoExpiry(CACHE_KEY_TICKERS) || {}
  if (tickerCache[isin]) return tickerCache[isin]

  const searchUrl = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`
  const data = await proxiedFetchJSON(searchUrl)

  if (!data.quotes || data.quotes.length === 0) return null

  const quotes = data.quotes.filter(q => q.isYahooFinance)
  const match =
    quotes.find(q => q.exchange === 'PAR') ||
    quotes.find(q => ['PAR', 'AMS', 'BRU', 'MIL', 'ETR', 'FRA', 'MAD', 'LSE'].includes(q.exchange)) ||
    quotes[0]

  if (!match) return null

  const result = {
    name: match.shortname || match.longname || isin,
    symbol: match.symbol,
    exchange: match.exchDisp || match.exchange,
    type: match.typeDisp || match.quoteType,
  }

  tickerCache[isin] = result
  writeCache(CACHE_KEY_TICKERS, tickerCache)
  return result
}

/**
 * Fetch OHLC from Yahoo Finance chart API.
 */
async function fetchYahooChart(yahooSymbol) {
  const chartUrl = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`
  const data = await proxiedFetchJSON(chartUrl)

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
    if (isins.indexOf(isin) < isins.length - 1) {
      await new Promise(r => setTimeout(r, 800))
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// CRYPTO — CoinGecko (CORS-friendly, no proxy needed)
// ---------------------------------------------------------------------------

export async function searchCoinGecko(query) {
  // Try CoinGecko first
  try {
    const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json()
      const results = (json.coins || []).slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        symbol: c.symbol?.toUpperCase(),
        thumb: c.thumb,
        marketCapRank: c.market_cap_rank,
      }))
      if (results.length > 0) return results
    }
  } catch {}

  // Fallback: CoinCap API (free, CORS-friendly)
  try {
    const url = `https://api.coincap.io/v2/assets?search=${encodeURIComponent(query)}&limit=10`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`CoinCap HTTP ${res.status}`)
    const json = await res.json()
    return (json.data || []).map(c => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol?.toUpperCase(),
      thumb: null,
      marketCapRank: c.rank ? parseInt(c.rank) : null,
      _source: 'coincap',
    }))
  } catch {}

  return []
}

export async function fetchCryptoPrices(coinIds) {
  if (!coinIds || coinIds.length === 0) return {}

  const cached = readCache(CACHE_KEY_CRYPTO)
  const cachedAll = readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}

  if (cached && coinIds.every(id => cached[id])) return cached

  // Separate CoinGecko IDs from CoinCap IDs (CoinCap assets added via fallback search)
  const result = {}

  // Try CoinGecko first for all IDs
  try {
    const ids = coinIds.join(',')
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=eur&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })

    if (res.status === 429) {
      console.warn('CoinGecko rate limit hit, trying CoinCap fallback')
    } else if (res.ok) {
      const data = await res.json()
      for (const coin of data) {
        result[coin.id] = {
          currentPrice: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          change1h: coin.price_change_percentage_1h_in_currency ?? null,
          change7d: coin.price_change_percentage_7d_in_currency ?? null,
          change30d: coin.price_change_percentage_30d_in_currency ?? null,
          change1y: coin.price_change_percentage_1y_in_currency ?? null,
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
    }
  } catch (err) {
    console.warn('CoinGecko fetch failed:', err.message)
  }

  // Fallback: fetch missing IDs from CoinCap
  const missing = coinIds.filter(id => !result[id] && !cachedAll[id])
  if (missing.length > 0) {
    for (const id of missing) {
      try {
        const res = await fetch(`https://api.coincap.io/v2/assets/${id}`, { signal: AbortSignal.timeout(8000) })
        if (res.ok) {
          const json = await res.json()
          const d = json.data
          if (d && d.priceUsd) {
            // CoinCap returns USD — approximate EUR (rough 0.92 rate)
            const eurRate = 0.92
            result[id] = {
              currentPrice: parseFloat(d.priceUsd) * eurRate,
              change24h: d.changePercent24Hr ? parseFloat(d.changePercent24Hr) : null,
              high24h: null,
              low24h: null,
              marketCap: d.marketCapUsd ? parseFloat(d.marketCapUsd) * eurRate : null,
              volume: d.volumeUsd24Hr ? parseFloat(d.volumeUsd24Hr) * eurRate : null,
              name: d.name,
              symbol: d.symbol?.toUpperCase(),
              image: null,
              lastUpdated: new Date().toISOString(),
              _approximate: true,
            }
          }
        }
      } catch {}
    }
  }

  // Use stale cache for anything still missing
  for (const id of coinIds) {
    if (!result[id] && cachedAll[id]) {
      result[id] = { ...cachedAll[id], stale: true }
    }
  }

  const merged = { ...cachedAll, ...result }
  writeCache(CACHE_KEY_CRYPTO, merged)
  return result
}

export function getCachedCryptoPrices() {
  return readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}
}

export function getCachedStockPrices() {
  return readCacheNoExpiry(CACHE_KEY_STOCKS) || {}
}
