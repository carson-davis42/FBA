# Regular Season Play (Part 2b-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the S79 D2 and FBA regular seasons in the app: schedules, the ported game sim, scores, the live game, standings, the three FBA pauses (rating adjust, trade deadline, the full All-Star weekend), and roster locks.

**Architecture:**
- **Engine:**
  - Pure TypeScript in `web/engine/season/` (sim, schedule, standings, moves, locks, rating pauses) and `web/engine/allstar/` (dice, selections, drafts, events).
  - Every random choice uses an injected `Rng`.
  - Moves return the Part 2a result shape and are saved with `commitDocs`, carrying the loaded versions.
- **UI:** new pages in `web/app/season/` and `web/app/allstar/`, wired into the league tabs, routes and calendar Continue.
- **Standings** are derived from results and never stored.

**Tech Stack:**
- Vite 5, React 18, React Router 6, TypeScript 5, zod 3.23.8 (strict schemas)
- Vitest 2 with jsdom and Testing Library

**Spec:** `docs/superpowers/specs/2026-09-27-season-play-regular-season-design.md`

## Global Constraints

- **Repo and commands:** repo root `C:/Users/carso/OneDrive/Documents/Fun/Code/creative_vscode/FBA`. Run every command from `web/`: `npx vitest run <paths>` and `npx tsc --noEmit`.
- **Read-only folders:** never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/`, or `FBA Logos/`.
- **Real save data:** never modify `web/data/**`.
- **Dev servers:** don't start or stop dev servers on 5173/5174.
- **Stray files:** leave none. Put temporary files in `.superpowers/sdd/`.
- **jsdom test files:** each one must call `cleanup()` in `afterEach`, because vitest globals are off.
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If your own system instructions give a different Co-Authored-By line, use that one.
- **Game sim** (port of `FBA/src/fba/Main.java` `playGamesTest`):
  - 120 possessions. The home team has the even possessions, starting at 0.
  - Handler draw: `Math.floor(rng() * (Σratings − 300)) + 1` against a cumulative `rating − 60`.
  - Defender weights: 8 / 4 / 0.6 / 0.2 by position distance, ×0.02 at a distance of 3 or more, then × `(1 + 1/(1 + |Δrating|/10))`.
  - Make chance: `clamp(35, 65, handler − floor(0.45 × defender) + 10)`. The roll is `floor(rng()*100)+1`; it's made if `odds ≥ roll`, and scores 3 if `odds − roll ≥ 30`, otherwise 2.
  - OT: after a possession `i` with `i % 10 === 9 && i ≥ 119` and the score tied, the end moves out by 10 possessions. There is no limit.
  - Clutch: `i > 109 && margin ≤ floor((end − i + 1)/2) × 3`.
- **Season sizes:**
  - FBA: 86 games per team (56 in-conference), 1290 games in all. Pauses come after games 322 (ratings), 645 (ratings, then deadline) and 967 (ratings, then All-Star).
  - D2: 30 games per team (a double round-robin inside each 16-team league), 960 games in all, with no pauses.
- **Group codes:** FBA `E` and `W`. D2 `PL`, `WL`, `UL`, `IL`. The playoff line comes after seed 8.
- **Calendar step ids:** `make-s<season>-schedules`, `fba-d2` (D2 season), `fba` (FBA season).
- **Rating pause:** suggestion = rating + perf (−2 to +2). Perf is a z-bucket of PPG regressed on rating, over players with at least 5 games (z ≥ 1.5 → +2, ≥ 0.5 → +1, ≤ −1.5 → −2, ≤ −0.5 → −1). There is no age adjustment and no luck.
- **All-Star rules:**
  - 28 All-Stars (4–11 per position), 2 ASG captains chosen from the 28.
  - 20 Young-Stars (2–7 per position), 4 Young-Star captains (any registry player who isn't one of the 20).
  - Dice are 2d6. Contest rounds are 3 rolls each, added to a running total. The 5pt contest cuts 10 → 5 → 3 → 1; the dunk contest cuts 4 → 3 → 2 → 1.
  - Young-Star games: each player gets 2 rounds of 2 rolls.
  - ASG: 4 quarters, one roll per player per quarter.
  - Ties go to a sudden-death roll-off: one 2d6 per tied participant, repeated.
- **Roster-lock messages** (exact):
  - `Free agency is closed: FBA rosters change only by trade (and Edit) until the season starts`
  - `D2 rosters are locked from the close of free agency until the next offseason`
  - `During the FBA season rosters change only by trade, until the trade deadline`
  - `The trade deadline has passed: rosters are locked until the offseason`

---

## File Structure

**Engine, `web/engine/shared/`**
- `types.ts`: extend `GameResult`; add `ScheduleFile`, `RatingPauseFile`, `AllStarFile` and their parts.
- `schemaRegistry.ts`: register the new paths.
- `perfBuckets.ts` (new): `zBuckets`, shared by the D2 reset and the rating pause.

**Engine, `web/engine/season/`** (all new)
- `sim.ts`: the possession sim, `simGame`, `winProbability`.
- `schedule.ts`: `buildSchedule`, `gameDays`, `defaultPauses`.
- `standings.ts`: records, the Java ordering, clinch markers, lottery.
- `state.ts`: `SeasonState`, doc paths, pause helpers.
- `moves.ts`: `makeSchedules`, `lineup`, `simNextGames`, `recordGames`, `closeTradeDeadline`, `finishAllStar`.
- `ratingPause.ts`: suggestions and the pause editor moves.
- `locks.ts`: `seasonPhase`, `lockProblem`.
- `testFixtures.ts`: a small four-team FBA and D2 season.

**Engine, `web/engine/roster/`**
- `state.ts`: `MoveContext.phase`.
- `moves.ts` and `trade.ts`: the lock checks.

**Engine, `web/engine/allstar/`** (all new)
- `dice.ts`: rolls and roll-offs.
- `players.ts`: FBA player lookups.
- `selection.ts`
- `asgDraft.ts`
- `contestDraw.ts`
- `contests.ts`
- `youngStars.ts`
- `asgGame.ts`
- `steps.ts`

**App, `web/app/`**
- `season/useSeasonState.ts`, `season/testDocs.ts`, `season/useSeasonPhase.ts`
- `components/LeagueTabs.tsx`
- `pages/SchedulesPage.tsx`, `pages/ScoresPage.tsx`, `pages/GamePage.tsx`, `pages/StandingsPage.tsx`, `pages/RatingPausePage.tsx`
- `allstar/AllStarPage.tsx`, `allstar/SelectionStep.tsx`, `allstar/AsgDraftStep.tsx`, `allstar/ContestDrawStep.tsx`, `allstar/DiceReveal.tsx`, `allstar/EventSteps.tsx`
- `pages/season.css`
- Modified:
  - `stepRoutes.ts` and `shell/Layout.tsx`
  - `pages/LeaguePage.tsx`, `pages/TransactionsPage.tsx`, `pages/TeamPage.tsx`, `pages/TradePage.tsx`, `pages/FreeAgencyPage.tsx`
  - `components/SignPanel.tsx` and `components/EditDialog.tsx`
  - `roster/commit.ts`

**Docs:** `README.md`

---

### Task 1: Schemas for schedules, extended results, rating pauses, and the All-Star weekend

**Files:**
- Modify: `web/engine/shared/types.ts`
- Modify: `web/engine/shared/schemaRegistry.ts`
- Test: `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`

**Interfaces:**
- Produces, from `types.ts`:
  - `BoxLine`
  - `GameResult`, extended with optional `ot`, `periods` and `box`
  - `PauseKind`, `SchedulePause`, `ScheduleGame`, `ScheduleFile`
  - `RatingPauseRow`, `RatingPauseFile`
  - `Dice`, `RollOff`, `ContestRound`, `ContestResult`, `DiceRoll`, `TeamGame`, `AllStarSelections`, `ContestTurn`, `AllStarFile`
  - the matching TS types
- Produces these registry paths:
  - `leagues/(fba|fbad2)/S<n>/schedule.json`
  - `leagues/fba/S<n>/ratingPause-<afterGame>.json`
  - `leagues/fba/S<n>/allstar.json`

- [ ] **Step 1: Write the failing tests**

Add to `web/engine/shared/types.test.ts`. Import `AllStarFile, GameResult, RatingPauseFile, ScheduleFile` from `./types`, merging them into the existing import:

```ts
describe('season schemas', () => {
  it('keeps old results valid and accepts the new optional fields', () => {
    const old = { gameNo: 1, home: 'OAK', away: 'MW', homePts: 79, awayPts: 88 };
    expect(GameResult.safeParse(old).success).toBe(true);
    const full = {
      ...old, ot: 1,
      periods: { home: [20, 20, 20, 19, 0], away: [22, 22, 22, 13, 9] },
      box: { home: [{ playerId: 'p00001', pts: 30 }], away: [{ playerId: 'p00002', pts: 40 }] },
    };
    expect(GameResult.safeParse(full).success).toBe(true);
    expect(GameResult.safeParse({ ...old, bogus: 1 }).success).toBe(false);
  });

  it('validates a schedule with pauses', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      games: [{ gameNo: 1, home: 'BOS', away: 'CAR' }],
      pauses: [{ afterGame: 322, kind: 'ratings', done: false }, { afterGame: 645, kind: 'deadline', done: false }],
    };
    expect(ScheduleFile.safeParse(doc).success).toBe(true);
    expect(ScheduleFile.safeParse({ ...doc, league: 'fbajc' }).success).toBe(false);
    expect(ScheduleFile.safeParse({ ...doc, pauses: [{ afterGame: 1, kind: 'lunch', done: false }] }).success).toBe(false);
  });

  it('validates a rating pause', () => {
    const row = { playerId: 'p00001', teamId: 'BOS', position: 'PG', oldRating: 95, games: 20, ppg: 31.5, perf: 1, suggested: 96, rating: 96 };
    expect(RatingPauseFile.safeParse({ league: 'fba', season: 79, afterGame: 322, locked: false, players: [row] }).success).toBe(true);
    expect(RatingPauseFile.safeParse({ league: 'fba', season: 79, afterGame: 322, locked: false, players: [{ ...row, perf: 3 }] }).success).toBe(false);
  });

  it('validates an empty and a partly filled All-Star doc', () => {
    const empty = {
      league: 'fba', season: 79, locked: false, selections: null, asgDraft: null, contestDraw: null,
      fivePoint: null, dunk: null, ysgDraft: null, ysg: null, asg: null,
    };
    expect(AllStarFile.safeParse(empty).success).toBe(true);
    const game = {
      teams: [0, 1], scores: [7, 5], rollOff: null, winner: 0,
      rolls: [[{ team: 0, playerId: 'p00001', dice: [3, 4] }, { team: 1, playerId: 'p00002', dice: [2, 3] }]],
    };
    const partial = {
      ...empty,
      selections: { allStars: ['p00001'], captains: [], youngStars: [], youngCaptains: [] },
      asgDraft: { first: 1, picks: ['p00003'] },
      contestDraw: { order: ['BOS', 'CAR'], turns: [{ teamId: 'BOS', contest: '5pt', playerId: 'p00001' }, { teamId: 'CAR', contest: null, playerId: null }] },
      fivePoint: {
        winner: 'p00001',
        rounds: [{ players: ['p00001'], rolls: { p00001: [[1, 2], [3, 4], [5, 6]] }, totals: { p00001: 21 }, advanced: ['p00001'], rollOffs: [] }],
      },
      asg: { game, mvp: 'p00001', mvpRollOff: { ids: ['p00001', 'p00003'], rounds: [{ p00001: [6, 6], p00003: [1, 1] }] } },
    };
    expect(AllStarFile.safeParse(partial).success).toBe(true);
    expect(AllStarFile.safeParse({ ...partial, asgDraft: { first: 2, picks: [] } }).success).toBe(false);
    expect(AllStarFile.safeParse({ ...partial, asg: { ...partial.asg, game: { ...game, rolls: [[{ team: 0, playerId: 'p00001', dice: [7, 1] }]] } } }).success).toBe(false);
  });
});
```

Add to `web/engine/shared/schemaRegistry.test.ts` (import `AllStarFile, RatingPauseFile, ScheduleFile`):

```ts
  it('knows the season documents', () => {
    expect(schemaForPath('leagues/fba/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fbad2/S79/schedule.json')).toBe(ScheduleFile);
    expect(schemaForPath('leagues/fbajc/S79/schedule.json')).toBeNull();
    expect(schemaForPath('leagues/fba/S79/ratingPause-322.json')).toBe(RatingPauseFile);
    expect(schemaForPath('leagues/fba/S79/ratingPause-x.json')).toBeNull();
    expect(schemaForPath('leagues/fba/S79/allstar.json')).toBe(AllStarFile);
    expect(schemaForPath('leagues/fbad2/S79/allstar.json')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared`
Expected: FAIL (the exports are missing).

- [ ] **Step 3: Replace `GameResult` in `web/engine/shared/types.ts`**

Replace the existing `GameResult` definition and its type line with:

```ts
const pts = int.nonnegative();

export const BoxLine = z.object({ playerId: z.string().min(1), pts }).strict();
export type BoxLine = z.infer<typeof BoxLine>;

export const GameResult = z.object({
  gameNo: int.positive(),
  home: z.string(),
  away: z.string(),
  homePts: pts,
  awayPts: pts,
  /** Overtime periods played (absent on imported seasons). */
  ot: pts.optional(),
  /** Points per period: 4 quarters, then one entry per OT. */
  periods: z.object({ home: z.array(pts), away: z.array(pts) }).strict().optional(),
  /** Points per player, in roster order at tip-off. */
  box: z.object({ home: z.array(BoxLine), away: z.array(BoxLine) }).strict().optional(),
}).strict();
export type GameResult = z.infer<typeof GameResult>;
```

- [ ] **Step 4: Append the new schemas at the end of `web/engine/shared/types.ts`**

(`playerId`, `d2Rating`, `idList` and `int` already exist above.)

```ts
const seasonLeague = z.enum(['fba', 'fbad2']);

export const PauseKind = z.enum(['ratings', 'deadline', 'allstar']);
export type PauseKind = z.infer<typeof PauseKind>;

export const SchedulePause = z.object({ afterGame: int.nonnegative(), kind: PauseKind, done: z.boolean() }).strict();
export type SchedulePause = z.infer<typeof SchedulePause>;

export const ScheduleGame = z.object({ gameNo: int.positive(), home: z.string().min(1), away: z.string().min(1) }).strict();
export type ScheduleGame = z.infer<typeof ScheduleGame>;

export const ScheduleFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  games: z.array(ScheduleGame),
  /** In the order they must be finished; several pauses may share an afterGame. */
  pauses: z.array(SchedulePause),
}).strict();
export type ScheduleFile = z.infer<typeof ScheduleFile>;

export const RatingPauseRow = z.object({
  playerId,
  teamId: z.string().min(1),
  position: Position,
  oldRating: int,
  games: int.nonnegative(),
  ppg: z.number().nonnegative(),
  perf: int.min(-2).max(2).nullable(),
  suggested: d2Rating.nullable(),
  rating: d2Rating,
}).strict();
export type RatingPauseRow = z.infer<typeof RatingPauseRow>;

export const RatingPauseFile = z.object({
  league: z.literal('fba'),
  season: int,
  afterGame: int.positive(),
  locked: z.boolean(),
  players: z.array(RatingPauseRow),
}).strict();
export type RatingPauseFile = z.infer<typeof RatingPauseFile>;

const die = int.min(1).max(6);
export const Dice = z.tuple([die, die]);
export type Dice = z.infer<typeof Dice>;

/** A sudden-death roll-off: each round records the roll of everyone still tied. */
export const RollOff = z.object({ ids: z.array(z.string().min(1)), rounds: z.array(z.record(z.string(), Dice)) }).strict();
export type RollOff = z.infer<typeof RollOff>;

export const ContestRound = z.object({
  players: idList,
  rolls: z.record(z.string(), z.array(Dice)),
  /** Running totals after this round. */
  totals: z.record(z.string(), int),
  advanced: idList,
  rollOffs: z.array(RollOff),
}).strict();
export type ContestRound = z.infer<typeof ContestRound>;

export const ContestResult = z.object({ rounds: z.array(ContestRound), winner: playerId }).strict();
export type ContestResult = z.infer<typeof ContestResult>;

export const DiceRoll = z.object({ team: int.nonnegative(), playerId, dice: Dice }).strict();
export type DiceRoll = z.infer<typeof DiceRoll>;

/** A dice game between two teams (team numbers are the event's team indexes). rolls[period] = every roll in that period. */
export const TeamGame = z.object({
  teams: z.tuple([int.nonnegative(), int.nonnegative()]),
  rolls: z.array(z.array(DiceRoll)),
  scores: z.tuple([int.nonnegative(), int.nonnegative()]),
  rollOff: RollOff.nullable(),
  winner: int.nonnegative(),
}).strict();
export type TeamGame = z.infer<typeof TeamGame>;

export const AllStarSelections = z.object({
  allStars: idList,
  captains: idList,
  youngStars: idList,
  youngCaptains: idList,
}).strict();
export type AllStarSelections = z.infer<typeof AllStarSelections>;

export const ContestTurn = z.object({
  teamId: z.string().min(1),
  contest: z.enum(['5pt', 'dunk']).nullable(),
  playerId: playerId.nullable(),
}).strict();
export type ContestTurn = z.infer<typeof ContestTurn>;

export const AllStarFile = z.object({
  league: z.literal('fba'),
  season: int,
  locked: z.boolean(),
  selections: AllStarSelections.nullable(),
  /** Captain `first` picks first; picks alternate from there. */
  asgDraft: z.object({ first: z.union([z.literal(0), z.literal(1)]), picks: idList }).strict().nullable(),
  contestDraw: z.object({ order: z.array(z.string().min(1)), turns: z.array(ContestTurn) }).strict().nullable(),
  fivePoint: ContestResult.nullable(),
  dunk: ContestResult.nullable(),
  /** Snake draft over `order` (Young-Star team indexes 0–3). */
  ysgDraft: z.object({ order: z.array(int.min(0).max(3)), picks: idList }).strict().nullable(),
  ysg: z.object({ semis: z.array(TeamGame), final: TeamGame, champion: int.min(0).max(3) }).strict().nullable(),
  asg: z.object({ game: TeamGame, mvp: playerId, mvpRollOff: RollOff.nullable() }).strict().nullable(),
}).strict();
export type AllStarFile = z.infer<typeof AllStarFile>;
```

- [ ] **Step 5: Register the paths in `web/engine/shared/schemaRegistry.ts`**

Add `AllStarFile, RatingPauseFile, ScheduleFile` to the import, and append these rules to `RULES`:

```ts
  [new RegExp(`^leagues/(fba|fbad2)/${S}/schedule\\.json$`), ScheduleFile],
  [new RegExp(`^leagues/fba/${S}/ratingPause-[1-9]\\d*\\.json$`), RatingPauseFile],
  [new RegExp(`^leagues/fba/${S}/allstar\\.json$`), AllStarFile],
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run engine/shared data.test.ts && npx tsc --noEmit`
Expected: PASS. `data.test.ts` still validates the S78 results against the extended `GameResult`.

- [ ] **Step 7: Commit**

```bash
git add web/engine/shared
git commit -m "feat: season schemas (schedule, extended results, rating pause, All-Star)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Game sim port

**Files:**
- Create: `web/engine/season/sim.ts`
- Test: `web/engine/season/sim.test.ts`

**Interfaces:**
- Consumes: `Rng` and `mulberry32` from `engine/d2/random`, and `Position`.
- Produces:
  - constants `REGULATION = 120`, `QUARTER = 30`, `OT_LENGTH = 10`
  - types `SimPlayer { playerId; position; rating }`, `SimTeam { teamId; players: SimPlayer[5] }`, `Side = 'home' | 'away'`
  - `Possession { i; period; offense; handler; defender; made; points: 0|2|3; homeScore; awayScore; clutch; end }`
  - `SimGame { gameNo; home; away; possessions; homePts; awayPts; ot; periods: {home: number[]; away: number[]}; box: {home: number[]; away: number[]} }`, where box entries are indexed like `players`
  - functions:
    - `periodOf(i)`
    - `isClutch(i, end, margin)`
    - `pickHandler(team, rng)`
    - `defenderWeights(defense, target, pos)`
    - `pickDefender(defense, offense, pos, rng)`
    - `makeChance(handler, defender)`
    - `shotPoints(odds, roll)`
    - `simGame(gameNo, home, away, rng)`
    - `winProbability(game, revealed, rng, n = 200)`, which gives P(home wins) after `revealed` possessions

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/sim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import {
  defenderWeights, isClutch, makeChance, periodOf, pickDefender, pickHandler, REGULATION, shotPoints, simGame, type SimTeam, winProbability,
} from './sim';

const team = (id: string, ratings: number[]): SimTeam => ({
  teamId: id,
  players: ratings.map((rating, k) => ({ playerId: `${id}${k}`, position: POSITIONS[k], rating })),
});
const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };

describe('pickHandler', () => {
  const t = team('A', [90, 80, 70, 65, 60]); // weights 30, 20, 10, 5, 0 → total 65
  it('draws the Java way: floor(rng*total)+1 against cumulative rating-60', () => {
    expect(pickHandler(t, seq(0))).toBe(0);
    expect(pickHandler(t, seq(30.5 / 65))).toBe(1);
    expect(pickHandler(t, seq(64.5 / 65))).toBe(3);
  });
  it('falls back to a uniform pick when the total is not positive', () => {
    expect(pickHandler(team('B', [60, 60, 60, 60, 60]), seq(0.99))).toBe(4);
  });
});

describe('defender choice', () => {
  it('weights by position distance and rating closeness', () => {
    const w = defenderWeights(team('D', [80, 80, 80, 80, 80]), { playerId: 'x', position: 'PG', rating: 80 }, 0);
    [16, 8, 1.2, 0.008, 0.008].forEach((v, k) => expect(w[k]).toBeCloseTo(v, 10));
  });
  it('walks the cumulative weights', () => {
    const d = team('D', [80, 80, 80, 80, 80]);
    const o = team('O', [80, 80, 80, 80, 80]);
    expect(pickDefender(d, o, 0, seq(0))).toBe(0);
    expect(pickDefender(d, o, 0, seq(0.999999))).toBe(4);
  });
});

describe('shooting', () => {
  it('clamps the make chance to 35..65', () => {
    expect(makeChance(99, 99)).toBe(65);
    expect(makeChance(60, 99)).toBe(35);
    expect(makeChance(80, 80)).toBe(54);
  });
  it('scores 3 on a margin of 30 or more, 2 otherwise, 0 on a miss', () => {
    expect(shotPoints(54, 54)).toBe(2);
    expect(shotPoints(54, 24)).toBe(3);
    expect(shotPoints(54, 25)).toBe(2);
    expect(shotPoints(54, 55)).toBe(0);
  });
});

describe('clock helpers', () => {
  it('numbers periods: 4 quarters of 30, then OTs of 10', () => {
    expect([0, 29, 30, 119, 120, 129, 130].map(periodOf)).toEqual([1, 1, 2, 4, 5, 5, 6]);
  });
  it('detects the clutch window', () => {
    expect(isClutch(109, 120, 0)).toBe(false);
    expect(isClutch(110, 120, 15)).toBe(true);
    expect(isClutch(110, 120, 16)).toBe(false);
    expect(isClutch(119, 120, 3)).toBe(true);
    expect(isClutch(119, 120, 4)).toBe(false);
  });
});

describe('simGame', () => {
  const home = team('H', [92, 85, 80, 78, 75]);
  const away = team('A', [88, 84, 82, 79, 77]);

  it('is deterministic for a seed', () => {
    expect(simGame(1, home, away, mulberry32(7))).toEqual(simGame(1, home, away, mulberry32(7)));
  });

  it('keeps every invariant', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = simGame(seed, home, away, mulberry32(seed));
      expect(g.possessions.length).toBe(REGULATION + 10 * g.ot);
      g.possessions.forEach((p, i) => {
        expect(p.i).toBe(i);
        expect(p.offense).toBe(i % 2 === 0 ? 'home' : 'away');
        expect([0, 2, 3]).toContain(p.points);
        expect(p.made).toBe(p.points > 0);
      });
      expect(g.homePts).not.toBe(g.awayPts);
      expect(g.box.home.reduce((a, b) => a + b, 0)).toBe(g.homePts);
      expect(g.box.away.reduce((a, b) => a + b, 0)).toBe(g.awayPts);
      expect(g.periods.home.reduce((a, b) => a + b, 0)).toBe(g.homePts);
      expect(g.periods.home.length).toBe(4 + g.ot);
      expect(g.possessions.at(-1)!.end).toBe(g.possessions.length);
    }
  });

  it('plays 10-possession overtimes while tied', () => {
    const even = team('E', [80, 80, 80, 80, 80]);
    const even2 = team('F', [80, 80, 80, 80, 80]);
    let found = null;
    for (let seed = 1; seed <= 3000 && !found; seed++) {
      const g = simGame(seed, even, even2, mulberry32(seed));
      if (g.ot > 0) found = g;
    }
    expect(found).not.toBeNull();
    expect(found!.possessions[119].homeScore).toBe(found!.possessions[119].awayScore);
    expect(found!.possessions.length).toBe(120 + 10 * found!.ot);
  });
});

