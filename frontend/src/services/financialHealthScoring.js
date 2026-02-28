/**
 * Financial Health Scoring — 5-dimension score (0–100).
 * Replaces the basic savings-rate health score from bankWorker.
 *
 * Dimensions:
 *  1. Savings rate       (0–25 pts)
 *  2. Expense ratio      (0–20 pts)
 *  3. Income stability   (0–15 pts)
 *  4. Emergency fund     (0–20 pts)
 *  5. Goal progression   (0–20 pts)
 */

/**
 * @param {Object} p
 * @param {Array}  p.aggregates       – monthly aggregates (need ≥3)
 * @param {number} p.totalCash        – total liquid cash across accounts
 * @param {Array}  p.financialGoals   – [{ type, targetAmount, currentAmount }]
 * @returns {{ score, breakdown, grade, color, label }}
 */
export function computeFinancialHealthScore({ aggregates = [], totalCash = 0, financialGoals = [] }) {
  const last6 = aggregates.slice(-6)
  const last3 = last6.slice(-3)
  let score = 0
  const breakdown = {}

  // ── 1. Savings rate (0–25 pts) ─────────────────────────────────────────
  const avgSavingsRate = last3.length > 0
    ? last3.reduce((s, m) => s + m.savingsRate, 0) / last3.length
    : 0
  const savingsPts = avgSavingsRate >= 25 ? 25
    : avgSavingsRate >= 20 ? 22
    : avgSavingsRate >= 15 ? 17
    : avgSavingsRate >= 10 ? 12
    : avgSavingsRate >= 5  ?  7
    : 0
  breakdown.savings = { pts: savingsPts, max: 25, value: Math.round(avgSavingsRate), label: "Taux d'épargne" }
  score += savingsPts

  // ── 2. Expense ratio (0–20 pts) ────────────────────────────────────────
  const avgIncome   = last3.length > 0 ? last3.reduce((s, m) => s + m.income,   0) / last3.length : 0
  const avgExpenses = last3.length > 0 ? last3.reduce((s, m) => s + m.expenses, 0) / last3.length : 0
  const expenseRatio = avgIncome > 0 ? avgExpenses / avgIncome : 1
  const expensePts = expenseRatio <= 0.50 ? 20
    : expenseRatio <= 0.60 ? 17
    : expenseRatio <= 0.70 ? 13
    : expenseRatio <= 0.80 ?  8
    : expenseRatio <= 0.90 ?  4
    : 0
  breakdown.expenses = { pts: expensePts, max: 20, value: Math.round(expenseRatio * 100), label: 'Ratio dépenses/revenus' }
  score += expensePts

  // ── 3. Income stability (0–15 pts) ─────────────────────────────────────
  if (last6.length >= 3) {
    const incomes  = last6.map(m => m.income)
    const avg      = incomes.reduce((s, v) => s + v, 0) / incomes.length
    const variance = incomes.reduce((s, v) => s + (v - avg) ** 2, 0) / incomes.length
    const cv       = avg > 0 ? Math.sqrt(variance) / avg : 1   // coefficient of variation
    const stabilityPts = cv <= 0.05 ? 15 : cv <= 0.10 ? 12 : cv <= 0.20 ? 8 : cv <= 0.35 ? 4 : 0
    breakdown.stability = { pts: stabilityPts, max: 15, value: Math.round((1 - Math.min(cv, 1)) * 100), label: 'Stabilité revenus' }
    score += stabilityPts
  } else {
    breakdown.stability = { pts: 7, max: 15, value: 50, label: 'Stabilité revenus' }
    score += 7
  }

  // ── 4. Emergency fund coverage (0–20 pts) ──────────────────────────────
  const emergencyGoal = financialGoals.find(g => g.type === 'emergency_fund')
  let emergencyMonths = 0
  if (emergencyGoal && avgExpenses > 0) {
    emergencyMonths = emergencyGoal.currentAmount / avgExpenses
  } else if (totalCash > 0 && avgExpenses > 0) {
    emergencyMonths = totalCash / avgExpenses
  }
  const emergencyPts = emergencyMonths >= 6 ? 20
    : emergencyMonths >= 3 ? 14
    : emergencyMonths >= 1 ?  7
    : 0
  breakdown.emergency = { pts: emergencyPts, max: 20, value: Math.round(emergencyMonths * 10) / 10, label: "Fonds d'urgence (mois)" }
  score += emergencyPts

  // ── 5. Goal progression (0–20 pts) ─────────────────────────────────────
  const activeGoals = financialGoals.filter(g => g.type !== 'emergency_fund' && g.targetAmount > 0)
  let goalPts = 5   // neutral if no goals
  if (activeGoals.length > 0) {
    const avgProgress = activeGoals.reduce((s, g) => s + Math.min(1, (g.currentAmount || 0) / g.targetAmount), 0) / activeGoals.length
    goalPts = Math.round(avgProgress * 20)
  }
  breakdown.goals = { pts: goalPts, max: 20, value: activeGoals.length, label: 'Objectifs actifs' }
  score += goalPts

  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  const grade = finalScore >= 80 ? 'A' : finalScore >= 65 ? 'B' : finalScore >= 50 ? 'C' : finalScore >= 35 ? 'D' : 'F'
  const color = finalScore >= 70 ? '#22c55e' : finalScore >= 45 ? '#f59e0b' : '#ef4444'
  const label = finalScore >= 80 ? 'Excellent' : finalScore >= 65 ? 'Bon' : finalScore >= 50 ? 'Correct' : finalScore >= 35 ? 'À améliorer' : 'Fragile'

  return { score: finalScore, breakdown, grade, color, label }
}
