/**
 * Cloudflare Worker — CORS proxy for Portfolio Manager
 *
 * Deployment:
 *   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Name it "portfolio-cors-proxy"
 *   3. Click "Quick Edit" and paste this entire file
 *   4. Click "Save and Deploy"
 *   5. Your proxy URL will be: https://portfolio-cors-proxy.<your-subdomain>.workers.dev
 *
 * Usage: GET https://portfolio-cors-proxy.xxx.workers.dev/?url=<encoded-url>
 *
 * Free tier: 100,000 requests/day
 */

const ALLOWED_ORIGINS = [
  'https://cypriendlt-cmd.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
]

const ALLOWED_APIS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'api.coingecko.com',
  'www.boursorama.com',
  'live.euronext.com',
  'api.binance.com',
]

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, new Response(null, { status: 204 }))
    }

    const url = new URL(request.url)
    let targetUrl = url.searchParams.get('url')
    let extraHeaders = {}

    // POST method: read target URL and extra headers from JSON body
    // This avoids exposing API keys in query params or requiring custom CORS headers
    if (request.method === 'POST') {
      try {
        const body = await request.json()
        targetUrl = body.url || targetUrl
        extraHeaders = body.headers || {}
      } catch {
        return handleCORS(request, new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        ))
      }
    }

    if (!targetUrl) {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Missing ?url= parameter or body.url' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ))
    }

    // Validate target URL
    let target
    try {
      target = new URL(targetUrl)
    } catch {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ))
    }

    if (!ALLOWED_APIS.includes(target.hostname)) {
      return handleCORS(request, new Response(
        JSON.stringify({ error: 'Domain not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ))
    }

    try {
      const forwardHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        ...extraHeaders,
      }
      // Also support API key via query param (legacy GET)
      const apiKey = request.headers.get('X-MBX-APIKEY') || url.searchParams.get('apikey')
      if (apiKey) forwardHeaders['X-MBX-APIKEY'] = apiKey

      const response = await fetch(targetUrl, { headers: forwardHeaders })

      const body = await response.text()

      return handleCORS(request, new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'public, max-age=30',
        },
      }))
    } catch (err) {
      return handleCORS(request, new Response(
        JSON.stringify({ error: err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      ))
    }
  }
}

function handleCORS(request, response) {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Max-Age', '86400')

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
