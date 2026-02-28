/**
 * Financial Health Score — moteur déterministe 0-100.
 *
 * 5 sous-scores pondérés :
 *   A. Savings & Investing Rate      30 %
 *   B. Essential Expenses Pressure   20 %
 *   C. Fixed Costs / Recurring Burden 20 %
 *   D. Cash Buffer / Emergency Fund   20 %
 *   E. Income Stability               10 %
 *
 * Propriétés garanties :
 *  - Déterministe (mêmes entrées → même sortie)
 *  - Monotone : augmenter savings_rate ne baisse jamais le score
 *  - Sans appel réseau, sans LLM
 *  - Clamp strict 0..100
 *  - Gestion income=0, données manquantes, outliers (winsorization)
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Interpolation linéaire entre deux points, clampée aux bornes. */
function ramp(x, x0, y0, x1, y1) {
  if (x <= x0) return y0
  if (x >= x1) return y1
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
}

/** Ramp multi-segments : [[x, score], ...] triés par x croissant. */
function multiRamp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return ramp(x, pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1])
  }
  return pts[pts.length - 1][1]
}

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)) }

/** Winsorize : remplace les valeurs extrêmes par le percentile p bas/haut. */
function winsorize(arr, p = 0.1) {
  if (arr.length < 4) return arr
  const sorted = [...arr].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * p)]
  const hi = sorted[Math.floor(sorted.length * (1 - p))]
  return arr.map(v => Math.max(lo, Math.min(hi, v)))
}

function mean(arr) { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0 }
function stdDev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

// ─── Reason codes ────────────────────────────────────────────────────────────

export const REASON_CODES = {
  // Négatifs
  VERY_LOW_SAVINGS:      { severity: 'high',   label: "Taux d'épargne très faible (< 5 %)" },
  LOW_SAVINGS:           { severity: 'medium', label: "Taux d'épargne insuffisant (< 10 %)" },
  HIGH_ESSENTIAL_RATIO:  { severity: 'high',   label: 'Dépenses essentielles excessives (> 65 % des revenus)' },
  MODERATE_ESSENTIAL:    { severity: 'low',    label: 'Dépenses essentielles élevées (55–65 %)' },
  HIGH_FIXED_COSTS:      { severity: 'high',   label: 'Charges fixes trop lourdes (> 45 %)' },
  MODERATE_FIXED_COSTS:  { severity: 'medium', label: 'Charges fixes à surveiller (35–45 %)' },
  NO_BUFFER:             { severity: 'high',   label: "Pas de fonds d'urgence (< 1 mois)" },
  LOW_BUFFER:            { severity: 'medium', label: "Fonds d'urgence insuffisant (< 3 mois)" },
  INCOME_UNSTABLE:       { severity: 'medium', label: 'Revenus instables (variabilité > 25 %)' },
  NO_INCOME_DATA:        { severity: 'low',    label: 'Données insuffisantes pour le calcul complet' },
  // Positifs
  GOOD_SAVINGS:          { severity: 'ok',     label: 'Bon taux d\'épargne (≥ 20 %)' },
  GOOD_BUFFER:           { severity: 'ok',     label: 'Fonds d\'urgence solide (≥ 6 mois)' },
  STABLE_INCOME:         { severity: 'ok',     label: 'Revenus stables' },
}

// ─── Sous-scores ─────────────────────────────────────────────────────────────

/**
 * A. Savings & Investing Rate (30 %)
 * metric = (savings_contrib + investments) / income  [0..1+]
 * Ramp: 0%→0  5%→20  10%→45  20%→80  30%→100
 */
function scoreA_savings(savingsContribRate, investRate) {
  const rate = clamp((savingsContribRate + investRate) * 100, 0, 60)
  return multiRamp(rate, [[0,0],[5,20],[10,45],[20,80],[30,100]])
}

/**
 * B. Essential Expenses Pressure (20 %)
 * metric = essential_expenses / income  [0..1+]
 * Ramp inverted: 0%→100  40%→100  55%→65  65%→25  75%→0
 */
function scoreB_essential(essentialRatio) {
  const pct = clamp(essentialRatio * 100, 0, 100)
  return multiRamp(pct, [[0,100],[40,100],[55,65],[65,25],[75,0]])
}

