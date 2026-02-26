const DEFAULT_RULES = [
  { id: 'r_virement', pattern: 'VIR(EMENT)?\\b|SEPA', category: 'virement', priority: 10 },
  { id: 'r_loyer', pattern: 'LOYER|BAILLEUR|FONCIER', category: 'loyer', priority: 20 },
  { id: 'r_alimentation', pattern: 'CARREFOUR|LECLERC|LIDL|ALDI|MONOPRIX|INTERMARCHE|PICARD|AUCHAN|FRANPRIX|CASINO|SUPERMARCHE|BOULANGERIE', category: 'alimentation', priority: 30 },
  { id: 'r_transport', pattern: 'SNCF|RATP|NAVIGO|UBER|BOLT|TAXI|ESSENCE|TOTAL ENERGIES|SHELL|BP\\b|PARKING|AUTOROUTE|PEAGE', category: 'transport', priority: 30 },
  { id: 'r_abonnements', pattern: 'NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL|AMAZON PRIME|APPLE\\.COM|GOOGLE STORAGE|ICLOUD|FREE MOBILE|SFR|BOUYGUES|ORANGE|SOSH', category: 'abonnements', priority: 40 },
  { id: 'r_achats', pattern: 'AMAZON|FNAC|DARTY|CDISCOUNT|ZALANDO|SHEIN|ALIEXPRESS|PAYPAL', category: 'achats', priority: 50 },
  { id: 'r_frais', pattern: 'FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS|INTER[EÊ]TS D[EÉ]BITEURS', category: 'frais_bancaires', priority: 60 },
  { id: 'r_sante', pattern: 'PHARMACIE|DOCTOLIB|MEDECIN|MUTUELLE|CPAM|AMELI', category: 'sante', priority: 30 },
  { id: 'r_loisirs', pattern: 'CINEMA|THEATRE|CONCERT|SPORT|FITNESS|RESTAURANT|DELIVEROO|UBER EATS|JUST EAT', category: 'loisirs', priority: 30 },
  { id: 'r_epargne', pattern: 'EPARGNE|LIVRET|PLACEMENT|ASSURANCE VIE', category: 'epargne', priority: 15 },
  { id: 'r_revenus', pattern: 'SALAIRE|PAIE|REMUNERATION|CAF|ALLOCATION|POLE EMPLOI|FRANCE TRAVAIL|INDEMNIT', category: 'revenus', priority: 20 },
]

const TRANSFER_PATTERNS = /VIR(EMENT)?|EPARGNE|LIVRET|TRANSFERT/i

export function deduplicateTransactions(existing, incoming) {
  const existingHashes = new Set(existing.map(t => t.hash))
  const newTxs = incoming.filter(t => !existingHashes.has(t.hash))
  return { merged: [...existing, ...newTxs], newCount: newTxs.length, dupCount: incoming.length - newTxs.length }
}

export function detectTransfers(transactions) {
  const updated = transactions.map(t => ({ ...t }))
  const candidates = updated.filter(t => !t.isTransfer)

  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].isTransfer) continue
    const a = candidates[i]
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[j].isTransfer) continue
      const b = candidates[j]
      if (a.accountId === b.accountId) continue

      const absA = Math.abs(a.amount)
      const absB = Math.abs(b.amount)
      if (Math.abs(absA - absB) > 0.01) continue

      const daysDiff = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000
      if (daysDiff > 2) continue

      // One must be positive, other negative
      if (a.amount * b.amount >= 0) continue

      // Check label hints
      if (TRANSFER_PATTERNS.test(a.label) || TRANSFER_PATTERNS.test(b.label)) {
        a.isTransfer = true
        a.transferPairHash = b.hash
        a.category = 'virement'
        b.isTransfer = true
        b.transferPairHash = a.hash
        b.category = 'virement'
      }
    }
  }
  return updated
}

export function categorize(tx, customRules = []) {
  if (tx.isTransfer) return 'virement'
  if (tx.amount > 0) {
    // Check if it matches revenue patterns
    const revRule = [...customRules, ...DEFAULT_RULES].find(r => r.category === 'revenus')
    if (revRule && new RegExp(revRule.pattern, 'i').test(tx.label)) return 'revenus'
    return 'revenus'
  }

  const allRules = [...customRules, ...DEFAULT_RULES].sort((a, b) => a.priority - b.priority)
  const normalized = tx.label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  for (const rule of allRules) {
    try {
      if (new RegExp(rule.pattern, 'i').test(normalized)) return rule.category
    } catch { /* invalid regex */ }
  }
  return 'autre'
}

export function categorizeAll(transactions, customRules = []) {
  return transactions.map(tx => ({ ...tx, category: categorize(tx, customRules) }))
}

