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
