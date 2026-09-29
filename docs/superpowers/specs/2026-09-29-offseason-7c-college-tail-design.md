# Part 7c: College Tail (timeline fix, S79 class, transfer portal, Rank Class, Adjust College Ratings, walk-ons)

Branch `college-tail`. It follows 7b (merged 6f3047d). The user's decisions from 2026-09-29 are in §9.

## 1. Goal

Get the S79 FBAJC ready to play from the app, and build the tools for the S80 class:

1. Fix 7a's off-by-one class timeline.
2. Import the S79 class from the sheet.
3. Run the S79 transfer portal.
4. Rank the S80 class with R and consensus.
5. Reset the returning college ratings.
6. Fill the open spots with walk-ons.

Everything except the S80 ranking is needed before FBAJC S79.

## 2. The class timeline (fixes 7a)

A class is named for the season it plays its Freshman year in.

- **Class S{k}** is created and ranked in the S{k−1} calendar (the `create-s{k}-class` and `rank-s{k}-class` steps).
- It is recruited from its creation until the FBAJC S{k} step: projections and commitments.
- It plays its Freshman year in FBAJC S{k}.

Reference players:
- Milo Lawrenz: S78 class, born S60, a Freshman in S78, drafted into the FBA for S79.
- Kylan Whitemore: No. 1 in the S79 class, born S61, a Freshman in S79 aged 18.

Consequences:

- **Birth season** = class season − 18. `createClass` currently writes `season − 18`, which is a year early. It must write `classOf − 18`, so the S80 class is born in S62.
- **Where each board lives:** a class's board stays at `leagues/fbajc/S{k−1}/recruiting.json` (the season it was created in, as 7a stores it). The S79 class is at `S78/recruiting.json` and the S80 class at `S79/recruiting.json`.
- **In calendar season n, the Recruiting page works two boards.** A picker at the top chooses between them. It defaults to the class that plays this season.
  - **The "S{n} class" board** (`S{n−1}/recruiting.json`): projections, commitments and this season's transfer portal.
    - A commitment places the player on the S{n} college rosters, using 7a's rules.
    - When the spot is taken, a named holder goes to the portal (D12). An unnamed X holder is removed, with no portal.
  - **The "S{n+1} class" board** (`S{n}/recruiting.json`): Create Class, Rank Class, then projections and commitments.
    - A commitment is saved on the board only (`committedTo`); no roster changes.
    - The board refuses a second S{n+1} recruit committed to the same school and position.
    - The recruits join the S{n+1} college rosters at Adjust Age (part 7d).
- **The FBAJC S{n} gate** (the calendar Mark done and the `Go to next season` re-check) reads the S{n} class board, `S{n−1}/recruiting.json`, instead of `S{n}/recruiting.json`. Section 7 adds a check for open spots.
- **Go to next season** locks the S{n} class board. The S{n+1} class board stays open, and after the rollover it becomes "this season's class".
- **Commit preview wording:**
  - "Open spot" when the spot is empty.
  - "Name (Jr, 78) will enter the portal" when a named player holds it.
  - "Replaces an unnamed player" when an X player holds it.
  - "Joins the S80 roster at Adjust Age" for a next-season class.

## 3. Name check (`npm run import -- --fix-names`)

The main sheet's **Players** tab always wins for name spelling.

- **A plain run** compares every named player in `players.json` with the Players tab's names (column A). It writes `web/importers/fix-names-report.md` and changes nothing.
  - For each app name that isn't in the tab, it lists the one close match: edit distance ≤ 2, with ' and ’ treated as the same.
  - It also lists the names with no close match, or with several.
- **`--apply`** renames the listed players in `players.json`. `--skip "<app name>"`, which can be repeated, leaves a player out.
- Names only: nothing else changes.
- The user runs it. Known today: Kellen → Kellan Ogbu, D'Andre Holiday → Holliday, Quentin Kauffman → Kaufman, Japser → Jasper Monroe, Forest → Forrest Bentley. Adrien Moreau and Brycen Holcomb were fixed in the sheet, and the apostrophe difference for Jamari O'Neal is ignored.

## 4. S79 class import (`npm run import -- --recruiting-class`)

A one-time import of the class that plays S79. The user runs it; it is never run against `web/data` in tests or checks.

**Reading the sheet:**
- It reads the FBAJC history sheet's **FBA JC Recruiting** tab (sheet id `1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84`).
- It finds the section whose header is **S79**. The user renamed that header in the sheet from the duplicate "S78". If there is no S79 section, it stops.
- Its rows are: rank, stars (`5*`), position, name, R, school, consensus.

