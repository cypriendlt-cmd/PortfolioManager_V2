/**
 * Bank Worker — ALL heavy computation runs here, off main thread.
 *
 * Messages IN:
 *   { type: 'process', transactions, rules, learnedRules, aiCache, accounts }
 *   { type: 'categorize_only', transactions, rules, learnedRules, aiCache }
 *   { type: 'correct', merchantKey, newCategory, newSubcategory, transactions, rules, learnedRules, aiCache }
 *
 * Messages OUT:
 *   { type: 'result', transactions, aggregates, healthScore, insights, accountBalances, flaggedTransfers, lowConfidence }
 *   { type: 'error', message }
 */

// ─── Normalizer (inlined to avoid import issues in worker) ──────────────────

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'en', 'et', 'ou', 'au', 'aux',
  'ce', 'ces', 'par', 'sur', 'pour', 'avec', 'dans', 'qui', 'que', 'son', 'ses',
])

const PAYMENT_PREFIXES = /^(CB\s*\*?|CARTE\s+|VIR(EMENT)?\s+(SEPA\s+)?|PRLV\s+(SEPA\s+)?|CHQ\s*N?\s*\d*\s*|RET\s*DAB\s*|SEPA\s+DD\s+)/i
const DATE_REFS = /\b\d{2}[\/.\-]\d{2}([\/.\-]\d{2,4})?\b/g
const CARD_NUMBERS = /\b\d{4}\s?\*{4,}\s?\d{0,4}\b|\bX{4,}\d{4}\b|\b\d{16}\b/g
const REF_PATTERNS = /\b(REF|N[°O]?|NR|ID)\s*[:\s]?\s*[\w\-]+/gi
const MULTI_SPACE = /\s{2,}/g

function normalizeLabel(label) {
  if (!label) return ''
  return label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(CARD_NUMBERS, ' ').replace(DATE_REFS, ' ').replace(REF_PATTERNS, ' ')
    .replace(MULTI_SPACE, ' ').trim()
}

function extractMerchantKey(labelNorm) {
  if (!labelNorm) return ''
  let key = labelNorm.replace(PAYMENT_PREFIXES, '').replace(/\b\d{4,}\b/g, '')
    .replace(/\b[A-Z]{0,2}\d{3,}\b/g, '').replace(MULTI_SPACE, ' ').trim()
  return key.split(/\s+/).filter(w => w.length > 1).slice(0, 3).join(' ')
}

function detectPaymentType(labelNorm) {
  if (!labelNorm) return null
  if (/^CB\b|^CARTE\b/.test(labelNorm)) return 'CB'
  if (/^VIR(EMENT)?\b/.test(labelNorm)) return 'VIR'
  if (/^PRLV\b/.test(labelNorm)) return 'PRLV'
  if (/^CHQ\b/.test(labelNorm)) return 'CHQ'
  if (/^RET\s*DAB\b/.test(labelNorm)) return 'RET_DAB'
  if (/^SEPA\s+DD\b/.test(labelNorm)) return 'SEPA_DD'
  return null
}

function deriveFields(label) {
  const label_norm = normalizeLabel(label)
  return { label_norm, merchant_key: extractMerchantKey(label_norm), payment_type: detectPaymentType(label_norm) }
}

// ─── Pre-compiled categorization rules ──────────────────────────────────────

const STRONG_RULES = [
  { re: /SALAIRE|PAIE|REMUNERATION/,             cat: 'revenus', sub: 'salaire' },
  { re: /CAF|ALLOCATION|POLE EMPLOI|FRANCE TRAVAIL/, cat: 'revenus', sub: 'allocations' },
  { re: /REMBOURSEMENT|REMBOURS/,                cat: 'revenus', sub: 'remboursements' },
  { re: /IMPOT|DGFIP|DIRECTION GENERALE DES FINANCES/, cat: 'impots', sub: 'impot_revenu' },
  { re: /TAXE HABITATION/,                        cat: 'impots', sub: 'taxe_habitation' },
  { re: /TAXE FONCIERE/,                          cat: 'impots', sub: 'taxe_fonciere' },
  { re: /URSSAF/,                                 cat: 'impots', sub: 'urssaf' },
  { re: /\bCSG\b|CONTRIBUTION SOCIALE/,           cat: 'impots', sub: 'csg' },
  { re: /FRAIS|COTISATION CARTE|TENUE DE COMPTE|COMMISSION|AGIOS|INTERETS DEBITEURS/, cat: 'frais_bancaires', sub: 'cotisation' },
  { re: /LOYER|BAILLEUR/,                         cat: 'loyer', sub: 'loyer' },
  { re: /CPAM|AMELI|SECU/,                        cat: 'sante', sub: 'cpam' },
  { re: /MUTUELLE/,                               cat: 'sante', sub: 'mutuelle' },
]

