# Part 7b Season Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tools for three calendar steps: S80 FBA Draft Lottery, Retirement and Hall of Fame Induction, including the Hall of Fame import and page.

**Architecture:** There are three pure engine modules in `web/engine/offseason/`. Every move returns the existing `WritesResult` (`engine/season/moves.ts`): `{ ok: true, writes, label } | { ok: false, problems }`. Each page loads its docs with `useDoc`, saves with `commitDocs(label, writes, versions)` and marks its calendar step done in the same batch. The Hall of Fame doc is created by a new `npm run import -- --hall-of-fame` mode.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3, Vitest 2 (jsdom), exceljs (importer).

Spec: `docs/superpowers/specs/2026-09-29-offseason-7b-season-tail-design.md`.

## Global Constraints

- Run everything from `web/`. `npx tsc --noEmit` must print nothing.
- Filter test output to the summary lines: `npx vitest run <paths> 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- Never touch `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`. Don't start or stop servers on 5173/5174.
- Vitest globals are off: import `describe/it/expect/vi/afterEach` explicitly, and each jsdom test file calls `cleanup()` in `afterEach`.
- Every random choice takes an injected `Rng` (`engine/d2/random.ts`); pages pass `Math.random`.
- Nothing may say "S80" as the current season. "S80 Draft" is fine because it names the pick season.
- Lottery size is read from the data, never assumed to be 14 (D15).
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Page tests follow `app/pages/D2RatingsPage.test.tsx` (a stubbed `fetch` that serves docs with ETags and records PUT/batch bodies).

## Files

| File | Responsibility |
|---|---|
| `engine/shared/types.ts` (modify) | `RetiredInfo` + `Player.retired`; `LotteryFile`; `HofCard`/`HallOfFameFile`; three new `TransactionType`s |
| `engine/shared/schemaRegistry.ts` (modify) | Path rules for `lottery.json` and `hallOfFame.json` |
| `engine/roster/picks.ts` (modify) | `resolvePicks` throws for teams not in the order |
| `engine/offseason/lottery.ts` (+test) | Odds, draw, full order, `runLottery` |
| `engine/offseason/retirement.ts` (+test) | Pools, auto list, `retirePlayers` |
| `engine/offseason/hallOfFame.ts` (+test) | Candidates, prefill, add/edit/remove, `induct` |
| `importers/sheets/hallOfFame.ts` (+test) | Parse the sheet's Hall of Fame tab |
| `importers/run.ts` (modify) | `--hall-of-fame` mode |
| `app/offseason/LotteryPage.tsx` (+test) | Lottery page |
| `app/offseason/RetirementPage.tsx` (+test) | Retirement page |
| `app/offseason/HallOfFamePage.tsx` (+test) | Hall and Nominees tabs |
| `app/stepRoutes.ts`, `app/shell/Layout.tsx`, `app/shell/Sidebar.tsx` (modify) | Routes, calendar tool links, sidebar link |

---

### Task 1: Schemas, loud `resolvePicks`, lottery engine

**Files:**
- Modify: `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/roster/picks.ts`, `web/engine/roster/picks.test.ts` (only if a test relied on unknown teams being kept silently)
- Create: `web/engine/offseason/lottery.ts`, `web/engine/offseason/lottery.test.ts`
- Test: `web/engine/shared/types.test.ts` (add schema cases)

**Interfaces (produces):**
- `RetiredInfo`, `LotteryFile`, `LotteryOdds`, `LotteryPick`, `HofCard`, `HallOfFameFile` (zod + types); `TransactionType` gains `'lottery' | 'retired' | 'hall-of-fame'`.
- `LOTTERY_ODDS`, `lotteryOdds`, `drawLottery`, `draftOrder`, `LotteryState`, `lotteryStepId`, `lotteryPath`, `lotteryPreview`, `runLottery` (signatures below).

- [ ] **Step 1: Schemas.** In `types.ts`, just above `Player`:

```ts
export const RetiredInfo = z.object({
  season: int,
  league: z.enum(['fba', 'fbad2']),
  /** null = D2 Reserves. */
  teamId: z.string().min(1).nullable(),
  position: Position,
}).strict();
export type RetiredInfo = z.infer<typeof RetiredInfo>;
```

Add `retired: RetiredInfo.optional(),` to `Player`. Add `'lottery', 'retired', 'hall-of-fame'` to the end of `TransactionType`. At the end of the file:

```ts
export const LotteryOdds = z.object({ teamId: z.string().min(1), slot: int.positive(), w: int, l: int, pct: z.number().min(0).max(100) }).strict();
export type LotteryOdds = z.infer<typeof LotteryOdds>;

