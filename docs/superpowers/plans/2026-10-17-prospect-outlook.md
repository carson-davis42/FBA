# Prospect Outlook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The draft page's Prospects table shows an overall rank, a position rank and a green / amber / red stay-or-withdraw bar for early entrants.

**Architecture:** A pure engine function ranks the prospects (college rating plus the existing class boost) and works out the spots each position offers FBA rookies; two checks (position rank within the spots, overall rank within a history cutoff) give the colour. The page renders it, reusing the clinch bar and legend components, with three adjustable numbers kept in `localStorage`.

**Tech Stack:** TypeScript 5, React 18, Vitest 2 (jsdom for UI).

**Spec:** `docs/superpowers/specs/2026-10-17-prospect-outlook-design.md`

## Global Constraints

- Work from `web/`. `npx tsc --noEmit` must print nothing; the full `npx vitest run` must pass before each commit (3127 tests today). Never modify `web/data/**`, never start or stop the dev servers on 5173/5174, stage by explicit path, leave `web/app/season/LiveGame.tsx`, `web/app/shell/Layout.tsx`, `web/app/shell/useScrollMemory.ts` alone.
- Defaults: replaceable cutoff **67** (rated 67 or lower), history cutoff **12**, D2 reserve **5**.
- Class boost: Fr +4, So +2, Jr +1, Sr 0, from `engine/rank/classBoost.ts` (`boosted(rating, classYear)`); a prospect's class is the one he was in last season, as stored on the draft board.
- Highlight: both checks pass = green, exactly one = amber, neither = red; early entrants only (no highlight on a senior). Seniors still count in both ranks.
- No saved-document or schema changes, no writes. jsdom test files call `cleanup()` in `afterEach`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A position whose spots are all gone (zero) or reduced to zero by the D2 reserve: every prospect there fails the position check, however high his rank.
2. A D2 reserve larger than the league's total spots: shares never go negative and never exceed a position's spots.
3. A prospect with no college rating: ranked after everyone with one, and he never gets the "stay" colour from rating alone.
4. A player sent back to school or into the portal: the remaining ranks, spots counts and colours recompute at once.
5. `localStorage` unavailable or holding junk: the page uses the defaults and still renders.

## File Structure

| File | Responsibility |
|---|---|
| `engine/offseason/prospectOutlook.ts` (new) + `.test.ts` | the ranks, the spots and the signal |
| `app/offseason/outlookSettings.ts` (new) + `.test.ts` | the three adjustable numbers, saved in `localStorage` |
| `app/components/Clinch.tsx`, `app/ui.css` (modify) + `Clinch.test.tsx` | three new bar kinds: `stay`, `close`, `withdraw` |
| `app/offseason/FbaDraftPage.tsx` (modify) + `.test.tsx` | the columns, the bar, the legend and the settings boxes |

---

### Task 1: The outlook engine

**Files:**
- Create: `engine/offseason/prospectOutlook.ts`, `engine/offseason/prospectOutlook.test.ts`

**Interfaces:**
- Produces:
  - `interface OutlookSettings { replaceableAtOrBelow: number; historyCutoff: number; d2Reserve: number }` and `const DEFAULT_OUTLOOK: OutlookSettings = { replaceableAtOrBelow: 67, historyCutoff: 12, d2Reserve: 5 }`.
  - `type Signal = 'stay' | 'close' | 'withdraw'`.
  - `positionSpots(fba: RostersFile, settings: OutlookSettings): Record<Position, number>`: for each position, open slots (entries with `playerId === null`) plus entries whose `rating !== null && rating <= replaceableAtOrBelow`, then the D2 reserve (`min(d2Reserve, total)`) shared across positions in proportion to those counts by largest remainder (ties to the earlier position in `POSITIONS` order) and subtracted; never below 0.
  - `interface ProspectOutlook { overallRank: number; positionRank: number; spots: number; positionCheck: boolean; historyCheck: boolean; signal: Signal | null }`.
  - `prospectOutlook(prospects: DraftProspect[], fba: RostersFile, settings?: OutlookSettings): Map<string, ProspectOutlook>`: `prospects` is in the draft board's order (`boardOrder` result); sort a copy stably by `boosted(collegeRating, classYear)` descending, a missing rating last; `overallRank` is the 1-based place in that order, `positionRank` the place among the same position; `positionCheck = positionRank <= spots`, `historyCheck = overallRank <= historyCutoff`; `signal` is `'stay'` for both, `'close'` for exactly one, `'withdraw'` for neither, and `null` for a prospect with `senior: true`.

