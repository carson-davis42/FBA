# Part 4: FBAD2 history (design)

Approved 2026-09-30. Branch `fbad2-history`, base 23bcfcb.

## Goal

Bring the D2's past into the app the way part 3 did for the FBA. The work covers:

- the D2 season summaries S53–S78;
- each team's path through the leagues;
- D2 draft history;
- D2 history pages;
- D2 honours on player pages.

It also fixes the one thing 2b left behind: the app's D2 teams are still in their S78 leagues.

**Out of scope:**

- The "D2 World Cups" tab moves to part 5 (FBAWC).
- The "D2 Standings" tab is a blank template, so it isn't imported.

## Sources

The D2 history sheet is `16oZgCRFdQLF4NVOecz5lhS_xJXI4YTh-NDDM7gQCXAc`, downloaded as xlsx into `web/importers/.cache/`. It has these tabs:

| Tab | Content |
|---|---|
| Team League History | Rows grouped under the headers "Premier League", "World League", "United League" and "International League" (the team's current league). Each row is a team name, then cells like `Euro-South: S56-S67`, `PL: S68-S75`, `Est: S72` and `PL: S77-pres.`. Spells can share a season edge (`PL: S68-S71`, then `WL: S71-S73`). |
| D2 International Championships( | `Year \| Champion \| Runner-Up \| Series MVP \| Date` for S53, `S55(1)`, `S55(2)` and S56–S67. There is no S54. |
| D2 League Championships(S68-pre | One row per season S68–S78. Each has four blocks (PL, WL, UL, IL) of `Champion \| Runner-Up \| Series MVP \| Date`, separated by a blank column. A block of `X` cells means that league didn't exist yet (the IL before S72). |
| D2 Awards(S53-S67) | `Year \| D2 MVP \| D2-America Champions \| D2-America MVP \| Euro-West … \| Euro-East … \| Euro-South …`. MVPs are written `Name-D2(Team)`. A cell with co-champions reads `Toronto/San Jose`. `X` means none. |
| D2 Awards(S68-pres.) | `Year \| PL RS Champions \| PL MVP \| WL … \| UL … \| IL …`, in the same cell formats. |

The draft history sheet `1e3YJEurdTk5y2XKHQcgttCbknZZsJOB8RhR10_gG1W4` has the D2 tabs "S68 D2"…"S78 D2". Each row is `team | player | pos | age | rating`, with no header at the top. S68–S76 have no rating column. The header row `TEAM | PLAYER | POSITION | AGE | RATING` appears as the last row of some tabs and is skipped. Row order is pick order.

## Group codes

| Code | Name | Seasons |
|---|---|---|
| `D2` | D2 International Championship (the single D2 title) | S53–S67 |
| `AM` | D2-America | S53–S67 |
| `EW` | Euro-West | S56–S67 |
| `EE` | Euro-East | S56–S67 |
| `ES` | Euro-South | S56–S67 |
| `PL`, `WL`, `UL`, `IL` | Premier, World, United, International League | S68 on (IL from S72) |

The code-to-name map lives in one engine module (`engine/d2/groups.ts`), and both the importer and the pages use it.

## Data

### Season summaries: `leagues/fbad2/S<n>/summary.json`

There are 25 files: S53, S55 and S56–S78. They use the existing `SummaryFile` schema plus the additions below.

- **`champions[]`:** one entry per title.
  - S53–S67 have one entry: title "D2 International Champion", `group: 'D2'`. S55 has two: "D2 International Champion (1)" and "… (2)".
  - S68 on have one entry per league that season: title "Premier League Champion" etc. (matching the existing S78 file), with `group` set to the league code.
  - Each entry sets `champion`/`runnerUp` to the sheet's team name, and `teamId`/`runnerUpId` when the name matches a current D2 team (by `name` in `fbad2/teams.json`).
  - `finalsMvp` is the Series MVP's player id, or null when unresolved. `score` is null.
  - S78 keeps its existing titles and scores. The import only adds `group`, the ids and `finalsMvp`.
- **`rsChampions` (new, optional, D2 only):** `[{ group, teams: string[] }]`, holding the regular-season or division champions in sheet order. Co-champions get one element each. Groups marked `X` are left out. The schema refuses it on other leagues.
- **`awards[]`:** new `AwardId`s are added: `MVP-D2` and `MVP-AM`, `MVP-EW`, `MVP-EE`, `MVP-ES`. The league MVPs use the existing `MVP-PL/WL/UL/IL`.
  - `teamId` is the current D2 team id when the name in `-D2(Team)` matches, and otherwise the name itself. This follows the FBA imports, where `teamId` holds a name for teams that are gone.
  - S55: `MVP-D2` is listed twice, once for each half.
  - If an award's player can't be resolved, the entry is skipped and a warning is reported.
- **`locked: true`, `host: null`.** No standings, bracket or players are imported for these seasons.

The history loader and the pages treat an award listed twice in one season as two wins.

### League history: `leagues/fbad2/leagueHistory.json` (new)

```ts
{ teams: [{ teamId, founded: number | null, spells: [{ group, from, to: number | null }] }] }
```

- There is one entry per current D2 team. `founded` comes from `Est: S70`, and `to: null` marks `pres.`.
- Spells stay in sheet order, and shared edges are allowed.
- It's a strict zod schema, with a path rule in `schemaRegistry.ts`.
- The sheet's group names map to codes: `D2-America` → AM, `Euro-West` → EW, `Euro-East` → EE, `Euro-South` → ES, and `PL/WL/UL/IL` as written.
- A team's league for a season is the last spell that covers it.
- A pure helper, `leaguePath(history, summaries, teamId)`, returns the team's merged path:
  - the imported spells, then
  - for each app-played summary after S79 that has standings, the team's `group` that season.
  - Consecutive entries in the same group merge, e.g. `[{group:'ES', from:56, to:67}, {group:'PL', from:68, to:75}, …]`.

### D2 draft history: `leagues/fbad2/draftHistory.json` (new)

```ts
{ drafts: [{ season, picks: [{ pick, teamId | null, teamName, name, playerId | null, pos, age: number | null, rating: number | null }] }] }
```

- Picks are numbered 1..n in row order.
- Team names map to D2 ids by name. A name that doesn't match (e.g. Vancouver) keeps `teamId: null`.
- Player names resolve through `players.json` with the same name matcher the FBA draft import uses. An unresolved name gets `playerId: null` and a warning.
- The schema needs picks numbered 1..n and one draft per season.

### Current leagues: `leagues/fbad2/teams.json`

`--d2-leagues` sets each team's `group` to its `pres.` spell in Team League History. It changes nothing else, and it refuses to write when:

- a sheet team isn't in teams.json, or a teams.json team isn't in the sheet;
- a league would end up with a count other than 16.

It prints each move ("Mumbai WL → PL"). The user runs it once on real data. From S79→S80 on, promotion and relegation are applied by the existing "Go to next season" step.

## Import modes (`web/importers/run.ts`)

Both modes need `--data <dir>` (`requireDataDir`) and follow the existing one-mode-at-a-time rule.

- **`--d2-history`:**
  - Downloads the D2 sheet and the draft sheet.
  - Writes the 25 summaries (S78 merged as above), `leagueHistory.json` and `draftHistory.json`.
  - Needs `players.json` and `leagues/fbad2/teams.json`.
  - Prints a report of unresolved players and team names.
  - The parsers are pure functions in `web/importers/sheets/d2History.ts` and `web/importers/sheets/d2Drafts.ts`, taking `string[][]` tabs.
- **`--d2-leagues`:** as described above. The parser is shared with `--d2-history`.

Before the browser check, the importers are dry-run read-only against the cached sheets (scratch script under `.superpowers/sdd/`). Every row must parse, the schemas must pass, and every unresolved name gets listed.

## Pages (`/history/fbad2/…`)

The pages live in `web/app/history/d2/`. They reuse `useHistory('fbad2')`, `TeamName`, the stat table, cards, badges and the site-look heroes and sub-nav. The History home gets an **FBA | D2** switch, which also shows on the D2 pages. The routes are added in `app/shell/Layout.tsx`.

- **Championships (`/history/fbad2/championships`):** one row per season, newest first, showing each title's group, champion, runner-up and Series MVP (a player link). S55 shows both halves.
- **Awards (`/history/fbad2/awards`):** one row per season with the MVPs (D2 MVP and division MVPs before S68, league MVPs from S68) and the regular-season champions.
  - Regular-season champions come from `rsChampions`. For app-played seasons without it, they come from each group's rank-1 standings row.
  - A small "Most MVPs" list counts every D2 MVP award by player.
- **Season (`/history/fbad2/season/:season`):** the titles, the regular-season champions and the MVPs.
  - When the summary has standings, bracket or promotion (seasons played in the app), those sections render too, reusing the 2b components the FBA season page uses.
  - Prev and next links step through the seasons that exist.
- **Teams (`/history/fbad2/teams`):** 64 cards grouped by current league, each showing titles won.
- **Team (`/history/fbad2/teams/:teamId`):** a hero, then a **league path** strip (group chips with season ranges, from `leaguePath`), then a trophy case:
  - titles by group, with seasons;
  - finals lost;
  - regular-season titles;
  - MVPs won by the team's players (award `teamId` = this team);
  - Series MVPs;
  - the team's D2 draft picks (season, pick, player).
- **Drafts (`/history/fbad2/drafts` and `/history/fbad2/drafts/:season`):** the season list and a picks table (pick, team, player, pos, age, rating).
- **Player pages (`/history/fba/players/:playerId`):** a **D2 honours** block, shown when the player has any:
  - D2, division and league MVPs (season, team);
  - Series MVPs (season, title);
  - D2 draft slots (season, pick, team).
  - A player with D2 honours but no FBA career still gets a page. The FBA sections show their empty states.

Team names without a current D2 id (Toronto, Vancouver, Maine, Pearland, Syracuse, Orlando, Atlanta) render as plain text.

## Also in this part

The 3c roadmap row still says "The user runs the three imports on real data". Change it to say the imports were run and committed in 23bcfcb. Then add the part 4 row and a spec link.

## Testing

- **Parsers:** unit tests on small hand-built tabs for:
  - the `Name-D2(Team)` cells, co-champions, `X`, `S55(1)`/`S55(2)` and the missing S54;
  - the four-block championship row;
  - spells with shared edges and `Est`/`pres.`;
  - draft tabs with and without the rating column, and the trailing header row.
- **Schemas:** `rsChampions` refused outside the D2; the new files' path rules; `web/data.test.ts` still passes.
- **Helpers:** `leaguePath` merging, and the league-for-season rule.
- **`--d2-leagues`:** the refusal rules and the 16-per-league check.
- **Pages:** jsdom tests for each D2 page and the D2 honours block, using stub docs (`cleanup()` in `afterEach`).
- **Browser check:** on scratch data (5183/5184). Run `--d2-leagues` and `--d2-history` against the scratch copy, then text-read every D2 history page plus 375px and dark mode.
