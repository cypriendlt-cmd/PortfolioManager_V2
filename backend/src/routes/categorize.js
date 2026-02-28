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

// ─── Shared system prompt base ────────────────────────────────────────────────

const CATEGORIZATION_ENGINE = `You are a financial transaction categorization engine specialized in French bank statements.

TAXONOMY — use ONLY these internal category IDs in your output:
• revenus       → Salaires, revenus freelance, remboursements reçus, allocations CAF/CPAM (positive amounts)
• loyer         → Loyer, charges copropriété, assurance habitation, EDF/GDF/eau/électricité, box internet, assurance logement
• alimentation  → Supermarchés, épiceries, drives, marchés, boulangeries (CARREF, ALDI, LIDL, LECLERC, INTERMARCHE, CASINO, MONOPRIX, FRANPRIX, CORA, AUCHAN, NETTO, SPAR, LEADER PRICE, SUPER U, BIOCOOP, PICARD, GRAND FRAIS, METRO, COSTCO...)
• transport     → Carburant, péages, parking, SNCF, bus/métro/tram, VTC, location voiture (TOTAL, ESSO, BP, SHELL, VINCI, COFIROUTE, OUIGO, BLABLACAR, UBER, G7, RATP, SNCF, FLIXBUS...)
• abonnements   → Abonnements récurrents : streaming, téléphonie mobile, assurances annuelles, logiciels (NETFLIX, SPOTIFY, CANAL+, DISNEY, AMAZON PRIME, DEEZER, SFR, BOUYGUES, FREE, ORANGE, NRJ MOBILE, APPLE...)
• achats        → Achats ponctuels : vêtements, électronique, Amazon hors Prime, bricolage, sport, mobilier (AMAZON, FNAC, DARTY, ZARA, H&M, PRIMARK, DECATHLON, LEROY MERLIN, BOULANGER, IKEA, ASOS...)
• restauration  → Restaurants, fast-food, cafés, bars, livraison repas (MCDONALD, KFC, BURGER KING, SUBWAY, DOMINOS, FIVE GUYS, UBER EATS, DELIVEROO, JUST EAT...)
• sante         → Pharmacie, médecin, dentiste, opticien, clinique, laboratoire, mutuelle santé (PHARMACIE, DOCTOLIB, MUTUELLE, CHU, CHR, LABO...)
• loisirs       → Cinéma, voyages, hôtels, musées, sport, concerts, sorties (BOOKING, AIRBNB, UGC, PATHE, MK2, AIR FRANCE, EASYJET, RYANAIR...)
• frais_bancaires → Frais de tenue de compte, agios, commissions, frais carte, prélèvements bancaires
• epargne       → Virements vers épargne, assurance-vie, PEL, PEA, livrets (BOURSORAMA, LINXEA, YOMONI, FORTUNEO...)
• impots        → Impôts revenus, taxe foncière, taxe habitation, amendes, URSSAF, cotisations sociales (DGFIP, TRESOR PUBLIC, URSSAF, AMENDE...)
• virement      → Virements entre comptes propres, remboursements entre particuliers (Lydia, Sumeria, PayPal entre particuliers)
• autre         → Inclassable, retraits DAB espèces, divers non identifiés

MERCHANT EXTRACTION RULES (critical):
1. Strip payment prefixes entirely: "PAIEMENT PAR CARTE XXXX", "ACHAT CB", "CB*", "CARTE ", "VIR SEPA", "PREL SEPA", "PRELEVEMENT SEPA", "RETRAIT DAB", "RETRAIT CARTE", "AVOIR "
2. Strip trailing noise: city codes, country codes (FR/DE/GB...), alphanumeric refs (X3718, FRBOI072), dates (14/02, 14FEV), branch codes
3. Uppercase tokens in the MIDDLE of the label (between prefix and trailing noise) = the merchant
4. Ignore short tokens (≤2 chars), pure numbers, single letters
5. For "VIR SEPA [NAME]": if amount < 0 and name looks like a landlord → loyer; else → virement
6. Amount sign matters: positive → lean toward revenus/remboursement; negative → expense

MERCHANT DETECTION PATTERNS (examples, not exhaustive):
• ALDI|LIDL|CARREF|LECLERC|INTERMARCHE|CASINO|MONOPRIX|FRANPRIX|CORA|AUCHAN|NETTO|LEADER PRICE|SUPER U → alimentation / supermarche
• TOTAL|ESSO|BP|SHELL|TOTAL ENERGIES|STATION → transport / carburant
• AUTOROUTE|VINCI|COFIROUTE|ESCOTA|SAPN|SANEF|ADELAC|PEAGE → transport / peage
• SNCF|OUIGO|INOUI|TER|BLABLACAR|FLIXBUS → transport / train
• RATP|TISSEO|TCL|KEOLIS|TAN|TAM|TRANSDEV|STAR → transport / transports_commun
• UBER(?! EATS)|G7|HEETCH|LYFT|KAPTEN → transport / vtc
• NETFLIX|SPOTIFY|CANAL\+|DISNEY\+|AMAZON PRIME|DEEZER|APPLE ONE|MAX|PARAMOUNT → abonnements / streaming
• SFR|BOUYGUES|FREE MOBILE|ORANGE|B&YOU|RED BY|NRJ MOBILE|SOSH → abonnements / telephonie
• AMAZON|AMZN(?!.*PRIME) → achats / ecommerce
• FNAC|DARTY|BOULANGER|CDISCOUNT|LDLC → achats / electronique
• ZARA|H&M|UNIQLO|PRIMARK|KIABI|JULES|PULL AND BEAR|BERSHKA → achats / vetements
• DECATHLON|GO SPORT|SPORT 2000 → achats / sport
• LEROY MERLIN|CASTORAMA|BRICORAMA|IKEA → achats / maison
• MCDONALD|KFC|BURGER KING|SUBWAY|QUICK|FIVE GUYS|DOMINOS|PIZZA HUT → restauration / fastfood
• UBER EATS|DELIVEROO|JUST EAT → restauration / livraison
• PHARMACIE|PHARMA|DOCTOLIB|CABINET DR|CLINIQUE|HOPITAL|CHU|CHR|LABO → sante
• DGFIP|IMPOT|TRESOR PUBLIC|URSSAF|CPAM|CAF|FRANCE TRAVAIL|POLE EMPLOI → impots (or revenus if positive)
• BOOKING|AIRBNB|EXPEDIA|ACCOR|IBIS|NOVOTEL|MERCURE → loisirs / hebergement
• AIR FRANCE|EASYJET|RYANAIR|TRANSAVIA|VUELING|TAP → loisirs / avion
• UGC|PATHE|MK2|GAUMONT|CGR → loisirs / cinema
• EDF|ENEDIS|GDF|SUEZ|VEOLIA|ENGIE|ORANGE (box)|FREE (box)|SFR (box)|BOUYGUES (box) → loyer / factures`;

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
      systemPrompt,
      maxTokens: 1200,
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

    // Serve cached lines; only send uncached to Groq
    const cachedLines = [], uncachedTxs = [], indexMap = new Map()
    for (const tx of transactions) {
      const ckey = lineCacheKey(tx.label, tx.amount >= 0 ? '+' : '-')
      const hit = lineResultsCache.get(ckey)
      if (hit) cachedLines.push({ ...hit, hash: tx.hash })
      else { indexMap.set(uncachedTxs.length, tx); uncachedTxs.push(tx) }
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
      systemPrompt,
      maxTokens: 2500,
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
