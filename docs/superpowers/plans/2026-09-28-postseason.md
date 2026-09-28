# Postseason (Part 2b-2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the S79 postseason for the D2 and then the FBA. That covers:
- seeding with the commissioner's tiebreak order;
- fixed best-of-7 brackets where every game is watched live;
- D2 promotion and relegation;
- confirmed-status standings markers;
- marking the calendar step done when the last final is saved.

**Architecture:**
- **Engine:** pure TypeScript in `web/engine/playoffs/`:
  - `ranker.ts`: power rankings;
  - `tiebreak.ts`: seed order and notes;
  - `bracket.ts`: pairings, 2-2-1-1-1 home court and the Java rotation;
  - `promotion.ts`: the S78 D2 rule;
  - `moves.ts`: the moves.
- **Data:** one new document, `leagues/<league>/S<season>/playoffs.json`, added to `SeasonState` as the `'playoffs'` doc key. Moves save through the existing `commitSeason` with the loaded versions.
- **UI:**
  - The live part of `GamePage` becomes a shared `LiveGame` component.
  - New pages: a Playoffs tab and a playoff game page.
  - Existing pages touched: Standings, Scores and Home.

**Tech Stack:**
- Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict schemas)
- Vitest 2 with jsdom and Testing Library

**Spec:** `docs/superpowers/specs/2026-09-27-postseason-design.md`

## Global Constraints

- **Repo and commands:** repo root `C:/Users/carso/OneDrive/Documents/Fun/Code/creative_vscode/FBA`. Run every command from `web/`: `npx vitest run <paths>` and `npx tsc --noEmit`. tsc must print nothing.
- **Branch:** work on `postseason`. Never commit to `main`.
- **Read-only folders:** never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/` or `FBA Logos/`. Tests may *read* `FBA/Results.txt` and `FBA/Rankings.txt`.
- **Real save data:** never modify `web/data/**`.
- **Dev servers:** don't start or stop dev servers on 5173/5174.
- **Stray files:** leave none. Put scratch files in `.superpowers/sdd/`.
- **jsdom tests:** vitest globals are off, so every jsdom test file calls `cleanup()` in `afterEach`.
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Randomness:** every random choice in the engine takes an injected `Rng` (`engine/d2/random.ts`). Pages pass `Math.random`.
- **Move results:** moves return `{ ok: true, state, changed, label }` or `{ ok: false, problems }` (`SeasonResult` in `engine/season/state.ts`).
- **Tiebreak order (replaces the S61 list):**
  1. Overall record: games behind, then fewer games played, as in the Java.
  2. Conference wins (FBA only; the D2 plays only inside each league).
  3. Head-to-head: win% in games among the tied teams only.
  4. Point differential.
  5. Power rankings.

  When a step splits a tied group, each still-tied part restarts at head-to-head.
- **Brackets:**
  - First round: seeds 1v8, 2v7, 3v6, 4v5, as series `-R1-1` to `-R1-4`.
  - `SF-1` takes the winners of `R1-1` and `R1-4`; `SF-2` takes the winners of `R1-2` and `R1-3`.
  - FBA: the semifinal winners meet in `E-CF` / `W-CF`, whose winners meet in `FINALS`.
  - D2: the semifinal winners meet in `PL-F`, `WL-F`, `UL-F` and `IL-F`, with no cross-league final.
  - Best of 7, first to 4 wins.
  - The higher seed (lower number) hosts games 1, 2, 5 and 7; the other team hosts games 3, 4 and 6.
  - FINALS home court goes to the better team by the tiebreak order, without the conference step.
- **Rotation (Java `seriesQueue`):**
  - The first-round queue is, for k = 1..4, `E-R1-k` then `W-R1-k` for the FBA, and `PL-R1-k`, `WL-R1-k`, `UL-R1-k`, `IL-R1-k` for the D2.
  - After each game, an unfinished series goes to the back of the queue.
  - A next-round series joins the back when both of its teams are known.
  - Only the front game can be played.
- **D2 promotion (S78):**
  - Promoted from WL, UL and IL: the regular-season #1 and the playoff champion, or #2 if #1 won the playoffs.
  - Relegated from PL, WL and UL: the bottom two.
  - Nothing moves leagues in this part.
- **FBA pauses:** the default pauses gain `{ afterGame: <total games>, kind: 'ratings', done: false }` last. That's after game 1290 for the real schedule.

---

## File Structure

**Engine, `web/engine/playoffs/` (new)**

| File | Responsibility |
|---|---|
| `ranker.ts` | `powerRankings(games)`: port of `FootballRanker.doWeightedAndWinPercentAdjusted` |
| `tiebreak.ts` | `orderTeams(recs, opts)` → `{ order, notes }`, and `betterAcross` |
| `bracket.ts` | `buildBracket`, `hostOf`, `advance`, `finalId`, `FINALS`, `roundName` |
| `promotion.ts` | `promotion(order, champions)` |
| `moves.ts` | `seasonStandings`, `seedPreview`, `lockSeeds`, `nextPlayoffGame`, `recordPlayoffGame` |
| `testFixtures.ts` | Full-size FBA/D2 states, `regularSeasonDone`, `playPlayoffs` |
| `*.test.ts` | Unit tests, plus `season.e2e.test.ts` |

**Engine, existing files modified**
- `engine/shared/types.ts`: the `PlayoffsFile` schema.
- `engine/shared/schemaRegistry.ts`: the path rule.
- `engine/season/state.ts`: `playoffs` in `SeasonState`, `SeasonDocKey` and `seasonDocPath`.
- `engine/season/standings.ts`: the tiebreak order, notes, and D2/status/badge markers.
- `engine/season/moves.ts`: `recordGames` no longer marks the step done.
- `engine/season/schedule.ts`: the pause after the last game.
- `engine/season/testFixtures.ts`: exports `seasonStateFor`, and adds `playoffs: null`.

**App**
- `app/season/GameViews.tsx` (new): `LineScore`, `BoxTable`, `FinalView` and `periodName`, moved out of `GamePage`.
- `app/season/LiveGame.tsx` (new): the shared live viewer.
- `app/pages/GamePage.tsx`: now uses `LiveGame`.
- `app/playoffs/PlayoffGamePage.tsx` (new).
- `app/playoffs/PlayoffsPage.tsx` and `app/playoffs/Bracket.tsx` (new).
- `app/season/useSeasonState.ts` and `app/season/testDocs.ts`: load `playoffs.json`.
- `app/allstar/testState.ts`: `playoffs: null`.
- `app/components/LeagueTabs.tsx`: the Playoffs tab.
- `app/shell/Layout.tsx`: two routes.
- `app/pages/StandingsPage.tsx`: markers and legends.
- `app/pages/ScoresPage.tsx`: the Playoffs link.
- `app/pages/Home.tsx`: Continue goes to Playoffs once the regular season is over.
- `app/pages/season.css`: bracket and seed styles.

---

### Task 1: The `playoffs.json` schema and season-state plumbing

**Files:**
- Modify: `web/engine/shared/types.ts` (append at end of file)
- Modify: `web/engine/shared/schemaRegistry.ts`
- Modify: `web/engine/season/state.ts`
- Modify: `web/engine/season/testFixtures.ts`
- Modify: `web/app/allstar/testState.ts`
- Modify: `web/app/season/useSeasonState.ts`
- Modify: `web/app/season/testDocs.ts`
- Test: `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`

**Interfaces:**
- **Produces:**
  - `PlayoffsFile`, `PlayoffSeries`, `PlayoffGame` and `PromotionLine` (zod schemas and types) from `engine/shared/types.ts`;
  - `SeasonState.playoffs: PlayoffsFile | null`;
  - `SeasonDocKey` including `'playoffs'`;
  - `seasonDocPath('playoffs', league, season)`, which returns `leagues/<league>/S<season>/playoffs.json`;
  - `useSeasonState` loading `playoffs.json` (optional) and including its version.

- [ ] **Step 1: Write the failing schema tests**

Append to `web/engine/shared/types.test.ts`. Add `PlayoffsFile` to the existing import from `./types`.

```ts
describe('PlayoffsFile', () => {
  const r1 = (over: Record<string, unknown> = {}) => ({
    id: 'E-R1-1', group: 'E', round: 1, home: 'BOS', away: 'CAR', homeSeed: 1, awaySeed: 8,
    homeWins: 0, awayWins: 0, winner: null, next: 'E-SF-1', ...over,
  });
  const sf = { id: 'E-SF-1', group: 'E', round: 2, home: null, away: null, homeSeed: null, awaySeed: null, homeWins: 0, awayWins: 0, winner: null, next: null };
  const game = (over: Record<string, unknown> = {}) => ({
    gameNo: 1, home: 'BOS', away: 'CAR', homePts: 80, awayPts: 70, seriesId: 'E-R1-1', gameInSeries: 1, ...over,
  });
  const doc = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: false,
    seeds: [{ group: 'E', teams: ['BOS', 'DET', 'CIN', 'MAI', 'MAN', 'CAR', 'COL', 'DCB'], notes: ['MAN over CAR: conference record 37–19 vs 30–26'] }],
    series: [r1(), sf], queue: ['E-R1-1'], games: [], outcome: null, ...over,
  });

  it('accepts a fresh bracket and one played game', () => {
    expect(PlayoffsFile.safeParse(doc()).success).toBe(true);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game()] })).success).toBe(true);
  });

  it('accepts a finished series with its winner and a D2 promotion outcome', () => {
    const done = r1({ homeWins: 4, awayWins: 1, winner: 'BOS' });
    const games = [1, 2, 3, 4, 5].map(n => game({ gameNo: n, gameInSeries: n, homePts: n === 3 ? 60 : 80 }));
    const outcome = { champions: [{ group: 'E', teamId: 'BOS', runnerUp: 'CAR', score: '4–1' }], promotion: [{ league: 'WL', promoted: ['A', 'B'], relegated: ['C', 'D'] }] };
    expect(PlayoffsFile.safeParse(doc({ series: [done, sf], queue: [], games, outcome })).success).toBe(true);
  });

  it('rejects a winner without 4 wins, and 4 wins without a winner', () => {
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 3, winner: 'BOS' }), sf], queue: [], games: [1, 2, 3].map(n => game({ gameNo: n, gameInSeries: n })) })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 4 }), sf], queue: [], games: [1, 2, 3, 4].map(n => game({ gameNo: n, gameInSeries: n })) })).success).toBe(false);
  });

  it('rejects an unknown next series, and games that disagree with their series', () => {
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ next: 'E-SF-9' }), sf] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ home: 'DET' })] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ gameInSeries: 2 })] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 2 }), sf], games: [game()] })).success).toBe(false);
    expect(PlayoffsFile.safeParse(doc({ series: [r1({ homeWins: 1 }), sf], games: [game({ gameNo: 2 })] })).success).toBe(false);
  });

  it('rejects a queue with a finished series or a series missing a team', () => {
    expect(PlayoffsFile.safeParse(doc({ queue: ['E-R1-1', 'E-SF-1'] })).success).toBe(false);
    const done = r1({ homeWins: 4, winner: 'BOS' });
    const games = [1, 2, 3, 4].map(n => game({ gameNo: n, gameInSeries: n }));
    expect(PlayoffsFile.safeParse(doc({ series: [done, sf], queue: ['E-R1-1'], games })).success).toBe(false);
  });

  it('needs exactly 8 seeded teams per group and rejects unknown keys', () => {
    expect(PlayoffsFile.safeParse(doc({ seeds: [{ group: 'E', teams: ['BOS'], notes: [] }] })).success).toBe(false);
    expect(PlayoffsFile.safeParse({ ...doc(), extra: 1 }).success).toBe(false);
  });
});
```

Append to `web/engine/shared/schemaRegistry.test.ts`. Add `PlayoffsFile` to its import from `./types`, and add `import { seasonDocPath } from '../season/state';` if it isn't imported already.

```ts
describe('playoffs.json', () => {
  it('is registered for the FBA and D2 only', () => {
    expect(schemaForPath('leagues/fba/S79/playoffs.json')).toBe(PlayoffsFile);
    expect(schemaForPath('leagues/fbad2/S79/playoffs.json')).toBe(PlayoffsFile);
    expect(schemaForPath('leagues/fbajc/S79/playoffs.json')).toBeNull();
  });
  it('has a season doc path', () => {
    expect(seasonDocPath('playoffs', 'fbad2', 79)).toBe('leagues/fbad2/S79/playoffs.json');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/types.test.ts engine/shared/schemaRegistry.test.ts`
Expected: FAIL, with `PlayoffsFile` not exported and `'playoffs'` not a valid key.

- [ ] **Step 3: Add the schema**

Append to `web/engine/shared/types.ts`, after `AllStarFile`, so that `seasonLeague`, `GameResult` and `int` are already defined:

```ts
const teamRef = z.string().min(1);

export const PlayoffSeries = z.object({
  /** E-R1-1 … E-SF-2, E-CF, FINALS (FBA); PL-R1-1 … PL-F (D2). */
  id: z.string().min(1),
  /** Conference or D2 league; null for the FBA Finals. */
  group: z.string().min(1).nullable(),
  round: int.min(1).max(4),
  /** The team with home court in games 1, 2, 5 and 7 (null until known). */
  home: teamRef.nullable(),
  away: teamRef.nullable(),
  homeSeed: int.min(1).max(8).nullable(),
  awaySeed: int.min(1).max(8).nullable(),
  homeWins: int.min(0).max(4),
  awayWins: int.min(0).max(4),
  winner: teamRef.nullable(),
  next: z.string().min(1).nullable(),
}).strict();
export type PlayoffSeries = z.infer<typeof PlayoffSeries>;

/** A playoff game: `gameNo` counts playoff games in play order; home/away are that game's actual host and visitor. */
export const PlayoffGame = GameResult.extend({ seriesId: z.string().min(1), gameInSeries: int.min(1).max(7) }).strict();
export type PlayoffGame = z.infer<typeof PlayoffGame>;

export const PromotionLine = z.object({ league: z.string().min(1), promoted: z.array(teamRef), relegated: z.array(teamRef) }).strict();
export type PromotionLine = z.infer<typeof PromotionLine>;

