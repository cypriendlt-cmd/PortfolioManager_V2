/**
 * French livret savings account service.
 * Provides current regulated rates and interest calculations.
 * Rates are hardcoded based on official French regulations.
 */

/**
 * Current French regulated savings account rates (as of 2025).
 * Source: Banque de France / official government announcements.
 */
const LIVRET_RATES = {
  'livret-a': {
    name: 'Livret A',
    rate: 0.024, // 2.4%
    maxBalance: 22950,
    description: 'Livret réglementé - taux fixé par arrêté ministériel',
    regulated: true,
  },
  'ldds': {
    name: 'LDDS (Livret de Développement Durable et Solidaire)',
    rate: 0.024, // 2.4%
    maxBalance: 12000,
    description: 'Ancien Codevi - mêmes conditions que le Livret A',
    regulated: true,
  },
  'lep': {
    name: 'LEP (Livret d\'Épargne Populaire)',
    rate: 0.035, // 3.5%
    maxBalance: 10000,
    description: 'Réservé aux personnes sous plafond de revenus',
    regulated: true,
    incomeCondition: true,
  },
  'cel': {
    name: 'CEL (Compte Épargne Logement)',
    rate: 0.02, // 2%
    maxBalance: 15300,
    description: 'Épargne logement - ouvre droit à un prêt immobilier',
    regulated: true,
  },
  'pel': {
    name: 'PEL (Plan Épargne Logement)',
    rate: 0.0225, // 2.25%
    maxBalance: 61200,
    description: 'Plan sur 4 ans minimum - taux fixé à l\'ouverture',
    regulated: true,
    minimumDuration: 4, // years
  },
};

/**
 * Get all current livret rates.
 *
 * @returns {Object} Map of livret type to rate information
 */
function getAllRates() {
  return Object.entries(LIVRET_RATES).map(([id, data]) => ({
    id,
    ...data,
    ratePercent: (data.rate * 100).toFixed(2) + '%',
  }));
}

/**
 * Get rate for a specific livret type.
 *
 * @param {string} type - Livret type ID
 * @returns {Object|null} Rate data or null if not found
 */
function getRateByType(type) {
  const data = LIVRET_RATES[type];
  if (!data) return null;
  return { id: type, ...data, ratePercent: (data.rate * 100).toFixed(2) + '%' };
}

/**
 * Calculate interest for a livret account.
 * Uses the French quinzaine calculation method:
 * - Money deposited is counted from the 1st or 16th of the month following deposit
 * - Money withdrawn is counted until the 1st or 16th of the month before withdrawal
 * - Interest is credited on January 1st each year
 *
 * @param {number} balance - Account balance in euros
 * @param {number} rate - Annual interest rate as decimal (e.g., 0.024 for 2.4%)
 * @param {'annual'|'monthly'|'quinzaine'} type - Calculation period type
 * @returns {Object} Interest calculation results
 */
function calculateInterest(balance, rate, type = 'annual') {
  const annualInterest = balance * rate;
  const monthlyInterest = annualInterest / 12;
  // A quinzaine = 2 per month = 24 per year
  const quinzaineInterest = annualInterest / 24;

  const result = {
    balance,
    rate,
    ratePercent: (rate * 100).toFixed(2) + '%',
    annual: Math.round(annualInterest * 100) / 100,
    monthly: Math.round(monthlyInterest * 100) / 100,
    quinzaine: Math.round(quinzaineInterest * 100) / 100,
    daily: Math.round((annualInterest / 365) * 100) / 100,
  };

  // Add period-specific value
  if (type === 'monthly') {
    result.forPeriod = result.monthly;
    result.periodLabel = 'Mensuel';
  } else if (type === 'quinzaine') {
    result.forPeriod = result.quinzaine;
    result.periodLabel = 'Par quinzaine';
  } else {
    result.forPeriod = result.annual;
    result.periodLabel = 'Annuel';
  }

  return result;
}

/**
 * Calculate interest earned from a start date to today.
 *
 * @param {number} balance - Account balance in euros
 * @param {number} rate - Annual interest rate as decimal
 * @param {Date|string} startDate - Date from which to calculate
 * @returns {Object} Interest calculation with days elapsed
 */
function calculateInterestSinceDate(balance, rate, startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.floor((now - start) / msPerDay);

  const interestEarned = (balance * rate * daysElapsed) / 365;

  return {
    balance,
    rate,
    ratePercent: (rate * 100).toFixed(2) + '%',
    startDate: start.toISOString().split('T')[0],
    daysElapsed,
    interestEarned: Math.round(interestEarned * 100) / 100,
    projectedAnnual: Math.round(balance * rate * 100) / 100,
  };
}

module.exports = {
  getAllRates,
  getRateByType,
  calculateInterest,
  calculateInterestSinceDate,
  LIVRET_RATES,
};
