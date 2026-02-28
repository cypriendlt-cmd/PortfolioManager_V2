/**
 * Goal Projection Engine — compound-interest projections for financial goals.
 */

export const GOAL_TYPES = {
  emergency_fund: { label: "Fonds d'urgence",         color: '#22c55e', icon: 'Shield' },
  investment:     { label: 'Investissement',           color: '#3b82f6', icon: 'TrendingUp' },
  real_estate:    { label: 'Achat immobilier',         color: '#f59e0b', icon: 'Building' },
  freedom:        { label: 'Liberté financière',       color: '#8b5cf6', icon: 'Sunrise' },
  other:          { label: 'Autre objectif',           color: '#94a3b8', icon: 'Target' },
}

// Annual rates used for compound-interest goals
const ANNUAL_RATES = { emergency_fund: 0.02, investment: 0.07, real_estate: 0.04, freedom: 0.06, other: 0.03 }

/**
 * Project when a goal will be reached.
 * Uses compound interest for investment/real_estate/freedom, simple accumulation otherwise.
 *
 * @param {Object} goal – { type, targetAmount, currentAmount, monthlyContribution }
 * @returns {{ monthsToReach, projectedDate, progressPct, projectedAmount }}
 */
export function projectGoal(goal) {
  const { type, targetAmount = 0, currentAmount = 0, monthlyContribution = 0 } = goal
  const remaining   = targetAmount - currentAmount
  const progressPct = targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 1000) / 10) : 0

  if (remaining <= 0) {
    return { monthsToReach: 0, projectedDate: new Date().toISOString().slice(0, 7), progressPct: 100, projectedAmount: currentAmount }
  }
  if (!monthlyContribution || monthlyContribution <= 0) {
    return { monthsToReach: null, projectedDate: null, progressPct, projectedAmount: currentAmount }
  }

  const useCompound   = ['investment', 'real_estate', 'freedom'].includes(type)
  const annualRate    = ANNUAL_RATES[type] || 0.03
  let   monthsToReach = 0

  if (useCompound && annualRate > 0) {
    const r  = annualRate / 12
    // Binary search: find n where FV = PV*(1+r)^n + PMT*((1+r)^n-1)/r >= target
    let lo = 0, hi = 600
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      const fv  = currentAmount * (1 + r) ** mid + monthlyContribution * ((1 + r) ** mid - 1) / r
      if (fv >= targetAmount) hi = mid; else lo = mid
    }
    monthsToReach = hi
  } else {
    monthsToReach = Math.ceil(remaining / monthlyContribution)
  }

  const projDate = new Date()
  projDate.setMonth(projDate.getMonth() + monthsToReach)

  return {
    monthsToReach,
    projectedDate:   projDate.toISOString().slice(0, 7),
    progressPct,
    projectedAmount: Math.round(currentAmount + monthlyContribution * monthsToReach),
  }
}

/**
 * Generate sensible default goals from financial context.
 */
export function getDefaultGoals(avgMonthlyExpenses, totalCash) {
  const now = new Date().toISOString()
  return [
    {
      id:                  `goal_emergency_${Date.now()}`,
      type:                'emergency_fund',
      label:               "Fonds d'urgence (6 mois)",
      targetAmount:        Math.round(avgMonthlyExpenses * 6 / 100) * 100 || 9000,
      currentAmount:       Math.max(0, totalCash),
      monthlyContribution: Math.round((avgMonthlyExpenses * 0.10) / 50) * 50 || 200,
      createdAt:           now,
    },
  ]
}

/**
 * Format months-to-reach into a human string.
 */
export function fmtMonths(months) {
  if (months === null || months === undefined) return '—'
  if (months <= 0)  return 'Atteint !'
  if (months < 12)  return `${months} mois`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m > 0 ? `${y} an${y > 1 ? 's' : ''} ${m} mois` : `${y} an${y > 1 ? 's' : ''}`
}
