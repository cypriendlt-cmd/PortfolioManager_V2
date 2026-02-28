/**
 * Bank Worker — ALL heavy computation runs here, off main thread.
 *
 * Messages IN:
 *   { type: 'process', transactions, rules, learnedRules, aiCache, accounts }
 *   { type: 'categorize_only', transactions, rules, learnedRules, aiCache }
 *   { type: 'correct', merchantKey, newCategory, newSubcategory, transactions, rules, learnedRules, aiCache }
 *
 * Messages OUT:
 *   { type: 'result', transactions, aggregates, healthScore, insights, accountBalances, flaggedTransfers, lowConfidence }
 *   { type: 'error', message }
 */

// ─── Normalizer (inlined to avoid import issues in worker) ──────────────────

const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'en', 'et', 'ou', 'au', 'aux',
  'ce', 'ces', 'par', 'sur', 'pour', 'avec', 'dans', 'qui', 'que', 'son', 'ses',
])

// ─── Common payment method prefixes from French banks ───────────────────────
// Covers: BNP, SG, CA, LCL, Boursorama, La Banque Postale, CIC, Crédit Mutuel…
const PAYMENT_PREFIXES = /^(ACHAT\s+(CB|CARTE)\s*|PAIEMENT\s+(PAR\s+)?(CARTE|CB)\s*|PAIEMENT\s+CB\s*|CB\s*\*?\s*|CARTE\s+|VIR(EMENT)?\s+(SEPA\s+)?|VIREMENT\s+(SEPA\s+)?|PREL(EVEMENT)?\s+(SEPA\s+)?|PRLV\s+(SEPA\s+)?|PRELEV\s+(SEPA\s+)?|CHQ\s*N?\.?\s*\d*\s*|RETRAIT\s*(DAB|CB|ESPECES)?\s*|RET(RAIT)?\s*DAB\s*|SEPA\s+DD\s+|AVOIR\s+CB\s*)/i

// Date patterns: 14/02, 14-02-26, 14.02.2026, 14FEV, 14 FEV, etc.
const DATE_REFS = /\b\d{2}[\/.\-]\d{2}([\/.\-]\d{2,4})?\b|\b\d{1,2}\s*(JAN|FEV|MAR|AVR|MAI|JUN|JUL|AOU|SEP|OCT|NOV|DEC)\w*\b/gi

// Card numbers embedded in labels
const CARD_NUMBERS = /\b\d{4}\s?\*{4,}\s?\d{0,4}\b|\bX{4,}\d{4}\b|\b\d{16}\b|\b[A-Z]\d{4,}\b/g

// Reference/transaction codes: FRBOI072, X3718, FR123456, etc.
const CODE_TOKENS = /\b([A-Z]{1,5}\d{3,}[A-Z0-9]*|\d{3,}[A-Z]{1,5}|[A-Z]{2,6}\d{2,}[A-Z0-9]*)\b/g

const MULTI_SPACE = /\s{2,}/g

function normalizeLabel(label) {
  if (!label) return ''
  return label.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/\*/g, ' ')                                // CB*ALDI*FR → CB ALDI FR
    .replace(/[_\-\.]{2,}/g, ' ')                       // separators → space
    .replace(CARD_NUMBERS, ' ')
    .replace(DATE_REFS, ' ')
    .replace(/\b(REF|N[O°]?|NR|ID|BIL|TXN)\s*[:\s]?\s*[\w\-]+/gi, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim()
}

function extractMerchantKey(labelNorm) {
  if (!labelNorm) return ''
  let key = labelNorm
    .replace(PAYMENT_PREFIXES, '')   // strip payment prefix
    .replace(CODE_TOKENS, ' ')       // strip reference codes
    .replace(/\b\d{3,}\b/g, ' ')    // strip standalone numbers ≥3 digits
    .replace(/\b[A-Z]{1,2}\b/g, ' ')// strip 1-2 char tokens (FR, SO, etc.)
    .replace(MULTI_SPACE, ' ')
    .trim()

  const words = key.split(/\s+/).filter(w => w.length >= 3)
  if (!words.length) {
    // Fallback: first 3+ char word from the original normalized label
    const fallback = labelNorm.split(/\s+/).find(w => w.length >= 3)
    return fallback || labelNorm.slice(0, 15)
  }
  // Short first word (≤3 chars) → include second for specificity (e.g. "BP GAS")
  if (words[0].length <= 3 && words.length > 1) return words.slice(0, 2).join(' ')
  return words[0]
}

