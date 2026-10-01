import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { PastBracket, SummaryFile } from '../shared/types';
import { mvpCandidates, pickMvp, suggestAllAmerican } from './awards';
import { buildJcSummary, finishJcSeason, pastBracketOf, playPostToEnd, postseasonStage } from './postseason';
import { jcReadyForNit } from './testFixtures';
import { jcWrites, type JcState } from './state';

let finish: JcState;
beforeAll(() => {
  const must = (r: { ok: boolean; state?: JcState; problems?: string[] }): JcState => {
    if (!r.ok) throw new Error(r.problems!.join());
    return r.state!;
  };
  let s = jcReadyForNit();
  s = must(playPostToEnd(s, 'nit', mulberry32(2)));
  s = must(playPostToEnd(s, 'mm', mulberry32(3)));
  s = must(suggestAllAmerican(s));
  s = must(pickMvp(s, 'mm', mvpCandidates(s, 'mm')[0].playerId));
  s = must(pickMvp(s, 'nit', mvpCandidates(s, 'nit')[0].playerId));
  finish = s;
}, 240000);

describe('finishing the season', () => {
  it('is at the finish stage', () => {
    expect(postseasonStage(finish)).toBe('finish');
  });

  it('builds a summary that passes the schema, with the right champions', () => {
    const sum = buildJcSummary(finish);
    expect(SummaryFile.safeParse(sum).success).toBe(true);
    const mm = finish.postseason!.mm!;
    const final = mm.games.find(g => g.next === null)!;
    expect(sum.champions[0].teamId).toBe(mm.champion);
    expect(sum.champions[0].runnerUpId).toBe(mm.champion === final.home ? final.away : final.home);
    expect(sum.champions[0].finalsMvp).toBe(finish.awards!.mvp.mm);
    expect(sum.champions[1].title).toBe('NIT Champion');
    expect(sum.jc!.confChampions).toHaveLength(18);
    for (const c of sum.jc!.confChampions) {
      expect(c.tournament).toBe(finish.postseason!.conf.find(b => b.id === c.conf)!.champion);
      expect(c.regularSeason).toEqual(finish.postseason!.rsChampions[c.conf]);
    }
    expect(sum.jc!.national).toHaveLength(6);
    expect(sum.jc!.national.every(a => a.playerId && a.teamId)).toBe(true);
    expect(sum.jc!.conference).toHaveLength(18);
    expect(sum.jc!.allAmerican).toHaveLength(3);
    expect(sum.jc!.nit!.champion).toBe(finish.postseason!.nit!.champion);
  });

  it('turns March Madness into a past bracket: 6 rounds, 63 series, the champion at the top', () => {
    const b = pastBracketOf(finish.postseason!.mm!, id => id);
    expect(PastBracket.safeParse(b).success).toBe(true);
    expect(b.rounds).toBe(6);
    expect(b.series).toHaveLength(63);
    const final = b.series.find(s => s.id === 'R6-1')!;
    expect(final[final.winner]!.name).toBe(finish.postseason!.mm!.champion);
    expect(b.series.filter(s => s.round === 1)).toHaveLength(32);
    expect(b.series.find(s => s.id === 'R1-1')!.home!.seed).toBe(1);
  });

  it('finishes: locks the docs, marks the step done, writes the summary and the calendar', () => {
    const r = finishJcSeason(finish);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.changed).toEqual(['summary', 'postseason', 'awards', 'results', 'rankings', 'schedule', 'calendar']);
    expect(r.state.calendar.steps.find(x => x.id === 'fbajc')!.done).toBe(true);
    for (const d of [r.state.postseason, r.state.awards, r.state.results, r.state.rankings, r.state.schedule]) expect(d!.locked).toBe(true);
    expect(r.state.summary!.locked).toBe(true);
    expect(postseasonStage(r.state)).toBe('done');
    const writes = jcWrites(r);
    expect(writes.map(w => w.path)).toContain('calendar.json');
    expect(writes.map(w => w.path)).toContain('leagues/fbajc/S79/summary.json');
  });

  it('refuses before the finish stage, a second time, and when the step is not current', () => {
    const early = { ...finish, awards: { ...finish.awards!, mvp: { mm: null, nit: null } } };
    expect(finishJcSeason(early).ok).toBe(false);
    const r = finishJcSeason(finish);
    if (!r.ok) throw new Error('x');
    expect(finishJcSeason(r.state).ok).toBe(false);
    const stepDone = { ...finish, calendar: { ...finish.calendar, steps: finish.calendar.steps.map(x => ({ ...x, done: true })) } };
    expect(finishJcSeason(stepDone).ok).toBe(false);
  });

  it('refuses while recruiting items are open', () => {
    const open = { ...finish, rosters: { ...finish.rosters, teams: { ...finish.rosters.teams, [Object.keys(finish.rosters.teams)[0]]: finish.rosters.teams[Object.keys(finish.rosters.teams)[0]].map((e, i) => (i === 0 ? { ...e, playerId: null, rating: null } : e)) } } };
    const r = finishJcSeason(open);
    expect(r.ok).toBe(false);
  });
});
