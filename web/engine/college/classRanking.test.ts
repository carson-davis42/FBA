import { describe, expect, it } from 'vitest';
import { applyClassSuggestions, classBlockers, classRankingPath, consensusSuggestion, finishClassRanking, parseConsensusInput, setConsensus, starsFor, startClassRanking, type ClassRankState } from './classRanking';
import { addDraftRow, appendDraftRows, editRecruit, removeRecruit } from './recruiting';
import { boardPath, collegeName } from './state';
import { collegeClassState } from './testFixtures';
import { setRating, take, takeRest } from '../rank/ranking';
import { RankingFile, RecruitingFile } from '../shared/types';

const ctx = { batchId: 'b1' };
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${(r as unknown as { problems: string[] }).problems.join('; ')}`);
  return r as Extract<T, { ok: true }>;
};
const problems = (r: { ok: boolean }) => (r.ok ? [] : (r as unknown as { problems: string[] }).problems);

const idOf = (i: number) => `p${String(2000 + i).padStart(5, '0')}`;
const nameOf = (i: number) => `Kid ${String(i + 1).padStart(2, '0')}`;

/** An S80 class of n recruits (board S79), only recruit 0 committed (to Baylor), with the ranking step current. */
function classState(n: number, ranking: RankingFile | null = null, prevRanking: RankingFile | null = null): ClassRankState {
  const base = collegeClassState();
  const players = { ...base.players, players: { ...base.players.players } };
  const recruits = Array.from({ length: n }, (_, i) => {
    players.players[idOf(i)] = { id: idOf(i), name: nameOf(i), birthSeason: 62 };
    return { playerId: idOf(i), position: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[i % 5], classYear: 'Fr' as const, rating: null, stars: null, projections: {}, committedTo: i === 0 ? 'BAY' : null };
  });
  return {
    board: { ...base.recruiting, recruits },
    ranking, prevRanking, players, tx: base.tx, season: 79,
    calendar: {
      season: 79,
      steps: [
        { id: 'create-s80-class', label: 'Create S80 Class', kind: 'offseason', league: null, sub: false, done: true },
        { id: 'rank-s80-class', label: 'Rank S80 Class', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
      ],
    },
  };
}
const prevFile = (ratings: number[], consensus: number[], locked = true): RankingFile => {
  const ids = ratings.map((_, i) => `p0${i + 1}`);
  return {
    league: 'fbajc', season: 78, kind: 'college-class', locked,
    rows: ids.map(playerId => ({ playerId, position: 'PG', age: null, team: null, prevRating: null, otherRating: null, stat: null })),
    order: ids, ratings: Object.fromEntries(ids.map((id, i) => [id, ratings[i]])), curve: [],
    consensus: Object.fromEntries(ids.map((id, i) => [id, consensus[i]])), consensusCurve: [],
  };
};
const started = (n: number, prev: RankingFile | null = null) => {
  const s = classState(n, null, prev);
  return { ...s, ranking: ok(startClassRanking(s)).writes[0].doc as RankingFile };
};
/** 30 recruits: 12 5-star (99 to 93.5), 14 4-star (89 to 82.5), 4 3-star (78 to 75). */
const CONSENSUS = [
  ...Array.from({ length: 12 }, (_, i) => 99 - 0.5 * i),
  ...Array.from({ length: 14 }, (_, i) => 89 - 0.5 * i),
  ...Array.from({ length: 4 }, (_, i) => 78 - i),
];
/** Everyone ranked in id order, rated 98 down. */
const filled = (n = 30, consensus: number[] = CONSENSUS): ClassRankState => {
  const s = started(n);
  let doc = takeRest(s.ranking!, id => collegeName(s.players, id));
  for (let i = 0; i < n; i++) {
    doc = setRating(doc, idOf(i), 98 - i);
    doc = setConsensus(doc, idOf(i), consensus[i]);
  }
  return { ...s, ranking: doc };
};

describe('starsFor', () => {
  it('follows the consensus: 90 5, 80 4, 70 3', () => {
    expect([90, 89.99, 80, 79.9, 70, 69.9].map(starsFor)).toEqual([5, 4, 4, 3, 3, null]);
  });
});

describe('startClassRanking', () => {
  it('builds one row per recruit and no curves without a previous class', () => {
    const r = ok(startClassRanking(classState(30)));
    expect(r.writes.map(w => w.path)).toEqual([classRankingPath(79)]);
    expect(r.label).toBe('Start S80 class ranking');
    const doc = RankingFile.parse(r.writes[0].doc);
    expect(doc).toMatchObject({ league: 'fbajc', season: 79, kind: 'college-class', locked: false, order: [], ratings: {}, curve: [], consensus: {}, consensusCurve: [] });
    expect(doc.rows).toHaveLength(30);
    expect(doc.rows[0]).toEqual({ playerId: idOf(0), position: 'PG', age: null, team: 'BAY', prevRating: null, otherRating: null, stat: null });
    expect(doc.rows[1].team).toBeNull();
  });

  it("takes both curves from the previous locked class's ratings and consensus, high to low", () => {
    const doc = ok(startClassRanking(classState(3, null, prevFile([90, 94, 92], [95, 99.5, 97])))).writes[0].doc as RankingFile;
    expect(doc.curve).toEqual([94, 92, 90]);
    expect(doc.consensusCurve).toEqual([99.5, 97, 95]);
  });

  it('ignores a previous ranking that is not locked', () => {
    const doc = ok(startClassRanking(classState(3, null, prevFile([90], [95], false)))).writes[0].doc as RankingFile;
    expect(doc.curve).toEqual([]);
    expect(doc.consensusCurve).toEqual([]);
  });

  it('refuses a second start, an empty class and a class that is not created', () => {
    expect(problems(startClassRanking(started(3)))).toEqual(['The class ranking has already started']);
    expect(problems(startClassRanking(classState(0)))).toEqual(['The class has no recruits']);
    const s = classState(3);
    expect(problems(startClassRanking({ ...s, board: { ...s.board, created: false, recruits: [] } }))).toEqual(["The class hasn't been created yet"]);
  });
});

describe('consensus helpers', () => {
  it('suggests the consensus that held rank k', () => {
    const doc = { ...started(3).ranking!, consensusCurve: [99, 95.5] };
    expect([consensusSuggestion(doc, 1), consensusSuggestion(doc, 2), consensusSuggestion(doc, 3)]).toEqual([99, 95.5, null]);
  });

  it('sets, rounds and clears a consensus, and refuses anything else', () => {
    const doc = started(3).ranking!;
    const a = setConsensus(doc, idOf(0), 94.256);
    expect(a.consensus).toEqual({ [idOf(0)]: 94.26 });
    expect(setConsensus(a, idOf(0), null).consensus).toEqual({});
    for (const bad of [69.99, 100.01, NaN, Infinity]) expect(setConsensus(doc, idOf(0), bad)).toBe(doc);
    expect(setConsensus(doc, 'nobody', 90)).toBe(doc);
    expect(setConsensus(doc, idOf(0), null)).toBe(doc);
    expect(setConsensus(a, idOf(0), 94.26)).toBe(a);
    const locked = { ...doc, locked: true };
    expect(setConsensus(locked, idOf(0), 90)).toBe(locked);
  });

  it('fills a missing R and consensus from the suggestions and never overwrites', () => {
    const s = started(3, prevFile([94, 93, 92], [99, 98, 97]));
    let doc = take(take(take(s.ranking!, idOf(0)), idOf(1)), idOf(2));
    doc = setRating(doc, idOf(0), 90);
    doc = setConsensus(doc, idOf(1), 95);
    const out = applyClassSuggestions(doc);
    expect(out.ratings).toEqual({ [idOf(0)]: 90, [idOf(1)]: 93, [idOf(2)]: 92 });
    expect(out.consensus).toEqual({ [idOf(0)]: 99, [idOf(1)]: 95, [idOf(2)]: 97 });
    expect(applyClassSuggestions(out)).toBe(out);
    const locked = applyClassSuggestions({ ...doc, locked: true });
    expect(locked.consensus).toEqual({ [idOf(1)]: 95 });
  });
});

describe('classBlockers', () => {
  it('needs a started, unfinished ranking', () => {
    expect(classBlockers(classState(3))).toEqual(['Start the class ranking first']);
    const s = started(3);
    expect(classBlockers({ ...s, ranking: { ...s.ranking!, locked: true } })).toEqual(['The class is already ranked']);
  });

  it('is clear for a full 12/14/4 class in order', () => {
    expect(classBlockers(filled())).toEqual([]);
  });

  it('reports the rating blockers, players missing a consensus and an out-of-order consensus', () => {
    const s = filled(3);
    const noCons = { ...s.ranking!, consensus: { [idOf(0)]: 94, [idOf(2)]: 94 } };
    expect(classBlockers({ ...s, ranking: noCons })).toEqual(['1 player still needs a consensus', 'The star mix needs at least 15 recruits']);
    const up = setConsensus(setConsensus(setConsensus(s.ranking!, idOf(0), 94), idOf(1), 95.1), idOf(2), 93);
    expect(classBlockers({ ...s, ranking: up })).toEqual([
      '#2 Kid 02 (95.1) has a higher consensus than #1 Kid 01 (94.0)', 'The star mix needs at least 15 recruits',
    ]);
    const rated = setRating(s.ranking!, idOf(1), 99);
    expect(classBlockers({ ...s, ranking: rated })[0]).toBe('#2 Kid 02 (99) is rated above #1 Kid 01 (98)');
    const unranked = { ...s.ranking!, order: [idOf(0)] };
    expect(classBlockers({ ...s, ranking: unranked })[0]).toBe("2 players aren't ranked yet");
  });

  it('allows tied consensus', () => {
    expect(classBlockers(filled(30, CONSENSUS.map((v, i) => (i === 1 ? CONSENSUS[0] : v))))).toEqual([]);
  });

  it('checks the star mix on a class of 15 or more', () => {
    const at = (patch: Record<number, number>) => CONSENSUS.map((v, i) => patch[i] ?? v);
    expect(classBlockers(filled(30, at({ 12: 92 })))).toEqual([]);
    expect(classBlockers(filled(30, at({ 11: 89 })))).toEqual(['The class has 11 5★ recruits; it needs 12–13']);
    expect(classBlockers(filled(30, at({ 12: 92, 13: 91.5 })))).toEqual(['The class has 14 5★ recruits; it needs 12–13']);
    expect(classBlockers(filled(30, at({ 26: 80, 27: 80 })))).toEqual(['The class has 2 3★ recruits; it needs 3–5']);
  });
});

describe('finishClassRanking', () => {
  it('locks the ranking, writes each recruit, logs the class and marks the step done', () => {
    const s = filled();
    const r = ok(finishClassRanking(s, ctx));
    expect(r.label).toBe('Finish S80 class ranking');
    expect(r.writes.map(w => w.path)).toEqual([classRankingPath(79), boardPath(79), 'leagues/fbajc/S79/transactions.json', 'calendar.json']);
    const [ranking, board, tx, cal] = r.writes.map(w => w.doc) as [RankingFile, RecruitingFile, typeof s.tx, typeof s.calendar];
    expect(RankingFile.parse(ranking).locked).toBe(true);
    expect(RecruitingFile.parse(board).recruits[0]).toMatchObject({ playerId: idOf(0), rating: 98, consensus: 99, stars: 5, committedTo: 'BAY' });
    expect(board.recruits[12]).toMatchObject({ rating: 86, consensus: 89, stars: 4 });
    expect(board.recruits[29]).toMatchObject({ rating: 69, consensus: 75, stars: 3 });
    expect(tx.entries.at(-1)).toMatchObject({ batchId: 'b1', type: 'class', teams: [], lines: ['S80 class ranked: 30 recruits'] });
    expect(cal.steps.find(x => x.id === 'rank-s80-class')?.done).toBe(true);
  });

  it('is refused with blockers, out of calendar order, when already ranked and when not started', () => {
    const s = filled();
    expect(problems(finishClassRanking({ ...s, ranking: setConsensus(s.ranking!, idOf(3), null) }, ctx))).toEqual(['1 player still needs a consensus']);
    const early = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'create-s80-class' ? { ...x, done: false } : x)) } };
    expect(problems(finishClassRanking(early, ctx))).toEqual(['The class is ranked at the Rank S80 Class step (current step: Create S80 Class)']);
    expect(problems(finishClassRanking({ ...s, ranking: { ...s.ranking!, locked: true } }, ctx))).toEqual(['The class is already ranked']);
    expect(problems(finishClassRanking(classState(3), ctx))).toEqual(['Start the class ranking first']);
  });
});

describe('class edits once ranked', () => {
  it('refuses to remove a recruit and adds no draft rows, but still renames and repositions', () => {
    const base = collegeClassState();
    const s = { ...base, ranked: true };
    const id = base.recruiting.recruits[1].playerId;
    expect(problems(removeRecruit(s, id))).toEqual(["The class is being ranked; recruits can't be removed"]);
    expect(ok(removeRecruit(base, id)).changed).toEqual(['recruiting', 'players']);
    expect(addDraftRow(s.recruiting, { name: 'A', position: 'PG' })).toBe(s.recruiting);
    expect(appendDraftRows(s.recruiting, [{ name: 'A', position: 'PG' }])).toBe(s.recruiting);
    expect(ok(editRecruit(s, id, { name: 'New Name' })).changed).toEqual(['players']);
    expect(ok(editRecruit(s, id, { position: 'C' })).changed).toEqual(['recruiting']);
  });
});

describe('parseConsensusInput', () => {
  it('accepts blank, or 70 to 100 with up to 2 decimals', () => {
    expect(parseConsensusInput('')).toEqual({ ok: true, value: null });
    expect(parseConsensusInput('  ')).toEqual({ ok: true, value: null });
    expect([' 98.8 ', '70', '100', '100.00', '94.25'].map(t => parseConsensusInput(t))).toEqual([
      { ok: true, value: 98.8 }, { ok: true, value: 70 }, { ok: true, value: 100 }, { ok: true, value: 100 }, { ok: true, value: 94.25 },
    ]);
  });
  it('rejects anything else', () => {
    for (const t of ['69.99', '100.01', '101', 'abc', '9x', '94.255', '.5', '-80', '1e2']) expect(parseConsensusInput(t).ok, t).toBe(false);
  });
});
