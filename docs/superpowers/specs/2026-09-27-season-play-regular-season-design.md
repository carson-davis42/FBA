# Part 2b-1: Regular Season Play (FBA + FBAD2) — Design

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Parent spec:** `docs/superpowers/specs/2026-09-25-fba-web-design.md` (§5 engine port, §6 UI). Part 2b is split into **2b-1 (this document: regular season for both leagues, plus the FBA All-Star weekend)** and **2b-2 (playoffs, brackets, tiebreakers, awards, power rankings, season wrap-up)**.
**Reference rules:** `docs/fba-rule-changes.md`, the commissioner's rule history. When rules conflict, the later one wins.
**Java reference:** `FBA/src/fba/*` and `FBAD2/src/fbad2/*` (tag `java-v1`). The sim, schedule, standings order and clinch logic are ported faithfully.

## 1. Goal

Play the S79 regular season for the D2 and then the FBA in the app, in calendar order:

1. **Make schedules:** both leagues.
2. **D2 regular season:** 4 leagues × 16 teams, 30 games each.
3. **FBA regular season:** 30 teams, 86 games each, with three pauses: rating adjustments at ¼, ½ and ¾, the trade deadline at ½, and the All-Star weekend at ¾.

Every game can be quick-simmed or watched live. Standings update after every save.

## 2. Season flow and calendar

| Calendar step | Continue ▸ opens | Done when |
|---|---|---|
| `make-s79-schedules` | Schedules page | **Make schedules** is saved |
| `fba-d2` | D2 Scores | The last D2 regular-season game is saved |
| `fba` | FBA Scores | The last FBA regular-season game is saved |

- **Make schedules** is one undoable batch that writes both leagues' `schedule.json`.
  - **Re-roll schedules** replaces them, and is allowed only while neither league has played a game.
  - JC schedules are not part of 2b-1.
- **Playoffs are not in 2b-1.** Each league's season stops after its regular season, and the calendar step is marked done then. In 2b-2 the "done" point will move to the end of the playoffs.
- **FBA pauses** happen after these game numbers. The numbers come from the Java's integer division of 1290.

  | After game | Pauses, in order |
  |---|---|
  | 322 (¼) | Rating adjust |
  | 645 (½) | Rating adjust, then trade deadline |
  | 967 (¾) | Rating adjust, then All-Star weekend |

  Sims can't go past a pause until it is finished. D2 has no pauses.

## 3. Roster locks

These close the follow-up gap from Part 2a Phase 2. All of them are enforced in the engine (moves fail with an explanation), and the UI hides or disables the actions with the same explanation.

| Window | FBA | D2 |
|---|---|---|
| From Close free agency until the D2 draft finishes | Trades allowed. Sign, release and cut are blocked ("free agency is closed; the D2 cycle is in progress"). Rating edits only through Edit. | All moves blocked except the D2 cycle's own steps |
| D2 regular season | Same as the row above | All moves blocked |
| FBA regular season, before the trade deadline is finished | Trades allowed. Nothing else changes rosters; ratings change only in the pause editor. | All moves blocked |
| FBA regular season, after the trade deadline | All moves blocked; the trade page is read-only | All moves blocked |

The Edit dialog, the commissioner's direct edit, stays available only outside a season. During a season, ratings change only through the pause editor.

## 4. Engine (`web/engine/season/`, pure, RNG injected)

- **`simGame(home, away, rng): SimGame`**: a port of `Main.playGamesTest`.
  - **Possessions:** 120, alternating, with the home team first (even possessions).
  - **Ball handler:** weight = rating − 60, drawn with `(int)(random × (Σratings − 300)) + 1` exactly as in the Java.
  - **Defender:** a port of `Team.pickDefender`.
    - Position-distance weights: 8, 4, 0.6, 0.2, plus a ×0.02 penalty at a distance of 3 or more.
    - Rating factor: `1 + 1/(1 + |Δ|/10)`.
  - **Make chance:** `clamp(35, 65, rating − floor(0.45 × defender) + 10)`. A roll margin of 30 or more scores 3, otherwise 2.
  - **Overtime:** 10-possession OTs are added while the score is tied at the end of regulation or of an OT, with no limit.
  - **Returns** every possession `{ i, offense, handler, defender, made, points, homeScore, awayScore, quarter }`, plus the final score, the OT count, and each team's box score (points per player).
  - **Clutch window:** a possession index > 109 where the margin is ≤ `((end − i + 1) / 2) × 3`. It is exported as `isClutch(i, end, margin)` for the live view.
- **`buildSchedule(league, teams, rng)`**: ports `makeSchedule` and `ScheduleTeam` (a priority queue by games left, random home/away).
  - FBA: 1290 games, 86 per team, 56 in-conference.
  - D2: 960 games, a double round-robin inside each 16-team league (30 per team, 15 home and 15 away).
