# Part 7a: Ranking tool, D2 reset, college setup, Create Class and the recruiting board — Design

**Date:** 2026-09-28
**Status:** Approved in brainstorming; spec under review
**Branch:** `offseason`
**Parent spec:** `docs/superpowers/specs/2026-09-25-fba-web-design.md` (§10 roadmap, part 7)
**Ledger:** `.superpowers/sdd/progress.md` (decisions D1–D21 for all of part 7)

**How part 7 is split (D21):**
- **7a (this document):** the shared click-to-rank tool, the D2 ratings reset rebuilt on it, the one-time S79 college rosters, Create S{n+1} Class, and the recruiting board (projections, commits, decommits, portal by displacement).
- **7b:** the season tail: S{n+1} FBA Draft Lottery, Retirement, Hall of Fame Induction.
- **7c:** the rest of recruiting: Rank S{n+1} Class, walk-on fill before FBAJC, Adjust College Ratings.
- **7d:** the start of a season: Adjust Age (pros and college, leavers, declare, portal), Adjust Pro Ratings(reset) with the draft prospects, the S{n} FBA Draft.

The S80 FBA expansion is its own later part (D15).

**Java reference:** tag `java-v1`. The Java did no offseason work except print lottery standings; every step here was done by hand in the Google Sheets. `FBAJC/src/fbajc/Team.java` (walk-on fill) matters to 7c, not 7a.

## 1. Goal

The real S79 data sits at Free Agency/Offseason. The next steps the commissioner reaches are FBAD2 Ratings(reset), FBAD2 Draft and Create S80 Class. 7a makes those work under the rules the commissioner gave, and lets recruits and transfers commit at any time from the class's creation until FBAJC.

## 2. Decisions (from the ledger)

| # | Decision |
|---|---|
| D4 | A rating **reset** ranks the current players to pull ratings back to a baseline between seasons (it fights rating inflation). The commissioner sets every rating by hand, guided by last season's base rating. Done for the FBA, the D2 and named FBAJC players. |
| D5 | Reset screen: the left column lists players in last season's base-rating order; clicking the player who should be next moves the row into the new ranking. When everyone is placed, each row gets an **empty** rating box and a clearly separate suggestion: the rating that held rank k in last season's order. The suggestion is never a prefill. |
| D9 | Create S{n+1} Class: the commissioner enters names and positions only. Ratings and stars come at Rank Class (7c). Birth season = n − 18 (Fr 18 … Sr 21; draftees are 22). |
| D11 | From Create Class until the FBAJC step, at any time, the commissioner gives recruits and portal players **projections** to schools and later records a **commitment**. Everyone must be committed before FBAJC. |
| D12 | A commit may take a filled spot: the returning player at that position goes to the transfer portal and must commit somewhere too. |
| D13 | A projection is one count for a school; a player can get several per school. The board shows shares (2×TEX + 1×UH → 67% TEX, 33% UH). A commit may go to any school; projected schools are listed first. |
| D19 | S79 college rosters come from S78: class years move up; every Senior leaves (named ones went pro; unnamed "X" ones just leave); every S78 college player who now appears in the S79 pro data leaves (they declared early). The gaps are holes. |
| 7a-1 | The click-to-rank tool has a "Take the rest in order" assist. Lock is blocked by any missing rating or by a rating higher than the one ranked above it. |
| 7a-2 | A committed player can **decommit**: back to the board, their spot becomes a hole. A player they displaced stays in the portal. |
| 7a-3 | A commit that would displace a player who committed this cycle is refused ("decommit them first"). Only returning players are displaced into the portal. |

## 3. The click-to-rank tool

### 3.1 The ranking document (`RankingFile`)

One document per reset. In 7a only the D2 reset uses it, at `leagues/fbad2/S<n>/ratings.json` (the existing path). 7c and 7d add more kinds.