function detectPaymentType(labelNorm) {
  if (!labelNorm) return null
  if (/^CB\b|^CARTE\b/.test(labelNorm)) return 'CB'
  if (/^VIR(EMENT)?\b/.test(labelNorm)) return 'VIR'
  if (/^PRLV\b/.test(labelNorm)) return 'PRLV'
  if (/^CHQ\b/.test(labelNorm)) return 'CHQ'
  if (/^RET\s*DAB\b/.test(labelNorm)) return 'RET_DAB'
  if (/^SEPA\s+DD\b/.test(labelNorm)) return 'SEPA_DD'
  return null
}

function deriveFields(label) {
  const label_norm = normalizeLabel(label)
  return { label_norm, merchant_key: extractMerchantKey(label_norm), payment_type: detectPaymentType(label_norm) }
}

// ─── Pre-compiled categorization rules ──────────────────────────────────────

const STRONG_RULES = [
  { re: /SALAIRE|PAIE|REMUNERATION/,             cat: 'revenus', sub: 'salaire' },
  { re: /CAF|ALLOCATION|POLE EMPLOI|FRANCE TRAVAIL/, cat: 'revenus', sub: 'allocations' },
  { re: /REMBOURSEMENT|REMBOURS/,                cat: 'revenus', sub: 'remboursements' },
  { re: /IMPOT|DGFIP|DIRECTION GENERALE DES FINANCES/, cat: 'impots', sub: 'impot_revenu' },
  { re: /TAXE HABITATION/,                        cat: 'impots', sub: 'taxe_habitation' },
  { re: /TAXE FONCIERE/,                          cat: 'impots', sub: 'taxe_fonciere' },
  { re: /URSSAF/,                                 cat: 'impots', sub: 'urssaf' },
  { re: /\bCSG\b|CONTRIBUTION SOCIALE/,           cat: 'impots', sub: 'csg' },
  { re: /FRAIS|COTISATION CARTE|TENUE DE COMPTE|COMMISSION|AGIOS|INTERETS DEBITEURS/, cat: 'frais_bancaires', sub: 'cotisation' },
  { re: /LOYER|BAILLEUR/,                         cat: 'loyer', sub: 'loyer' },
  { re: /CPAM|AMELI|SECU/,                        cat: 'sante', sub: 'cpam' },
  { re: /MUTUELLE/,                               cat: 'sante', sub: 'mutuelle' },
]

