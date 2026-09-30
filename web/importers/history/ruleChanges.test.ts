import { describe, expect, it } from 'vitest';
import data from './ruleChanges.json';

const rules = data as unknown as { season: number; lines: string[] }[];

describe('ruleChanges.json', () => {
  it('is an array of season entries with lines', () => {
    expect(Array.isArray(rules)).toBe(true);
    for (const r of rules) {
      expect(Number.isInteger(r.season) && r.season >= 1).toBe(true);
      expect(Array.isArray(r.lines) && r.lines.length > 0).toBe(true);
      for (const l of r.lines) expect(typeof l).toBe('string');
    }
  });
  it('has strictly ascending seasons including season 1', () => {
    for (let i = 1; i < rules.length; i++) expect(rules[i].season).toBeGreaterThan(rules[i - 1].season);
    expect(rules.some(r => r.season === 1)).toBe(true);
  });
  it('has the S59 expansion', () => {
    expect(rules.some(r => r.season === 59 && r.lines.some(l => l.includes('Expansion')))).toBe(true);
  });
  it('has no empty or punctuation-only lines', () => {
    for (const r of rules) for (const l of r.lines) expect(/[A-Za-z0-9]/.test(l)).toBe(true);
  });
});