const DEFAULT_RULES = [
  { re: /CARREFOUR|LECLERC|LIDL|ALDI|MONOPRIX|INTERMARCHE|PICARD|AUCHAN|FRANPRIX|CASINO|SUPERMARCHE|SUPER\s?U|CORA/, cat: 'alimentation', sub: 'supermarche' },
  { re: /BOULANGERIE|PATISSERIE|FOURNIL/, cat: 'alimentation', sub: 'boulangerie' },
  { re: /\bBIO\b|BIOCOOP|NATURALIA/, cat: 'alimentation', sub: 'bio' },
  { re: /SNCF|RATP|NAVIGO|TRANSDEV|TAN\b|KEOLIS/, cat: 'transport', sub: 'transport_commun' },
  { re: /UBER\b|BOLT\b|TAXI|FREENOW|KAPTEN/, cat: 'transport', sub: 'vtc' },
  { re: /TOTAL ENERGIES|SHELL\b|BP\b|ESSENCE|ESSO\b|CARBURANT/, cat: 'transport', sub: 'carburant' },
  { re: /PARKING|INDIGO|EFFIA|VINCI PARK/, cat: 'transport', sub: 'parking' },
  { re: /PEAGE|AUTOROUTE|APRR|SANEF|VINCI AUTO/, cat: 'transport', sub: 'peage' },
  { re: /NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL\+?|AMAZON PRIME|APPLE\.COM|YOUTUBE|OCS/, cat: 'abonnements', sub: 'streaming' },
  { re: /FREE MOBILE|SFR|BOUYGUES|ORANGE|SOSH|PRIXTEL|RED BY/, cat: 'abonnements', sub: 'telecom' },
  { re: /GOOGLE STORAGE|ICLOUD|DROPBOX|ONEDRIVE/, cat: 'abonnements', sub: 'cloud' },
  { re: /FREE\b(?!.*MOBILE)|BBOX|LIVEBOX|BOX INTERNET/, cat: 'abonnements', sub: 'box_internet' },
  { re: /AMAZON(?! PRIME)|FNAC|DARTY|CDISCOUNT|ALIEXPRESS|TEMU/, cat: 'achats', sub: 'ecommerce' },
  { re: /ZALANDO|SHEIN|KIABI|H&M|ZARA|UNIQLO|DECATHLON/, cat: 'achats', sub: 'habillement' },
  { re: /IKEA|LEROY MERLIN|CASTORAMA|BRICO|MAISON/, cat: 'achats', sub: 'ameublement' },
  { re: /PAYPAL/, cat: 'achats', sub: 'ecommerce' },
  { re: /RESTAURANT|BRASSERIE|BISTROT|PIZZ/, cat: 'restauration', sub: 'restaurant' },
  { re: /DELIVEROO|UBER EATS|JUST EAT|GLOVO/, cat: 'restauration', sub: 'livraison' },
  { re: /MCDO|MCDONALD|BURGER KING|KFC|SUBWAY|QUICK/, cat: 'restauration', sub: 'fast_food' },
  { re: /PHARMACIE|PARAPHARMACIE/, cat: 'sante', sub: 'pharmacie' },
  { re: /DOCTOLIB|MEDECIN|DOCTEUR|DR\b|KINE|DENTISTE/, cat: 'sante', sub: 'medecin' },
  { re: /CINEMA|THEATRE|CONCERT|SPECTACLE|MUSEE/, cat: 'loisirs', sub: 'culture' },
  { re: /SPORT|FITNESS|SALLE|BASIC FIT|GYM/, cat: 'loisirs', sub: 'sport' },
  { re: /EPARGNE|LIVRET|PLACEMENT|ASSURANCE VIE/, cat: 'epargne', sub: 'livret' },
]

// ─── Categorization engine ──────────────────────────────────────────────────

