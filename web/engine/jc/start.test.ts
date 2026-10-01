import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mulberry32 } from '../d2/random';
import { jcStateFixture, jcUnstartedFixture } from './testFixtures';
import { namesNeeded, redrawFields, startSeason } from './start';
import type { JcState } from './state';

afterEach(cleanup);

const none = { champion: null, runnerUp: null };
const started = (): JcState => {
  const r = startSeason(jcUnstartedFixture(), mulberry32(3), none);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

describe('startSeason', () => {
  it('refuses with open spots', () => {
    const s = jcUnstartedFixture();
    const id = Object.keys(s.rosters.teams)[0];
    s.rosters.teams[id] = s.rosters.teams[id].map((e, i) => (i === 0 ? { ...e, playerId: null, rating: null, classYear: null } : e));
    const r = startSeason(s, mulberry32(1), none);
    expect(r).toEqual({ ok: false, problems: ['Fill the open roster spots with walk-ons first'] });
  });
  it("refuses when the step isn't current", () => {
    const s = jcUnstartedFixture();
    s.calendar = { ...s.calendar, steps: s.calendar.steps.map(st => ({ ...st, done: true })) };
    expect(startSeason(s, mulberry32(1), none).ok).toBe(false);
  });
  it('refuses a second start', () => {
    expect(startSeason(started(), mulberry32(1), none).ok).toBe(false);
    expect(startSeason(jcStateFixture(), mulberry32(1), none).ok).toBe(false);
  });
  it('builds 29 days with fixed game numbers', () => {
    const s = started();
    const days = s.schedule!.days;
    expect(days).toHaveLength(29);
    for (const d of days) {
      expect(d.games.length).toBe(d.day === 2 || d.day === 3 ? 0 : 108);
      d.games.forEach((g, i) => expect(g.gameNo).toBe((d.day - 1) * 108 + i + 1));
    }
    expect(s.schedule!.tournaments).toHaveLength(27);
    expect(Object.keys(s.schedule!.drawKeys)).toHaveLength(216);
    expect(s.results!.games).toEqual([]);
  });
  it('snapshot 0 ranks all 216 teams', () => {
    const snap = started().rankings!.snapshots;
    expect(snap).toHaveLength(1);
    expect(snap[0].afterDay).toBe(0);
    expect(new Set(snap[0].order).size).toBe(216);
  });
  it('puts last champion and runner-up in the Champions Classic', () => {
    const s = jcUnstartedFixture();
    const ids = s.teams.teams.map(t => t.teamId);
    const r = startSeason(s, mulberry32(5), { champion: ids[40], runnerUp: ids[150] });
    if (!r.ok) throw new Error('fail');
    const cc = r.state.schedule!.tournaments.find(t => t.name === 'Champions Classic')!;
    expect(cc.teams).toContain(ids[40]);
    expect(cc.teams).toContain(ids[150]);
    expect(r.changed).toEqual(['schedule', 'rankings', 'results']);
    expect(r.label).toBe('Start S79 season');
  });
});

describe('redrawFields', () => {
  it('changes the fields with another seed', () => {
    const s = started();
    const r = redrawFields(s, mulberry32(99));
    if (!r.ok) throw new Error('fail');
    expect(JSON.stringify(r.state.schedule!.tournaments)).not.toBe(JSON.stringify(s.schedule!.tournaments));
    expect(r.state.schedule!.drawKeys).toEqual(s.schedule!.drawKeys);
    expect(r.state.schedule!.days[0].games).toHaveLength(108);
    expect(r.label).toBe('Re-draw tournament fields');
  });
  it('refuses after play', () => {
    const s = started();
    const g = s.schedule!.days[0].games[0];
    const played = { ...s, results: { ...s.results!, games: [{ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 70, awayPts: 60 }] } } as JcState;
    expect(redrawFields(played, mulberry32(1)).ok).toBe(false);
  });
});

describe('namesNeeded', () => {
  it('lists unnamed players at or past the thresholds', () => {
    const s = jcUnstartedFixture();
    const [a, b, c, d] = Object.keys(s.rosters.teams);
    const set = (team: string, k: number, classYear: 'Fr' | 'So' | 'Jr' | 'Sr', rating: number) => {
      s.rosters.teams[team] = s.rosters.teams[team].map((e, i) => (i === k ? { ...e, classYear, rating } : e));
      return s.rosters.teams[team][k].playerId!;
    };
    const fr = set(a, 0, 'Fr', 76);
    set(b, 0, 'So', 77);
    const so = set(b, 1, 'So', 78);
    set(c, 0, 'Sr', 99);
    const jr = set(c, 1, 'Jr', 80);
    const named = set(d, 0, 'Fr', 90);
    s.players.players[named] = { ...s.players.players[named], name: 'Named Guy' };
    // keep other players below thresholds
    for (const t of Object.keys(s.rosters.teams)) s.rosters.teams[t] = s.rosters.teams[t].map(e => ([fr, so, jr, named].includes(e.playerId!) || e.classYear === 'Sr' ? e : { ...e, rating: Math.min(e.rating ?? 0, 70) }));
    const ids = namesNeeded(s).map(n => n.playerId).sort();
    expect(ids).toEqual([fr, so, jr].sort());
    expect(namesNeeded(s).find(n => n.playerId === fr)).toMatchObject({ teamId: a, classYear: 'Fr', rating: 76 });
  });
});
