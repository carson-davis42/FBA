# Part 7c College Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FBAJC S79 playable from the app, and build the tools for the S80 class. That means fixing 7a's class timeline, adding the name check and the S79 class import, and building the transfer portal, Rank Class, Adjust College Ratings and walk-ons.

**Architecture:**
- **Engine:** pure engine moves in `web/engine/college/`. They return `RecruitingResult`, or `WritesResult` (`engine/season/moves.ts`) for the multi-doc moves. The two rankings reuse `engine/rank/ranking.ts` and `app/rank/RankingTable.tsx`.
- **Pages:** they load docs with `useDoc` and save with `commitDocs(label, writes, versions)`.
- **Importers:** two new `npm run import` modes read the Google sheets. The user runs them.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3, Vitest 2 (jsdom), exceljs (importers).

Spec: `docs/superpowers/specs/2026-09-29-offseason-7c-college-tail-design.md`, cited as §N below.

## Global Constraints

**Commands and data:**
- Run everything from `web/`. `npx tsc --noEmit` must print nothing.
- Filter test output: `npx vitest run <paths> 2>&1 | grep -E "Test Files|Tests|FAIL"`. Before this part the suite is 824 tests.
- Never touch `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`. Don't start or stop servers on 5173/5174.
- **Never run `--fix-names` or `--recruiting-class` against `web/data`.** Test them with fixture rows only.

**Code rules:**
- Vitest globals are off: import `describe/it/expect/vi/afterEach` explicitly. Each jsdom test file calls `cleanup()` in `afterEach`.
- Every random choice takes an injected `Rng` (`engine/d2/random.ts`: `mulberry32`, `randInt(rng, lo, hi)`, both ends inclusive). Pages pass `Math.random`.
- Page tests follow `app/pages/D2RatingsPage.test.tsx`: a stubbed `fetch` serves docs with ETags and records the PUT/batch bodies.
- `useSaving()` forces an extra render when a save starts, so guard any saving effect with a `useRef`.

**The class timeline (§2):**
- Class S{k} plays Freshman in S{k}.
- Its board is at `leagues/fbajc/S{k−1}/recruiting.json` (`season` k−1, `classOf` k).
- Its players are born `birthSeason = k − 18`.

**Names and copy:**
- Unnamed college players are "X" (`collegeName`). Nothing may say "S80" as the current season; "S80 class" is fine.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Responsibility |
|---|---|
| `engine/shared/types.ts`, `engine/shared/schemaRegistry.ts` (modify) | `Prospect.consensus`; the `college-class`/`college-reset` ranking kinds with `consensus`/`consensusCurve`; tx types `'walk-on'` and `'college-ratings'`; paths for `classRanking.json` and fbajc `ratings.json` |
| `engine/college/state.ts`, `engine/college/recruiting.ts` (modify) | Board paths by the board's own season, birth-season fix, next-class commits kept on the board only, X displacement, gate with open spots |
| `engine/season/nextSeason.ts`, `app/pages/NextSeasonPage.tsx`, `app/pages/CalendarPage.tsx` (modify) | The gate and the rollover lock read the S{n} class board |
| `app/college/useRecruitingState.ts`, `app/college/RecruitingPage.tsx` (modify) | Two boards and a class picker |
| `importers/sheets/playersTab.ts` (+test) | Players-tab names and birth seasons, `closeMatches` |
| `importers/sheets/recruitingClass.ts` (+test) | Parse one class section of the FBA JC Recruiting tab |
| `importers/fixNames.ts`, `importers/recruitingClassImport.ts` (+tests), `importers/run.ts` (modify) | `--fix-names`, `--recruiting-class` |
| `engine/college/portal.ts` (+test), `app/college/PortalPage.tsx` (+test), `app/components/PortalBanner.tsx` | Transfer portal |
| `engine/college/classRanking.ts` (+test), `app/college/ClassRankingPage.tsx` (+test) | Rank S{n+1} Class |
| `engine/college/collegeRatings.ts` (+test), `app/college/CollegeRatingsPage.tsx` (+test) | Adjust College Ratings |
| `engine/college/walkOns.ts` (+test), `app/college/BoardTab.tsx` (modify) | Walk-ons |
| `app/rank/RankingTable.tsx` (modify) | Optional consensus column |
| `app/stepRoutes.ts`, `app/shell/Layout.tsx`, `app/pages/Home.tsx` (modify) | Routes, tool links, banner |

---

### Task 1: Schemas

**Files:** modify `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`.

**Produces:** `Prospect.consensus?: number | null`; `RankingKind` values `'college-class' | 'college-reset'`; `RankingFile.consensus?` and `RankingFile.consensusCurve?`; `TransactionType` values `'walk-on' | 'college-ratings'`; registry rules for `leagues/fbajc/S{n}/classRanking.json` and `leagues/fbajc/S{n}/ratings.json`, both `RankingFile`.

