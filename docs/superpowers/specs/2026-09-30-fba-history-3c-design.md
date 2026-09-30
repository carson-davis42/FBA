# FBA history 3c: trophy cases, draft history, transactions, events

Part 3c of the FBA web app (roadmap §10 of `2026-09-25-fba-web-design.md`). Built as one part on branch `fba-history-3c` (user, 2026-09-30).

## Decisions

- **T1 Trophy cases are derived, not imported.** An engine function computes each franchise's case from the season summaries, `leagues/fba/hallOfFame.json` and `leagues/fba/franchises.json`. It stays current as S79+ seasons finish. The team history sheet's per-franchise tabs are only a cross-check (`--check-trophies`, read-only).
- **T2 Draft history** covers the draft sheet's FBA draft tabs S49–S79 (including "Undrafted" rows) and the expansion drafts (tabs `S59 Exp`, `S61 Exp`, `S63 Exp`, `S68 Exp`, `S75 exp`). The D2 draft tabs wait for part 4. Future-pick tabs (S80–S83) and `S79 Draft Board` are ignored. App drafts (S80 on) are read from `leagues/fba/S{n}/draft.json`.
- **T3 Past transactions** come from the main sheet's Transactions tab (S33 on) as structured entries. The per-team "Traded Away" / "Traded For" lines repeat the trades and are dropped. Moves made in the app are read from the existing `leagues/fba/S{n}/transactions.json` docs.
- **T4 Events** is a league timeline. Each season shows derived milestones (champion, expansion teams, renames/relocations from the franchise eras), the Events tab's notes, and that season's rule changes. The rule changes are hand-curated once from `docs/fba-rule-changes.md` into a committed source file.
- **T5 New data is written only by import modes** that take `--data <dir>` (via `importers/dataArg.ts`). The user runs them on the real data. Tests and checks use fixtures or a scratch copy.
- **T6 Team codes over time:** the sheets and summaries use historical abbreviations (USA = San Antonio S1–S56, CT = Cal Tech, CP = Former Pirates…). A new `franchiseByAbbr(file, abbr, season)` in `engine/shared/franchises.ts` maps an era abbreviation to the current `teamId`. When no era matches, it falls back to an exact current `teamId` match.

## 1. Data documents

All are strict zod schemas in `engine/shared/types.ts`, with path rules in `schemaRegistry.ts`. None exist in the committed data until the user runs the imports. `data.test.ts` must still pass.

### 1.1 `leagues/fba/draftHistory.json` (`npm run import -- --drafts --data <dir>`)

```ts
DraftHistoryFile = { drafts: DraftHistoryDraft[] }            // sorted by season, then draft before expansion
DraftHistoryDraft = { season: int, kind: 'draft' | 'expansion', picks: DraftHistoryPick[] }
DraftHistoryPick = {
  pick: int.positive() | null,     // row order among drafted rows; null = undrafted
  teamId: string | null,           // current franchise id; null when undrafted or unresolved
  teamName: string | null,         // the sheet's text, e.g. "Cypress G" (kept for display when unresolved)
  viaTeamId: string | null,        // "(via OV)" resolved through franchiseByAbbr
  name: string,                    // sheet spelling
  playerId: string | null,         // via importers/history.ts nameResolver
  pos: string,                     // PG..C, or old IN/MID/OUT
  detail: string | null,           // class ("Freshman", "2xSenior", "S39", "X") or age for expansion drafts
  college: string | null,          // "HS" kept as text
}
```

Parsing rules (`importers/sheets/drafts.ts`):
- A row is `TEAM | PLAYER | POSITION | CLASS-or-AGE | COLLEGE`. The header row (`TEAM | PLAYER | …`, wherever it sits) and blank rows are skipped.
- Team text `Name(via X)` splits into the name and the via abbreviation. `Undrafted` gives `pick: null, teamId: null`.
- Team names are era city names, not always a full name ("Seattle", "Cal Tech", "Cypress G", "Cypress B", "Former Pirates", "DCB"). Resolve with `franchiseAt(file, name, season)`, then a prefix/city match against that season's eras, then an alias table in the parser for sheet shorthands ("Cypress G" → Green Guns, "Cypress B" → Black Sox). If nothing matches, set `teamId: null` and report it.
- The import prints counts per draft and lists every unresolved team and player. It refuses to write when the schema fails.

### 1.2 `leagues/fba/pastTransactions.json` (`--transactions --data <dir>`)

```ts
PastTransactionsFile = { seasons: { season: int, entries: PastTransaction[] }[] }
PastTransaction =
  | { kind: 'trade', teamIds: string[], when: string | null, notes: string[], moves: PastMove[] }
  | { kind: 'cut' | 'released' | 'signed' | 'acquired', teamId: string, when: string | null, asset: PastAsset }
PastMove = { to: string /* teamId */, asset: PastAsset }
PastAsset = { text: string /* verbatim, e.g. "S79 Draft Pick(via MIL)(6P)" */, pos: string | null, name: string | null, playerId: string | null }
```

Parsing rules (`importers/sheets/transactions.ts`). Only column A (a header or kind) and column B (an asset or timing) matter.
- The key rows before the first season header are skipped. `S<n>` alone starts a season.
- A header with `/` (`CGG/USA`, `MON/SAS/SEA`) starts a trade, and column B is its `when` ("Before Week 7"). Following `->TEAM | asset` rows are moves. Other rows inside a trade (e.g. `S78 Pick Swap | DCB GB`) join `notes` as "A — B".
- A header that is a single team code starts a team block. Its column B, if any, is `when` for the block. The following rows are `Cut | Released | Signed | Acquired` plus an asset. `Traded Away` / `Traded For` rows are skipped and counted in the report.
- Asset `POS-Name` (POS in PG, SG, SF, PF, C, IN, MID, OUT) gives pos and name, with the player resolved by name. Any other asset (picks) keeps only `text`.
- Team codes resolve through `franchiseByAbbr(abbr, season)`. An unresolved code keeps the raw code as the id and is reported.
- The report prints per-season counts and every unresolved team and player.

