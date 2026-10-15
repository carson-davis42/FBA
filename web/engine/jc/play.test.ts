import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { RosterEntry } from '../shared/types';
import { conferencesOf, isNeutralDay, playConference, playDay, playToEnd, progressRatings, regularSeasonOver } from './play';
import { dayPlayed as dayPlayedOf } from './state';
import { jcStateFixture } from './testFixtures';

const entry = (rating: number, id = 'p00001'): RosterEntry => ({ playerId: id, position: 'PG', rating, age: null, points: 0 });

describe('playDay uses the FBAJC sim', () => {
  it('a 55-rated starter scores over a day of games (the FBA weighting gives him nothing)', () => {
    const s = jcStateFixture();
    const teams = { ...s.rosters.teams };
    for (const id of Object.keys(teams)) teams[id] = teams[id].map((e, i) => (i === 4 ? { ...e, rating: 55 } : { ...e, rating: Math.max(e.rating!, 70) }));
    const r = playDay({ ...s, rosters: { ...s.rosters, teams } }, mulberry32(4));
    if (!r.ok) throw new Error(r.problems.join());
    const pts = Object.values(r.state.rosters.teams).filter(es => es[4].points > 0).length;
    expect(pts).toBeGreaterThan(50);
  });
});

describe('defensive stats', () => {
  it('every box line of a day carries the defense fields, measured against one reference rating', () => {
    const r = playDay(jcStateFixture(), mulberry32(5));
    if (!r.ok) throw new Error(r.problems.join());
    for (const g of r.state.results!.games) {
      for (const line of [...g.box!.home, ...g.box!.away]) {
        expect(typeof line.def).toBe('number');
        expect(typeof line.stops).toBe('number');
        expect(typeof line.allowed).toBe('number');
        expect(typeof line.exp).toBe('number');
      }
    }
    expect(r.state.results!.games[0].box!.home[0].def).toBeGreaterThan(0);
  });
});

describe('progressRatings', () => {
  it('never exceeds 99 or lowers a rating, and 99 stays 99', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const r = 40 + (i % 60);
      const out = progressRatings([entry(r)], { p00001: 30 }, i % 2 === 0, 70, 65, rng)[0].rating!;
      expect(out).toBeGreaterThanOrEqual(r);
      expect(out).toBeLessThanOrEqual(99);
    }
    expect(progressRatings([entry(99)], { p00001: 40 }, true, 90, 60, rng)[0].rating).toBe(99);
  });
  it('gains less after a loss', () => {
    const rng = mulberry32(11);
    let win = 0;
    let loss = 0;
    for (let i = 0; i < 2000; i++) {
      win += progressRatings([entry(70)], { p00001: 10 }, true, 65, 65, rng)[0].rating! - 70;
      loss += progressRatings([entry(70)], { p00001: 10 }, false, 65, 65, rng)[0].rating! - 70;
    }
    expect(win / 2000).toBeGreaterThan(loss / 2000);
  });
});

describe('playDay', () => {
  it('plays day 1: 108 results, points added, a ranking snapshot, day 2 filled', () => {
    const s0 = jcStateFixture();
    const r = playDay(s0, mulberry32(7));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.results!.games).toHaveLength(108);
    expect(r.changed).toEqual(['schedule', 'results', 'rosters', 'rankings']);
    expect(r.state.schedule!.days.find(d => d.day === 2)!.games).toHaveLength(108);
    expect(r.state.rankings!.snapshots).toHaveLength(1);
    expect(r.state.rankings!.snapshots[0].afterDay).toBe(1);
    expect(new Set(r.state.rankings!.snapshots[0].order).size).toBe(216);
    for (const g of r.state.results!.games) {
      g.box!.home.forEach((b) => {
        const before = s0.rosters.teams[g.home].find(e => e.playerId === b.playerId)!;
        const after = r.state.rosters.teams[g.home].find(e => e.playerId === b.playerId)!;
        expect(after.points).toBe(before.points + b.pts);
      });
    }
    const r2 = playDay(r.state, mulberry32(8));
    if (!r2.ok) throw new Error(r2.problems.join());
    expect(r2.changed).toContain('schedule');
    expect(r2.state.schedule!.days.find(d => d.day === 3)!.games).toHaveLength(108);
    expect(r2.state.schedule!.days.find(d => d.day === 2)!.games).toHaveLength(108);
    expect(r2.state.results!.games[108].gameNo).toBe(109);
  });
  it('creates the rankings doc when missing', () => {
    const r = playDay({ ...jcStateFixture(), rankings: null }, mulberry32(1));
    expect(r.ok && r.state.rankings!.snapshots).toHaveLength(1);
  });
  it('refuses when the step is not current', () => {
    const s = jcStateFixture();
    s.calendar = { ...s.calendar, steps: s.calendar.steps.map(x => ({ ...x, done: true })) };
    expect(playDay(s, mulberry32(1)).ok).toBe(false);
  });
});

