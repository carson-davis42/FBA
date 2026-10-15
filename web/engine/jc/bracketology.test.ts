import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { preTournamentProjection, projectBracket, teamOutlook, type PlayInGame } from './bracketology';
import { playAllConf, startConfTournaments } from './confTourney';
import { setFields } from './fieldMoves';
import { jcPlayedFixture, jcStateFixture } from './testFixtures';
import { conferenceOf, type JcState } from './state';

let played: JcState;
let afterConf: JcState;
beforeAll(() => {
  played = jcPlayedFixture();
  const s = startConfTournaments(played);
  if (!s.ok) throw new Error(s.problems.join());
  const r = playAllConf(s.state, mulberry32(5));
  if (!r.ok) throw new Error(r.problems.join());
  afterConf = r.state;
}, 240000);

describe('projectBracket', () => {
  it('is null before there is a ranking', () => {
    expect(projectBracket(jcStateFixture())).toBeNull();
  });

  it('matches setFields exactly once every conference champion is known', () => {
    const real = setFields(afterConf);
    if (!real.ok) throw new Error(real.problems.join());
    const p = projectBracket(afterConf)!;
    const f = real.state.postseason!.field!;
    expect(p.mmTeams).toEqual(f.mm.teams);
    expect(p.seeds).toEqual(f.mm.seeds);
    expect(p.regions).toEqual(f.mm.regions);
    expect(p.nit).toEqual(f.nit.teams);
    expect(p.playIn.map(g => ({ id: g.id, teams: g.teams }))).toEqual(f.mm.firstFour.map(g => ({ id: g.id, teams: g.teams })));
    expect(Object.values(p.champions).every(c => !c.projected)).toBe(true);
  });

  it('projects the best-ranked team of each conference before the tournaments', () => {
    const p = projectBracket(played)!;
    const ranking = played.rankings!.snapshots.at(-1)!.order;
    for (const [conf, c] of Object.entries(p.champions)) {
      expect(c.projected).toBe(true);
      expect(c.teamId).toBe(ranking.find(id => conferenceOf(played.teams, id) === conf));
    }
    expect(p.mmTeams).toHaveLength(64);
    expect(p.mmTeams).toEqual(expect.arrayContaining(Object.values(p.champions).map(c => c.teamId)));
  });

  it('has four teams on every seed line, a First Four with two bubbles, and 72 bids', () => {
    const p = projectBracket(played)!;
    expect(p.seedLines).toHaveLength(16);
    expect(p.seedLines.every(l => l.length === 4)).toBe(true);
    expect(p.mmTeams).toHaveLength(64);
    expect(p.playIn).toHaveLength(8);
    for (const g of p.playIn) expect(g.seed).toBe(p.seeds[g.teams[0]]);
    const rank = new Map(played.rankings!.snapshots.at(-1)!.order.map((id, i) => [id, i]));
    for (const group of [p.power, p.other]) {
      expect(group.firstFourIn).toHaveLength(4);
      expect(group.lastEight.top).toHaveLength(2);
      expect(group.lastEight.bottom).toHaveLength(2);
      expect(group.firstFourOut).toHaveLength(4);
      const worst = (gs: PlayInGame[]): number => Math.max(...gs.flatMap(g => g.teams).map(t => rank.get(t)!));
      const best = (gs: PlayInGame[]): number => Math.min(...gs.flatMap(g => g.teams).map(t => rank.get(t)!));
      expect(worst(group.lastEight.top)).toBeLessThan(best(group.lastEight.bottom));
      const inField = new Set([...p.mmTeams, ...p.playIn.flatMap(g => g.teams)]);
      expect(group.firstFourIn.every(t => p.mmTeams.includes(t))).toBe(true);
      expect(group.firstFourOut.some(t => inField.has(t))).toBe(false);
    }
    expect('lastFourIn' in p.power).toBe(false);
    expect(p.bids.reduce((n, b) => n + b.count, 0)).toBe(72);
    expect(p.bids.map(b => b.count)).toEqual([...p.bids.map(b => b.count)].sort((a, b) => b - a));
  });

  it('uses the real champion for a finished conference and the best-ranked team for the rest', () => {
    const ps = afterConf.postseason!;
    const keep = ps.conf[0];
    const partial: JcState = { ...afterConf, postseason: { ...ps, conf: ps.conf.map((b, i) => (i === 0 ? b : { ...b, champion: null })) } };
    const p = projectBracket(partial)!;
    expect(p.champions[keep.id]).toEqual({ teamId: keep.champion, projected: false });
    expect(Object.entries(p.champions).filter(([id]) => id !== keep.id).every(([, c]) => c.projected)).toBe(true);
  });
});

describe('preTournamentProjection', () => {
  it('uses the ranking after the regular season and ignores conference tournament results', () => {
    const pre = preTournamentProjection(afterConf)!;
    const regular = projectBracket(played)!;
    expect(pre.mmTeams).toEqual(regular.mmTeams);
    expect(pre.afterDay).toBe(29);
    expect(Object.values(pre.champions).every(c => c.projected)).toBe(true);
  });

  it('is null before the regular season is over', () => {
    expect(preTournamentProjection(jcStateFixture())).toBeNull();
  });

  it('says where each team stands: a seed, the First Four, the NIT, or out', () => {
    const p = projectBracket(played)!;
    const direct = p.mmTeams.find(t => !p.playIn.some(g => g.teams[0] === t))!;
    expect(teamOutlook(p, direct)).toEqual({ kind: 'seed', seed: p.seeds[direct], firstFour: false });
    const pair = p.playIn[0];
    for (const t of pair.teams) expect(teamOutlook(p, t)).toEqual({ kind: 'seed', seed: pair.seed, firstFour: true });
    expect(teamOutlook(p, p.nit[0])).toEqual({ kind: 'nit' });
    expect(teamOutlook(p, 'nobody')).toEqual({ kind: 'out' });
  });
});
