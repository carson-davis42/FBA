import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { playAllConf, startConfTournaments } from './confTourney';
import { selectNit } from './field';
import { setFields, swapField } from './fieldMoves';
import { buildNit } from './regions';
import { jcPlayedFixture } from './testFixtures';
import type { JcState } from './state';
import { playableGames, recordResult } from './bracket';

let afterConf: JcState;
beforeAll(() => {
  const s = startConfTournaments(jcPlayedFixture());
  if (!s.ok) throw new Error(s.problems.join());
  const r = playAllConf(s.state, mulberry32(5));
  if (!r.ok) throw new Error(r.problems.join());
  afterConf = r.state;
}, 120000);

const fields = (): JcState => {
  const r = setFields(afterConf);
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

describe('selectNit', () => {
  const leftover = Array.from({ length: 152 }, (_, i) => `n${String(i).padStart(3, '0')}`);
  it('puts a low-ranked regular-season champion in and drops the 32nd best', () => {
    const r = selectNit(leftover, ['n070']);
    expect(r.teams).toHaveLength(32);
    expect(r.teams).toContain('n070');
    expect(r.teams).not.toContain('n031');
    expect(r.teams.slice(0, 31)).toEqual(leftover.slice(0, 31));
    expect(r.warnings).toEqual([]);
  });
  it('takes both co-champions', () => {
    const r = selectNit(leftover, ['n070', 'n071']);
    expect(r.teams).toEqual(expect.arrayContaining(['n070', 'n071']));
    expect(r.teams).toHaveLength(32);
  });
  it('is just the best 32 when no champion is outside them', () => {
    expect(selectNit(leftover, ['n000', 'n031']).teams).toEqual(leftover.slice(0, 32));
  });
  it('warns and keeps the best 32 when more than 32 champions qualify', () => {
    const r = selectNit(leftover, leftover.slice(0, 33));
    expect(r.teams).toEqual(leftover.slice(0, 32));
    expect(r.warnings).toHaveLength(1);
  });
});

describe('buildNit', () => {
  const teams = Array.from({ length: 32 }, (_, i) => `s${i}`);
  const b = buildNit(teams);
  it('has 31 games, 16 in round 1 with both teams known', () => {
    expect(b.games).toHaveLength(31);
    expect(b.games.filter(g => g.round === 1 && g.home && g.away)).toHaveLength(16);
    expect(b.games.filter(g => g.round === 2)).toHaveLength(8);
    expect(b.games.filter(g => g.round === 3)).toHaveLength(4);
    expect(b.games.filter(g => g.round === 4)).toHaveLength(2);
  });
  it('pairs seeds 1-16, 9-8, 5-12, 13-4, 2-15, 10-7, 6-11, 14-3 in each region', () => {
    const r1 = b.games.filter(g => g.region === 0 && g.round === 1).map(g => [g.homeSeed, g.awaySeed]);
    expect(r1).toEqual([[1, 16], [9, 8], [5, 12], [13, 4], [2, 15], [10, 7], [6, 11], [14, 3]]);
    expect(b.games[0].home).toBe('s0');
    expect(b.games[8].home).toBe('s1');
  });
  it('plays out with the Java advance mapping to one champion', () => {
    let cur = b;
    let n = 0;
    while (playableGames(cur).length) {
      for (const g of playableGames(cur)) cur = recordResult(cur, g.id, { gameNo: ++n, home: g.home!, away: g.away!, homePts: 70, awayPts: 60 });
    }
    expect(n).toBe(31);
    expect(cur.champion).toBe('s0');
  });
  it('refuses a field that is not 32 teams', () => {
    expect(() => buildNit(teams.slice(1))).toThrow(/32/);
  });
});

describe('setFields', () => {
  it('builds 64 + 32 distinct teams with every conference champion in March Madness and every regular-season champion somewhere', () => {
    const s = fields();
    const f = s.postseason!.field!;
    expect(f.mm.teams).toHaveLength(64);
    expect(f.nit.teams).toHaveLength(32);
    const mmAll = [...f.mm.teams, ...f.mm.firstFour.map(g => g.teams[1])];
    expect(new Set([...mmAll, ...f.nit.teams]).size).toBe(104);
    for (const b of s.postseason!.conf) expect(mmAll).toContain(b.champion);
    for (const t of Object.values(s.postseason!.rsChampions).flat()) expect([...mmAll, ...f.nit.teams]).toContain(t);
    expect(s.postseason!.mm!.games).toHaveLength(63);
    expect(s.postseason!.nit!.games).toHaveLength(31);
  });
  it('refuses before the conference tournaments are done and when the step is not current', () => {
    expect(setFields({ ...afterConf, postseason: { ...afterConf.postseason!, conf: afterConf.postseason!.conf.map(b => ({ ...b, champion: null })) } }).ok).toBe(false);
    const done = { ...afterConf, calendar: { ...afterConf.calendar, steps: afterConf.calendar.steps.map(x => ({ ...x, done: true })) } };
    expect(setFields(done).ok).toBe(false);
  });
  it('can be re-drawn, and is refused once a tournament game is played', () => {
    const s = fields();
    const again = setFields(s);
    expect(again.ok && again.state.postseason!.field).toEqual(s.postseason!.field);
    const g = playableGames(s.postseason!.nit!)[0];
    const nit = recordResult(s.postseason!.nit!, g.id, { gameNo: 3400, home: g.home!, away: g.away!, homePts: 70, awayPts: 60 });
    expect(setFields({ ...s, postseason: { ...s.postseason!, nit } }).ok).toBe(false);
  });
});

describe('First Four in the fields', () => {
  it('holds 8 pairs and 72 distinct teams, all conference champions among them, and the NIT excludes the 16 play-in teams', () => {
    const s = fields();
    const f = s.postseason!.field!;
    const challengers = f.mm.firstFour.map(g => g.teams[1]);
    expect(f.mm.firstFour).toHaveLength(8);
    const all = [...f.mm.teams, ...challengers];
    expect(new Set(all).size).toBe(72);
    for (const g of f.mm.firstFour) {
      expect(f.mm.teams).toContain(g.teams[0]);
      expect(f.mm.seeds[g.teams[1]]).toBe(f.mm.seeds[g.teams[0]]);
      expect(g.seed).toBe(f.mm.seeds[g.teams[0]]);
      expect(f.mm.regions[g.region]).toContain(g.teams[0]);
    }
    for (const b of s.postseason!.conf) expect(all).toContain(b.champion);
    expect(f.nit.teams.some(t => all.includes(t))).toBe(false);
    expect(f.mm.teams).toHaveLength(64);
  });
  it('swaps a challenger for a leftover team and updates the pair', () => {
    const s = fields();
    const f = s.postseason!.field!;
    const champions = new Set(s.postseason!.conf.map(b => b.champion));
    const pair = f.mm.firstFour.find(g => !champions.has(g.teams[1]))!;
    const into = f.nit.teams[0];
    const r = swapField(s, 'mm', pair.teams[1], into);
    if (!r.ok) throw new Error(r.problems.join());
    const g = r.state.postseason!.field!;
    expect(g.mm.firstFour.find(x => x.id === pair.id)!.teams[1]).toBe(into);
    expect(g.nit.teams).toContain(pair.teams[1]);
    expect(g.mm.firstFour).toHaveLength(8);
  });
  it('still swaps in an old-shape postseason with no First Four', () => {
    const s = fields();
    const f = s.postseason!.field!;
    // The old shape: 64 teams, the champions among them (a champion challenger takes its placeholder's slot).
    const champions = new Set(s.postseason!.conf.map(b => b.champion));
    const sub = new Map(f.mm.firstFour.filter(g => champions.has(g.teams[1])).map(g => [g.teams[0], g.teams[1]]));
    const fix = (t: string): string => sub.get(t) ?? t;
    const mm = { ...f.mm, teams: f.mm.teams.map(fix), regions: f.mm.regions.map(r => r.map(fix)), firstFour: [] };
    const kept = new Set(mm.teams);
    const conf = s.postseason!.conf.map(b => (kept.has(b.champion!) ? b : { ...b, champion: f.mm.firstFour.find(g => g.teams.includes(b.champion!))!.teams.find(t => kept.has(t))! }));
    const old = { ...s, postseason: { ...s.postseason!, conf, field: { ...f, mm } } };
    const out = mm.teams.find(t => !conf.some(b => b.champion === t))!;
    const r = swapField(old, 'mm', out, f.nit.teams[0]);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.state.postseason!.field!.mm.firstFour).toEqual([]);
  });
});

