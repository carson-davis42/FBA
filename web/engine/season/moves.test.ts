import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { CalendarFile } from '../shared/types';
import { closeTradeDeadline, lineup, makeSchedules, recordGames, simNextGames } from './moves';
import { blockingPause, gamesPlayed, gamesUntilStop, seasonDocPath, seasonWrites, type SeasonResult, type SeasonState } from './state';
import { d2SeasonState, fbaSeasonState } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const withPausesDoneBefore = (s: SeasonState, game: number): SeasonState => ({
  ...s, schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map(p => (p.afterGame < game ? { ...p, done: true } : p)) },
});
const play = (s: SeasonState, n: number, seed = 1): SeasonState => {
  const { games, problem } = simNextGames(s, n, mulberry32(seed));
  if (problem) throw new Error(problem);
  return ok(recordGames(s, games)).state;
};

describe('makeSchedules', () => {
  const input = () => {
    const f = fbaSeasonState();
    const d = d2SeasonState();
    const cal = { ...f.calendar, steps: f.calendar.steps.map(s => ({ ...s, done: false })) };
    return {
      season: 79, calendar: cal,
      fba: { teams: f.teams, schedule: null, results: null },
      fbad2: { teams: d.teams, schedule: null, results: null },
    };
  };

  it('writes both schedules, empty results, and marks the calendar step', () => {
    const r = makeSchedules(input(), mulberry32(4));
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Make schedules');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/schedule.json', 'leagues/fba/S79/results.json',
      'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json', 'calendar.json',
    ]);
    const fba = r.writes[0].doc as { games: unknown[]; pauses: { afterGame: number }[] };
    expect(fba.games).toHaveLength(16);
    expect(fba.pauses.map(p => p.afterGame)).toEqual([4, 8, 8, 12, 12]);
    const cal = r.writes[4].doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === 'make-s79-schedules')!.done).toBe(true);
  });

  it('re-rolls only while no games are played', () => {
    const i = input();
    const f = fbaSeasonState();
    const again = makeSchedules({ ...i, fba: { teams: f.teams, schedule: f.schedule, results: f.results } }, mulberry32(4));
    expect(again.ok && again.label).toBe('Re-roll schedules');
    const played = play(f, 1);
    const blocked = makeSchedules({ ...i, fba: { teams: f.teams, schedule: played.schedule, results: played.results } }, mulberry32(4));
    expect(blocked).toEqual({ ok: false, problems: ["Games have been played; the schedules can't be re-rolled"] });
  });
});

describe('lineup', () => {
  it('builds the five in position order, or explains what is missing', () => {
    const s = fbaSeasonState();
    const t = lineup(s, 'BOS');
    expect(typeof t === 'string' ? t : t.players.map(p => p.rating)).toEqual([95, 88, 90, 85, 94]);
    const broken: SeasonState = { ...s, rosters: { ...s.rosters, teams: { ...s.rosters.teams, BOS: s.rosters.teams.BOS.map(e => (e.position === 'C' ? { ...e, rating: null } : e)) } } };
    expect(lineup(broken, 'BOS')).toBe('BOS has no rated C');
  });
});

describe('simming and recording', () => {
  it('stops at the first pause and records games with box scores and roster points', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames(s, 10, mulberry32(2));
    expect(games.map(g => g.gameNo)).toEqual([1, 2, 3, 4]);
    const r = ok(recordGames(s, games));
    expect(r.label).toBe('Games 1–4');
    expect(r.changed).toEqual(['results', 'rosters']);
    expect(r.state.results!.games).toHaveLength(4);
    const first = r.state.results!.games[0];
    expect(first.box!.home.reduce((a, b) => a + b.pts, 0)).toBe(first.homePts);
    const totalPoints = Object.values(r.state.rosters.teams).flat().reduce((a, e) => a + e.points, 0);
    expect(totalPoints).toBe(r.state.results!.games.reduce((a, g) => a + g.homePts + g.awayPts, 0));
    expect(blockingPause(r.state)).toMatchObject({ afterGame: 4, kind: 'ratings' });
    expect(simNextGames(r.state, 5, mulberry32(3)).games).toEqual([]);
    expect(gamesUntilStop(r.state)).toBe(0);
  });

  it('refuses games out of order or past an unfinished pause', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames(s, 2, mulberry32(2));
    expect(recordGames(s, [games[1]]).ok).toBe(false);
    const at4 = play(s, 4);
    const unpaused = withPausesDoneBefore(at4, 5);
    const next = simNextGames(unpaused, 1, mulberry32(5)).games;
    expect(recordGames(at4, next)).toEqual({ ok: false, problems: ['Finish the rating adjustment pause (after game 4) first'] });
  });

  it('labels a single game and marks the calendar after the last game', () => {
    let s = withPausesDoneBefore(fbaSeasonState(), 99);
    const one = ok(recordGames(s, simNextGames(s, 1, mulberry32(8)).games));
    expect(one.label).toMatch(/^Game 1: [A-Z]+ \d+ @ [A-Z]+ \d+$/);
    s = play(s, 15);
    const last = ok(recordGames(s, simNextGames(s, 5, mulberry32(9)).games));
    expect(gamesPlayed(last.state)).toBe(16);
    expect(last.changed).toContain('calendar');
    expect(last.state.calendar.steps.find(x => x.id === 'fba')!.done).toBe(true);
  });

  it('marks the D2 step for the D2 league', () => {
    const s = d2SeasonState();
    const r = ok(recordGames(s, simNextGames(s, 10, mulberry32(1)).games));
    expect(r.state.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
    expect(r.state.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
  });
});