```ts
RankingRow = {
  playerId,                    // p00000
  position: Position,
  age: int | null,
  team: string | null,         // team id, or null (D2 Reserves)
  prevRating: int | null,      // last season's base rating in this league; null = new to this league
  otherRating: int | null,     // a rating from another league, used only to order the "New" group
  stat: string | null,         // one line of context, e.g. "412 pts"
}
RankingFile = {
  league: LeagueId,
  season: int,
  kind: 'd2-reset',            // 7c/7d add 'fba-reset', 'class-rank', 'college-reset'
  locked: boolean,
  rows: RankingRow[],          // the players being ranked (left column source)
  order: playerId[],           // the new ranking, best first
  ratings: Record<playerId, 1..99>,  // what the commissioner entered or accepted
  curve: int[],                // suggestion ladder, best first: rank k suggests curve[k-1]
}
```

Schema checks (`superRefine`): `rows` ids are unique; `order` ids are unique and all in `rows`; every `ratings` key is in `rows` (a sent-back row keeps its typed rating); `curve` is non-increasing, 1–99; a locked file has every row in `order` and every ordered player rated.

### 3.2 Engine (`web/engine/rank/ranking.ts`, pure)

- `leftRows(doc)`: rows not in `order`. Ranked players first, by `prevRating` desc; then the **New** group (`prevRating` null), by `otherRating` desc, then name. Ties break on name, then id.
- `take(doc, id)`: appends to `order`. Refused if unknown or already ranked, or the file is locked.
- `sendBack(doc, id)`: removes from `order` (its entered rating stays in `ratings`, so it reappears if the player is taken again).
- `takeRest(doc)`: appends every left row, in `leftRows` order.
- `suggestion(doc, k)`: `curve[k-1] ?? null`.
- `setRating(doc, id, value | null)`: value 1–99 or clears it.
- `useAllSuggestions(doc)`: sets every ranked row that has no rating and has a suggestion to its suggestion. It never overwrites a typed rating.
- `rankingBlockers(doc)`: "N players aren't ranked yet", "N players still need a rating", and one line per out-of-order pair ("#12 Name (84) is rated above #11 Name (83)"). An empty list means the doc can be locked.
- `outOfOrder(doc)`: the set of ids to flag on screen.

### 3.3 Screen (`web/app/rank/RankingTable.tsx`)

- **Two columns.** On the left, "Last season's order": numbered rows showing name, position, age, team, previous rating and stat, with a "New" divider above the new group. On the right, "New ranking": #k, name, position, age, team, previous rating, and a ↩ button to send the row back.
- Clicking a left row takes it. "Take the rest in order" sits above the left column.
- The rating boxes appear only when the left column is empty. Each box starts empty. Beside it is a chip, "suggested 97", visually separate from the box (muted, labelled), which copies the value into the box when clicked. "Use all suggestions" sits above the column. Sending a row back hides the boxes again; typed values are kept.
- Out-of-order rows get a warning marker. The blockers list sits above the Finish button, which is disabled while there are blockers.
- A position filter narrows **both** columns for reading only; taking still appends to the single overall ranking.
- At phone width the columns stack (left above right).
- Progress autosaves through `useAutosaveDoc`, so the commissioner can stop halfway and come back.

## 4. D2 ratings reset (FBAD2 Ratings(reset))

The existing D2 reset keeps its place in the calendar, its start condition (FBA free agency closed) and its finish effects. What changes is how the ratings are chosen.

- **Start** (`startRatings`) builds the `RankingFile`:
  - `rows`: every D2 pool member (D2 rosters plus Reserves, from `poolMembers`) with `prevRating` = the current (pre-reset) D2 rating.
  - `otherRating`: that player's rating on this season's FBA free-agent list, if any (players who came down from FBA free agency). Otherwise null.
  - `stat`: last season's D2 points ("412 pts"), or null.
  - `curve`: the previous season's locked `fbad2/S<n-1>/ratings.json` ratings, sorted high to low, if it exists. Otherwise the non-null `prevRating`s of these rows, sorted high to low. For S79 that's 296 values, taken from the D2 rosters, so ranks past 296 get no suggestion.
  - `order` and `ratings` start empty. The Rng parameter goes (nothing is random now).