export const PlayoffsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  seeds: z.array(z.object({ group: z.string().min(1), teams: z.array(teamRef).length(8), notes: z.array(z.string()) }).strict()),
  series: z.array(PlayoffSeries),
  /** The Java rotation: unfinished series with both teams known, front first. */
  queue: z.array(z.string().min(1)),
  games: z.array(PlayoffGame),
  outcome: z.object({
    champions: z.array(z.object({ group: z.string().min(1).nullable(), teamId: teamRef, runnerUp: teamRef, score: z.string().min(1) }).strict()),
    /** D2 only. */
    promotion: z.array(PromotionLine).nullable(),
  }).strict().nullable(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const byId = new Map(doc.series.map(s => [s.id, s]));
  if (byId.size !== doc.series.length) issue('Series ids must be unique');
  for (const s of doc.series) {
    if (s.homeWins === 4 && s.awayWins === 4) issue(`${s.id}: only one side can have 4 wins`);
    const leader = s.homeWins === 4 ? s.home : s.awayWins === 4 ? s.away : null;
    if ((leader === null) !== (s.winner === null) || (leader !== null && s.winner !== leader)) {
      issue(`${s.id}: the winner must be set exactly when a side has 4 wins, and be that side`);
    }
    if (s.next !== null && !byId.has(s.next)) issue(`${s.id}: next series ${s.next} doesn't exist`);
  }
  if (new Set(doc.queue).size !== doc.queue.length) issue('The queue lists a series twice');
  for (const id of doc.queue) {
    const s = byId.get(id);
    if (!s) issue(`The queue lists unknown series ${id}`);
    else if (s.winner !== null || s.home === null || s.away === null) issue(`The queue lists ${id}, which is finished or missing a team`);
  }
  const counts = new Map<string, number>();
  doc.games.forEach((g, k) => {
    if (g.gameNo !== k + 1) issue(`Playoff game ${k + 1} has gameNo ${g.gameNo}`);
    const s = byId.get(g.seriesId);
    if (!s) {
      issue(`Playoff game ${g.gameNo}: unknown series ${g.seriesId}`);
      return;
    }
    const n = (counts.get(g.seriesId) ?? 0) + 1;
    counts.set(g.seriesId, n);
    if (g.gameInSeries !== n) issue(`Playoff game ${g.gameNo}: expected game ${n} of ${g.seriesId}`);
    const pair = [s.home, s.away];
    if (g.home === g.away || !pair.includes(g.home) || !pair.includes(g.away)) issue(`Playoff game ${g.gameNo}: teams don't match ${g.seriesId}`);
  });
  for (const s of doc.series) {
    if ((counts.get(s.id) ?? 0) !== s.homeWins + s.awayWins) issue(`${s.id}: wins don't match its games`);
  }
});
export type PlayoffsFile = z.infer<typeof PlayoffsFile>;
```

- [ ] **Step 4: Register the path**

In `web/engine/shared/schemaRegistry.ts`, add `PlayoffsFile` to the import list, and add this rule after the `ScheduleFile` rule:

```ts
  [new RegExp(`^leagues/(fba|fbad2)/${S}/playoffs\\.json$`), PlayoffsFile],
```

- [ ] **Step 5: Add playoffs to the season state**

In `web/engine/season/state.ts`:
- Add `PlayoffsFile` to the type import from `../shared/types`.
- Add the field to `SeasonState`, after `allstar`:

```ts
  /** This league's postseason, once the seeds are locked. */
  playoffs: PlayoffsFile | null;
```

- Replace the `SeasonDocKey` line with:

```ts
export type SeasonDocKey = 'rosters' | 'calendar' | 'tx' | 'schedule' | 'results' | 'ratingPause' | 'allstar' | 'playoffs';
```

- Add a case to `seasonDocPath`, before `'ratingPause'`:

```ts
    case 'playoffs': return `leagues/${league}/S${season}/playoffs.json`;
