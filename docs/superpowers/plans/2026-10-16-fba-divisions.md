# FBA Divisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From S80 the FBA plays an 84-game division schedule, qualifies 8 teams per conference NHL-style (top 3 per division + 2 wild cards) into the existing fixed bracket, and uses a 16-team draft lottery table from S81.

**Architecture:** A team gets an optional `division` and an optional `formerGroup` (its conference through a given season). `teamsInSeason` resolves both per season, so every season-scoped reader sees the right conference and (from S80 only) a division. The schedule builder, standings, seeding and bracket switch to the division format only when the teams carry divisions; seasons through S79 and the D2 league keep today's behaviour untouched.

**Tech Stack:** TypeScript 5, zod 3 (strict), Vitest 2 (jsdom for UI), React 18.

**Spec:** `docs/superpowers/specs/2026-10-16-fba-divisions-design.md`

## Global Constraints

- Work from `web/`. `npx tsc --noEmit` must print nothing; the full `npx vitest run` must pass (3015 tests today) before each commit.
- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` (not in tests, scripts or browser checks). Real data keeps passing `web/data.test.ts` with no edits.
- Never start/stop the dev servers on 5173/5174. Stage by explicit path; never `git add -A`. These uncommitted files are not ours: `web/app/season/LiveGame.tsx`, `web/app/shell/Layout.tsx`, `web/app/shell/useScrollMemory.ts`, `web/data/**`, `FBA Logos/**`.
- Division codes and layout: Atlantic `AT`, Great Lakes `GL` (conference `E`); Pacific `PA`, Gulf `GU` (conference `W`). Divisions start in S80 (`DIVISIONS_SEASON = 80`).
- Schedule: 4 games vs each division opponent (2 home, 2 away), 3 vs each other-division conference opponent (2-1 split), 2 vs each other-conference team (1+1). 84 games; 42 home, 42 away per team. Pauses at games 21, 42, 63, 84 (existing `defaultPauses`).
- Playoffs: top 3 per division + 2 wild cards per conference; R1: better-record division winner vs WC2, other division winner vs WC1, 2nd vs 3rd inside each division; R2 = division finals; R3 = conference final; R4 = Finals; fixed bracket; tiebreakers are today's (`orderTeams`, conference wins then h2h then point differential then power ranking).
- Lottery after S80 (S81 draft): 16 real teams, pick-1 odds from the 14-team table's cumulative curve stretched to 16 slots: 12.25, 12.25, 12.25, 11.5, 10.19, 8.81, 7.69, 6.56, 5.25, 4.13, 3, 2.13, 1.56, 1.19, 0.81, 0.44 (computed, not hard-coded).
- Every random choice takes the injected `Rng`. Moves return `{ ok, state, changed, label }` or `{ ok: false, problems }`. Files are CRLF: make edits tolerant of `\r\n`. Every jsdom test file calls `cleanup()` in `afterEach`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A wild card with a better record than a division winner: the division winner still plays a wild card in R1, home court goes to the better record, and the bracket feeds the right division final.
2. A 4th-placed team with a better record than another division's 3rd: it must not qualify (only the top 3 of a division plus the 2 best of the leftovers do).
3. A tie for the last wild-card spot: resolved by `orderTeams` over the conference, with the tie note recorded in `seeds[].notes`.
4. The schedule builder with many seeds: every team gets exactly 84 games, 42 home, the right count per opponent class, never stuck.
5. S79 and earlier with the new `teams.json` fields present (ATL/STL `formerGroup`, `division`): two conferences, 8 seeds the old way, 86-game maths, old lottery, St. Louis counted West.

## File Structure

| File | Responsibility |
|---|---|
| `engine/shared/divisions.ts` (new) | `DIVISIONS_SEASON`, `DIVISION_LAYOUT`, `divisionName` |
| `engine/shared/types.ts` (modify) | `Team.division`, `Team.formerGroup`, `PlayoffSeed.divisions/wildCards` |
| `engine/shared/teams.ts` (modify) | `teamsInSeason` resolves group/division per season; `groupInSeason` |
| `importers/divisions.ts` (new) + `run.ts` (modify) | `--divisions` flag: writes the layout into a teams file (user runs it) |
| `engine/season/schedule.ts` (modify) | `ScheduleTeamInfo.division`, division pairings, balanced 3-game split |
| `engine/season/standings.ts` (modify) | division tables, qualifiers, wild cards, `seasonLength` for the division format, markers |
| `engine/playoffs/bracket.ts`, `moves.ts` (modify) | new seeding, bracket, round names; `wrapUp.ts` unchanged except tests |
| `engine/offseason/lottery.ts` (modify) | 16-team odds |
| `app/pages/StandingsPage.tsx`, `app/playoffs/*`, history/team pages (modify) | show divisions, wild cards, division finals, per-season conference |
| `engine/season/divisions.e2e.test.ts` (new) | 32-team end-to-end |

---

### Task 1: Division data model

**Files:**
- Create: `engine/shared/divisions.ts`, `engine/shared/divisions.test.ts`
- Modify: `engine/shared/types.ts` (`Team`), `engine/shared/teams.ts`, `engine/shared/teams.test.ts`

**Interfaces:**
- Produces: `DIVISIONS_SEASON = 80`; `DIVISION_LAYOUT: { division: 'AT'|'GL'|'PA'|'GU'; group: 'E'|'W'; name: string; teams: string[] }[]` (teamIds exactly as in the spec table: AT = BOS, MW, NY, MAN, PHI, DCB, CAR, MON; GL = CHI, MIL, DET, CIN, CP, OV, TOR, STL; PA = SEA, VAN, LAL, OAK, LA, VEG, HON, DEN; GU = TEX, SAS, NO, FLO, CGG, PHX, MEM, ATL); `divisionName(code: string | null | undefined): string`; `Team.division?: string`; `Team.formerGroup?: { through: number; group: string }`; `groupInSeason(team: Team, season: number): string | null`; `teamsInSeason(file, season)` now returns teams whose `group` is `groupInSeason(...)` and whose `division` is dropped when `season < DIVISIONS_SEASON`.

- [ ] **Step 1: Write the failing tests.** `divisions.test.ts`: 4 divisions of 8, 32 distinct ids, East = AT+GL, West = PA+GU; `divisionName('GL') === 'Great Lakes'`. `teams.test.ts`: a team with `{ group: 'W', formerGroup: { through: 79, group: 'E' }, division: 'GU' }` gives `groupInSeason(t, 79) === 'E'`, `groupInSeason(t, 80) === 'W'`; `teamsInSeason(file, 79)` has no `division` and group `E`; `teamsInSeason(file, 80)` has `division: 'GU'` and group `W`. A `Team` with a bad `formerGroup` fails `Team.strict()` parsing.
- [ ] **Step 2: Run** `npx vitest run engine/shared` — Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the schema fields (`division: z.string().min(1).optional()`, `formerGroup: z.object({ through: int, group: z.string().min(1) }).strict().optional()`), `divisions.ts`, and the `teamsInSeason`/`groupInSeason` changes. Keep the existing `fromSeason` filter.
- [ ] **Step 4: Run** `npx vitest run engine/shared data.test.ts` and `npx tsc --noEmit` — Expected: PASS, no output.
- [ ] **Step 5: Commit** `engine/shared/divisions.ts engine/shared/divisions.test.ts engine/shared/types.ts engine/shared/teams.ts engine/shared/teams.test.ts`.

### Task 2: `--divisions` importer

**Files:**
- Create: `importers/divisions.ts`, `importers/divisions.test.ts`
- Modify: `importers/run.ts` (flag, `MODE_FLAGS`, dispatch; copy the `--expansion-teams` pattern at `run.ts:786`)

**Interfaces:**
- Consumes: `DIVISION_LAYOUT`, `DIVISIONS_SEASON`.
- Produces: `applyDivisions(file: TeamsFile): TeamsFile` — sets `division` on every FBA team from the layout; for a team whose layout group differs from its current `group`, sets `formerGroup: { through: DIVISIONS_SEASON - 1, group: <old group> }` and `group: <layout group>`. Idempotent; throws if a layout teamId is missing from the file.

- [ ] **Step 1: Write the failing test** on an in-memory 32-team `TeamsFile` (E/W as today): after `applyDivisions`, ATL has `group: 'W'`, `division: 'GU'`, `formerGroup: { through: 79, group: 'E' }`; STL has `group: 'E'`, `division: 'GL'`, `formerGroup: { through: 79, group: 'W' }`; DEN has no `formerGroup`; applying twice equals applying once; each conference has 16 teams.
- [ ] **Step 2: Run** `npx vitest run importers/divisions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `applyDivisions` and the `--divisions` flag, which reads and writes `leagues/fba/teams.json` in the `--data` folder via `requireDataDir`, exactly like `importExpansionTeams`. Tests must not touch `web/data`.
- [ ] **Step 4: Run** `npx vitest run importers` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** the four paths.

### Task 3: Division schedule

**Files:**
- Modify: `engine/season/schedule.ts`, `engine/season/schedule.test.ts`, `engine/season/standings.ts` (`seasonLength`), `engine/season/moves.ts:53`, `engine/season/testFixtures.ts`, `engine/playoffs/testFixtures.ts`

**Interfaces:**
- Produces: `ScheduleTeamInfo { teamId: string; group: string | null; division?: string | null }`; `buildSchedule(league, teams, rng)` uses the division format when every FBA team has a `division`, else today's `PAIRINGS`; `seasonLength(league, teams)` returns `{ games: 84, confGames: 52 }` for the 32-team division layout (confGames = 7×4 + 8×3), unchanged otherwise; `seasonStateFor(league, list, ratings, firstId, opts?: { season?: number; divisions?: Record<string, string> })`; `fullDivisionState(seed = 9): SeasonState` (32 teams, 16 per conference, 8 per division, season 80) in `playoffs/testFixtures.ts`. `engine/season/moves.ts` passes `division` into `ScheduleTeamInfo`.

- [ ] **Step 1: Write the failing tests** in `schedule.test.ts` (32 teams, division codes, seeds 1..20): every team plays exactly 84 games; 42 home / 42 away; vs each division opponent 4 games (2 home); vs each other-division conference opponent 3 games (2-1 either way; each team hosts twice against exactly 4 of its 8); vs each other-conference team 2 (1+1); total 1344 games. `defaultPauses('fba', 84)` afterGames are `[21, 42, 42, 63, 63, 84]`. Without divisions the 30-team result is still 86 games (existing tests keep passing). `seasonLength` for the division layout is `{ games: 84, confGames: 52 }`.
- [ ] **Step 2: Run** `npx vitest run engine/season/schedule.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** in `schedule.ts`: `PAIRINGS` stays for D2/old FBA; add division pair counts (4/3/2). For each other-division pair, decide who hosts twice with a balanced assignment: shuffle both divisions' team lists with `rng`, then team `i` of division A hosts twice against team `(i + j) mod 8` of division B for `j = 0..3` (a circulant, so every team hosts twice against exactly 4 and once against 4). Feed these into the existing home/away maps; the greedy loop is unchanged. Update `seasonLength` and the `moves.ts` mapping.
- [ ] **Step 4: Run** `npx vitest run engine/season engine/playoffs` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** the changed files.

### Task 4: Division standings and qualifiers

**Files:**
- Modify: `engine/season/standings.ts`, `engine/season/standings.test.ts`, `engine/playoffs/markers.test.ts`

**Interfaces:**
- Consumes: `ScheduleTeamInfo.division`.
- Produces: `TeamRecord.division: string`; `StandingRow.division: string`; `Standings.groups[i]` gains optional `divisions?: { division: string; rows: StandingRow[] }[]` and `wildCard?: StandingRow[]` (the conference's non-top-3 teams, best first); `StandingRow.marker` semantics in the division format: `'*'` clinched the division title, `'x'` clinched a top-3 division finish, `'n'` only once the regular season is over and the team did not qualify; wild-card clinches are not detected early. `export function qualifiers(g: Standings['groups'][number]): { teams: string[]; divisions: { division: string; teams: string[] }[]; wildCards: string[] }` where `teams` are the 8 qualifiers ordered by `orderTeams` over just those 8 (seed order, best first). `Standings.lottery` in the division format = the 16 non-qualifiers, worst first (same `javaOrder` as today).

- [ ] **Step 1: Write the failing tests** with 32 hand-built records: (a) top 3 of each division qualify and the 2 best of the other 10 conference teams are WC1/WC2 in conference order; (b) a 4th-place team with a better record than another division's 3rd does not qualify (Review Focus 2); (c) a wild card with a better record than one division winner appears ahead of it in `teams` seed order (Review Focus 1); (d) a tie for WC2 is settled by conference wins and a note is produced (Review Focus 3); (e) the lottery list has 16 teams, worst first; (f) a 30-team old-format input produces exactly today's result (no `divisions`), and the same teams with `division` set but a season-79 `teamsInSeason` also does (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run engine/season/standings.test.ts engine/playoffs/markers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Division order uses `orderTeams` over the division's records with `{ conference: true }`; conference order over all 16. Qualifiers and markers as in Interfaces; division `'x'` uses the existing `clinchOut(..., 3)` over the division, `'*'` uses `clinchOut(..., 1)`. `PLAYOFF_SEEDS` stays 8.
- [ ] **Step 4: Run** `npx vitest run engine/season engine/playoffs` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: NHL-style seeding and bracket

**Files:**
- Modify: `engine/shared/types.ts` (`PlayoffSeed`), `engine/playoffs/bracket.ts`, `engine/playoffs/moves.ts` (`seedPreview`, `lockSeeds`), `engine/playoffs/bracket.test.ts`, `engine/playoffs/moves.test.ts`

**Interfaces:**
- Consumes: `qualifiers`.
- Produces: `PlayoffSeed` adds optional `divisions: { division: string; teams: string[] }[]` (each the top 3, best first) and `wildCards: string[]` (2, best first); `teams` stays the 8 in seed (home-court) order. `buildBracket(league, seeds)` builds the division bracket when a seed carries `divisions`, else today's. Series ids unchanged (`E-R1-1..4`, `E-SF-1`, `E-SF-2`, `E-CF`, `FINALS`). New wiring: let W1 be the division winner with the better seed number, W2 the other; `R1-1` = W1 vs WC2, `R1-2` = W2 vs WC1, `R1-3` = W1's division 2nd vs 3rd, `R1-4` = W2's division 2nd vs 3rd; `R1-1` and `R1-3` feed `SF-1`, `R1-2` and `R1-4` feed `SF-2`; `SF-1`, `SF-2` feed the CF as today. Home court in every series: the lower seed number (better record). `queue` order: all `R1-1`s, then `R1-2`s, `R1-3`s, `R1-4`s across conferences. `roundName(league, s, divisional = false)`: round 2 reads "division finals" when `divisional`; `bracketColumns` returns `[R1-1, R1-3, R1-2, R1-4], [SF-1, SF-2], [CF]` for the division format.
- `seedPreview` returns the new fields in the division format; `lockSeeds` rejects a conference with fewer than 8 qualifiers.

- [ ] **Step 1: Write the failing tests:** from a fixed `qualifiers` result, `buildBracket` makes the exact 8 first-round pairings and `next` links above; a wild card with the best record in the conference is seed 1 but still plays a division winner and is home in game 1 against anyone in R1 (Review Focus 1); advancing R1-1 and R1-3 winners fills `SF-1` with the lower seed number at home; old-format seeds still build today's bracket; `roundName` gives "East division finals" only with `divisional`; the schema accepts a seed with and without the new fields and rejects a wrong-length `wildCards`.
- [ ] **Step 2: Run** `npx vitest run engine/playoffs` — Expected: FAIL.
- [ ] **Step 3: Implement** the schema fields, `buildBracket`, `roundName`, `bracketColumns` and the `seedPreview`/`lockSeeds` changes. Callers of `roundName` pass `divisional = pf.seeds.some(s => s.divisions)`.
- [ ] **Step 4: Run** `npx vitest run engine` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: 16-team lottery

**Files:**
- Modify: `engine/offseason/lottery.ts`, `engine/offseason/lottery.test.ts`

**Interfaces:**
- Produces: `LOTTERY_ODDS[16]`, derived by `stretchOdds(base: number[], n: number): number[]` (linear interpolation of the cumulative sum of the 14-team table at `14·j/n`, differenced); `oddsTable(16, 0)` returns it. No other behaviour changes (the S79 lottery with 2 expansion teams + 14 is untouched).

- [ ] **Step 1: Write the failing tests:** `oddsTable(16, 0)` rounds to the Global Constraints list, sums to 100 (±1e-9), and is non-increasing; `stretchOdds(LOTTERY_ODDS[14], 14)` equals the 14-team table; `lotteryOdds` with 16 teams that have a tied pair shares the averaged slots; `oddsTable(14, 2)` is unchanged.
- [ ] **Step 2: Run** `npx vitest run engine/offseason/lottery.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `stretchOdds` and register `LOTTERY_ODDS[16] = stretchOdds(LOTTERY_ODDS[14], 16)`.
- [ ] **Step 4: Run** `npx vitest run engine/offseason` and `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: App pages

**Files:**
- Modify: `app/pages/StandingsPage.tsx`, `app/playoffs/PlayoffsPage.tsx`, `app/playoffs/Bracket.tsx`, `app/pages/SchedulesPage.tsx`, `app/pages/TeamPage.tsx`, `app/pages/LeaguePage.tsx`, the history pages that read a team's FBA `group` (find them with `grep -rn "\.group" app/history app/pages`), plus their tests.

**Interfaces:**
- Consumes: `Standings.groups[].divisions/wildCard`, `PlayoffSeed.divisions/wildCards`, `roundName(..., divisional)`, `groupInSeason`, `divisionName`.

- [ ] **Step 1: Write the failing tests** (jsdom, `cleanup()` in `afterEach`): the standings page for a division season shows "Atlantic", "Great Lakes", "Pacific", "Gulf" tables and a "Wild card" table per conference, keeps the clinch bars, and for an S79 state shows the two conference tables as today; the playoffs page labels round 2 "division finals" for a division season and "semifinals" otherwise; the seed table marks division winners and wild cards; a team page for St. Louis in S79 shows West, in S80 East.
- [ ] **Step 2: Run** the changed test files — Expected: FAIL.
- [ ] **Step 3: Implement** the page changes, following the existing look and the clinch-bar legend. Any page that resolves a team's conference for a given season uses `groupInSeason`/`teamsInSeason`, never `team.group` directly.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: all pass, no output.
- [ ] **Step 5: Commit.**

### Task 8: 32-team end-to-end and docs

**Files:**
- Create: `engine/season/divisions.e2e.test.ts`
- Modify: `docs/fba-rule-changes.md`

- [ ] **Step 1: Write the test**, modelled on `engine/season/expansion.e2e.test.ts` and `engine/playoffs/season.e2e.test.ts`, using `fullDivisionState()`: schedule is 84 games per team; `regularSeasonDone`; `lockSeeds` gives two conferences of 8 qualifiers with 2 wild cards each; `playPlayoffs` finishes with one champion; the S81 lottery preview lists 16 teams and its odds sum to 100; a state at season 79 with the same teams file still produces today's 86-game, 8-seed, 14-team-lottery shape.
- [ ] **Step 2: Run** `npx vitest run engine/season/divisions.e2e.test.ts` — Expected: PASS (all behaviour exists by now; fix any gap it exposes in the owning task's code).
- [ ] **Step 3: Update** `docs/fba-rule-changes.md` with the S80 rules (divisions, 84 games, wild-card format, 16-team lottery table).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: all pass, no output.
- [ ] **Step 5: Commit** both paths.

## After the build
The user applies the layout to real data themselves: `--divisions` against their data folder (step not run by this plan). No browser check is planned on real data; a scratch-copy check follows the CLAUDE.md "Browser checks" recipe only if the user asks.
