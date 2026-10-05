# Franchise Players Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Players tab on `/history/fba/teams/:teamId` with an all-time player table and a per-season roster picker (spec: `docs/superpowers/specs/2026-10-05-franchise-players-design.md`).

**Architecture:** A pure engine module builds an index from bios, summaries, hall of fame and the S78+ roster files. A new component renders it. `FranchisePage` gains a tab bar and loads the extra documents only on the Players tab.

**Tech Stack:** TypeScript, React 18, React Router 6 (`useSearchParams`), Vitest + jsdom.

## Global Constraints

- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` (tests use stubbed `fetch`).
- Work on branch `franchise-players`. Run from `web/`: `npx vitest run <paths>`, `npx tsc --noEmit` (must print nothing).
- Every jsdom test file calls `cleanup()` in `afterEach`.
- Existing `FranchisePages.test.tsx` stubs only specific URLs, so the new documents must load only when `?tab=players`.

---

### Task 1: Engine — `franchiseIndex`

**Files:** Create `web/engine/history/franchiseRoster.ts`, `web/engine/history/franchiseRoster.test.ts`.

**Interfaces (produces):**

```ts
export interface FranchiseHonour { label: string; count: number; seasons: number[] }
export interface FranchisePlayer { playerId: string; name: string; seasons: number[]; honours: FranchiseHonour[]; hof: string | null }
export interface SeasonRosterRow { playerId: string; name: string; honours: string[]; slot: RosterEntry | null }
export interface FranchiseRosterInput {
  franchise: Franchise; players: PlayersFile; bios: PlayerBiosFile | null;
  summaries: SummaryFile[]; hof: HallOfFameFile | null; rosters: RostersFile[];
}
export function franchiseIndex(input: FranchiseRosterInput): { players: FranchisePlayer[]; rosterFor(season: number): SeasonRosterRow[] };
export function franchiseSeasons(franchise: Franchise, latest: number): number[];
export function seasonRanges(seasons: number[]): string; // [12,13,14,22] -> "S12–S14, S22"
```

**Rules (implement exactly):**
- `stintSeasons(range)`: split on `;`; each part split on `-`; `first`/`last` tokens; `lo = FFL ? 1 : S<n>`; `hi = /^pres/ ? 78 : FFL ? 0 : S<n>`; skip a part when either is null; push `lo..hi`. (`S22` → [22]; `FFL-S10` → 1..10; `FFL-FFL` → none; `S73-pres.` → 73..78.)
- A stint covers a season for this franchise when `stint.kind === 'fba'` and `stint.team.split('/')` includes the abbr of the franchise era covering that season, or (season ≥ 79) includes `franchise.teamId`.
- Candidates: every bio player, plus every `playerId` on `rosters[*].teams[franchise.teamId]`. Each candidate's career is `liveCareer(bio ?? null, id, summaries, hof)`.
- Per candidate: seasons = covered seasons of all fba stints ∪ roster-file seasons where listed. Honours = honours of stints that cover at least one season, merged by lower-cased label (counts add, seasons union, sorted). `hof = String(career.hof)` or null.
- `players` = candidates with ≥1 season and a name in `players.players`, sorted by first season then name.
- `rosterFor(season)`: players whose seasons include `season`; `honours` = labels of honours whose `seasons` include it (deduped); `slot` = that season's roster-file entry for the player or null; sorted by rating desc (null last) when any slot exists, else by name.
- `franchiseSeasons`: each era `from .. (to ?? latest)`, unique, ascending.

- [ ] **Step 1: Write failing tests** covering: `TEX-S5-S10` counts for a franchise whose S1–S10 era abbr is `TEX`; `FLO-S11` counts via its one-season era; `BOS/MON-S20` counts; `BOS-S20-S25` does not; `MON-S12-S13;S20-S21` → 12,13,20,21; `MON-S77-pres.` → 77,78; exact-season honour (`S7 MVP`) lands on S7 in `rosterFor(7)` and not `rosterFor(8)`; count-only `2x Young-Star` is in `players[].honours` with `seasons: []` and absent from rosterFor; a player with no bio on a S78 roster appears with `slot` set; a college-only bio is excluded; `franchiseSeasons` and `seasonRanges` cases.
- [ ] **Step 2:** `npx vitest run engine/history/franchiseRoster.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `franchiseRoster.ts` per the rules (import `liveCareer` and `Stint` from `./career`).
- [ ] **Step 4:** run the test → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `Add franchise player index`.

