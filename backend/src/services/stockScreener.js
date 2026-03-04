/**
 * Stock Screener Service - Claude AI powered stock analysis.
 * Proxies investment profile to Anthropic API and returns structured JSON.
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_RISK = ['low', 'medium', 'high'];
const VALID_HORIZON = ['short', 'medium', 'long'];
const VALID_SECTORS = ['technology', 'healthcare', 'energy', 'finance', 'consumer', 'industrial', 'real_estate', 'utilities'];
const VALID_GEOGRAPHY = ['usa', 'europe', 'global'];
const VALID_STYLE = ['growth', 'value', 'dividend', 'blend'];
const VALID_ESG = ['none', 'light', 'strict'];

const LABEL_MAP = {
  risk: { low: 'Faible', medium: 'Modéré', high: 'Élevé' },
  horizon: { short: 'Court terme (1-2 ans)', medium: 'Moyen terme (3-5 ans)', long: 'Long terme (5+ ans)' },
  sectors: {
    technology: 'Technologie', healthcare: 'Santé', energy: 'Énergie',
    finance: 'Finance', consumer: 'Consommation', industrial: 'Industrie',
    real_estate: 'Immobilier', utilities: 'Utilities',
  },
  geography: { usa: 'USA', europe: 'Europe', global: 'Global' },
  style: { growth: 'Growth', value: 'Value', dividend: 'Dividend', blend: 'Blend' },
  esg: { none: 'Aucune', light: 'ESG léger', strict: 'ESG strict' },
};

function validateProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== 'object') {
    return ['Le profil d\'investissement est requis.'];
  }

  if (!VALID_RISK.includes(profile.riskTolerance)) {
    errors.push(`riskTolerance invalide. Valeurs acceptées : ${VALID_RISK.join(', ')}`);
  }

  const amount = Number(profile.investmentAmount);
  if (!amount || amount < 100 || amount > 100_000_000) {
    errors.push('investmentAmount doit être entre 100 et 100 000 000.');
  }

  if (!VALID_HORIZON.includes(profile.horizon)) {
    errors.push(`horizon invalide. Valeurs acceptées : ${VALID_HORIZON.join(', ')}`);
  }

  if (!Array.isArray(profile.preferredSectors) || profile.preferredSectors.length === 0) {
    errors.push('preferredSectors doit contenir au moins un secteur.');
  } else {
    const invalid = profile.preferredSectors.filter(s => !VALID_SECTORS.includes(s));
    if (invalid.length > 0) {
      errors.push(`Secteurs invalides : ${invalid.join(', ')}`);
    }
  }

  if (!VALID_GEOGRAPHY.includes(profile.geography)) {
    errors.push(`geography invalide. Valeurs acceptées : ${VALID_GEOGRAPHY.join(', ')}`);
  }

  if (!VALID_STYLE.includes(profile.style)) {
    errors.push(`style invalide. Valeurs acceptées : ${VALID_STYLE.join(', ')}`);
  }

  if (!VALID_ESG.includes(profile.esg)) {
    errors.push(`esg invalide. Valeurs acceptées : ${VALID_ESG.join(', ')}`);
  }

  return errors;
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

function buildPrompt(profile) {
  const risk = LABEL_MAP.risk[profile.riskTolerance];
  const horizon = LABEL_MAP.horizon[profile.horizon];
  const sectors = profile.preferredSectors.map(s => LABEL_MAP.sectors[s]).join(', ');
  const geography = LABEL_MAP.geography[profile.geography];
  const style = LABEL_MAP.style[profile.style];
  const esg = LABEL_MAP.esg[profile.esg];
  const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(profile.investmentAmount);

  return `Tu es un analyste actions senior chez Goldman Sachs avec 20 ans d'expérience dans la sélection d'actions pour des clients fortunés.

J'ai besoin d'un framework complet de sélection d'actions adapté à mes objectifs d'investissement.

Analyse et fournis :

• Les 10 meilleures actions correspondant à mes critères avec leurs symboles boursiers
• Une analyse du ratio P/E comparée aux moyennes du secteur
• L'évolution du chiffre d'affaires sur les 5 dernières années
• Une évaluation de la santé du ratio dette/fonds propres pour chaque valeur
• Le rendement du dividende et un score de soutenabilité du dividende
• Une note sur l'avantage concurrentiel (faible, modéré, fort)
• Des objectifs de prix sur 12 mois en scénario haussier et baissier
• Une note de risque sur une échelle de 1 à 10 avec justification claire
• Des zones d'entrée recommandées et des suggestions de stop-loss

Présente le tout sous forme de rapport professionnel d'analyse actions avec un tableau récapitulatif.

Mon profil d'investissement :

Tolérance au risque : ${risk}
Montant investi : ${amount}
Horizon : ${horizon}
Secteurs préférés : ${sectors}
Zone géographique : ${geography}
Style d'investissement : ${style}
Contraintes ESG : ${esg}

IMPORTANT : Tu dois retourner UNIQUEMENT un JSON valide (sans markdown, sans backticks, sans texte avant ou après) suivant EXACTEMENT ce schéma :

{
  "meta": {
    "generatedAt": "ISO date string",
    "model": "claude",
    "profile": {
      "riskTolerance": "${profile.riskTolerance}",
      "investmentAmount": ${profile.investmentAmount},
      "horizon": "${profile.horizon}",
      "preferredSectors": ${JSON.stringify(profile.preferredSectors)},
      "geography": "${profile.geography}",
      "style": "${profile.style}",
      "esg": "${profile.esg}"
    }
  },
  "summary": {
    "totalStocks": 10,
    "averageRiskScore": <number 1-10>,
    "averageDividendYield": "<string %>",
    "marketOutlook": "<string: bullish/neutral/bearish>",
    "keyInsight": "<string 1-2 phrases>"
  },
  "top10": [
    {
      "rank": 1,
      "symbol": "<ticker>",
      "name": "<company name>",
      "sector": "<sector>",
      "country": "<country>",
      "currentPrice": <number>,
      "currency": "USD ou EUR",
      "peRatio": <number>,
      "sectorAvgPE": <number>,
      "revenueGrowth5Y": "<string %>",
      "debtToEquity": <number>,
      "dividendYield": "<string %>",
      "dividendSustainability": "<string: fort/modéré/faible>",
      "competitiveAdvantage": "<string: fort/modéré/faible>",
      "priceTarget12M": { "bull": <number>, "bear": <number> },
      "riskScore": <number 1-10>,
      "riskJustification": "<string>",
      "entryZone": { "low": <number>, "high": <number> },
      "stopLoss": <number>,
      "thesis": "<string 2-3 phrases>"
    }
  ],
  "table": {
    "headers": ["Rang","Symbole","Nom","Secteur","Prix","P/E","P/E Secteur","Div. Yield","Risque","Objectif Haussier","Objectif Baissier","Stop-Loss"],
    "rows": [
      [1,"TICKER","Nom","Secteur",prix,pe,sectorPE,"x%",risque,bull,bear,stopLoss]
    ]
  },
  "reportMarkdown": "<string : rapport complet en markdown avec titres, analyses détaillées, conclusions et avertissements>"
}

Aucun texte hors JSON. Pas de backticks. Pas de commentaires.`;
}

// ─── Claude API Call ─────────────────────────────────────────────────────────

async function analyzeStocks(profile, userApiKey) {
  const apiKey = userApiKey || config.ai.anthropicApiKey;
  if (!apiKey) {
    throw new Error('Clé API Anthropic non configurée. Ajoutez-la dans les Paramètres.');
  }

  const client = new Anthropic({ apiKey });

  const prompt = buildPrompt(profile);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const rawContent = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Strip markdown code fences if present
  let cleaned = rawContent.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[StockScreener] Failed to parse Claude response as JSON');
    console.error('[StockScreener] Raw response (first 500 chars):', cleaned.substring(0, 500));
    throw new Error('Claude a retourné une réponse non-JSON. Réessayez.');
  }

  // Basic structure validation
  if (!parsed.meta || !parsed.summary || !Array.isArray(parsed.top10) || !parsed.table || !parsed.reportMarkdown) {
    throw new Error('La réponse JSON de Claude ne respecte pas le schéma attendu.');
  }

  return {
    ...parsed,
    provider: 'anthropic',
    model: message.model,
    usage: message.usage,
  };
}

module.exports = {
  validateProfile,
  analyzeStocks,
  VALID_SECTORS,
  VALID_RISK,
  VALID_HORIZON,
  VALID_GEOGRAPHY,
  VALID_STYLE,
  VALID_ESG,
};
