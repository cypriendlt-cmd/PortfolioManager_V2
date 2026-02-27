/**
 * POST /api/bank/categorize
 * AI-powered merchant categorization using generateWithFallback.
 */

const express = require('express');
const router = express.Router();
const { generateWithFallback } = require('../services/ai');

const VALID_CATEGORIES = [
  'revenus', 'loyer', 'alimentation', 'transport', 'abonnements',
  'achats', 'restauration', 'sante', 'loisirs', 'frais_bancaires',
  'epargne', 'impots', 'virement', 'autre',
];

router.post('/categorize', async (req, res) => {
  try {
    const { merchants } = req.body;
    if (!Array.isArray(merchants) || merchants.length === 0 || merchants.length > 20) {
      return res.status(400).json({ error: 'merchants must be an array of 1-20 items' });
    }

    const merchantList = merchants
      .map((m, i) => `${i + 1}. ${m.merchant_key} (exemples: ${(m.sample_labels || []).slice(0, 2).join(', ')}) [${m.amount_sign === 1 ? 'revenu' : 'depense'}]`)
      .join('\n');

    const prompt = `Catégorise ces marchands:
${merchantList}`;

    const systemPrompt = `Tu es un expert en catégorisation de transactions bancaires françaises.
Catégorise chaque marchand dans UNE des catégories suivantes: ${VALID_CATEGORIES.join(', ')}.
Réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire:
[{"merchant_key":"...","category":"...","subcategory":"...","confidence":0.8}]
confidence entre 0.5 et 0.95. Ne dépasse jamais 0.95.`;

    const result = await generateWithFallback(prompt, {
      systemPrompt,
      maxTokens: 1000,
      temperature: 0.1,
    });

    if (!result.content) {
      return res.status(502).json({ error: 'AI unavailable', details: result.error });
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const clean = result.content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: 'AI returned invalid JSON' });
    }

    if (!Array.isArray(parsed)) {
      return res.status(502).json({ error: 'AI returned non-array' });
    }

    // Validate and sanitize
    const results = parsed
      .filter(item => item.merchant_key && VALID_CATEGORIES.includes(item.category))
      .map(item => ({
        merchant_key: String(item.merchant_key),
        category: item.category,
        subcategory: item.subcategory || null,
        confidence: typeof item.confidence === 'number'
          ? Math.min(0.95, Math.max(0.5, item.confidence))
          : 0.7,
      }));

    res.json({ results, provider: result.provider });
  } catch (err) {
    console.error('[Categorize] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