- **`standings(league, teams, results)`**:
  - W-L and conference W-L, ordered by the Java `Team.isBetterThan`: games behind, then games played, then conference wins, then head-to-head. The D2 version (with `finalDec`) is ported for D2.
  - Also GB, last 10, streak, and point differential.
  - FBA: the clinch markers are ported from `clinchStar` (`*`, #1 seed), `clinchX` (`x`, top 8) and `clinchN` (`n`, eliminated). The lottery standings are non-playoff teams in reverse order.
  - D2: four league tables, each with a top-8 line and no clinch markers, as in the Java.
- **`gameDays(schedule)`**: packs games in schedule order into days where no team plays twice.
- **`winProbability(partialGame, rng, n = 200)`**: Monte-Carlo simulations of the remaining possessions from the current state.
- **`ratingSuggestions(league, rosters, results)`**: the in-season suggestion.
  - The suggestion is the rating plus a performance adjustment from −2 to +2.
  - The adjustment reuses `performanceScores` from `engine/d2/ratings.ts`, generalized to take per-player PPG and rating pairs: a regression of this season's PPG on rating, then z-buckets at ±0.5 and ±1.5.
  - Players with fewer than 5 games get no suggestion. There is no age adjustment and no luck.
- **Moves** (the result shape as in Part 2a):
  - `makeSchedules`
  - `recordGames(state, games[])`, which appends results, adds points to roster season totals, marks the calendar step done after the last game, and refuses to pass an unfinished pause
  - `applyRatingPause`
  - `closeTradeDeadline`
  - the All-Star moves (§6)

## 5. Data (strict zod, registered, body/path agreement checked)

| Document | Contents |
|---|---|
| `leagues/<fba\|fbad2>/S<n>/schedule.json` | `{ league, season, locked, games: [{ gameNo, home, away }], pauses: [{ afterGame, kind: 'ratings' \| 'deadline' \| 'allstar', done }] }` |
| `leagues/<l>/S<n>/results.json` (extended) | `GameResult` gains optional `ot: number` and `box: { home: {playerId, pts}[], away: {playerId, pts}[] }`. The existing S78 files stay valid. |
| `leagues/fba/S<n>/allstar.json` | Selections, captains, the ASG and Young-Star drafts, contest draws, every roll, the event results, and the ASG MVP (§6) |
| `RosterEntry.points` | Updated with each saved game (season total), as in the Java |

- **Saving:** every save uses `commitDocs` with the loaded versions, as Part 2a Phase 2 does.
- **Units of undo:**
  - one game (Quick-sim or Watch)
  - one day (Sim rest of day)
  - each day inside a longer "Sim to…" (a long sim saves day by day, so Undo steps back one day)
  - each rating pause
  - the deadline close
  - each All-Star step

## 6. FBA All-Star weekend (the ¾ pause)

**Page:** `/league/fba/all-star`, a hub with a step bar. Each step saves on its own.

1. **Selections:**
   - 28 All-Stars, with 4 to 11 at each position. The suggestion is the top players by rating, with PPG as the tiebreak, within the position limits.
   - 2 ASG captains, chosen from the 28.
   - 20 Young-Stars, with 2 to 7 at each position. The suggestion comes from players on restricted rookie contracts, by rating.
   - 4 Young-Star captains, who can be any player in the registry (the Hall of Fame list arrives in part 3).
   - The app suggests and you edit; the limits are enforced.
2. **ASG draft:**
   - A coin flip decides who picks first, then the captains alternate.
   - Each team's first 4 picks plus its captain must cover PG, SG, SF, PF and C, so the board narrows the list to the position still needed.
   - Undo last pick is available.
3. **Contest draw:**
   - Teams come up in random order. Each drawn team picks one player for the 5pt or dunk contest, or passes.
   - Each team can send at most one player across both contests.
   - The draw ends when 10 (5pt) + 4 (dunk) spots are filled. If spots remain after all 30 teams, the teams that passed are drawn again.
4. **5pt contest:** 10 players, 3 rolls per round, added to a running total. The top 5 advance, then the top 3, and the highest final total wins.
5. **Dunk contest:** 4 players, with the same rolls; the lowest is eliminated each round (4 → 3 → 2 → 1).
6. **Young-Star tournament:**
   - The captains draft 5 players each: a snake draft in random order, one player per position if possible.
   - Semifinal pairings are random, then a final.
   - In each game, every player gets 2 rounds of 2 rolls, and the higher team total wins.
7. **All-Star Game:**
   - 4 quarters. Each quarter every team fields one player per position, and each player rolls once.
   - **Quarter lineups** are set per position, by draft order among that team's players at the position (the captain counts as the first):

     | Players at the position | Q1 | Q2 | Q3 | Q4 |
     |---|---|---|---|---|
     | 1 | 1 | 1 | 1 | 1 |
     | 2 | 1 | 2 | 2 | 1 |
     | 3 | 1 | 2 | 3 | 1 |
     | 4 or more | 1 | 2 | 3 | 4 |

   - **A 5th player at a position** plays Q3 at the nearest position whose Q3 player would otherwise be a repeat. Of two equally near positions, the one with fewer players is used; if still tied, the guard-side one. A 6th or later player takes Q2 by the same rule.
   - **MVP:** the highest total on the winning team.
8. **Wrap-up:** a summary of every winner. **Finish All-Star weekend** marks the pause done.

**Dice and ties:**
- Every roll is **2d6** (2–12).
- Any tie (a game, a contest cutoff, a contest winner, or the MVP) is settled by a sudden-death roll-off: one 2d6 per tied participant, repeated until the tie is broken.
- Rolls come from the injected RNG and are stored, so a reload shows the same results.

**Dice screen:** one shared component with Roll next / Roll round (or quarter) / Roll to end, and a running scoreboard.

## 7. Screens

- **League page tabs:** Scores · Standings · Teams · Transactions.
- **Schedules page** (`/schedules`): each league's game count, games per team, and a preview of the first days. Make / Re-roll schedules.
- **Scores** (`/league/<l>/scores`, the layout approved in the Foundation mockups):
  - A game-day strip.
  - Cards for final, live and upcoming games, with records and each game's top scorer.
  - Watch and Box score links.
  - Controls:
    - Quick-sim game
    - Sim rest of day
    - Sim to…, which can stop at the end of a chosen day, the next pause, or the end of the regular season, with a progress bar
  - The next pause appears as a pause card in its place in the day.
- **Live game** (`/league/<l>/game/<gameNo>`, option A):
  - The scorebug with quarter and possessions left.
  - The play-by-play feed.
  - Next possession / Auto (speed: slow, normal, fast) / Sim to end. Auto drops to one possession at a time in the clutch window.
  - The line score by quarter, the win-probability line, and the live box score.
  - The game saves when it ends. Leaving before then discards it, with a warning.
- **Box score** (`/league/<l>/game/<gameNo>` for a finished game): the line score and each team's points by player.
- **Standings** (`/league/<l>/standings`):
  - FBA: East and West tables with W-L, PCT, GB, CONF, L10, STRK and DIFF, the clinch markers, and a line after 8th. Below them, the lottery standings.
  - D2: four league tables with the same columns (no clinch markers) and a line after 8th.
- **Rating pause editor** (`/league/fba/ratings-pause`):
  - The D2 ratings layout: tabs by position, a PPG column, the suggestion with its reasoning in a tooltip, and an editable new rating.
  - Edits autosave to a pause draft through `useAutosaveDoc`.
  - **Continue** writes the ratings to the rosters, logs an `edit` transaction per changed player, and marks the pause done, all in one batch.
- **Trade deadline card:** links to the trade page. **Close trading** marks the pause done and makes the trade page read-only for the rest of the season.
- **Team page:** a PPG column, plus the team's season schedule and results.

## 8. Error handling

- A sim that reaches an unfinished pause stops there and shows the pause card.
- A move blocked by a roster lock explains which window blocks it.
- Save conflicts (409) behave as in Part 2a Phase 2.
- A long "Sim to…" that fails partway keeps the days already saved and reports where it stopped.

## 9. Testing

- **Engine:**
  - `simGame` with a seeded RNG: possessions alternate, the handler and defender distributions match the weights, the make clamp holds at 35 and 65, a roll margin of 30 or more scores 3, OT repeats while tied, and the box totals equal the team score.
  - `isClutch` at its boundaries.
  - `buildSchedule`: game counts, per-team totals, home/away balance, in-conference counts (56 FBA), and the D2 double round-robin.
  - `standings`: the `isBetterThan` order, head-to-head, and the clinch markers for `*`, `x` and `n` on crafted records.
  - `gameDays`: no team plays twice in a day, and schedule order is kept.
  - `ratingSuggestions`: the 5-game minimum and the buckets.
  - `recordGames`: refuses to pass a pause, updates roster points, and marks the calendar after the last game.
  - Roster-lock checks for each window.
- **All-Star:**
  - Selection limits.
  - The captains' draft starter coverage.
  - The contest draw with passes and the one-per-team rule.
  - Contest advancement.
  - The Young-Star snake draft and bracket.
  - The ASG quarter-lineup rotation for 1–6 players at a position, including the 5th-player Q3 rule.
  - Roll-off ties.
  - Stored rolls replay identically.
- **UI (stubbed API):**
  - Schedules make and re-roll.
  - Scores sim game and sim day.
  - Sim-to stopping at a pause.
  - Live view: step, auto, save at the end, discard on leave.
  - Standings tables and markers.
  - The rating pause Continue batch.
  - Trade page read-only after the deadline.
  - The All-Star steps.
- **Browser check** on a scratch copy of the data: make schedules, sim the D2 season, sim the FBA through all three pauses including the full All-Star weekend, and check the standings.

## 10. Out of scope (2b-2 and later)

- Playoffs and play-in, seeding tiebreakers (S61/S62 rules), brackets, and series play.
- Award races and odds, All-FBA teams, MIP, and power rankings (`FootballRanker`/`Graph`).
- Season wrap-up: champions into `summary.json`, locking the season, and history pages.
- D2 promotion and relegation (offseason, part 7).
- JC and World Cup play.
