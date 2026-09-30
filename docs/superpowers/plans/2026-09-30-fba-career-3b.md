# Part 3b FBA Careers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Parse the Players-tab bios into careers, and extend them with app seasons.
- Import resolved award counts, S78 PPG and duplicate-player merges.
- Show Career on player pages, Awards by player, Career leaders and a History Hall of Fame, and prefill HOF nominees from full careers.

**Architecture:**
- **Engine:** `engine/history/career.ts` is pure. It holds `parseBio`, `liveCareer`, `careerLines`, `awardTotals`, `summaryAwardCounts` and `careerStats`.
- **Importer:**
  - `importers/duplicates.ts` (`mergeDuplicates`);
  - `importers/careers.ts` (the tab 11 and txt parsers, `buildCareers`);
  - `importers/historyRun.ts` (pure write planning).
  - `run.ts --history` only does I/O. The user runs it.
- **Pages:** in `app/history/`, plus the offseason HOF page.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3, Vitest 2 (jsdom), ExcelJS.

Spec: `docs/superpowers/specs/2026-09-30-fba-career-3b-design.md`. Its decisions are cited as K1–K10, and its "Bio grammar", "Duplicate players" and "Cross-checks" sections are binding.

## Global Constraints

**Commands and data:**
- Run everything from `web/`. `npx tsc --noEmit` must print nothing.
- Filter test output: `npx vitest run <paths> 2>&1 | grep -E "Test Files|Tests|FAIL"`. Before this part the suite is 1253 tests.
- Never touch `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`. `FBA/FBARosters.txt` has an uncommitted edit by the user: never stage or commit it, so use `git add <your files>` and never `git add -A` or `.`.
- Don't start or stop servers on 5173/5174. Never run the importer.

**Code rules:**
- Vitest globals are off: import `describe/it/expect/vi/afterEach` explicitly. Each jsdom test file calls `cleanup()` in `afterEach`.
- Page tests follow `app/history/HistoryPages.test.tsx` and `PlayersHistory.test.tsx`: a stubbed `fetch` serves docs with ETags.
- New schema fields are optional, so the committed `web/data` keeps passing `data.test.ts`.
- Name matching uses `normName` from `importers/history.ts` (importers) or `normalizeName` from `engine/shared/names.ts` (engine and app).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Award keys** (one shared list in `engine/shared/types.ts`, in this order):

```ts
export const AWARD_KEYS = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'ALL_FBA_1', 'ALL_FBA_2', 'ALL_STAR', 'YOUNG_STAR',
  'ASG_MVP', 'YSG_MVP', 'FINALS_MVP', 'CHAMPION', 'CSHIP_APP', 'CONF_CHAMPION', 'FIVE_POINT', 'DUNK'] as const;
export type AwardKey = typeof AWARD_KEYS[number];
```

## Files

| File | Responsibility |
|---|---|
| `engine/shared/types.ts`, `schemaRegistry.ts` (modify) | `AWARD_KEYS`, `AwardCountsFile`, `legacyPpg`, the path rule |
| `engine/history/career.ts` (create) | Bio parsing, live careers, card lines, award totals, stats |
| `importers/duplicates.ts` (create) | `mergeDuplicates` |
| `importers/careers.ts` (create) | `parseAwardsByPlayer`, `parseLeaguePpg`, `buildCareers` |
| `importers/historyRun.ts` (create), `importers/run.ts` (modify) | Pure write planning; CLI I/O |
| `app/history/PlayerHistoryPage.tsx`, `CareerSection.tsx` (modify/create) | Career on the player page |
| `app/history/AwardsByPlayerPage.tsx`, `LeadersPage.tsx` (create) | New pages |
| `app/history/HallOfFameHistoryPage.tsx` (create), `app/offseason/HallOfFamePage.tsx`, `engine/offseason/hallOfFame.ts`, `app/shell/Layout.tsx`, `Sidebar.tsx`, `app/history/HistoryHome.tsx` (modify) | The Hall, its route and link, and the prefill |

