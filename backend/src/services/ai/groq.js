/**
 * Groq AI provider.
 * Uses OpenAI-compatible API with LLaMA/Mixtral models.
 */

const axios = require('axios');
const config = require('../../config');
const AIProvider = require('./provider');

class GroqProvider extends AIProvider {
  constructor() {
    super('groq');
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.3-70b-versatile';
  }

  isAvailable() {
    return Boolean(config.ai?.groqApiKey);
  }

  async generateInsights(prompt, options = {}) {
    const response = await axios.post(
      this.apiUrl,
      {
        model: options.model || this.model,   // allow per-call model override
        messages: [
          { role: 'system', content: options.systemPrompt || '' },
          { role: 'user', content: prompt },
        ],
        max_tokens: options.maxTokens || 800,
        temperature: options.temperature ?? 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,   // 45s — categorization prompts can be large
      }
    );

    return {
      provider: this.name,
      model: this.model,
      content: response.data.choices[0]?.message?.content || '',
      error: null,
    };
  }
}

module.exports = new GroqProvider();
