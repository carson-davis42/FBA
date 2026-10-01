# Past Brackets (D2 and World Cup history) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the brackets of past D2 and World Cup seasons in the history tabs, transcribed from the bracket-page PDF and imported into the season summaries.

**Architecture:** `PastSeries` gains an optional single-game `score`; D2 summaries gain `pastBrackets` (one per league group). Transcriptions are committed text files under `web/importers/history/transcripts/`, converted by a TypeScript converter into `wcBrackets.json` / `d2Brackets.json`. Two import modes (`--wc-brackets`, `--d2-brackets`) merge the JSON into summaries on a `--data` copy. The World Cup gets a new season page; the D2 season page gets a Tournament section. All page rendering reuses `app/history/PastBracket.tsx`.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3 (strict), Vitest 2 + jsdom, tsx (importers), Python PIL (image downscaling for transcribers).

Spec: `docs/superpowers/specs/2026-09-30-past-brackets-design.md` (read it first).

## Global Constraints

- Run from `web/`: `npx vitest run <paths>`; `npx tsc --noEmit` must print nothing.
- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/`. Tests use in-memory or temp-dir fixtures; read-only reads of committed `web/data` summaries are fine. Importer tests run only on a temp copy. Never start or stop dev servers on 5173/5174. No stray files; scratch goes in `.superpowers/sdd/`.
- Stage files by explicit path. Work on branch `history-brackets`. Commit trailer exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Zod schemas stay `.strict()`; `web/data.test.ts` must keep passing.
- Jsdom test files call `cleanup()` in `afterEach`. Vitest globals are off (import `describe/it/expect/afterEach` from `vitest`).
- Pages reuse `useHistory`, `useDoc`, `PastBracket`, `WcTeam`, `PlayerLink`, `.table-wrap`, theme tokens only (dark mode follows tokens). No horizontal page scroll at 375px.
- A seeded or injected clock/Rng is not needed here (no randomness).
- Test file next to source (`x.ts` / `x.test.ts`). Run RED first. Test output: summary lines only.
- Transcription tasks: a transcribed bracket's champion and runner-up must match the existing summary in `web/data/leagues/<league>/S<n>/summary.json` (read-only). On a mismatch do NOT edit the allowed-mismatch list and do not guess: re-read the page, and if it still disagrees report it in the report file under "Mismatches" (season, page, what the page says, what the summary says) for the controller to take to the user.
- Page images: `.superpowers/sdd/history/allpages/pNNN.jpg` (scratch, git-ignored; originals are large, 2000-4300px wide). Downscale before reading, for example:
  `python3 -c "from PIL import Image; im=Image.open('P').convert('RGB'); w=1600; im.resize((w,int(w*im.size[1]/im.size[0]))).save('OUT')"` with OUT in `.superpowers/sdd/history/work/` (create it; git-ignored). Read one downscaled page at a time; zoom into regions only when a name or score is unreadable. Do not guess names or scores.
- Transcript format (one `.txt` per batch in `web/importers/history/transcripts/`, named `<kind>-<n>.txt`, kind `wc` or `d2`). For each page:

```
# p004 FBA D2 World League Tournament
S76
G:WL
1|Rome|25-5
8|Liverpool|15-15
5|Hamburg|19-11
4|Sydney|20-10
3|Sao Paolo|23-7
6|Zurich|16-14
7|Dhaka|16-14
2|Vancouver|24-6
= Rome 4-0 | Sydney 4-3 | Sao Paolo 4-0 | Vancouver 4-0
= Rome 4-0 | Vancouver 4-3
= Vancouver 4-2
```

  - `# pNNN <page title>` is a comment line. `S<n>` is the season printed on the page. `G:<code>` appears only on D2 league-tournament pages: `PL` Premier League, `WL` World League, `UL` United League, `IL` International League; it is omitted for the old "FBA D2 Tournament" pages and the World Cup.
  - Slot lines are `seed|name|record`, in the order the first round is drawn. One-sided pages (league tournaments, old D2 tournament): top to bottom. Two-sided pages (the World Cup): the whole left half top to bottom, then the whole right half top to bottom. Seed and record are empty when the page prints none (`|Greece|`). Records are `W-L` or `W-L-T` with no parentheses; a team's name has no record or seed attached. Use the name exactly as printed (city names for D2, country names for the World Cup, no flag).
  - One `=` line per round, listing each series winner in the same order as the slots, as `Name W-L` (series wins, winner first, for example `Rome 4-0`) or `Name PTS-PTS` for a single game (winner's points first, for example `Japan 97-75`). A series or aggregate score never exceeds 4 wins; any number above 4 is read as a single-game score. A BYE is written `Name BYE`.
  - `Name -` (a single dash instead of the score) is an unscored series (some old D2 pages print only the winner): it gets `unscored: true`, 0-0 wins and no `score`; its loser must not be a BYE.

## File structure

- Modify `web/engine/shared/types.ts` (+ `types.test.ts` or a new schema test): `PastSeries.score`, `SummaryFile.pastBrackets`.
- Modify `web/app/history/PastBracket.tsx` (+ `PastBracket.test.tsx`): show scores.
- Create `web/importers/history/convertBrackets.ts`, `convertBrackets.test.ts`, `convertBracketsRun.ts` (CLI).
- Create `web/importers/history/transcripts/` (text files), `wcBrackets.json`, `d2Brackets.json`, `wcBrackets.test.ts`, `d2Brackets.test.ts`.
- Modify `web/importers/run.ts` (+ `bracketsImport.test.ts`): `--wc-brackets`, `--d2-brackets`.
- Create `web/app/history/wc/WcSeasonPage.tsx` (+ test); modify `web/app/history/wc/WcHistoryPage.tsx`, `web/app/shell/Layout.tsx`.
- Modify `web/app/history/d2/D2SeasonPage.tsx` (+ test): Tournament section.

---

### Task 1: Schema (`score`, `pastBrackets`) and renderer

**Files:** Modify `engine/shared/types.ts`, `app/history/PastBracket.tsx`; tests in `engine/shared/` (a new `pastBrackets.test.ts` is fine) and `app/history/PastBracket.test.tsx`.

**Interfaces:**
- Produces: `PastSeries.score?: string` (`/^\d+[–-]\d+$/`); `SummaryFile.pastBrackets?: { group: 'PL'|'WL'|'UL'|'IL'; bracket: PastBracket }[]`.

**Rules:**
- In `PastBracket.superRefine`, when a series has `score`: the winner's wins must be 1 and the loser's 0, and the first number of the score must exceed the second.
- In `SummaryFile.superRefine`: `pastBracket` and `pastBrackets` may not both be present (non-null/non-empty); `pastBrackets` only when `league === 'fbad2'`; groups unique.
- Renderer: when a series has `score`, the winner side shows the first number and the loser side the second, instead of the win counts. Without `score` nothing changes.

- [ ] **Step 1: Failing tests.** Schema: a 1-round `PastBracket` with a scored final parses; wins 2/0 with a score is rejected; a score whose first number is smaller is rejected; `SummaryFile.parse` accepts `pastBrackets` on a `fbad2` summary and rejects it on `fba`, rejects a repeated group, rejects `pastBracket` plus `pastBrackets`. Renderer: render `<PastBracket>` for a one-round bracket with `score: '97–75'` and assert both numbers (97 and 75) appear and the plain win count does not. Existing PastBracket tests stay green.
- [ ] **Step 2:** `npx vitest run engine/shared app/history/PastBracket.test.tsx` — FAIL.
- [ ] **Step 3: Implement.** Read `app/playoffs/Bracket.tsx` `SideRow` to see the `wins` prop (a number or null); pass the points for a scored series. Keep the series-box markup identical otherwise.
- [ ] **Step 4:** `npx vitest run engine app/history` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(history): PastSeries score and D2 pastBrackets`.

---

### Task 2: Transcript converter

**Files:** Create `importers/history/convertBrackets.ts`, `convertBrackets.test.ts`, `convertBracketsRun.ts`, and `importers/history/transcripts/.gitkeep` (a placeholder file keeps the folder; delete it when the first transcript lands, or leave it).

**Interfaces:**
- Produces:
```ts
export interface BracketEntry { season: number; group?: 'PL' | 'WL' | 'UL' | 'IL'; rounds: number; series: PastSeries[] }
export function convertTranscript(text: string): { entries: BracketEntry[]; warnings: string[] }
```
- CLI: `npx tsx importers/history/convertBracketsRun.ts <wc|d2>` reads every `importers/history/transcripts/<kind>-*.txt` (sorted), converts, sorts entries by season then group (`PL, WL, UL, IL`), writes `importers/history/<kind>Brackets.json` (2-space JSON plus trailing newline), and prints `N entries: S.. S..`. It exits non-zero on any thrown error.

**Behaviour** (port `.superpowers/sdd/convert-brackets.mjs`, which is the 3a converter; read it): slot count must be a power of two; rounds = log2; one `=` line per round with the right number of results; each result `^(.*) (BYE|(\d+)-(\d+))$`; the winner name must be one of the two sides; BYE must match a missing side (`BYE` slot lines written as the single word `BYE`). New in this task:
- Numbers above 4 on either side make it a single game: `homeWins`/`awayWins` become 1 for the winner and 0 for the other, and the series gets `score: '<winnerPts>–<loserPts>'` (en dash).
- A `G:` line sets `group` on the page's entry. Duplicate `season`+`group` (or two non-grouped entries for one season) throws.
- A record that isn't `W-L` or `W-L-T` becomes `null` and adds a warning (as in 3a).
- Every entry produced must pass `PastBracket.safeParse` (the entry minus `season`/`group`); otherwise throw with the issues.

- [ ] **Step 1: Failing tests** (`convertBrackets.test.ts`, inline text fixtures): the S76 page from the Global Constraints format example converts to 3 rounds, 7 series, `group: 'WL'`, final `Vancouver 4-2`; a two-slot page with `Japan 97-75` gives `score: '97–75'` and wins 1/0; a BYE page; a bad winner name throws; wrong result count throws; duplicate `season`+`group` throws; a non-`W-L` record becomes null with a warning; the output of a valid 16-slot page passes `PastBracket`.
- [ ] **Step 2:** `npx vitest run importers/history/convertBrackets.test.ts` — FAIL.
- [ ] **Step 3: Implement** converter and CLI (the CLI is not unit-tested; the converter is).
- [ ] **Step 4:** run that test file and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(import): bracket transcript converter`.

---

### Task 3: Import modes `--wc-brackets` and `--d2-brackets`

**Files:** Modify `importers/run.ts`; Create `importers/history/mergeBrackets.ts`, `mergeBrackets.test.ts`; add `[]` placeholder files `importers/history/wcBrackets.json` and `importers/history/d2Brackets.json` (content `[]`).

**Interfaces:**
- Consumes: `BracketEntry` (Task 2), `SummaryFile`, `schemaForPath`, `readDataJson`, `writeDoc`, `requireDataDir`, `MODE_FLAGS` (read `importWcHistory` in `run.ts` for the pattern).
- Produces: `mergeBrackets(league: 'fbawc' | 'fbad2', entries: BracketEntry[], summaries: Map<number, SummaryFile>): { summaries: SummaryFile[]; report: { set: number; unchanged: number; missingSummary: string[] } }` (pure). For `fbawc` an entry sets `pastBracket`; for `fbad2` an entry with a `group` is added to `pastBrackets` (replacing that group's existing one), and a group-less entry sets `pastBracket`. A season whose D2 entries mix `pastBracket` and groups is an error (thrown). A summary already carrying an identical value counts as unchanged. Entries whose season has no summary are listed in `missingSummary` (`S54`, or `S76 WL`), never created.
- Modes: `--wc-brackets --data <dir>` and `--d2-brackets --data <dir>` read the matching JSON from `importers/history/`, read the summaries of the league from `<dir>/leagues/<league>/S<n>/summary.json` (n 1..200), call `mergeBrackets`, validate every changed summary through `schemaForPath`, write them with `writeDoc`, and print the report. If any doc fails the schema, nothing is written. Both flags are added to `MODE_FLAGS` and dispatched like `--wc-history`.

- [ ] **Step 1: Failing tests** (`mergeBrackets.test.ts`, small in-memory summaries built through the schema fixtures already used in `importers/history.test.ts` or minimal valid ones): WC entry sets `pastBracket`; D2 grouped entries land in `pastBrackets` in group order; a re-run is `unchanged`; a missing season goes to `missingSummary`; mixing a grouped and a group-less entry for one D2 season throws; a D2 summary that already has a live `bracket` keeps it. Plus one CLI-level test on a temp dir with two fixture summaries (run via `spawnSync('npx', ['tsx', 'importers/run.ts', '--wc-brackets', '--data', tmp])`, quoting paths, `shell` only on win32, as `wcQualifyingStep.test.ts` does) with `wcBrackets.json` temporarily replaced is NOT allowed (do not edit committed JSON in tests); instead export a function `runBracketImport(league, entries, dir)` used by both the mode and this test.
- [ ] **Step 2:** `npx vitest run importers` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run importers engine` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(import): --wc-brackets and --d2-brackets modes`.

---

### Task 4: World Cup season page and hub links

**Files:** Create `app/history/wc/WcSeasonPage.tsx`, `app/history/wc/WcSeasonPage.test.tsx`; Modify `app/history/wc/WcHistoryPage.tsx` (season cells link to the page), `app/history/wc/WcHistoryPage.test.tsx`, `app/shell/Layout.tsx` (route `/history/fbawc/season/:season`).

**Behaviour:** `WcSeasonPage` mirrors `D2SeasonPage`'s loading pattern (`useHistory('fbawc')`, `useDoc<PlayersFile>`, `useWcTeams`, hosts). Header: kicker "World Cup", title `S<n> World Cup`, `HistoryLeagueSwitch`, host (`hosts.json` city, country, else summary `host`). Facts: champion and runner-up (`WcTeam` with flags, ids from the `World Cup Champion` champion entry), Tournament MVP (`PlayerLink` when `finalsMvp`, plain `mvpName` text otherwise, "—" when none). Then the bracket: `summary.pastBracket` rendered by `PastBracket` (teams from `useWcTeams` for flags, `season`), else "No bracket recorded". Unknown season: "Not found". A season with no summary in `seasons` that is an upcoming host (hosts only): show host and "Not played yet". The hub's season label cells become `<Link to={`/history/fbawc/season/${n}`}>`.

- [ ] **Step 1: Failing tests:** page with a summary + `pastBracket` shows champion, runner-up, MVP name, host and the bracket's team names; a generated-MVP summary (`finalsMvp: null`, `mvpName`) shows the plain name; no bracket shows "No bracket recorded"; unknown season "Not found"; hub rows link to the season page. Mock fetch like `WcHistoryPage.test.tsx`.
- [ ] **Step 2:** `npx vitest run app/history/wc` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run app/history app/shell` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(history): World Cup season page with past bracket`.

---

### Task 5: D2 season page Tournament section

**Files:** Modify `app/history/d2/D2SeasonPage.tsx`, `app/history/d2/D2HistoryPages.test.tsx` (or a new `D2SeasonBrackets.test.tsx`).

**Behaviour:** below the standings, keep the existing live-`bracket` "Playoffs" block unchanged. When the season has no live `bracket`: a "Tournament" section (`h2.section-title`). If `pastBrackets` has entries, one subsection per entry in group order (`PL, WL, UL, IL`, headed by `groupLabel('fbad2', group)`) with `PastBracket` (teams from `useD2Teams`, `season={n}`); else if `pastBracket`, a single `PastBracket` under the heading "Tournament"; else the text "No bracket recorded". Franchise/era names follow what `SeasonHistoryPage` passes (`useFranchises` if D2 has it; otherwise `franchises={null}`).

- [ ] **Step 1: Failing tests:** an old-format season (`pastBracket`) renders the bracket; a league-era season with two `pastBrackets` renders two headed brackets in group order; a season with a live `bracket` shows only the live block; a season with neither shows "No bracket recorded".
- [ ] **Step 2:** `npx vitest run app/history/d2` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run app/history` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(history): D2 season page tournament section`.

---

### Task 6: World Cup transcription, pages 011, 013, 021, 029, 031, 041

**Files:** Create `importers/history/transcripts/wc-1.txt`; regenerate `importers/history/wcBrackets.json`; Create `importers/history/wcBrackets.test.ts`.

**Brief:** transcribe the six World Cup pages named above (images `.superpowers/sdd/history/allpages/p011.jpg` etc.) following the Transcript format in Global Constraints (two-sided, 16 slots, four `=` lines; flags beside names are decoration, names are text; the season is printed in the title on most pages, and when it is not, derive it from the champion in `web/data/leagues/fbawc/S<n>/summary.json`, World Cups are the even seasons S56-S78, and say so in the report). Run `npx tsx importers/history/convertBracketsRun.ts wc`. Write `wcBrackets.test.ts` (modelled on `fbaBrackets.test.ts`): every entry passes `PastBracket`; seasons unique and ascending; each entry's final champion and runner-up match `web/data/leagues/fbawc/S<n>/summary.json` `champions` entry titled `World Cup Champion` (read with `readFileSync`, normalised with `normName` from `../history`); `ALLOWED_MISMATCH: number[] = []`; a count assertion `>= 6` (raised in Task 7 to 12).

- [ ] **Step 1: Failing test:** write `wcBrackets.test.ts` first (it fails: the JSON is `[]`).
- [ ] **Step 2:** `npx vitest run importers/history/wcBrackets.test.ts` — FAIL.
- [ ] **Step 3:** transcribe, convert.
- [ ] **Step 4:** run it and `npx tsc --noEmit` — PASS (or report mismatches).
- [ ] **Step 5: Commit** `data(history): World Cup brackets, first six`.

---

### Task 7: World Cup transcription, pages 069, 072, 097, 115, 123, 127

**Files:** Create `importers/history/transcripts/wc-2.txt`; regenerate `wcBrackets.json`; Modify `wcBrackets.test.ts` (count `=== 12`, and assert the seasons are exactly the 12 even seasons S56-S78).

Same brief as Task 6 for these six pages. After conversion all 12 World Cups S56..S78 must be present.

- [ ] **Step 1: Failing test:** change the count and seasons assertions first.
- [ ] **Step 2:** run the test file — FAIL.
- [ ] **Step 3:** transcribe, convert.
- [ ] **Step 4:** run it and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `data(history): World Cup brackets, all 12`.

---

### Task 8: Old D2 Tournament transcription, pages 008, 020, 027, 036, 039, 055, 062, 063

**Files:** Create `importers/history/transcripts/d2-1.txt`; regenerate `importers/history/d2Brackets.json`; Create `importers/history/d2Brackets.test.ts`.

**Brief:** these are "FBA D2 Tournament" pages (S53-S67, one-sided brackets, single games with scores such as `52-40` or `52-44 OT` (write `52-44`; ignore OT), no `G:` line). Transcribe per the Transcript format. `d2Brackets.test.ts`: every entry passes `PastBracket`; entries sorted by season then group; each final's champion and runner-up match `web/data/leagues/fbad2/S<n>/summary.json` (read-only): for a grouped entry the `champions` entry whose `group` equals the entry's group; for a group-less entry the champions entry titled `D2 International Champion` (S55 has two titles; use whichever matches, and report which); `ALLOWED_MISMATCH: string[] = []` (keys like `S55` or `S76 WL`); a count assertion `>= 8` (raised in later tasks). Run `npx tsx importers/history/convertBracketsRun.ts d2`.

- [ ] **Step 1: Failing test:** write `d2Brackets.test.ts` first.
- [ ] **Step 2:** `npx vitest run importers/history/d2Brackets.test.ts` — FAIL.
- [ ] **Step 3:** transcribe, convert.
- [ ] **Step 4:** run it and `npx tsc --noEmit` — PASS (or report mismatches).
- [ ] **Step 5: Commit** `data(history): old D2 tournament brackets, first eight`.

---

### Task 9: Old D2 Tournament transcription, pages 073, 081, 088, 114, 116, 124, 140

**Files:** Create `importers/history/transcripts/d2-2.txt`; regenerate `d2Brackets.json`; Modify `d2Brackets.test.ts` (count `>= 15`).

Same brief as Task 8. S54 has no D2 summary in `web/data`: if a page is S54, transcribe it, and in the test skip the summary match for it (list it in a named `NO_SUMMARY` array with a comment) and report it.

- [ ] **Step 1: Failing test:** raise the count assertion first.
- [ ] **Step 2:** run the test file — FAIL.
- [ ] **Step 3:** transcribe, convert.
- [ ] **Step 4:** run it and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `data(history): old D2 tournament brackets, all 15`.

---

### Tasks 10-14: D2 league tournaments (S68-S77)

Each task: transcribe its batch of league-tournament pages (one-sided 8-team brackets, series scores, **`G:` line required**; the group is the page title: Premier League `PL`, World League `WL`, United League `UL`, International League `IL`), writing `importers/history/transcripts/d2-<n>.txt` (`d2-3` to `d2-7`), regenerate `d2Brackets.json`, and raise `d2Brackets.test.ts`'s count assertion by the batch size. Same test-first, convert, commit flow as Task 8. Commit message `data(history): D2 league brackets, batch <k>`.

- **Task 10 (`d2-3`):** pages 004, 005, 007, 023, 024, 025, 033, 034.
- **Task 11 (`d2-4`):** pages 040, 049, 050, 052, 057, 061, 064, 066.
- **Task 12 (`d2-5`):** pages 067, 074, 076, 077, 082, 083, 091, 092.
- **Task 13 (`d2-6`):** pages 093, 094, 100, 103, 108, 109, 110, 117.
- **Task 14 (`d2-7`):** pages 118, 119, 120, 121, 126, 134, 136, 137. After this task the test asserts the grouped entries cover S68-S77 with no repeated season+group and that every D2 summary S68-S77 league champion (its `champions` entries with a `group`) has a bracket entry.

- [ ] **Step 1 (each):** raise the count assertion (or, in Task 14, add the coverage assertions) first; run `npx vitest run importers/history/d2Brackets.test.ts` — FAIL.
- [ ] **Step 2 (each):** transcribe, convert, run the test file and `npx tsc --noEmit` — PASS (or report mismatches), commit.

---

## Controller steps (not for implementers)

- Before each transcription task make sure `.superpowers/sdd/history/allpages/` exists (rebuild it with the JPEG-stream scan used on 2026-09-30 if it was cleaned) and write the brief with this plan's Global Constraints (including the Transcript format and Mismatch rule) plus the task text.
- After Tasks 6-7 (stage 1) and 8-9 (stage 2) and 10-14 (stage 3): run the full suite and `npx tsc --noEmit`; take any "Mismatches" from the reports to the user (never edit the allowlists without approval).
- Browser check per stage on SCRATCH data only (CLAUDE.md "Browser checks", 5184/5183): copy `web/data` to the scratch dir, run `npx tsx importers/run.ts --wc-brackets --data <scratch>` and `--d2-brackets --data <scratch>` (report counts, `missingSummary` expected `S54` only), then read `/history/fbawc`, `/history/fbawc/season/<n>`, `/history/fbad2/season/<n>` for an old-format season and an S68-S77 season by text and JS (at most 3 screenshots at scale 0.5; if the browser pane is hidden say that layout was not measured). Clean up (stop scratch processes, delete scratch data and config, `git status` clean apart from the user's own changes).
- Final Opus review once at the end of stage 3 (package `scripts/review-package $(git merge-base main HEAD) HEAD`), one fixer, update the roadmap (§10 of `docs/superpowers/specs/2026-09-25-fba-web-design.md`) and memory notes, then stop for the user before merging. The user runs `--wc-brackets` and `--d2-brackets` on real data.
