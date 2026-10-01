import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { awardsComplete, jcAwardScore, jcOdds, jcRaces, pickConference, pickNational, startAwards, teamSuccess } from './awards';
import { playAllConf, startConfTournaments } from './confTourney';
import { setFields } from './fieldMoves';
import { playPostRound } from './postseason';
import { jcPlayedFixture, jcReadyForNit } from './testFixtures';
import { conferenceOf, type JcState } from './state';

let withFields: JcState;
let afterConf: JcState;
let ready: JcState;
beforeAll(() => {
  const s = startConfTournaments(jcPlayedFixture());
  if (!s.ok) throw new Error(s.problems.join());
  const c = playAllConf(s.state, mulberry32(5));
  if (!c.ok) throw new Error(c.problems.join());
  afterConf = c.state;
  const f = setFields(afterConf);
  if (!f.ok) throw new Error(f.problems.join());
  withFields = f.state;
  ready = jcReadyForNit();
}, 240000);

const started = (): JcState => {
  const r = startAwards(withFields);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

describe('scoring', () => {
  it('jcAwardScore weighs 40 / 35 / 25 on 0-100 scales', () => {
    // 24 PPG -> 80 ; rating 90 -> 30/39*100 ; team score 100
    expect(jcAwardScore(24, 90, 100)).toBeCloseTo(80 * 0.4 + (30 / 39) * 100 * 0.35 + 100 * 0.25, 6);
    expect(jcAwardScore(NaN, 60, 10)).toBeCloseTo(10 * 0.25, 6);
  });
  it('teamSuccess follows the Java cases', () => {
    expect(teamSuccess(null, 70, 70, null)).toBe(50);
    expect(teamSuccess(1, 0, 0, null)).toBe(100);
    expect(teamSuccess(25, 0, 0, null)).toBe(76);
    expect(teamSuccess(40, 80, 70, null)).toBe(40);
    expect(teamSuccess(40, 50, 70, null)).toBe(10);
    expect(teamSuccess(40, 120, 70, null)).toBe(50);
    expect(teamSuccess(null, 0, 0, { pos: 1, size: 12 })).toBe(101);
    expect(teamSuccess(null, 0, 0, { pos: 12, size: 12 })).toBe(Math.max(10, 101 - Math.trunc((11 / 12) * 100)));
  });
  it('jcOdds gives the top 8 a probability split and +10000 after', () => {
    const scores = [90, 85, 80, 75, 70, 60, 55, 50, 40, 30];
    const odds = jcOdds(scores);
    expect(odds.slice(8)).toEqual(['+10000', '+10000']);
    const prob = (o: string): number => { const n = Number(o.replace('+', '')); return n > 0 ? 100 / (n + 100) : -n / (-n + 100); };
    expect(odds.slice(0, 8).map(prob).reduce((a, b) => a + b, 0)).toBeGreaterThan(0.95);
    expect(odds.slice(0, 8).map(prob).reduce((a, b) => a + b, 0)).toBeLessThan(1.1);
    expect(prob(odds[0])).toBeGreaterThan(prob(odds[1]));
    expect(jcOdds([])).toEqual([]);
  });
});

describe('jcRaces', () => {
  const races = (): ReturnType<typeof jcRaces> => jcRaces(afterConf);
  it('has the six national races and one per conference', () => {
    const rs = races();
    expect(rs.slice(0, 6).map(r => r.id)).toEqual(['POY', 'FOY', 'GOY', 'FWD', 'COY', 'DPOY']);
    expect(rs.filter(r => r.kind === 'conference')).toHaveLength(18);
  });
  it('sorts by score and shows odds only for the listed rows', () => {
    const poy = races()[0];
    expect(poy.limit).toBe(15);
    for (let i = 1; i < poy.rows.length; i++) expect(poy.rows[i - 1].score).toBeGreaterThanOrEqual(poy.rows[i].score);
    expect(poy.rows[0].odds).not.toBe('');
    expect(poy.rows[poy.limit].odds).toBe('');
  });
  it('filters by class, position and conference', () => {
    const rs = races();
    const classOf = (id: string) => Object.values(afterConf.rosters.teams).flat().find(e => e.playerId === id)!.classYear;
    expect(rs[1].rows.length).toBeGreaterThan(0);
    for (const r of rs[1].rows) expect(classOf(r.playerId)).toBe('Fr');
    for (const r of rs[2].rows) expect(['PG', 'SG']).toContain(r.position);
    for (const r of rs[3].rows) expect(['SF', 'PF']).toContain(r.position);
    for (const r of rs[4].rows) expect(r.position).toBe('C');
    for (const race of rs.filter(x => x.kind === 'conference')) {
      for (const r of race.rows) expect(conferenceOf(afterConf.teams, r.teamId)).toBe(race.id);
    }
  });
  it('ranks the Defensive POY by points saved per game with the defense columns', () => {
    const d = races()[5];
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.rows[0].defense).not.toBeNull();
    for (let i = 1; i < d.rows.length; i++) expect(d.rows[i - 1].defense!.saved).toBeGreaterThanOrEqual(d.rows[i].defense!.saved);
  });
  it('counts the conference tournament games', () => {
    const maxGames = Math.max(...races()[0].rows.map(r => r.games));
    expect(maxGames).toBeGreaterThan(29);
  });
});

