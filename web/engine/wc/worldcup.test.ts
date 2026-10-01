import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { WorldCupFile, type CalendarFile, type QualifyingFile, type RosterEntry, type RostersFile } from '../shared/types';
import { countryRating } from './rating';
import { qualifyingStepId, worldCupStepId } from './state';
import { finishGroups, finishWorldCup, groupTable, playGroupGame, playKnockoutGame, startWorldCup, type WorldCupState } from './worldcup';

const countries = Array.from({ length: 85 }, (_, i) => `C${String(i).padStart(2, '0')}`);
const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const HOST = 'C70';

/** Previous-season World Cup rosters: generated players with a distinct rating per country. */
function previous(): RostersFile {
  const teams: Record<string, RosterEntry[]> = {};
  countries.forEach((c, i) => {
    teams[c] = POS.map(position => ({ playerId: null, position, rating: 20 + i, age: 31, points: 0 }));
  });
  return { league: 'fbawc', season: 79, locked: true, teams };
}
const d2: RostersFile = { league: 'fbad2', season: 80, locked: false, teams: {} };

const qualifying = (advancedCount = 49): QualifyingFile => ({
  league: 'fbawc',
  season: 80,
  host: HOST,
  auto: countries.slice(70, 85),
  field: countries.slice(0, 70),
  schedule: [],
  keys: {},
  games: [],
  advanced: countries.slice(0, advancedCount),
});

const calendar = (qualDone = true): CalendarFile => ({
  season: 80,
  steps: [
    { id: 'prev', label: 'Prev', kind: 'offseason', league: null, sub: false, done: true },
    { id: qualifyingStepId(80), label: 'S80 Qualifying', kind: 'league', league: 'fbawc', sub: false, done: qualDone },
    { id: worldCupStepId(80), label: 'S80 World Cup', kind: 'league', league: 'fbawc', sub: false, done: false },
  ],
});

const start = (seed = 1, cal = calendar(), q = qualifying()) =>
  startWorldCup({ season: 80, calendar: cal, d2Rosters: d2, countries, qualifying: q, previous: previous() }, mulberry32(seed));

function started(seed = 1): WorldCupState {
  const r = start(seed);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
}

function playGroups(s: WorldCupState, rng = mulberry32(7)): WorldCupState {
  for (let i = 0; i < 192; i++) {
    const r = playGroupGame(s, rng);
    if (!r.ok) throw new Error(r.problems.join());
    s = r.state;
  }
  return s;
}

function playAll(seed = 1): WorldCupState {
  let s = playGroups(started(seed));
  const f = finishGroups(s);
  if (!f.ok) throw new Error(f.problems.join());
  s = f.state;
  const rng = mulberry32(seed + 50);
  for (let i = 0; i < 31; i++) {
    const r = playKnockoutGame(s, rng);
    if (!r.ok) throw new Error(r.problems.join());
    s = r.state;
  }
  return s;
}

describe('startWorldCup', () => {
  it('builds a valid 64-team draw: pots, groups, host in A', () => {
    const s = started();
    const wc = s.worldCup!;
    expect(WorldCupFile.safeParse(wc).success).toBe(true);
    expect(new Set(wc.field).size).toBe(64);
    expect(new Set(wc.field)).toEqual(new Set([...countries.slice(70), ...countries.slice(0, 49)]));
    expect(wc.pots).toHaveLength(4);
    const rating = (id: string) => countryRating(s.rosters.teams[id]);
    wc.pots.forEach((pot, p) => {
      expect(pot).toHaveLength(16);
      for (let k = 1; k < 16; k++) expect(rating(pot[k - 1])).toBeGreaterThanOrEqual(rating(pot[k]));
      if (p > 0) expect(rating(wc.pots[p - 1][15])).toBeGreaterThanOrEqual(rating(pot[0]));
    });
    expect(Object.keys(wc.groups)).toEqual('ABCDEFGHIJKLMNOP'.split(''));
    for (const g of Object.keys(wc.groups)) {
      wc.pots.forEach((pot, p) => expect(pot).toContain(wc.groups[g][p]));
    }
    expect(wc.groups.A).toContain(HOST);
    expect(s.rosters.locked).toBe(true);
    expect(s.rosters.league).toBe('fbawc');
    expect(wc.knockout).toEqual([]);
    expect(wc.champion).toBeNull();
    expect(Object.keys(wc.keys)).toHaveLength(64);
  });

  it('schedules a double round robin: 12 games per group, each ordered pair twice, 192 total', () => {
    const wc = started().worldCup!;
    expect(wc.schedule).toHaveLength(192);
    expect(wc.schedule.map(g => g.gameNo)).toEqual(Array.from({ length: 192 }, (_, i) => i + 1));
    for (const teams of Object.values(wc.groups)) {
      const games = wc.schedule.filter(x => teams.includes(x.home) && teams.includes(x.away));
      expect(games).toHaveLength(12);
      for (const a of teams) for (const b of teams) {
        if (a !== b) expect(games.filter(x => x.home === a && x.away === b)).toHaveLength(1);
      }
    }
    // round order: the first 32 games are round 1, covering every team once
    expect(new Set(wc.schedule.slice(0, 32).flatMap(x => [x.home, x.away])).size).toBe(64);
  });

  it('is deterministic per seed', () => {
    expect(started(5).worldCup).toEqual(started(5).worldCup);
    expect(started(5).worldCup).not.toEqual(started(6).worldCup);
  });

  it('refuses when the step is not current or qualifying is unfinished', () => {
    expect(start(1, calendar(false)).ok).toBe(false);
    expect(start(1, calendar(), qualifying(0)).ok).toBe(false);
  });
});