const DEFAULT_RULES = [
  // ── Alimentation : supermarchés (toutes variantes banques françaises) ──────
  {
    re: /CARREFOUR|CARREF\b|CREF\b|LECLERC|E\.?\s*LECLERC|LIDL|ALDI|MONOPRIX|INTERMARCHE|ITM\b|PICARD|AUCHAN|FRANPRIX|CASINO\s*(SUPER|HYPERMARCHE|DRIVE)?|SUPERMARCHE|SUPER\s?U|CORA\b|NETTO\b|PENNY|SIMPLY\s?MARKET|MATCH\b|GRAND\s?FRAIS|MARCHE\s?FRAIS|PRIMEUR|SPAR\b|VIVAL\b|COCCINELLE|SYSTEME\s?U|U\s?EXPRESS|LEADER\s?PRICE|ED\b|NORMA\b|COLRUYT|EPIC\b|MONOP\b|NATUREO|HYPER\s?U|SUPER\s?CASINO|G20\b|ATAC\b|CHAMPION\b/,
    cat: 'alimentation', sub: 'supermarche',
  },
  // ── Alimentation : boulangeries ─────────────────────────────────────────────
  {
    re: /BOULANGERIE|PATISSERIE|FOURNIL|BRIOCHE DOREE|PAUL\b|DELIFRANCE|BOULANGER|FEUILLETTE|MAISON\s?(KAYSER|LANDEM)/,
    cat: 'alimentation', sub: 'boulangerie',
  },
  // ── Alimentation : bio ───────────────────────────────────────────────────────
  {
    re: /BIOCOOP|NATURALIA|BIO\s?(C?BON|MARCHE|EXPRESS|COOP)|LA\s?VIE\s?CLAIRE|GREENWEEZ|KAZIDOMI/,
    cat: 'alimentation', sub: 'bio',
  },
  // ── Alimentation : marché / épicerie ────────────────────────────────────────
  {
    re: /EPICERIE|PRIMEUR|MARCHE\s?(AUX|DES|DE)|FRUITS\s?ET\s?LEGUMES|FROMAGERIE/,
    cat: 'alimentation', sub: 'marche',
  },

  // ── Transport : commun ───────────────────────────────────────────────────────
  {
    re: /SNCF|TGV|OUIGO|INOUI|INTERCITES|RATP|NAVIGO|TRANSDEV|TRANSILIEN|KEOLIS|BLABLACAR|FLIXBUS|EUROSTAR|THALYS|OUIBUS|TISEO|TCL\b|RTCA\b|TAN\b|TBCO\b|STAR\b|TISEO|RESEAU\s?MISTRAL/,
    cat: 'transport', sub: 'transport_commun',
  },
  // ── Transport : VTC / taxi ───────────────────────────────────────────────────
  {
    re: /\bUBER\b|BOLT\b|TAXI|FREE\s?NOW|FREENOW|KAPTEN|LECAB|HEETCH|CHAUFFEUR\s?PRIV|MARCEL\b/,
    cat: 'transport', sub: 'vtc',
  },
  // ── Transport : carburant ────────────────────────────────────────────────────
  {
    re: /TOTAL\s?(ENERGIE|ACCESS|DIRECT)?|SHELL\b|BP\b|ESSO\b|AVIA\b|DYNEFF|INTERMARCHE\s?STATION|CARREFOUR\s?STATION|LECLERC\s?CARBURANT|ESSENCE|CARBURANT|STATION\s?SERVICE|ESSO\b|Q8\b|TAMOIL/,
    cat: 'transport', sub: 'carburant',
  },
  // ── Transport : parking ──────────────────────────────────────────────────────
  {
    re: /PARKING|PARC(?!OURS)|INDIGO\b|EFFIA\b|VINCI\s?PARK|Q-PARK|SAEMES|PARKEON|FLOWBIRD/,
    cat: 'transport', sub: 'parking',
  },
  // ── Transport : péage ────────────────────────────────────────────────────────
  {
    re: /PEAGE|AUTOROUTE|APRR\b|SANEF\b|VINCI\s?AUTO|ESCOTA|COFIROUTE|ASF\b|ATMB\b|AREA\b/,
    cat: 'transport', sub: 'peage',
  },
  // ── Transport : entretien auto ───────────────────────────────────────────────
  {
    re: /NORAUTO|MIDAS\b|SPEEDY\b|EUROMASTER|POINT\s?S\b|FEUVERT|CARGLASS|CARGLAS|CONTROLE\s?TECHNIQUE|DEKRA/,
    cat: 'transport', sub: 'entretien_auto',
  },

  // ── Abonnements : streaming ──────────────────────────────────────────────────
  {
    re: /NETFLIX|SPOTIFY|DEEZER|DISNEY\+?|CANAL\+?|AMAZON\s?PRIME|PRIME\s?VIDEO|APPLE\s?(TV|MUSIC|ONE)|YOUTUBE\s?PREMIUM|OCS\b|MOLOTOV|PARAMOUNT|MAX\b|CRUNCHYROLL|TWITCH/,
    cat: 'abonnements', sub: 'streaming',
  },
  // ── Abonnements : télécom ────────────────────────────────────────────────────
  {
    re: /FREE\s?MOBILE|SFR\b|BOUYGUES\s?(TELECOM|TEL)?|BTEL\b|ORANGE\b|SOSH\b|PRIXTEL|RED\s?BY\s?SFR|NRJ\s?MOBILE|CORIOLIS|LA\s?POSTE\s?MOBILE|LEBARA|SYMA\s?MOBILE/,
    cat: 'abonnements', sub: 'telecom',
  },
  // ── Abonnements : cloud / logiciels ─────────────────────────────────────────
  {
    re: /GOOGLE\s?(STORAGE|ONE|WORKSPACE)|ICLOUD|DROPBOX|ONEDRIVE|MICROSOFT\s?(365|OFFICE)|ADOBE\b|LINKEDIN\s?PREMIUM|NOTION\b|DASHLANE|NORDVPN|EXPRESSVPN/,
    cat: 'abonnements', sub: 'cloud',
  },
  // ── Abonnements : box internet ───────────────────────────────────────────────
  {
    re: /\bFREE\b(?!.*MOBILE)|BBOX\b|LIVEBOX|SOSH\s?BOX|RED\s?BOX|B\s?&\s?YOU|SFR\s?BOX|NUMERICABLE|BOUYGUES\s?BOX|BBOX\s?SMART/,
    cat: 'abonnements', sub: 'box_internet',
  },
  // ── Abonnements : presse ─────────────────────────────────────────────────────
  {
    re: /LE\s?MONDE|LE\s?FIGARO|LIBERATION|L\s?EQUIPE|MEDIAPART|NUMERIQUE\s?PREMIUM|CAFEYN|PRESSREADER/,
    cat: 'abonnements', sub: 'presse',
  },

  // ── Achats : e-commerce ──────────────────────────────────────────────────────
  {
    re: /AMAZON(?!\s?(PRIME|VIDEO|MUSIC))|FNAC\b|DARTY\b|CDISCOUNT|ALIEXPRESS|TEMU\b|WISH\b|EBAY\b|VINTED\b|LEBONCOIN|RAKUTEN|BOULANGER|MATERIEL\.NET|LDLC\b|RUE\s?DU\s?COMMERCE/,
    cat: 'achats', sub: 'ecommerce',
  },
  // ── Achats : habillement ─────────────────────────────────────────────────────
  {
    re: /ZALANDO|SHEIN\b|KIABI\b|H\s?&\s?M\b|ZARA\b|UNIQLO|DECATHLON|SPORT\s?2000|FOOT\s?LOCKER|NIKE\b|ADIDAS\b|LACOSTE|ASOS\b|LA\s?REDOUTE|JULES\b|CELIO\b|BERSHKA|PRIMARK/,
    cat: 'achats', sub: 'habillement',
  },
  // ── Achats : ameublement / bricolage ────────────────────────────────────────
  {
    re: /IKEA\b|LEROY\s?MERLIN|CASTORAMA|BRICO\s?(DEPOT|MARCHE)|MAISON\s?DU\s?MONDE|BUT\b|CONFORAMA|ALINEA\b|ROUGIER|LEROYMERLIN/,
    cat: 'achats', sub: 'ameublement',
  },
  // ── Achats : divers ──────────────────────────────────────────────────────────
  {
    re: /PAYPAL\b|ACTION\b|GIFI\b|STOKOMANI|LA\s?HALLE|NETTO\s?BRICO|CENTRAKOR|NORMAL\s?STORE/,
    cat: 'achats', sub: 'ecommerce',
  },

  // ── Restauration : restaurants ───────────────────────────────────────────────
  {
    re: /RESTAURANT|BRASSERIE|BISTROT|PIZZ|KEBAB|SUSHI|TRAITEUR|CANTINE|AUBERGE|RESTO\b/,
    cat: 'restauration', sub: 'restaurant',
  },
  // ── Restauration : livraison ─────────────────────────────────────────────────
  {
    re: /DELIVEROO|UBER\s?EATS|JUST\s?EAT|GLOVO\b|DOMINOS|PIZZA\s?HUT|LYVEAT|SMOOD\b/,
    cat: 'restauration', sub: 'livraison',
  },
  // ── Restauration : fast food ─────────────────────────────────────────────────
  {
    re: /MCDO\b|MCDONALD|BURGER\s?KING|KFC\b|SUBWAY\b|QUICK\b|FIVE\s?GUYS|HALL\s?STREET|PAUL\s?RESTAURANT|BRIOCHE\s?DOREE|POMME\s?DE\s?PAIN|PRÊT\s?A\s?MANGER|PRET\s?A\s?MANGER/,
    cat: 'restauration', sub: 'fast_food',
  },

  // ── Santé ────────────────────────────────────────────────────────────────────
  { re: /PHARMACIE|PARAPHARMACIE|PHARMA\b|APOTEKE/, cat: 'sante', sub: 'pharmacie' },
  {
    re: /DOCTOLIB|MEDECIN|DOCTEUR|\bDR\s|KINESITHERAPEUTE|KINE\b|DENTISTE|OPTIQUE|OPTICIEN|LUNETTES|VISION|AUDIOPROTHESISTE|AUDIO\s?PROTECT|ORTHOPHONISTE|PSYCHOLOGUE|HOPITAL|CLINIQUE|MATERNITE/,
    cat: 'sante', sub: 'medecin',
  },
  { re: /CPAM|AMELI|\bSECU\b|CNAM\b/, cat: 'sante', sub: 'cpam' },

  // ── Loisirs : culture ────────────────────────────────────────────────────────
  { re: /CINEMA|CINE\b|UGC\b|MK2\b|PATHE\b|GAUMONT|THEATRE|CONCERT|SPECTACLE|MUSEE|GALERIE|EXPOSITION|FNAC\s?SPECTACLE/, cat: 'loisirs', sub: 'culture' },
  // ── Loisirs : sport ──────────────────────────────────────────────────────────
  { re: /BASIC\s?FIT|FIT\s?(ARENA|PLUS|CENTRE)|SALLE\s?(DE\s?)?SPORT|GYM|FITNESS|PISCINE|TENNIS|ESCALADE|CROSS\s?FIT|L\s?ORANGE\s?BLEUE|MOVING/, cat: 'loisirs', sub: 'sport' },
  // ── Loisirs : voyages ────────────────────────────────────────────────────────
  { re: /BOOKING\b|AIRBNB|HOTEL\b|IBIS\b|NOVOTEL|CAMPANILE|ACCORHOTELS|LOGIS\b|HOLIDAY\s?INN|EXPEDIA|LASTMINUTE|VOYAGE\b|SEJOUR|EASYJET|RYANAIR|VUELING|TRANSAVIA|AIR\s?FRANCE|AIR\s?ALGERIE/, cat: 'loisirs', sub: 'voyages' },

  // ── Épargne ──────────────────────────────────────────────────────────────────
  { re: /EPARGNE|LIVRET\s?(A|BLEU|JEUNE|DD|LDDS|LEP)|PLACEMENT|ASSURANCE\s?VIE|PER\b|PLAN\s?EPARGNE/, cat: 'epargne', sub: 'livret' },
]

