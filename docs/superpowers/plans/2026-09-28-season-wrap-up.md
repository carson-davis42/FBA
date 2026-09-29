# Season Wrap-up and "Go to next season" (Part 2b-2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish each league's season into a locked season record, lock the finished season and clear Undo, and add "Go to next season" at the end of the calendar:
- **Finish S{n} D2 season / Finish S{n} FBA season:** one batch that writes `summary.json`, locks the game docs, logs a `season` transaction and marks the league step done.
- **Go to next season:** one batch that locks the S{n} roster docs, creates the S{n+1} docs, applies D2 promotion and relegation, resets the calendar and moves `meta` to S{n+1}.
- Both batches carry `resetUndo`, so the server deletes the Undo journal and backups once they succeed.

**Architecture:**
- **Engine** (pure TypeScript):
  - `web/engine/season/wrapUp.ts`: `playerLines`, `seasonRecord`, `finishSeason`;
  - `web/engine/season/nextSeason.ts`: `applyPromotion`, `nextSeasonPaths`, `nextSeasonDocs`;
  - `web/engine/shared/calendar.ts`: `calendarFor`, `reopenProblem`.
- **Data:** `SummaryFile` gains optional record fields; `SeasonState` gains `summary` (doc key `'summary'`), so the finish commits through `commitSeason`. `TransactionsFile` gains an optional `locked`, and `season` joins the transaction types.
- **Server:** `POST /api/batch` accepts `resetUndo`; new read-only `GET /api/history/<league>`.
- **UI:** a Finish card on the Playoffs tab, Reopen refusal and "Go to next season ▸" on the Calendar, a new `/next-season` page, and Home's Continue and champions box.

**Tech Stack:**
- Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict schemas)
- Vitest 2 with jsdom and Testing Library

**Spec:** `docs/superpowers/specs/2026-09-28-season-wrap-up-design.md`

## Global Constraints

- **Repo and commands:** repo root `C:/Users/carso/OneDrive/Documents/Fun/Code/creative_vscode/FBA`. Run every command from `web/`: `npx vitest run <paths>` and `npx tsc --noEmit` (must print nothing).
- **Branch:** work on `wrap-up`. Never commit to `main`.
- **Read-only folders:** never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/` or `FBA Logos/`.
- **Real save data:** never modify `web/data/**` (tests may *read* `web/data/calendar.json`). The committed data must keep passing `web/data.test.ts`. Don't start or stop dev servers on 5173/5174. Leave no stray files; put scratch in `.superpowers/sdd/`.
- **jsdom tests:** every jsdom test file calls `cleanup()` in `afterEach`.
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` on its own line, after a blank line.
- **A season number is the year:** `meta.currentSeason` and `calendar.season` move from n to n+1 only in "Go to next season". Nothing before it may call the season S{n+1}; calendar labels such as "S80 FBA Draft Lottery" come from the calendar and are fine.
- **Wording:**
  - league names in messages and labels: `FBA` and `D2`;
  - buttons: `Finish S{n} FBA season ▸`, `Finish S{n} D2 season ▸`, `Go to next season ▸`, `Start S{n+1}`;
  - batch labels: `Finish S{n} FBA season`, `Finish S{n} D2 season`, `Start S{n+1}`;
  - transaction lines: `S{n} FBA season finished`, `S{n} D2 season finished` (type `season`), and `S{n+1} season started` (type `season`, in both S{n+1} transaction docs);
  - Reopen refusal: `S{n} FBA season is finished`, `S{n} D2 season is finished`.
- **Locked docs can't be rewritten:** the server refuses any write to a doc whose saved copy has `locked: true`. The finish and the rollover write `locked: true` only on docs that are not locked yet.
- **Batches that clear Undo:** the finish and the rollover commit with `{ resetUndo: true }`, and their pages guard the save with a `useRef` (the `useSaving` double-render gotcha).
- **D2 leagues:** tiers `PL`, `WL`, `UL`, `IL` (top first); every league has 16 teams (`D2_LEAGUE_SIZE = 16`).

## Notes on the spec (clarifications this plan makes)

- `finishSeason(state, pauses, ctx)` and `nextSeasonDocs(input, ctx)` take a `MoveContext` for the transaction `batchId`, like `lockAwards`.
- `finishSeason` locks `schedule`, `results`, `playoffs` and (FBA) `allstar` only when they are unlocked. The awards, the finished All-Star doc and every finished rating-pause doc are already locked, and the server refuses to rewrite a locked doc. Instead of writing the pause docs, `finishSeason` refuses if any pause doc passed in is unlocked.
- `SeasonState` gains `summary: SummaryFile | null`, loaded by `useSeasonState`; "the season is finished" is `state.summary !== null`.
- `nextSeasonDocs`, `applyPromotion` and `nextSeasonPaths` live in `web/engine/season/nextSeason.ts` (not `wrapUp.ts`), to keep each file focused. `applyPromotion` returns `{ ok: true; teams; moves } | { ok: false; problems }`, and `nextSeasonDocs` also returns the team `moves`, which the confirm card lists.
- The FBA S{n} free agents are already locked when free agency closes, so the rollover usually skips them.
- Section 10 item 8 (the roadmap and the memory note) was done with the spec commit d19b891; the plan link is added to the roadmap with the plan commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/engine/shared/types.ts` | `Champion` ids, `SummaryFile` record fields and checks, `SeasonTotals`, `SummaryPlayerLine`, `SummaryStanding`, `SummaryAllStar`; `TransactionsFile.locked`; the `season` transaction type; extracted `PlayoffSeed`, `AwardEntry`, `AllFbaTeams` |
| `web/engine/season/state.ts` | `SeasonState.summary`, the `'summary'` doc key and path |
| `web/engine/shared/calendar.ts` | `calendarFor(season)`, `reopenProblem(cal, finished)` |
| `web/engine/season/wrapUp.ts` (new) | `playerLines`, `seasonRecord`, `finishSeason` |
| `web/engine/playoffs/moves.ts` | `recordPlayoffGame` no longer marks the calendar step done |
| `web/engine/season/nextSeason.ts` (new) | `D2_LEAGUE_SIZE`, `applyPromotion`, `nextSeasonPaths`, `nextSeasonDocs` |
| `web/server/storage.ts`, `web/server/handler.ts` | `writeMany(..., { resetUndo })`, `history(league)`, `GET /api/history/<league>` |
| `web/app/api.ts`, `web/app/roster/commit.ts`, `web/app/season/commitSeason.ts` | `resetUndo` passthrough, `useHistory` |
| `web/app/season/useSeasonState.ts`, `web/app/season/testDocs.ts`, `web/engine/season/testFixtures.ts`, `web/app/allstar/testState.ts`, `web/app/d2/testDocs.ts` | Loading and fixtures for `summary`; the test API logs `resetUndo` |
| `web/app/playoffs/FinishSeasonCard.tsx` (new) | The Finish button, its problems, and the save error with Retry |
| `web/app/playoffs/PlayoffsPage.tsx` | Shows the Finish card in the champion card |
| `web/app/pages/Home.tsx` | Continue to `/next-season`; the champions box reads the newest locked summary |
| `web/app/pages/CalendarPage.tsx` | Reopen refusal; "Go to next season ▸" |
| `web/app/pages/NextSeasonPage.tsx` (new), `web/app/shell/Layout.tsx` | The `/next-season` confirm card and route |
| `web/engine/playoffs/season.e2e.test.ts` | The whole year through Go to next season |
| `web/app/allstar/DiceReveal.tsx`, `web/app/allstar/EventSteps.tsx`, `web/app/pages/ScoresPage.tsx`, `web/app/pages/RatingPausePage.tsx`, `web/app/playoffs/PlayoffGamePage.tsx`, `web/app/components/LeagueTabs.tsx` | The section 10 leftovers |

---

### Task 1: Season-record schemas and the `summary` season-state plumbing

**Files:**
- Modify: `web/engine/shared/types.ts`, `web/engine/season/state.ts`, `web/engine/season/testFixtures.ts`, `web/app/allstar/testState.ts`, `web/app/season/useSeasonState.ts`, `web/app/season/testDocs.ts`
- Test: `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`

**Interfaces:**
- **Produces:**
  - `Champion` with optional `teamId`, `runnerUpId` (strings) and `group` (string or null);
  - `SeasonTotals` `{ g, pts, def, stops, allowed, exp }` (non-negative ints);
  - `SummaryPlayerLine` `{ playerId, teamId: string|null, stint: number|null, position, ratingStart: number|null, ratingEnd: number|null, rs: SeasonTotals, po: SeasonTotals|null }`;
  - `SummaryStanding` `{ teamId, name, group, rank, w, l, confW, confL, diff, marker: '*'|'x'|'n'|null, seed: number|null, playoff: { round, champion } | null }`;
  - `SummaryAllStar` `{ allStars, youngStars, asgMvp, fivePoint, dunk }`;
  - `SummaryFile` with optional `awards`, `allFba`, `allStar`, `standings`, `bracket`, `promotion`, `players`;
  - `PlayoffSeed`, `AwardEntry`, `AllFbaTeams` (zod schemas, extracted from `PlayoffsFile` and `AwardsFile`);
  - `TransactionType` including `'season'`; `TransactionsFile.locked?: boolean`;
  - `SeasonState.summary: SummaryFile | null`; `SeasonDocKey` including `'summary'`; `seasonDocPath('summary', league, season)` = `leagues/<league>/S<season>/summary.json`;
  - `useSeasonState` loading `summary.json` (optional) with its version in `versions`.

- [ ] **Step 1: Write the failing tests**

Append to `web/engine/shared/types.test.ts`. Add `SummaryFile` to its import from `./types`.

```ts
describe('SummaryFile season record', () => {
  const totals = { g: 50, pts: 1100, def: 3000, stops: 1700, allowed: 2600, exp: 264100 };
  const line = (over: Record<string, unknown> = {}) => ({
    playerId: 'p00001', teamId: 'BOS', stint: 1, position: 'PG', ratingStart: 84, ratingEnd: 86, rs: totals, po: null, ...over,
  });
  const standing = (teamId: string) => ({
    teamId, name: `${teamId} Club`, group: 'E', rank: 1, w: 60, l: 26, confW: 40, confL: 16, diff: -12, marker: '*', seed: 1, playoff: { round: 4, champion: true },
  });
  const record = (over: Record<string, unknown> = {}) => ({
    league: 'fba', season: 79, locked: true, host: null,
    champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4–1', teamId: 'BOS', runnerUpId: 'MEM', group: null }],
    awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'BOS' }],
    allFba: null,
    allStar: { allStars: ['p00001'], youngStars: [], asgMvp: 'p00001', fivePoint: null, dunk: null },
    standings: [standing('BOS'), standing('MEM')],
    bracket: { seeds: [], series: [] },
    promotion: null,
    players: [line(), line({ stint: 2, teamId: 'MEM', po: totals }), line({ stint: null, teamId: null })],
    ...over,
  });

  it('accepts a full S79 record and the bare S78 shape', () => {
    expect(SummaryFile.safeParse(record()).success).toBe(true);
    const s78 = { league: 'fba', season: 78, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' }] };
    expect(SummaryFile.safeParse(s78).success).toBe(true);
  });

  it('keeps All-FBA and All-Star to the FBA, and promotion to the D2', () => {
    expect(SummaryFile.safeParse(record({ league: 'fbad2' })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ league: 'fbad2', allStar: null })).success).toBe(true);
    expect(SummaryFile.safeParse(record({ promotion: [{ league: 'WL', promoted: [], relegated: [] }] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ league: 'fbad2', allStar: null, promotion: [{ league: 'WL', promoted: ['A', 'B'], relegated: [] }] })).success).toBe(true);
  });

  it('rejects duplicate stint lines, a total without two stints, a half-total line, and duplicate standings teams', () => {
    expect(SummaryFile.safeParse(record({ players: [line(), line()] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ players: [line(), line({ stint: null, teamId: null })] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ players: [line({ stint: null })] })).success).toBe(false);
    expect(SummaryFile.safeParse(record({ standings: [standing('BOS'), standing('BOS')] })).success).toBe(false);
  });
});

describe('TransactionsFile lock and season entries', () => {
  const entry = { seq: 1, batchId: 'b1', type: 'season', teams: [], lines: ['S79 FBA season finished'] };
  it('accepts a season entry, with and without locked', () => {
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, entries: [entry] }).success).toBe(true);
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, locked: true, entries: [entry] }).success).toBe(true);
    expect(TransactionsFile.safeParse({ league: 'fba', season: 79, locked: 'yes', entries: [] }).success).toBe(false);
  });
});
```

Append to `web/engine/shared/schemaRegistry.test.ts`:

```ts
describe('summary.json as a season doc', () => {
  it('has a season doc path', () => {
    expect(seasonDocPath('summary', 'fbad2', 79)).toBe('leagues/fbad2/S79/summary.json');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/types.test.ts engine/shared/schemaRegistry.test.ts`
Expected: FAIL: the record fields are rejected as unknown keys, `season` isn't a transaction type, `locked` is rejected, and `'summary'` isn't a doc key.

- [ ] **Step 3: Change the schemas**

In `web/engine/shared/types.ts`:

1. Replace the `Champion` schema with:

```ts
export const Champion = z.object({
  title: z.string(),
  champion: z.string(),
  runnerUp: z.string().nullable(),
  score: z.string().nullable(),
  /** Set on seasons finished in the app (2b-2c on); imported seasons may lack them. */
  teamId: z.string().min(1).optional(),
  runnerUpId: z.string().min(1).optional(),
  /** The D2 league of this title; null for the FBA. */
  group: z.string().min(1).nullable().optional(),
}).strict();
```

2. Delete the `SummaryFile` schema and its type (the two statements right after `Champion`). They move to the end of the file (item 7).

3. Add `'season'` at the end of the `TransactionType` enum:

```ts
export const TransactionType = z.enum(['signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings', 'awards', 'season']);
```

4. Replace the `TransactionsFile` schema with:

```ts
/** Locked by "Go to next season" once its season is over. */
export const TransactionsFile = z.object({ league: LeagueId, season: int, locked: z.boolean().optional(), entries: z.array(TransactionEntry) }).strict();
```

5. Just before `export const PlayoffsFile`, add:

```ts
export const PlayoffSeed = z.object({ group: z.string().min(1), teams: z.array(teamRef).length(8), notes: z.array(z.string()) }).strict();
export type PlayoffSeed = z.infer<typeof PlayoffSeed>;
```

and in `PlayoffsFile` replace the `seeds:` line with `seeds: z.array(PlayoffSeed),`.

6. Just before `export const AwardsFile`, add:

```ts
export const AwardEntry = z.object({ award: AwardId, playerId: z.string().min(1), teamId: z.string().min(1) }).strict();
export type AwardEntry = z.infer<typeof AwardEntry>;

export const AllFbaTeams = z.object({ team1: z.array(AllFbaSlot).length(5), team2: z.array(AllFbaSlot).length(5) }).strict();
```

and in `AwardsFile` replace the `awards:` and `allFba:` lines with:

```ts
  awards: z.array(AwardEntry),
  /** FBA only. */
  allFba: AllFbaTeams.nullable(),
