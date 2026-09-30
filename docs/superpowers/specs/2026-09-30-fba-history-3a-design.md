# Part 3a: FBA season history and players

Part 3 is split into three parts:

- **3a (this spec):** season history and the player directory, plus the Finals MVP, D2 Series MVP and YSG MVP picks in the app.
- **3b:** career stat totals, award counts by player, the HOF page restyle and nominee career lines rebuilt from full history.
- **3c:** team trophy cases with era logos, draft history, transactions and events.

The brackets PDF also holds 42 D2 pages and 52 FBAJC pages; those wait for parts 4 and 6.

## Decisions

| # | Decision |
|---|---|
| H1 | History lives in the locked `leagues/fba/S<n>/summary.json` files. A new user-run importer flag, `--history`, writes S1–S77, merges into the imported S78 summary, and never touches S79 or later. Rerunning it rewrites only the fields it owns. |
| H2 | Every name on the main sheet's **Players** tab gets a player record. Any name missing from `players.json` is added with `birthSeason` taken from `parsePlayersTab`, which gives null for FFL births. |
| H3 | Player names are matched on normalised text: trimmed, curly apostrophe changed to `'`, accents stripped, lowercased. The Players tab spelling wins. A name that matches two or more records, or none, is listed in the report, and the line that refers to it is skipped. |
| H4 | Historic teams are stored by the name and abbreviation of their era (`"Former Pirates"`, `"FP"`). Franchise lineage waits for 3c. |
| H5 | Scores use an en dash (`"4–1"`). The importer writes en dashes, including when it rewrites S78's `"4-1"`, and `formatScore()` turns either dash into an en dash for display. |
| H6 | `GET /api/history/<lg>` parses each summary with `SummaryFile.safeParse`. A summary that fails (bad JSON or schema) is left out of `seasons` and listed in `errors`. The response is `{ league, seasons, errors: { season, message }[] }`. |
| H7 | The FBA "Elite Tournament" pages in the brackets PDF are transcribed once into a committed source file, `web/importers/history/fbaBrackets.json`. The importer copies each season into `summary.pastBracket`. |
| H8 | Transcribed brackets render with the same series-box look as app brackets: the top half is on the left, the final is in the centre, and the bottom half is mirrored on the right. |
| H9 | All-FBA teams from before the current format keep their own slot labels. |
| H10 | The app now picks a Finals MVP for the FBA and a Series MVP for each D2 league final. The commissioner chooses it on a card that lists the champion's players with their Finals points per game (see "Picking in the app"). The World Cup "Tournament MVP" and the FBAJC "C-Ship MVP" wait for parts 5 and 6. Seasons played before this part show `—`. |
| H11 | The YSG MVP is picked automatically: the player on the tournament-winning team with the most points across the whole tournament (semi and final). A tie goes to a dice roll-off. |
| H12 | Wrap-up now also saves the ASG winner and losing team, the YSG winner and the YSG MVP into `summary.allStar`, in the same text form as imported seasons. |

## Sources

These are all xlsx exports. The main sheet is `1p5oLB9l…` and the past-standings sheet is `1FuPd67V…`. Cells equal to `X` or empty mean none.

| Tab | Rows | Columns used |
|---|---|---|
| Championships | S1–S78 | A season, C champion, D runner-up, F series score, G Finals MVP |
| Awards, Conference Titles, & AS | S1–S78 | Headers name the columns: WC Champion, EC Champion, MVP, ROTY, PPK Award, LP Award, MC Award, DPOY, MIP, ASG Winner, ASG Losing Captain, ASG MVP, YSG, YSG MVP, 5pt Contest, Dunk Contest. Columns are found by header text, not by position. |
| All-FBA Teams | S48–S78 | A season-header row `S<n>`, then one row per slot: B label, C Team 1, D Team 2 |
| Players | about 1,336 | A name, B `Born-S<n>` or `Born-FFL S<k>(-<n>)`, C onwards the career entries |
| Past standings, tabs S71–S78 | 15 per conference | B rank, C name, D W, E L (East); G rank, H name, I W, J L (West) |

- **Series scores:** when the score cell is a number, it's an Excel date serial that Google turned into a date. Decode it to `<month>–<day>`: 43862 is 2020-02-01, so `"2–1"`, and 45384 is 2024-04-02, so `"4–2"`. When it's text, keep it as text and apply H5.
- **Player strings:** `Name-ABBR` is split at the last hyphen, so `Paulo Pierre-Kent-CGG` gives `Paulo Pierre-Kent` and `CGG`. ASG and YSG winner and loser cells (`Team Julien Shannon`, `Western Conference`) are stored as text.
- **All-FBA slot orders, per team:**

| Seasons | Slots |
|---|---|
| S48–S57 | OUT, MID, IN, ANY |
| S58–S66 | OUT, MID, M2, IN |
| S67 | G, G, F, F, C |
| S68 on | G, F, C, ANY, ANY |

## Data shapes

