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

  // Use POST to proxy — sends API key in body (not in URL, not as custom header)
  // This avoids CORS preflight issues and keeps the key out of browser history/logs
  const res = await fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      headers: { 'X-MBX-APIKEY': apiKey },
    }),
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

  // Filter out stablecoins, Binance earn/launchpool tokens (LD*), and dust
  const meaningful = balances.filter(b => {
    // Skip Binance-specific non-tradeable tokens (launchpool, earn, wrapped internal)
    if (/^(LD|BETH$|WBETH$|BETH$)/.test(b.asset)) return false
    const stables = ['USDT', 'BUSD', 'USDC', 'EUR', 'USD', 'GBP', 'FDUSD', 'TUSD', 'DAI', 'USDP']
    if (stables.includes(b.asset) && b.total < 1) return false
    return b.total > 0.00001
  })

  return meaningful
}