- **Finish** (`finishRatings`) is blocked by `rankingBlockers` plus the existing membership checks (a pool member missing from `rows`, or a row no longer in the pool). It writes the ratings into the D2 rosters and Reserves, logs `d2-ratings` ("D2 ratings reset: N players ranked, M took the suggestion"), locks the file and marks `fbad2-ratings-reset` done.
- **Removed:** `ageAdjustment`, `performanceScores` and `clampSuggested` (the formula), `RatingBreakdown`, and the `D2RatingRow`/`D2RatingsFile` schema. `D2RatingsFile` becomes `RankingFile`. No committed data has a D2 ratings file, so nothing needs migrating.
- The D2 pool and draft steps are unchanged; they read the ratings from the rosters and Reserves after Finish.
- `nextSeason.ts` keeps locking `fbad2/S<n>/ratings.json` (it now holds a `RankingFile`).

## 5. S79 college rosters (one time)

`web/engine/college/setup.ts` (pure):

```ts
setupCollegeRosters(input: {
  season: number;               // n (79)
  prev: RostersFile;            // fbajc S{n-1}
  proIds: Set<string>;          // every player id on S{n} FBA rosters, FBA free agents, D2 rosters, D2 Reserves
}): { ok: true; rosters: RostersFile; counts: { seniors: number; early: number; holes: number } } | { ok: false; problems }
```

- Each S{n-1} entry becomes:
  - a **hole** (`playerId: null`, same position, `rating`/`age`/`stars`/`classYear` null, `points` 0) if it is already empty, is a Senior, or its player is in `proIds`;
  - otherwise the same player with `classYear` moved up (Fr→So→Jr→Sr), `points` 0, and rating and stars kept.
- Every team keeps exactly five slots, one per position.
- Problems: `prev` isn't for season n−1, or the result wouldn't have 5 slots per team.

**Where it runs.** The Create Class page shows a "Set up S{n} college rosters" panel when `leagues/fbajc/S<n>/rosters.json` doesn't exist and `meta.rosterSeason.fbajc === n − 1`. It reports the counts first ("278 Seniors leave, 9 players left early, 287 holes"). The action writes, in one batch:
- the new rosters;
- `leagues/fbajc/S<n>/transactions.json`, with one `season` entry ("S79 college rosters set up from S78");
- `meta.json`, with `rosterSeason.fbajc = n`.

From S80 on, 7d's Adjust Age builds the rosters instead, and the panel never shows again.

## 6. Create S{n+1} Class and the recruiting document

### 6.1 `RecruitingFile` (`leagues/fbajc/S<n>/recruiting.json`)

`n` is the calendar season in which the class is created. It plays its Freshman year in the FBAJC season at the end of that calendar.

```ts
Prospect = {
  playerId,
  position: Position,
  classYear: ClassYear,              // 'Fr' for recruits; the transfer's current year for portal players
  rating: int | null,                // recruits: null until Rank Class (7c); portal: their college rating
  stars: int (3..5) | null,          // recruits: null until Rank Class; portal: kept from their recruitment
  projections: Record<teamId, int >= 1>,
  committedTo: string | null,        // team id
}
PortalPlayer = Prospect & { fromTeam: string }
RecruitingFile = {
  league: 'fbajc', season: int, classOf: int,  // classOf = season + 1
  locked: boolean,
  classDraft: { name: string, position: Position }[],  // Create Class rows before "Create class"
  created: boolean,
  recruits: Prospect[],
  portal: PortalPlayer[],
}
```