The summary changes are all optional, so existing files and app-written summaries stay valid.

```ts
Champion += { finalsMvp?: playerId | null }
SummaryFile += {
  confChampions?: { E: string | null; W: string | null } | null,   // team names of that era
  pastBracket?: PastBracket | null,
}
// SummaryFile.allFba uses PastAllFbaTeams instead of AllFbaTeams. AwardsFile keeps AllFbaTeams and today's order.
PastAllFbaTeams = { team1: PastAllFbaSlot[], team2: PastAllFbaSlot[] }
PastAllFbaSlot  = { slot: 'G'|'F'|'C'|'ANY'|'OUT'|'MID'|'M2'|'IN', playerId: string | null, teamId: string | null }
// Both teams must follow one of the four slot orders above, and both must use the same one.
SummaryAllStar += { asgWinner?: string|null, asgLoser?: string|null, ysgWinner?: string|null, ysgMvp?: playerId|null }
// Imported All-Star blocks have allStars: [], youngStars: [] because the sheet has no rosters.
SummaryStanding: confW, confL, diff become nullable (null on imported rows)

PastBracket = { rounds: int 1..5, series: PastSeries[] }
PastSeries = {
  id: 'R<round>-<k>',       // k counts 1.. from the top within its round
  round: int,
  home: PastSide | null,    // upper slot; null = BYE
  away: PastSide | null,    // lower slot; null = BYE
  homeWins: int 0..4, awayWins: int 0..4,
  winner: 'home' | 'away',
}
PastSide = { name: string, record: string | null /* "56-24", or "W-L-T" such as "5-1-1"; regex ^\d+-\d+(-\d+)?$ */, seed: int 1..16 | null }
```

`PastBracket` rules, checked by the schema:

- Round r has 2^(rounds − r) series.
- The winner of `R<r>-<k>` appears as a side of `R<r+1>-<ceil(k/2)>`: the home side when k is odd, the away side when k is even.
- A BYE series has exactly one null side, 0–0 wins, and the winner is the side that is there.
- A non-BYE series has winner wins greater than loser wins.

New document `leagues/fba/playerBios.json`, with a strict schema and a registry path rule:

```ts
{ league: 'fba', bios: { playerId, born: string /* raw column B */, entries: string[] /* columns C.., raw, in order */ }[] }
```

`bios` is unique by `playerId`.

## Picking in the app

New schema fields are optional, so saved docs stay valid.

```ts
PlayoffsFile.outcome.champions[] += { finalsMvp?: playerId | null }   // null or absent = not picked yet
AllStarFile.ysg += { mvp?: playerId, mvpRollOff?: RollOff | null }
```

**Finals MVP (FBA) and Series MVP (each D2 league)**

- Once `outcome` is set, the Playoffs page shows one card per champion: "Finals MVP" for the FBA, "<League> Series MVP" for the D2.
- The card lists every champion-team player who has a box line in that final's games (`FINALS` for the FBA, `<group>-F` for the D2). Columns are Player, GP and PPG (one decimal). Rows are sorted by PPG, highest first, then by name.
- Each row has a Pick button. The engine move `pickFinalsMvp(playoffs, group, playerId)` saves the pick through `commitDocs`.
  - It fails if there's no outcome, if the season is locked, or if the player isn't one of the listed players.
  - Picking again replaces the earlier pick.
- The Finish-season card is blocked with "Pick the Finals MVP first" (or "Pick every Series MVP first" for the D2) until each champion has a pick.
- Wrap-up copies the pick to `summary.champions[].finalsMvp`.

**YSG MVP**

- `runYoungStar` adds up each player's dice points over `semis` and `final`, keeping only players on the `champion` team.
- It sets `ysg.mvp` to the top scorer. A tie is settled with `rollOff`, using the injected `Rng`, and recorded in `mvpRollOff`.
- The All-Star page shows "YSG MVP: <name>".
- A doc whose YSG ran before this part has no `mvp` and shows `—`.

**Wrap-up (`seasonRecord`) additions to `summary.allStar`**

- `asgWinner` and `asgLoser` are `"Team <captain name>"` for the winning and losing ASG teams, from `selections.captains` by team index.
- `ysgWinner` is `"Team <captain name>"` for `ysg.champion`, from `selections.youngCaptains`.
- `ysgMvp` is `ysg.mvp ?? null`.
- Each of these is null when its event hasn't run.

## Import (`npm run import -- --history`, run by the user)