describe('playToEnd', () => {
  const s0 = jcStateFixture();
  const r = playToEnd(s0, mulberry32(7));
  if (!r.ok) throw new Error(r.problems.join());
  it('plays all 3132 games, 29 snapshots, no team twice a day', () => {
    expect(r.state.results!.games).toHaveLength(3132);
    expect(r.state.rankings!.snapshots).toHaveLength(29);
    expect(regularSeasonOver(r.state)).toBe(true);
    expect(r.label).toBe('Play to end of regular season');
    const games = r.state.results!.games;
    for (let d = 0; d < 29; d++) {
      const day = games.slice(d * 108, d * 108 + 108).flatMap(g => [g.home, g.away]);
      expect(new Set(day).size).toBe(216);
    }
  });
  it('is deterministic for a seed', () => {
    const again = playToEnd(jcStateFixture(), mulberry32(7));
    expect(again.ok && again.state.results).toEqual(r.state.results);
  });
  it('refuses once the season is over', () => {
    expect(playToEnd(r.state, mulberry32(1)).ok).toBe(false);
    expect(playDay(r.state, mulberry32(1)).ok).toBe(false);
  });
});

describe('home-court edge', () => {
  // Every player a 70, so each possession's odds are identical except for the edge.
  const flat = () => {
    const s = jcStateFixture();
    const teams = { ...s.rosters.teams };
    for (const id of Object.keys(teams)) teams[id] = teams[id].map(e => ({ ...e, rating: 70 }));
    return { ...s, rosters: { ...s.rosters, teams } };
  };

  it('a tournament day is neutral and a challenge day gives the home side the edge', () => {
    let s = flat();
    const rng = mulberry32(3);
    for (let day = 1; day <= 4; day++) {
      const r = playDay(s, rng);
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
    }
    const all = s.results!.games;
    const sides = (day: number) => {
      const games = all.filter(g => g.gameNo > (day - 1) * 108 && g.gameNo <= day * 108);
      const sum = (side: 'home' | 'away') => games.reduce((n, g) => n + g.box![side].reduce((m, l) => m + (l.offExp ?? 0), 0), 0);
      return { home: sum('home'), away: sum('away') };
    };
    const kind = (day: number) => s.schedule!.days.find(d => d.day === day)!.kind;
    expect(kind(1)).toBe('tournament');
    expect(kind(4)).toBe('challenge');
    const t = sides(1);
    expect(t.home).toBe(t.away);
    const c = sides(4);
    expect(c.home).toBeGreaterThan(c.away);
  });
});

describe('home-court advantage', () => {
  it('only conference and challenge days have a home side; tournaments and the postseason are neutral', () => {
    expect(isNeutralDay('tournament')).toBe(true);
    expect(isNeutralDay(undefined)).toBe(true);
    expect(isNeutralDay('conference')).toBe(false);
    expect(isNeutralDay('challenge')).toBe(false);
  });

  it('a preseason tournament day plays on a neutral court: the same seed gives the home sides no edge, a conference day does', () => {
    const homePoints = (kind: 'tournament' | 'conference'): number => {
      const s = jcStateFixture();
      s.schedule!.days[0].kind = kind;
      const r = playDay(s, mulberry32(11));
      if (!r.ok) throw new Error(r.problems.join());
      return r.state.results!.games.reduce((n, g) => n + g.homePts - g.awayPts, 0);
    };
    // With the same random stream, the home edge turns some misses into makes for the home side, so its margin only grows.
    expect(homePoints('conference')).toBeGreaterThan(homePoints('tournament'));
  });

  it('a long run of tournament days shows no home side advantage', () => {
    // Same lineups, 108 x 25 games: the first-listed side wins about half of them (it only differs from 50% by chance).
    let homeWins = 0, total = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = jcStateFixture();
      for (const id of Object.keys(s.rosters.teams)) s.rosters.teams[id] = s.rosters.teams[id].map(e => ({ ...e, rating: 75 }));
      const r = playDay(s, mulberry32(seed));
      if (!r.ok) throw new Error(r.problems.join());
      for (const g of r.state.results!.games) { total++; if (g.homePts > g.awayPts) homeWins++; }
    }
    expect(homeWins / total).toBeGreaterThan(0.46);
    expect(homeWins / total).toBeLessThan(0.54);
  });
});