describe('closeTradeDeadline', () => {
  it('only works when the deadline pause is up', () => {
    const s = fbaSeasonState();
    expect(closeTradeDeadline(s)).toEqual({ ok: false, problems: ['The trade deadline is not up yet'] });
    const at8 = play(withPausesDoneBefore(s, 8), 8);
    const ratingsDone = { ...at8, schedule: { ...at8.schedule!, pauses: at8.schedule!.pauses.map((p, i) => (i === 1 ? { ...p, done: true } : p)) } };
    const r = ok(closeTradeDeadline(ratingsDone));
    expect(r.label).toBe('Close trading (trade deadline)');
    expect(r.state.schedule!.pauses.map(p => p.done)).toEqual([true, true, true, false, false]);
  });
});

describe('calendar order (F1)', () => {
  it('refuses to make schedules before the make-schedules step is current or done', () => {
    const f = fbaSeasonState();
    const d = d2SeasonState();
    const cal: CalendarFile = {
      season: 79,
      steps: [
        { id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'fba-d2', label: 'FBA D2', kind: 'league', league: 'fbad2', sub: false, done: false },
        { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
      ],
    };
    const r = makeSchedules({
      season: 79, calendar: cal,
      fba: { teams: f.teams, schedule: null, results: null },
      fbad2: { teams: d.teams, schedule: null, results: null },
    }, mulberry32(4));
    expect(r).toEqual({
      ok: false,
      problems: ['Schedules are made at the Make S79 Schedules step (current step: Free Agency/Offseason)'],
    });
  });

  it('allows a re-roll once the make-schedules step is done, as long as no games are played', () => {
    const f = fbaSeasonState();
    const d = d2SeasonState();
    const r = makeSchedules({
      season: 79, calendar: f.calendar,
      fba: { teams: f.teams, schedule: f.schedule, results: f.results },
      fbad2: { teams: d.teams, schedule: d.schedule, results: d.results },
    }, mulberry32(4));
    expect(r.ok && r.label).toBe('Re-roll schedules');
  });

  it('refuses to sim or record FBA games before the D2 cycle finishes', () => {
    const s = fbaSeasonState();
    const early: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    expect(simNextGames(early, 1, mulberry32(1))).toEqual({ games: [], problem: 'The season is played at the FBA step (current step: FBA D2)' });
    const { games } = simNextGames(s, 1, mulberry32(1));
    expect(recordGames(early, games)).toEqual({ ok: false, problems: ['The season is played at the FBA step (current step: FBA D2)'] });
  });

  it('refuses to sim or record D2 games once the FBA step is current', () => {
    const s = d2SeasonState();
    const late: SeasonState = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: true } : x)) } };
    expect(simNextGames(late, 1, mulberry32(1))).toEqual({ games: [], problem: 'The season is played at the FBA D2 step (current step: FBA)' });
    const { games } = simNextGames(s, 1, mulberry32(1));
    expect(recordGames(late, games)).toEqual({ ok: false, problems: ['The season is played at the FBA D2 step (current step: FBA)'] });
  });
});

describe('paths', () => {
  it('maps doc keys to paths, including the rating pause file', () => {
    expect(seasonDocPath('schedule', 'fbad2', 79)).toBe('leagues/fbad2/S79/schedule.json');
    expect(seasonDocPath('ratingPause', 'fba', 79, 322)).toBe('leagues/fba/S79/ratingPause-322.json');
    const s = fbaSeasonState();
    const r = ok(recordGames(s, simNextGames(s, 1, mulberry32(1)).games));
    expect(seasonWrites(r).map(w => w.path)).toEqual(['leagues/fba/S79/results.json', 'leagues/fba/S79/rosters.json']);
  });
});
