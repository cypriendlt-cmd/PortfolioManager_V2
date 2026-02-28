/**
 * Allocation Engine — maps TAXONOMY categories to macro-buckets,
 * computes current vs recommended allocation (% of monthly income).
 */

// ── Macro-bucket definitions ─────────────────────────────────────────────────
export const MACRO_BUCKETS = {
  essentiels:   { label: 'Essentiels',          color: '#ef4444', icon: 'Home',       categories: ['loyer', 'alimentation', 'transport', 'sante', 'impots', 'frais_bancaires'] },
  loisirs:      { label: 'Loisirs & Plaisirs',  color: '#f59e0b', icon: 'Smile',      categories: ['loisirs', 'restauration', 'achats'] },
  abonnements:  { label: 'Abonnements',         color: '#8b5cf6', icon: 'Repeat',     categories: ['abonnements'] },
  epargne:      { label: 'Épargne',             color: '#10b981', icon: 'PiggyBank',  categories: ['epargne'] },
  autre:        { label: 'Autre',               color: '#94a3b8', icon: 'MoreHoriz',  categories: ['autre', 'virement'] },
}

// ── Model allocations (% of monthly income) ─────────────────────────────────
export const ALLOCATION_MODELS = {
  prudent: {
    label: 'Prudent',
    description: 'Priorité sécurité, épargne maximisée',
    essentiels:  50,
    abonnements:  7,
    loisirs:     13,
    epargne:     20,
    autre:       10,
  },
  equilibre: {
    label: 'Équilibré',
    description: 'Équilibre vie / épargne / investissement',
    essentiels:  50,
    abonnements:  8,
    loisirs:     17,
    epargne:     15,
    autre:       10,
  },
  offensif: {
    label: 'Offensif',
    description: 'Croissance et investissement maximisés',
    essentiels:  45,
    abonnements:  7,
    loisirs:     13,
    epargne:     10,
    autre:       25,
  },
}

/**
 * Compute current spending allocation as % of monthly income.
 * @param {Array} transactions
 * @param {number} monthlyIncome – average monthly income (from aggregates)
 * @param {number} monthsBack – rolling window
 * @returns {{ buckets, totalExpenses, byCategory }}
 */
export function computeCurrentAllocation(transactions, monthlyIncome, monthsBack = 3) {
  const now = new Date()
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const cutoff = cutoffDate.toISOString().slice(0, 7)

  const byCategory = {}
  let totalExpenses = 0

  for (const tx of transactions) {
    if (tx.isTransfer || tx.amount >= 0) continue
    if (tx.date.slice(0, 7) < cutoff) continue
    const cat = tx.category || 'autre'
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount)
    totalExpenses += Math.abs(tx.amount)
  }

  // Average per month
  const avgTotal    = totalExpenses / monthsBack
  const avgByCategory = {}
  for (const [cat, total] of Object.entries(byCategory)) {
    avgByCategory[cat] = total / monthsBack
  }

  // Map to macro buckets as % of income
  const buckets = {}
  const incomeBase = monthlyIncome > 0 ? monthlyIncome : avgTotal || 1

  for (const [bucketId, bucket] of Object.entries(MACRO_BUCKETS)) {
    const bucketTotal = bucket.categories.reduce((s, cat) => s + (avgByCategory[cat] || 0), 0)
    buckets[bucketId] = {
      amount:  Math.round(bucketTotal),
      pct:     Math.round((bucketTotal / incomeBase) * 1000) / 10,  // 1 decimal
      color:   bucket.color,
      label:   bucket.label,
    }
  }

  return { buckets, totalExpenses: Math.round(avgTotal), byCategory: avgByCategory }
}

/**
 * Gap analysis between current and recommended allocation.
 * Returns sorted list of significant deviations (≥ 2%).
 */
export function getAllocationGaps(currentBuckets, profileType, monthlyIncome) {
  const model = ALLOCATION_MODELS[profileType] || ALLOCATION_MODELS.equilibre
  const gaps  = []

  for (const bucketId of Object.keys(MACRO_BUCKETS)) {
    const current     = currentBuckets[bucketId]?.pct   || 0
    const recommended = model[bucketId]                 || 0
    const diff        = current - recommended

    if (Math.abs(diff) < 2) continue

    gaps.push({
      bucket:          bucketId,
      label:           MACRO_BUCKETS[bucketId].label,
      color:           MACRO_BUCKETS[bucketId].color,
      current:         Math.round(current  * 10) / 10,
      recommended,
      diff:            Math.round(diff     * 10) / 10,
      severity:        Math.abs(diff) >= 12 ? 'high' : Math.abs(diff) >= 5 ? 'medium' : 'low',
      monthlyImpact:   monthlyIncome > 0 ? Math.round(Math.abs(diff) * monthlyIncome / 100) : 0,
    })
  }

  return gaps.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}