// ─── Categorization engine ──────────────────────────────────────────────────

function categorizeTx(tx, customRulesCompiled, learnedRules, aiCache) {
  const { label_norm, merchant_key } = tx

  // P1: Transfer
  if (tx.isTransfer) return { category: 'virement', subcategory: 'interne', confidence: 1.0, reason: 'Virement détecté', method: 'transfer_detected' }

  // P2: User learned
  if (merchant_key && learnedRules[merchant_key]) {
    const r = learnedRules[merchant_key]
    return { category: r.category, subcategory: r.subcategory || null, confidence: 0.95, reason: `Appris: ${merchant_key}`, method: 'user_learned' }
  }

  // P3: AI cached (<30 days)
  if (merchant_key && aiCache[merchant_key]) {
    const c = aiCache[merchant_key]
    const age = (Date.now() - new Date(c.cachedAt).getTime()) / 86400000
    if (age < 30) return { category: c.category, subcategory: c.subcategory || null, confidence: c.confidence || 0.75, reason: `IA: ${merchant_key}`, method: 'ai_cached' }
  }

  // P4: Custom regex
  for (const rule of customRulesCompiled) {
    if (rule.re.test(label_norm)) return { category: rule.category, subcategory: null, confidence: 0.85, reason: `Custom: ${rule.pattern}`, method: 'regex_custom' }
  }

  // P5: Strong regex
  for (const rule of STRONG_RULES) {
    if (rule.re.test(label_norm)) return { category: rule.cat, subcategory: rule.sub, confidence: 0.80, reason: `Forte: ${rule.re.source.slice(0, 25)}`, method: 'regex_strong' }
  }

  // P6: Default regex
  for (const rule of DEFAULT_RULES) {
    if (rule.re.test(label_norm)) return { category: rule.cat, subcategory: rule.sub, confidence: 0.70, reason: `Regex: ${rule.re.source.slice(0, 25)}`, method: 'regex_default' }
  }

  // P7: Revenue heuristic
  if (tx.amount > 0) return { category: 'revenus', subcategory: 'revenus_divers', confidence: 0.50, reason: 'Montant positif', method: 'revenue_heuristic' }

  // P8: Default
  return { category: 'autre', subcategory: null, confidence: 0.0, reason: 'Aucun match', method: 'default' }
}