```

7. Append at the end of the file:

```ts
/** Regular-season or playoff sums for one player; the defense fields add up the box lines that carry them (games from 2b-2b on). */
export const SeasonTotals = z.object({ g: pts, pts, def: pts, stops: pts, allowed: pts, exp: pts }).strict();
export type SeasonTotals = z.infer<typeof SeasonTotals>;

/** One team stint (teamId and stint set), or a traded player's season total (both null). */
export const SummaryPlayerLine = z.object({
  playerId,
  teamId: z.string().min(1).nullable(),
  stint: int.positive().nullable(),
  position: Position,
  ratingStart: int.nullable(),
  ratingEnd: int.nullable(),
  rs: SeasonTotals,
  /** null when the player had no playoff games on this line. */
  po: SeasonTotals.nullable(),
}).strict();
export type SummaryPlayerLine = z.infer<typeof SummaryPlayerLine>;

export const SummaryStanding = z.object({
  teamId: teamRef,
  name: z.string().min(1),
  /** The conference (FBA) or league (D2) that season. */
  group: z.string().min(1),
  /** Place within the group. */
  rank: int.positive(),
  w: pts,
  l: pts,
  confW: pts,
  confL: pts,
  diff: int,
  marker: z.enum(['*', 'x', 'n']).nullable(),
  seed: int.min(1).max(8).nullable(),
  /** The last round the team played; null = missed the playoffs. */
  playoff: z.object({ round: int.min(1).max(4), champion: z.boolean() }).strict().nullable(),
}).strict();
export type SummaryStanding = z.infer<typeof SummaryStanding>;

export const SummaryAllStar = z.object({
  allStars: idList,
  youngStars: idList,
  asgMvp: playerId.nullable(),
  fivePoint: playerId.nullable(),
  dunk: playerId.nullable(),
}).strict();
export type SummaryAllStar = z.infer<typeof SummaryAllStar>;

/** The record of a finished season. The fields after `champions` are optional, so the imported S78 summaries stay valid. */
export const SummaryFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  host: z.string().nullable(),
  champions: z.array(Champion),
  awards: z.array(AwardEntry).optional(),
  /** FBA only. */
  allFba: AllFbaTeams.nullable().optional(),
  /** FBA only. */
  allStar: SummaryAllStar.nullable().optional(),
  standings: z.array(SummaryStanding).optional(),
  bracket: z.object({ seeds: z.array(PlayoffSeed), series: z.array(PlayoffSeries) }).strict().nullable().optional(),
  /** D2 only. */
  promotion: z.array(PromotionLine).nullable().optional(),
  players: z.array(SummaryPlayerLine).optional(),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (doc.league !== 'fba' && (doc.allFba || doc.allStar)) issue('Only the FBA has All-FBA teams and an All-Star weekend');
  if (doc.league !== 'fbad2' && doc.promotion) issue('Only the D2 has promotion and relegation');
  const keys = new Set<string>();
  const stints = new Map<string, number>();
  const totals = new Set<string>();
  for (const p of doc.players ?? []) {
    if ((p.teamId === null) !== (p.stint === null)) issue(`${p.playerId}: a line has both a team and a stint, or neither`);
    const key = `${p.playerId}#${p.stint ?? 'total'}`;
    if (keys.has(key)) issue(`${p.playerId} has two lines for ${p.stint === null ? 'the season total' : `stint ${p.stint}`}`);
    keys.add(key);
    if (p.stint === null) totals.add(p.playerId);
    else stints.set(p.playerId, (stints.get(p.playerId) ?? 0) + 1);
  }
  for (const id of totals) if ((stints.get(id) ?? 0) < 2) issue(`${id} has a season total but fewer than two team lines`);
  const teams = (doc.standings ?? []).map(r => r.teamId);
  if (new Set(teams).size !== teams.length) issue('A team is listed twice in the standings');
});
export type SummaryFile = z.infer<typeof SummaryFile>;
```

- [ ] **Step 4: Add `summary` to the season state**

In `web/engine/season/state.ts`:
- Add `SummaryFile` to the type import from `../shared/types`.
- Add to `SeasonState`, after `awards`:

```ts
  /** The locked season record, once the league's season is finished. */
  summary: SummaryFile | null;
```

- Change `SeasonDocKey` to:

```ts
export type SeasonDocKey = 'rosters' | 'calendar' | 'tx' | 'schedule' | 'results' | 'ratingPause' | 'allstar' | 'playoffs' | 'awards' | 'summary';
```

- Add this case to `seasonDocPath`, after the `'awards'` case:

```ts
    case 'summary': return `leagues/${league}/S${season}/summary.json`;
```

In `web/engine/season/testFixtures.ts`, add `summary: null,` after `awards: null,` in `seasonStateFor`.

In `web/app/allstar/testState.ts`, change `ratingPause: null, allstar: null, playoffs: null, awards: null,` to `ratingPause: null, allstar: null, playoffs: null, awards: null, summary: null,`.

- [ ] **Step 5: Load the summary in the app**

In `web/app/season/useSeasonState.ts`:
- Add `SummaryFile` to the type import.
- After the `awards` line, add `const summary = useDoc<SummaryFile>(at('summary'));`.
- Add `summary` to the `reload` list, right after `awards`.
- Add `['summary', summary]` to the `keyed` versions list, after `['awards', awards]`.
- Add `summary` to `optional`, right after `awards`.
- Add `summary: summary.data ?? null,` to the returned `state`, after `awards`.

In `web/app/season/testDocs.ts`, after the `awards` line, add:

```ts
  if (state.summary) out[seasonDocPath('summary', league, season)] = state.summary;
```

- [ ] **Step 6: Run the tests, typecheck and the full suite**

Run: `npx vitest run engine/shared data.test.ts && npx tsc --noEmit && npx vitest run`
Expected: all tests pass (including every committed data file in `data.test.ts`), and tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add web/engine/shared/types.ts web/engine/shared/types.test.ts web/engine/shared/schemaRegistry.test.ts web/engine/season/state.ts web/engine/season/testFixtures.ts web/app/allstar/testState.ts web/app/season/useSeasonState.ts web/app/season/testDocs.ts
git commit -m "feat: season-record schema, locked transactions, summary season-state plumbing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The calendar template and the Reopen refusal

**Files:**
- Modify: `web/engine/shared/calendar.ts`
- Test: `web/engine/shared/calendar.test.ts`

**Interfaces:**
- **Consumes:** `CalendarFile`, `CalendarStep`, `LeagueId` from `./types`.
- **Produces:**
  - `calendarFor(season: number): CalendarFile`: every step not done; the World Cup step only in even seasons;
  - `reopenProblem(cal: CalendarFile, finished: Set<string>): string | null`: `finished` holds the ids of league steps (`'fba'`, `'fba-d2'`) whose season summary is saved. Returns `S{n} FBA season is finished` / `S{n} D2 season is finished` when "Reopen previous step" would reopen such a step, else null (also null when there is nothing to reopen).

- [ ] **Step 1: Write the failing tests**

In `web/engine/shared/calendar.test.ts`:
- Change the calendar import to `import { calendarFor, currentStepIndex, markCurrentDone, markStepDone, reopenLast, reopenProblem } from './calendar';`.
- Change `import type { CalendarFile } from './types';` to `import { CalendarFile } from './types';`.
- Add at the top: `import { readFileSync } from 'node:fs';` and `import path from 'node:path';`.

Append:

```ts
describe('calendarFor', () => {
  it('matches the committed S79 calendar (golden)', () => {
    const committed = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'data', 'calendar.json'), 'utf8')) as CalendarFile;
    expect(calendarFor(79)).toEqual({ ...committed, steps: committed.steps.map(s => ({ ...s, done: false })) });
  });

  it('adds the World Cup after the draft lottery in even seasons only', () => {
    const s80 = calendarFor(80);
    const ids = s80.steps.map(s => s.id);
    expect(ids.slice(ids.indexOf('s81-fba-draft-lottery'), ids.indexOf('retirement') + 1)).toEqual(['s81-fba-draft-lottery', 's80-world-cup', 'retirement']);
    expect(s80.steps.find(s => s.id === 's80-world-cup')).toEqual({ id: 's80-world-cup', label: 'S80 World Cup', kind: 'league', league: 'fbawc', sub: false, done: false });
    expect(s80.season).toBe(80);
    expect(s80.steps[0]).toEqual({ id: 'adjust-age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: false });
    expect(ids).toContain('make-s80-schedules');
    expect(CalendarFile.safeParse(s80).success).toBe(true);
    expect(calendarFor(81).steps.some(s => s.id.includes('world-cup'))).toBe(false);
  });
});

