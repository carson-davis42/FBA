# League Players tab Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** a sortable Players table in each league nav. **Architecture:** a pure `playerRows` engine function plus one generic `PlayersPage` configured per league. **Tech:** React 18, Vitest (jsdom, `cleanup()` in `afterEach`), existing `useSort`/`SortTh`. **Spec:** `docs/superpowers/specs/2026-10-13-league-players-tab-design.md`.

## Global constraints
- Never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/`, `web/data/**` (the user's S79 data is modified: never touch or stage it; stage by explicit path). No dev servers. `npx tsc --noEmit` prints nothing; full `npx vitest run` passes. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `players-tab`.

### Task 1: engine + FBA/D2 page + nav + route
**Files:** create `web/engine/shared/playerRows.ts`, `playerRows.test.ts`, `web/app/pages/PlayersPage.tsx`, `PlayersPage.test.tsx`; modify `web/app/shell/SectionNav.tsx` (+ `SectionNav`/`SiteHeader` tests that list hrefs), `web/app/shell/Layout.tsx` (route `/league/:league/players` placed before `/league/:league`).
- [ ] Tests first for `playerRows` (GP from box appearances including a player who changed teams, vacant slots skipped, PPG null when GP is 0, contract fields only for FBA input flag, "Unnamed" fallback) and for the page (default sort rating desc; clicking Age/PPG/Name/Team sorts and toggles direction; team and position filters and name search; `#` is the rank after filtering; links go to the player history and team pages).
- [ ] Implement `playerRows({ league: 'fba'|'fbad2'|'fbajc'|'fbawc', rosters, results, players })` per the spec, the page (FBA and D2 columns) using `useDoc` for `meta.json`, `leagues/<league>/teams.json`, `leagues/<league>/S{n}/rosters.json`, `.../results.json`, `players.json` (treat a missing results doc as no games), and the nav entries (FBA/D2: before `Transactions`).
- [ ] Run covering tests, full suite, tsc; commit.

### Task 2: FBAJC and FBAWC
**Files:** modify `PlayersPage.tsx` (+ tests), `SectionNav.tsx`, route registration (the JC and WC leagues use specific routes: add `/league/fbajc/players` and `/league/fbawc/players` before the generic `:league` ones if the generic route doesn't already cover them).
- [ ] FBAJC: school, class, stars columns, rosters/results from `useJcDocs(season)`; no Age column. FBAWC: country names and flags via `TeamName` (like the Teams tab), rosters via `useWcRosters`, results from the season's World Cup/qualifying docs if present (GP/Pts blank otherwise). Follow `app/jc/LeadersPage.tsx` and `app/wc/TeamsTab.tsx` for loading and gating.
- [ ] Tests: JC page sorts by class and stars, shows no Age header; WC page lists country rosters with blank GP/PPG when no games; nav hrefs for both leagues.
- [ ] Full suite, tsc; commit.
