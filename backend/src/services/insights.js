/**
 * AI Insights service.
 * Generates market summaries and portfolio insights.
 * Uses free-tier AI providers with automatic fallback, or mock data if none configured.
 */

const aiOrchestrator = require('./ai');

const SYSTEM_PROMPT = `Tu es un analyste financier expert spécialisé dans les cryptomonnaies et les marchés boursiers.
Tu fournis des analyses concises, objectives et éducatives en français.
Tu rappelles toujours que tes analyses ne constituent pas des conseils d'investissement.`;

/**
 * Generate a daily market summary for crypto and stocks.
 *
 * @param {Object} [marketData] - Optional market context data to include in the prompt
 * @returns {Promise<Object>} Market summary and insights
 */
async function getDailyInsights(marketData = {}) {
  const prompt = buildPrompt(marketData);
  const fearGreedValue = marketData.fearGreed?.value;

  const result = await aiOrchestrator.generateWithFallback(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 800,
    temperature: 0.7,
  });

  // If AI generated content, return it
  if (result.content) {
    return {
      summary: result.content,
      source: result.provider,
      model: result.model,
      generatedAt: new Date().toISOString(),
      marketContext: { fearGreedValue },
      disclaimer: 'Ces informations sont à titre éducatif uniquement et ne constituent pas des conseils d\'investissement.',
    };
  }

  // Fallback to mock
  return generateMockInsights(marketData);
}

/**
 * Build a prompt for the AI model based on available market data.
 */
function buildPrompt(marketData) {
  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let prompt = `Génère un résumé du marché financier pour le ${date}.\n\n`;

  if (marketData.fearGreed) {
    prompt += `Index Peur & Cupidité Crypto: ${marketData.fearGreed.value}/100 (${marketData.fearGreed.classification})\n`;
  }
  if (marketData.stockFearGreed) {
    prompt += `Index Peur & Cupidité Bourse (CNN): ${marketData.stockFearGreed.value}/100 (${marketData.stockFearGreed.classification})\n`;
  }
  if (marketData.btcPrice) {
    prompt += `Prix Bitcoin: ${marketData.btcPrice} EUR\n`;
  }
  if (marketData.ethPrice) {
    prompt += `Prix Ethereum: ${marketData.ethPrice} EUR\n`;
  }

  prompt += `\nFournis:\n`;
  prompt += `1. Un résumé du sentiment de marché actuel (2-3 phrases)\n`;
  prompt += `2. Les principaux points d'attention pour les investisseurs (3 points)\n`;
  prompt += `3. Un conseil général sur la gestion de portefeuille dans ce contexte (1-2 phrases)\n`;
  prompt += `4. Cite 2-3 sources ou articles récents pertinents liés au marché (nom de la source, sujet abordé)\n`;
  prompt += `\nReste factuel et éducatif. Rappelle que ce n'est pas un conseil d'investissement.`;

  return prompt;
}

/**
 * Generate mock insights when no AI provider is available.
 */
function generateMockInsights(marketData) {
  const fearGreedValue = marketData.fearGreed?.value || 50;
  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let summaryText = '';

  if (fearGreedValue <= 25) {
    summaryText = `**Analyse du marché - ${date}**\n\n` +
      `**Sentiment de marché** : Le marché traverse une période de peur extrême avec un indice de ${fearGreedValue}/100. ` +
      `Ce type de sentiment est souvent caractéristique de capitulations ou de corrections majeures. ` +
      `Les investisseurs à long terme peuvent voir ces niveaux comme des opportunités historiques.\n\n` +
      `**Points d'attention** :\n` +
      `• La volatilité est élevée - gérez bien votre exposition au risque\n` +
      `• Les actifs défensifs (obligations, or) peuvent servir de refuge\n` +
      `• Un DCA (Dollar Cost Averaging) peut limiter le timing risk\n\n` +
      `**Gestion de portefeuille** : Dans un contexte de peur extrême, maintenir sa stratégie long terme et éviter les décisions émotionnelles est crucial.`;
  } else if (fearGreedValue <= 50) {
    summaryText = `**Analyse du marché - ${date}**\n\n` +
      `**Sentiment de marché** : Le marché affiche un sentiment de prudence avec un indice de ${fearGreedValue}/100. ` +
      `Cette zone de peur modérée suggère une incertitude chez les investisseurs mais sans panique généralisée. ` +
      `Les fondamentaux restent le principal indicateur à surveiller.\n\n` +
      `**Points d'attention** :\n` +
      `• Diversification recommandée entre classes d'actifs\n` +
      `• Surveiller les niveaux de support techniques clés\n` +
      `• Les cryptomonnaies restent volatiles - position sizing appropriée\n\n` +
      `**Gestion de portefeuille** : Un rééquilibrage périodique permet de maintenir l'allocation cible tout en profitant des variations de marché.`;
  } else if (fearGreedValue <= 75) {
    summaryText = `**Analyse du marché - ${date}**\n\n` +
      `**Sentiment de marché** : Le marché est en phase de cupidité modérée avec un indice de ${fearGreedValue}/100. ` +
      `Les investisseurs montrent de l'optimisme, ce qui soutient les prix mais augmente aussi les risques de correction. ` +
      `La prudence reste de mise malgré le momentum positif.\n\n` +
      `**Points d'attention** :\n` +
      `• Les valorisations élevées méritent attention\n` +
      `• Prendre des profits partiels sur les positions très gagnantes peut être judicieux\n` +
      `• Les flux d'entrée retail sont souvent un signal contra-cyclique\n\n` +
      `**Gestion de portefeuille** : Dans les phases de cupidité, maintenir des stops loss et éviter l'effet de levier excessif protège le capital accumulé.`;
  } else {
    summaryText = `**Analyse du marché - ${date}**\n\n` +
      `**Sentiment de marché** : Le marché est en cupidité extrême avec un indice de ${fearGreedValue}/100. ` +
      `Historiquement, ces niveaux précèdent souvent des corrections. La prudence est de mise. ` +
      `"Soyez craintif quand les autres sont avides" - Warren Buffett.\n\n` +
      `**Points d'attention** :\n` +
      `• Risque élevé de correction à court terme\n` +
      `• Éviter les achats impulsifs motivés par la FOMO\n` +
      `• Sécuriser une partie des gains réalisés\n\n` +
      `**Gestion de portefeuille** : La cupidité extrême est le moment de revoir son allocation et de s'assurer que l'exposition au risque reste dans les limites définies par votre plan d'investissement.`;
  }

  return {
    summary: summaryText,
    source: 'mock',
    model: null,
    generatedAt: new Date().toISOString(),
    marketContext: { fearGreedValue },
    disclaimer: 'Ces informations sont à titre éducatif uniquement et ne constituent pas des conseils d\'investissement. Données simulées - configurez une clé API (GROQ_API_KEY, TOGETHER_API_KEY ou HUGGINGFACE_API_KEY) pour des insights IA réels.',
    note: 'Mode démonstration - configurez une clé API IA dans .env pour activer les insights IA réels.',
  };
}

