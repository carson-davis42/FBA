# Part 3b: FBA careers, awards by player and the Hall of Fame

Part 3 is split into 3a (season history, done), **3b (this spec)** and 3c (trophy cases, draft history, transactions, events).

3b adds three things:
- career views built from the Players-tab bios plus the seasons played in the app;
- award counts by player;
- the Hall of Fame as a History page with structured cards, and nominee career lines built from the full career.

## Decisions

| # | Decision |
|---|---|
| K1 | **The Players tab wins.** For a player's own career (stints and honour counts up to S78), the bio in `playerBios.json` overrules every other tab. Other tabs are used to cross-check it and to fill in only for players without a bio. Every disagreement is listed in the import report, and a big one is a warning (see "Cross-checks"). |
| K2 | **Computed at read time.** Career data is computed when a page reads it, from the bios, the summaries, `awardCounts.json` and the Hall of Fame doc. No running career total is stored or updated at wrap-up. |
| K3 | **Award baseline.** `leagues/fba/awardCounts.json` holds each player's resolved award counts through S78 (K1 rule: the bio first, then tab 11 "FBA Awards won by Player", then the summaries). S79 onward is always counted from the summaries. |
| K4 | **Stats.** Per-season player stats exist only from S79 on. The only earlier stats are S78 PPG from `FBA/League-Points-Stats.txt`, imported into the S78 summary as `legacyPpg` and shown as an S78 row with PPG only. Career stat totals are labelled "since S79". |
| K5 | **Hall of Fame route.** The Hall moves to `/history/fba/hall-of-fame` as a read-only page. `/league/fba/hall-of-fame` stays the offseason tool for nominees and induction; its Hall tab is replaced by a link to the History page. The sidebar's Hall of Fame link goes to the History page. |
| K6 | **Cards keep their text.** The stored `lines` of an inducted card stay the official record. The restyle only groups them (stint lines, then honours) and links the name. |
| K7 | **Nominee prefill** uses `careerLines(liveCareer(...))`, replacing the 7b `<team>: …-S<n>` stub. |
| K8 | **App-era stints are FBA only.** In 3b, careers from S79 on come from FBA summaries only. D2, World Cup and college stints from S79 on wait for parts 4–6. |
| K9 | **Duplicate players are merged.** When exactly one Players-tab row matches two or more `players.json` records, they are one player. `--history` merges them into one record, rewrites every reference to the kept id, and uses the Players-tab spelling (see "Duplicate players"). Known cases: Nadeem Akers (p00040 and p00150) and Jamari O’Neal (p00609 and p01913). |

## Sources

- **Players tab** (bios; already imported in 3a as `playerBios.json` entries, exactly as written).
- **Main sheet tab "FBA Awards won by Player"** (tab 11): pairs of columns, one pair per award.
  - Each header is `<Award>(S<first season>)`: `MVP(S1)`, `ASG(S48)`, `ASG MVP(S48)`, `All-FBA T1(S48)`, `All-FBA T2(S48)`, `PPK Award(S57)`, `LP Award(S57)`, `MC Award(S57)`, `DPOY(S57)`.
  - The first column of a pair is the name and the second is the count (e.g. `10.0`).
- **`FBA/League-Points-Stats.txt`** (read-only input): after the `Points Per Game:` header, the lines are `N. Name(rating)(TEAM): ppg`, for example `1. Harper Holland(98)(OAK): 43.4`. There are 150 lines.

## Bio grammar (`parseBio`)

A bio is `born` plus `entries[]`. Each entry is one of these:

| Kind | Pattern | Examples |
|---|---|---|
| Stint | `<team>-<range>` | `Wake Forest-S63`, `CIN-S64-S69`, `CP-S68-pres.`, `SOX - FFL-FFL`, `WC(Germany)-S56-S58;S62`, `D2(Milan)-S53-S56`, `FP/MON-S6-S25`, `?-S19-S34` |
| Count | `<n>x <label>` | `6x All-Star`, `1x FBA C-Ship MVP`, `2x EC Champion` |
| Single season | `S<n> <label>` | `S65 ROTY`, `S75 MIP`, `S63 FOY` |
| Hall of Fame | `HOF-S<n>` or `HOF-FFL` | `HOF-S77` |
| Other | anything else | kept as written and shown as a plain line |

**Stints:**
- The range is one or more `;`-separated parts. Each part is `<a>` or `<a>-<b>`, where `a` and `b` are `S<n>`, `FFL` or `pres.`. `pres.` means "still there as of S78".
- **The kind comes from the team token:**
  - `WC(<country>)` is `wc`;
  - `D2(<city>)` is `d2`;
  - a token whose `/`-separated parts are each `?` or match `^[A-Z][A-Za-z0-9.]{0,4}$` is `fba`;
  - anything else is `college`.
- Count and single-season entries belong to the stint above them. An entry before the first stint belongs to no stint and is kept under "Other".
- Labels are matched case-insensitively (`FBA champion` = `FBA Champion`).

**Award keys.** These bio labels map to award keys, counted in FBA stints only:

| Key | Bio label |
|---|---|
| MVP | `MVP` |
| ROTY | `ROTY` |
| PPK | `PPK Award` |
| LP | `LP Award` |
| MC | `MC Award` |
| DPOY | `DPOY` |
| MIP | `MIP` |
| ALL_FBA_1 | `All-FBA T1` |
| ALL_FBA_2 | `All-FBA T2` |
| ALL_STAR | `All-Star` |
| YOUNG_STAR | `Young-Star` |
| ASG_MVP | `ASG MVP` |
| YSG_MVP | `YSG MVP` |
| FINALS_MVP | `FBA C-Ship MVP` |
| CHAMPION | `FBA Champion` |
| CSHIP_APP | `FBA C-Ship app.` |
| CONF_CHAMPION | `EC Champion` or `WC Champion` |

`FIVE_POINT` and `DUNK` never appear in bios; they come from the summaries only.

## Data

**`leagues/fba/awardCounts.json` (new):**
- Shape: `{ league: 'fba', throughSeason: 78, counts: { playerId, key, count }[] }`, where `count` is 1 or more.
- It has a strict schema and a path rule; `(playerId, key)` must be unique.
- **Written by `--history`:**
  - A player with a bio gets the bio sums for every key.
  - A player without a bio gets tab 11 for its keys (ASG → ALL_STAR), and the summaries for the rest.

**The S78 summary** gains an optional `legacyPpg: { playerId, teamId, ppg }[]`.
- It is written by `--history` from the txt file and is a field the importer owns.
- Names are matched as in 3a; an unmatched name is a report warning and is skipped.

## Duplicate players (K9)

This is the first step of `--history`, before bios are matched. It is a pure function, `mergeDuplicates(docs, bios)`, tested on in-memory docs.

- **Groups:** records are grouped by `normName` (3a H3). A group of two or more records whose name appears on exactly one Players-tab row is a duplicate group. When the Players tab has two or more rows with that name, the group stays ambiguous and is reported as in 3a.
- **The kept record:**
  1. the record whose `birthSeason` equals the bio's born season;
  2. else the one with a non-null `birthSeason`;
  3. else the lowest id.
- **The merged record:**
  - `name` is the Players-tab spelling;
  - `birthSeason` is the bio's, or else the kept record's;
  - every other field comes from the kept record, and a field that is null there is filled from a dropped record.
- **References:** every JSON document under `<data>` except `players.json` is walked. Each string value, and each object key, that exactly equals a dropped id is replaced by the kept id. The dropped ids are removed from `players.json`.
- **Safety:**
  - Every rewritten document must still pass its registry schema.
  - A document where the same id would now appear twice in a place that must be unique (for example, both records on one roster) fails its schema. That is a `report.error`, and nothing at all is written.
- **Report (section `duplicates`):** `Merged <name>: p00150 → p00040 (<n> references in <m> files)` as info.
- **Rerun:** a rerun finds no groups, so the merge step is idempotent.

It runs only through the user-run `--history --data <dir>`. Tests and browser checks use scratch data.

## Cross-checks (import report, section `careers`)

**Checks against the bio:** for each player with a bio, the importer compares the bio sum with:
- tab 11, for its nine keys;
- the summaries, for MVP, ROTY, PPK, LP, MC, DPOY, MIP, All-FBA 1/2, ASG MVP, YSG MVP and Finals MVP, counted over S1–S78.

**Severity:**
- A difference of 1 is info: `<name> <KEY>: bio 3, tab 11 4`.
- A difference of 2 or more, or 0 on one side against 1 or more on the other, is a warning.

**Other report lines:**
- Tab 11 names that match no player are warnings.
- Bio entries that parse as "Other" are listed as info, one line per distinct text.
- The report ends with a count per severity.

## Engine (`engine/history/career.ts`, pure)

```ts
type StintKind = 'college' | 'fba' | 'd2' | 'wc';
interface Stint { kind: StintKind; team: string; range: string /* as written, or built for app seasons */; from: number | null; to: number | 'pres' | null;
  honours: { label: string; count: number; seasons: number[] /* for single-season entries */ }[] }
interface Career { stints: Stint[]; hof: string | null; other: string[] }
function parseBio(bio: PlayerBio): Career
function liveCareer(bio: PlayerBio | null, playerId: string, summaries: SummaryFile[], hof: HallOfFameFile | null): Career
function awardTotals(playerId: string, baseline: AwardCountsFile | null, summaries: SummaryFile[]): Record<AwardKey, number>
function careerLines(career: Career): string[]
function careerStats(playerId: string, summaries: SummaryFile[]): { rows: SeasonRow[]; total: { gp: number; pts: number; ppg: number } /* since S79 */ }
```