- [ ] **Step 1: Write the failing tests** (`types.test.ts`):
  - A `Prospect` with `consensus: 96.84` parses. One with `consensus: 69.9` fails, and one with no `consensus` key parses.
  - A `college-class` `RankingFile` with `consensus` and `consensusCurve` parses.
  - A `d2-reset` file with `consensus` fails ("Only a class ranking has consensus").
  - A *locked* `college-class` file whose ranked player has no consensus fails ("A finished class ranking must give every player a consensus").
  - A `consensusCurve` that goes up fails.

  `schemaRegistry.test.ts`: `schemaForPath('leagues/fbajc/S79/classRanking.json')` and `('leagues/fbajc/S79/ratings.json')` return `RankingFile`.
- [ ] **Step 2: Run to verify failure:** `npx vitest run engine/shared 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- [ ] **Step 3: Implement.** In `types.ts`:

```ts
const consensus = z.number().min(70).max(100);
// Prospect: add after `stars`
  /** Recruiting score shown on the board (stars follow it: 90+ 5★, 80+ 4★, 70+ 3★). Null until Rank Class. */
  consensus: consensus.nullable().optional(),
export const RankingKind = z.enum(['d2-reset', 'college-class', 'college-reset']);
// RankingFile: add after `curve`
  /** college-class only: each player's consensus, and the suggestion ladder (high to low). */
  consensus: z.record(playerId, consensus).optional(),
  consensusCurve: z.array(consensus).optional(),
```

  In the `RankingFile` `superRefine`:

```ts
  if (doc.kind !== 'college-class' && (doc.consensus || doc.consensusCurve)) issue('Only a class ranking has consensus');
  for (const id of Object.keys(doc.consensus ?? {})) if (!ids.has(id)) issue(`${id} has a consensus but isn't in the rows`);
  if ((doc.consensusCurve ?? []).some((v, k, a) => k > 0 && v > a[k - 1])) issue('The consensus curve must run from high to low');
  if (doc.locked && doc.kind === 'college-class' && doc.order.some(id => doc.consensus?.[id] === undefined)) {
    issue('A finished class ranking must give every player a consensus');
  }
```

  Add `'walk-on', 'college-ratings'` to the end of `TransactionType`. In `schemaRegistry.ts`, next to the fbajc recruiting rule:

```ts
  [new RegExp(`^leagues/fbajc/${S}/classRanking\\.json$`), RankingFile],
  [new RegExp(`^leagues/fbajc/${S}/ratings\\.json$`), RankingFile],
```

- [ ] **Step 4: Run the tests, tsc, the full suite (824 + new, 0 failures) and `data.test.ts`.**
- [ ] **Step 5: Commit** `feat: 7c schemas (consensus, college ranking kinds, walk-on tx)`.

---

### Task 2: Class timeline in the recruiting engine (§2)

**Files:** modify `web/engine/college/state.ts`, `web/engine/college/recruiting.ts`, `web/engine/college/recruiting.test.ts`, `web/engine/college/board.test.ts`, `web/engine/college/testFixtures.ts`.

**Interfaces:**
- `RecruitingState` keeps `season` (the calendar season: rosters and tx). `recruiting.season` is where the board lives. Add:

```ts
/** leagues/fbajc/S{season}/recruiting.json: the board of the class created in `season` (it plays in season + 1). */
export const boardPath = (season: number) => `leagues/fbajc/S${season}/recruiting.json`;
/** In calendar season n: the class that plays this season (board S{n−1}) and the next class (board S{n}). */
export const currentClassBoardSeason = (n: number) => n - 1;
export const nextClassBoardSeason = (n: number) => n;
/** True when the board's class plays in the state's season (commits go onto this season's rosters). */
export const playsThisSeason = (s: RecruitingState) => s.recruiting.classOf === s.season;
```

- `recruitingDocPath('recruiting', season)` stays and still means `boardPath(season)`. `recruitingWrites` writes the `'recruiting'` key to `boardPath(result.state.recruiting.season)`, and every other key to `recruitingDocPath(k, result.state.season)`.
- `emptyRecruiting(season)` is unchanged: `classOf` = season + 1.
- `fbajcGateProblem(board: RecruitingFile | null, rosters: RostersFile | null): string | null`. It is the existing text, then `"${h} open ${h === 1 ? 'spot needs a walk-on' : 'spots need walk-ons'}"` when `rosters` has holes (`playerId === null`). The two parts are joined with `'; '`.

- [ ] **Step 1: Write the failing tests.** Update the fixtures where they rely on the old timeline.
  - `createClass` in calendar S79 (board S79, `classOf` 80) gives each new player `birthSeason: 62`.
  - **Next-class commit:** `commit` with `state.season` 79 and a board with `classOf` 80:
    - it succeeds; `changed` is `['recruiting', 'tx']`; the rosters are unchanged; `committedTo` is set;
    - the tx line is still `Name (5★ PG) commits to Duke`;
    - a second recruit at the same school and position is refused with `Duke already has <Name> committed at PG for the S80 class. Decommit them first`.
    - `decommit` of such a recruit clears `committedTo` with `changed: ['recruiting', 'tx']`.
  - **Current-class commit:** a board with `classOf` 79 in season 79 places the recruit on the S79 roster, as before.
  - **Displacing an X player:** the holder's `players.json` name is null. The X entry is replaced, nothing is added to the portal, and there is no portal tx line.
    - `commitPreview` returns `Replaces an unnamed player`.
    - A named holder still goes to the portal, with the preview `Name (Jr, 78) will enter the portal`.
    - For a next-class board, `commitPreview` returns `Joins the S80 roster at Adjust Age`.
  - `recruitingWrites` for a board with `season` 78 and `state.season` 79 writes `leagues/fbajc/S78/recruiting.json` and `leagues/fbajc/S79/rosters.json`.
  - **The gate:** `fbajcGateProblem(board, rosters)` with 2 holes adds `2 open spots need walk-ons`, and `(null, rosters)` returns only that part. `(board, null)` behaves as before.
- [ ] **Step 2: Run to verify failure:** `npx vitest run engine/college 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- [ ] **Step 3: Implement.**
  - `createClass`: `birthSeason: doc.classOf - 18`, and fix its doc comment.
  - `commit` and `decommit`: when `!playsThisSeason(state)`, only update the board and tx.
    - The same-slot rule checks the board: any other recruit on it with `committedTo === teamId` and the same `position`.
  - `slotFor`: a holder whose `state.players.players[id]?.name` is null (or who is missing) is `displaced: null` with a flag `unnamed: true`. `commit` then just overwrites the entry, and `commitPreview` returns `Replaces an unnamed player`.
  - `fbajcGateProblem`: add the second parameter.
  - Update every caller so the build passes: `CalendarPage` and `nextSeason` pass `null` for now (Task 3 wires them).
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `fix: class timeline (born classOf − 18, next-class commits on the board, X players replaced not ported)`.

