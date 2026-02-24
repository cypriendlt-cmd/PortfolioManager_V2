/**
 * AI Insights service.
 * Generates market summaries and portfolio insights.
 * Uses OpenAI if API key is available, falls back to intelligent mock data.
 */

const axios = require('axios');
const config = require('../config');

/**
 * Generate a daily market summary for crypto and stocks.
 * Uses real OpenAI API if OPENAI_API_KEY is configured, otherwise returns mock data.
 *
 * @param {Object} [marketData] - Optional market context data to include in the prompt
 * @returns {Promise<Object>} Market summary and insights
 */
async function getDailyInsights(marketData = {}) {
  if (config.openai.apiKey) {
    return generateWithOpenAI(marketData);
  }
  return generateMockInsights(marketData);
}

/**
 * Generate insights using OpenAI GPT.
 *
 * @param {Object} marketData - Market context data
 * @returns {Promise<Object>} AI-generated insights
 */
async function generateWithOpenAI(marketData) {
  const fearGreedValue = marketData.fearGreed?.value;
  const prompt = buildPrompt(marketData);

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un analyste financier expert spécialisé dans les cryptomonnaies et les marchés boursiers.
Tu fournis des analyses concises, objectives et éducatives en français.
Tu rappelles toujours que tes analyses ne constituent pas des conseils d'investissement.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 800,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data.choices[0]?.message?.content || '';

  return {
    summary: content,
    source: 'openai',
    model: 'gpt-4o-mini',
    generatedAt: new Date().toISOString(),
    marketContext: {
      fearGreedValue,
    },
    disclaimer: 'Ces informations sont à titre éducatif uniquement et ne constituent pas des conseils d\'investissement.',
  };
}

/**
 * Build a prompt for the AI model based on available market data.
 *
 * @param {Object} marketData
 * @returns {string}
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
  prompt += `\nReste factuel et éducatif. Rappelle que ce n'est pas un conseil d'investissement.`;

  return prompt;
}

/**
 * Generate mock insights when no API key is configured.
 * Returns realistic-looking data for development/demo purposes.
 *
 * @param {Object} marketData - Market context (fear & greed value if available)
 * @returns {Object} Mock insights data
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
    marketContext: {
      fearGreedValue,
    },
    disclaimer: 'Ces informations sont à titre éducatif uniquement et ne constituent pas des conseils d\'investissement. Données simulées - configurez OPENAI_API_KEY pour des insights en temps réel.',
    note: 'Mode démonstration - configurez OPENAI_API_KEY dans .env pour activer les insights IA réels.',
  };
}

module.exports = {
  getDailyInsights,
};