**`liveCareer` rules:**
- It starts from `parseBio(bio)`, or an empty career when there's no bio.
- For each FBA summary with a season of 79 or later, in order, and each of the player's lines in `stint` order:
  - If the last FBA stint has the same team (compared to the line's `teamId`) and is open (`pres`) or ended the season before, it is extended to this season.
  - Otherwise an open stint is closed at its last season (`pres` becomes 78 for bio stints), and a new FBA stint opens.
- **Honours from S79 on** are added to the stint holding that team in that season:
  - awards, All-FBA and Finals MVP from the summary;
  - `allStars` and `youngStars` selections;
  - `asgMvp` and `ysgMvp`;
  - CHAMPION when the player has a line with the champion's `teamId`, and CSHIP_APP for either finalist;
  - CONF_CHAMPION for the conference champions.
  - A count label is incremented if it's already there, and appended if not. Single-season labels (ROTY, MIP) are added as `S<n> <label>`.
- `hof` comes from the bio's `HOF-` entry, or else from the Hall class that holds the player.

**`awardTotals`:** the baseline counts, plus each key counted from the summaries for seasons after `throughSeason`.

**`careerLines`** (the HOF card format):
- First, one line per college and FBA stint, `<team>: <range>` with `-` between seasons, e.g. `Alabama: S64` or `FLO: S65-S76`.
- Then the FBA-stint honours, summed across stints by label, in first-seen order, as `<n>x <label>`. Single-season labels are kept as `S<n> <label>`, and `EC Champion` and `WC Champion` are merged into `Conference Champion`.
- D2 and WC stints and college honours are left out.

**`careerStats`:**
- The S78 `legacyPpg` row: team and PPG, with GP and PTS as null.
- Then one row per S79+ line: regular season GP, PTS, PPG, and the playoff totals.
- The total is over S79+ only.

## Pages

**Player page** (`/history/fba/players/:id`, changed):
- The raw bio list is replaced by **Career**:
  - college stints first;
  - then a table of pro stints (League, Team, Seasons, Honours), with D2 and WC stints labelled in the League column;
  - the Other lines;
  - `Hall of Fame: S77` when set.
- **Awards:** chips for each non-zero `awardTotals` key (`3× MVP`).
- **Seasons:** the S78 PPG row is added, and the total row reads `Career (since S79)`.
- Honours by season (3a) stay.

**Awards by player** (`/history/fba/awards/players`, new; also linked from the Awards page and the hub):
- One row per player with any award.
- Columns: Player, MVP, ROTY, PPK, LP, MC, DPOY, MIP, T1, T2, ASG, YSG, ASG MVP, YSG MVP, Finals MVP, Champion, 5-pt, Dunk.
- Sorting: MVP descending by default; clicking a header sorts by that column (descending, ties by name).
- The table scrolls sideways inside its own box at phone width.

**Career leaders** (`/history/fba/leaders`, new):
- Three tables for S79 on: PTS, GP, and PPG (minimum 40 games).
- The top 25 of each, with player links.

**Hall of Fame** (`/history/fba/hall-of-fame`, new, read-only):
- Classes are listed newest first.
- Each card shows:
  - the name, linked when `playerId` is set;
  - `Retired <retiredSeason>`;
  - a **Career** block: lines matching `^[^:]+: (S\d+|FFL)(-(S\d+|FFL|pres\.))?$`;
  - an **Honours** list: the rest, in stored order.
- It's a responsive card grid.

**The offseason HOF page:** its Hall tab becomes a link, and the Nominees tab and tools are unchanged. The candidate prefill uses K7.

The **History hub** gains the links Awards by player, Career leaders and Hall of Fame.

## Error handling

- A missing `awardCounts.json` (404) makes the baseline null: counts come from the summaries only, and the Awards-by-player page says `Award counts before S79 haven't been imported`.
- A missing bio means an app-only career.
- A missing Hall doc means an empty Hall with `No one has been inducted yet`.
- Summaries that fail validation are shown with the 3a skipped-seasons warning.

## Testing

**`parseBio`** on real rows:
- Akeem Naylor: 3 FBA stints with counts, and `HOF-S77`.
- Payton Atkinson: college, `pres.`-free FBA stints, and WC Champion counts.
- Julien Shannon: `CP-S68-pres.`.
- Cameron Lučić: `S75 MIP`.
- `SOX - FFL-FFL`, `WC(Germany)-S56-S58;S62`, `FP/MON-S6-S25` and an Other entry.

**`liveCareer`:**
- The same team in S79 extends `pres.`.
- A team change closes it at S78 and opens a new stint.
- A player without a bio gets app-only stints.
- S79 honours are added to the right stint.

**`careerLines`:** it matches the stored Atkinson card's stint and count lines (conference merge, D2/WC and college honours dropped).

**Importer:**
- the tab 11 parser;
- the txt PPG parser;
- counts resolved per K1 with and without a bio;
- the severity of each cross-check;
- `legacyPpg` written and idempotent.
- **`mergeDuplicates`:**
  - the kept record is chosen by birth season;
  - references are rewritten in values and in keys;
  - the Players-tab spelling (curly apostrophe) is kept;
  - two Players-tab rows with one name stay ambiguous;
  - a merge that breaks a schema writes nothing;
  - a second run changes nothing.

**Pages** (in the 3a style):
- the Awards-by-player sort and the missing-baseline note;
- the leaders' PPG minimum;
- HOF card grouping and links;
- the player page Career table and the S78 row;
- the offseason Hall tab is a link;
- the prefill uses the career lines.

**After the tasks:** a scratch browser check with a scratch `--history` run, as in 3a.