function categorizeTx(tx, customRulesCompiled, learnedRules, aiCache) {
  const { label_norm, merchant_key } = tx

  // P1: Transfer
  if (tx.isTransfer) return { category: 'virement', subcategory: 'interne', confidence: 1.0, reason: 'Virement détecté', method: 'transfer_detected' }

  // P2: User learned
  if (merchant_key && learnedRules[merchant_key]) {
    const r = learnedRules[merchant_key]
    return { category: r.category, subcategory: r.subcategory || null, confidence: 0.95, reason: `Appris: ${merchant_key}`, method: 'user_learned' }
  }

  // P3: AI cached (<30 days)
  if (merchant_key && aiCache[merchant_key]) {
    const c = aiCache[merchant_key]
    const age = (Date.now() - new Date(c.cachedAt).getTime()) / 86400000
    if (age < 30) return { category: c.category, subcategory: c.subcategory || null, confidence: c.confidence || 0.75, reason: `IA: ${merchant_key}`, method: 'ai_cached' }
  }

  // P4: Custom regex
  for (const rule of customRulesCompiled) {
    if (rule.re.test(label_norm)) return { category: rule.category, subcategory: null, confidence: 0.85, reason: `Custom: ${rule.pattern}`, method: 'regex_custom' }
  }

  // P5: Strong regex
  for (const rule of STRONG_RULES) {
    if (rule.re.test(label_norm)) return { category: rule.cat, subcategory: rule.sub, confidence: 0.80, reason: `Forte: ${rule.re.source.slice(0, 25)}`, method: 'regex_strong' }
  }

  // P6: Default regex
  for (const rule of DEFAULT_RULES) {
    if (rule.re.test(label_norm)) return { category: rule.cat, subcategory: rule.sub, confidence: 0.70, reason: `Regex: ${rule.re.source.slice(0, 25)}`, method: 'regex_default' }
  }

  // P7: Revenue heuristic
  if (tx.amount > 0) return { category: 'revenus', subcategory: 'revenus_divers', confidence: 0.50, reason: 'Montant positif', method: 'revenue_heuristic' }

  // P8: Default
  return { category: 'autre', subcategory: null, confidence: 0.0, reason: 'Aucun match', method: 'default' }
}

// ─── Transfer detection (scored, O(n log n) via grouping) ───────────────────

const TRANSFER_LABEL_RE = /VIR(EMENT)?|SEPA|TRANSFERT|EPARGNE|LIVRET/i

function detectTransfersScored(transactions) {
  const flagged = []
  const groups = new Map()

  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].isTransfer) continue
    const key = Math.round(Math.abs(transactions[i].amount) * 100)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  }

  for (const [amtKey] of groups) {
    const candidateSet = new Set()
    for (const nk of [amtKey - 1, amtKey, amtKey + 1]) {
      const g = groups.get(nk)
      if (g) g.forEach(i => candidateSet.add(i))
    }
    const candidates = [...candidateSet]

    for (let i = 0; i < candidates.length; i++) {
      const a = transactions[candidates[i]]
      if (a.isTransfer) continue
      for (let j = i + 1; j < candidates.length; j++) {
        const b = transactions[candidates[j]]
        if (b.isTransfer) continue
        if (a.accountId === b.accountId || a.amount * b.amount >= 0) continue

        let score = 0
        const diff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount))
        if (diff === 0) score += 40; else if (diff <= 0.01) score += 35; else continue

        const days = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000
        if (days === 0) score += 30; else if (days <= 1) score += 20; else if (days <= 2) score += 10; else continue

        score += 20 // diff accounts + opposite signs (already checked)
        if (TRANSFER_LABEL_RE.test(a.label) || TRANSFER_LABEL_RE.test(b.label)) score += 10

        const mkA = a.merchant_key, mkB = b.merchant_key
        if (mkA && mkB && mkA === mkB) score -= 20

        if (score >= 70) {
          a.isTransfer = true; a.transferPairHash = b.hash; a.transferScore = score; a.category = 'virement'
          b.isTransfer = true; b.transferPairHash = a.hash; b.transferScore = score; b.category = 'virement'
        } else if (score >= 50) {
          flagged.push({ hashA: a.hash, hashB: b.hash, score, labelA: a.label, labelB: b.label })
        }
      }
    }
  }

  return flagged
}

// ─── Aggregation (single pass) ──────────────────────────────────────────────

function computeAll(transactions, accounts) {
  const months = {}
  const accountTotals = {}

  // Single pass over all transactions
  for (const tx of transactions) {
    // Account balance accumulation
    accountTotals[tx.accountId] = (accountTotals[tx.accountId] || 0) + tx.amount

    // Monthly aggregation (skip transfers)
    if (tx.isTransfer) continue
    const month = tx.date.slice(0, 7)
    if (!months[month]) months[month] = { month, income: 0, expenses: 0, savings: 0, savingsRate: 0 }
    if (tx.amount > 0) months[month].income += tx.amount
    else months[month].expenses += Math.abs(tx.amount)
  }

  const aggregates = Object.values(months).map(m => {
    m.savings = m.income - m.expenses
    m.savingsRate = m.income > 0 ? (m.savings / m.income) * 100 : 0
    return m
  }).sort((a, b) => a.month.localeCompare(b.month))

  // Health score
  let healthScore = 50
  if (aggregates.length > 0) {
    const last3 = aggregates.slice(-3)
    const avgRate = last3.reduce((s, m) => s + m.savingsRate, 0) / last3.length
    healthScore = Math.max(0, Math.min(100, Math.round(50 + avgRate)))
  }

  // Account balances
  const accountBalances = (accounts || []).map(acc => ({
    ...acc,
    balance: (acc.initialBalance || 0) + (accountTotals[acc.id] || 0),
    txCount: transactions.filter(t => t.accountId === acc.id).length,
  }))

  return { aggregates, healthScore, accountBalances }
}