/**
 * Analyze a user's portfolio using AI with a detailed financial analyst prompt.
 * @param {Object} portfolioData - The full portfolio data from the frontend
 * @returns {Promise<Object>} Structured analysis
 */
async function analyzePortfolio(portfolioData) {
  const portfolioJson = JSON.stringify(portfolioData, null, 2);

  const prompt = `Tu es un analyste financier expérimenté travaillant sur les marchés financiers
(actions, ETF, crypto-actifs, allocation patrimoniale).

À partir des données du portefeuille ci-dessous, tu dois :
1) Fournir une synthèse claire et factuelle du portefeuille
2) Analyser la diversification (actifs, classes, zones, risques)
3) Identifier les sur-expositions et sous-expositions potentielles
4) Donner des conseils prudents d'amélioration de l'allocation
5) Expliquer tes recommandations de manière pédagogique

Contraintes :
- Pas de promesse de rendement
- Pas de conseil d'investissement personnalisé
- Ton neutre, professionnel et responsable
- Raisonnement basé sur la diversification et la gestion du risque

Réponds en JSON valide avec cette structure exacte :
{
  "synthesis": "...",
  "diversification": "...",
  "overexposures": "...",
  "recommendations": "..."
}

Données du portefeuille :
${portfolioJson}`;

  const result = await aiOrchestrator.generateWithFallback(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1500,
    temperature: 0.7,
  });

  if (result.content) {
    // Try to parse JSON from the AI response
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          synthesis: parsed.synthesis || '',
          diversification: parsed.diversification || '',
          overexposures: parsed.overexposures || '',
          recommendations: parsed.recommendations || '',
          provider: result.provider,
          model: result.model,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // If JSON parsing fails, return raw content as synthesis
    }
    return {
      synthesis: result.content,
      diversification: '',
      overexposures: '',
      recommendations: '',
      provider: result.provider,
      model: result.model,
      generatedAt: new Date().toISOString(),
    };
  }

  // No AI available
  return {
    synthesis: null,
    provider: 'none',
    error: result.error || 'No AI providers configured',
  };
}

/**
 * Generate a compact dashboard summary for a portfolio.
 * Each field must be a single short sentence (max ~15 words).
 * Completely independent from the detailed Insights page analysis.
 */
async function getDashboardSummary(portfolioData) {
  const portfolioJson = JSON.stringify(portfolioData, null, 2);

  const prompt = `Tu es un expert financier senior. Analyse ce portefeuille et donne un résumé ULTRA COURT pour un dashboard.

RÈGLES STRICTES :
- Chaque champ = UNE SEULE phrase courte (10-15 mots MAX)
- Style télégraphique, direct, comme un titre de journal financier
- Pas de paragraphe, pas de liste, pas de détail
- Chiffres et % quand pertinent
- Ton factuel et neutre

Réponds UNIQUEMENT en JSON valide :
{
  "synthesis": "phrase courte résumant l'état global du portefeuille",
  "diversification": "phrase courte sur la qualité de diversification",
  "overexposures": "phrase courte sur les sur/sous-expositions détectées",
  "recommendations": "phrase courte avec la recommandation prioritaire"
}

Portefeuille :
${portfolioJson}`;

  const result = await aiOrchestrator.generateWithFallback(prompt, {
    systemPrompt: 'Tu es un analyste financier expert. Réponds uniquement en JSON. Sois extrêmement concis.',
    maxTokens: 300,
    temperature: 0.5,
  });

  if (result.content) {
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          synthesis: parsed.synthesis || '',
          diversification: parsed.diversification || '',
          overexposures: parsed.overexposures || '',
          recommendations: parsed.recommendations || '',
          provider: result.provider,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch {}
    return {
      synthesis: result.content.slice(0, 80),
      diversification: '',
      overexposures: '',
      recommendations: '',
      provider: result.provider,
      generatedAt: new Date().toISOString(),
    };
  }

  return { synthesis: null, provider: 'none' };
}

module.exports = {
  getDailyInsights,
  analyzePortfolio,
  getDashboardSummary,
};
