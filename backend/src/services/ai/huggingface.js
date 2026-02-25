/**
 * HuggingFace Inference API provider.
 */

const axios = require('axios');
const config = require('../../config');
const AIProvider = require('./provider');

class HuggingFaceProvider extends AIProvider {
  constructor() {
    super('huggingface');
    this.model = 'mistralai/Mixtral-8x7B-Instruct-v0.1';
    this.apiUrl = `https://api-inference.huggingface.co/models/${this.model}`;
  }

  isAvailable() {
    return Boolean(config.ai?.huggingfaceApiKey);
  }

  async generateInsights(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || '';
    const fullPrompt = systemPrompt
      ? `<s>[INST] ${systemPrompt}\n\n${prompt} [/INST]`
      : `<s>[INST] ${prompt} [/INST]`;

    const response = await axios.post(
      this.apiUrl,
      {
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: options.maxTokens || 800,
          temperature: options.temperature || 0.7,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.huggingfaceApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content = Array.isArray(response.data)
      ? response.data[0]?.generated_text || ''
      : response.data?.generated_text || '';

    return {
      provider: this.name,
      model: this.model,
      content,
      error: null,
    };
  }
}

module.exports = new HuggingFaceProvider();
