import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { allAmericanCandidates, mvpCandidates, pickAllAmerican, pickMvp, suggestAllAmerican } from './awards';
import { playPostToEnd } from './postseason';
import { jcReadyForNit } from './testFixtures';
import type { JcState } from './state';

let ready: JcState;
let done: JcState;
beforeAll(() => {
  ready = jcReadyForNit();
  const nit = playPostToEnd(ready, 'nit', mulberry32(2));
  if (!nit.ok) throw new Error(nit.problems.join());
  const mm = playPostToEnd(nit.state, 'mm', mulberry32(3));
  if (!mm.ok) throw new Error(mm.problems.join());
  done = mm.state;
}, 240000);

const must = (r: { ok: boolean; state?: JcState; problems?: string[] }): JcState => {
  if (!r.ok) throw new Error(r.problems!.join());
  return r.state!;
};

describe('All-American teams', () => {
  it('refuses until both tournaments have a champion', () => {
    expect(pickAllAmerican(ready, 1, 0, null).ok).toBe(false);
    expect(suggestAllAmerican(ready).ok).toBe(false);
  });

  it('lists candidates by season PPG with their tournament PPG', () => {
    const c = allAmericanCandidates(done);
    for (let i = 1; i < c.length; i++) expect(c[i - 1].ppg).toBeGreaterThanOrEqual(c[i].ppg);
    expect(c.some(x => x.tournamentPpg > 0)).toBe(true);
    expect(c.some(x => x.tournamentPpg === 0)).toBe(true);
  });

  it('enforces slot positions and one team per player', () => {
    const c = allAmericanCandidates(done);
    const guard = c.find(x => x.position === 'PG' || x.position === 'SG')!;
    const center = c.find(x => x.position === 'C')!;
    expect(pickAllAmerican(done, 1, 0, center.playerId).ok).toBe(false);
    expect(pickAllAmerican(done, 1, 1, guard.playerId).ok).toBe(false);
    expect(pickAllAmerican(done, 1, 2, center.playerId).ok).toBe(true);
    const s = must(pickAllAmerican(done, 1, 0, guard.playerId));
    expect(pickAllAmerican(s, 2, 0, guard.playerId).ok).toBe(false);
    expect(pickAllAmerican(s, 2, 3, guard.playerId).ok).toBe(false);
    const any = must(pickAllAmerican(s, 1, 3, center.playerId));
    expect(any.awards!.allAmerican![0].slots[3].playerId).toBe(center.playerId);
    expect(pickAllAmerican(done, 1, 9, null).ok).toBe(false);
    expect(pickAllAmerican(done, 1, 0, 'p99999').ok).toBe(false);
    const cleared = must(pickAllAmerican(s, 1, 0, null));
    expect(cleared.awards!.allAmerican![0].slots[0].playerId).toBeNull();
  });

  it('suggests three full teams of five distinct players in G, F, C, ANY, ANY order', () => {
    const s = must(suggestAllAmerican(done));
    const teams = s.awards!.allAmerican!;
    expect(teams.map(t => t.team)).toEqual([1, 2, 3]);
    expect(teams.every(t => t.slots.map(x => x.slot).join() === 'G,F,C,ANY,ANY')).toBe(true);
    const ids = teams.flatMap(t => t.slots.map(x => x.playerId));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(15);
    const pos = (id: string) => Object.values(s.rosters.teams).flat().find(e => e.playerId === id)!.position;
    for (const t of teams) {
      expect(['PG', 'SG']).toContain(pos(t.slots[0].playerId!));
      expect(['SF', 'PF']).toContain(pos(t.slots[1].playerId!));
      expect(pos(t.slots[2].playerId!)).toBe('C');
    }
  });
});

describe('MVPs', () => {
  it("lists the champion's roster by that tournament's PPG", () => {
    for (const which of ['mm', 'nit'] as const) {
      const c = mvpCandidates(done, which);
      expect(c).toHaveLength(5);
      for (let i = 1; i < c.length; i++) expect(c[i - 1].ppg).toBeGreaterThanOrEqual(c[i].ppg);
      expect(c[0].games).toBeGreaterThan(0);
    }
    expect(mvpCandidates(ready, 'mm')).toEqual([]);
  });

  it('must come from the champion, and is set per tournament', () => {
    const champ = done.postseason!.mm!.champion!;
    const mine = done.rosters.teams[champ][0].playerId!;
    const other = Object.entries(done.rosters.teams).find(([id]) => id !== champ)![1][0].playerId!;
    expect(pickMvp(done, 'mm', other).ok).toBe(false);
    const s = must(pickMvp(done, 'mm', mine));
    expect(s.awards!.mvp).toEqual({ mm: mine, nit: null });
    expect(pickMvp(ready, 'nit', mine).ok).toBe(false);
    expect(must(pickMvp(s, 'mm', null)).awards!.mvp.mm).toBeNull();
  });
});