### 1.3 `leagues/fba/events.json` (`--events --data <dir>`)

```ts
EventsFile = {
  before: { label: string, notes: string[] }[],   // FFL rows that carry a note, e.g. "FFL S20": ["FFL Basketball Begins"]
  seasons: { season: int, notes: string[], rules: string[] }[],  // only seasons with notes or rules
}
```

- Notes come from the Events tab. Column A is `FFL S<n>` or `S<n>`; the later columns hold the notes.
- Rules come from the committed `web/importers/history/ruleChanges.json` (`{ season: int, lines: string[] }[]`). It is hand-curated from `docs/fba-rule-changes.md`: each dated rule goes under its season, and the undated opening rules go under season 1. The text keeps the doc's wording and is trimmed of layout-only lines. A test checks that the file parses and its seasons ascend.

## 2. Trophy case (engine)

`engine/history/trophies.ts`:

```ts
trophyCase(teamId, { summaries, franchises, hallOfFame }): TrophyCase
TrophyCase = {
  championships: number[], finals: number[] /* champion or runner-up */, confTitles: number[],
  tournaments: number[], awards: { award: string, playerId: string, season: number }[],
  hallOfFamers: { name: string, playerId: string | null, season: string /* class, e.g. "S8" */ }[],
}
```

- **Champions and runners-up:** the FBA champion row of each summary. Use `teamId` / `runnerUpId` when set, else resolve the names with `resolveHistoryTeam` (as the history pages do).
- **Conference titles:** `confChampions` E/W names when present (regular-season titles), else the standings rows with `rank === 1` in each `group`.
- **Tournament appearances:** standings rows with `playoff !== null`, else the team names in `pastBracket.series` sides, else `bracket.seeds` teamIds. Seasons with none of these add nothing.
- **Awards:** summary `awards` (MVP, ROTY, PPK, LP, MC, DPOY, MIP) whose `teamId` maps through `franchiseByAbbr(teamId, season)` to this franchise.
- **Hall of Famers:** inductees whose first line starts `CODE:` with CODE mapping to this franchise, using the class season.
- All lists are sorted ascending. Pure; unit-tested on small fixtures.
- **`--check-trophies`** (read-only, needs `--data <dir>` to read) parses the team tabs' count row (row 2: Championships, C-Ship app., Conference Titles, FBA Tourny app., MVP's, PPK, LP, MC, DPOY's, MIP's, ROTY's, Hall of Famers) and prints a table of every franchise and column where the derived count differs. It writes nothing.

## 3. Pages

All are under the History section, use the existing card, table and chip styles (`history.css`), and show era names and logos via `TeamFull`.

- **History home:** four new cards: Teams, Drafts, Transactions, Timeline.
- **`/history/fba/teams`:** a card grid, one card per franchise in `franchises.json`. Each shows the current logo and name, with counts of titles, Finals and conference titles.
- **`/history/fba/teams/:teamId`:**
  - A hero with the current logo and name.
  - An **era strip**: one tile per era, newest first, with that era's logo(s) from the logo manifest for its season range, the name, abbreviation, city and "S57–pres.".
  - The trophy case: sections for Championships, Finals appearances, Conference titles and Tournament appearances. Seasons show as chips linking to `/history/fba/season/:n`. Awards are grouped by award, with the winners linked to their player pages. Then the Hall of Famers.
  - A "Draft picks" table of this franchise's picks, and a link to Transactions filtered to it.
  - Empty sections show "None yet". A missing `franchises.json` shows the empty state with the import hint.
- **FBA team page** (`/league/fba/team/:teamId`): a "Franchise history" link.
- **`/history/fba/drafts`:** season chips for each draft. **`/history/fba/drafts/:season`:** the pick table (Pick, Team with "via", Player link or plain name, Pos, Class, College), then an Expansion draft section when present, then an Undrafted list. Seasons from S80 on come from `draft.json` (locked picks with their prospect details).
- **Player history page:** a "Drafted S49, #3 by <team>" line (or "Undrafted, S68") when the player appears in draft history.
- **`/history/fba/transactions?season=&team=`:** a season select (newest first) and a team filter. Trades show as cards (teams, timing, one line per receiving team, notes). Team moves show in a table (Team, Move, Player/asset, When). For app seasons, the `transactions.json` entries show as lines.
- **`/history/fba/events`:** a timeline, newest season first. Each season block shows the champion, expansion franchises (an era starting that season with no earlier era), renames and relocations (a new era of an existing franchise), the notes, then the rules as a list. A "Before the FBA" block closes the list.

## 4. Errors and edge cases

- A missing import doc shows the page's empty state with the command to run (the same pattern as the other history pages).
- The imports never touch other docs. Each validates its output against its schema before writing, and refuses otherwise.
- An unresolved team or player is shown by its sheet text, without a link.

## 5. Testing

- Parser tests on small fixture rows for drafts, transactions, events and the team-tab count row.
- `franchiseByAbbr` and `trophyCase` unit tests.
- Schema tests for the new doc types, and a registry path test.
- Page tests (jsdom, `cleanup()` in `afterEach`) for each new page and the player-page line.
- Browser check on scratch data (5183/5184), with the three imports run against the scratch copy.