describe('reopenProblem', () => {
  const at = (done: boolean[]): CalendarFile => ({ season: 79, steps: [
    { id: 'fba-d2', label: 'FBA D2', kind: 'league', league: 'fbad2', sub: false, done: done[0] },
    { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: done[1] },
    { id: 'retirement', label: 'Retirement', kind: 'offseason', league: null, sub: false, done: done[2] },
  ] });

  it('refuses to reopen a league step whose season is finished', () => {
    expect(reopenProblem(at([true, false, false]), new Set(['fba-d2']))).toBe('S79 D2 season is finished');
    expect(reopenProblem(at([true, true, false]), new Set(['fba-d2', 'fba']))).toBe('S79 FBA season is finished');
  });

  it('allows other steps and unfinished league steps, and is null when nothing can be reopened', () => {
    expect(reopenProblem(at([true, true, true]), new Set(['fba-d2', 'fba']))).toBeNull();
    expect(reopenProblem(at([true, false, false]), new Set())).toBeNull();
    expect(reopenProblem(at([false, false, false]), new Set(['fba-d2']))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/calendar.test.ts`
Expected: FAIL: `calendarFor` and `reopenProblem` aren't exported.

- [ ] **Step 3: Implement**

In `web/engine/shared/calendar.ts`, change the import to `import type { CalendarFile, CalendarStep, LeagueId } from './types';` and append:

```ts
/** A fresh calendar for season n, every step not done. Labels and flags follow the committed S79 calendar; even seasons add the World Cup. */
export function calendarFor(n: number): CalendarFile {
  const step = (id: string, label: string, sub = false, league: LeagueId | null = null): CalendarStep => ({
    id, label, kind: league ? 'league' : 'offseason', league, sub, done: false,
  });
  return {
    season: n,
    steps: [
      step('adjust-age', 'Adjust Age', true),
      step('adjust-pro-ratings-reset', 'Adjust Pro Ratings(reset)', true),
      step(`s${n}-fba-draft`, `S${n} FBA Draft`),
      step('free-agency-offseason', 'Free Agency/Offseason'),
      step('fbad2-ratings-reset', 'FBAD2 Ratings(reset)', true),
      step('fbad2-draft', 'FBAD2 Draft', true),
      step(`create-s${n + 1}-class`, `Create S${n + 1} Class`),
      step(`make-s${n}-schedules`, `Make S${n} Schedules`),
      step('fba-d2', 'FBA D2', false, 'fbad2'),
      step('fba', 'FBA', false, 'fba'),
      step(`s${n + 1}-fba-draft-lottery`, `S${n + 1} FBA Draft Lottery`),
      ...(n % 2 === 0 ? [step(`s${n}-world-cup`, `S${n} World Cup`, false, 'fbawc')] : []),
      step('retirement', 'Retirement'),
      step('hall-of-fame-induction', 'Hall of Fame Induction'),
      step(`rank-s${n + 1}-class`, `Rank S${n + 1} Class`),
      step('adjust-college-ratings', 'Adjust College Ratings', true),
      step('fbajc', 'FBAJC', false, 'fbajc'),
    ],
  };
}

const FINISHED_NAME: Record<string, string> = { fba: 'FBA', 'fba-d2': 'D2' };

/**
 * Why "Reopen previous step" is refused, or null. `finished` holds the ids of the league steps whose season is
 * finished (its summary is saved); such a step can't be reopened.
 */
export function reopenProblem(cal: CalendarFile, finished: Set<string>): string | null {
  const i = currentStepIndex(cal);
  const last = cal.steps[(i < 0 ? cal.steps.length : i) - 1];
  return last && finished.has(last.id) ? `S${cal.season} ${FINISHED_NAME[last.id] ?? last.label} season is finished` : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/shared/calendar.test.ts`
Expected: PASS. If the golden test fails, the template follows the committed file: stop and report NEEDS_CONTEXT with the differing step rather than changing `web/data`.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/engine/shared/calendar.ts web/engine/shared/calendar.test.ts
git commit -m "feat: calendarFor season template and reopenProblem for finished league steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The season record (`playerLines`, `seasonRecord`)

**Files:**
- Create: `web/engine/season/wrapUp.ts`
- Test: `web/engine/season/wrapUp.test.ts`

**Interfaces:**
- **Consumes:** Task 1's `SummaryFile`, `SummaryPlayerLine`, `SeasonTotals`, `SeasonState.summary`; `seasonStandings(state)` from `../playoffs/moves`; `POSITIONS` from `../roster/rules`; `groupLabel` from `../shared/leagues`.
- **Produces:**
  - `playerLines(games: { regular: GameResult[]; playoffs: GameResult[] }, rosters: RostersFile, pauses: RatingPauseFile[]): SummaryPlayerLine[]`: sorted by player id, each player's stints in order, then the total line (only for two or more stints);
  - `seasonRecord(state: SeasonState, pauses: RatingPauseFile[]): SummaryFile` (spec section 4), `locked: true`.

Rules the code follows:
- A stint changes whenever a player's box side belongs to a different team than his last stint. Games are visited regular season first, then playoffs, each in saved order.
- `position` is `POSITIONS[k]` for the player's box index `k` in the stint's first game (box lines are in position order); the total line uses the last stint's position.
- `ratingEnd` is the player's rating on any roster at the finish, else null. `ratingStart` is the `oldRating` in the first pause doc (by `afterGame`) that lists him, else `ratingEnd`.
- Every box line counts a game and its points; `def`, `stops`, `allowed`, `exp` add only when the line has `def`.

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/wrapUp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seasonDefense } from '../awards/defense';
import { mulberry32 } from '../d2/random';
import { FINALS } from '../playoffs/bracket';
import { lockSeeds } from '../playoffs/moves';
import { fullD2State, fullFbaState, playPlayoffs, regularSeasonDone } from '../playoffs/testFixtures';
import { SummaryFile, type AllStarFile, type GameResult, type RatingPauseFile, type RostersFile } from '../shared/types';
import { recordGames, simNextGames } from './moves';
import type { SeasonResult } from './state';
import { d2SeasonState } from './testFixtures';
import { playerLines, seasonRecord } from './wrapUp';

const ok = (r: SeasonResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

const pause = (afterGame: number, rows: [string, number][]): RatingPauseFile => ({
  league: 'fba', season: 79, afterGame, locked: true,
  players: rows.map(([playerId, oldRating]) => ({ playerId, teamId: 'AAA', position: 'PG', oldRating, games: 5, ppg: 10, perf: 0, suggested: oldRating, rating: oldRating })),
});

const allStarDoc = (locked: boolean): AllStarFile => ({
  league: 'fba', season: 79, locked,
  selections: { allStars: ['p00001'], captains: [], youngStars: ['p00002'], youngCaptains: [] },
  asgDraft: null, contestDraw: null,
  fivePoint: { rounds: [], winner: 'p00003' },
  dunk: { rounds: [], winner: 'p00004' },
  ysgDraft: null, ysg: null, asg: null,
});

const fbaDone = () => playPlayoffs(ok(lockSeeds(regularSeasonDone(fullFbaState()))).state, 5);
const d2Done = () => playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);

describe('playerLines', () => {
  const D = { def: 10, stops: 4, allowed: 12, exp: 1500 };
  const side = (ids: string[], pts: number, def: boolean) => ids.map(playerId => ({ playerId, pts, ...(def ? D : {}) }));
  const game = (gameNo: number, home: string, homeIds: string[], away: string, awayIds: string[], def = true): GameResult => ({
    gameNo, home, away, homePts: 50, awayPts: 40, box: { home: side(homeIds, 10, def), away: side(awayIds, 8, def) },
  });
  const t = (g: number, pts: number, k: number) => ({ g, pts, def: 10 * k, stops: 4 * k, allowed: 12 * k, exp: 1500 * k });
  const rosters: RostersFile = { league: 'fba', season: 79, locked: false, teams: {
    AAA: [{ playerId: 'p00002', position: 'SG', rating: 80, age: 25, points: 0 }],
    BBB: [{ playerId: 'p00001', position: 'PG', rating: 88, age: 25, points: 0 }],
  } };

  it('splits a traded player into stints plus a total, keeps the playoffs separate, and takes ratingStart from the first pause', () => {
    const regular = [
      game(1, 'AAA', ['p00001', 'p00002'], 'CCC', ['p00009'], false),
      game(2, 'CCC', ['p00009'], 'AAA', ['p00001', 'p00002']),
      game(3, 'BBB', ['p00001'], 'AAA', ['p00004', 'p00002']),
    ];
    const playoffs = [game(1, 'BBB', ['p00001'], 'CCC', ['p00009'])];
    const pauses = [pause(2, [['p00001', 86], ['p00002', 79]]), pause(1, [['p00001', 85]])];
    expect(playerLines({ regular, playoffs }, rosters, pauses)).toEqual([
      { playerId: 'p00001', teamId: 'AAA', stint: 1, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(2, 18, 1), po: null },
      { playerId: 'p00001', teamId: 'BBB', stint: 2, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(1, 10, 1), po: t(1, 10, 1) },
      { playerId: 'p00001', teamId: null, stint: null, position: 'PG', ratingStart: 85, ratingEnd: 88, rs: t(3, 28, 2), po: t(1, 10, 1) },
      { playerId: 'p00002', teamId: 'AAA', stint: 1, position: 'SG', ratingStart: 79, ratingEnd: 80, rs: t(3, 26, 2), po: null },
      { playerId: 'p00004', teamId: 'AAA', stint: 1, position: 'PG', ratingStart: null, ratingEnd: null, rs: t(1, 8, 1), po: null },
      { playerId: 'p00009', teamId: 'CCC', stint: 1, position: 'PG', ratingStart: null, ratingEnd: null, rs: t(2, 18, 1), po: t(1, 8, 1) },
    ]);
  });

  it('sums the same defense as the DPOY race, so points saved match', () => {
    const s = d2SeasonState();
    const { games, problem } = simNextGames(s, 4, mulberry32(1));
    expect(problem).toBeNull();
    const played = ok(recordGames(s, games)).state;
    const lines = playerLines({ regular: played.results!.games, playoffs: [] }, played.rosters, []);
    const race = seasonDefense(played.results);
    expect(lines).toHaveLength(race.size);
    for (const l of lines) {
      const d = race.get(l.playerId)!;
      expect([l.rs.g, l.rs.def, l.rs.stops, l.rs.allowed, l.rs.exp]).toEqual([d.games, d.def, d.stops, d.allowed, d.exp]);
    }
  });
});

describe('seasonRecord', () => {
  it('records the FBA champion, standings, seeds, playoff rounds, bracket and players', () => {
    const s = fbaDone();
    const pf = s.playoffs!;
    const fin = pf.series.find(x => x.id === FINALS)!;
    const loser = fin.winner === fin.home ? fin.away! : fin.home!;
    const rec = seasonRecord(s, []);
    expect(SummaryFile.safeParse(rec).success).toBe(true);
    expect(rec).toMatchObject({ league: 'fba', season: 79, locked: true, host: null, awards: [], allFba: null, allStar: null, promotion: null });
    expect(rec.champions).toEqual([{
      title: 'FBA Champion', champion: `${fin.winner} Club`, runnerUp: `${loser} Club`, score: pf.outcome!.champions[0].score,
      teamId: fin.winner, runnerUpId: loser, group: null,
    }]);
    expect(rec.bracket).toEqual({ seeds: pf.seeds, series: pf.series });
    expect(rec.standings!.map(r => r.group)).toEqual([...Array(15).fill('E'), ...Array(15).fill('W')]);
    expect(rec.standings!.filter(r => r.group === 'W').map(r => r.rank)).toEqual(Array.from({ length: 15 }, (_, k) => k + 1));
    for (const r of rec.standings!) {
      const seeds = pf.seeds.find(x => x.group === r.group)!.teams;
      expect(r.seed).toBe(seeds.includes(r.teamId) ? seeds.indexOf(r.teamId) + 1 : null);
      expect(r.playoff === null).toBe(r.seed === null);
      expect(r.name).toBe(`${r.teamId} Club`);
    }
    expect(rec.standings!.find(r => r.teamId === fin.winner)!.playoff).toEqual({ round: 4, champion: true });
    expect(rec.standings!.find(r => r.teamId === loser)!.playoff).toEqual({ round: 4, champion: false });
    // regularSeasonDone saves no box scores, so every line comes from the 16 playoff teams' games.
    expect(rec.players).toHaveLength(80);
    expect(rec.players!.every(p => p.rs.g === 0 && p.po !== null && p.po.g > 0)).toBe(true);
  });

  it('copies the All-Star results (FBA)', () => {
    const rec = seasonRecord({ ...fbaDone(), allstar: allStarDoc(true) }, []);
    expect(rec.allStar).toEqual({ allStars: ['p00001'], youngStars: ['p00002'], asgMvp: null, fivePoint: 'p00003', dunk: 'p00004' });
  });

  it('records the four D2 champions, the league snapshot and promotion', () => {
    const s = d2Done();
    const out = s.playoffs!.outcome!;
    const rec = seasonRecord(s, []);
    expect(SummaryFile.safeParse(rec).success).toBe(true);
    expect(rec.champions.map(c => [c.title, c.group])).toEqual([
      ['Premier League Champion', 'PL'], ['World League Champion', 'WL'], ['United League Champion', 'UL'], ['International League Champion', 'IL'],
    ]);
    expect(rec.champions.map(c => c.teamId)).toEqual(out.champions.map(c => c.teamId));
    expect(rec.promotion).toEqual(out.promotion);
    expect(rec.allFba).toBeNull();
    expect(rec.allStar).toBeNull();
    for (const r of rec.standings!) expect(r.group).toBe(s.teams.teams.find(t => t.teamId === r.teamId)!.group);
    expect(Math.max(...rec.standings!.map(r => r.playoff?.round ?? 0))).toBe(3);
    expect(rec.standings!.filter(r => r.playoff?.champion).map(r => r.teamId).sort()).toEqual(out.champions.map(c => c.teamId).sort());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/wrapUp.test.ts`
Expected: FAIL: `./wrapUp` doesn't exist.

- [ ] **Step 3: Implement**

Create `web/engine/season/wrapUp.ts`:

```ts
import { seasonStandings } from '../playoffs/moves';
import { POSITIONS } from '../roster/rules';
import { groupLabel } from '../shared/leagues';
import type { BoxLine, GameResult, Position, RatingPauseFile, RostersFile, SeasonTotals, SummaryFile, SummaryPlayerLine } from '../shared/types';
import type { SeasonState } from './state';

const zero = (): SeasonTotals => ({ g: 0, pts: 0, def: 0, stops: 0, allowed: 0, exp: 0 });

const sum = (a: SeasonTotals, b: SeasonTotals): SeasonTotals => ({
  g: a.g + b.g, pts: a.pts + b.pts, def: a.def + b.def, stops: a.stops + b.stops, allowed: a.allowed + b.allowed, exp: a.exp + b.exp,
});

/** Adds one box line; the defense fields only count on lines that carry them (games from 2b-2b on). */
function addLine(t: SeasonTotals, line: BoxLine): void {
  t.g++;
  t.pts += line.pts;
  if (line.def === undefined) return;
  t.def += line.def;
  t.stops += line.stops ?? 0;
  t.allowed += line.allowed ?? 0;
  t.exp += line.exp ?? 0;
}

interface Stint { teamId: string; position: Position; rs: SeasonTotals; po: SeasonTotals | null }

/**
 * Every player's season lines from the box scores: one per team stint (a new stint whenever his team changes),
 * plus a season total for players with two or more stints. Sorted by player id.
 */
export function playerLines(games: { regular: GameResult[]; playoffs: GameResult[] }, rosters: RostersFile, pauses: RatingPauseFile[]): SummaryPlayerLine[] {
  const stints = new Map<string, Stint[]>();
  const visit = (g: GameResult, playoffs: boolean) => {
    for (const side of ['home', 'away'] as const) {
      const teamId = g[side];
      (g.box?.[side] ?? []).forEach((line, k) => {
        const list = stints.get(line.playerId) ?? [];
        let cur = list.at(-1);
        if (!cur || cur.teamId !== teamId) {
          cur = { teamId, position: POSITIONS[k], rs: zero(), po: null };
          list.push(cur);
          stints.set(line.playerId, list);
        }
        if (playoffs) addLine((cur.po ??= zero()), line);
        else addLine(cur.rs, line);
      });
    }
  };
  for (const g of games.regular) visit(g, false);
  for (const g of games.playoffs) visit(g, true);

  const rating = new Map<string, number | null>();
  for (const entries of Object.values(rosters.teams)) for (const e of entries) if (e.playerId) rating.set(e.playerId, e.rating);
  const start = new Map<string, number>();
  for (const p of [...pauses].sort((a, b) => a.afterGame - b.afterGame)) {
    for (const r of p.players) if (!start.has(r.playerId)) start.set(r.playerId, r.oldRating);
  }

  const out: SummaryPlayerLine[] = [];
  for (const playerId of [...stints.keys()].sort()) {
    const list = stints.get(playerId)!;
    const ratingEnd = rating.get(playerId) ?? null;
    const ratingStart = start.get(playerId) ?? ratingEnd;
    list.forEach((s, k) => out.push({ playerId, teamId: s.teamId, stint: k + 1, position: s.position, ratingStart, ratingEnd, rs: s.rs, po: s.po }));
    if (list.length > 1) {
      const po = list.reduce<SeasonTotals | null>((acc, s) => (s.po ? (acc ? sum(acc, s.po) : s.po) : acc), null);
      out.push({ playerId, teamId: null, stint: null, position: list.at(-1)!.position, ratingStart, ratingEnd, rs: list.map(s => s.rs).reduce(sum), po });
    }
  }
  return out;
}

/** The locked record of a finished season (spec section 4), built from the league's season docs. */
export function seasonRecord(state: SeasonState, pauses: RatingPauseFile[]): SummaryFile {
  const pf = state.playoffs;
  const teamName = (id: string) => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const champions = (pf?.outcome?.champions ?? []).map(c => ({
    title: c.group === null ? 'FBA Champion' : `${groupLabel('fbad2', c.group)} Champion`,
    champion: teamName(c.teamId),
    runnerUp: teamName(c.runnerUp),
    score: c.score,
    teamId: c.teamId,
    runnerUpId: c.runnerUp,
    group: c.group,
  }));
  const seedOf = new Map((pf?.seeds ?? []).flatMap(s => s.teams.map((t, i) => [t, i + 1] as const)));
  const lastRound = new Map<string, number>();
  for (const s of pf?.series ?? []) {
    for (const t of [s.home, s.away]) if (t) lastRound.set(t, Math.max(lastRound.get(t) ?? 0, s.round));
  }
  const titled = new Set((pf?.outcome?.champions ?? []).map(c => c.teamId));
  const standings = seasonStandings(state).groups.flatMap(g => g.rows.map(r => ({
    teamId: r.teamId,
    name: teamName(r.teamId),
    group: g.group,
    rank: r.seed,
    w: r.w,
    l: r.l,
    confW: r.confW,
    confL: r.confL,
    diff: r.diff,
    marker: r.marker,
    seed: seedOf.get(r.teamId) ?? null,
    playoff: lastRound.has(r.teamId) ? { round: lastRound.get(r.teamId)!, champion: titled.has(r.teamId) } : null,
  })));
  const a = state.allstar;
  const allStar = state.league === 'fba' && a?.selections
    ? { allStars: a.selections.allStars, youngStars: a.selections.youngStars, asgMvp: a.asg?.mvp ?? null, fivePoint: a.fivePoint?.winner ?? null, dunk: a.dunk?.winner ?? null }
    : null;
  return {
    league: state.league,
    season: state.season,
    locked: true,
    host: null,
    champions,
    awards: state.awards?.awards ?? [],
    allFba: state.league === 'fba' ? state.awards?.allFba ?? null : null,
    allStar,
    standings,
    bracket: pf ? { seeds: pf.seeds, series: pf.series } : null,
    promotion: state.league === 'fbad2' ? pf?.outcome?.promotion ?? null : null,
    players: playerLines({ regular: state.results?.games ?? [], playoffs: pf?.games ?? [] }, state.rosters, pauses),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/season/wrapUp.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/engine/season/wrapUp.ts web/engine/season/wrapUp.test.ts
git commit -m "feat: season record with standings snapshot, bracket and per-stint player lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `finishSeason`, and the last final no longer ends the league step

**Files:**
- Modify: `web/engine/season/wrapUp.ts`, `web/engine/playoffs/moves.ts`
- Test: `web/engine/season/wrapUp.test.ts`, `web/engine/playoffs/moves.test.ts`, `web/engine/playoffs/season.e2e.test.ts`

**Interfaces:**
- **Consumes:** Task 3's `seasonRecord`; `appendTx`, `MoveContext` from `../roster/state`; `leagueStepProblem` from `./moves`; `CALENDAR_STEP`, `seasonFail`, `SeasonDocKey`, `SeasonResult` from `./state`; `markStepDone` from `../shared/calendar`.
- **Produces:**
  - `finishSeason(state: SeasonState, pauses: RatingPauseFile[], ctx: MoveContext): SeasonResult`.
    - Refuses (all problems at once) when: the league step isn't current (the `leagueStepProblem` message); `playoffs.outcome` isn't set (`Finish the playoffs first`); the awards aren't locked (`Lock the S{n} awards first`); `state.summary` exists (`The S{n} {FBA|D2} season is already finished`); a pause doc passed in is unlocked (`Finish the rating adjustments after game {afterGame} first`).
    - `changed` = `['summary', ...unlocked of ['schedule', 'results', 'playoffs', 'allstar'], 'tx', 'calendar']`; label `Finish S{n} {FBA|D2} season`.
  - `recordPlayoffGame` changes only `playoffs` (it still sets `outcome` with the last final).

- [ ] **Step 1: Write the failing tests**

In `web/engine/season/wrapUp.test.ts`:
- Change the `./state` import to `import { seasonWrites, type SeasonResult, type SeasonState } from './state';`.
- Change the `./wrapUp` import to `import { finishSeason, playerLines, seasonRecord } from './wrapUp';`.

Append:

```ts
describe('finishSeason', () => {
  const ctx = { batchId: 'fin' };

  it('writes the locked record, locks the game docs, logs it and marks the league step done', () => {
    const s = d2Done();
    expect(s.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);
    const r = ok(finishSeason(s, [], ctx));
    expect(r.label).toBe('Finish S79 D2 season');
    expect(seasonWrites(r).map(w => w.path)).toEqual([
      'leagues/fbad2/S79/summary.json', 'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json',
      'leagues/fbad2/S79/playoffs.json', 'leagues/fbad2/S79/transactions.json', 'calendar.json',
    ]);
    expect(r.state.summary).toEqual(seasonRecord(s, []));
    for (const d of [r.state.schedule, r.state.results, r.state.playoffs]) expect(d!.locked).toBe(true);
    expect(r.state.tx.entries.at(-1)).toEqual({ seq: 1, batchId: 'fin', type: 'season', teams: [], lines: ['S79 D2 season finished'] });
    expect(r.state.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);
  });

  it('locks an unlocked All-Star doc too, and skips docs that are already locked (FBA)', () => {
    const s = { ...fbaDone(), allstar: allStarDoc(false) };
    const r = ok(finishSeason(s, [pause(1290, [])], ctx));
    expect(r.changed).toEqual(['summary', 'schedule', 'results', 'playoffs', 'allstar', 'tx', 'calendar']);
    expect(r.state.allstar!.locked).toBe(true);
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['S79 FBA season finished']);
    expect(ok(finishSeason({ ...s, allstar: allStarDoc(true) }, [], ctx)).changed).not.toContain('allstar');
  });

  it('refuses before the last final, with unlocked awards, twice, off-step, or with an unfinished rating pause', () => {
    const s = d2Done();
    const problems = (x: SeasonState, pauses: RatingPauseFile[] = []) => {
      const r = finishSeason(x, pauses, ctx);
      return r.ok ? [] : r.problems;
    };
    const partway = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6, 10);
    expect(problems(partway)).toEqual(['Finish the playoffs first']);
    expect(problems({ ...s, awards: { ...s.awards!, locked: false } })).toEqual(['Lock the S79 awards first']);
    const finished = ok(finishSeason(s, [], ctx));
    expect(problems({ ...finished.state, calendar: s.calendar })).toEqual(['The S79 D2 season is already finished']);
    expect(problems({ ...s, calendar: finished.state.calendar })[0]).toMatch(/^The season is played at the FBA D2 step/);
    expect(problems(s, [{ ...pause(1290, []), locked: false }])).toEqual(['Finish the rating adjustments after game 1290 first']);
  });
});
```

In `web/engine/playoffs/moves.test.ts`, in the test `'marks the calendar step done only with the last final (FBA)'`:
- rename it to `'sets the outcome with the last final and leaves the calendar step current (FBA)'`;
- change `expect(almost.calendar.steps.find(x => x.id === 'fba')!.done).toBe(true);` to `expect(almost.calendar.steps.find(x => x.id === 'fba')!.done).toBe(false);`.

In the test `'writes four D2 champions and the promotion lines when the last league final ends'`, change `expect(s.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(true);` to `expect(s.calendar.steps.find(x => x.id === 'fba-d2')!.done).toBe(false);`.

In `web/engine/playoffs/season.e2e.test.ts`, change both `.done).toBe(true);` lines (for `'fba-d2'` and `'fba'`) to `.done).toBe(false);`. Task 9 extends this test through the finish.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/wrapUp.test.ts engine/playoffs`
Expected: FAIL: `finishSeason` isn't exported, and the playoff tests still see the step marked done.

- [ ] **Step 3: Stop the last final from marking the step done**

In `web/engine/playoffs/moves.ts`, replace the end of `recordPlayoffGame`, from `const outcome = outcomeOf(state, playoffs);` to the closing of the function, with:

```ts
  const outcome = outcomeOf(state, playoffs);
  if (outcome) playoffs = { ...playoffs, outcome };
  // The league's calendar step stays current until "Finish S{n} season" (engine/season/wrapUp.ts).
  return {
    ok: true,
    state: { ...state, playoffs },
    changed: ['playoffs'],
    label: `Playoff game ${game.gameNo}: ${game.away} ${game.awayPts} @ ${game.home} ${game.homePts}`,
  };
}
```

Then:
- change its doc comment to `/** Saves a watched playoff game, which must be the front of the rotation. The last final sets the outcome. */`;
- remove the now-unused `markStepDone` import, and `CALENDAR_STEP` and `type SeasonDocKey` from the `../season/state` import.

In `web/engine/season/moves.ts`, change the comment `// The league's calendar step is marked done by the last playoff final (engine/playoffs/moves.ts), not here.` to `// The league's calendar step is marked done by "Finish S{n} season" (engine/season/wrapUp.ts), not here.`.

- [ ] **Step 4: Implement `finishSeason`**

In `web/engine/season/wrapUp.ts`, add these imports:

```ts
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import { leagueStepProblem } from './moves';
import { CALENDAR_STEP, seasonFail, type SeasonDocKey, type SeasonResult, type SeasonState } from './state';
```

and delete the old `import type { SeasonState } from './state';` line; the `./state` import is now `import { CALENDAR_STEP, seasonFail, type SeasonDocKey, type SeasonResult, type SeasonState } from './state';`. Then append:

```ts
const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;
const LOCKABLE = ['schedule', 'results', 'playoffs', 'allstar'] as const;

/** Locks a doc that isn't locked yet; the server refuses to rewrite a locked doc, so locked ones are left alone. */
const locked = <T extends { locked: boolean }>(d: T | null): T | null => (d && !d.locked ? { ...d, locked: true } : d);

/**
 * "Finish S{n} season": writes the locked season record, locks the season's game docs, logs a `season`
 * transaction and marks the league's calendar step done. `pauses` are every rating-pause doc of the season.
 */
export function finishSeason(state: SeasonState, pauses: RatingPauseFile[], ctx: MoveContext): SeasonResult {
  const name = LEAGUE_NAME[state.league];
  const problems: string[] = [];
  const step = leagueStepProblem(state.calendar, state.league);
  if (step) problems.push(step);
  if (!state.playoffs?.outcome) problems.push('Finish the playoffs first');
  if (!state.awards?.locked) problems.push(`Lock the S${state.season} awards first`);
  if (state.summary) problems.push(`The S${state.season} ${name} season is already finished`);
  for (const p of pauses) if (!p.locked) problems.push(`Finish the rating adjustments after game ${p.afterGame} first`);
  if (problems.length) return seasonFail(problems);

  const toLock = LOCKABLE.filter(k => state[k] !== null && !state[k]!.locked);
  const changed: SeasonDocKey[] = ['summary', ...toLock, 'tx', 'calendar'];
  return {
    ok: true,
    state: {
      ...state,
      summary: seasonRecord(state, pauses),
      schedule: locked(state.schedule),
      results: locked(state.results),
      playoffs: locked(state.playoffs),
      allstar: locked(state.allstar),
      tx: appendTx(state.tx, ctx, 'season', [], [`S${state.season} ${name} season finished`]),
      calendar: markStepDone(state.calendar, CALENDAR_STEP[state.league]),
    },
    changed,
    label: `Finish S${state.season} ${name} season`,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/season/wrapUp.test.ts engine/playoffs`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass. If an app test relied on the last final marking the step done, stop and report NEEDS_CONTEXT with the test name.

- [ ] **Step 7: Commit**

```bash
git add web/engine/season/wrapUp.ts web/engine/season/wrapUp.test.ts web/engine/season/moves.ts web/engine/playoffs/moves.ts web/engine/playoffs/moves.test.ts web/engine/playoffs/season.e2e.test.ts
git commit -m "feat: finishSeason move; the last final no longer ends the league step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Server `resetUndo` and history, and the client passthrough

**Files:**
- Modify: `web/server/storage.ts`, `web/server/handler.ts`, `web/app/api.ts`, `web/app/roster/commit.ts`, `web/app/season/commitSeason.ts`, `web/app/d2/testDocs.ts`
- Test: `web/server/storage.test.ts`, `web/server/handler.test.ts`, `web/app/api.test.tsx`

**Interfaces:**
- **Produces:**
  - `Storage.writeMany(label, writes, options?: { resetUndo?: boolean })`: with `resetUndo`, no journal entry is written, and after every write succeeds `.journal/` and `.backups/` are deleted. A failed batch deletes nothing.
  - `Storage.history(league: string): Promise<unknown[]>`: every `leagues/<league>/S<n>/summary.json`, ordered by n.
  - `POST /api/batch` body may carry `resetUndo: boolean`.
  - `GET /api/history/<league>` → `{ league, seasons }`; 404 for an unknown league; 405 for other methods.
  - Client: `postBatch(label, writes, options?: { resetUndo?: boolean })`, `commitDocs(label, docs, versions, options?)`, `commitSeason(result, versions, options?)`, `useHistory(league: string | null): { seasons?: SummaryFile[]; error?: Error }`.
  - Test helper: `ApiLog['batches'][number]` gains `resetUndo?: boolean` (the parsed request body).

- [ ] **Step 1: Write the failing tests**

Append to `web/server/storage.test.ts`:

```ts
describe('Storage resetUndo', () => {
  const files = (dir: string, sub: string) => (existsSync(path.join(dir, sub)) ? readdirSync(path.join(dir, sub)) : []);

  it('writes without a journal entry, then clears the journal and backups', async () => {
    const { dir, storage } = fresh();
    await storage.write('calendar.json', cal(false));
    await storage.writeMany('Mark', [{ path: 'calendar.json', doc: cal(true) }]);
    expect(files(dir, '.journal')).toHaveLength(1);
    expect(files(dir, '.backups').length).toBeGreaterThan(0);
    await storage.writeMany('Finish', [{ path: 'calendar.json', doc: cal(false) }], { resetUndo: true });
    expect(await storage.read('calendar.json')).toEqual(cal(false));
    expect(files(dir, '.journal')).toEqual([]);
    expect(files(dir, '.backups')).toEqual([]);
    expect(await storage.peekUndo()).toBeNull();
    expect(await status(storage.undo())).toBe(404);
  });

  it('keeps the journal and backups when the batch fails', async () => {
    const { dir, storage } = fresh();
    await storage.write('calendar.json', cal(false));
    await storage.writeMany('Mark', [{ path: 'calendar.json', doc: cal(true) }]);
    const backups = files(dir, '.backups');
    const failed = storage.writeMany('Finish', [{ path: 'calendar.json', doc: cal(false), baseVersion: '0000000000000000' }], { resetUndo: true });
    expect(await status(failed)).toBe(409);
    expect(files(dir, '.journal')).toHaveLength(1);
    expect(files(dir, '.backups')).toEqual(backups);
    expect(await storage.peekUndo()).toEqual({ label: 'Mark', blockedBy: null });
  });
});

describe('Storage history', () => {
  it("returns every summary of a league in season order, and nothing for a league with none", async () => {
    const { storage } = fresh();
    const sum = (season: number) => ({ league: 'fba', season, locked: true, host: null, champions: [] });
    for (const s of [79, 9, 78]) await storage.write(`leagues/fba/S${s}/summary.json`, sum(s));
    await storage.write('leagues/fba/S80/rosters.json', { league: 'fba', season: 80, locked: false, teams: {} });
    expect(await storage.history('fba')).toEqual([sum(9), sum(78), sum(79)]);
    expect(await storage.history('fbad2')).toEqual([]);
  });
});
```

Append to `web/server/handler.test.ts`:

```ts
describe('history and resetUndo routes', () => {
  const cal = (done: boolean) => ({ season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done }] });
  const post = (body: unknown) => fetch(`${base}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('returns summaries in season order, 404s an unknown league and refuses other methods', async () => {
    const sum = (season: number) => ({ league: 'fbajc', season, locked: true, host: null, champions: [] });
    for (const s of [12, 3]) {
      const tag = await ifMatch(base, `leagues/fbajc/S${s}/summary.json`);
      const put = await fetch(`${base}/api/state/leagues/fbajc/S${s}/summary.json`, { method: 'PUT', headers: { 'If-Match': tag }, body: JSON.stringify(sum(s)) });
      expect(put.status).toBe(200);
    }
    expect(await (await fetch(`${base}/api/history/fbajc`)).json()).toEqual({ league: 'fbajc', seasons: [sum(3), sum(12)] });
    expect((await fetch(`${base}/api/history/nba`)).status).toBe(404);
    expect((await fetch(`${base}/api/history/fbajc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(405);
  });

  it('clears Undo after a resetUndo batch, and rejects a non-boolean resetUndo', async () => {
    const tag1 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'Mark R', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag1) }] })).status).toBe(200);
    expect((await (await fetch(`${base}/api/undo`)).json()).available).toBe(true);
    const tag2 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'Finish', writes: [{ path: 'calendar.json', doc: cal(false), baseVersion: unquote(tag2) }], resetUndo: true })).status).toBe(200);
    expect(await (await fetch(`${base}/api/undo`)).json()).toEqual({ ok: true, available: false, label: null, blockedBy: null });
    const tag3 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'X', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag3) }], resetUndo: 'yes' })).status).toBe(400);
  });
});
```

In `web/app/api.test.tsx`, add `useHistory` to the `./api` import, add `import { commitDocs } from './roster/commit';`, and append:

```ts
describe('resetUndo passthrough and history', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('sends resetUndo only when asked, through postBatch and commitDocs', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify({ ok: true, batchId: '1', versions: {} }));
    }));
    const writes = [{ path: 'calendar.json', doc: {}, baseVersion: null }];
    await postBatch('A', writes);
    await postBatch('B', writes, { resetUndo: true });
    await commitDocs('C', [{ path: 'calendar.json', doc: {} }], { 'calendar.json': null }, { resetUndo: true });
    expect(bodies).toEqual([{ label: 'A', writes }, { label: 'B', writes, resetUndo: true }, { label: 'C', writes, resetUndo: true }]);
  });

  it('loads a league history', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/history/fba'
      ? new Response(JSON.stringify({ league: 'fba', seasons: [{ season: 78 }] }))
      : new Response('{}', { status: 404 }))));
    const { result } = renderHook(() => useHistory('fba'));
    await waitFor(() => expect(result.current.seasons).toEqual([{ season: 78 }]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server app/api.test.tsx`
Expected: FAIL: `history` and `useHistory` don't exist, `resetUndo` is rejected by the batch schema, and the journal is kept.

- [ ] **Step 3: Implement the storage changes**

In `web/server/storage.ts`:
- Change the fs import to `import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';`.
- After the `BatchWrite` interface, add:

```ts
export interface WriteOptions {
  /** Write without a journal entry, then delete every journal entry and backup once all writes succeed. */
  resetUndo?: boolean;
}
```

- Change the `writeMany` signature to `writeMany(label: string, writes: BatchWrite[], options: WriteOptions = {}): Promise<{ batchId: string; versions: Record<string, string> }> {`.
- Change `await this.saveJournal({ id, label, files: prepared.map(p => ({ path: p.rel, before: p.before, after: p.text })) });` to:

```ts
      if (!options.resetUndo) await this.saveJournal({ id, label, files: prepared.map(p => ({ path: p.rel, before: p.before, after: p.text })) });
```

- Just before `return { batchId: id, versions: ... };` at the end of `writeMany`, add:

```ts
      if (options.resetUndo) await this.clearUndo();
```

- Add these methods after `peekUndo`:

```ts
  /** Every leagues/<league>/S<n>/summary.json, ordered by n. */
  async history(league: string): Promise<unknown[]> {
    let names: string[];
    try {
      names = await readdir(path.join(this.dataDir, 'leagues', league));
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
    const seasons = names
      .map(n => /^S([1-9]\d*)$/.exec(n))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => Number(m[1]))
      .sort((a, b) => a - b);
    const out: unknown[] = [];
    for (const n of seasons) {
      const text = await this.readRaw(this.fullPath(`leagues/${league}/S${n}/summary.json`));
      if (text !== null) out.push(JSON.parse(text));
    }
    return out;
  }

  /** Deletes the Undo journal and the backups. A failure is logged, not thrown: the batch itself has already been saved. */
  private async clearUndo(): Promise<void> {
    for (const dir of [this.journalDir(), path.join(this.dataDir, '.backups')]) {
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 5 });
      } catch (e) {
        console.error(`Couldn't clear ${dir}`, e);
      }
    }
  }