// ─── Transfer detection (scored, O(n log n) via grouping) ───────────────────

const TRANSFER_LABEL_RE = /VIR(EMENT)?|SEPA|TRANSFERT|EPARGNE|LIVRET/i

function detectTransfersScored(transactions) {
  const flagged = []
  const groups = new Map()

  for (let i = 0; i < transactions.length; i++) {
    if (transactions[i].isTransfer) continue
    const key = Math.round(Math.abs(transactions[i].amount) * 100)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  }

  for (const [amtKey] of groups) {
    const candidateSet = new Set()
    for (const nk of [amtKey - 1, amtKey, amtKey + 1]) {
      const g = groups.get(nk)
      if (g) g.forEach(i => candidateSet.add(i))
    }
    const candidates = [...candidateSet]

    for (let i = 0; i < candidates.length; i++) {
      const a = transactions[candidates[i]]
      if (a.isTransfer) continue
      for (let j = i + 1; j < candidates.length; j++) {
        const b = transactions[candidates[j]]
        if (b.isTransfer) continue
        if (a.accountId === b.accountId || a.amount * b.amount >= 0) continue

        let score = 0
        const diff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount))
        if (diff === 0) score += 40; else if (diff <= 0.01) score += 35; else continue

        const days = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000
        if (days === 0) score += 30; else if (days <= 1) score += 20; else if (days <= 2) score += 10; else continue

        score += 20 // diff accounts + opposite signs (already checked)
        if (TRANSFER_LABEL_RE.test(a.label) || TRANSFER_LABEL_RE.test(b.label)) score += 10

        const mkA = a.merchant_key, mkB = b.merchant_key
        if (mkA && mkB && mkA === mkB) score -= 20

        if (score >= 70) {
          a.isTransfer = true; a.transferPairHash = b.hash; a.transferScore = score; a.category = 'virement'
          b.isTransfer = true; b.transferPairHash = a.hash; b.transferScore = score; b.category = 'virement'
        } else if (score >= 50) {
          flagged.push({ hashA: a.hash, hashB: b.hash, score, labelA: a.label, labelB: b.label })
        }
      }
    }
  }

  return flagged
}