---

### Task 1: Schemas and the registry guard

**Files:** modify `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`, `web/importers/registry.test.ts` (grep for the registry's test file name).

**Produces:**
- `AWARD_KEYS` and `AwardKey` (see Global Constraints).
- The count schema:

```ts
export const AwardCountsFile = z.object({
  league: z.literal('fba'),
  throughSeason: int.min(1),
  counts: z.array(z.object({ playerId: z.string().regex(/^p\d{5}$/), key: z.enum(AWARD_KEYS), count: int.min(1) }).strict()),
}).strict().refine(f => new Set(f.counts.map(c => `${c.playerId}:${c.key}`)).size === f.counts.length, 'Each player and award appear once');
export type AwardCountsFile = z.infer<typeof AwardCountsFile>;
```
- `SummaryFile` gains `legacyPpg: z.array(z.object({ playerId, teamId: z.string().min(1).nullable(), ppg: z.number().min(0) }).strict()).optional()`.
- The registry rule `leagues/fba/awardCounts.json` maps to `AwardCountsFile`.

- [ ] **Step 1: Write the failing tests.**
  - `AwardCountsFile` accepts a valid doc, and rejects a duplicate `(playerId, key)`, `count: 0` and an unknown key.
  - `SummaryFile` accepts `legacyPpg`.
  - `schemaForPath('leagues/fba/awardCounts.json')` is `AwardCountsFile`.
  - **Registry (K10):** adding `Jamari O’Neal` when `Jamari O'Neal` (same birth season or null) exists returns the existing id. This should already pass; keep it as a guard.
- [ ] **Step 2: Run to verify the new schema tests fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc, `data.test.ts` and the full suite.**
- [ ] **Step 5: Commit** `feat: award counts and legacy PPG schemas`.

---

### Task 2: `parseBio`

**Files:** create `web/engine/history/career.ts` and `web/engine/history/career.test.ts`.

**Produces:**

```ts
export type StintKind = 'college' | 'fba' | 'd2' | 'wc';
export interface Honour { label: string; count: number; seasons: number[] }   // "6x All-Star" → count 6, seasons []; "S75 MIP" → count 1, seasons [75]
export interface Stint { kind: StintKind; team: string; range: string; from: number | null; to: number | 'pres' | null; honours: Honour[] }
export interface Career { stints: Stint[]; hof: string | null; other: string[] }
export function parseBio(bio: { born: string; entries: string[] }): Career
export function bioAwardKey(label: string): AwardKey | null
export function careerAwardSums(career: Career): Partial<Record<AwardKey, number>>   // FBA stints only
```

**Rules:** follow the spec's "Bio grammar" exactly.
- **Stint regex:** `^(.+?)\s*-\s*((?:S\d+|FFL|pres\.)(?:\s*-\s*(?:S\d+|FFL|pres\.))?(?:\s*;\s*(?:S\d+|FFL)(?:\s*-\s*(?:S\d+|FFL|pres\.))?)*)$`.
  - `range` is group 2 as written.
  - `from` is the first `S<n>` number, or null for FFL.
  - `to` is the last `S<n>` number, `'pres'` for `pres.`, or null for FFL.
- **Kind:**
  - `WC(` is `wc`;
  - `D2(` is `d2`;
  - a team whose `/`-separated parts each match `^(\?|[A-Z][A-Za-z0-9.]{0,4})$` is `fba`;
  - anything else is `college`.
- **Other entries:**
  - `^(\d+)x (.+)$` is a count.
  - `^S(\d+) (.+)$` is a single-season entry. An equal label in the same stint merges: the count is summed and the seasons appended.
  - `^HOF-(S\d+|FFL)$` sets `hof`, e.g. `'S77'`.
  - Anything else, or an honour before the first stint, goes to `other`.
- **`bioAwardKey`:** case-insensitive, trimmed, using the spec's award-key table. `EC Champion` and `WC Champion` are `CONF_CHAMPION`. Anything else is null.
- **`careerAwardSums`:** sums the honour counts across `fba` stints by `bioAwardKey`.

- [ ] **Step 1: Write the failing tests** with these real rows:
  - **Akeem Naylor:**
    - `born: 'Born-S45'`
    - entries: `['Wake Forest-S63','S63 FOY','1x All-American','1x POY','1x JP Award','1x AAC POY','1x AAC RS Champion','1x AAC TOUR Champion','CIN-S64-S69','6x All-Star','2x Young-Star','3x All-FBA T1','1x MVP','1x LP Award','2x ASG MVP','MON-S70-S73','4x All-FBA T1','4x All-Star','3x LP Award','1x FBA C-Ship app.','1x FBA Champion','1x FBA C-Ship MVP','1x ASG MVP','OAK-S74-S77','4x All-Star','1x LP Award','2x All-FBA T1','2x WC Champion','2x FBA C-Ship app.','1x FBA Champion','1x All-FBA T2','HOF-S77']`
    - Expect 1 college and 3 fba stints, and `hof` `'S77'`.
    - Sums: ALL_STAR 14, ALL_FBA_1 9, LP 5, ASG_MVP 3, CHAMPION 2, FINALS_MVP 1, CONF_CHAMPION 2, MVP 1.
  - **Payton Atkinson:**
    - `born: 'Born-S46'`
    - entries: `['Alabama-S64','1x NC app.','1x All-American','1x DH Award','1x SEC RS Champion','1x SEC TOUR Champion','FLO-S65-S76','12x All-Star','2x Young-Star','6x FBA C-Ship app.','2x FBA Champion','4x WC Champion','1x MC Award','1x All-FBA T1','5x All-FBA T2','NO-S77-S78','2x All-Star','HOF-S78']`
  - **Julien Shannon:** entries `['New Mexico State-S66','1x PAT POY','Creighton-S67','1x BE POY','CP-S68-pres.','2x Young-Star','10x All-Star','2x MVP']`. The CP stint has `to: 'pres'`.
  - **Cameron Lučić:** `['North Carolina-S69','DET-S70-pres.','7x All-Star','S75 MIP']`. MIP gets count 1 and seasons `[75]`.
  - **Edge cases:**
    - `SOX - FFL-FFL`: fba, with `from` and `to` null.
    - `WC(Germany)-S56-S58;S62`: wc, from 56, to 62.
    - `D2(Milan)-S53-S56`: d2.
    - `FP/MON-S6-S25`: fba.
    - `?-S19-S34`: fba.
    - `Some note`: other.
    - `2x All-Star` before any stint: other.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: parse Players-tab bios into careers`.

---

### Task 3: Live careers, card lines, award totals and stats

**Files:** modify `web/engine/history/career.ts` and `web/engine/history/career.test.ts`.

**Interfaces:**
- **Consumes:** Task 2; `SummaryFile` and `HallOfFameFile`; the 3a helpers in `engine/history/views.ts` and `honours.ts` (grep for how 3a reads `allStar`, `allFba` and `champions`).
- **Produces:**

```ts
export function summaryAwardCounts(summaries: SummaryFile[], from: number, to: number): Map<string, Partial<Record<AwardKey, number>>>
export function liveCareer(bio: { born: string; entries: string[] } | null, playerId: string, summaries: SummaryFile[], hof: HallOfFameFile | null): Career
export function careerLines(career: Career): string[]
export function awardTotals(playerId: string, baseline: AwardCountsFile | null, summaries: SummaryFile[]): Record<AwardKey, number>
export interface StatRow { season: number; teamId: string | null; gp: number | null; pts: number | null; ppg: number; po: { gp: number; pts: number; ppg: number } | null }
export function careerStats(playerId: string, summaries: SummaryFile[]): { rows: StatRow[]; total: { gp: number; pts: number; ppg: number } }
```

**Rules:**
- **`summaryAwardCounts`** counts, for FBA summaries with `from ≤ season ≤ to`:
  - `awards[]` (the award id maps to MVP/ROTY/PPK/LP/MC/DPOY/MIP);
  - `allFba` team1 and team2, as ALL_FBA_1 and ALL_FBA_2;
  - `allStar.allStars` and `youngStars`, as ALL_STAR and YOUNG_STAR;
  - `allStar.asgMvp`, `ysgMvp`, `fivePoint` and `dunk`;
  - the FBA Champion entry's `finalsMvp`;
  - CHAMPION, CSHIP_APP and CONF_CHAMPION, only for seasons with `players[]` lines:
    - CHAMPION: a line whose `teamId` is the champion's `teamId`;
    - CSHIP_APP: a line with the champion's or runner-up's `teamId`;
    - CONF_CHAMPION: a line with the team that won the `E-CF` or `W-CF` series in `bracket`.
- **`liveCareer`:** follow the spec's rules.
  - A new or extended app stint gets its `range` rebuilt as `S<from>` or `S<from>-S<to>`.
  - When a bio `pres` stint is closed, its `to` becomes 78 and its range `S<from>-S78`.
  - App honours use these labels:
    - `MVP`, `ROTY`, `PPK Award`, `LP Award`, `MC Award`, `DPOY` and `MIP`. ROTY and MIP are single-season entries; the others are counts.
    - `All-FBA T1`, `All-FBA T2`, `All-Star`, `Young-Star`, `ASG MVP`, `YSG MVP`, `FBA C-Ship MVP`, `FBA Champion` and `FBA C-Ship app.`.
    - `EC Champion` or `WC Champion`, by conference.
  - `hof` is the bio's, or else `hof.classes.find(c => c.inductees.some(i => i.playerId === playerId))?.season ?? null`.
- **`careerLines`:** follow the spec. An open (`pres`) stint prints as `S<from>-S<last season>`, where the last season is the latest app season with a line for that stint, or 78.
- **`awardTotals`:** a record with every key, starting at 0. It adds the baseline counts for `playerId`, plus `summaryAwardCounts(summaries, (baseline?.throughSeason ?? 0) + 1, 9999)`.
- **`careerStats`:**
  - The S78 `legacyPpg` row gets `gp` and `pts` null and `po` null.
  - Then one row per S79+ line (skipping total lines, where `teamId` is null and `stint` is null), sorted by season and then stint. `gp = rs.g` and `ppg = round1(pts / gp)`; `po` is derived the same way.
  - `total` sums the S79+ rows.

- [ ] **Step 1: Write the failing tests:**
  - **`summaryAwardCounts`** on a hand-built S79 app summary: the awards, All-FBA, `allStars`, `asgMvp`, `finalsMvp`, champion, finalists and a conference winner are each counted once.
  - **`liveCareer`:**
    - The Shannon bio with S79 CP lines extends CP to 79.
    - With S79 lines on BOS, CP closes at S78 (`S68-S78`) and BOS opens with `S79`.
    - A player with no bio has only app stints.
    - An S79 All-Star selection on CP turns `10x All-Star` into `11x`.
    - `hof` comes from the Hall doc when the bio has none.
  - **`careerLines(parseBio(atkinson))`** equals exactly `['Alabama: S64','FLO: S65-S76','NO: S77-S78','14x All-Star','2x Young-Star','6x FBA C-Ship app.','2x FBA Champion','4x Conference Champion','1x MC Award','1x All-FBA T1','5x All-FBA T2']`.
  - **`careerLines`** for Shannon with no app lines prints `CP: S68-S78`.
  - **`awardTotals`** adds baseline MVP 2 and an S79 MVP to give 3. A null baseline counts every season.
  - **`careerStats`:** the S78 PPG row, then two S79 stints and the total.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: live careers, HOF card lines, award totals and career stats`.

---

### Task 4: `mergeDuplicates` (K9)

**Files:** create `web/importers/duplicates.ts` and `web/importers/duplicates.test.ts`.

**Produces:**

```ts
export function mergeDuplicates(docs: Map<string, unknown> /* rel path → parsed JSON, including players.json */, bios: BioRow[], report: Report): Map<string, unknown> /* only the changed docs */
```

**Rules:** follow the spec's "Duplicate players" section.
- `BioRow` is from `importers/sheets/history.ts`. The bio's born season is `parsePlayersTab([[name, born]])[0].born`, from the same helper `buildHistory` uses.
- **References:** walk each doc recursively. Replace string values and object keys that exactly equal a dropped id. Count the replacements per file.
- **Validation:**
  - Each changed doc is validated with `schemaForPath(rel)`. A doc with no rule is left unvalidated.
  - Any failure is `report.error('duplicates', '<rel>: <first issue>')`, and the function then returns an empty map.
- **Report:** `report.info('duplicates', 'Merged <name>: <dropped> → <kept> (<n> references in <m> files)')`.

- [ ] **Step 1: Write the failing tests** on in-memory docs:
  - **Nadeem Akers:** `players.json` has p00040 (born 50) and p00150 (born 56), and a bio says `Born-S50`. p00040 is kept, the S78 roster's p00150 becomes p00040, and p00150 is gone.
  - **Jamari O’Neal:** p00609 has `Jamari O'Neal` and born null; p01913 has `Jamari O’Neal` and born 57; the bio row is `Jamari O’Neal`, `Born-S57`. p01913 is kept with the name `Jamari O’Neal`, and a reference in a free-agents doc and one in an FBAJC roster are rewritten.
  - A player id used as an object key is rewritten.
  - Two bio rows with one name: nothing is merged.
  - Both ids on one roster: the schema fails, an error is reported, and an empty map is returned.
  - A second run over the merged docs returns an empty map.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: merge duplicate player records on the history import`.

---

### Task 5: Award counts, S78 PPG and cross-checks

**Files:** create `web/importers/careers.ts` and `web/importers/careers.test.ts`.

**Interfaces:**
- **Consumes:** `parseBio`, `careerAwardSums` and `summaryAwardCounts` (Tasks 2–3); the 3a name resolution in `importers/history.ts`.
  - If `resolve` is internal there, export a small `nameResolver(players: PlayersFile, report: Report): (name: string, where: string) => string | null` from `importers/history.ts`, with the same warnings, and use it in both files.
- **Produces:**

```ts
export interface AwardsByPlayerRow { key: AwardKey; name: string; count: number }
export function parseAwardsByPlayer(rows: string[][]): AwardsByPlayerRow[]
export interface PpgRow { name: string; teamId: string; ppg: number }
export function parseLeaguePpg(text: string): PpgRow[]
export function buildCareers(input: { players: PlayersFile; bios: PlayerBiosFile; summaries: SummaryFile[]; tab11: AwardsByPlayerRow[]; ppg: PpgRow[] }, report: Report):
  { awardCounts: AwardCountsFile; s78: SummaryFile | null }
```

**Rules:**
- **`parseAwardsByPlayer`:**
  - Row 0 holds headers at even columns, `<Award>(S<n>)`: `MVP`→MVP, `ASG`→ALL_STAR, `ASG MVP`→ASG_MVP, `All-FBA T1`→ALL_FBA_1, `All-FBA T2`→ALL_FBA_2, `PPK Award`→PPK, `LP Award`→LP, `MC Award`→MC, `DPOY`→DPOY.
  - An unknown header throws `Awards by player tab: unknown column "<text>"`.
  - The data rows are the name at column 2k and the count (`Math.round(Number(x))`) at 2k+1. Empty names are skipped.
- **`parseLeaguePpg`:** lines matching `^\d+\.\s+(.+)\((\d+)\)\(([^)]+)\):\s*([\d.]+)$`. Other lines are ignored.
- **`buildCareers`** follows the spec's Data and Cross-checks sections.
  - `throughSeason` is 78, and `summaries` are the post-history S1–S78 summaries.
  - **Per player with a bio:**
    - `careerAwardSums(parseBio(bio))` gives every key except FIVE_POINT and DUNK, which come from the summaries.
    - Cross-check the bio against tab 11 (its nine keys) and against `summaryAwardCounts(summaries, 1, 78)` (the spec's list), using the spec's severity rules. Messages: `<name> <KEY>: bio <a>, tab 11 <b>` and `<name> <KEY>: bio <a>, summaries <b>`.
  - **Per player without a bio:** tab 11 for its keys, and the summaries for the rest.
  - **Report lines:**
    - unmatched tab 11 names are `report.warn('careers', 'Unmatched: <name> (tab 11 <KEY>)')`;
    - the distinct bio `other` texts are `report.info('careers', 'Unparsed bio entry: <text>')`;
    - a closing `report.info('careers', '<i> info, <w> warnings')`.
  - `counts` has only counts of 1 or more, sorted by playerId and then by `AWARD_KEYS` order.
  - **`s78`:** a copy of the S78 summary with `legacyPpg` set from the resolved rows, in file order. Unmatched names are warned and skipped. It is null when there's no S78 summary.

- [ ] **Step 1: Write the failing tests:**
  - **The tab 11 parser** on a 3-row fixture copied from the real tab: print it with `node .superpowers/sdd/history/dump.cjs .superpowers/sdd/history/main 11 1 3 18` from the repo root. An unknown header throws.
  - **The PPG parser:** `1. Harper Holland(98)(OAK): 43.4` and `149. Koa'e Keano(66)(BOS): 3.4`; the header line is ignored.
  - **With a bio:** a bio says 6x All-Star and tab 11 ASG says 6, which gives no line. A bio says MVP 1 and tab 11 says 3, which gives a warning, and the count stays 1.
  - **Severity:** a difference of 1 is info; 0 against 1 is a warning.
  - **Without a bio:** tab 11 gives MVP 2, and ROTY comes from the summaries.
  - **The result:** `legacyPpg` is written onto S78, and the output passes `AwardCountsFile`.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: resolved award counts, S78 PPG and career cross-checks`.

---

### Task 6: `--history` wiring

**Files:** create `web/importers/historyRun.ts` and `web/importers/historyRun.test.ts`; modify `web/importers/run.ts`.

**Produces:**

```ts
export interface HistorySources { docs: Map<string, unknown>; tabs: Record<string, string[][]>; standingTabs: Record<string, string[][]>; ppgText: string;
  brackets: { season: number; rounds: number; series: PastSeries[] }[] }