```

- [ ] **Step 4: Implement the handler changes**

In `web/server/handler.ts`:
- Add `import { isLeagueId } from '../engine/shared/leagues';`.
- In `BatchRequest`, add `resetUndo: z.boolean().optional(),` after the `writes` line.
- Change the `writeMany` call to `const { batchId, versions } = await storage.writeMany(batch.data.label, batch.data.writes as BatchWrite[], { resetUndo: batch.data.resetUndo });`.
- Just before `const logo = pathname.match(...)`, add:

```ts
      const history = pathname.match(/^\/api\/history\/([^/]+)$/);
      if (history) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        const league = history[1];
        if (!isLeagueId(league)) return sendJson(res, 404, { error: `Unknown league: ${league}` });
        return sendJson(res, 200, { league, seasons: await storage.history(league) });
      }
```

- [ ] **Step 5: Implement the client passthrough**

In `web/app/api.ts`:
- Add `import type { SummaryFile } from '../engine/shared/types';` after the react import.
- Replace `postBatch` with:

```ts
export function postBatch(label: string, writes: VersionedWrite[], options: { resetUndo?: boolean } = {}): Promise<{ batchId: string; versions: Record<string, string> }> {
  return tracked(async () => {
    const res = await check(await fetch('/api/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options.resetUndo ? { label, writes, resetUndo: true } : { label, writes }),
    }));
    const body = (await res.json()) as { batchId: string; versions?: Record<string, string> };
    notifySaved(writes.map(w => w.path));
    return { batchId: body.batchId, versions: body.versions ?? {} };
  });
}
```

- Append:

```ts
/** Every saved season record of a league, oldest first (`GET /api/history/<league>`). */
export function useHistory(league: string | null): { seasons?: SummaryFile[]; error?: Error } {
  const [state, setState] = useState<{ league?: string; seasons?: SummaryFile[]; error?: Error }>({});
  useEffect(() => {
    if (!league) return;
    let live = true;
    fetch(`/api/history/${league}`)
      .then(check)
      .then(res => res.json() as Promise<{ seasons: SummaryFile[] }>)
      .then(
        body => { if (live) setState({ league, seasons: body.seasons }); },
        (error: unknown) => { if (live) setState({ league, error: error as Error }); },
      );
    return () => { live = false; };
  }, [league]);
  return league !== null && state.league === league ? { seasons: state.seasons, error: state.error } : {};
}
```

In `web/app/roster/commit.ts`, replace `commitDocs` with:

```ts
/** Saves documents as one batch. Each write carries the version this page loaded, so a stale page can't overwrite newer data. */
export async function commitDocs(
  label: string,
  docs: { path: string; doc: unknown }[],
  versions: Versions,
  options: { resetUndo?: boolean } = {},
): Promise<Record<string, string>> {
  const writes = docs.map(d => {
    if (!(d.path in versions)) throw new Error(`No loaded version for ${d.path}; reload the page`);
    return { path: d.path, doc: d.doc, baseVersion: versions[d.path] };
  });
  return (await postBatch(label, writes, options)).versions;
}
```

Replace `web/app/season/commitSeason.ts` with:

```ts
import { seasonWrites, type SeasonResult } from '../../engine/season/state';
import type { Versions } from '../api';
import { commitDocs } from '../roster/commit';