---

### Task 3: Gate and rollover read the S{n} class board

**Files:** modify `web/engine/season/nextSeason.ts` (+test), `web/app/pages/NextSeasonPage.tsx` (+test if one exists), `web/app/pages/CalendarPage.tsx`, `web/app/pages/CalendarPage.test.tsx`.

**Interfaces:**
- `nextSeasonPaths(n).fbajc` becomes `{ recruiting: boardPath(n − 1), rosters: 'leagues/fbajc/S{n}/rosters.json' }`.
- `NextSeasonInput.fbajc` becomes `{ recruiting: RecruitingFile | null; rosters: RostersFile | null }`, where recruiting is "the board of the class that plays this season".

- [ ] **Step 1: Write the failing tests.**
  - `nextSeasonDocs` in S79 reads the gate from `fbajc.recruiting` (the S78 board) and `fbajc.rosters`. With 1 hole it refuses with `1 open spot needs a walk-on`.
  - On success it locks `leagues/fbajc/S78/recruiting.json`, and it doesn't touch `S79/recruiting.json`.
  - `CalendarPage` at the `fbajc` step serves `leagues/fbajc/S78/recruiting.json` with an uncommitted recruit and shows the existing message. Update the existing tests' paths from S79 to S78.
  - The same page, serving S79 college rosters with 3 holes and a fully committed board, shows `3 open spots need walk-ons`, and Mark done is disabled.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
  - `CalendarPage` loads `boardPath(cal.season - 1)` and `leagues/fbajc/S${cal.season}/rosters.json`. A missing rosters doc counts as no holes.
  - `NextSeasonPage` loads the new paths and passes them.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `fix: FBAJC gate and rollover use the class that plays this season`.

---

### Task 4: Recruiting page works two boards

**Files:** modify `web/app/college/useRecruitingState.ts`, `web/app/college/RecruitingPage.tsx`, `web/app/college/RecruitingPage.test.tsx`, `web/app/college/testDocs.ts`.

**Interfaces:**
- `useRecruitingState(boardSeason: number | undefined)` loads `boardPath(boardSeason)`. The rest is unchanged: the rosters, tx and calendar come from the calendar season n.
- `versions[boardPath(boardSeason)]` holds the board version. A missing board still uses `emptyRecruiting(boardSeason)`.

- [ ] **Step 1: Write the failing page tests.** The URL is `?class=79|80`. The default is the current class (79 in S79) when its board exists; otherwise it's 80.
  - A picker shows "S79 class (plays S79)" and "S80 class". Choosing one changes `?class=`.
  - **The S79 class:** it shows the Board tab only; the Class tab is hidden, because that class was created last season. A commit posts a batch with `leagues/fbajc/S78/recruiting.json` and `leagues/fbajc/S79/rosters.json`.
  - **The S80 class:** it shows the Class and Board tabs as today. A commit posts `S79/recruiting.json` and the tx doc, with no rosters.
  - The heading is "FBAJC recruiting · Class of S{classOf}".
