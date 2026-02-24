import { getRate } from './rateProvider';

// --- Quinzaine date helpers ---

function toDateStr(d) {
  if (typeof d === 'string') return d;
  return d.toISOString().slice(0, 10);
}

function parseDate(d) {
  if (d instanceof Date) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function formatDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Get the start date of the quinzaine containing `date`.
 * Days 1-15 → 1st of that month. Days 16+ → 16th of that month.
 */
export function getQuinzaineStart(date) {
  const d = parseDate(date);
  const day = d.getDate();
  return formatDate(d.getFullYear(), d.getMonth() + 1, day <= 15 ? 1 : 16);
}

/**
 * Get the start date of the NEXT quinzaine after `date`.
 * Days 1-15 → 16th of that month. Days 16+ → 1st of next month.
 */
export function getNextQuinzaineStart(date) {
  const d = parseDate(date);
  const day = d.getDate();
  if (day <= 15) {
    return formatDate(d.getFullYear(), d.getMonth() + 1, 16);
  }
  // Next month 1st
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return formatDate(next.getFullYear(), next.getMonth() + 1, 1);
}

/**
 * Returns all quinzaine periods between startDate and endDate (inclusive).
 * Each period: { start, end } where end = day before next quinzaine start.
 */
export function getQuinzainesInRange(startDate, endDate) {
  const endStr = toDateStr(endDate);
  const periods = [];
  let current = getQuinzaineStart(startDate);

  while (current <= endStr) {
    const nextStart = getNextQuinzaineStart(current);
    // end = day before next quinzaine start
    const nextD = parseDate(nextStart);
    nextD.setDate(nextD.getDate() - 1);
    const end = formatDate(nextD.getFullYear(), nextD.getMonth() + 1, nextD.getDate());

    periods.push({ start: current, end });
    current = nextStart;
  }
  return periods;
}

/**
 * Calculate the effective balance for a given quinzaine start,
 * applying French deposit/withdrawal timing rules.
 *
 * - Deposits earn from next quinzaine after deposit date
 * - Withdrawals stop earning from start of quinzaine containing withdrawal date
 */
export function calculateEffectiveBalance(initialBalance, movements, quinzaineStart) {
  let balance = initialBalance;

  for (const mv of movements) {
    const mvDate = toDateStr(mv.date);
    if (mv.amount > 0) {
      // Deposit: counts if its next quinzaine start <= this quinzaine start
      const depositEffective = getNextQuinzaineStart(mvDate);
      if (depositEffective <= quinzaineStart) {
        balance += mv.amount;
      }
    } else if (mv.amount < 0) {
      // Withdrawal: stops earning if quinzaine start of withdrawal <= this quinzaine start
      const withdrawalQStart = getQuinzaineStart(mvDate);
      if (withdrawalQStart <= quinzaineStart) {
        balance += mv.amount; // amount is negative
      }
    }
  }

  return Math.max(balance, 0);
}

/**
 * Reconstruct balance at Jan 1 of a given year from current balance and movements.
 */
function getBalanceAtYearStart(currentBalance, movements, year) {
  const yearStr = `${year}`;
  const yearMovementsSum = movements
    .filter((mv) => toDateStr(mv.date).startsWith(yearStr))
    .reduce((sum, mv) => sum + mv.amount, 0);
  return currentBalance - yearMovementsSum;
}

/**
 * Calculate interest earned from Jan 1 of current year to today (YTD).
 *
 * @param {Object} livret - { type, balance, movements: [{date, amount}], openDate?, customRate? }
 * @returns {Object} { ytd, byQuinzaine: [{start, end, balance, rate, interest}] }
 */
export function calculateInterestYTD(livret) {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = `${year}-01-01`;
  const today = formatDate(year, now.getMonth() + 1, now.getDate());

  const initialBalance = getBalanceAtYearStart(livret.balance, livret.movements || [], year);
  const movements = (livret.movements || []).filter((mv) => toDateStr(mv.date) >= jan1 && toDateStr(mv.date) <= today);

  const quinzaines = getQuinzainesInRange(jan1, today);
  const openDate = livret.openDate ? toDateStr(livret.openDate) : null;

  let ytd = 0;
  const byQuinzaine = [];

  for (const q of quinzaines) {
    // Skip quinzaines before account opened
    if (openDate && q.end < openDate) {
      byQuinzaine.push({ start: q.start, end: q.end, balance: 0, rate: 0, interest: 0 });
      continue;
    }

    const balance = calculateEffectiveBalance(initialBalance, movements, q.start);
    const rate = livret.customRate != null ? livret.customRate : (getRate(livret.type, q.start) || 0);
    const interest = balance * (rate / 100) / 24;

    ytd += interest;
    byQuinzaine.push({ start: q.start, end: q.end, balance, rate, interest: Math.round(interest * 100) / 100 });
  }

  return { ytd: Math.round(ytd * 100) / 100, byQuinzaine };
}

/**
 * Estimate total interest for the full current year.
 * Past quinzaines use actual movements; future ones use current balance and rate.
 *
 * @param {Object} livret
 * @returns {Object} { annual, byQuinzaine: [{start, end, balance, rate, interest}] }
 */
export function calculateInterestAnnualEstimate(livret) {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const today = formatDate(year, now.getMonth() + 1, now.getDate());

  const initialBalance = getBalanceAtYearStart(livret.balance, livret.movements || [], year);
  const movements = (livret.movements || []).filter((mv) => {
    const d = toDateStr(mv.date);
    return d >= jan1 && d <= dec31;
  });

  const quinzaines = getQuinzainesInRange(jan1, dec31);
  const openDate = livret.openDate ? toDateStr(livret.openDate) : null;

  let annual = 0;
  const byQuinzaine = [];

  for (const q of quinzaines) {
    if (openDate && q.end < openDate) {
      byQuinzaine.push({ start: q.start, end: q.end, balance: 0, rate: 0, interest: 0 });
      continue;
    }

    let balance, rate;

    if (q.start <= today) {
      // Past/current quinzaine: use actual movements
      balance = calculateEffectiveBalance(initialBalance, movements, q.start);
      rate = livret.customRate != null ? livret.customRate : (getRate(livret.type, q.start) || 0);
    } else {
      // Future quinzaine: use current balance and current rate
      balance = livret.balance;
      rate = livret.customRate != null ? livret.customRate : (getRate(livret.type, today) || 0);
    }

    const interest = balance * (rate / 100) / 24;
    annual += interest;
    byQuinzaine.push({ start: q.start, end: q.end, balance, rate, interest: Math.round(interest * 100) / 100 });
  }

  return { annual: Math.round(annual * 100) / 100, byQuinzaine };
}