1. Read the tabs (the main sheet and the past-standings sheet) and `fbaBrackets.json`.
2. Match or add players (H2, H3), then write `playerBios.json`.
3. For each season from S1 to S78, build or merge the summary and set `locked: true`. The importer owns these fields:
   - the FBA Champion entry of `champions`, with `finalsMvp`;
   - `confChampions`, `awards`, `allFba` and `allStar`;
   - `standings` (S71–S78 only; each team's `playoff` comes from `pastBracket` when there is one, otherwise from the champion and runner-up);
   - `pastBracket`.
4. Check each `pastBracket` final against the Championships row. The winner must be the champion, the loser the runner-up, and the wins must match the decoded score. Any mismatch goes in the report, and the bracket is still written.
5. The report (`importers/history-report.md`) lists:
   - unmatched and ambiguous names;
   - bracket mismatches;
   - seasons without a bracket;
   - how many players were added.

For imported standings, `group` is `E` or `W`. `teamId` is the current FBA or D2 team whose name matches exactly; otherwise it's the name itself. `rank` comes from the sheet, `marker` and `seed` are null, and `name` is the name of that era.

## Transcription (a plan task, done once)

- Extract the page JPEGs from `.superpowers/sdd/fba-brackets.pdf.url` (it's a PDF despite the name) into `.superpowers/sdd/brackets/`.
- The FBA pages are the ones titled "FBA Elite Tournament S<n>". They come in three sizes: 2000×1468, 3000×2202 and 1400×760, 46 pages in all.
- Enter every first-round slot top to bottom, then each later round.
  - The seed is the grey number beside the first-round line when one is printed; otherwise null.
  - The record is the `(W-L)` after the name.
  - The score is `winner − loser` wins.
  - A `BYE` slot is null.
- The file is `{ season, rounds, series }[]`, sorted by season. It must pass the `PastBracket` schema.

## Pages

These replace the `/history` placeholder.

| Route | Content |
|---|---|
| `/history` | Links to the four pages below |
| `/history/fba/championships` | One row per season, newest first: Season, Champion, Runner-up, Score, Finals MVP, West champion, East champion |
| `/history/fba/awards` | One row per season, newest first: Season, MVP, ROTY, PPK, LP, MC, DPOY, MIP |
| `/history/fba/season/:season` | A season picker and tabs: **Standings**, **Playoffs**, **Awards & All-FBA**, **All-Star** |
| `/history/fba/players` | Every player with a bio or named in any summary, sorted by name, with a search box (accent- and case-insensitive substring match) |
| `/history/fba/players/:playerId` | Bio (name, born, entries), then honours by season, then stat lines by season |

- **Standings tab:** two conference tables with Rank, Team, W, L and W% (three decimals). ConfW-ConfL, Diff, marker and seed are added when they aren't null. Seasons without standings show "No standings recorded".
- **Playoffs tab:**
  - An app season (`bracket` is set) renders `Bracket` from its series, and clicking a series does nothing.
  - An imported season (`pastBracket` is set) renders `PastBracket` with the same `series-box` and `series-side` markup and classes. A BYE side shows "BYE". A name that matches a current team shows its `TeamMark` for that season.
  - Otherwise the tab shows the finals line: champion, runner-up and score.
- **Conference champions** for app seasons come from the winners of the `E-CF` and `W-CF` series.
- **Honours** (from all summaries): Finals MVP, each award, All-FBA (team and slot), All-Star MVP, YSG MVP, 5-point and dunk wins, and All-Star or Young-Star selection when those lists aren't empty.
- **Stat lines:** one row per summary line, `rs` and `po`; a traded player's total row is labelled "Total".
- Player names on every history page link to `/history/fba/players/:playerId`.
- When `errors` isn't empty, the pages show "Some seasons couldn't be read: S<n>, …".

## Edge cases

- Seasons with no Awards row, or with all cells `X`, leave `awards` as `[]` and `allStar` as null.
- A season with no Championships row gets no FBA Champion entry.
- A player on the Players tab who shows up in no summary still gets a record and a bio, and appears in the list.
- The S79 and later summaries written by wrap-up are never rewritten. For those seasons, the pages read `bracket`, `awards` and `allFba` as they are.
- An unknown `:season` or `:playerId` shows "Not found".

## Testing

- **Parser tests on fixture rows:** date-serial scores; the `Name-ABBR` split; header lookup; each All-FBA era; the past-standings layout.
- **Schema tests:** `PastBracket` (tree links, BYE rules, winner wins); `PastAllFbaTeams` (the four orders, mixed orders rejected); nullable standings fields; `playerBios`.
- **Storage and handler:** one corrupt summary gives 200 with it listed in `errors`.
- **Importer:** merging into S78 keeps its existing fields; S79 is left untouched; rerunning gives identical output.
- **jsdom tests for each page:** the empty, imported and app-season variants; search; the not-found routes.
- `fbaBrackets.json` passes the schema, and a test checks each final against a fixture of the Championships rows.
- **Picks:**
  - `pickFinalsMvp` accepts a listed player; rejects an unlisted player, a missing outcome and a locked season; a second pick replaces the first; and the Finish-season card stays blocked until every champion has a pick.
  - The YSG MVP rule works across semi and final, with a tie roll-off under a seeded `Rng`.
  - Wrap-up writes `finalsMvp` and the four new `allStar` fields.
- The committed `web/data` doesn't change. The browser check runs the importer on the scratch copy.