- [ ] **Step 2: Run to verify failure:** `npx vitest run app/college 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- [ ] **Step 3: Implement.** The page reads `class` from the search params, maps it to `boardSeason = classOf − 1`, and passes that to the hook. `useAutosaveDoc` uses `boardPath(boardSeason)`. The setup panel logic is unchanged: it shows while the S{n} college rosters don't exist.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: recruiting page picks the class (this season's or next)`.

---

### Task 5: `--fix-names` (§3)

**Files:** create `web/importers/sheets/playersTab.ts` (+test) and `web/importers/fixNames.ts` (+test); modify `web/importers/run.ts`.

**Interfaces:**

```ts
// playersTab.ts
export interface SheetPlayer { name: string; born: number | null }   // "Born-S61" → 61, "Born-FFL S1(-53)" → null
export function parsePlayersTab(rows: string[][]): SheetPlayer[];        // column A = name, column B = "Born-…"; blank A skipped
export const sameName = (a: string, b: string) => norm(a) === norm(b);   // norm: trim, ’ → ', lower case
export function editDistance(a: string, b: string): number;              // Levenshtein on norm()
/** Sheet names within edit distance 2 of `name` (none when `name` is in the sheet). */
export function closeMatches(name: string, sheet: SheetPlayer[]): SheetPlayer[];
// fixNames.ts
export interface NameFix { playerId: string; from: string; to: string }
export function planNameFixes(players: PlayersFile, sheet: SheetPlayer[], report: Report): NameFix[];
export function applyNameFixes(players: PlayersFile, fixes: NameFix[], skip: string[]): PlayersFile;
```

- [ ] **Step 1: Write the failing tests.**
  - `parsePlayersTab` on `[['Kellan Ogbu','Born-S59','Houston-S77-pres.'],['','',''],['Saun Payton','Born-FFL S1(-53)']]` gives 2 players, born 59 and null.
  - `closeMatches('Kellen Ogbu', sheet)` returns Kellan.
  - `closeMatches("Jamari O'Neal", [{name:'Jamari O’Neal'}])` returns `[]`, because the apostrophe difference doesn't count.
  - `planNameFixes`:
    - one close match gives a fix and a `report.info('fix-names', "Kellen Ogbu → Kellan Ogbu")`;
    - no match, or two matches, gives no fix and a `report.warn`;
    - an unnamed player (name null) is ignored.
  - `applyNameFixes` renames only the listed ids, skips any `from` in `skip`, and returns a new object.