export function computeMonthlyAggregates(transactions, accountId) {
  const filtered = accountId ? transactions.filter(t => t.accountId === accountId) : transactions
  const months = {}

  for (const tx of filtered) {
    if (tx.isTransfer) continue
    const month = tx.date.slice(0, 7) // YYYY-MM
    if (!months[month]) months[month] = { month, income: 0, expenses: 0, savings: 0, savingsRate: 0 }
    if (tx.amount > 0) months[month].income += tx.amount
    else months[month].expenses += Math.abs(tx.amount)
  }

  return Object.values(months).map(m => {
    m.savings = m.income - m.expenses
    m.savingsRate = m.income > 0 ? (m.savings / m.income) * 100 : 0
    return m
  }).sort((a, b) => a.month.localeCompare(b.month))
}

export function computeHealthScore(aggregates) {
  if (!aggregates.length) return 50
  const last3 = aggregates.slice(-3)
  const avgRate = last3.reduce((s, m) => s + m.savingsRate, 0) / last3.length
  // Map savings rate (-50% to +50%) to score (0-100)
  const score = Math.max(0, Math.min(100, Math.round(50 + avgRate)))
  return score
}

export function generateCoachInsights(transactions, aggregates) {
  const nonTransfer = transactions.filter(t => !t.isTransfer)
  const expenses = nonTransfer.filter(t => t.amount < 0)

  // Fees detection
  const feesPattern = /FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS|INTER[EÊ]TS D[EÉ]BITEURS/i
  const fees = expenses.filter(t => feesPattern.test(t.label))
  const totalFees = fees.reduce((s, t) => s + Math.abs(t.amount), 0)

  // Top expenses by category
  const byCategory = {}
  for (const t of expenses) {
    byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(t.amount)
  }
  const topExpenses = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, total]) => ({ category, total }))

  // Recurring detection (same label appearing 2+ months)
  const labelMonths = {}
  for (const t of expenses) {
    const key = t.label.slice(0, 30).toUpperCase()
    const month = t.date.slice(0, 7)
    if (!labelMonths[key]) labelMonths[key] = new Set()
    labelMonths[key].add(month)
  }
  const recurring = Object.entries(labelMonths)
    .filter(([, months]) => months.size >= 2)
    .map(([label, months]) => {
      const matching = expenses.filter(t => t.label.slice(0, 30).toUpperCase() === label)
      const avgAmount = matching.reduce((s, t) => s + Math.abs(t.amount), 0) / months.size
      return { label, monthsCount: months.size, avgAmount }
    })
    .sort((a, b) => b.avgAmount - a.avgAmount)
    .slice(0, 10)

  // Anomalies: expenses > 3x avg for same category
  const categoryAvg = {}
  for (const [cat, total] of Object.entries(byCategory)) {
    const count = expenses.filter(t => t.category === cat).length
    categoryAvg[cat] = total / count
  }
  const anomalies = expenses.filter(t => {
    const avg = categoryAvg[t.category]
    return avg && Math.abs(t.amount) > avg * 3 && Math.abs(t.amount) > 50
  }).slice(0, 5)

  // Recommendations
  const recommendations = []
  if (totalFees > 10) recommendations.push(`Frais bancaires détectés : ${totalFees.toFixed(0)}€. Envisagez une banque en ligne sans frais.`)
  const lastAgg = aggregates[aggregates.length - 1]
  if (lastAgg && lastAgg.savingsRate < 10) recommendations.push('Taux d\'épargne faible ce mois. Essayez d\'automatiser un virement épargne en début de mois.')
  if (recurring.length > 5) recommendations.push(`${recurring.length} abonnements récurrents détectés. Vérifiez ceux que vous n'utilisez plus.`)
  if (!recommendations.length) recommendations.push('Bon travail ! Vos finances semblent saines. Continuez ainsi.')

  return { fees: { items: fees, total: totalFees }, topExpenses, recurring, anomalies, recommendations }
}

export const CATEGORIES = [
  { id: 'virement', label: 'Virement', color: '#6b7280' },
  { id: 'loyer', label: 'Loyer', color: '#ef4444' },
  { id: 'alimentation', label: 'Alimentation', color: '#f97316' },
  { id: 'transport', label: 'Transport', color: '#3b82f6' },
  { id: 'abonnements', label: 'Abonnements', color: '#8b5cf6' },
  { id: 'achats', label: 'Achats', color: '#ec4899' },
  { id: 'frais_bancaires', label: 'Frais bancaires', color: '#dc2626' },
  { id: 'sante', label: 'Santé', color: '#14b8a6' },
  { id: 'loisirs', label: 'Loisirs', color: '#f59e0b' },
  { id: 'epargne', label: 'Épargne', color: '#10b981' },
  { id: 'revenus', label: 'Revenus', color: '#22c55e' },
  { id: 'autre', label: 'Autre', color: '#94a3b8' },
]

export { DEFAULT_RULES }