describe('swapField', () => {
  it('swaps an at-large for an NIT team and rebuilds the bracket', () => {
    const s = fields();
    const f = s.postseason!.field!;
    const champions = new Set(s.postseason!.conf.map(b => b.champion));
    const out = f.mm.teams.find(t => !champions.has(t))!;
    const into = f.nit.teams[0];
    const r = swapField(s, 'mm', out, into);
    if (!r.ok) throw new Error(r.problems.join());
    const g = r.state.postseason!.field!;
    expect(g.mm.teams).toContain(into);
    expect(g.mm.teams).not.toContain(out);
    expect(g.nit.teams).toContain(out);
    expect(g.nit.teams).not.toContain(into);
    expect(r.state.postseason!.mm!.games.some(x => x.home === into || x.away === into)).toBe(true);
    expect(g.mm.teams).toHaveLength(64);
  });
  it('swaps in a team from outside both fields', () => {
    const s = fields();
    const f = s.postseason!.field!;
    const used = new Set([...f.mm.teams, ...f.nit.teams]);
    const into = s.teams.teams.map(t => t.teamId).find(t => !used.has(t))!;
    const r = swapField(s, 'nit', f.nit.teams[31], into);
    expect(r.ok && r.state.postseason!.field!.nit.teams).toContain(into);
  });
  it('refuses to remove a conference tournament champion from March Madness', () => {
    const s = fields();
    const champ = s.postseason!.conf[0].champion!;
    const into = s.postseason!.field!.nit.teams[0];
    expect(swapField(s, 'mm', champ, into).ok).toBe(false);
  });
  it('refuses to push a regular-season champion out of both fields', () => {
    const s = fields();
    const f = s.postseason!.field!;
    const champions = new Set(s.postseason!.conf.map(b => b.champion));
    const rs = Object.values(s.postseason!.rsChampions).flat().find(t => f.nit.teams.includes(t) && !champions.has(t));
    if (!rs) return;
    const outside = s.teams.teams.map(t => t.teamId).find(t => ![...f.mm.teams, ...f.nit.teams].includes(t))!;
    expect(swapField(s, 'nit', rs, outside).ok).toBe(false);
  });
  it('refuses bad inputs and unknown teams', () => {
    const s = fields();
    const f = s.postseason!.field!;
    expect(swapField(s, 'nit', f.nit.teams[0], f.nit.teams[1]).ok).toBe(false);
    expect(swapField(s, 'nit', f.nit.teams[0], f.nit.teams[0]).ok).toBe(false);
    expect(swapField(s, 'nit', f.mm.teams[0], 'nope').ok).toBe(false);
    expect(swapField(afterConf, 'nit', 'a', 'b').ok).toBe(false);
  });
});
