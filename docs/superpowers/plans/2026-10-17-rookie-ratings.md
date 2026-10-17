# Rookie Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pro ratings reset covers FBA players only, the FBA draft runs without FBA ratings, and a new calendar step after the draft rates the class from the top of the prospect rankings; unrated players go to the D2 Reserves in rank order.

**Architecture:** A new engine module (`engine/offseason/rookieRatings.ts`) holds the step's rules; typed ratings live in an optional `rookieRatings` map on the draft document; a new page rates the class. The calendar gains a step (`s{n}-rate-rookies`) through `calendarFor`, a helper for live calendars and an importer flag. The old prospect parts of the pro reset and of the draft board are removed.

**Tech Stack:** TypeScript 5, zod 3 (strict), React 18, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-10-17-rookie-ratings-design.md`

## Global Constraints

- Work from `web/`. `npx tsc --noEmit` prints nothing; the full `npx vitest run` passes before each commit (3160 tests today). Never modify `web/data/**`, never start or stop the dev servers on 5173/5174, stage by explicit path, leave `web/app/season/LiveGame.tsx`, `web/app/shell/Layout.tsx` edits that are not yours and `web/app/shell/useScrollMemory.ts` alone (this plan adds one route line to `Layout.tsx`: stage only that hunk's file content that you changed, read the diff first).
- Rookie ratings: whole numbers **55 to 99**, rated contiguously from the top of the ranking, never rising down the list. The ranking order is `rankedProspects` with the draft's saved `rankOrder`.
- Step id `s{n}-rate-rookies`, label `Rate S{n} Rookies`, after `s{n}-fba-draft`, before `free-agency-offseason`; page route `/league/fba/rookies`.
- Moves return `{ ok: true, writes, label }` or `{ ok: false, problems }`. Every random choice takes an injected `Rng` (none needed here). jsdom tests call `cleanup()` in `afterEach`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A drafted player left unrated: his roster entry is removed from the drafting team and he appears in the D2 Reserves; he is not on the free-agent list.
2. A rated undrafted player: on the FBA free-agent list with his rating (`rookie: true`, `note: 'Undrafted'`), not in the Reserves.
3. Ratings with a gap (an unrated player above a rated one), a rating above the one above it, a rating outside 55 to 99, and zero ratings: the first three block Finish, zero ratings is allowed (everyone goes to the Reserves).
4. A live calendar that already has the step, or whose draft step is done: `withRookieStep` leaves it unchanged; an unfinished-draft calendar gets the step right after the draft.
5. Finishing the step twice, or finishing it while it is not the current calendar step: refused, nothing written.

## File Structure

| File | Responsibility |
|---|---|
| `engine/shared/calendar.ts` (+ test) | `rookieStepId`, the step in `calendarFor`, `withRookieStep` |
| `app/stepRoutes.ts`, `importers/run.ts` (+ tests) | the route for the step; the `--rookie-step` flag |
| `engine/offseason/proRatings.ts` (+ test) | the pro reset without prospects |
| `engine/offseason/fbaDraft.ts`, `draftBoard.ts`, `app/offseason/FbaDraftPage.tsx` (+ tests) | the draft without FBA ratings |
| `engine/shared/types.ts` | `DraftFile.rookieRatings` |
| `engine/offseason/rookieRatings.ts` (new, + test) | ranking order, typed ratings, blockers, finish |
| `app/offseason/RookieRatingsPage.tsx` (new, + test), `app/shell/Layout.tsx` | the page and its route |
| `docs/fba-rule-changes.md` | the rule |

---

### Task 1: The calendar step

**Files:** Modify `engine/shared/calendar.ts`, `engine/shared/calendar.test.ts`, `app/stepRoutes.ts`, `app/stepRoutes.test.ts`, `importers/run.ts`.

**Interfaces:**
- Produces: `rookieStepId(season: number): string` (`s{season}-rate-rookies`); `calendarFor(n)` lists the step after `s{n}-fba-draft` (after the expansion draft step in S80, which itself follows the draft) and before `free-agency-offseason`; `withRookieStep(cal: CalendarFile): CalendarFile` adds it after the draft step when absent and the draft step is not done, else returns `cal` itself; `toolTarget` maps `/^s\d+-rate-rookies$/` to `/league/fba/rookies`; `--rookie-step` in `run.ts` (copy `--expansion-step`) applies `withRookieStep` to `calendar.json` in the `--data` folder and writes it.

- [ ] **Step 1: Write the failing tests:** `calendarFor(80)` ids contain `s80-fba-draft` then (`s80-expansion-draft`) then `s80-rate-rookies` then `free-agency-offseason`; `withRookieStep` on a calendar without it inserts it right after `s80-fba-draft` and is idempotent; leaves a calendar whose draft step is done untouched (same object); `toolTarget` of the step is `/league/fba/rookies`. Update the existing committed-calendar comparison test to wrap `withRookieStep` the way it wraps the expansion and qualifying steps.
- [ ] **Step 2: Run** `npx vitest run engine/shared/calendar.test.ts app/stepRoutes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the four pieces above.
- [ ] **Step 4: Run** those tests and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** the changed files.

### Task 2: The pro ratings reset without prospects

**Files:** Modify `engine/offseason/proRatings.ts`, `engine/offseason/proRatings.test.ts`, and any page text in `app/offseason/ProRatingsPage.tsx` that mentions prospects.

**Interfaces:** `proRatingRows(state)` returns only FBA roster players (no draft prospect rows); `proMembershipBlockers` compares against those rows; `finishProRatings` no longer writes `fbaRating` to prospects, writes no draft document, and its transaction line counts players only (`FBA ratings reset: N players ranked, M took the suggestion`).

- [ ] **Step 1: Write the failing tests:** rows for a state with prospects contain none of them; finishing writes the rosters, the ratings doc, the transactions and the calendar but not the draft path; the line has no "prospects"; a prospect on the board does not make the membership check fail.
- [ ] **Step 2: Run** `npx vitest run engine/offseason/proRatings.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** by removing the prospect rows and the draft write; adjust the page text.
- [ ] **Step 4: Run** `npx vitest run engine/offseason app/offseason` — update any other test that expected prospect rows — then `npx tsc --noEmit`; Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: The draft without FBA ratings

**Files:** Modify `engine/offseason/fbaDraft.ts`, `engine/offseason/draftBoard.ts`, `app/offseason/FbaDraftPage.tsx` and their tests (`fbaDraft.test.ts`, `draftBoard.test.ts`, `FbaDraftPage.test.tsx`, `testFixtures.ts` if a fixture needs it).

**Interfaces:**
- `startDraftProblems` no longer reports "has no FBA rating"; it still requires the pro ratings reset to be finished and the lottery.
- `draftPick` adds the rookie to the drafting team's roster with the prospect's `fbaRating` (null now) as before.
- `finishDraft` no longer adds undrafted prospects to the free-agent list (they wait for the rating step); it still marks the draft step done and logs the finish (the log line no longer says prospects join free agency).
- `setProspectRating` and the FBA rating column and input are removed from the page. `boardOrder(state)` orders by college rating plus the class boost, then name (no pro-reset order, no FBA rating); `DraftBoardState.ratings` is dropped if nothing else needs it.

- [ ] **Step 1: Write the failing tests:** a draft state with prospects that have `fbaRating: null` has no start problems beyond the lottery and reset; finishing the draft leaves `freeAgents` unchanged and still locks the draft and marks the step; `boardOrder` ignores `fbaRating`; the page has no "FBA rating for" inputs. Remove the tests of the deleted function and input.
- [ ] **Step 2: Run** the three test files — Expected: FAIL.
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run** `npx vitest run engine/offseason app/offseason` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: The rookie ratings engine

**Files:** Modify `engine/shared/types.ts`; create `engine/offseason/rookieRatings.ts`, `engine/offseason/rookieRatings.test.ts`.

**Interfaces:**
- Produces:
  - `DraftFile` gains `rookieRatings: z.record(playerId, int.min(55).max(99)).optional()` (keys must be prospects: add to the existing `superRefine`).
  - `export const ROOKIE_MIN_RATING = 55`.
  - `interface RookieRatingsState { season: number; calendar: CalendarFile; draft: DraftFile; fba: RostersFile; freeAgents: FreeAgentsFile; reserves: ReservesFile; players: PlayersFile; tx: TransactionsFile }`.
  - `rookieOrder(draft: DraftFile, players: PlayersFile): DraftProspect[]`: the prospects sorted by name, then `rankedProspects(thatList, draft.rankOrder)`.
  - `setRookieRating(state, playerId: string, value: number | null): WritesResult`: refuses unless `s{n}-rate-rookies` is the current calendar step (use `calendarProblem` as the other steps do), the draft is locked, the player is a prospect, and `value` is null (clears) or a whole number 55 to 99; writes `draftPath(season)` with the updated `rookieRatings`.
  - `rookieBlockers(state): string[]`: for the order from `rookieOrder`, a problem for each unrated player above a rated one ("{name} is rated but {name2} above isn't") and each rating above the rating of the nearest rated player above it.
  - `finishRookieRatings(state, ctx: MoveContext): WritesResult`: refuses when not the current step, already done, or `rookieBlockers` is non-empty; writes (a) `docPath('fba', n)` with each rated drafted player's roster entry given his rating and each unrated drafted player's entry removed from the owning team's list; (b) `docPath('freeAgents', n)` with each rated undrafted player appended as `{ playerId, position, age, rating, rookie: true, note: 'Undrafted' }` (age from the players doc and the season as `ageOf` does in `fbaDraft.ts`); (c) `docPath('reserves', n)` with every unrated player (drafted or not) appended in rank order as `{ playerId, position, age, rating: null, fromFba: true }`; (d) `docPath('fbaTx', n)` with a `'drafted'`-type entry whose lines say how many were rated, how many went to the Reserves; (e) `calendar.json` with the step marked done. Label `Finish the S{n} rookie ratings`.

- [ ] **Step 1: Write the failing tests** (a small fixture: 6 prospects, 3 drafted by named teams with roster entries, 3 undrafted; rankings via `rankOrder` where useful): `rookieOrder` follows the manual order; `setRookieRating` accepts 55 and 99, refuses 54, 100, 70.5 and a stranger, refuses before the draft is locked and when the step is not current, and clears with null; `rookieBlockers` flags a gap and a rating that rises; `finishRookieRatings`: a rated drafted player keeps his entry with the rating, an unrated drafted player's entry is gone from his team and he is in the Reserves in rank order after the unrated undrafted ones above him in rank, a rated undrafted player is on the free-agent list and not in the Reserves, the free-agent list never holds an unrated player, zero ratings sends everyone to the Reserves, the calendar step is done, a second finish is refused, inputs are not mutated.
- [ ] **Step 2: Run** `npx vitest run engine/offseason/rookieRatings.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the schema field and the module; reuse `appendTx`, `markStepDone`, `docPath`, `draftPath` and `collegeName`.
- [ ] **Step 4: Run** the test file, `npx vitest run engine/shared` (data tests must still pass) and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: The page

**Files:** Create `app/offseason/RookieRatingsPage.tsx`, `app/offseason/RookieRatingsPage.test.tsx`; modify `app/shell/Layout.tsx` (one import and one `<Route path="/league/fba/rookies" element={<RookieRatingsPage />} />` line), `app/pages/OffseasonHub.tsx` (a "Rookie ratings" tile).

**Interfaces:**
- Consumes: `rookieOrder`, `setRookieRating`, `rookieBlockers`, `finishRookieRatings`, `rookieStepId`; loads the same docs as `FbaDraftPage` (meta, calendar, draft, FBA rosters, free agents, FBAD2 reserves, players, transactions, FBA and college teams) and saves through `commitDocs` with the loaded versions, copying the pattern of `FbaDraftPage` (`run`, `saving`, `newBatchId`).

- [ ] **Step 1: Write the failing tests** (jsdom, `cleanup()`; follow `FbaDraftPage.test.tsx`'s `stubApi` and helpers): the table lists prospects in ranking order with rank, name, position, school and "#3 · Ohio Valley Sharks" or "Undrafted"; typing 70 in the first row's box and blurring saves one batch writing only the draft document; boxes show the saved ratings; blockers are listed (a gap, a rise); the Finish button is disabled until there are none and then writes the rosters, free-agent, reserves, transactions and calendar documents in one batch; before the step is current the page says so and has no boxes; the hub tile links to the page.
- [ ] **Step 2: Run** the new test file — Expected: FAIL.
- [ ] **Step 3: Implement** the page (rating inputs `min=55 max=99`, saving on blur or Enter like the old board rating box), the route and the hub tile.
- [ ] **Step 4: Run** `npx vitest run app/offseason app/pages` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** (read the `Layout.tsx` diff first so only your route lines are staged with the file).

### Task 6: The rule and the full check

**Files:** Modify `docs/fba-rule-changes.md`.

- [ ] **Step 1:** Add the S80 rule line: the pro reset covers FBA players only; the draft class is rated after the draft in the new step, top down from 55; unrated players go to the D2 draft pool in rank order and not to FBA free agency.
- [ ] **Step 2: Run** `npx tsc --noEmit` (nothing printed) and the full `npx vitest run` (all pass).
- [ ] **Step 3: Look at the new page and the draft page** in the Browser pane on the user's running app, read-only (the live calendar does not have the step until the user runs `--rookie-step`, so the new page may show the "not current" message; say so).
- [ ] **Step 4: Commit** the doc.
