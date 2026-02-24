// Historical official rates for French regulated savings accounts (livrets).
// Rates are in percent (e.g. 2.4 means 2.4% annual).
// Sources: economie.gouv.fr, service-public.fr, arrêtés ministériels.

const RATE_HISTORY = {
  'livret-a': [
    { rate: 0.5, from: '2020-02-01' },
    { rate: 1.0, from: '2022-02-01' },
    { rate: 2.0, from: '2022-08-01' },
    { rate: 3.0, from: '2023-02-01' },
    { rate: 2.4, from: '2025-02-01' },
    { rate: 1.7, from: '2025-08-01' },
    { rate: 1.5, from: '2026-02-01' },
  ],
  'ldds': [
    { rate: 0.5, from: '2020-02-01' },
    { rate: 1.0, from: '2022-02-01' },
    { rate: 2.0, from: '2022-08-01' },
    { rate: 3.0, from: '2023-02-01' },
    { rate: 2.4, from: '2025-02-01' },
    { rate: 1.7, from: '2025-08-01' },
    { rate: 1.5, from: '2026-02-01' },
  ],
  'lep': [
    { rate: 1.0, from: '2020-02-01' },
    { rate: 2.2, from: '2022-02-01' },
    { rate: 4.6, from: '2022-08-01' },
    { rate: 6.1, from: '2023-02-01' },
    { rate: 5.0, from: '2023-08-01' },
    { rate: 4.0, from: '2024-02-01' },
    { rate: 3.5, from: '2025-02-01' },
    { rate: 2.7, from: '2025-08-01' },
    { rate: 2.5, from: '2026-02-01' },
  ],
  'cel': [
    { rate: 0.25, from: '2020-02-01' },
    { rate: 0.75, from: '2022-02-01' },
    { rate: 2.0, from: '2023-02-01' },
    { rate: 1.5, from: '2025-02-01' },
    { rate: 1.0, from: '2026-02-01' },
  ],
  'pel': [
    { rate: 1.0, from: '2020-01-01' },
    { rate: 2.0, from: '2023-01-01' },
    { rate: 2.25, from: '2024-01-01' },
    { rate: 1.75, from: '2025-01-01' },
    { rate: 2.0, from: '2026-01-01' },
  ],
};

/**
 * Get the applicable rate for a livret type on a given date.
 * Finds the last entry where from <= date.
 * @param {string} livretType - e.g. 'livret-a', 'ldds', 'lep', 'cel', 'pel'
 * @param {string|Date} date - date to look up
 * @returns {number|null} rate in percent, or null if unknown type or no rate for that date
 */
export function getRate(livretType, date) {
  const history = RATE_HISTORY[livretType];
  if (!history) return null;

  const dateStr = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  let applicable = null;
  for (const entry of history) {
    if (entry.from <= dateStr) {
      applicable = entry.rate;
    } else {
      break;
    }
  }
  return applicable;
}

/**
 * Get the full rate history for a livret type.
 * @param {string} livretType
 * @returns {Array} array of { rate, from }
 */
export function getRateHistory(livretType) {
  return RATE_HISTORY[livretType] || [];
}

/**
 * Get today's rate for a livret type.
 * @param {string} livretType
 * @returns {number|null}
 */
export function getCurrentRate(livretType) {
  return getRate(livretType, new Date());
}

/**
 * Get all current rates as { type: rate } map.
 * @returns {Object}
 */
export function getAllCurrentRates() {
  const result = {};
  for (const type of Object.keys(RATE_HISTORY)) {
    result[type] = getCurrentRate(type);
  }
  return result;
}
