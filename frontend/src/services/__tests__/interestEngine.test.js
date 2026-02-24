import { describe, it, expect, vi } from 'vitest';
import {
  getQuinzaineStart,
  getNextQuinzaineStart,
  getQuinzainesInRange,
  calculateEffectiveBalance,
  calculateInterestYTD,
  calculateInterestAnnualEstimate,
} from '../interestEngine';

// ---- Quinzaine helpers ----

describe('getQuinzaineStart', () => {
  it('day 5 → 1st', () => {
    expect(getQuinzaineStart('2024-01-05')).toBe('2024-01-01');
  });

  it('day 15 → 1st', () => {
    expect(getQuinzaineStart('2024-01-15')).toBe('2024-01-01');
  });

  it('day 16 → 16th', () => {
    expect(getQuinzaineStart('2024-01-16')).toBe('2024-01-16');
  });

  it('day 31 → 16th', () => {
    expect(getQuinzaineStart('2024-01-31')).toBe('2024-01-16');
  });

  it('feb 1 → feb 1', () => {
    expect(getQuinzaineStart('2024-02-01')).toBe('2024-02-01');
  });

  it('feb 28 → feb 16', () => {
    expect(getQuinzaineStart('2024-02-28')).toBe('2024-02-16');
  });

  it('jan 20 → jan 16', () => {
    expect(getQuinzaineStart('2024-01-20')).toBe('2024-01-16');
  });
});

describe('getNextQuinzaineStart', () => {
  it('day 5 → 16th', () => {
    expect(getNextQuinzaineStart('2024-01-05')).toBe('2024-01-16');
  });

  it('day 15 → 16th', () => {
    expect(getNextQuinzaineStart('2024-01-15')).toBe('2024-01-16');
  });

  it('day 16 → next month 1st', () => {
    expect(getNextQuinzaineStart('2024-01-16')).toBe('2024-02-01');
  });

  it('dec 20 → next year jan 1', () => {
    expect(getNextQuinzaineStart('2024-12-20')).toBe('2025-01-01');
  });
});

describe('getQuinzainesInRange', () => {
  it('Q1 2024 has 6 quinzaines', () => {
    const qs = getQuinzainesInRange('2024-01-01', '2024-03-31');
    expect(qs).toHaveLength(6);
  });

  it('full year has 24 quinzaines', () => {
    const qs = getQuinzainesInRange('2024-01-01', '2024-12-31');
    expect(qs).toHaveLength(24);
  });

  it('each quinzaine has start and end', () => {
    const qs = getQuinzainesInRange('2024-01-01', '2024-01-31');
    expect(qs[0]).toEqual({ start: '2024-01-01', end: '2024-01-15' });
    expect(qs[1]).toEqual({ start: '2024-01-16', end: '2024-01-31' });
  });
});

// ---- Effective balance ----

describe('calculateEffectiveBalance', () => {
  it('no movements: balance stays initial', () => {
    expect(calculateEffectiveBalance(10000, [], '2024-01-01')).toBe(10000);
  });

  it('deposit on Jan 10: NOT effective for Q1 (Jan 1-15)', () => {
    const movements = [{ date: '2024-01-10', amount: 5000 }];
    expect(calculateEffectiveBalance(10000, movements, '2024-01-01')).toBe(10000);
  });

  it('deposit on Jan 10: effective from Q2 (Jan 16)', () => {
    const movements = [{ date: '2024-01-10', amount: 5000 }];
    expect(calculateEffectiveBalance(10000, movements, '2024-01-16')).toBe(15000);
  });

  it('withdrawal on Jan 20: effective immediately from Q2 start (Jan 16)', () => {
    const movements = [{ date: '2024-01-20', amount: -3000 }];
    expect(calculateEffectiveBalance(10000, movements, '2024-01-16')).toBe(7000);
  });

  it('withdrawal on Jan 20: NOT effective for Q1', () => {
    const movements = [{ date: '2024-01-20', amount: -3000 }];
    expect(calculateEffectiveBalance(10000, movements, '2024-01-01')).toBe(10000);
  });

  it('multiple movements in same quinzaine', () => {
    const movements = [
      { date: '2024-01-05', amount: 2000 },
      { date: '2024-01-10', amount: -1000 },
    ];
    // For Q2 (Jan 16): deposit effective, withdrawal from Q1 start (Jan 1) <= Jan 16 so effective
    expect(calculateEffectiveBalance(10000, movements, '2024-01-16')).toBe(11000);
  });

  it('balance never goes below 0', () => {
    const movements = [{ date: '2024-01-05', amount: -20000 }];
    expect(calculateEffectiveBalance(10000, movements, '2024-01-01')).toBe(0);
  });

  it('zero initial balance with deposit', () => {
    const movements = [{ date: '2024-01-05', amount: 5000 }];
    expect(calculateEffectiveBalance(0, movements, '2024-01-16')).toBe(5000);
  });

  it('deposit and withdrawal in same quinzaine', () => {
    const movements = [
      { date: '2024-01-05', amount: 5000 },
      { date: '2024-01-12', amount: -2000 },
    ];
    // At Q2 (Jan 16): deposit effective (+5000), withdrawal effective from Q1 start (-2000)
    expect(calculateEffectiveBalance(10000, movements, '2024-01-16')).toBe(13000);
  });
});

