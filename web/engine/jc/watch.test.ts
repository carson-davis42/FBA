import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { JC_PROFILE, simGame, type SimGame } from '../season/sim';
import { confDone, playConfRound, startConfTournaments } from './confTourney';
import { lineupOf, playDay } from './play';
import { jcPlayedFixture, jcStateFixture } from './testFixtures';
import type { JcResult, JcState } from './state';
import { nextConfGame, nextJcGame, quickSimNext, recordConfGame, recordJcGame } from './watch';

const must = (r: JcResult): JcState => {
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

function simOf(state: JcState, next: { gameNo: number; home: string; away: string }, seed: number): SimGame {
  const home = lineupOf(state.rosters.teams[next.home], next.home);
  const away = lineupOf(state.rosters.teams[next.away], next.away);
  if (typeof home === 'string' || typeof away === 'string') throw new Error('lineup');
  return simGame(next.gameNo, home, away, mulberry32(seed), JC_PROFILE);
}

function watchNext(state: JcState, seed: number): JcState {
  const next = nextJcGame(state);
  if (typeof next === 'string') throw new Error(next);
  return must(recordJcGame(state, simOf(state, next, seed), mulberry32(seed + 1)));
}

describe('watching regular-season games', () => {
  it('the next game is game 1 on day 1, and a record adds a result and points', () => {
    const s0 = jcStateFixture();
    const next = nextJcGame(s0);
    expect(typeof next !== 'string' && next.gameNo).toBe(1);
    const r = recordJcGame(s0, simOf(s0, next as never, 3), mulberry32(4));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.results!.games).toHaveLength(1);
    expect(r.changed).toEqual(['results', 'rosters']);
    const line = r.state.results!.games[0].box!.home[0];
    const before = s0.rosters.teams[r.state.results!.games[0].home].find(e => e.playerId === line.playerId)!;
    const after = r.state.rosters.teams[r.state.results!.games[0].home].find(e => e.playerId === line.playerId)!;
    expect(after.points).toBe(before.points + line.pts);
    expect(typeof line.def).toBe('number');
    const after2 = nextJcGame(r.state);
    expect(typeof after2 !== 'string' && after2.gameNo).toBe(2);
  });

  it('refuses a game that is not open (another day, already played) and one with the wrong teams', () => {
    const s0 = jcStateFixture();
    const first = s0.schedule!.days[0].games[0];
    expect(recordJcGame(s0, simOf(s0, { ...first, home: first.away, away: first.home }, 1), mulberry32(1)).ok).toBe(false);
    const later = { gameNo: 109, home: first.home, away: first.away };
    expect(recordJcGame(s0, simOf(s0, later, 1), mulberry32(1)).ok).toBe(false);
    const s1 = watchNext(s0, 5);
    expect(recordJcGame(s1, simOf(s1, first, 1), mulberry32(1)).ok).toBe(false);
  });

  it("any game of the open day can be watched, so one tournament's next game is its own", () => {
    const s0 = jcStateFixture();
    const day = s0.schedule!.days[0];
    const tournament = day.games[50].tournament!;
    const mine = day.games.filter(g => g.tournament === tournament).map(g => g.gameNo);
    const next = nextJcGame(s0, tournament);
    expect(typeof next !== 'string' && next.gameNo).toBe(mine[0]);
    expect(typeof nextJcGame(s0)).not.toBe('string');
    // Watch two of that tournament's games before game 1: the day's other games are untouched and the results stay in game order.
    let s = must(recordJcGame(s0, simOf(s0, next as never, 7), mulberry32(8)));
    const second = nextJcGame(s, tournament);
    expect(typeof second !== 'string' && second.gameNo).toBe(mine[1]);
    s = must(recordJcGame(s, simOf(s, second as never, 9), mulberry32(10)));
    expect(s.results!.games.map(g => g.gameNo)).toEqual([mine[0], mine[1]]);
    expect(nextJcGame(s, tournament)).toMatchObject({ gameNo: mine[2] });
    expect(nextJcGame(s)).toMatchObject({ gameNo: 1 });
  });

  it('a tournament with no games left today says so', () => {
    let s = jcStateFixture();
    const day = s.schedule!.days[0];
    const tournament = day.games[0].tournament!;
    for (const g of day.games.filter(x => x.tournament === tournament)) {
      s = must(recordJcGame(s, simOf(s, g, g.gameNo), mulberry32(g.gameNo)));
    }
    expect(nextJcGame(s, tournament)).toBe('That tournament has no games left today');
  });

  it('finishing a day by watching adds its ranking snapshot and draws day 2', () => {
    let s = jcStateFixture();
    for (let i = 0; i < 108; i++) s = watchNext(s, 10 + i);
    expect(s.results!.games).toHaveLength(108);
    expect(s.rankings!.snapshots.map(x => x.afterDay)).toEqual([1]);
    expect(s.schedule!.days.find(d => d.day === 2)!.games).toHaveLength(108);
    const next = nextJcGame(s);
    expect(typeof next !== 'string' && next.day).toBe(2);
  });

  it('a partly watched day is finished by "play day" without duplicating games', () => {
    let s = jcStateFixture();
    for (let i = 0; i < 3; i++) s = watchNext(s, 20 + i);
    const r = must(playDay(s, mulberry32(9)));
    expect(r.results!.games).toHaveLength(108);
    expect(new Set(r.results!.games.map(g => g.gameNo)).size).toBe(108);
    expect(r.rankings!.snapshots).toHaveLength(1);
  });

  it('after "play day" finished day 1, the next watchable game is on day 2', () => {
    const s = must(playDay(jcStateFixture(), mulberry32(3)));
    const next = nextJcGame(s);
    expect(typeof next !== 'string' && next.day).toBe(2);
    expect(typeof next !== 'string' && next.gameNo).toBe(109);
  });

  it('refuses when the step is not current', () => {
    const s = jcStateFixture();
    const done = { ...s, calendar: { ...s.calendar, steps: s.calendar.steps.map(x => ({ ...x, done: true })) } };
    expect(typeof nextJcGame(done)).toBe('string');
  });
});

