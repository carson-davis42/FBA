import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { projectBracket } from './bracketology';
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

  it('has four teams on every seed line, four bubble teams each side, and bids that add up to 64', () => {
    const p = projectBracket(played)!;
    expect(p.seedLines).toHaveLength(16);
    expect(p.seedLines.every(l => l.length === 4)).toBe(true);
    expect(p.lastFourIn).toHaveLength(4);
    expect(p.firstFourOut).toHaveLength(4);
    const champs = new Set(Object.values(p.champions).map(c => c.teamId));
    expect(p.lastFourIn.some(t => champs.has(t))).toBe(false);
    expect(p.lastFourIn.every(t => p.mmTeams.includes(t))).toBe(true);
    expect(p.firstFourOut.some(t => p.mmTeams.includes(t))).toBe(false);
    expect(p.bids.reduce((n, b) => n + b.count, 0)).toBe(64);
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
