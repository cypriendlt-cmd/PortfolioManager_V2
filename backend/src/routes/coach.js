/**
 * POST /api/bank/coach/analyze — AI budget coach via Groq.
 * Rules-first: called only when local analysis is insufficient.
 */

const express = require('express')
const router  = express.Router()
const { generateWithFallback } = require('../services/ai')

const COACH_MODEL = 'llama-3.1-8b-instant'

// Compact system prompt — ~80 tokens, strict JSON schema
const COACH_SYSTEM_PROMPT = `French personal finance coach. Output STRICT JSON only — no markdown, no text outside JSON.
Categories: essentiels|loisirs|abonnements|epargne|autre
Colors: essentiels=#ef4444 loisirs=#f59e0b abonnements=#8b5cf6 epargne=#10b981 autre=#94a3b8
JSON schema:
{"risk_flags":[{"type":"","severity":"high|medium|low","message":""}],"recommendations":[{"id":"","priority":"high|medium|low","type":"reduce|increase|optimize","category":"","categoryLabel":"","color":"#hex","action":"max 100 chars FR","estimated_monthly_impact":"±X€/mois","long_term_impact":"FR","confidence":0.7}]}
Rules: max 3 recs, confidence 0.5-0.95, all text French, € not $`

router.post('/analyze', async (req, res) => {
  try {
    const {
      monthly_income,
      expenses_by_category,
      savings_rate,
      goals,
      financial_health_score,
      profile_type,
      current_allocation,
      recent_months,
    } = req.body

    if (!monthly_income || monthly_income <= 0) {
      return res.status(400).json({ error: 'monthly_income requis et > 0' })
    }

    // Compact allocations as single line
    const allocLine = Object.entries(current_allocation || {})
      .map(([k, v]) => `${k}=${v}%`).join(' ')

    // Top 5 expense categories only
    const topExp = Object.entries(expenses_by_category || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `${k}:${v}€`).join(' ')

    const recentLine = (recent_months || []).slice(-3)
      .map(m => `${m.month} rev:${m.income}€ dep:${m.expenses}€ ép:${m.savingsRate?.toFixed(0) || 0}%`).join(' | ')

    const goalLine = (goals || []).slice(0, 3)
      .map(g => `${g.label}:${g.currentAmount}/${g.targetAmount}€`).join(', ')

    const prompt = `Budget FR — profil:${profile_type || 'equilibre'} rev:${monthly_income}€ épargne:${(savings_rate || 0).toFixed(1)}% score:${financial_health_score || '?'}
Répartition actuelle(%rev): ${allocLine}
Top dépenses: ${topExp}
Historique: ${recentLine}
Objectifs: ${goalLine || 'aucun'}
→ 3 recommandations actionnables JSON.`

    const result = await generateWithFallback(prompt, {
      model:        COACH_MODEL,
      systemPrompt: COACH_SYSTEM_PROMPT,
      maxTokens:    500,
      temperature:  0.10,
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