```

In `web/engine/season/testFixtures.ts`:
- Rename `function build(` to `export function seasonStateFor(`, and update its two callers (`fbaSeasonState`, `d2SeasonState`) to call `seasonStateFor`.
- In the returned object, add `playoffs: null,` after `allstar: null,`.
- Change `players: { nextId: firstId + 100, players: r.names },` to:

```ts
    players: { nextId: firstId + Math.max(100, Object.keys(r.names).length), players: r.names },
```

In `web/app/allstar/testState.ts`, change `ratingPause: null, allstar: null,` to `ratingPause: null, allstar: null, playoffs: null,`.

- [ ] **Step 6: Load playoffs in the app**

In `web/app/season/useSeasonState.ts`:
- Add `PlayoffsFile` to the type import.
- After the `results` line, add:

```ts
  const playoffs = useDoc<PlayoffsFile>(at('playoffs'));
```

- In `reload`, change the list to `[meta, teams, rosters, players, calendar, tx, schedule, results, playoffs, allstar, ratingPause]`.
- In `versions`, change the `keyed` list to include `['playoffs', playoffs]`:

```ts
    const keyed: [SeasonDocKey, DocState<unknown>][] = [['rosters', rosters], ['calendar', calendar], ['tx', tx], ['schedule', schedule], ['results', results], ['playoffs', playoffs]];
```

- Change `optional` to start with `[schedule, results, playoffs, ...`.
- In the returned `state`, add `playoffs: playoffs.data ?? null,` after `results: results.data ?? null,`.

In `web/app/season/testDocs.ts`, add this after the `results` line:

```ts
  if (state.playoffs) out[seasonDocPath('playoffs', league, season)] = state.playoffs;
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run engine/shared app/season app/allstar && npx tsc --noEmit`
Expected: PASS. tsc prints nothing.

- [ ] **Step 8: Run the whole suite, then commit**

Run: `npx vitest run`
Expected: all tests pass, including `data.test.ts`, since no `playoffs.json` exists in `web/data`.

```bash
git add web/engine/shared/types.ts web/engine/shared/types.test.ts web/engine/shared/schemaRegistry.ts web/engine/shared/schemaRegistry.test.ts web/engine/season/state.ts web/engine/season/testFixtures.ts web/app/allstar/testState.ts web/app/season/useSeasonState.ts web/app/season/testDocs.ts
git commit -m "feat: playoffs.json schema and season-state plumbing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Power rankings (port of the Java `FootballRanker`)

**Files:**
- Create: `web/engine/playoffs/ranker.ts`
- Test: `web/engine/playoffs/ranker.test.ts`

**Interfaces:**
- **Produces:** `powerRankings(games: RankGame[]): string[]`, which returns team names or ids best-first. Teams with no wins are left out, as in the Java. It also exports `interface RankGame { home: string; away: string; homePts: number; awayPts: number }`. `GameResult` satisfies this interface.

**Java reference:**
- `FBA/src/fba/FootballRanker.java`: `buildGraph`, `addEdge`, `rankByScoreAdjustWinPercentage` and `AveCostComparator`.
- `FBA/src/fba/Graph.java`: `dijkstra`, `findAllPaths` and `getAllPaths`.

**Rules:**
- **Edges:** each decided game adds an edge from winner to loser with cost `|1 / by|`. `by` is `trunc((homePts − awayPts) / 8)`, and 0 becomes 1.
- **Repeat meetings:** a later game between the same winner and loser *replaces* the edge cost.
- **Tied games** are skipped.
- **Score for each team with at least one reachable team:**
  - `total` is the sum of shortest-path costs to every reachable team;
  - `paths` is the count of reachable teams;
  - the score is `(total / paths) × (1 / winPct)`.
- **Order:** ascending by score, then by name.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/playoffs/ranker.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { powerRankings, type RankGame } from './ranker';

const JAVA = path.join(__dirname, '..', '..', '..', 'FBA');

function javaResults(count: number): RankGame[] {
  return readFileSync(path.join(JAVA, 'Results.txt'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim().length > 1)
    .slice(0, count)
    .map(l => {
      const a = l.trim().split(',');
      return { home: a[1], homePts: Number(a[2]), away: a[3], awayPts: Number(a[4]) };
    });
}

function javaRankings(): string[] {
  return readFileSync(path.join(JAVA, 'Rankings.txt'), 'utf8').split(/\r?\n/)
    .filter(l => /^\d+\./.test(l))
    .map(l => l.replace(/^\d+\./, '').split(':')[0]);
}

describe('powerRankings', () => {
  it('reproduces the Java Rankings.txt from the first 1280 games of Results.txt', () => {
    const java = javaRankings();
    expect(java).toHaveLength(30);
    expect(powerRankings(javaResults(1280))).toEqual(java);
  });

  it('ranks a clear chain best-first and leaves winless teams out', () => {
    const g = (home: string, homePts: number, away: string, awayPts: number): RankGame => ({ home, homePts, away, awayPts });
    // A beats B and C; B beats C; C never wins.
    expect(powerRankings([g('A', 90, 'B', 70), g('B', 80, 'C', 60), g('A', 85, 'C', 60)])).toEqual(['A', 'B']);
  });

  it('skips tied games and lets a later meeting replace the edge cost', () => {
    const g = (home: string, homePts: number, away: string, awayPts: number): RankGame => ({ home, homePts, away, awayPts });
    expect(powerRankings([g('A', 70, 'B', 70)])).toEqual([]);
    // Both teams have one win over the other; a blowout replaces A's narrow win, so A's path cost is lower.
    const narrowThenBlowout = [g('A', 71, 'B', 70), g('B', 71, 'A', 70), g('A', 110, 'B', 70)];
    expect(powerRankings(narrowThenBlowout)[0]).toBe('A');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/playoffs/ranker.test.ts`
Expected: FAIL, because `./ranker` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `web/engine/playoffs/ranker.ts`:

```ts
/**
 * Power rankings: a port of the Java FootballRanker.doWeightedAndWinPercentAdjusted
 * (FBA/src/fba/FootballRanker.java with Graph.java). An edge runs from each game's winner to its loser,
 * costing less the more lopsided the win; each team's average shortest-path cost to every team it
 * reaches is divided by its win percentage. Lower is better.
 */

export interface RankGame { home: string; away: string; homePts: number; awayPts: number }

/** The Java's TD_PLUS: every 8 points of margin halves (then thirds, …) the edge cost. */
const TD_PLUS = 8;

/** Dijkstra from `start`; returns the cost to every reachable team (start included at 0). */
function shortestPaths(edges: Map<string, Map<string, number>>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [team, d] of dist) {
      if (!done.has(team) && d < best) {
        best = d;
        cur = team;
      }
    }
    if (cur === null) return dist;
    done.add(cur);
    for (const [next, cost] of edges.get(cur) ?? []) {
      const d = best + cost;
      if (d < (dist.get(next) ?? Infinity)) dist.set(next, d);
    }
  }
}

/** Teams best-first. A team with no wins reaches nobody, so (as in the Java) it isn't ranked. */
export function powerRankings(games: RankGame[]): string[] {
  const edges = new Map<string, Map<string, number>>();
  const record = new Map<string, { w: number; l: number }>();
  for (const g of games) {
    const diff = g.homePts - g.awayPts;
    if (diff === 0) continue;
    for (const t of [g.home, g.away]) {
      if (!record.has(t)) record.set(t, { w: 0, l: 0 });
      if (!edges.has(t)) edges.set(t, new Map());
    }
    let by = Math.trunc(diff / TD_PLUS);
    if (by === 0) by = 1;
    const [winner, loser] = diff > 0 ? [g.home, g.away] : [g.away, g.home];
    // A later game between the same winner and loser replaces the edge, as Graph.addEdge does.
    edges.get(winner)!.set(loser, Math.abs(1 / by));
    record.get(winner)!.w++;
    record.get(loser)!.l++;
  }
  const scored: { team: string; score: number }[] = [];
  for (const start of edges.keys()) {
    let paths = 0;
    let total = 0;
    for (const [team, d] of shortestPaths(edges, start)) {
      if (team !== start && d > 0) {
        paths++;
        total += d;
      }
    }
    if (paths === 0) continue;
    const r = record.get(start)!;
    scored.push({ team: start, score: (total / paths) * (1 / (r.w / (r.w + r.l))) });
  }
  scored.sort((a, b) => a.score - b.score || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0));
  return scored.map(s => s.team);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/playoffs/ranker.test.ts`
Expected: PASS, 3 tests. (This port was checked against `FBA/Rankings.txt` during planning, and all 30 teams matched exactly.)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`, which should print nothing.

```bash
git add web/engine/playoffs/ranker.ts web/engine/playoffs/ranker.test.ts
git commit -m "feat: power rankings, ported from the Java FootballRanker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tiebreak order and notes, used by the standings

**Files:**
- Create: `web/engine/playoffs/tiebreak.ts`
- Modify: `web/engine/season/standings.ts`
- Test: `web/engine/playoffs/tiebreak.test.ts`
- Modify (as needed): `web/engine/season/standings.test.ts`

**Interfaces:**
- **Consumes:** `TeamRecord` (type) from `engine/season/standings.ts`, and `powerRankings` from Task 2.
- **Produces:**
  - `interface TieNote { teams: string[]; text: string }`;
  - `interface TieOptions { conference: boolean; ranks: () => string[] }`;
  - `orderTeams(recs: TeamRecord[], opts: TieOptions): { order: TeamRecord[]; notes: TieNote[] }`;
  - `betterAcross(a: TeamRecord, b: TeamRecord, ranks: () => string[]): boolean`.
  - `Standings.groups[k]` gains `notes: TieNote[]`, and `standings()` orders each group with `orderTeams`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/playoffs/tiebreak.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { TeamRecord } from '../season/standings';
import { betterAcross, orderTeams } from './tiebreak';

const rec = (teamId: string, w: number, l: number, extra: Partial<TeamRecord> = {}): TeamRecord => ({
  teamId, group: 'E', w, l, confW: 0, confL: 0, pf: 0, pa: 0, h2h: new Map(), log: [], ...extra,
});
const ids = (r: { order: TeamRecord[] }) => r.order.map(t => t.teamId);
const noRanks = () => { throw new Error('ranks should not be needed'); };

describe('orderTeams', () => {
  it('orders by overall record, then fewer games played', () => {
    // B and C are both 3 games over .500, but C has played fewer games (the Java's second check).
    const r = orderTeams([rec('B', 9, 6), rec('A', 10, 5), rec('C', 8, 5)], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'C', 'B']);
    expect(r.notes).toEqual([]);
  });

  it('breaks a tie by conference record (FBA) with a note', () => {
    const r = orderTeams([rec('CAR', 50, 36, { confW: 30, confL: 26 }), rec('MAN', 50, 36, { confW: 37, confL: 19 })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['MAN', 'CAR']);
    expect(r.notes).toEqual([{ teams: ['MAN', 'CAR'], text: 'MAN over CAR: conference record 37–19 vs 30–26' }]);
  });

  it('skips conference record when told to (D2, and the FBA Finals)', () => {
    const a = rec('A', 5, 5, { confW: 1, h2h: new Map([['B', 0]]) });
    const b = rec('B', 5, 5, { confW: 5, h2h: new Map([['A', 2]]) });
    expect(ids(orderTeams([a, b], { conference: false, ranks: noRanks }))).toEqual(['B', 'A']);
  });

  it('breaks a two-team tie by head-to-head', () => {
    const r = orderTeams([rec('DET', 55, 31, { h2h: new Map([['BOS', 1]]) }), rec('BOS', 55, 31, { h2h: new Map([['DET', 3]]) })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['BOS', 'DET']);
    expect(r.notes[0].text).toBe('BOS over DET: head-to-head 3–1');
  });

  it('uses head-to-head among only the tied teams for a three-way tie', () => {
    const a = rec('A', 10, 10, { h2h: new Map([['B', 2], ['C', 1], ['Z', 5]]) });
    const b = rec('B', 10, 10, { h2h: new Map([['A', 0], ['C', 2]]) });
    const c = rec('C', 10, 10, { h2h: new Map([['A', 1], ['B', 0]]) });
    const r = orderTeams([c, b, a], { conference: false, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'B', 'C']);
    expect(r.notes[0].text).toBe('A, B, C: head-to-head 3–1, 2–2, 1–3');
  });

  it('restarts at head-to-head after a split', () => {
    // Everyone is 2–2 among the three, so head-to-head can't split them; point differential puts A first,
    // and then B and C restart at head-to-head, where B beat C twice.
    const a = rec('A', 10, 10, { pf: 150, pa: 100, h2h: new Map([['B', 2], ['C', 0]]) });
    const b = rec('B', 10, 10, { pf: 110, pa: 100, h2h: new Map([['A', 0], ['C', 2]]) });
    const c = rec('C', 10, 10, { pf: 110, pa: 100, h2h: new Map([['A', 2], ['B', 0]]) });
    const r = orderTeams([c, a, b], { conference: false, ranks: noRanks });
    expect(ids(r)).toEqual(['A', 'B', 'C']);
    expect(r.notes.map(n => n.text)).toEqual(['A, C, B: point differential +50, +10, +10', 'B over C: head-to-head 2–0']);
  });

  it('breaks a tie by point differential when head-to-head is even or unplayed', () => {
    const r = orderTeams([rec('A', 5, 5, { pf: 500, pa: 490 }), rec('B', 5, 5, { pf: 500, pa: 470 })], { conference: true, ranks: noRanks });
    expect(ids(r)).toEqual(['B', 'A']);
    expect(r.notes[0].text).toBe('B over A: point differential +30 vs +10');
  });

  it('falls back to the power rankings, asking for them only then', () => {
    const ranks = vi.fn(() => ['X', 'VEG', 'Y', 'MIL']);
    const r = orderTeams([rec('MIL', 23, 63), rec('VEG', 23, 63)], { conference: true, ranks });
    expect(ids(r)).toEqual(['VEG', 'MIL']);
    expect(r.notes[0].text).toBe('VEG over MIL: power ranking #2 vs #4');
    expect(ranks).toHaveBeenCalledTimes(1);
    const untied = vi.fn(() => []);
    orderTeams([rec('A', 2, 0), rec('B', 1, 1)], { conference: true, ranks: untied });
    expect(untied).not.toHaveBeenCalled();
  });

  it('puts unranked (winless) teams after ranked ones, then by id', () => {
    const r = orderTeams([rec('C', 0, 4), rec('B', 0, 4), rec('A', 0, 4)], { conference: true, ranks: () => ['C'] });
    expect(ids(r)).toEqual(['C', 'A', 'B']);
    expect(r.notes[0].text).toBe('C, A, B: power ranking #1, unranked, unranked');
  });
});

describe('betterAcross (FBA Finals home court)', () => {
  it('compares records, then head-to-head, ignoring conference record', () => {
    expect(betterAcross(rec('E1', 60, 26), rec('W1', 58, 28), noRanks)).toBe(true);
    const e = rec('E1', 60, 26, { confW: 50, h2h: new Map([['W1', 0]]) });
    const w = rec('W1', 60, 26, { group: 'W', confW: 10, h2h: new Map([['E1', 2]]) });
    expect(betterAcross(e, w, noRanks)).toBe(false);
    expect(betterAcross(w, e, noRanks)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/playoffs/tiebreak.test.ts`
Expected: FAIL, because `./tiebreak` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `web/engine/playoffs/tiebreak.ts`:

```ts
import type { TeamRecord } from '../season/standings';

/** One tie the order broke, in plain words, e.g. "MAN over CAR: conference record 37–19 vs 30–26". */
export interface TieNote { teams: string[]; text: string }

export interface TieOptions {
  /** Compare conference wins (FBA teams in the same conference). */
  conference: boolean;
  /** Power rankings, best first. Called only if a tie gets that far. */
  ranks: () => string[];
}

const net = (r: TeamRecord) => r.w - r.l;
const played = (r: TeamRecord) => r.w + r.l;
const diff = (r: TeamRecord) => r.pf - r.pa;
const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

/** Splits a sorted list into runs of neighbours that `same` says are equal. */
function runs<T>(list: T[], same: (a: T, b: T) => boolean): T[][] {
  const out: T[][] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && same(last[last.length - 1], x)) last.push(x);
    else out.push([x]);
  }
  return out;
}

function note(sorted: TeamRecord[], label: string, value: (r: TeamRecord) => string, firstOnly = false): TieNote {
  const teams = sorted.map(r => r.teamId);
  if (sorted.length === 2) {
    const [a, b] = sorted;
    const vals = firstOnly ? value(a) : `${value(a)} vs ${value(b)}`;
    return { teams, text: `${a.teamId} over ${b.teamId}: ${label} ${vals}` };
  }
  return { teams, text: `${teams.join(', ')}: ${label} ${sorted.map(value).join(', ')}` };
}

/** Each team's record in games against the other tied teams, or null if any of them hasn't played the others. */
function headToHead(group: TeamRecord[]): Map<string, { w: number; l: number }> | null {
  const out = new Map<string, { w: number; l: number }>();
  for (const a of group) {
    let w = 0;
    let l = 0;
    for (const b of group) {
      if (b === a) continue;
      w += a.h2h.get(b.teamId) ?? 0;
      l += b.h2h.get(a.teamId) ?? 0;
    }
    if (w + l === 0) return null;
    out.set(a.teamId, { w, l });
  }
  return out;
}

type Step = 'h2h' | 'diff' | 'rank';

function breakTie(group: TeamRecord[], step: Step, opts: TieOptions, notes: TieNote[]): TeamRecord[] {
  if (group.length < 2) return group;
  if (step === 'h2h') {
    const h = headToHead(group);
    if (h) {
      const pct = (r: TeamRecord) => { const x = h.get(r.teamId)!; return x.w / (x.w + x.l); };
      const sorted = [...group].sort((a, b) => pct(b) - pct(a));
      const parts = runs(sorted, (a, b) => pct(a) === pct(b));
      if (parts.length > 1) {
        notes.push(note(sorted, 'head-to-head', r => `${h.get(r.teamId)!.w}–${h.get(r.teamId)!.l}`, sorted.length === 2));
        return parts.flatMap(p => breakTie(p, 'h2h', opts, notes));
      }
    }
    return breakTie(group, 'diff', opts, notes);
  }
  if (step === 'diff') {
    const sorted = [...group].sort((a, b) => diff(b) - diff(a));
    const parts = runs(sorted, (a, b) => diff(a) === diff(b));
    if (parts.length > 1) {
      notes.push(note(sorted, 'point differential', r => signed(diff(r))));
      return parts.flatMap(p => breakTie(p, 'h2h', opts, notes));
    }
    return breakTie(group, 'rank', opts, notes);
  }
  const ranks = opts.ranks();
  const pos = (r: TeamRecord) => { const i = ranks.indexOf(r.teamId); return i < 0 ? Infinity : i; };
  const sorted = [...group].sort((a, b) => pos(a) - pos(b) || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  notes.push(note(sorted, 'power ranking', r => (pos(r) === Infinity ? 'unranked' : `#${pos(r) + 1}`)));
  return sorted;
}

/**
 * The commissioner's order: overall record (games behind, then fewer games played), conference wins
 * (when `conference`), head-to-head among the tied teams, point differential, power rankings.
 * After any split, each still-tied part restarts at head-to-head.
 */
export function orderTeams(recs: TeamRecord[], opts: TieOptions): { order: TeamRecord[]; notes: TieNote[] } {
  const notes: TieNote[] = [];
  const sorted = [...recs].sort((a, b) => net(b) - net(a) || played(a) - played(b) || (opts.conference ? b.confW - a.confW : 0));
  const order: TeamRecord[] = [];
  for (const block of runs(sorted, (a, b) => net(a) === net(b) && played(a) === played(b))) {
    if (block.length === 1) {
      order.push(block[0]);
      continue;
    }
    const parts = opts.conference ? runs(block, (a, b) => a.confW === b.confW) : [block];
    if (parts.length > 1) notes.push(note(block, 'conference record', r => `${r.confW}–${r.confL}`));
    for (const p of parts) order.push(...breakTie(p, 'h2h', opts, notes));
  }
  return { order, notes };
}

/** FBA Finals home court: is `a` the better team, without the conference step (they're from different conferences)? */
export function betterAcross(a: TeamRecord, b: TeamRecord, ranks: () => string[]): boolean {
  return orderTeams([a, b], { conference: false, ranks }).order[0] === a;
}
```

- [ ] **Step 4: Run the tiebreak tests**

Run: `npx vitest run engine/playoffs/tiebreak.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Use the order in `standings()`**

In `web/engine/season/standings.ts`:
- Add the imports:

```ts
import { powerRankings } from '../playoffs/ranker';
import { orderTeams, type TieNote } from '../playoffs/tiebreak';
```

- Change the `Standings` interface's groups line to:

```ts
  groups: { group: string; rows: StandingRow[]; notes: TieNote[] }[];
```

- Change `betterThan`'s doc comment to `/** Java Team.isBetterThan with point-differential and team-id fallbacks. Used for the lottery order only. */`.
- In `standings()`, replace the `better`/`groups` lines (keep `better`, since the lottery still uses it) with:

```ts
  const recs = records(teams, games);
  const better = (a: TeamRecord, b: TeamRecord) => betterThan(league, a, b);
  let ranked: string[] | null = null;
  const ranks = () => {
    if (ranked === null) ranked = powerRankings(games);
    return ranked;
  };
  const present = GROUP_ORDER[league].filter(code => teams.some(t => t.group === code));
  const groups = present.map(group => {
    const { order, notes } = orderTeams([...recs.values()].filter(r => r.group === group), { conference: league === 'fba', ranks });
    return { group, rows: toRows(league, order, len), notes };
  });
```

- [ ] **Step 6: Run the standings tests and fix only expectations about the old fallback**

Run: `npx vitest run engine/season app/pages/StandingsPage.test.tsx`

Tests that depended on the old post-head-to-head fallback (point differential, then team id) inside a group may now get a different order, because ties now go point differential → power rankings. If a test fails *only* because of that, update its expected order to the new rule and say so in your report. Don't change `betterThan` or its tests.

- [ ] **Step 7: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/engine/playoffs/tiebreak.ts web/engine/playoffs/tiebreak.test.ts web/engine/season/standings.ts web/engine/season/standings.test.ts
git commit -m "feat: commissioner tiebreak order with notes, used by the standings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bracket and D2 promotion

**Files:**
- Create: `web/engine/playoffs/bracket.ts`
- Create: `web/engine/playoffs/promotion.ts`
- Test: `web/engine/playoffs/bracket.test.ts`, `web/engine/playoffs/promotion.test.ts`

**Interfaces:**
- **Consumes:** the `PlayoffSeries`, `PlayoffsFile` and `PromotionLine` types (Task 1), and `groupLabel` from `engine/shared/leagues.ts`.
- **Produces, from `bracket.ts`:**
  - `FINALS = 'FINALS'`;
  - `finalId(league, group)`, which returns `'E-CF'` (FBA) or `'PL-F'` (D2);
  - `buildBracket(league, seeds: { group: string; teams: string[] }[]): { series: PlayoffSeries[]; queue: string[] }`;
  - `hostOf(s: PlayoffSeries, gameInSeries: number): { home: string; away: string }`;
  - `advance(pf: { series: PlayoffSeries[]; queue: string[] }, seriesId: string, winnerId: string, better: (a: string, b: string) => boolean): { series: PlayoffSeries[]; queue: string[] }`;
  - `roundName(league, s: PlayoffSeries): string`;
  - `bracketColumns(league, group): string[][]`, for the UI.
- **Produces, from `promotion.ts`:** `promotion(order: Record<string, string[]>, champions: Record<string, string>): PromotionLine[]`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/playoffs/bracket.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { advance, bracketColumns, buildBracket, FINALS, finalId, hostOf, roundName } from './bracket';

const east = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'];
const west = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
const fba = () => buildBracket('fba', [{ group: 'E', teams: east }, { group: 'W', teams: west }]);
const find = (b: { series: { id: string }[] }, id: string) => b.series.find(s => s.id === id)!;
const never = () => { throw new Error('not the Finals'); };

describe('buildBracket', () => {
  it('pairs 1v8, 2v7, 3v6, 4v5 with fixed next slots and a Finals (FBA)', () => {
    const b = fba();
    expect(b.series).toHaveLength(15);
    expect(find(b, 'E-R1-1')).toMatchObject({ home: 'E1', away: 'E8', homeSeed: 1, awaySeed: 8, round: 1, next: 'E-SF-1' });
    expect(find(b, 'E-R1-4')).toMatchObject({ home: 'E4', away: 'E5', next: 'E-SF-1' });
    expect(find(b, 'E-R1-2')).toMatchObject({ home: 'E2', away: 'E7', next: 'E-SF-2' });
    expect(find(b, 'E-R1-3')).toMatchObject({ home: 'E3', away: 'E6', next: 'E-SF-2' });
    expect(find(b, 'E-SF-1')).toMatchObject({ round: 2, next: 'E-CF', home: null });
    expect(find(b, 'E-CF')).toMatchObject({ round: 3, next: FINALS });
    expect(find(b, FINALS)).toMatchObject({ group: null, round: 4, next: null });
  });

  it('starts the Java rotation: E 1v8, W 1v8, E 2v7, W 2v7, …', () => {
    expect(fba().queue).toEqual(['E-R1-1', 'W-R1-1', 'E-R1-2', 'W-R1-2', 'E-R1-3', 'W-R1-3', 'E-R1-4', 'W-R1-4']);
  });

  it('builds four D2 league brackets with no cross-league final', () => {
    const groups = ['PL', 'WL', 'UL', 'IL'].map(g => ({ group: g, teams: east.map(t => `${g}${t}`) }));
    const b = buildBracket('fbad2', groups);
    expect(b.series).toHaveLength(28);
    expect(find(b, 'PL-F')).toMatchObject({ round: 3, next: null });
    expect(b.queue.slice(0, 5)).toEqual(['PL-R1-1', 'WL-R1-1', 'UL-R1-1', 'IL-R1-1', 'PL-R1-2']);
    expect(finalId('fbad2', 'UL')).toBe('UL-F');
    expect(finalId('fba', 'W')).toBe('W-CF');
  });
});

describe('hostOf (2-2-1-1-1)', () => {
  it('gives the higher seed games 1, 2, 5, 7 and the other team games 3, 4, 6', () => {
    const s = find(fba(), 'E-R1-1');
    expect([1, 2, 3, 4, 5, 6, 7].map(n => hostOf(s, n).home)).toEqual(['E1', 'E1', 'E8', 'E8', 'E1', 'E8', 'E1']);
    expect(hostOf(s, 3).away).toBe('E1');
  });
});

describe('advance', () => {
  it('sends an unfinished series to the back of the queue', () => {
    const b = advance(fba(), 'E-R1-1', 'E8', never);
    expect(find(b, 'E-R1-1')).toMatchObject({ homeWins: 0, awayWins: 1, winner: null });
    expect(b.queue[0]).toBe('W-R1-1');
    expect(b.queue[b.queue.length - 1]).toBe('E-R1-1');
  });

  it('moves a winner on, gives the lower seed number home court, and queues the next series once both teams are known', () => {
    let b = fba();
    for (let k = 0; k < 4; k++) b = advance(b, 'E-R1-4', 'E5', never);
    expect(find(b, 'E-R1-4').winner).toBe('E5');
    expect(find(b, 'E-SF-1')).toMatchObject({ home: 'E5', homeSeed: 5, away: null });
    expect(b.queue).not.toContain('E-SF-1');
    for (let k = 0; k < 4; k++) b = advance(b, 'E-R1-1', 'E1', never);
    expect(find(b, 'E-SF-1')).toMatchObject({ home: 'E1', homeSeed: 1, away: 'E5', awaySeed: 5 });
    expect(b.queue[b.queue.length - 1]).toBe('E-SF-1');
  });

  it('decides Finals home court with `better`', () => {
    let b = fba();
    const win = (id: string, team: string) => { for (let k = 0; k < 4; k++) b = advance(b, id, team, (x, y) => x === 'W2' && y === 'E1'); };
    for (const g of ['E', 'W']) {
      win(`${g}-R1-1`, `${g}1`); win(`${g}-R1-4`, `${g}4`); win(`${g}-R1-2`, `${g}2`); win(`${g}-R1-3`, `${g}3`);
    }
    win('E-SF-1', 'E1'); win('E-SF-2', 'E2'); win('W-SF-1', 'W4'); win('W-SF-2', 'W2');
    win('E-CF', 'E1');
    win('W-CF', 'W2');
    expect(find(b, FINALS)).toMatchObject({ home: 'W2', away: 'E1' });
    expect(b.queue).toEqual([FINALS]);
  });
});

describe('labels and columns', () => {
  it('names rounds', () => {
    const b = fba();
    expect(roundName('fba', find(b, 'E-R1-2'))).toBe('East first round');
    expect(roundName('fba', find(b, 'W-CF'))).toBe('West conference finals');
    expect(roundName('fba', find(b, FINALS))).toBe('FBA Finals');
    const d2 = buildBracket('fbad2', [{ group: 'PL', teams: east }]);
    expect(roundName('fbad2', find(d2, 'PL-SF-1'))).toBe('Premier League semifinals');
    expect(roundName('fbad2', find(d2, 'PL-F'))).toBe('Premier League final');
  });
  it('lays a group out as columns that line up with the next round', () => {
    expect(bracketColumns('fba', 'E')).toEqual([['E-R1-1', 'E-R1-4', 'E-R1-2', 'E-R1-3'], ['E-SF-1', 'E-SF-2'], ['E-CF']]);
  });
});
```

Create `web/engine/playoffs/promotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { promotion } from './promotion';

const league = (g: string) => Array.from({ length: 16 }, (_, k) => `${g}${k + 1}`);
const order = { PL: league('PL'), WL: league('WL'), UL: league('UL'), IL: league('IL') };

describe('promotion (S78 rule)', () => {
  it('promotes #1 and the playoff champion, and relegates the bottom two', () => {
    expect(promotion(order, { PL: 'PL3', WL: 'WL5', UL: 'UL2', IL: 'IL8' })).toEqual([
      { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
      { league: 'WL', promoted: ['WL1', 'WL5'], relegated: ['WL15', 'WL16'] },
      { league: 'UL', promoted: ['UL1', 'UL2'], relegated: ['UL15', 'UL16'] },
      { league: 'IL', promoted: ['IL1', 'IL8'], relegated: [] },
    ]);
  });

  it('promotes #2 when #1 also won the playoffs', () => {
    const lines = promotion(order, { PL: 'PL1', WL: 'WL1', UL: 'UL1', IL: 'IL1' });
    expect(lines.map(l => l.promoted)).toEqual([[], ['WL1', 'WL2'], ['UL1', 'UL2'], ['IL1', 'IL2']]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/playoffs/bracket.test.ts engine/playoffs/promotion.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Write `bracket.ts`**

Create `web/engine/playoffs/bracket.ts`:

```ts
import type { SeasonLeague } from '../season/schedule';
import { groupLabel } from '../shared/leagues';
import type { PlayoffSeries } from '../shared/types';

/** Seed pairs of the first round, as series -R1-1 … -R1-4. */
export const PAIRS: [number, number][] = [[1, 8], [2, 7], [3, 6], [4, 5]];
export const FINALS = 'FINALS';

/** A group's last series: FBA conference finals, D2 league final. */
export const finalId = (league: SeasonLeague, group: string): string => (league === 'fba' ? `${group}-CF` : `${group}-F`);

const empty = (id: string, group: string | null, round: number, next: string | null): PlayoffSeries => ({
  id, group, round, home: null, away: null, homeSeed: null, awaySeed: null, homeWins: 0, awayWins: 0, winner: null, next,
});

/** The fixed bracket (Java whereToNext): 1/8 meets 4/5, 2/7 meets 3/6; conference champions meet in the Finals. */
export function buildBracket(league: SeasonLeague, seeds: { group: string; teams: string[] }[]): { series: PlayoffSeries[]; queue: string[] } {
  const series: PlayoffSeries[] = [];
  for (const { group, teams } of seeds) {
    const top = finalId(league, group);
    PAIRS.forEach(([h, a], k) => {
      series.push({ ...empty(`${group}-R1-${k + 1}`, group, 1, `${group}-SF-${k === 0 || k === 3 ? 1 : 2}`), home: teams[h - 1], away: teams[a - 1], homeSeed: h, awaySeed: a });
    });
    series.push(empty(`${group}-SF-1`, group, 2, top), empty(`${group}-SF-2`, group, 2, top));
    series.push(empty(top, group, 3, league === 'fba' ? FINALS : null));
  }
  if (league === 'fba') series.push(empty(FINALS, null, 4, null));
  const queue = PAIRS.flatMap((_, k) => seeds.map(s => `${s.group}-R1-${k + 1}`));
  return { series, queue };
}

/** 2-2-1-1-1: the other team hosts games 3, 4 and 6 (the Java swaps when 2, 3 or 5 games are played). */
export function hostOf(s: PlayoffSeries, gameInSeries: number): { home: string; away: string } {
  if (!s.home || !s.away) throw new Error(`${s.id} doesn't have both teams yet`);
  return [3, 4, 6].includes(gameInSeries) ? { home: s.away, away: s.home } : { home: s.home, away: s.away };
}

/**
 * Records one game's winner and moves the bracket on, the Java way: the series leaves the front of the
 * queue and goes to the back unless it's over; a finished series' winner fills its next slot (lower seed
 * number at home, or `better` for the Finals) and the next series joins the queue once both teams are known.
 */
export function advance(
  pf: { series: PlayoffSeries[]; queue: string[] },
  seriesId: string,
  winnerId: string,
  better: (a: string, b: string) => boolean,
): { series: PlayoffSeries[]; queue: string[] } {
  const series = pf.series.map(s => ({ ...s }));
  const byId = new Map(series.map(s => [s.id, s]));
  const s = byId.get(seriesId);
  if (!s) throw new Error(`Unknown series ${seriesId}`);
  if (winnerId === s.home) s.homeWins++;
  else s.awayWins++;
  let queue = pf.queue.filter(id => id !== seriesId);
  if (s.homeWins < 4 && s.awayWins < 4) return { series, queue: [...queue, seriesId] };
  s.winner = winnerId;
  const seed = winnerId === s.home ? s.homeSeed : s.awaySeed;
  const next = s.next ? byId.get(s.next) : undefined;
  if (next) {
    if (next.home === null) {
      next.home = winnerId;
      next.homeSeed = seed;
    } else {
      const other = next.home;
      const otherSeed = next.homeSeed;
      const winnerFirst = next.id === FINALS ? better(winnerId, other) : (seed ?? 9) < (otherSeed ?? 9);
      if (winnerFirst) {
        next.home = winnerId;
        next.homeSeed = seed;
        next.away = other;
        next.awaySeed = otherSeed;
      } else {
        next.away = winnerId;
        next.awaySeed = seed;
      }
      queue = [...queue, next.id];
    }
  }
  return { series, queue };
}

const ROUND = ['first round', 'semifinals'];

/** "East first round", "West conference finals", "FBA Finals", "Premier League final". */
export function roundName(league: SeasonLeague, s: PlayoffSeries): string {
  if (s.id === FINALS) return 'FBA Finals';
  const where = league === 'fba' ? (s.group === 'E' ? 'East' : 'West') : groupLabel('fbad2', s.group);
  const round = s.round <= 2 ? ROUND[s.round - 1] : league === 'fba' ? 'conference finals' : 'final';
  return `${where} ${round}`;
}

/** A group's series as bracket columns, ordered so each pair feeds the box beside it. */
export function bracketColumns(league: SeasonLeague, group: string): string[][] {
  return [
    [`${group}-R1-1`, `${group}-R1-4`, `${group}-R1-2`, `${group}-R1-3`],
    [`${group}-SF-1`, `${group}-SF-2`],
    [finalId(league, group)],
  ];
}
```

- [ ] **Step 4: Write `promotion.ts`**

Create `web/engine/playoffs/promotion.ts`:

```ts
import type { PromotionLine } from '../shared/types';

/** The D2 leagues, top tier first. */
export const TIERS = ['PL', 'WL', 'UL', 'IL'];

/**
 * The S78 rule (Java printSeasonSummary). `order` is each league's final regular-season order, best first;
 * `champions` is each league's playoff champion. Below the top tier, #1 and the playoff champion go up
 * (#2 if #1 won the playoffs); above the bottom tier, the last two go down.
 */
export function promotion(order: Record<string, string[]>, champions: Record<string, string>): PromotionLine[] {
  return TIERS.map((league, k) => {
    const o = order[league] ?? [];
    const champ = champions[league];
    const promoted = k === 0 || o.length < 2 ? [] : [o[0], champ === o[0] ? o[1] : champ];
    const relegated = k === TIERS.length - 1 ? [] : o.slice(-2);
    return { league, promoted, relegated };
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run engine/playoffs/bracket.test.ts engine/playoffs/promotion.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`, which should print nothing.

```bash
git add web/engine/playoffs/bracket.ts web/engine/playoffs/bracket.test.ts web/engine/playoffs/promotion.ts web/engine/playoffs/promotion.test.ts
git commit -m "feat: fixed playoff bracket, 2-2-1-1-1 hosting, Java rotation, D2 promotion rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Playoff moves, the pause after game 1290, and the calendar step moving to the last final

**Files:**
- Create: `web/engine/playoffs/moves.ts`
- Create: `web/engine/playoffs/testFixtures.ts`
- Modify: `web/engine/season/schedule.ts` (`defaultPauses`)
- Modify: `web/engine/season/moves.ts` (`recordGames`)
- Test: `web/engine/playoffs/moves.test.ts`
- Modify (as needed): `web/engine/season/schedule.test.ts`, `web/engine/season/moves.test.ts` and other tests that list the default pauses or expect the step to be done at the end of the regular season

**Interfaces:**
- **Consumes:**
  - Task 1: types and `SeasonState.playoffs`.
  - Task 3: `standings`, `orderTeams` and `betterAcross`.
  - Task 4: `buildBracket`, `advance`, `hostOf`, `finalId`, `FINALS` and `promotion`.
  - From `engine/season/moves.ts`: `leagueStepProblem`, `toGameResult` and `lineup`.
- **Produces, from `engine/playoffs/moves.ts`:**
  - `seasonStandings(state: SeasonState): Standings`;
  - `seedPreview(state: SeasonState): PlayoffsFile['seeds']`;
  - `lockSeeds(state: SeasonState): SeasonResult`;
  - `interface NextPlayoffGame { gameNo: number; seriesId: string; gameInSeries: number; home: string; away: string }`;
  - `nextPlayoffGame(pf: PlayoffsFile | null): NextPlayoffGame | null`;
  - `recordPlayoffGame(state: SeasonState, sim: SimGame): SeasonResult`.
- **Produces, from `engine/playoffs/testFixtures.ts`:**
  - `fullFbaState(seed?)`: 30 teams, E01–E15 and W01–W15, 1290 games;
  - `fullD2State(seed?)`: 64 teams, PL01–PL16 etc., 960 games;
  - `regularSeasonDone(state, seed?, opts?: { lastPauseOpen?: boolean })`;
  - `playPlayoffs(state, seed?, maxGames?)`.

- [ ] **Step 1: Write the fixtures**

Create `web/engine/playoffs/testFixtures.ts`:

```ts
import { mulberry32 } from '../d2/random';
import { lineup } from '../season/moves';
import type { SeasonLeague } from '../season/schedule';
import { simGame } from '../season/sim';
import { GROUP_ORDER } from '../season/standings';
import type { SeasonState } from '../season/state';
import { seasonStateFor } from '../season/testFixtures';
import { nextPlayoffGame, recordPlayoffGame } from './moves';

function teamsFor(league: SeasonLeague, perGroup: number): [string, string][] {
  return GROUP_ORDER[league].flatMap(g => Array.from({ length: perGroup }, (_, k): [string, string] => [`${g}${String(k + 1).padStart(2, '0')}`, g]));
}

function ratingsFor(list: [string, string][], seed: number, lo: number, hi: number): Record<string, number[]> {
  const rng = mulberry32(seed);
  return Object.fromEntries(list.map(([id]) => [id, Array.from({ length: 5 }, () => lo + Math.floor(rng() * (hi - lo + 1)))]));
}

/** The real FBA shape: 15 teams per conference, 86 games each (1290 in all), with the default pauses. */
export function fullFbaState(seed = 7): SeasonState {
  const list = teamsFor('fba', 15);
  return seasonStateFor('fba', list, ratingsFor(list, seed, 70, 99), 1);
}

/** The real D2 shape: 16 teams in each of PL, WL, UL and IL, 30 games each (960 in all). */
export function fullD2State(seed = 8): SeasonState {
  const list = teamsFor('fbad2', 16);
  return seasonStateFor('fbad2', list, ratingsFor(list, seed, 50, 90), 1001);
}

/** Every regular-season game saved with made-up scores (no box scores), and every pause done unless told otherwise. */
export function regularSeasonDone(state: SeasonState, seed = 3, opts: { lastPauseOpen?: boolean } = {}): SeasonState {
  const rng = mulberry32(seed);
  const games = state.schedule!.games.map(g => {
    const homePts = 60 + Math.floor(rng() * 40);
    let awayPts = 60 + Math.floor(rng() * 40);
    if (awayPts === homePts) awayPts++;
    return { gameNo: g.gameNo, home: g.home, away: g.away, homePts, awayPts };
  });
  const pauses = state.schedule!.pauses.map((p, i, all) => ({ ...p, done: !(opts.lastPauseOpen && i === all.length - 1) }));
  return { ...state, results: { ...state.results!, games }, schedule: { ...state.schedule!, pauses } };
}

/** Plays up to `maxGames` playoff games (all of them by default) through the real moves. */
export function playPlayoffs(state: SeasonState, seed = 5, maxGames = Infinity): SeasonState {
  const rng = mulberry32(seed);
  let s = state;
  for (let n = 0; n < maxGames; n++) {
    const next = nextPlayoffGame(s.playoffs);
    if (!next) break;
    const home = lineup(s, next.home);
    const away = lineup(s, next.away);
    if (typeof home === 'string' || typeof away === 'string') throw new Error(`${String(home)} / ${String(away)}`);
    const r = recordPlayoffGame(s, simGame(next.gameNo, home, away, rng));
    if (!r.ok) throw new Error(r.problems.join('; '));
    s = r.state;
  }
  return s;
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/playoffs/moves.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/playoffs/moves.test.ts`
Expected: FAIL, because `./moves` doesn't exist.

- [ ] **Step 4: Add the pause after the last game**

In `web/engine/season/schedule.ts`, change `defaultPauses`'s doc comment and returned array:

```ts
/** FBA pauses at the Java's integer quarter points, plus the pre-playoff rating adjustment after the last game; D2 has none. */
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
    { afterGame: totalGames, kind: 'ratings', done: false },
  ];
}
```

- [ ] **Step 5: Stop `recordGames` from marking the step done**

In `web/engine/season/moves.ts`, in `recordGames`, replace everything from `const done = last === sched.games.length;` to the end of the function with:

```ts
  const one = results[0];
  const label = results.length === 1
    ? `Game ${one.gameNo}: ${one.away} ${one.awayPts} @ ${one.home} ${one.homePts}`
    : `Games ${results[0].gameNo}–${results[results.length - 1].gameNo}`;
  // The league's calendar step is marked done by the last playoff final (engine/playoffs/moves.ts), not here.
  return {
    ok: true,
    state: {
      ...state,
      results: { ...state.results, games: [...state.results.games, ...results] },
      rosters: { ...state.rosters, teams },
    },
    changed: ['results', 'rosters'],
    label,
  };
}
```

Remove the now-unused `CALENDAR_STEP` from the import, if tsc says it's unused. `markStepDone` is still used by `makeSchedules`.

- [ ] **Step 6: Write the moves**

Create `web/engine/playoffs/moves.ts`:

```ts
import { leagueStepProblem, toGameResult } from '../season/moves';
import type { SimGame } from '../season/sim';
import { PLAYOFF_SEEDS, records, SEASON_LENGTH, standings, type Standings } from '../season/standings';
import {
  CALENDAR_STEP, PAUSE_LABEL, seasonFail, seasonOver, type SeasonDocKey, type SeasonResult, type SeasonState,
} from '../season/state';
import { markStepDone } from '../shared/calendar';
import type { PlayoffGame, PlayoffsFile } from '../shared/types';
import { advance, buildBracket, finalId, FINALS, hostOf } from './bracket';
import { promotion } from './promotion';
import { powerRankings } from './ranker';
import { betterAcross } from './tiebreak';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;

export function seasonStandings(state: SeasonState): Standings {
  const teams = state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  return standings(state.league, teams, state.results?.games ?? [], SEASON_LENGTH[state.league], state.playoffs);
}

/** Each group's top 8 from the current standings, with the notes for ties that involve them. */
export function seedPreview(state: SeasonState): PlayoffsFile['seeds'] {
  return seasonStandings(state).groups.map(g => {
    const teams = g.rows.slice(0, PLAYOFF_SEEDS).map(r => r.teamId);
    return { group: g.group, teams, notes: g.notes.filter(n => n.teams.some(t => teams.includes(t))).map(n => n.text) };
  });
}

export function lockSeeds(state: SeasonState): SeasonResult {
  const problems: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) problems.push(step);
  if (state.playoffs) problems.push('The playoff seeds are already locked');
  if (!seasonOver(state)) problems.push('Finish the regular season first');
  const open = state.schedule?.pauses.find(p => !p.done);
  if (open) problems.push(`Finish the ${PAUSE_LABEL[open.kind]} pause (after game ${open.afterGame}) first`);
  if (problems.length) return seasonFail(problems);
  const seeds = seedPreview(state);
  const short = seeds.filter(s => s.teams.length < PLAYOFF_SEEDS).map(s => `${s.group} needs at least ${PLAYOFF_SEEDS} teams`);
  if (short.length) return seasonFail(short);
  const { series, queue } = buildBracket(state.league, seeds);
  const playoffs: PlayoffsFile = { league: state.league, season: state.season, locked: false, seeds, series, queue, games: [], outcome: null };
  return {
    ok: true,
    state: { ...state, playoffs },
    changed: ['playoffs'],
    label: `Lock S${state.season} ${LEAGUE_NAME[state.league]} playoff seeds`,
  };
}

export interface NextPlayoffGame { gameNo: number; seriesId: string; gameInSeries: number; home: string; away: string }

/** The game at the front of the rotation, or null before seeding and after the last final. */
export function nextPlayoffGame(pf: PlayoffsFile | null): NextPlayoffGame | null {
  if (!pf || pf.outcome || !pf.queue.length) return null;
  const s = pf.series.find(x => x.id === pf.queue[0]);
  if (!s) return null;
  const gameInSeries = s.homeWins + s.awayWins + 1;
  return { gameNo: pf.games.length + 1, seriesId: s.id, gameInSeries, ...hostOf(s, gameInSeries) };
}

/** Champions (and D2 promotion) once every final is decided; null before then. */
function outcomeOf(state: SeasonState, pf: PlayoffsFile): PlayoffsFile['outcome'] {
  const ids = state.league === 'fba' ? [FINALS] : pf.seeds.map(s => finalId('fbad2', s.group));
  const finals = ids.map(id => pf.series.find(s => s.id === id));
  if (finals.some(s => !s?.winner)) return null;
  const champions = finals.map(s => {
    const teamId = s!.winner!;
    return {
      group: s!.group,
      teamId,
      runnerUp: teamId === s!.home ? s!.away! : s!.home!,
      score: `${Math.max(s!.homeWins, s!.awayWins)}–${Math.min(s!.homeWins, s!.awayWins)}`,
    };
  });
  if (state.league !== 'fbad2') return { champions, promotion: null };
  const order = Object.fromEntries(seasonStandings(state).groups.map(g => [g.group, g.rows.map(r => r.teamId)]));
  return { champions, promotion: promotion(order, Object.fromEntries(champions.map(c => [c.group!, c.teamId]))) };
}

/** Saves a watched playoff game, which must be the front of the rotation. The last final marks the calendar step done. */
export function recordPlayoffGame(state: SeasonState, sim: SimGame): SeasonResult {
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) return seasonFail([step]);
  const pf = state.playoffs;
  const next = nextPlayoffGame(pf);
  if (!pf || !next) return seasonFail(['No playoff game is due']);
  if (sim.gameNo !== next.gameNo || sim.home.teamId !== next.home || sim.away.teamId !== next.away) {
    return seasonFail([`This isn't the next playoff game (next is game ${next.gameNo}: ${next.away} @ ${next.home})`]);
  }
  const game: PlayoffGame = { ...toGameResult(sim), seriesId: next.seriesId, gameInSeries: next.gameInSeries };
  const winner = game.homePts > game.awayPts ? game.home : game.away;
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  let ranked: string[] | null = null;
  const ranks = () => {
    if (ranked === null) ranked = powerRankings(state.results?.games ?? []);
    return ranked;
  };
  const better = (a: string, b: string) => betterAcross(recs.get(a)!, recs.get(b)!, ranks);
  const moved = advance(pf, next.seriesId, winner, better);
  let playoffs: PlayoffsFile = { ...pf, series: moved.series, queue: moved.queue, games: [...pf.games, game] };
  const outcome = outcomeOf(state, playoffs);
  const changed: SeasonDocKey[] = ['playoffs'];
  let calendar = state.calendar;
  if (outcome) {
    playoffs = { ...playoffs, outcome };
    calendar = markStepDone(calendar, CALENDAR_STEP[state.league]);
    changed.push('calendar');
  }
  return {
    ok: true,
    state: { ...state, playoffs, calendar },
    changed,
    label: `Playoff game ${game.gameNo}: ${game.away} ${game.awayPts} @ ${game.home} ${game.homePts}`,
  };
}
```

Note that `standings()` takes `state.playoffs` as a 5th argument. Task 7 adds that parameter. In this task, add it to `standings()` now as an unused optional parameter, so this file typechecks:

```ts
export function standings(league: SeasonLeague, teams: ScheduleTeamInfo[], games: GameResult[], len = SEASON_LENGTH[league], playoffs: PlayoffsFile | null = null): Standings {
```

Add `PlayoffsFile` to the type import in `standings.ts`, and add `void playoffs;` as the first line of the body so the linter doesn't complain. Task 7 replaces that line with real use.

- [ ] **Step 7: Run the new tests**

Run: `npx vitest run engine/playoffs/moves.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the whole suite and fix only the expected fallout**

Run: `npx vitest run`

Two intended changes will break some old expectations. Update exactly those expectations, and list every test you touched in your report:
1. **The default pauses now have a sixth entry,** `ratings` after the last game. This affects tests that list all the pauses (e.g. `engine/season/schedule.test.ts`, and `[true, true, true, false, false]`-style arrays in `engine/season/moves.test.ts`). It also affects tests that play the small FBA fixture to its end and expect no pause at the end.
2. **`recordGames` no longer marks the league step done.** The tests in `engine/season/moves.test.ts` around "marks the calendar after the last game" should now assert that `changed` has no `'calendar'` and that the step stays not-done. If a UI test expected the step to be done after the last regular-season game, update it the same way.

Don't change any other behavior to make a test pass.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/engine/playoffs/moves.ts web/engine/playoffs/moves.test.ts web/engine/playoffs/testFixtures.ts web/engine/season/schedule.ts web/engine/season/moves.ts web/engine/season/standings.ts web/engine/season/*.test.ts web/app
git commit -m "feat: playoff moves, pre-playoff rating pause, league step done at the last final

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`web/app` is only in the list in case a UI test's expectation was updated. Check `git status` first, and don't stage anything unintended.)

---

### Task 6: A whole-season engine run (D2, then FBA)

**Files:**
- Create: `web/engine/playoffs/season.e2e.test.ts`

**Interfaces:**
- **Consumes:**
  - Task 5: `fullD2State`, `fullFbaState`, `playPlayoffs`, `lockSeeds` and `nextPlayoffGame`.
  - From `engine/season`: `simNextGames`, `recordGames`, `completePause`, `blockingPause`, `seasonOver` and `gamesUntilStop`.
  - From `engine/season/ratingPause.ts`: `startRatingPause` and `finishRatingPause`.

- [ ] **Step 1: Write the test**

Create `web/engine/playoffs/season.e2e.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, type Rng } from '../d2/random';
import { completePause, recordGames, simNextGames } from '../season/moves';
import { finishRatingPause, startRatingPause } from '../season/ratingPause';
import { blockingPause, gamesUntilStop, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import { PlayoffsFile } from '../shared/types';
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

describe('a whole S79 in the engine: D2, then FBA', () => {
  it('plays both regular seasons and postseasons with no refused move', () => {
    const rng = mulberry32(42);

    let d2 = playRegular(fullD2State(), rng);
    expect(d2.results!.games).toHaveLength(960);
    expect(d2.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);
    d2 = playPlayoffs(ok(lockSeeds(d2)).state, 11);
    const d2pf = d2.playoffs!;
    expect(PlayoffsFile.safeParse(d2pf).success).toBe(true);
    expect(d2pf.series).toHaveLength(28);
    expect(d2pf.games.length).toBeGreaterThanOrEqual(28 * 4);
    expect(d2pf.games.length).toBeLessThanOrEqual(28 * 7);
    expect(d2pf.games.slice(0, 4).map(g => g.seriesId)).toEqual(['PL-R1-1', 'WL-R1-1', 'UL-R1-1', 'IL-R1-1']);
    expect(d2pf.outcome!.champions).toHaveLength(4);
    expect(d2.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);

    let fba = playRegular(fullFbaState(), rng);
    expect(fba.results!.games).toHaveLength(1290);
    expect(fba.schedule!.pauses.at(-1)).toEqual({ afterGame: 1290, kind: 'ratings', done: true });
    const pointsBefore = fba.rosters;
    fba = playPlayoffs(ok(lockSeeds(fba)).state, 12);
    const pf = fba.playoffs!;
    expect(PlayoffsFile.safeParse(pf).success).toBe(true);
    expect(pf.series).toHaveLength(15);
    expect(pf.games.length).toBeGreaterThanOrEqual(60);
    expect(pf.games.length).toBeLessThanOrEqual(105);
    expect(pf.games.slice(0, 2).map(g => g.seriesId)).toEqual(['E-R1-1', 'W-R1-1']);
    expect(pf.outcome!.champions).toHaveLength(1);
    expect(fba.calendar.steps.find(x => x.id === 'fba')!.done).toBe(true);
    expect(fba.rosters).toBe(pointsBefore);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run engine/playoffs/season.e2e.test.ts`
Expected: PASS, in a few seconds at most. If it fails, the failure points at a real bug in Tasks 1–5: fix the engine, not the test, and describe the fix in your report.

- [ ] **Step 3: Commit**

```bash
git add web/engine/playoffs/season.e2e.test.ts
git commit -m "test: whole-season engine run through both postseasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Confirmed-status markers in the standings

**Files:**
- Modify: `web/engine/season/standings.ts`
- Modify: `web/app/pages/StandingsPage.tsx`
- Test: `web/engine/playoffs/markers.test.ts` (new)
- Modify: `web/app/pages/StandingsPage.test.tsx`

**Interfaces:**
- **Consumes:** `PlayoffsFile` (Task 1); `fullD2State`, `fullFbaState`, `regularSeasonDone`, `playPlayoffs` and `lockSeeds` (Task 5).
- **Produces:**
  - `StandingRow` gains `status: '▲' | '▼' | null` and `badge: '🏆' | 'C' | null`;
  - D2 rows now get `marker` (`*` / `x` / `n`) too;
  - `standings(..., playoffs)` uses `playoffs` for the badges and the second `▲`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/playoffs/markers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { standings } from '../season/standings';
import type { SeasonResult, SeasonState } from '../season/state';
import type { GameResult } from '../shared/types';
import { lockSeeds } from './moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from './testFixtures';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const teamsOf = (s: SeasonState) => s.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
/** Every game won by the team whose id sorts first, so each league's order is PL01, PL02, … */
function byIdResults(s: SeasonState, count: number): GameResult[] {
  return s.schedule!.games.slice(0, count).map(g => {
    const homeWins = g.home < g.away;
    return { gameNo: g.gameNo, home: g.home, away: g.away, homePts: homeWins ? 80 : 70, awayPts: homeWins ? 70 : 80 };
  });
}
const row = (st: ReturnType<typeof standings>, group: string, teamId: string) => st.groups.find(g => g.group === group)!.rows.find(r => r.teamId === teamId)!;

describe('D2 markers', () => {
  it('shows nothing confirmed early, then *, x, n, ▲ for #1 below PL, and ▼ for the bottom two above IL', () => {
    const s = fullD2State();
    const early = standings('fbad2', teamsOf(s), byIdResults(s, 40));
    expect(early.groups.flatMap(g => g.rows).some(r => r.status !== null)).toBe(false);

    const end = standings('fbad2', teamsOf(s), byIdResults(s, s.schedule!.games.length));
    expect(row(end, 'WL', 'WL01')).toMatchObject({ marker: '*', status: '▲' });
    expect(row(end, 'PL', 'PL01')).toMatchObject({ marker: '*', status: null });
    expect(row(end, 'WL', 'WL08').marker).toBe('x');
    expect(row(end, 'WL', 'WL09').marker).toBe('n');
    for (const g of ['PL', 'WL', 'UL']) {
      expect(row(end, g, `${g}15`).status).toBe('▼');
      expect(row(end, g, `${g}16`).status).toBe('▼');
      expect(row(end, g, `${g}14`).status).toBe(null);
    }
    expect(row(end, 'IL', 'IL16').status).toBe(null);
  });

  it('adds the playoff champion as the second ▲ and a 🏆, or #2 when #1 won', () => {
    const s = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    const pf = s.playoffs!;
    const st = standings('fbad2', teamsOf(s), s.results!.games, undefined, pf);
    for (const g of ['WL', 'UL', 'IL']) {
      const rows = st.groups.find(x => x.group === g)!.rows;
      expect(rows.filter(r => r.status === '▲')).toHaveLength(2);
      expect(rows.filter(r => r.badge === '🏆').map(r => r.teamId)).toEqual([pf.series.find(x => x.id === `${g}-F`)!.winner]);
    }
    const wlRows = st.groups.find(x => x.group === 'WL')!.rows;
    const firstWon = { ...pf, series: pf.series.map(x => (x.id === 'WL-F' ? { ...x, winner: wlRows[0].teamId } : x)) };
    const st2 = standings('fbad2', teamsOf(s), s.results!.games, undefined, firstWon);
    const rows2 = st2.groups.find(x => x.group === 'WL')!.rows;
    expect(rows2.filter(r => r.status === '▲').map(r => r.teamId)).toEqual([rows2[0].teamId, rows2[1].teamId]);
  });
});

describe('FBA badges', () => {
  it('marks the conference champions C and the FBA champion 🏆', () => {
    const s = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
    const pf = s.playoffs!;
    const st = standings('fba', teamsOf(s), s.results!.games, undefined, pf);
    const all = st.groups.flatMap(g => g.rows);
    const champ = pf.series.find(x => x.id === 'FINALS')!.winner;
    expect(all.filter(r => r.badge === '🏆').map(r => r.teamId)).toEqual([champ]);
    const confChamps = ['E-CF', 'W-CF'].map(id => pf.series.find(x => x.id === id)!.winner).filter(t => t !== champ);
    expect(all.filter(r => r.badge === 'C').map(r => r.teamId)).toEqual(confChamps);
    expect(all.every(r => r.status === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/playoffs/markers.test.ts`
Expected: FAIL, because `status` and `badge` are undefined and D2 has no markers.

- [ ] **Step 3: Implement the markers**

In `web/engine/season/standings.ts`:

1. Add to `StandingRow`, after `marker`:

```ts
  /** D2 only: ▲ promoted, ▼ relegated, once certain. */
  status: '▲' | '▼' | null;
  /** 🏆 league champion; C FBA conference champion. */
  badge: '🏆' | 'C' | null;
```

2. Generalize `clinchN`: rename it to `clinchOut` with a `spots` parameter, and keep a `clinchN` wrapper:

```ts
/** Java clinchN, generalized: the team at `i` can no longer reach the top `spots`. */
function clinchOut(conf: ClinchRecord[], i: number, len: { games: number; confGames: number }, spots: number): boolean {
  if (i <= spots - 1) return false;
  const t = conf[i];
  const maxW = t.w + (len.games - played(t));
  const maxCW = t.confW + (len.confGames - confPlayed(t));
  for (let j = 0; j < Math.min(spots, conf.length); j++) {
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

const clinchN = (conf: ClinchRecord[], i: number, len: { games: number; confGames: number }) => clinchOut(conf, i, len, PLAYOFF_SEEDS);
```

(Delete the old `function clinchN`.)

3. Add these helpers above `toRows`:

```ts
const PROMOTE_FROM = ['WL', 'UL', 'IL'];
const RELEGATE_FROM = ['PL', 'WL', 'UL'];

/** D2 promotion/relegation, shown once certain: #1 when first place is clinched, the playoff pick after the league final. */
function statusOf(league: SeasonLeague, group: string, ordered: TeamRecord[], i: number, len: { games: number; confGames: number }, playoffs: PlayoffsFile | null): '▲' | '▼' | null {
  if (league !== 'fbad2') return null;
  if (PROMOTE_FROM.includes(group)) {
    if (i === 0 && clinchStar(ordered, 0, len)) return '▲';
    const winner = playoffs?.series.find(s => s.id === `${group}-F`)?.winner;
    if (winner) {
      const second = winner === ordered[0]?.teamId ? ordered[1]?.teamId : winner;
      if (ordered[i].teamId === second) return '▲';
    }
  }
  if (RELEGATE_FROM.includes(group) && ordered.length > 2 && clinchOut(ordered, i, len, ordered.length - 2)) return '▼';
  return null;
}

function badgeOf(league: SeasonLeague, group: string, teamId: string, playoffs: PlayoffsFile | null): '🏆' | 'C' | null {
  if (!playoffs) return null;
  const won = (id: string) => playoffs.series.find(s => s.id === id)?.winner === teamId;
  if (league === 'fba') return won('FINALS') ? '🏆' : won(`${group}-CF`) ? 'C' : null;
  return won(`${group}-F`) ? '🏆' : null;
}
```

4. Replace `toRows` with:

```ts
function toRows(league: SeasonLeague, group: string, ordered: TeamRecord[], len: { games: number; confGames: number }, playoffs: PlayoffsFile | null): StandingRow[] {
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
    marker: markerFor(ordered, i, len),
    status: statusOf(league, group, ordered, i, len, playoffs),
    badge: badgeOf(league, group, r.teamId, playoffs),
  }));
}
```

5. In `standings()`, delete the `void playoffs;` line from Task 5, and change the `toRows` call to `toRows(league, group, order, len, playoffs)`.

- [ ] **Step 4: Show them on the Standings page**

In `web/app/pages/StandingsPage.tsx`:
- Change the marker cell to:

```tsx
                <td className="marker">{[r.marker, r.status, r.badge].filter(Boolean).join(' ')}</td>
```

- Pass the playoffs through:

```tsx
  const s = standings(lg, state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? [], undefined, state.playoffs);
```

- Replace the single FBA legend line with:

```tsx
      <p className="muted">
        {lg === 'fba'
          ? '* clinched the #1 seed · x clinched a playoff spot · n eliminated · C conference champion · 🏆 FBA champion'
          : '* clinched first place · x clinched a playoff spot · n eliminated · ▲ promoted · ▼ relegated · 🏆 league champion'}
      </p>
```

- [ ] **Step 5: Add a page test**

Append to `web/app/pages/StandingsPage.test.tsx`. Reuse its existing render helper and imports, and add imports as needed: `fullD2State`, `regularSeasonDone` from `../../engine/playoffs/testFixtures`, `stubApi` and `seasonDocs` if not already imported.

```tsx
  it('shows the D2 legend and promotion/relegation markers', async () => {
    const s = regularSeasonDone(fullD2State());
    stubApi(seasonDocs(s));
    renderAt('/league/fbad2/standings');
    expect(await screen.findByText(/▲ promoted · ▼ relegated/)).toBeTruthy();
    expect(screen.getAllByText(/▼/).length).toBeGreaterThanOrEqual(6);
  });
```

If the file names its render helper differently, use that name. Check the top of the file.

- [ ] **Step 6: Run the tests and fix only expectations about D2 markers**

Run: `npx vitest run engine/season engine/playoffs app/pages/StandingsPage.test.tsx`

D2 rows used to have `marker: null`. A test that asserted no D2 markers for the tiny 2-teams-per-league fixture may now see `x`, since every team in a 2-team league is trivially in the top 8. Update such expectations and name them in your report.

- [ ] **Step 7: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/engine/season/standings.ts web/engine/season/standings.test.ts web/engine/playoffs/markers.test.ts web/app/pages/StandingsPage.tsx web/app/pages/StandingsPage.test.tsx
git commit -m "feat: confirmed-status standings markers (D2 */x/n, promotion, relegation, champions)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A shared `LiveGame` viewer (refactor, no behavior change)

**Files:**
- Create: `web/app/season/GameViews.tsx`
- Create: `web/app/season/LiveGame.tsx`
- Modify: `web/app/pages/GamePage.tsx`
- Test: `web/app/season/LiveGame.test.tsx`; the existing `web/app/pages/GamePage.test.tsx` must pass unchanged

**Interfaces:**
- **Produces:**
  - `GameViews.tsx` exports `periodName(p: number): string`, `LineScore`, `BoxTable` and `FinalView({ state, r }: { state: SeasonState; r: GameResult })`;
  - `LiveGame.tsx` exports `LiveGame({ state, sim, save, back }: { state: SeasonState; sim: SimGame; save: () => Promise<void>; back: { to: string; label: string } })`.
- **`save` contract:** it resolves once the game is saved, or throws an `Error` whose message is shown on the page. `LiveGame` calls it exactly once when the final possession is shown, and again only on **Retry save**.

- [ ] **Step 1: Write the failing `LiveGame` test**

Create `web/app/season/LiveGame.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../engine/d2/random';
import { lineup } from '../../engine/season/moves';
import { simGame, type SimTeam } from '../../engine/season/sim';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { LiveGame } from './LiveGame';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(save: () => Promise<void>) {
  const state = fbaSeasonState();
  const sim = simGame(1, lineup(state, 'BOS') as SimTeam, lineup(state, 'CAR') as SimTeam, mulberry32(3));
  render(<MemoryRouter><LiveGame state={state} sim={sim} save={save} back={{ to: '/x', label: 'back ▸' }} /></MemoryRouter>);
}

describe('LiveGame', () => {
  it('saves exactly once at the final buzzer and links back', async () => {
    const save = vi.fn(async () => {});
    setup(save);
    fireEvent.click(screen.getByRole('button', { name: 'Next possession' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByRole('link', { name: 'Saved · back ▸' })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows a failed save and retries on request', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('This data changed in another tab'))
      .mockResolvedValueOnce(undefined);
    setup(save);
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    expect(await screen.findByText('This data changed in another tab')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('link', { name: 'Saved · back ▸' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/season/LiveGame.test.tsx`
Expected: FAIL, because `./LiveGame` doesn't exist.

- [ ] **Step 3: Move the static views into `GameViews.tsx`**

Create `web/app/season/GameViews.tsx`, containing `periodName`, `LineScore`, `BoxTable` and `FinalView` moved verbatim from `web/app/pages/GamePage.tsx`, with `export` added to each:

```tsx
import { playerName, type SeasonState } from '../../engine/season/state';
import type { GameResult } from '../../engine/shared/types';

export const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

export function LineScore({ home, away, periods }: { home: string; away: string; periods: { home: number[]; away: number[] } }) {
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

export function BoxTable({ state, title, lines }: { state: SeasonState; title: string; lines: { playerId: string; pts: number }[] }) {
  return (
    <table className="box-score">
      <thead><tr><th>{title}</th><th className="n">PTS</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.playerId}><td>{playerName(state, l.playerId)}</td><td className="n">{l.pts}</td></tr>)}</tbody>
    </table>
  );
}

export function FinalView({ state, r }: { state: SeasonState; r: GameResult }) {
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
```

- [ ] **Step 4: Create `LiveGame.tsx`**

Create `web/app/season/LiveGame.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Possession, type SimGame, winProbability } from '../../engine/season/sim';
import { playerName, type SeasonState } from '../../engine/season/state';
import { useSaving } from '../api';
import { BoxTable, LineScore, periodName } from './GameViews';
import '../pages/season.css';

const SPEED_MS = { slow: 700, normal: 250, fast: 40 } as const;
const CLUTCH_MS = 1200;

function playText(state: SeasonState, g: SimGame, p: Possession): string {
  const off = p.offense === 'home' ? g.home : g.away;
  const def = p.offense === 'home' ? g.away : g.home;
  const who = playerName(state, off.players[p.handler].playerId);
  const guard = playerName(state, def.players[p.defender].playerId);
  return p.made ? `${off.teamId}: ${who} scores ${p.points} over ${guard}` : `${off.teamId}: ${who} is stopped by ${guard}`;
}

export interface LiveGameProps {
  state: SeasonState;
  sim: SimGame;
  /** Saves the finished game; throws an Error with a readable message if it can't. */
  save: () => Promise<void>;
  /** Where the "Saved" link goes. */
  back: { to: string; label: string };
}

/** The live viewer: possessions revealed one at a time, saved once at the final buzzer. */
export function LiveGame({ state, sim, save, back }: LiveGameProps) {
  const saving = useSaving();
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>('normal');
  const [saveState, setSaveState] = useState<'live' | 'saving' | 'saved' | 'failed'>('live');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<number[]>([]);
  const done = shown >= sim.possessions.length;

  useEffect(() => {
    if (!auto || done) return;
    const delay = sim.possessions[shown].clutch ? CLUTCH_MS : SPEED_MS[speed];
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [auto, sim, shown, speed, done]);

  const prob = useMemo(() => winProbability(sim, shown, Math.random, 200), [sim, shown]);
  useEffect(() => { setHistory(h => [...h.slice(0, shown), prob]); }, [shown, prob]);

  const runSave = async () => {
    setSaveState('saving');
    setMessage('');
    try {
      await save();
      setSaveState('saved');
    } catch (e) {
      setMessage((e as Error).message);
      setSaveState('failed');
    }
  };

  // Guarded by a ref: useSaving() forces an extra render when the save starts, which would save twice.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (done && saveState === 'live' && !autoSaved.current) {
      autoSaved.current = true;
      void runSave();
    }
  });

  useEffect(() => {
    if (done) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [done]);

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
        {saveState === 'saved' && <Link to={back.to}>Saved · {back.label}</Link>}
        {saveState === 'failed' && <button className="btn" disabled={saving} onClick={runSave}>Retry save</button>}
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

- [ ] **Step 5: Slim `GamePage.tsx` down to use them**

Replace `web/app/pages/GamePage.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leagueStepProblem, lineup, recordGames } from '../../engine/season/moves';
import { simGame, type SimGame } from '../../engine/season/sim';
import { blockingPause, gamesPlayed } from '../../engine/season/state';
import { commitSeason } from '../season/commitSeason';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import { useSeasonState } from '../season/useSeasonState';
import './season.css';

export function GamePage() {
  const { league = '', gameNo = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const n = Number(gameNo);
  const { state, versions, error } = useSeasonState(lg);
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');

  const stepProblem = state && lg ? leagueStepProblem(state.calendar, lg) : null;
  const isNext = !!state?.schedule && !!state.results && gamesPlayed(state) + 1 === n && !blockingPause(state) && !stepProblem;

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

  if (!lg) return <p className="error">Games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.results?.games[n - 1];
  if (stored && !sim) return <FinalView state={state} r={stored} />;
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || (blockingPause(state) ? 'Finish the pause before playing on.' : stepProblem || "This game isn't up next.")}</p>
        <Link to={`/league/${lg}/scores`}>Back to scores ▸</Link>
      </section>
    );
  }

  const save = async () => {
    const r = recordGames(state, [sim]);
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitSeason(r, versions);
  };
  return <LiveGame state={state} sim={sim} save={save} back={{ to: `/league/${lg}/scores`, label: 'back to scores ▸' }} />;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/season/LiveGame.test.tsx app/pages/GamePage.test.tsx`
Expected: PASS. `GamePage.test.tsx` must pass without edits.

- [ ] **Step 7: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/app/season/GameViews.tsx web/app/season/LiveGame.tsx web/app/season/LiveGame.test.tsx web/app/pages/GamePage.tsx
git commit -m "refactor: shared LiveGame viewer and game views, used by GamePage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The playoff game page

**Files:**
- Create: `web/app/playoffs/PlayoffGamePage.tsx`
- Modify: `web/app/shell/Layout.tsx` (route)
- Test: `web/app/playoffs/PlayoffGamePage.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 5: `nextPlayoffGame` and `recordPlayoffGame`.
  - Task 4: `roundName`.
  - Task 8: `LiveGame` and `FinalView`.
  - `commitSeason`, `useSeasonState`, `lineup`, `leagueStepProblem` and `simGame`.
- **Produces:** the route `/league/:league/playoffs/game/:n`.

- [ ] **Step 1: Write the failing test**

Create `web/app/playoffs/PlayoffGamePage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockSeeds } from '../../engine/playoffs/moves';
import { fullFbaState, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { PlayoffGamePage } from './PlayoffGamePage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const seeded = () => ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} /></Routes>
  </MemoryRouter>,
);

describe('PlayoffGamePage', () => {
  it('plays the next game live and saves it once as a playoffs.json batch', async () => {
    const log = stubApi(seasonDocs(seeded()));
    renderAt('/league/fba/playoffs/game/1');
    expect(await screen.findByText(/^Playoff game 1 · East first round, game 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim to end' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toMatch(/^Playoff game 1: /);
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/playoffs.json']);
    expect(await screen.findByRole('link', { name: 'Saved · back to the playoffs ▸' })).toBeTruthy();
  });

  it('shows a played game as a final', async () => {
    stubApi(seasonDocs(playPlayoffs(seeded(), 5, 1)));
    renderAt('/league/fba/playoffs/game/1');
    expect(await screen.findByText(/^Final/)).toBeTruthy();
  });

  it('refuses any other game', async () => {
    stubApi(seasonDocs(seeded()));
    renderAt('/league/fba/playoffs/game/3');
    expect(await screen.findByText("This isn't the next playoff game.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next possession' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/playoffs/PlayoffGamePage.test.tsx`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the page**

Create `web/app/playoffs/PlayoffGamePage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/playoffs/bracket';
import { nextPlayoffGame, recordPlayoffGame } from '../../engine/playoffs/moves';
import { leagueStepProblem, lineup } from '../../engine/season/moves';
import { simGame, type SimGame } from '../../engine/season/sim';
import { commitSeason } from '../season/commitSeason';
import { FinalView } from '../season/GameViews';
import { LiveGame } from '../season/LiveGame';
import { useSeasonState } from '../season/useSeasonState';
import '../pages/season.css';

export function PlayoffGamePage() {
  const { league = '', n = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const gameNo = Number(n);
  const { state, versions, error } = useSeasonState(lg);
  const [sim, setSim] = useState<SimGame | null>(null);
  const [message, setMessage] = useState('');

  const stepProblem = state && lg ? leagueStepProblem(state.calendar, lg) : null;
  const isNext = !!state && nextPlayoffGame(state.playoffs)?.gameNo === gameNo && !stepProblem;

  useEffect(() => {
    if (!state || sim || !isNext) return;
    const next = nextPlayoffGame(state.playoffs)!;
    const home = lineup(state, next.home);
    const away = lineup(state, next.away);
    if (typeof home === 'string' || typeof away === 'string') {
      setMessage(typeof home === 'string' ? home : (away as string));
      return;
    }
    setSim(simGame(next.gameNo, home, away, Math.random));
  }, [state, sim, isNext]);

  if (!lg) return <p className="error">Playoff games are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const stored = state.playoffs?.games[gameNo - 1];
  if (stored && !sim) return <FinalView state={state} r={stored} />;
  if (!sim) {
    return (
      <section>
        <p className="muted">{message || stepProblem || "This isn't the next playoff game."}</p>
        <Link to={`/league/${lg}/playoffs`}>Back to the playoffs ▸</Link>
      </section>
    );
  }

  const pf = state.playoffs!;
  const game = pf.games[sim.gameNo - 1];
  const next = nextPlayoffGame(pf);
  const seriesId = game?.seriesId ?? next?.seriesId;
  const series = pf.series.find(s => s.id === seriesId);
  const gameInSeries = game?.gameInSeries ?? next?.gameInSeries;
  const save = async () => {
    const r = recordPlayoffGame(state, sim);
    if (!r.ok) throw new Error(r.problems.join('; '));
    await commitSeason(r, versions);
  };
  return (
    <>
      {series && <p className="muted">Playoff game {sim.gameNo} · {roundName(lg, series)}, game {gameInSeries}</p>}
      <LiveGame state={state} sim={sim} save={save} back={{ to: `/league/${lg}/playoffs`, label: 'back to the playoffs ▸' }} />
    </>
  );
}
```

- [ ] **Step 4: Add the route**

In `web/app/shell/Layout.tsx`, add `import { PlayoffGamePage } from '../playoffs/PlayoffGamePage';`, and add this after the `game/:gameNo` route:

```tsx
          <Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} />
```

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `npx vitest run app/playoffs && npx tsc --noEmit`
Expected: PASS. tsc prints nothing.

```bash
git add web/app/playoffs/PlayoffGamePage.tsx web/app/playoffs/PlayoffGamePage.test.tsx web/app/shell/Layout.tsx
git commit -m "feat: playoff game page (live next game, finals, out-of-order refusal)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The Playoffs tab (seeding, the next game, the bracket, champions)

**Files:**
- Create: `web/app/playoffs/Bracket.tsx`
- Create: `web/app/playoffs/PlayoffsPage.tsx`
- Modify: `web/app/components/LeagueTabs.tsx`
- Modify: `web/app/shell/Layout.tsx` (route)
- Modify: `web/app/pages/season.css`
- Test: `web/app/playoffs/PlayoffsPage.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 5: `seedPreview`, `seasonStandings`, `lockSeeds` and `nextPlayoffGame`.
  - Task 4: `bracketColumns`, `roundName` and `FINALS`.
  - `commitSeason`, `useSaving`, `useSeasonState`, `blockingPause`, `seasonOver`, `PAUSE_LABEL`, `leagueStepProblem`, `groupLabel`, `LEAGUE_LABEL`, `TeamMark` and `LeagueTabs`.
- **Produces:** the route `/league/:league/playoffs`, and a Playoffs tab between Standings and Teams.

- [ ] **Step 1: Write the failing tests**

Create `web/app/playoffs/PlayoffsPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockSeeds } from '../../engine/playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { PlayoffsPage } from './PlayoffsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/playoffs" element={<PlayoffsPage />} /></Routes>
  </MemoryRouter>,
);

describe('PlayoffsPage', () => {
  it('shows projected seeds during the regular season, with no Lock button', async () => {
    stubApi(seasonDocs(fullFbaState()));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText('Playoffs start after game 1290. Projected seeds from the current standings:')).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(16);
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });

  it('sends you to the rating pause after game 1290 first', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState(), 3, { lastPauseOpen: true })));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('link', { name: 'Adjust ratings ▸' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });

  it('locks the seeds as one playoffs.json batch', async () => {
    const log = stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderAt('/league/fba/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Lock seeds' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Lock S79 FBA playoff seeds');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/playoffs.json']);
  });

  it('shows the next game card and the bracket once seeded', async () => {
    stubApi(seasonDocs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText(/^Playoff game 1 · East first round, game 1/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch ▸' }).getAttribute('href')).toBe('/league/fba/playoffs/game/1');
    expect(screen.getByRole('button', { name: /E01.*E08|E08.*E01/ })).toBeTruthy();
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0);
  });

  it('shows the champion when the FBA Finals are over', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
    stubApi(seasonDocs(done));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByText(/^S79 FBA Champions: /)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch ▸' })).toBeNull();
  });

  it('shows the four D2 champions and promotion and relegation when done', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    stubApi(seasonDocs(done));
    renderAt('/league/fbad2/playoffs');
    expect(await screen.findByText(/^S79 Premier League Champions: /)).toBeTruthy();
    expect(screen.getByText(/^S79 International League Champions: /)).toBeTruthy();
    expect(screen.getByText(/^World League: promoted /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'IL' }));
    expect(screen.getAllByRole('button', { name: /IL0\d/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/playoffs/PlayoffsPage.test.tsx`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the bracket component**

Create `web/app/playoffs/Bracket.tsx`:

```tsx
import { bracketColumns, FINALS } from '../../engine/playoffs/bracket';
import type { SeasonLeague } from '../../engine/season/schedule';
import type { PlayoffSeries, PlayoffsFile, Team } from '../../engine/shared/types';
import { TeamMark } from '../components/TeamMark';

interface Props {
  league: SeasonLeague;
  playoffs: PlayoffsFile;
  teams: Map<string, Team>;
  season: number;
  /** The FBA shows E, then the Finals, then W mirrored; the D2 shows the one picked league. */
  group: string | null;
  open: string | null;
  onOpen: (id: string | null) => void;
}

function Side({ id, seed, wins, won, teams, season }: { id: string | null; seed: number | null; wins: number; won: boolean; teams: Map<string, Team>; season: number }) {
  const t = id ? teams.get(id) : undefined;
  return (
    <span className={`series-side${won ? ' won' : ''}`}>
      <span className="seed">{seed ?? ''}</span>
      {t && <TeamMark team={t} season={season} size={18} />}
      <span className="name">{t ? `${t.abbr} ${t.name}` : id ?? 'TBD'}</span>
      <span className="wins">{id ? wins : ''}</span>
    </span>
  );
}

function SeriesBox({ s, teams, season, open, onOpen }: { s: PlayoffSeries; teams: Map<string, Team>; season: number; open: string | null; onOpen: Props['onOpen'] }) {
  return (
    <button type="button" className={`series-box${open === s.id ? ' selected' : ''}`} onClick={() => onOpen(open === s.id ? null : s.id)}>
      <Side id={s.home} seed={s.homeSeed} wins={s.homeWins} won={!!s.winner && s.winner === s.home} teams={teams} season={season} />
      <Side id={s.away} seed={s.awaySeed} wins={s.awayWins} won={!!s.winner && s.winner === s.away} teams={teams} season={season} />
    </button>
  );
}

/** The bracket as columns; scrolls sideways inside its own box on narrow screens. */
export function Bracket({ league, playoffs, teams, season, group, open, onOpen }: Props) {
  const byId = new Map(playoffs.series.map(s => [s.id, s]));
  const columns = league === 'fba'
    ? [...bracketColumns('fba', 'E'), [FINALS], ...bracketColumns('fba', 'W').reverse()]
    : bracketColumns('fbad2', group ?? 'PL');
  return (
    <div className="bracket">
      {columns.map((ids, k) => (
        <div key={k} className="bracket-col">
          {ids.map(id => {
            const s = byId.get(id);
            return s ? <SeriesBox key={id} s={s} teams={teams} season={season} open={open} onOpen={onOpen} /> : null;
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `web/app/playoffs/PlayoffsPage.tsx`:

```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { roundName } from '../../engine/playoffs/bracket';
import { lockSeeds, nextPlayoffGame, seasonStandings, seedPreview } from '../../engine/playoffs/moves';
import { leagueStepProblem } from '../../engine/season/moves';
import type { SeasonLeague } from '../../engine/season/schedule';
import { blockingPause, PAUSE_LABEL, seasonOver, type SeasonState } from '../../engine/season/state';
import { groupLabel, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { PlayoffsFile, Team } from '../../engine/shared/types';
import { useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { Bracket } from './Bracket';
import '../pages/season.css';

function SeedTables({ lg, state, seeds, teams }: { lg: SeasonLeague; state: SeasonState; seeds: PlayoffsFile['seeds']; teams: Map<string, Team> }) {
  const st = seasonStandings(state);
  return (
    <div className="seed-grid">
      {seeds.map(s => {
        const rows = new Map(st.groups.find(g => g.group === s.group)?.rows.map(r => [r.teamId, r]) ?? []);
        return (
          <div key={s.group} className="card">
            <h3>{groupLabel(lg, s.group)}</h3>
            <ol className="seed-list">
              {s.teams.map(id => {
                const t = teams.get(id);
                const r = rows.get(id);
                return (
                  <li key={id}>
                    {t && <TeamMark team={t} season={state.season} size={18} />} {t?.name ?? id}{' '}
                    {r && <span className="muted">{r.w}-{r.l}</span>}
                  </li>
                );
              })}
            </ol>
            {s.notes.length > 0 && <ul className="tie-notes">{s.notes.map(n => <li key={n} className="muted">{n}</li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

export function PlayoffsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState('PL');

  if (!lg) return <p className="error">Playoffs are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} playoffs · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) {
    return <section>{header}<p className="muted">No schedule yet. <Link to="/schedules">Make schedules ▸</Link></p></section>;
  }
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => teams.get(id)?.name ?? id;
  const abbr = (id: string) => teams.get(id)?.abbr ?? id;
  const pf = state.playoffs;

  if (!pf) {
    const over = seasonOver(state);
    const pause = over ? blockingPause(state) : null;
    const stepProblem = leagueStepProblem(state.calendar, lg);
    const lock = async () => {
      setMessage('');
      const r = lockSeeds(state);
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
        {!over && <p className="muted">Playoffs start after game {state.schedule.games.length}. Projected seeds from the current standings:</p>}
        {pause && (
          <div className="card pause-card">
            <h3>Pause after game {pause.afterGame}: {PAUSE_LABEL[pause.kind]}</h3>
            {pause.kind === 'ratings' && <Link className="btn primary" to="/league/fba/ratings-pause">Adjust ratings ▸</Link>}
          </div>
        )}
        {over && !pause && stepProblem && <p className="muted">{stepProblem}</p>}
        <SeedTables lg={lg} state={state} seeds={seedPreview(state)} teams={teams} />
        {over && !pause && !stepProblem && <button className="btn primary" disabled={saving} onClick={lock}>Lock seeds</button>}
        {message && <p className="error">{message}</p>}
      </section>
    );
  }

  const next = nextPlayoffGame(pf);
  const nextSeries = next ? pf.series.find(s => s.id === next.seriesId)! : null;
  const lead = (() => {
    if (!nextSeries) return '';
    const { home, away, homeWins, awayWins } = nextSeries;
    if (homeWins === awayWins) return `Series tied ${homeWins}–${awayWins}`;
    return homeWins > awayWins ? `${abbr(home!)} leads ${homeWins}–${awayWins}` : `${abbr(away!)} leads ${awayWins}–${homeWins}`;
  })();
  const openGames = open ? pf.games.filter(g => g.seriesId === open) : [];

  return (
    <section>
      {header}
      {pf.outcome && (
        <div className="card champion-card">
          {pf.outcome.champions.map(c => (
            <p key={c.group ?? 'fba'}>
              <b>S{state.season} {c.group === null ? 'FBA' : groupLabel(lg, c.group)} Champions: {name(c.teamId)}, {c.score} over {name(c.runnerUp)}</b>
            </p>
          ))}
          {pf.outcome.promotion?.map(p => (
            <p key={p.league} className="muted">
              {groupLabel(lg, p.league)}: {p.promoted.length ? `promoted ${p.promoted.map(name).join(', ')}` : 'no promotion'}
              {' · '}{p.relegated.length ? `relegated ${p.relegated.map(name).join(', ')}` : 'no relegation'}
            </p>
          ))}
        </div>
      )}
      {next && nextSeries && (
        <div className="card next-game">
          <span>Playoff game {next.gameNo} · {roundName(lg, nextSeries)}, game {next.gameInSeries} · {abbr(next.away)} at {abbr(next.home)} · {lead}</span>{' '}
          <Link className="btn primary" to={`/league/${lg}/playoffs/game/${next.gameNo}`}>Watch ▸</Link>
        </div>
      )}
      {lg === 'fbad2' && (
        <div className="league-pick" role="group" aria-label="League">
          {pf.seeds.map(s => (
            <button key={s.group} type="button" className={`btn${pick === s.group ? ' primary' : ''}`} onClick={() => { setPick(s.group); setOpen(null); }}>{s.group}</button>
          ))}
        </div>
      )}
      <Bracket league={lg} playoffs={pf} teams={teams} season={state.season} group={lg === 'fbad2' ? pick : null} open={open} onOpen={setOpen} />
      {open && (
        <div className="card">
          <h3>{roundName(lg, pf.series.find(s => s.id === open)!)}</h3>
          {openGames.length === 0 && <p className="muted">No games yet.</p>}
          <ul className="series-games">
            {openGames.map(g => (
              <li key={g.gameNo}>
                Game {g.gameInSeries}: {abbr(g.away)} {g.awayPts} @ {abbr(g.home)} {g.homePts}{g.ot ? (g.ot > 1 ? ` (${g.ot}OT)` : ' (OT)') : ''}{' '}
                <Link to={`/league/${lg}/playoffs/game/${g.gameNo}`}>Box score</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pf.seeds.some(s => s.notes.length > 0) && (
        <details>
          <summary>Seeding tiebreaks</summary>
          <ul className="tie-notes">{pf.seeds.flatMap(s => s.notes).map(n => <li key={n} className="muted">{n}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Tabs, route and styles**

In `web/app/components/LeagueTabs.tsx`, change the FBA/D2 tab list and the comment:

```tsx
/** Scores · Standings · Playoffs · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
export function LeagueTabs({ league }: { league: string }) {
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['', 'Teams'], ['transactions', 'Transactions']]
    : [['', 'Teams']];
```

In `web/app/shell/Layout.tsx`, add `import { PlayoffsPage } from '../playoffs/PlayoffsPage';`, and add this after the standings route:

```tsx
          <Route path="/league/:league/playoffs" element={<PlayoffsPage />} />
```

Append to `web/app/pages/season.css`:

```css
.seed-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin: 10px 0; }
.seed-list { margin: 0; padding-left: 22px; }
.seed-list li { padding: 2px 0; }
.tie-notes { margin: 8px 0 0; padding-left: 18px; font-size: 12px; }
.next-game { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin: 10px 0; border-color: var(--accent); }
.champion-card { margin: 10px 0; border: 2px solid var(--good); }
.league-pick { display: flex; gap: 6px; margin: 10px 0; }
.bracket { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0 10px; }
.bracket-col { display: flex; flex-direction: column; justify-content: space-around; gap: 10px; min-width: 190px; }
.series-box { display: grid; gap: 2px; text-align: left; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; cursor: pointer; font: inherit; }
.series-box.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.series-side { display: grid; grid-template-columns: 16px 20px 1fr 16px; gap: 4px; align-items: center; font-size: 13px; }
.series-side .seed { color: var(--muted); font-size: 11px; }
.series-side .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.series-side .wins { text-align: right; font-variant-numeric: tabular-nums; }
.series-side.won { font-weight: 800; }
.series-games { list-style: none; padding: 0; margin: 0; }
.series-games li { padding: 3px 0; }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/playoffs app/pages/LeaguePage.test.tsx`
Expected: PASS.

If the bracket-box name query in the "next game card" test doesn't match, check how testing-library builds the accessible name: each side renders `seed + abbr + name + wins`. Adjust only the test's regex to the real text, e.g. `/E01.*E08/`, not the component.

- [ ] **Step 7: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/app/playoffs/Bracket.tsx web/app/playoffs/PlayoffsPage.tsx web/app/playoffs/PlayoffsPage.test.tsx web/app/components/LeagueTabs.tsx web/app/shell/Layout.tsx web/app/pages/season.css
git commit -m "feat: Playoffs tab with seeding, next game, bracket and champions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Scores and Home lead into the playoffs

**Files:**
- Modify: `web/app/pages/ScoresPage.tsx`
- Modify: `web/app/pages/Home.tsx`
- Test: `web/app/pages/ScoresPage.test.tsx`, `web/app/pages/Home.test.tsx`

**Interfaces:**
- **Consumes:** the `/league/:league/playoffs` route (Task 10), and `useDoc` from `app/api.ts`.
- **Produces:**
  - **Scores:** a "Playoffs ▸" link once the regular season is over.
  - **Home:** Continue points at `/league/<lg>/playoffs` once the current league step's regular season is over.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('ScoresPage', …)` block in `web/app/pages/ScoresPage.test.tsx`. Add `import { fullD2State, regularSeasonDone } from '../../engine/playoffs/testFixtures';` at the top.

```tsx
  it('links to the playoffs once the regular season is over', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullD2State())));
    renderAt('/league/fbad2/scores');
    expect(await screen.findByText('The regular season is complete.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Playoffs ▸' }).getAttribute('href')).toBe('/league/fbad2/playoffs');
  });
```

Append to the `describe('Home', …)` block in `web/app/pages/Home.test.tsx`:

```tsx
  it('continues to the playoffs once the current league has finished its regular season', async () => {
    docs['leagues/fbad2/S79/schedule.json'] = { league: 'fbad2', season: 79, locked: false, games: [{ gameNo: 1, home: 'A', away: 'B' }], pauses: [] };
    docs['leagues/fbad2/S79/results.json'] = { league: 'fbad2', season: 79, locked: false, games: [{ gameNo: 1, home: 'A', away: 'B', homePts: 70, awayPts: 60 }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbad2/playoffs'));
    } finally {
      delete docs['leagues/fbad2/S79/schedule.json'];
      delete docs['leagues/fbad2/S79/results.json'];
    }
  });
```

Add `waitFor` to that file's `@testing-library/react` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/ScoresPage.test.tsx app/pages/Home.test.tsx`
Expected: FAIL, because the new link and the new href don't exist.

- [ ] **Step 3: Scores**

In `web/app/pages/ScoresPage.tsx`, replace the line:

```tsx
      {over ? <p className="muted">The regular season is complete.</p> : stepProblem && <p className="muted">{stepProblem}</p>}
```

with:

```tsx
      {over ? (
        <>
          <p className="muted">The regular season is complete.</p>
          <p><Link className="btn primary" to={`/league/${lg}/playoffs`}>Playoffs ▸</Link></p>
        </>
      ) : stepProblem && <p className="muted">{stepProblem}</p>}
```

Check the current file for the exact expression, since it came from commit 89124d0. Keep its logic, and only add the link.

- [ ] **Step 4: Home**

In `web/app/pages/Home.tsx`:
- Extend the type import to `import type { CalendarFile, CalendarStep, LeagueId, MetaFile, ResultsFile, ScheduleFile, SummaryFile } from '../../engine/shared/types';`.
- Add this hook above `Home`:

```tsx
/** For an FBA/D2 league step: the Playoffs tab once that league's regular season is over, else null. */
function usePlayoffsTarget(step: CalendarStep | null, season: number | undefined): string | null {
  const lg = step?.kind === 'league' && (step.league === 'fba' || step.league === 'fbad2') ? step.league : null;
  const base = lg && season !== undefined ? `leagues/${lg}/S${season}` : null;
  const sched = useDoc<ScheduleFile>(base && `${base}/schedule.json`);
  const res = useDoc<ResultsFile>(base && `${base}/results.json`);
  if (!lg || !sched.data || !res.data) return null;
  return sched.data.games.length > 0 && res.data.games.length >= sched.data.games.length ? `/league/${lg}/playoffs` : null;
}
```

- In `Home`, call the hook right after the `meta` line, before any early return, so hooks always run in the same order. Compute the step there too:

```tsx
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const i = cal ? currentStepIndex(cal) : -1;
  const step = cal && i >= 0 ? cal.steps[i] : null;
  const playoffs = usePlayoffsTarget(step, meta?.currentSeason);
  if (error) return <p className="error">Couldn't load the calendar: {error.message}. Is the data server running?</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const title = !step ? `Season ${cal.season} complete` : step.kind === 'league' && step.league ? `Play ${LEAGUE_LABEL[step.league]} S${cal.season}` : step.label;
  const target = playoffs ?? (step ? stepTarget(step) : '/calendar');
```

Delete the old `const i = …`, `const step = …` and `const target = …` lines after the early returns.

- [ ] **Step 5: Run the tests, typecheck, run the suite, commit**

Run: `npx vitest run app/pages && npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/app/pages/ScoresPage.tsx web/app/pages/ScoresPage.test.tsx web/app/pages/Home.tsx web/app/pages/Home.test.tsx
git commit -m "feat: Scores and Home lead into the playoffs after the regular season

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a subagent task)

1. **Final review:** a final Opus review of the whole branch against the spec.
2. **Browser check** on a scratch copy, following `CLAUDE.md`:
   - scratch data server on 5184, Vite on 5183 (`web/rscheck.vite.config.ts`, which needs the keep-alive proxy agent), data from `.superpowers/sdd/rscheck/prep.mjs`;
   - D2: play the regular season to its end with Sim to…, check the D2 standings markers, Lock seeds, then watch several D2 playoff games live;
   - finish the D2 playoffs in the engine against the scratch data, then check the champions and promotion panel, the ▲ ▼ 🏆 markers, and that `fba-d2` is done;
   - FBA: sim to game 1290, do the rating pause, check the seed notes, Lock seeds, then watch several live games;
   - check the bracket at phone width (it scrolls inside its box, not the page);
   - finish the FBA playoffs in the engine, then check the champion banner and that `fba` is done;
   - then stop both processes, delete the scratch data and config, and confirm `git status` is clean and `web/data` is unchanged.
3. **Finish the branch** with superpowers:finishing-a-development-branch.
