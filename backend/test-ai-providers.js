/**
 * Test script for AI provider architecture.
 * Tests individual providers, orchestrator fallback, insights service, and error handling.
 */

const path = require('path');

// Track results
const results = { passed: 0, failed: 0, tests: [] };

function pass(name, detail) {
  results.passed++;
  results.tests.push({ name, status: 'PASS', detail });
  console.log(`  PASS: ${name}${detail ? ' - ' + detail : ''}`);
}

function fail(name, detail) {
  results.failed++;
  results.tests.push({ name, status: 'FAIL', detail });
  console.log(`  FAIL: ${name} - ${detail}`);
}

// ========== SECTION 1: Config ==========
console.log('\n=== 1. Config ===');
try {
  const config = require('./src/config');
  if (config.ai && 'groqApiKey' in config.ai && 'togetherApiKey' in config.ai && 'huggingfaceApiKey' in config.ai) {
    pass('Config has ai section with all 3 keys');
  } else {
    fail('Config ai section', 'Missing expected keys');
  }
} catch (e) {
  fail('Config load', e.message);
}

// ========== SECTION 2: Base Provider ==========
console.log('\n=== 2. Base AIProvider ===');
try {
  const AIProvider = require('./src/services/ai/provider');
  const p = new AIProvider('test');
  if (p.name === 'test') pass('AIProvider constructor sets name');
  else fail('AIProvider constructor', 'name not set');

  try { p.isAvailable(); fail('isAvailable should throw', 'did not throw'); }
  catch (e) { pass('isAvailable throws (not implemented)'); }

  p.generateInsights('x').catch(e => {
    if (e.message.includes('must be implemented')) pass('generateInsights throws (not implemented)');
    else fail('generateInsights throw message', e.message);
  });
} catch (e) {
  fail('Base AIProvider', e.message);
}

// ========== SECTION 3: Individual Providers (structure) ==========
console.log('\n=== 3. Individual Providers (structure) ===');
const providerFiles = ['groq', 'together', 'huggingface'];
for (const name of providerFiles) {
  try {
    const provider = require(`./src/services/ai/${name}`);
    if (provider.name === name) pass(`${name} provider name`);
    else fail(`${name} provider name`, `got '${provider.name}'`);

    if (typeof provider.isAvailable === 'function') pass(`${name} has isAvailable()`);
    else fail(`${name} isAvailable`, 'not a function');

    if (typeof provider.generateInsights === 'function') pass(`${name} has generateInsights()`);
    else fail(`${name} generateInsights`, 'not a function');

    if (provider.model && typeof provider.model === 'string') pass(`${name} has model: ${provider.model}`);
    else fail(`${name} model`, 'missing or invalid');

    if (provider.apiUrl && provider.apiUrl.startsWith('https://')) pass(`${name} apiUrl: ${provider.apiUrl}`);
    else fail(`${name} apiUrl`, `invalid: ${provider.apiUrl}`);
  } catch (e) {
    fail(`${name} provider load`, e.message);
  }
}

// ========== SECTION 4: isAvailable with no API keys ==========
console.log('\n=== 4. isAvailable() with no API keys ===');
// Since no env vars are set, all should be unavailable
const groq = require('./src/services/ai/groq');
const together = require('./src/services/ai/together');
const huggingface = require('./src/services/ai/huggingface');
const config = require('./src/config');

for (const [prov, keyName] of [[groq, 'groqApiKey'], [together, 'togetherApiKey'], [huggingface, 'huggingfaceApiKey']]) {
  const keyValue = config.ai[keyName];
  const available = prov.isAvailable();
  if (!keyValue && !available) {
    pass(`${prov.name} unavailable when key is empty`);
  } else if (keyValue && available) {
    pass(`${prov.name} available (key is set)`);
  } else {
    fail(`${prov.name} isAvailable consistency`, `key='${keyValue}' available=${available}`);
  }
}

// ========== SECTION 5: Orchestrator ==========
console.log('\n=== 5. Orchestrator ===');
const orchestrator = require('./src/services/ai');

// Test getProvidersStatus
try {
  const status = orchestrator.getProvidersStatus();
  if (Array.isArray(status) && status.length === 3) pass('getProvidersStatus returns 3 providers');
  else fail('getProvidersStatus', `expected 3, got ${status?.length}`);

  for (const s of status) {
    if ('name' in s && 'available' in s && 'model' in s) {
      pass(`Provider status has correct shape: ${s.name}`);
    } else {
      fail(`Provider status shape for ${s.name}`, JSON.stringify(s));
    }
  }
} catch (e) {
  fail('getProvidersStatus', e.message);
}

// Test getActiveProvider
try {
  const active = orchestrator.getActiveProvider();
  const anyAvailable = [groq, together, huggingface].some(p => p.isAvailable());
  if (!anyAvailable && active === 'mock') {
    pass('getActiveProvider returns "mock" when none available');
  } else if (anyAvailable) {
    pass(`getActiveProvider returns "${active}" (a key is configured)`);
  } else {
    fail('getActiveProvider', `expected "mock", got "${active}"`);
  }
} catch (e) {
  fail('getActiveProvider', e.message);
}

