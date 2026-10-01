import { describe, expect, it } from 'vitest';
import { PastBracket, SummaryFile } from '../shared/types';
import type { MvpNames } from './mvp';
import { tournamentMvpCandidates } from './mvp';
import { buildWcSummary, finishWorldCupWithMvp } from './summary';
import { runFullWorldCup } from './testRun';

const names: MvpNames = { player: id => `Name ${id}`, team: id => `Team ${id}` };
const { w } = runFullWorldCup(79);
const wc = w.worldCup!;
const final = wc.knockout.find(k => k.round === 'F')!.game!;

describe('buildWcSummary', () => {
  it('records a real MVP', () => {
    const s = buildWcSummary(wc, names, { key: 'p00001', name: 'Name p00001', teamId: wc.champion!, generated: false, gp: 5, ppg: 20 }, null);
    expect(SummaryFile.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({ league: 'fbawc', season: 80, locked: true, host: `Team ${wc.host}` });
    expect(s.champions[0]).toMatchObject({ title: 'World Cup Champion', champion: `Team ${wc.champion}`, teamId: wc.champion, runnerUpId: wc.runnerUp, finalsMvp: 'p00001' });
    expect(s.champions[0].score).toBe(`${Math.max(final.homePts, final.awayPts)}–${Math.min(final.homePts, final.awayPts)}`);
    expect('mvpName' in s.champions[0]).toBe(false);
  });
  it('records a generated MVP and keeps existing fields', () => {
    const existing = { league: 'fbawc' as const, season: 80, locked: false, host: null, champions: [{ title: 'Other', champion: 'X', runnerUp: null, score: null }], awards: [] };
    const s = buildWcSummary(wc, names, { key: 'ITA:PG', name: 'Team ITA PG (Generated)', teamId: 'ITA', generated: true, gp: 4, ppg: 9 }, existing);
    expect(SummaryFile.safeParse(s).success).toBe(true);
    expect(s.champions[0]).toMatchObject({ finalsMvp: null, mvpName: 'Team ITA PG' });
    expect(s.champions.map(c => c.title)).toEqual(['World Cup Champion', 'Other']);
    expect(s.awards).toEqual([]);
  });
});

describe('buildWcSummary pastBracket', () => {
  const mvp = { key: 'p00001', name: 'Name p00001', teamId: 'ITA', generated: false, gp: 5, ppg: 20 };
  it('stores the knockout as a 31-series bracket', () => {
    const s = buildWcSummary(wc, names, mvp, null);
    expect(SummaryFile.safeParse(s).success).toBe(true);
    const b = s.pastBracket!;
    expect(PastBracket.safeParse(b).success).toBe(true);
    expect(b.rounds).toBe(5);
    expect(b.series).toHaveLength(31);
    const f = b.series.find(x => x.id === 'R5-1')!;
    expect(f[f.winner]!.name).toBe(`Team ${wc.champion}`);
    expect(f[f.winner === 'home' ? 'away' : 'home']!.name).toBe(`Team ${wc.runnerUp}`);
    const rm: Record<string, number> = { R32: 1, R16: 2, QF: 3, SF: 4, F: 5 };
    for (const k of wc.knockout) {
      const s1 = b.series.find(x => x.id === `R${rm[k.round]}-${k.id.split('-')[1]}`)!;
      expect(s1.score!.split('–')[0]).toBe(String(Math.max(k.game!.homePts, k.game!.awayPts)));
    }
  });
  it('replaces an existing pastBracket', () => {
    const old = { rounds: 1, series: [] };
    const s = buildWcSummary(wc, names, mvp, { league: 'fbawc', season: 80, locked: false, host: null, champions: [], pastBracket: old } as never);
    expect(s.pastBracket!.series).toHaveLength(31);
  });
  it('gives no pastBracket for an unfinished knockout', () => {
    const part = { ...wc, knockout: wc.knockout.map((k, i) => (i === 0 ? { ...k, game: null } : k)) } as typeof wc;
    expect(buildWcSummary(part, names, mvp, null).pastBracket).toBeUndefined();
    expect(buildWcSummary({ ...wc, knockout: [] }, names, mvp, null).pastBracket).toBeUndefined();
  });
});

describe('finishWorldCupWithMvp', () => {
  it('fails for an unknown key', () => {
    expect(finishWorldCupWithMvp(w, 'nobody', names, null).ok).toBe(false);
  });
  it('returns the calendar and summary writes', () => {
    const key = tournamentMvpCandidates(wc, names)[0].key;
    const r = finishWorldCupWithMvp(w, key, names, null);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.label).toMatch(/^World Cup finished: Team .+, MVP /);
    expect(r.writes.map(x => x.path)).toEqual(['calendar.json', 'leagues/fbawc/S80/summary.json']);
    const cal = r.writes[0].doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === 's80-world-cup')!.done).toBe(true);
    expect(SummaryFile.safeParse(r.writes[1].doc).success).toBe(true);
  });
});
