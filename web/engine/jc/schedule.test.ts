import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { challengeSets, conferenceDays, conferenceRounds } from './schedule';

const confs: Record<string, string[]> = {};
for (let i = 0; i < 18; i++) confs[`C${i}`] = Array.from({ length: 12 }, (_, j) => `C${i}T${j}`);
const confOf = (t: string) => t.split('T')[0];

describe('challengeSets', () => {
  const sets = challengeSets(confs, mulberry32(1));
  it('makes 4 sets of 108 games with every team once per set', () => {
    expect(sets).toHaveLength(4);
    for (const set of sets) {
      expect(set).toHaveLength(108);
      const seen = new Set(set.flat());
      expect(seen.size).toBe(216);
      expect(set.flat()).toHaveLength(216);
    }
  });
  it('never pairs a conference with itself, and gives 4 distinct opposing conferences', () => {
    const opp = new Map<string, Set<string>>();
    for (const set of sets)
      for (const [h, a] of set) {
        expect(confOf(h)).not.toBe(confOf(a));
        for (const [x, y] of [[h, a], [a, h]]) {
          if (!opp.has(x)) opp.set(x, new Set());
          opp.get(x)!.add(confOf(y));
        }
      }
    for (const s of opp.values()) expect(s.size).toBe(4);
  });
  it('never repeats an opponent for a team', () => {
    const opps = new Map<string, string[]>();
    for (const set of sets)
      for (const [h, a] of set) {
        opps.set(h, [...(opps.get(h) ?? []), a]);
        opps.set(a, [...(opps.get(a) ?? []), h]);
      }
    for (const l of opps.values()) expect(new Set(l).size).toBe(l.length);
  });
  it('is deterministic for a seed', () => {
    expect(challengeSets(confs, mulberry32(1))).toEqual(sets);
  });
});

describe('conferenceRounds', () => {
  const ids = confs.C0;
  const rounds = conferenceRounds(ids, mulberry32(1));
  it('makes 22 rounds of 6 games, each team once per round', () => {
    expect(rounds).toHaveLength(22);
    for (const r of rounds) {
      expect(r).toHaveLength(6);
      expect(new Set(r.flat()).size).toBe(12);
    }
  });
  it('plays each ordered pair exactly once', () => {
    const keys = rounds.flat().map(([h, a]) => `${h}>${a}`);
    expect(keys).toHaveLength(132);
    expect(new Set(keys).size).toBe(132);
  });
  it('is deterministic for a seed', () => {
    expect(conferenceRounds(ids, mulberry32(1))).toEqual(rounds);
  });
});

describe('conferenceDays', () => {
  it('makes 22 days of 108 games', () => {
    const days = conferenceDays(confs, mulberry32(1));
    expect(days).toHaveLength(22);
    for (const d of days) {
      expect(d).toHaveLength(108);
      expect(new Set(d.flat()).size).toBe(216);
    }
  });
});
