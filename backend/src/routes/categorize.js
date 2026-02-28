/**
 * POST /api/bank/categorize        — merchant-level AI categorization
 * POST /api/bank/categorize-lines  — line-level AI categorization
 */

const express = require('express');
const router = express.Router();
const { generateWithFallback } = require('../services/ai');

// ─── LRU cache (merchant-level, TTL 7d, max 500 entries) ─────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const CACHE_MAX    = 500

class LRUCache {
  constructor(max) {
    this.max = max
    this.map = new Map()
  }
  get(key) {
    if (!this.map.has(key)) return null
    const entry = this.map.get(key)
    if (Date.now() - entry.ts > CACHE_TTL_MS) { this.map.delete(key); return null }
    // LRU: re-insert to make most-recent
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value)
    this.map.set(key, { value, ts: Date.now() })
  }
  invalidate(key) { this.map.delete(key) }
  get size() { return this.map.size }
}

const merchantCache    = new LRUCache(CACHE_MAX)
const lineResultsCache = new LRUCache(CACHE_MAX)

function merchantCacheKey(merchant_key) {
  return merchant_key.trim().toUpperCase()
}
function lineCacheKey(label, amountSign) {
  const norm = label.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${norm}|${amountSign}`
}

const VALID_CATEGORIES = [
  'revenus', 'loyer', 'alimentation', 'transport', 'abonnements',
  'achats', 'restauration', 'sante', 'loisirs', 'frais_bancaires',
  'epargne', 'impots', 'virement', 'autre',
];

// ─── Fast model + compact system prompt (optimized for low-latency inference) ──
// llama-3.1-8b-instant: 5-10x faster than 70b, sufficient for classification

const FAST_MODEL = 'llama-3.1-8b-instant'

const CATEGORIZATION_ENGINE = `You are a financial transaction categorization engine for French bank statements.

CATEGORIES (use ONLY these IDs — no other values allowed):
revenus | loyer | alimentation | transport | abonnements | achats | restauration | sante | loisirs | frais_bancaires | epargne | impots | virement | autre

CATEGORY MEANINGS:
revenus=salaires/remboursements/aides(positif) | loyer=loyer/charges/EDF/internet/box | alimentation=supermarches/epiceries/drives | transport=carburant/peage/parking/SNCF/bus/VTC | abonnements=streaming/telephone/assurances recurrentes | achats=vetements/electronique/Amazon/sport | restauration=restaurants/fastfood/livraison | sante=pharmacie/medecin/clinique/optique | loisirs=cinema/voyage/hotel/concerts | frais_bancaires=frais de compte/agios | epargne=livrets/PEA/assurance-vie | impots=DGFIP/URSSAF/amendes | virement=virement entre comptes/particuliers | autre=inclassable/DAB

EXTRACTION (mandatory):
1. Strip prefix: "PAIEMENT PAR CARTE XXXX" "ACHAT CB" "CB*" "VIR SEPA" "PREL SEPA" "RETRAIT DAB" "CARTE "
2. Strip suffix: city codes, country codes (FR/DE), refs (X3718 FRBOI072), dates (14/02 14FEV)
3. Uppercase tokens in the MIDDLE = merchant (1-3 words, no noise)
4. Positive amount = lean revenus/remboursement; negative = expense
5. VIR SEPA + person name + negative = loyer or virement

PATTERNS:
ALDI|LIDL|CARREF|LECLERC|INTERMARCHE|CASINO|MONOPRIX|AUCHAN|NETTO → alimentation/supermarche
TOTAL|ESSO|BP|SHELL → transport/carburant
VINCI|COFIROUTE|SANEF|PEAGE → transport/peage
SNCF|OUIGO|BLABLACAR|FLIXBUS → transport/train
RATP|TISSEO|TCL|KEOLIS → transport/transports_commun
UBER(?!EATS)|G7|HEETCH → transport/vtc
NETFLIX|SPOTIFY|CANAL+|DISNEY+|AMAZON PRIME|DEEZER|APPLE → abonnements/streaming
SFR|BOUYGUES|FREE|ORANGE|NRJ MOBILE → abonnements/telephone
AMAZON|AMZN → achats/enligne (unless PRIME → abonnements)
FNAC|DARTY|BOULANGER → achats/electronique
DECATHLON|ZARA|H&M|PRIMARK|KIABI → achats/vetements
MCDONALD|KFC|BURGER KING|DOMINOS|UBER EATS|DELIVEROO → restauration/fastfood
PHARMACIE|DOCTOLIB|CLINIQUE|HOPITAL → sante
DGFIP|TRESOR PUBLIC|URSSAF|CPAM|CAF → impots (revenus if positive)
BOOKING|AIRBNB|AIR FRANCE|EASYJET|RYANAIR → loisirs
UGC|PATHE|MK2 → loisirs/cinema
EDF|ENGIE|VEOLIA → loyer/electricite`;

// ─── POST /categorize (merchant-level) ────────────────────────────────────────

router.post('/categorize', async (req, res) => {
  try {
    const { merchants } = req.body;
    if (!Array.isArray(merchants) || merchants.length === 0 || merchants.length > 20) {
      return res.status(400).json({ error: 'merchants must be an array of 1-20 items' });
    }

    // Serve cached results instantly; only call Groq for cache misses
    const cached = [], uncached = []
    for (const m of merchants) {
      const hit = merchantCache.get(merchantCacheKey(m.merchant_key))
      if (hit) cached.push(hit)
      else uncached.push(m)
    }
    if (uncached.length === 0) return res.json({ results: cached, provider: 'cache' })

    const merchantList = uncached
      .map((m, i) =>
        `${i + 1}. merchant="${m.merchant_key}" | examples: ${(m.sample_labels || []).slice(0, 3).join(' / ')} | sign=${m.amount_sign === 1 ? 'positive/income' : 'negative/expense'}`
      )
      .join('\n');

    const systemPrompt = `${CATEGORIZATION_ENGINE}

OUTPUT — strict JSON array, no markdown, no comments:
[{"merchant_key":"...","category":"...","subcategory":"...","confidence":0.85,"rule_hit":"..."}]

Rules:
- confidence: 0.50–0.95 (never exceed 0.95)
- subcategory: short lowercase detail (supermarche, carburant, peage, streaming, fastfood, etc.) or null
- rule_hit: short string explaining which pattern matched (e.g. "ALDI pattern", "NETFLIX streaming")
- Use "autre" + confidence 0.50 when uncertain
- Valid categories: ${VALID_CATEGORIES.join(', ')}`;

    const prompt = `Categorize these French bank merchants:\n${merchantList}`;

    const result = await generateWithFallback(prompt, {
      model: FAST_MODEL,
      systemPrompt,
      maxTokens: 600,    // ~30 tokens/merchant × 20 merchants max
      temperature: 0.05,
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

    const freshResults = parsed
      .filter(item => item.merchant_key && VALID_CATEGORIES.includes(item.category))
      .map(item => ({
        merchant_key: String(item.merchant_key),
        category: item.category,
        subcategory: item.subcategory || null,
        confidence: typeof item.confidence === 'number'
          ? Math.min(0.95, Math.max(0.5, item.confidence))
          : 0.7,
        rule_hit: item.rule_hit || null,
      }));

    // Store fresh results in cache
    for (const r of freshResults) {
      merchantCache.set(merchantCacheKey(r.merchant_key), r)
    }

    const results = [...cached, ...freshResults]
    res.json({ results, provider: result.provider });
  } catch (err) {
    console.error('[Categorize] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── POST /categorize-lines (line-level) ──────────────────────────────────────

router.post('/categorize-lines', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0 || transactions.length > 50) {
      return res.status(400).json({ error: 'transactions must be an array of 1-50 items' });
    }

    // Serve cached lines; only send uncached to Groq (max 15 per call to stay within timeout)
    const cachedLines = [], uncachedTxs = [], indexMap = new Map()
    for (const tx of transactions) {
      const ckey = lineCacheKey(tx.label, tx.amount >= 0 ? '+' : '-')
      const hit = lineResultsCache.get(ckey)
      if (hit) cachedLines.push({ ...hit, hash: tx.hash })
      else if (uncachedTxs.length < 15) { indexMap.set(uncachedTxs.length, tx); uncachedTxs.push(tx) }
    }
    if (uncachedTxs.length === 0) return res.json({ results: cachedLines, provider: 'cache' })

    const txList = uncachedTxs
      .map((t, i) => `${i + 1}. [${t.date || '?'}] ${t.label} | amount=${t.amount >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)}€`)
      .join('\n');

    const systemPrompt = `${CATEGORIZATION_ENGINE}