Schema checks: `classOf === season + 1`; player ids are unique across `recruits` and `portal`; `classDraft` is empty once `created`; `recruits` is empty until `created`.

### 6.2 Create Class (`web/engine/college/recruiting.ts`)

- The Class tab edits `classDraft`: add a row, remove a row, edit a name or position, and **Paste list** (one "Name, POS" or "Name<TAB>POS" per line; lines that don't parse are listed back and not added). It shows a running count per position. There are no rules on class size or mix. It autosaves.
- `createClass(state, ctx)`:
  - Refused if the class is already created, `classDraft` is empty, or any name is blank.
  - Each row gets a new player in `players.json` (`nextId`, name, birthSeason n − 18) and becomes a recruit (`classYear` Fr, no rating or stars, no projections).
  - It sets `created`, clears `classDraft`, logs `class` ("S80 class created: 30 recruits"), and marks `create-s{n+1}-class` done.
  - The first time, the recruiting file is created with `classOf` n+1.
- `editRecruit(state, id, { name?, position? })`: only while uncommitted. The name changes in `players.json`, the position in the recruit.
- `removeRecruit(state, id)`: only while uncommitted, and with no projections. It deletes the player from `players.json` too (nothing else references them).

## 7. The recruiting board

### 7.1 Moves (`web/engine/college/recruiting.ts`, pure)

`RecruitingState` holds the S{n} recruiting doc, the S{n} fbajc rosters, the fbajc teams, `players.json`, the S{n} fbajc transactions and the calendar.

- `addProjection(state, id, teamId)` and `removeProjection(state, id, teamId)`: count +1 or −1 (removed at 0). Refused for committed players and unknown teams. Not logged.
- `commit(state, id, teamId)`:
  - Refused if the player is already committed, the team is unknown, or the slot at the player's position on that team holds someone who committed this cycle (7a-3: "Texas already has Name committed at PG. Decommit them first").
  - If the slot holds a returning player, that player leaves the roster and is added to `portal` (`fromTeam` = teamId, with their classYear, rating and stars, no projections, uncommitted). This is logged as `portal` ("Name (Jr SG, 78) enters the transfer portal from Texas").
  - The player goes into the slot: `{ playerId, position, rating, age: null, points: 0, stars, classYear }`. `committedTo` is set. This is logged as `commit` ("Name (5★ PG) commits to Texas", or "Name (Jr SG, transfer from Baylor) commits to Texas").
- `decommit(state, id)`: only for committed players. The slot becomes a hole and `committedTo` is cleared (projections are kept). Logged as `commit` ("Name decommits from Texas").
- `uncommitted(doc)`: recruits and portal players with no `committedTo`, used by the FBAJC gate.
- Each move returns `{ ok: true, state, changed, label }` or `{ ok: false, problems }` and saves through `commitDocs` with the loaded versions (recruiting, rosters, transactions, and players/calendar where they change), so Undo works as for every other move.

### 7.2 Screen (`web/app/college/RecruitingPage.tsx`, `/league/fbajc/recruiting`)

- There are two tabs: **Board** (the default once the class exists) and **Class** (the default before that, or with `?tab=class`).
- The FBAJC league tabs become **Teams · Recruiting**.
- The Board has two sections, **Class of S{n+1}** and **Transfer portal**.
  - Each row shows name, position, class year, stars and rating (blank until Rank Class), and projections as shares ("67% TEX · 33% UH").
  - Actions on each row: **+** (a searchable school picker, grouped by conference), **−** on each projected school, **Commit**, and **Decommit**.
- **Commit** opens the school picker with the projected schools first. For the chosen school it shows who holds that position: "Open spot", "Jaden Moss (Jr, 78) will enter the portal", or the 7a-3 refusal.
- The filters are position, committed/uncommitted and name search. The header counts are "24 of 30 committed · 3 in the portal".
- The page reads the S{n} docs for the current calendar season. Before the class exists, the Board says "Create the S{n+1} class first" and links to the Class tab.

## 8. Calendar and app wiring

- `stepRoutes.ts`: `/^create-s\d+-class$/` → `/league/fbajc/recruiting?tab=class`.
- **FBAJC gate:** on the Calendar page, when the current step is `fbajc` and the S{n} recruiting doc has uncommitted players, "Mark done" is disabled with "N recruits and M portal players haven't committed yet". There's no gate when the doc doesn't exist.
- `nextSeason.ts` locks `fbajc/S<n>/recruiting.json` (when present) with the other S{n} docs.
- `schemaRegistry.ts`:
  - `leagues/fbajc/S<n>/recruiting.json` → `RecruitingFile`;
  - `leagues/fbad2/S<n>/ratings.json` → `RankingFile`.
- `TransactionType` gains `class`, `commit` and `portal`.

## 9. Error handling

- Every move refuses with plain problems (shown in the page's problem banner, as elsewhere). Nothing partial is ever saved.
- Save conflicts use the existing optimistic-concurrency flow (reload and retry). Chained saves use the versions returned by the previous save.
- Autosaved ranking and class-draft edits follow `useAutosaveDoc`. The `useSaving` double-render gotcha applies to any effect that saves, so guard such effects with a `useRef`.
- A locked recruiting or ranking document is read-only on screen.

## 10. Testing (test-first)

- **`ranking.test.ts`:**
  - `leftRows` ordering, including the New group and ties;
  - take, sendBack (the rating is kept) and takeRest;
  - suggestion beyond the curve;
  - useAllSuggestions never overwrites a typed rating;
  - each blocker, and out-of-order detection;
  - schema superRefine cases.
- **`d2/ratings.test.ts`** (rewritten):
  - start builds rows, `otherRating` and the curve (previous file vs. fallback);
  - finish is refused with blockers;
  - finish writes rosters and Reserves, logs, locks and marks the step done;
  - membership checks.
- **`college/setup.test.ts`:**
  - class years move up;
  - Seniors (named and X) and pro players become holes;
  - existing holes are kept;
  - 5 slots per team;
  - wrong-season refusal;
  - counts.
- **`college/recruiting.test.ts`:**
  - createClass: ids, birth season, log, step done, refusals;
  - edit and remove only while uncommitted;
  - projections ±;
  - commit into a hole;
  - commit displacing a returning player (portal entry and log);
  - 7a-3 refusal;
  - decommit (hole, projections kept, displaced player stays in the portal);
  - `uncommitted`;
  - schema checks.
- **jsdom page tests** (each with `cleanup()` in `afterEach`):
  - RankingTable: click to take, ↩, take the rest, boxes appear only when all are placed, suggestion chip vs. an empty box, Use all, Finish disabled with blockers;
  - D2RatingsPage on the new file;
  - RecruitingPage: the setup panel, class draft and paste, create, projection shares, the commit dialog text for open / displace / refuse, decommit;
  - Calendar: the FBAJC gate.
- **Data:** `web/data.test.ts` still passes on the committed data. The new schemas are registered.
- **Browser check** on a scratch copy (CLAUDE.md procedure):
  1. Close FA.
  2. D2 reset: rank a few, take the rest, use all suggestions, fix one out-of-order row, Finish.
  3. D2 pool and draft still work.
  4. Set up S79 college rosters.
  5. Create a class by paste.
  6. Add projections, commit into a hole, commit displacing a player, decommit.
  7. The FBAJC gate refuses while anyone is uncommitted.

## 11. Out of scope for 7a

- Rank Class (stars, ratings), walk-on fill, Adjust College Ratings (7c).
- The lottery, retirement and Hall of Fame (7b).
- Adjust Age, underclassmen declaring or entering the portal, Adjust Pro Ratings, the FBA draft (7d).
- The FBAJC season itself (part 6), the S80 expansion (its own part), and any other ranking kind besides the D2 reset.
