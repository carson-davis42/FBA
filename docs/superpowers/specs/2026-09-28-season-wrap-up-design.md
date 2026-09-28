# Part 2b-2c: Season Wrap-up and "Go to next season" — Design

**Date:** 2026-09-28
**Status:** Approved in brainstorming; awaiting spec review
**Branch:** `wrap-up`
**Parent specs:**
- `docs/superpowers/specs/2026-09-25-fba-web-design.md`
- `docs/superpowers/specs/2026-09-27-postseason-design.md` (2b-2a, merged)
- `docs/superpowers/specs/2026-09-28-awards-rankings-design.md` (2b-2b, merged)

**How 2b-2 is split:**
- **2b-2a:** the postseason (done).
- **2b-2b:** awards and power rankings (done).
- **2b-2c (this document):** finishing each league's season into history, and "Go to next season".

**Java reference:** tag `java-v1`. `FBAD2/src/fbad2/Main.java` `printSeasonSummary` prints the four league champions and the promotion/relegation lines; `FBA/src/fba/Main.java` `main` prints the FBA champion. Both then say "Reset to start S79": everything after that (history, rollover) was done by hand in the Google Sheets, so the Java is not a reference for the rollover itself.

## 1. Goal

- Record each finished season (champions, awards, All-FBA, All-Star results, final standings, bracket, D2 promotion, every player's season line) into a locked season record that the history pages (part 3) read.
- Lock the finished season so nothing can replay, reopen or undo it.
- Clear the Undo journal and backups (the journal reaches ~165 MB in OneDrive by season end; the commissioner never undoes across a season).
- Add an explicit "Go to next season" at the end of the calendar that applies D2 promotion and relegation, creates the next season's documents and resets the calendar.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **A season number is the year.** `meta.currentSeason` and `calendar.season` change from 79 to 80 only when the whole S79 calendar (through `fbajc`) is done. Steps after the FBA (draft lottery, retirement, HOF, …) are S79 steps that look ahead to S80; nothing in the app may call it S80 before the flip. Calendar labels such as "S80 FBA Draft Lottery" come from the calendar itself and are fine. |
| D2 | **Three moments.** The calendar is strictly sequential (the D2 season starts and finishes before the FBA starts). "Finish S79 D2 season" closes `fba-d2`; "Finish S79 FBA season" closes `fba`; "Go to next season" comes after the last S79 step. |
| D3 | **Promotion and relegation are S80 league membership.** The D2 finish *records* them; "Go to next season" *applies* them to `fbad2/teams.json`. The S79 league of every D2 team is snapshotted in the S79 record. |
| D4 | **History storage: one locked record per season.** `leagues/<lg>/S<n>/summary.json` is the complete record of a finished season. Part 3 imports S1–S78 from the Sheets into the same shape. A read-only `GET /api/history/<lg>` returns every summary in season order; each history section (championships, MVP, past standings, past playoffs, …) is a view over that list. The commissioner will give the details of the past standings and playoffs views in part 3. |
| D5 | **Player season lines:** one line per team stint plus a season total for traded players; regular season and playoffs kept separate; start and end rating; games, points and the four defense stats. A player's awards are found by joining the record's `awards`/`allFba`/`allStar` by player id, not stored on the line. |
| D6 | **S80 calendar:** the S79 step list with its season numbers shifted, plus "S80 World Cup" in even seasons, after the draft lottery and before Retirement. Confirmed by the commissioner. |
| D7 | **Split from part 7:** 2b-2c covers wrap-up and rollover only. Part 7 (offseason tools: aging, contract expiry, draft lottery, retirement, HOF, …) moves up in the roadmap to come right after 2b-2c, before parts 3–6. Until then each offseason step is "Mark done". |
| D8 | **Approach:** pure engine moves `finishSeason` and `startNextSeason`, each committed as one batch with the loaded versions. The batch carries a new `resetUndo` flag: the server writes it unjournaled and then deletes `.journal/` and `.backups/`. |

## 3. Flow

### 3.1 Finishing a league's season

| Calendar step | Before this part | After this part |
|---|---|---|
| `fba-d2` | The last D2 final marks the step done | The last final only sets `playoffs.outcome`; the step stays current until **Finish S79 D2 season** |
| `fba` | The last FBA final marks the step done | Same, with **Finish S79 FBA season** |

- `recordPlayoffGame` no longer calls `markStepDone`. It still sets `outcome` (champions, D2 promotion) when the last final ends.
- The playoffs page's champion card shows **"Finish S{n} {FBA|D2} season ▸"** once `outcome` is set and the step is still current. Home's **Continue ▸** routes there while the league step is current and `outcome` is set.
- The button runs `finishSeason(state)` and commits its writes as one batch with `resetUndo: true`.
- `finishSeason` refuses (returns problems) unless:
  - the league's calendar step is the current step;
  - `playoffs.outcome` is set (every final decided);
  - the awards are locked;
  - the season's `summary.json` does not exist yet.
- Its writes:
  - `leagues/<lg>/S<n>/summary.json`, `locked: true` (section 4);
  - `locked: true` on that season's `schedule.json`, `results.json`, `playoffs.json`, `awards.json`, and for the FBA also `allstar.json` and every `ratingPause-*.json`;
  - a transaction entry "S{n} season finished" (type `season`, added to the enum);
  - `calendar.json` with the league step marked done.
- After finishing:
  - Scores, Standings, Playoffs, Awards and Rankings stay viewable; their play controls are gone because the step is done and the docs are locked.
  - Rosters, free agents and reserves stay open: the tail steps (retirement and so on) still change them.
  - Home's "last champions" box reads the newest locked summary for each league (the current season's if it exists, else `meta.lastSeason`'s).

### 3.2 Reopen

- **Fixes 2b-2a M5.** "Reopen previous step" refuses to reopen a league step (`fba-d2`, `fba`) whose season summary exists, with the message "S{n} {league} season is finished". The button is disabled with that text as its reason.

### 3.3 The tail

- The steps after `fba` (draft lottery, [World Cup,] Retirement, HOF Induction, Rank class, Adjust College Ratings, FBAJC) work as today: "Mark done" (or their tool, when parts 5–7 build them).

### 3.4 Go to next season

- When every step of the calendar is done, the Calendar page and Home's Continue show **"Go to next season ▸"**, which opens a confirm card listing what will happen (the table in section 5) and a **"Start S{n+1}"** button.
- The button runs `startNextSeason` and commits its writes as one batch with `resetUndo: true`.
- Afterwards the app opens at "S{n+1} · Adjust Age".

## 4. The season record (`SummaryFile`)

`SummaryFile` gains optional fields, so the existing S78 summaries stay valid. Part 3's importer fills the same fields for older seasons.

```jsonc
{
  "league": "fba", "season": 79, "locked": true, "host": null,
  "champions": [{
    "title": "FBA Champion", "champion": "Boston Bucks", "runnerUp": "Memphis Blues", "score": "4–1",
    "teamId": "BOS", "runnerUpId": "MEM", "group": null        // new, optional
  }],
  "awards":  [{ "award": "MVP", "playerId": "p00001", "teamId": "ATL" }],   // the AwardsFile award entry shape
  "allFba":  { "team1": [/* 5 AllFbaSlot */], "team2": [/* 5 AllFbaSlot */] }, // FBA only, else null
  "allStar": { "allStars": [], "youngStars": [], "asgMvp": "p…", "fivePoint": "p…", "dunk": "p…" }, // FBA only, else null
  "standings": [{
    "teamId": "BOS", "name": "Boston Bucks", "group": "E", "rank": 1,
    "w": 64, "l": 22, "confW": 40, "confL": 12, "diff": 812, "marker": "*",
    "seed": 1, "playoff": { "round": 4, "champion": true }     // playoff: null = missed the playoffs
  }],
  "bracket": { "seeds": [], "series": [] },                    // PlayoffsFile seeds + series (no queue, no games)
  "promotion": [{ "league": "WL", "promoted": [], "relegated": [] }], // D2 only, else null
  "players": [{
    "playerId": "p…", "teamId": "ATL", "stint": 1, "position": "PG",
    "ratingStart": 84, "ratingEnd": 86,
    "rs": { "g": 50, "pts": 1100, "def": 3000, "stops": 1700, "allowed": 2600, "exp": 264100 },
    "po": null
  }]
}
```

### 4.1 Field rules

- **Champions:**
  - `title` follows the S78 wording: "FBA Champion"; for the D2, "Premier League Champion", "World League Champion", "United League Champion", "International League Champion".
  - `champion` and `runnerUp` are the teams' names that season.
  - `score` comes from `playoffs.outcome`.
  - `group` is null for the FBA and the D2 league id otherwise.
- **Awards and All-FBA** are copied from the locked `awards.json`.
- **All-Star** (FBA only), from `allstar.json`:
  - `allStars`: `selections.allStars`;
  - `youngStars`: `selections.youngStars`;
  - `asgMvp`: `asg.mvp`;
  - `fivePoint`: `fivePoint.winner`;
  - `dunk`: `dunk.winner`.
- **Standings:**
  - Rows come from the final regular-season `standings()`, in table order within each group; `rank` is the position within the group.
  - `name` is the team's name that season.
  - `group` is the conference (FBA) or the league (D2); this is the D3 snapshot.
  - `seed` is the playoff seed or null.
  - `playoff.round` is the last round the team played (1–4 FBA, 1–3 D2); `champion` is true for the title winner.
- **Bracket:** `seeds` and `series` copied from `playoffs.json`.
- **Promotion:** copied from `playoffs.outcome.promotion` (D2), else null.
- **Players:**
  - One line per (player, team) stint, found from the box scores of the regular season and playoffs in game order. A player is on the team whose box side lists him.
  - `stint` numbers a player's teams in order (1, 2, …).
  - A player with more than one stint also gets a total line with `teamId: null`, `stint: null`.
  - Everyone with at least one box line is included.
  - `position`: the player's position on that team.
  - `ratingEnd`: the player's roster rating at the finish.
  - `ratingStart`: the player's `oldRating` in the first rating-pause doc that lists him; otherwise (D2, or never in a pause doc) `ratingEnd`.
  - `rs` and `po`: regular-season and playoff sums of games, points, and the box-line defense fields `def`, `stops`, `allowed` and `exp` (expected points allowed, in hundredths). Games from before 2b-2b have no defense fields and add nothing to them. `po` is null when the player had no playoff games.
  - PPG, stop rate and points saved (`exp / 100 − allowed`, as in the 2b-2b DPOY race) are derived when shown, not stored.
- **Not copied:** full game results stay in the locked `results.json` and `playoffs.json`.

### 4.2 Schema checks (superRefine)

- `allFba` and `allStar` must be null for the D2; `promotion` must be null for the FBA.
- Player lines: at most one line per (playerId, stint); a total line only when that player has two or more stint lines.
- Standings: `teamId` unique.

## 5. "Go to next season" (`startNextSeason`)

**Refused unless:** every calendar step is done; the FBA and D2 summaries for `calendar.season` exist and are locked; no S{n+1} FBA or D2 rosters exist yet.

**Writes (one batch, `resetUndo: true`):**

| Document | Write |
|---|---|
| S{n} `fba` rosters, freeAgents, transactions; `fbad2` rosters, reserves, transactions, and ratings, pool and draft when present | `locked: true` if not already locked. `TransactionsFile` gains an optional `locked`. |
| `fba/S{n+1}/rosters.json` | The final S{n} rosters, `points` reset to 0, everything else unchanged. Expired contracts appear as Expired in S{n+1} free agency. |
| `fba/S{n+1}/freeAgents.json` | `{ players: [], locked: false }` |
| `fbad2/S{n+1}/rosters.json` | The final S{n} D2 rosters, `points` reset to 0 |
| `fbad2/S{n+1}/reserves.json` | The S{n} reserves with `fromFba` removed, unlocked |
| `fba/S{n+1}/transactions.json`, `fbad2/S{n+1}/transactions.json` | One entry, "S{n+1} season started" (type `season`) |
| `fbad2/teams.json` | Each team's `group` updated from the S{n} D2 summary's promotion lines: a promoted team moves up one tier, a relegated team down one. Every league keeps 16 teams (checked). |
| `calendar.json` | `calendarFor(n + 1)` |
| `meta.json` | `currentSeason: n+1`; `rosterSeason.fba`, `rosterSeason.fbad2` = n+1; `lastSeason.fba`, `lastSeason.fbad2` = n. `fbajc` and `fbawc` are untouched (parts 5 and 6 own them). |

**Not touched:** `picks.json` (rolling picks is part 7's draft work) and `players.json`.

**The batch size is within the server's limits.** It writes about 15 documents; the cap is 50 documents and 20 MB.

## 6. The calendar template (`calendarFor`)

A pure `calendarFor(season)` in `engine/shared/calendar.ts` returns a fresh calendar with every step not done. With N = season:

| id | label | kind | league | sub |
|---|---|---|---|---|
| `adjust-age` | Adjust Age | offseason | null | true |
| `adjust-pro-ratings-reset` | Adjust Pro Ratings(reset) | offseason | null | true |
| `sN-fba-draft` | SN FBA Draft | offseason | null | false |
| `free-agency-offseason` | Free Agency/Offseason | offseason | null | false |
| `fbad2-ratings-reset` | FBAD2 Ratings(reset) | offseason | null | true |
| `fbad2-draft` | FBAD2 Draft | offseason | null | true |
| `create-sN+1-class` | Create SN+1 Class | offseason | null | false |
| `make-sN-schedules` | Make SN Schedules | offseason | null | false |
| `fba-d2` | FBA D2 | league | fbad2 | false |
| `fba` | FBA | league | fba | false |
| `sN+1-fba-draft-lottery` | SN+1 FBA Draft Lottery | offseason | null | false |
| `sN-world-cup` *(even N only)* | SN World Cup | league | fbawc | false |
| `retirement` | Retirement | offseason | null | false |
| `hall-of-fame-induction` | Hall of Fame Induction | offseason | null | false |
| `rank-sN+1-class` | Rank SN+1 Class | offseason | null | false |
| `adjust-college-ratings` | Adjust College Ratings | offseason | null | true |
| `fbajc` | FBAJC | league | fbajc | false |

- **Golden test:** `calendarFor(79)` with every step not done equals the committed S79 `calendar.json` with every step not done, taking labels, kinds and sub flags from the committed file. If a label differs, the template follows the committed file.

## 7. Server

- **`POST /api/batch` with `resetUndo: true`:**
  - The request schema gains an optional boolean `resetUndo`.
  - `Storage.writeMany(label, writes, { resetUndo })` validates, checks versions and writes exactly as today, with rollback on failure, but writes no journal entry.
  - After every write succeeds, it deletes all files in `.journal/` and `.backups/`.
  - If the batch fails, nothing is deleted.
  - Afterwards `GET /api/undo` reports nothing available.
- **`GET /api/history/<league>`:**
  - Returns `{ league, seasons: SummaryFile[] }`: every `leagues/<league>/S<n>/summary.json`, ordered by n.
  - Read-only; an unknown league returns 404.
  - The client gets `useHistory(league)` in `app/api.ts`.
- **Client:** `postBatch` and `commitDocs` gain an optional `resetUndo` passed through.

## 8. Engine (`web/engine/season/wrapUp.ts`, pure)

- `seasonRecord(state, pauses: RatingPauseFile[]): SummaryFile`: builds section 4 from a season's loaded docs.
- `playerLines(games: {regular: GameResult[]; playoffs: GameResult[]}, rosters, pauses): SummaryPlayerLine[]`.
- `finishSeason(state, pauses): SeasonResult`: the section 3.1 checks and writes.
  - `SeasonDocKey` gains `summary`.
  - The rating-pause docs are passed in, with their paths and versions, because `SeasonState` holds only the current one.
- `nextSeasonDocs(input): { ok: true; writes; label } | { ok: false; problems }`: section 5.
  - Its input is the calendar, meta, both leagues' S{n} docs, the D2 teams and both S{n} summaries.
  - It is a separate move from `SeasonResult` because it spans both leagues and global docs.
- `applyPromotion(teams, lines): TeamsFile`, with the 16-per-league check.
- `calendarFor(season)` (section 6), and `reopenProblem(cal, finished: Set<string>)` for section 3.2.

## 9. Screens

- **Playoffs page:** the champion card's Finish button, with the list of problems if `finishSeason` refuses, and the save error with Retry.
- **Calendar page:**
  - Reopen is disabled with its reason for a finished league step.
  - When every step is done, the Mark done/Open buttons are replaced by "Go to next season ▸".
- **Next season page** (`/next-season`):
  - The confirm card: what will be locked, the S{n+1} docs created, the D2 teams that move between leagues, and "Undo history will be cleared".
  - **"Start S{n+1}"** runs `startNextSeason`, then routes to Home.
  - Any problems are listed instead of the button.
- **Home:**
  - Continue routes to the Finish button while a league step is current and its finals are decided, and to `/next-season` once every step is done.
  - The last-champions box reads the newest locked summary.

## 10. Leftovers fixed in this part

1. **M5** (2b-2a): Reopen refuses a finished league step (section 3.2).
2. **B6:** the Young-Star log reads "Final:" and "Champions:" without the repeated "Final · final ·" and "Champions ·" prefixes.
3. **B7:** the All-Star wrap-up says when a game was decided by a roll-off, e.g. "Team 2 144–144, won the roll-off".
4. **B8:** once the regular season is over, the Sim-to menu is hidden rather than listing every day disabled.
5. **Rating pause link:** after the game-1290 rating pause is done, its page links "Continue to playoffs ▸" to the playoffs page instead of "Back to scores ▸".
6. **Playoff game URL:** changing `/league/:lg/playoffs/game/:n` while the page is open loads game n. The page is keyed on the route parameter.
7. **Phone-width tab bar:** the league tab bar scrolls the active tab into view.
8. **Roadmap:** §10 of the program spec moves part 7 to follow 2b-2c and links this spec; the memory note is updated to match.

## 11. Error handling

- **Refusals:** every refusal from `finishSeason` and `startNextSeason` is a list of plain-language problems shown on the page. Nothing is written.
- **Save failures:** a failed batch (a version conflict, validation or a disk error) shows the server's message with Retry. It changes nothing, and the journal and backups are kept because the clear happens only after success.
- **No double finish:** the page guards the finish and rollover saves with a `useRef` (the `useSaving` double-render gotcha). `finishSeason` also refuses if the summary exists, and `startNextSeason` refuses if the S{n+1} rosters exist.

## 12. Testing (test-first)

- **`wrapUp.test.ts` (fixtures):**
  - The summary contents for the FBA and the D2: champions with names and ids, standings order, seeds and playoff rounds, the bracket, promotion, and All-Star.
  - Player lines:
    - a traded player gets two stints plus a total;
    - `ratingStart` comes from the first pause doc;
    - playoff lines are separate;
    - the defense sums match `seasonDefense`, so points saved matches the DPOY race.
  - `finishSeason`: the locks written, the calendar step marked done, the transaction line, and each refusal.
  - `nextSeasonDocs`: every row of the section 5 table:
    - points are reset;
    - `fromFba` is stripped;
    - promotion is applied, and the 16-per-league check rejects bad lines;
    - meta and the calendar are updated;
    - each refusal.
  - `calendarFor`: the S79 golden test; `calendarFor(80)` has the World Cup after the draft lottery; `calendarFor(81)` has none.
  - `reopenProblem`.
- **`season.e2e.test.ts`:** extended through finish D2 → finish FBA → Mark done on the tail steps → next season. It then checks that S80 opens at Adjust Age and that all S79 docs are locked.
- **Server tests:**
  - `resetUndo` clears `.journal/` and `.backups/` on success;
  - it doesn't journal its own batch;
  - on a failed batch it keeps both;
  - the history endpoint returns summaries in order, and 404 for an unknown league.
- **Schema tests:**
  - A new S79-shaped summary parses; the S78 summaries still parse.
  - The superRefine rules.
  - `TransactionsFile` with and without `locked`.
- **UI tests (jsdom, `cleanup()` in `afterEach`):**
  - the Finish button shows and hides;
  - Reopen is disabled for a finished step;
  - the Go to next season card;
  - the Home Continue routing;
  - the six cosmetic leftovers.
- **Committed data:** `web/data.test.ts` keeps passing.
- **Browser check** (scratch copy, 5183/5184, per CLAUDE.md):
  1. Play the D2 to its last final and finish it: the S79 D2 pages are read-only, and Undo is empty.
  2. Play the FBA and finish it.
  3. Mark done through FBAJC.
  4. Go to next season: the app shows S80 · Adjust Age, the D2 teams have moved leagues, S80 rosters exist with points 0, `.journal/` is empty, and the S79 standings still show the S79 leagues.

## 13. Out of scope

- **History pages** (championships, MVP, past standings, past playoffs, …) and importing S1–S78 into summaries: part 3.
- **Offseason automation:** aging, contract expiry, the draft lottery, retirement, HOF, rolling draft picks: part 7.
- **JC and World Cup seasons and their rollover:** parts 5 and 6.
- **Keeping the previous season's calendar:** it is replaced; the season record keeps what history needs.