OUTPUT — strict JSON array, one object per transaction index, no markdown, no comments:
[{"index":1,"merchant":"ALDI","category":"alimentation","subcategory":"supermarche","confidence":0.92,"rule_hit":"ALDI pattern"},...]

Rules:
- index: matches input line number (1-based)
- merchant: short clean name, 1–3 words, UPPERCASE (extract from label, ignore noise)
- category: one of the internal IDs above
- subcategory: optional lowercase detail or null
- confidence: 0.50–0.95 (never exceed 0.95)
- rule_hit: brief explanation of which rule/pattern matched
- Use "autre" + confidence 0.50 when label is uninterpretable
- Valid categories: ${VALID_CATEGORIES.join(', ')}`;

    const prompt = `Analyze and categorize these French bank transaction lines:\n${txList}`;

    const result = await generateWithFallback(prompt, {
      model: FAST_MODEL,
      systemPrompt,
      maxTokens: 700,    // ~45 tokens/tx × 15 tx max = 675 tokens
      temperature: 0.05,
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

    const freshLines = parsed
      .filter(item =>
        Number.isInteger(item.index) &&
        item.index >= 1 &&
        item.index <= uncachedTxs.length &&
        VALID_CATEGORIES.includes(item.category)
      )
      .map(item => {
        const tx = uncachedTxs[item.index - 1];
        if (!tx) return null;
        const lineResult = {
          hash: tx.hash,
          merchant_name: item.merchant
            ? String(item.merchant).trim().toUpperCase().slice(0, 40)
            : null,
          category: item.category,
          subcategory: item.subcategory || null,
          confidence: typeof item.confidence === 'number'
            ? Math.min(0.95, Math.max(0.5, item.confidence))
            : 0.75,
          rule_hit: item.rule_hit || null,
        };
        // Cache by normalized label so identical labels skip Groq next time
        const ckey = lineCacheKey(tx.label, tx.amount >= 0 ? '+' : '-')
        lineResultsCache.set(ckey, lineResult)
        return lineResult;
      })
      .filter(Boolean);

    const results = [...cachedLines, ...freshLines]
    res.json({ results, provider: result.provider });
  } catch (err) {
    console.error('[Categorize Lines] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
