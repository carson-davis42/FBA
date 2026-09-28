# Awards and Power Rankings (Part 2b-2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Season awards with live races and odds, plus power-rankings pages, for the FBA and D2:
- **FBA awards:** MVP, ROTY, PPK, LP, MC, DPOY, MIP and two All-FBA teams.
- **D2 awards:** four league MVPs.
- **The Awards step:** the app suggests every winner and the commissioner picks and locks them before Lock seeds.

**Architecture:**
- **Engine:** pure TypeScript in `web/engine/awards/`:
  - `defense.ts`: defensive box stats;
  - `score.ts`: the Java award score and odds;
  - `races.ts`: every race and the All-FBA suggestion;
  - `awardMoves.ts`: start, pick and lock;
  - `rankingsTimeline.ts`: ranking marks and movement.
- **Data:** decisions go in a new `leagues/<league>/S<season>/awards.json`, added to `SeasonState` as the `'awards'` doc key and saved through `commitSeason` and `useAutosaveDoc`. Races and rankings are calculated from saved results and never stored.
- **UI:** new Awards and Rankings tabs. The Playoffs tab sends you to the Awards step before Lock seeds.

**Tech Stack:**
- Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict schemas)
- Vitest 2 with jsdom and Testing Library

**Spec:** `docs/superpowers/specs/2026-09-28-awards-rankings-design.md`

## Global Constraints