---

### Task 2: Component — `FranchisePlayers`

**Files:** Create `web/app/history/FranchisePlayers.tsx`, `web/app/history/FranchisePlayers.test.tsx`; modify `web/app/history/history.css`.

**Interfaces:**
- Consumes: `franchiseIndex`, `franchiseSeasons`, `seasonRanges` (Task 1), `PlayerLink` (`./PlayerLink`).
- Produces: `FranchisePlayers({ franchise, players, bios, summaries, hof, rosters, latest })` with those input types (`latest: number`).

**Behaviour:**
- View switch (two `button.chip` with `aria-pressed`): "All-time" (default) / "By season". Stored in URL as `view=season`; season as `season=N` (default `latest`). Updates use `setSearchParams(prev => …)` so `tab` is kept.
- All-time table (`.table-wrap > table.stat-table`): Player (`PlayerLink`), Seasons (`seasonRanges` + count), Accolades (muted text, `·`-separated: `MVP (S14, S16)` for dated honours, `2x Young-Star` for count-only, `Hall of Fame (S42)`). A `search` input (aria-label "Search players") and a sort `select` (aria-label "Sort players": Name, First season, Seasons played, Accolades).
- By season: `select` (aria-label "Season") of `franchiseSeasons`; roster table. Columns Player, Honours; plus Pos, Rtg, Age, Pts when any row has a `slot`. Empty → `<p className="muted">No players recorded for this season.</p>`.

- [ ] **Step 1: Write failing tests** (`MemoryRouter initialEntries={['/t?tab=players']}`, fixtures like Task 1): lists every player with ranges and accolades; search filters; sorting by seasons played reorders; switching to By season shows a pre-S78 roster without a "Rtg" column and an S78 roster with it; changing the season select changes rows.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement the component and add small CSS for `.fp-controls` (flex row, gap `var(--s2)`, wrap).
- [ ] **Step 4:** run → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `Add franchise players tab component`.

---

### Task 3: Wire into `FranchisePage`

**Files:** Modify `web/app/history/FranchisePage.tsx`, `web/app/history/FranchisePages.test.tsx`.

- [ ] **Step 1: Failing tests** in `FranchisePages.test.tsx`: stub `/api/state/leagues/fba/playerBios.json` and `/api/state/leagues/fba/S78/rosters.json`; (a) default page shows the Overview content and has `tab` buttons "Overview"/"Players" with Overview selected, and does NOT request `playerBios.json`; (b) `?tab=players` shows the all-time table with a bio player and does request it.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** In `FranchisePage`: `const [params, setParams] = useSearchParams(); const tab = params.get('tab') === 'players' ? 'players' : 'overview';`. Hooks at the top: `useDoc<PlayerBiosFile>(tab === 'players' ? 'leagues/fba/playerBios.json' : null)`, and a small `useRosters(seasons)` hook (local to the file) that fetches `/api/state/leagues/fba/S<n>/rosters.json` for `n` in `78..latest` when on the Players tab, ignores non-OK responses, and returns `RostersFile[] | null` until settled. After `EraStrip` render `<SubNav label="Franchise" items={[{id:'overview',label:'Overview'},{id:'players',label:'Players'}]} active={tab} onSelect={id => setParams(id === 'players' ? { tab: 'players' } : {})} />`. Wrap the existing sections from the championship chips to the Transactions link in `{tab === 'overview' && <>…</>}`; on `players` render `<FranchisePlayers … />` (show `Loading…` until bios and rosters settle).
- [ ] **Step 4:** run `npx vitest run app/history` → all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Browser check on the user's dev server (read-only): open `/history/fba/teams/MON?tab=players`, confirm Texas/Florida-era players appear and the S11 season lists its roster; open a pre-S78 season and S78.
- [ ] **Step 6:** Commit `Add Players tab to the franchise page`.

## Self-review

- Spec coverage: tab bar + `?tab=` (Task 3); all-time table, search, sort (Task 2); season picker, S78+ columns, URL season (Task 2); era/slash/range matching and exclusions (Task 1).
- Names consistent across tasks: `franchiseIndex`, `rosterFor`, `franchiseSeasons`, `seasonRanges`, `FranchisePlayers`.
