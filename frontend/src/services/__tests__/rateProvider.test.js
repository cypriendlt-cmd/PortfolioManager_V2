import { describe, it, expect } from 'vitest';
import { getRate, getCurrentRate, getAllCurrentRates, getRateHistory } from '../rateProvider';

describe('rateProvider', () => {
  describe('getRate', () => {
    it('returns 3.0 for livret-a on 2024-06-15', () => {
      expect(getRate('livret-a', '2024-06-15')).toBe(3.0);
    });

    it('returns 2.4 for livret-a on 2025-03-01', () => {
      expect(getRate('livret-a', '2025-03-01')).toBe(2.4);
    });

    it('returns 2.0 for livret-a on 2022-09-01', () => {
      expect(getRate('livret-a', '2022-09-01')).toBe(2.0);
    });

    it('returns null for unknown livret type', () => {
      expect(getRate('unknown', '2024-01-01')).toBeNull();
    });

    it('returns null for date before any rate entry', () => {
      expect(getRate('livret-a', '2019-01-01')).toBeNull();
    });

    it('accepts Date objects', () => {
      expect(getRate('livret-a', new Date(2024, 5, 15))).toBe(3.0);
    });
  });

  describe('getCurrentRate', () => {
    it('returns a number for livret-a', () => {
      const rate = getCurrentRate('livret-a');
      expect(typeof rate).toBe('number');
    });

    it('returns null for unknown type', () => {
      expect(getCurrentRate('unknown')).toBeNull();
    });
  });

  describe('getAllCurrentRates', () => {
    it('returns an object with all livret types', () => {
      const rates = getAllCurrentRates();
      expect(typeof rates).toBe('object');
      expect(rates).toHaveProperty('livret-a');
      expect(rates).toHaveProperty('ldds');
      expect(rates).toHaveProperty('lep');
      expect(rates).toHaveProperty('cel');
      expect(rates).toHaveProperty('pel');
    });

    it('all values are numbers', () => {
      const rates = getAllCurrentRates();
      for (const val of Object.values(rates)) {
        expect(typeof val).toBe('number');
      }
    });
  });

  describe('getRateHistory', () => {
    it('returns array for known type', () => {
      const history = getRateHistory('livret-a');
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown type', () => {
      expect(getRateHistory('unknown')).toEqual([]);
    });

    it('entries are ordered by date', () => {
      const history = getRateHistory('livret-a');
      for (let i = 1; i < history.length; i++) {
        expect(history[i].from > history[i - 1].from).toBe(true);
      }
    });
  });
});