export const LotteryPick = z.object({
  slot: int.positive(),
  originalTeam: z.string().min(1),
  owner: z.string().min(1),
  obligationId: z.string().min(1).nullable(),
  flag: z.string().min(1).nullable(),
}).strict();
export type LotteryPick = z.infer<typeof LotteryPick>;

/** leagues/fba/S{n}/lottery.json: the lottery held in season n for the S{n+1} draft. */
export const LotteryFile = z.object({
  league: z.literal('fba'),
  season: int,
  draftSeason: int,
  locked: z.boolean(),
  odds: z.array(LotteryOdds),
  /** The drawn lottery, pick 1 first. */
  lottery: z.array(z.string().min(1)),
  /** The full draft order, pick 1 first. */
  order: z.array(z.string().min(1)),
  picks: z.array(LotteryPick),
}).strict();
export type LotteryFile = z.infer<typeof LotteryFile>;

export const HofCard = z.object({
  name: z.string().min(1),
  playerId: z.string().regex(/^p\d{5}$/).nullable(),
  /** Text: the sheet has "S64", "FFL" and "S--". */
  retiredSeason: z.string().min(1),
  lines: z.array(z.string()),
}).strict();
export type HofCard = z.infer<typeof HofCard>;

export const HallOfFameFile = z.object({
  league: z.literal('fba'),
  /** Oldest first; `season` is text like "S8". */
  classes: z.array(z.object({ season: z.string().min(1), inductees: z.array(HofCard) }).strict()),
  nominees: z.array(HofCard).max(15),
  /** Removed nominees; they can't be nominated again. */
  removed: z.array(z.object({ name: z.string().min(1), playerId: z.string().regex(/^p\d{5}$/).nullable() }).strict()),
}).strict();
export type HallOfFameFile = z.infer<typeof HallOfFameFile>;
```

In `schemaRegistry.ts`, import both and add these rules:

```ts
  [new RegExp(`^leagues/fba/${S}/lottery\\.json$`), LotteryFile],
  [/^leagues\/fba\/hallOfFame\.json$/, HallOfFameFile],
```

Add `types.test.ts` cases: a valid `LotteryFile` and a valid `HallOfFameFile` parse; 16 nominees fail; a `Player` with `retired` parses and one with an extra key fails.

- [ ] **Step 2: Loud `resolvePicks`.** In `picks.ts`, right after `const current = …`, add:

```ts
  const unknown = [...new Set(current.flatMap(o => [o.originalTeam, ...(o.condition.kind === 'swap' ? [o.condition.otherTeam] : [])]))].filter(t => !slotOf.has(t));
  if (unknown.length) throw new Error(`S${season} picks name teams not in the draft order: ${unknown.join(', ')}`);