// ─── Aggregation (single pass) ──────────────────────────────────────────────

function computeAll(transactions, accounts) {
  const months = {}
  const accountTotals = {}

  // Single pass over all transactions
  for (const tx of transactions) {
    // Account balance accumulation
    accountTotals[tx.accountId] = (accountTotals[tx.accountId] || 0) + tx.amount

    // Monthly aggregation (skip transfers)
    if (tx.isTransfer) continue
    const month = tx.date.slice(0, 7)
    if (!months[month]) months[month] = { month, income: 0, expenses: 0, savings: 0, savingsRate: 0 }
    if (tx.amount > 0) months[month].income += tx.amount
    else months[month].expenses += Math.abs(tx.amount)
  }

  const aggregates = Object.values(months).map(m => {
    m.savings = m.income - m.expenses
    m.savingsRate = m.income > 0 ? (m.savings / m.income) * 100 : 0
    return m
  }).sort((a, b) => a.month.localeCompare(b.month))

  // Health score
  let healthScore = 50
  if (aggregates.length > 0) {
    const last3 = aggregates.slice(-3)
    const avgRate = last3.reduce((s, m) => s + m.savingsRate, 0) / last3.length
    healthScore = Math.max(0, Math.min(100, Math.round(50 + avgRate)))
  }

  // Account balances
  const accountBalances = (accounts || []).map(acc => ({
    ...acc,
    balance: (acc.initialBalance || 0) + (accountTotals[acc.id] || 0),
    txCount: transactions.filter(t => t.accountId === acc.id).length,
  }))

  return { aggregates, healthScore, accountBalances }
}

// ─── Coach Insights (single pass optimized) ─────────────────────────────────

