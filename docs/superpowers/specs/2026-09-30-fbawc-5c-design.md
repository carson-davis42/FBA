# FBAWC part 5c: World Cup pages, play wiring and Tournament MVP

Status: design agreed with the user 2026-09-30. Parents: `2026-09-30-fbawc-design.md` (§1 rules), `2026-09-30-fbawc-5b-design.md` (engine). Branch `fbawc-pages`.

## 1. Decisions (settled with the user)

- **Tournament MVP rule (A):** every player is listed by tournament PPG, minimum 3 games played. Generated players are listed as "Italy PG (Generated)"; if picked they are stored as `{name: "Italy PG", playerId: null}`.
- **Bracket layout (A):** one World Cup page with tabs Groups / Knockout / Teams. Knockout shows rounds as columns (R32 to Final) inside `.table-wrap`, sideways scroll at 375px. Each match is a card with two flags, the score, the winner bold.
- **D2 World Cups history tab:** already built in 5a (`/history/fbawc`, chip in `HistoryLeagueSwitch`). It reads per-season `summary.json` via `useHistory('fbawc')`; there is no separate `history.json`. Finishing the World Cup writes `S<even>/summary.json` and the page picks it up. No history work in 5c beyond a test that a finished summary shows its MVP.
- **Real data:** `web/data` is not touched. `withQualifyingStep` is applied by the user, or by an import-style mode `--wc-qualifying-step --data <dir>` (needs `--data`, so it only runs on a copy).

## 2. Engine additions (`web/engine/wc/`, pure TS)

- `writes.ts`: `type WcKey = 'rosters' | 'qualifying' | 'worldcup' | 'calendar'`; 5b's `changed` is retyped `WcKey[]` (labels `'fbawc/rosters'` etc. become keys). `wcWrites(result, season)` returns `{path, doc}[]`: `leagues/fbawc/S<n>/rosters.json`, `.../qualifying.json` (qualifying season), `.../worldcup.json`, `calendar.json`. Qualifying state docs live under the odd season, World Cup docs under the even one.
- `clinch.ts`: `qualifyingClinch(q)` and `groupClinch(wc, group)` return `Record<teamId, 'qualified' | 'advanced' | 'eliminated' | null>` from the games played. Conservative bound: a team is clinched when, counting its best and worst possible remaining wins against every rival's, its rank is guaranteed by wins alone (ties stay open). Auto teams in qualifying are `'qualified'` from the start; the top 49 after finishing are `'qualified'`, the rest `'eliminated'`. Group top 2 are `'advanced'`.
- `mvp.ts`: `tournamentMvpCandidates(wc, rosters)` aggregates box scores over group and knockout games: `{ key, name, teamId, generated, gp, ppg }`, gp >= 3, sorted by PPG then total points. Names come from `players.json` for real players; generated ids `<country>:<pos>` become "Italy PG". `pickTournamentMvp` returns `{ name, playerId | null }`.
- `summary.ts`: `buildWcSummary(wc, mvp)` returns the `SummaryFile` (league `fbawc`, season, locked, host, `champions` with title "World Cup", champion/runnerUp names and ids, and the MVP in the shape 5a uses on imported fbawc summaries; the plan task copies that shape from `engine/history/wc.ts`).
- `finishWorldCup` stays as in 5b. A new `finishWorldCupWithMvp(state, mvp)` returns the calendar write plus `summary.json` in one `WritesResult`-style result; the UI finish button is disabled until an MVP is picked.

## 3. App (`web/app/wc/`)

- Routes (before `/league/:league` in `Layout.tsx`): `/league/fbawc/qualifying`, `/league/fbawc/worldcup` (tab in `?tab=groups|knockout|teams`). `/league/fbawc` stays the teams grid; `/league/fbawc/team/:teamId` stays `TeamPage`, which loads rosters from the newest existing `S<n>/rosters.json` (the current stage's), shows generated entries as "Generated" without a player link, and the flag via `TeamName`.
- `stepRoutes.ts`: `s<odd>-qualifying` to `/league/fbawc/qualifying`, `s<even>-world-cup` to `/league/fbawc/worldcup` (before the generic `step.league` rule). `Home.tsx`: the qualifying step titles "World Cup qualifying S79", not "Play World Cup S79".
- `useWcState(season)` loads every doc the moves read or write (calendar, teams, hosts, D2 rosters of that season, previous and own rosters, qualifying, worldcup, summary, players) with their versions (`null` when missing).
- **Qualifying page:** action row: Start qualifying; Play next; Play all; Finish. Sections: the 15 automatic teams (flag, rating); the 70-team table (rank, team, W-L, PF-PA) with clinch bars and a dashed line after rank 49, tie notes, and a key; schedule and results list.
- **World Cup page:** actions: Start World Cup; Play next; Play all groups; Finish groups; Play next knockout; Play all knockout; Finish (needs the MVP pick). Tabs: Groups (16 cards, each a 4-row table with clinch bars and its six games); Knockout (columns, Final highlighted, champion banner, and the MVP pick card like `FinalsMvpCard` once the final is played); Teams (grid by rating, flag, links).
- `Clinch.tsx`: `ClinchKind` gains `'qualified' | 'advanced'` (existing `'eliminated'` reused); the league type gains `'fbawc'`; labels "Qualified", "Advanced to knockouts", "Eliminated" with a key.
- **Saving:** every action goes through `commitDocs(label, wcWrites(result, ...), versions)`. Play all simulates in memory with `mulberry32(Date.now())` and saves once. A `useRef` guards the handler; chained saves reuse the versions returned by the previous save. The start buttons are disabled when the document exists.
- **Importer mode:** `--wc-qualifying-step --data <dir>` in `importers/run.ts`: reads `calendar.json`, applies `withQualifyingStep`, validates, writes; does nothing if the step exists.

## 4. Tests

- Engine: `wcWrites` paths per key; clinch (auto teams, clinched and eliminated cases, ties stay open, group top 2); MVP candidates (min 3 GP, generated naming, PPG order); summary schema parse; the importer mode on a temp copy.
- Pages (jsdom, `cleanup()` in `afterEach`): qualifying and World Cup pages in each stage (not started, mid-way, finished); Play all saves once with the loaded versions; start disabled when the doc exists; MVP pick enables Finish; step routes; Home title; generated players shown as "Generated".
- `web/data.test.ts` stays green; browser check on scratch data (5183/5184) incl. 375px and dark mode.