export function commitSeason(result: Extract<SeasonResult, { ok: true }>, versions: Versions, options: { resetUndo?: boolean } = {}): Promise<Record<string, string>> {
  return commitDocs(result.label, seasonWrites(result), versions, options);
}
```

In `web/app/d2/testDocs.ts`, change the `batches` line of `ApiLog` to:

```ts
  batches: { label: string; writes: { path: string; doc: unknown; baseVersion: string | null }[]; resetUndo?: boolean }[];
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run server app/api.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/server/storage.ts web/server/storage.test.ts web/server/handler.ts web/server/handler.test.ts web/app/api.ts web/app/api.test.tsx web/app/roster/commit.ts web/app/season/commitSeason.ts web/app/d2/testDocs.ts
git commit -m "feat: resetUndo batches clear the journal and backups; GET /api/history/<league>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Promotion and the next season's documents

**Files:**
- Create: `web/engine/season/nextSeason.ts`
- Test: `web/engine/season/nextSeason.test.ts`

**Interfaces:**
- **Consumes:** `calendarFor` (Task 2); `SummaryFile.promotion` (Task 1); `TIERS` from `../playoffs/promotion`; `appendTx`, `MoveContext` from `../roster/state`.
- **Produces:**
  - `D2_LEAGUE_SIZE = 16`;
  - `interface TeamMove { teamId: string; from: string; to: string }`;
  - `applyPromotion(teams: TeamsFile, lines: PromotionLine[]): { ok: true; teams: TeamsFile; moves: TeamMove[] } | { ok: false; problems: string[] }`;
  - `nextSeasonPaths(n: number)`: every path the rollover reads or writes (`meta`, `calendar`, `d2Teams`, `fba.{rosters, freeAgents, tx, summary}`, `fbad2.{rosters, reserves, tx, ratings, pool, draft, summary}`, `next.{fbaRosters, fbaFreeAgents, fbaTx, d2Rosters, d2Reserves, d2Tx}`);
  - `interface NextSeasonInput { calendar; meta; d2Teams; fba: { rosters; freeAgents | null; tx; summary | null }; fbad2: { rosters; reserves | null; tx; ratings | null; pool | null; draft | null; summary | null }; nextStarted: boolean }`;
  - `nextSeasonDocs(input: NextSeasonInput, ctx: MoveContext): { ok: true; writes: { path: string; doc: unknown }[]; label: string; moves: TeamMove[] } | { ok: false; problems: string[] }` (spec section 5; the writes are in the order of the table in Step 1's first test).

- [ ] **Step 1: Write the failing tests**

Create `web/engine/season/nextSeason.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fullD2State } from '../playoffs/testFixtures';
import { calendarFor } from '../shared/calendar';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import type { CalendarFile, PromotionLine, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile } from '../shared/types';
import { applyPromotion, nextSeasonDocs, type NextSeasonInput } from './nextSeason';
import { fbaSeasonState } from './testFixtures';

const ctx = { batchId: 'roll' };
const PROMOTION: PromotionLine[] = [
  { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
  { league: 'WL', promoted: ['WL01', 'WL02'], relegated: ['WL15', 'WL16'] },
  { league: 'UL', promoted: ['UL01', 'UL02'], relegated: ['UL15', 'UL16'] },
  { league: 'IL', promoted: ['IL01', 'IL02'], relegated: [] },
];

function ready(): NextSeasonInput {
  const d2 = fullD2State();
  const fba = fbaSeasonState();
  const cal = calendarFor(79);
  const withPoints = (r: RostersFile): RostersFile => ({
    ...r, teams: Object.fromEntries(Object.entries(r.teams).map(([t, es]) => [t, es.map(e => ({ ...e, points: 123 }))])),
  });
  return {
    calendar: { ...cal, steps: cal.steps.map(s => ({ ...s, done: true })) },
    meta: { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    d2Teams: d2.teams,
    fba: {
      rosters: withPoints(fba.rosters),
      freeAgents: { league: 'fba', season: 79, locked: true, players: [] },
      tx: fba.tx,
      summary: { league: 'fba', season: 79, locked: true, host: null, champions: [] },
    },
    fbad2: {
      rosters: withPoints(d2.rosters),
      reserves: { league: 'fbad2', season: 79, locked: false, players: [
        { playerId: 'p09001', position: 'C', age: 30, rating: 60, fromFba: true },
        { playerId: 'p09002', position: 'PG', age: 24, rating: 55 },
      ] },
      tx: d2.tx,
      ratings: null,
      pool: null,
      draft: { league: 'fbad2', season: 79, locked: false, tickets: [], pool: [], picks: [] },
      summary: { league: 'fbad2', season: 79, locked: true, host: null, champions: [], promotion: PROMOTION },
    },
    nextStarted: false,
  };
}

const run = (input: NextSeasonInput) => {
  const r = nextSeasonDocs(input, ctx);
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

describe('nextSeasonDocs', () => {
  it('writes every row of the rollover table, as valid docs', () => {
    const input = ready();
    const r = run(input);
    expect(r.label).toBe('Start S80');
    expect(r.writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/reserves.json', 'leagues/fbad2/S79/transactions.json', 'leagues/fbad2/S79/draft.json',
      'leagues/fba/S80/rosters.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fba/S80/transactions.json',
      'leagues/fbad2/S80/rosters.json', 'leagues/fbad2/S80/reserves.json', 'leagues/fbad2/S80/transactions.json',
      'leagues/fbad2/teams.json', 'calendar.json', 'meta.json',
    ]);
    for (const w of r.writes) {
      expect(schemaForPath(w.path)!.safeParse(w.doc).success).toBe(true);
      expect(pathAgreementProblem(w.path, w.doc)).toBeNull();
      if (w.path.includes('/S79/')) expect(w.doc).toMatchObject({ locked: true });
    }
    const doc = <T>(p: string) => r.writes.find(w => w.path === p)!.doc as T;

    const fba80 = doc<RostersFile>('leagues/fba/S80/rosters.json');
    expect(fba80.season).toBe(80);
    expect(fba80.locked).toBe(false);
    const [team] = Object.keys(input.fba.rosters.teams);
    expect(fba80.teams[team]).toEqual(input.fba.rosters.teams[team].map(e => ({ ...e, points: 0 })));
    expect(Object.values(doc<RostersFile>('leagues/fbad2/S80/rosters.json').teams).flat().every(e => e.points === 0)).toBe(true);

    expect(doc('leagues/fba/S80/freeAgents.json')).toEqual({ league: 'fba', season: 80, locked: false, players: [] });
    expect(doc<ReservesFile>('leagues/fbad2/S80/reserves.json')).toEqual({ league: 'fbad2', season: 80, locked: false, players: [
      { playerId: 'p09001', position: 'C', age: 30, rating: 60 },
      { playerId: 'p09002', position: 'PG', age: 24, rating: 55 },
    ] });
    for (const lg of ['fba', 'fbad2']) {
      expect(doc<TransactionsFile>(`leagues/${lg}/S80/transactions.json`)).toEqual({
        league: lg, season: 80, entries: [{ seq: 1, batchId: 'roll', type: 'season', teams: [], lines: ['S80 season started'] }],
      });
    }
    expect(doc<CalendarFile>('calendar.json')).toEqual(calendarFor(80));
    expect(doc('meta.json')).toEqual({
      currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
    });
  });

  it('applies promotion and relegation to the D2 teams', () => {
    const r = run(ready());
    const teams = r.writes.find(w => w.path === 'leagues/fbad2/teams.json')!.doc as TeamsFile;
    const group = (id: string) => teams.teams.find(t => t.teamId === id)!.group;
    expect([group('PL15'), group('WL01'), group('WL16'), group('UL02'), group('UL15'), group('IL01'), group('PL01')]).toEqual(['WL', 'PL', 'UL', 'WL', 'IL', 'UL', 'PL']);
    expect(r.moves).toHaveLength(12);
    expect(r.moves[0]).toEqual({ teamId: 'PL15', from: 'PL', to: 'WL' });
    for (const lg of ['PL', 'WL', 'UL', 'IL']) expect(teams.teams.filter(t => t.group === lg)).toHaveLength(16);
  });

  it('refuses until every step is done and both seasons are finished, and once S80 exists', () => {
    const problems = (over: Partial<NextSeasonInput>) => {
      const r = nextSeasonDocs({ ...ready(), ...over }, ctx);
      return r.ok ? [] : r.problems;
    };
    const cal = calendarFor(79);
    expect(problems({ calendar: { ...cal, steps: cal.steps.map(s => ({ ...s, done: s.id !== 'fbajc' })) } })).toEqual(['Finish every S79 calendar step first (current step: FBAJC)']);
    expect(problems({ fba: { ...ready().fba, summary: null } })).toEqual(['Finish the S79 FBA season first']);
    const d2Open: SummaryFile = { league: 'fbad2', season: 79, locked: false, host: null, champions: [] };
    expect(problems({ fbad2: { ...ready().fbad2, summary: d2Open } })).toEqual(['Finish the S79 D2 season first']);
    expect(problems({ nextStarted: true })).toEqual(['S80 has already started']);
    expect(problems({ meta: { ...ready().meta, currentSeason: 78 } })).toEqual(['The calendar is for S79 but the current season is S78']);
  });
});

describe('applyPromotion', () => {
  const teams = () => fullD2State().teams;
  const problems = (lines: PromotionLine[]) => {
    const r = applyPromotion(teams(), lines);
    return r.ok ? [] : r.problems;
  };

  it('rejects a team that is not in the line’s league, a move off the ladder, and uneven leagues', () => {
    expect(problems([{ league: 'WL', promoted: ['PL01'], relegated: [] }])).toEqual(["PL01 isn't in the WL"]);
    expect(problems([{ league: 'PL', promoted: ['PL01'], relegated: [] }])).toEqual(["PL01 can't move out of the PL"]);
    expect(problems([{ league: 'WL', promoted: ['WL01'], relegated: [] }])).toEqual([
      'The PL would have 17 teams (it needs 16)', 'The WL would have 15 teams (it needs 16)',
    ]);
  });

  it('leaves the teams unchanged with no lines', () => {
    const r = applyPromotion(teams(), []);
    expect(r.ok && r.teams).toEqual(teams());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/season/nextSeason.test.ts`
Expected: FAIL: `./nextSeason` doesn't exist.

- [ ] **Step 3: Implement**

Create `web/engine/season/nextSeason.ts`:

```ts
import { TIERS } from '../playoffs/promotion';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarFor } from '../shared/calendar';
import type {
  CalendarFile, D2DraftFile, D2PoolFile, D2RatingsFile, FreeAgentsFile, MetaFile, PromotionLine, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile,
} from '../shared/types';

export const D2_LEAGUE_SIZE = 16;

export interface TeamMove { teamId: string; from: string; to: string }

/** Moves each promoted D2 team up one tier and each relegated team down one; every league must keep 16 teams. */
export function applyPromotion(teams: TeamsFile, lines: PromotionLine[]): { ok: true; teams: TeamsFile; moves: TeamMove[] } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const groupOf = new Map(teams.teams.map(t => [t.teamId, t.group]));
  const to = new Map<string, string>();
  const moves: TeamMove[] = [];
  for (const line of lines) {
    const k = TIERS.indexOf(line.league);
    if (k < 0) {
      problems.push(`${line.league} isn't a D2 league`);
      continue;
    }
    const steps: [string[], number][] = [[line.relegated, 1], [line.promoted, -1]];
    for (const [ids, step] of steps) {
      for (const id of ids) {
        const dest = TIERS[k + step];
        if (groupOf.get(id) !== line.league) problems.push(`${id} isn't in the ${line.league}`);
        else if (!dest) problems.push(`${id} can't move out of the ${line.league}`);
        else if (to.has(id)) problems.push(`${id} moves twice`);
        else {
          to.set(id, dest);
          moves.push({ teamId: id, from: line.league, to: dest });
        }
      }
    }
  }
  const next: TeamsFile = { ...teams, teams: teams.teams.map(t => (to.has(t.teamId) ? { ...t, group: to.get(t.teamId)! } : t)) };
  if (!problems.length) {
    for (const lg of TIERS) {
      const count = next.teams.filter(t => t.group === lg).length;
      if (count !== D2_LEAGUE_SIZE) problems.push(`The ${lg} would have ${count} teams (it needs ${D2_LEAGUE_SIZE})`);
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, teams: next, moves };
}

