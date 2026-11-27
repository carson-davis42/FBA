import { describe, expect, it } from 'vitest';
import { fillRatings } from '../rank/d2Fill';
import { applyAllSuggestions, rankingBlockers, setRating, topOf } from '../rank/ranking';
import { promoteTop, takeRestMerged } from '../rank/positionRanking';
import { POSITIONS } from '../roster/rules';
import { RankingFile } from '../shared/types';
import { finishRatings, ratingsBlockers } from './ratings';
import { bigCutDoc, d2BaseState } from './testFixtures';
import type { D2State } from './state';

const name = (id: string) => id;
const top100 = () => takeRestMerged(bigCutDoc(), name);
const rated = () => applyAllSuggestions(top100());

describe('the D2 top 100', () => {
  it('stops the whole ranking at 100', () => {
    const doc = top100();
    expect(topOf(doc)).toBe(100);
    expect(doc.order).toHaveLength(100);
    expect(promoteTop(doc)).toBe(doc);
    expect(takeRestMerged(doc, name)).toEqual(doc);
  });

  it('asks only for the top 100 to be ranked and rated', () => {
    expect(rankingBlockers(bigCutDoc(), name)).toEqual(["100 players aren't ranked yet"]);
    expect(rankingBlockers(top100(), name)).toEqual(['100 players still need a rating']);
    expect(rankingBlockers(rated(), name)).toEqual([]);
  });

  it('has no automatic ratings until all 100 are rated', () => {
    expect(fillRatings(bigCutDoc())).toBeNull();
    expect(fillRatings(top100())).toBeNull();
    const doc = rated();
    expect(fillRatings(setRating(doc, doc.order[99], null))).toBeNull();
  });

  it('slides each position evenly from the lowest top-100 rating to 65 at its last place', () => {
    const doc = rated();
    const floor = Math.min(...doc.order.map(id => doc.ratings[id]));
    const filled = fillRatings(doc)!;
    expect(filled).toHaveLength(50);
    for (const pos of POSITIONS) {
      const list = doc.byPosition![pos]!;
      const mine = filled.filter(f => f.position === pos).sort((a, b) => a.positionRank - b.positionRank);
      const inTop = list.filter(id => doc.order.includes(id)).length;
      expect(mine.map(f => f.positionRank)).toEqual(Array.from({ length: 30 - inTop }, (_, i) => inTop + 1 + i));
      expect(mine.map(f => f.playerId)).toEqual(list.slice(inTop));
      mine.forEach((f, i) => {
        expect(f.rating).toBe(Math.round(floor - ((floor - 65) * (i + 1)) / mine.length));
        expect(f.rating).toBeLessThanOrEqual(i === 0 ? floor : mine[i - 1].rating);
      });
      expect(mine.at(-1)!.rating).toBe(65);
    }
    // Best first overall.
    expect(filled.map(f => f.rating)).toEqual([...filled.map(f => f.rating)].sort((a, b) => b - a));
  });

  it('never goes above a top-100 rating, even one below 65', () => {
    let doc = top100();
    doc.order.forEach(id => { doc = setRating(doc, id, 60); });
    expect(new Set(fillRatings(doc)!.map(f => f.rating))).toEqual(new Set([60]));
  });

  it('finishes with the top 100 as entered and everyone else kept rated from their position rank', () => {
    const doc = { ...rated() };
    doc.ratings = { ...doc.ratings, [doc.rows.find(r => !doc.order.includes(r.playerId))!.playerId]: 99 };
    const filled = fillRatings(doc)!;
    const base = d2BaseState();
    const state: D2State = {
      ...base,
      d2: { ...base.d2, teams: {} },
      reserves: { ...base.reserves, players: doc.rows.map(r => ({ playerId: r.playerId, position: r.position, age: r.age, rating: null })) },
      ratings: doc,
    };
    expect(ratingsBlockers(state)).toEqual([]);
    const r = finishRatings(state, { batchId: 'b1' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(RankingFile.safeParse(r.state.ratings).success).toBe(true);
    expect(r.state.ratings!.order).toHaveLength(150);
    expect(r.state.ratings!.order.slice(0, 100)).toEqual(doc.order);
    const saved = new Map(r.state.reserves.players.map(p => [p.playerId, p.rating]));
    for (const id of doc.order) expect(saved.get(id)).toBe(doc.ratings[id]);
    for (const f of filled) {
      expect(saved.get(f.playerId)).toBe(f.rating);
      expect(r.state.ratings!.ratings[f.playerId]).toBe(f.rating);
    }
    expect([...saved.values()].filter(v => v === null)).toHaveLength(2);
    expect(r.state.d2Tx.entries.at(-1)!.lines[0])
      .toBe(`D2 ratings reset: 100 players ranked, 100 took the suggestion, 50 rated by position rank, 2 left unrated for Reserves`);
  });
});