export function planHistoryImport(src: HistorySources, report: Report): [string, unknown][]   // the files to write; [] when report.hasErrors
```

**Order:**
1. `mergeDuplicates(docs, parseBios(tabs.Players), report)`, then overlay the changed docs onto `docs`.
2. `buildHistory(...)` with the same inputs `run.ts` builds today, with players and existing summaries read from the merged `docs`. Move that input assembly here from `run.ts`.
3. `buildCareers(...)`: the tab 11 tab name is `FBA Awards won by Player`, and `ppgText` is the contents of `FBA/League-Points-Stats.txt`.
4. The players.json schema check, as `run.ts` does today.
5. **The writes:**
   - the merged docs;
   - `players.json`, `leagues/fba/playerBios.json` and the summaries (S78 taken from `buildCareers`'s `s78` when it's set);
   - `leagues/fba/awardCounts.json`.
   - A later write of the same path replaces an earlier one.
   - When there are errors, return `[]`.

**`run.ts` changes:**
- `importHistory` reads every `*.json` under `<dir>`, skipping `.backups` and `.journal`, into `docs`.
- It adds `FBA Awards won by Player` to the main-sheet tabs, and reads `FBA/League-Points-Stats.txt` from the repo root.
- It calls `planHistoryImport`, writes the report, exits 1 on errors, and otherwise writes the returned files.
- It logs the merged, bio and summary counts.

- [ ] **Step 1: Write the failing tests** with small in-memory sources: a Nadeem Akers pair, 2 bios, one Championships row, one Awards row, one tab 11 row and a 2-line PPG text.
  - The plan writes the merged roster doc, `players.json` without p00150, the bios, S78 with `legacyPpg`, and `awardCounts.json`.
  - A forced schema error gives `[]`.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.** Existing `importers/history.test.ts` must still pass.
- [ ] **Step 4: Run the tests, tsc and the full suite.** Don't run the CLI.
- [ ] **Step 5: Commit** `feat: --history merges duplicates and writes award counts and S78 PPG`.

---

### Task 7: Career on the player page

**Files:** create `web/app/history/CareerSection.tsx`; modify `web/app/history/PlayerHistoryPage.tsx` and `web/app/history/PlayersHistory.test.tsx`.

**Consumes:** `liveCareer`, `awardTotals` and `careerStats` (Task 3). It adds `useDoc` reads of `leagues/fba/awardCounts.json` and `leagues/fba/hallOfFame.json`, where a 404 means null, as `playerBios.json` does.

**The page** (spec "Pages"):
- **Career** replaces the raw bio `<ul>`:
  - a `College` line (`Wake Forest (S63) · …`);
  - a table with League (`FBA`, `D2` or `World Cup`), Team, Seasons (range) and Honours (joined `6x All-Star, 1x MVP`; single-season entries as `S75 MIP`);
  - the Other lines as a `<ul className="muted">`;
  - `Hall of Fame: S77`.
- **Awards:** `<ul className="chips">` with `<n>× <label>` for each non-zero key. Use the labels from the Awards-by-player columns in Task 8, and put the label map in `CareerSection.tsx` for Task 8 to import.
- **Seasons:** rows from `careerStats`. The S78 row shows `—` for GP and PTS. The total row reads `Career (since S79)`.
- **No history:** `No history recorded` stays for a player with no bio, honours or lines.

- [ ] **Step 1: Write the failing tests:**
  - The Naylor bio renders 3 FBA rows and `Hall of Fame: S77`.
  - Award chips come from a baseline doc plus an S79 summary.
  - The S78 PPG row shows `—`.
  - The total row is `Career (since S79)`.
  - A missing `awardCounts.json` still renders.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: career stints, award chips and S78 PPG on the player page`.

