/**
 * Bridge between React (main thread) and bankWorker (background thread).
 * Manages worker lifecycle, caching, and deduplication of requests.
 */

let worker = null
let pendingResolve = null
let pendingReject = null
let lastProcessHash = null

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/bankWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      if (e.data.type === 'result' && pendingResolve) {
        pendingResolve(e.data)
        pendingResolve = null
        pendingReject = null
      } else if (e.data.type === 'error' && pendingReject) {
        pendingReject(new Error(e.data.message))
        pendingResolve = null
        pendingReject = null
      }
    }
    worker.onerror = (err) => {
      if (pendingReject) {
        pendingReject(err)
        pendingResolve = null
        pendingReject = null
      }
    }
  }
  return worker
}

/**
 * Compute a quick hash of transaction count + last hash to detect changes.
 */
function computeQuickHash(transactions) {
  if (!transactions.length) return 'empty'
  const last = transactions[transactions.length - 1]
  return `${transactions.length}|${last.hash || ''}|${last.category || ''}`
}

/**
 * Send transactions to worker for full processing.
 * Returns a Promise with processed results.
 * Deduplicates: if same data hash, returns null (skip).
 */
export function processInWorker({ transactions, rules, learnedRules, aiCache, accounts, force = false }) {
  return new Promise((resolve, reject) => {
    const hash = computeQuickHash(transactions)
    if (!force && hash === lastProcessHash) {
      resolve(null) // no changes, skip
      return
    }

    // Cancel previous pending request
    if (pendingReject) {
      pendingReject(new Error('Superseded'))
      pendingResolve = null
      pendingReject = null
    }

    pendingResolve = (data) => {
      lastProcessHash = hash
      resolve(data)
    }
    pendingReject = reject

    // Strip non-transferable data (functions, React refs, etc.)
    const cleanTxs = transactions.map(({ label, amount, date, hash, accountId, isTransfer, transferPairHash, label_norm, merchant_key, payment_type, category, subcategory, confidence, reason, method, transferScore, importedAt }) => ({
      label, amount, date, hash, accountId, isTransfer: isTransfer || false, transferPairHash: transferPairHash || null,
      label_norm, merchant_key, payment_type, category, subcategory, confidence, reason, method, transferScore, importedAt,
    }))

    const cleanAccounts = (accounts || []).map(({ id, type, alias, initialBalance, lastBalanceDate, livretType, customRate, openDate }) => ({
      id, type, alias, initialBalance: initialBalance || 0, lastBalanceDate,
      ...(livretType != null && { livretType }),
      ...(customRate != null && { customRate }),
      ...(openDate != null && { openDate }),
    }))

    getWorker().postMessage({
      type: 'process',
      transactions: cleanTxs,
      rules: rules || [],
      learnedRules: learnedRules || {},
      aiCache: aiCache || {},
      accounts: cleanAccounts,
    })
  })
}

/**
 * Re-categorize only (no transfer detection). Faster path for rule changes.
 */
export function recategorizeInWorker({ transactions, rules, learnedRules, aiCache, accounts }) {
  return new Promise((resolve, reject) => {
    if (pendingReject) {
      pendingReject(new Error('Superseded'))
      pendingResolve = null
      pendingReject = null
    }
    pendingResolve = resolve
    pendingReject = reject

    const cleanTxs = transactions.map(({ label, amount, date, hash, accountId, isTransfer, transferPairHash, label_norm, merchant_key, payment_type, transferScore, importedAt }) => ({
      label, amount, date, hash, accountId, isTransfer: isTransfer || false, transferPairHash, label_norm, merchant_key, payment_type, transferScore, importedAt,
    }))

    const cleanAccounts = (accounts || []).map(({ id, type, alias, initialBalance, lastBalanceDate, livretType, customRate, openDate }) => ({
      id, type, alias, initialBalance: initialBalance || 0, lastBalanceDate,
      ...(livretType != null && { livretType }),
      ...(customRate != null && { customRate }),
      ...(openDate != null && { openDate }),
    }))

    getWorker().postMessage({
      type: 'categorize_only',
      transactions: cleanTxs,
      rules: rules || [],
      learnedRules: learnedRules || {},
      aiCache: aiCache || {},
      accounts: cleanAccounts,
    })
  })
}

/**
 * Invalidate cache to force reprocessing on next call.
 */
export function invalidateWorkerCache() {
  lastProcessHash = null
}

/**
 * Terminate worker (cleanup).
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate()
    worker = null
    pendingResolve = null
    pendingReject = null
    lastProcessHash = null
  }
}
