import { describe, expect, it } from 'vitest';
import type { ClassYear, DraftProspect, Position, RosterEntry, RostersFile } from '../shared/types';
import { DEFAULT_OUTLOOK, positionSpots, prospectOutlook } from './prospectOutlook';

const entry = (position: Position, rating: number | null): RosterEntry => ({
  playerId: rating === null ? null : `x${Math.random()}`, position, rating, age: null, points: 0, stars: null,
});
const rosters = (entries: RosterEntry[]): RostersFile => ({ league: 'fba', season: 80, locked: false, teams: { T: entries } });
const prospect = (playerId: string, position: Position, classYear: ClassYear, collegeRating: number | null, senior = false): DraftProspect => (
  { playerId, position, college: 'c', classYear, senior, collegeRating, stars: null, fbaRating: null }
);
const none = { ...DEFAULT_OUTLOOK, d2Reserve: 0 };

describe('positionSpots', () => {
  it('counts the open slots and the players rated at or below the cutoff', () => {
    const fba = rosters([entry('PG', null), entry('PG', 66), entry('PG', 67), entry('PG', 68), entry('SG', 90)]);
    const s = positionSpots(fba, none);
    expect(s.PG).toBe(3);
    expect(s.SG).toBe(0);
  });
  it('shares the D2 reserve across positions in proportion, never below zero and never above a position\'s spots', () => {
    const open = (position: Position, n: number, low: number) => [...Array<number>(n).fill(0).map(() => entry(position, null)), ...Array<number>(low).fill(0).map(() => entry(position, 60))];
    const fba = rosters([...open('PG', 3, 0), ...open('SG', 2, 1), ...open('SF', 4, 5), ...open('PF', 5, 2), ...open('C', 4, 2)]);
    const raw = positionSpots(fba, none);
    expect(Object.values(raw).reduce((a, b) => a + b, 0)).toBe(28);
    const s = positionSpots(fba, { ...DEFAULT_OUTLOOK, d2Reserve: 5 });
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(23);
    for (const p of ['PG', 'SG', 'SF', 'PF', 'C'] as Position[]) {
      expect(s[p]).toBeGreaterThanOrEqual(0);
      expect(s[p]).toBeLessThanOrEqual(raw[p]);
    }
  });
  it('gives all zeros when the reserve is more than the spots there are', () => {
    const fba = rosters([entry('PG', null), entry('C', null)]);
    expect(positionSpots(fba, { ...DEFAULT_OUTLOOK, d2Reserve: 99 })).toEqual({ PG: 0, SG: 0, SF: 0, PF: 0, C: 0 });
  });
});

describe('prospectOutlook', () => {
  const fba = rosters([entry('PG', null), entry('PG', null), entry('SG', null)]);
  const wide = { ...none, historyCutoff: 99 };

  it('ranks by college rating plus the class boost: a Fr 85 (89) beats a Jr 87 (88), a Jr 87 (88) beats a Sr 87', () => {
    const o = prospectOutlook([prospect('jr', 'PG', 'Jr', 87), prospect('fr', 'PG', 'Fr', 85), prospect('sr', 'PG', 'Sr', 87, true)], fba, wide);
    expect([o.get('fr')!.overallRank, o.get('jr')!.overallRank, o.get('sr')!.overallRank]).toEqual([1, 2, 3]);
  });
  it('a So gets +2 and a Sr nothing', () => {
    const o = prospectOutlook([prospect('sr', 'PG', 'Sr', 86, true), prospect('so', 'PG', 'So', 85)], fba, wide);
    expect(o.get('so')!.overallRank).toBe(1);
    const o2 = prospectOutlook([prospect('sr', 'PG', 'Sr', 88, true), prospect('so', 'PG', 'So', 85)], fba, wide);
    expect(o2.get('sr')!.overallRank).toBe(1);
  });
  it('numbers the prospects at a position 1, 2, 3 in score order', () => {
    const o = prospectOutlook([prospect('a', 'PG', 'So', 80), prospect('b', 'SG', 'So', 95), prospect('c', 'PG', 'So', 90)], fba, wide);
    expect([o.get('c')!.positionRank, o.get('a')!.positionRank, o.get('b')!.positionRank]).toEqual([1, 2, 1]);
  });
  it('puts a prospect with no college rating last, overall and at his position', () => {
    const o = prospectOutlook([prospect('none', 'PG', 'Fr', null), prospect('low', 'PG', 'Sr', 50)], fba, wide);
    expect(o.get('none')!.overallRank).toBe(2);
    expect(o.get('none')!.positionRank).toBe(2);
  });
  it('keeps the input order for equal scores', () => {
    const o = prospectOutlook([prospect('first', 'PG', 'So', 80), prospect('second', 'PG', 'So', 80)], fba, wide);
    expect(o.get('first')!.overallRank).toBe(1);
  });
  it('is green with both checks, amber with one, red with neither, and null for a senior who still takes a rank', () => {
    // PG has 2 spots, SG 1; history cutoff 2. Scores: sen 99, g 91, a 86, amber 71, red 61.
    const s = { ...none, historyCutoff: 2 };
    const o = prospectOutlook([
      prospect('sen', 'PG', 'Sr', 99, true),
      prospect('g', 'PG', 'Jr', 90),
      prospect('a', 'SG', 'Jr', 85),
      prospect('amber', 'PG', 'Jr', 70),
      prospect('red', 'SG', 'Jr', 60),
    ], fba, s);
    expect(o.get('sen')!.signal).toBeNull();
    expect(o.get('sen')!.overallRank).toBe(1);
    expect(o.get('g')!.signal).toBe('stay');
    expect(o.get('a')!.signal).toBe('close');
    expect(o.get('amber')!.signal).toBe('withdraw');
    expect(o.get('red')!.signal).toBe('withdraw');
  });
  it('gives green when both checks pass and amber when only one does', () => {
    const s = { ...none, historyCutoff: 2 };
    const o = prospectOutlook([prospect('p1', 'PG', 'Jr', 90), prospect('p2', 'PG', 'Jr', 85), prospect('p3', 'PG', 'Jr', 80)], fba, s);
    expect([o.get('p1')!.signal, o.get('p2')!.signal, o.get('p3')!.signal]).toEqual(['stay', 'stay', 'withdraw']);
    const s2 = { ...none, historyCutoff: 1 };
    const o2 = prospectOutlook([prospect('p1', 'PG', 'Jr', 90), prospect('p2', 'PG', 'Jr', 85)], fba, s2);
    expect([o2.get('p1')!.signal, o2.get('p2')!.signal]).toEqual(['stay', 'close']);
  });
  it('a position with no spots fails the position check for everyone, however high he ranks', () => {
    const o = prospectOutlook([prospect('c1', 'C', 'Fr', 99)], fba, wide);
    expect(o.get('c1')!.positionCheck).toBe(false);
    expect(o.get('c1')!.signal).toBe('close');
  });
  it('shifts the ranks up when a prospect leaves the list', () => {
    const all = [prospect('a', 'PG', 'Jr', 90), prospect('b', 'PG', 'Jr', 85), prospect('c', 'PG', 'Jr', 80)];
    expect(prospectOutlook(all, fba, wide).get('c')!.overallRank).toBe(3);
    expect(prospectOutlook(all.filter(p => p.playerId !== 'a'), fba, wide).get('c')!.overallRank).toBe(2);
  });
});