**Requirements:**
- The S79 college rosters must exist. They're built by 7a's setup panel on the Recruiting page, and the importer says so when they don't exist.
- It stops if `leagues/fbajc/S78/recruiting.json` exists, unless `--force` is given.

**It writes:**
- **Players:** one new player per recruit (`birthSeason` 61).
  - Each name is checked against the Players tab: an exact match, or a close one, which is reported.
  - A born season that isn't S61 is reported.
- **`leagues/fbajc/S78/recruiting.json`:** `season` 78, `classOf` 79, `created` true, `classDraft` empty, `portal` empty.
  - Each recruit gets its class-order position and `classYear` Fr, `rating` = R, `consensus`, `stars`, and `projections`.
  - The School column sets the projections:
    - "N PROJ - A, B, …": when only one school is listed, that school gets N; otherwise each school gets 1. A count that differs from the number of schools is reported.
    - "0 PROJ - none" means no projections.
    - A school name means the recruit has committed. The two known ones are JJ Clarke to Gonzaga and Don Goldyn to Wichita State.
  - School codes and names are matched to `fbajc/teams.json` by `abbr`, then by `name`. An unknown code is an error.
- **Commitments:** each committed recruit is placed on its school's S79 roster through the same commit logic, with its transactions.
- **`leagues/fbajc/S78/classRanking.json`:** a locked `college-class` ranking (order, R, consensus). It gives the S80 Rank Class its suggestions.

**Checking:**
- Stars that don't match the consensus cutoffs are reported.
- It validates every doc with `schemaForPath`, writes `web/importers/recruiting-class-report.md`, and writes the docs only when there are no errors.

## 5. S79 transfer portal

**When it's open:**
- It opens when `make-s{n}-schedules` is done ("the offseason ends") and closes when the `fbajc` step is done.
- While it's open, the Home page and the Calendar show a banner, "The S79 transfer portal is open · N players in it", linking to the Portal page.
- When it's closed, moves are refused with "The S79 transfer portal opens when the offseason ends (after Make S79 Schedules)" or "The S79 transfer portal is closed".

**The Portal page, `/league/fbajc/portal`:**
- **Eligible players:** every *named* So, Jr and Sr on the S{n} college rosters.
  - It leaves out players already in the portal, and anyone who transferred in or committed this cycle.
  - It has a name search and filters for school, conference and position.
  - You tick players, then "Put N players in the portal" saves them in one batch.
- **Entering the portal:**
  - The player's roster spot becomes a hole right away.
  - A `PortalPlayer` (`fromTeam`, `classYear`, `rating`, `stars`) is added to the S{n} class board.
  - The transaction reads "Name (Jr PG, 84) enters the transfer portal from Duke".
- **In the portal:** the players are listed by rating, highest first, with their old school, projections and commitment.
  - **"Take out"** puts an uncommitted player back in their old spot. It works only if the spot is still a hole; otherwise it's refused.
  - Projections and commitments use the existing board, and a player may commit back to their old school.
  - Players pushed out by a commitment (§2) show up here too.
- The FBAJC gate already requires every portal player to commit.
- **For 7d:** Adjust Age keeps only Stay / Declare for underclassmen. The portal replaces the old "Portal" choice there.

## 6. Rank S{n+1} Class and Adjust College Ratings

Both use the 7a ranking engine and `RankingTable`.

**Schema changes:**
- `RankingKind` gains `'college-class'` and `'college-reset'`.
- `RankingFile` gains `consensus?: Record<playerId, number>` (70–100, up to 2 decimals) and `consensusCurve?: number[]`, both for `college-class` only.
- `Prospect` gains `consensus: number | null` (70–100).
- A class can't be edited in some ways once its ranking has started (below).

### 6a. Rank S{n+1} Class (step `rank-s{n+1}-class`)

**Where it's saved:** `leagues/fbajc/S{n}/classRanking.json`.

**The rows:** every S{n+1} recruit on the board, committed or not. The Team column shows the school a recruit has committed to.

**The table:**
- Rank order is the consensus order.
- There is a **Consensus** input for each row, next to **R**, the rating.
- **Stars** are derived and shown, never typed: 90+ is 5★, 80–89.99 is 4★, and 70–79.99 is 3★.

**Suggestions** come from the previous class's locked `classRanking.json`: rank k suggests `curve[k−1]` for R and `consensusCurve[k−1]` for consensus. For S80, that's the imported S79 class (94/98.8, 94/98.7, …). "Use suggestion" and "Take the rest" fill in both numbers.

**Finish is blocked until:**
- every row has an R and a consensus in the range 70–100;
- consensus never goes up down the order (ties are allowed);
- no R is higher than someone ranked above it (the existing out-of-order rule);
- the class has 12–13 5★ and 3–5 3★. With fewer than 15 recruits the page says the mix needs at least 15.

