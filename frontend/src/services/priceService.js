/**
 * priceService.js
 * Client-side price fetching for stocks (via Boursorama + CORS proxy) and crypto (CoinGecko).
 * Runs entirely in the browser - no server required.
 */

const CORS_PROXY = 'https://api.allorigins.win/raw?url='
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_KEY_CRYPTO = 'pm_prices_crypto'
const CACHE_KEY_STOCKS = 'pm_prices_stocks'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL

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
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // ignore storage errors
  }
}

function readCacheNoExpiry(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data } = JSON.parse(raw)
    return data
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// STOCKS — Boursorama via CORS proxy
// ---------------------------------------------------------------------------

/**
 * Search Boursorama for an ISIN via their AJAX suggest endpoint.
 * Returns { name, symbol, boursoramaPath } or null.
 */
export async function searchISIN(isin) {
  const searchUrl = `https://www.boursorama.com/recherche/ajax/?query=${encodeURIComponent(isin)}`
  const proxied = `${CORS_PROXY}${encodeURIComponent(searchUrl)}`

  const res = await fetch(proxied, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Boursorama search HTTP ${res.status}`)
  const text = await res.text()

  // Boursorama returns JSON array of results
  let results
  try {
    results = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON from Boursorama search')
  }

  // Results is an array; find the one whose sedol/isin matches or take the first
  if (!Array.isArray(results) || results.length === 0) return null

  const match = results.find(r => r.isin && r.isin.toUpperCase() === isin.toUpperCase()) || results[0]

  return {
    name: match.label || match.name || isin,
    symbol: match.symbol || match.ticker || '',
    boursoramaPath: match.linkQuote || match.link || `/cours/${match.symbol || ''}`,
  }
}

/**
 * Fetch stock price data from Boursorama by scraping the quote page.
 * Returns { currentPrice, openPrice, previousClose, dayHigh, dayLow, name, lastUpdated } or null.
 */
export async function fetchStockPriceBoursorama(boursoramaPath) {
  const pageUrl = `https://www.boursorama.com${boursoramaPath}`
  const proxied = `${CORS_PROXY}${encodeURIComponent(pageUrl)}`

  const res = await fetch(proxied, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Boursorama page HTTP ${res.status}`)
  const html = await res.text()

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Try to extract structured data (JSON-LD or meta tags) first
  let currentPrice = null
  let name = null

  // Boursorama uses data attributes and specific class names
  // Try multiple selectors as the site structure may vary
  const priceSelectors = [
    '[class*="c-faceplate__price"]',
    '[class*="l-instrument__price"]',
    '[data-ist-price]',
    '.c-instrument__data .c-instrument__value',
  ]

  for (const sel of priceSelectors) {
    const el = doc.querySelector(sel)
    if (el) {
      const txt = el.textContent.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
      const val = parseFloat(txt)
      if (!isNaN(val) && val > 0) { currentPrice = val; break }
    }
  }

  // Try JSON-LD
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const s of scripts) {
    try {
      const json = JSON.parse(s.textContent)
      if (json.price) { currentPrice = currentPrice ?? parseFloat(json.price); }
      if (json.name) { name = json.name }
    } catch { /* ignore */ }
  }

  // Name from title
  if (!name) {
    const title = doc.querySelector('title')
    if (title) name = title.textContent.split('|')[0].trim()
  }

  // Try to get OHLC data from the page
  let openPrice = null, previousClose = null, dayHigh = null, dayLow = null

  const rows = doc.querySelectorAll('table tr, [class*="c-table"] tr')
  rows.forEach(row => {
    const cells = row.querySelectorAll('td, th')
    if (cells.length >= 2) {
      const label = cells[0].textContent.toLowerCase()
      const val = parseFloat(cells[1].textContent.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''))
      if (!isNaN(val)) {
        if (label.includes('ouv') || label.includes('open')) openPrice = val
        if (label.includes('clôt') || label.includes('veille') || label.includes('close')) previousClose = val
        if (label.includes('haut') || label.includes('high')) dayHigh = val
        if (label.includes('bas') || label.includes('low')) dayLow = val
      }
    }
  })

  if (!currentPrice) return null

  return {
    currentPrice,
    openPrice: openPrice || currentPrice,
    previousClose: previousClose || currentPrice,
    dayHigh: dayHigh || currentPrice,
    dayLow: dayLow || currentPrice,
    name,
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Full stock price fetch: search ISIN -> scrape quote page.
 * Falls back to cached price on error.
 */
export async function fetchStockPrice(isin) {
  const cacheAll = readCacheNoExpiry(CACHE_KEY_STOCKS) || {}
  try {
    const searchResult = await searchISIN(isin)
    if (!searchResult) throw new Error(`ISIN ${isin} not found on Boursorama`)

    const priceData = await fetchStockPriceBoursorama(searchResult.boursoramaPath)
    if (!priceData) throw new Error(`Could not parse price for ${isin}`)

    const result = { ...priceData, name: priceData.name || searchResult.name, isin }
    // Update cache
    cacheAll[isin] = { ...result, cachedAt: Date.now() }
    writeCache(CACHE_KEY_STOCKS, cacheAll)
    return result
  } catch (err) {
    // Return stale cache if available
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
  // Sequential to avoid hammering the CORS proxy
  for (const isin of isins) {
    try {
      results[isin] = await fetchStockPrice(isin)
    } catch (err) {
      console.warn(`Failed to fetch price for ${isin}:`, err.message)
      results[isin] = null
    }
    // Small delay between requests to be polite to the proxy
    await new Promise(r => setTimeout(r, 500))
  }
  return results
}

// ---------------------------------------------------------------------------
// CRYPTO — CoinGecko (CORS-friendly, no proxy needed)
// ---------------------------------------------------------------------------

/**
 * Search CoinGecko for a coin by query string.
 * Returns array of { id, name, symbol, thumb }
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
 * Returns a map: { [coinId]: { currentPrice, change24h, high24h, low24h, marketCap, volume, name, symbol, image, lastUpdated } }
 */
export async function fetchCryptoPrices(coinIds) {
  if (!coinIds || coinIds.length === 0) return {}

  const cached = readCache(CACHE_KEY_CRYPTO)
  const cachedAll = readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}

  // Check if all IDs are in valid cache
  if (cached && coinIds.every(id => cached[id])) {
    return cached
  }

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

    // Merge with existing cache (keep data for IDs not in this batch)
    const merged = { ...cachedAll, ...result }
    writeCache(CACHE_KEY_CRYPTO, merged)
    return result
  } catch (err) {
    console.warn('CoinGecko fetch failed, using stale cache:', err.message)
    // Return stale data for requested IDs
    const stale = {}
    for (const id of coinIds) {
      if (cachedAll[id]) stale[id] = { ...cachedAll[id], stale: true }
    }
    return stale
  }
}

/**
 * Get cached crypto prices without triggering a fetch (for instant display on load).
 */
export function getCachedCryptoPrices() {
  return readCacheNoExpiry(CACHE_KEY_CRYPTO) || {}
}

/**
 * Get cached stock prices without triggering a fetch.
 */
export function getCachedStockPrices() {
  return readCacheNoExpiry(CACHE_KEY_STOCKS) || {}
}