describe('rating changes', () => {
  it('records on each game the starters whose rating moved, and they add up to the roster changes over the day', () => {
    const s0 = jcStateFixture();
    const r = playDay(s0, mulberry32(3));
    if (!r.ok) throw new Error(r.problems.join());
    const changes = r.state.results!.games.flatMap(g => g.ratingChanges ?? []);
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      expect(c.to).toBeGreaterThan(c.from);
      expect([...r.state.results!.games.flatMap(g => [g.home, g.away])]).toContain(c.teamId);
    }
    // One game per team on a day, so the final roster rating is exactly the last recorded `to`.
    for (const c of changes) {
      const after = r.state.rosters.teams[c.teamId].find(e => e.playerId === c.playerId)!;
      const before = s0.rosters.teams[c.teamId].find(e => e.playerId === c.playerId)!;
      expect(c.from).toBe(before.rating);
      expect(c.to).toBe(after.rating);
    }
  });
});

describe('playConference', () => {
  function atConferencePlay() {
    let s = jcStateFixture();
    for (let d = 0; d < 7; d++) {
      const r = playDay(s, mulberry32(100 + d));
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
    }
    return s;
  }

  it("plays one conference's games for the open day only, then the day finishes once every conference has played it", () => {
    const s = atConferencePlay();
    const confs = conferencesOf(s);
    expect(confs).toHaveLength(18);
    const day8 = s.schedule!.days.find(d => d.day === 8)!;
    const members = new Set(s.teams.teams.filter(t => t.group === confs[0]).map(t => t.teamId));
    const mine = day8.games.filter(g => members.has(g.home) && members.has(g.away)).map(g => g.gameNo);
    expect(mine).toHaveLength(6);

    const one = playConference(s, confs[0], mulberry32(1));
    if (!one.ok) throw new Error(one.problems.join());
    const played = one.state.results!.games.filter(g => g.gameNo > 756).map(g => g.gameNo).sort((a, b) => a - b);
    expect(played).toEqual([...mine].sort((a, b) => a - b));
    // Day 8 is not finished (the other conferences still have games), so no snapshot and no extra day played.
    expect(one.state.rankings!.snapshots.some(x => x.afterDay === 8)).toBe(false);
    expect(dayPlayedOf(one.state)).toBe(7);
    // Nothing left for that conference today.
    expect(playConference(one.state, confs[0], mulberry32(2)).ok).toBe(false);

    let all = one.state;
    for (const c of confs.slice(1)) {
      const r = playConference(all, c, mulberry32(3));
      if (!r.ok) throw new Error(r.problems.join());
      all = r.state;
    }
    expect(all.rankings!.snapshots.some(x => x.afterDay === 8)).toBe(true);
    expect(dayPlayedOf(all)).toBe(8);
    expect(new Set(all.results!.games.map(g => g.gameNo)).size).toBe(all.results!.games.length);
    // The next open day is day 9: the same conference can be simmed again.
    expect(playConference(all, confs[0], mulberry32(4)).ok).toBe(true);
  }, 120000);

  it('refuses an unknown conference, and before conference play', () => {
    const s = jcStateFixture();
    expect(playConference(s, 'NOPE', mulberry32(1)).ok).toBe(false);
    const early = playConference(s, conferencesOf(s)[0], mulberry32(1));
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.problems[0]).toMatch(/Conference play has not started/);
  });
});