- [ ] **Step 1: Write the failing tests.** `positionSpots`: a roster with PG 1 open + two PGs rated 66 and 67 and one rated 68 gives raw 3 for PG; with `d2Reserve: 0` the result equals the raw counts; the S80-shaped example (PG 3, SG 2, SF 4, PF 5, C 4 open; replaceable PG 0, SG 1, SF 5, PF 2, C 2) with reserve 5 sums to 23 and never exceeds a position's raw count; a reserve of 99 gives all zeros. `prospectOutlook`: a Fr rated 85 outranks a Jr rated 87 (89 against 88) and a Sr rated 86 loses to a So rated 85 only when 85 + 2 > 86; the ranks of prospects at one position run 1, 2, 3 in score order; a prospect with `collegeRating: null` ranks last overall and in his position; two prospects with equal scores keep the input order; green when both checks pass, amber for one, red for none; a senior gets `signal: null` but still a rank and still occupies a position rank; removing a prospect from the input shifts the ranks below him up by one.
- [ ] **Step 2: Run** `npx vitest run engine/offseason/prospectOutlook.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** both functions in `engine/offseason/prospectOutlook.ts` per the interfaces; use `POSITIONS` from `engine/roster/rules`.
- [ ] **Step 4: Run** the test file and `npx tsc --noEmit` — Expected: PASS, no output.
- [ ] **Step 5: Commit** the two files.

### Task 2: The adjustable numbers

**Files:**
- Create: `app/offseason/outlookSettings.ts`, `app/offseason/outlookSettings.test.tsx`

**Interfaces:**
- Consumes: `OutlookSettings`, `DEFAULT_OUTLOOK` (Task 1).
- Produces: `useOutlookSettings(): [OutlookSettings, (patch: Partial<OutlookSettings>) => void]`. Stored under the key `fba-prospect-outlook` as JSON; every read and write is wrapped in `try`/`catch`. Values are whole numbers clamped to replaceable 1 to 99, history cutoff 1 to 60, D2 reserve 0 to 30; anything unreadable or out of shape falls back to the default for that field.

- [ ] **Step 1: Write the failing tests** (jsdom, `cleanup()` in `afterEach`, clear `localStorage` before each): defaults with nothing saved; a change persists and a fresh render of the hook reads it; junk JSON and `localStorage` that throws give the defaults and do not crash; a patch of `{ d2Reserve: 500 }` is clamped to 30 and `{ replaceableAtOrBelow: 0 }` to 1; a non-number is ignored.
- [ ] **Step 2: Run** the test file — Expected: FAIL.
- [ ] **Step 3: Implement** the hook with `useState` and a `useEffect`-free setter that writes through.
- [ ] **Step 4: Run** the test file and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** the two files.

### Task 3: Bar kinds for stay, close and withdraw

**Files:**
- Modify: `app/components/Clinch.tsx`, `app/ui.css`, `app/components/Clinch.test.tsx`

**Interfaces:**
- Produces: `ClinchKind` gains `'stay' | 'close' | 'withdraw'`, with labels from `clinchLabel`: "Likely to make an FBA roster", "A close call", "Unlikely to make an FBA roster"; legend order puts them after the existing kinds; CSS classes `.clinch-stay` (green, `#16a34a`), `.clinch-close` (amber, `#f59e0b`), `.clinch-withdraw` (red, `#dc2626`) set `--clinch-color` like the existing ones. `clinchKind` is unchanged.

- [ ] **Step 1: Write the failing tests:** `RankCell` with `kind="stay"` renders a bar labelled "Likely to make an FBA roster" on a cell with class `rank clinch clinch-stay`; `ClinchLegend` with kinds `['stay', 'withdraw', null]` lists exactly those two labels in that order.
- [ ] **Step 2: Run** `npx vitest run app/components/Clinch.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the three kinds, their labels, legend order and CSS.
- [ ] **Step 4: Run** the component tests and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** the three files.

### Task 4: The Prospects table

**Files:**
- Modify: `app/offseason/FbaDraftPage.tsx`, `app/offseason/FbaDraftPage.test.tsx` (follow its existing `docs()` helper and `rowOf` / `names` helpers)

**Interfaces:**
- Consumes: `prospectOutlook`, `positionSpots` (Task 1), `useOutlookSettings` (Task 2), the three kinds (Task 3), `boardOrder(boardState)` for the input order, `draftState.fba` for the FBA rosters.

- [ ] **Step 1: Write the failing tests** with a fixture of FBA rosters and prospects whose answers are known: the table has columns Rank and Pos rank after Class, showing each prospect's ranks over all prospects on the board (not only those left to draft); an early entrant inside both checks has a `clinch-stay` cell, one inside one has `clinch-close`, one inside none has `clinch-withdraw`; a senior's row has no bar; the hover text of a bar reads like "Position rank 2 of 6 spots; overall rank 9 of 12"; three labelled number boxes (Replaceable at or below, Overall picks that usually make it, Spots for D2 players) start at 67, 12 and 5 and changing one changes the colours; pressing Back to school on an early entrant removes him from the ranks and shifts the others up; after the draft starts the rank columns still show but no bar does; the legend lists the three states that appear.
- [ ] **Step 2: Run** `npx vitest run app/offseason/FbaDraftPage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** in `FbaDraftPage.tsx`: compute `const outlook = prospectOutlook(ordered, draftState.fba, settings)` where `ordered` is `boardOrder(boardState)`; add the two columns to `prospectTable`, render the first as `RankCell kind={...}` for early entrants when the draft has not started; add the settings boxes above the table and `ClinchLegend` under it (league `fba`).
- [ ] **Step 4: Run** `npx vitest run app/offseason` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** both files.

### Task 5: Full check

- [ ] **Step 1: Run** `npx tsc --noEmit` (nothing printed) and the full `npx vitest run` (all pass).
- [ ] **Step 2: Look at the Prospects table** in the Browser pane on the user's running app, read-only: ranks present, bars on early entrants only, legend and the three boxes in place. Note what was not checked.
