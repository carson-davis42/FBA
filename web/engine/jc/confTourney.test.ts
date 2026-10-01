import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { playableGames } from './bracket';
import { confBracket, confDone, confTables, playAllConf, playConfRound, postseasonGames, startConfTournaments } from './confTourney';
import { jcPlayedFixture, jcStateFixture } from './testFixtures';
import { conferenceOf, type JcState } from './state';

let played: JcState;
beforeAll(() => { played = jcPlayedFixture(); }, 120000);

const started = (): JcState => {
  const r = startConfTournaments(played);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

describe('confBracket', () => {
  const seeded = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
  const b = confBracket('X', seeded);
  it('has 11 games with the Java layout', () => {
    expect(b.games).toHaveLength(11);
    const g = (id: string) => b.games.find(x => x.id === id)!;
    expect([g('G1').home, g('G1').away]).toEqual(['s8', 's9']);
    expect([g('G2').home, g('G2').away]).toEqual(['s5', 's12']);
    expect([g('G3').home, g('G3').away]).toEqual(['s6', 's11']);
    expect([g('G4').home, g('G4').away]).toEqual(['s7', 's10']);
    expect([g('G5').home, g('G5').away]).toEqual(['s1', null]);
    expect([g('G6').home, g('G6').away]).toEqual(['s4', null]);
    expect([g('G7').home, g('G7').away]).toEqual(['s3', null]);
    expect([g('G8').home, g('G8').away]).toEqual(['s2', null]);
    expect(playableGames(b).map(x => x.id)).toEqual(['G1', 'G2', 'G3', 'G4']);
  });
});

describe('startConfTournaments', () => {
  it('builds 18 brackets seeded by the standings, with the regular-season champions', () => {
    const s = started();
    expect(s.postseason!.conf).toHaveLength(18);
    expect(s.postseason!.nextGameNo).toBe(3133);
    const tables = confTables(played);
    for (const t of tables) {
      const b = s.postseason!.conf.find(x => x.id === t.conference)!;
      expect(b.games.find(x => x.id === 'G5')!.home).toBe(t.order[0]);
      expect(s.postseason!.rsChampions[t.conference]).toEqual(t.champions);
      expect(t.champions.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('names every team at the top conference record, and they head the table', () => {
    const wins = new Map<string, number>();
    for (const g of played.results!.games) {
      const w = g.homePts > g.awayPts ? g.home : g.away;
      const l = w === g.home ? g.away : g.home;
      if (conferenceOf(played.teams, g.home) === conferenceOf(played.teams, g.away)) { wins.set(w, (wins.get(w) ?? 0) + 1); void l; }
    }
    for (const t of confTables(played)) {
      const best = Math.max(...t.order.map(id => wins.get(id) ?? 0));
      expect([...t.champions].sort()).toEqual(t.order.filter(id => (wins.get(id) ?? 0) === best).sort());
      expect(t.order.slice(0, t.champions.length).sort()).toEqual([...t.champions].sort());
    }
  });
  it('refuses before day 29, a second start, and when the step is not current', () => {
    expect(startConfTournaments(jcStateFixture()).ok).toBe(false);
    expect(startConfTournaments(started()).ok).toBe(false);
    const done = { ...played, calendar: { ...played.calendar, steps: played.calendar.steps.map(x => ({ ...x, done: true })) } };
    expect(startConfTournaments(done).ok).toBe(false);
  });
});

describe('playConfRound', () => {
  it('plays 72, 72, 36 and 18 games, never touching the regular-season results', () => {
    let s = started();
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = postseasonGames(s.postseason).length;
      const r = playConfRound(s, mulberry32(20 + i));
      if (!r.ok) throw new Error(r.problems.join());
      expect(r.changed).toEqual(['postseason', 'rosters', 'rankings']);
      s = r.state;
      counts.push(postseasonGames(s.postseason).length - before);
    }
    expect(counts).toEqual([72, 72, 36, 18]);
    expect(confDone(s)).toBe(true);
    expect(s.results).toBe(played.results);
    expect(s.rankings!.snapshots.slice(-4).map(x => x.afterDay)).toEqual([30, 31, 32, 33]);
    expect(new Set(s.rankings!.snapshots.at(-1)!.order).size).toBe(216);
    expect(s.postseason!.nextGameNo).toBe(3133 + 198);
    expect(playConfRound(s, mulberry32(1)).ok).toBe(false);
  });
  it('adds postseason points to the rosters and may raise ratings', () => {
    const r = playConfRound(started(), mulberry32(3));
    if (!r.ok) throw new Error(r.problems.join());
    const games = postseasonGames(r.state.postseason);
    const g = games[0];
    const line = g.box!.home[0];
    const before = played.rosters.teams[g.home].find(e => e.playerId === line.playerId)!;
    const after = r.state.rosters.teams[g.home].find(e => e.playerId === line.playerId)!;
    expect(after.points).toBe(before.points + line.pts);
    expect(after.rating!).toBeGreaterThanOrEqual(before.rating!);
    expect(typeof line.def).toBe('number');
  });
  it('refuses before the tournaments start', () => {
    expect(playConfRound(played, mulberry32(1)).ok).toBe(false);
  });
});

describe('conference tables after the tournaments', () => {
  it('keep their order: ties are still broken by the last regular-season ranking', () => {
    const before = confTables(played).map(t => t.order);
    const r = playAllConf(started(), mulberry32(9));
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.rankings!.snapshots.length).toBeGreaterThan(played.rankings!.snapshots.length);
    expect(confTables(r.state).map(t => t.order)).toEqual(before);
  });
});

describe('playAllConf', () => {
  it('ends with 18 champions, deterministic for a seed', () => {
    const a = playAllConf(started(), mulberry32(9));
    const b = playAllConf(started(), mulberry32(9));
    if (!a.ok || !b.ok) throw new Error('failed');
    expect(confDone(a.state)).toBe(true);
    expect(a.state.postseason!.conf.every(x => x.champion !== null)).toBe(true);
    expect(a.state.postseason).toEqual(b.state.postseason);
    expect(postseasonGames(a.state.postseason)).toHaveLength(198);
  });
});
