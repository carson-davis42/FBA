import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { GameResult, PicksFile, TransactionsFile } from '../shared/types';
import { draftOrder, drawLottery, LOTTERY_ODDS, lotteryOdds, lotteryPath, lotteryStepId, runLottery, type LotteryState } from './lottery';
import { calendar, ctx, ob, playoffs, state } from './testFixtures';

const TABLE = LOTTERY_ODDS[14];
const team = (i: number, w = 100 - i, l = i) => ({ teamId: `T${i}`, w, l });

describe('lotteryOdds', () => {
  it('gives 14 distinct records the table in order', () => {
    const r = lotteryOdds(Array.from({ length: 14 }, (_, i) => team(i, i, 80 - i)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.odds.map(o => o.pct)).toEqual(TABLE);
    expect(r.odds.map(o => o.slot)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(r.odds[0]).toEqual({ teamId: 'T0', slot: 1, w: 0, l: 80, pct: 14 });
  });

  it('shares the average among teams tied on record', () => {
    const teams = Array.from({ length: 14 }, (_, i) => team(i, i, 80 - i));
    teams[1] = { ...teams[1], w: teams[0].w, l: teams[0].l };
    for (const i of [3, 4, 5]) teams[i] = { ...teams[i], w: 10, l: 70 };
    const r = lotteryOdds(teams);
    if (!r.ok) throw new Error(r.problem);
    expect(r.odds.slice(0, 3).map(o => o.pct)).toEqual([14, 14, 14]);
    for (const i of [3, 4, 5]) expect(r.odds[i].pct).toBeCloseTo((12.5 + 10.5 + 9) / 3, 10);
    expect(r.odds[6].pct).toBe(7.5);
  });

  it('refuses a lottery size it has no table for', () => {
    expect(lotteryOdds(Array.from({ length: 13 }, (_, i) => team(i)))).toEqual({ ok: false, problem: 'No lottery odds for a 13-team lottery' });
  });
});

describe('drawLottery', () => {
  const odds = TABLE.map((pct, i) => ({ teamId: `T${i}`, pct }));

  it('is deterministic for a seed and a permutation of the input', () => {
    const a = drawLottery(odds, mulberry32(1));
    expect(drawLottery(odds, mulberry32(1))).toEqual(a);
    expect([...a].sort()).toEqual(odds.map(o => o.teamId).sort());
  });

  it('gives pick 1 to a team about as often as its odds', () => {
    const rng = mulberry32(7);
    let top = 0;
    let last = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const d = drawLottery(odds, rng);
      if (d[0] === 'T0') top++;
      if (d[0] === 'T13') last++;
    }
    expect(Math.abs((top / N) * 100 - 14)).toBeLessThan(1.5);
    expect(Math.abs((last / N) * 100 - 0.5)).toBeLessThan(0.5);
  });
});

describe('draftOrder', () => {
  it('puts the lottery first, the rest worst first, and the champion last', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F'].map(teamId => ({ teamId, group: 'E' }));
    // Records: A 5-0, B 4-1, C 3-2, D 2-3, E 1-4, F 0-5 (an earlier letter beats a later one).
    const games: GameResult[] = [];
    let n = 1;
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) games.push({ gameNo: n++, home: teams[i].teamId, away: teams[j].teamId, homePts: 100, awayPts: 90 });
    // F is drawn into the lottery; C is the champion though B has the better record.
    expect(draftOrder({ lottery: ['F'], teams, games, champion: 'C' })).toEqual(['F', 'E', 'D', 'B', 'A', 'C']);
  });
});

describe('runLottery', () => {
  it('writes the lottery, the picks, the transaction and the calendar', () => {
    const r = runLottery(state(), mulberry32(3), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.writes.map(w => w.path)).toEqual([lotteryPath(79), 'leagues/fba/picks.json', 'leagues/fba/S79/transactions.json', 'calendar.json']);
    const lot = r.writes[0].doc as { locked: boolean; draftSeason: number; picks: unknown[]; lottery: string[]; order: string[] };
    expect(lot).toMatchObject({ locked: true, draftSeason: 80 });
    expect(lot.picks).toHaveLength(30);
    expect(lot.lottery).toHaveLength(14);
    expect(lot.order).toHaveLength(30);
    expect(lot.order[29]).toBe('T00');
    const tx = r.writes[2].doc as TransactionsFile;
    expect(tx.entries).toHaveLength(1);
    expect(tx.entries[0]).toMatchObject({ type: 'lottery', teams: [lot.lottery[0]], lines: [`S80 Draft Lottery: ${lot.lottery[0]} wins the first pick`] });
    const cal = r.writes[3].doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === lotteryStepId(79))?.done).toBe(true);
  });

  it('refuses off the calendar step, a second run, and unfinished playoffs', () => {
    const early = { ...calendar(), steps: calendar().steps.map(s => ({ ...s, done: false })) };
    const a = runLottery(state({ calendar: early }), mulberry32(1), ctx);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.problems[0]).toContain('S80 FBA Draft Lottery step');
    const done = runLottery(state(), mulberry32(1), ctx);
    if (!done.ok) throw new Error('setup');
    const b = runLottery(state({ lottery: done.writes[0].doc as LotteryState['lottery'] }), mulberry32(1), ctx);
    expect(b).toEqual({ ok: false, problems: ['The lottery has already been run'] });
    const c = runLottery(state({ playoffs: null }), mulberry32(1), ctx);
    expect(c).toEqual({ ok: false, problems: ["The FBA playoffs aren't finished"] });
    const d = runLottery(state({ playoffs: { ...playoffs(), outcome: null } }), mulberry32(1), ctx);
    expect(d).toEqual({ ok: false, problems: ["The FBA playoffs aren't finished"] });
  });

  it('fails cleanly when a pick names an unknown team', () => {
    const r = runLottery(state({ picks: { league: 'fba', obligations: [ob({ originalTeam: 'ZZZ' })] } as PicksFile }), mulberry32(1), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/ZZZ/);
  });

  it('rolls a top-1 protected pick on the lottery winner to the next season', () => {
    const first = runLottery(state(), mulberry32(3), ctx);
    if (!first.ok) throw new Error('setup');
    const winner = (first.writes[0].doc as { lottery: string[] }).lottery[0];
    const picks = { league: 'fba', obligations: [ob({ id: 'p1', originalTeam: winner, condition: { kind: 'top', n: 1 }, originalCondition: { kind: 'top', n: 1 } })] } as PicksFile;
    const r = runLottery(state({ picks }), mulberry32(3), ctx);
    if (!r.ok) throw new Error('run');
    const obligations = (r.writes[1].doc as PicksFile).obligations;
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toMatchObject({ id: 'p1', season: 81, condition: { kind: 'none' } });
    expect(obligations[0].rolls).toEqual([{ fromSeason: 80, reason: 'protected' }]);
    const lot = r.writes[0].doc as { picks: { originalTeam: string; owner: string }[] };
    expect(lot.picks.find(p => p.originalTeam === winner)?.owner).toBe(winner);
  });
});