---

### Task 8: Awards by player and Career leaders

**Files:** create `web/app/history/AwardsByPlayerPage.tsx`, `web/app/history/LeadersPage.tsx` and `web/app/history/CareerPages.test.tsx`; modify `web/app/shell/Layout.tsx`, `web/app/history/HistoryHome.tsx` and `web/app/history/AwardsHistoryPage.tsx` (add a link, `Awards by player`).

**Awards by player** (`/history/fba/awards/players`), per the spec:
- **Rows:** `playerIndex` (3a) players with `awardTotals` having any non-zero key other than CSHIP_APP and CONF_CHAMPION.
- **Columns:** Player, MVP, ROTY, PPK, LP, MC, DPOY, MIP, T1, T2, ASG, YSG, ASG MVP, YSG MVP, Finals MVP, Champion, 5-pt and Dunk. Zero shows as blank.
- **Sorting:** header `<button>`s sort descending, with ties broken by name; MVP is the default.
- **Layout:** the table sits in `<div className="table-scroll">`; add `.table-scroll { overflow-x: auto; }` if no such class exists (grep the CSS first).
- **No baseline:** a null baseline shows `<p className="warning">Award counts before S79 haven't been imported</p>`.

**Career leaders** (`/history/fba/leaders`):
- Three tables, `Points`, `Games` and `Points per game (min 40 games)`, each with Rank, Player and the value.
- The top 25 from `careerStats(id).total` over players with S79+ lines. PPG is shown with 1 decimal.
- With no rows: `No seasons played in the app yet`.

