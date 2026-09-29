import { describe, expect, it } from 'vitest';
import { lockAwards, startAwards } from '../awards/awardMoves';
import { mulberry32, type Rng } from '../d2/random';
import { completePause, recordGames, simNextGames } from '../season/moves';
import { finishRatingPause, startRatingPause } from '../season/ratingPause';
import { blockingPause, gamesUntilStop, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import { PlayoffsFile, type RostersFile } from '../shared/types';
import { lockSeeds } from './moves';
import { fullD2State, fullFbaState, playPlayoffs } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

/** Plays the regular season through the real moves. The pre-playoff rating pause runs for real; earlier pauses are covered by 2b-1's tests and are just marked done. */
function playRegular(state: SeasonState, rng: Rng): SeasonState {
  let s = state;
  for (;;) {
    const p = blockingPause(s);
    if (p) {
      if (p.kind === 'ratings' && p.afterGame === s.schedule!.games.length) {
        s = ok(startRatingPause(s)).state;
        s = ok(finishRatingPause(s, { batchId: 'e2e' })).state;
      } else {
        s = { ...s, schedule: completePause(s.schedule!, p.kind)! };
      }
      continue;
    }
    if (seasonOver(s)) return s;
    const { games, problem } = simNextGames(s, gamesUntilStop(s), rng);
    if (problem) throw new Error(problem);
    s = ok(recordGames(s, games)).state;
  }
}

/** A stand-in for last season's roster: everyone rated 2 lower, so the MIP race has candidates. */
const lastSeasonOf = (s: SeasonState): RostersFile => ({
  ...s.rosters,
  season: s.season - 1,
  teams: Object.fromEntries(Object.entries(s.rosters.teams).map(([t, es]) => [t, es.map(e => ({ ...e, rating: e.rating === null ? null : e.rating - 2 }))])),
});

/** The Awards step: start (race leaders drafted), then lock, through the real moves. */
function decideAwards(s: SeasonState, last: RostersFile | null): SeasonState {
  const started = ok(startAwards(s, last)).state;
  return ok(lockAwards(started, last, { batchId: 'e2e-awards' })).state;
}

describe('a whole S79 in the engine: D2, then FBA', () => {
  it('plays both regular seasons and postseasons with no refused move', () => {
    const rng = mulberry32(42);

    let d2 = playRegular(fullD2State(), rng);
    expect(d2.results!.games).toHaveLength(960);
    expect(d2.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);
    expect(lockSeeds(d2).ok).toBe(false);
    d2 = decideAwards(d2, null);
    expect(d2.awards!.awards.map(a => a.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    d2 = playPlayoffs(ok(lockSeeds(d2)).state, 11);
    const d2pf = d2.playoffs!;
    expect(PlayoffsFile.safeParse(d2pf).success).toBe(true);
    expect(d2pf.series).toHaveLength(28);
    expect(d2pf.games.length).toBeGreaterThanOrEqual(28 * 4);
    expect(d2pf.games.length).toBeLessThanOrEqual(28 * 7);
    expect(d2pf.games.slice(0, 4).map(g => g.seriesId)).toEqual(['PL-R1-1', 'WL-R1-1', 'UL-R1-1', 'IL-R1-1']);
    expect(d2pf.outcome!.champions).toHaveLength(4);
    expect(d2.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);

    let fba = playRegular(fullFbaState(), rng);
    expect(fba.results!.games).toHaveLength(1290);
    expect(fba.schedule!.pauses.at(-1)).toEqual({ afterGame: 1290, kind: 'ratings', done: true });
    fba = decideAwards(fba, lastSeasonOf(fba));
    expect(fba.awards!.locked).toBe(true);
    expect(fba.awards!.awards.map(a => a.award)).toEqual(['MVP', 'PPK', 'LP', 'MC', 'DPOY', 'MIP']);
    const pointsBefore = fba.rosters;
    fba = playPlayoffs(ok(lockSeeds(fba)).state, 12);
    const pf = fba.playoffs!;
    expect(PlayoffsFile.safeParse(pf).success).toBe(true);
    expect(pf.series).toHaveLength(15);
    expect(pf.games.length).toBeGreaterThanOrEqual(60);
    expect(pf.games.length).toBeLessThanOrEqual(105);
    expect(pf.games.slice(0, 2).map(g => g.seriesId)).toEqual(['E-R1-1', 'W-R1-1']);
    expect(pf.outcome!.champions).toHaveLength(1);
    expect(fba.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
    expect(fba.rosters).toBe(pointsBefore);
  });
});
