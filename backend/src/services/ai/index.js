/**
 * AI Provider orchestrator.
 * Tries providers in order with automatic fallback: Groq -> Together -> HuggingFace -> Mock.
 */

const groq = require('./groq');
const together = require('./together');
const huggingface = require('./huggingface');

const providers = [groq, together, huggingface];

/**
 * Try each available provider in order, falling back on failure.
 * @param {string} prompt
 * @param {Object} options - { systemPrompt, maxTokens, temperature }
 * @returns {Promise<Object>} { provider, model, content, error }
 */
async function generateWithFallback(prompt, options = {}) {
  const errors = [];

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;

    try {
      console.log(`[AI] Trying provider: ${provider.name}`);
      const result = await provider.generateInsights(prompt, options);
      console.log(`[AI] Success with provider: ${provider.name}`);
      return result;
    } catch (err) {
      console.warn(`[AI] Provider ${provider.name} failed:`, err.message);
      errors.push({ provider: provider.name, error: err.message });
    }
  }

  // All providers failed or none available
  return {
    provider: 'none',
    model: null,
    content: null,
    error: errors.length > 0
      ? `All providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`
      : 'No AI providers configured',
  };
}

/**
 * Get list of providers and their availability status.
 */
function getProvidersStatus() {
  return providers.map(p => ({
    name: p.name,
    available: p.isAvailable(),
    model: p.model,
  }));
}

/**
 * Get the currently active (first available) provider name.
 */
function getActiveProvider() {
  const active = providers.find(p => p.isAvailable());
  return active ? active.name : 'mock';
}

module.exports = {
  generateWithFallback,
  getProvidersStatus,
  getActiveProvider,
};