**Skipped seasons:** both pages show the 3a skipped-seasons warning when `errors` is non-empty (reuse the 3a markup).

**Hub:** add the links `Awards by player`, `Career leaders` and `Hall of Fame` (`/history/fba/hall-of-fame`; Task 9 adds the route).

- [ ] **Step 1: Write the failing tests:**
  - The default sort is MVP; clicking `ASG` re-sorts.
  - The baseline-missing warning.
  - The leaders' PPG table leaves out a 30-game player.
  - The hub shows the three links.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: awards by player and career leaders pages`.

---

### Task 9: History Hall of Fame and nominee prefill (K5–K7)

**Files:** create `web/app/history/HallOfFameHistoryPage.tsx` and `web/app/history/HallOfFameHistoryPage.test.tsx`; modify `web/app/offseason/HallOfFamePage.tsx`, `web/app/offseason/HallOfFamePage.test.tsx`, `web/engine/offseason/hallOfFame.ts` and its test, `web/app/shell/Layout.tsx` and `web/app/shell/Sidebar.tsx`.

**The History page** (`/history/fba/hall-of-fame`, read-only):
- `<h1>Hall of Fame</h1>`, with classes newest first as `<h2>` (the class season).
- Each card uses the existing `hof-grid` and card markup:
  - the name, as a `PlayerLink` when `playerId` is set;
  - `Retired <retiredSeason>`;
  - `Career`: the lines matching `^[^:]+: (S\d+|FFL)(-(S\d+|FFL|pres\.))?$`;
  - `Honours`: the rest, in stored order.
- With no classes: `No one has been inducted yet.`

**The offseason page:**
- The Hall tab's content is replaced by `<p><Link to="/history/fba/hall-of-fame">See the Hall of Fame in History</Link></p>`.
- The Nominees tab is unchanged.
- The page also loads `leagues/fba/playerBios.json` (404 means null).
- The Sidebar's Hall of Fame link points to `/history/fba/hall-of-fame`.

**The prefill:** `prefillCard(c: Candidate, summaries: SummaryFile[], bio: PlayerBio | null, hof: HallOfFameFile | null): HofCard`, with `lines = careerLines(liveCareer(bio, c.playerId, summaries, hof))`.
- When that is empty, keep the old stub line `<team>: …-S<n>`.
- `retiredSeason` is unchanged. Update both call sites.

- [ ] **Step 1: Write the failing tests:**
  - A card with Atkinson's stored lines shows 3 Career lines and 8 Honours, with the name linked.
  - An unlinked card shows plain text.
  - The offseason Hall tab shows the link.
  - `prefillCard` with the Atkinson bio gives the card lines from Task 3; with no bio and no lines it gives the stub.
  - The Sidebar link.
- [ ] **Step 2: Run to verify the failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Hall of Fame in History; nominees prefilled from full careers`.