// Test generateWithFallback - no providers available
(async () => {
  console.log('\n=== 6. Fallback chain (no providers) ===');
  try {
    // If no providers have keys, should return provider: 'none'
    const anyAvailable = [groq, together, huggingface].some(p => p.isAvailable());
    if (!anyAvailable) {
      const result = await orchestrator.generateWithFallback('Test prompt');
      if (result.provider === 'none' && result.content === null) {
        pass('generateWithFallback returns none/null when no providers');
      } else {
        fail('generateWithFallback no providers', JSON.stringify(result));
      }
      if (result.error === 'No AI providers configured') {
        pass('Error message is correct for no providers');
      } else {
        fail('Error message', result.error);
      }
    } else {
      pass('Skipping no-providers test (a key is set)');
    }
  } catch (e) {
    fail('generateWithFallback', e.message);
  }

  // ========== SECTION 7: Insights Service ==========
  console.log('\n=== 7. Insights Service ===');
  try {
    const insights = require('./src/services/insights');

    // Test getDailyInsights
    const daily = await insights.getDailyInsights({ fearGreed: { value: 30, classification: 'Fear' } });
    if (daily.summary && typeof daily.summary === 'string') pass('getDailyInsights returns summary');
    else fail('getDailyInsights summary', 'missing');

    if (daily.source) pass(`getDailyInsights source: ${daily.source}`);
    else fail('getDailyInsights source', 'missing');

    if (daily.generatedAt) pass('getDailyInsights has generatedAt');
    else fail('getDailyInsights generatedAt', 'missing');

    if (daily.disclaimer) pass('getDailyInsights has disclaimer');
    else fail('getDailyInsights disclaimer', 'missing');

    // When no AI, should be mock
    const anyAvailable = [groq, together, huggingface].some(p => p.isAvailable());
    if (!anyAvailable) {
      if (daily.source === 'mock') pass('getDailyInsights falls back to mock');
      else fail('getDailyInsights fallback', `source is "${daily.source}" instead of "mock"`);
    }

    // Test different fear/greed ranges for mock
    for (const val of [10, 40, 60, 90]) {
      const result = await insights.getDailyInsights({ fearGreed: { value: val, classification: 'test' } });
      if (result.summary && result.summary.includes(String(val))) {
        pass(`Mock insight for fearGreed=${val} includes value`);
      } else if (result.source !== 'mock') {
        pass(`Insight for fearGreed=${val} from AI (not mock)`);
      } else {
        fail(`Mock insight fearGreed=${val}`, 'value not in summary');
      }
    }

    // Test analyzePortfolio
    const analysis = await insights.analyzePortfolio({ total: 10000, assets: [{ name: 'BTC', value: 5000 }] });
    if (analysis.provider) pass(`analyzePortfolio returns provider: ${analysis.provider}`);
    else fail('analyzePortfolio', 'missing provider');

    if (!anyAvailable) {
      if (analysis.provider === 'none' && analysis.error) {
        pass('analyzePortfolio returns error when no AI');
      } else {
        fail('analyzePortfolio no AI', JSON.stringify(analysis));
      }
    }
  } catch (e) {
    fail('Insights Service', e.message);
  }

  // ========== SECTION 8: Providers endpoint logic ==========
  console.log('\n=== 8. Providers endpoint logic ===');
  try {
    const status = orchestrator.getProvidersStatus();
    const active = orchestrator.getActiveProvider();
    const response = { providers: status, active };

    if (response.providers && response.active) pass('Providers endpoint response shape OK');
    else fail('Providers endpoint shape', JSON.stringify(response));

    if (typeof response.active === 'string') pass(`Active provider: "${response.active}"`);
    else fail('Active provider type', typeof response.active);
  } catch (e) {
    fail('Providers endpoint', e.message);
  }

  // ========== SECTION 9: API URL validation ==========
  console.log('\n=== 9. API URL validation ===');
  const expectedUrls = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    together: 'https://api.together.xyz/v1/chat/completions',
    huggingface: 'https://api-inference.huggingface.co/models/',
  };
  for (const [name, prefix] of Object.entries(expectedUrls)) {
    const prov = require(`./src/services/ai/${name}`);
    if (prov.apiUrl.startsWith(prefix)) pass(`${name} API URL correct`);
    else fail(`${name} API URL`, `expected prefix "${prefix}", got "${prov.apiUrl}"`);
  }

  // ========== SECTION 10: Model name validation ==========
  console.log('\n=== 10. Model name validation ===');
  const knownModels = {
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'llama3-70b-8192'],
    together: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', 'meta-llama/Llama-3-8b-chat-hf'],
    huggingface: ['mistralai/Mixtral-8x7B-Instruct-v0.1'],
  };
  for (const [name, validModels] of Object.entries(knownModels)) {
    const prov = require(`./src/services/ai/${name}`);
    if (validModels.includes(prov.model)) pass(`${name} model "${prov.model}" is known/valid`);
    else fail(`${name} model`, `"${prov.model}" not in known list (may still be valid)`);
  }

  // ========== Summary ==========
  console.log('\n============================');
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed, ${results.passed + results.failed} total`);
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    for (const t of results.tests.filter(t => t.status === 'FAIL')) {
      console.log(`  - ${t.name}: ${t.detail}`);
    }
  }
  console.log('============================\n');

  process.exit(results.failed > 0 ? 1 : 0);
})();
