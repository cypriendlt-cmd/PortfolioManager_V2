/**
 * POST /api/bank/coach/analyze — AI budget coach via Groq.
 * Rules-first: called only when local analysis is insufficient.
 */

const express = require('express')
const router  = express.Router()
const { generateWithFallback } = require('../services/ai')

const COACH_MODEL = 'llama-3.1-8b-instant'

const COACH_SYSTEM_PROMPT = `You are a French personal finance coach AI. You analyze household budgets and provide actionable recommendations.

VALID CATEGORIES for allocation_gap_analysis and recommendations:
essentiels | loisirs | abonnements | epargne | autre

PROFILE TYPES: prudent | equilibre | offensif

RECOMMENDED ALLOCATIONS (% of monthly income):
- prudent:    essentiels=50 abonnements=7  loisirs=13 epargne=20 autre=10
- equilibre:  essentiels=50 abonnements=8  loisirs=17 epargne=15 autre=10
- offensif:   essentiels=45 abonnements=7  loisirs=13 epargne=10 autre=25

SCORING RULES for financial_health_score (0-100):
- savings_rate ≥20%: +25pts | ≥10%: +15pts | ≥5%: +7pts | <5%: 0
- expense_ratio ≤60%: +20pts | ≤70%: +13pts | ≤80%: +8pts | ≤90%: +4pts
- income_stability (low CV): up to +15pts
- emergency_fund ≥6 months: +20pts | ≥3: +14pts | ≥1: +7pts
- active goals progress: up to +20pts

OUTPUT — STRICT JSON ONLY, no markdown, no comments, no text outside JSON:
{
  "financial_health_score": 0-100,
  "score_label": "Excellent|Bon|Correct|À améliorer|Fragile",
  "allocation_gap_analysis": {
    "current_allocation": { "essentiels": 0, "loisirs": 0, "abonnements": 0, "epargne": 0, "autre": 0 },
    "recommended_allocation": { "essentiels": 0, "loisirs": 0, "abonnements": 0, "epargne": 0, "autre": 0 },
    "main_deviations": [{ "bucket": "", "current_pct": 0, "recommended_pct": 0, "diff": 0, "severity": "high|medium|low" }]
  },
  "risk_flags": [{ "type": "", "severity": "high|medium|low", "message": "" }],
  "recommendations": [
    {
      "id": "rec_unique_id",
      "priority": "high|medium|low",
      "type": "reduce|increase|optimize",
      "category": "essentiels|loisirs|abonnements|epargne|autre",
      "categoryLabel": "",
      "color": "#hex",
      "action": "Texte actionnable en français (max 120 chars)",
      "estimated_monthly_impact": "±XX€/mois",
      "long_term_impact": "Impact annuel ou pluriannuel en français",
      "confidence": 0.5-0.95
    }
  ]
}

RULES:
- Max 5 recommendations, sorted by priority then confidence desc
- confidence: 0.50–0.95 (never 1.0)
- All text in French
- Numbers in euro (€), no dollar sign
- Do NOT repeat rules already applied by the user`

router.post('/analyze', async (req, res) => {
  try {
    const {
      monthly_income,
      expenses_by_category,
      savings_rate,
      investment_rate,
      goals,
      financial_health_score,
      profile_type,
      current_allocation,
      recent_months,
    } = req.body

    if (!monthly_income || monthly_income <= 0) {
      return res.status(400).json({ error: 'monthly_income requis et > 0' })
    }

    const prompt = `Analyse ce profil financier français et génère des recommandations :

PROFIL:
- Revenus mensuels: ${monthly_income}€
- Profil investisseur: ${profile_type || 'equilibre'}
- Taux d'épargne: ${savings_rate?.toFixed(1) || 0}%
- Score santé financier actuel: ${financial_health_score || 'non calculé'}

RÉPARTITION ACTUELLE (% des revenus):
${JSON.stringify(current_allocation || {}, null, 2)}

DÉPENSES PAR CATÉGORIE (€/mois, moyenne 3 mois):
${JSON.stringify(expenses_by_category || {}, null, 2)}

OBJECTIFS FINANCIERS:
${JSON.stringify(goals || [], null, 2)}

HISTORIQUE MENSUEL (3 derniers mois):
${JSON.stringify(recent_months || [], null, 2)}

Génère une analyse complète avec score, gaps, risques et recommandations actionnables.`

    const result = await generateWithFallback(prompt, {
      model:        COACH_MODEL,
      systemPrompt: COACH_SYSTEM_PROMPT,
      maxTokens:    900,
      temperature:  0.15,
    })

    if (!result.content) {
      return res.status(502).json({ error: 'Coach IA indisponible', details: result.error })
    }

    let parsed
    try {
      const clean = result.content.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      return res.status(502).json({ error: 'Coach IA: réponse JSON invalide' })
    }

    res.json({ ...parsed, provider: result.provider })
  } catch (err) {
    console.error('[Coach] Error:', err.message)
    res.status(500).json({ error: 'Erreur interne coach' })
  }
})

module.exports = router