describe('startAwards and picks', () => {
  it('refuses before the fields are set and starts after', () => {
    expect(startAwards(afterConf).ok).toBe(false);
    const s = started();
    expect(s.awards!.national).toHaveLength(6);
    expect(s.awards!.conference).toHaveLength(18);
    expect(startAwards(s).ok).toBe(false);
    expect(awardsComplete(s.awards)).toBe(false);
    expect(awardsComplete(null)).toBe(false);
  });
  it('validates and saves picks', () => {
    const s = started();
    const rs = jcRaces(s);
    const guard = rs[2].rows[0].playerId;
    const center = rs[4].rows[0].playerId;
    expect(pickNational(s, 'COY', guard).ok).toBe(false);
    expect(pickNational(s, 'COY', 'p99999').ok).toBe(false);
    const ok = pickNational(s, 'COY', center);
    expect(ok.ok && ok.state.awards!.national.find(a => a.award === 'COY')!.playerId).toBe(center);
    if (ok.ok) expect(ok.changed).toEqual(['awards']);
    const nonFr = rs[0].rows.find(r => Object.values(s.rosters.teams).flat().find(e => e.playerId === r.playerId)!.classYear !== 'Fr')!;
    expect(pickNational(s, 'FOY', nonFr.playerId).ok).toBe(false);
    const cleared = ok.ok ? pickNational(ok.state, 'COY', null) : ok;
    expect(cleared.ok && cleared.state.awards!.national.find(a => a.award === 'COY')!.playerId).toBeNull();
    expect(pickNational(afterConf, 'POY', guard).ok).toBe(false);
  });
  it('picks a conference winner from that conference only, and completes when everything is set', () => {
    let s = started();
    const rs = jcRaces(s);
    for (const race of rs.filter(x => x.kind === 'conference')) {
      const other = rs.find(x => x.kind === 'conference' && x.id !== race.id)!.rows[0].playerId;
      expect(pickConference(s, race.id, other).ok).toBe(false);
      const r = pickConference(s, race.id, race.rows[0].playerId);
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
    }
    expect(pickConference(s, 'ZZZ', null).ok).toBe(false);
    expect(awardsComplete(s.awards)).toBe(false);
    const picks: [string, string][] = [['POY', rs[0].rows[0].playerId], ['FOY', rs[1].rows[0].playerId], ['GOY', rs[2].rows[0].playerId], ['FWD', rs[3].rows[0].playerId], ['COY', rs[4].rows[0].playerId], ['DPOY', rs[5].rows[0].playerId]];
    for (const [award, id] of picks) {
      const r = pickNational(s, award as 'POY', id);
      if (!r.ok) throw new Error(r.problems.join());
      s = r.state;
    }
    expect(awardsComplete(s.awards)).toBe(true);
  });
});

describe('after the NIT has started', () => {
  it('the races no longer change and the picks are locked', () => {
    const nit = playPostRound(ready, 'nit', mulberry32(9));
    if (!nit.ok) throw new Error(nit.problems.join());
    const before = jcRaces(ready)[0].rows.map(r => [r.playerId, r.games, r.ppg]);
    const after = jcRaces(nit.state)[0].rows.map(r => [r.playerId, r.games, r.ppg]);
    expect(after).toEqual(before);
    const poy = nit.state.awards!.national[0].playerId!;
    expect(pickNational(nit.state, 'POY', poy).ok).toBe(false);
    expect(pickNational(nit.state, 'POY', null).ok).toBe(false);
    const conf = nit.state.awards!.conference[0];
    expect(pickConference(nit.state, conf.conf, null).ok).toBe(false);
    expect(pickNational(ready, 'POY', poy).ok).toBe(true);
  });
});
