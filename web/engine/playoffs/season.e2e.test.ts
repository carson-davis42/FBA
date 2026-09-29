import { describe, expect, it } from 'vitest';
import { lockAwards, startAwards } from '../awards/awardMoves';
import { mulberry32, type Rng } from '../d2/random';
import { completePause, recordGames, simNextGames } from '../season/moves';
import { finishRatingPause, startRatingPause } from '../season/ratingPause';
import { blockingPause, gamesUntilStop, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import { nextSeasonDocs } from '../season/nextSeason';
import { finishSeason } from '../season/wrapUp';
import { calendarFor, currentStepIndex, markCurrentDone } from '../shared/calendar';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import { PlayoffsFile, SummaryFile, type RostersFile } from '../shared/types';
import type { CalendarFile, MetaFile } from '../shared/types';
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

const ctx = { batchId: 'e2e' };
const META: MetaFile = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };

/** The real S79 calendar, sitting at the FBA D2 step. */
function atD2Step(): CalendarFile {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === 'fba-d2');
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
}

describe('a whole S79 in the engine: D2, finish, FBA, finish, the tail, then S80', () => {
  it('plays and finishes both seasons with no refused move, then starts S80', () => {
    const rng = mulberry32(42);

    let d2 = playRegular({ ...fullD2State(), calendar: atD2Step() }, rng);
    expect(d2.results!.games).toHaveLength(960);
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
    d2 = ok(finishSeason(d2, [], ctx)).state;
    expect(d2.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
    expect(SummaryFile.safeParse(d2.summary).success).toBe(true);
    expect(d2.summary!.promotion).toEqual(d2pf.outcome!.promotion);

    let fba = playRegular({ ...fullFbaState(), calendar: d2.calendar }, rng);
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
    expect(fba.rosters).toBe(pointsBefore);
    expect(fba.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
    fba = ok(finishSeason(fba, [fba.ratingPause!], ctx)).state;
    expect(SummaryFile.safeParse(fba.summary).success).toBe(true);
    expect(fba.summary!.players!.length).toBeGreaterThanOrEqual(150);
    const paused = fba.ratingPause!.players[0];
    expect(fba.summary!.players!.find(p => p.playerId === paused.playerId && p.stint === 1)!.ratingStart).toBe(paused.oldRating);

    let cal = fba.calendar;
    expect(cal.steps[currentStepIndex(cal)].id).toBe('s80-fba-draft-lottery');
    while (currentStepIndex(cal) >= 0) cal = markCurrentDone(cal);

    const next = nextSeasonDocs({
      calendar: cal, meta: META, d2Teams: d2.teams,
      fba: { rosters: fba.rosters, freeAgents: null, tx: fba.tx, summary: fba.summary },
      fbad2: { rosters: d2.rosters, reserves: null, tx: d2.tx, ratings: null, pool: null, draft: null, summary: d2.summary },
      nextStarted: false,
      fbajc: { recruiting: null },
    }, ctx);
    if (!next.ok) throw new Error(next.problems.join('; '));
    for (const w of next.writes) {
      expect(schemaForPath(w.path)!.safeParse(w.doc).success).toBe(true);
      expect(pathAgreementProblem(w.path, w.doc)).toBeNull();
    }
    const doc = <T>(p: string) => next.writes.find(w => w.path === p)!.doc as T;
    const s80 = doc<CalendarFile>('calendar.json');
    expect(s80.season).toBe(80);
    expect(s80.steps[currentStepIndex(s80)]).toMatchObject({ id: 'adjust-age', label: 'Adjust Age' });
    expect(doc<MetaFile>('meta.json').currentSeason).toBe(80);
    for (const p of ['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json']) {
      expect(doc(p)).toMatchObject({ locked: true });
    }
    for (const s of [d2, fba]) for (const d of [s.schedule, s.results, s.playoffs, s.awards, s.summary]) expect(d!.locked).toBe(true);
    expect(Object.values(doc<RostersFile>('leagues/fba/S80/rosters.json').teams).flat().every(e => e.points === 0)).toBe(true);
    expect(next.moves).toHaveLength(12);
  });
});