- **Repo and commands:** repo root `C:/Users/carso/OneDrive/Documents/Fun/Code/creative_vscode/FBA`. Run every command from `web/`: `npx vitest run <paths>` and `npx tsc --noEmit` (must print nothing).
- **Branch:** work on `awards`. Never commit to `main`.
- **Read-only folders:** never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/` or `FBA Logos/`. Tests may *read* `FBA/Awards.txt`, `FBA/FBARosters.txt` and `FBA/Results.txt`.
- **Real save data:** never modify `web/data/**`. Don't start or stop dev servers on 5173/5174. Leave no stray files; put scratch in `.superpowers/sdd/`.
- **jsdom tests:** every jsdom test file calls `cleanup()` in `afterEach`.
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` on its own line, after a blank line.
- **Award score** (Java `getAwardScore`): `0.60 × PPG + 0.20 × rating + 0.20 × (team win% × 100)`.
  - Team win% with no games is 0.5.
  - Race order: score desc, then PPG desc, then rating desc, then player id.
- **Odds** (Java `printAwardRace` and `toAmericanOdds`):
  - The pool is the top 8. Each weight is `exp((score − best) / 2)`, and p = weight ÷ the sum of weights.
  - p is clamped to [0.0001, 0.9999]. If p > 0.5, odds = `round(−100p / (1 − p))`, otherwise `round(100(1 − p) / p)`. The result is capped to [−5000, 10000] and shown with a `+` when positive.
  - Places 1–6 above +6000 show `+6000`, places 7–8 above +8000 show `+8000`, and places 9–10 show `+10000`. Only the top 10 get odds.
- **Race minimum:** 5 regular-season games (`MIN_RACE_GAMES = 5`). PPG = the player's box points ÷ the player's box games.
- **Races:**
  - FBA: MVP (all), PPK (PG/SG), LP (SF/PF), MC (C), ROTY, DPOY, MIP.
  - D2: `MVP-PL`, `MVP-WL`, `MVP-UL`, `MVP-IL`, each over its own league.
- **Rookie:** a restricted contract (`restricted === true`) and not on last season's FBA roster.
- **MIP:** boost = rating − last season's roster rating, and score = `boost + (rating − 80) / 5`. Eligible if on last season's FBA roster with a rating. The 2nd-season flag = restricted.
- **DPOY:** points saved per game = `(Σexp / 100 − Σallowed) / games with defensive data`, with at least 5 such games.
  - **Box fields:** `def`, `stops`, `allowed` and `exp`, where `exp` is in hundredths and equals Σ `2·odds + max(0, odds − 30)`.
  - **odds** here is `makeChance(handler rating, reference rating)`. The reference rating is the league's rounded mean rating over rated rostered players at save time.
- **All-FBA:** slots G, F, C, ANY, ANY. G = PG/SG, F = SF/PF, C = C, ANY = any position. Team 1 is filled first, and no player can appear twice.
- **Rankings marks:** the FBA every 20 games, and the D2 every 32 (per league). The final game count becomes a mark if it isn't a multiple of the step.
- **Movement:** `▲n` / `▼n`, `—` for no change or the first mark, `NEW` if unranked before, and `''` if unranked now.
- **Tab order:** Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/engine/awards/defense.ts` (new) | Per-game defensive lines, the league reference rating, season totals, points saved |
| `web/engine/awards/score.ts` (new) | `awardScore`, `americanOdds`, `raceOdds` |
| `web/engine/awards/races.ts` (new) | Race rows for every award, the rookie rule, the MIP score, the All-FBA suggestion, labels |
| `web/engine/awards/awardMoves.ts` (new) | `startAwards`, `setAward`, `setAllFbaSlot`, `awardProblems`, `lockAwards` |
| `web/engine/awards/rankingsTimeline.ts` (new) | `rankingMarks`, `rankingAt`, `movement`, `MARK_EVERY` |
| `web/engine/shared/types.ts` | `BoxLine` defensive fields, `AwardId`, `AwardsFile`, and the `'awards'` transaction type |
| `web/engine/shared/schemaRegistry.ts` | The `awards.json` rule |
| `web/engine/season/state.ts` | `SeasonState.awards`, doc key and path |
| `web/engine/season/moves.ts` | `toGameResult(g, refRating?)` and `recordGames` passing the reference rating |
| `web/engine/playoffs/moves.ts` | `recordPlayoffGame` passing the reference rating, and `lockSeeds` requiring locked awards |
| `web/engine/playoffs/testFixtures.ts` | `regularSeasonDone` adds a locked awards stub unless `awardsOpen` |
| `web/engine/season/testFixtures.ts`, `web/app/allstar/testState.ts` | `awards: null` |
| `web/app/season/useSeasonState.ts`, `web/app/season/testDocs.ts` | Load `awards.json` |
| `web/app/awards/AwardsPage.tsx` (new) | The Awards tab |
| `web/app/rankings/RankingsPage.tsx` (new) | The Rankings tab |
| `web/app/playoffs/PlayoffsPage.tsx` | The "Awards step ▸" card in place of Lock seeds |
| `web/app/components/LeagueTabs.tsx`, `web/app/shell/Layout.tsx`, `web/app/pages/season.css` | Tabs, routes and styles |

---

### Task 1: Schemas and season-state plumbing for awards

**Files:**
- Modify: `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/season/state.ts`, `web/engine/season/testFixtures.ts`, `web/app/allstar/testState.ts`, `web/app/season/useSeasonState.ts`, `web/app/season/testDocs.ts`
- Test: `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`

**Interfaces:**
- **Produces:**
  - `BoxLine` with optional `def`, `stops`, `allowed` and `exp` (non-negative ints);
  - `AwardId` (zod enum and type);
  - `AwardsFile` (zod schema and type);
  - `TransactionType` including `'awards'`;
  - `SeasonState.awards: AwardsFile | null`;
  - `SeasonDocKey` including `'awards'`;
  - `seasonDocPath('awards', league, season)`, which returns `leagues/<league>/S<season>/awards.json`;
  - `useSeasonState` loading `awards.json` (optional) and including its version in `versions`.

- [ ] **Step 1: Write the failing tests**

Append to `web/engine/shared/types.test.ts`. Add `AwardsFile` and `BoxLine` to its import from `./types`.

```ts
describe('BoxLine defensive fields', () => {
  it('accepts lines with and without the defensive stats', () => {
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20 }).success).toBe(true);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, def: 11, stops: 6, allowed: 12, exp: 1480 }).success).toBe(true);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, def: -1 }).success).toBe(false);
    expect(BoxLine.safeParse({ playerId: 'p00001', pts: 20, exp: 1.5 }).success).toBe(false);
  });
});

describe('AwardsFile', () => {
  const slot = (s: string, playerId: string | null) => ({ slot: s, playerId, teamId: playerId ? 'BOS' : null });
  const team = (ids: (string | null)[]) => ['G', 'F', 'C', 'ANY', 'ANY'].map((s, k) => slot(s, ids[k]));
  const fba = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: false,
    awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'HON' }, { award: 'DPOY', playerId: 'p00002', teamId: 'CAR' }],
    allFba: { team1: team(['a1', 'a2', 'a3', 'a4', 'a5']), team2: team(['b1', 'b2', 'b3', null, 'b5']) },
    ...over,
  });

  it('accepts an FBA draft with an unfilled slot and a D2 doc without All-FBA', () => {
    expect(AwardsFile.safeParse(fba()).success).toBe(true);
    const d2 = { league: 'fbad2', season: 79, locked: true, awards: [{ award: 'MVP-PL', playerId: 'p01001', teamId: 'SALZ' }], allFba: null };
    expect(AwardsFile.safeParse(d2).success).toBe(true);
  });

  it('rejects duplicate awards, awards from the other league, and All-FBA in the D2', () => {
    expect(AwardsFile.safeParse(fba({ awards: [{ award: 'MVP', playerId: 'p1', teamId: 'A' }, { award: 'MVP', playerId: 'p2', teamId: 'B' }] })).success).toBe(false);
    expect(AwardsFile.safeParse(fba({ awards: [{ award: 'MVP-PL', playerId: 'p1', teamId: 'A' }] })).success).toBe(false);
    const d2 = { league: 'fbad2', season: 79, locked: false, awards: [], allFba: fba().allFba };
    expect(AwardsFile.safeParse(d2).success).toBe(false);
  });

  it('rejects All-FBA slots out of order and a player on both teams', () => {
    const swapped = { team1: [slot('F', 'a1'), slot('G', 'a2'), slot('C', 'a3'), slot('ANY', 'a4'), slot('ANY', 'a5')], team2: team(['b1', 'b2', 'b3', 'b4', 'b5']) };
    expect(AwardsFile.safeParse(fba({ allFba: swapped })).success).toBe(false);
    expect(AwardsFile.safeParse(fba({ allFba: { team1: team(['a1', 'a2', 'a3', 'a4', 'a5']), team2: team(['a1', 'b2', 'b3', 'b4', 'b5']) } })).success).toBe(false);
  });
});
```

Append to `web/engine/shared/schemaRegistry.test.ts`. Add `AwardsFile` to its `./types` import, and import `seasonDocPath` from `../season/state` if it isn't already.

```ts
describe('awards.json', () => {
  it('is registered for the FBA and D2 only, with a season doc path', () => {
    expect(schemaForPath('leagues/fba/S79/awards.json')).toBe(AwardsFile);
    expect(schemaForPath('leagues/fbad2/S79/awards.json')).toBe(AwardsFile);
    expect(schemaForPath('leagues/fbajc/S79/awards.json')).toBeNull();
    expect(seasonDocPath('awards', 'fba', 79)).toBe('leagues/fba/S79/awards.json');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/types.test.ts engine/shared/schemaRegistry.test.ts`
Expected: FAIL, because `AwardsFile` isn't exported and `'awards'` isn't a doc key.

- [ ] **Step 3: Change the schemas**

In `web/engine/shared/types.ts`, replace the `BoxLine` line with:

```ts
/** Points per player; games saved from 2b-2b on also carry defensive stats for that player as the defender. */
export const BoxLine = z.object({
  playerId: z.string().min(1),
  pts,
  /** Possessions defended. */
  def: pts.optional(),
  /** Missed shots while defending. */
  stops: pts.optional(),
  /** Points allowed while defending. */
  allowed: pts.optional(),
  /** Expected points an average defender would have allowed on the same shots, in hundredths. */
  exp: pts.optional(),
}).strict();
```

In the `TransactionType` enum, add `'awards'` at the end:

```ts
export const TransactionType = z.enum(['signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings', 'awards']);
```

Append at the end of the file, after `PlayoffsFile`:

```ts
export const AwardId = z.enum(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
export type AwardId = z.infer<typeof AwardId>;

const FBA_AWARD_IDS: AwardId[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
const ALL_FBA_ORDER = ['G', 'F', 'C', 'ANY', 'ANY'] as const;

export const AllFbaSlot = z.object({
  slot: z.enum(['G', 'F', 'C', 'ANY']),
  playerId: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
}).strict();
export type AllFbaSlot = z.infer<typeof AllFbaSlot>;

export const AwardsFile = z.object({
  league: seasonLeague,
  season: int,
  locked: z.boolean(),
  awards: z.array(z.object({ award: AwardId, playerId: z.string().min(1), teamId: z.string().min(1) }).strict()),
  /** FBA only. */
  allFba: z.object({ team1: z.array(AllFbaSlot).length(5), team2: z.array(AllFbaSlot).length(5) }).strict().nullable(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = doc.awards.map(a => a.award);
  if (new Set(ids).size !== ids.length) issue('Each award can only be given once');
  for (const id of ids) {
    if ((doc.league === 'fba') !== FBA_AWARD_IDS.includes(id)) issue(`${id} isn't an ${doc.league === 'fba' ? 'FBA' : 'D2'} award`);
  }
  if (doc.league === 'fbad2' && doc.allFba !== null) issue('The D2 has no All-FBA teams');
  if (doc.allFba) {
    const seen = new Set<string>();
    for (const team of [doc.allFba.team1, doc.allFba.team2]) {
      team.forEach((s, k) => {
        if (s.slot !== ALL_FBA_ORDER[k]) issue(`All-FBA slot ${k + 1} must be ${ALL_FBA_ORDER[k]}`);
        if (s.playerId) {
          if (seen.has(s.playerId)) issue(`${s.playerId} is on the All-FBA teams twice`);
          seen.add(s.playerId);
        }
      });
    }
  }
});
export type AwardsFile = z.infer<typeof AwardsFile>;
```

- [ ] **Step 4: Register the path and add the state**

In `web/engine/shared/schemaRegistry.ts`, add `AwardsFile` to the import list, and add this after the `playoffs.json` rule:

```ts
  [new RegExp(`^leagues/(fba|fbad2)/${S}/awards\\.json$`), AwardsFile],
```

In `web/engine/season/state.ts`:
- Add `AwardsFile` to the type import.
- Add to `SeasonState`, after `playoffs`:

```ts
  /** This league's season awards: a draft while picking, then locked. */
  awards: AwardsFile | null;
```

- Change `SeasonDocKey` to:

```ts
export type SeasonDocKey = 'rosters' | 'calendar' | 'tx' | 'schedule' | 'results' | 'ratingPause' | 'allstar' | 'playoffs' | 'awards';
```

- Add this case to `seasonDocPath`, after the `'playoffs'` case:

```ts
    case 'awards': return `leagues/${league}/S${season}/awards.json`;
```

In `web/engine/season/testFixtures.ts`, add `awards: null,` after `playoffs: null,` in `seasonStateFor`.

In `web/app/allstar/testState.ts`, change `ratingPause: null, allstar: null, playoffs: null,` to `ratingPause: null, allstar: null, playoffs: null, awards: null,`.

- [ ] **Step 5: Load awards in the app**

In `web/app/season/useSeasonState.ts`:
- Add `AwardsFile` to the type import.
- After the `playoffs` line, add `const awards = useDoc<AwardsFile>(at('awards'));`.
- Add `awards` to the `reload` list, right after `playoffs`.
- Add `['awards', awards]` to the `keyed` versions list, after `['playoffs', playoffs]`.
- Add `awards` to `optional`, right after `playoffs`.
- Add `awards: awards.data ?? null,` to the returned `state`, after `playoffs`.

In `web/app/season/testDocs.ts`, after the `playoffs` line, add:

```ts
  if (state.awards) out[seasonDocPath('awards', league, season)] = state.awards;
```

- [ ] **Step 6: Run the tests, typecheck and the full suite**

Run: `npx vitest run engine/shared && npx tsc --noEmit && npx vitest run`
Expected: all tests pass, and tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add web/engine/shared/types.ts web/engine/shared/types.test.ts web/engine/shared/schemaRegistry.ts web/engine/shared/schemaRegistry.test.ts web/engine/season/state.ts web/engine/season/testFixtures.ts web/app/allstar/testState.ts web/app/season/useSeasonState.ts web/app/season/testDocs.ts
git commit -m "feat: awards.json schema, defensive box fields, awards season-state plumbing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Defensive stats saved with every game

**Files:**
- Create: `web/engine/awards/defense.ts`
- Modify: `web/engine/season/moves.ts` (`toGameResult`, `recordGames`), `web/engine/playoffs/moves.ts` (`recordPlayoffGame`)
- Test: `web/engine/awards/defense.test.ts`

**Interfaces:**
- **Consumes:** `makeChance`, `SimGame` and `Possession` from `engine/season/sim.ts`; the `BoxLine` fields from Task 1.
- **Produces, from `engine/awards/defense.ts`:**
  - `interface DefenseLine { def: number; stops: number; allowed: number; exp: number }`;
  - `expHundredths(odds: number): number`;
  - `defenseLines(g: SimGame, refRating: number): { home: DefenseLine[]; away: DefenseLine[] }`;
  - `leagueRefRating(rosters: RostersFile): number`;
  - `interface DefenseTotals { games: number; def: number; stops: number; allowed: number; exp: number }`;
  - `seasonDefense(results: ResultsFile | null): Map<string, DefenseTotals>`;
  - `pointsSavedPerGame(t: DefenseTotals): number`.
- **Also produces:** `toGameResult(g: SimGame, refRating?: number): GameResult`, which adds the four fields to each box line when `refRating` is given.

- [ ] **Step 1: Write the failing test**

Create `web/engine/awards/defense.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { recordGames, simNextGames, toGameResult } from '../season/moves';
import type { Possession, SimGame, SimTeam } from '../season/sim';
import { fbaSeasonState } from '../season/testFixtures';
import type { ResultsFile, RostersFile } from '../shared/types';
import { defenseLines, expHundredths, leagueRefRating, pointsSavedPerGame, seasonDefense } from './defense';

const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const team = (id: string, ratings: number[]): SimTeam => ({ teamId: id, players: ratings.map((rating, k) => ({ playerId: `${id}${k}`, position: POS[k], rating })) });
const poss = (offense: 'home' | 'away', handler: number, defender: number, points: 0 | 2 | 3): Possession => ({
  i: 0, period: 1, offense, handler, defender, made: points > 0, points, homeScore: 0, awayScore: 0, clutch: false, end: 120,
});
function game(possessions: Possession[]): SimGame {
  return {
    gameNo: 1, home: team('H', [90, 80, 80, 80, 80]), away: team('A', [70, 70, 70, 70, 70]), possessions,
    homePts: 5, awayPts: 0, ot: 0, periods: { home: [5, 0, 0, 0], away: [0, 0, 0, 0] }, box: { home: [5, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] },
  };
}

describe('expHundredths', () => {
  it('is 2 points per make plus 1 more for a three, in hundredths', () => {
    expect(expHundredths(64)).toBe(162);
    expect(expHundredths(44)).toBe(102);
    expect(expHundredths(30)).toBe(60);
  });
});

describe('defenseLines', () => {
  it('credits each possession to its defender, with exp against the reference rating', () => {
    // Ref 80: makeChance(90, 80) = 64 → 162; makeChance(70, 80) = 44 → 102.
    const d = defenseLines(game([poss('home', 0, 0, 2), poss('away', 1, 2, 0), poss('home', 0, 0, 3)]), 80);
    expect(d.away[0]).toEqual({ def: 2, stops: 0, allowed: 5, exp: 324 });
    expect(d.home[2]).toEqual({ def: 1, stops: 1, allowed: 0, exp: 102 });
    expect(d.home[0]).toEqual({ def: 0, stops: 0, allowed: 0, exp: 0 });
  });
});

describe('leagueRefRating', () => {
  it('is the rounded mean over rated rostered players', () => {
    const rosters: RostersFile = { league: 'fba', season: 79, locked: false, teams: {
      A: [{ playerId: 'p1', position: 'PG', rating: 90, age: 25, points: 0 }, { playerId: 'p2', position: 'SG', rating: 81, age: 25, points: 0 }],
      B: [{ playerId: null, position: 'C', rating: null, age: null, points: 0 }, { playerId: 'p3', position: 'C', rating: 80, age: 25, points: 0 }],
    } };
    expect(leagueRefRating(rosters)).toBe(84);
  });
});

describe('seasonDefense and pointsSavedPerGame', () => {
  it('sums only lines that carry defensive stats', () => {
    const results: ResultsFile = { league: 'fba', season: 79, locked: false, games: [
      { gameNo: 1, home: 'A', away: 'B', homePts: 10, awayPts: 8, box: { home: [{ playerId: 'p1', pts: 10, def: 10, stops: 6, allowed: 8, exp: 1200 }], away: [{ playerId: 'p2', pts: 8 }] } },
      { gameNo: 2, home: 'A', away: 'B', homePts: 10, awayPts: 8, box: { home: [{ playerId: 'p1', pts: 10, def: 12, stops: 5, allowed: 14, exp: 1300 }], away: [] } },
    ] };
    const t = seasonDefense(results);
    expect(t.get('p1')).toEqual({ games: 2, def: 22, stops: 11, allowed: 22, exp: 2500 });
    expect(t.has('p2')).toBe(false);
    expect(pointsSavedPerGame(t.get('p1')!)).toBeCloseTo(1.5);
  });
});

describe('saved games carry defensive stats', () => {
  it('toGameResult adds them only with a reference rating, and recordGames passes one', () => {
    const s = fbaSeasonState();
    const { games } = simNextGames({ ...s, schedule: { ...s.schedule!, pauses: [] } }, 1, mulberry32(4));
    expect(toGameResult(games[0]).box!.home[0].def).toBeUndefined();
    const withDef = toGameResult(games[0], 80);
    const lines = [...withDef.box!.home, ...withDef.box!.away];
    expect(lines.reduce((n, l) => n + l.def!, 0)).toBe(games[0].possessions.length);
    const r = recordGames({ ...s, schedule: { ...s.schedule!, pauses: [] } }, games);
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.state.results!.games[0].box!.away[0].def).toBeTypeOf('number');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/awards/defense.test.ts`
Expected: FAIL, because `./defense` doesn't exist.

- [ ] **Step 3: Write `defense.ts`**

Create `web/engine/awards/defense.ts`:

```ts
import { makeChance, type SimGame } from '../season/sim';
import type { ResultsFile, RostersFile } from '../shared/types';

export interface DefenseLine { def: number; stops: number; allowed: number; exp: number }

/**
 * Expected points of one shot at this make chance, in hundredths. A shot is made when the 1–100 roll is at most
 * `odds` (2 points) and is a three when odds − roll ≥ 30, so E = (2·odds + max(0, odds − 30)) / 100.
 */
export const expHundredths = (odds: number): number => 2 * odds + Math.max(0, odds - 30);

/** Each player's defensive line for one game, in the same order as the box score. */
export function defenseLines(g: SimGame, refRating: number): { home: DefenseLine[]; away: DefenseLine[] } {
  const zero = (n: number) => Array.from({ length: n }, () => ({ def: 0, stops: 0, allowed: 0, exp: 0 }));
  const out = { home: zero(g.home.players.length), away: zero(g.away.players.length) };
  for (const p of g.possessions) {
    const offense = p.offense === 'home' ? g.home : g.away;
    const d = out[p.offense === 'home' ? 'away' : 'home'][p.defender];
    d.def++;
    if (!p.made) d.stops++;
    d.allowed += p.points;
    d.exp += expHundredths(makeChance(offense.players[p.handler].rating, refRating));
  }
  return out;
}

/** The "average defender" for points saved: the rounded mean rating of the league's rated rostered players. */
export function leagueRefRating(rosters: RostersFile): number {
  const ratings = Object.values(rosters.teams).flat().filter(e => e.playerId !== null && e.rating !== null).map(e => e.rating!);
  return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 80;
}

export interface DefenseTotals { games: number; def: number; stops: number; allowed: number; exp: number }

/** Season defensive totals per player, over box lines that carry defensive stats (older games don't). */
export function seasonDefense(results: ResultsFile | null): Map<string, DefenseTotals> {
  const out = new Map<string, DefenseTotals>();
  for (const g of results?.games ?? []) {
    for (const line of [...(g.box?.home ?? []), ...(g.box?.away ?? [])]) {
      if (line.def === undefined) continue;
      const t = out.get(line.playerId) ?? { games: 0, def: 0, stops: 0, allowed: 0, exp: 0 };
      t.games++;
      t.def += line.def;
      t.stops += line.stops ?? 0;
      t.allowed += line.allowed ?? 0;
      t.exp += line.exp ?? 0;
      out.set(line.playerId, t);
    }
  }
  return out;
}

/** Points saved per game against an average defender facing the same shots. */
export function pointsSavedPerGame(t: DefenseTotals): number {
  return t.games ? (t.exp / 100 - t.allowed) / t.games : 0;
}
```

- [ ] **Step 4: Save the stats with every game**

In `web/engine/season/moves.ts`:
- Add `import { defenseLines, leagueRefRating } from '../awards/defense';`.
- Replace `toGameResult` with:

```ts
/** A simmed game as saved. With a reference rating, each box line also gets its defensive stats (engine/awards/defense.ts). */
export function toGameResult(g: SimGame, refRating?: number): GameResult {
  const d = refRating === undefined ? null : defenseLines(g, refRating);
  const lines = (side: 'home' | 'away') => g[side].players.map((p, k) => ({ playerId: p.playerId, pts: g.box[side][k], ...(d ? d[side][k] : {}) }));
  return {
    gameNo: g.gameNo,
    home: g.home.teamId,
    away: g.away.teamId,
    homePts: g.homePts,
    awayPts: g.awayPts,
    ot: g.ot,
    periods: g.periods,
    box: { home: lines('home'), away: lines('away') },
  };
}
```

- In `recordGames`, replace `const results = games.map(toGameResult);` with:

```ts
  const ref = leagueRefRating(state.rosters);
  const results = games.map(g => toGameResult(g, ref));
```

In `web/engine/playoffs/moves.ts`:
- Add `import { leagueRefRating } from '../awards/defense';`.
- In `recordPlayoffGame`, change `{ ...toGameResult(sim), seriesId: …` to `{ ...toGameResult(sim, leagueRefRating(state.rosters)), seriesId: …`, keeping the rest of that line.

- [ ] **Step 5: Run the tests and fix only exact-box expectations**

Run: `npx vitest run engine/awards engine/season engine/playoffs app`

Tests that compare a saved box line with `toEqual({ playerId, pts })` will now also see `def`, `stops`, `allowed` and `exp`. Update only those expectations, for example by using `toMatchObject`, or by adding the fields, and list each one in your report. Any other failure: stop and report NEEDS_CONTEXT.

- [ ] **Step 6: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/engine/awards/defense.ts web/engine/awards/defense.test.ts web/engine/season/moves.ts web/engine/playoffs/moves.ts
git status --short
git commit -m "feat: defensive stats in every saved game's box score

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Before committing, also stage any test file whose expectations you updated in Step 5.)

---

### Task 3: Award score and odds, matched to the Java's S78 races

**Files:**
- Create: `web/engine/awards/score.ts`
- Test: `web/engine/awards/score.test.ts`

**Interfaces:**
- **Produces:**
  - `awardScore(ppg: number, rating: number, winPct: number): number`;
  - `americanOdds(p: number): string`;
  - `raceOdds(scores: number[]): string[]`. `scores` is sorted best-first, at most 10 of them, and the result holds one odds string per score.

- [ ] **Step 1: Write the failing test**

Create `web/engine/awards/score.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { americanOdds, awardScore, raceOdds } from './score';

const JAVA = path.join(__dirname, '..', '..', '..', 'FBA');
const read = (f: string) => readFileSync(path.join(JAVA, f), 'utf8').split(/\r?\n/);

/** S78 inputs straight from the Java's files: exact points (FBARosters.txt), team records (Results.txt), 86 games each. */
function s78Players() {
  const rec: Record<string, { w: number; l: number }> = {};
  for (const l of read('Results.txt').filter(x => x.trim().length > 1)) {
    const a = l.split(',');
    const [h, hp, w, wp] = [a[1], Number(a[2]), a[3], Number(a[4])];
    for (const t of [h, w]) rec[t] ??= { w: 0, l: 0 };
    if (hp > wp) { rec[h].w++; rec[w].l++; } else { rec[w].w++; rec[h].l++; }
  }
  const players: { name: string; pos: string; rating: number; ppg: number; winPct: number }[] = [];
  let team = '';
  for (const l of read('FBARosters.txt')) {
    const a = l.split('/');
    if (a.length === 3) team = a[0];
    else if (a.length === 7) {
      const r = rec[team];
      const g = r.w + r.l;
      players.push({ name: a[0], pos: a[1], rating: Number(a[5]), ppg: Number(a[6]) / g, winPct: r.w / g });
    }
  }
  return players;
}

/** The Java's printed race: rank 1–10, name and odds, read by its printf columns. */
function javaRace(title: string): { name: string; odds: string }[] {
  const t = read('Awards.txt');
  const i = t.findIndex(r => r.includes(title));
  return t.slice(i + 3, i + 13).map(r => ({ name: r.slice(6, 26).trim(), odds: r.slice(52).trim() }));
}

describe('awardScore and raceOdds reproduce the Java S78 races', () => {
  const players = s78Players();
  const cases: [string, string[]][] = [
    ['MVP Race', ['PG', 'SG', 'SF', 'PF', 'C']],
    ['PPK Award Race', ['PG', 'SG']],
    ['LP Award Race', ['SF', 'PF']],
    ['MC Award Race', ['C']],
  ];
  for (const [title, positions] of cases) {
    it(title, () => {
      const race = players.filter(p => positions.includes(p.pos))
        .map(p => ({ ...p, score: awardScore(p.ppg, p.rating, p.winPct) }))
        .sort((a, b) => b.score - a.score || b.ppg - a.ppg || b.rating - a.rating)
        .slice(0, 10);
      const odds = raceOdds(race.map(r => r.score));
      expect(race.map((r, k) => ({ name: r.name, odds: odds[k] }))).toEqual(javaRace(title));
    });
  }
});

describe('americanOdds', () => {
  it('handles even money, favourites, longshots and the clamps', () => {
    expect(americanOdds(0.5)).toBe('+100');
    expect(americanOdds(0.75)).toBe('-300');
    expect(americanOdds(0.2)).toBe('+400');
    expect(americanOdds(0.999999)).toBe('-5000');
    expect(americanOdds(0)).toBe('+10000');
  });
});

describe('raceOdds display caps', () => {
  it('caps places 1–6 at +6000, 7–8 at +8000, and gives 9–10 +10000', () => {
    const odds = raceOdds([100, 60, 59, 58, 57, 56, 55, 54, 53, 52]);
    expect(odds[0]).toBe('-5000');
    expect(odds.slice(1, 6)).toEqual(['+6000', '+6000', '+6000', '+6000', '+6000']);
    expect(odds.slice(6, 8)).toEqual(['+8000', '+8000']);
    expect(odds.slice(8)).toEqual(['+10000', '+10000']);
  });
  it('uses the whole list as the pool when it is short', () => {
    expect(raceOdds([50, 50])).toEqual(['+100', '+100']);
    expect(raceOdds([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/awards/score.test.ts`
Expected: FAIL, because `./score` doesn't exist.

- [ ] **Step 3: Write `score.ts`**

Create `web/engine/awards/score.ts`:

```ts
/** Java getAwardScore: 60% scoring, 20% rating, 20% team success (win% × 100). */
export function awardScore(ppg: number, rating: number, winPct: number): number {
  return ppg * 0.6 + rating * 0.2 + winPct * 100 * 0.2;
}

/** Java toAmericanOdds. */
export function americanOdds(probability: number): string {
  const p = Math.max(0.0001, Math.min(0.9999, probability));
  let odds = p > 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  if (odds > 10000) odds = 10000;
  if (odds < -5000) odds = -5000;
  return odds > 0 ? `+${odds}` : String(odds);
}

/**
 * Java printAwardRace odds for scores sorted best-first (at most 10). The top 8 share the probability through
 * exp((score − best) / 2); places 1–6 show at most +6000 and 7–8 at most +8000; everyone after the pool is +10000.
 */
export function raceOdds(scores: number[]): string[] {
  if (!scores.length) return [];
  const pool = Math.min(8, scores.length);
  const best = scores[0];
  const weights = scores.slice(0, pool).map(s => Math.exp((s - best) / 2));
  const total = weights.reduce((a, b) => a + b, 0);
  return scores.map((_, i) => {
    if (i >= pool) return '+10000';
    let odds = americanOdds(weights[i] / total);
    const numeric = Number(odds.replace('+', ''));
    if (numeric > 6000 && i < 6) odds = '+6000';
    else if (numeric > 8000 && i < 8) odds = '+8000';
    return odds;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/awards/score.test.ts`
Expected: PASS. All four S78 races match the Java names and odds exactly; this was verified during planning. If a race fails, compare your code with this step line by line. Don't change the expected values.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`, which should print nothing.

```bash
git add web/engine/awards/score.ts web/engine/awards/score.test.ts
git commit -m "feat: Java award score and race odds, matched to the S78 races

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Races and the All-FBA suggestion

**Files:**
- Create: `web/engine/awards/races.ts`
- Test: `web/engine/awards/races.test.ts`

**Interfaces:**
- **Consumes:**
  - `awardScore` and `raceOdds` (Task 3);
  - `seasonDefense`, `pointsSavedPerGame` and `DefenseTotals` (Task 2);
  - `records` from `engine/season/standings.ts`;
  - `playerSeasonStats(results)` from `engine/season/ratingPause.ts`, which returns `Map<id, { games, pts }>`;
  - `SeasonState` and `AwardId` (Task 1).
- **Produces:**
  - `MIN_RACE_GAMES = 5`;
  - `FBA_AWARDS: AwardId[]` = `['MVP','ROTY','PPK','LP','MC','DPOY','MIP']`;
  - `D2_AWARDS: AwardId[]` = `['MVP-PL','MVP-WL','MVP-UL','MVP-IL']`;
  - `AWARD_LABEL: Record<AwardId, string>`;
  - `ALL_FBA_SLOTS` = `['G','F','C','ANY','ANY']`;
  - `SLOT_POSITIONS: Record<'G'|'F'|'C'|'ANY', Position[]>`;
  - `interface RaceRow { playerId; teamId; position; rating; games; ppg; winPct; score; parts: { ppg; rating; win }; odds: string; defense: { perGame; stopRate; saved } | null; mip: { lastRating; boost; secondSeason } | null }`;
  - `interface Race { award: AwardId; label: string; rows: RaceRow[] }`, where rows are every eligible player, ranked, and only the first 10 have odds;
  - `races(state: SeasonState, lastSeason: RostersFile | null): Race[]`, in `FBA_AWARDS` or `D2_AWARDS` order;
  - `lastSeasonRatings(r: RostersFile | null): Map<string, number | null>`;
  - `isRookie(playerId: string, restricted: boolean, last: Map<string, number | null>): boolean`;
  - `mipScore(boost: number, rating: number): number`;
  - `suggestAllFba(mvp: Race): NonNullable<AwardsFile['allFba']>`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/awards/races.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { recordGames, simNextGames } from '../season/moves';
import type { SeasonState } from '../season/state';
import { fullD2State, fullFbaState } from '../playoffs/testFixtures';
import type { RostersFile } from '../shared/types';
import { isRookie, lastSeasonRatings, mipScore, races, SLOT_POSITIONS, suggestAllFba } from './races';

/** Plays `n` games through the real moves (so box scores carry defensive stats), ignoring pauses. */
function played(state: SeasonState, n: number): SeasonState {
  const s = { ...state, schedule: { ...state.schedule!, pauses: [] } };
  const { games, problem } = simNextGames(s, n, mulberry32(9));
  if (problem) throw new Error(problem);
  const r = recordGames(s, games);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
}

/** Last season: every current player one rating point lower, except team E01, which wasn't in the league. */
function lastSeasonOf(state: SeasonState): RostersFile {
  const teams = Object.fromEntries(Object.entries(state.rosters.teams).filter(([t]) => t !== 'E01')
    .map(([t, es]) => [t, es.map(e => ({ ...e, rating: e.rating === null ? null : e.rating - 1 }))]));
  return { ...state.rosters, season: 78, teams };
}

const fba = played(fullFbaState(), 300);

describe('races (FBA)', () => {
  const last = lastSeasonOf(fba);
  const rs = races(fba, last);
  const race = (id: string) => rs.find(r => r.award === id)!;

  it('returns the seven FBA races in order, with odds on the top 10 only', () => {
    expect(rs.map(r => r.award)).toEqual(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP']);
    const mvp = race('MVP');
    expect(mvp.rows.length).toBeGreaterThan(10);
    expect(mvp.rows.slice(0, 10).every(r => r.odds !== '')).toBe(true);
    expect(mvp.rows[10].odds).toBe('');
    for (let k = 1; k < mvp.rows.length; k++) expect(mvp.rows[k - 1].score).toBeGreaterThanOrEqual(mvp.rows[k].score);
    const r0 = mvp.rows[0];
    expect(r0.score).toBeCloseTo(r0.parts.ppg + r0.parts.rating + r0.parts.win);
  });

  it('limits races by position and needs 5 games', () => {
    expect(race('PPK').rows.every(r => r.position === 'PG' || r.position === 'SG')).toBe(true);
    expect(race('LP').rows.every(r => r.position === 'SF' || r.position === 'PF')).toBe(true);
    expect(race('MC').rows.every(r => r.position === 'C')).toBe(true);
    expect(race('MVP').rows.every(r => r.games >= 5)).toBe(true);
  });

  it('ranks DPOY by points saved per game from the box scores', () => {
    const d = race('DPOY').rows;
    expect(d.length).toBeGreaterThan(0);
    expect(d[0].defense).not.toBeNull();
    expect(d[0].score).toBeCloseTo(d[0].defense!.saved);
  });

  it('scores MIP from last season and excludes players who were not on last season’s roster', () => {
    const m = race('MIP').rows;
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(r => r.teamId !== 'E01')).toBe(true);
    expect(m[0].mip).toEqual({ lastRating: m[0].rating - 1, boost: 1, secondSeason: false });
    expect(m[0].score).toBeCloseTo(mipScore(1, m[0].rating));
  });

  it('treats restricted players new to the league as rookies', () => {
    const e01 = Object.values(fba.rosters.teams.E01).map(e => ({ ...e, restricted: true }));
    const withRookies = { ...fba, rosters: { ...fba.rosters, teams: { ...fba.rosters.teams, E01: e01 } } };
    const roty = races(withRookies, last).find(r => r.award === 'ROTY')!.rows;
    expect(roty.length).toBeGreaterThan(0);
    expect(roty.every(r => r.teamId === 'E01')).toBe(true);
  });
});

describe('rookie and MIP helpers', () => {
  it('isRookie needs a restricted contract and no spot on last season’s roster', () => {
    const last = new Map<string, number | null>([['p1', 80]]);
    expect(isRookie('p2', true, last)).toBe(true);
    expect(isRookie('p1', true, last)).toBe(false);
    expect(isRookie('p2', false, last)).toBe(false);
  });
  it('mipScore rewards a boost that ends higher', () => {
    expect(mipScore(6, 86)).toBeCloseTo(7.2);
    expect(mipScore(7, 79)).toBeCloseTo(6.8);
  });
  it('lastSeasonRatings handles a missing roster', () => {
    expect(lastSeasonRatings(null).size).toBe(0);
  });
});

describe('suggestAllFba', () => {
  it('fills G, F, C then two ANY from the MVP race, team 1 first, with no repeats', () => {
    const mvp = races(fba, null).find(r => r.award === 'MVP')!;
    const s = suggestAllFba(mvp);
    const all = [...s.team1, ...s.team2];
    expect(all.map(x => x.slot)).toEqual(['G', 'F', 'C', 'ANY', 'ANY', 'G', 'F', 'C', 'ANY', 'ANY']);
    expect(new Set(all.map(x => x.playerId)).size).toBe(10);
    const pos = new Map(mvp.rows.map(r => [r.playerId, r.position]));
    for (const x of all) expect(SLOT_POSITIONS[x.slot].includes(pos.get(x.playerId!)!)).toBe(true);
    const g = mvp.rows.find(r => r.position === 'PG' || r.position === 'SG')!;
    expect(s.team1[0].playerId).toBe(g.playerId);
  });
});

describe('races (D2)', () => {
  it('has one MVP race per league, each limited to that league', () => {
    const d2 = played(fullD2State(), 200);
    const rs = races(d2, null);
    expect(rs.map(r => r.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    for (const r of rs) expect(r.rows.every(x => x.teamId.startsWith(r.award.slice(4)))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/awards/races.test.ts`
Expected: FAIL, because `./races` doesn't exist.

- [ ] **Step 3: Write `races.ts`**

Create `web/engine/awards/races.ts`:

```ts
import { playerSeasonStats } from '../season/ratingPause';
import { records } from '../season/standings';
import type { SeasonState } from '../season/state';
import type { AwardId, AwardsFile, Position, RostersFile } from '../shared/types';
import { pointsSavedPerGame, seasonDefense, type DefenseTotals } from './defense';
import { awardScore, raceOdds } from './score';

export const MIN_RACE_GAMES = 5;
export const FBA_AWARDS: AwardId[] = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'];
export const D2_AWARDS: AwardId[] = ['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL'];
export const AWARD_LABEL: Record<AwardId, string> = {
  MVP: 'MVP', ROTY: 'ROTY', PPK: 'PPK Award', LP: 'LP Award', MC: 'MC Award', DPOY: 'DPOY', MIP: 'MIP',
  'MVP-PL': 'Premier League MVP', 'MVP-WL': 'World League MVP', 'MVP-UL': 'United League MVP', 'MVP-IL': 'International League MVP',
};
export const ALL_FBA_SLOTS = ['G', 'F', 'C', 'ANY', 'ANY'] as const;
export const SLOT_POSITIONS: Record<'G' | 'F' | 'C' | 'ANY', Position[]> = {
  G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C'], ANY: ['PG', 'SG', 'SF', 'PF', 'C'],
};

export interface RaceRow {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  games: number;
  ppg: number;
  winPct: number;
  /** What this race ranks by: award score, points saved per game (DPOY), or MIP score. */
  score: number;
  /** The award score's three parts: 0.6 × PPG, 0.2 × rating, 0.2 × win% × 100. */
  parts: { ppg: number; rating: number; win: number };
  /** American odds for the top 10; '' below. */
  odds: string;
  defense: { perGame: number; stopRate: number; saved: number } | null;
  mip: { lastRating: number; boost: number; secondSeason: boolean } | null;
}

export interface Race { award: AwardId; label: string; rows: RaceRow[] }

interface Base {
  playerId: string;
  teamId: string;
  position: Position;
  rating: number;
  games: number;
  ppg: number;
  winPct: number;
  restricted: boolean;
  def: DefenseTotals | undefined;
}

export function lastSeasonRatings(r: RostersFile | null): Map<string, number | null> {
  return new Map(Object.values(r?.teams ?? {}).flat().filter(e => e.playerId !== null).map(e => [e.playerId!, e.rating]));
}

/** A rookie is on a restricted (rookie) contract and wasn't on last season's FBA roster. */
export function isRookie(playerId: string, restricted: boolean, last: Map<string, number | null>): boolean {
  return restricted && !last.has(playerId);
}

/** S73 rule: the biggest boost wins, and a boost that ends higher counts for more. */
export function mipScore(boost: number, rating: number): number {
  return boost + (rating - 80) / 5;
}

/** Rated rostered players with at least MIN_RACE_GAMES regular-season games. */
function baseLines(state: SeasonState): Base[] {
  const recs = records(state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group })), state.results?.games ?? []);
  const stats = playerSeasonStats(state.results);
  const def = seasonDefense(state.results);
  const out: Base[] = [];
  for (const [teamId, entries] of Object.entries(state.rosters.teams)) {
    const r = recs.get(teamId);
    const winPct = r && r.w + r.l ? r.w / (r.w + r.l) : 0.5;
    for (const e of entries) {
      if (e.playerId === null || e.rating === null) continue;
      const s = stats.get(e.playerId);
      if (!s || s.games < MIN_RACE_GAMES) continue;
      out.push({
        playerId: e.playerId, teamId, position: e.position, rating: e.rating, games: s.games, ppg: s.pts / s.games, winPct,
        restricted: e.restricted === true, def: def.get(e.playerId),
      });
    }
  }
  return out;
}

function row(b: Base, score: number, extra: Partial<Pick<RaceRow, 'defense' | 'mip'>> = {}): RaceRow {
  return {
    playerId: b.playerId, teamId: b.teamId, position: b.position, rating: b.rating, games: b.games, ppg: b.ppg, winPct: b.winPct,
    score,
    parts: { ppg: b.ppg * 0.6, rating: b.rating * 0.2, win: b.winPct * 100 * 0.2 },
    odds: '',
    defense: extra.defense ?? null,
    mip: extra.mip ?? null,
  };
}

function ranked(award: AwardId, rows: RaceRow[], keys: (r: RaceRow) => number[]): Race {
  const sorted = [...rows].sort((a, b) => {
    const ka = keys(a);
    const kb = keys(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
  const odds = raceOdds(sorted.slice(0, 10).map(r => r.score));
  return { award, label: AWARD_LABEL[award], rows: sorted.map((r, i) => ({ ...r, odds: odds[i] ?? '' })) };
}

const byAwardScore = (r: RaceRow) => [r.score, r.ppg, r.rating];

/** Every race for this league, from regular-season results. `lastSeason` is last season's FBA roster (null for the D2). */
export function races(state: SeasonState, lastSeason: RostersFile | null): Race[] {
  const base = baseLines(state);
  const scored = (b: Base) => row(b, awardScore(b.ppg, b.rating, b.winPct));
  if (state.league === 'fbad2') {
    const groupOf = new Map(state.teams.teams.map(t => [t.teamId, t.group]));
    return D2_AWARDS.map(id => ranked(id, base.filter(b => groupOf.get(b.teamId) === id.slice(4)).map(scored), byAwardScore));
  }
  const last = lastSeasonRatings(lastSeason);
  const all = base.map(scored);
  const at = (...pos: Position[]) => all.filter(r => pos.includes(r.position));
  const dpoy = base.filter(b => b.def && b.def.games >= MIN_RACE_GAMES).map(b => {
    const saved = pointsSavedPerGame(b.def!);
    return row(b, saved, { defense: { perGame: b.def!.def / b.def!.games, stopRate: b.def!.def ? b.def!.stops / b.def!.def : 0, saved } });
  });
  const mip = base.filter(b => typeof last.get(b.playerId) === 'number').map(b => {
    const lastRating = last.get(b.playerId) as number;
    const boost = b.rating - lastRating;
    return row(b, mipScore(boost, b.rating), { mip: { lastRating, boost, secondSeason: b.restricted } });
  });
  return [
    ranked('MVP', all, byAwardScore),
    ranked('ROTY', base.filter(b => isRookie(b.playerId, b.restricted, last)).map(scored), byAwardScore),
    ranked('PPK', at('PG', 'SG'), byAwardScore),
    ranked('LP', at('SF', 'PF'), byAwardScore),
    ranked('MC', at('C'), byAwardScore),
    ranked('DPOY', dpoy, r => [r.score, r.rating]),
    ranked('MIP', mip, r => [r.score, r.mip!.boost, r.rating]),
  ];
}

/** Team 1 first: G, F and C are the best at those positions by award score, then the two best left at any position. */
export function suggestAllFba(mvp: Race): NonNullable<AwardsFile['allFba']> {
  const used = new Set<string>();
  const team = () => ALL_FBA_SLOTS.map(slot => {
    const r = mvp.rows.find(x => !used.has(x.playerId) && SLOT_POSITIONS[slot].includes(x.position));
    if (r) used.add(r.playerId);
    return { slot, playerId: r?.playerId ?? null, teamId: r?.teamId ?? null };
  });
  const team1 = team();
  const team2 = team();
  return { team1, team2 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/awards/races.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`, which should print nothing.

```bash
git add web/engine/awards/races.ts web/engine/awards/races.test.ts
git commit -m "feat: award races (MVP, ROTY, PPK, LP, MC, DPOY, MIP, D2 MVPs) and All-FBA suggestion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Award moves, and Lock seeds waiting for them

**Files:**
- Create: `web/engine/awards/awardMoves.ts`
- Modify: `web/engine/playoffs/moves.ts` (`lockSeeds`), `web/engine/playoffs/testFixtures.ts` (`regularSeasonDone`), `web/engine/playoffs/season.e2e.test.ts`
- Test: `web/engine/awards/awardMoves.test.ts`

**Interfaces:**
- **Consumes:** `races`, `suggestAllFba`, `FBA_AWARDS`, `D2_AWARDS`, `AWARD_LABEL` and `SLOT_POSITIONS` (Task 4); `appendTx` and `MoveContext` from `engine/roster/state.ts`; `leagueStepProblem` from `engine/season/moves.ts`.
- **Produces:**
  - `startAwards(state: SeasonState, lastSeason: RostersFile | null): SeasonResult`, which changes `['awards']`;
  - `setAward(doc: AwardsFile, award: AwardId, playerId: string, teamId: string): AwardsFile`;
  - `setAllFbaSlot(doc: AwardsFile, team: 'team1' | 'team2', index: number, playerId: string, teamId: string): AwardsFile`;
  - `awardProblems(state: SeasonState, lastSeason: RostersFile | null, doc: AwardsFile): string[]`;
  - `lockAwards(state: SeasonState, lastSeason: RostersFile | null, ctx: MoveContext): SeasonResult`, which changes `['awards', 'tx']`;
  - `lockSeeds` refusing with `Lock the S<season> awards first`;
  - `regularSeasonDone(state, seed?, opts?: { lastPauseOpen?: boolean; awardsOpen?: boolean })`. It adds a locked stub `{ league, season, locked: true, awards: [], allFba: null }` unless `awardsOpen`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/awards/awardMoves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lockSeeds } from '../playoffs/moves';
import { fullD2State, fullFbaState, regularSeasonDone } from '../playoffs/testFixtures';
import type { SeasonResult, SeasonState } from '../season/state';
import { AwardsFile, type RostersFile } from '../shared/types';
import { awardProblems, lockAwards, setAllFbaSlot, setAward, startAwards } from './awardMoves';
import { races } from './races';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
/** Made-up results have no box scores, so give every player 5 games of points for the races. */
function withBoxes(s: SeasonState): SeasonState {
  const games = s.results!.games.map(g => ({
    ...g,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: 20, def: 10, stops: 5, allowed: 10, exp: 1000 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: 18, def: 10, stops: 4, allowed: 12, exp: 1000 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}
const last = (s: SeasonState): RostersFile => ({ ...s.rosters, season: 78 });
const fbaReady = () => withBoxes(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true }));

describe('startAwards', () => {
  it('drafts the race leaders and a suggested All-FBA, writing awards.json only', () => {
    const s = fbaReady();
    const r = ok(startAwards(s, last(s)));
    expect(r.changed).toEqual(['awards']);
    expect(r.label).toBe('Start S79 FBA awards');
    const doc = r.state.awards!;
    expect(AwardsFile.safeParse(doc).success).toBe(true);
    expect(doc.locked).toBe(false);
    const rs = races(s, last(s));
    expect(doc.awards.find(a => a.award === 'MVP')!.playerId).toBe(rs[0].rows[0].playerId);
    expect(doc.awards.some(a => a.award === 'ROTY')).toBe(false);
    expect(doc.allFba!.team1.every(x => x.playerId)).toBe(true);
  });

  it('refuses before the season is over, while a pause is open, off-step, or twice', () => {
    const fresh = fullFbaState();
    expect(startAwards(fresh, null).ok).toBe(false);
    const pause = withBoxes(regularSeasonDone(fresh, 3, { lastPauseOpen: true, awardsOpen: true }));
    const p = startAwards(pause, null);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.problems).toContain('Finish the rating adjustment pause (after game 1290) first');
    const started = ok(startAwards(fbaReady(), null)).state;
    const again = startAwards(started, null);
    expect(again.ok).toBe(false);
  });
});

describe('picking and locking', () => {
  const started = () => {
    const s = fbaReady();
    return { s, st: ok(startAwards(s, last(s))).state };
  };

  it('setAward replaces a pick and setAllFbaSlot changes one slot', () => {
    const { st } = started();
    const d = setAward(st.awards!, 'MVP', 'pX', 'E02');
    expect(d.awards.filter(a => a.award === 'MVP')).toEqual([{ award: 'MVP', playerId: 'pX', teamId: 'E02' }]);
    const d2 = setAllFbaSlot(d, 'team2', 4, 'pY', 'W03');
    expect(d2.allFba!.team2[4]).toEqual({ slot: 'ANY', playerId: 'pY', teamId: 'W03' });
  });

  it('flags missing, ineligible and duplicate picks', () => {
    const { s, st } = started();
    const doc = st.awards!;
    const noDpoy = { ...doc, awards: doc.awards.filter(a => a.award !== 'DPOY') };
    expect(awardProblems(st, last(s), noDpoy)).toContain('Pick a winner for DPOY');
    const mc = races(st, last(s)).find(r => r.award === 'MC')!.rows[0];
    const guardAsMc = races(st, last(s)).find(r => r.award === 'PPK')!.rows[0];
    expect(awardProblems(st, last(s), setAward(doc, 'MC', guardAsMc.playerId, guardAsMc.teamId)).some(p => p.endsWith("isn't eligible for MC Award"))).toBe(true);
    const cSlotGuard = setAllFbaSlot(doc, 'team1', 2, guardAsMc.playerId, guardAsMc.teamId);
    expect(awardProblems(st, last(s), cSlotGuard)).toContain('All-FBA team 1 needs a C in the C slot');
    const twice = setAllFbaSlot(doc, 'team2', 2, doc.allFba!.team1[2].playerId!, doc.allFba!.team1[2].teamId!);
    expect(awardProblems(st, last(s), twice).some(p => p.endsWith('is on both All-FBA teams'))).toBe(true);
    expect(mc.position).toBe('C');
  });

  it('locks a complete draft with one awards transaction line, then Lock seeds is allowed', () => {
    const { s, st } = started();
    expect(awardProblems(st, last(s), st.awards!)).toEqual([]);
    const seedsFirst = lockSeeds(st);
    expect(seedsFirst.ok).toBe(false);
    if (!seedsFirst.ok) expect(seedsFirst.problems).toContain('Lock the S79 awards first');
    const r = ok(lockAwards(st, last(s), { batchId: 'b1' }));
    expect(r.changed).toEqual(['awards', 'tx']);
    expect(r.label).toBe('Lock S79 FBA awards');
    expect(r.state.awards!.locked).toBe(true);
    const tx = r.state.tx.entries.at(-1)!;
    expect(tx.type).toBe('awards');
    expect(tx.lines[0]).toMatch(/^S79 FBA awards: MVP /);
    expect(tx.lines.slice(1).map(l => l.split(':')[0])).toEqual(['All-FBA 1st team', 'All-FBA 2nd team']);
    expect(lockSeeds(r.state).ok).toBe(true);
    expect(lockAwards(r.state, last(s), { batchId: 'b2' }).ok).toBe(false);
  });

  it('refuses to lock with problems', () => {
    const { s, st } = started();
    const broken = { ...st, awards: { ...st.awards!, awards: [] } };
    const r = lockAwards(broken, last(s), { batchId: 'b1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toContain('Pick a winner for MVP');
  });
});

describe('D2 awards', () => {
  it('drafts and locks four league MVPs with no All-FBA', () => {
    const s = withBoxes(regularSeasonDone(fullD2State(), 3, { awardsOpen: true }));
    const st = ok(startAwards(s, null)).state;
    expect(st.awards!.awards.map(a => a.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    expect(st.awards!.allFba).toBeNull();
    const r = ok(lockAwards(st, null, { batchId: 'b1' }));
    expect(r.state.tx.entries.at(-1)!.lines[0]).toMatch(/^S79 D2 awards: Premier League MVP /);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/awards/awardMoves.test.ts`
Expected: FAIL, because `./awardMoves` doesn't exist.

- [ ] **Step 3: Write `awardMoves.ts`**

Create `web/engine/awards/awardMoves.ts`:

```ts
import { appendTx, type MoveContext } from '../roster/state';
import { leagueStepProblem } from '../season/moves';
import { PAUSE_LABEL, playerName, seasonFail, seasonOver, type SeasonResult, type SeasonState } from '../season/state';
import type { AllFbaSlot, AwardId, AwardsFile, RostersFile } from '../shared/types';
import { AWARD_LABEL, D2_AWARDS, FBA_AWARDS, races, SLOT_POSITIONS, suggestAllFba } from './races';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;
const ORDER: AwardId[] = [...FBA_AWARDS, ...D2_AWARDS];
const SLOT_NEED: Record<AllFbaSlot['slot'], string> = { G: 'a guard (PG or SG)', F: 'a forward (SF or PF)', C: 'a C', ANY: 'a player' };

/** The awards are decided after the regular season and every pause, at the league's calendar step. */
function readyProblems(state: SeasonState): string[] {
  const out: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) out.push(step);
  if (!seasonOver(state)) out.push('Finish the regular season first');
  const open = state.schedule?.pauses.find(p => !p.done);
  if (open) out.push(`Finish the ${PAUSE_LABEL[open.kind]} pause (after game ${open.afterGame}) first`);
  return out;
}

/** Drafts awards.json with every race leader and (FBA) the suggested All-FBA teams. */
export function startAwards(state: SeasonState, lastSeason: RostersFile | null): SeasonResult {
  const problems = readyProblems(state);
  if (state.awards) problems.push('The awards have already been started');
  if (problems.length) return seasonFail(problems);
  const rs = races(state, lastSeason);
  const awards = rs.filter(r => r.rows.length).map(r => ({ award: r.award, playerId: r.rows[0].playerId, teamId: r.rows[0].teamId }));
  const allFba = state.league === 'fba' ? suggestAllFba(rs.find(r => r.award === 'MVP')!) : null;
  const doc: AwardsFile = { league: state.league, season: state.season, locked: false, awards, allFba };
  return { ok: true, state: { ...state, awards: doc }, changed: ['awards'], label: `Start S${state.season} ${LEAGUE_NAME[state.league]} awards` };
}

export function setAward(doc: AwardsFile, award: AwardId, playerId: string, teamId: string): AwardsFile {
  const awards = [...doc.awards.filter(a => a.award !== award), { award, playerId, teamId }]
    .sort((a, b) => ORDER.indexOf(a.award) - ORDER.indexOf(b.award));
  return { ...doc, awards };
}

export function setAllFbaSlot(doc: AwardsFile, team: 'team1' | 'team2', index: number, playerId: string, teamId: string): AwardsFile {
  if (!doc.allFba) return doc;
  return { ...doc, allFba: { ...doc.allFba, [team]: doc.allFba[team].map((s, i) => (i === index ? { ...s, playerId, teamId } : s)) } };
}

/** Everything that stops Lock awards: missing or ineligible winners, and incomplete or invalid All-FBA teams. */
export function awardProblems(state: SeasonState, lastSeason: RostersFile | null, doc: AwardsFile): string[] {
  const rs = races(state, lastSeason);
  const name = (id: string) => playerName(state, id);
  const out: string[] = [];
  for (const race of rs) {
    if (!race.rows.length) continue;
    const pick = doc.awards.find(a => a.award === race.award);
    if (!pick) out.push(`Pick a winner for ${race.label}`);
    else if (!race.rows.some(r => r.playerId === pick.playerId)) out.push(`${name(pick.playerId)} isn't eligible for ${race.label}`);
  }
  if (state.league === 'fba') {
    const mvp = rs.find(r => r.award === 'MVP')!;
    if (!doc.allFba) out.push('Fill in the All-FBA teams');
    else {
      const seen = new Map<string, 'team1' | 'team2'>();
      for (const [t, team] of (['team1', 'team2'] as const).entries()) {
        const label = `All-FBA team ${t + 1}`;
        for (const s of doc.allFba[team]) {
          if (!s.playerId) {
            out.push(`${label} needs a player in the ${s.slot} slot`);
            continue;
          }
          const r = mvp.rows.find(x => x.playerId === s.playerId);
          if (!r) out.push(`${name(s.playerId)} isn't eligible for All-FBA`);
          else if (!SLOT_POSITIONS[s.slot].includes(r.position)) out.push(`${label} needs ${SLOT_NEED[s.slot]} in the ${s.slot} slot`);
          const before = seen.get(s.playerId);
          if (before) out.push(before === team ? `${name(s.playerId)} is listed twice on ${label}` : `${name(s.playerId)} is on both All-FBA teams`);
          seen.set(s.playerId, team);
        }
      }
    }
  }
  return out;
}

/** Locks the draft, records each winner's team at lock time, and logs one 'awards' transaction. */
export function lockAwards(state: SeasonState, lastSeason: RostersFile | null, ctx: MoveContext): SeasonResult {
  const problems = readyProblems(state);
  const doc = state.awards;
  if (!doc) problems.push('Start the awards first');
  else if (doc.locked) problems.push('The awards are already locked');
  else problems.push(...awardProblems(state, lastSeason, doc));
  if (problems.length || !doc) return seasonFail(problems);

  const teamOf = new Map(Object.entries(state.rosters.teams).flatMap(([t, es]) => es.filter(e => e.playerId).map(e => [e.playerId!, t] as const)));
  const awards = doc.awards.map(a => ({ ...a, teamId: teamOf.get(a.playerId) ?? a.teamId }));
  const slot = (s: AllFbaSlot): AllFbaSlot => (s.playerId ? { ...s, teamId: teamOf.get(s.playerId) ?? s.teamId } : s);
  const allFba = doc.allFba && { team1: doc.allFba.team1.map(slot), team2: doc.allFba.team2.map(slot) };
  const locked: AwardsFile = { ...doc, locked: true, awards, allFba };

  const who = (id: string, team: string | null) => `${playerName(state, id)} (${team ?? '?'})`;
  const lines = [`S${state.season} ${LEAGUE_NAME[state.league]} awards: ${awards.map(a => `${AWARD_LABEL[a.award]} ${who(a.playerId, a.teamId)}`).join(', ')}`];
  if (allFba) {
    lines.push(`All-FBA 1st team: ${allFba.team1.map(s => `${s.slot} ${who(s.playerId!, s.teamId)}`).join(', ')}`);
    lines.push(`All-FBA 2nd team: ${allFba.team2.map(s => `${s.slot} ${who(s.playerId!, s.teamId)}`).join(', ')}`);
  }
  const teams = [...new Set([...awards.map(a => a.teamId), ...(allFba ? [...allFba.team1, ...allFba.team2].map(s => s.teamId!) : [])])];
  const tx = appendTx(state.tx, ctx, 'awards', teams, lines);
  return {
    ok: true,
    state: { ...state, awards: locked, tx },
    changed: ['awards', 'tx'],
    label: `Lock S${state.season} ${LEAGUE_NAME[state.league]} awards`,
  };
}
```

- [ ] **Step 4: Make Lock seeds wait, and give fixtures a locked stub**

In `web/engine/playoffs/moves.ts`, in `lockSeeds`, add this line right after the `open` pause line, before `if (problems.length) return seasonFail(problems);`:

```ts
  if (!state.awards?.locked) problems.push(`Lock the S${state.season} awards first`);
```

In `web/engine/playoffs/testFixtures.ts`, replace `regularSeasonDone` with:

```ts
/**
 * Every regular-season game saved with made-up scores (no box scores), and every pause done unless told otherwise.
 * The awards are a locked stub (so Lock seeds is allowed) unless `awardsOpen`.
 */
export function regularSeasonDone(state: SeasonState, seed = 3, opts: { lastPauseOpen?: boolean; awardsOpen?: boolean } = {}): SeasonState {
  const rng = mulberry32(seed);
  const games = state.schedule!.games.map(g => {
    const homePts = 60 + Math.floor(rng() * 40);
    let awayPts = 60 + Math.floor(rng() * 40);
    if (awayPts === homePts) awayPts++;
    return { gameNo: g.gameNo, home: g.home, away: g.away, homePts, awayPts };
  });
  const pauses = state.schedule!.pauses.map((p, i, all) => ({ ...p, done: !(opts.lastPauseOpen && i === all.length - 1) }));
  const awards = opts.awardsOpen ? null : { league: state.league, season: state.season, locked: true, awards: [], allFba: null };
  return { ...state, results: { ...state.results!, games }, schedule: { ...state.schedule!, pauses }, awards };
}
```

- [ ] **Step 5: Run the awards step for real in the whole-season test**

In `web/engine/playoffs/season.e2e.test.ts`:
- Add these imports:

```ts
import { lockAwards, startAwards } from '../awards/awardMoves';
import type { RostersFile } from '../shared/types';
```

- Add this helper after `playRegular`:

```ts
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
```

- Change `d2 = playPlayoffs(ok(lockSeeds(d2)).state, 11);` to:

```ts
    expect(lockSeeds(d2).ok).toBe(false);
    d2 = decideAwards(d2, null);
    expect(d2.awards!.awards.map(a => a.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL']);
    d2 = playPlayoffs(ok(lockSeeds(d2)).state, 11);
```

- Change `fba = playPlayoffs(ok(lockSeeds(fba)).state, 12);` to:

```ts
    fba = decideAwards(fba, lastSeasonOf(fba));
    expect(fba.awards!.locked).toBe(true);
    expect(fba.awards!.awards.map(a => a.award)).toEqual(['MVP', 'PPK', 'LP', 'MC', 'DPOY', 'MIP']);
    fba = playPlayoffs(ok(lockSeeds(fba)).state, 12);
```

(ROTY is absent because the fixture has no rookie contracts, and a race with no candidates needs no winner.)

- Move the `const pointsBefore = fba.rosters;` line to after the `decideAwards` line, so it still checks that the playoffs don't touch rosters.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run engine/awards engine/playoffs app/playoffs`
Expected: PASS.

Any existing test that builds a finished season without `regularSeasonDone` and then calls `lockSeeds` expecting success will now fail with "Lock the S79 awards first". Fix such a test by adding `awards: { league, season: 79, locked: true, awards: [], allFba: null }` to its state, and list each one in your report.

- [ ] **Step 7: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/engine/awards/awardMoves.ts web/engine/awards/awardMoves.test.ts web/engine/playoffs/moves.ts web/engine/playoffs/testFixtures.ts web/engine/playoffs/season.e2e.test.ts
git status --short
git commit -m "feat: award moves (start, pick, lock) and Lock seeds waits for locked awards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Before committing, also stage any test file you fixed in Step 6.)

---

### Task 6: Power-rankings timeline

**Files:**
- Create: `web/engine/awards/rankingsTimeline.ts`
- Test: `web/engine/awards/rankingsTimeline.test.ts`

**Interfaces:**
- **Consumes:** `powerRankings` from `engine/playoffs/ranker.ts`; `records` from `engine/season/standings.ts`.
- **Produces:**
  - `MARK_EVERY: Record<SeasonLeague, number>` = `{ fba: 20, fbad2: 32 }`;
  - `rankingMarks(league: SeasonLeague, played: number, total: number): number[]`;
  - `interface RankingRow { teamId: string; rank: number | null; w: number; l: number }`;
  - `rankingAt(teams: { teamId: string; group: string | null }[], games: GameResult[], mark: number, group: string | null): RankingRow[]`;
  - `movement(prev: number | null | undefined, cur: number | null): string`.

- [ ] **Step 1: Write the failing test**

Create `web/engine/awards/rankingsTimeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { powerRankings } from '../playoffs/ranker';
import { fullD2State, fullFbaState, regularSeasonDone } from '../playoffs/testFixtures';
import { movement, rankingAt, rankingMarks } from './rankingsTimeline';

describe('rankingMarks', () => {
  it('marks every 20 FBA games and adds the final game', () => {
    expect(rankingMarks('fba', 45, 1290)).toEqual([20, 40]);
    const all = rankingMarks('fba', 1290, 1290);
    expect(all).toHaveLength(65);
    expect(all.slice(-2)).toEqual([1280, 1290]);
    expect(rankingMarks('fba', 10, 1290)).toEqual([]);
  });
  it('marks every 32 D2 games', () => {
    const all = rankingMarks('fbad2', 960, 960);
    expect(all).toHaveLength(30);
    expect(all.at(-1)).toBe(960);
  });
});

describe('rankingAt', () => {
  const fba = regularSeasonDone(fullFbaState());
  const teams = fba.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  const games = fba.results!.games;

  it('matches powerRankings over all games at the final mark, with records', () => {
    const rows = rankingAt(teams, games, games.length, null);
    const ranked = rows.filter(r => r.rank !== null).map(r => r.teamId);
    expect(ranked).toEqual(powerRankings(games));
    expect(rows).toHaveLength(30);
    expect(rows[0].w + rows[0].l).toBe(86);
  });

  it('puts teams with no wins yet at the bottom, unranked, by id', () => {
    const rows = rankingAt(teams, games, 2, null);
    const unranked = rows.filter(r => r.rank === null);
    expect(unranked.length).toBeGreaterThan(0);
    expect(rows.slice(-unranked.length)).toEqual(unranked);
    expect(unranked.map(r => r.teamId)).toEqual([...unranked.map(r => r.teamId)].sort());
  });

  it('ranks a D2 league on its own', () => {
    const d2 = regularSeasonDone(fullD2State());
    const t2 = d2.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
    const rows = rankingAt(t2, d2.results!.games, 960, 'WL');
    expect(rows).toHaveLength(16);
    expect(rows.every(r => r.teamId.startsWith('WL'))).toBe(true);
    expect(rows[0].rank).toBe(1);
  });
});

describe('movement', () => {
  it('shows arrows, no change, NEW and unranked', () => {
    expect(movement(5, 2)).toBe('▲3');
    expect(movement(2, 4)).toBe('▼2');
    expect(movement(3, 3)).toBe('—');
    expect(movement(undefined, 1)).toBe('—');
    expect(movement(null, 7)).toBe('NEW');
    expect(movement(4, null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/awards/rankingsTimeline.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the module**

Create `web/engine/awards/rankingsTimeline.ts`:

```ts
import { powerRankings } from '../playoffs/ranker';
import type { SeasonLeague } from '../season/schedule';
import { records } from '../season/standings';
import type { GameResult } from '../shared/types';

/** The Java refreshed FBA rankings every 20 games; the D2 (64 teams) uses 32, about one game per team. */
export const MARK_EVERY: Record<SeasonLeague, number> = { fba: 20, fbad2: 32 };

/** Game counts that have a ranking so far; the final game count is a mark too once the season is over. */
export function rankingMarks(league: SeasonLeague, played: number, total: number): number[] {
  const step = MARK_EVERY[league];
  const out: number[] = [];
  for (let m = step; m <= played; m += step) out.push(m);
  if (played > 0 && played === total && out[out.length - 1] !== played) out.push(played);
  return out;
}

export interface RankingRow { teamId: string; rank: number | null; w: number; l: number }

/** Power rankings after the first `mark` games, for one group (a D2 league) or everyone (null). Winless teams are unranked, last, by id. */
export function rankingAt(teams: { teamId: string; group: string | null }[], games: GameResult[], mark: number, group: string | null): RankingRow[] {
  const upTo = games.slice(0, mark);
  const members = teams.filter(t => group === null || t.group === group).map(t => t.teamId);
  const inGroup = new Set(members);
  const ranked = powerRankings(upTo).filter(id => inGroup.has(id));
  const recs = records(teams, upTo);
  const rec = (id: string) => ({ w: recs.get(id)?.w ?? 0, l: recs.get(id)?.l ?? 0 });
  const unranked = members.filter(id => !ranked.includes(id)).sort();
  return [
    ...ranked.map((teamId, i) => ({ teamId, rank: i + 1, ...rec(teamId) })),
    ...unranked.map(teamId => ({ teamId, rank: null, ...rec(teamId) })),
  ];
}

/** Rank change since the previous mark: ▲n / ▼n, — for none (or the first mark), NEW if unranked before, '' if unranked now. */
export function movement(prev: number | null | undefined, cur: number | null): string {
  if (cur === null) return '';
  if (prev === undefined) return '—';
  if (prev === null) return 'NEW';
  if (prev === cur) return '—';
  return prev > cur ? `▲${prev - cur}` : `▼${cur - prev}`;
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `npx vitest run engine/awards/rankingsTimeline.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc prints nothing.

```bash
git add web/engine/awards/rankingsTimeline.ts web/engine/awards/rankingsTimeline.test.ts
git commit -m "feat: power-rankings timeline (marks, per-league ranking, movement)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Awards tab, and the Playoffs tab's Awards step card

**Files:**
- Create: `web/app/awards/AwardsPage.tsx`
- Modify: `web/app/playoffs/PlayoffsPage.tsx`, `web/app/components/LeagueTabs.tsx`, `web/app/shell/Layout.tsx`, `web/app/pages/season.css`
- Test: `web/app/awards/AwardsPage.test.tsx`, `web/app/playoffs/PlayoffsPage.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 4: `races`, `ALL_FBA_SLOTS`, `SLOT_POSITIONS`, `Race` and `RaceRow`.
  - Task 5: `startAwards`, `setAward`, `setAllFbaSlot`, `awardProblems` and `lockAwards`.
  - Existing: `useSeasonState` (`state.awards`, `versions`), `useDoc`, `useSaving`, `useAutosaveDoc`, `commitSeason`, `newBatchId`, `seasonDocPath`, `blockingPause`, `seasonOver`, `PAUSE_LABEL`, `leagueStepProblem` and `playerName`.
- **Produces:** the route `/league/:league/awards`, an Awards tab after Playoffs, and on the Playoffs tab an "Awards step ▸" card that replaces Lock seeds until the awards are locked.

- [ ] **Step 1: Write the failing tests**

Create `web/app/awards/AwardsPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAwards } from '../../engine/awards/awardMoves';
import { fullD2State, fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import type { SeasonResult, SeasonState } from '../../engine/season/state';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { AwardsPage } from './AwardsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
function withBoxes(s: SeasonState): SeasonState {
  const games = s.results!.games.map(g => ({
    ...g,
    box: {
      home: s.rosters.teams[g.home].map(e => ({ playerId: e.playerId!, pts: 20, def: 10, stops: 5, allowed: 10, exp: 1000 })),
      away: s.rosters.teams[g.away].map(e => ({ playerId: e.playerId!, pts: 18, def: 10, stops: 4, allowed: 12, exp: 1000 })),
    },
  }));
  return { ...s, results: { ...s.results!, games } };
}
const ready = () => withBoxes(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true }));
const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/awards" element={<AwardsPage />} /></Routes>
  </MemoryRouter>,
);

describe('AwardsPage', () => {
  it('shows live races read-only during the season', async () => {
    const s = fullFbaState();
    stubApi(seasonDocs({ ...s, results: ready().results!, schedule: { ...s.schedule!, games: [...s.schedule!.games, { gameNo: 9999, home: 'E01', away: 'E02' }] } }));
    renderAt('/league/fba/awards');
    expect(await screen.findByText(/^The awards are decided after game 1291/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'MVP' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start awards' })).toBeNull();
  });

  it('starts the awards step as one awards.json batch', async () => {
    const log = stubApi(seasonDocs(ready()));
    renderAt('/league/fba/awards');
    fireEvent.click(await screen.findByRole('button', { name: 'Start awards' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start S79 FBA awards');
    expect(log.batches[0].writes.map(w => w.path)).toEqual(['leagues/fba/S79/awards.json']);
  });

  it('autosaves a changed pick and locks the awards', async () => {
    const s = ready();
    const started = ok(startAwards(s, null)).state;
    const log = stubApi(seasonDocs(started));
    renderAt('/league/fba/awards');
    const mvp = (await screen.findByRole('combobox', { name: 'MVP' })) as HTMLSelectElement;
    const second = mvp.options[2].value;
    fireEvent.change(mvp, { target: { value: second } });
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].path).toBe('leagues/fba/S79/awards.json');
    const lock = screen.getByRole('button', { name: 'Lock awards' }) as HTMLButtonElement;
    await waitFor(() => expect(lock.disabled).toBe(false));
    fireEvent.click(lock);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Lock S79 FBA awards');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/awards.json', 'leagues/fba/S79/transactions.json']);
  });

  it('shows the winners once locked', async () => {
    const started = ok(startAwards(ready(), null)).state;
    stubApi(seasonDocs({ ...started, awards: { ...started.awards!, locked: true } }));
    renderAt('/league/fba/awards');
    expect(await screen.findByRole('heading', { name: 'S79 FBA award winners' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'All-FBA teams' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lock awards' })).toBeNull();
  });

  it('has four league MVP pickers for the D2', async () => {
    const s = withBoxes(regularSeasonDone(fullD2State(), 3, { awardsOpen: true }));
    stubApi(seasonDocs(ok(startAwards(s, null)).state));
    renderAt('/league/fbad2/awards');
    expect(await screen.findByRole('combobox', { name: 'Premier League MVP' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'International League MVP' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'All-FBA teams' })).toBeNull();
  });
});
```

Append to the `describe('PlayoffsPage', …)` block in `web/app/playoffs/PlayoffsPage.test.tsx`:

```tsx
  it('sends you to the Awards step before Lock seeds', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState(), 3, { awardsOpen: true })));
    renderAt('/league/fba/playoffs');
    expect((await screen.findByRole('link', { name: 'Awards step ▸' })).getAttribute('href')).toBe('/league/fba/awards');
    expect(screen.queryByRole('button', { name: 'Lock seeds' })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/awards app/playoffs/PlayoffsPage.test.tsx`
Expected: FAIL, because `AwardsPage` doesn't exist and there's no Awards step link.

- [ ] **Step 3: Write the Awards page**

Create `web/app/awards/AwardsPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { awardProblems, lockAwards, setAllFbaSlot, setAward, startAwards } from '../../engine/awards/awardMoves';
import { ALL_FBA_SLOTS, races, SLOT_POSITIONS, type Race, type RaceRow } from '../../engine/awards/races';
import { leagueStepProblem } from '../../engine/season/moves';
import { blockingPause, PAUSE_LABEL, playerName, seasonDocPath, seasonOver, type SeasonResult } from '../../engine/season/state';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { AwardsFile, RostersFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';
import { useSeasonState } from '../season/useSeasonState';
import { useAutosaveDoc } from '../useAutosaveDoc';
import '../pages/season.css';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function why(race: Race, r: RaceRow): string {
  if (r.defense) return `saved ${r.defense.saved.toFixed(2)}/g · stop rate ${(r.defense.stopRate * 100).toFixed(1)}% · ${r.defense.perGame.toFixed(1)} defended/g`;
  if (r.mip) return `${r.mip.lastRating} → ${r.rating} (${signed(r.mip.boost)}) · score ${r.score.toFixed(1)}${r.mip.secondSeason ? ' · 2nd season' : ''}`;
  return `score ${r.score.toFixed(2)} = ${r.parts.ppg.toFixed(2)} PPG + ${r.parts.rating.toFixed(2)} rtg + ${r.parts.win.toFixed(2)} win%`;
}

function RaceCard({ race, name, abbr }: { race: Race; name: (id: string) => string; abbr: (id: string) => string }) {
  const top = race.rows.slice(0, 10);
  return (
    <div className="card race-card">
      <h3>{race.label}</h3>
      {top.length === 0 ? <p className="muted">No eligible players yet.</p> : (
        <div className="table-wrap">
          <table className="race-table">
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th className="n">PPG</th><th className="n">Rtg</th><th className="n">Odds</th></tr></thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={r.playerId}>
                  <td>{i + 1}</td>
                  <td>{name(r.playerId)}<div className="muted why">{why(race, r)}</div></td>
                  <td>{abbr(r.teamId)}</td><td>{r.position}</td>
                  <td className="n">{r.ppg.toFixed(1)}</td><td className="n">{r.rating}</td><td className="n">{r.odds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AwardsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, versions, error } = useSeasonState(lg);
  const saving = useSaving();
  const lastPath = state && lg === 'fba' ? `leagues/fba/S${state.season - 1}/rosters.json` : null;
  const last = useDoc<RostersFile>(lastPath);
  const path = state && lg ? seasonDocPath('awards', lg, state.season) : '';
  const autosave = useAutosaveDoc<AwardsFile>(path, state?.awards ?? undefined, versions[path] ?? null);
  const [message, setMessage] = useState('');

  if (!lg) return <p className="error">Awards are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state || (lastPath && !last.data && !last.missing && !last.error)) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} awards · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) return <section>{header}<p className="muted">No schedule yet.</p></section>;

  const lastSeason = last.data ?? null;
  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const name = (id: string) => playerName(state, id);
  const abbr = (id: string) => teams.get(id)?.abbr ?? id;
  const doc = autosave.doc ?? state.awards ?? undefined;
  const view = doc ? { ...state, awards: doc } : state;
  const rs = races(view, lastSeason);
  const cards = <div className="race-grid">{rs.map(r => <RaceCard key={r.award} race={r} name={name} abbr={abbr} />)}</div>;
  const leagueName = lg === 'fba' ? 'FBA' : 'D2';

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

  const allFbaTable = (d: AwardsFile, editable: boolean) => {
    if (!d.allFba) return null;
    const mvp = rs.find(r => r.award === 'MVP');
    return (
      <div className="card">
        <h3>All-FBA teams</h3>
        <table className="all-fba">
          <thead><tr><th></th><th>1st team</th><th>2nd team</th></tr></thead>
          <tbody>
            {ALL_FBA_SLOTS.map((slot, i) => {
              const slotName = slot === 'ANY' ? `ANY ${i - 2}` : slot;
              return (
                <tr key={i}>
                  <td>{slotName}</td>
                  {(['team1', 'team2'] as const).map(team => {
                    const s = d.allFba![team][i];
                    if (!editable) return <td key={team}>{s.playerId ? `${name(s.playerId)} (${abbr(s.teamId ?? '')})` : '—'}</td>;
                    const options = (mvp?.rows ?? []).filter(x => SLOT_POSITIONS[slot].includes(x.position));
                    return (
                      <td key={team}>
                        <select aria-label={`All-FBA ${team === 'team1' ? '1st' : '2nd'} team ${slotName}`} value={s.playerId ?? ''}
                          onChange={e => {
                            const r = options.find(x => x.playerId === e.target.value);
                            if (r) autosave.update(cur => setAllFbaSlot(cur, team, i, r.playerId, r.teamId));
                          }}>
                          <option value="" disabled>—</option>
                          {options.map(x => <option key={x.playerId} value={x.playerId}>{name(x.playerId)} ({abbr(x.teamId)}) · {x.position}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (doc?.locked) {
    return (
      <section>
        {header}
        <div className="card">
          <h3>S{state.season} {leagueName} award winners</h3>
          <ul className="award-winners">
            {doc.awards.map(a => <li key={a.award}><b>{rs.find(r => r.award === a.award)?.label ?? a.award}</b>: {name(a.playerId)} ({abbr(a.teamId)})</li>)}
          </ul>
        </div>
        {allFbaTable(doc, false)}
        <h2>Final races</h2>
        {cards}
      </section>
    );
  }

  const over = seasonOver(state);
  const pause = blockingPause(state);
  const stepProblem = leagueStepProblem(state.calendar, lg);
  const ready = over && !pause && !stepProblem;

  if (!doc) {
    const note = !over
      ? `The awards are decided after game ${state.schedule.games.length}. Live races:`
      : pause ? `Finish the ${PAUSE_LABEL[pause.kind]} pause (after game ${pause.afterGame}) first.` : stepProblem;
    return (
      <section>
        {header}
        {note && <p className="muted">{note}</p>}
        {ready && <button className="btn primary" disabled={saving} onClick={() => run(startAwards(state, lastSeason))}>Start awards</button>}
        {message && <p className="error">{message}</p>}
        {cards}
      </section>
    );
  }

  const problems = awardProblems(view, lastSeason, doc);
  return (
    <section>
      {header}
      <p className="muted">Pick each winner (the race leader is suggested), then lock the awards. Picks save as you go.</p>
      <div className="card">
        <h3>Winners</h3>
        <div className="award-picks">
          {rs.filter(r => r.rows.length).map(r => {
            const pick = doc.awards.find(a => a.award === r.award);
            return (
              <label key={r.award}>{r.label}{' '}
                <select aria-label={r.label} value={pick?.playerId ?? ''}
                  onChange={e => {
                    const row = r.rows.find(x => x.playerId === e.target.value);
                    if (row) autosave.update(cur => setAward(cur, r.award, row.playerId, row.teamId));
                  }}>
                  <option value="" disabled>—</option>
                  {r.rows.map((x, i) => <option key={x.playerId} value={x.playerId}>{i + 1}. {name(x.playerId)} ({abbr(x.teamId)})</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </div>
      {allFbaTable(doc, true)}
      {problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <button className="btn primary" disabled={saving || problems.length > 0} onClick={() => run(lockAwards(view, lastSeason, { batchId: newBatchId() }))}>Lock awards</button>
      {autosave.error && <p className="error">{autosave.error}</p>}
      {message && <p className="error">{message}</p>}
      <h2>Races</h2>
      {cards}
    </section>
  );
}
```

- [ ] **Step 4: Playoffs card, tab, route and styles**

In `web/app/playoffs/PlayoffsPage.tsx`, in the `if (!pf) {` branch, replace:

```tsx
        {over && !pause && !stepProblem && <button className="btn primary" disabled={saving} onClick={lock}>Lock seeds</button>}
```

with:

```tsx
        {over && !pause && !stepProblem && !state.awards?.locked && (
          <div className="card pause-card">
            <h3>Awards step</h3>
            <p className="muted">Lock the S{state.season} awards before seeding the playoffs.</p>
            <Link className="btn primary" to={`/league/${lg}/awards`}>Awards step ▸</Link>
          </div>
        )}
        {over && !pause && !stepProblem && state.awards?.locked && <button className="btn primary" disabled={saving} onClick={lock}>Lock seeds</button>}
```

In `web/app/components/LeagueTabs.tsx`, change the FBA/D2 list to include Awards after Playoffs. Task 8 adds Rankings.

```tsx
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['', 'Teams'], ['transactions', 'Transactions']]
```

Update its doc comment to `/** Scores · Standings · Playoffs · Awards · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */`.

In `web/app/shell/Layout.tsx`, add `import { AwardsPage } from '../awards/AwardsPage';`, and add this after the playoffs route:

```tsx
          <Route path="/league/:league/awards" element={<AwardsPage />} />
```

Append to `web/app/pages/season.css`:

```css
.race-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; margin: 10px 0; }
.race-table .why { font-size: 11px; font-weight: 400; }
.award-picks { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
.award-picks label { display: flex; flex-direction: column; gap: 4px; font-weight: 700; }
.award-picks select, .all-fba select { max-width: 100%; }
.all-fba { width: 100%; }
.all-fba td:first-child { font-weight: 700; width: 60px; }
.award-winners { margin: 0; padding-left: 18px; }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/awards app/playoffs app/pages/LeaguePage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

```bash
git add web/app/awards web/app/playoffs/PlayoffsPage.tsx web/app/playoffs/PlayoffsPage.test.tsx web/app/components/LeagueTabs.tsx web/app/shell/Layout.tsx web/app/pages/season.css
git commit -m "feat: Awards tab (live races, pick, lock) and the Playoffs tab's Awards step card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Rankings tab

**Files:**
- Create: `web/app/rankings/RankingsPage.tsx`
- Modify: `web/app/components/LeagueTabs.tsx`, `web/app/shell/Layout.tsx`
- Test: `web/app/rankings/RankingsPage.test.tsx`

**Interfaces:**
- **Consumes:** `rankingMarks`, `rankingAt`, `movement` and `MARK_EVERY` (Task 6); `useSeasonState`, `TeamMark`, `LeagueTabs` and `LEAGUE_LABEL`.
- **Produces:** the route `/league/:league/rankings`, and a Rankings tab after Awards.

- [ ] **Step 1: Write the failing test**

Create `web/app/rankings/RankingsPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State, fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { RankingsPage } from './RankingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/rankings" element={<RankingsPage />} /></Routes>
  </MemoryRouter>,
);

describe('RankingsPage', () => {
  it('says when rankings start', async () => {
    stubApi(seasonDocs(fullFbaState()));
    renderAt('/league/fba/rankings');
    expect(await screen.findByText('Rankings start after game 20.')).toBeTruthy();
  });

  it('defaults to the latest mark and lets you pick an earlier one', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderAt('/league/fba/rankings');
    const picker = (await screen.findByRole('combobox', { name: 'Mark' })) as HTMLSelectElement;
    expect(picker.value).toBe('1290');
    expect(screen.getAllByRole('row')).toHaveLength(31);
    expect(screen.getAllByText(/^[▲▼]\d+$|^—$|^NEW$/).length).toBeGreaterThan(0);
    fireEvent.change(picker, { target: { value: '20' } });
    expect(picker.value).toBe('20');
  });

  it('ranks one D2 league at a time', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullD2State())));
    renderAt('/league/fbad2/rankings');
    await screen.findByRole('combobox', { name: 'Mark' });
    expect(screen.getAllByRole('row')).toHaveLength(17);
    fireEvent.click(screen.getByRole('button', { name: 'IL' }));
    expect(screen.getAllByText(/IL\d\d/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/rankings`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write the page**

Create `web/app/rankings/RankingsPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MARK_EVERY, movement, rankingAt, rankingMarks } from '../../engine/awards/rankingsTimeline';
import { GROUP_ORDER } from '../../engine/season/standings';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import { LeagueTabs } from '../components/LeagueTabs';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import '../pages/season.css';

export function RankingsPage() {
  const { league = '' } = useParams();
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state, error } = useSeasonState(lg);
  const [pick, setPick] = useState('PL');
  const [chosen, setChosen] = useState<number | null>(null);

  if (!lg) return <p className="error">Rankings are only for the FBA and D2.</p>;
  if (error) return <p className="error">Couldn't load the season: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const header = (
    <>
      <h1>{LEAGUE_LABEL[lg]} power rankings · S{state.season}</h1>
      <LeagueTabs league={lg} />
    </>
  );
  if (!state.schedule || !state.results) return <section>{header}<p className="muted">No schedule yet.</p></section>;

  const games = state.results.games;
  const marks = rankingMarks(lg, games.length, state.schedule.games.length);
  if (!marks.length) return <section>{header}<p className="muted">Rankings start after game {MARK_EVERY[lg]}.</p></section>;

  const teams = new Map(state.teams.teams.map(t => [t.teamId, t]));
  const info = state.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));
  const mark = chosen !== null && marks.includes(chosen) ? chosen : marks[marks.length - 1];
  const group = lg === 'fbad2' ? pick : null;
  const rows = rankingAt(info, games, mark, group);
  const k = marks.indexOf(mark);
  const prev = k > 0 ? new Map(rankingAt(info, games, marks[k - 1], group).map(r => [r.teamId, r.rank])) : null;

  return (
    <section>
      {header}
      <div className="toolbar">
        <label>Mark{' '}
          <select aria-label="Mark" value={String(mark)} onChange={e => setChosen(Number(e.target.value))}>
            {marks.map(m => <option key={m} value={String(m)}>After game {m}</option>)}
          </select>
        </label>
        {lg === 'fbad2' && (
          <div className="league-pick" role="group" aria-label="League">
            {GROUP_ORDER.fbad2.map(g => (
              <button key={g} type="button" className={`btn${pick === g ? ' primary' : ''}`} onClick={() => setPick(g)}>{g}</button>
            ))}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="standings rankings">
          <thead><tr><th>#</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">Move</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const t = teams.get(r.teamId);
              return (
                <tr key={r.teamId}>
                  <td>{r.rank ?? '—'}</td>
                  <td>{t && <TeamMark team={t} season={state.season} size={20} />} {t?.name ?? r.teamId}</td>
                  <td className="n">{r.w}</td><td className="n">{r.l}</td>
                  <td className="n">{movement(prev ? prev.get(r.teamId) ?? null : undefined, r.rank)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Tab and route**

In `web/app/components/LeagueTabs.tsx`, change the FBA/D2 list and its comment to the final order:

```tsx
/** Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
```

```tsx
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['rankings', 'Rankings'], ['', 'Teams'], ['transactions', 'Transactions']]
```

In `web/app/shell/Layout.tsx`, add `import { RankingsPage } from '../rankings/RankingsPage';`, and add this after the awards route:

```tsx
          <Route path="/league/:league/rankings" element={<RankingsPage />} />
```

- [ ] **Step 5: Run the tests, typecheck, run the suite, commit**

Run: `npx vitest run app/rankings app/pages/LeaguePage.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing, and all tests pass.

If the "latest mark" test's row count differs because the page shows extra rows (e.g., a header row counts as 1), adjust only the expected count to match the table's rows (1 header + 30 teams; 1 + 16 for a D2 league), not the page.

```bash
git add web/app/rankings web/app/components/LeagueTabs.tsx web/app/shell/Layout.tsx
git commit -m "feat: Rankings tab (marks, movement, per-league D2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a subagent task)

1. **Final review:** a final Opus review of the whole branch against the spec.
2. **Browser check** on a scratch copy, per `CLAUDE.md`:
   - scratch server on 5184, Vite on 5183 with the keep-alive proxy, data from `prep.mjs`, and the driver at `.superpowers/sdd/rscheck/drive.ts` extended as needed;
   - the D2: mid-season races and rankings, the Awards step (4 MVPs), then Lock seeds;
   - the FBA: sim to 1290, the rating pause, then the Awards step with the All-FBA grid (try an invalid slot to see the problem), then Lock, then the transaction line, then Lock seeds;
   - check the Rankings tab at phone width;
   - then stop the servers, delete the scratch data and config, and confirm `git status` is clean and `web/data` unchanged.
3. **Finish the branch** with superpowers:finishing-a-development-branch.