// ---- Interest YTD ----

describe('calculateInterestYTD', () => {
  it('simple: 10000 at custom rate 3.0%, each quinzaine = 12.50', () => {
    // Mock Date to a fixed point in 2024
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 31)); // March 31, 2024

    const livret = {
      type: 'livret-a',
      balance: 10000,
      movements: [],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    // Jan 1 to Mar 31 = 6 quinzaines
    expect(result.byQuinzaine).toHaveLength(6);
    // Each quinzaine: 10000 * 3.0/100 / 24 = 12.50
    for (const q of result.byQuinzaine) {
      expect(q.interest).toBe(12.5);
      expect(q.balance).toBe(10000);
    }
    expect(result.ytd).toBe(75.0); // 6 * 12.50

    vi.useRealTimers();
  });

  it('with deposit: 10000 start, +5000 on Mar 10', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 30)); // June 30, 2024

    const livret = {
      type: 'livret-a',
      balance: 15000, // current balance after deposit
      movements: [{ date: '2024-03-10', amount: 5000 }],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    // Q1-Q5 (Jan1 - Mar15): balance = 10000
    for (let i = 0; i < 5; i++) {
      expect(result.byQuinzaine[i].balance).toBe(10000);
    }
    // Q6+ (Mar16 onward): balance = 15000 (deposit effective from next quinzaine after Mar 10 = Mar 16)
    for (let i = 5; i < result.byQuinzaine.length; i++) {
      expect(result.byQuinzaine[i].balance).toBe(15000);
    }

    vi.useRealTimers();
  });
});

// ---- Annual estimate ----

describe('calculateInterestAnnualEstimate', () => {
  it('annual estimate >= YTD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // June 15

    const livret = {
      type: 'livret-a',
      balance: 10000,
      movements: [],
      customRate: 3.0,
    };

    const ytd = calculateInterestYTD(livret);
    const annual = calculateInterestAnnualEstimate(livret);
    expect(annual.annual).toBeGreaterThanOrEqual(ytd.ytd);
    expect(annual.byQuinzaine).toHaveLength(24);

    vi.useRealTimers();
  });
});

// ---- Interest with real rates (rate change mid-year) ----

describe('calculateInterestYTD with actual rates', () => {
  it('uses actual livret-a rate from rateProvider when no customRate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 31)); // March 31, 2024

    const livret = {
      type: 'livret-a',
      balance: 10000,
      movements: [],
      // no customRate: should use rateProvider (3.0% for all of 2024)
    };

    const result = calculateInterestYTD(livret);
    expect(result.byQuinzaine).toHaveLength(6);
    for (const q of result.byQuinzaine) {
      expect(q.rate).toBe(3.0);
    }

    vi.useRealTimers();
  });

  it('empty movements array produces same as no movements', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 31)); // Jan 31

    const livret = {
      type: 'livret-a',
      balance: 10000,
      movements: [],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    expect(result.byQuinzaine).toHaveLength(2);
    expect(result.ytd).toBe(25.0); // 2 * 12.50

    vi.useRealTimers();
  });

  it('zero balance earns zero interest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 31));

    const livret = {
      type: 'livret-a',
      balance: 0,
      movements: [],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    expect(result.ytd).toBe(0);

    vi.useRealTimers();
  });
});

// ---- Real-world case: deposit + withdrawal ----

describe('real-world: 10000 start, +5000 Mar 10, -2000 Jul 20, rate 3.0% full 2024', () => {
  it('computes correct annual interest with movements', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 11, 31)); // Dec 31, 2024

    // current balance = 10000 + 5000 - 2000 = 13000
    const livret = {
      type: 'livret-a',
      balance: 13000,
      movements: [
        { date: '2024-03-10', amount: 5000 },
        { date: '2024-07-20', amount: -2000 },
      ],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    expect(result.byQuinzaine).toHaveLength(24);

    // Q1-Q5 (Jan1-Mar15): 10000 * 3/100/24 = 12.50 each → 62.50
    for (let i = 0; i < 5; i++) {
      expect(result.byQuinzaine[i].balance).toBe(10000);
    }
    // Q6-Q13 (Mar16-Jul15): 15000 * 3/100/24 = 18.75 each → 8 * 18.75 = 150.00
    for (let i = 5; i < 13; i++) {
      expect(result.byQuinzaine[i].balance).toBe(15000);
    }
    // Q14-Q24 (Jul16-Dec31): 13000 * 3/100/24 = 16.25 each → 11 * 16.25 = 178.75
    for (let i = 13; i < 24; i++) {
      expect(result.byQuinzaine[i].balance).toBe(13000);
    }

    // Total: 62.50 + 150.00 + 178.75 = 391.25
    expect(result.ytd).toBe(391.25);

    vi.useRealTimers();
  });
});

// ---- Real-world case ----

describe('real-world: Livret A max 22950 at 3.0%, full year', () => {
  it('earns 688.50 over 24 quinzaines', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 11, 31)); // Dec 31, 2024

    const livret = {
      type: 'livret-a',
      balance: 22950,
      movements: [],
      customRate: 3.0,
    };

    const result = calculateInterestYTD(livret);
    expect(result.byQuinzaine).toHaveLength(24);
    expect(result.ytd).toBe(688.5);

    vi.useRealTimers();
  });
});