- [ ] **Step 2: Run to verify failure:** `npx vitest run importers 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- [ ] **Step 3: Implement,** then add the mode to `run.ts`:

```ts
async function fixNames(): Promise<void> {
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Players']);
  const players = readJson<PlayersFile>('players.json');
  const fixes = planNameFixes(players, parsePlayersTab(tabs['Players']), report);
  writeFileSync(path.join(WEB, 'importers', 'fix-names-report.md'), report.toMarkdown('Name check report'));
  if (!process.argv.includes('--apply')) {
    console.log(`${fixes.length} renames proposed (nothing written). See web/importers/fix-names-report.md, then re-run with --apply.`);
    return;
  }
  const skip = process.argv.flatMap((a, i, all) => (a === '--skip' && all[i + 1] ? [all[i + 1]] : []));
  const next = applyNameFixes(players, fixes, skip);
  const r = schemaForPath('players.json')!.safeParse(next);
  if (!r.success) { console.error('players.json would not validate; nothing written'); process.exit(1); }
  writeFileSync(path.join(DATA, 'players.json'), JSON.stringify(next, null, 2) + '\n');
  console.log(`Renamed ${fixes.filter(f => !skip.includes(f.from)).length} players.`);
}
```

  In `main()`, add `if (process.argv.includes('--fix-names')) return fixNames();`. **Do not run it.**
- [ ] **Step 4: Run the tests, tsc and the full suite.** `git status` must show no report or cache files.
- [ ] **Step 5: Commit** `feat: name check against the Players tab (npm run import -- --fix-names)`.

---

### Task 6: `--recruiting-class` (§4)

**Files:** create `web/importers/sheets/recruitingClass.ts` (+test) and `web/importers/recruitingClassImport.ts` (+test); modify `web/importers/run.ts`.

**Interfaces:**

```ts
// recruitingClass.ts: one row of a class section
export interface ClassRow { rank: number; stars: 3 | 4 | 5; position: Position; name: string; r: number; school: string; consensus: number }
/** The rows under the header row whose column A is `S${classOf}` (up to the next blank row). Throws if there is no such header. */
export function parseClassSection(rows: string[][], classOf: number): ClassRow[];
export type SchoolCell = { kind: 'committed'; school: string } | { kind: 'projections'; count: number; codes: string[] };
export function parseSchoolCell(cell: string): SchoolCell;   // "3 PROJ - UK, ARIZ, GU", "0 PROJ - none", "Gonzaga"
// recruitingClassImport.ts
export interface ClassImportInput {
  rows: ClassRow[]; classOf: number; players: PlayersFile; teams: TeamsFile;
  rosters: RostersFile; tx: TransactionsFile; calendar: CalendarFile; sheet: SheetPlayer[];
}
export function buildClassImport(input: ClassImportInput, report: Report, ctx: MoveContext): { path: string; doc: unknown }[];
```

The tab layout was confirmed on 2026-09-29. Row 0 is the header. Each class starts with a row whose column A is `S<digits>`, and its data rows are `rank | 5* | POS | Name | R | School | Consensus`. The user renamed the latest header to `S79`.

- [ ] **Step 1: Write the failing tests.**
  - **`parseClassSection`** on a fixture with an `S78` section, a blank row, and an `S79` section of 3 rows: it returns the 3 S79 rows with numbers parsed ("5*" → 5, "98.8" → 98.8). A missing `S80` throws `No S80 section in the FBA JC Recruiting tab`.
  - **`parseSchoolCell`:**
    - "3 PROJ - UK, ARIZ, GU" → `{ kind: 'projections', count: 3, codes: ['UK','ARIZ','GU'] }`;
    - "0 PROJ - none" → count 0, no codes;
    - "Gonzaga" → committed.
  - **`buildClassImport`** with 3 rows (one "2 PROJ - UM", one "Gonzaga", one "0 PROJ - none"). The fixture has a GU roster with a hole at the recruit's position, and UM, GU and WICH teams.
    - Writes: `players.json` (3 new players, `birthSeason` 61), `leagues/fbajc/S78/recruiting.json` (`season` 78, `classOf` 79, `created` true), `leagues/fbajc/S78/classRanking.json` (`college-class`, locked, `order` = rank order, `ratings` = R, `consensus`, `curve` = R high to low, `consensusCurve` = consensus high to low), `leagues/fbajc/S79/rosters.json` (the Gonzaga commit placed), and `leagues/fbajc/S79/transactions.json`.
    - Projections: UM → `{ UM: 2 }`. "3 PROJ - UK, ARIZ" → each 1, plus a `report.warn` about the count.
    - An unknown code → `report.error`.
    - Stars that disagree with the consensus cutoffs → `report.warn`.
    - A name not in `sheet` → `report.warn`; a sheet born season ≠ 61 → `report.warn`.
    - Every written doc passes `schemaForPath`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `buildClassImport`.
  - It builds a `RecruitingState` (`season` 79, the new board) and calls the engine's `commit()` for each committed row. That's how the D12/X rules and the tx lines stay the same as in the app.
  - Schools are resolved by `abbr`, then by `name`.
- [ ] **Step 4: Add the mode to `run.ts`.**
  - It downloads the FBAJC history sheet (`1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84`, tab `FBA JC Recruiting`) and the main sheet's `Players` tab.
  - It needs `meta.rosterSeason.fbajc === 79` and `leagues/fbajc/S79/rosters.json` present; otherwise it prints `Set up the S79 college rosters on the Recruiting page first`.
  - It refuses if `S78/recruiting.json` exists, unless `--force` is given.
  - It writes `importers/recruiting-class-report.md`, and the docs only with no errors.
  - The class and season are read from `meta.currentSeason`, so it imports class S{n}. **Do not run it.**
- [ ] **Step 5: Run the tests, tsc and the full suite, and check `git status` is clean.** Commit `feat: import this season's class from the FBA JC Recruiting tab (npm run import -- --recruiting-class)`.

---

### Task 7: Transfer portal engine (§5)

**Files:** create `web/engine/college/portal.ts`, `web/engine/college/portal.test.ts`.

**Interfaces:**

```ts
/** Open from when make-s{n}-schedules is done until the fbajc step is done; otherwise the reason it's closed. */
export function portalProblem(calendar: CalendarFile): string | null;
export interface PortalCandidate { playerId: string; teamId: string; position: Position; classYear: ClassYear; rating: number | null }
/** Named So/Jr/Sr on the rosters, not on the board (recruit or portal). Sorted by school, then position. */
export function portalCandidates(state: RecruitingState): PortalCandidate[];
/** The board's portal, highest rating first (null ratings last), ties by name. */
export function portalByRating(state: RecruitingState): PortalPlayer[];
export function enterPortal(state: RecruitingState, playerIds: string[], ctx: MoveContext): RecruitingResult;
export function takeOutOfPortal(state: RecruitingState, playerId: string, ctx: MoveContext): RecruitingResult;
```

