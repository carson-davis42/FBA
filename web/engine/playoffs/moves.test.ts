import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { lineup, recordGames } from '../season/moves';
import { defaultPauses } from '../season/schedule';
import { simGame } from '../season/sim';
import type { SeasonResult, SeasonState } from '../season/state';
import { fbaSeasonState } from '../season/testFixtures';
import { PlayoffsFile } from '../shared/types';
import { FINALS } from './bracket';
import { lockSeeds, nextPlayoffGame, recordPlayoffGame, seedPreview } from './moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const lineupOf = (s: SeasonState, teamId: string) => {
  const l = lineup(s, teamId);
  if (typeof l === 'string') throw new Error(l);
  return l;
};

describe('defaultPauses', () => {
  it('adds an FBA rating pause after the last game', () => {
    expect(defaultPauses('fba', 1290).at(-1)).toEqual({ afterGame: 1290, kind: 'ratings', done: false });
    expect(defaultPauses('fbad2', 960)).toEqual([]);
  });
});

describe('recordGames', () => {
  it('no longer marks the league step done at the end of the regular season', () => {
    const s = fbaSeasonState();
    const allButLast = regularSeasonDone(s);
    const last = { ...allButLast, results: { ...allButLast.results!, games: allButLast.results!.games.slice(0, -1) } };
    const g = s.schedule!.games[s.schedule!.games.length - 1];
    const r = ok(recordGames(last, [simGame(g.gameNo, lineupOf(s, g.home), lineupOf(s, g.away), mulberry32(1))]));
    expect(r.changed).not.toContain('calendar');
    expect(r.state.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
  });
});

describe('seedPreview and lockSeeds', () => {
  it('seeds each group’s top 8 and writes playoffs.json only', () => {
    const s = regularSeasonDone(fullFbaState());
    const seeds = seedPreview(s);
    expect(seeds.map(x => [x.group, x.teams.length])).toEqual([['E', 8], ['W', 8]]);
    const r = ok(lockSeeds(s));
    expect(r.changed).toEqual(['playoffs']);
    expect(r.label).toBe('Lock S79 FBA playoff seeds');
    const pf = r.state.playoffs!;
    expect(PlayoffsFile.safeParse(pf).success).toBe(true);
    expect(pf.seeds.map(x => x.teams)).toEqual(seeds.map(x => x.teams));
    expect(pf.queue[0]).toBe('E-R1-1');
    expect(pf.series.find(x => x.id === 'E-R1-1')).toMatchObject({ home: seeds[0].teams[0], away: seeds[0].teams[7] });
  });

  it('refuses before the season is over, while a pause is open, off-step, or twice', () => {
    const fresh = fullFbaState();
    expect(lockSeeds(fresh)).toMatchObject({ ok: false });
    const pauseOpen = regularSeasonDone(fresh, 3, { lastPauseOpen: true });
    const p = lockSeeds(pauseOpen);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.problems).toContain('Finish the rating adjustment pause (after game 1290) first');
    const d2First = { ...regularSeasonDone(fresh), calendar: { ...fresh.calendar, steps: fresh.calendar.steps.map(x => (x.id === 'fba-d2' ? { ...x, done: false } : x)) } };
    expect(lockSeeds(d2First).ok).toBe(false);
    const locked = ok(lockSeeds(regularSeasonDone(fresh))).state;
    const again = lockSeeds(locked);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.problems).toContain('The playoff seeds are already locked');
  });

  it('refuses a league with fewer than 8 teams in a group', () => {
    const r = lockSeeds(regularSeasonDone(fbaSeasonState()));
    expect(r.ok).toBe(false);
  });

  it('has no tie notes before any games are played', () => {
    const seeds = seedPreview(fullFbaState());
    expect(seeds.map(s => s.notes)).toEqual(seeds.map(() => []));
  });
});

describe('recordPlayoffGame', () => {
  const seeded = () => ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;

  it('plays the front of the queue with the right host and saves playoffs.json only', () => {
    const s = seeded();
    const next = nextPlayoffGame(s.playoffs)!;
    expect(next).toMatchObject({ gameNo: 1, seriesId: 'E-R1-1', gameInSeries: 1 });
    const r = ok(recordPlayoffGame(s, simGame(1, lineupOf(s, next.home), lineupOf(s, next.away), mulberry32(2))));
    expect(r.changed).toEqual(['playoffs']);
    expect(r.label).toMatch(/^Playoff game 1: /);
    expect(r.state.playoffs!.games[0]).toMatchObject({ seriesId: 'E-R1-1', gameInSeries: 1 });
    expect(nextPlayoffGame(r.state.playoffs)!.seriesId).toBe('W-R1-1');
    expect(r.state.rosters).toBe(s.rosters);
  });

  it('refuses a game out of order or with the wrong host', () => {
    const s = seeded();
    const next = nextPlayoffGame(s.playoffs)!;
    const wrongNo = recordPlayoffGame(s, simGame(2, lineupOf(s, next.home), lineupOf(s, next.away), mulberry32(2)));
    expect(wrongNo.ok).toBe(false);
    const swapped = recordPlayoffGame(s, simGame(1, lineupOf(s, next.away), lineupOf(s, next.home), mulberry32(2)));
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) expect(swapped.problems[0]).toMatch(/^This isn't the next playoff game/);
  });

  it('marks the calendar step done only with the last final (FBA)', () => {
    const s = seeded();
    const almost = playPlayoffs(s, 5);
    const pf = almost.playoffs!;
    expect(pf.outcome).not.toBeNull();
    expect(pf.outcome!.champions).toEqual([expect.objectContaining({ group: null, teamId: pf.series.find(x => x.id === FINALS)!.winner })]);
    expect(pf.outcome!.promotion).toBeNull();
    expect(almost.calendar.steps.find(x => x.id === 'fba')!.done).toBe(true);
    expect(nextPlayoffGame(pf)).toBeNull();
    const partway = playPlayoffs(s, 5, pf.games.length - 1);
    expect(partway.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
    expect(partway.playoffs!.outcome).toBeNull();
  });

  it('writes four D2 champions and the promotion lines when the last league final ends', () => {
    const s = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    const out = s.playoffs!.outcome!;
    expect(out.champions.map(c => c.group)).toEqual(['PL', 'WL', 'UL', 'IL']);
    expect(out.promotion!.map(p => [p.league, p.promoted.length, p.relegated.length])).toEqual([['PL', 0, 2], ['WL', 2, 2], ['UL', 2, 2], ['IL', 2, 0]]);
    expect(s.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
    expect(PlayoffsFile.safeParse(s.playoffs).success).toBe(true);
  });
});
