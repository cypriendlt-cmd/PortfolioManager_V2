/**
 * Budget Coach Engine — rules-first recommendations + behavior learning.
 * Groq is called only when rule-based analysis is insufficient.
 */

import { MACRO_BUCKETS } from './allocationEngine'

// ─── Rule-based recommendations ─────────────────────────────────────────────

/**
 * Generate recommendations from local rules (no API call).
 * @param {{ currentBuckets, allocationGaps, aggregates, financialGoals, coachHistory }} params
 * @returns {{ recommendations, riskFlags }}
 */
export function generateRuleBasedRecommendations({ currentBuckets = {}, allocationGaps = [], aggregates = [], financialGoals = [], coachHistory = [] }) {
  const recommendations = []
  const riskFlags       = []
  const ignoredIds      = new Set((coachHistory || []).filter(h => h.action === 'ignored').map(h => h.recommendationId))

  const last3     = aggregates.slice(-3)
  const avgIncome = last3.length > 0 ? last3.reduce((s, m) => s + m.income,   0) / last3.length : 0

  // ── Savings rate decline ──────────────────────────────────────────────────
  if (last3.length >= 2) {
    const trend = last3[last3.length - 1].savingsRate - last3[0].savingsRate
    if (trend < -5) {
      riskFlags.push({ type: 'savings_decline', severity: 'high',
        message: `Taux d'épargne en baisse de ${Math.abs(trend).toFixed(1)}% sur 3 mois` })
    }
  }

  // ── Budget drift per bucket ───────────────────────────────────────────────
  for (const gap of allocationGaps) {
    const rid = `rec_reduce_${gap.bucket}`
    if (ignoredIds.has(rid)) continue

    if (gap.diff > 0 && gap.severity !== 'low') {
      const annualSaving = gap.monthlyImpact * 12
      recommendations.push({
        id:                       rid,
        priority:                 gap.severity === 'high' ? 'high' : 'medium',
        type:                     'reduce',
        category:                 gap.bucket,
        categoryLabel:            gap.label,
        color:                    gap.color,
        action:                   `Réduire "${gap.label}" de ${gap.diff.toFixed(1)}% — soit −${gap.monthlyImpact}€/mois`,
        estimated_monthly_impact: `−${gap.monthlyImpact}€/mois`,
        long_term_impact:         `Économie de ${annualSaving}€/an, réorientable vers l'épargne`,
        confidence:               gap.severity === 'high' ? 0.90 : 0.75,
      })
    }

    if (gap.diff < -3 && gap.bucket === 'epargne') {
      const rid2 = 'rec_increase_savings'
      if (!ignoredIds.has(rid2)) {
        recommendations.push({
          id:                       rid2,
          priority:                 'high',
          type:                     'increase',
          category:                 'epargne',
          categoryLabel:            'Épargne',
          color:                    MACRO_BUCKETS.epargne.color,
          action:                   `Augmenter l'épargne de ${gap.monthlyImpact}€/mois pour atteindre l'objectif (${gap.recommended}% des revenus)`,
          estimated_monthly_impact: `+${gap.monthlyImpact}€/mois épargné`,
          long_term_impact:         `${(gap.monthlyImpact * 12).toFixed(0)}€ de plus par an`,
          confidence:               0.88,
        })
      }
    }
  }

  // ── Subscriptions audit ───────────────────────────────────────────────────
  const subscBucket = currentBuckets.abonnements
  if (subscBucket && avgIncome > 0 && subscBucket.amount > avgIncome * 0.12) {
    const rid = 'rec_subscriptions'
    if (!ignoredIds.has(rid)) {
      riskFlags.push({ type: 'subscriptions_high', severity: 'medium',
        message: `Abonnements élevés: ${subscBucket.amount}€/mois (${subscBucket.pct}% des revenus)` })
      recommendations.push({
        id:                       rid,
        priority:                 'medium',
        type:                     'optimize',
        category:                 'abonnements',
        categoryLabel:            'Abonnements',
        color:                    MACRO_BUCKETS.abonnements.color,
        action:                   'Auditer les abonnements et résilier ceux peu utilisés',
        estimated_monthly_impact: `Potentiellement −${Math.round(subscBucket.amount * 0.20)}€/mois`,
        long_term_impact:         `Jusqu'à ${Math.round(subscBucket.amount * 0.20 * 12)}€ économisés par an`,
        confidence:               0.70,
      })
    }
  }

  // ── Emergency fund check ──────────────────────────────────────────────────
  const emergGoal   = financialGoals.find(g => g.type === 'emergency_fund')
  const avgExpenses = last3.length > 0 ? last3.reduce((s, m) => s + m.expenses, 0) / last3.length : 0
  if (emergGoal && avgExpenses > 0) {
    const covered = emergGoal.currentAmount / avgExpenses
    if (covered < 3) {
      const rid = 'rec_emergency_fund'
      if (!ignoredIds.has(rid)) {
        riskFlags.push({ type: 'emergency_low', severity: 'high',
          message: `Fonds d'urgence insuffisant: ${covered.toFixed(1)} mois de dépenses couverts (objectif: 6)` })
        recommendations.push({
          id:                       rid,
          priority:                 'high',
          type:                     'increase',
          category:                 'epargne',
          categoryLabel:            "Fonds d'urgence",
          color:                    '#22c55e',
          action:                   `Constituer un fonds d'urgence de ${Math.round(avgExpenses * 6)}€ (6 mois de dépenses)`,
          estimated_monthly_impact: `+${emergGoal.monthlyContribution || Math.round(avgExpenses * 0.10)}€/mois`,
          long_term_impact:         `Sécurité financière en cas d'imprévu`,
          confidence:               0.95,
        })
      }
    }
  }

  // Sort: high > medium > low, then confidence desc
  const order = { high: 0, medium: 1, low: 2 }
  recommendations.sort((a, b) => (order[a.priority] - order[b.priority]) || (b.confidence - a.confidence))

  return { recommendations, riskFlags }
}

// ─── Behavior learning ───────────────────────────────────────────────────────

export function recordCoachAction(coachHistory, action, recommendation) {
  const event = {
    id:               `ch_${Date.now()}`,
    date:             new Date().toISOString(),
    action,                   // 'applied' | 'ignored' | 'adjusted'
    recommendationId: recommendation.id,
    recommendation,
  }
  return [...(coachHistory || []), event].slice(-200)
}

/**
 * Compute per-category weights from history (for future re-prioritization).
 */
export function computeBehaviorWeights(coachHistory) {
  const weights = {}
  for (const event of (coachHistory || [])) {
    const cat = event.recommendation?.category
    if (!cat) continue
    if (!weights[cat]) weights[cat] = { applied: 0, ignored: 0 }
    if (event.action === 'applied')  weights[cat].applied++
    if (event.action === 'ignored')  weights[cat].ignored++
  }
  return weights
}