```

Delete the now-dead line `kept.push(...current.filter(o => o.condition.kind !== 'swap' && !slotOf.has(o.originalTeam)));`. The swap branch's `slotA/slotB === undefined` guard can stay. Add a test: an obligation for team `'ZZZ'` not in the order throws `/ZZZ/`.

- [ ] **Step 3: Write the failing lottery tests** (`lottery.test.ts`):
  - `lotteryOdds` for 14 distinct records returns the table in order.
  - Two teams tied at slots 1–2 both get 14. Three tied at slots 4–6 get (12.5+10.5+9)/3.
  - 13 teams returns `{ ok: false, problem: 'No lottery odds for a 13-team lottery' }`.
  - `drawLottery` with `mulberry32(1)` is deterministic (the same result twice) and is a permutation of the input.
  - Over 20,000 draws with `mulberry32(7)`, the pick-1 share of a 14% team is within 1.5 points of 14, and that of a 0.5% team is within 0.5.
  - `draftOrder` puts the lottery first, then the non-lottery teams worst first, and the champion last even when the champion has a worse record than another playoff team.
  - `runLottery` on a fixture:
    - It refuses when `calendarProblem` isn't met, with the message containing "S80 FBA Draft Lottery step". It refuses a second run ("The lottery has already been run") and a missing `playoffs.outcome` ("The FBA playoffs aren't finished").
    - On success it writes 4 paths: `leagues/fba/S79/lottery.json` (locked, `draftSeason` 80, 30 picks), `leagues/fba/picks.json`, `leagues/fba/S79/transactions.json` (a `'lottery'` entry reading `S80 Draft Lottery: <TEAM> wins the first pick`) and `calendar.json` (the step done).
    - An S80 `top 1` obligation on the lottery winner rolls to S81 as `none` with a `protected` roll.

  Fixture: build 30 teams in groups E/W (15 each) and a `games` list where team i beats every team j>i once (distinct records). Build a `PlayoffsFile`-shaped object cast `as PlayoffsFile` with `outcome.champions[0].teamId` set to a playoff team. `calendarFor(79)` (`engine/shared/calendar.ts`) with every step before `s80-fba-draft-lottery` marked done.

- [ ] **Step 4: Run to verify failure:** `npx vitest run engine/offseason engine/roster/picks.test.ts engine/shared/types.test.ts 2>&1 | grep -E "Test Files|Tests|FAIL"`.

- [ ] **Step 5: Implement `engine/offseason/lottery.ts`:**

```ts
import type { Rng } from '../d2/random';
import { resolvePicks } from '../roster/picks';
import { appendTx, type MoveContext } from '../roster/state';
import { calendarProblem, type WritesResult } from '../season/moves';
import type { ScheduleTeamInfo } from '../season/schedule';
import { betterThan, javaOrder, records, standings } from '../season/standings';
import { markStepDone } from '../shared/calendar';
import type {
  CalendarFile, GameResult, LotteryFile, LotteryOdds, PicksFile, PlayoffsFile, ResultsFile, TeamsFile, TransactionsFile,
} from '../shared/types';

/** Pick-1 odds (percent) by lottery slot, worst team first, keyed by lottery size. The S74 table. */
export const LOTTERY_ODDS: Record<number, number[]> = {
  14: [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5],
};

export interface LotteryTeam { teamId: string; w: number; l: number }

/** Odds per team, worst first. Teams tied on W-L share the average of their slots' odds. */
export function lotteryOdds(teams: LotteryTeam[]): { ok: true; odds: LotteryOdds[] } | { ok: false; problem: string } {
  const table = LOTTERY_ODDS[teams.length];
  if (!table) return { ok: false, problem: `No lottery odds for a ${teams.length}-team lottery` };
  const odds = teams.map((t, i) => ({ teamId: t.teamId, slot: i + 1, w: t.w, l: t.l, pct: table[i] }));
  for (let i = 0; i < odds.length;) {
    let j = i;
    while (j + 1 < odds.length && odds[j + 1].w === odds[i].w && odds[j + 1].l === odds[i].l) j++;
    const avg = table.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) odds[k] = { ...odds[k], pct: avg };
    i = j + 1;
  }
  return { ok: true, odds };
}

/** D14: draw pick 1 by the odds, remove the winner, re-normalise, repeat to the last pick. */
export function drawLottery(odds: { teamId: string; pct: number }[], rng: Rng): string[] {
  const pool = [...odds];
  const out: string[] = [];
  while (pool.length) {
    const total = pool.reduce((s, o) => s + o.pct, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].pct;
      if (r < 0) { idx = i; break; }
    }
    out.push(pool[idx].teamId);
    pool.splice(idx, 1);
  }
  return out;
}

/** D7: the lottery, then everyone else worst first (the lottery's record comparison), the champion always last. */
export function draftOrder(input: { lottery: string[]; teams: ScheduleTeamInfo[]; games: GameResult[]; champion: string }): string[] {
  const drawn = new Set(input.lottery);
  const rest = [...records(input.teams, input.games).values()].filter(r => !drawn.has(r.teamId) && r.teamId !== input.champion);
  const worstFirst = javaOrder(rest, (a, b) => betterThan('fba', a, b), true).map(r => r.teamId);
  return [...input.lottery, ...worstFirst, input.champion];
}

export interface LotteryState {
  season: number;
  calendar: CalendarFile;
  teams: TeamsFile;
  results: ResultsFile;
  playoffs: PlayoffsFile | null;
  picks: PicksFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
  lottery: LotteryFile | null;
}

export const lotteryStepId = (season: number) => `s${season + 1}-fba-draft-lottery`;
export const lotteryPath = (season: number) => `leagues/fba/S${season}/lottery.json`;