/** Every document "Go to next season" reads or writes, for season n. */
export function nextSeasonPaths(n: number) {
  const fba = (s: number, f: string) => `leagues/fba/S${s}/${f}.json`;
  const d2 = (s: number, f: string) => `leagues/fbad2/S${s}/${f}.json`;
  return {
    meta: 'meta.json',
    calendar: 'calendar.json',
    d2Teams: 'leagues/fbad2/teams.json',
    fba: { rosters: fba(n, 'rosters'), freeAgents: fba(n, 'freeAgents'), tx: fba(n, 'transactions'), summary: fba(n, 'summary') },
    fbad2: {
      rosters: d2(n, 'rosters'), reserves: d2(n, 'reserves'), tx: d2(n, 'transactions'),
      ratings: d2(n, 'ratings'), pool: d2(n, 'pool'), draft: d2(n, 'draft'), summary: d2(n, 'summary'),
    },
    next: {
      fbaRosters: fba(n + 1, 'rosters'), fbaFreeAgents: fba(n + 1, 'freeAgents'), fbaTx: fba(n + 1, 'transactions'),
      d2Rosters: d2(n + 1, 'rosters'), d2Reserves: d2(n + 1, 'reserves'), d2Tx: d2(n + 1, 'transactions'),
    },
  };
}

export interface NextSeasonInput {
  calendar: CalendarFile;
  meta: MetaFile;
  d2Teams: TeamsFile;
  fba: { rosters: RostersFile; freeAgents: FreeAgentsFile | null; tx: TransactionsFile; summary: SummaryFile | null };
  fbad2: {
    rosters: RostersFile; reserves: ReservesFile | null; tx: TransactionsFile;
    ratings: D2RatingsFile | null; pool: D2PoolFile | null; draft: D2DraftFile | null; summary: SummaryFile | null;
  };
  /** True when S{n+1} FBA or D2 rosters already exist. */
  nextStarted: boolean;
}

export type NextSeasonResult =
  | { ok: true; writes: { path: string; doc: unknown }[]; label: string; moves: TeamMove[] }
  | { ok: false; problems: string[] };

