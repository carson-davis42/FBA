import { describe, expect, it } from 'vitest';
import { RankingFile } from '../shared/types';
import {
  applyAllSuggestions, isNewRow, leftRows, outOfOrder, rankedRows, rankingBlockers, sendBack, setRating, suggestion, suggestionsTaken, syncRows, take, takeRest,
} from './ranking';
import { rankingDoc, rankName } from './testFixtures';

const ids = (rows: { playerId: string }[]) => rows.map(r => r.playerId);
const ALL = ['p00002', 'p00001', 'p00003', 'p00006', 'p00004', 'p00005'];

describe('leftRows', () => {
  it('lists last season first (high to low), then the New group by the other rating, with ties on name', () => {
    expect(ids(leftRows(rankingDoc(), rankName))).toEqual(ALL);
  });

  it('breaks full ties on id and leaves out ranked players', () => {
    expect(ids(leftRows(rankingDoc(), () => 'Same')).slice(0, 3)).toEqual(['p00002', 'p00001', 'p00003']);
    expect(ids(leftRows(rankingDoc({ order: ['p00002', 'p00006'] }), rankName))).toEqual(['p00001', 'p00003', 'p00004', 'p00005']);
  });
});

describe('D2 Reserves already in the pool', () => {
  const row = (playerId: string, prevRating: number | null, otherRating: number | null) => ({ playerId, position: 'PG' as const, age: 25, team: null, prevRating, otherRating, stat: null });
  const doc = (kind: 'd2-reset' | 'fba-reset') => ({ ...rankingDoc(), kind, rows: [row('p00001', 70, null), row('p00002', null, null), row('p00003', null, 80)] }) as RankingFile;

  it('counts a rating-less Reserve with no FBA rating as existing, after the rated players, before the New group', () => {
    const d = doc('d2-reset');
    expect(isNewRow(d, d.rows[1])).toBe(false);
    expect(isNewRow(d, d.rows[2])).toBe(true);
    expect(ids(leftRows(d, rankName))).toEqual(['p00001', 'p00002', 'p00003']);
  });

  it('leaves other ranking kinds alone', () => {
    const d = doc('fba-reset');
    expect(isNewRow(d, d.rows[1])).toBe(true);
  });
});

describe('take, sendBack and takeRest', () => {
  it('appends a taken player and refuses unknown, repeated or locked takes', () => {
    const doc = take(rankingDoc(), 'p00003');
    expect(doc.order).toEqual(['p00003']);
    expect(ids(rankedRows(doc))).toEqual(['p00003']);
    expect(take(doc, 'p00003')).toBe(doc);
    expect(take(doc, 'p00099')).toBe(doc);
    const locked = rankingDoc({ locked: true });
    expect(take(locked, 'p00001')).toBe(locked);
  });

  it('sends a player back but keeps their rating', () => {
    const doc = sendBack(rankingDoc({ order: ['p00002', 'p00001'], ratings: { p00001: 84 } }), 'p00002');
    expect(doc.order).toEqual(['p00001']);
    const back = sendBack(doc, 'p00001');
    expect(back.order).toEqual([]);
    expect(back.ratings).toEqual({ p00001: 84 });
    expect(sendBack(back, 'p00001')).toBe(back);
  });

  it('takes the rest in last season\'s order', () => {
    const doc = takeRest(take(rankingDoc(), 'p00006'), rankName);
    expect(doc.order).toEqual(['p00006', 'p00002', 'p00001', 'p00003', 'p00004', 'p00005']);
    expect(takeRest(doc, rankName)).toBe(doc);
  });

  it('takes only the matching rest, keeping their order', () => {
    const fresh = takeRest(rankingDoc(), rankName, r => r.prevRating === null);
    expect(fresh.order.every(id => rankingDoc().rows.find(r => r.playerId === id)!.prevRating === null)).toBe(true);
    expect(fresh.order).toHaveLength(3);
    const known = takeRest(fresh, rankName, r => r.prevRating !== null);
    expect(known.order.slice(3)).toEqual(['p00002', 'p00001', 'p00003']);
    expect(takeRest(known, rankName, () => true)).toBe(known);
  });
});

