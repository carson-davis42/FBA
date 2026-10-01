# Part 6c: FBAJC history (design)

Status: draft 2026-10-01, revised after the user supplied the All-American layout and confirmed that NIT brackets are in the PDF; awaiting the user's review. Branch `claude/kind-brahmagupta-fnq164` from `main` at 54d2812. Builds on 6a/6b (`JcSummary`, `PastBracket`) and copies the shape of part 4 (D2 history) and the past-brackets design.

## 1. Goal and decisions

Bring the college league's past (S1–S78) into the History tabs, as the FBA, D2 and World Cup pasts already are. S79 onward is written by the app and is never rewritten by an importer.

Decisions from the user (2026-10-01):

| Question | Answer |
|---|---|
| Bracket PDF | Committed at `Past Brackets/brackets.pdf` (140 pages, the PDF used for FBA, D2 and WC). |
| How far back | Everything each sheet has. A season shows whatever its sheets cover; no empty placeholders. The sheets run S1–S18 then S48–S78 because of how the college league was numbered (section 1a); there are no seasons S19–S47. |
| Older All-American eras | Stored in their original slot layout (like the FBA's `PastAllFbaTeams`), shown as written. |
| Player references | Names as text; a link to a player page only when exactly one existing player matches. |
| School logos | Out of scope (deferred, with PHI and T32, see section 8). |

## 1a. Season numbering (user-supplied, 2026-10-01)

The college league kept its own season numbers until it joined the shared calendar. The FBA events tab (`web/data/leagues/fba/events.json`) records when each of them happened:

| JC season | Happened at |
|---|---|
| S1, S2 | FFL S46, FFL S47 (before the FBA began) |
| S3 | FBA S11 |
| S4, S5 | FBA S28, S29 |
| S6–S18 | FBA S32–S44 (one per season: S6 = S32 … S18 = S44) |
| (none) | FBA S45–S47: no college season |
| S48 on | "FBA adds JC": the college league takes the shared season number, S48–S78 |

Consequences:

- **No gap to fill:** JC S19–S47 do not exist, so there are no summaries for them and no "missing" report. The two number ranges never collide, so summaries sit at `leagues/fbajc/S<n>/` with the sheet's own number, as for S48 on.
- **Labels:** the pages label S1–S18 as "S<n>" with the equivalent in small text (for example "S11 · FBA S37", "S1 · FFL S46"), and say in a note on the championships page that the college league used its own numbers until S48. A season page for S1–S18 must not be linked from, or assume the same year as, the FBA/D2/WC season with the same number.
- **Table:** `JC_EARLY_SEASONS` in `engine/history/jc.ts` (JC season → `{ era: 'FFL' | 'FBA', season }`), with a test that reads `events.json` and checks each "FBA JC S<n>" note sits on the season in the table (the FFL S46/S47 entries come from the `before` list).
- **School workbook:** its S1–S18 are the college league's own seasons, and the bare `*` it puts on S1–S10 marks the early format (keep as a flag on the season, not a conference).
- **Statistics across eras:** title counts, appearance counts and the school pages treat S1–S18 and S48–S78 as one continuous list in the order JC S1…S18, S48…S78.

## 2. Sources

Both are Google Sheets read by the importer from an xlsx export cached in `web/importers/.cache/`, like the other importers. Ids go in `SHEETS` in `importers/run.ts`.

**"FBAJC"** (`1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84`):

| Tab | Content | Seasons |
|---|---|---|
| National Championship History | `Year, Champion, Runner-Up, Score, C-Ship MVP, Date`; a "JC Era" row precedes S1. `Score` is `X` for most of S1–S11 and S73 and is filled (`81-62`) for 33 seasons (it goes into `Champion.score`); `Date` is `X` or a real date (not imported). | S1–S18, S48–S78 (49 seasons) |
| NIT Championship History | `Year, Champion, Runner-Up, C-Ship MVP, Date` (a real date) | S72–S78 |
| FBAJC National Awards History | One tab, stacked blocks. Each of the six award blocks opens with a header row (column C = the award title; column B on that row is not a winner) followed by rows `S<n> \| player \| school`: Player of the Year S11–S18 and S48–S78 (39), Freshman of the Year S16–S78 (34), Guard, Forward, Center and Defensive POY S57–S78 (22 each). Then a row `All-Americans`, and per season a row `S<n>`, an optional `Team n` row (in column B), and rows `slot \| player \| school` with the slot in column A (section 3.2 lists the eras). All-Americans cover S53–S55 and S57–S78. | S11 on |
| Conference Awards History | Pairs of columns per conference (player, school); `X` = none | S52 on, conferences join over time |
| Conference Regular Season Champions | Per conference: `School(W-L)` on the season's first row, extra rows for co-champions (with or without a record) | S53 on |
| Conference Tournament Champions | One school per conference per season | rows from S52 (S52 and S53 are all `X`), real data from S54 |
| Preseason Tournament Champions | One column per event; events are added over time (6 events in S64, 21 in S72) | S64 on |
| Total MM Wins All-Time | `rank, school, wins`; the first cells are an array formula, so the reader must take cached values; about 384 filled rows (blank rows after) | all-time (cross-checked against the school workbook) |
| Recruiting, Transfer Portal | Already imported by the recruiting/portal work; not touched here | |

**"FBA JC School History"** (`1T1gR1wQBVLfzL0o6cO2QKMTDsLDMIo03OJrF4t0CZZ8`; the user uploaded the full xlsx 2026-10-01): 18 tabs, one per current conference, 12 schools per tab (columns B–M, 216 in all). Each tab stacks nine sections down the columns, all with the same labels in column A: `MM App.`, `Sweet 16`, `Elite 8`, `Final Four`, `NC app.` (title-game appearances), `National Champions`, `Conf RS Champions`, `Conf TOUR Champions`. The section header cell reads `School-<count>` (`Baylor-28`) and the cells below list `(S<n>)` seasons; every one of the 1,728 counts matches its list. Cell suffixes:

- `*` alone: a season S1–S10 (the JC era; the sheet's own marker).
- `*A10`, `*AAC`, `*PAT`, `*HOR`, `*COL`, `*B10`, `*SOCON`: for conference championships, the conference the school was in that season when it differs from its current tab.
- One typo in the source: `(S56*B10` (Nevada, conference tournament, missing the closing parenthesis). The parser accepts it and reports it.

There are still **no season win-loss records** in the sheet, but each school's round reached in every March Madness is known. The school pages therefore show titles, the season-by-season March Madness round, and conference titles, not season records.

**"FBA - Players"** (the registry sheet, already imported into `players.json`: 2,420 players with id, name, birth season; the user's most important sheet, every player one row, with college stints such as `San Diego State-S58-S59` and honour counts such as `1x National Champion`, `1x NC MVP`, `1x All-American(1st)`). 6c does not re-import it. It matters in two ways: names in the college workbook are checked against it (checked 2026-10-01: of 414 distinct player names in the FBAJC workbook, 411 match exactly one player and none is ambiguous; the other three are spelling variants: "Deshawn Randall" = "DeShawn Randall", "Eliott Miller" = "Elliott Miller", "Kojo Battoe" = "Kojo Baffoe"), and its per-player honour counts give a cross-check on the imported awards (spec section 9). The text-name fallback is therefore a safety net, not the normal case.

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

New `leagues/fbajc/schoolHistory.json` (strict zod `JcSchoolHistoryFile`, path rule in `schemaRegistry.ts`), `throughSeason: 78`, one entry per team id:

`{ teamId, mm: { app, sweet16, elite8, final4, titleGame, champion: int[] }, rsChampion: [{ season, conf: string|null }], confTournament: [{ season, conf: string|null }], mmWins: int|null }`

- Season lists are sorted and unique; each deeper list is a subset of the one before (`champion` ⊆ `titleGame` ⊆ `final4` ⊆ `elite8` ⊆ `sweet16` ⊆ `app`), checked by `superRefine`.
- `conf` is the conference code of the school's conference that season when the sheet's suffix names another (mapped to the `teams.json` group code); null otherwise.
- `mmWins` comes from the "Total MM Wins All-Time" tab; the importer compares it with the rounds and reports a disagreement rather than choosing.
- National and NIT titles, runner-ups and awards stay derived from the summaries (single source of truth); this doc holds what only the school sheet knows. The importer also cross-checks its `champion` lists against the national champions in the FBAJC workbook and reports differences.
- Appearances after S78 are derived from the app's own summaries and brackets, so the doc stops at S78. Because every season's round per school is known, the doc can also fill a "March Madness field" for seasons whose bracket is not transcribed.

## 4. Importers

`importers/run.ts` gains, all requiring `--data <dir>` (never `web/data` in tests; fixtures only):

- `--jc-history`: the FBAJC workbook tabs to season summaries (section 3.1), merging into any existing summary (S78 keeps its champion fields), never writing S79 or later. Reports: unresolved school names (an alias map like `SHEET_TEAM_ALIASES`, for example "Stephen F Austin", "Abeliene Christian", "Texas A&M"), unresolved players (kept as text), co-champion rows, seasons without any data.
- `--jc-schools`: the school history workbook (and the `Total MM Wins All-Time` tab) to `schoolHistory.json`; schools are matched by the full name in row 1 of each tab (the `School-<count>` header gives the check count).
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
- `/history/fbajc/schools` and `/history/fbajc/school/:teamId`: titles (national, NIT, conference regular season and tournament, preseason), runner-ups, the March Madness round reached each season (appearance, Sweet 16, Elite 8, Final Four, title game, champion), March Madness wins, awards by their players.
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
- Season win-loss records for schools before S79 (not in the sheets; the user confirmed the school workbook is the source).
- JC S45–S47-equivalent seasons (FBA S45–S47) have no college season; nothing to import.
- Anything under `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` and `web/data/**` is not modified by this part.

## 9. Tests and checks

- Name matching: the importer reports linked / text-only / ambiguous counts; with the real data the expected result is 411 of 414 linked before aliases and 414 after (three aliases above).

- RED first, `cleanup()` in `afterEach` for jsdom tests; schema tests (extended `JcSummary`, `JcSchoolHistoryFile`, `score` with OT); parser and builder tests on fixtures; importer tests on a temp copy (never `web/data`); JSON guard tests; page tests (home, championships, season with and without bracket, school page, switcher).
- `npx tsc --noEmit` prints nothing and `npx vitest run` passes; `web/data.test.ts` stays green.
- The cloud checkout has no `.superpowers/` scratch tooling, so browser checks (375px, dark mode, the 64-slot bracket) cannot run here and are listed as not done in the final report.