**Finishing:**
- It locks the ranking.
- It writes `rating`, `consensus` and `stars` onto each S{n+1} recruit.
- It logs "S80 class ranked: 30 recruits" and marks the step done.
- There are no roster writes, since the S{n+1} commitments are on the board only.

**Class changes:** once `classRanking.json` exists, recruits can't be added or removed. Name edits are allowed, and position edits for uncommitted recruits.

### 6b. Adjust College Ratings (step `adjust-college-ratings`)

**Where it's saved:** `leagues/fbajc/S{n}/ratings.json`, kind `college-reset`.

**The rows:** every named player on the S{n} college rosters who isn't in the S{n} class, plus every portal player.
- **Team:** the school, or "Portal (from Duke)".
- **Prev:** the current rating.
- **Stat:** "S78: 738 pts", from last season's rosters.
- The S{n} class keeps its R, and X players keep their ratings.

**Curve:** the previous college reset's ratings when it exists and is locked. Otherwise it's this group's current ratings, sorted from high to low (the same as `d2Curve`).

**Finish** uses the D2 reset rules: every row ranked and rated, with no out-of-order ratings.

**Finishing:**
- It writes each rating to wherever the player is now: a roster spot or a portal entry.
- It locks the ranking.
- It logs "College ratings reset: N players ranked, K took the suggestion" and marks the step done.
- Players may move (portal, commit) while it's open. Ratings follow the player id.

## 7. Walk-ons and the FBAJC gate

**The button:** "Fill N open spots with walk-ons", on the S{n} class board.
- It is enabled only when the current calendar step is `fbajc`, every recruit and portal player on the S{n} board has committed, and there is at least one hole.
- Otherwise it is disabled, with the reason shown.

**Each hole on the S{n} college rosters gets a walk-on:**
- The player is new: `name` null, `birthSeason` n − 18.
- The roster entry: `classYear` 'Fr', `stars` null, `points` 0, `age` null, and a rating from the Java rule (`Team.java`: `(int)(random*13) + base`):
  - base 60 (60–72): B12, ACC, BE, SEC, B10, P12;
  - base 58 (58–70): AAC, A10, MWC;
  - base 55 (55–67): all other conferences.
- It takes an injected `Rng`; the page passes `Math.random`.
- It's one batch covering `players.json`, the rosters and the transactions. There is one transaction entry of a new type `'walk-on'`: "287 walk-ons fill open spots".

**The FBAJC S{n} gate** adds "N open spots need walk-ons" to "N recruits and M portal players haven't committed yet". Both apply to the calendar Mark done and to Go to next season.

## 8. Testing

- **Engine tests** for each move:
  - class timeline and birth season, board-only commitments, X displacement, the gate on the right board;
  - portal open/close, enter and take out;
  - Rank Class blockers (consensus order, stars mix, R order) and Finish;
  - Adjust College Ratings rows, curve and Finish;
  - walk-on ratings by tier with a seeded `mulberry32`;
  - the gate's open-spot check.
- **Importer tests** use fixture rows only: sections, projections parsing, commitments, name checks and fix-names matching.
- **Page tests** follow `app/pages/D2RatingsPage.test.tsx` (a stubbed `fetch`): the board picker, the Portal page, the Rank Class and Adjust College Ratings tables, the walk-on button, and the banners.
- **A text-only browser check** runs on a scratch copy (CLAUDE.md "Browser checks").
  - Prep: the roster fill, college setup, and the S79 class import pointed at the scratch data.
  - Walk-through: fix-names dry run, portal enter/take out, a commitment that displaces an X player, Adjust College Ratings, walk-ons, the FBAJC gate, Create S80 Class and Rank S80 Class.

## 9. Decisions (user, 2026-09-29)

- Walk-ons come from a button after every commitment is done, at the FBAJC step (option A).
- **Rank Class:** stars follow consensus (90/80/70). The mix and the star order are hard rules (option B). R is the gameplay rating, and consensus is shown for recruiting only.
- **The timeline** is as in §2. The S79 class was created and ranked in S78. The S80 class can get projections and commitments as soon as it's created, and those commitments are board-only until S80 (option A).
- **The transfer portal:** it opens when the offseason ends (option A), covers named players only (option A), and lists players by rating. The user decides who enters.
- **Data sources:**
  - The Google sheet "FBA Rosters" holds the most current rosters, but app data wins on ratings.
  - The Players tab wins on name spelling.
  - FBAJC X players are only in the app's data, and they disappear when replaced by a commitment.
- **College rosters:** 7a's S78-derived setup is kept, because it matches the sheet's FBA JC Rosters tab (157 named players: same schools and class years).