---

## After the tasks (controller)

1. **Final review:** one Opus review of `main..fba-career`.
2. **Browser check:** text only, on scratch data (CLAUDE.md "Browser checks").
   - **Prep:**
     - Run `prep.mjs`.
     - Run `npm run import -- --history --data <scratch data dir>` in the background.
     - Read the report's `duplicates` and `careers` sections, then move the report out of the repo.
   - **Walk-through:**
     1. `Merged Nadeem Akers` and `Merged Jamari O’Neal` are in the report, and the scratch `players.json` has no p00150 or p00609.
     2. On the player pages: Akeem Naylor has 3 FBA stints and `Hall of Fame: S77`; Julien Shannon has an S78 PPG row; Cameron Lučić shows `S75 MIP`.
     3. Awards by player: sorting by MVP and ASG, and the counts for Paulo Pierre-Kent and Julien Shannon make sense against tab 11.
     4. Career leaders shows the empty state (the scratch data has no S79 lines), or tables if it has them.
     5. The Hall of Fame page: the S78 class cards are grouped, and the links work. The offseason Hall tab links there.
     6. Nominees: the candidate prefill shows career lines (on scratch, if any retired candidate exists).
     - Also check 375px width and the console.
3. **Wrap-up:** update `progress.md`, the §10 roadmap row for 3b and the roadmap memory. Stop for the user before merging.
