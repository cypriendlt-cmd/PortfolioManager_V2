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

/**
 * POST /api/bank/categorize-lines
 * AI-powered categorization of individual transaction lines.
 * Accepts raw lines (hash + label + amount + date), returns per-hash proposals.
 */
router.post('/categorize-lines', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0 || transactions.length > 50) {
      return res.status(400).json({ error: 'transactions must be an array of 1-50 items' });
    }

    const txList = transactions
      .map((t, i) => `${i + 1}. [${t.date || '?'}] ${t.label} (${t.amount >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)}€)`)
      .join('\n');

    const prompt = `Analyse ces transactions bancaires françaises:\n${txList}`;

    const systemPrompt = `Tu es un expert en catégorisation de transactions bancaires françaises.
Pour chaque transaction:
1. Extrais le NOM DU MARCHAND ou de l'organisme (ex: "ALDI", "NETFLIX", "DGFIP") — ignore les codes, numéros de carte et références bancaires.
2. Catégorise dans UNE des catégories: ${VALID_CATEGORIES.join(', ')}.
3. Utilise le libellé ET le montant (+= revenu, -= dépense) pour décider.

Réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire:
[{"index":1,"merchant_name":"ALDI","category":"alimentation","subcategory":"supermarche","confidence":0.90}]
merchant_name: nom court et propre du marchand (1-3 mots max, en majuscules).
confidence entre 0.5 et 0.95. Ne dépasse jamais 0.95.`;

    const result = await generateWithFallback(prompt, {
      systemPrompt,
      maxTokens: 2000,
      temperature: 0.1,
    });

    if (!result.content) {
      return res.status(502).json({ error: 'AI unavailable', details: result.error });
    }

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

    const results = parsed
      .filter(item => Number.isInteger(item.index) && item.index >= 1 && item.index <= transactions.length && VALID_CATEGORIES.includes(item.category))
      .map(item => {
        const tx = transactions[item.index - 1];
        if (!tx) return null;
        return {
          hash: tx.hash,
          merchant_name: item.merchant_name ? String(item.merchant_name).trim().toUpperCase().slice(0, 40) : null,
          category: item.category,
          subcategory: item.subcategory || null,
          confidence: typeof item.confidence === 'number'
            ? Math.min(0.95, Math.max(0.5, item.confidence))
            : 0.75,
        };
      })
      .filter(Boolean);

    res.json({ results, provider: result.provider });
  } catch (err) {
    console.error('[Categorize Lines] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
