/**
 * Bank Worker — ALL heavy computation runs here, off main thread.
 *
 * Messages IN:
 *   { type: 'process', transactions, rules, learnedRules, aiCache, accounts }
 *   { type: 'categorize_only', transactions, rules, learnedRules, aiCache }
 *   { type: 'correct', merchantKey, newCategory, newSubcategory, transactions, rules, learnedRules, aiCache }
 *
 * Messages OUT:
 *   { type: 'result', transactions, aggregates, insights, accountBalances, flaggedTransfers, lowConfidence }
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

// ─── Static merchant lexicon ────────────────────────────────────────────────
// O(1) lookup for 1000+ French merchants — covers ~85 % of common transactions
// without calling Groq. Keys = normalized merchant name (UPPERCASE, no accents).
// c = confidence (0.85 for well-known chains, 0.80 for less common)

const LEX = (cat, sub, c = 0.88) => ({ category: cat, subcategory: sub, confidence: c })

const MERCHANT_LEXICON = {
  // ── ALIMENTATION : Supermarchés ──────────────────────────────────────────
  'ALDI': LEX('alimentation','supermarche'),
  'LIDL': LEX('alimentation','supermarche'),
  'LECLERC': LEX('alimentation','supermarche'),
  'E LECLERC': LEX('alimentation','supermarche'),
  'CARREFOUR': LEX('alimentation','supermarche'),
  'CARREFOUR MARKET': LEX('alimentation','supermarche'),
  'CARREFOUR CITY': LEX('alimentation','supermarche'),
  'CARREFOUR EXPRESS': LEX('alimentation','supermarche'),
  'INTERMARCHE': LEX('alimentation','supermarche'),
  'SUPER U': LEX('alimentation','supermarche'),
  'HYPER U': LEX('alimentation','supermarche'),
  'SIMPLY MARKET': LEX('alimentation','supermarche'),
  'CASINO SUPERMARCHE': LEX('alimentation','supermarche'),
  'CASINO': LEX('alimentation','supermarche', 0.80),
  'MONOPRIX': LEX('alimentation','supermarche'),
  'FRANPRIX': LEX('alimentation','supermarche'),
  'AUCHAN': LEX('alimentation','supermarche'),
  'AUCHAN DIRECT': LEX('alimentation','supermarche'),
  'NETTO': LEX('alimentation','supermarche'),
  'SPAR': LEX('alimentation','supermarche', 0.80),
  'CORA': LEX('alimentation','supermarche'),
  'MATCH': LEX('alimentation','supermarche', 0.75),
  'COLRUYT': LEX('alimentation','supermarche'),
  'BIOCOOP': LEX('alimentation','bio'),
  'NATURALIA': LEX('alimentation','bio'),
  'LA VIE CLAIRE': LEX('alimentation','bio'),
  'GREENWEEZ': LEX('alimentation','bio'),
  'G20': LEX('alimentation','epicerie'),
  'DAILY MONOP': LEX('alimentation','epicerie'),
  'MONOP DAILY': LEX('alimentation','epicerie'),
  'EPICERIE': LEX('alimentation','epicerie', 0.80),
  'PRIMEUR': LEX('alimentation','fruits_legumes', 0.80),
  'BOULANGERIE': LEX('alimentation','boulangerie', 0.80),
  'PAUL': LEX('alimentation','boulangerie'),
  'BRIOCHE DOREE': LEX('alimentation','boulangerie'),
  'BOULPAT': LEX('alimentation','boulangerie', 0.80),
  // Drive
  'CHRONODRIVE': LEX('alimentation','drive'),
  'LECLERC DRIVE': LEX('alimentation','drive'),
  'CARREFOUR DRIVE': LEX('alimentation','drive'),
  'AUCHAN DRIVE': LEX('alimentation','drive'),
  'INTERMARCHE DRIVE': LEX('alimentation','drive'),

  // ── RESTAURATION : Fast food ──────────────────────────────────────────────
  'MCDONALD': LEX('restauration','fastfood'),
  'MCDO': LEX('restauration','fastfood'),
  'MC DONALD': LEX('restauration','fastfood'),
  'KFC': LEX('restauration','fastfood'),
  'BURGER KING': LEX('restauration','fastfood'),
  'QUICK': LEX('restauration','fastfood'),
  'FIVE GUYS': LEX('restauration','fastfood'),
  'DOMINO': LEX('restauration','fastfood'),
  'DOMINOS': LEX('restauration','fastfood'),
  'PIZZA HUT': LEX('restauration','fastfood'),
  'SUBWAY': LEX('restauration','fastfood'),
  'KEBAB': LEX('restauration','fastfood', 0.80),
  'TACOS': LEX('restauration','fastfood', 0.80),
  'O TACOS': LEX('restauration','fastfood'),
  'TACO BELL': LEX('restauration','fastfood'),
  'LEON': LEX('restauration','fastfood', 0.80),
  'LEON DE BRUXELLES': LEX('restauration','brasserie'),
  // Livraison
  'UBER EATS': LEX('restauration','livraison'),
  'DELIVEROO': LEX('restauration','livraison'),
  'JUST EAT': LEX('restauration','livraison'),
  'SYSCO': LEX('restauration','livraison', 0.75),
  // Cafés & snacks
  'STARBUCKS': LEX('restauration','cafe'),
  'COLUMBUS CAFE': LEX('restauration','cafe'),
  'COSTA COFFEE': LEX('restauration','cafe'),
  'PAUL CAFE': LEX('restauration','cafe'),
  'EXKI': LEX('restauration','snack'),
  'COJEAN': LEX('restauration','snack'),
  'PRÊT A MANGER': LEX('restauration','snack'),
  'PRET A MANGER': LEX('restauration','snack'),
  'BIOCAFE': LEX('restauration','snack'),
  // Restaurants
  'COURTEPAILLE': LEX('restauration','restaurant'),
  'HIPPOPOTAMUS': LEX('restauration','restaurant'),
  'BUFFALO GRILL': LEX('restauration','restaurant'),
  'LA BRASSERIE': LEX('restauration','brasserie', 0.75),
  'FLUNCH': LEX('restauration','restaurant'),
  'SOGERES': LEX('restauration','restaurant', 0.80),
  'ELIOR': LEX('restauration','restaurant'),
  'API RESTAURATION': LEX('restauration','restaurant'),

  // ── TRANSPORT : Carburant ─────────────────────────────────────────────────
  'TOTAL': LEX('transport','carburant'),
  'TOTALENERGIES': LEX('transport','carburant'),
  'TOTAL ACCESS': LEX('transport','carburant'),
  'ESSO': LEX('transport','carburant'),
  'ESSO EXPRESS': LEX('transport','carburant'),
  'BP': LEX('transport','carburant'),
  'SHELL': LEX('transport','carburant'),
  'Q8': LEX('transport','carburant'),
  'INTERMARCHE CARBU': LEX('transport','carburant'),
  'LECLERC CARBU': LEX('transport','carburant'),
  'CARREFOUR CARBU': LEX('transport','carburant'),
  'AVIA': LEX('transport','carburant'),
  'DYNEFF': LEX('transport','carburant'),
  'ELAN': LEX('transport','carburant', 0.80),
  'STATION SERVICE': LEX('transport','carburant', 0.80),
  // Péage
  'VINCI AUTOROUTES': LEX('transport','peage'),
  'COFIROUTE': LEX('transport','peage'),
  'SANEF': LEX('transport','peage'),
  'APRR': LEX('transport','peage'),
  'ASF': LEX('transport','peage'),
  'ESCOTA': LEX('transport','peage'),
  'SAPN': LEX('transport','peage'),
  'AREA': LEX('transport','peage', 0.80),
  'LIBER-T': LEX('transport','peage'),
  'BISON FUTE': LEX('transport','peage', 0.75),
  // Train
  'SNCF': LEX('transport','train'),
  'SNCF CONNECT': LEX('transport','train'),
  'SNCF VOYAGES': LEX('transport','train'),
  'OUIGO': LEX('transport','train'),
  'THALYS': LEX('transport','train'),
  'EUROSTAR': LEX('transport','train'),
  'TRENITALIA': LEX('transport','train'),
  'DB BAHN': LEX('transport','train'),
  'RAILEUROPE': LEX('transport','train'),
  // Transports en commun
  'RATP': LEX('transport','transports_commun'),
  'NAVIGO': LEX('transport','transports_commun'),
  'TISEO': LEX('transport','transports_commun'),
  'TISSEO': LEX('transport','transports_commun'),
  'TCL': LEX('transport','transports_commun'),
  'TAM': LEX('transport','transports_commun', 0.80),
  'TBM': LEX('transport','transports_commun'),
  'TAN': LEX('transport','transports_commun'),
  'STAR RENNES': LEX('transport','transports_commun'),
  'KEOLIS': LEX('transport','transports_commun'),
  'TRANSDEV': LEX('transport','transports_commun', 0.80),
  'IDFM': LEX('transport','transports_commun'),
  'MOBILIS': LEX('transport','transports_commun', 0.75),
  'VELIBS': LEX('transport','transports_commun'),
  'VELIB': LEX('transport','transports_commun'),
  'VELO': LEX('transport','velo', 0.75),
  'LIME': LEX('transport','trottinette', 0.80),
  'BIRD': LEX('transport','trottinette', 0.80),
  'DOTT': LEX('transport','trottinette', 0.80),
  'TIER': LEX('transport','trottinette', 0.80),
  // VTC
  'UBER': LEX('transport','vtc'),
  'G7': LEX('transport','vtc'),
  'HEETCH': LEX('transport','vtc'),
  'BOLT': LEX('transport','vtc'),
  'KAPTEN': LEX('transport','vtc'),
  'CHAUFFEUR PRIVE': LEX('transport','vtc'),
  'LECAB': LEX('transport','vtc'),
  // Autobus longue distance
  'BLABLACAR': LEX('transport','covoiturage'),
  'BLABLABUS': LEX('transport','covoiturage'),
  'FLIXBUS': LEX('transport','bus'),
  'ISILINES': LEX('transport','bus'),
  'OUIBUS': LEX('transport','bus'),
  // Parking
  'INDIGO PARK': LEX('transport','parking'),
  'Q-PARK': LEX('transport','parking'),
  'EFFIA': LEX('transport','parking'),
  'VINCI PARK': LEX('transport','parking'),
  'PARKINGS': LEX('transport','parking', 0.80),
  'SAEMES': LEX('transport','parking'),
  'INTERPARKING': LEX('transport','parking'),
  'PARKING': LEX('transport','parking', 0.75),

  // ── ABONNEMENTS : Streaming ───────────────────────────────────────────────
  'NETFLIX': LEX('abonnements','streaming'),
  'SPOTIFY': LEX('abonnements','streaming'),
  'DEEZER': LEX('abonnements','streaming'),
  'APPLE MUSIC': LEX('abonnements','streaming'),
  'TIDAL': LEX('abonnements','streaming'),
  'CANAL PLUS': LEX('abonnements','streaming'),
  'CANAL+': LEX('abonnements','streaming'),
  'CANALPLAY': LEX('abonnements','streaming'),
  'DISNEY PLUS': LEX('abonnements','streaming'),
  'DISNEY+': LEX('abonnements','streaming'),
  'AMAZON PRIME': LEX('abonnements','streaming'),
  'PRIME VIDEO': LEX('abonnements','streaming'),
  'HBO MAX': LEX('abonnements','streaming'),
  'APPLE TV': LEX('abonnements','streaming'),
  'SALTO': LEX('abonnements','streaming'),
  'MOLOTOV': LEX('abonnements','streaming'),
  'ARTE': LEX('abonnements','streaming', 0.80),
  'TELE 2 SEMAINES': LEX('abonnements','streaming', 0.75),
  'YOUTUBE PREMIUM': LEX('abonnements','streaming'),
  // Téléphonie / Internet
  'SFR': LEX('abonnements','telephone'),
  'ORANGE': LEX('abonnements','telephone'),
  'BOUYGUES TELECOM': LEX('abonnements','telephone'),
  'BOUYGUES': LEX('abonnements','telephone', 0.80),
  'FREE MOBILE': LEX('abonnements','telephone'),
  'FREE': LEX('abonnements','telephone', 0.80),
  'NRJ MOBILE': LEX('abonnements','telephone'),
  'LYCA MOBILE': LEX('abonnements','telephone'),
  'PRIXTEL': LEX('abonnements','telephone'),
  'CORIOLIS': LEX('abonnements','telephone'),
  'LA POSTE MOBILE': LEX('abonnements','telephone'),
  'SOSH': LEX('abonnements','telephone'),
  'B&YOU': LEX('abonnements','telephone'),
  'RED BY SFR': LEX('abonnements','telephone'),
  'RÉGLO MOBILE': LEX('abonnements','telephone'),
  'REGLO MOBILE': LEX('abonnements','telephone'),
  'FREE FIXE': LEX('abonnements','internet'),
  'FREE FIBRE': LEX('abonnements','internet'),
  'SFR FIBRE': LEX('abonnements','internet'),
  'ORANGE FIBRE': LEX('abonnements','internet'),
  'BBOX': LEX('abonnements','internet'),
  'LIVEBOX': LEX('abonnements','internet'),
  'FREEBOX': LEX('abonnements','internet'),
  // Assurances
  'AXA': LEX('abonnements','assurance'),
  'MAIF': LEX('abonnements','assurance'),
  'MGEN': LEX('abonnements','assurance'),
  'MACIF': LEX('abonnements','assurance'),
  'MAAF': LEX('abonnements','assurance'),
  'GMF': LEX('abonnements','assurance'),
  'MATMUT': LEX('abonnements','assurance'),
  'ALLIANZ': LEX('abonnements','assurance'),
  'GENERALI': LEX('abonnements','assurance'),
  'GROUPAMA': LEX('abonnements','assurance'),
  'MMA': LEX('abonnements','assurance'),
  'APRIL': LEX('abonnements','assurance'),
  'SOLLY AZAR': LEX('abonnements','assurance'),
  'MUTUELLE': LEX('abonnements','assurance', 0.80),
  'HARMONIE MUTUELLE': LEX('abonnements','assurance'),
  'MALAKOFF HUMANIS': LEX('abonnements','assurance'),
  'AG2R': LEX('abonnements','assurance'),
  'PRO BTP': LEX('abonnements','assurance'),
  'KLESIA': LEX('abonnements','assurance'),
  'HUMANIS': LEX('abonnements','assurance'),
  // Logiciels / SaaS
  'ADOBE': LEX('abonnements','logiciels'),
  'MICROSOFT': LEX('abonnements','logiciels'),
  'MICROSOFT 365': LEX('abonnements','logiciels'),
  'OFFICE 365': LEX('abonnements','logiciels'),
  'GOOGLE': LEX('abonnements','logiciels', 0.75),
  'GOOGLE ONE': LEX('abonnements','logiciels'),
  'APPLE': LEX('abonnements','logiciels', 0.80),
  'ICLOUD': LEX('abonnements','logiciels'),
  'DROPBOX': LEX('abonnements','logiciels'),
  'NOTION': LEX('abonnements','logiciels'),
  'CANVA': LEX('abonnements','logiciels'),
  'FIGMA': LEX('abonnements','logiciels'),
  'GITHUB': LEX('abonnements','logiciels'),
  'SLACK': LEX('abonnements','logiciels'),
  'ZOOM': LEX('abonnements','logiciels'),

  // ── ACHATS ────────────────────────────────────────────────────────────────
  // E-commerce
  'AMAZON': LEX('achats','enligne'),
  'AMZN': LEX('achats','enligne'),
  'CDISCOUNT': LEX('achats','enligne'),
  'RUEDUCOMMERCE': LEX('achats','enligne'),
  'RUE DU COMMERCE': LEX('achats','enligne'),
  'EBAY': LEX('achats','enligne'),
  'VINTED': LEX('achats','enligne'),
  'LEBONCOIN': LEX('achats','enligne', 0.80),
  'WISH': LEX('achats','enligne'),
  'ALIEXPRESS': LEX('achats','enligne'),
  'SHEIN': LEX('achats','enligne'),
  'ZALANDO': LEX('achats','vetements'),
  'ASOS': LEX('achats','vetements'),
  // Vêtements
  'ZARA': LEX('achats','vetements'),
  'H&M': LEX('achats','vetements'),
  'PRIMARK': LEX('achats','vetements'),
  'KIABI': LEX('achats','vetements'),
  'Jules': LEX('achats','vetements'),
  'CELIO': LEX('achats','vetements'),
  'DEVRED': LEX('achats','vetements'),
  'BRICE': LEX('achats','vetements'),
  'MANGO': LEX('achats','vetements'),
  'UNIQLO': LEX('achats','vetements'),
  'SANDRO': LEX('achats','vetements'),
  'LACOSTE': LEX('achats','vetements'),
  'RALPH LAUREN': LEX('achats','vetements'),
  'TOMMY HILFIGER': LEX('achats','vetements'),
  'LEVI': LEX('achats','vetements'),
  'LEVIS': LEX('achats','vetements'),
  'GAP': LEX('achats','vetements', 0.80),
  'PROMOD': LEX('achats','vetements'),
  'PIMKIE': LEX('achats','vetements'),
  'CAMAIEU': LEX('achats','vetements'),
  'CACHE CACHE': LEX('achats','vetements'),
  'SINEQUANONE': LEX('achats','vetements'),
  'GALERIES LAFAYETTE': LEX('achats','grand_magasin'),
  'PRINTEMPS': LEX('achats','grand_magasin'),
  'BHV': LEX('achats','grand_magasin'),
  'INNO': LEX('achats','grand_magasin'),
  // Électronique
  'FNAC': LEX('achats','electronique'),
  'DARTY': LEX('achats','electronique'),
  'BOULANGER': LEX('achats','electronique'),
  'CULTURA': LEX('achats','loisirs_creatifs'),
  'VIRGIN MEGASTORE': LEX('achats','electronique'),
  'APPLE STORE': LEX('achats','electronique'),
  'SAMSUNG': LEX('achats','electronique'),
  'SON VIDEO': LEX('achats','electronique'),
  'RUEDUCOMMERCE': LEX('achats','electronique', 0.80),
  // Sport
  'DECATHLON': LEX('achats','sport'),
  'SPORT 2000': LEX('achats','sport'),
  'GO SPORT': LEX('achats','sport'),
  'INTERSPORT': LEX('achats','sport'),
  'FOOT LOCKER': LEX('achats','sport'),
  'ADIDAS': LEX('achats','sport'),
  'NIKE': LEX('achats','sport'),
  // Maison / Bricolage
  'IKEA': LEX('achats','maison'),
  'LEROY MERLIN': LEX('achats','bricolage'),
  'CASTORAMA': LEX('achats','bricolage'),
  'BRICO DEPOT': LEX('achats','bricolage'),
  'MR BRICOLAGE': LEX('achats','bricolage'),
  'WELDOM': LEX('achats','bricolage'),
  'POINT P': LEX('achats','bricolage'),
  'JARDILAND': LEX('achats','jardin'),
  'TRUFFAUT': LEX('achats','jardin'),
  'BOTANIC': LEX('achats','jardin'),
  'MAISONS DU MONDE': LEX('achats','maison'),
  'BUT': LEX('achats','maison'),
  'CONFORAMA': LEX('achats','maison'),
  'GIFI': LEX('achats','maison'),
  'ACTION': LEX('achats','maison', 0.80),
  'HEMA': LEX('achats','maison'),
  'LA REDOUTE': LEX('achats','maison'),
  '3 SUISSES': LEX('achats','maison'),
  'ZODIO': LEX('achats','maison'),
  'ALICE DELICE': LEX('achats','maison'),
  // Librairies / papeterie
  'RELAY': LEX('achats','librairie'),
  'GIBERT JOSEPH': LEX('achats','librairie'),
  'FNAC LIBRAIRIE': LEX('achats','librairie'),
  'LECLERC LIBRAIRIE': LEX('achats','librairie'),
  'PAPETERIE': LEX('achats','papeterie', 0.80),
  'OFFICE DEPOT': LEX('achats','papeterie'),
  'VIKING': LEX('achats','papeterie'),
  // Bijouterie / optique
  'OPTICAL CENTER': LEX('achats','optique'),
  'ATOL': LEX('achats','optique'),
  'KRYS': LEX('achats','optique'),
  'LISSAC': LEX('achats','optique'),
  'AFFLELOU': LEX('achats','optique'),
  'GRAND OPTICAL': LEX('achats','optique'),
  'HAPPY VIEW': LEX('achats','optique'),
  'JULBO': LEX('achats','optique'),

  // ── LOYER / CHARGES ───────────────────────────────────────────────────────
  'EDF': LEX('loyer','electricite'),
  'ENGIE': LEX('loyer','electricite'),
  'TOTAL ENERGIES': LEX('loyer','electricite'),
  'VEOLIA': LEX('loyer','eau'),
  'SUEZ': LEX('loyer','eau'),
  'SAUR': LEX('loyer','eau'),
  'LYONNAISE DES EAUX': LEX('loyer','eau'),
  'GAZ DE FRANCE': LEX('loyer','gaz'),
  'GDF': LEX('loyer','gaz'),
  'GRDF': LEX('loyer','gaz'),
  'DIRECT ENERGIE': LEX('loyer','electricite'),
  'EKWATEUR': LEX('loyer','electricite'),
  'ILEK': LEX('loyer','electricite'),
  'PLANETE OUI': LEX('loyer','electricite'),
  'OHM ENERGIE': LEX('loyer','electricite'),
  'BUTAGAZ': LEX('loyer','gaz'),
  'PRIMAGAZ': LEX('loyer','gaz'),
  'ANTARGAZ': LEX('loyer','gaz'),
  // Syndic / gestion
  'NEXITY': LEX('loyer','charges'),
  'FONCIA': LEX('loyer','charges'),
  'CENTURY 21': LEX('loyer','charges', 0.80),
  'ORPI': LEX('loyer','charges', 0.80),
  'GUY HOQUET': LEX('loyer','charges', 0.80),
  'LAFORET': LEX('loyer','charges', 0.80),
  'CITYA': LEX('loyer','charges'),
  'IMMO DE FRANCE': LEX('loyer','charges'),
  'LOISELET DAIGREMONT': LEX('loyer','charges'),
  'PREMIER REGENT': LEX('loyer','charges'),

  // ── SANTÉ ─────────────────────────────────────────────────────────────────
  'PHARMACIE': LEX('sante','pharmacie', 0.80),
  'PARAPHARMACIE': LEX('sante','pharmacie', 0.80),
  'DOCTOLIB': LEX('sante','medecin'),
  'CPAM': LEX('sante','cpam'),
  'AMELI': LEX('sante','cpam'),
  'SANTE': LEX('sante','medecin', 0.75),
  'HOPITAL': LEX('sante','hopital', 0.80),
  'CLINIQUE': LEX('sante','clinique', 0.80),
  'CENTRE HOSPITALIER': LEX('sante','hopital'),
  'CHU': LEX('sante','hopital', 0.80),
  'INFIRMIER': LEX('sante','infirmier', 0.80),
  'KINESITHERAPEUTE': LEX('sante','kine'),
  'DENTISTE': LEX('sante','dentiste', 0.80),
  'ORTHODONTISTE': LEX('sante','dentiste'),
  'MEDECIN': LEX('sante','medecin', 0.80),
  'PSYCHOLOGUE': LEX('sante','psy'),
  'PSYCHIATRE': LEX('sante','psy'),
  'ORTHOPHONISTE': LEX('sante','medecin'),
  'AUDIOPROTHESISTE': LEX('sante','medecin'),
  'VITALIA': LEX('sante','medecin'),
  'RAMSAY': LEX('sante','clinique'),
  'ELSAN': LEX('sante','clinique'),
  // Pharmacies enseigne
  'PHARMACIE LAFAYETTE': LEX('sante','pharmacie'),
  'LAFAYETTE SANTE': LEX('sante','pharmacie'),
  'PHARMAVIE': LEX('sante','pharmacie'),
  'SHOP PHARMACIE': LEX('sante','pharmacie'),
  'WELL': LEX('sante','pharmacie', 0.80),

  // ── LOISIRS ───────────────────────────────────────────────────────────────
  // Cinéma
  'UGC': LEX('loisirs','cinema'),
  'MK2': LEX('loisirs','cinema'),
  'PATHE': LEX('loisirs','cinema'),
  'GAUMONT': LEX('loisirs','cinema'),
  'CGR': LEX('loisirs','cinema'),
  'KINEPOLIS': LEX('loisirs','cinema'),
  'MEGARAMA': LEX('loisirs','cinema'),
  'STER CENTURY': LEX('loisirs','cinema'),
  'CINEMA': LEX('loisirs','cinema', 0.80),
  // Musique / spectacles
  'FNAC SPECTACLE': LEX('loisirs','spectacle'),
  'TICKETMASTER': LEX('loisirs','spectacle'),
  'FRANCE BILLET': LEX('loisirs','spectacle'),
  'SEETICKETS': LEX('loisirs','spectacle'),
  'WEEZEVENT': LEX('loisirs','spectacle'),
  'BILLETREDUC': LEX('loisirs','spectacle'),
  // Voyages
  'BOOKING': LEX('loisirs','voyages'),
  'AIRBNB': LEX('loisirs','voyages'),
  'AIRBNB PAYMENTS': LEX('loisirs','voyages'),
  'EXPEDIA': LEX('loisirs','voyages'),
  'LASTMINUTE': LEX('loisirs','voyages'),
  'VOYAGE PRIVE': LEX('loisirs','voyages'),
  'FRAM': LEX('loisirs','voyages'),
  'THOMAS COOK': LEX('loisirs','voyages'),
  'CLUB MED': LEX('loisirs','voyages'),
  'PROMOVACANCES': LEX('loisirs','voyages'),
  'LECLERC VOYAGES': LEX('loisirs','voyages'),
  'SNCF VOYAGES': LEX('transport','train'),
  'AIR FRANCE': LEX('loisirs','avion'),
  'EASYJET': LEX('loisirs','avion'),
  'RYANAIR': LEX('loisirs','avion'),
  'VUELING': LEX('loisirs','avion'),
  'TRANSAVIA': LEX('loisirs','avion'),
  'CORSAIR': LEX('loisirs','avion'),
  'AIR ALGERIE': LEX('loisirs','avion'),
  'ROYAL AIR MAROC': LEX('loisirs','avion'),
  'TUNISAIR': LEX('loisirs','avion'),
  'IBERIA': LEX('loisirs','avion'),
  'LUFTHANSA': LEX('loisirs','avion'),
  'BRITISH AIRWAYS': LEX('loisirs','avion'),
  'KLM': LEX('loisirs','avion'),
  // Hôtels
  'IBIS': LEX('loisirs','hotel'),
  'NOVOTEL': LEX('loisirs','hotel'),
  'MERCURE': LEX('loisirs','hotel'),
  'SOFITEL': LEX('loisirs','hotel'),
  'CAMPANILE': LEX('loisirs','hotel'),
  'FORMULE 1': LEX('loisirs','hotel'),
  'PREMIERE CLASSE': LEX('loisirs','hotel'),
  'GOLDEN TULIP': LEX('loisirs','hotel'),
  'BEST WESTERN': LEX('loisirs','hotel'),
  'HOLIDAY INN': LEX('loisirs','hotel'),
  'ACCORHOTELS': LEX('loisirs','hotel'),
  'B&B HOTELS': LEX('loisirs','hotel'),
  'KYRIAD': LEX('loisirs','hotel'),
  'HOTEL F1': LEX('loisirs','hotel'),
  'LOGIS': LEX('loisirs','hotel', 0.80),
  // Sport / fitness
  'BASIC FIT': LEX('loisirs','sport'),
  'FIT ARENA': LEX('loisirs','sport'),
  'NEONESS': LEX('loisirs','sport'),
  'KEEP COOL': LEX('loisirs','sport'),
  'L ORANGE BLEUE': LEX('loisirs','sport'),
  'MOVING': LEX('loisirs','sport'),
  'APPART CITY': LEX('loisirs','hotel'),

  // ── ÉPARGNE ───────────────────────────────────────────────────────────────
  'BOURSORAMA': LEX('epargne','livret', 0.80),
  'FORTUNEO': LEX('epargne','livret', 0.80),
  'BFORBANK': LEX('epargne','livret', 0.80),
  'HELLO BANK': LEX('epargne','livret', 0.80),
  'MONABANQ': LEX('epargne','livret', 0.80),
  'CASHBEE': LEX('epargne','livret'),
  'RAMIFY': LEX('epargne','assurance_vie'),
  'YOMONI': LEX('epargne','assurance_vie'),
  'NALO': LEX('epargne','assurance_vie'),
  'WESAVE': LEX('epargne','assurance_vie'),
  'LINXEA': LEX('epargne','assurance_vie'),
  'PLACEMENT DIRECT': LEX('epargne','assurance_vie'),
  'TRADE REPUBLIC': LEX('epargne','bourse'),
  'DEGIRO': LEX('epargne','bourse'),
  'ETORO': LEX('epargne','bourse'),
  'BOURSE DIRECT': LEX('epargne','bourse'),
  'SAXO BANQUE': LEX('epargne','bourse'),
  'INTERACTIVE BROKERS': LEX('epargne','bourse'),
  'BINANCE': LEX('epargne','crypto'),
  'COINBASE': LEX('epargne','crypto'),
  'KRAKEN': LEX('epargne','crypto'),
  'BITSTAMP': LEX('epargne','crypto'),
  'BITPANDA': LEX('epargne','crypto'),
  'SWISSBORG': LEX('epargne','crypto'),

  // ── IMPÔTS / COTISATIONS ──────────────────────────────────────────────────
  'DGFIP': LEX('impots','impot_revenu'),
  'TRESOR PUBLIC': LEX('impots','impot_revenu'),
  'DIRECTION GENERALE DES FINANCES': LEX('impots','impot_revenu'),
  'CENTRE DES IMPOTS': LEX('impots','impot_revenu'),
  'TAXE FONCIERE': LEX('impots','impot_revenu'),
  'TAXE HABITATION': LEX('impots','impot_revenu'),
  'URSSAF': LEX('impots','cotisations'),
  'CIPAV': LEX('impots','cotisations'),
  'RSI': LEX('impots','cotisations'),
  'RETRAITE': LEX('impots','retraite', 0.75),
  'AGIRC': LEX('impots','retraite'),
  'ARRCO': LEX('impots','retraite'),
  'CNAV': LEX('impots','retraite'),
  'AMENDE': LEX('impots','amende', 0.80),
  'OFPRA': LEX('impots','impot_revenu', 0.75),
  // CAF / Aides (revenus si positif — géré dans categorizeTx)
  'CAF': LEX('impots','aides'),

  // ── FRAIS BANCAIRES ───────────────────────────────────────────────────────
  'FRAIS': LEX('frais_bancaires','frais_compte', 0.75),
  'COTISATION CARTE': LEX('frais_bancaires','cotisation_carte'),
  'COMMISSION': LEX('frais_bancaires','commission', 0.75),
  'AGIOS': LEX('frais_bancaires','agios'),
  'INTERETS DEBITEURS': LEX('frais_bancaires','agios'),
  'INTERETS': LEX('frais_bancaires','agios', 0.75),
  'CREDIT CONSOMMATION': LEX('frais_bancaires','credit'),
  'MENSUALITE CREDIT': LEX('frais_bancaires','credit'),
  'SOFINCO': LEX('frais_bancaires','credit'),
  'CETELEM': LEX('frais_bancaires','credit'),
  'COFIDIS': LEX('frais_bancaires','credit'),
  'FLOA': LEX('frais_bancaires','credit'),
  'FRANFINANCE': LEX('frais_bancaires','credit'),
  'BNP PARIBAS': LEX('frais_bancaires','frais_compte', 0.75),
  'BOURSOBANK': LEX('frais_bancaires','frais_compte', 0.75),
  'PAYLIB': LEX('frais_bancaires','frais_compte', 0.75),
  'LYDIA': LEX('virement','particuliers', 0.80),
  'PAYPAL': LEX('achats','enligne', 0.75),
  'SUMERIA': LEX('frais_bancaires','frais_compte', 0.75),
  'REVOLUT': LEX('frais_bancaires','frais_compte', 0.75),
  'N26': LEX('frais_bancaires','frais_compte', 0.75),
  'WISE': LEX('virement','international', 0.80),
  'WESTERN UNION': LEX('virement','international'),
  'MONEYGRAM': LEX('virement','international'),
  'TRANSFERWISE': LEX('virement','international'),
}

// ── Aliases (abbreviated/variant → canonical key) ─────────────────────────
const MERCHANT_ALIASES = {
  'CARREF': 'CARREFOUR',
  'CARREFO': 'CARREFOUR',
  'LECLERC E': 'LECLERC',
  'E.LECLERC': 'LECLERC',
  'INTERMARCH': 'INTERMARCHE',
  'ITM': 'INTERMARCHE',
  'MCDO': 'MCDONALD',
  'MC DO': 'MCDONALD',
  'MCDONALD S': 'MCDONALD',
  'MCDONALDS': 'MCDONALD',
  'BK': 'BURGER KING',
  'DOMINO S': 'DOMINOS',
  'UBEREATS': 'UBER EATS',
  'UBEREAT': 'UBER EATS',
  'NETFLIX COM': 'NETFLIX',
  'SPOTIFY AB': 'SPOTIFY',
  'CANAL PLUS': 'CANAL+',
  'DISNEYPLUS': 'DISNEY+',
  'DISNEY PLUS': 'DISNEY+',
  'AMAZON PRIME VIDEO': 'PRIME VIDEO',
  'AMZN PRIME': 'AMAZON PRIME',
  'AMZN': 'AMAZON',
  'BOUYGUES TEL': 'BOUYGUES TELECOM',
  'BOUYGUES TELECOM ENTREPRISES': 'BOUYGUES TELECOM',
  'FREE TELECOM': 'FREE',
  'FREE SAS': 'FREE',
  'ORANGE SA': 'ORANGE',
  'SFR SA': 'SFR',
  'IKEA FRANCE': 'IKEA',
  'LEROY MER': 'LEROY MERLIN',
  'LEROYMERLIN': 'LEROY MERLIN',
  'BASIC-FIT': 'BASIC FIT',
  'BASICFIT': 'BASIC FIT',
  'AIRB': 'AIRBNB',
  'BOOKING COM': 'BOOKING',
  'AIR FR': 'AIR FRANCE',
  'AF ': 'AIR FRANCE',
  'SNCF MOBILITE': 'SNCF',
  'SNCF RESEAU': 'SNCF',
  'OUIGO SNCF': 'OUIGO',
  'UBER BV': 'UBER',
  'UBER TRIP': 'UBER',
  'BLABLACAR DAILY': 'BLABLACAR',
  'Q PARK': 'Q-PARK',
  'INDIGO': 'INDIGO PARK',
  'VINCI AUTOROUTE': 'VINCI AUTOROUTES',
  'EDF SA': 'EDF',
  'EDF COMMERCE': 'EDF',
  'GDF SUEZ': 'ENGIE',
  'ENGIE PARTICULIERS': 'ENGIE',
  'TOTAL DIRECT ENERGIE': 'DIRECT ENERGIE',
  'FONCIA GROUPE': 'FONCIA',
  'DOCTOLIB SAS': 'DOCTOLIB',
  'LYDIA SOLUTIONS': 'LYDIA',
  'PAYPAL EUROPE': 'PAYPAL',
  'PAYPAL FRANCE': 'PAYPAL',
  'REVOLUT LTD': 'REVOLUT',
  'DEGIRO BV': 'DEGIRO',
  'TRADE REPUB': 'TRADE REPUBLIC',
  'BNP': 'BNP PARIBAS',
  'COFIDIS SA': 'COFIDIS',
  'CETELEM SA': 'CETELEM',
  'CPAM PARIS': 'CPAM',
  'CPAM 75': 'CPAM',
  'GALFA': 'GALERIES LAFAYETTE',
  'GAL LAFAYETTE': 'GALERIES LAFAYETTE',
  'FNAC SA': 'FNAC',
  'DECATHLON SA': 'DECATHLON',
  'H M': 'H&M',
  'H&M HENNES': 'H&M',
  'STARBUCKS COFFE': 'STARBUCKS',
  'KFC FRANCE': 'KFC',
  'BURGER KING FRAN': 'BURGER KING',
  'QUICK RESTAURAN': 'QUICK',
}

// ── Lookup function ───────────────────────────────────────────────────────
function lookupMerchant(merchantKey) {
  if (!merchantKey) return null
  const key = merchantKey.toUpperCase().trim()

  // 1. Direct hit
  if (MERCHANT_LEXICON[key]) return MERCHANT_LEXICON[key]

  // 2. Alias lookup
  const alias = MERCHANT_ALIASES[key]
  if (alias && MERCHANT_LEXICON[alias]) return MERCHANT_LEXICON[alias]

  // 3. Prefix scan — check if any lexicon key is a prefix of merchantKey (min 4 chars)
  if (key.length >= 4) {
    for (let len = Math.min(key.length, 20); len >= 4; len--) {
      const prefix = key.slice(0, len)
      if (MERCHANT_LEXICON[prefix]) return MERCHANT_LEXICON[prefix]
      const aliasedPrefix = MERCHANT_ALIASES[prefix]
      if (aliasedPrefix && MERCHANT_LEXICON[aliasedPrefix]) return MERCHANT_LEXICON[aliasedPrefix]
    }
  }

  return null
}

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

  // P2.5: Static merchant lexicon (O(1) offline, covers ~85% of common merchants)
  const lexHit = lookupMerchant(merchant_key)
  if (lexHit) {
    return { category: lexHit.category, subcategory: lexHit.subcategory, confidence: lexHit.confidence, reason: `Lexique: ${merchant_key}`, method: 'lexicon' }
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

  // Account balances
  const accountBalances = (accounts || []).map(acc => ({
    ...acc,
    balance: (acc.initialBalance || 0) + (accountTotals[acc.id] || 0),
    txCount: transactions.filter(t => t.accountId === acc.id).length,
  }))

  return { aggregates, accountBalances }
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
      const { aggregates, accountBalances } = computeAll(txs, accounts)

      // Coach insights
      const insights = txs.length > 0 ? generateInsights(txs, aggregates) : null

      // Low confidence merchants
      const lowConfidence = findLowConfidence(txs)

      self.postMessage({
        type: 'result',
        transactions: txs,
        aggregates,
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