- [ ] **Step 1: Write the failing tests.** The fixture is S79 with a board of `classOf` 79.
  - **`portalProblem`:**
    - before `make-s79-schedules` is done: `The S79 transfer portal opens when the offseason ends (after Make S79 Schedules)`;
    - after `fbajc` is done: `The S79 transfer portal is closed`;
    - in between: null.
  - **`portalCandidates`:** it skips Freshmen, X players, recruits and players already in the portal.
  - **`enterPortal`:**
    - The 2 ids' spots become `collegeHole` entries.
    - 2 `PortalPlayer`s are added, with `fromTeam`, `classYear`, `rating`, `stars ?? null`, `consensus` left out, `projections: {}` and `committedTo: null`.
    - There is one `'portal'` tx entry per player: `Name (Jr PG, 84) enters the transfer portal from Duke`.
    - `changed` is `['recruiting', 'rosters', 'tx']`, and the label is `2 players enter the transfer portal`.
    - It refuses when the portal is closed (the `portalProblem` text), for a non-candidate (`<Name> can't enter the portal`), for an empty list (`Pick at least one player`), and for a next-class board (`The portal belongs to the S79 class board`).
  - **`takeOutOfPortal`:**
    - An uncommitted player whose old spot is still a hole goes back to it and is removed from the portal, with tx `Name leaves the transfer portal and stays at Duke`.
    - It refuses when the player is committed (`Decommit <Name> first`) or when the spot is filled (`<Name>'s spot at Duke has been filled`).
  - **`portalByRating`** orders 84, 80, null.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement,** in the style of `recruiting.ts`: use `withTeam`, `collegeHole`, `appendTx`, `collegeName` and `schoolName`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: transfer portal engine (open window, enter, take out)`.

---

### Task 8: Portal page and banner

**Files:** create `web/app/college/PortalPage.tsx` (+test) and `web/app/components/PortalBanner.tsx`; modify `web/app/shell/Layout.tsx` (route `/league/fbajc/portal`), `web/app/pages/Home.tsx` and `web/app/pages/CalendarPage.tsx` (render `<PortalBanner />`).

**Interfaces:**
- The page uses `useRecruitingState(currentClassBoardSeason(n))`.
- `PortalBanner` loads `calendar.json` and the S{n} class board. It renders nothing unless `portalProblem(calendar) === null`, in which case it renders a `<p className="banner">`: `The S{n} transfer portal is open · {k} {k === 1 ? 'player' : 'players'} in it` plus a link, "Open the portal ▸".

- [ ] **Step 1: Write the failing tests.**
  - With the portal open, the page lists the candidates in a table: name, school, class, position, rating, and a checkbox.
    - A name search and school, conference and position filters narrow the table.
    - Ticking 2 and clicking "Put 2 players in the portal" posts one batch with the board, the rosters and the tx.
  - "In the portal" lists by rating, with "from <School>", `formatShares` and the commitment. "Take out" posts a batch.
  - With the portal closed, the reason shows and the controls are disabled.
  - The Home page shows the banner text when the portal is open, and hides it when it's closed.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Add `.banner` styles to `app/pages/pages.css`: a bordered, padded callout that uses the existing tokens.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: transfer portal page and open-portal banner`.

---

### Task 9: Rank Class engine (§6a)

**Files:** create `web/engine/college/classRanking.ts`, `web/engine/college/classRanking.test.ts`; modify `web/engine/college/recruiting.ts`, `web/engine/college/state.ts` and `web/app/college/useRecruitingState.ts` (class edits once ranked).

**Interfaces:**

