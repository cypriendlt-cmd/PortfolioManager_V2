/**
 * Financial calculation utilities.
 * PRU, gain/loss, livret interest, and portfolio total value.
 */

/**
 * Calculate PRU (Prix de Revient Unitaire / weighted average purchase price).
 * Used when averaging down or up on a position.
 *
 * @param {number} existingQty - Current quantity held
 * @param {number} existingPRU - Current weighted average price
 * @param {number} newQty - New quantity being added
 * @param {number} newPrice - Price of the new purchase
 * @returns {number} New weighted average price
 */
function calculatePRU(existingQty, existingPRU, newQty, newPrice) {
  const totalQty = existingQty + newQty;
  if (totalQty === 0) return 0;
  return (existingQty * existingPRU + newQty * newPrice) / totalQty;
}

/**
 * Calculate gain or loss in absolute value.
 *
 * @param {number} quantity - Current quantity
 * @param {number} currentPrice - Current market price per unit
 * @param {number} buyPrice - Average purchase price per unit
 * @returns {number} Gain/loss in currency units
 */
function calculateGainLoss(quantity, currentPrice, buyPrice) {
  return quantity * (currentPrice - buyPrice);
}

/**
 * Calculate gain or loss as a percentage.
 *
 * @param {number} currentPrice - Current market price per unit
 * @param {number} buyPrice - Average purchase price per unit
 * @returns {number} Gain/loss percentage (e.g., 12.5 means +12.5%)
 */
function calculateGainLossPercent(currentPrice, buyPrice) {
  if (buyPrice === 0) return 0;
  return ((currentPrice - buyPrice) / buyPrice) * 100;
}

/**
 * Calculate livret interest for a given period using the quinzaine method.
 * French savings accounts use a bi-monthly (quinzaine) calculation:
 * - Deposits: interest starts on the 1st or 16th after the deposit date
 * - Withdrawals: interest stops on the 1st or 16th before the withdrawal date
 *
 * @param {number} balance - Account balance in euros
 * @param {number} annualRate - Annual interest rate as a decimal (e.g., 0.024 for 2.4%)
 * @param {number} months - Number of months to calculate for (default: 12)
 * @returns {{ annual: number, monthly: number, daily: number }} Interest amounts
 */
function calculateLivretInterest(balance, annualRate, months = 12) {
  const annual = balance * annualRate;
  const monthly = annual / 12;
  const daily = annual / 365;

  return {
    annual: Math.round(annual * 100) / 100,
    monthly: Math.round(monthly * 100) / 100,
    daily: Math.round(daily * 100) / 100,
    forPeriod: Math.round((annual * months / 12) * 100) / 100,
  };
}

/**
 * Calculate interest using the quinzaine method for a specific date range.
 *
 * @param {number} balance - Account balance in euros
 * @param {number} annualRate - Annual interest rate as a decimal
 * @param {Date} startDate - Start date of the calculation
 * @param {Date} endDate - End date of the calculation
 * @returns {number} Interest earned in the period
 */
function calculateQuinzaineInterest(balance, annualRate, startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((endDate - startDate) / msPerDay);
  return Math.round((balance * annualRate * days / 365) * 100) / 100;
}

/**
 * Calculate total portfolio value from all asset categories.
 *
 * @param {Object} portfolio - Full portfolio data
 * @param {Object} prices - Map of asset id/symbol to current price
 * @returns {{ total: number, byCategory: Object }} Portfolio totals
 */
function calculatePortfolioTotal(portfolio, prices = {}) {
  const result = {
    crypto: 0,
    pea: 0,
    livrets: 0,
    fundraising: 0,
    total: 0,
  };

  // Crypto
  if (Array.isArray(portfolio.crypto)) {
    portfolio.crypto.forEach((asset) => {
      const price = prices[asset.id] || prices[asset.symbol?.toLowerCase()] || 0;
      result.crypto += asset.quantity * price;
    });
  }

  // PEA stocks
  if (Array.isArray(portfolio.pea)) {
    portfolio.pea.forEach((stock) => {
      const price = prices[stock.isin] || prices[stock.symbol] || 0;
      result.pea += stock.quantity * price;
    });
  }

  // Livrets (balance = current value)
  if (Array.isArray(portfolio.livrets)) {
    portfolio.livrets.forEach((livret) => {
      result.livrets += livret.balance || 0;
    });
  }

  // Fundraising
  if (Array.isArray(portfolio.fundraising)) {
    portfolio.fundraising.forEach((item) => {
      result.fundraising += item.amountInvested || 0;
    });
  }

  result.total = result.crypto + result.pea + result.livrets + result.fundraising;
  return result;
}

module.exports = {
  calculatePRU,
  calculateGainLoss,
  calculateGainLossPercent,
  calculateLivretInterest,
  calculateQuinzaineInterest,
  calculatePortfolioTotal,
};
