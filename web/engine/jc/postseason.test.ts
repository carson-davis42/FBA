import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { simGame, JC_PROFILE } from '../season/sim';
import { lineupOf } from './play';
import { nextPostGame, playPostRound, playPostToEnd, postseasonStage, recordPostGame } from './postseason';
import { postseasonGames } from './confTourney';
import { jcReadyForNit, jcStateFixture } from './testFixtures';
import { pickNational } from './awards';
import type { JcState } from './state';

let ready: JcState;
beforeAll(() => { ready = jcReadyForNit(); }, 180000);

const must = (r: ReturnType<typeof playPostRound>): JcState => {
  if (!r.ok) throw new Error(r.problems.join());
  return r.state;
};

describe('postseasonStage', () => {
  it('walks the stages from the saved documents', () => {
    expect(postseasonStage(jcStateFixture())).toBe('regular');
    expect(postseasonStage(ready)).toBe('nit');
    const awardsOpen = { ...ready, awards: { ...ready.awards!, national: ready.awards!.national.map((a, i) => (i === 0 ? { ...a, playerId: null } : a)) } };
    expect(postseasonStage(awardsOpen)).toBe('awards');
    expect(postseasonStage({ ...ready, awards: null })).toBe('awards');
    expect(postseasonStage({ ...ready, postseason: { ...ready.postseason!, field: null, nit: null, mm: null } })).toBe('fields');
    expect(postseasonStage({ ...ready, postseason: null })).toBe('conf');
  });
});

describe('NIT and March Madness play', () => {
  it('refuses the NIT without every award and March Madness before the NIT champion', () => {
    const noAwards = { ...ready, awards: { ...ready.awards!, conference: ready.awards!.conference.map((a, i) => (i === 0 ? { ...a, playerId: null } : a)) } };
    expect(playPostRound(noAwards, 'nit', mulberry32(1)).ok).toBe(false);
    expect(playPostRound(ready, 'mm', mulberry32(1)).ok).toBe(false);
  });

  it('plays the NIT round by round: 16, 8, 4, 2, 1 games, with no rating changes but points recorded', () => {
    let s = ready;
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = postseasonGames(s.postseason).length;
      s = must(playPostRound(s, 'nit', mulberry32(30 + i)));
      counts.push(postseasonGames(s.postseason).length - before);
    }
    expect(counts).toEqual([16, 8, 4, 2, 1]);
    expect(s.postseason!.nit!.champion).not.toBeNull();
    expect(postseasonStage(s)).toBe('mm');
    for (const [teamId, entries] of Object.entries(s.rosters.teams)) {
      entries.forEach((e, k) => expect(e.rating).toBe(ready.rosters.teams[teamId][k].rating));
    }
    const played = new Set(postseasonGames(s.postseason).slice(-31).flatMap(g => [g.home, g.away]));
    const team = [...played][0];
    expect(s.rosters.teams[team].reduce((n, e) => n + e.points, 0)).toBeGreaterThan(ready.rosters.teams[team].reduce((n, e) => n + e.points, 0));
    expect(playPostRound(s, 'nit', mulberry32(1)).ok).toBe(false);
  });

  it('plays the NIT, then March Madness, to the end: 31 and 63 games, deterministic for a seed', () => {
    const nit = must(playPostToEnd(ready, 'nit', mulberry32(40)));
    const again = must(playPostToEnd(ready, 'nit', mulberry32(40)));
    expect(nit.postseason).toEqual(again.postseason);
    expect(postseasonGames(nit.postseason).length - postseasonGames(ready.postseason).length).toBe(31);
    const mm = must(playPostToEnd(nit, 'mm', mulberry32(41)));
    expect(postseasonGames(mm.postseason).length - postseasonGames(nit.postseason).length).toBe(63);
    expect(mm.postseason!.mm!.champion).not.toBeNull();
    expect(postseasonStage(mm)).toBe('allAmerican');
    expect(playPostToEnd(mm, 'mm', mulberry32(1)).ok).toBe(false);
  });

  it('records one live game, which must be the next one', () => {
    const next = nextPostGame(ready, 'nit')!;
    const rng = mulberry32(8);
    const home = lineupOf(ready.rosters.teams[next.home!], next.home!);
    const away = lineupOf(ready.rosters.teams[next.away!], next.away!);
    if (typeof home === 'string' || typeof away === 'string') throw new Error('lineup');
    const sim = simGame(ready.postseason!.nextGameNo, home, away, rng, JC_PROFILE);
    const r = must(recordPostGame(ready, 'nit', sim));
    expect(r.postseason!.nextGameNo).toBe(ready.postseason!.nextGameNo + 1);
    expect(postseasonGames(r.postseason).at(-1)!.gameNo).toBe(ready.postseason!.nextGameNo);
    const wrong = simGame(ready.postseason!.nextGameNo, away, home, rng, JC_PROFILE);
    expect(recordPostGame(ready, 'nit', wrong).ok).toBe(false);
    const late = simGame(ready.postseason!.nextGameNo + 5, home, away, rng, JC_PROFILE);
    expect(recordPostGame(ready, 'nit', late).ok).toBe(false);
    expect(recordPostGame(ready, 'mm', sim).ok).toBe(false);
  });

  it('keeps picked awards editable until the season is finished', () => {
    const player = ready.awards!.national[0].playerId!;
    expect(pickNational(ready, 'POY', player).ok).toBe(true);
  });
});
