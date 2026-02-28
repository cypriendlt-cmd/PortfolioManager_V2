/**
 * AI categorization client — calls backend POST /api/bank/categorize
 * Guards: max 20/batch, max 3 requests/session, only low-confidence merchants.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const BATCH_SIZE = 20
const MAX_REQUESTS = 3

/**
 * @param {Array<{ merchant_key, sample_labels, amount_sign }>} merchants
 * @returns {Promise<Map<string, { category, subcategory, confidence }>>}
 */
export async function aiCategorizeBatch(merchants) {
  const results = new Map()
  const batches = []
  for (let i = 0; i < merchants.length && batches.length < MAX_REQUESTS; i += BATCH_SIZE) {
    batches.push(merchants.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    try {
      const res = await fetch(`${API_BASE}/api/bank/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchants: batch }),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (!Array.isArray(data.results)) continue
      for (const item of data.results) {
        if (item.merchant_key && item.category) {
          results.set(item.merchant_key, {
            category: item.category,
            subcategory: item.subcategory || null,
            confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.7,
          })
        }
      }
    } catch { /* network error — continue */ }
  }
  return results
}

/**
 * Categorize individual transaction lines (not grouped by merchant).
 * @param {Array<{ hash, label, amount, date }>} transactions
 * @returns {Promise<Array<{ hash, category, subcategory, confidence }>>}
 */
export async function aiCategorizeLines(transactions) {
  const results = []
  const LINES_BATCH = 15   // reduced: backend caps at 15 uncached, 8b model is fast enough

  // Send at most one batch of LINES_BATCH lines
  const batch = transactions.slice(0, LINES_BATCH)
  try {
    const res = await fetch(`${API_BASE}/api/bank/categorize-lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: batch }),
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          if (item.hash && item.category) {
            results.push({
              hash: item.hash,
              merchantName: item.merchant_name || null,
              category: item.category,
              subcategory: item.subcategory || null,
              confidence: typeof item.confidence === 'number'
                ? Math.min(1, Math.max(0, item.confidence))
                : 0.75,
              ruleHit: item.rule_hit || null,
            })
          }
        }
      }
    }
  } catch { /* network error */ }

  return results
}

export async function isAIAvailable() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}