const teamInfo = (s: LotteryState): ScheduleTeamInfo[] => s.teams.teams.map(t => ({ teamId: t.teamId, group: t.group }));

/** The odds table from the final standings (the page shows it before the draw). */
export function lotteryPreview(state: LotteryState): ReturnType<typeof lotteryOdds> {
  const rows = standings('fba', teamInfo(state), state.results.games, undefined, state.playoffs).lottery;
  return lotteryOdds(rows.map(r => ({ teamId: r.teamId, w: r.w, l: r.l })));
}

export function runLottery(state: LotteryState, rng: Rng, ctx: MoveContext): WritesResult {
  const n = state.season;
  if (state.lottery) return { ok: false, problems: ['The lottery has already been run'] };
  const step = calendarProblem(state.calendar, lotteryStepId(n), 'The lottery is run');
  if (step) return { ok: false, problems: [step] };
  const champion = state.playoffs?.outcome?.champions[0]?.teamId;
  if (!champion) return { ok: false, problems: ["The FBA playoffs aren't finished"] };
  const odds = lotteryPreview(state);
  if (!odds.ok) return { ok: false, problems: [odds.problem] };
  const lottery = drawLottery(odds.odds, rng);
  const order = draftOrder({ lottery, teams: teamInfo(state), games: state.results.games, champion });
  let resolved: ReturnType<typeof resolvePicks>;
  try {
    resolved = resolvePicks({ season: n + 1, order, lotterySize: lottery.length, obligations: state.picks.obligations });
  } catch (e) {
    return { ok: false, problems: [(e as Error).message] };
  }
  const doc: LotteryFile = { league: 'fba', season: n, draftSeason: n + 1, locked: true, odds: odds.odds, lottery, order, picks: resolved.picks };
  const tx = appendTx(state.tx, ctx, 'lottery', [lottery[0]], [`S${n + 1} Draft Lottery: ${lottery[0]} wins the first pick`]);
  return {
    ok: true,
    label: `S${n + 1} Draft Lottery`,
    writes: [
      { path: lotteryPath(n), doc },
      { path: 'leagues/fba/picks.json', doc: { ...state.picks, obligations: resolved.obligations } },
      { path: `leagues/fba/S${n}/transactions.json`, doc: tx },
      { path: 'calendar.json', doc: markStepDone(state.calendar, lotteryStepId(n)) },
    ],
  };
}
```

If `champions[0].teamId`'s type isn't a plain string, adapt the access and keep the message.

- [ ] **Step 6: Run the tests (they pass), `npx tsc --noEmit` (it prints nothing), then run the full suite and check the count** (738 + new, with 0 failures). `web/data.test.ts` must still pass.

- [ ] **Step 7: Commit:** `git add web/engine && git commit -m "feat: lottery engine, 7b schemas, resolvePicks fails for unknown teams"` (with the trailer).

---

### Task 2: Lottery page

**Files:**
- Create: `web/app/offseason/useLotteryState.ts`, `web/app/offseason/LotteryPage.tsx`, `web/app/offseason/LotteryPage.test.tsx`
- Modify: `web/app/stepRoutes.ts`, `web/app/shell/Layout.tsx`, `web/app/stepRoutes.test.ts`

**Interfaces:**
- Consumes (Task 1): `LotteryState`, `lotteryPreview`, `runLottery`, `lotteryPath`, `LotteryFile`.
- Produces: the route `/league/fba/lottery`; `toolTarget` maps `/^s\d+-fba-draft-lottery$/` to it.

- [ ] **Step 1: The hook.** Model it on `app/college/useRecruitingState.ts`. `useLotteryState(): { state?: LotteryState; versions: Versions; error?: Error }`:
  - Season `n` comes from `meta.json`.
  - Required docs: `calendar.json`, `leagues/fba/teams.json`, `leagues/fba/S{n}/results.json`, `leagues/fba/picks.json`, `leagues/fba/S{n}/transactions.json`.
  - Optional docs (a 404 becomes null): `leagues/fba/S{n}/playoffs.json`, `lotteryPath(n)`.
  - `versions` covers every doc `runLottery` writes (lottery, picks, tx, calendar), and a missing doc's version is `null`.

- [ ] **Step 2: Write the failing page test.** Stub `fetch` as in `D2RatingsPage.test.tsx`, with a small fixture (it may reuse the Task 1 fixture builders by exporting them from `engine/offseason/testFixtures.ts`).
  - (a) Before the run, the odds table shows 14 rows with their percentages.
  - (b) Clicking "Run lottery" posts one batch with the 4 paths.
  - (c) Serving a saved `LotteryFile`:
    - Only the last lottery pick is hidden until "Reveal next". After one click, pick 14's team shows.
    - "Reveal all" shows pick 1.
    - The full order table lists every slot with "via <originalTeam>" when the owner differs, and a flagged pick shows its flag text.
  - (d) The calendar step not current → the button is disabled with the `calendarProblem` text.

- [ ] **Step 3: Implement `LotteryPage`** (`<h1>S{n+1} Draft Lottery</h1>`):
  - **No lottery doc:**
    - Show the `lotteryPreview` odds table: slot, team, W-L and odds shown to 1 decimal place with "%".
    - If the preview fails, show its problem.
    - Show a "Run lottery" button that calls `runLottery(state, Math.random, { batchId: newBatchId() })` → `commitDocs(label, writes, versions)`.
    - The button is disabled while `useSaving()`, or when `calendarProblem(...)` / `runLottery`'s refusal text applies. Show that text under it.
  - **Doc exists:**
    - A `revealed` count lives in `useState`. It starts at 0 during a fresh run in this mount, and at `lottery.length` after any reload (initialise it to `lottery.length` when the doc was loaded from the server on mount; set it to 0 right after a successful run).
    - The lottery list shows slots `lottery.length` down to 1. A slot is shown when `slot > lottery.length - revealed`; the others show "?".
    - The "Reveal next" and "Reveal all" buttons are hidden once everything is revealed.
    - Below the list, a "Full S{n+1} draft order" table has slot, team, owner ("via X" when the owner ≠ original) and flag. It is shown only when everything is revealed.
    - If any pick has a flag: `<p className="muted">Settle flagged picks by hand in the picks editor.</p>`.
- [ ] **Step 4: Routing.** Add `<Route path="/league/fba/lottery" element={<LotteryPage />} />` in `Layout.tsx`. In `toolTarget`, add `if (/^s\d+-fba-draft-lottery$/.test(step.id)) return '/league/fba/lottery';`, plus a `stepRoutes.test.ts` case.
- [ ] **Step 5: Run the tests, tsc and the full-suite count.**
- [ ] **Step 6: Commit** `feat: draft lottery page with pick-by-pick reveal`.

---

### Task 3: Retirement engine

**Files:**
- Create: `web/engine/offseason/retirement.ts`, `web/engine/offseason/retirement.test.ts`

**Interfaces:**
- Consumes: `RosterState`, `docPath`, `appendTx`, `nameOf`, `withTeam` (`engine/roster/state.ts`); `normalizeRoster` (`engine/roster/rules.ts`); `calendarProblem`, `WritesResult`; `markStepDone`; `RetiredInfo`.
- Produces:

```ts
export const RETIRE_AGE = 32;
export const RETIREMENT_STEP = 'retirement';
export interface Retiree { playerId: string; name: string; league: 'fba' | 'fbad2'; teamId: string | null; position: Position; age: number | null }
export interface RetireState extends RosterState { calendar: CalendarFile }
export function retirementPool(state: RosterState): Retiree[];      // every named-or-unnamed player on FBA rosters, D2 rosters, D2 Reserves
export function autoRetirees(pool: Retiree[]): Retiree[];            // age !== null && age >= RETIRE_AGE
export function unknownAges(pool: Retiree[]): Retiree[];             // age === null
export function retirePlayers(state: RetireState, early: string[], ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests.** Use the fixtures in `engine/roster/testFixtures.ts` if present (otherwise build a small `RosterState`), plus `calendarFor(79)` with the steps before `retirement` done.
  - The pool covers all three places. Age is `season − birthSeason`, and null when `birthSeason` is null.
  - `autoRetirees` includes 32 and 33 but not 31.
  - `retirePlayers`:
    - Refuses off-step (the message contains "Retirement step").
    - Refuses an unknown early id: "p09999 is not on a pro roster or Reserves".
    - Retires the auto list plus early ids, with duplicates ignored.
    - An FBA spot becomes a vacant entry (`playerId: null`, via `normalizeRoster`), and so does a D2 spot. A Reserve is removed from `reserves.players`.
    - `players[id].retired` equals `{ season: 79, league, teamId, position }` (`teamId` is null for a Reserve).
    - One `'retired'` tx entry per league that has retirees, with lines like `Retired PG-Name (DCB, age 32)`, or `(Reserves, age 32)` for a Reserve.
    - Writes contain only the changed docs plus `calendar.json` with `retirement` done.
    - With nobody to retire, it still succeeds with `label: 'Retirement: no one retired'` and only the calendar write.
  - Roster locks aren't consulted: it works even with `ctx.phase = 'post-deadline'`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Key rules:
  - The gate is `calendarProblem(state.calendar, RETIREMENT_STEP, 'Players retire')` only. This **is** the lock exception: `lockProblem` isn't called, and every other move stays locked.
  - Build the pool from `state.fba.teams` (league `'fba'`), `state.d2.teams` (`'fbad2'`) and `state.reserves.players` (`'fbad2'`, `teamId: null`), skipping `playerId === null`. `name` is `nameOf(state, id)`.
  - To remove a roster player, filter the team's entries and pass them through `normalizeRoster(entries, league)`, which re-adds the vacant slot.
  - Update `players.players[id]` with `retired`, touching only players that exist in `players.json`.
  - Push a write only for changed docs, using `docPath(key, state.season)`: `fba`, `d2`, `reserves`, `players`, `fbaTx`, `d2Tx`. Always push `{ path: 'calendar.json', doc: markStepDone(state.calendar, RETIREMENT_STEP) }`.
  - The label is `Retirement: ${k} ${k === 1 ? 'player' : 'players'} retired`.
- [ ] **Step 4: Run the tests, tsc and the full-suite count.**
- [ ] **Step 5: Commit** `feat: retirement engine (age 32 auto list, early retirements, retired stamp)`.

---

### Task 4: Retirement page

**Files:**
- Create: `web/app/offseason/RetirementPage.tsx`, `web/app/offseason/RetirementPage.test.tsx`
- Modify: `web/app/stepRoutes.ts` (`TOOL_STEPS.retirement = '/retirement'`), `web/app/shell/Layout.tsx`, `web/app/stepRoutes.test.ts`

**Interfaces:** Consumes Task 3's exports, `useRosterState` (`app/roster/useRosterState.ts`) and `useDoc<CalendarFile>('calendar.json')`. `versions` = `{ ...rosterVersions, 'calendar.json': calendar.version }`.

- [ ] **Step 1: Write the failing test:**
  - The auto list shows a 32-year-old with no remove control.
  - The "Unknown age" warning lists a null-birthSeason player.
  - Typing 3+ letters in "Add an early retirement" shows matching pool players (excluding those already listed). Clicking "Add" puts them on the list with a "Remove" button.
  - "Retire N players" posts one batch whose paths include `players.json` and `calendar.json`.
  - Off-step, the button is disabled and the `calendarProblem` text shows.
  - After the step is done, the page says "Retirement is done for S79."
- [ ] **Step 2: Implement** (`<h1>S{n} Retirement</h1>`):
  - The table has name, position, team (or "Reserves"), league (FBA/D2) and age.
  - It shows the auto rows first, then the early rows, which get a Remove button.
  - Below it, the search box filters `retirementPool` by case-insensitive name substring (max 20 results).
  - Unknown-age players are listed in a `muted` note with an "Add" button each.
  - The button calls `retirePlayers(live, earlyIds, { batchId: newBatchId() })` → `commitDocs`.
- [ ] **Step 3: Add the route** `<Route path="/retirement" …/>`, plus a stepRoutes test for `retirement`.
- [ ] **Step 4: Run the tests, tsc and the count.**
- [ ] **Step 5: Commit** `feat: retirement page`.

---

### Task 5: Hall of Fame importer

**Files:**
- Create: `web/importers/sheets/hallOfFame.ts`, `web/importers/sheets/hallOfFame.test.ts`
- Modify: `web/importers/run.ts`

**Interfaces:**
- Produces: `parseHallOfFameTab(rows: string[][], players: PlayersFile, report: Report): HallOfFameFile`, and `npm run import -- --hall-of-fame [--force]`.

The tab layout (columns A, B, C = Year, Name, RET; row 0 is the header):
- A row with column A `S<digits>` or `FFL` starts an inductee class with that text as `season`.
- A row with column A `S--` (column B "Nominees(Keep 15)") starts the nominee section.
- A row with column C non-empty starts a card: name = B, `retiredSeason` = C. The card's own row may also carry column A (a class start).
- Any other row with B non-empty adds B as a line to the current card.
- Blank rows are skipped.

**First**, confirm the layout: download the main sheet (`downloadWorkbook(SHEETS.main, CACHE)` into the git-ignored `importers/.cache`) and print the first 40 rows and the rows from "Nominees" on with `readTabs(file, ['Hall of Fame'])`. Adjust the rules above to what's really there, and note any change in your report.

- [ ] **Step 1: Write failing fixture tests:**
  - Two classes: "S8" with 2 cards, one with "FFL" in C and one with 3 lines. "S10" with 1 card.
  - Then an "S--" nominee section with 2 cards.
  - Expect 2 classes with the right cards, 2 nominees, `removed: []` and `league: 'fba'`.
  - A name matching exactly one `players.json` player (case-insensitive, trimmed) gets its `playerId`. A name matching 0 or 2 players gets null, and 2 matches add a `report.warn('hall-of-fame', …)`.
  - More than 15 nominees → `report.error`.
  - The result passes `HallOfFameFile.safeParse`.
- [ ] **Step 2: Implement the parser.**
- [ ] **Step 3: Add a `--hall-of-fame` mode to `run.ts`.** It reuses `SHEETS.main` and `readJson('players.json')`:
  - It deletes the cached main workbook first, as `refreshRosters` does, so the sheet is fresh.
  - It refuses if `leagues/fba/hallOfFame.json` exists, unless `--force` is given.
  - It validates with `schemaForPath`, writes `importers/hall-of-fame-report.md`, and writes the doc only if there are no errors.
  - `main()` gets `if (process.argv.includes('--hall-of-fame')) return importHallOfFame();`. **Do not run it**: it writes `web/data`, and the user runs it.
- [ ] **Step 4: Run the tests, tsc and the count.** Make sure `git status` shows no report or cache files; add them to `.gitignore` if they appear.
- [ ] **Step 5: Commit** `feat: Hall of Fame tab importer (npm run import -- --hall-of-fame)`.

---

### Task 6: Hall of Fame engine

**Files:**
- Create: `web/engine/offseason/hallOfFame.ts`, `web/engine/offseason/hallOfFame.test.ts`

**Interfaces (produces):**

```ts
export const NOMINEE_CAP = 15;
export const CLASS_SIZE = 3;
export const HOF_PATH = 'leagues/fba/hallOfFame.json';
export const HOF_STEP = 'hall-of-fame-induction';
export interface HofState { season: number; calendar: CalendarFile; hof: HallOfFameFile; players: PlayersFile; tx: TransactionsFile; summaries: SummaryFile[] }
export interface Candidate { playerId: string; name: string; retired: RetiredInfo }
export function candidates(hof: HallOfFameFile, players: PlayersFile): Candidate[];
export function prefillCard(c: Candidate, summaries: SummaryFile[]): HofCard;
export function freeNameCard(name: string, retiredSeason: string): HofCard;   // playerId null, lines []
export function addNominees(hof: HallOfFameFile, cards: HofCard[]): WritesResult;
export function editNominee(hof: HallOfFameFile, index: number, patch: Partial<Pick<HofCard, 'name' | 'retiredSeason' | 'lines'>>): WritesResult;
export function removeNominee(hof: HallOfFameFile, index: number): WritesResult;
export function induct(state: HofState, indexes: number[], ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests:**
  - **`candidates`:** named players with `retired` who aren't a nominee, an inductee or on `removed` (matched by `playerId`). Sorted by `retired.season` descending, then name.
  - **`prefillCard`:** it gives `retiredSeason: 'S79'`. Its first line is `DCB: …-S79` for an FBA retiree and `D2 <team>: …-S79` for a D2 one (`D2 Reserves: …-S79` when `teamId` is null). Then one line `S78 MVP` per award in any summary (by `summary.awards`), and `S79 All-FBA T1`/`T2` for each All-FBA team the player is on (`summary.allFba.team1/team2[].playerId`). Summaries are taken oldest first.
  - **`addNominees`:** it refuses past 15 with "The nominee list is capped at 15: remove someone first". It refuses a duplicate (same `playerId`, or same case-insensitive name when the id is null) of a nominee, an inductee or a removed player with "<name> is already on the list, in the Hall, or was removed". On success it writes only `HOF_PATH` with the label `Add Hall of Fame nominees`.
  - **`editNominee`:** it replaces the fields. Blank lines are dropped and a blank name is refused.
  - **`removeNominee`:** the nominee leaves `nominees` and is appended to `removed` as `{ name, playerId }`.
  - **`induct`:**
    - It refuses off-step (the message contains "Hall of Fame Induction step").
    - It requires exactly `min(CLASS_SIZE, nominees.length)` distinct valid indexes ("Pick exactly 3 nominees"), and zero nominees → "There are no nominees".
    - It refuses when a class for `S79` already exists.
    - On success it appends `{ season: 'S79', inductees }` and removes them from the nominees. It adds a tx entry `'hall-of-fame'` with line `S79 Hall of Fame class: A, B, C` and marks the step done. It writes `HOF_PATH`, `leagues/fba/S79/transactions.json` and `calendar.json`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** with small pure helpers, following `lottery.ts` style.
- [ ] **Step 4: Run the tests, tsc and the count.**
- [ ] **Step 5: Commit** `feat: Hall of Fame engine (candidates, prefilled cards, 15 cap, induction)`.

---

### Task 7: Hall of Fame page, sidebar, roadmap

**Files:**
- Create: `web/app/offseason/HallOfFamePage.tsx`, `web/app/offseason/HallOfFamePage.test.tsx`
- Modify: `web/app/stepRoutes.ts` (`TOOL_STEPS['hall-of-fame-induction'] = '/league/fba/hall-of-fame?tab=nominees'`), `web/app/shell/Layout.tsx`, `web/app/shell/Sidebar.tsx` (`<NavLink to="/league/fba/hall-of-fame">Hall of Fame</NavLink>` under Archive), `web/app/stepRoutes.test.ts`

**Interfaces:** Consumes Task 6; `useHistory('fba')` (`app/api.ts`) for summaries; `useDoc` for `meta.json`, `calendar.json`, `players.json`, `HOF_PATH`, `leagues/fba/S{n}/transactions.json`.

- [ ] **Step 1: Write the failing test:**
  - With `hallOfFame.json` missing, the page says `Import the Hall of Fame first: run "npm run import -- --hall-of-fame" in web/.`
  - **Hall tab:** it shows classes newest first, each card with its name, "Retired <retiredSeason>" and its lines.
  - **Nominees tab:**
    - It shows "N of 15" and one card per nominee. The lines are an editable textarea (one line per row) that saves on blur via `editNominee`.
    - The Remove button asks for confirmation (a `window.confirm` stub) and then saves.
    - The "Candidates" list shows prefilled previews with checkboxes, and "Add selected" posts one write.
    - Past the cap, the problem text shows and nothing posts.
    - A free-name form (name + retired season) adds a card.
    - Induct: tick 3 nominees, then "Induct class" posts one batch with 3 paths. Before the step is current, the button is disabled with the `calendarProblem` text.
- [ ] **Step 2: Implement.**
  - The tabs come from `?tab=hall|nominees` (default `hall`), like `RecruitingPage`.
  - Every action runs its `WritesResult` through `commitDocs(label, writes, versions)`, and shows `problems` in `<p className="error">`.
  - Selections live in component state.
- [ ] **Step 3: Routing and sidebar.** Add the route `/league/fba/hall-of-fame`, the `TOOL_STEPS` entry plus a test, and the sidebar link.
- [ ] **Step 4: Run the tests, tsc and the count.**
- [ ] **Step 5: Commit** `feat: Hall of Fame page (hall, nominees, induction) and sidebar link`.

---

## After the tasks (controller)

1. A final Opus review of `main..season-tail`.
2. A text-only browser check on scratch data (CLAUDE.md "Browser checks"):
   - Prep: `prep.mjs` roster fill only. On the scratch copy, stage an S79 FBA season (results + a finished playoffs + summary), move the calendar to the lottery step and import the HOF doc into the scratch data (`--hall-of-fame` pointed at the scratch dir, or a copied parse).
   - Walk-through: run the lottery → reveal → order/owners; Retirement (auto + early) → the rosters show vacancies; HOF add candidates / cap / remove / induct.
   - Checks: 375px, and the console.
3. Update `.superpowers/sdd/progress.md`, the §10 roadmap row and the roadmap memory. Then stop for the user before merging.
