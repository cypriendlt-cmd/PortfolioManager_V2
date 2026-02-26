/**
 * binanceService.js
 * Binance API integration via CORS proxy.
 * Uses HMAC-SHA256 signing via WebCrypto API.
 */

const BINANCE_BASE = 'https://api.binance.com'
const CF_WORKER_KEY = 'pm_cors_proxy_url'
const DEFAULT_PROXY = 'https://portfolio-cors-proxy.cypriendlt.workers.dev'

function getProxyUrl() {
  return localStorage.getItem(CF_WORKER_KEY) || DEFAULT_PROXY
}

async function hmacSHA256(secret, message) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function binanceFetch(endpoint, apiKey, apiSecret, params = {}) {
  const proxy = getProxyUrl()
  const timestamp = Date.now()
  const queryParams = new URLSearchParams({ ...params, timestamp: String(timestamp) })
  const queryString = queryParams.toString()
  const signature = await hmacSHA256(apiSecret, queryString)
  queryParams.append('signature', signature)

  const url = `${BINANCE_BASE}${endpoint}?${queryParams.toString()}`
  const proxyUrl = `${proxy}?url=${encodeURIComponent(url)}`

  const res = await fetch(proxyUrl, {
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Binance HTTP ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Test Binance connection — fetch account info
 */
export async function testBinanceConnection(apiKey, apiSecret) {
  try {
    const data = await binanceFetch('/api/v3/account', apiKey, apiSecret)
    if (data.balances) {
      const nonZero = data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      return { success: true, assetCount: nonZero.length }
    }
    if (data.code) {
      return { success: false, error: `Binance: ${data.msg || 'Erreur API'}` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Fetch Binance spot balances
 * Returns array of { asset, free, locked, total }
 */
export async function fetchBinanceBalances(apiKey, apiSecret) {
  const data = await binanceFetch('/api/v3/account', apiKey, apiSecret)
  if (data.code) throw new Error(data.msg || 'Binance API error')

  return (data.balances || [])
    .map(b => ({
      asset: b.asset,
      free: parseFloat(b.free),
      locked: parseFloat(b.locked),
      total: parseFloat(b.free) + parseFloat(b.locked),
    }))
    .filter(b => b.total > 0)
}

/**
 * Sync Binance balances into portfolio crypto assets.
 * Returns { added, updated, balances } for UI feedback.
 */
export async function syncBinanceToPortfolio(apiKey, apiSecret) {
  const balances = await fetchBinanceBalances(apiKey, apiSecret)

  // Filter out stablecoins and very small dust
  const meaningful = balances.filter(b => {
    const dust = ['USDT', 'BUSD', 'USDC', 'EUR', 'USD', 'GBP', 'FDUSD', 'TUSD']
    if (dust.includes(b.asset) && b.total < 1) return false
    return b.total > 0.00001
  })

  return meaningful
}