function generateInsights(transactions, aggregates) {
  const feesRe = /FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS|INTERETS DEBITEURS/i
  const fees = []
  let totalFees = 0
  const byCategory = {}
  const categoryCounts = {}
  const labelMonths = {}

  // Single pass
  for (const t of transactions) {
    if (t.isTransfer || t.amount >= 0) continue
    const absAmt = Math.abs(t.amount)

    if (feesRe.test(t.label)) { fees.push(t); totalFees += absAmt }

    byCategory[t.category] = (byCategory[t.category] || 0) + absAmt
    categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1

    const key = t.label.slice(0, 30).toUpperCase()
    const month = t.date.slice(0, 7)
    if (!labelMonths[key]) labelMonths[key] = { months: new Set(), total: 0, count: 0 }
    labelMonths[key].months.add(month)
    labelMonths[key].total += absAmt
    labelMonths[key].count++
  }

  const topExpenses = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([category, total]) => ({ category, total }))

  const recurring = Object.entries(labelMonths).filter(([, d]) => d.months.size >= 2)
    .map(([label, d]) => ({ label, monthsCount: d.months.size, avgAmount: d.total / d.months.size }))
    .sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 10)

  const anomalies = []
  for (const t of transactions) {
    if (t.isTransfer || t.amount >= 0) continue
    const avg = byCategory[t.category] / categoryCounts[t.category]
    if (avg && Math.abs(t.amount) > avg * 3 && Math.abs(t.amount) > 50) anomalies.push(t)
    if (anomalies.length >= 5) break
  }

  const recommendations = []
  if (totalFees > 10) recommendations.push(`Frais bancaires détectés : ${totalFees.toFixed(0)}€. Envisagez une banque en ligne sans frais.`)
  const lastAgg = aggregates[aggregates.length - 1]
  if (lastAgg && lastAgg.savingsRate < 10) recommendations.push("Taux d'épargne faible. Automatisez un virement épargne en début de mois.")
  if (recurring.length > 5) recommendations.push(`${recurring.length} abonnements récurrents détectés. Vérifiez ceux inutilisés.`)
  if (!recommendations.length) recommendations.push('Bon travail ! Vos finances semblent saines.')

  return { fees: { items: fees.slice(0, 10), total: totalFees }, topExpenses, recurring, anomalies, recommendations }
}

// ─── Low confidence finder ──────────────────────────────────────────────────

function findLowConfidence(transactions, threshold = 0.6) {
  const map = {}
  for (const tx of transactions) {
    if ((tx.confidence || 0) >= threshold || !tx.merchant_key) continue
    if (!map[tx.merchant_key]) map[tx.merchant_key] = { sample_labels: [], amount_sign: tx.amount >= 0 ? 'credit' : 'debit' }
    if (map[tx.merchant_key].sample_labels.length < 3) map[tx.merchant_key].sample_labels.push(tx.label)
  }
  return map
}

// ─── Message handler ────────────────────────────────────────────────────────

self.onmessage = function(e) {
  const { type } = e.data

  try {
    if (type === 'process' || type === 'categorize_only') {
      const { transactions: rawTxs, rules = [], learnedRules = {}, aiCache = {}, accounts = [] } = e.data

      // Pre-compile custom rules once
      const customRulesCompiled = rules.map(r => {
        try { return { ...r, re: new RegExp(r.pattern, 'i') } }
        catch { return null }
      }).filter(Boolean)

      // Enrich with derived fields.
      // If merchant_key is already stored (persisted from a previous run),
      // keep it — it may have been corrected or AI-learned.
      // Only recompute when merchant_key is missing.
      const txs = rawTxs.map(tx => {
        if (tx.merchant_key) return { ...tx, label_norm: tx.label_norm || normalizeLabel(tx.label) }
        return { ...tx, ...deriveFields(tx.label) }
      })

      // Detect transfers (mutates in place for perf)
      let flaggedTransfers = []
      if (type === 'process') {
        flaggedTransfers = detectTransfersScored(txs)
      }

      // Categorize (skip already-categorized transfers)
      for (const tx of txs) {
        if (tx.isTransfer && tx.category === 'virement') continue
        const result = categorizeTx(tx, customRulesCompiled, learnedRules, aiCache)
        tx.category = result.category
        tx.subcategory = result.subcategory
        tx.confidence = result.confidence
        tx.reason = result.reason
        tx.method = result.method
      }

      // Compute aggregates + balances in single pass
      const { aggregates, healthScore, accountBalances } = computeAll(txs, accounts)

      // Coach insights
      const insights = txs.length > 0 ? generateInsights(txs, aggregates) : null

      // Low confidence merchants
      const lowConfidence = findLowConfidence(txs)

      self.postMessage({
        type: 'result',
        transactions: txs,
        aggregates,
        healthScore,
        insights,
        accountBalances,
        flaggedTransfers,
        lowConfidence,
      })
    }

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
