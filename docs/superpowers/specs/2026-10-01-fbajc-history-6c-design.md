# Part 6c: FBAJC history (design)

Status: draft 2026-10-01, revised after the user supplied the All-American layout and confirmed that NIT brackets are in the PDF; awaiting the user's review. Branch `claude/kind-brahmagupta-fnq164` from `main` at 54d2812. Builds on 6a/6b (`JcSummary`, `PastBracket`) and copies the shape of part 4 (D2 history) and the past-brackets design.

## 1. Goal and decisions

Bring the college league's past (S1–S78) into the History tabs, as the FBA, D2 and World Cup pasts already are. S79 onward is written by the app and is never rewritten by an importer.

Decisions from the user (2026-10-01):

| Question | Answer |
|---|---|
| Bracket PDF | Committed at `Past Brackets/brackets.pdf` (140 pages, the PDF used for FBA, D2 and WC). |
| How far back | Everything each sheet has. A season shows whatever its sheets cover; no empty placeholders. |
| Older All-American eras | Stored in their original slot layout (like the FBA's `PastAllFbaTeams`), shown as written. |
| Player references | Names as text; a link to a player page only when exactly one existing player matches. |
| School logos | Out of scope (deferred, with PHI and T32, see section 8). |

## 2. Sources

Both are Google Sheets read by the importer from an xlsx export cached in `web/importers/.cache/`, like the other importers. Ids go in `SHEETS` in `importers/run.ts`.

**"FBAJC"** (`1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84`):

| Tab | Content | Seasons |
|---|---|---|
| National Championship History | `Year, Champion, Runner-Up, Score, C-Ship MVP, Date`. Score and Date are `X` (unknown) in the sampled rows; a "JC Era" header row precedes S1. | S1–S78 |
| NIT Championship History | `Year, Champion, Runner-Up, C-Ship MVP, Date` | S72–S78 |
| FBAJC National Awards History | Six national awards (POY, Freshman, Guard, Forward, Center, DPOY from S57), then an "All-Americans" block: season header (`S53`), then rows `slot, player, school` (section 3.2 lists the eras). | S11 on |
| Conference Awards History | Pairs of columns per conference (player, school); `X` = none | S52 on, conferences join over time |
| Conference Regular Season Champions | Per conference: `School(W-L)` on the season's first row, extra rows for co-champions (with or without a record) | S53 on |
| Conference Tournament Champions | One school per conference per season | S54 on (S52, S53 are all `X`) |
| Preseason Tournament Champions | One column per event; events are added over time (6 events in S64, 21 in S72) | S64 on |
| Total MM Wins All-Time | `rank, school, wins` | all-time |
| Recruiting, Transfer Portal | Already imported by the recruiting/portal work; not touched here | |

**"FBA JC School History"** (`1T1gR1wQBVLfzL0o6cO2QKMTDsLDMIo03OJrF4t0CZZ8`): 18 conference tabs. Per school: name, `MM App.` (`Baylor-28`, the total) and the list of seasons it made March Madness. **No season records exist in the sheet.** The school pages therefore show titles and appearances, not season-by-season records (assumed; the user is asked to confirm, section 8).

**Bracket PDF:** the user confirms it holds both the March Madness and the NIT brackets. The 3a spec counted 52 FBAJC pages among 140, the user estimated about 70; the page inventory settles it. They are single-elimination March Madness pages titled "March Madness <roman numeral>" with "FBAJC S<n>" (older seasons print "FBA Junior Colleges S<n>"): 64 slots, `seed.Name(record)`, BYEs, single-game scores that can end in "OT". NIT pages (16 to 32 slots) are found during the page inventory (task 1 of the plan), which reports page, kind, season and field size before transcription starts.

## 3. Data

All additions are optional so the committed S78 summary stays valid.

### 3.1 `SummaryFile` for FBAJC seasons S1–S78

One `leagues/fbajc/S<n>/summary.json` per season (S78's exists with only the champion). Importer output per season:

- `champions`: `National Champion` (champion, runner-up, `teamId`/`runnerUpId` resolved, `finalsMvp` as in other leagues when the MVP resolves) and, S72 on, `NIT Champion` (`jc.nit` repeats it for the existing 6b readers).
- `jc` (extended, section 3.2).
- `pastBracket`: the March Madness bracket (section 5). The NIT bracket goes in a new optional `jc.nitBracket: PastBracket.nullable()` (decided: `pastBrackets` stays D2-only; the NIT is a separate tournament of the same season, and `jc` is already FBAJC-only).

### 3.2 `JcSummary` extension (deliberate)

`JcSummary` today holds only what the app writes from S79: `confChampions`, `national`, `conference`, `allAmerican`, `mvp`, `nit`. The history needs more, all optional:

- **Names beside ids.** Each player slot may carry `name` and `school` (text) when `playerId` is null; `playerId` is set only when exactly one player in `players.json` matches (the existing `nameResolver` in `importers/history.ts` with its report). The pages render a `PlayerLink` when there is an id, plain text otherwise.
- **`confChampions[].regularSeason`** becomes `string[]` of school names as today, plus an optional parallel `regularSeasonRecords` (`"12-3"` strings or null) for co-champions.
- **`preseason`**: `[{ event: string, champion: string }]` (S64 on).
- **`allAmericanLegacy`**: `{ teams: [{ team: number, slots: [{ slot: string, name, school, playerId }] }] }`. Slot labels are kept exactly as the sheet writes them. The eras, read from the user's paste of the All-Americans block:
  - **S53–S58** (no S56): one team of 7: OUT, OUT, OUT (S59: two), MID, MID, IN, IN (S59 adds one ANY). S59 is 2 OUT, 2 MID, 2 IN, 1 ANY.
  - **S60–S66**: one team of 9: 3 OUT, 3 MID, 3 IN.
  - **S67**: one team of 9: 3 G, 3 F, 2 C, 1 ANY.
  - **S68–S70**: three teams of PG, SG, SF, PF, C.
  - **S71–S78**: three teams of G, F, C, ANY, ANY. This is the shape `allAmerican` already has, so these seasons use `allAmerican` (with names and schools), not the legacy block.
  A summary has `allAmerican` or `allAmericanLegacy`, not both (`superRefine`). Slots are an open string list, with no fixed per-era counts in the schema; the importer reads whatever rows sit under a season header (and a `Team n` sub-header when present) and reports any season with no rows.
- **`mvp`** keeps `mm` and `nit` as ids; names go in a sibling `mvpNames: { mm: string|null, nit: string|null }` for unresolved players.

`superRefine` rules from 6b (unique All-American players, six national awards) stay for app-written data; imported rows are allowed to be incomplete, so the strict counts apply only when `playerId`-based data is present. (The plan states exactly which refinements relax, with tests.)

### 3.3 School history document

New `leagues/fbajc/schoolHistory.json` (strict zod `JcSchoolHistoryFile`, path rule in `schemaRegistry.ts`): per team id, `{ mmAppearances: number[], mmAppearancesTotal: number, mmWins: number }`. Titles, runner-ups, conference and NIT results are derived at read time from the summaries (single source of truth); the school doc holds only what the sheet alone knows. Appearances after S78 are derived from the app's own summaries/brackets, so the doc is S1–S78 only.

## 4. Importers

`importers/run.ts` gains, all requiring `--data <dir>` (never `web/data` in tests; fixtures only):

- `--jc-history`: the FBAJC workbook tabs to season summaries (section 3.1), merging into any existing summary (S78 keeps its champion fields), never writing S79 or later. Reports: unresolved school names (an alias map like `SHEET_TEAM_ALIASES`, for example "Stephen F Austin", "Abeliene Christian", "Texas A&M"), unresolved players (kept as text), co-champion rows, seasons without any data.
- `--jc-schools`: the school history workbook to `schoolHistory.json`; duplicate tabs/columns such as `Oklahoma`/`Oklahom…` are matched by the position's full name read from the sheet, not truncated headers.
- `--jc-brackets`: reads the committed `importers/history/jcBrackets.json` (transcribed from the PDF) into `pastBracket`, via the existing `runBracketImport` with `league: 'fbajc'`; seasons without a summary are listed, not created.

Each mode validates every doc through `schemaForPath` first and writes nothing on failure (as `--wc-history` does). Pure builders live in `importers/jcHistory.ts` and `importers/sheets/jcHistory.ts` (parsers) with tests on small in-memory fixtures.

## 5. Bracket transcription

- Page inventory first (page → type, season, field size), reported to the user.
- Transcript format of `convertBrackets.ts` extended for 64 slots. Single-game scores are `Name 48-46`; the "OT" suffix needs a deliberate schema change: `PastSeries.score` currently matches `^\d+[–-]\d+$`; it becomes `^\d+[–-]\d+( \d?OT)?$` and the renderer prints it as is.
- BYEs are `null` sides, as today. The renderer already uses `bracket.rounds`; 6 rounds (64 slots) is verified in a test and, in the browser check, at 375px.
- Transcripts in `importers/history/transcripts/jc-*.txt`, converted to `jcBrackets.json`, guarded by a test like `fbaBrackets.test.ts`: schema-valid, one per season, champion and runner-up match the summary. Transcription is by Sonnet implementers in page batches (read downscaled page images), the controller reviews each batch.

## 6. Pages

- `HistoryLeagueSwitch` gains an FBAJC chip (`/history/fbajc`, label "College").
- `/history/fbajc`: home with links and the latest champion.
- `/history/fbajc/championships`: National Champion, runner-up and C-Ship MVP per season (S1 on), NIT S72 on, and title counts per school.
- `/history/fbajc/season/:season`: champion, runner-up, MVPs, national awards, All-Americans (legacy eras as written), conference champions (regular season with co-champions, tournament), preseason tournaments, the March Madness bracket (`PastBracket`) or "No bracket recorded".
- `/history/fbajc/awards`: national and conference awards by season.
- `/history/fbajc/schools` and `/history/fbajc/school/:teamId`: titles (national, NIT, conference regular season and tournament, preseason), runner-ups, March Madness appearances and wins, awards by their players.
- Season labels from S79 are written by the app, so the pages read `jc` and `bracket` as they are (6b data); the history list shows both eras.
- Tables stay in `.table-wrap`, theme tokens, no horizontal page scroll at 375px, dark mode via tokens. Pages for a season whose data doesn't exist don't title themselves with the current season.

## 7. Open items resolved in the plan

- The National Awards tab's six award columns (the connector shows only a sample; the All-American block is known from the user's paste).
- NIT page field sizes, from the page inventory.
- Exact `superRefine` relaxations (section 3.2).
- Real-data runs are the user's: the importers are run by the user on `web/data`; tests and browser checks use scratch copies.

## 8. Out of scope and deferred

- School logos for FBAJC schools (the user is considering them).
- PHI (Philly Phantoms, logo already in `FBA Logos/`) and Team 32 (T32, no logo) must be added before the S80 rollover.
- Season-by-season school records before S79 (not in the sheets). Assumed; confirm.
- Anything under `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` and `web/data/**` is not modified by this part.

## 9. Tests and checks

- RED first, `cleanup()` in `afterEach` for jsdom tests; schema tests (extended `JcSummary`, `JcSchoolHistoryFile`, `score` with OT); parser and builder tests on fixtures; importer tests on a temp copy (never `web/data`); JSON guard tests; page tests (home, championships, season with and without bracket, school page, switcher).
- `npx tsc --noEmit` prints nothing and `npx vitest run` passes; `web/data.test.ts` stays green.
- The cloud checkout has no `.superpowers/` scratch tooling, so browser checks (375px, dark mode, the 64-slot bracket) cannot run here and are listed as not done in the final report.