describe('suggestions and ratings', () => {
  it('suggests the curve value for a rank, and nothing past the curve', () => {
    expect([1, 2, 3, 4].map(k => suggestion(rankingDoc(), k))).toEqual([90, 85, 80, null]);
  });

  it('sets and clears ratings, refusing invalid values, unknown players and locked files', () => {
    const doc = setRating(rankingDoc(), 'p00001', 84);
    expect(doc.ratings).toEqual({ p00001: 84 });
    expect(setRating(doc, 'p00001', 84)).toBe(doc);
    for (const bad of [0, 100, 7.5]) expect(setRating(doc, 'p00001', bad)).toBe(doc);
    expect(setRating(doc, 'p00099', 70)).toBe(doc);
    expect(setRating(doc, 'p00001', null).ratings).toEqual({});
    expect(setRating(rankingDoc(), 'p00001', null)).toEqual(rankingDoc());
    const locked = rankingDoc({ locked: true });
    expect(setRating(locked, 'p00001', 70)).toBe(locked);
  });

  it('applies every suggestion without overwriting a typed rating', () => {
    const doc = rankingDoc({ order: ['p00002', 'p00001', 'p00003', 'p00006'], ratings: { p00001: 84 } });
    const next = applyAllSuggestions(doc);
    expect(next.ratings).toEqual({ p00002: 90, p00001: 84, p00003: 80 });
    expect(applyAllSuggestions(next)).toBe(next);
    expect(suggestionsTaken(next)).toBe(2);
  });
});

describe('rankingBlockers and outOfOrder', () => {
  it('counts unranked and unrated players', () => {
    expect(rankingBlockers(rankingDoc(), rankName)).toEqual(["6 players aren't ranked yet"]);
    expect(rankingBlockers(take(rankingDoc(), 'p00002'), rankName)).toEqual(["5 players aren't ranked yet", '1 player still needs a rating']);
    const five = rankingDoc({ order: ALL.slice(0, 5) });
    expect(rankingBlockers(five, rankName)).toEqual(["1 player isn't ranked yet", '5 players still need a rating']);
  });

  it('flags a rating higher than the lowest one ranked above it, skipping unrated rows', () => {
    const doc = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00001: 86, p00003: 80 } });
    expect(rankingBlockers(doc, rankName)).toContain('#2 Ada Stone (86) is rated above #1 Ben Cole (85)');
    expect([...outOfOrder(doc)]).toEqual(['p00001']);
    const gap = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00003: 90 } });
    expect(rankingBlockers(gap, rankName)).toContain('#3 Cal Reyes (90) is rated above #1 Ben Cole (85)');
    const both = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00001: 90, p00003: 88 } });
    expect([...outOfOrder(both)]).toEqual(['p00001', 'p00003']);
  });

  it('is empty once everyone is ranked and rated in order (ties allowed), and the result can be locked', () => {
    const doc = rankingDoc({ order: ALL, ratings: { p00002: 85, p00001: 85, p00003: 80, p00006: 75, p00004: 70, p00005: 65 } });
    expect(rankingBlockers(doc, rankName)).toEqual([]);
    expect(outOfOrder(doc).size).toBe(0);
    expect(RankingFile.safeParse({ ...doc, locked: true }).success).toBe(true);
  });
});

describe('syncRows', () => {
  it('keeps rows in step with membership: removes missing, adds new, preserves old row objects', () => {
    const rowA = { playerId: 'A', position: 'PG' as const, age: 25, team: 'AMS', prevRating: 80, otherRating: null, stat: '300 pts' };
    const rowB = { playerId: 'B', position: 'SG' as const, age: 25, team: 'AMS', prevRating: 70, otherRating: null, stat: '250 pts' };
    const rowC = { playerId: 'C', position: 'PG' as const, age: 25, team: 'AMS', prevRating: 60, otherRating: null, stat: '200 pts' };
    const doc = rankingDoc({
      rows: [rowA, rowB, rowC],
      order: ['A', 'B'],
      ratings: { A: 80, B: 70, C: 60 },
    });
    const newRowD = { playerId: 'D', position: 'C' as const, age: 25, team: null, prevRating: null, otherRating: null, stat: null };
    const result = syncRows(doc, [rowA, rowC, newRowD]);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0]).toBe(rowA);
    expect(result.rows[1]).toBe(rowC);
    expect(result.rows[2]).toBe(newRowD);
    expect(result.order).toEqual(['A']);
    expect(result.ratings).toEqual({ A: 80, C: 60 });
  });

  it('returns a locked doc unchanged', () => {
    const doc = rankingDoc({ locked: true });
    const result = syncRows(doc, []);
    expect(result).toBe(doc);
  });

  it('returns the same object when membership hasn\'t changed', () => {
    const doc = rankingDoc();
    const result = syncRows(doc, doc.rows);
    expect(result).toEqual(doc);
  });
});