describe('watching conference tournament games', () => {
  let played: JcState;
  let started: JcState;
  beforeAll(() => {
    played = jcPlayedFixture();
    started = must(startConfTournaments(played));
  }, 120000);

  it('the next game is the first first-round game; a record stores it in its bracket', () => {
    const next = nextConfGame(started);
    if (typeof next === 'string') throw new Error(next);
    expect(next.round).toBe(1);
    expect(next.gameNo).toBe(3133);
    const r = must(recordConfGame(started, simOf(started, next, 5), mulberry32(6)));
    const bracket = r.postseason!.conf.find(b => b.id === next.bracketId)!;
    expect(bracket.games.find(g => g.id === next.gameId)!.result).not.toBeNull();
    expect(r.postseason!.nextGameNo).toBe(3134);
    expect(r.rankings!.snapshots.length).toBe(started.rankings!.snapshots.length);
  });

  it('finishing a round by watching adds one snapshot, and the round-based play moves on from there', () => {
    let s = started;
    const before = s.rankings!.snapshots.length;
    for (let i = 0; i < 72; i++) {
      const next = nextConfGame(s);
      if (typeof next === 'string') throw new Error(next);
      s = must(recordConfGame(s, simOf(s, next, 100 + i), mulberry32(200 + i)));
    }
    expect(s.rankings!.snapshots.length).toBe(before + 1);
    expect(s.rankings!.snapshots.at(-1)!.afterDay).toBe(30);
    const nextRound = nextConfGame(s);
    expect(typeof nextRound !== 'string' && nextRound.round).toBe(2);
    const rest = must(playConfRound(s, mulberry32(7)));
    expect(rest.postseason!.nextGameNo).toBe(3133 + 72 + 72);
    expect(confDone(rest)).toBe(false);
  });

  it('refuses a game that is not next, and before the tournaments start', () => {
    const next = nextConfGame(started);
    if (typeof next === 'string') throw new Error(next);
    expect(recordConfGame(started, simOf(started, { ...next, gameNo: next.gameNo + 1 }, 1), mulberry32(1)).ok).toBe(false);
    expect(typeof nextConfGame(played)).toBe('string');
  });
});

describe('quick-simming the next game', () => {
  it('plays and records the next game without watching it', () => {
    const r = quickSimNext(jcStateFixture(), mulberry32(5));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.results!.games.map(g => g.gameNo)).toEqual([1]);
    expect(r.changed).toEqual(['results', 'rosters']);
  });
  it("plays the next game of one tournament when given its id", () => {
    const s0 = jcStateFixture();
    const t = s0.schedule!.days[0].games[50].tournament!;
    const want = s0.schedule!.days[0].games.find(g => g.tournament === t)!.gameNo;
    const r = quickSimNext(s0, mulberry32(5), t);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.results!.games.map(g => g.gameNo)).toEqual([want]);
  });
});