// ─── Coach Insights (single pass optimized) ─────────────────────────────────

function generateInsights(transactions, aggregates) {
  const feesRe = /FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS|INTERETS DEBITEURS/i
  const fees = []
  let totalFees = 0
  const byCategory = {}
  const categoryCounts = {}
  const labelMonths = {}

  // Single pass
  for (const t of transactions) {
    if (t.isTransfer || t.amount >= 0) continue
    const absAmt = Math.abs(t.amount)

    if (feesRe.test(t.label)) { fees.push(t); totalFees += absAmt }

    byCategory[t.category] = (byCategory[t.category] || 0) + absAmt
    categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1

    const key = t.label.slice(0, 30).toUpperCase()
    const month = t.date.slice(0, 7)
    if (!labelMonths[key]) labelMonths[key] = { months: new Set(), total: 0, count: 0 }
    labelMonths[key].months.add(month)
    labelMonths[key].total += absAmt
    labelMonths[key].count++
  }

  const topExpenses = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([category, total]) => ({ category, total }))

  const recurring = Object.entries(labelMonths).filter(([, d]) => d.months.size >= 2)
    .map(([label, d]) => ({ label, monthsCount: d.months.size, avgAmount: d.total / d.months.size }))
    .sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 10)

  const anomalies = []
  for (const t of transactions) {
    if (t.isTransfer || t.amount >= 0) continue
    const avg = byCategory[t.category] / categoryCounts[t.category]
    if (avg && Math.abs(t.amount) > avg * 3 && Math.abs(t.amount) > 50) anomalies.push(t)
    if (anomalies.length >= 5) break
  }

  const recommendations = []
  if (totalFees > 10) recommendations.push(`Frais bancaires détectés : ${totalFees.toFixed(0)}€. Envisagez une banque en ligne sans frais.`)
  const lastAgg = aggregates[aggregates.length - 1]
  if (lastAgg && lastAgg.savingsRate < 10) recommendations.push("Taux d'épargne faible. Automatisez un virement épargne en début de mois.")
  if (recurring.length > 5) recommendations.push(`${recurring.length} abonnements récurrents détectés. Vérifiez ceux inutilisés.`)
  if (!recommendations.length) recommendations.push('Bon travail ! Vos finances semblent saines.')

  return { fees: { items: fees.slice(0, 10), total: totalFees }, topExpenses, recurring, anomalies, recommendations }
}

// ─── Low confidence finder ──────────────────────────────────────────────────

function findLowConfidence(transactions, threshold = 0.6) {
  const map = {}
  for (const tx of transactions) {
    if ((tx.confidence || 0) >= threshold || !tx.merchant_key) continue
    if (!map[tx.merchant_key]) map[tx.merchant_key] = { sample_labels: [], amount_sign: tx.amount >= 0 ? 'credit' : 'debit' }
    if (map[tx.merchant_key].sample_labels.length < 3) map[tx.merchant_key].sample_labels.push(tx.label)
  }
  return map
}

// ─── Message handler ────────────────────────────────────────────────────────

self.onmessage = function(e) {
  const { type } = e.data

  try {
    if (type === 'process' || type === 'categorize_only') {
      const { transactions: rawTxs, rules = [], learnedRules = {}, aiCache = {}, accounts = [] } = e.data

      // Pre-compile custom rules once
      const customRulesCompiled = rules.map(r => {
        try { return { ...r, re: new RegExp(r.pattern, 'i') } }
        catch { return null }
      }).filter(Boolean)

      // Enrich with derived fields (only new ones without label_norm)
      const txs = rawTxs.map(tx => {
        if (tx.label_norm) return tx
        return { ...tx, ...deriveFields(tx.label) }
      })

      // Detect transfers (mutates in place for perf)
      let flaggedTransfers = []
      if (type === 'process') {
        flaggedTransfers = detectTransfersScored(txs)
      }

      // Categorize (skip already-categorized transfers)
      for (const tx of txs) {
        if (tx.isTransfer && tx.category === 'virement') continue
        const result = categorizeTx(tx, customRulesCompiled, learnedRules, aiCache)
        tx.category = result.category
        tx.subcategory = result.subcategory
        tx.confidence = result.confidence
        tx.reason = result.reason
        tx.method = result.method
      }

      // Compute aggregates + balances in single pass
      const { aggregates, healthScore, accountBalances } = computeAll(txs, accounts)

      // Coach insights
      const insights = txs.length > 0 ? generateInsights(txs, aggregates) : null

      // Low confidence merchants
      const lowConfidence = findLowConfidence(txs)

      self.postMessage({
        type: 'result',
        transactions: txs,
        aggregates,
        healthScore,
        insights,
        accountBalances,
        flaggedTransfers,
        lowConfidence,
      })
    }

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