```ts
export const classRankingPath = (boardSeason: number) => `leagues/fbajc/S${boardSeason}/classRanking.json`;
export const starsFor = (consensus: number): 3 | 4 | 5 | null => (consensus >= 90 ? 5 : consensus >= 80 ? 4 : consensus >= 70 ? 3 : null);
export function consensusSuggestion(doc: RankingFile, k: number): number | null;   // consensusCurve[k-1]
/** Sets or clears (null) a consensus, 70–100, rounded to 2 decimals. Anything else, or a locked doc, returns the same object. */
export function setConsensus(doc: RankingFile, playerId: string, value: number | null): RankingFile;
/** Fills missing R and consensus from the suggestions (never overwrites). */
export function applyClassSuggestions(doc: RankingFile): RankingFile;
export interface ClassRankState { board: RecruitingFile; ranking: RankingFile | null; prevRanking: RankingFile | null; players: PlayersFile; calendar: CalendarFile; tx: TransactionsFile; season: number }
export function startClassRanking(state: ClassRankState): WritesResult;   // writes classRankingPath(board.season)
export function classBlockers(state: ClassRankState): string[];
export function finishClassRanking(state: ClassRankState, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests.**
  - **`starsFor`:** 90 → 5, 89.99 → 4, 80 → 4, 79.9 → 3, 69.9 → null.
  - **`startClassRanking`:**
    - It builds one row per recruit (`team` = `committedTo`, `prevRating` null, `otherRating` null, `stat` null).
    - `curve` and `consensusCurve` come from the locked `prevRanking` (its `ratings` and `consensus` values sorted high to low). With no previous ranking, both are `[]`.
    - It refuses a second start, an empty class, and a board whose class isn't created.
  - **`classBlockers`:** the `rankingBlockers` output, plus:
    - `N players still need a consensus`;
    - `#4 Name (95.1) has a higher consensus than #3 Name (94.0)`, checked like `outOfOrderPairs` but on consensus, with ties allowed;
    - `The class has 11 5★ recruits; it needs 12–13`;
    - `The class has 2 3★ recruits; it needs 3–5`;
    - with fewer than 15 recruits, `The star mix needs at least 15 recruits`.
  - **`finishClassRanking`:**
    - It is gated by `calendarProblem(calendar, 'rank-s{classOf}-class', 'The class is ranked')`.
    - It writes the ranking (locked), the board (each recruit's `rating`, `consensus` and `stars`), the tx (`'class'`: `S80 class ranked: 30 recruits`) and `calendar.json` (step done).
  - **Class edits once ranked:** `removeRecruit` refuses with `The class is being ranked; recruits can't be removed`, and adding draft rows is a no-op. `editRecruit` still allows a name change.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Paths:
  - the ranking at `classRankingPath(board.season)`;
  - the board at `boardPath(board.season)`;
  - the tx at `leagues/fbajc/S${season}/transactions.json`.

  `removeRecruit` needs to know whether a ranking exists, so add an optional `ranked?: boolean` to `RecruitingState`. The recruiting hook sets it when `classRankingPath(boardSeason)` exists.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Rank Class engine (R + consensus, stars from consensus, S73 mix)`.

---

### Task 10: Rank Class page and the RankingTable consensus column

**Files:** create `web/app/college/ClassRankingPage.tsx` (+test); modify `web/app/rank/RankingTable.tsx` (+test), `web/app/stepRoutes.ts` (+test) and `web/app/shell/Layout.tsx`.

**Interfaces:**
- `RankingTableProps` gains an optional `consensus?: { onSet: (id: string, v: number | null) => void }`. When it's given, a Consensus input is shown next to Rating. It uses a decimal text input, and blur saves via `parseConsensusInput`, which accepts blank, or 70–100 with up to 2 decimals.
- It also shows the stars from `starsFor`, and a "suggested 98.8" chip. "Use all suggestions" calls `applyClassSuggestions` when consensus is on.
- Route `/league/fbajc/class-ranking`. `toolTarget` maps `/^rank-s\d+-class$/` to it.

- [ ] **Step 1: Write the failing tests.**
  - **The page:** it loads the next class's board (`nextClassBoardSeason(n)`), `classRankingPath`, and the previous ranking at `classRankingPath(n − 1)`.
    - With no ranking yet it shows "Start ranking", which posts one write.
    - With a ranking, the table shows the Consensus column and the stars.
    - Blockers show, and Finish posts one batch with 4 paths. Off-step, Finish is refused with the `calendarProblem` text.
  - **`RankingTable`:** existing tests keep passing, since there's no consensus column without the prop.
  - **`stepRoutes`:** a test case for the new route.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Model it on `app/pages/D2RatingsPage.tsx`, with `useAutosaveDoc` on the ranking doc. The `<h1>` is `Rank S{classOf} Class`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Rank Class page (consensus column, stars, suggestions from last class)`.

---

### Task 11: Adjust College Ratings (§6b)

**Files:** create `web/engine/college/collegeRatings.ts` (+test) and `web/app/college/CollegeRatingsPage.tsx` (+test); modify `web/app/stepRoutes.ts` (`TOOL_STEPS['adjust-college-ratings'] = '/league/fbajc/ratings'`, +test) and `web/app/shell/Layout.tsx`.

**Interfaces:**

```ts
export const collegeRatingsPath = (season: number) => `leagues/fbajc/S${season}/ratings.json`;
export const COLLEGE_RATINGS_STEP = 'adjust-college-ratings';
export interface CollegeRatingsState { season: number; board: RecruitingFile /* S{n} class */; rosters: RostersFile; prevRosters: RostersFile | null;
  players: PlayersFile; ratings: RankingFile | null; prevRatings: RankingFile | null; calendar: CalendarFile; tx: TransactionsFile }
export function collegeRatingRows(state: CollegeRatingsState): RankingRow[];
export function startCollegeRatings(state: CollegeRatingsState): WritesResult;
export function collegeRatingsBlockers(state: CollegeRatingsState): string[];
export function finishCollegeRatings(state: CollegeRatingsState, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests.**
  - **Rows:** named roster players not in `board.recruits`, plus every `board.portal` player.
    - `team` is the school, or `null` for an uncommitted portal player (the page shows "Portal (from X)").
    - `prevRating` is the current rating.
    - `stat` is `S78: 738 pts`, from `prevRosters` points, or null.
    - X players and S{n} recruits are excluded.
  - **Curve:** the same as `d2Curve`, reused from `engine/d2/ratings.ts`.
  - **Finish:**
    - It is gated by `calendarProblem(calendar, COLLEGE_RATINGS_STEP, 'College ratings are adjusted')`.
    - It writes the locked ranking, the rosters (new ratings on the named entries) and the board (portal ratings).
    - The tx is `'college-ratings'`: `College ratings reset: N players ranked, K took the suggestion`. It also marks the step done.
    - A player who moved after the start (entered the portal, or committed elsewhere) still gets their rating, because it's matched by id.
  - **Membership blockers,** like `membershipBlockers`: `<Name> isn't in the ratings list` for a new eligible player.
  - **The page:** it uses `RankingTable` without consensus, with `teamLabel` giving the school name or "Portal". Finish posts one batch.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement,** modelled on `engine/d2/ratings.ts` and `app/pages/D2RatingsPage.tsx`. The `<h1>` is `S{n} college ratings reset`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Adjust College Ratings (named returning players and the portal)`.

---

### Task 12: Walk-ons (§7)

**Files:** create `web/engine/college/walkOns.ts`, `web/engine/college/walkOns.test.ts`; modify `web/app/college/BoardTab.tsx` and `web/app/college/BoardTab.test.tsx`.

**Interfaces:**

```ts
/** Team.java: (int)(random*13) + base. */
export const WALK_ON_BASE: Record<string, number> = { B12: 60, ACC: 60, BE: 60, SEC: 60, B10: 60, P12: 60, AAC: 58, A10: 58, MWC: 58 };
export const walkOnBase = (group: string | null) => WALK_ON_BASE[group ?? ''] ?? 55;
export function openSpots(rosters: RostersFile): number;
/** Why walk-ons can't be filled yet, or null. */
export function walkOnProblem(state: RecruitingState): string | null;
export function fillWalkOns(state: RecruitingState, rng: Rng, ctx: MoveContext): RecruitingResult;
```

- [ ] **Step 1: Write the failing tests.**
  - **`walkOnProblem`:**
    - off the `fbajc` step, the `calendarProblem(calendar, 'fbajc', 'Walk-ons are filled')` text;
    - with uncommitted players, the `fbajcGateProblem(board, null)` text;
    - on a next-class board, `Walk-ons fill this season's rosters`;
    - with no holes, `There are no open spots`.
  - **`fillWalkOns`** with `mulberry32(3)`, on a fixture with one B12 hole, one AAC hole and one PAT hole:
    - each gets a new player (`name: null`, `birthSeason: 61`, ids from `nextId`);
    - the entries are `classYear: 'Fr'`, `stars: null`, `points: 0`, `age: null`;
    - the ratings fall in 60–72, 58–70 and 55–67.
    - It's deterministic for the seed.
    - One `'walk-on'` tx reads `3 walk-ons fill open spots`. `changed` is `['rosters', 'players', 'tx']`, and the label is `Fill 3 open spots with walk-ons`.
  - **Rating spread:** over 2,000 fills with `mulberry32(9)`, a B12 hole sees exactly the 13 values 60–72.
  - **BoardTab** on the current-class board: a "Fill 3 open spots with walk-ons" button posts one batch when `walkOnProblem` is null. Otherwise it's disabled, with the problem shown under it. It isn't shown on a next-class board.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** A roster team's conference is `state.teams.teams.find(t => t.teamId === id)?.group`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: walk-ons fill open college spots at the FBAJC step`.

---

## After the tasks (controller)

1. Final Opus review of `main..college-tail`.
2. Text-only browser check on scratch data (CLAUDE.md "Browser checks").
   - **Prep:**
     - `prep.mjs` roster fill.
     - The S79 college setup on the scratch server.
     - A scratch-only run of `buildClassImport` on the downloaded sheet, writing to the scratch data server, never `web/data`.
     - Move the scratch calendar as each check needs.
   - **Walk-through:**
     - pick the S79 and S80 classes;
     - a commit that displaces an X player;
     - portal banner, enter and take out;
     - Create S80 Class (born 62), then Rank S80 Class (suggestions, mix blockers, Finish);
     - Adjust College Ratings;
     - the FBAJC gate with open spots, then walk-ons, then Mark done.
   - **Also check:** 375px width and the console.
3. Update `progress.md`, the §10 roadmap row and the roadmap memory. Stop for the user before merging.
