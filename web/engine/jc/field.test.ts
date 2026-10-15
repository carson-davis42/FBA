import { describe, expect, it } from 'vitest';
import { isMajor, selectFirstFour, selectMarchMadness } from './field';

const CODES = ['B12', 'ACC', 'BE', 'SEC', 'B10', 'AAC', 'P12', 'A10', 'MWC', 'PAT', 'COL', 'HOR', 'IVY', 'SOCON', 'SUN', 'SKY', 'OVC', 'NEC'];
const ranking = Array.from({ length: 216 }, (_, i) => `t${String(i).padStart(3, '0')}`);
const confOf = (id: string): string => CODES[Number(id.slice(1)) % 18];
const at = (...idx: number[]): string[] => idx.map(i => ranking[i]);
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);

describe('selectMarchMadness', () => {
  it('guarantees the champions of the nine major conferences even when they rank last, and skips major at-larges from slot 51', () => {
    // The 18 champions are the lowest-ranked team of each conference (ranks 198-215; ranks 198-206 are major conferences).
    const champions = at(...range(198, 216));
    const { field } = selectMarchMadness(ranking, champions, confOf);
    expect(field).toHaveLength(64);
    expect(new Set(field).size).toBe(64);
    expect(field.slice(0, 43)).toEqual(at(...range(0, 43)));
    expect(field.slice(43, 52)).toEqual(at(...range(198, 207)));
    expect(field.slice(52, 55)).toEqual(at(45, 46, 47));
    expect(field.slice(55)).toEqual(at(...range(207, 216)));
    for (const c of champions) expect(field).toContain(c);
  });

  it('takes the best teams, then only non-major at-larges from slot 51, when every champion already ranks high', () => {
    const champions = at(...range(0, 18));
    const { field, leftover } = selectMarchMadness(ranking, champions, confOf);
    expect(field.slice(0, 51)).toEqual(at(...range(0, 51)));
    const nonMajor = ranking.slice(51).filter(t => !isMajor(confOf(t))).slice(0, 13);
    expect(field.slice(51)).toEqual(nonMajor);
    expect(leftover).toHaveLength(216 - 64);
    expect(leftover[0]).toBe(ranking[54]);
    for (const t of field) expect(leftover).not.toContain(t);
  });

  it('forces the nine major champions in from slot 43, then at-larges, then the remaining champions best first', () => {
    // Champions ranked 100-117: ranks 108-116 are the nine major-conference champions.
    const { field } = selectMarchMadness(ranking, at(...range(100, 118)), confOf);
    expect(field).toEqual(at(...range(0, 43), ...range(108, 117), 45, 46, 47, ...range(100, 108), 117));
  });

  it('is a permutation split: field plus leftover is every team once', () => {
    const { field, leftover } = selectMarchMadness(ranking, at(...range(150, 168)), confOf);
    expect([...field, ...leftover].sort()).toEqual([...ranking].sort());
  });
});

describe('selectFirstFour', () => {
  // 80 ranked teams t00..t79; every third team is power (B12), the rest SKY.
  const ranking = Array.from({ length: 80 }, (_, i) => `t${String(i).padStart(2, '0')}`);
  const confOf = (id: string): string => (Number(id.slice(1)) % 3 === 0 ? 'B12' : 'SKY');
  const field = ranking.slice(0, 64);
  const leftover = ranking.slice(64);

  it('pairs the last eight of each group, adjacent by ranking', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    expect(r.pairs).toHaveLength(8);
    expect(r.slots).toHaveLength(64);
    expect(new Set(r.slots).size).toBe(64);
    const power = r.pairs.filter(p => p.group === 'power');
    expect(power).toHaveLength(4);
    const eight = r.lastEight.power;
    expect(eight).toHaveLength(8);
    expect(power.map(p => p.teams)).toEqual([[eight[0], eight[1]], [eight[2], eight[3]], [eight[4], eight[5]], [eight[6], eight[7]]]);
  });
  it('takes the spot holders from the 64 and the challengers from the leftover, per group', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    for (const g of ['power', 'other'] as const) {
      const eight = r.lastEight[g];
      expect(eight.every(t => (confOf(t) === 'B12') === (g === 'power'))).toBe(true);
      expect(eight.filter(t => field.includes(t))).toHaveLength(4);
      expect(eight.filter(t => leftover.includes(t))).toHaveLength(4);
    }
  });
  it('puts the better team of a pair in its spot and removes the challengers from the leftover', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    for (const p of r.pairs) expect(r.slots[p.spot]).toBe(p.teams[0]);
    const challengers = [...r.lastEight.power, ...r.lastEight.other].filter(t => leftover.includes(t));
    expect(challengers).toHaveLength(8);
    expect(r.leftover.some(t => challengers.includes(t))).toBe(false);
    expect(r.leftover[0]).toBe(leftover.find(t => !challengers.includes(t)));
  });
  it('lists First Four In above the spot holders and First Four Out below the challengers', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    expect(r.firstFourIn.power).toHaveLength(4);
    expect(r.firstFourOut.other).toHaveLength(4);
    for (const g of ['power', 'other'] as const) {
      const worstIn = Math.max(...r.firstFourIn[g].map(t => ranking.indexOf(t)));
      const bestEight = Math.min(...r.lastEight[g].map(t => ranking.indexOf(t)));
      expect(worstIn).toBeLessThan(bestEight);
      const bestOut = Math.min(...r.firstFourOut[g].map(t => ranking.indexOf(t)));
      const worstEight = Math.max(...r.lastEight[g].map(t => ranking.indexOf(t)));
      expect(bestOut).toBeGreaterThan(worstEight);
    }
  });
  it('never puts a protected team (a regular-season champion) in a play-in game', () => {
    const worstOther = field.filter(t => confOf(t) === 'SKY').slice(-1)[0];
    const nextChallenger = leftover.find(t => confOf(t) === 'SKY')!;
    const r = selectFirstFour(ranking, field, leftover, confOf, new Set([worstOther, nextChallenger]));
    const eight = [...r.lastEight.power, ...r.lastEight.other];
    expect(eight).not.toContain(worstOther);
    expect(eight).not.toContain(nextChallenger);
    expect(r.slots).toContain(worstOther);
    expect(r.leftover).toContain(nextChallenger);
    expect(r.pairs).toHaveLength(8);
    expect(r.lastEight.other).toHaveLength(8);
  });
  it('plays no First Four, with a warning, when a group has too few challengers', () => {
    const r = selectFirstFour(ranking, field, leftover.slice(0, 3), confOf);
    expect(r.pairs).toHaveLength(0);
    expect(r.slots).toEqual(field);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
