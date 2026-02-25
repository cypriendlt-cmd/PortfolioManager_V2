/**
 * Together AI provider.
 * Uses OpenAI-compatible API.
 */

const axios = require('axios');
const config = require('../../config');
const AIProvider = require('./provider');

class TogetherProvider extends AIProvider {
  constructor() {
    super('together');
    this.apiUrl = 'https://api.together.xyz/v1/chat/completions';
    this.model = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
  }

  isAvailable() {
    return Boolean(config.ai?.togetherApiKey);
  }

  async generateInsights(prompt, options = {}) {
    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        messages: [
          { role: 'system', content: options.systemPrompt || '' },
          { role: 'user', content: prompt },
        ],
        max_tokens: options.maxTokens || 800,
        temperature: options.temperature || 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.togetherApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
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

module.exports = new TogetherProvider();
