/**
 * Base provider interface for AI providers.
 * Each provider must implement: name, isAvailable(), generateInsights(prompt, options)
 */

class AIProvider {
  constructor(name) {
    this.name = name;
  }

  isAvailable() {
    throw new Error('isAvailable() must be implemented');
  }

  async generateInsights(prompt, options = {}) {
    throw new Error('generateInsights() must be implemented');
  }
}

module.exports = AIProvider;
