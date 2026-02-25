/**
 * Insights file-based cache service.
 * Persists insights to disk so they survive server restarts.
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../data/insights-cache.json');

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[InsightsCache] Failed to load cache:', err.message);
    return null;
  }
}

function saveCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[InsightsCache] Failed to save cache:', err.message);
  }
}

function isCacheFresh(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cache = loadCache();
  if (!cache || !cache.updatedAt) return false;
  return (Date.now() - new Date(cache.updatedAt).getTime()) < maxAgeMs;
}

module.exports = { loadCache, saveCache, isCacheFresh };