describe('group stage', () => {
  it('plays games in schedule order, then refuses', () => {
    const rng = mulberry32(3);
    const s0 = started();
    const r = playGroupGame(s0, rng);
    if (!r.ok) throw new Error(r.problems.join());
    const first = s0.worldCup!.schedule[0];
    expect(r.state.worldCup!.groupGames[0].gameNo).toBe(1);
    expect(r.state.worldCup!.groupGames[0].home).toBe(first.home);
    const s = playGroups(started());
    expect(s.worldCup!.groupGames).toHaveLength(192);
    expect(playGroupGame(s, rng).ok).toBe(false);
  });

  it('refuses when the step is not current', () => {
    const s = started();
    expect(playGroupGame({ ...s, calendar: calendar(false) }, mulberry32(1)).ok).toBe(false);
  });

  it('ranks a group by wins', () => {
    const s = playGroups(started());
    const t = groupTable(s.worldCup!, 'C');
    expect(t.rows).toHaveLength(4);
    for (let k = 1; k < 4; k++) expect(t.rows[k - 1].w).toBeGreaterThanOrEqual(t.rows[k].w);
    expect(t.rows.reduce((n, r) => n + r.w, 0)).toBe(12);
  });

  it('refuses finishGroups early and a second time', () => {
    expect(finishGroups(started()).ok).toBe(false);
    const f = finishGroups(playGroups(started()));
    if (!f.ok) throw new Error(f.problems.join());
    expect(finishGroups(f.state).ok).toBe(false);
  });
});

describe('knockout', () => {
  const afterGroups = () => {
    const f = finishGroups(playGroups(started()));
    if (!f.ok) throw new Error(f.problems.join());
    return f.state;
  };

  it('builds the bracket with R32 pairs in the specified order', () => {
    const s = afterGroups();
    const ko = s.worldCup!.knockout;
    expect(ko).toHaveLength(31);
    expect(ko.map(g => g.id)).toEqual([
      ...Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
      'SF-1', 'SF-2', 'F-1',
    ]);
    const first = (g: string) => groupTable(s.worldCup!, g).rows[0].teamId;
    const second = (g: string) => groupTable(s.worldCup!, g).rows[1].teamId;
    expect([ko[0].home, ko[0].away]).toEqual([first('A'), second('B')]);
    expect([ko[1].home, ko[1].away]).toEqual([first('C'), second('D')]);
    expect([ko[7].home, ko[7].away]).toEqual([first('O'), second('P')]);
    expect([ko[8].home, ko[8].away]).toEqual([first('B'), second('A')]);
    expect([ko[15].home, ko[15].away]).toEqual([first('P'), second('O')]);
    for (const g of ko.slice(16)) { expect(g.home).toBeNull(); expect(g.away).toBeNull(); }
    expect(WorldCupFile.safeParse(s.worldCup).success).toBe(true);
  });

  it('plays earliest round first and advances winners', () => {
    let s = afterGroups();
    const rng = mulberry32(9);
    for (let i = 0; i < 16; i++) {
      const r = playKnockoutGame(s, rng);
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
      expect(s.worldCup!.knockout[i].game!.gameNo).toBe(193 + i);
    }
    const ko = s.worldCup!.knockout;
    const win = (i: number) => { const g = ko[i].game!; return g.homePts > g.awayPts ? g.home : g.away; };
    for (let k = 1; k <= 8; k++) {
      expect(ko[15 + k].home).toBe(win(2 * k - 2));
      expect(ko[15 + k].away).toBe(win(2 * k - 1));
    }
  });

  it('plays the whole bracket to a champion and runner-up', () => {
    const s = playAll(2);
    const wc = s.worldCup!;
    expect(wc.knockout.every(g => g.game !== null)).toBe(true);
    expect(wc.knockout[30].game!.gameNo).toBe(192 + 31);
    expect(wc.champion).not.toBeNull();
    expect(wc.runnerUp).not.toBeNull();
    expect(wc.champion).not.toBe(wc.runnerUp);
    const fin = wc.knockout[30];
    expect([fin.home, fin.away].sort()).toEqual([wc.champion, wc.runnerUp].sort());
    expect(playKnockoutGame(s, mulberry32(1)).ok).toBe(false);
    expect(WorldCupFile.safeParse(wc).success).toBe(true);
  });

  it('refuses a knockout game before the bracket exists', () => {
    expect(playKnockoutGame(started(), mulberry32(1)).ok).toBe(false);
  });

  it('is deterministic per seed', () => {
    expect(playAll(4).worldCup).toEqual(playAll(4).worldCup);
  });
});

describe('finishWorldCup', () => {
  it('refuses without a champion', () => {
    expect(finishWorldCup(started()).ok).toBe(false);
  });

  it('marks the step done and labels the champion', () => {
    const s = playAll(3);
    const f = finishWorldCup(s);
    if (!f.ok) throw new Error(f.problems.join());
    expect(f.state.calendar.steps.find(x => x.id === worldCupStepId(80))!.done).toBe(true);
    expect(f.label).toBe(`World Cup finished: ${s.worldCup!.champion}`);
    expect(f.changed).toContain('calendar');
  });
});