describe('winProbability', () => {
  const home = team('H', [85, 85, 85, 85, 85]);
  const away = team('A', [85, 85, 85, 85, 85]);
  it('is certain once the game is over', () => {
    const g = simGame(1, home, away, mulberry32(3));
    expect(winProbability(g, g.possessions.length, mulberry32(1))).toBe(g.homePts > g.awayPts ? 1 : 0);
  });
  it('is near even at tip-off for equal teams', () => {
    const g = simGame(1, home, away, mulberry32(3));
    const p = winProbability(g, 0, mulberry32(9), 400);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/sim.test.ts`
Expected: FAIL (the module isn't found).

- [ ] **Step 3: Create `web/engine/season/sim.ts`**

```ts
import type { Rng } from '../d2/random';
import type { Position } from '../shared/types';

export const REGULATION = 120;
export const QUARTER = 30;
export const OT_LENGTH = 10;
/** A safety net only: real games never get close. */
const MAX_POSSESSIONS = 2000;

export interface SimPlayer { playerId: string; position: Position; rating: number }
/** Exactly five players, in PG, SG, SF, PF, C order. */
export interface SimTeam { teamId: string; players: SimPlayer[] }
export type Side = 'home' | 'away';

export interface Possession {
  i: number;
  period: number;
  offense: Side;
  /** Index into the offense's players. */
  handler: number;
  /** Index into the defense's players. */
  defender: number;
  made: boolean;
  points: 0 | 2 | 3;
  homeScore: number;
  awayScore: number;
  /** Was this possession in the clutch window (checked before it was played)? */
  clutch: boolean;
  /** The game's final possession count as known after this possession. */
  end: number;
}

export interface SimGame {
  gameNo: number;
  home: SimTeam;
  away: SimTeam;
  possessions: Possession[];
  homePts: number;
  awayPts: number;
  ot: number;
  periods: { home: number[]; away: number[] };
  box: { home: number[]; away: number[] };
}

export function periodOf(i: number): number {
  return i < REGULATION ? Math.floor(i / QUARTER) + 1 : 5 + Math.floor((i - REGULATION) / OT_LENGTH);
}

export function isClutch(i: number, end: number, margin: number): boolean {
  return i > 109 && margin <= Math.floor((end - i + 1) / 2) * 3;
}

/** Java: whoGetsBall = (int)(random * (Σratings − 300)) + 1, then the first cumulative (rating − 60) ≥ whoGetsBall. */
export function pickHandler(team: SimTeam, rng: Rng): number {
  const total = team.players.reduce((s, p) => s + p.rating, 0) - 300;
  if (total <= 0) return Math.floor(rng() * team.players.length);
  const who = Math.floor(rng() * total) + 1;
  let running = 0;
  for (let k = 0; k < team.players.length; k++) {
    running += team.players[k].rating - 60;
    if (running >= who) return k;
  }
  return 0;
}

/** Java Team.pickDefender weights. */
export function defenderWeights(defense: SimTeam, target: SimPlayer, pos: number): number[] {
  return defense.players.map((d, i) => {
    let w = 1;
    const posDiff = Math.abs(i - pos);
    if (posDiff === 0) w *= 8;
    else if (posDiff === 1) w *= 4;
    else if (posDiff === 2) w *= 0.6;
    else w *= 0.2;
    if (posDiff >= 3) w *= 0.02;
    const ratingFactor = 1 / (1 + Math.abs(d.rating - target.rating) / 10);
    return w * (1 + ratingFactor);
  });
}

export function pickDefender(defense: SimTeam, offense: SimTeam, pos: number, rng: Rng): number {
  const weights = defenderWeights(defense, offense.players[pos], pos);
  const total = weights.reduce((s, w) => s + w, 0);
  const rand = rng() * total;
  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i];
    if (rand <= running) return i;
  }
  return weights.length - 1;
}

export function makeChance(handlerRating: number, defenderRating: number): number {
  return Math.max(35, Math.min(65, handlerRating - Math.floor(0.45 * defenderRating) + 10));
}

/** roll is 1–100; made when odds ≥ roll, and a margin of 30 or more scores 3. */
export function shotPoints(odds: number, roll: number): 0 | 2 | 3 {
  if (odds < roll) return 0;
  return odds - roll >= 30 ? 3 : 2;
}

interface Cursor { i: number; end: number; home: number; away: number; ot: number }

function playOne(home: SimTeam, away: SimTeam, c: Cursor, rng: Rng): Possession {
  const offense: Side = c.i % 2 === 0 ? 'home' : 'away';
  const off = offense === 'home' ? home : away;
  const def = offense === 'home' ? away : home;
  const clutch = isClutch(c.i, c.end, Math.abs(c.home - c.away));
  const handler = pickHandler(off, rng);
  const defender = pickDefender(def, off, handler, rng);
  const roll = Math.floor(rng() * 100) + 1;
  const points = shotPoints(makeChance(off.players[handler].rating, def.players[defender].rating), roll);
  if (offense === 'home') c.home += points;
  else c.away += points;
  const i = c.i;
  if (i % 10 === 9 && i >= REGULATION - 1 && c.home === c.away) {
    c.end += OT_LENGTH;
    c.ot++;
  }
  c.i++;
  return { i, period: periodOf(i), offense, handler, defender, made: points > 0, points, homeScore: c.home, awayScore: c.away, clutch, end: c.end };
}

function runOut(home: SimTeam, away: SimTeam, c: Cursor, rng: Rng, onPossession?: (p: Possession) => void): void {
  while (c.i < c.end) {
    if (c.i >= MAX_POSSESSIONS) throw new Error('Game did not finish');
    const p = playOne(home, away, c, rng);
    onPossession?.(p);
  }
}

export function simGame(gameNo: number, home: SimTeam, away: SimTeam, rng: Rng): SimGame {
  if (home.players.length !== 5 || away.players.length !== 5) throw new Error('Each team needs exactly 5 players');
  const c: Cursor = { i: 0, end: REGULATION, home: 0, away: 0, ot: 0 };
  const possessions: Possession[] = [];
  const box = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  const periods = { home: [] as number[], away: [] as number[] };
  runOut(home, away, c, rng, p => {
    possessions.push(p);
    box[p.offense][p.handler] += p.points;
    while (periods.home.length < p.period) {
      periods.home.push(0);
      periods.away.push(0);
    }
    periods[p.offense][p.period - 1] += p.points;
  });
  return { gameNo, home, away, possessions, homePts: c.home, awayPts: c.away, ot: c.ot, periods, box };
}

/** Chance the home team wins, simulating the rest of the game n times from the state after `revealed` possessions. */
export function winProbability(game: SimGame, revealed: number, rng: Rng, n = 200): number {
  if (revealed >= game.possessions.length) return game.homePts > game.awayPts ? 1 : 0;
  const last = revealed > 0 ? game.possessions[revealed - 1] : null;
  let wins = 0;
  for (let k = 0; k < n; k++) {
    const c: Cursor = {
      i: revealed,
      end: last ? last.end : REGULATION,
      home: last ? last.homeScore : 0,
      away: last ? last.awayScore : 0,
      ot: 0,
    };
    runOut(game.home, game.away, c, rng);
    if (c.home > c.away) wins++;
  }
  return wins / n;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run engine/season/sim.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/engine/season
git commit -m "feat: port the FBA game sim (possessions, defender pick, OT, clutch, win probability)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Schedule builder, game days, and pause points

**Files:**
- Create: `web/engine/season/schedule.ts`
- Test: `web/engine/season/schedule.test.ts`

**Interfaces:**
- Consumes: `Rng` and `mulberry32`; `ScheduleGame` and `SchedulePause` from types.
- Produces:
  - `type SeasonLeague = 'fba' | 'fbad2'`
  - `interface ScheduleTeamInfo { teamId: string; group: string | null }`
  - `PAIRINGS`
  - `buildSchedule(league, teams, rng): ScheduleGame[]`, a port of `makeSchedule` and `ScheduleTeam`
  - `gameDays(games): number[][]` (game numbers per day)
  - `defaultPauses(league, totalGames): SchedulePause[]`

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import type { ScheduleGame } from '../shared/types';
import { buildSchedule, defaultPauses, gameDays } from './schedule';

const fbaTeams = Array.from({ length: 30 }, (_, k) => ({ teamId: `T${k}`, group: k < 15 ? 'E' : 'W' }));
const d2Groups = ['PL', 'WL', 'UL', 'IL'];
const d2Teams = Array.from({ length: 64 }, (_, k) => ({ teamId: `D${k}`, group: d2Groups[Math.floor(k / 16)] }));

function tally(games: ScheduleGame[]) {
  const per = new Map<string, { games: number; home: number }>();
  const pairs = new Map<string, { total: number; homeOf: Map<string, number> }>();
  for (const g of games) {
    for (const [id, isHome] of [[g.home, true], [g.away, false]] as const) {
      const t = per.get(id) ?? { games: 0, home: 0 };
      t.games++;
      if (isHome) t.home++;
      per.set(id, t);
    }
    const key = [g.home, g.away].sort().join('|');
    const p = pairs.get(key) ?? { total: 0, homeOf: new Map<string, number>() };
    p.total++;
    p.homeOf.set(g.home, (p.homeOf.get(g.home) ?? 0) + 1);
    pairs.set(key, p);
  }
  return { per, pairs };
}

describe('buildSchedule', () => {
  it('FBA: 1290 games, 86 per team (43 home), 4 per conference pair, 2 per cross pair', () => {
    const games = buildSchedule('fba', fbaTeams, mulberry32(1));
    expect(games).toHaveLength(1290);
    expect(games.map(g => g.gameNo)).toEqual(Array.from({ length: 1290 }, (_, k) => k + 1));
    const { per, pairs } = tally(games);
    for (const t of fbaTeams) expect(per.get(t.teamId)).toEqual({ games: 86, home: 43 });
    for (const [key, p] of pairs) {
      const [a, b] = key.split('|');
      const same = fbaTeams.find(t => t.teamId === a)!.group === fbaTeams.find(t => t.teamId === b)!.group;
      expect(p.total).toBe(same ? 4 : 2);
      expect(p.homeOf.get(a)).toBe(same ? 2 : 1);
      expect(p.homeOf.get(b)).toBe(same ? 2 : 1);
    }
    expect(pairs.size).toBe((30 * 29) / 2);
  });

  it('D2: 960 games, a double round-robin inside each league', () => {
    const games = buildSchedule('fbad2', d2Teams, mulberry32(2));
    expect(games).toHaveLength(960);
    const { per, pairs } = tally(games);
    for (const t of d2Teams) expect(per.get(t.teamId)).toEqual({ games: 30, home: 15 });
    expect(pairs.size).toBe(4 * ((16 * 15) / 2));
    for (const [key, p] of pairs) {
      const [a, b] = key.split('|');
      expect(d2Teams.find(t => t.teamId === a)!.group).toBe(d2Teams.find(t => t.teamId === b)!.group);
      expect(p.total).toBe(2);
      expect(p.homeOf.get(a)).toBe(1);
    }
  });

  it('is deterministic for a seed', () => {
    expect(buildSchedule('fba', fbaTeams, mulberry32(5))).toEqual(buildSchedule('fba', fbaTeams, mulberry32(5)));
  });
});

describe('gameDays', () => {
  it('packs games in order into days where no team plays twice', () => {
    const games = [
      { gameNo: 1, home: 'A', away: 'B' }, { gameNo: 2, home: 'C', away: 'D' },
      { gameNo: 3, home: 'A', away: 'C' }, { gameNo: 4, home: 'B', away: 'D' }, { gameNo: 5, home: 'E', away: 'F' },
    ];
    expect(gameDays(games)).toEqual([[1, 2], [3, 4, 5]]);
    expect(gameDays([])).toEqual([]);
  });

  it('never repeats a team within a day on a real schedule', () => {
    const games = buildSchedule('fba', fbaTeams, mulberry32(3));
    const days = gameDays(games);
    expect(days.flat()).toEqual(games.map(g => g.gameNo));
    for (const day of days) {
      const ids = day.flatMap(n => [games[n - 1].home, games[n - 1].away]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('defaultPauses', () => {
  it('uses the Java quarter points for the FBA and none for D2', () => {
    expect(defaultPauses('fba', 1290)).toEqual([
      { afterGame: 322, kind: 'ratings', done: false },
      { afterGame: 645, kind: 'ratings', done: false },
      { afterGame: 645, kind: 'deadline', done: false },
      { afterGame: 967, kind: 'ratings', done: false },
      { afterGame: 967, kind: 'allstar', done: false },
    ]);
    expect(defaultPauses('fbad2', 960)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/schedule.test.ts`
Expected: FAIL (the module isn't found).

- [ ] **Step 3: Create `web/engine/season/schedule.ts`**

```ts
import type { Rng } from '../d2/random';
import type { ScheduleGame, SchedulePause } from '../shared/types';

export type SeasonLeague = 'fba' | 'fbad2';

export interface ScheduleTeamInfo { teamId: string; group: string | null }

/** Home games against each opponent (the same number away). FBA: 2+2 in-conference, 1+1 cross; D2: 1+1 in-league only. */
export const PAIRINGS: Record<SeasonLeague, { sameGroup: number; otherGroup: number }> = {
  fba: { sameGroup: 2, otherGroup: 1 },
  fbad2: { sameGroup: 1, otherGroup: 0 },
};

interface Slot {
  teamId: string;
  left: number;
  homeLeft: number;
  awayLeft: number;
  home: Map<string, number>;
  away: Map<string, number>;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

function take(map: Map<string, number>, key: string): void {
  const n = (map.get(key) ?? 0) - 1;
  if (n > 0) map.set(key, n);
  else map.delete(key);
}

function pickKey(map: Map<string, number>, rng: Rng): string {
  const keys = [...map.keys()];
  return keys[Math.floor(rng() * keys.length)];
}

/**
 * Port of Java makeSchedule/ScheduleTeam: repeatedly take a team with the most games left (random among ties),
 * flip for home/away (forced when one side is used up), and pick a random remaining opponent for that side.
 */
export function buildSchedule(league: SeasonLeague, teams: ScheduleTeamInfo[], rng: Rng): ScheduleGame[] {
  const { sameGroup, otherGroup } = PAIRINGS[league];
  const slots = new Map<string, Slot>();
  for (const t of teams) {
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const o of teams) {
      if (o.teamId === t.teamId) continue;
      const n = o.group === t.group ? sameGroup : otherGroup;
      if (n > 0) {
        home.set(o.teamId, n);
        away.set(o.teamId, n);
      }
    }
    slots.set(t.teamId, { teamId: t.teamId, left: total(home) + total(away), homeLeft: total(home), awayLeft: total(away), home, away });
  }

  const games: ScheduleGame[] = [];
  for (;;) {
    let max = 0;
    for (const s of slots.values()) max = Math.max(max, s.left);
    if (max === 0) break;
    const tied = [...slots.values()].filter(s => s.left === max);
    const temp = tied[Math.floor(rng() * tied.length)];
    const coin = Math.floor(rng() * 2);
    const tempHome = temp.homeLeft === 0 ? false : temp.awayLeft === 0 ? true : coin === 0;
    const oppId = pickKey(tempHome ? temp.home : temp.away, rng);
    const opp = slots.get(oppId)!;
    if (tempHome) {
      take(temp.home, oppId);
      take(opp.away, temp.teamId);
      temp.homeLeft--;
      opp.awayLeft--;
      games.push({ gameNo: games.length + 1, home: temp.teamId, away: oppId });
    } else {
      take(temp.away, oppId);
      take(opp.home, temp.teamId);
      temp.awayLeft--;
      opp.homeLeft--;
      games.push({ gameNo: games.length + 1, home: oppId, away: temp.teamId });
    }
    temp.left--;
    opp.left--;
  }
  return games;
}

/** Packs games, in schedule order, into days where no team plays twice. */
export function gameDays(games: Pick<ScheduleGame, 'gameNo' | 'home' | 'away'>[]): number[][] {
  const days: number[][] = [];
  let current: number[] = [];
  const busy = new Set<string>();
  for (const g of games) {
    if (busy.has(g.home) || busy.has(g.away)) {
      days.push(current);
      current = [];
      busy.clear();
    }
    current.push(g.gameNo);
    busy.add(g.home);
    busy.add(g.away);
  }
  if (current.length) days.push(current);
  return days;
}

/** FBA pauses at the Java's integer quarter points; D2 has none. */
export function defaultPauses(league: SeasonLeague, totalGames: number): SchedulePause[] {
  if (league !== 'fba') return [];
  const q1 = Math.floor(totalGames / 4);
  const half = Math.floor(totalGames / 2);
  const q3 = Math.floor((totalGames * 3) / 4);
  return [
    { afterGame: q1, kind: 'ratings', done: false },
    { afterGame: half, kind: 'ratings', done: false },
    { afterGame: half, kind: 'deadline', done: false },
    { afterGame: q3, kind: 'ratings', done: false },
    { afterGame: q3, kind: 'allstar', done: false },
  ];
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run engine/season/schedule.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/engine/season
git commit -m "feat: port the schedule builder, plus game days and pause points

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Standings (Java ordering, clinch markers, lottery)

**Files:**
- Create: `web/engine/season/standings.ts`
- Test: `web/engine/season/standings.test.ts`

**Interfaces:**
- Consumes: `GameResult`; `SeasonLeague` and `ScheduleTeamInfo` from `./schedule`.
- Produces:
  - `GROUP_ORDER`, `PLAYOFF_SEEDS = 8`, `SEASON_LENGTH`
  - `TeamRecord`, `StandingRow`, `Standings`
  - `records(teams, games): Map<string, TeamRecord>`
  - `betterThan(league, a, b): boolean`
  - `javaOrder(list, better, reverse?)`
  - `markerFor(conf: ClinchRecord[], index, len)`
  - `standings(league, teams, games, len?): Standings`

**Note on ties:** past head-to-head, the Java falls back to power rankings, which arrive in 2b-2. Until then, a display tie falls to point differential, then team id. The D2 Java has no in-season order past games played; this port uses head-to-head, then point differential, then team id. The official seeding tiebreakers are 2b-2's job.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/standings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { betterThan, markerFor, standings, type TeamRecord } from './standings';

const rec = (teamId: string, group: string, w: number, l: number, extra: Partial<TeamRecord> = {}): TeamRecord => ({
  teamId, group, w, l, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [], ...extra,
});

describe('betterThan (FBA, Java isBetterThan)', () => {
  it('uses games behind, then fewer games played', () => {
    expect(betterThan('fba', rec('A', 'E', 5, 1), rec('B', 'E', 4, 2))).toBe(true);
    const a = rec('A', 'E', 3, 1);
    const b = rec('B', 'E', 2, 0);
    expect(betterThan('fba', a, b)).toBe(false);
    expect(betterThan('fba', b, a)).toBe(true);
  });
  it('then conference wins for same-conference teams, then head-to-head', () => {
    expect(betterThan('fba', rec('A', 'E', 3, 1, { confW: 3 }), rec('B', 'E', 3, 1, { confW: 2 }))).toBe(true);
    const a = rec('A', 'E', 3, 1, { confW: 2, h2h: new Map([['B', 2]]) });
    const b = rec('B', 'E', 3, 1, { confW: 2, h2h: new Map([['A', 1]]) });
    expect(betterThan('fba', a, b)).toBe(true);
    expect(betterThan('fba', b, a)).toBe(false);
  });
  it('falls back to point differential, then team id', () => {
    expect(betterThan('fba', rec('A', 'E', 3, 1, { pf: 300, pa: 290 }), rec('B', 'W', 3, 1, { pf: 300, pa: 280 }))).toBe(false);
    expect(betterThan('fba', rec('A', 'E', 3, 1), rec('B', 'W', 3, 1))).toBe(true);
  });
});

describe('markerFor (Java clinchStar / clinchX / clinchN)', () => {
  const rows = [[10, 0], [9, 1], [8, 2], [8, 2], [7, 3], [6, 4], [6, 4], [5, 5], [2, 4], [0, 10]]
    .map(([w, l]) => ({ w, l, confW: w, confL: l }));
  it('marks the #1 seed, clinched playoff teams, and eliminated teams', () => {
    expect(rows.map((_, i) => markerFor(rows, i, { games: 10, confGames: 10 }))).toEqual(
      ['*', 'x', 'x', 'x', 'x', 'x', 'x', null, null, 'n'],
    );
  });
  it('marks nothing before anyone has played', () => {
    const fresh = Array.from({ length: 10 }, () => ({ w: 0, l: 0, confW: 0, confL: 0 }));
    expect(fresh.map((_, i) => markerFor(fresh, i, { games: 10, confGames: 10 }))).toEqual(Array(10).fill(null));
  });
});

describe('standings', () => {
  const teams = [{ teamId: 'A', group: 'E' }, { teamId: 'B', group: 'E' }, { teamId: 'C', group: 'E' }, { teamId: 'D', group: 'W' }];
  const g = (gameNo: number, home: string, homePts: number, away: string, awayPts: number): GameResult => ({ gameNo, home, away, homePts, awayPts });
  const games = [
    g(1, 'A', 80, 'B', 70), g(2, 'B', 90, 'A', 60), g(3, 'A', 70, 'C', 60),
    g(4, 'B', 70, 'C', 60), g(5, 'A', 70, 'D', 60), g(6, 'B', 75, 'D', 60),
  ];

  it('orders each group, with GB, conference record, last 10, streak and differential', () => {
    const s = standings('fba', teams, games);
    expect(s.groups.map(x => x.group)).toEqual(['E', 'W']);
    const east = s.groups[0].rows;
    expect(east.map(r => r.teamId)).toEqual(['B', 'A', 'C']);
    expect(east.map(r => r.gb)).toEqual([0, 0, 2]);
    expect(east[0]).toMatchObject({ seed: 1, w: 3, l: 1, confW: 2, confL: 1, diff: 45, l10: '3-1', streak: 'W3' });
    expect(east[1]).toMatchObject({ w: 3, l: 1, streak: 'W2', diff: 0 });
    expect(s.groups[1].rows[0]).toMatchObject({ teamId: 'D', w: 0, l: 2, streak: 'L2', pct: 0 });
    expect(s.lottery).toEqual([]);
  });

  it('puts D2 leagues in PL, WL, UL, IL order without markers', () => {
    const d2 = [{ teamId: 'X', group: 'WL' }, { teamId: 'Y', group: 'PL' }];
    const s = standings('fbad2', d2, [g(1, 'X', 50, 'Y', 40)]);
    expect(s.groups.map(x => x.group)).toEqual(['PL', 'WL']);
    expect(s.groups.every(x => x.rows.every(r => r.marker === null))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/standings.test.ts`
Expected: FAIL (the module isn't found).

- [ ] **Step 3: Create `web/engine/season/standings.ts`**

```ts
import type { GameResult } from '../shared/types';
import type { ScheduleTeamInfo, SeasonLeague } from './schedule';

export const GROUP_ORDER: Record<SeasonLeague, string[]> = { fba: ['E', 'W'], fbad2: ['PL', 'WL', 'UL', 'IL'] };
export const PLAYOFF_SEEDS = 8;
export const SEASON_LENGTH: Record<SeasonLeague, { games: number; confGames: number }> = {
  fba: { games: 86, confGames: 56 },
  fbad2: { games: 30, confGames: 30 },
};

export interface TeamRecord {
  teamId: string;
  group: string;
  w: number;
  l: number;
  confW: number;
  confL: number;
  pf: number;
  pa: number;
  /** Wins against each opponent faced (0 when they've played but this team hasn't won). */
  h2h: Map<string, number>;
  log: ('W' | 'L')[];
}

export interface StandingRow {
  teamId: string;
  group: string;
  seed: number;
  w: number;
  l: number;
  pct: number;
  gb: number;
  confW: number;
  confL: number;
  diff: number;
  l10: string;
  streak: string;
  marker: '*' | 'x' | 'n' | null;
}

export interface Standings {
  groups: { group: string; rows: StandingRow[] }[];
  /** FBA only: non-playoff teams, worst first. */
  lottery: StandingRow[];
}

export interface ClinchRecord { w: number; l: number; confW: number; confL: number }

export function records(teams: ScheduleTeamInfo[], games: GameResult[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>();
  for (const t of teams) {
    out.set(t.teamId, { teamId: t.teamId, group: t.group ?? '', w: 0, l: 0, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [] });
  }
  for (const g of games) {
    const home = out.get(g.home);
    const away = out.get(g.away);
    if (!home || !away) continue;
    const [winner, loser] = g.homePts > g.awayPts ? [home, away] : [away, home];
    const same = home.group === away.group;
    winner.w++;
    loser.l++;
    if (same) {
      winner.confW++;
      loser.confL++;
    }
    home.pf += g.homePts;
    home.pa += g.awayPts;
    away.pf += g.awayPts;
    away.pa += g.homePts;
    winner.h2h.set(loser.teamId, (winner.h2h.get(loser.teamId) ?? 0) + 1);
    if (!loser.h2h.has(winner.teamId)) loser.h2h.set(winner.teamId, 0);
    winner.log.push('W');
    loser.log.push('L');
  }
  return out;
}

const diffOf = (r: TeamRecord) => r.pf - r.pa;

/** Java Team.isBetterThan, with post-head-to-head fallbacks (point differential, then team id) until power rankings exist. */
export function betterThan(league: SeasonLeague, a: TeamRecord, b: TeamRecord): boolean {
  const gb = ((a.w - b.w) + (b.l - a.l)) / 2;
  if (gb > 0) return true;
  if (gb < 0) return false;
  if (a.w + a.l < b.w + b.l) return true;
  if (a.w + a.l > b.w + b.l) return false;
  if (league === 'fba' && a.group === b.group) {
    if (a.confW > b.confW) return true;
    if (a.confW < b.confW) return false;
  }
  if (a.h2h.has(b.teamId) || b.h2h.has(a.teamId)) {
    const x = a.h2h.get(b.teamId) ?? 0;
    const y = b.h2h.get(a.teamId) ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  if (diffOf(a) !== diffOf(b)) return diffOf(a) > diffOf(b);
  return a.teamId < b.teamId;
}

/** Java updateStandHelp: repeatedly select the best (or, reversed, the worst) remaining team. */
export function javaOrder<T>(list: T[], better: (a: T, b: T) => boolean, reverse = false): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (pool.length) {
    let best = pool[0];
    for (const t of pool) {
      if (reverse ? better(best, t) : !better(best, t)) best = t;
    }
    out.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return out;
}

const played = (r: ClinchRecord) => r.w + r.l;
const confPlayed = (r: ClinchRecord) => r.confW + r.confL;

function clinchStar(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i >= 1) return false;
  const t = conf[i];
  for (let j = 0; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j < i) return false;
      }
    }
  }
  return true;
}

function clinchX(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i >= PLAYOFF_SEEDS) return false;
  const t = conf[i];
  for (let j = PLAYOFF_SEEDS; j < conf.length; j++) {
    if (j === i) continue;
    const temp = conf[j];
    const maxW = temp.w + (len.games - played(temp));
    if (t.w <= maxW) {
      if (t.w < maxW) return false;
      const maxCW = temp.confW + (len.confGames - confPlayed(temp));
      if (t.confW <= maxCW) {
        if (t.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j < i) return false;
      }
    }
  }
  return true;
}

function clinchN(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }): boolean {
  if (i <= PLAYOFF_SEEDS - 1) return false;
  const t = conf[i];
  const maxW = t.w + (len.games - played(t));
  const maxCW = t.confW + (len.confGames - confPlayed(t));
  for (let j = 0; j < Math.min(PLAYOFF_SEEDS, conf.length); j++) {
    if (j === i) continue;
    const temp = conf[j];
    if (temp.w <= maxW) {
      if (temp.w < maxW) return false;
      if (temp.confW <= maxCW) {
        if (temp.confW < maxCW) return false;
        if (played(t) === len.games && played(temp) === len.games && j > i) return false;
      }
    }
  }
  return true;
}

/** The Java marker for the team at `index` of a sorted conference: '*' #1 seed, 'x' playoff spot, 'n' eliminated. */
export function markerFor(conf: ClinchRecord[], index: number, len: { games: number; confGames: number }): '*' | 'x' | 'n' | null {
  if (clinchStar(conf, index, len)) return '*';
  if (clinchX(conf, index, len)) return 'x';
  if (clinchN(conf, index, len)) return 'n';
  return null;
}

function streakOf(log: ('W' | 'L')[]): string {
  if (!log.length) return '—';
  const last = log[log.length - 1];
  let n = 0;
  for (let k = log.length - 1; k >= 0 && log[k] === last; k--) n++;
  return `${last}${n}`;
}

function lastTen(log: ('W' | 'L')[]): string {
  const ten = log.slice(-10);
  return `${ten.filter(x => x === 'W').length}-${ten.filter(x => x === 'L').length}`;
}

function toRows(league: SeasonLeague, ordered: TeamRecord[], len: { games: number; confGames: number }): StandingRow[] {
  const top = ordered[0];
  return ordered.map((r, i) => ({
    teamId: r.teamId,
    group: r.group,
    seed: i + 1,
    w: r.w,
    l: r.l,
    pct: r.w + r.l ? r.w / (r.w + r.l) : 0,
    gb: top ? ((top.w - r.w) + (r.l - top.l)) / 2 : 0,
    confW: r.confW,
    confL: r.confL,
    diff: diffOf(r),
    l10: lastTen(r.log),
    streak: streakOf(r.log),
    marker: league === 'fba' ? markerFor(ordered, i, len) : null,
  }));
}

export function standings(league: SeasonLeague, teams: ScheduleTeamInfo[], games: GameResult[], len = SEASON_LENGTH[league]): Standings {
  const recs = records(teams, games);
  const better = (a: TeamRecord, b: TeamRecord) => betterThan(league, a, b);
  const present = GROUP_ORDER[league].filter(code => teams.some(t => t.group === code));
  const groups = present.map(group => {
    const ordered = javaOrder([...recs.values()].filter(r => r.group === group), better);
    return { group, rows: toRows(league, ordered, len) };
  });
  let lottery: StandingRow[] = [];
  if (league === 'fba') {
    const outside = groups.flatMap(g => g.rows.slice(PLAYOFF_SEEDS).map(r => recs.get(r.teamId)!));
    const worstFirst = javaOrder(outside, better, true);
    const byId = new Map(groups.flatMap(g => g.rows).map(r => [r.teamId, r]));
    lottery = worstFirst.map((r, i) => ({ ...byId.get(r.teamId)!, seed: i + 1 }));
  }
  return { groups, lottery };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run engine/season/standings.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/engine/season
git commit -m "feat: standings with the Java ordering, clinch markers, and lottery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Season state, schedule making, simming and recording games, trade deadline

**Files:**
- Create: `web/engine/season/state.ts`, `web/engine/season/moves.ts`, `web/engine/season/testFixtures.ts`
- Test: `web/engine/season/moves.test.ts`

**Interfaces:**
- Consumes:
  - `simGame`, `SimGame`, `SimTeam` (Task 2)
  - `buildSchedule`, `defaultPauses`, `SeasonLeague` (Task 3)
  - `markStepDone`, `POSITIONS`, `mulberry32`
  - the Task 1 types
- Produces, from `state.ts`:
  - `SeasonState { league; season; teams; rosters; players; calendar; tx; schedule | null; results | null; ratingPause | null; allstar | null }`
  - `SeasonDocKey`, `seasonDocPath(key, league, season, afterGame?)`
  - `SeasonResult`, `seasonFail`, `seasonWrites(result)`
  - `CALENDAR_STEP`, `schedulesStepId(season)`, `PAUSE_LABEL`
  - `gamesPlayed(state)`, `nextPause(schedule)`, `blockingPause(state)`, `seasonOver(state)`, `gamesUntilStop(state)`
  - `playerName(state, id)`
- Produces, from `moves.ts`:
  - `makeSchedules(input, rng): WritesResult`
  - `lineup(state, teamId): SimTeam | string`
  - `simNextGames(state, max, rng): { games: SimGame[]; problem: string | null }`
  - `toGameResult(game): GameResult`
  - `recordGames(state, games): SeasonResult`
  - `completePause(schedule, kind): ScheduleFile | null`
  - `closeTradeDeadline(state): SeasonResult`
- Produces, from `testFixtures.ts`:
  - `fbaSeasonState()`: FBA, 4 teams (BOS and CAR in E; DEN and MEM in W). The schedule is built with `mulberry32(1)`, giving 16 games with pauses after games 4, 8, 8, 12 and 12. Results are empty.
  - `d2SeasonState()`: D2, 4 teams (AMS and BER in PL; LIS and MUN in WL), 4 games, no pauses.

- [ ] **Step 1: Create the fixtures `web/engine/season/testFixtures.ts`**

```ts
import { mulberry32 } from '../d2/random';
import type { RosterEntry, TeamsFile } from '../shared/types';
import { buildSchedule, defaultPauses, type SeasonLeague } from './schedule';
import type { SeasonState } from './state';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };

function teamsFile(league: SeasonLeague, list: [string, string][]): TeamsFile {
  return { league, teams: list.map(([teamId, group]) => ({ teamId, name: `${teamId} Club`, abbr: teamId, group, logoFolder: null, badge })) };
}

function rosters(league: SeasonLeague, ratings: Record<string, number[]>, firstId: number) {
  let id = firstId;
  const names: Record<string, { id: string; name: string; birthSeason: null }> = {};
  const teams: Record<string, RosterEntry[]> = {};
  for (const [teamId, rs] of Object.entries(ratings)) {
    teams[teamId] = rs.map((rating, k) => {
      const playerId = `p${String(id++).padStart(5, '0')}`;
      names[playerId] = { id: playerId, name: `${teamId} ${POS[k]}`, birthSeason: null };
      const e: RosterEntry = { playerId, position: POS[k], rating, age: 25, points: 0 };
      if (league === 'fba') {
        e.contractEnd = 80;
        e.contractAmount = 4;
      }
      return e;
    });
  }
  return { rosters: { league, season: 79, locked: false, teams }, names };
}

const calendar = () => ({
  season: 79,
  steps: [
    { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason' as const, league: null, sub: false, done: true },
    { id: 'fba-d2', label: 'FBA D2', kind: 'league' as const, league: 'fbad2' as const, sub: false, done: false },
    { id: 'fba', label: 'FBA', kind: 'league' as const, league: 'fba' as const, sub: false, done: false },
  ],
});

function build(league: SeasonLeague, list: [string, string][], ratings: Record<string, number[]>, firstId: number): SeasonState {
  const teams = teamsFile(league, list);
  const r = rosters(league, ratings, firstId);
  const games = buildSchedule(league, teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), mulberry32(1));
  return {
    league,
    season: 79,
    teams,
    rosters: r.rosters,
    players: { nextId: firstId + 100, players: r.names },
    calendar: calendar(),
    tx: { league, season: 79, entries: [] },
    schedule: { league, season: 79, locked: false, games, pauses: defaultPauses(league, games.length) },
    results: { league, season: 79, locked: false, games: [] },
    ratingPause: null,
    allstar: null,
  };
}

/** Four FBA teams: 16 games; pauses after games 4 (ratings), 8 (ratings, deadline), 12 (ratings, allstar). */
export function fbaSeasonState(): SeasonState {
  return build('fba', [['BOS', 'E'], ['CAR', 'E'], ['DEN', 'W'], ['MEM', 'W']], {
    BOS: [95, 88, 90, 85, 94], CAR: [92, 80, 93, 77, 80], DEN: [85, 86, 95, 88, 90], MEM: [96, 84, 82, 91, 86],
  }, 1);
}

/** Four D2 teams in two leagues: 4 games, no pauses. */
export function d2SeasonState(): SeasonState {
  return build('fbad2', [['AMS', 'PL'], ['BER', 'PL'], ['LIS', 'WL'], ['MUN', 'WL']], {
    AMS: [75, 72, 75, 94, 79], BER: [70, 74, 80, 68, 85], LIS: [81, 77, 73, 70, 88], MUN: [79, 83, 71, 76, 74],
  }, 101);
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/season/moves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { closeTradeDeadline, lineup, makeSchedules, recordGames, simNextGames } from './moves';
import { blockingPause, gamesPlayed, gamesUntilStop, seasonDocPath, seasonWrites, type SeasonResult, type SeasonState } from './state';
import { d2SeasonState, fbaSeasonState } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const withPausesDoneBefore = (s: SeasonState, game: number): SeasonState => ({
  ...s, schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map(p => (p.afterGame < game ? { ...p, done: true } : p)) },
});
const play = (s: SeasonState, n: number, seed = 1): SeasonState => {
  const { games, problem } = simNextGames(s, n, mulberry32(seed));
  if (problem) throw new Error(problem);
  return ok(recordGames(s, games)).state;
};

describe('makeSchedules', () => {
  const input = () => {
    const f = fbaSeasonState();
    const d = d2SeasonState();
    const cal = { ...f.calendar, steps: f.calendar.steps.map(s => ({ ...s, done: false })) };
    return {
      season: 79, calendar: cal,
      fba: { teams: f.teams, schedule: null, results: null },
      fbad2: { teams: d.teams, schedule: null, results: null },
    };
  };

  it('writes both schedules, empty results, and marks the calendar step', () => {
    const r = makeSchedules(input(), mulberry32(4));
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Make schedules');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/schedule.json', 'leagues/fba/S79/results.json',
      'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json', 'calendar.json',
    ]);
    const fba = r.writes[0].doc as { games: unknown[]; pauses: { afterGame: number }[] };
    expect(fba.games).toHaveLength(16);
    expect(fba.pauses.map(p => p.afterGame)).toEqual([4, 8, 8, 12, 12]);
    const cal = r.writes[4].doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === 'make-s79-schedules')!.done).toBe(true);
  });

  it('re-rolls only while no games are played', () => {
    const i = input();
    const f = fbaSeasonState();
    const again = makeSchedules({ ...i, fba: { teams: f.teams, schedule: f.schedule, results: f.results } }, mulberry32(4));
    expect(again.ok && again.label).toBe('Re-roll schedules');
    const played = play(f, 1);
    const blocked = makeSchedules({ ...i, fba: { teams: f.teams, schedule: played.schedule, results: played.results } }, mulberry32(4));
    expect(blocked).toEqual({ ok: false, problems: ["Games have been played; the schedules can't be re-rolled"] });
  });
});

describe('lineup', () => {
  it('builds the five in position order, or explains what is missing', () => {
    const s = fbaSeasonState();
    const t = lineup(s, 'BOS');
    expect(typeof t === 'string' ? t : t.players.map(p => p.rating)).toEqual([95, 88, 90, 85, 94]);
    const broken: SeasonState = { ...s, rosters: { ...s.rosters, teams: { ...s.rosters.teams, BOS: s.rosters.teams.BOS.map(e => (e.position === 'C' ? { ...e, rating: null } : e)) } } };
    expect(lineup(broken, 'BOS')).toBe('BOS has no rated C');
  });
});

describe('simming and recording', () => {
  it('stops at the first pause and records games with box scores and roster points', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames(s, 10, mulberry32(2));
    expect(games.map(g => g.gameNo)).toEqual([1, 2, 3, 4]);
    const r = ok(recordGames(s, games));
    expect(r.label).toBe('Games 1–4');
    expect(r.changed).toEqual(['results', 'rosters']);
    expect(r.state.results!.games).toHaveLength(4);
    const first = r.state.results!.games[0];
    expect(first.box!.home.reduce((a, b) => a + b.pts, 0)).toBe(first.homePts);
    const totalPoints = Object.values(r.state.rosters.teams).flat().reduce((a, e) => a + e.points, 0);
    expect(totalPoints).toBe(r.state.results!.games.reduce((a, g) => a + g.homePts + g.awayPts, 0));
    expect(blockingPause(r.state)).toMatchObject({ afterGame: 4, kind: 'ratings' });
    expect(simNextGames(r.state, 5, mulberry32(3)).games).toEqual([]);
    expect(gamesUntilStop(r.state)).toBe(0);
  });

  it('refuses games out of order or past an unfinished pause', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames(s, 2, mulberry32(2));
    expect(recordGames(s, [games[1]]).ok).toBe(false);
    const at4 = play(s, 4);
    const unpaused = withPausesDoneBefore(at4, 5);
    const next = simNextGames(unpaused, 1, mulberry32(5)).games;
    expect(recordGames(at4, next)).toEqual({ ok: false, problems: ['Finish the rating adjustment pause (after game 4) first'] });
  });

  it('labels a single game and marks the calendar after the last game', () => {
    let s = withPausesDoneBefore(fbaSeasonState(), 99);
    const one = ok(recordGames(s, simNextGames(s, 1, mulberry32(8)).games));
    expect(one.label).toMatch(/^Game 1: [A-Z]+ \d+ @ [A-Z]+ \d+$/);
    s = play(s, 15);
    const last = ok(recordGames(s, simNextGames(s, 5, mulberry32(9)).games));
    expect(gamesPlayed(last.state)).toBe(16);
    expect(last.changed).toContain('calendar');
    expect(last.state.calendar.steps.find(x => x.id === 'fba')!.done).toBe(true);
  });

  it('marks the D2 step for the D2 league', () => {
    const s = d2SeasonState();
    const r = ok(recordGames(s, simNextGames(s, 10, mulberry32(1)).games));
    expect(r.state.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
    expect(r.state.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);
  });
});

describe('closeTradeDeadline', () => {
  it('only works when the deadline pause is up', () => {
    const s = fbaSeasonState();
    expect(closeTradeDeadline(s)).toEqual({ ok: false, problems: ['The trade deadline is not up yet'] });
    const at8 = play(withPausesDoneBefore(s, 8), 8);
    const ratingsDone = { ...at8, schedule: { ...at8.schedule!, pauses: at8.schedule!.pauses.map((p, i) => (i === 1 ? { ...p, done: true } : p)) } };
    const r = ok(closeTradeDeadline(ratingsDone));
    expect(r.label).toBe('Close trading (trade deadline)');
    expect(r.state.schedule!.pauses.map(p => p.done)).toEqual([true, true, true, false, false]);
  });
});

describe('paths', () => {
  it('maps doc keys to paths, including the rating pause file', () => {
    expect(seasonDocPath('schedule', 'fbad2', 79)).toBe('leagues/fbad2/S79/schedule.json');
    expect(seasonDocPath('ratingPause', 'fba', 79, 322)).toBe('leagues/fba/S79/ratingPause-322.json');
    const s = fbaSeasonState();
    const r = ok(recordGames(s, simNextGames(s, 1, mulberry32(1)).games));
    expect(seasonWrites(r).map(w => w.path)).toEqual(['leagues/fba/S79/results.json', 'leagues/fba/S79/rosters.json']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/season/moves.test.ts`
Expected: FAIL (the modules are missing).

- [ ] **Step 4: Create `web/engine/season/state.ts`**

```ts
import type {
  AllStarFile, CalendarFile, PauseKind, PlayersFile, RatingPauseFile, ResultsFile, RostersFile, ScheduleFile, SchedulePause, TeamsFile, TransactionsFile,
} from '../shared/types';
import type { SeasonLeague } from './schedule';

export interface SeasonState {
  league: SeasonLeague;
  season: number;
  teams: TeamsFile;
  rosters: RostersFile;
  players: PlayersFile;
  calendar: CalendarFile;
  tx: TransactionsFile;
  schedule: ScheduleFile | null;
  results: ResultsFile | null;
  /** The doc for the current (or next) rating pause, if it has been started. */
  ratingPause: RatingPauseFile | null;
  /** FBA only. */
  allstar: AllStarFile | null;
}

export type SeasonDocKey = 'rosters' | 'calendar' | 'tx' | 'schedule' | 'results' | 'ratingPause' | 'allstar';

export function seasonDocPath(key: SeasonDocKey, league: SeasonLeague, season: number, afterGame?: number): string {
  switch (key) {
    case 'rosters': return `leagues/${league}/S${season}/rosters.json`;
    case 'calendar': return 'calendar.json';
    case 'tx': return `leagues/${league}/S${season}/transactions.json`;
    case 'schedule': return `leagues/${league}/S${season}/schedule.json`;
    case 'results': return `leagues/${league}/S${season}/results.json`;
    case 'ratingPause':
      if (afterGame === undefined) throw new Error('A rating pause path needs its afterGame');
      return `leagues/fba/S${season}/ratingPause-${afterGame}.json`;
    case 'allstar': return `leagues/fba/S${season}/allstar.json`;
  }
}

export type SeasonResult =
  | { ok: true; state: SeasonState; changed: SeasonDocKey[]; label: string }
  | { ok: false; problems: string[] };

export const seasonFail = (problems: string[]): SeasonResult => ({ ok: false, problems });

export function seasonWrites(result: Extract<SeasonResult, { ok: true }>): { path: string; doc: unknown }[] {
  const s = result.state;
  return result.changed.map(k => ({ path: seasonDocPath(k, s.league, s.season, s.ratingPause?.afterGame), doc: s[k] }));
}

export const CALENDAR_STEP: Record<SeasonLeague, string> = { fba: 'fba', fbad2: 'fba-d2' };
export const schedulesStepId = (season: number) => `make-s${season}-schedules`;
export const PAUSE_LABEL: Record<PauseKind, string> = { ratings: 'rating adjustment', deadline: 'trade deadline', allstar: 'All-Star weekend' };

export const gamesPlayed = (state: SeasonState): number => state.results?.games.length ?? 0;

/** The first unfinished pause, in schedule order. */
export function nextPause(schedule: ScheduleFile | null): SchedulePause | null {
  return schedule?.pauses.find(p => !p.done) ?? null;
}

/** The unfinished pause that stops the next game, if one is due. */
export function blockingPause(state: SeasonState): SchedulePause | null {
  const p = nextPause(state.schedule);
  return p && p.afterGame <= gamesPlayed(state) ? p : null;
}

export function seasonOver(state: SeasonState): boolean {
  return !!state.schedule && state.schedule.games.length > 0 && gamesPlayed(state) >= state.schedule.games.length;
}

/** How many games can be played before the next pause or the end of the regular season. */
export function gamesUntilStop(state: SeasonState): number {
  if (!state.schedule) return 0;
  const played = gamesPlayed(state);
  const remaining = state.schedule.games.length - played;
  const p = nextPause(state.schedule);
  return Math.max(0, Math.min(remaining, p ? p.afterGame - played : remaining));
}

export function playerName(state: SeasonState, playerId: string): string {
  return state.players.players[playerId]?.name ?? 'Unnamed';
}
```

- [ ] **Step 5: Create `web/engine/season/moves.ts`**

```ts
import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, GameResult, PauseKind, ResultsFile, ScheduleFile, TeamsFile } from '../shared/types';
import { buildSchedule, defaultPauses, type SeasonLeague } from './schedule';
import { simGame, type SimGame, type SimTeam } from './sim';
import {
  CALENDAR_STEP, blockingPause, gamesPlayed, PAUSE_LABEL, schedulesStepId, seasonFail, type SeasonDocKey, type SeasonResult, type SeasonState,
} from './state';

export interface ScheduleLeagueInput { teams: TeamsFile; schedule: ScheduleFile | null; results: ResultsFile | null }
export interface MakeSchedulesInput { season: number; calendar: CalendarFile; fba: ScheduleLeagueInput; fbad2: ScheduleLeagueInput }
export type WritesResult = { ok: true; writes: { path: string; doc: unknown }[]; label: string } | { ok: false; problems: string[] };

export function makeSchedules(input: MakeSchedulesInput, rng: Rng): WritesResult {
  const played = (input.fba.results?.games.length ?? 0) + (input.fbad2.results?.games.length ?? 0);
  if (played > 0) return { ok: false, problems: ["Games have been played; the schedules can't be re-rolled"] };
  const writes: { path: string; doc: unknown }[] = [];
  for (const league of ['fba', 'fbad2'] as SeasonLeague[]) {
    const teams = input[league].teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
    const games = buildSchedule(league, teams, rng);
    writes.push({ path: `leagues/${league}/S${input.season}/schedule.json`, doc: { league, season: input.season, locked: false, games, pauses: defaultPauses(league, games.length) } });
    writes.push({ path: `leagues/${league}/S${input.season}/results.json`, doc: { league, season: input.season, locked: false, games: [] } });
  }
  writes.push({ path: 'calendar.json', doc: markStepDone(input.calendar, schedulesStepId(input.season)) });
  return { ok: true, writes, label: input.fba.schedule || input.fbad2.schedule ? 'Re-roll schedules' : 'Make schedules' };
}

/** The team's five, in position order, or why it can't play. */
export function lineup(state: SeasonState, teamId: string): SimTeam | string {
  const entries = state.rosters.teams[teamId];
  if (!entries) return `${teamId} has no roster`;
  const players = [];
  for (const pos of POSITIONS) {
    const e = entries.find(x => x.position === pos && x.playerId !== null);
    if (!e || e.rating === null) return `${teamId} has no rated ${pos}`;
    players.push({ playerId: e.playerId!, position: pos, rating: e.rating });
  }
  return { teamId, players };
}

/** Sims up to `max` upcoming games in schedule order, stopping at a pause or the end of the regular season. Nothing is saved. */
export function simNextGames(state: SeasonState, max: number, rng: Rng): { games: SimGame[]; problem: string | null } {
  const sched = state.schedule;
  if (!sched || !state.results) return { games: [], problem: 'Make schedules first' };
  const out: SimGame[] = [];
  let played = gamesPlayed(state);
  while (out.length < max && played < sched.games.length) {
    if (sched.pauses.some(p => !p.done && p.afterGame <= played)) break;
    const g = sched.games[played];
    const home = lineup(state, g.home);
    if (typeof home === 'string') return { games: out, problem: home };
    const away = lineup(state, g.away);
    if (typeof away === 'string') return { games: out, problem: away };
    out.push(simGame(g.gameNo, home, away, rng));
    played++;
  }
  return { games: out, problem: null };
}

export function toGameResult(g: SimGame): GameResult {
  return {
    gameNo: g.gameNo,
    home: g.home.teamId,
    away: g.away.teamId,
    homePts: g.homePts,
    awayPts: g.awayPts,
    ot: g.ot,
    periods: g.periods,
    box: {
      home: g.home.players.map((p, k) => ({ playerId: p.playerId, pts: g.box.home[k] })),
      away: g.away.players.map((p, k) => ({ playerId: p.playerId, pts: g.box.away[k] })),
    },
  };
}

/** Saves simmed games (which must be the next ones, in order, not past an unfinished pause). */
export function recordGames(state: SeasonState, games: SimGame[]): SeasonResult {
  const sched = state.schedule;
  if (!sched || !state.results) return seasonFail(['Make schedules first']);
  if (!games.length) return seasonFail(['No games to record']);
  const played = gamesPlayed(state);
  const problems: string[] = [];
  games.forEach((g, k) => {
    const want = sched.games[played + k];
    if (!want || g.gameNo !== want.gameNo) problems.push(`Game ${g.gameNo} isn't next (expected game ${played + k + 1})`);
    else if (g.home.teamId !== want.home || g.away.teamId !== want.away) problems.push(`Game ${g.gameNo} is ${want.away} @ ${want.home}`);
  });
  const last = played + games.length;
  const pause = sched.pauses.find(p => !p.done && p.afterGame < last);
  if (pause) problems.push(`Finish the ${PAUSE_LABEL[pause.kind]} pause (after game ${pause.afterGame}) first`);
  if (problems.length) return seasonFail(problems);

  const results = games.map(toGameResult);
  const add = new Map<string, number>();
  for (const r of results) for (const line of [...r.box!.home, ...r.box!.away]) add.set(line.playerId, (add.get(line.playerId) ?? 0) + line.pts);
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId && add.has(e.playerId) ? { ...e, points: e.points + add.get(e.playerId)! } : e)),
  ]));
  const done = last === sched.games.length;
  const changed: SeasonDocKey[] = done ? ['results', 'rosters', 'calendar'] : ['results', 'rosters'];
  const one = results[0];
  const label = results.length === 1
    ? `Game ${one.gameNo}: ${one.away} ${one.awayPts} @ ${one.home} ${one.homePts}`
    : `Games ${results[0].gameNo}–${results[results.length - 1].gameNo}`;
  return {
    ok: true,
    state: {
      ...state,
      results: { ...state.results, games: [...state.results.games, ...results] },
      rosters: { ...state.rosters, teams },
      calendar: done ? markStepDone(state.calendar, CALENDAR_STEP[state.league]) : state.calendar,
    },
    changed,
    label,
  };
}

/** Marks the first unfinished pause done, if it is of this kind. */
export function completePause(schedule: ScheduleFile, kind: PauseKind): ScheduleFile | null {
  const i = schedule.pauses.findIndex(p => !p.done);
  if (i < 0 || schedule.pauses[i].kind !== kind) return null;
  return { ...schedule, pauses: schedule.pauses.map((p, j) => (j === i ? { ...p, done: true } : p)) };
}

export function closeTradeDeadline(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'deadline' || !state.schedule) return seasonFail(['The trade deadline is not up yet']);
  const schedule = completePause(state.schedule, 'deadline')!;
  return { ok: true, state: { ...state, schedule }, changed: ['schedule'], label: 'Close trading (trade deadline)' };
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run engine/season && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/engine/season
git commit -m "feat: season state and moves (make schedules, sim/record games, pauses, trade deadline)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rating-adjust pause (suggestions and moves), plus a shared z-bucket helper

**Files:**
- Create: `web/engine/shared/perfBuckets.ts`, `web/engine/season/ratingPause.ts`
- Modify: `web/engine/d2/ratings.ts` (`performanceScores` uses `zBuckets`)
- Test: `web/engine/shared/perfBuckets.test.ts`, `web/engine/season/ratingPause.test.ts`

**Interfaces:**
- Consumes:
  - `SeasonState`, `blockingPause`, `seasonFail`, `SeasonResult`, `playerName` (Task 5)
  - `completePause` (Task 5)
  - `appendTx`, `MoveContext`
  - `RatingPauseFile`, `RatingPauseRow`, `ResultsFile`
- Produces:
  - `zBuckets(rows: { id: string; x: number; y: number }[]): Map<string, number>`
  - `MIN_PAUSE_GAMES = 5`
  - `playerSeasonStats(results)`
  - `buildRatingPause(state, minGames?)`
  - `startRatingPause(state)`, with the label `Start rating adjustments (after game N)`
  - `setPauseRating(doc, playerId, value)`
  - `finishRatingPause(state, ctx)`, with the label `Finish rating adjustments (after game N)`

- [ ] **Step 1: Write the failing tests**

Create `web/engine/shared/perfBuckets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { zBuckets } from './perfBuckets';

describe('zBuckets', () => {
  it('buckets residuals of y regressed on x', () => {
    const rows = [
      { id: 'a', x: 70, y: 100 }, { id: 'b', x: 70, y: 100 }, { id: 'c', x: 70, y: 100 },
      { id: 'd', x: 70, y: 100 }, { id: 'e', x: 70, y: 300 },
    ];
    expect(Object.fromEntries(zBuckets(rows))).toEqual({ a: -1, b: -1, c: -1, d: -1, e: 2 });
  });
  it('is all zeros on a perfect fit and empty below 3 rows', () => {
    expect(Object.fromEntries(zBuckets([{ id: 'a', x: 60, y: 100 }, { id: 'b', x: 70, y: 200 }, { id: 'c', x: 80, y: 300 }]))).toEqual({ a: 0, b: 0, c: 0 });
    expect(zBuckets([{ id: 'a', x: 1, y: 1 }]).size).toBe(0);
  });
});
```

Create `web/engine/season/ratingPause.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../shared/types';
import { buildRatingPause, finishRatingPause, playerSeasonStats, setPauseRating, startRatingPause } from './ratingPause';
import type { SeasonResult, SeasonState } from './state';
import { fbaSeasonState } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const ctx = { batchId: 'b1' };

/** Four played games (every team twice) where BOS's PG scores 40 and everyone else 10. */
function atFirstPause(): SeasonState {
  const s = fbaSeasonState();
  const pairs = [['BOS', 'CAR'], ['DEN', 'MEM'], ['BOS', 'DEN'], ['CAR', 'MEM']];
  const games: GameResult[] = pairs.map(([home, away], k) => ({ gameNo: k + 1, home, away })).map(g => ({
    gameNo: g.gameNo, home: g.home, away: g.away, homePts: 50, awayPts: 60,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: e.playerId === 'p00001' ? 40 : 10 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}

describe('playerSeasonStats', () => {
  it('counts games and points from box scores', () => {
    const stats = playerSeasonStats(atFirstPause().results);
    expect(stats.get('p00001')).toEqual({ games: 2, pts: 80 });
    expect(stats.get('p00002')).toEqual({ games: 2, pts: 20 });
  });
});

describe('buildRatingPause', () => {
  it('lists every FBA player with games, PPG and a suggestion only past the minimum', () => {
    const rows = buildRatingPause(atFirstPause());
    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({ playerId: 'p00001', teamId: 'BOS', position: 'PG', oldRating: 95, games: 2, ppg: 40, perf: null, suggested: null, rating: 95 });
    const lowMin = buildRatingPause(atFirstPause(), 1);
    const star = lowMin.find(r => r.playerId === 'p00001')!;
    expect(star.perf).toBe(2);
    expect(star.suggested).toBe(97);
    for (const r of lowMin) expect(r.suggested).toBe(Math.max(1, Math.min(99, r.oldRating + r.perf!)));
  });
});

describe('start and finish', () => {
  it('starts only when a rating pause is due, then applies edits, logs them and finishes the pause', () => {
    expect(startRatingPause(fbaSeasonState())).toEqual({ ok: false, problems: ['No rating adjustment is due'] });
    const s = atFirstPause();
    const started = ok(startRatingPause(s));
    expect(started.label).toBe('Start rating adjustments (after game 4)');
    expect(started.changed).toEqual(['ratingPause']);
    expect(startRatingPause(started.state).ok).toBe(false);
    const edited = { ...started.state, ratingPause: setPauseRating(started.state.ratingPause!, 'p00002', 91) };
    const done = ok(finishRatingPause(edited, ctx));
    expect(done.label).toBe('Finish rating adjustments (after game 4)');
    expect(done.changed).toEqual(['rosters', 'tx', 'schedule', 'ratingPause']);
    expect(done.state.rosters.teams.BOS[1].rating).toBe(91);
    expect(done.state.tx.entries.at(-1)).toMatchObject({ type: 'edit', teams: ['BOS'], lines: ['Rating SG-BOS SG: 88→91 (in-season)'] });
    expect(done.state.schedule!.pauses[0].done).toBe(true);
    expect(done.state.ratingPause!.locked).toBe(true);
  });

  it('refuses to finish before starting', () => {
    expect(finishRatingPause(atFirstPause(), ctx)).toEqual({ ok: false, problems: ['Start the rating adjustments first'] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/perfBuckets.test.ts engine/season/ratingPause.test.ts`
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Create `web/engine/shared/perfBuckets.ts`**

```ts
export interface PerfRow { id: string; x: number; y: number }

/**
 * Least-squares fit y ≈ a + b·x over the rows, then each row's residual z-score bucketed:
 * z ≥ 1.5 → +2, ≥ 0.5 → +1, ≤ −1.5 → −2, ≤ −0.5 → −1, else 0. Fewer than 3 rows → empty.
 */
export function zBuckets(rows: PerfRow[]): Map<string, number> {
  const out = new Map<string, number>();
  if (rows.length < 3) return out;
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.x, 0) / n;
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.x - mx) ** 2, 0);
  const sxy = rows.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const resid = rows.map(r => r.y - (a + b * r.x));
  const sd = Math.sqrt(resid.reduce((s, x) => s + x * x, 0) / n);
  rows.forEach((r, i) => {
    const z = sd < 1e-9 ? 0 : resid[i] / sd;
    out.set(r.id, z >= 1.5 ? 2 : z >= 0.5 ? 1 : z <= -1.5 ? -2 : z <= -0.5 ? -1 : 0);
  });
  return out;
}
```

In `web/engine/d2/ratings.ts`, replace the body of `performanceScores` after the `rows` filter with a call to the helper, and import `zBuckets` from `'../shared/perfBuckets'`:

```ts
export function performanceScores(prev: RostersFile | null): Map<string, number> {
  if (!prev) return new Map();
  const rows = Object.values(prev.teams).flat().filter((e): e is Scored => e.playerId !== null && e.rating !== null && e.points > 0);
  return zBuckets(rows.map(r => ({ id: r.playerId, x: r.rating, y: r.points })));
}
```

- [ ] **Step 4: Create `web/engine/season/ratingPause.ts`**

```ts
import { appendTx, type MoveContext } from '../roster/state';
import { zBuckets } from '../shared/perfBuckets';
import type { RatingPauseFile, RatingPauseRow, ResultsFile } from '../shared/types';
import { completePause } from './moves';
import { blockingPause, playerName, seasonFail, type SeasonResult, type SeasonState } from './state';

export const MIN_PAUSE_GAMES = 5;

export function playerSeasonStats(results: ResultsFile | null): Map<string, { games: number; pts: number }> {
  const out = new Map<string, { games: number; pts: number }>();
  for (const g of results?.games ?? []) {
    for (const line of [...(g.box?.home ?? []), ...(g.box?.away ?? [])]) {
      const s = out.get(line.playerId) ?? { games: 0, pts: 0 };
      s.games++;
      s.pts += line.pts;
      out.set(line.playerId, s);
    }
  }
  return out;
}

const clampRating = (n: number) => Math.max(1, Math.min(99, n));

/** One row per rated FBA roster player (team order, then slot order). */
export function buildRatingPause(state: SeasonState, minGames = MIN_PAUSE_GAMES): RatingPauseRow[] {
  const stats = playerSeasonStats(state.results);
  const base = Object.entries(state.rosters.teams).flatMap(([teamId, entries]) =>
    entries.filter(e => e.playerId !== null && e.rating !== null).map(e => {
      const s = stats.get(e.playerId!) ?? { games: 0, pts: 0 };
      return { playerId: e.playerId!, teamId, position: e.position, oldRating: e.rating!, games: s.games, ppgExact: s.games ? s.pts / s.games : 0 };
    }));
  const eligible = base.filter(r => r.games >= minGames);
  const perf = zBuckets(eligible.map(r => ({ id: r.playerId, x: r.oldRating, y: r.ppgExact })));
  return base.map(r => {
    const p = r.games >= minGames ? perf.get(r.playerId) ?? 0 : null;
    const suggested = p === null ? null : clampRating(r.oldRating + p);
    return {
      playerId: r.playerId,
      teamId: r.teamId,
      position: r.position,
      oldRating: r.oldRating,
      games: r.games,
      ppg: Math.round(r.ppgExact * 10) / 10,
      perf: p,
      suggested,
      rating: suggested ?? clampRating(r.oldRating),
    };
  });
}

export function startRatingPause(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (state.league !== 'fba' || !p || p.kind !== 'ratings') return seasonFail(['No rating adjustment is due']);
  if (state.ratingPause && state.ratingPause.afterGame === p.afterGame) return seasonFail(['Rating adjustments have already started']);
  const ratingPause: RatingPauseFile = { league: 'fba', season: state.season, afterGame: p.afterGame, locked: false, players: buildRatingPause(state) };
  return { ok: true, state: { ...state, ratingPause }, changed: ['ratingPause'], label: `Start rating adjustments (after game ${p.afterGame})` };
}

export function setPauseRating(doc: RatingPauseFile, playerId: string, value: number): RatingPauseFile {
  return { ...doc, players: doc.players.map(r => (r.playerId === playerId ? { ...r, rating: value } : r)) };
}

export function finishRatingPause(state: SeasonState, ctx: MoveContext): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'ratings' || !state.schedule) return seasonFail(['No rating adjustment is due']);
  const doc = state.ratingPause;
  if (!doc || doc.afterGame !== p.afterGame || doc.locked) return seasonFail(['Start the rating adjustments first']);
  const changes = doc.players.filter(r => r.rating !== r.oldRating);
  const next = new Map(changes.map(r => [r.playerId, r.rating]));
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  let tx = state.tx;
  for (const r of changes) {
    tx = appendTx(tx, ctx, 'edit', [r.teamId], [`Rating ${r.position}-${playerName(state, r.playerId)}: ${r.oldRating}→${r.rating} (in-season)`]);
  }
  return {
    ok: true,
    state: {
      ...state,
      rosters: { ...state.rosters, teams },
      tx,
      schedule: completePause(state.schedule, 'ratings')!,
      ratingPause: { ...doc, locked: true },
    },
    changed: ['rosters', 'tx', 'schedule', 'ratingPause'],
    label: `Finish rating adjustments (after game ${p.afterGame})`,
  };
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run engine && npx tsc --noEmit`
Expected: PASS, including the unchanged D2 ratings tests.

- [ ] **Step 6: Commit**

```bash
git add web/engine
git commit -m "feat: rating-adjust pause with performance suggestions; shared z-bucket helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Roster locks (season phase) enforced in the roster moves

**Files:**
- Create: `web/engine/season/locks.ts`
- Modify: `web/engine/roster/state.ts` (`MoveContext.phase`)
- Modify: `web/engine/roster/moves.ts` (`signPlayer`, `releasePlayer`, `editPlayer`), `web/engine/roster/trade.ts` (`makeTrade`)
- Test: `web/engine/season/locks.test.ts`

**Interfaces:**
- Produces:
  - `type SeasonPhase = 'open' | 'd2-cycle' | 'fba-season' | 'post-deadline'`
  - `seasonPhase({ freeAgencyClosed, fbaGamesPlayed, deadlineDone }): SeasonPhase`
  - `type LockedAction = 'sign' | 'release' | 'cut' | 'trade' | 'edit'`
  - `LOCK_MESSAGES`
  - `lockProblem(phase: SeasonPhase | undefined, league, action): string | null`
  - `MoveContext` gains `phase?: SeasonPhase`. It's optional, and missing means `'open'`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/locks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { editPlayer, releasePlayer } from '../roster/moves';
import { baseState } from '../roster/testFixtures';
import { makeTrade } from '../roster/trade';
import { LOCK_MESSAGES, lockProblem, seasonPhase } from './locks';

describe('seasonPhase', () => {
  it('follows free agency, the FBA season and the deadline', () => {
    expect(seasonPhase({ freeAgencyClosed: false, fbaGamesPlayed: 0, deadlineDone: false })).toBe('open');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 0, deadlineDone: false })).toBe('d2-cycle');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 5, deadlineDone: false })).toBe('fba-season');
    expect(seasonPhase({ freeAgencyClosed: true, fbaGamesPlayed: 700, deadlineDone: true })).toBe('post-deadline');
  });
});

describe('lockProblem', () => {
  it('matches the spec table', () => {
    for (const a of ['sign', 'release', 'cut', 'trade', 'edit'] as const) {
      expect(lockProblem('open', 'fba', a)).toBeNull();
      expect(lockProblem(undefined, 'fbad2', a)).toBeNull();
      expect(lockProblem('d2-cycle', 'fbad2', a)).toBe(LOCK_MESSAGES.d2);
      expect(lockProblem('post-deadline', 'fba', a)).toBe(LOCK_MESSAGES.deadline);
    }
    expect(lockProblem('d2-cycle', 'fba', 'trade')).toBeNull();
    expect(lockProblem('d2-cycle', 'fba', 'edit')).toBeNull();
    expect(lockProblem('d2-cycle', 'fba', 'sign')).toBe(LOCK_MESSAGES.faClosed);
    expect(lockProblem('d2-cycle', 'fba', 'cut')).toBe(LOCK_MESSAGES.faClosed);
    expect(lockProblem('fba-season', 'fba', 'trade')).toBeNull();
    expect(lockProblem('fba-season', 'fba', 'edit')).toBe(LOCK_MESSAGES.season);
    expect(lockProblem('fba-season', 'fbad2', 'trade')).toBe(LOCK_MESSAGES.d2);
  });
});

describe('moves honor the phase', () => {
  it('blocks a D2 release and an in-season FBA edit, and allows an open-phase release', () => {
    expect(releasePlayer(baseState(), { league: 'fbad2', teamId: 'AMS', playerId: 'p00020', kind: 'released' }, { batchId: 'b', phase: 'd2-cycle' }))
      .toEqual({ ok: false, problems: [LOCK_MESSAGES.d2] });
    expect(editPlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', changes: { rating: 96 } }, { batchId: 'b', phase: 'fba-season' }))
      .toEqual({ ok: false, problems: [LOCK_MESSAGES.season] });
    expect(releasePlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', kind: 'released' }, { batchId: 'b' }).ok).toBe(true);
  });
  it('blocks trades after the deadline', () => {
    const r = makeTrade(baseState(), { league: 'fba', teams: ['BOS', 'CAR'], assets: [] }, { batchId: 'b', phase: 'post-deadline' });
    expect(r).toEqual({ ok: false, problems: [LOCK_MESSAGES.deadline] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/locks.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Create `web/engine/season/locks.ts`**

```ts
export type SeasonPhase = 'open' | 'd2-cycle' | 'fba-season' | 'post-deadline';
export type LockedAction = 'sign' | 'release' | 'cut' | 'trade' | 'edit';

export const LOCK_MESSAGES = {
  faClosed: 'Free agency is closed: FBA rosters change only by trade (and Edit) until the season starts',
  d2: 'D2 rosters are locked from the close of free agency until the next offseason',
  season: 'During the FBA season rosters change only by trade, until the trade deadline',
  deadline: 'The trade deadline has passed: rosters are locked until the offseason',
} as const;

export function seasonPhase(input: { freeAgencyClosed: boolean; fbaGamesPlayed: number; deadlineDone: boolean }): SeasonPhase {
  if (!input.freeAgencyClosed) return 'open';
  if (input.deadlineDone) return 'post-deadline';
  if (input.fbaGamesPlayed > 0) return 'fba-season';
  return 'd2-cycle';
}

/** Why this roster action is blocked right now, or null. A missing phase means the offseason (open). */
export function lockProblem(phase: SeasonPhase | undefined, league: 'fba' | 'fbad2', action: LockedAction): string | null {
  if (!phase || phase === 'open') return null;
  if (phase === 'post-deadline') return LOCK_MESSAGES.deadline;
  if (league === 'fbad2') return LOCK_MESSAGES.d2;
  if (phase === 'fba-season') return action === 'trade' ? null : LOCK_MESSAGES.season;
  return action === 'trade' || action === 'edit' ? null : LOCK_MESSAGES.faClosed;
}
```

- [ ] **Step 4: Add the phase to `MoveContext` and check it in the moves**

In `web/engine/roster/state.ts`, add `import type { SeasonPhase } from '../season/locks';` and change `MoveContext`:

```ts
export interface MoveContext {
  batchId: string;
  /** The season phase for roster locks; omitted means the offseason (nothing locked). */
  phase?: SeasonPhase;
}
```

In `web/engine/roster/moves.ts`, add `import { lockProblem } from '../season/locks';` and make these the **first** lines of each function:
- In `signPlayer`: `const locked = lockProblem(ctx.phase, 'fba', 'sign'); if (locked) return fail([locked]);`
- In `releasePlayer`: `const locked = lockProblem(ctx.phase, input.league, input.kind === 'cut' ? 'cut' : 'release'); if (locked) return fail([locked]);`
- In `editPlayer`: `const locked = lockProblem(ctx.phase, input.league, 'edit'); if (locked) return fail([locked]);`

In `web/engine/roster/trade.ts`, add `import { lockProblem } from '../season/locks';` and make this the first line of `makeTrade`: `const locked = lockProblem(ctx.phase, input.league, 'trade'); if (locked) return fail([locked]);`

Write each check as a two-line `const …; if (…) return …;` block, formatted like the surrounding code.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run engine && npx tsc --noEmit`
Expected: PASS. All existing roster tests pass, because they omit `phase`.

- [ ] **Step 6: Commit**

```bash
git add web/engine
git commit -m "feat: season-phase roster locks enforced in sign/release/edit/trade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: All-Star engine, part 1: dice, selections, the ASG draft, the contest draw

**Files:**
- Create: `web/engine/allstar/dice.ts`, `web/engine/allstar/common.ts`, `web/engine/allstar/selection.ts`, `web/engine/allstar/asgDraft.ts`, `web/engine/allstar/contestDraw.ts`, `web/engine/allstar/testFixtures.ts`
- Test: `web/engine/allstar/part1.test.ts`

**Interfaces:**
- Consumes: `Rng`, `randInt`, `shuffle`, `POSITIONS`, and the Task 1 types (`AllStarFile`, `AllStarSelections`, `Dice`, `RollOff`, `RostersFile`, `PlayersFile`, `Position`).
- Produces, from `dice.ts`:
  - `roll(rng): Dice`
  - `total(d)`
  - `rollOff(ids, rng): { order: string[]; rollOff: RollOff }`: sudden death, best first
- Produces, from `common.ts`:
  - `FbaPlayer { playerId; teamId; position; rating; restricted; name }`
  - `fbaPlayers(rosters, players): FbaPlayer[]`
  - `AllStarResult = { ok: true; doc: AllStarFile; label } | { ok: false; problems }`
  - `allStarFail(problems)`
  - `emptyAllStar(season): AllStarFile`
- Produces, from `selection.ts`:
  - `ALL_STAR_COUNT = 28`, `ALL_STAR_LIMITS = { min: 4, max: 11 }`, `YOUNG_COUNT = 20`, `YOUNG_LIMITS = { min: 2, max: 7 }`
  - `suggestSelections(list, ppg): AllStarSelections`
  - `selectionProblems(sel, list, registry): string[]`
  - `saveSelections(doc, sel, season, list, registry): AllStarResult`, with the label `Save All-Star selections`
- Produces, from `asgDraft.ts`:
  - `ASG_PICKS = 26`
  - `startAsgDraft(doc, rng)`, with the label `Start All-Star draft (coin flip)`
  - `asgTeams(doc): [string[], string[]]`: captain first, then picks in order
  - `asgOnClock(doc): 0 | 1 | null`
  - `asgNeeds(doc, team, list): Position[]`
  - `asgAvailable(doc, list): FbaPlayer[]`
  - `asgPick(doc, playerId, list)`, with the label `All-Star draft pick N`
- Produces, from `contestDraw.ts`:
  - `CONTEST_SPOTS = { '5pt': 10, dunk: 4 }`
  - `startContestDraw(doc, teamIds, rng)`, with the label `Start contest draw`
  - `drawCounts(doc)`, `drawFilled(doc)`, `drawOnClock(doc): string | null`
  - `contestTurn(doc, choice: { contest: '5pt' | 'dunk'; playerId: string } | null, list)`, with the label `Contest draw: TEAM sends NAME to the 5pt contest` / `… dunk contest` / `Contest draw: TEAM passes`
  - `contestPlayers(doc, contest): string[]`
- Produces, from `testFixtures.ts`: `allStarRosters(): { rosters: RostersFile; players: PlayersFile; teamIds: string[] }`. That's 30 FBA teams T0–T29 of 5 players each (150 players, `p10000`…); rating = `60 + ((t*7 + k*13) % 40)`; restricted when `t % 3 === 0`.

- [ ] **Step 1: Create the fixture `web/engine/allstar/testFixtures.ts`**

```ts
import type { PlayersFile, RosterEntry, RostersFile } from '../shared/types';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/** 30 FBA teams T0–T29, five players each (ids p10000…); ratings spread 60–99; every third team's players are on rookie deals. */
export function allStarRosters(): { rosters: RostersFile; players: PlayersFile; teamIds: string[] } {
  const teams: Record<string, RosterEntry[]> = {};
  const names: PlayersFile['players'] = {};
  const teamIds: string[] = [];
  let id = 10000;
  for (let t = 0; t < 30; t++) {
    const teamId = `T${t}`;
    teamIds.push(teamId);
    teams[teamId] = POS.map((position, k) => {
      const playerId = `p${id++}`;
      names[playerId] = { id: playerId, name: `${teamId} ${position}`, birthSeason: null };
      const e: RosterEntry = { playerId, position, rating: 60 + ((t * 7 + k * 13) % 40), age: 24, points: 0, contractEnd: 80, contractAmount: 2 };
      if (t % 3 === 0) e.restricted = true;
      return e;
    });
  }
  return { rosters: { league: 'fba', season: 79, locked: false, teams }, players: { nextId: id, players: names }, teamIds };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/allstar/part1.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile } from '../shared/types';
import { ASG_PICKS, asgAvailable, asgNeeds, asgOnClock, asgPick, asgTeams, startAsgDraft } from './asgDraft';
import { type AllStarResult, emptyAllStar, fbaPlayers } from './common';
import { contestPlayers, contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from './contestDraw';
import { rollOff } from './dice';
import { saveSelections, selectionProblems, suggestSelections } from './selection';
import { allStarRosters } from './testFixtures';

const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };
const ok = (r: AllStarResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};
const fx = allStarRosters();
const list = fbaPlayers(fx.rosters, fx.players);
const posOf = (id: string) => list.find(p => p.playerId === id)!.position;

function selected(): AllStarFile {
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  return ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
}

describe('rollOff', () => {
  it('separates tied ids with sudden-death 2d6 rolls', () => {
    const one = rollOff(['a', 'b'], seq(0.99, 0.99, 0, 0));
    expect(one.order).toEqual(['a', 'b']);
    expect(one.rollOff).toEqual({ ids: ['a', 'b'], rounds: [{ a: [6, 6], b: [1, 1] }] });
    const two = rollOff(['a', 'b'], seq(0.5, 0.5, 0.5, 0.5, 0, 0, 0.99, 0.99));
    expect(two.order).toEqual(['b', 'a']);
    expect(two.rollOff.rounds).toHaveLength(2);
  });
});

describe('selections', () => {
  it('lists every rated FBA player', () => {
    expect(list).toHaveLength(150);
    expect(list[0]).toEqual({ playerId: 'p10000', teamId: 'T0', position: 'PG', rating: 60, restricted: true, name: 'T0 PG' });
  });

  it('suggests 28 All-Stars and 20 Young-Stars within the position limits', () => {
    const sel = suggestSelections(list, new Map());
    expect(sel.allStars).toHaveLength(28);
    for (const pos of POSITIONS) {
      const n = sel.allStars.filter(id => posOf(id) === pos).length;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(11);
      const y = sel.youngStars.filter(id => posOf(id) === pos).length;
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(7);
    }
    expect(sel.captains).toHaveLength(2);
    expect(sel.captains.every(c => sel.allStars.includes(c))).toBe(true);
    expect(sel.youngStars).toHaveLength(20);
    expect(sel.youngStars.every(id => list.find(p => p.playerId === id)!.restricted)).toBe(true);
    expect(sel.youngCaptains).toEqual([]);
  });

  it('explains what is wrong with a selection', () => {
    const sel = suggestSelections(list, new Map());
    expect(selectionProblems({ ...sel, allStars: sel.allStars.slice(1) }, list, fx.players)).toContain('Pick 28 All-Stars (have 27)');
    expect(selectionProblems(sel, list, fx.players)).toContain('Pick 4 Young-Star captains who are not Young-Stars');
    expect(selectionProblems({ ...sel, captains: [sel.allStars[0]] }, list, fx.players)).toContain('Pick 2 ASG captains from the All-Stars');
  });

  it('saves a valid selection, and locks it once the draft starts', () => {
    const doc = selected();
    expect(doc.selections!.allStars).toHaveLength(28);
    const drafting = ok(startAsgDraft(doc, seq(0)));
    expect(saveSelections(drafting, doc.selections!, 79, list, fx.players)).toEqual({
      ok: false, problems: ['Selections are locked once the All-Star draft starts'],
    });
  });
});

describe('ASG draft', () => {
  it('alternates from the coin-flip winner and makes the first 4 picks complete the starters', () => {
    let doc = ok(startAsgDraft(selected(), seq(0)));
    expect(doc.asgDraft).toEqual({ first: 0, picks: [] });
    expect(asgOnClock(doc)).toBe(0);
    const captain0 = doc.selections!.captains[0];
    expect(asgNeeds(doc, 0, list)).not.toContain(posOf(captain0));
    const samePos = doc.selections!.allStars.find(id => id !== captain0 && !doc.selections!.captains.includes(id) && posOf(id) === posOf(captain0))!;
    expect(asgPick(doc, samePos, list).ok).toBe(false);
    for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
    expect(asgOnClock(doc)).toBeNull();
    const [a, b] = asgTeams(doc);
    expect(a).toHaveLength(14);
    expect(b).toHaveLength(14);
    for (const team of [a, b]) expect(new Set(team.slice(0, 5).map(posOf)).size).toBe(5);
  });
});

describe('contest draw', () => {
  it('walks teams in random order, allows passes, and redraws teams that passed', () => {
    let doc = ok(startContestDraw(emptyAllStar(79), fx.teamIds, mulberry32(2)));
    const order = doc.contestDraw!.order;
    expect([...order].sort()).toEqual([...fx.teamIds].sort());
    for (let k = 0; k < 30; k++) doc = ok(contestTurn(doc, null, list));
    expect(drawOnClock(doc)).toBe(order[0]);
    const first = list.find(p => p.teamId === order[0])!;
    doc = ok(contestTurn(doc, { contest: 'dunk', playerId: first.playerId }, list));
    expect(drawOnClock(doc)).toBe(order[1]);
    const wrongTeam = list.find(p => p.teamId === order[0])!;
    expect(contestTurn(doc, { contest: '5pt', playerId: wrongTeam.playerId }, list).ok).toBe(false);
  });

  it('fills 10 + 4 spots and then stops', () => {
    let doc = ok(startContestDraw(emptyAllStar(79), fx.teamIds, mulberry32(3)));
    while (!drawFilled(doc)) {
      const team = drawOnClock(doc)!;
      const counts = drawCounts(doc);
      const contest = counts['5pt'] < 10 ? '5pt' : 'dunk';
      doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
    }
    expect(drawCounts(doc)).toEqual({ '5pt': 10, dunk: 4 });
    expect(drawOnClock(doc)).toBeNull();
    expect(contestPlayers(doc, '5pt')).toHaveLength(10);
    expect(new Set(doc.contestDraw!.turns.filter(t => t.playerId).map(t => t.teamId)).size).toBe(14);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/allstar/part1.test.ts`
Expected: FAIL (the modules are missing).

- [ ] **Step 4: Create `web/engine/allstar/dice.ts`**

```ts
import { randInt, type Rng } from '../d2/random';
import type { Dice, RollOff } from '../shared/types';

export const roll = (rng: Rng): Dice => [randInt(rng, 1, 6), randInt(rng, 1, 6)];
export const total = (d: Dice): number => d[0] + d[1];

/** Ranks tied ids best-first: everyone still tied rolls 2d6 each round until all are separated. */
export function rollOff(ids: string[], rng: Rng): { order: string[]; rollOff: RollOff } {
  const rounds: Record<string, Dice>[] = [];
  const rank = (group: string[]): string[] => {
    if (group.length <= 1) return group;
    const round: Record<string, Dice> = {};
    for (const id of group) round[id] = roll(rng);
    rounds.push(round);
    const bySum = new Map<number, string[]>();
    for (const id of group) {
      const s = total(round[id]);
      bySum.set(s, [...(bySum.get(s) ?? []), id]);
    }
    return [...bySum.keys()].sort((a, b) => b - a).flatMap(s => rank(bySum.get(s)!));
  };
  return { order: rank([...ids]), rollOff: { ids: [...ids], rounds } };
}
```

- [ ] **Step 5: Create `web/engine/allstar/common.ts`**

```ts
import type { AllStarFile, PlayersFile, Position, RostersFile } from '../shared/types';

export interface FbaPlayer {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  restricted: boolean;
  name: string;
}

/** Every rated player on an FBA roster, team by team in slot order. */
export function fbaPlayers(rosters: RostersFile, players: PlayersFile): FbaPlayer[] {
  return Object.entries(rosters.teams).flatMap(([teamId, entries]) =>
    entries.filter(e => e.playerId !== null && e.rating !== null).map(e => ({
      playerId: e.playerId!,
      teamId,
      position: e.position,
      rating: e.rating!,
      restricted: e.restricted === true,
      name: players.players[e.playerId!]?.name ?? 'Unnamed',
    })));
}

export type AllStarResult = { ok: true; doc: AllStarFile; label: string } | { ok: false; problems: string[] };
export const allStarFail = (problems: string[]): AllStarResult => ({ ok: false, problems });

export function emptyAllStar(season: number): AllStarFile {
  return {
    league: 'fba', season, locked: false, selections: null, asgDraft: null, contestDraw: null,
    fivePoint: null, dunk: null, ysgDraft: null, ysg: null, asg: null,
  };
}
```

- [ ] **Step 6: Create `web/engine/allstar/selection.ts`**

```ts
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, AllStarSelections, PlayersFile } from '../shared/types';
import { allStarFail, type AllStarResult, emptyAllStar, type FbaPlayer } from './common';

export const ALL_STAR_COUNT = 28;
export const ALL_STAR_LIMITS = { min: 4, max: 11 };
export const YOUNG_COUNT = 20;
export const YOUNG_LIMITS = { min: 2, max: 7 };

/** Takes the first `min` at each position, then fills to `count` in list order without passing `max` at any position. */
function pickWithin(candidates: FbaPlayer[], count: number, limits: { min: number; max: number }): string[] {
  const chosen = new Set<string>();
  const perPos = new Map<string, number>();
  const add = (p: FbaPlayer) => {
    chosen.add(p.playerId);
    perPos.set(p.position, (perPos.get(p.position) ?? 0) + 1);
  };
  for (const pos of POSITIONS) candidates.filter(p => p.position === pos).slice(0, limits.min).forEach(add);
  for (const p of candidates) {
    if (chosen.size >= count) break;
    if (!chosen.has(p.playerId) && (perPos.get(p.position) ?? 0) < limits.max) add(p);
  }
  return candidates.filter(p => chosen.has(p.playerId)).map(p => p.playerId);
}

/** App suggestion: All-Stars by rating (PPG breaks ties); Young-Stars from rookie-deal players first. */
export function suggestSelections(list: FbaPlayer[], ppg: Map<string, number>): AllStarSelections {
  const best = [...list].sort((a, b) =>
    b.rating - a.rating || (ppg.get(b.playerId) ?? 0) - (ppg.get(a.playerId) ?? 0) || a.name.localeCompare(b.name));
  const allStars = pickWithin(best, ALL_STAR_COUNT, ALL_STAR_LIMITS);
  const youngPool = [...best.filter(p => p.restricted), ...best.filter(p => !p.restricted)];
  return {
    allStars,
    captains: allStars.slice(0, 2),
    youngStars: pickWithin(youngPool, YOUNG_COUNT, YOUNG_LIMITS),
    youngCaptains: [],
  };
}

function groupProblems(label: string, ids: string[], count: number, limits: { min: number; max: number }, byId: Map<string, FbaPlayer>): string[] {
  const out: string[] = [];
  if (ids.length !== count) out.push(`Pick ${count} ${label} (have ${ids.length})`);
  if (new Set(ids).size !== ids.length) out.push(`${label}: someone is listed twice`);
  if (ids.some(id => !byId.has(id))) out.push(`${label}: everyone must be on an FBA roster`);
  for (const pos of POSITIONS) {
    const n = ids.filter(id => byId.get(id)?.position === pos).length;
    if (n < limits.min || n > limits.max) out.push(`${label}: ${pos} has ${n} (needs ${limits.min}–${limits.max})`);
  }
  return out;
}

export function selectionProblems(sel: AllStarSelections, list: FbaPlayer[], registry: PlayersFile): string[] {
  const byId = new Map(list.map(p => [p.playerId, p]));
  const out = [
    ...groupProblems('All-Stars', sel.allStars, ALL_STAR_COUNT, ALL_STAR_LIMITS, byId),
    ...groupProblems('Young-Stars', sel.youngStars, YOUNG_COUNT, YOUNG_LIMITS, byId),
  ];
  if (sel.captains.length !== 2 || new Set(sel.captains).size !== 2 || !sel.captains.every(c => sel.allStars.includes(c))) {
    out.push('Pick 2 ASG captains from the All-Stars');
  }
  const yc = sel.youngCaptains;
  if (yc.length !== 4 || new Set(yc).size !== 4 || yc.some(id => !registry.players[id] || sel.youngStars.includes(id))) {
    out.push('Pick 4 Young-Star captains who are not Young-Stars');
  }
  return out;
}

export function saveSelections(doc: AllStarFile | null, sel: AllStarSelections, season: number, list: FbaPlayer[], registry: PlayersFile): AllStarResult {
  if (doc?.asgDraft) return allStarFail(['Selections are locked once the All-Star draft starts']);
  const problems = selectionProblems(sel, list, registry);
  if (problems.length) return allStarFail(problems);
  return { ok: true, doc: { ...(doc ?? emptyAllStar(season)), selections: sel }, label: 'Save All-Star selections' };
}
```

- [ ] **Step 7: Create `web/engine/allstar/asgDraft.ts`**

```ts
import { randInt, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, Position } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';

export const ASG_PICKS = 26;

export function startAsgDraft(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.selections) return allStarFail(['Save the selections first']);
  if (doc.asgDraft) return allStarFail(['The All-Star draft has already started']);
  const first = randInt(rng, 0, 1) as 0 | 1;
  return { ok: true, doc: { ...doc, asgDraft: { first, picks: [] } }, label: 'Start All-Star draft (coin flip)' };
}

const teamOfPick = (first: 0 | 1, k: number): 0 | 1 => ((first + k) % 2) as 0 | 1;

/** Each team's members in draft order: its captain first, then its picks. */
export function asgTeams(doc: AllStarFile): [string[], string[]] {
  const captains = doc.selections?.captains ?? [];
  const teams: [string[], string[]] = [captains[0] ? [captains[0]] : [], captains[1] ? [captains[1]] : []];
  const d = doc.asgDraft;
  d?.picks.forEach((id, k) => teams[teamOfPick(d.first, k)].push(id));
  return teams;
}

export function asgOnClock(doc: AllStarFile): 0 | 1 | null {
  const d = doc.asgDraft;
  if (!d || d.picks.length >= ASG_PICKS) return null;
  return teamOfPick(d.first, d.picks.length);
}

/** Positions a team must still fill with its first 4 picks so captain + those picks are one per position. */
export function asgNeeds(doc: AllStarFile, team: 0 | 1, list: FbaPlayer[]): Position[] {
  const members = asgTeams(doc)[team];
  if (members.length >= 5) return [];
  const have = new Set(members.map(id => list.find(p => p.playerId === id)?.position));
  return POSITIONS.filter(p => !have.has(p));
}

export function asgAvailable(doc: AllStarFile, list: FbaPlayer[]): FbaPlayer[] {
  const team = asgOnClock(doc);
  if (team === null || !doc.selections) return [];
  const taken = new Set([...doc.selections.captains, ...(doc.asgDraft?.picks ?? [])]);
  const needs = asgNeeds(doc, team, list);
  return doc.selections.allStars
    .filter(id => !taken.has(id))
    .map(id => list.find(p => p.playerId === id)!)
    .filter(p => p && (needs.length === 0 || needs.includes(p.position)))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

export function asgPick(doc: AllStarFile, playerId: string, list: FbaPlayer[]): AllStarResult {
  if (asgOnClock(doc) === null) return allStarFail(['The All-Star draft is not open']);
  if (!asgAvailable(doc, list).some(p => p.playerId === playerId)) {
    return allStarFail(["That player can't be picked now (already taken, not an All-Star, or the team still needs a starter at another position)"]);
  }
  const d = doc.asgDraft!;
  return { ok: true, doc: { ...doc, asgDraft: { ...d, picks: [...d.picks, playerId] } }, label: `All-Star draft pick ${d.picks.length + 1}` };
}
```

- [ ] **Step 8: Create `web/engine/allstar/contestDraw.ts`**

```ts
import { shuffle, type Rng } from '../d2/random';
import type { AllStarFile } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';

export const CONTEST_SPOTS = { '5pt': 10, dunk: 4 } as const;
export type Contest = keyof typeof CONTEST_SPOTS;

export function startContestDraw(doc: AllStarFile, teamIds: string[], rng: Rng): AllStarResult {
  if (doc.contestDraw) return allStarFail(['The contest draw has already started']);
  return { ok: true, doc: { ...doc, contestDraw: { order: shuffle(teamIds, rng), turns: [] } }, label: 'Start contest draw' };
}

export function drawCounts(doc: AllStarFile): Record<Contest, number> {
  const turns = doc.contestDraw?.turns ?? [];
  return { '5pt': turns.filter(t => t.contest === '5pt').length, dunk: turns.filter(t => t.contest === 'dunk').length };
}

export function drawFilled(doc: AllStarFile): boolean {
  const c = drawCounts(doc);
  return c['5pt'] >= CONTEST_SPOTS['5pt'] && c.dunk >= CONTEST_SPOTS.dunk;
}

/** The team drawn next: first through the random order, then again through teams that have not sent anyone. */
export function drawOnClock(doc: AllStarFile): string | null {
  const draw = doc.contestDraw;
  if (!draw || drawFilled(doc)) return null;
  const sent = new Set<string>();
  let idx = 0;
  let pass = draw.order;
  for (;;) {
    for (const team of pass) {
      if (idx === draw.turns.length) return team;
      const t = draw.turns[idx++];
      if (t.playerId) sent.add(t.teamId);
    }
    pass = draw.order.filter(t => !sent.has(t));
    if (!pass.length) return null;
  }
}

export function contestTurn(doc: AllStarFile, choice: { contest: Contest; playerId: string } | null, list: FbaPlayer[]): AllStarResult {
  const team = drawOnClock(doc);
  if (!team || !doc.contestDraw) return allStarFail(['The contest draw is not open']);
  const d = doc.contestDraw;
  if (!choice) {
    return { ok: true, doc: { ...doc, contestDraw: { ...d, turns: [...d.turns, { teamId: team, contest: null, playerId: null }] } }, label: `Contest draw: ${team} passes` };
  }
  const player = list.find(p => p.playerId === choice.playerId && p.teamId === team);
  if (!player) return allStarFail([`That player is not on ${team}`]);
  if (drawCounts(doc)[choice.contest] >= CONTEST_SPOTS[choice.contest]) return allStarFail([`The ${choice.contest} contest is full`]);
  const what = choice.contest === '5pt' ? '5pt contest' : 'dunk contest';
  return {
    ok: true,
    doc: { ...doc, contestDraw: { ...d, turns: [...d.turns, { teamId: team, contest: choice.contest, playerId: choice.playerId }] } },
    label: `Contest draw: ${team} sends ${player.name} to the ${what}`,
  };
}

export function contestPlayers(doc: AllStarFile, contest: Contest): string[] {
  return (doc.contestDraw?.turns ?? []).filter(t => t.contest === contest && t.playerId).map(t => t.playerId!);
}
```

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npx vitest run engine/allstar && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/engine/allstar
git commit -m "feat: All-Star engine part 1 (dice roll-offs, selections, ASG draft, contest draw)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: All-Star engine, part 2: contests, the Young-Star tournament, the All-Star Game, steps and finishing

**Files:**
- Create: `web/engine/allstar/contests.ts`, `web/engine/allstar/youngStars.ts`, `web/engine/allstar/asgGame.ts`, `web/engine/allstar/steps.ts`
- Test: `web/engine/allstar/part2.test.ts`

**Interfaces:**
- Consumes:
  - `roll`, `total`, `rollOff` (Task 8)
  - `FbaPlayer`, `AllStarResult`, `allStarFail`
  - `asgTeams`, `ASG_PICKS`, `contestPlayers`, `drawFilled`
  - `SeasonState`, `blockingPause`, `seasonFail`, `SeasonResult`, `completePause` (Task 5)
  - `shuffle`, `POSITIONS`
- Produces, from `contests.ts`:
  - `CONTEST_CUTS = { '5pt': [5, 3, 1], dunk: [3, 2, 1] }`
  - `cutField(ids, totals, cut, rng)`
  - `runContest(players, cuts, rng): ContestResult`
  - `runFivePoint(doc, rng)`, with the label `Run the 5pt contest`
  - `runDunk(doc, rng)`, with the label `Run the dunk contest`
- Produces, from `youngStars.ts`:
  - `YSG_PICKS = 20`
  - `startYsgDraft(doc, rng)`, with the label `Start Young-Star draft`
  - `ysgTeamOf(order, k)`, `ysgOnClock(doc)`, `ysgTeams(doc): string[][]`, `ysgAvailable(doc, list)`
  - `ysgPick(doc, playerId, list)`, with the label `Young-Star draft pick N`
  - `teamGame(teams, members, periods, rollsPerPeriod, rng): TeamGame`
  - `runYoungStar(doc, rng)`, with the label `Run the Young-Star tournament`
- Produces, from `asgGame.ts`:
  - `asgLineups(members: { playerId; position }[]): { playerId: string; slot: Position }[][]` (per quarter)
  - `runAsg(doc, list, rng)`, with the label `Play the All-Star Game`
- Produces, from `steps.ts`:
  - `type AllStarStep = 'selections' | 'asgDraft' | 'contestDraw' | 'fivePoint' | 'dunk' | 'ysgDraft' | 'ysg' | 'asg' | 'wrapup' | 'done'`
  - `STEP_ORDER`, `STEP_LABEL`
  - `allStarStep(doc | null)`
  - `finishAllStar(state): SeasonResult`, with the label `Finish All-Star weekend`

- [ ] **Step 1: Write the failing tests**

Create `web/engine/allstar/part2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import type { SeasonState } from '../season/state';
import { fbaSeasonState } from '../season/testFixtures';
import { ASG_PICKS, asgAvailable, asgPick, asgTeams, startAsgDraft } from './asgDraft';
import { asgLineups, runAsg } from './asgGame';
import { type AllStarResult, fbaPlayers } from './common';
import { contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from './contestDraw';
import { cutField, runContest, runDunk, runFivePoint } from './contests';
import { saveSelections, suggestSelections } from './selection';
import { allStarStep, finishAllStar } from './steps';
import { allStarRosters } from './testFixtures';
import { runYoungStar, startYsgDraft, teamGame, ysgAvailable, ysgPick, ysgTeamOf, ysgTeams } from './youngStars';

const seq = (...xs: number[]): Rng => { let k = 0; return () => xs[k++ % xs.length]; };
const ok = (r: AllStarResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};
const fx = allStarRosters();
const list = fbaPlayers(fx.rosters, fx.players);

function throughStep(step: 'contests' | 'ysgDraft' | 'asg') {
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  let doc = ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
  doc = ok(startAsgDraft(doc, mulberry32(1)));
  for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
  doc = ok(startContestDraw(doc, fx.teamIds, mulberry32(2)));
  while (!drawFilled(doc)) {
    const team = drawOnClock(doc)!;
    const contest = drawCounts(doc)['5pt'] < 10 ? '5pt' : 'dunk';
    doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
  }
  if (step === 'contests') return doc;
  doc = ok(runFivePoint(doc, mulberry32(3)));
  doc = ok(runDunk(doc, mulberry32(4)));
  doc = ok(startYsgDraft(doc, mulberry32(5)));
  if (step === 'ysgDraft') return doc;
  for (let k = 0; k < 20; k++) doc = ok(ysgPick(doc, ysgAvailable(doc, list)[0].playerId, list));
  return doc;
}

describe('contests', () => {
  it('settles a tie at the cutoff with a roll-off', () => {
    const r = cutField(['a', 'b', 'c', 'd'], { a: 30, b: 20, c: 20, d: 10 }, 2, seq(0, 0, 0.99, 0.99));
    expect(r.advanced).toEqual(['a', 'c']);
    expect(r.rollOffs).toEqual([{ ids: ['b', 'c'], rounds: [{ b: [1, 1], c: [6, 6] }] }]);
    expect(cutField(['a', 'b', 'c'], { a: 3, b: 2, c: 1 }, 2, seq(0)).rollOffs).toEqual([]);
  });

  it('runs 10 → 5 → 3 → 1 with 3 rolls per round and running totals', () => {
    const players = Array.from({ length: 10 }, (_, k) => `p${String(20000 + k)}`);
    const res = runContest(players, [5, 3, 1], mulberry32(7));
    expect(res.rounds.map(r => r.players.length)).toEqual([10, 5, 3]);
    expect(res.rounds.map(r => r.advanced.length)).toEqual([5, 3, 1]);
    expect(res.winner).toBe(res.rounds[2].advanced[0]);
    for (const r of res.rounds) for (const id of r.players) expect(r.rolls[id]).toHaveLength(3);
    const w = res.winner;
    expect(res.rounds[2].totals[w]).toBeGreaterThan(res.rounds[1].totals[w]);
  });

  it('runs both contests from the draw', () => {
    const doc = throughStep('contests');
    const after = ok(runDunk(ok(runFivePoint(doc, mulberry32(1))), mulberry32(2)));
    expect(after.fivePoint!.rounds[0].players).toHaveLength(10);
    expect(after.dunk!.rounds.map(r => r.players.length)).toEqual([4, 3, 2]);
    expect(runFivePoint(after, mulberry32(1)).ok).toBe(false);
  });
});

describe('Young-Star tournament', () => {
  it('snakes the draft order', () => {
    const order = [2, 0, 3, 1];
    expect([0, 3, 4, 7, 8].map(k => ysgTeamOf(order, k))).toEqual([2, 1, 1, 2, 2]);
  });

  it('drafts 4 teams of 5 and plays semis and a final', () => {
    const doc = throughStep('asg');
    expect(ysgTeams(doc).map(t => t.length)).toEqual([5, 5, 5, 5]);
    const played = ok(runYoungStar(doc, mulberry32(9)));
    expect(played.ysg!.semis).toHaveLength(2);
    expect([played.ysg!.final.teams[0], played.ysg!.final.teams[1]]).toEqual(played.ysg!.semis.map(g => g.winner));
    expect(played.ysg!.champion).toBe(played.ysg!.final.winner);
    for (const g of [...played.ysg!.semis, played.ysg!.final]) {
      expect(g.rolls).toHaveLength(2);
      expect(g.rolls[0]).toHaveLength(20);
    }
  });

  it('breaks a tied game with a team roll-off', () => {
    const g = teamGame([0, 1], [['p00001'], ['p00002']], 1, 1, seq(0, 0, 0, 0, 0.99, 0.99, 0, 0));
    expect(g.scores).toEqual([2, 2]);
    expect(g.winner).toBe(0);
    expect(g.rollOff!.rounds).toEqual([{ 0: [6, 6], 1: [1, 1] }]);
  });
});

describe('All-Star Game', () => {
  const m = (id: string, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C') => ({ playerId: id, position });
  it('rotates each position by draft order, and slots extras into the nearest repeat', () => {
    const members = [
      m('p1', 'PG'), m('s1', 'SG'), m('f1', 'SF'), m('q1', 'PF'), m('c1', 'C'),
      m('s2', 'SG'), m('f2', 'SF'), m('f3', 'SF'), m('q2', 'PF'), m('q3', 'PF'), m('q4', 'PF'),
      m('c2', 'C'), m('c3', 'C'), m('c4', 'C'), m('c5', 'C'), m('c6', 'C'),
    ];
    const q = asgLineups(members).map(quarter => quarter.map(s => `${s.slot}:${s.playerId}`));
    expect(q[0]).toEqual(['PG:p1', 'SG:s1', 'SF:f1', 'PF:q1', 'C:c1']);
    expect(q[1]).toEqual(['PG:c6', 'SG:s2', 'SF:f2', 'PF:q2', 'C:c2']);
    expect(q[2]).toEqual(['PG:p1', 'SG:c5', 'SF:f3', 'PF:q3', 'C:c3']);
    expect(q[3]).toEqual(['PG:p1', 'SG:s1', 'SF:f1', 'PF:q4', 'C:c4']);
  });

  it('plays 4 quarters of 10 rolls and names an MVP from the winners', () => {
    const doc = ok(runAsg(throughStep('asg'), list, mulberry32(11)));
    const { game, mvp } = doc.asg!;
    expect(game.rolls).toHaveLength(4);
    for (const quarter of game.rolls) expect(quarter).toHaveLength(10);
    const winners = asgTeams(doc)[game.winner];
    expect(winners).toContain(mvp);
    if (!game.rollOff) expect(game.scores[game.winner]).toBeGreaterThan(game.scores[1 - game.winner]);
  });
});

describe('steps and finishing', () => {
  it('walks the steps in order', () => {
    expect(allStarStep(null)).toBe('selections');
    expect(allStarStep(throughStep('contests'))).toBe('fivePoint');
    expect(allStarStep(throughStep('ysgDraft'))).toBe('ysgDraft');
  });

  it('finishes only at wrap-up during the All-Star pause', () => {
    const s = fbaSeasonState();
    const games = Array.from({ length: 12 }, (_, k) => ({ gameNo: k + 1, home: 'BOS', away: 'CAR', homePts: 50, awayPts: 40 }));
    const paused: SeasonState = {
      ...s,
      results: { ...s.results!, games },
      schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map((p, i) => (i < 4 ? { ...p, done: true } : p)) },
    };
    expect(finishAllStar(paused)).toEqual({ ok: false, problems: ['Finish every All-Star event first'] });
    let doc = throughStep('asg');
    doc = ok(runYoungStar(doc, mulberry32(1)));
    doc = ok(runAsg(doc, list, mulberry32(2)));
    expect(allStarStep(doc)).toBe('wrapup');
    const r = finishAllStar({ ...paused, allstar: doc });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Finish All-Star weekend');
    expect(r.changed).toEqual(['allstar', 'schedule']);
    expect(r.state.allstar!.locked).toBe(true);
    expect(r.state.schedule!.pauses[4].done).toBe(true);
    expect(allStarStep(r.state.allstar)).toBe('done');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/allstar/part2.test.ts`
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Create `web/engine/allstar/contests.ts`**

```ts
import type { Rng } from '../d2/random';
import type { AllStarFile, ContestResult, ContestRound, Dice, RollOff } from '../shared/types';
import { allStarFail, type AllStarResult } from './common';
import { type Contest, contestPlayers, drawFilled } from './contestDraw';
import { roll, rollOff, total } from './dice';

export const CONTEST_CUTS: Record<Contest, number[]> = { '5pt': [5, 3, 1], dunk: [3, 2, 1] };

/** The top `cut` by total; a tie across the line is settled by a roll-off among the tied. */
export function cutField(ids: string[], totals: Record<string, number>, cut: number, rng: Rng): { advanced: string[]; rollOffs: RollOff[] } {
  const sorted = [...ids].sort((a, b) => totals[b] - totals[a]);
  if (sorted.length <= cut) return { advanced: sorted, rollOffs: [] };
  const line = totals[sorted[cut - 1]];
  if (totals[sorted[cut]] !== line) return { advanced: sorted.slice(0, cut), rollOffs: [] };
  const above = sorted.filter(id => totals[id] > line);
  const tied = sorted.filter(id => totals[id] === line);
  const r = rollOff(tied, rng);
  return { advanced: [...above, ...r.order.slice(0, cut - above.length)], rollOffs: [r.rollOff] };
}

/** Each round every remaining player rolls 3 times, added to a running total; `cuts` says how many survive each round. */
export function runContest(players: string[], cuts: number[], rng: Rng): ContestResult {
  const totals: Record<string, number> = Object.fromEntries(players.map(p => [p, 0]));
  let alive = [...players];
  const rounds: ContestRound[] = [];
  for (const cut of cuts) {
    const rolls: Record<string, Dice[]> = {};
    for (const p of alive) {
      rolls[p] = [roll(rng), roll(rng), roll(rng)];
      totals[p] += rolls[p].reduce((s, d) => s + total(d), 0);
    }
    const { advanced, rollOffs } = cutField(alive, totals, cut, rng);
    rounds.push({ players: alive, rolls, totals: Object.fromEntries(alive.map(p => [p, totals[p]])), advanced, rollOffs });
    alive = advanced;
  }
  return { rounds, winner: alive[0] };
}

function run(doc: AllStarFile, contest: Contest, rng: Rng): AllStarResult {
  if (!drawFilled(doc)) return allStarFail(['Finish the contest draw first']);
  if (contest === '5pt' ? doc.fivePoint : doc.dunk) return allStarFail([`The ${contest} contest has already been run`]);
  const result = runContest(contestPlayers(doc, contest), CONTEST_CUTS[contest], rng);
  return contest === '5pt'
    ? { ok: true, doc: { ...doc, fivePoint: result }, label: 'Run the 5pt contest' }
    : { ok: true, doc: { ...doc, dunk: result }, label: 'Run the dunk contest' };
}

export const runFivePoint = (doc: AllStarFile, rng: Rng) => run(doc, '5pt', rng);
export const runDunk = (doc: AllStarFile, rng: Rng) => run(doc, 'dunk', rng);
```

- [ ] **Step 4: Create `web/engine/allstar/youngStars.ts`**

```ts
import { shuffle, type Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, DiceRoll, TeamGame } from '../shared/types';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { roll, rollOff, total } from './dice';

export const YSG_PICKS = 20;

export function startYsgDraft(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.selections) return allStarFail(['Save the selections first']);
  if (doc.ysgDraft) return allStarFail(['The Young-Star draft has already started']);
  return { ok: true, doc: { ...doc, ysgDraft: { order: shuffle([0, 1, 2, 3], rng), picks: [] } }, label: 'Start Young-Star draft' };
}

/** Snake draft: even rounds follow `order`, odd rounds reverse it. */
export function ysgTeamOf(order: number[], k: number): number {
  const round = Math.floor(k / 4);
  const pos = k % 4;
  return round % 2 === 0 ? order[pos] : order[3 - pos];
}

export function ysgOnClock(doc: AllStarFile): number | null {
  const d = doc.ysgDraft;
  if (!d || d.picks.length >= YSG_PICKS) return null;
  return ysgTeamOf(d.order, d.picks.length);
}

export function ysgTeams(doc: AllStarFile): string[][] {
  const teams: string[][] = [[], [], [], []];
  const d = doc.ysgDraft;
  d?.picks.forEach((id, k) => teams[ysgTeamOf(d.order, k)].push(id));
  return teams;
}

/** Young-Stars not yet picked; limited to positions the team lacks when any such player is left. */
export function ysgAvailable(doc: AllStarFile, list: FbaPlayer[]): FbaPlayer[] {
  const team = ysgOnClock(doc);
  if (team === null || !doc.selections || !doc.ysgDraft) return [];
  const taken = new Set(doc.ysgDraft.picks);
  const left = doc.selections.youngStars.filter(id => !taken.has(id)).map(id => list.find(p => p.playerId === id)!).filter(Boolean);
  const have = new Set(ysgTeams(doc)[team].map(id => list.find(p => p.playerId === id)?.position));
  const lacking = POSITIONS.filter(p => !have.has(p));
  const fits = left.filter(p => lacking.includes(p.position));
  return (fits.length ? fits : left).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

export function ysgPick(doc: AllStarFile, playerId: string, list: FbaPlayer[]): AllStarResult {
  if (ysgOnClock(doc) === null) return allStarFail(['The Young-Star draft is not open']);
  if (!ysgAvailable(doc, list).some(p => p.playerId === playerId)) {
    return allStarFail(["That player can't be picked now (already taken, not a Young-Star, or the team still lacks another position)"]);
  }
  const d = doc.ysgDraft!;
  return { ok: true, doc: { ...doc, ysgDraft: { ...d, picks: [...d.picks, playerId] } }, label: `Young-Star draft pick ${d.picks.length + 1}` };
}

/** A dice game: each period, every player on each side rolls `rollsPerPeriod` times; a tie goes to a team roll-off. */
export function teamGame(teams: [number, number], members: string[][], periods: number, rollsPerPeriod: number, rng: Rng): TeamGame {
  const rolls: DiceRoll[][] = [];
  const scores: [number, number] = [0, 0];
  for (let p = 0; p < periods; p++) {
    const period: DiceRoll[] = [];
    teams.forEach((team, side) => {
      for (const playerId of members[team]) {
        for (let r = 0; r < rollsPerPeriod; r++) {
          const dice = roll(rng);
          period.push({ team, playerId, dice });
          scores[side] += total(dice);
        }
      }
    });
    rolls.push(period);
  }
  if (scores[0] !== scores[1]) return { teams, rolls, scores, rollOff: null, winner: scores[0] > scores[1] ? teams[0] : teams[1] };
  const r = rollOff([String(teams[0]), String(teams[1])], rng);
  return { teams, rolls, scores, rollOff: r.rollOff, winner: Number(r.order[0]) };
}

export function runYoungStar(doc: AllStarFile, rng: Rng): AllStarResult {
  if (!doc.ysgDraft || doc.ysgDraft.picks.length < YSG_PICKS) return allStarFail(['Finish the Young-Star draft first']);
  if (doc.ysg) return allStarFail(['The Young-Star tournament has already been played']);
  const members = ysgTeams(doc);
  const [a, b, c, d] = shuffle([0, 1, 2, 3], rng);
  const semis = [teamGame([a, b], members, 2, 2, rng), teamGame([c, d], members, 2, 2, rng)];
  const final = teamGame([semis[0].winner, semis[1].winner], members, 2, 2, rng);
  return { ok: true, doc: { ...doc, ysg: { semis, final, champion: final.winner } }, label: 'Run the Young-Star tournament' };
}
```

- [ ] **Step 5: Create `web/engine/allstar/asgGame.ts`**

```ts
import type { Rng } from '../d2/random';
import { POSITIONS } from '../roster/rules';
import type { AllStarFile, DiceRoll, Position, RollOff } from '../shared/types';
import { asgTeams } from './asgDraft';
import { allStarFail, type AllStarResult, type FbaPlayer } from './common';
import { roll, rollOff, total } from './dice';

const PATTERN: Record<number, number[]> = { 1: [0, 0, 0, 0], 2: [0, 1, 1, 0], 3: [0, 1, 2, 0] };

/**
 * Quarter lineups, one player per position, from a team's members in draft order (captain first).
 * Per position: 1 → 1,1,1,1; 2 → 1,2,2,1; 3 → 1,2,3,1; 4+ → 1,2,3,4. A 5th player at a position plays Q3,
 * and 6th+ play Q2, at the nearest position whose slot that quarter is a repeat (a player who also plays
 * another quarter there) or empty; among equally near positions, the one with fewer players, then the guard side.
 */
export function asgLineups(members: { playerId: string; position: Position }[]): { playerId: string; slot: Position }[][] {
  const byPos = POSITIONS.map(pos => members.filter(m => m.position === pos).map(m => m.playerId));
  const quarters: (string | null)[][] = [0, 1, 2, 3].map(() => POSITIONS.map(() => null));
  byPos.forEach((list, pi) => {
    if (!list.length) return;
    const pat = list.length >= 4 ? [0, 1, 2, 3] : PATTERN[list.length];
    for (let q = 0; q < 4; q++) quarters[q][pi] = list[pat[q]];
  });
  const count = (pi: number, id: string | null) => (id === null ? 0 : quarters.filter(qr => qr[pi] === id).length);
  const open = (q: number, pj: number) => quarters[q][pj] === null || count(pj, quarters[q][pj]) > 1;
  const extras = members
    .map(m => ({ ...m, pi: POSITIONS.indexOf(m.position), k: byPos[POSITIONS.indexOf(m.position)].indexOf(m.playerId) }))
    .filter(m => m.k >= 4);
  for (const x of extras) {
    const q = x.k === 4 ? 2 : 1;
    const candidates = POSITIONS.map((_, pj) => pj)
      .filter(pj => pj !== x.pi && open(q, pj))
      .sort((a, b) => Math.abs(a - x.pi) - Math.abs(b - x.pi) || byPos[a].length - byPos[b].length || a - b);
    if (candidates.length) quarters[q][candidates[0]] = x.playerId;
  }
  return quarters.map(qr => qr.flatMap((id, pi) => (id ? [{ playerId: id, slot: POSITIONS[pi] }] : [])));
}

export function runAsg(doc: AllStarFile, list: FbaPlayer[], rng: Rng): AllStarResult {
  if (!doc.ysg) return allStarFail(['Play the Young-Star tournament first']);
  if (doc.asg) return allStarFail(['The All-Star Game has already been played']);
  const teams = asgTeams(doc);
  const lineups = teams.map(ids => asgLineups(ids.map(id => ({ playerId: id, position: list.find(p => p.playerId === id)!.position }))));
  const rolls: DiceRoll[][] = [];
  const scores: [number, number] = [0, 0];
  const byPlayer = new Map<string, number>();
  for (let q = 0; q < 4; q++) {
    const period: DiceRoll[] = [];
    for (const team of [0, 1]) {
      for (const slot of lineups[team][q]) {
        const dice = roll(rng);
        period.push({ team, playerId: slot.playerId, dice });
        scores[team] += total(dice);
        byPlayer.set(slot.playerId, (byPlayer.get(slot.playerId) ?? 0) + total(dice));
      }
    }
    rolls.push(period);
  }
  let winner: number;
  let gameRollOff: RollOff | null = null;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else {
    const r = rollOff(['0', '1'], rng);
    winner = Number(r.order[0]);
    gameRollOff = r.rollOff;
  }
  const winners = teams[winner].filter(id => byPlayer.has(id));
  const best = Math.max(...winners.map(id => byPlayer.get(id)!));
  const top = winners.filter(id => byPlayer.get(id) === best);
  let mvp = top[0];
  let mvpRollOff: RollOff | null = null;
  if (top.length > 1) {
    const r = rollOff(top, rng);
    mvp = r.order[0];
    mvpRollOff = r.rollOff;
  }
  return {
    ok: true,
    doc: { ...doc, asg: { game: { teams: [0, 1], rolls, scores, rollOff: gameRollOff, winner }, mvp, mvpRollOff } },
    label: 'Play the All-Star Game',
  };
}
```

- [ ] **Step 6: Create `web/engine/allstar/steps.ts`**

```ts
import { completePause } from '../season/moves';
import { blockingPause, seasonFail, type SeasonResult, type SeasonState } from '../season/state';
import type { AllStarFile } from '../shared/types';
import { ASG_PICKS } from './asgDraft';
import { drawFilled } from './contestDraw';
import { YSG_PICKS } from './youngStars';

export type AllStarStep = 'selections' | 'asgDraft' | 'contestDraw' | 'fivePoint' | 'dunk' | 'ysgDraft' | 'ysg' | 'asg' | 'wrapup' | 'done';

export const STEP_ORDER: AllStarStep[] = ['selections', 'asgDraft', 'contestDraw', 'fivePoint', 'dunk', 'ysgDraft', 'ysg', 'asg', 'wrapup'];
export const STEP_LABEL: Record<AllStarStep, string> = {
  selections: 'Selections', asgDraft: 'ASG draft', contestDraw: 'Contest draw', fivePoint: '5pt contest', dunk: 'Dunk contest',
  ysgDraft: 'Young-Star draft', ysg: 'Young-Star tournament', asg: 'All-Star Game', wrapup: 'Wrap-up', done: 'Done',
};

export function allStarStep(doc: AllStarFile | null): AllStarStep {
  if (!doc?.selections) return 'selections';
  if (!doc.asgDraft || doc.asgDraft.picks.length < ASG_PICKS) return 'asgDraft';
  if (!drawFilled(doc)) return 'contestDraw';
  if (!doc.fivePoint) return 'fivePoint';
  if (!doc.dunk) return 'dunk';
  if (!doc.ysgDraft || doc.ysgDraft.picks.length < YSG_PICKS) return 'ysgDraft';
  if (!doc.ysg) return 'ysg';
  if (!doc.asg) return 'asg';
  return doc.locked ? 'done' : 'wrapup';
}

export function finishAllStar(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'allstar' || !state.schedule) return seasonFail(['The All-Star weekend is not up yet']);
  if (allStarStep(state.allstar) !== 'wrapup') return seasonFail(['Finish every All-Star event first']);
  return {
    ok: true,
    state: { ...state, allstar: { ...state.allstar!, locked: true }, schedule: completePause(state.schedule, 'allstar')! },
    changed: ['allstar', 'schedule'],
    label: 'Finish All-Star weekend',
  };
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run engine && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/engine/allstar
git commit -m "feat: All-Star engine part 2 (contests, Young-Star tournament, All-Star Game, steps)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Season data plumbing, league tabs, Schedules page, calendar routing

**Files:**
- Modify: `web/app/roster/commit.ts` (`commitDocs` and `commitMove` return the new versions)
- Create: `web/app/season/useSeasonState.ts`, `web/app/season/commitSeason.ts`, `web/app/season/testDocs.ts`
- Create: `web/app/components/LeagueTabs.tsx`, `web/app/pages/SchedulesPage.tsx`, `web/app/pages/SchedulesPage.test.tsx`, `web/app/pages/season.css`
- Modify: `web/app/stepRoutes.ts`, `web/app/stepRoutes.test.ts`, `web/app/pages/CalendarPage.tsx`, `web/app/pages/LeaguePage.tsx`, `web/app/pages/TransactionsPage.tsx`, `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes:
  - `SeasonState`, `seasonDocPath`, `seasonWrites`, `SeasonResult`, `nextPause`, `makeSchedules` (Tasks 5)
  - `useDoc`, `Versions`, `DocState`, `useSaving`
  - `commitDocs`
  - `stubApi` and `META` from `app/d2/testDocs`
- Produces:
  - `commitDocs(...)` and `commitMove(...)` now resolve to `Record<string, string>`, the versions the server returned.
  - `useSeasonState(league: SeasonLeague | null): { state?: SeasonState; versions: Versions; error?: Error }`. Its `versions` cover the rosters, calendar, tx, schedule, results, allstar (FBA) and current rating-pause paths.
  - `commitSeason(result, versions): Promise<Record<string, string>>`
  - `seasonDocs(state): Record<string, unknown>` (test helper)
  - `<LeagueTabs league />`
  - `toolTarget(step): string | null`
  - `/schedules`

- [ ] **Step 1: Write the failing tests**

Create `web/app/pages/SchedulesPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { d2SeasonState, fbaSeasonState } from '../../engine/season/testFixtures';
import { META, stubApi } from '../d2/testDocs';
import { SchedulesPage } from './SchedulesPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function docs(withSchedules: boolean): Record<string, unknown> {
  const f = fbaSeasonState();
  const d = d2SeasonState();
  const out: Record<string, unknown> = {
    'meta.json': META,
    'calendar.json': { ...f.calendar, steps: f.calendar.steps.map(s => ({ ...s, done: false })) },
    'leagues/fba/teams.json': f.teams,
    'leagues/fbad2/teams.json': d.teams,
  };
  if (withSchedules) {
    out['leagues/fba/S79/schedule.json'] = f.schedule;
    out['leagues/fba/S79/results.json'] = f.results;
    out['leagues/fbad2/S79/schedule.json'] = d.schedule;
    out['leagues/fbad2/S79/results.json'] = d.results;
  }
  return out;
}

describe('SchedulesPage', () => {
  it('makes both schedules as one batch', async () => {
    const log = stubApi(docs(false));
    render(<MemoryRouter><SchedulesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Make schedules' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Make schedules');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fba/S79/schedule.json', null], ['leagues/fba/S79/results.json', null],
      ['leagues/fbad2/S79/schedule.json', null], ['leagues/fbad2/S79/results.json', null],
      ['calendar.json', '0000000000000001'],
    ]);
  });

  it('shows existing schedules and offers a re-roll', async () => {
    stubApi(docs(true));
    render(<MemoryRouter><SchedulesPage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Re-roll schedules' })).toBeTruthy();
    expect(screen.getByText(/FBA: 16 games/)).toBeTruthy();
  });
});
```

Replace `web/app/stepRoutes.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { stepTarget, TOOL_STEPS, toolTarget } from './stepRoutes';

const step = (id: string, kind: 'offseason' | 'league' = 'offseason', league: 'fba' | 'fbad2' | 'fbajc' | null = null) =>
  ({ id, label: id, kind, league, sub: false, done: false });

describe('step routes', () => {
  it('opens the D2 tools from their calendar steps', () => {
    expect(TOOL_STEPS['fbad2-ratings-reset']).toBe('/league/fbad2/ratings');
    expect(TOOL_STEPS['fbad2-draft']).toBe('/league/fbad2/draft');
  });
  it('routes schedules and season play to their pages', () => {
    expect(toolTarget(step('make-s79-schedules'))).toBe('/schedules');
    expect(toolTarget(step('fba-d2', 'league', 'fbad2'))).toBe('/league/fbad2/scores');
    expect(toolTarget(step('fba', 'league', 'fba'))).toBe('/league/fba/scores');
    expect(toolTarget(step('retirement'))).toBeNull();
    expect(stepTarget(step('fbajc', 'league', 'fbajc'))).toBe('/league/fbajc');
    expect(stepTarget(step('retirement'))).toBe('/calendar');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/SchedulesPage.test.tsx app/stepRoutes.test.ts`
Expected: FAIL (the modules and exports are missing).

- [ ] **Step 3: `commitDocs` returns versions**

In `web/app/roster/commit.ts`, change the two functions to return the batch's versions:

```ts
export async function commitDocs(label: string, docs: { path: string; doc: unknown }[], versions: Versions): Promise<Record<string, string>> {
  const writes = docs.map(d => {
    if (!(d.path in versions)) throw new Error(`No loaded version for ${d.path}; reload the page`);
    return { path: d.path, doc: d.doc, baseVersion: versions[d.path] };
  });
  return (await postBatch(label, writes)).versions;
}

export async function commitMove(result: Extract<MoveResult, { ok: true }>, versions: Versions, extra: { path: string; doc: unknown }[] = []): Promise<Record<string, string>> {
  const writes = result.changed.map(k => ({ path: docPath(k, result.state.season), doc: result.state[k] }));
  return commitDocs(result.label, [...writes, ...extra], versions);
}
```

- [ ] **Step 4: Create the season hooks and helpers**

`web/app/season/useSeasonState.ts`:

```ts
import type { SeasonLeague } from '../../engine/season/schedule';
import { nextPause, seasonDocPath, type SeasonDocKey, type SeasonState } from '../../engine/season/state';
import type {
  AllStarFile, CalendarFile, MetaFile, PlayersFile, RatingPauseFile, ResultsFile, RostersFile, ScheduleFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/** Loads one league's season docs plus the version of every doc a season move may write. */
export function useSeasonState(league: SeasonLeague | null): { state?: SeasonState; versions: Versions; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const on = league !== null && season !== undefined;
  const at = (key: SeasonDocKey) => (on ? seasonDocPath(key, league, season) : null);
  const teams = useDoc<TeamsFile>(league ? `leagues/${league}/teams.json` : null);
  const rosters = useDoc<RostersFile>(at('rosters'));
  const players = useDoc<PlayersFile>(on ? 'players.json' : null);
  const calendar = useDoc<CalendarFile>(at('calendar'));
  const tx = useDoc<TransactionsFile>(at('tx'));
  const schedule = useDoc<ScheduleFile>(at('schedule'));
  const results = useDoc<ResultsFile>(at('results'));
  const allstar = useDoc<AllStarFile>(on && league === 'fba' ? seasonDocPath('allstar', 'fba', season) : null);
  const pause = league === 'fba' ? nextPause(schedule.data ?? null) : null;
  const pausePath = on && pause?.kind === 'ratings' ? seasonDocPath('ratingPause', 'fba', season, pause.afterGame) : null;
  const ratingPause = useDoc<RatingPauseFile>(pausePath);

  const versions: Versions = {};
  if (on) {
    const keyed: [SeasonDocKey, DocState<unknown>][] = [['rosters', rosters], ['calendar', calendar], ['tx', tx], ['schedule', schedule], ['results', results]];
    for (const [k, d] of keyed) versions[seasonDocPath(k, league, season)] = d.version;
    if (league === 'fba') versions[seasonDocPath('allstar', 'fba', season)] = allstar.version;
    if (pausePath) versions[pausePath] = ratingPause.version;
  }

  const required: DocState<unknown>[] = [meta, teams, rosters, players, calendar, tx];
  const optional: DocState<unknown>[] = [schedule, results, ...(league === 'fba' ? [allstar] : []), ...(pausePath ? [ratingPause] : [])];
  const error = required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (!on || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { versions, error };
  return {
    versions,
    state: {
      league, season,
      teams: teams.data!, rosters: rosters.data!, players: players.data!, calendar: calendar.data!, tx: tx.data!,
      schedule: schedule.data ?? null, results: results.data ?? null,
      ratingPause: ratingPause.data ?? null, allstar: allstar.data ?? null,
    },
  };
}
```

`web/app/season/commitSeason.ts`:

```ts
import { seasonWrites, type SeasonResult } from '../../engine/season/state';
import type { Versions } from '../api';
import { commitDocs } from '../roster/commit';

export function commitSeason(result: Extract<SeasonResult, { ok: true }>, versions: Versions): Promise<Record<string, string>> {
  return commitDocs(result.label, seasonWrites(result), versions);
}
```

`web/app/season/testDocs.ts`:

```ts
import { seasonDocPath, type SeasonState } from '../../engine/season/state';
import { META } from '../d2/testDocs';

/** Every doc the season pages load for this state (missing optional docs are left out → 404). */
export function seasonDocs(state: SeasonState): Record<string, unknown> {
  const { league, season } = state;
  const out: Record<string, unknown> = {
    'meta.json': META,
    'players.json': state.players,
    'calendar.json': state.calendar,
    [`leagues/${league}/teams.json`]: state.teams,
    [seasonDocPath('rosters', league, season)]: state.rosters,
    [seasonDocPath('tx', league, season)]: state.tx,
  };
  if (state.schedule) out[seasonDocPath('schedule', league, season)] = state.schedule;
  if (state.results) out[seasonDocPath('results', league, season)] = state.results;
  if (state.allstar) out[seasonDocPath('allstar', 'fba', season)] = state.allstar;
  if (state.ratingPause) out[seasonDocPath('ratingPause', 'fba', season, state.ratingPause.afterGame)] = state.ratingPause;
  return out;
}
```

- [ ] **Step 5: Create `web/app/components/LeagueTabs.tsx`**

```tsx
import { NavLink } from 'react-router-dom';

/** Scores · Standings · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
export function LeagueTabs({ league }: { league: string }) {
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['', 'Teams'], ['transactions', 'Transactions']]
    : [['', 'Teams']];
  return (
    <nav className="league-tabs" aria-label="League sections">
      {tabs.map(([path, label]) => (
        <NavLink key={label} end to={path ? `/league/${league}/${path}` : `/league/${league}`}>{label}</NavLink>
      ))}
    </nav>
  );
}
```

Render `<LeagueTabs league={league} />` in `LeaguePage.tsx`, right after its `.league-head` div, and remove the old `Transactions` button from `.league-links`, since the tab replaces it. In `TransactionsPage.tsx`, render it right after the `<h1>`, and import it from `'../components/LeagueTabs'` in both files. `LeaguePage.test.tsx` should still find exactly one `Transactions` link.

- [ ] **Step 6: Create `web/app/pages/SchedulesPage.tsx`**

```tsx
import { useState } from 'react';
import { makeSchedules } from '../../engine/season/moves';
import { gameDays } from '../../engine/season/schedule';
import type { CalendarFile, MetaFile, ResultsFile, ScheduleFile, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { commitDocs } from '../roster/commit';
import './season.css';

const LABEL = { fba: 'FBA', fbad2: 'D2' } as const;

export function SchedulesPage() {
  const saving = useSaving();
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const season = meta?.currentSeason;
  const p = (league: 'fba' | 'fbad2', doc: string) => (season === undefined ? null : `leagues/${league}/S${season}/${doc}.json`);
  const cal = useDoc<CalendarFile>('calendar.json');
  const fbaTeams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const d2Teams = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  const fbaSched = useDoc<ScheduleFile>(p('fba', 'schedule'));
  const fbaRes = useDoc<ResultsFile>(p('fba', 'results'));
  const d2Sched = useDoc<ScheduleFile>(p('fbad2', 'schedule'));
  const d2Res = useDoc<ResultsFile>(p('fbad2', 'results'));
  const [message, setMessage] = useState('');

  const optional = [fbaSched, fbaRes, d2Sched, d2Res];
  if (season === undefined || !cal.data || !fbaTeams.data || !d2Teams.data || optional.some(d => !d.data && !d.missing)) {
    return <p className="muted">Loading…</p>;
  }
  const leagues = [
    { league: 'fba' as const, teams: fbaTeams.data, schedule: fbaSched.data ?? null, results: fbaRes.data ?? null },
    { league: 'fbad2' as const, teams: d2Teams.data, schedule: d2Sched.data ?? null, results: d2Res.data ?? null },
  ];
  const played = leagues.reduce((n, l) => n + (l.results?.games.length ?? 0), 0);
  const exists = leagues.some(l => l.schedule);

  const make = async () => {
    const r = makeSchedules({
      season, calendar: cal.data!,
      fba: { teams: leagues[0].teams, schedule: leagues[0].schedule, results: leagues[0].results },
      fbad2: { teams: leagues[1].teams, schedule: leagues[1].schedule, results: leagues[1].results },
    }, Math.random);
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    const versions: Versions = {
      [p('fba', 'schedule')!]: fbaSched.version, [p('fba', 'results')!]: fbaRes.version,
      [p('fbad2', 'schedule')!]: d2Sched.version, [p('fbad2', 'results')!]: d2Res.version,
      'calendar.json': cal.version,
    };
    setMessage('');
    try {
      await commitDocs(r.label, r.writes, versions);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <section>
      <h1>S{season} schedules</h1>
      {leagues.map(l => {
        const perTeam = l.schedule && l.teams.teams.length ? (l.schedule.games.length * 2) / l.teams.teams.length : 0;
        const days = l.schedule ? gameDays(l.schedule.games) : [];
        return (
          <div className="card schedule-card" key={l.league}>
            <h3>{LABEL[l.league]}</h3>
            {l.schedule
              ? <p>{LABEL[l.league]}: {l.schedule.games.length} games · {perTeam} per team · {days.length} game days · {l.results?.games.length ?? 0} played</p>
              : <p className="muted">{LABEL[l.league]}: not made yet</p>}
            {l.schedule && days[0] && (
              <p className="muted">Day 1: {days[0].map(n => `${l.schedule!.games[n - 1].away} @ ${l.schedule!.games[n - 1].home}`).join(' · ')}</p>
            )}
          </div>
        );
      })}
      <button className="btn primary" disabled={saving || played > 0} onClick={make}>{exists ? 'Re-roll schedules' : 'Make schedules'}</button>
      {played > 0 && <p className="muted">Games have been played, so the schedules can't be re-rolled.</p>}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
```

`web/app/pages/season.css`:

```css
.league-tabs { display: flex; gap: 4px; margin: 4px 0 14px; border-bottom: 1px solid var(--border); }
.league-tabs a { padding: 6px 12px; font-weight: 700; color: var(--muted); border-bottom: 2px solid transparent; }
.league-tabs a.active { color: var(--text); border-bottom-color: var(--accent); }
.schedule-card { margin-bottom: 10px; }
.sim-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
.sim-controls label { display: flex; gap: 6px; align-items: center; font-weight: 600; }
.sim-progress { display: flex; gap: 6px; align-items: center; }
.day-strip { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.game-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.game-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
.game-card.next { border-color: var(--accent); }
.game-status { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.team-line { display: grid; grid-template-columns: 26px 1fr auto 34px; gap: 6px; align-items: center; padding: 2px 0; }
.team-line.won { font-weight: 800; }
.team-line .rec { color: var(--muted); font-size: 12px; }
.team-line .pts { text-align: right; font-variant-numeric: tabular-nums; }
.game-links { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.pause-card { border: 2px solid var(--accent); margin: 10px 0; }
.scorebug { display: flex; justify-content: center; align-items: center; gap: 16px; background: #111; color: #fff; border-radius: 8px; padding: 10px 16px; font-weight: 800; }
.scorebug .score { font-size: 28px; font-variant-numeric: tabular-nums; }
.scorebug .clock { font-size: 12px; color: #d1d5db; text-align: center; }
.live-grid { display: grid; grid-template-columns: minmax(260px, 1.2fr) minmax(240px, 1fr); gap: 10px; margin-top: 10px; }
@media (max-width: 760px) { .live-grid { grid-template-columns: 1fr; } }
.pbp { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow: auto; }
.pbp li { padding: 4px 0; border-bottom: 1px solid var(--border); }
.pbp li.clutch { font-weight: 700; }
.standings td.marker { width: 18px; font-weight: 800; color: var(--accent); }
.standings tr.playoff-line td { border-bottom: 2px solid var(--accent); }
.step-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.step-bar button { border: 1px solid var(--border); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 4px 10px; font-weight: 700; }
.step-bar button.done { color: var(--good); }
.step-bar button.on { background: var(--text); color: var(--surface); border-color: var(--text); }
.dice { display: inline-block; min-width: 18px; border: 1.5px solid var(--text); border-radius: 4px; text-align: center; font-weight: 800; margin-right: 2px; }
.reveal-lines { list-style: none; padding: 0; margin: 8px 0; max-height: 420px; overflow: auto; }
.reveal-lines li { padding: 3px 0; border-bottom: 1px solid var(--border); }
.reveal-lines li.group { font-weight: 800; color: var(--muted); border-bottom: 0; padding-top: 8px; }
```

- [ ] **Step 7: Calendar routing**

Replace `web/app/stepRoutes.ts` with:

```ts
import type { CalendarStep } from '../engine/shared/types';

/** Calendar steps that have their own tool page; the tool completes the step instead of "Mark done". */
export const TOOL_STEPS: Record<string, string> = {
  'free-agency-offseason': '/league/fba/free-agency',
  'fbad2-ratings-reset': '/league/fbad2/ratings',
  'fbad2-draft': '/league/fbad2/draft',
};

/** The page that completes this step, or null when it is still a manual "Mark done" step. */
export function toolTarget(step: CalendarStep): string | null {
  if (TOOL_STEPS[step.id]) return TOOL_STEPS[step.id];
  if (/^make-s\d+-schedules$/.test(step.id)) return '/schedules';
  if (step.kind === 'league' && (step.league === 'fba' || step.league === 'fbad2')) return `/league/${step.league}/scores`;
  return null;
}

export function stepTarget(step: CalendarStep): string {
  const tool = toolTarget(step);
  if (tool) return tool;
  if (step.kind === 'league' && step.league) return `/league/${step.league}`;
  return '/calendar';
}
```

In `web/app/pages/CalendarPage.tsx`:
- Replace the `TOOL_STEPS` import with `toolTarget`.
- Add `const tool = i >= 0 ? toolTarget(cal.steps[i]) : null;` after `const i = …`.
- Change the two conditions to `{tool && (<Link className="btn primary" to={tool}>Open {cal.steps[i].label} ▸</Link>)}` and `{i >= 0 && !tool && (…Mark done…)}`.

In `web/app/shell/Layout.tsx`, import `SchedulesPage` and add `<Route path="/schedules" element={<SchedulesPage />} />`.

- [ ] **Step 8: Run the full suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. If an existing Calendar or Home test asserted "Mark done" for a league step, update it: league steps for the FBA and D2 now open their Scores page.

- [ ] **Step 9: Commit**

```bash
git add web/app
git commit -m "feat: season data hook, league tabs, schedules page, calendar routing for season steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Scores page (game days, quick-sim, sim to…, pause cards)

**Files:**
- Create: `web/app/pages/ScoresPage.tsx`, `web/app/pages/ScoresPage.test.tsx`
- Modify: `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes:
  - `useSeasonState`, `commitSeason`, `seasonDocs` (Task 10)
  - `simNextGames`, `recordGames`, `closeTradeDeadline` (Task 5)
  - `gameDays` (Task 3), `records` (Task 4)
  - `blockingPause`, `gamesPlayed`, `nextPause`, `PAUSE_LABEL`, `playerName`, `seasonOver`
  - `TeamMark`, `LeagueTabs`
- Produces: the route `/league/:league/scores`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/pages/ScoresPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonState } from '../../engine/season/state';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import type { ResultsFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { ScoresPage } from './ScoresPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/scores" element={<ScoresPage />} /></Routes>
  </MemoryRouter>,
);

function atDeadline(): SeasonState {
  const s = fbaSeasonState();
  const games = s.schedule!.games.slice(0, 8).map(g => ({ gameNo: g.gameNo, home: g.home, away: g.away, homePts: 60, awayPts: 50 }));
  return {
    ...s,
    results: { ...s.results!, games },
    schedule: { ...s.schedule!, pauses: s.schedule!.pauses.map((p, i) => (i < 2 ? { ...p, done: true } : p)) },
  };
}

describe('ScoresPage', () => {
  it('asks for schedules first', async () => {
    stubApi(seasonDocs({ ...fbaSeasonState(), schedule: null, results: null }));
    renderAt('/league/fba/scores');
    expect(await screen.findByText(/No schedule yet/)).toBeTruthy();
  });

  it('shows the next game and quick-sims it as one batch', async () => {
    const log = stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/scores');
    expect(await screen.findByText('Game 1 · Next')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quick-sim next game' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Game 1: /);
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/results.json', 'leagues/fba/S79/rosters.json']);
  });

  it('sims to the next pause day by day, then shows the pause card', async () => {
    const docs = seasonDocs(fbaSeasonState());
    const log = stubApi(docs);
    renderAt('/league/fba/scores');
    fireEvent.click(await screen.findByRole('button', { name: 'Sim' }));
    expect(await screen.findByText('Pause after game 4: rating adjustment')).toBeTruthy();
    expect((docs['leagues/fba/S79/results.json'] as ResultsFile).games).toHaveLength(4);
    expect(log.batches.length).toBeGreaterThanOrEqual(1);
    expect((screen.getByRole('button', { name: 'Quick-sim next game' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes trading at the deadline pause', async () => {
    const log = stubApi(seasonDocs(atDeadline()));
    renderAt('/league/fba/scores');
    fireEvent.click(await screen.findByRole('button', { name: 'Close trading' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Close trading (trade deadline)');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/schedule.json']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/ScoresPage.test.tsx`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Create `web/app/pages/ScoresPage.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { closeTradeDeadline, recordGames, simNextGames } from '../../engine/season/moves';
import { gameDays } from '../../engine/season/schedule';
import { records } from '../../engine/season/standings';
import {
  blockingPause, gamesPlayed, nextPause, PAUSE_LABEL, playerName, seasonOver, type SeasonResult, type SeasonState,
} from '../../engine/season/state';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { Team } from '../../engine/shared/types';
import { useSaving, type Versions } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

type Target = 'next' | 'day' | 'pause' | 'season' | number;

function TeamLine({ team, rec, pts, won, season }: { team: Team; rec: string; pts: number | null; won: boolean; season: number }) {
  return (
    <div className={`team-line${won ? ' won' : ''}`}>
      <TeamMark team={team} season={season} size={22} />
      <span>{team.abbr}</span>
      <span className="rec">{rec}</span>
      <span className="pts">{pts ?? ''}</span>
    </div>
  );
}

export function ScoresPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const [day, setDay] = useState<number | null>(null);
  const [simTo, setSimTo] = useState('pause');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const stop = useRef(false);

  if (!lg) return <p className="error">Scores are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} scores · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) {
    return <section>{header}<p className="muted">No schedule yet. <Link to="/schedules">Make schedules ▸</Link></p></section>;
  }
  const schedule = state.schedule;
  const days = gameDays(schedule.games);
  const played = gamesPlayed(state);
  const currentDay = days.findIndex(d => d.includes(played + 1));
  const shownDay = Math.max(0, Math.min(day ?? (currentDay >= 0 ? currentDay : days.length - 1), days.length - 1));
  const pause = blockingPause(state);
  const over = seasonOver(state);
  const byTeam = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results.games);
  const rec = (id: string) => {
    const r = recs.get(id);
    return r ? `${r.w}-${r.l}` : '';
  };
  const busy = saving || progress !== null;
  const blocked = busy || !!pause || over;
  const lastOfDay = (d: number) => days[d][days[d].length - 1];
  const upcoming = nextPause(schedule);

  const stopFor = (t: Target): number => {
    if (t === 'next') return played + 1;
    if (t === 'day') return currentDay >= 0 ? lastOfDay(currentDay) : played;
    if (t === 'pause') return upcoming ? upcoming.afterGame : schedule.games.length;
    if (t === 'season') return schedule.games.length;
    return lastOfDay(t);
  };

  const sim = async (t: Target) => {
    const target = stopFor(t);
    let s: SeasonState = state;
    let v: Versions = versions;
    stop.current = false;
    setMessage('');
    const start = gamesPlayed(s);
    const total = Math.max(0, target - start);
    setProgress({ done: 0, total });
    try {
      while (!stop.current && gamesPlayed(s) < target) {
        const at = gamesPlayed(s);
        const d = days.findIndex(x => x.includes(at + 1));
        if (d < 0) break;
        const { games, problem } = simNextGames(s, Math.min(lastOfDay(d), target) - at, Math.random);
        if (problem) {
          setMessage(problem);
          break;
        }
        if (!games.length) break;
        const result = recordGames(s, games);
        if (!result.ok) {
          setMessage(result.problems.join('; '));
          break;
        }
        v = { ...v, ...(await commitSeason(result, v)) };
        s = result.state;
        setProgress({ done: gamesPlayed(s) - start, total });
      }
    } catch (e) {
      setMessage(`${(e as Error).message} (stopped after game ${gamesPlayed(s)})`);
    } finally {
      setProgress(null);
    }
  };

  const commit = async (r: SeasonResult) => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    try {
      await commitSeason(r, versions);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <section>
      {header}
      {over && <p className="muted">The regular season is complete.</p>}
      {pause && (
        <div className="card pause-card">
          <h3>Pause after game {pause.afterGame}: {PAUSE_LABEL[pause.kind]}</h3>
          {pause.kind === 'ratings' && <Link className="btn primary" to="/league/fba/ratings-pause">Adjust ratings ▸</Link>}
          {pause.kind === 'deadline' && (
            <>
              <p className="muted">Make any last trades, then close trading for the season.</p>
              <Link className="btn" to="/trade/fba">Trade page</Link>{' '}
              <button className="btn primary" disabled={busy} onClick={() => commit(closeTradeDeadline(state))}>Close trading</button>
            </>
          )}
          {pause.kind === 'allstar' && <Link className="btn primary" to="/league/fba/all-star">All-Star weekend ▸</Link>}
        </div>
      )}
      <div className="sim-controls">
        <button className="btn" disabled={blocked} onClick={() => sim('next')}>Quick-sim next game</button>
        <button className="btn" disabled={blocked} onClick={() => sim('day')}>Sim rest of day</button>
        <label>Sim to
          <select aria-label="Sim to" value={simTo} onChange={e => setSimTo(e.target.value)}>
            <option value="pause">{upcoming ? `the next pause (after game ${upcoming.afterGame})` : 'the end of the regular season'}</option>
            <option value="season">the end of the regular season</option>
            {days.map((_, d) => (d >= Math.max(currentDay, 0) ? <option key={d} value={String(d)}>the end of day {d + 1}</option> : null))}
          </select>
        </label>
        <button className="btn primary" disabled={blocked} onClick={() => sim(simTo === 'pause' || simTo === 'season' ? simTo : Number(simTo))}>Sim</button>
        {progress && (
          <span className="sim-progress">
            <progress max={progress.total || 1} value={progress.done} /> {progress.done}/{progress.total}
            <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>
          </span>
        )}
      </div>
      {message && <p className="error">{message}</p>}
      <div className="day-strip">
        <button className="btn" aria-label="Previous day" disabled={shownDay === 0} onClick={() => setDay(shownDay - 1)}>‹</button>
        <strong>Day {shownDay + 1} of {days.length}</strong>
        <button className="btn" aria-label="Next day" disabled={shownDay >= days.length - 1} onClick={() => setDay(shownDay + 1)}>›</button>
        {currentDay >= 0 && shownDay !== currentDay && <button className="btn" onClick={() => setDay(null)}>Today</button>}
      </div>
      <div className="game-cards">
        {(days[shownDay] ?? []).map(n => {
          const g = schedule.games[n - 1];
          const r = state.results!.games[n - 1];
          const home = byTeam.get(g.home);
          const away = byTeam.get(g.away);
          if (!home || !away) return null;
          const isNext = !r && n === played + 1;
          const status = r ? `Final${r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}` : isNext ? 'Next' : 'Upcoming';
          const lines = r?.box ? [...r.box.home, ...r.box.away] : [];
          const top = lines.length ? lines.reduce((a, b) => (b.pts > a.pts ? b : a)) : null;
          return (
            <div key={n} className={`game-card${isNext ? ' next' : ''}`}>
              <div className="game-status">Game {n} · {status}</div>
              <TeamLine team={away} rec={rec(away.teamId)} pts={r ? r.awayPts : null} won={!!r && r.awayPts > r.homePts} season={state.season} />
              <TeamLine team={home} rec={rec(home.teamId)} pts={r ? r.homePts : null} won={!!r && r.homePts > r.awayPts} season={state.season} />
              {top && <div className="muted">Top: {playerName(state, top.playerId)} {top.pts}</div>}
              <div className="game-links">
                {r && <Link to={`/league/${lg}/game/${n}`}>Box score</Link>}
                {isNext && !pause && <Link to={`/league/${lg}/game/${n}`}>Watch</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, import `ScoresPage` and add `<Route path="/league/:league/scores" element={<ScoresPage />} />`.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run app/pages/ScoresPage.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app
git commit -m "feat: scores page with game days, quick-sim, sim-to, and pause cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Live game and box score page

**Files:**
- Create: `web/app/pages/GamePage.tsx`, `web/app/pages/GamePage.test.tsx`
- Modify: `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes:
  - `useSeasonState`, `commitSeason`, `seasonDocs`
  - `lineup`, `recordGames` (Task 5)
  - `simGame`, `winProbability`, `periodOf`, `SimGame`, `Possession` (Task 2)
  - `blockingPause`, `gamesPlayed`, `playerName`
- Produces: the route `/league/:league/game/:gameNo`.
  - For the next game (with no pause due), it plays live and saves at the end.
  - For a played game, it shows the box score.
  - Otherwise it explains why the game can't be shown.

- [ ] **Step 1: Write the failing tests**

Create `web/app/pages/GamePage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { recordGames, simNextGames } from '../../engine/season/moves';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { GamePage } from './GamePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/game/:gameNo" element={<GamePage />} /></Routes>
  </MemoryRouter>,
);

describe('GamePage', () => {
  it('plays the next game live and saves it at the final buzzer', async () => {
    const log = stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/game/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Next possession' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Game 1: /);
    expect(await screen.findByText(/Final/)).toBeTruthy();
  });

  it('shows a box score for a played game', async () => {
    const s = fbaSeasonState();
    const r = recordGames(s, simNextGames(s, 1, mulberry32(4)).games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    stubApi(seasonDocs(r.state));
    renderAt('/league/fba/game/1');
    expect(await screen.findByText(/^Final/)).toBeTruthy();
    const g = r.state.results!.games[0];
    expect(screen.getAllByText(`${g.home} PG`).length).toBeGreaterThan(0);
  });

  it('explains a game that is not up next', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderAt('/league/fba/game/3');
    expect(await screen.findByText("This game isn't up next.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/GamePage.test.tsx`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Create `web/app/pages/GamePage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lineup, recordGames } from '../../engine/season/moves';
import { type Possession, simGame, type SimGame, winProbability } from '../../engine/season/sim';
import { blockingPause, gamesPlayed, playerName, type SeasonState } from '../../engine/season/state';
import type { GameResult } from '../../engine/shared/types';
import { useSaving } from '../api';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

const SPEED_MS = { slow: 700, normal: 250, fast: 40 } as const;
const CLUTCH_MS = 1200;
const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

function LineScore({ home, away, periods }: { home: string; away: string; periods: { home: number[]; away: number[] } }) {
  return (
    <table className="line-score">
      <thead><tr><th></th>{periods.home.map((_, i) => <th key={i} className="n">{periodName(i + 1)}</th>)}<th className="n">T</th></tr></thead>
      <tbody>
        <tr><td>{away}</td>{periods.away.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.away.reduce((a, b) => a + b, 0)}</td></tr>
        <tr><td>{home}</td>{periods.home.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n">{periods.home.reduce((a, b) => a + b, 0)}</td></tr>
      </tbody>
    </table>
  );
}

function BoxTable({ state, title, lines }: { state: SeasonState; title: string; lines: { playerId: string; pts: number }[] }) {
  return (
    <table className="box-score">
      <thead><tr><th>{title}</th><th className="n">PTS</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.playerId}><td>{playerName(state, l.playerId)}</td><td className="n">{l.pts}</td></tr>)}</tbody>
    </table>
  );
}

function FinalView({ state, r }: { state: SeasonState; r: GameResult }) {
  return (
    <section>
      <h1>Final{r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}: {r.away} {r.awayPts} @ {r.home} {r.homePts}</h1>
      {r.periods && <LineScore home={r.home} away={r.away} periods={r.periods} />}
      {r.box && (
        <div className="live-grid">
          <BoxTable state={state} title={r.away} lines={r.box.away} />
          <BoxTable state={state} title={r.home} lines={r.box.home} />
        </div>
      )}
    </section>
  );
}

function playText(state: SeasonState, g: SimGame, p: Possession): string {
  const off = p.offense === 'home' ? g.home : g.away;
  const def = p.offense === 'home' ? g.away : g.home;
  const who = playerName(state, off.players[p.handler].playerId);
  const guard = playerName(state, def.players[p.defender].playerId);
  return p.made ? `${off.teamId}: ${who} scores ${p.points} over ${guard}` : `${off.teamId}: ${who} is stopped by ${guard}`;
}

export function GamePage() {
  const { league = '', gameNo = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const n = Number(gameNo);
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const [sim, setSim] = useState<SimGame | null>(null);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>('normal');
  const [saveState, setSaveState] = useState<'live' | 'saving' | 'saved' | 'failed'>('live');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<number[]>([]);

  const isNext = !!state?.schedule && !!state.results && gamesPlayed(state) + 1 === n && !blockingPause(state);

  useEffect(() => {
    if (!state || sim || !isNext) return;
    const g = state.schedule!.games[n - 1];
    const home = lineup(state, g.home);
    const away = lineup(state, g.away);
    if (typeof home === 'string' || typeof away === 'string') {
      setMessage(typeof home === 'string' ? home : (away as string));
      return;
    }
    setSim(simGame(n, home, away, Math.random));
  }, [state, sim, isNext, n]);

  const done = !!sim && shown >= sim.possessions.length;

  useEffect(() => {
    if (!auto || !sim || done) return;
    const delay = sim.possessions[shown].clutch ? CLUTCH_MS : SPEED_MS[speed];
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [auto, sim, shown, speed, done]);

  const prob = useMemo(() => (sim ? winProbability(sim, shown, Math.random, 200) : 0.5), [sim, shown]);
  useEffect(() => { if (sim) setHistory(h => [...h.slice(0, shown), prob]); }, [sim, shown, prob]);

  const save = async () => {
    if (!state || !sim) return;
    setSaveState('saving');
    const r = recordGames(state, [sim]);
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      setSaveState('failed');
      return;
    }
    try {
      await commitSeason(r, versions);
      setSaveState('saved');
    } catch (e) {
      setMessage((e as Error).message);
      setSaveState('failed');
    }
  };

  useEffect(() => {
    if (done && saveState === 'live') void save();
  });

  useEffect(() => {
    if (!sim || done) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sim, done]);

  if (!lg) return <p className="error">Games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.results?.games[n - 1];
  if (stored && !sim) return <FinalView state={state} r={stored} />;
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || (blockingPause(state) ? 'Finish the pause before playing on.' : "This game isn't up next.")}</p>
        <Link to={`/league/${lg}/scores`}>Back to scores ▸</Link>
      </section>
    );
  }

  const last = shown > 0 ? sim.possessions[shown - 1] : null;
  const end = last ? last.end : 120;
  const periods = { home: [] as number[], away: [] as number[] };
  const box = { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] };
  for (const p of sim.possessions.slice(0, shown)) {
    while (periods.home.length < p.period) { periods.home.push(0); periods.away.push(0); }
    periods[p.offense][p.period - 1] += p.points;
    box[p.offense][p.handler] += p.points;
  }
  const lines = (side: 'home' | 'away') => sim[side].players.map((pl, k) => ({ playerId: pl.playerId, pts: box[side][k] }));
  const points = history.map((v, i) => `${(i / Math.max(1, sim.possessions.length)) * 300},${60 - v * 60}`).join(' ');

  return (
    <section>
      <div className="scorebug">
        <span>{sim.away.teamId}</span><span className="score">{last?.awayScore ?? 0}</span>
        <span className="clock">{done ? `Final${sim.ot ? ` (${sim.ot > 1 ? `${sim.ot}OT` : 'OT'})` : ''}` : `${periodName(last ? last.period : 1)} · ${end - shown} possessions left`}</span>
        <span className="score">{last?.homeScore ?? 0}</span><span>{sim.home.teamId}</span>
      </div>
      <div className="sim-controls">
        <button className="btn" disabled={done || auto} onClick={() => setShown(s => s + 1)}>Next possession</button>
        <button className="btn" disabled={done} onClick={() => setAuto(a => !a)}>{auto ? 'Pause' : 'Auto'}</button>
        <label>Speed
          <select value={speed} onChange={e => setSpeed(e.target.value as keyof typeof SPEED_MS)}>
            <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
          </select>
        </label>
        <button className="btn primary" disabled={done} onClick={() => setShown(sim.possessions.length)}>Sim to end</button>
        {!done && <span className="muted">This game isn't saved until the final buzzer.</span>}
        {saveState === 'saved' && <Link to={`/league/${lg}/scores`}>Saved · back to scores ▸</Link>}
        {saveState === 'failed' && <button className="btn" disabled={saving} onClick={save}>Retry save</button>}
      </div>
      {message && <p className="error">{message}</p>}
      <div className="live-grid">
        <div className="card">
          <h3>Play-by-play</h3>
          <ul className="pbp">
            {sim.possessions.slice(Math.max(0, shown - 15), shown).reverse().map(p => (
              <li key={p.i} className={p.clutch ? 'clutch' : undefined}>{periodName(p.period)} · {playText(state, sim, p)}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Win probability · {sim.home.teamId} {Math.round(prob * 100)}%</h3>
          <svg viewBox="0 0 300 60" width="100%" height="60" role="img" aria-label="Win probability">
            <line x1="0" y1="30" x2="300" y2="30" stroke="currentColor" strokeOpacity="0.2" />
            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
          </svg>
          <LineScore home={sim.home.teamId} away={sim.away.teamId} periods={periods} />
          <BoxTable state={state} title={sim.away.teamId} lines={lines('away')} />
          <BoxTable state={state} title={sim.home.teamId} lines={lines('home')} />
        </div>
      </div>
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, import `GamePage` and add `<Route path="/league/:league/game/:gameNo" element={<GamePage />} />`.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run app/pages/GamePage.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app
git commit -m "feat: live game view (scorebug, play-by-play, win probability, box score) and box scores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Standings page

**Files:**
- Create: `web/app/pages/StandingsPage.tsx`, `web/app/pages/StandingsPage.test.tsx`
- Modify: `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes: `useSeasonState`, `standings`, `PLAYOFF_SEEDS` (Task 4), `groupLabel`, `LeagueTabs`, `TeamMark`, `seasonDocs`.
- Produces: the route `/league/:league/standings`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/pages/StandingsPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { d2SeasonState, fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { StandingsPage } from './StandingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/standings" element={<StandingsPage />} /></Routes>
  </MemoryRouter>,
);

describe('StandingsPage', () => {
  it('lists each FBA conference in standings order with records', async () => {
    const s = fbaSeasonState();
    const games = [
      { gameNo: 1, home: 'CAR', away: 'BOS', homePts: 70, awayPts: 60 },
      { gameNo: 2, home: 'DEN', away: 'MEM', homePts: 50, awayPts: 80 },
    ];
    stubApi(seasonDocs({ ...s, results: { ...s.results!, games } }));
    renderAt('/league/fba/standings');
    const tables = await screen.findAllByRole('table');
    const east = within(tables[0]).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(east[0]).toContain('CAR Club');
    expect(east[0]).toContain('1-0');
    expect(east[1]).toContain('BOS Club');
  });

  it('shows one table per D2 league', async () => {
    stubApi(seasonDocs(d2SeasonState()));
    renderAt('/league/fbad2/standings');
    expect((await screen.findAllByRole('table'))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/StandingsPage.test.tsx`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Create `web/app/pages/StandingsPage.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import { PLAYOFF_SEEDS, standings, type StandingRow } from '../../engine/season/standings';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { Team } from '../../engine/shared/types';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

const pct = (x: number) => (x === 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
const gb = (x: number) => (x === 0 ? '—' : String(x));
const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

function Table({ rows, teams, season, showConf, lottery }: { rows: StandingRow[]; teams: Map<string, Team>; season: number; showConf: boolean; lottery?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>{lottery ? 'Pick' : '#'}</th><th></th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">PCT</th>
            {!lottery && <th className="n">GB</th>}
            {showConf && !lottery && <th className="n">CONF</th>}
            {!lottery && <><th className="n">L10</th><th className="n">STRK</th><th className="n">DIFF</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const t = teams.get(r.teamId);
            return (
              <tr key={r.teamId} className={!lottery && r.seed === PLAYOFF_SEEDS ? 'playoff-line' : undefined}>
                <td>{r.seed}</td>
                <td className="marker">{r.marker ?? ''}</td>
                <td>{t && <TeamMark team={t} season={season} size={20} />} {t?.name ?? r.teamId}</td>
                <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{pct(r.pct)}</td>
                {!lottery && <td className="n">{gb(r.gb)}</td>}
                {showConf && !lottery && <td className="n">{r.confW}-{r.confL}</td>}
                {!lottery && <><td className="n">{r.l10}</td><td className="n">{r.streak}</td><td className="n">{signed(r.diff)}</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, error } = useSeasonState(lg);
  if (!lg) return <p className="error">Standings are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const s = standings(lg, state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  return (
    <section>
      <h1>{LEAGUE_LABEL[lg]} standings · S{state.season}</h1>
      <LeagueTabs league={lg} />
      {lg === 'fba' && <p className="muted">* clinched the #1 seed · x clinched a playoff spot · n eliminated</p>}
      {s.groups.map(g => (
        <div key={g.group}>
          <h2>{groupLabel(lg, g.group)}</h2>
          <Table rows={g.rows} teams={teams} season={state.season} showConf={lg === 'fba'} />
        </div>
      ))}
      {lg === 'fba' && s.lottery.length > 0 && (
        <div>
          <h2>Lottery standings</h2>
          <Table rows={s.lottery} teams={teams} season={state.season} showConf={false} lottery />
        </div>
      )}
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, import `StandingsPage` and add `<Route path="/league/:league/standings" element={<StandingsPage />} />`.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run app/pages/StandingsPage.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app
git commit -m "feat: standings page (conference and league tables, clinch markers, lottery)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Rating pause page, and roster locks in the UI

**Files:**
- Create: `web/app/components/RatingInput.tsx`, `web/app/pages/RatingPausePage.tsx`, `web/app/pages/RatingPausePage.test.tsx`, `web/app/season/useSeasonPhase.ts`
- Modify: `web/app/pages/D2RatingsPage.tsx` (use the shared `RatingInput`)
- Modify: `web/app/pages/TeamPage.tsx`, `web/app/pages/TradePage.tsx`, `web/app/pages/FreeAgencyPage.tsx`, `web/app/components/SignPanel.tsx`, `web/app/components/EditDialog.tsx`
- Modify: `web/app/pages/TradePage.test.tsx`, `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes:
  - `startRatingPause`, `finishRatingPause`, `setPauseRating`, `MIN_PAUSE_GAMES` (Task 6)
  - `seasonPhase`, `lockProblem`, `LOCK_MESSAGES`, `SeasonPhase` (Task 7)
  - `useSeasonState`, `commitSeason`, `seasonDocs`
  - `useAutosaveDoc`, `parseRatingInput`
- Produces:
  - `<RatingInput value name disabled allowBlank onSave />`
  - `useSeasonPhase(): SeasonPhase | undefined` (undefined while loading)
  - the route `/league/fba/ratings-pause`
  - `SignPanel` and `EditDialog` gain a `phase?: SeasonPhase` prop

- [ ] **Step 1: Write the failing tests**

Create `web/app/pages/RatingPausePage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRatingPause } from '../../engine/season/ratingPause';
import type { SeasonState } from '../../engine/season/state';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import type { GameResult } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { RatingPausePage } from './RatingPausePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function atFirstPause(): SeasonState {
  const s = fbaSeasonState();
  const pairs = [['BOS', 'CAR'], ['DEN', 'MEM'], ['BOS', 'DEN'], ['CAR', 'MEM']];
  const games: GameResult[] = pairs.map(([home, away], k) => ({
    gameNo: k + 1, home, away, homePts: 50, awayPts: 60,
    box: {
      home: s.rosters.teams[home].map(e => ({ playerId: e.playerId!, pts: 10 })),
      away: s.rosters.teams[away].map(e => ({ playerId: e.playerId!, pts: 12 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}

const renderPage = () => render(<MemoryRouter><RatingPausePage /></MemoryRouter>);

describe('RatingPausePage', () => {
  it('says when no adjustment is due', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderPage();
    expect(await screen.findByText(/No rating adjustment is due right now/)).toBeTruthy();
  });

  it('starts the adjustments as one batch', async () => {
    const log = stubApi(seasonDocs(atFirstPause()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start rating adjustments' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start rating adjustments (after game 4)');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S79/ratingPause-4.json', null]]);
  });

  it('autosaves edits and finishes with the autosaved version', async () => {
    const started = startRatingPause(atFirstPause());
    if (!started.ok) throw new Error(started.problems.join('; '));
    const log = stubApi(seasonDocs(started.state));
    renderPage();
    const input = await screen.findByLabelText('New rating for BOS SG');
    fireEvent.change(input, { target: { value: '91' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fba/S79/ratingPause-4.json');
    const cont = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => expect((cont as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cont);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish rating adjustments (after game 4)');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'leagues/fba/S79/ratingPause-4.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/schedule.json', 'leagues/fba/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.find(w => w.path.endsWith('ratingPause-4.json'))!.baseVersion).toBe('0000000000000002');
  });
});
```

In `web/app/pages/TradePage.test.tsx`, give `setupFetch` a second parameter `extra: Record<string, unknown> = {}` and merge it into `d` (`Object.assign(d, extra)`) right before `vi.stubGlobal`. Then add:

```tsx
describe('TradePage roster locks', () => {
  it('is read-only after the trade deadline', async () => {
    setupFetch(s => { s.freeAgents = { ...s.freeAgents, locked: true }; }, {
      'leagues/fba/S79/schedule.json': { league: 'fba', season: 79, locked: false, games: [], pauses: [{ afterGame: 645, kind: 'deadline', done: true }] },
      'leagues/fba/S79/results.json': { league: 'fba', season: 79, locked: false, games: [] },
    });
    render(
      <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
        <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('The trade deadline has passed: rosters are locked until the offseason')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Make trade' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/RatingPausePage.test.tsx app/pages/TradePage.test.tsx`
Expected: FAIL (the page is missing and there's no lock message).

- [ ] **Step 3: Create `web/app/components/RatingInput.tsx` and use it in the D2 ratings page**

```tsx
import { useEffect, useState } from 'react';
import { parseRatingInput } from '../../engine/d2/ratings';

/** A rating box that saves on blur (or Enter). Blank is only accepted when allowBlank is set. */
export function RatingInput({ value, name, disabled, allowBlank, onSave }: {
  value: number | null; name: string; disabled: boolean; allowBlank: boolean; onSave: (value: number | null) => void;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState('');
  useEffect(() => { setText(shown); }, [shown]);
  const commit = () => {
    const parsed = parseRatingInput(text);
    if (!parsed.ok || (!allowBlank && parsed.value === null)) {
      setProblem(parsed.ok ? 'Enter a whole number from 1 to 99' : parsed.problem);
      return;
    }
    setProblem('');
    if (parsed.value !== value) onSave(parsed.value);
  };
  return (
    <>
      <input
        className="rating-input" inputMode="numeric" aria-label={`New rating for ${name}`} value={text} disabled={disabled}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      {problem && <div className="error inline-problem">{problem}</div>}
    </>
  );
}
```

In `web/app/pages/D2RatingsPage.tsx`:
- Delete the local `RatingInput` function and its now-unused `parseRatingInput` and `useEffect` imports.
- Import `RatingInput` from `'../components/RatingInput'`.
- Replace its use with `<RatingInput value={r.rating} name={name(r.playerId)} disabled={locked} allowBlank onSave={v => save(r.playerId, v)} />`.

- [ ] **Step 4: Create `web/app/season/useSeasonPhase.ts`**

```ts
import { seasonPhase, type SeasonPhase } from '../../engine/season/locks';
import type { FreeAgentsFile, MetaFile, ResultsFile, ScheduleFile } from '../../engine/shared/types';
import { useDoc } from '../api';

/** The current roster-lock phase, or undefined while its docs load. */
export function useSeasonPhase(): SeasonPhase | undefined {
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const s = meta?.currentSeason;
  const fa = useDoc<FreeAgentsFile>(s === undefined ? null : `leagues/fba/S${s}/freeAgents.json`);
  const sched = useDoc<ScheduleFile>(s === undefined ? null : `leagues/fba/S${s}/schedule.json`);
  const res = useDoc<ResultsFile>(s === undefined ? null : `leagues/fba/S${s}/results.json`);
  if (s === undefined || [fa, sched, res].some(d => !d.data && !d.error)) return undefined;
  return seasonPhase({
    freeAgencyClosed: fa.data?.locked ?? false,
    fbaGamesPlayed: res.data?.games.length ?? 0,
    deadlineDone: sched.data?.pauses.some(p => p.kind === 'deadline' && p.done) ?? false,
  });
}
```

- [ ] **Step 5: Wire the locks into the roster screens**

**`SignPanel.tsx` and `EditDialog.tsx`**
- Add an optional prop `phase?: SeasonPhase` (import the type from `'../../engine/season/locks'`).
- Pass `{ batchId: …, phase }` everywhere they build a `MoveContext`, including the `'preview'` one.

**`TeamPage.tsx`**
- Import `useSeasonPhase` and `lockProblem`, and add `const phase = useSeasonPhase();`.
- In `release`, use `{ batchId: newBatchId(), phase }`.
- In `actions(e)`, return `null` while `phase === undefined`. Otherwise render:
  - Release and Cut only when `!lockProblem(phase, lg, 'release')`
  - Edit only when `!lockProblem(phase, lg, 'edit')`
  - Re-sign only when `!lockProblem(phase, 'fba', 'sign')`, in addition to its existing condition
- Right above the roster table, add `{editable && phase && lockProblem(phase, lg, 'release') && <p className="muted">{lockProblem(phase, lg, 'release')}</p>}`.
- Pass `phase={phase}` to `EditDialog` and `SignPanel`.

**`TradePage.tsx`**
- Import `useSeasonPhase` and `lockProblem`, and add `const phase = useSeasonPhase();`.
- Compute `const tradeLock = phase === undefined ? 'Loading…' : lockProblem(phase, lg, 'trade');`.
- Replace `const locked = (lg === 'fba' ? state.fba : state.d2).locked;` with `const locked = (lg === 'fba' ? state.fba : state.d2).locked || tradeLock !== null;`.
- Next to the existing "rosters are final" message, add `{tradeLock && tradeLock !== 'Loading…' && <p className="muted">{tradeLock}</p>}`.
- Pass `phase` in both `makeTrade` contexts (`{ batchId: 'preview', phase }` and `{ batchId: newBatchId(), phase }`).

**`FreeAgencyPage.tsx`**: import `useSeasonPhase`, add `const phase = useSeasonPhase();`, and pass `phase={phase}` to `SignPanel`.

- [ ] **Step 6: Create `web/app/pages/RatingPausePage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { POSITIONS } from '../../engine/roster/rules';
import { finishRatingPause, MIN_PAUSE_GAMES, setPauseRating, startRatingPause } from '../../engine/season/ratingPause';
import { blockingPause, playerName, seasonDocPath, type SeasonResult } from '../../engine/season/state';
import type { Position, RatingPauseFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { RatingInput } from '../components/RatingInput';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { useAutosaveDoc } from '../useAutosaveDoc';
import './roster.css';
import './season.css';

type Tab = 'ALL' | Position;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

export function RatingPausePage() {
  const { state, versions, error } = useSeasonState('fba');
  const saving = useSaving();
  const pause = state ? blockingPause(state) : null;
  const due = pause?.kind === 'ratings' ? pause : null;
  const path = state && due ? seasonDocPath('ratingPause', 'fba', state.season, due.afterGame) : '';
  const current = state?.ratingPause && due && state.ratingPause.afterGame === due.afterGame ? state.ratingPause : undefined;
  const autosave = useAutosaveDoc<RatingPauseFile>(path, current, versions[path] ?? null);
  const [tab, setTab] = useState<Tab>('ALL');
  const [message, setMessage] = useState('');

  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} rating adjustments</h1>;
  if (!due) {
    return <section>{title}<p className="muted">No rating adjustment is due right now. <Link to="/league/fba/scores">Back to scores ▸</Link></p></section>;
  }

  const run = async (r: SeasonResult) => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    setMessage('');
    try {
      await commitSeason(r, { ...versions, [path]: autosave.version });
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const doc = autosave.doc ?? current;
  if (!doc) {
    return (
      <section>
        {title}
        <p className="muted">
          Pause after game {due.afterGame}. The app suggests changes from each player's scoring so far (players with at least {MIN_PAUSE_GAMES} games).
        </p>
        <button className="btn primary" disabled={saving} onClick={() => run(startRatingPause(state))}>Start rating adjustments</button>
        {message && <p className="error">{message}</p>}
      </section>
    );
  }

  const name = (id: string) => playerName(state, id);
  const rows = doc.players
    .filter(r => tab === 'ALL' || r.position === tab)
    .sort((a, b) => b.rating - a.rating || name(a.playerId).localeCompare(name(b.playerId)));
  const changed = doc.players.filter(r => r.rating !== r.oldRating).length;

  return (
    <section>
      {title}
      <p className="muted">Pause after game {due.afterGame} · {changed} rating(s) changed</p>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['ALL', ...POSITIONS] as Tab[]).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t === 'ALL' ? 'All' : t}</button>
          ))}
        </div>
        <button className="btn primary" disabled={saving} onClick={() => run(finishRatingPause({ ...state, ratingPause: doc }, { batchId: newBatchId() }))}>Continue</button>
      </div>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {message && <p className="error">{message}</p>}
      <div className="table-wrap">
        <table className="ratings-table">
          <thead>
            <tr><th>Player</th><th>Team</th><th className="n">G</th><th className="n">PPG</th><th className="n">Old</th><th className="n">Suggested</th><th className="n">New</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.playerId} className={r.rating !== r.oldRating ? 'edited' : undefined}>
                <td>{name(r.playerId)}{tab === 'ALL' && <span className="muted"> · {r.position}</span>}</td>
                <td>{r.teamId}</td>
                <td className="n">{r.games}</td>
                <td className="n">{r.ppg.toFixed(1)}</td>
                <td className="n">{r.oldRating}</td>
                <td className="n" title={r.perf === null ? `Fewer than ${MIN_PAUSE_GAMES} games` : `performance ${signed(r.perf)}`}>
                  {r.suggested === null ? '—' : <>{r.suggested} <span className={r.suggested > r.oldRating ? 'delta-up' : r.suggested < r.oldRating ? 'delta-down' : 'muted'}>{signed(r.suggested - r.oldRating)}</span></>}
                </td>
                <td className="n">
                  <RatingInput value={r.rating} name={name(r.playerId)} disabled={false} allowBlank={false} onSave={v => autosave.update(cur => setPauseRating(cur, r.playerId, v!))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, import `RatingPausePage` and add `<Route path="/league/fba/ratings-pause" element={<RatingPausePage />} />` **before** `/league/:league`.

- [ ] **Step 7: Run the full suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. The existing team, trade, free-agency and D2 ratings tests still pass: without a schedule doc the phase stays `'open'`, and the D2 page's rating box behaves the same.

- [ ] **Step 8: Commit**

```bash
git add web/app
git commit -m "feat: rating-adjust pause page, shared rating input, and roster locks in the UI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: All-Star hub, part 1: selections, the ASG draft, the contest draw

**Files:**
- Create: `web/app/allstar/types.ts`, `web/app/allstar/AllStarPage.tsx`, `web/app/allstar/SelectionStep.tsx`, `web/app/allstar/AsgDraftStep.tsx`, `web/app/allstar/ContestDrawStep.tsx`, `web/app/allstar/testState.ts`, `web/app/allstar/AllStarPage.test.tsx`
- Modify: `web/app/shell/Layout.tsx`

**Interfaces:**
- Consumes:
  - all of `engine/allstar/*` (Tasks 8–9)
  - `finishAllStar`, `allStarStep`, `STEP_ORDER`, `STEP_LABEL`
  - `useSeasonState`, `commitDocs`, `commitSeason`, `stubApi`, `seasonDocs`, `playerSeasonStats`
- Produces:
  - `StepProps { state; doc; list; readOnly; saving; save(r): Promise<boolean> }`
  - the route `/league/fba/all-star`
  - `allStarSeasonState(stage)` (test helper)

  For now, event steps 4–8 show "This event is built in the next task." Task 16 replaces that.

- [ ] **Step 1: Create the test helper `web/app/allstar/testState.ts`**

```ts
import { ASG_PICKS, asgAvailable, asgPick, startAsgDraft } from '../../engine/allstar/asgDraft';
import { type AllStarResult, fbaPlayers } from '../../engine/allstar/common';
import { contestTurn, drawCounts, drawFilled, drawOnClock, startContestDraw } from '../../engine/allstar/contestDraw';
import { runDunk, runFivePoint } from '../../engine/allstar/contests';
import { runAsg } from '../../engine/allstar/asgGame';
import { saveSelections, suggestSelections } from '../../engine/allstar/selection';
import { allStarRosters } from '../../engine/allstar/testFixtures';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgPick } from '../../engine/allstar/youngStars';
import { mulberry32 } from '../../engine/d2/random';
import type { SeasonState } from '../../engine/season/state';
import type { AllStarFile } from '../../engine/shared/types';

export type Stage = 'none' | 'selected' | 'drafting' | 'drafted' | 'drawing' | 'drawn' | 'contests' | 'ysgDrafting' | 'ysgDrafted' | 'ysgPlayed' | 'complete';
const ORDER: Stage[] = ['none', 'selected', 'drafting', 'drafted', 'drawing', 'drawn', 'contests', 'ysgDrafting', 'ysgDrafted', 'ysgPlayed', 'complete'];

const ok = (r: AllStarResult): AllStarFile => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.doc;
};

/** A 30-team FBA season sitting at the All-Star pause (after game 12), with the All-Star doc advanced to `stage`. */
export function allStarSeasonState(stage: Stage): SeasonState {
  const fx = allStarRosters();
  const teams = { league: 'fba' as const, teams: fx.teamIds.map((t, k) => ({ teamId: t, name: `${t} Club`, abbr: t, group: k % 2 ? 'W' : 'E', logoFolder: null, badge: { bg: '#333', fg: '#fff' } })) };
  const games = Array.from({ length: 12 }, (_, k) => ({ gameNo: k + 1, home: 'T0', away: 'T1' }));
  const state: SeasonState = {
    league: 'fba', season: 79, teams, rosters: fx.rosters, players: fx.players,
    calendar: { season: 79, steps: [{ id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false }] },
    tx: { league: 'fba', season: 79, entries: [] },
    schedule: { league: 'fba', season: 79, locked: false, games, pauses: [{ afterGame: 12, kind: 'allstar', done: false }] },
    results: { league: 'fba', season: 79, locked: false, games: games.map(g => ({ ...g, homePts: 50, awayPts: 40 })) },
    ratingPause: null, allstar: null,
  };
  const at = ORDER.indexOf(stage);
  if (at === 0) return state;
  const list = fbaPlayers(fx.rosters, fx.players);
  const sel = suggestSelections(list, new Map());
  const youngCaptains = list.filter(p => !sel.youngStars.includes(p.playerId)).slice(0, 4).map(p => p.playerId);
  let doc = ok(saveSelections(null, { ...sel, youngCaptains }, 79, list, fx.players));
  if (at >= 2) doc = ok(startAsgDraft(doc, mulberry32(1)));
  if (at >= 3) for (let k = 0; k < ASG_PICKS; k++) doc = ok(asgPick(doc, asgAvailable(doc, list)[0].playerId, list));
  if (at >= 4) doc = ok(startContestDraw(doc, fx.teamIds, mulberry32(2)));
  if (at >= 5) {
    while (!drawFilled(doc)) {
      const team = drawOnClock(doc)!;
      const contest = drawCounts(doc)['5pt'] < 10 ? '5pt' : 'dunk';
      doc = ok(contestTurn(doc, { contest, playerId: list.find(p => p.teamId === team)!.playerId }, list));
    }
  }
  if (at >= 6) doc = ok(runDunk(ok(runFivePoint(doc, mulberry32(3))), mulberry32(4)));
  if (at >= 7) doc = ok(startYsgDraft(doc, mulberry32(5)));
  if (at >= 8) for (let k = 0; k < 20; k++) doc = ok(ysgPick(doc, ysgAvailable(doc, list)[0].playerId, list));
  if (at >= 9) doc = ok(runYoungStar(doc, mulberry32(6)));
  if (at >= 10) doc = ok(runAsg(doc, list, mulberry32(7)));
  return { ...state, allstar: doc };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/app/allstar/AllStarPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fbaPlayers } from '../../engine/allstar/common';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AllStarPage } from './AllStarPage';
import { allStarSeasonState } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderPage = () => render(<MemoryRouter><AllStarPage /></MemoryRouter>);

describe('AllStarPage', () => {
  it('waits for the All-Star pause', async () => {
    stubApi(seasonDocs(fbaSeasonState()));
    renderPage();
    expect(await screen.findByText(/happens at the ¾ pause/)).toBeTruthy();
  });

  it('saves selections once four Young-Star captains are named', async () => {
    const s = allStarSeasonState('none');
    const log = stubApi(seasonDocs(s));
    renderPage();
    const save = await screen.findByRole('button', { name: 'Save selections' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    const outsiders = fbaPlayers(s.rosters, s.players).filter(p => !p.restricted).slice(0, 4);
    outsiders.forEach((p, i) => fireEvent.change(screen.getByLabelText(`Young-Star captain ${i + 1}`), { target: { value: `${p.name} (${p.playerId})` } }));
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Save All-Star selections');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fba/S79/allstar.json', null]]);
  });

  it('flips for the first pick, then drafts', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('selected')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Coin flip' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start All-Star draft (coin flip)');
    cleanup();
    const log2 = stubApi(seasonDocs(allStarSeasonState('drafting')));
    renderPage();
    const board = await screen.findByRole('table', { name: 'Available All-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].label).toBe('All-Star draft pick 1');
  });

  it('runs the contest draw turn by turn', async () => {
    const log = stubApi(seasonDocs(allStarSeasonState('drawing')));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Contest draw: T\d+ passes$/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run app/allstar`
Expected: FAIL (the modules are missing).

- [ ] **Step 4: Create `web/app/allstar/types.ts`**

```ts
import type { AllStarResult, FbaPlayer } from '../../engine/allstar/common';
import type { SeasonState } from '../../engine/season/state';
import type { AllStarFile } from '../../engine/shared/types';

export interface StepProps {
  state: SeasonState;
  doc: AllStarFile | null;
  list: FbaPlayer[];
  /** True when viewing a finished step (or the whole weekend is done). */
  readOnly: boolean;
  saving: boolean;
  /** Commits an All-Star result; resolves false (after showing the problem) when it failed. */
  save: (r: AllStarResult) => Promise<boolean>;
}
```

- [ ] **Step 5: Create `web/app/allstar/SelectionStep.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { saveSelections, selectionProblems, suggestSelections } from '../../engine/allstar/selection';
import { POSITIONS } from '../../engine/roster/rules';
import { playerSeasonStats } from '../../engine/season/ratingPause';
import type { AllStarSelections } from '../../engine/shared/types';
import type { StepProps } from './types';

const idFrom = (text: string) => /\((p\d{5})\)$/.exec(text.trim())?.[1] ?? '';

export function SelectionStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  const ppg = useMemo(() => {
    const stats = playerSeasonStats(state.results);
    return new Map([...stats].map(([id, s]) => [id, s.games ? s.pts / s.games : 0]));
  }, [state.results]);
  const [sel, setSel] = useState<AllStarSelections>(() => doc?.selections ?? suggestSelections(list, ppg));
  const [ycText, setYcText] = useState<string[]>(() => {
    const names = (doc?.selections?.youngCaptains ?? []).map(id => `${state.players.players[id]?.name ?? id} (${id})`);
    return [0, 1, 2, 3].map(i => names[i] ?? '');
  });
  const current: AllStarSelections = { ...sel, youngCaptains: ycText.map(idFrom).filter(Boolean) };
  const problems = selectionProblems(current, list, state.players);
  const byId = new Map(list.map(p => [p.playerId, p]));
  const counts = (ids: string[]) => POSITIONS.map(p => `${p} ${ids.filter(id => byId.get(id)?.position === p).length}`).join(' · ');
  const best = [...list].sort((a, b) => b.rating - a.rating || (ppg.get(b.playerId) ?? 0) - (ppg.get(a.playerId) ?? 0) || a.name.localeCompare(b.name));
  const youngFirst = [...best.filter(p => p.restricted), ...best.filter(p => !p.restricted)];
  const registry = Object.values(state.players.players);

  const toggle = (key: 'allStars' | 'youngStars', id: string) => setSel(s => {
    const has = s[key].includes(id);
    const next = { ...s, [key]: has ? s[key].filter(x => x !== id) : [...s[key], id] };
    return key === 'allStars' && has ? { ...next, captains: s.captains.filter(c => c !== id) } : next;
  });
  const setCaptain = (i: number, id: string) => setSel(s => {
    const c = [s.captains[0] ?? '', s.captains[1] ?? ''];
    c[i] = id;
    return { ...s, captains: c.filter(Boolean) };
  });

  const table = (label: string, key: 'allStars' | 'youngStars', rows: typeof list) => (
    <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
      <table className="pick-table" aria-label={label}>
        <thead><tr><th></th><th>Player</th><th>Pos</th><th>Team</th><th className="n">Rtg</th><th className="n">PPG</th></tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.playerId}>
              <td><input type="checkbox" aria-label={`${label}: ${p.name}`} checked={sel[key].includes(p.playerId)} disabled={readOnly} onChange={() => toggle(key, p.playerId)} /></td>
              <td>{p.name}{p.restricted && key === 'youngStars' ? ' · rookie deal' : ''}</td><td>{p.position}</td><td>{p.teamId}</td>
              <td className="n">{p.rating}</td><td className="n">{(ppg.get(p.playerId) ?? 0).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="card">
        <h3>All-Stars · {sel.allStars.length}/28 · {counts(sel.allStars)} (4–11 per position)</h3>
        {[0, 1].map(i => (
          <label key={i}>ASG captain {i + 1}{' '}
            <select value={sel.captains[i] ?? ''} disabled={readOnly} onChange={e => setCaptain(i, e.target.value)}>
              <option value="">—</option>
              {sel.allStars.map(id => <option key={id} value={id}>{byId.get(id)?.name ?? id}</option>)}
            </select>
          </label>
        ))}
        {table('All-Stars', 'allStars', best)}
      </div>
      <div className="card">
        <h3>Young-Stars · {sel.youngStars.length}/20 · {counts(sel.youngStars)} (2–7 per position)</h3>
        {table('Young-Stars', 'youngStars', youngFirst)}
        <datalist id="registry-players">
          {registry.map(p => <option key={p.id} value={`${p.name} (${p.id})`} />)}
        </datalist>
        {[0, 1, 2, 3].map(i => (
          <label key={i}>Young-Star captain {i + 1}{' '}
            <input list="registry-players" aria-label={`Young-Star captain ${i + 1}`} value={ycText[i]} disabled={readOnly}
              onChange={e => setYcText(t => t.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      {!readOnly && problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {!readOnly && (
        <button className="btn primary" disabled={saving || problems.length > 0} onClick={() => save(saveSelections(doc, current, state.season, list, state.players))}>
          Save selections
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `web/app/allstar/AsgDraftStep.tsx`**

```tsx
import { useState } from 'react';
import { asgAvailable, asgNeeds, asgOnClock, asgPick, asgTeams, startAsgDraft } from '../../engine/allstar/asgDraft';
import type { StepProps } from './types';

export function AsgDraftStep({ doc, list, readOnly, saving, save }: StepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const pos = (id: string) => list.find(p => p.playerId === id)?.position ?? '';
  if (!doc.asgDraft) {
    return (
      <div>
        <p className="muted">A coin flip decides which captain picks first; then they alternate. Each team's first 4 picks plus its captain must cover every position.</p>
        {!readOnly && <button className="btn primary" disabled={saving} onClick={() => save(startAsgDraft(doc, Math.random))}>Coin flip</button>}
      </div>
    );
  }
  const teams = asgTeams(doc);
  const clock = asgOnClock(doc);
  const available = asgAvailable(doc, list);
  const chosen = available.find(p => p.playerId === selected);
  const captainName = (t: 0 | 1) => name(teams[t][0]);
  return (
    <div className="live-grid">
      <div>
        {([0, 1] as const).map(t => (
          <div key={t} className="card">
            <h3>Team {captainName(t)}{clock === t ? ' · on the clock' : ''}</h3>
            <table><tbody>
              {teams[t].map((id, k) => <tr key={id}><td>{k === 0 ? 'C' : k}</td><td>{name(id)}{k < 5 ? ' · starter' : ''}</td><td>{pos(id)}</td></tr>)}
            </tbody></table>
          </div>
        ))}
      </div>
      {clock !== null && !readOnly ? (
        <div className="card">
          <h3>Available · Team {captainName(clock)}{asgNeeds(doc, clock, list).length ? ` needs ${asgNeeds(doc, clock, list).join('/')}` : ''}</h3>
          <table className="market" aria-label="Available All-Stars">
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th className="n">Rtg</th></tr></thead>
            <tbody>
              {available.map(p => (
                <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                  <td>{p.name}</td><td>{p.position}</td><td>{p.teamId}</td><td className="n">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen && (
            <button className="btn primary" disabled={saving} onClick={async () => { if (await save(asgPick(doc, chosen.playerId, list))) setSelected(null); }}>
              Pick {chosen.name} → Team {captainName(clock)}
            </button>
          )}
        </div>
      ) : <p className="muted">The All-Star draft is complete.</p>}
    </div>
  );
}
```

- [ ] **Step 7: Create `web/app/allstar/ContestDrawStep.tsx`**

```tsx
import { CONTEST_SPOTS, contestTurn, drawCounts, drawOnClock, startContestDraw } from '../../engine/allstar/contestDraw';
import type { StepProps } from './types';

export function ContestDrawStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  if (!doc) return null;
  const name = (id: string | null) => (id ? list.find(p => p.playerId === id)?.name ?? id : '');
  if (!doc.contestDraw) {
    return (
      <div>
        <p className="muted">Teams are drawn in random order. Each drawn team sends one player to the 5pt or dunk contest, or passes, until 10 + 4 spots fill.</p>
        {!readOnly && <button className="btn primary" disabled={saving} onClick={() => save(startContestDraw(doc, state.teams.teams.map(t => t.teamId), Math.random))}>Start draw</button>}
      </div>
    );
  }
  const counts = drawCounts(doc);
  const team = drawOnClock(doc);
  const roster = team ? list.filter(p => p.teamId === team) : [];
  return (
    <div className="live-grid">
      <div className="card">
        <h3>5pt {counts['5pt']}/{CONTEST_SPOTS['5pt']} · Dunk {counts.dunk}/{CONTEST_SPOTS.dunk}</h3>
        <ol className="pick-order">
          {doc.contestDraw.turns.map((t, i) => (
            <li key={i} className="done">{t.teamId} · {t.contest ? `${name(t.playerId)} → ${t.contest === '5pt' ? '5pt' : 'dunk'}` : 'passed'}</li>
          ))}
          {team && <li className="now">{team} ← on the clock</li>}
        </ol>
      </div>
      {team && !readOnly ? (
        <div className="card">
          <h3>{team} picks a player or passes</h3>
          <table><tbody>
            {roster.map(p => (
              <tr key={p.playerId}>
                <td>{p.name}</td><td>{p.position}</td><td className="n">{p.rating}</td>
                <td>
                  <button className="btn" disabled={saving || counts['5pt'] >= CONTEST_SPOTS['5pt']} onClick={() => save(contestTurn(doc, { contest: '5pt', playerId: p.playerId }, list))}>5pt</button>{' '}
                  <button className="btn" disabled={saving || counts.dunk >= CONTEST_SPOTS.dunk} onClick={() => save(contestTurn(doc, { contest: 'dunk', playerId: p.playerId }, list))}>Dunk</button>
                </td>
              </tr>
            ))}
          </tbody></table>
          <button className="btn" disabled={saving} onClick={() => save(contestTurn(doc, null, list))}>Pass</button>
        </div>
      ) : <p className="muted">The contest fields are set.</p>}
    </div>
  );
}
```

- [ ] **Step 8: Create `web/app/allstar/AllStarPage.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type AllStarResult, fbaPlayers } from '../../engine/allstar/common';
import { allStarStep, type AllStarStep, STEP_LABEL, STEP_ORDER } from '../../engine/allstar/steps';
import { blockingPause, seasonDocPath } from '../../engine/season/state';
import { useSaving } from '../api';
import { commitDocs } from '../roster/commit';
import { useSeasonState } from '../season/useSeasonState';
import { AsgDraftStep } from './AsgDraftStep';
import { ContestDrawStep } from './ContestDrawStep';
import { SelectionStep } from './SelectionStep';
import type { StepProps } from './types';
import '../pages/roster.css';
import '../pages/season.css';

export function AllStarPage() {
  const { state, versions, error } = useSeasonState('fba');
  const saving = useSaving();
  const [view, setView] = useState<AllStarStep | null>(null);
  const [message, setMessage] = useState('');

  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} All-Star weekend</h1>;
  const doc = state.allstar;
  const step = allStarStep(doc);
  const pause = blockingPause(state);
  if (step !== 'done' && pause?.kind !== 'allstar') {
    return <section>{title}<p className="muted">The All-Star weekend happens at the ¾ pause. <Link to="/league/fba/scores">Back to scores ▸</Link></p></section>;
  }

  const list = fbaPlayers(state.rosters, state.players);
  const path = seasonDocPath('allstar', 'fba', state.season);
  const save = async (r: AllStarResult): Promise<boolean> => {
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return false;
    }
    setMessage('');
    try {
      await commitDocs(r.label, [{ path, doc: r.doc }], versions);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  };
  const current: AllStarStep = step === 'done' ? 'wrapup' : step;
  const shown = view ?? current;
  const reached = (s: AllStarStep) => STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(current);
  const props: StepProps = { state, doc, list, saving, save, readOnly: shown !== current || step === 'done' };

  return (
    <section>
      {title}
      <div className="step-bar">
        {STEP_ORDER.map((s, i) => (
          <button key={s} className={shown === s ? 'on' : reached(s) && s !== current ? 'done' : undefined} disabled={!reached(s)} onClick={() => setView(s === current ? null : s)}>
            {i + 1} {STEP_LABEL[s]}{reached(s) && s !== current ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {message && <p className="error">{message}</p>}
      {shown === 'selections' && <SelectionStep {...props} />}
      {shown === 'asgDraft' && <AsgDraftStep {...props} />}
      {shown === 'contestDraw' && <ContestDrawStep {...props} />}
      {!['selections', 'asgDraft', 'contestDraw'].includes(shown) && (
        <p className="muted">This event is built in the next task.</p>
      )}
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, import `AllStarPage` from `'../allstar/AllStarPage'` and add `<Route path="/league/fba/all-star" element={<AllStarPage />} />` **before** `/league/:league`.

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npx vitest run app/allstar && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/app
git commit -m "feat: All-Star hub with selections, captains' draft, and contest draw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: All-Star hub, part 2: dice reveal, contests, the Young-Star tournament, the ASG, wrap-up

**Files:**
- Create: `web/app/allstar/DiceReveal.tsx`, `web/app/allstar/EventSteps.tsx`, `web/app/allstar/EventSteps.test.tsx`
- Modify: `web/app/allstar/AllStarPage.tsx`

**Interfaces:**
- Consumes: `runFivePoint`, `runDunk`, `startYsgDraft`, `ysgAvailable`, `ysgOnClock`, `ysgPick`, `ysgTeams`, `runYoungStar`, `runAsg`, `asgTeams`, `total`; `StepProps`, `allStarSeasonState`.
- Produces:
  - `<DiceReveal lines sides? onFinished busy />`
  - `contestLines`, `teamGameLines`
  - `<ContestStep contest />`, `<YsgDraftStep />`, `<YsgStep />`, `<AsgStep />`, `<WrapUp finished onFinish />`

- [ ] **Step 1: Write the failing tests**

Create `web/app/allstar/EventSteps.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AllStarPage } from './AllStarPage';
import { allStarSeasonState, type Stage } from './testState';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = (stage: Stage) => {
  const log = stubApi(seasonDocs(allStarSeasonState(stage)));
  render(<MemoryRouter><AllStarPage /></MemoryRouter>);
  return log;
};

describe('All-Star events', () => {
  it('reveals the 5pt contest roll by roll and saves at the end', async () => {
    const log = open('drawn');
    fireEvent.click(await screen.findByRole('button', { name: 'Run the 5pt contest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll next' }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Run the 5pt contest');
    expect(await screen.findByRole('button', { name: 'Run the dunk contest' })).toBeTruthy();
  });

  it('drafts Young-Stars', async () => {
    const log = open('ysgDrafting');
    const board = await screen.findByRole('table', { name: 'Available Young-Stars' });
    fireEvent.click(within(board).getAllByRole('row')[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Pick / }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Young-Star draft pick 1');
  });

  it('plays the All-Star Game and finishes the weekend', async () => {
    const log = open('ysgPlayed');
    fireEvent.click(await screen.findByRole('button', { name: 'Play the All-Star Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Play the All-Star Game');
    cleanup();
    const log2 = open('complete');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish All-Star weekend' }));
    await waitFor(() => expect(log2.batches).toHaveLength(1));
    expect(log2.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/allstar.json', 'leagues/fba/S79/schedule.json']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/allstar/EventSteps.test.tsx`
Expected: FAIL (no "Run the 5pt contest" button yet).

- [ ] **Step 3: Create `web/app/allstar/DiceReveal.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Dice } from '../../engine/shared/types';

export interface RevealLine {
  group: string;
  text: string;
  dice?: Dice;
  /** Which scoreboard side this roll counts for, and how much. */
  side?: number;
  value?: number;
}

export function DiceFaces({ dice }: { dice: Dice }) {
  return <><span className="dice">{dice[0]}</span><span className="dice">{dice[1]}</span></>;
}

export function StaticLines({ lines }: { lines: RevealLine[] }) {
  return (
    <ul className="reveal-lines">
      {lines.map((l, i) => (
        <li key={i}>
          {(i === 0 || lines[i - 1].group !== l.group) && <strong>{l.group} · </strong>}
          {l.dice && <DiceFaces dice={l.dice} />} {l.text}
        </li>
      ))}
    </ul>
  );
}

/** Reveals pre-rolled lines one at a time, a group at a time, or all at once; calls onFinished once everything is shown. */
export function DiceReveal({ lines, sides, onFinished, busy }: { lines: RevealLine[]; sides?: string[]; onFinished: () => void; busy: boolean }) {
  const [shown, setShown] = useState(0);
  const finished = useRef(false);
  useEffect(() => {
    if (shown >= lines.length && !finished.current) {
      finished.current = true;
      onFinished();
    }
  }, [shown, lines.length, onFinished]);
  const done = shown >= lines.length;
  const groupEnd = () => {
    const g = lines[shown]?.group;
    let k = shown;
    while (k < lines.length && lines[k].group === g) k++;
    return k;
  };
  const totals = sides?.map((_, i) => lines.slice(0, shown).filter(l => l.side === i).reduce((a, l) => a + (l.value ?? 0), 0));
  return (
    <div>
      {sides && totals && <div className="scorebug">{sides.map((s, i) => <span key={s}>{s} <span className="score">{totals[i]}</span></span>)}</div>}
      <div className="sim-controls">
        <button className="btn" disabled={done || busy} onClick={() => setShown(s => s + 1)}>Roll next</button>
        <button className="btn" disabled={done || busy} onClick={() => setShown(groupEnd())}>Roll {lines[shown]?.group ?? 'group'}</button>
        <button className="btn primary" disabled={done || busy} onClick={() => setShown(lines.length)}>Roll to end</button>
      </div>
      <StaticLines lines={lines.slice(0, shown)} />
    </div>
  );
}
```

- [ ] **Step 4: Create `web/app/allstar/EventSteps.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { asgTeams } from '../../engine/allstar/asgDraft';
import { runAsg } from '../../engine/allstar/asgGame';
import type { AllStarResult } from '../../engine/allstar/common';
import { runDunk, runFivePoint } from '../../engine/allstar/contests';
import { total } from '../../engine/allstar/dice';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgOnClock, ysgPick, ysgTeams } from '../../engine/allstar/youngStars';
import type { ContestResult, TeamGame } from '../../engine/shared/types';
import { DiceReveal, type RevealLine, StaticLines } from './DiceReveal';
import type { StepProps } from './types';

export function contestLines(result: ContestResult, name: (id: string) => string): RevealLine[] {
  const out: RevealLine[] = [];
  result.rounds.forEach((round, r) => {
    const group = `Round ${r + 1}`;
    for (const id of round.players) {
      round.rolls[id].forEach((dice, k) => out.push({ group, text: `${name(id)} roll ${k + 1}: ${total(dice)}`, dice }));
    }
    for (const ro of round.rollOffs) for (const rnd of ro.rounds) for (const [id, dice] of Object.entries(rnd)) out.push({ group, text: `Roll-off: ${name(id)} ${total(dice)}`, dice });
    const standings = [...round.players].sort((a, b) => round.totals[b] - round.totals[a]).map(id => `${name(id)} ${round.totals[id]}`).join(', ');
    out.push({ group, text: `Totals: ${standings}` });
    out.push({ group, text: `Advancing: ${round.advanced.map(name).join(', ')}` });
  });
  out.push({ group: 'Result', text: `Winner: ${name(result.winner)}` });
  return out;
}

export function teamGameLines(game: TeamGame, label: (team: number) => string, name: (id: string) => string, period: (i: number) => string): RevealLine[] {
  const out: RevealLine[] = [];
  game.rolls.forEach((rolls, i) => {
    for (const r of rolls) {
      out.push({ group: period(i), text: `${label(r.team)} · ${name(r.playerId)}: ${total(r.dice)}`, dice: r.dice, side: game.teams.indexOf(r.team), value: total(r.dice) });
    }
  });
  if (game.rollOff) for (const rnd of game.rollOff.rounds) for (const [id, dice] of Object.entries(rnd)) out.push({ group: 'Roll-off', text: `${label(Number(id))}: ${total(dice)}`, dice });
  out.push({ group: 'Final', text: `Final: ${label(game.teams[0])} ${game.scores[0]} – ${label(game.teams[1])} ${game.scores[1]} · ${label(game.winner)} win` });
  return out;
}

/** Runs an event once (pre-rolled), reveals it, and saves when the reveal ends. */
function useEvent(props: StepProps) {
  const [pending, setPending] = useState<Extract<AllStarResult, { ok: true }> | null>(null);
  const start = (r: AllStarResult) => {
    if (r.ok) setPending(r);
    else void props.save(r);
  };
  const onFinished = useCallback(() => { if (pending) void props.save(pending); }, [pending, props]);
  return { pending, start, onFinished };
}

export function ContestStep(props: StepProps & { contest: '5pt' | 'dunk' }) {
  const { doc, list, readOnly, saving, contest } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const label = contest === '5pt' ? '5pt contest' : 'dunk contest';
  const saved = contest === '5pt' ? doc.fivePoint : doc.dunk;
  if (saved) return <StaticLines lines={contestLines(saved, name)} />;
  if (ev.pending) {
    const r = contest === '5pt' ? ev.pending.doc.fivePoint! : ev.pending.doc.dunk!;
    return <DiceReveal lines={contestLines(r, name)} onFinished={ev.onFinished} busy={saving} />;
  }
  if (readOnly) return <p className="muted">Not run yet.</p>;
  return (
    <button className="btn primary" disabled={saving} onClick={() => ev.start(contest === '5pt' ? runFivePoint(doc, Math.random) : runDunk(doc, Math.random))}>
      Run the {label}
    </button>
  );
}

export function YsgDraftStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc?.selections) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  if (!doc.ysgDraft) {
    return readOnly ? null : <button className="btn primary" disabled={saving} onClick={() => save(startYsgDraft(doc, Math.random))}>Start Young-Star draft</button>;
  }
  const teams = ysgTeams(doc);
  const clock = ysgOnClock(doc);
  const available = ysgAvailable(doc, list);
  const chosen = available.find(p => p.playerId === selected);
  const captain = (t: number) => name(doc.selections!.youngCaptains[t]);
  return (
    <div className="live-grid">
      <div className="grid-2">
        {teams.map((ids, t) => (
          <div key={t} className="card">
            <h3>Team {captain(t)}{clock === t ? ' · on the clock' : ''}</h3>
            <ul>{ids.map(id => <li key={id}>{name(id)} · {list.find(p => p.playerId === id)?.position}</li>)}</ul>
          </div>
        ))}
      </div>
      {clock !== null && !readOnly ? (
        <div className="card">
          <h3>Available · Team {captain(clock)}</h3>
          <table className="market" aria-label="Available Young-Stars">
            <thead><tr><th>Player</th><th>Pos</th><th className="n">Rtg</th></tr></thead>
            <tbody>
              {available.map(p => (
                <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                  <td>{p.name}</td><td>{p.position}</td><td className="n">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen && (
            <button className="btn primary" disabled={saving} onClick={async () => { if (await save(ysgPick(doc, chosen.playerId, list))) setSelected(null); }}>
              Pick {chosen.name} → Team {captain(clock)}
            </button>
          )}
        </div>
      ) : <p className="muted">The Young-Star draft is complete.</p>}
    </div>
  );
}

function ysgLines(doc: NonNullable<StepProps['doc']>, name: (id: string) => string): RevealLine[] {
  const ysg = doc.ysg!;
  const label = (t: number) => `Team ${name(doc.selections!.youngCaptains[t])}`;
  const games: [string, TeamGame][] = [['Semifinal 1', ysg.semis[0]], ['Semifinal 2', ysg.semis[1]], ['Final', ysg.final]];
  return [
    ...games.flatMap(([title, g]) => teamGameLines(g, label, name, i => `${title} · round ${i + 1}`).map(l => ({ ...l, side: undefined, group: l.group === 'Final' || l.group === 'Roll-off' ? `${title} · ${l.group.toLowerCase()}` : l.group }))),
    { group: 'Champions', text: `Champions: ${label(ysg.champion)}` },
  ];
}

export function YsgStep(props: StepProps) {
  const { state, doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  if (doc.ysg) return <StaticLines lines={ysgLines(doc, name)} />;
  if (ev.pending) return <DiceReveal lines={ysgLines(ev.pending.doc, name)} onFinished={ev.onFinished} busy={saving} />;
  if (readOnly) return <p className="muted">Not played yet.</p>;
  return <button className="btn primary" disabled={saving} onClick={() => ev.start(runYoungStar(doc, Math.random))}>Run the Young-Star tournament</button>;
}

function asgLines(doc: NonNullable<StepProps['doc']>, name: (id: string) => string): RevealLine[] {
  const teams = asgTeams(doc);
  const label = (t: number) => `Team ${name(teams[t][0])}`;
  return [...teamGameLines(doc.asg!.game, label, name, i => `Q${i + 1}`), { group: 'MVP', text: `MVP: ${name(doc.asg!.mvp)}` }];
}

export function AsgStep(props: StepProps) {
  const { doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const teams = asgTeams(doc);
  const sides = [`Team ${name(teams[0][0])}`, `Team ${name(teams[1][0])}`];
  if (doc.asg) return <StaticLines lines={asgLines(doc, name)} />;
  if (ev.pending) return <DiceReveal lines={asgLines(ev.pending.doc, name)} sides={sides} onFinished={ev.onFinished} busy={saving} />;
  if (readOnly) return <p className="muted">Not played yet.</p>;
  return <button className="btn primary" disabled={saving} onClick={() => ev.start(runAsg(doc, list, Math.random))}>Play the All-Star Game</button>;
}

export function WrapUp({ state, doc, list, saving, finished, onFinish }: StepProps & { finished: boolean; onFinish: () => void }) {
  if (!doc?.fivePoint || !doc.dunk || !doc.ysg || !doc.asg) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  const teams = asgTeams(doc);
  const g = doc.asg.game;
  return (
    <div className="card">
      <h3>All-Star weekend results</h3>
      <ul>
        <li>5pt contest: {name(doc.fivePoint.winner)}</li>
        <li>Dunk contest: {name(doc.dunk.winner)}</li>
        <li>Young-Star champions: Team {name(doc.selections!.youngCaptains[doc.ysg.champion])}</li>
        <li>All-Star Game: Team {name(teams[g.winner][0])} {g.scores[g.winner]}–{g.scores[1 - g.winner]} · MVP {name(doc.asg.mvp)}</li>
      </ul>
      {finished ? <p className="muted">The All-Star weekend is finished.</p> : (
        <button className="btn primary" disabled={saving} onClick={onFinish}>Finish All-Star weekend</button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the events into `AllStarPage.tsx`**

- Import `AsgStep, ContestStep, WrapUp, YsgDraftStep, YsgStep` from `'./EventSteps'`, `finishAllStar` from `'../../engine/allstar/steps'` (add it to the existing import), and `commitSeason` from `'../season/commitSeason'`.
- Add this `finish` function after `save`:

```tsx
  const finish = async () => {
    const r = finishAllStar(state);
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    try {
      await commitSeason(r, versions);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
```

- Replace the whole placeholder block (`{!['selections', 'asgDraft', 'contestDraw'].includes(shown) && (…This event is built in the next task.…)}`) with:

```tsx
      {(shown === 'fivePoint' || shown === 'dunk') && <ContestStep key={shown} {...props} contest={shown === 'fivePoint' ? '5pt' : 'dunk'} />}
      {shown === 'ysgDraft' && <YsgDraftStep {...props} />}
      {shown === 'ysg' && <YsgStep {...props} />}
      {shown === 'asg' && <AsgStep {...props} />}
      {shown === 'wrapup' && <WrapUp {...props} finished={step === 'done'} onFinish={finish} />}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run app/allstar && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/app
git commit -m "feat: All-Star events (dice reveal, contests, Young-Star tournament, All-Star Game, wrap-up)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Team page season view (PPG, schedule and results), and the README

**Files:**
- Modify: `web/app/components/RosterTable.tsx` (optional `ppg` column)
- Modify: `web/app/pages/TeamPage.tsx`
- Create: `web/app/pages/TeamSeason.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `playerSeasonStats` (Task 6), `ScheduleFile`, `ResultsFile`, `seasonDocs`, `stubApi`.
- Produces:
  - `RosterTable` gains an optional `ppg?: Map<string, number>` prop, which adds a PPG column.
  - The team page gets a "Schedule & results" table.

- [ ] **Step 1: Write the failing test**

Create `web/app/pages/TeamSeason.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { recordGames, simNextGames } from '../../engine/season/moves';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { TeamPage } from './TeamPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('team page season view', () => {
  it('shows PPG and the team schedule with results', async () => {
    const s = fbaSeasonState();
    const r = recordGames(s, simNextGames(s, 2, mulberry32(3)).games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    stubApi(seasonDocs(r.state));
    const played = r.state.results!.games[0];
    render(
      <MemoryRouter initialEntries={[`/league/fba/team/${played.home}`]}>
        <Routes><Route path="/league/:league/team/:teamId" element={<TeamPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('PPG')).toBeTruthy();
    const sched = await screen.findByRole('table', { name: 'Schedule & results' });
    const rows = within(sched).getAllByRole('row').slice(1);
    const teamGames = r.state.schedule!.games.filter(g => g.home === played.home || g.away === played.home);
    expect(rows).toHaveLength(teamGames.length);
    expect(rows[0].textContent).toMatch(/^\d+(vs|@) [A-Z]+([WL] \d+-\d+|—)$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/pages/TeamSeason.test.tsx`
Expected: FAIL (there's no PPG column or schedule table).

- [ ] **Step 3: Add the PPG column to `RosterTable`**

In `web/app/components/RosterTable.tsx`:
- Add `ppg?: Map<string, number>` to the props.
- Render `{ppg && <th className="num">PPG</th>}` after the column headers (before the extra column).
- In each row, render `{ppg && <td className="num">{e.playerId && ppg.has(e.playerId) ? ppg.get(e.playerId)!.toFixed(1) : '—'}</td>}` in the same position.

- [ ] **Step 4: Add the season view to `TeamPage.tsx`**

Import `playerSeasonStats` from `'../../engine/season/ratingPause'`, and `ResultsFile, ScheduleFile` from the types. After the existing `rosters` `useDoc`, add:

```tsx
  const seasonal = (league === 'fba' || league === 'fbad2') && season !== undefined;
  const { data: schedule } = useDoc<ScheduleFile>(seasonal ? `leagues/${league}/S${season}/schedule.json` : null);
  const { data: results } = useDoc<ResultsFile>(seasonal ? `leagues/${league}/S${season}/results.json` : null);
```

Then, after the early returns (next to `const entries = …`), add:

```tsx
  const stats = playerSeasonStats(results ?? null);
  const ppg = new Map([...stats].map(([id, s]) => [id, s.games ? s.pts / s.games : 0]));
  const myGames = schedule ? schedule.games.filter(g => g.home === team.teamId || g.away === team.teamId) : [];
```

Pass `ppg={results ? ppg : undefined}` to `<RosterTable …>`. After the roster's `.table-wrap`, render:

```tsx
      {myGames.length > 0 && (
        <div className="table-wrap">
          <h2>S{season} schedule &amp; results</h2>
          <table className="roster" aria-label="Schedule & results">
            <thead><tr><th>#</th><th>Opponent</th><th>Result</th></tr></thead>
            <tbody>
              {myGames.map(g => {
                const r = results?.games[g.gameNo - 1];
                const home = g.home === team.teamId;
                const mine = r ? (home ? r.homePts : r.awayPts) : 0;
                const theirs = r ? (home ? r.awayPts : r.homePts) : 0;
                return (
                  <tr key={g.gameNo}>
                    <td>{g.gameNo}</td>
                    <td>{home ? 'vs ' : '@ '}{home ? g.away : g.home}</td>
                    <td>{r ? `${mine > theirs ? 'W' : 'L'} ${mine}-${theirs}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 5: README**

In `README.md`, after the `### Offseason: the D2 cycle` section, add:

```markdown
### Season play (S79 regular season)
- **Schedules** (`/schedules`, the "Make S79 Schedules" calendar step): builds the FBA (86 games per team) and D2 (30 per team) schedules with the Java scheduling rules. You can re-roll until the first game is played.
- **Scores** (`/league/<fba|fbad2>/scores`): game days, Quick-sim next game, Sim rest of day, and Sim to… (a day, the next pause, or the end of the regular season). Every day is saved on its own, so Undo steps back one day.
- **Live game** (Watch): the scorebug, play-by-play, win probability and box score, possession by possession (it slows down in the clutch). It is saved at the final buzzer.
- **Standings**: FBA conferences with the Java clinch markers (`*` #1 seed, `x` playoffs, `n` eliminated) and lottery standings; D2's four leagues.
- **FBA pauses**:
  - after games 322, 645 and 967, a rating editor that suggests ±2 from scoring vs. expectation
  - at 645, the trade deadline (Close trading makes trades read-only for the season)
  - at 967, the All-Star weekend: selections, the captains' draft, the contest draw, the 5pt and dunk contests, the Young-Star tournament, and the All-Star Game on 2d6 dice
- **Roster locks**: after free agency closes, rosters only change as the season allows (FBA trades until the deadline).
```

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/app README.md
git commit -m "feat: team page PPG and schedule/results; README for season play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After all tasks: browser check (controller)

Use a scratch copy of the data, as in the D2 cycle plan: a throwaway data server on 5184 and Vite on 5183 (with the Vite config temporarily inside `web/` and deleted afterwards). In the copy:
1. Close free agency and finish the D2 cycle (or mark those calendar steps done), then **Make schedules**.
2. Sim the whole D2 season. Check the D2 standings and that the `fba-d2` calendar step is done.
3. Sim the FBA season:
   - At pause 1, adjust a rating and Continue.
   - At pause 2, adjust ratings, then Close trading, and confirm the trade page is read-only.
   - At pause 3, adjust ratings, then run the whole All-Star weekend.
   - Watch one game live, including the clutch slowdown and OT if it happens.
   - Sim to the end of the regular season.
4. Check the standings markers and the lottery table.
5. Stop both processes, delete the scratch data and config, and confirm that `git status` shows `web/data` unchanged.
