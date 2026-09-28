# Part 2b-2a: Postseason (FBA + FBAD2) — Design

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-25-fba-web-design.md`
- `docs/superpowers/specs/2026-09-27-season-play-regular-season-design.md` (2b-1, merged)

**How 2b-2 is split:**
- **2b-2a (this document):** seeding tiebreakers, the playoffs for both leagues, and D2 promotion and relegation.
- **2b-2b:** award races and odds, final awards, All-FBA, MIP, and the power-rankings page.
- **2b-2c:** season wrap-up and "Go to next season".

**Reference rules:** `docs/fba-rule-changes.md`. The later rule wins. The commissioner replaced the S61 tiebreak list in this brainstorm (see §3).
**Java reference:** tag `java-v1`.
- `FBA/src/fba/Main.java`: `playoffs`, `whereToNext`, `messageToAdjustRatings`, `updateRankings`.
- `FBA/src/fba/FootballRanker.java`, `Graph.java` and `AllPathsInfo.java`.
- `FBA/src/fba/PlayoffSeries.java`.
- `FBAD2/src/fbad2/Main.java`: `playoffs`, `printSeasonSummary`.

## 1. Goal

Play the S79 postseason for both leagues in calendar order. First the D2 playoffs (still the `fba-d2` step, before the FBA season), then the FBA playoffs (the `fba` step).

- **Every playoff game in both leagues is watched live.** There is no quick-sim in the playoffs, as in the Java.
- **Every series is best of 7**, first to 4 wins.
- **When a league's last final is saved**, its champions are recorded and its calendar step is marked done.

## 2. Flow and calendar

| Calendar step | Stages, in order | Done when |
|---|---|---|
| `fba-d2` | D2 regular season (2b-1), then **Lock seeds**, then D2 playoff games | The last of the four D2 league finals is saved |
| `fba` | FBA regular season (2b-1), then the **rating pause after game 1290**, then **Lock seeds**, then FBA playoff games | The FBA Finals end |

**Change to 2b-1:** `recordGames` no longer marks the league step done when the regular season ends. `recordPlayoffGame` marks it done, on the league's last final.

### FBA
1. **Rating pause.** The FBA default pauses gain a fourth entry, `{ afterGame: 1290, kind: 'ratings' }`. It is the Java's pre-playoff `messageToAdjustRatings`, and it uses the existing rating-pause editor. The real data has no S79 schedule yet, so nothing needs migrating.
2. **Seeding.** The top 8 in each conference are seeded in tiebreak order (§3). The first round is 1v8, 2v7, 3v6 and 4v5.
3. **Bracket.** The bracket is fixed, with no re-seeding, as in the Java `whereToNext`:
   - The 1/8 winner meets the 4/5 winner.
   - The 2/7 winner meets the 3/6 winner.
   - The two semifinal winners meet in the conference final.
   - The East and West champions meet in the FBA Finals.
4. **Rotation.** The first-round queue is East 1v8, West 1v8, East 2v7, West 2v7, and so on.
   - After each game, a series that isn't over goes to the back of the queue.
   - When a series ends and its next series has both teams, that next series joins the back of the queue.
   - The engine refuses any game except the one at the front of the queue.

### D2
- **No rating pause.** The D2 Java has none.
- **Seeding.** The top 8 in each of PL, WL, UL and IL are seeded in tiebreak order (§3), with the same 1v8 to 4v5 pairings and a fixed bracket inside each league: quarterfinals, semifinals, then the league final.
- **Four champions.** Each league's final crowns that league's champion. There is no cross-league final.
- **Rotation.** The first-round queue is PL 1v8, WL 1v8, UL 1v8, IL 1v8, PL 2v7, and so on. It advances the same way as the FBA's.
- **Promotion and relegation.** When all four finals are done, the result follows the S78 rule and the Java `printSeasonSummary`:
  - **Promoted from WL, UL and IL:** the regular-season #1 and the playoff champion. If #1 is also the champion, the regular-season #2 goes up instead.
  - **Relegated from PL, WL and UL:** regular-season places 15 and 16.
  - The result is saved in `playoffs.json`. **Teams do not change leagues in this part**; 2b-2c applies it at "Go to next season".

### Home court
- **2-2-1-1-1.** The higher seed hosts games 1, 2, 5 and 7, and the lower seed hosts games 3, 4 and 6. In the Java, the away team hosts whenever the series has 2, 3 or 5 games played.
- **Within a conference or league,** the fixed bracket always pairs two different seed numbers, and the lower number is the higher seed.
- **FBA Finals:** the better team by the §3 order, without the conference-record step, since the teams are from different conferences.

### Roster locks
Unchanged. The playoffs come after the trade deadline, so the post-deadline locks from 2b-1 apply.

## 3. Tiebreak order (seeding and standings)

The commissioner set this order; it replaces the S61 list:

1. **Overall record**, i.e. games behind.
2. **Conference record.** D2 teams play only inside their league, so for the D2 this step never separates anyone.
3. **Head-to-head.**
4. **Point differential.**
5. **Power rankings** (§4).

**How the order is applied:**
- Each step is applied to the whole group of tied teams. Head-to-head uses the combined record in games among the tied teams only.
- When a step splits the group, each smaller group that is still tied starts again at head-to-head. Overall and conference record are already equal inside it.
- The 1-minute tiebreaker game, the tiebreaker tournament, the S69 dice rule and the "win opponents' record" step are all dropped.

**Where the order is used:**
- The **Standings page** uses this order too, so the seeds always match the standings. It replaces 2b-1's post-head-to-head fallbacks, point differential then team id.
- The FBA clinch markers (`*`, `x`, `n`) are unchanged.

### Confirmed-status markers

The standings show each status the moment it is mathematically certain, not only at season end.

**D2** (new; the D2 had no markers in 2b-1):
- **`*` / `x` / `n`:** clinched first place, clinched a top-8 playoff spot, or eliminated from one. This is the FBA clinch math with 16 teams.
- **`▲` promoted (WL, UL and IL only):**
  - The regular-season #1 gets it when it clinches first place.
  - The second spot is known only when the league final ends. It goes to the champion, or to the regular-season #2 if the #1 also won the final.
- **`▼` relegated (PL, WL and UL only):** a team gets it once it can no longer finish above 15th. The check uses the same method as the FBA's `n`, asking whether the team can still reach 14th.
- `▲` and `▼` show next to `x` or `n`. A promoted #1 shows `* ▲`, since it has clinched first place.

**After the playoffs, both leagues:**
- The league champion gets `🏆`.
- In the FBA, the two conference champions get `C`.

**Legends.** Each league's Standings page lists the markers it uses. The lottery table is unchanged.

**How it works.** `standings()` takes the league's `playoffs.json`, or `null`, as an extra optional input, so champions and the final promotions can be marked. The clinch math lives in `engine/season/standings.ts`, next to the FBA's.

**Notes.** Every tie the order breaks produces a plain-language note, saved with the seeds, for example:
- "MAN over CAR: conference record 37–19 vs 30–26"
- "BOS over DET: head-to-head 3–1"
- "VEG over MIL: power ranking #16 vs #19"

## 4. Power rankings (engine only in this part)

- **The port.** `engine/playoffs/ranker.ts` ports `FootballRanker.doWeightedAndWinPercentAdjusted` and the graph code it uses (`Graph`, `AllPathsInfo`), run over the regular-season results.
- **The golden test.** `FBA/Rankings.txt` was written by the Java from the first 1280 games of `FBA/Results.txt`. The port, given those 1280 games, must reproduce that order exactly.
- **Not stored in this part.** Rankings are computed when needed. A tiebreak that uses them writes the ranks it used into its note.
- **2b-2b** adds stored snapshots every 20 games, the movement arrows and the rankings page.

## 5. Data (strict zod, registered, body/path agreement checked)

There is one new document per league and season: `leagues/<league>/S<season>/playoffs.json`. It gets a schema in `engine/shared/types.ts` and a path rule in `engine/shared/schemaRegistry.ts`.

```
PlayoffsFile {
  league: 'fba' | 'fbad2', season, locked
  seeds:  [{ group: 'E'|'W' | 'PL'|'WL'|'UL'|'IL', teams: [8 team ids, seed order], notes: [string] }]
  series: [{ id, group, round, home, away, homeSeed, awaySeed, homeWins, awayWins, winner, next }]
  queue:  [series id]
  games:  [GameResult & { seriesId, gameInSeries }]
  outcome: null | {
    champions: [{ group, teamId, runnerUp, score }]   // score like "4–1"
    promotion: null | [{ league, promoted: [2 ids], relegated: [2 ids] }]   // D2 only
  }
}
```

- **Series ids.**
  - FBA: `E-R1-1` … `E-R1-4`, `E-SF-1`, `E-SF-2` and `E-CF`, the same for `W-`, and `FINALS`.
  - D2: `PL-R1-1` … `PL-R1-4`, `PL-SF-1`, `PL-SF-2` and `PL-F`, the same for WL, UL and IL.
  - `group` is `'E'`, `'W'`, `'PL'` and so on, or `null` for `FINALS`. `round` runs 1 to 4.
- **`home` and `away`** are the team with home court in games 1, 2, 5 and 7 and the other team. Either is `null` until known. Games 3, 4 and 6 swap the hosts.
- **`games[].gameNo`** is the playoff game number (1, 2, 3 …) in play order. `home`, `away` and the points are for that game's actual host. The existing `GameResult` fields are reused: `periods`, `ot` and `box`.
- **Schema checks (superRefine):**
  - wins are at most 4;
  - `winner` is set exactly when one side has 4 wins;
  - `next` names a series in the file;
  - each game's teams are its series' teams;
  - `gameInSeries` counts up from 1 within each series;
  - the queue lists only unfinished series whose teams are both known.
- **The committed `web/data` has no `playoffs.json`**, so `web/data.test.ts` is unaffected.

**Saves.** `playoffs.json` becomes one more season document:
- `SeasonState.playoffs` holds it.
- `'playoffs'` is added to the `SeasonDocKey` values.
- `useSeasonState` loads it and records its version.

So playoff moves are saved with the existing `commitSeason`, which already sends the loaded versions.
- **Lock seeds** is one undoable batch that writes `playoffs.json`, labelled e.g. "Lock S79 FBA playoff seeds".
- **Each playoff game** is one batch that writes `playoffs.json` (the game, series wins, winner, queue and, on the last final, `outcome`). The last final also writes `calendar.json`.

## 6. Engine (`web/engine/playoffs/`, pure, RNG injected)

| Module | Exports | Notes |
|---|---|---|
| `ranker.ts` | `powerRankings(teams, games): string[]` | §4 |
| `tiebreak.ts` | `orderTeams(teams, games, ranks): { order, notes }` | §3. It is also used by `engine/season/standings.ts` |
| `bracket.ts` | `buildBracket(league, seeds)`, `hostOf(series, gameInSeries)`, `advance(playoffs, seriesId, winnerId)` | Fixed pairings, 2-2-1-1-1 and the rotation (§2) |
| `promotion.ts` | `promotion(standingsByLeague, champions)` | The S78 rule (§2) |
| `moves.ts` | `seedPreview(state)`, `lockSeeds(state)`, `nextPlayoffGame(playoffs)`, `recordPlayoffGame(state, sim)` | Return `{ ok: true, state, changed, label }` or `{ ok: false, problems }` |

**`lockSeeds` refuses unless:**
- this league's calendar step is current;
- the regular season is over;
- every schedule pause is done (for the FBA, that includes the one after game 1290);
- no `playoffs.json` exists yet.

**`recordPlayoffGame` refuses unless:**
- the game is the front of the queue: same series, next game number, and the right host;
- this league's calendar step is current.

On the last final it writes `outcome` (and, for the D2, `promotion`) and marks the calendar step done.

**Reused unchanged:** the game sim `simGame`, lineups from the current rosters (`lineup`), `winProbability`, and `toGameResult`.

## 7. Screens

### Playoffs tab (`/league/:league/playoffs`, added to `LeagueTabs`)

What it shows depends on the stage:

| Stage | Shows |
|---|---|
| Regular season in progress | "Playoffs start after game N", plus projected seeds from the current standings, with notes |
| Season over, pause open (FBA) | A link to the rating pause after game 1290 |
| Ready | Seed tables (FBA: East/West; D2: four leagues), tiebreak notes, and **Lock seeds** |
| In progress | A **next-game card**, then the bracket |
| Done | A champion banner (e.g. "S79 FBA Champions: Boston Bucks, 4–1 over Memphis Blues"), then the bracket. D2 adds the four champions and each league's promoted and relegated teams |

- **The next-game card** reads, for example, "Playoff game 17 · East first round, game 3 · MAN at CIN · CIN leads 2–0 · Watch ▸".
- **The bracket** is drawn as columns: first round, semifinals and conference or league final.
  - FBA: East and West meet in a Finals column.
  - D2: a PL/WL/UL/IL picker shows one bracket at a time.
  - Each series box shows seeds, logos, names and wins, and the winner is highlighted.
  - Clicking a series lists its games with scores and box-score links.
  - On narrow screens the bracket scrolls sideways inside its own box, never the page.

### Playoff game page (`/league/:league/playoffs/game/:n`)
- **Next game:** the live viewer.
- **Played game:** the box score.
- **Any other game:** "This isn't the next playoff game" and a link back.
- **The shared live viewer.**
  - The live part of 2b-1's `GamePage` moves into a shared `app/season/LiveGame.tsx`: play-by-play, controls, speeds, the win-probability chart, the leave-page warning, and the single save at the final, with its `useRef` guard.
  - Both game pages use it, and the regular-season page's behavior doesn't change.

### Changes to existing pages
- **Scores:** after the last regular-season game it shows "The regular season is complete. Playoffs ▸" in place of the plain complete line.
- **Standings:** uses the §3 order and shows the confirmed-status markers (§3).
- **Home Continue ▸:** once the league's regular season is over, goes to the Playoffs tab. That tab links to the pause after game 1290, then offers Lock seeds, then the next game's Watch ▸.

## 8. Error handling

- **Refused moves** show their problems on the page and save nothing, e.g. "Finish the rating adjustment pause (after game 1290) first", "This isn't the next playoff game (next is game N: …)", or, before the D2 is done, "The season is played at the FBA step (current step: FBA D2)".
- **Conflicts:** saves send versions, so a stale tab gets the standard conflict message and reloads.
- **A failed save of a finished live game** keeps the final on screen and offers Retry. Reloading before the final replays that game from scratch, the same as the regular season.
- **Seeds are final once locked.** The only way back is Undo. Undo works newest-first, so it reaches Lock seeds only after every later save, including every playoff game, has been undone.

## 9. Testing (test-first)

- **`tiebreak`:**
  - Two-team ties decided at each step: overall, conference, head-to-head, point differential and rankings.
  - A three-team tie decided by head-to-head within the group.
  - A split that restarts at head-to-head.
  - Note text.
  - Standings order matches the seeds.
- **Markers:**
  - D2 `x`/`n` at the clinch boundary.
  - `▲` for WL, UL and IL #1 as soon as first place is clinched, but never for PL.
  - `▼` only once 14th is out of reach.
  - The second `▲` only after the league final, covering both the champion and the #1-won-it (#2 goes up) cases.
  - `🏆` and FBA `C` from `playoffs.json`.
- **`ranker`:** the golden test against `FBA/Rankings.txt` using the first 1280 games of `FBA/Results.txt`, which are read-only inputs.
- **`bracket`:**
  - Pairings 1v8 to 4v5.
  - Fixed next slots.
  - Home court by seed, and by record in the Finals.
  - `hostOf` for games 1 to 7.
  - The Java rotation order through a whole bracket.
- **`promotion`:** #1 also won the playoffs versus a different champion; relegation of places 15 and 16.
- **`moves`:**
  - Every refusal in §6.
  - Out-of-order games refused.
  - The calendar step is done only after the last final.
  - `recordGames` no longer marks the step done.
  - A full engine run on test data: both regular seasons, the pauses, seeding and every playoff game, with zero refused writes.
- **Schema:** valid and invalid `PlayoffsFile` cases for each superRefine rule.
- **UI (jsdom, `cleanup()` in `afterEach`):**
  - Each Playoffs tab stage.
  - Next-game card links.
  - Lock seeds sends versions.
  - `LiveGame` saves exactly once, including through `useSaving`'s forced render.
  - Playoff game page states.
  - Scores and Home links.
- **Browser check** on a scratch copy (per `CLAUDE.md`):
  - The D2 playoffs to their end, including the promotion panel.
  - The FBA rating pause after game 1290, seeding with notes, and several live FBA playoff games.
  - The rest played through in the engine so the champion banner and the done calendar step can be checked.

## 10. Out of scope

- **2b-2b:** award races with American odds (MVP, PPK, LP, MC), final awards, All-FBA teams, MIP, playoff stat leaders, and the power-rankings page with snapshots and movement.
- **2b-2c:**
  - copying champions into `summary.json`;
  - applying promotion and relegation to `leagues/fbad2/teams.json`;
  - locking the season's files;
  - clearing the Undo journal;
  - **Go to next season**.