/**
 * C. Fixed Costs / Recurring Burden (20 %)
 * metric = recurring_expenses / income  [0..1+]
 * Ramp inverted: 0%→100  20%→100  35%→68  45%→30  55%→0
 */
function scoreC_fixed(fixedRatio) {
  const pct = clamp(fixedRatio * 100, 0, 80)
  return multiRamp(pct, [[0,100],[20,100],[35,68],[45,30],[55,0]])
}

/**
 * D. Cash Buffer / Emergency Fund (20 %)
 * metric = buffer_months
 * Ramp: 0→0  1→30  3→65  6→100
 */
function scoreD_buffer(bufferMonths) {
  const m = clamp(bufferMonths, 0, 12)
  return multiRamp(m, [[0,0],[1,30],[3,65],[6,100]])
}

/**
 * E. Stability (10 %)
 * metric = coefficient de variation (stdDev/mean) des revenus 6 derniers mois
 * CV winsorisé. Ramp inverted: 0%→100  10%→85  25%→60  40%→30  60%→0
 */
function scoreE_stability(incomeHistory) {
  if (!incomeHistory || incomeHistory.length < 3) return 60  // neutral
  const clean = winsorize(incomeHistory.filter(v => v > 0))
  const m     = mean(clean)
  if (m <= 0) return 30
  const cv    = clamp((stdDev(clean) / m) * 100, 0, 100)
  return multiRamp(cv, [[0,100],[10,85],[25,60],[40,30],[60,0]])
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * @param {Object} snapshot
 * @param {Array}  snapshot.aggregates            – monthly aggs (need ≥1)
 * @param {number} snapshot.totalCash             – trésorerie totale
 * @param {Array}  snapshot.financialGoals        – objectifs (pour fonds urgence)
 * @param {Object} snapshot.avgByCategory         – dépenses moy/mois par catégorie TAXONOMY
 * @param {number} [snapshot.avgRecurring]        – abonnements+charges fixes moy/mois
 * @param {number} [snapshot.avgInvestments]      – investissements moy/mois (portfolio)
 *
 * @returns {{ score, subscores, reasons, metrics, grade, color, label }}
 */
export function computeFinancialHealthScore({
  aggregates     = [],
  totalCash      = 0,
  financialGoals = [],
  avgByCategory  = {},
  avgRecurring   = 0,
  avgInvestments = 0,
}) {
  const last6 = aggregates.slice(-6)
  const last3 = last6.slice(-3)

  // ── Métriques de base ────────────────────────────────────────────────────
  const avgIncome   = mean(last3.map(m => m.income))
  const avgExpenses = mean(last3.map(m => m.expenses))
  const noIncome    = avgIncome <= 0

  // Épargne (catégorie 'epargne' dans les dépenses = versements sur livrets)
  const avgSavingsContrib = avgByCategory['epargne'] || 0

  // Dépenses essentielles : loyer + alimentation + transport + santé + impôts
  const ESSENTIAL_CATS = ['loyer', 'alimentation', 'transport', 'sante', 'impots']
  const avgEssential = ESSENTIAL_CATS.reduce((s, c) => s + (avgByCategory[c] || 0), 0)

  // Charges fixes récurrentes (passées en paramètre ou recalculées via abonnements)
  const avgFixed = avgRecurring > 0 ? avgRecurring : (avgByCategory['abonnements'] || 0)

  // Fonds d'urgence : priorité à l'objectif dédié, sinon totalCash
  const emergGoal    = financialGoals.find(g => g.type === 'emergency_fund')
  const bufferAmount = emergGoal ? (emergGoal.currentAmount || 0) : totalCash
  const bufferMonths = avgExpenses > 0 ? bufferAmount / avgExpenses : 0

  // Taux (en fraction, non %)
  const savingsContribRate = noIncome ? 0 : avgSavingsContrib / avgIncome
  const investRate         = noIncome ? 0 : avgInvestments    / avgIncome
  const essentialRatio     = noIncome ? 0 : avgEssential      / avgIncome
  const fixedRatio         = noIncome ? 0 : avgFixed          / avgIncome

  const incomeHistory = last6.map(m => m.income)

  const metrics = {
    avgIncome:         Math.round(avgIncome),
    avgExpenses:       Math.round(avgExpenses),
    avgEssential:      Math.round(avgEssential),
    avgFixed:          Math.round(avgFixed),
    avgSavingsContrib: Math.round(avgSavingsContrib),
    bufferMonths:      Math.round(bufferMonths * 10) / 10,
    savingsInvestRate: Math.round((savingsContribRate + investRate) * 1000) / 10,  // %
    essentialRatioPct: Math.round(essentialRatio * 1000) / 10,
    fixedRatioPct:     Math.round(fixedRatio     * 1000) / 10,
  }

  // ── Sous-scores ──────────────────────────────────────────────────────────
  const sA = Math.round(scoreA_savings(savingsContribRate, investRate))
  const sB = Math.round(scoreB_essential(essentialRatio))
  const sC = Math.round(scoreC_fixed(fixedRatio))
  const sD = Math.round(scoreD_buffer(bufferMonths))
  const sE = Math.round(scoreE_stability(incomeHistory))

  // Pénalité douce si income=0 : on conserve B,C à 50 (neutre) + sD,sE
  const [bFinal, cFinal] = noIncome ? [50, 50] : [sB, sC]

  const raw = sA * 0.30 + bFinal * 0.20 + cFinal * 0.20 + sD * 0.20 + sE * 0.10
  const score = clamp(Math.round(raw), 0, 100)

  const subscores = {
    savings:   { score: sA,      weight: 30, label: "Épargne & Investissement",   pts: Math.round(sA  * 0.30) },
    essential: { score: bFinal,  weight: 20, label: "Dépenses essentielles",       pts: Math.round(bFinal * 0.20) },
    fixed:     { score: cFinal,  weight: 20, label: "Charges fixes",               pts: Math.round(cFinal * 0.20) },
    buffer:    { score: sD,      weight: 20, label: "Fonds d'urgence",             pts: Math.round(sD  * 0.20) },
    stability: { score: sE,      weight: 10, label: "Stabilité des revenus",       pts: Math.round(sE  * 0.10) },
  }

  // ── Reason codes ─────────────────────────────────────────────────────────
  const reasons = []
  const addReason = (code, details = '') => {
    const def = REASON_CODES[code]
    if (def) reasons.push({ code, severity: def.severity, label: def.label, details })
  }

  if (noIncome || last3.length === 0) addReason('NO_INCOME_DATA')

  const sri = metrics.savingsInvestRate
  if (sri < 5)       addReason('VERY_LOW_SAVINGS', `${sri.toFixed(1)} % des revenus`)
  else if (sri < 10) addReason('LOW_SAVINGS',      `${sri.toFixed(1)} % des revenus`)
  else if (sri >= 20) addReason('GOOD_SAVINGS',    `${sri.toFixed(1)} % des revenus`)

  const er = metrics.essentialRatioPct
  if (er > 65)      addReason('HIGH_ESSENTIAL_RATIO', `${er.toFixed(1)} % des revenus`)
  else if (er > 55) addReason('MODERATE_ESSENTIAL',   `${er.toFixed(1)} % des revenus`)

  const fr = metrics.fixedRatioPct
  if (fr > 45)      addReason('HIGH_FIXED_COSTS',     `${fr.toFixed(1)} % des revenus`)
  else if (fr > 35) addReason('MODERATE_FIXED_COSTS', `${fr.toFixed(1)} % des revenus`)

  if (bufferMonths < 1)      addReason('NO_BUFFER',  `${bufferMonths.toFixed(1)} mois`)
  else if (bufferMonths < 3) addReason('LOW_BUFFER', `${bufferMonths.toFixed(1)} mois`)
  else if (bufferMonths >= 6) addReason('GOOD_BUFFER', `${bufferMonths.toFixed(1)} mois`)

  const cvPct = incomeHistory.length >= 3
    ? (stdDev(winsorize(incomeHistory.filter(v => v > 0))) / (mean(incomeHistory.filter(v => v > 0)) || 1)) * 100
    : 0
  if (cvPct > 25)      addReason('INCOME_UNSTABLE', `CV = ${cvPct.toFixed(0)} %`)
  else if (last6.length >= 3) addReason('STABLE_INCOME', `CV = ${cvPct.toFixed(0)} %`)

  // Sort: négatifs en premier (high → medium → low → ok)
  const order = { high: 0, medium: 1, low: 2, ok: 3 }
  reasons.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F'
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Bon' : score >= 50 ? 'Correct' : score >= 35 ? 'À améliorer' : 'Fragile'

  return { score, subscores, reasons, metrics, grade, color, label }
}