/** "Go to next season" (spec section 5): lock S{n}, create S{n+1}, apply D2 promotion, reset the calendar, move meta on. */
export function nextSeasonDocs(input: NextSeasonInput, ctx: MoveContext): NextSeasonResult {
  const n = input.calendar.season;
  const problems: string[] = [];
  const current = input.calendar.steps.find(s => !s.done);
  if (current) problems.push(`Finish every S${n} calendar step first (current step: ${current.label})`);
  if (input.meta.currentSeason !== n) problems.push(`The calendar is for S${n} but the current season is S${input.meta.currentSeason}`);
  if (!input.fba.summary?.locked) problems.push(`Finish the S${n} FBA season first`);
  if (!input.fbad2.summary?.locked) problems.push(`Finish the S${n} D2 season first`);
  if (input.nextStarted) problems.push(`S${n + 1} has already started`);
  const promo = applyPromotion(input.d2Teams, input.fbad2.summary?.promotion ?? []);
  if (!promo.ok) problems.push(...promo.problems);
  if (problems.length || !promo.ok) return { ok: false, problems };

  const next = n + 1;
  const p = nextSeasonPaths(n);
  const writes: { path: string; doc: unknown }[] = [];
  const lock = <T extends { locked?: boolean }>(path: string, doc: T | null) => {
    if (doc && !doc.locked) writes.push({ path, doc: { ...doc, locked: true } });
  };
  lock(p.fba.rosters, input.fba.rosters);
  lock(p.fba.freeAgents, input.fba.freeAgents);
  lock(p.fba.tx, input.fba.tx);
  lock(p.fbad2.rosters, input.fbad2.rosters);
  lock(p.fbad2.reserves, input.fbad2.reserves);
  lock(p.fbad2.tx, input.fbad2.tx);
  lock(p.fbad2.ratings, input.fbad2.ratings);
  lock(p.fbad2.pool, input.fbad2.pool);
  lock(p.fbad2.draft, input.fbad2.draft);

  const carry = (r: RostersFile): RostersFile => ({
    ...r, season: next, locked: false,
    teams: Object.fromEntries(Object.entries(r.teams).map(([t, entries]) => [t, entries.map(e => ({ ...e, points: 0 }))])),
  });
  const started = (league: 'fba' | 'fbad2'): TransactionsFile =>
    appendTx({ league, season: next, entries: [] }, ctx, 'season', [], [`S${next} season started`]);
  const reserves: ReservesFile = {
    league: 'fbad2', season: next, locked: false,
    players: (input.fbad2.reserves?.players ?? []).map(({ fromFba: _fromFba, ...rest }) => rest),
  };
  writes.push(
    { path: p.next.fbaRosters, doc: carry(input.fba.rosters) },
    { path: p.next.fbaFreeAgents, doc: { league: 'fba', season: next, locked: false, players: [] } },
    { path: p.next.fbaTx, doc: started('fba') },
    { path: p.next.d2Rosters, doc: carry(input.fbad2.rosters) },
    { path: p.next.d2Reserves, doc: reserves },
    { path: p.next.d2Tx, doc: started('fbad2') },
    { path: p.d2Teams, doc: promo.teams },
    { path: p.calendar, doc: calendarFor(next) },
    {
      path: p.meta,
      doc: {
        ...input.meta,
        currentSeason: next,
        rosterSeason: { ...input.meta.rosterSeason, fba: next, fbad2: next },
        lastSeason: { ...input.meta.lastSeason, fba: n, fbad2: n },
      },
    },
  );
  return { ok: true, writes, label: `Start S${next}`, moves: promo.moves };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/season/nextSeason.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/engine/season/nextSeason.ts web/engine/season/nextSeason.test.ts
git commit -m "feat: nextSeasonDocs rollover and applyPromotion with the 16-per-league check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Finish button on the Playoffs tab, and Home

**Files:**
- Create: `web/app/playoffs/FinishSeasonCard.tsx`
- Modify: `web/app/playoffs/PlayoffsPage.tsx`, `web/app/pages/Home.tsx`
- Test: `web/app/playoffs/PlayoffsPage.test.tsx`, `web/app/pages/Home.test.tsx`

**Interfaces:**
- **Consumes:** `finishSeason` (Task 4); `commitSeason(result, versions, { resetUndo: true })` and `ApiError`, `getDoc` (Task 5); `SeasonState.summary` (Task 1).
- **Produces:**
  - `FinishSeasonCard({ state, versions })`:
    - with `state.summary`, the text `The S{n} {FBA|D2} season is finished.`;
    - with the league step not current, nothing;
    - otherwise the button `Finish S{n} {FBA|D2} season ▸`, then any refusal problems, or `Save failed: <message>` with a `Retry` button.
  - Home: Continue goes to `/next-season` when every step is done; each league's champions row shows the current season's summary once it exists and is locked, else `meta.lastSeason`'s.

- [ ] **Step 1: Write the failing tests**

In `web/app/playoffs/PlayoffsPage.test.tsx`, add `import { finishSeason } from '../../engine/season/wrapUp';` and append inside the `describe('PlayoffsPage', ...)` block:

```ts
  it('finishes the D2 season as one batch that clears Undo, then says so', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    const log = stubApi(seasonDocs(done));
    renderAt('/league/fbad2/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish S79 D2 season ▸' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0]).toMatchObject({ label: 'Finish S79 D2 season', resetUndo: true });
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fbad2/S79/summary.json', 'leagues/fbad2/S79/schedule.json', 'leagues/fbad2/S79/results.json',
      'leagues/fbad2/S79/playoffs.json', 'leagues/fbad2/S79/transactions.json', 'calendar.json',
    ]);
    expect(log.batches[0].writes[0].baseVersion).toBeNull();
    expect(await screen.findByText('The S79 D2 season is finished.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish S79 D2 season ▸' })).toBeNull();
  });

  it('offers Finish for the FBA once the Finals are over, but not before', async () => {
    const seeded = ok(lockSeeds(regularSeasonDone(fullFbaState()))).state;
    const done = playPlayoffs(seeded, 5);
    stubApi(seasonDocs(done));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('button', { name: 'Finish S79 FBA season ▸' })).toBeTruthy();
    cleanup();
    stubApi(seasonDocs(playPlayoffs(seeded, 5, done.playoffs!.games.length - 1)));
    renderAt('/league/fba/playoffs');
    expect(await screen.findByRole('link', { name: 'Watch ▸' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Finish S79/ })).toBeNull();
  });

  it('shows a failed save with Retry, and Retry saves', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    const log = stubApi(seasonDocs(done));
    const inner = globalThis.fetch;
    let failNext = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/batch' && failNext) {
        failNext = false;
        return new Response(JSON.stringify({ error: 'disk full' }), { status: 500 });
      }
      return inner(url, init);
    }));
    renderAt('/league/fbad2/playoffs');
    fireEvent.click(await screen.findByRole('button', { name: 'Finish S79 D2 season ▸' }));
    expect(await screen.findByText(/Save failed: disk full/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
  });

  it('shows a finished season as finished, with no Finish button', async () => {
    const done = playPlayoffs(ok(lockSeeds(regularSeasonDone(fullD2State()))).state, 6);
    stubApi(seasonDocs(ok(finishSeason(done, [], { batchId: 't' })).state));
    renderAt('/league/fbad2/playoffs');
    expect(await screen.findByText('The S79 D2 season is finished.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Finish S79/ })).toBeNull();
  });
```

In `web/app/pages/Home.test.tsx`, append inside `describe('Home', ...)`:

```ts
  it('continues to the next season once every step is done', async () => {
    const cal = docs['calendar.json'];
    docs['calendar.json'] = { season: 79, steps: [{ id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: true }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Season 79 complete')).toBeTruthy();
      expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/next-season');
    } finally {
      docs['calendar.json'] = cal;
    }
  });

  it("shows this season's champions once that season is finished", async () => {
    docs['leagues/fba/S79/summary.json'] = { league: 'fba', season: 79, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Hawaii Volcanoes', runnerUp: 'Boston Bucks', score: '4–2' }] };
    try {
      render(<MemoryRouter><Home /></MemoryRouter>);
      expect(await screen.findByText('Hawaii Volcanoes')).toBeTruthy();
      expect(screen.getByText('FBA S79 · FBA Champion')).toBeTruthy();
      expect(screen.queryByText('Boston Bucks')).toBeNull();
      expect(await screen.findByText('Salzburg')).toBeTruthy();
    } finally {
      delete docs['leagues/fba/S79/summary.json'];
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/playoffs/PlayoffsPage.test.tsx app/pages/Home.test.tsx`
Expected: FAIL: no Finish button, Continue goes to `/calendar`, and the S78 champion shows.

- [ ] **Step 3: Implement the Finish card**

Create `web/app/playoffs/FinishSeasonCard.tsx`:

```tsx
import { useRef, useState } from 'react';
import { leagueStepProblem } from '../../engine/season/moves';
import { seasonDocPath, type SeasonState } from '../../engine/season/state';
import { finishSeason } from '../../engine/season/wrapUp';
import type { RatingPauseFile } from '../../engine/shared/types';
import { ApiError, getDoc, useSaving, type Versions } from '../api';
import { newBatchId } from '../roster/commit';
import { commitSeason } from '../season/commitSeason';

const LEAGUE_NAME = { fba: 'FBA', fbad2: 'D2' } as const;

/** Every rating-pause doc of the season (FBA only). A pause finished without a doc (test fixtures) is skipped. */
async function loadPauses(state: SeasonState): Promise<RatingPauseFile[]> {
  if (state.league !== 'fba') return [];
  const after = (state.schedule?.pauses ?? []).filter(p => p.kind === 'ratings').map(p => p.afterGame);
  const docs = await Promise.all(after.map(a => getDoc<RatingPauseFile>(seasonDocPath('ratingPause', 'fba', state.season, a)).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  })));
  return docs.filter((d): d is RatingPauseFile => d !== null);
}

/** "Finish S{n} season": one batch that writes the season record, locks the season and clears Undo. */
export function FinishSeasonCard({ state, versions }: { state: SeasonState; versions: Versions }) {
  const saving = useSaving();
  const started = useRef(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const name = LEAGUE_NAME[state.league];
  if (state.summary) return <p className="muted">The S{state.season} {name} season is finished.</p>;
  if (leagueStepProblem(state.calendar, state.league)) return null;

  const finish = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setProblems([]);
    setSaveError('');
    try {
      const r = finishSeason(state, await loadPauses(state), { batchId: newBatchId() });
      if (!r.ok) {
        setProblems(r.problems);
        started.current = false;
        return;
      }
      await commitSeason(r, versions, { resetUndo: true });
    } catch (e) {
      setSaveError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <div className="finish-season">
      {!saveError && <button className="btn primary" disabled={saving} onClick={finish}>Finish S{state.season} {name} season ▸</button>}
      {problems.length > 0 && <ul>{problems.map(p => <li key={p} className="error">{p}</li>)}</ul>}
      {saveError && (
        <p className="error">
          Save failed: {saveError} <button className="btn" disabled={saving} onClick={finish}>Retry</button>
        </p>
      )}
    </div>
  );
}
```

In `web/app/playoffs/PlayoffsPage.tsx`, add `import { FinishSeasonCard } from './FinishSeasonCard';`, and in the champion card, after the `{pf.outcome.promotion?.map(...)}` block and before the card's closing `</div>`, add:

```tsx
          <FinishSeasonCard state={state} versions={versions} />
```

- [ ] **Step 4: Update Home**

In `web/app/pages/Home.tsx`, replace `ChampionRows`'s first three lines (through `if (!data) return null;`) with:

```tsx
function ChampionRows({ league, meta }: { league: LeagueId; meta: MetaFile | undefined }) {
  const current = useDoc<SummaryFile>(meta ? `leagues/${league}/S${meta.currentSeason}/summary.json` : null);
  const last = useDoc<SummaryFile>(meta ? `leagues/${league}/S${meta.lastSeason[league]}/summary.json` : null);
  // The newest locked record: this season's once it is finished, else last season's.
  const data = current.data?.locked ? current.data : last.data;
  if (!data) return null;
```

and in `Home`, change `const target = playoffs ?? (step ? stepTarget(step) : '/calendar');` to:

```tsx
  const target = playoffs ?? (step ? stepTarget(step) : '/next-season');
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/playoffs/PlayoffsPage.test.tsx app/pages/Home.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass, with no React `act(...)` warnings in the output.

- [ ] **Step 7: Commit**

```bash
git add web/app/playoffs/FinishSeasonCard.tsx web/app/playoffs/PlayoffsPage.tsx web/app/playoffs/PlayoffsPage.test.tsx web/app/pages/Home.tsx web/app/pages/Home.test.tsx
git commit -m "feat: Finish season button on the Playoffs tab; Home continues to the next season

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Calendar Reopen refusal, "Go to next season", and the `/next-season` page

**Files:**
- Create: `web/app/pages/NextSeasonPage.tsx`
- Modify: `web/app/pages/CalendarPage.tsx`, `web/app/shell/Layout.tsx`
- Test: `web/app/pages/CalendarPage.test.tsx`, `web/app/pages/NextSeasonPage.test.tsx` (new)

**Interfaces:**
- **Consumes:** `reopenProblem`, `calendarFor` (Task 2); `CALENDAR_STEP` from `engine/season/state`; `nextSeasonDocs`, `nextSeasonPaths`, `NextSeasonInput` (Task 6); `commitDocs(label, docs, versions, { resetUndo: true })` (Task 5).
- **Produces:**
  - Calendar: Reopen is disabled with the `reopenProblem` text shown next to it; when every step is done, a `Go to next season ▸` link to `/next-season` replaces Open/Mark done.
  - `/next-season` (`NextSeasonPage`): a confirm card listing what happens, the D2 team moves (`<name>: <from league> → <to league>`) and "Undo history will be cleared", then `Start S{n+1}`, which commits and routes to `/`. Problems replace the button when `nextSeasonDocs` refuses.

- [ ] **Step 1: Write the failing tests**

Replace the setup of `web/app/pages/CalendarPage.test.tsx` (everything above `describe('CalendarPage', ...)`) with:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

let saved: unknown = null;
let current: unknown;
let extra: Record<string, unknown> = {};
const calendar = { season: 79, steps: [
  { id: 'age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  saved = null;
  current = calendar;
  extra = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return new Response('{"ok":true}'); }
    const rel = url.replace('/api/state/', '');
    if (rel === 'calendar.json') return new Response(JSON.stringify(saved ?? current));
    if (rel in extra) return new Response(JSON.stringify(extra[rel]));
    return new Response(JSON.stringify({ error: `Not found: ${rel}` }), { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
```

and append inside `describe('CalendarPage', ...)`:

```tsx
  it('refuses to reopen a finished league season', async () => {
    current = { season: 79, steps: [
      { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: true },
      { id: 's80-fba-draft-lottery', label: 'S80 FBA Draft Lottery', kind: 'offseason', league: null, sub: false, done: false },
    ] };
    extra['leagues/fba/S79/summary.json'] = { league: 'fba', season: 79, locked: true, host: null, champions: [] };
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText('S79 FBA season is finished')).toBeTruthy();
    expect((screen.getByRole('button', { name: /reopen previous step/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Go to next season once every step is done', async () => {
    current = { ...calendar, steps: calendar.steps.map(s => ({ ...s, done: true })) };
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect((await screen.findByRole('link', { name: 'Go to next season ▸' })).getAttribute('href')).toBe('/next-season');
    expect(screen.queryByRole('button', { name: /^Mark/ })).toBeNull();
  });
```

Create `web/app/pages/NextSeasonPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State } from '../../engine/playoffs/testFixtures';
import { fbaSeasonState } from '../../engine/season/testFixtures';
import { calendarFor } from '../../engine/shared/calendar';
import { META, stubApi } from '../d2/testDocs';
import { NextSeasonPage } from './NextSeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function readyDocs(): Record<string, unknown> {
  const d2 = fullD2State();
  const fba = fbaSeasonState();
  const cal = calendarFor(79);
  return {
    'meta.json': META,
    'calendar.json': { ...cal, steps: cal.steps.map(s => ({ ...s, done: true })) },
    'leagues/fbad2/teams.json': d2.teams,
    'leagues/fba/S79/rosters.json': fba.rosters,
    'leagues/fba/S79/transactions.json': fba.tx,
    'leagues/fba/S79/summary.json': { league: 'fba', season: 79, locked: true, host: null, champions: [] },
    'leagues/fbad2/S79/rosters.json': d2.rosters,
    'leagues/fbad2/S79/transactions.json': d2.tx,
    'leagues/fbad2/S79/summary.json': {
      league: 'fbad2', season: 79, locked: true, host: null, champions: [],
      promotion: [
        { league: 'PL', promoted: [], relegated: ['PL15', 'PL16'] },
        { league: 'WL', promoted: ['WL01', 'WL02'], relegated: [] },
        { league: 'UL', promoted: [], relegated: [] },
        { league: 'IL', promoted: [], relegated: [] },
      ],
    },
  };
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/next-season']}>
    <Routes>
      <Route path="/next-season" element={<NextSeasonPage />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('NextSeasonPage', () => {
  it('lists what will happen, starts S80 as one batch that clears Undo, then goes Home', async () => {
    const log = stubApi(readyDocs());
    renderPage();
    expect(await screen.findByText('PL15 Club: Premier League → World League')).toBeTruthy();
    expect(screen.getByText('WL01 Club: World League → Premier League')).toBeTruthy();
    expect(screen.getByText('Undo history will be cleared.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start S80' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0]).toMatchObject({ label: 'Start S80', resetUndo: true });
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json',
      'leagues/fba/S80/rosters.json', 'leagues/fba/S80/freeAgents.json', 'leagues/fba/S80/transactions.json',
      'leagues/fbad2/S80/rosters.json', 'leagues/fbad2/S80/reserves.json', 'leagues/fbad2/S80/transactions.json',
      'leagues/fbad2/teams.json', 'calendar.json', 'meta.json',
    ]);
    expect(log.batches[0].writes.filter(w => w.path.includes('/S80/')).every(w => w.baseVersion === null)).toBe(true);
    expect(await screen.findByText('Home page')).toBeTruthy();
  });

  it('lists the problems instead of the button when the season is not over', async () => {
    const docs = readyDocs();
    const cal = calendarFor(79);
    docs['calendar.json'] = { ...cal, steps: cal.steps.map(s => ({ ...s, done: s.id !== 'fbajc' })) };
    stubApi(docs);
    renderPage();
    expect(await screen.findByText('Finish every S79 calendar step first (current step: FBAJC)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start S80' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/CalendarPage.test.tsx app/pages/NextSeasonPage.test.tsx`
Expected: FAIL: no refusal text, no Go to next season link, and `./NextSeasonPage` doesn't exist.

- [ ] **Step 3: Update the Calendar page**

In `web/app/pages/CalendarPage.tsx`:
- Change the imports to:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CALENDAR_STEP } from '../../engine/season/state';
import { currentStepIndex, markCurrentDone, reopenLast, reopenProblem } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, SummaryFile } from '../../engine/shared/types';
import { putDoc, useDoc, useSaving } from '../api';
import { toolTarget } from '../stepRoutes';
import './pages.css';
```

- After the `useDoc<CalendarFile>` line, add:

```tsx
  const fbaSummary = useDoc<SummaryFile>(cal ? `leagues/fba/S${cal.season}/summary.json` : null);
  const d2Summary = useDoc<SummaryFile>(cal ? `leagues/fbad2/S${cal.season}/summary.json` : null);
```

- After `const tool = ...`, add:

```tsx
  const finished = new Set<string>();
  if (fbaSummary.data?.locked) finished.add(CALENDAR_STEP.fba);
  if (d2Summary.data?.locked) finished.add(CALENDAR_STEP.fbad2);
  const reopenWhy = reopenProblem(cal, finished);
```

- Replace the `<div className="cal-actions">…</div>` block with:

```tsx
      <div className="cal-actions">
        {tool && (
          <Link className="btn primary" to={tool}>Open {cal.steps[i].label} ▸</Link>
        )}
        {i >= 0 && !tool && (
          <button className="btn primary" disabled={busy || saving} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark "{cal.steps[i].label}" done
          </button>
        )}
        {i < 0 && <Link className="btn primary" to="/next-season">Go to next season ▸</Link>}
        <button
          className="btn"
          disabled={busy || saving || i === 0 || reopenWhy !== null}
          title={reopenWhy ?? undefined}
          onClick={() => save(reopenLast(cal))}
          aria-label="Reopen previous step"
        >
          ↺ Reopen previous step
        </button>
        {reopenWhy && <span className="muted">{reopenWhy}</span>}
      </div>
```

- [ ] **Step 4: Create the Next season page**

Create `web/app/pages/NextSeasonPage.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nextSeasonDocs, nextSeasonPaths, type NextSeasonInput } from '../../engine/season/nextSeason';
import { groupLabel } from '../../engine/shared/leagues';
import type {
  CalendarFile, D2DraftFile, D2PoolFile, D2RatingsFile, FreeAgentsFile, MetaFile, ReservesFile, RostersFile, SummaryFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, useSaving, type DocState, type Versions } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import './pages.css';

/** "Go to next season": the confirm card, then one batch that starts S{n+1} and clears Undo. */
export function NextSeasonPage() {
  const navigate = useNavigate();
  const saving = useSaving();
  const started = useRef(false);
  const [saveError, setSaveError] = useState('');
  const calendar = useDoc<CalendarFile>('calendar.json');
  const n = calendar.data?.season;
  const p = n === undefined ? null : nextSeasonPaths(n);
  const meta = useDoc<MetaFile>('meta.json');
  const d2Teams = useDoc<TeamsFile>(p && p.d2Teams);
  const fbaRosters = useDoc<RostersFile>(p && p.fba.rosters);
  const fbaFreeAgents = useDoc<FreeAgentsFile>(p && p.fba.freeAgents);
  const fbaTx = useDoc<TransactionsFile>(p && p.fba.tx);
  const fbaSummary = useDoc<SummaryFile>(p && p.fba.summary);
  const d2Rosters = useDoc<RostersFile>(p && p.fbad2.rosters);
  const d2Reserves = useDoc<ReservesFile>(p && p.fbad2.reserves);
  const d2Tx = useDoc<TransactionsFile>(p && p.fbad2.tx);
  const d2Ratings = useDoc<D2RatingsFile>(p && p.fbad2.ratings);
  const d2Pool = useDoc<D2PoolFile>(p && p.fbad2.pool);
  const d2Draft = useDoc<D2DraftFile>(p && p.fbad2.draft);
  const d2Summary = useDoc<SummaryFile>(p && p.fbad2.summary);
  const nextFbaRosters = useDoc<RostersFile>(p && p.next.fbaRosters);
  const nextFbaFreeAgents = useDoc<FreeAgentsFile>(p && p.next.fbaFreeAgents);
  const nextFbaTx = useDoc<TransactionsFile>(p && p.next.fbaTx);
  const nextD2Rosters = useDoc<RostersFile>(p && p.next.d2Rosters);
  const nextD2Reserves = useDoc<ReservesFile>(p && p.next.d2Reserves);
  const nextD2Tx = useDoc<TransactionsFile>(p && p.next.d2Tx);

  if (calendar.error) return <p className="error">Couldn't load the calendar: {calendar.error.message}</p>;
  if (!p || n === undefined) return <p className="muted">Loading…</p>;
  const all: [string, DocState<unknown>][] = [
    [p.calendar, calendar], [p.meta, meta], [p.d2Teams, d2Teams],
    [p.fba.rosters, fbaRosters], [p.fba.freeAgents, fbaFreeAgents], [p.fba.tx, fbaTx], [p.fba.summary, fbaSummary],
    [p.fbad2.rosters, d2Rosters], [p.fbad2.reserves, d2Reserves], [p.fbad2.tx, d2Tx],
    [p.fbad2.ratings, d2Ratings], [p.fbad2.pool, d2Pool], [p.fbad2.draft, d2Draft], [p.fbad2.summary, d2Summary],
    [p.next.fbaRosters, nextFbaRosters], [p.next.fbaFreeAgents, nextFbaFreeAgents], [p.next.fbaTx, nextFbaTx],
    [p.next.d2Rosters, nextD2Rosters], [p.next.d2Reserves, nextD2Reserves], [p.next.d2Tx, nextD2Tx],
  ];
  const required: DocState<unknown>[] = [meta, d2Teams, fbaRosters, fbaTx, d2Rosters, d2Tx];
  const failed = all.find(([, d]) => d.error && !d.missing)?.[1].error ?? required.find(d => d.missing)?.error;
  if (failed) return <p className="error">Couldn't load the season: {failed.message}</p>;
  if (all.some(([, d]) => !d.data && !d.missing)) return <p className="muted">Loading…</p>;

  const versions: Versions = Object.fromEntries(all.map(([path, d]) => [path, d.version]));
  const input: NextSeasonInput = {
    calendar: calendar.data!,
    meta: meta.data!,
    d2Teams: d2Teams.data!,
    fba: { rosters: fbaRosters.data!, freeAgents: fbaFreeAgents.data ?? null, tx: fbaTx.data!, summary: fbaSummary.data ?? null },
    fbad2: {
      rosters: d2Rosters.data!, reserves: d2Reserves.data ?? null, tx: d2Tx.data!,
      ratings: d2Ratings.data ?? null, pool: d2Pool.data ?? null, draft: d2Draft.data ?? null, summary: d2Summary.data ?? null,
    },
    nextStarted: Boolean(nextFbaRosters.data || nextD2Rosters.data),
  };
  const preview = nextSeasonDocs(input, { batchId: 'preview' });
  const teamName = (id: string) => d2Teams.data!.teams.find(t => t.teamId === id)?.name ?? id;

  const start = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setSaveError('');
    const r = nextSeasonDocs(input, { batchId: newBatchId() });
    if (!r.ok) {
      started.current = false;
      return;
    }
    try {
      await commitDocs(r.label, r.writes, versions, { resetUndo: true });
      navigate('/');
    } catch (e) {
      setSaveError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <section>
      <h1>Go to next season</h1>
      {!preview.ok ? (
        <div className="card">
          <h3>S{n} isn't finished yet</h3>
          <ul>{preview.problems.map(x => <li key={x}>{x}</li>)}</ul>
          <Link to="/calendar">Calendar ▸</Link>
        </div>
      ) : (
        <div className="card">
          <h3>Start S{n + 1}</h3>
          <ul>
            <li>Locks the S{n} FBA and D2 rosters, free agents, reserves and transactions.</li>
            <li>Creates the S{n + 1} FBA and D2 rosters from the final S{n} rosters, with points reset to 0. Contracts are unchanged.</li>
            <li>Starts S{n + 1} with an empty FBA free-agent list and the S{n} D2 reserves.</li>
            <li>Resets the calendar to S{n + 1} · Adjust Age.</li>
            <li>Undo history will be cleared.</li>
          </ul>
          <h3>D2 promotion and relegation</h3>
          {preview.moves.length ? (
            <ul>
              {preview.moves.map(m => <li key={m.teamId}>{teamName(m.teamId)}: {groupLabel('fbad2', m.from)} → {groupLabel('fbad2', m.to)}</li>)}
            </ul>
          ) : <p className="muted">No teams change leagues.</p>}
          {saveError ? (
            <p className="error">
              Save failed: {saveError} <button className="btn" disabled={saving} onClick={start}>Retry</button>
            </p>
          ) : (
            <button className="btn primary" disabled={saving} onClick={start}>Start S{n + 1}</button>
          )}
        </div>
      )}
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, add `import { NextSeasonPage } from '../pages/NextSeasonPage';` and, after the `/calendar` route, add:

```tsx
          <Route path="/next-season" element={<NextSeasonPage />} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/pages/CalendarPage.test.tsx app/pages/NextSeasonPage.test.tsx app/shell`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass, with no React `act(...)` warnings in the output.

- [ ] **Step 7: Commit**

```bash
git add web/app/pages/CalendarPage.tsx web/app/pages/CalendarPage.test.tsx web/app/pages/NextSeasonPage.tsx web/app/pages/NextSeasonPage.test.tsx web/app/shell/Layout.tsx
git commit -m "feat: Reopen refuses finished seasons; Go to next season confirm page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: A whole year in the engine, through "Go to next season"

**Files:**
- Test: `web/engine/playoffs/season.e2e.test.ts`

**Interfaces:**
- **Consumes:** `calendarFor`, `currentStepIndex`, `markCurrentDone` (Task 2 and existing); `finishSeason` (Task 4); `nextSeasonDocs` (Task 6); `schemaForPath`, `pathAgreementProblem`.
- **Produces:** no new code; one end-to-end test.

This task only extends a test. It should pass as soon as it is written, because Tasks 1–8 built the behaviour. Run it once to confirm, and if it fails, report BLOCKED with the failure. Do not change engine code to make it pass.

- [ ] **Step 1: Extend the test**

In `web/engine/playoffs/season.e2e.test.ts`:
- Add these imports:

```ts
import { nextSeasonDocs } from '../season/nextSeason';
import { finishSeason } from '../season/wrapUp';
import { calendarFor, currentStepIndex, markCurrentDone } from '../shared/calendar';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import type { CalendarFile, MetaFile } from '../shared/types';
```

- Change `import { PlayoffsFile, type RostersFile } from '../shared/types';` to `import { PlayoffsFile, SummaryFile, type RostersFile } from '../shared/types';`.
- Add after `decideAwards`:

```ts
const ctx = { batchId: 'e2e' };
const META: MetaFile = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };

/** The real S79 calendar, sitting at the FBA D2 step. */
function atD2Step(): CalendarFile {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === 'fba-d2');
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
}
```

- Replace the whole `describe('a whole S79 in the engine: D2, then FBA', ...)` block with:

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run engine/playoffs/season.e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/engine/playoffs/season.e2e.test.ts
git commit -m "test: whole-year e2e through both finishes, the tail steps and Go to next season

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The leftover cosmetic fixes (spec section 10, items 2–7)

**Files:**
- Modify: `web/app/allstar/DiceReveal.tsx`, `web/app/allstar/EventSteps.tsx`, `web/app/pages/ScoresPage.tsx`, `web/app/pages/RatingPausePage.tsx`, `web/app/playoffs/PlayoffGamePage.tsx`, `web/app/components/LeagueTabs.tsx`
- Test: `web/app/allstar/EventSteps.test.tsx`, `web/app/pages/ScoresPage.test.tsx`, `web/app/pages/RatingPausePage.test.tsx`, `web/app/playoffs/PlayoffGamePage.test.tsx`, `web/app/components/LeagueTabs.test.tsx`

**Interfaces:**
- **Produces:**
  - `RevealLine.bare?: boolean`: `StaticLines` prints no group header before a bare line;
  - `ysgLines(doc, name)` exported from `EventSteps.tsx`;
  - `gameResultText(game: TeamGame, label: (team: number) => string): string` exported from `EventSteps.tsx`: `"Team X 150–140"`, or `"Team X 144–144, won the roll-off"`;
  - `PlayoffGamePage` remounts when `:n` changes.

- [ ] **Step 1: Write the failing tests**

In `web/app/allstar/EventSteps.test.tsx`:
- Add `import { StaticLines } from './DiceReveal';`, `import { gameResultText, ysgLines } from './EventSteps';` and `import type { TeamGame } from '../../engine/shared/types';`.
- Append inside `describe('All-Star events', ...)`:

```tsx
  it('reads the Young-Star finals and champions without repeated prefixes (B6)', () => {
    const doc = allStarSeasonState('complete').allstar!;
    const { container } = render(<StaticLines lines={ysgLines(doc, id => id)} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/final · Final:/);
    expect(text).not.toContain('Champions · ');
    expect(text.match(/Final: /g)).toHaveLength(3);
    expect(text).toContain('Champions: Team ');
  });

  it('says when a roll-off decided a game (B7)', () => {
    const game: TeamGame = { teams: [0, 1], rolls: [], scores: [144, 144], rollOff: { ids: ['0', '1'], rounds: [] }, winner: 1 };
    expect(gameResultText(game, t => `Team ${t + 1}`)).toBe('Team 2 144–144, won the roll-off');
    expect(gameResultText({ ...game, scores: [150, 140], rollOff: null, winner: 0 }, t => `Team ${t + 1}`)).toBe('Team 1 150–140');
  });
```

In `web/app/pages/ScoresPage.test.tsx`, in the test `'links to the playoffs once the regular season is over'`, add at its end:

```tsx
    expect(screen.queryByRole('combobox', { name: 'Sim to' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quick-sim next game' })).toBeNull();
```

In `web/app/pages/RatingPausePage.test.tsx`, add `import { fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';` and append inside `describe('RatingPausePage', ...)`:

```tsx
  it('continues to the playoffs once the last rating pause is done', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderPage();
    expect((await screen.findByRole('link', { name: 'Continue to playoffs ▸' })).getAttribute('href')).toBe('/league/fba/playoffs');
    expect(screen.queryByRole('link', { name: 'Back to scores ▸' })).toBeNull();
  });
```

In `web/app/playoffs/PlayoffGamePage.test.tsx`, change the router import to `import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';` and append inside `describe('PlayoffGamePage', ...)`:

```tsx
  it('loads the game in the URL when it changes while the page is open', async () => {
    stubApi(seasonDocs(seeded()));
    render(
      <MemoryRouter initialEntries={['/league/fba/playoffs/game/1']}>
        <Link to="/league/fba/playoffs/game/3">go to 3</Link>
        <Routes><Route path="/league/:league/playoffs/game/:n" element={<PlayoffGamePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Sim to end' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'go to 3' }));
    expect(await screen.findByText("This isn't the next playoff game.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sim to end' })).toBeNull();
  });
```

In `web/app/components/LeagueTabs.test.tsx`, append inside `describe('LeagueTabs', ...)`:

```tsx
  it('scrolls the active tab into view (phone width)', () => {
    const seen: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { seen.push(this); };
    try {
      render(<MemoryRouter initialEntries={['/league/fba/rankings']}><LeagueTabs league="fba" /></MemoryRouter>);
      expect(seen.map(e => e.textContent)).toEqual(['Rankings']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/allstar/EventSteps.test.tsx app/pages/ScoresPage.test.tsx app/pages/RatingPausePage.test.tsx app/playoffs/PlayoffGamePage.test.tsx app/components/LeagueTabs.test.tsx`
Expected: FAIL: `ysgLines` and `gameResultText` aren't exported, the Sim-to menu is shown, the link says "Back to scores", game 1 stays on screen under game 3's URL, and nothing is scrolled.

- [ ] **Step 3: Young-Star log wording (B6)**

In `web/app/allstar/DiceReveal.tsx`, add to `RevealLine`:

```ts
  /** Printed without its group header, because the text already says what it is. */
  bare?: boolean;
```

and in `StaticLines` change the header line to:

```tsx
          {(i === 0 || lines[i - 1].group !== l.group) && !l.bare && <strong>{l.group} · </strong>}
```

In `web/app/allstar/EventSteps.tsx`, replace `function ysgLines(...)` with:

```tsx
export function ysgLines(doc: NonNullable<StepProps['doc']>, name: (id: string) => string): RevealLine[] {
  const ysg = doc.ysg!;
  const label = (t: number) => `Team ${name(doc.selections!.youngCaptains[t])}`;
  const games: [string, TeamGame][] = [['Semifinal 1', ysg.semis[0]], ['Semifinal 2', ysg.semis[1]], ['Final', ysg.final]];
  return [
    ...games.flatMap(([title, g]) => teamGameLines(g, label, name, i => `${title} · round ${i + 1}`).map(l => ({
      ...l,
      side: undefined,
      group: l.group === 'Final' || l.group === 'Roll-off' ? `${title} · ${l.group.toLowerCase()}` : l.group,
      bare: l.group === 'Final' || undefined,
    }))),
    { group: 'Champions', text: `Champions: ${label(ysg.champion)}`, bare: true },
  ];
}
```

- [ ] **Step 4: Roll-off wording in the wrap-up (B7)**

In `web/app/allstar/EventSteps.tsx`, add after `teamGameLines`:

```tsx
/** "Team X 150–140", or "Team X 144–144, won the roll-off" when a roll-off decided the game. */
export function gameResultText(game: TeamGame, label: (team: number) => string): string {
  const side = game.teams.indexOf(game.winner);
  const text = `${label(game.winner)} ${game.scores[side]}–${game.scores[1 - side]}`;
  return game.rollOff ? `${text}, won the roll-off` : text;
}
```

and in `WrapUp` replace the All-Star Game line with:

```tsx
        <li>All-Star Game: {gameResultText(g, t => `Team ${name(teams[t][0])}`)} · MVP {name(doc.asg.mvp)}</li>
```

- [ ] **Step 5: Hide the sim controls once the regular season is over (B8)**

In `web/app/pages/ScoresPage.tsx`, wrap the whole `<div className="sim-controls">…</div>` block in `{!over && ( … )}`.

- [ ] **Step 6: Rating pause link**

In `web/app/pages/RatingPausePage.tsx`, add `seasonOver` to the `../../engine/season/state` import and replace the `if (!due) { … }` block with:

```tsx
  if (!due) {
    const next = seasonOver(state)
      ? <Link to="/league/fba/playoffs">Continue to playoffs ▸</Link>
      : <Link to="/league/fba/scores">Back to scores ▸</Link>;
    return <section>{title}<p className="muted">No rating adjustment is due right now. {next}</p></section>;
  }
```

- [ ] **Step 7: Key the playoff game page on its URL**

In `web/app/playoffs/PlayoffGamePage.tsx`, rename the existing `export function PlayoffGamePage()` to `function PlayoffGame()` (its body is unchanged) and add above it:

```tsx
/** Keyed on the game number, so changing the URL starts fresh instead of keeping another game's live sim. */
export function PlayoffGamePage() {
  const { n = '' } = useParams();
  return <PlayoffGame key={n} />;
}
```

- [ ] **Step 8: Scroll the active league tab into view**

Replace `web/app/components/LeagueTabs.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/** Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions for the FBA and D2; other leagues only have Teams for now. */
export function LeagueTabs({ league }: { league: string }) {
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // At phone width the strip scrolls sideways; keep the current tab visible.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['rankings', 'Rankings'], ['', 'Teams'], ['transactions', 'Transactions']]
    : [['', 'Teams']];
  return (
    <nav ref={nav} className="league-tabs" aria-label="League sections">
      {tabs.map(([path, label]) => (
        <NavLink key={label} end to={path ? `/league/${league}/${path}` : `/league/${league}`}>{label}</NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run app/allstar/EventSteps.test.tsx app/pages/ScoresPage.test.tsx app/pages/RatingPausePage.test.tsx app/playoffs/PlayoffGamePage.test.tsx app/components/LeagueTabs.test.tsx`
Expected: PASS.

- [ ] **Step 10: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; all tests pass.

- [ ] **Step 11: Commit**

```bash
git add web/app/allstar/DiceReveal.tsx web/app/allstar/EventSteps.tsx web/app/allstar/EventSteps.test.tsx web/app/pages/ScoresPage.tsx web/app/pages/ScoresPage.test.tsx web/app/pages/RatingPausePage.tsx web/app/pages/RatingPausePage.test.tsx web/app/playoffs/PlayoffGamePage.tsx web/app/playoffs/PlayoffGamePage.test.tsx web/app/components/LeagueTabs.tsx web/app/components/LeagueTabs.test.tsx
git commit -m "fix: YSG log and roll-off wording, hide sim controls after the season, pause link, keyed game page, tab scroll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a subagent task)

1. **Final review:** a final Opus review of the whole branch against the spec. Align the spec with any clarifications above that the review accepts (the `ctx` arguments, `nextSeason.ts`, locked docs not rewritten).
2. **Browser check** on a scratch copy, per `CLAUDE.md`:
   - scratch server on 5184, Vite on 5183 with the keep-alive proxy, data from `prep.mjs`, and the driver at `.superpowers/sdd/rscheck/drive.ts` extended as needed;
   - play the D2 to its last final and finish it: the S79 D2 pages are read-only, Undo is empty, and `.journal/` is empty;
   - play the FBA and finish it;
   - Mark done through FBAJC; Reopen is refused right after each finish;
   - Go to next season: the app shows S80 · Adjust Age, the D2 teams have moved leagues, S80 rosters exist with points 0, `.journal/` is empty, Home's champions box shows the S79 champions, and `GET /api/history/fbad2` returns S78 and S79 with the S79 standings showing the S79 leagues;
   - then stop the servers, delete the scratch data and config, and confirm `git status` is clean and `web/data` unchanged.
3. **Roadmap:** mark 2b-2c done in §10 of `docs/superpowers/specs/2026-09-25-fba-web-design.md` and update the memory note.
4. **Finish the branch** with superpowers:finishing-a-development-branch.
