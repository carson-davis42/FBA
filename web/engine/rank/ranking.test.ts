import { describe, expect, it } from 'vitest';
import { RankingFile } from '../shared/types';
import {
  applyAllSuggestions, leftRows, outOfOrder, rankedRows, rankingBlockers, sendBack, setRating, suggestion, suggestionsTaken, take, takeRest,
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
