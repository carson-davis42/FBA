# Part 2b-2b: Awards and Power Rankings (FBA + FBAD2) — Design

**Date:** 2026-09-28
**Status:** Approved in brainstorming; awaiting spec review
**Parent specs:**
- `docs/superpowers/specs/2026-09-25-fba-web-design.md`
- `docs/superpowers/specs/2026-09-27-postseason-design.md` (2b-2a, merged)

**How 2b-2 is split:**
- **2b-2a:** the postseason (done).
- **2b-2b (this document):** season awards with live races, and the power-rankings pages.
- **2b-2c:** season wrap-up and "Go to next season".

**Java reference:** tag `java-v1`.
- `FBA/src/fba/Main.java`:
  - `getAwardScore`, `getTeamSuccessScore`, `printAwardRace`, `toAmericanOdds`, `printMVPRace`, `printPPKAwardRace`, `printLPAwardRace` and `printMCAwardRace`;
  - `updateRankings` and `updateStandings`, which refresh the rankings every 20 games.
- `FBA/Awards.txt`: the S78 races.
- `FBA/Rankings.txt`.

**History reference:** the main history sheet's tabs "Awards, Conference Titles, & AS" and "All-FBA Teams", and the D2 history sheet's tab "D2 Awards(S68-pres.)" (see memory `fba-data-sources`).

## 1. Goal

Award the S79 season's honours in the app, the way the commissioner has since S73:
- **FBA:** MVP, ROTY, PPK Award, LP Award, MC Award, DPOY, MIP, and two All-FBA teams laid out G / F / C / ANY / ANY.
- **D2:** an MVP for each league: PL, WL, UL and IL.

The app suggests every winner from a live race, and the commissioner picks or changes each one, then locks them. Power rankings get their own tab for the FBA and for each D2 league.

The All-Star weekend awards were done in 2b-1. The league and conference champions come from 2b-2a.

## 2. Flow and calendar

| Calendar step | Order |
|---|---|
| `fba-d2` | Regular season, then the **Awards step** (4 league MVPs), Lock awards, Lock seeds, then the playoffs |
| `fba` | Regular season, then the rating pause after game 1290, then the **Awards step**, Lock awards, Lock seeds, then the playoffs |

- **Awards tab** (`/league/:league/awards`):
  - During the regular season it shows the live races, read-only.
  - Once the season is over and every pause is done, it becomes the Awards step, with the pick controls.
  - After locking, it shows the winners and the final races as they stood.
- **Lock seeds** (2b-2a) gets one more refusal: "Lock the S79 awards first".
- **Continue:** Home's Continue already goes to the Playoffs tab once the regular season is over (2b-2a). While the awards aren't locked, that tab shows an "Awards step ▸" card in place of the Lock seeds button, so Home itself doesn't change.
- **Undo:** Lock awards is one undoable batch. Undo works newest-first, so it's only reachable before Lock seeds.
- **Rankings tab** (`/league/:league/rankings`) is available any time.
- **New tabs:** Awards and Rankings are added to `LeagueTabs` for the FBA and D2, in this order: Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions.

## 3. Races

The races are pure functions over regular-season results, current rosters, and last season's roster. Playoff games never count. Each race shows its top 10 with odds and each candidate's score parts.

| Race | League | Eligible | Ranked by |
|---|---|---|---|
| MVP | FBA | every rostered player | award score |
| PPK Award | FBA | PG, SG | award score |
| LP Award | FBA | SF, PF | award score |
| MC Award | FBA | C | award score |
| ROTY | FBA | rookies (below) | award score |
| DPOY | FBA | every rostered player with at least 5 games of defensive data | points saved per game |
| MIP | FBA | non-rookies on last season's FBA roster | MIP score |
| MVP-PL, -WL, -UL, -IL | D2 | that league's rostered players | award score |

**Common rules**
- Players need at least 5 regular-season games to appear in any race, the same minimum the rating pause uses.
- A player's team and position are their current roster entry.
- Their rating is the current rating: after the pause at game 1290 once it's done.
- **PPG** = the player's regular-season points ÷ the player's games played, taken from the box scores.
  - The Java divided by the team's games instead. That's identical for anyone who played every game.
- **Team win%** is the player's current team's regular-season record.

**Award score** (Java `getAwardScore`): `0.60 × PPG + 0.20 × rating + 0.20 × (team win% × 100)`.
- Teams with no games count as 50, as in the Java.
- Ties sort by PPG, then rating, then player id.

**Odds** (Java `printAwardRace` and `toAmericanOdds`):
- The pool is the top 8, or fewer if there are fewer candidates.
- Each weight is `exp((score − best) / 2)`, and a player's probability is their weight ÷ the sum of the weights.
- **American odds:**
  - clamp p to [0.0001, 0.9999];
  - if p > 0.5, odds = `round(−100p / (1 − p))`, otherwise `round(100(1 − p) / p)`;
  - cap the result to [−5000, +10000].
- **Display caps:**
  - places 1–6 with odds above +6000 show `+6000`;
  - places 7–8 above +8000 show `+8000`;
  - places 9–10 always show `+10000`.
- **Golden test:** with S78 inputs, the MVP race must reproduce `FBA/Awards.txt` exactly (+210, +654, +694, +774, +1034, +1087, +1113, +1919).
  - Points come from `FBA/FBARosters.txt` (last field). Ratings come from `Awards.txt`. Team records come from `FBA/Results.txt`, and PPG is points ÷ 86.
  - This was checked while designing: all 8 match.

The same odds method applies to DPOY and MIP, using their own scores.

**Rookies (ROTY):** a player on a restricted (rookie) contract who is not on last season's FBA roster (`leagues/fba/S<season−1>/rosters.json`). For S79 that's exactly the 11 S79 draftees.

**MIP** (S73 rule):
- **Boost** = rating now − rating on last season's FBA roster. That includes the offseason adjustment.
- **MIP score** = `boost + (rating now − 80) / 5`. So +6 ending at 86 (7.2) beats +7 ending at 79 (6.8).
- **Eligibility:** only players who were on last season's FBA roster, so rookies are excluded by construction.
- **Flag:** players in their second season (on a restricted contract) show a "2nd season" flag, since the rule says they're discouraged, not barred.

**Defensive stats (DPOY)**
- When a game is saved, each box line gets:
  - `def`: possessions defended;
  - `stops`: misses while defending;
  - `allowed`: points allowed;
  - `exp`: the expected points an average defender would have allowed on the same shots, stored in hundredths.
- **The average defender** is the league's mean rating over its rated rostered players at save time, rounded to a whole number.
- **Expected points** for one shot at make chance `odds` = `(2 × odds + max(0, odds − 30)) / 100`.
- **Points saved per game** = `(Σexp / 100 − Σallowed) / games with defensive data`.
- Playoff games record these too, for their box scores, but no race uses playoff games.
- **Why this metric:** in the sim, defense is only `0.45 × rating` in the make chance, so every defensive metric tracks rating closely. In a planning probe over 3 simulated S79 seasons, points saved correlated 0.91 with rating and stops per game was mostly exposure. Points saved is the most faithful measure of the defense formula, and the commissioner makes the call. A separate defensive rating is a later part.

**All-FBA suggestion**
1. Team 1: G = the best PG/SG by award score, F = the best SF/PF, C = the best C, then two ANY slots for the next two best players at any position.
2. Team 2: the same, from the players who are left.

## 4. Data

`leagues/<league>/S<season>/awards.json`, with a strict zod schema and a path rule for `fba` and `fbad2`:

```
AwardsFile {
  league, season, locked
  awards: [{ award: AwardId, playerId, teamId }]   // FBA: MVP, ROTY, PPK, LP, MC, DPOY, MIP; D2: MVP-PL, MVP-WL, MVP-UL, MVP-IL
  allFba: null | { team1: AllFbaSlot[5], team2: AllFbaSlot[5] }   // FBA only
}
AllFbaSlot = { slot: 'G' | 'F' | 'C' | 'ANY', playerId, teamId }   // slots in the order G, F, C, ANY, ANY
```

**Schema checks:**
- award ids unique and valid for the league;
- All-FBA slots in order;
- no player on both teams;
- `allFba` is `null` for the D2.

**Other data changes:**
- `BoxLine` gains optional `def`, `stops`, `allowed` and `exp`, all non-negative integers. Results without them, including all imported and S78 data, stay valid.
- `TransactionType` gains `'awards'`.
- `SeasonState` gains `awards: AwardsFile | null`, and `'awards'` is added to the `SeasonDocKey` values. `useSeasonState` loads it and records its version. Saves go through `commitSeason`.

**Draft and lock**
- **Draft:** picks save as you go, into `awards.json` with `locked: false`, using the rating-pause editor's autosave pattern, with its `useRef` guard.
- **Lock awards:**
  - It refuses unless the regular season is over, every pause is done, and it's the league's calendar step.
  - Every award must have an eligible winner, and for the FBA both All-FBA teams must be complete and valid.
  - It sets `locked: true` and appends one `'awards'` transaction line, e.g. "S79 awards: MVP Reagan Butler (HON), ROTY … ; All-FBA 1st: …".
- **Team at lock:** a player's `teamId` in the file is their team at lock time.

## 5. Power rankings

**Marks:** FBA every 20 regular-season games (20, 40, …), plus the final game count. D2 every 32 games (32, 64, …, 960), ranked separately per league, with a PL / WL / UL / IL picker.

**A mark's ranking** is `powerRankings` (2b-2a) over the first N games, restricted to that league's teams.
- Teams it leaves out (no wins yet) appear unranked at the bottom, by team id.

**Movement** compares a team's rank at this mark with the previous mark:
- ▲n or ▼n;
- `—` for no change;
- `NEW` if it was unranked before.

**The page** shows rank, logo and name, record at the mark, and movement. A mark dropdown defaults to the latest mark. Before the first mark it says "Rankings start after game 20" (32 for the D2). Everything is calculated from results; nothing is stored.

## 6. Engine (`web/engine/awards/`, pure)

| Module | Exports |
|---|---|
| `defense.ts` | `defenseLines(game: SimGame, refRating: number)`, `leagueRefRating(rosters)`, `seasonDefense(results)`, `pointsSavedPerGame(...)` |
| `score.ts` | `awardScore`, `americanOdds`, `raceOdds(scores)` (Java pool, softmax and display caps) |
| `races.ts` | `races(state, lastSeasonRosters)`, which returns each race's rows; `isRookie`, `mipScore`, `suggestAllFba` |
| `awardMoves.ts` | `setAward`, `setAllFbaSlot`, `lockAwards` (the `SeasonResult` shape) |
| `rankingsTimeline.ts` | `rankingMarks(league, played, total)`, `rankingAt(teams, games, mark, group)`, `movement(prev, cur)` |

**Changes to existing code**
- `toGameResult` takes `refRating` and adds the defensive fields. `recordGames` and `recordPlayoffGame` pass `leagueRefRating(state.rosters)`.
- `lockSeeds` adds the awards-locked refusal.
- The FBA flow also needs last season's roster (`leagues/fba/S78/rosters.json`), loaded read-only by the Awards page and passed into `races`.

## 7. Screens

**Awards tab**
- **During the season:** each race as a card with its top 10: rank, player, team, position, PPG, rating, and odds. Under each row: "score 0.6×PPG + 0.2×rtg + 0.2×win% = …". DPOY shows points saved, stop rate and times defended per game. MIP shows last season → now, the boost, and the 2nd-season flag.
- **Awards step:**
  - Each award gets a picker. The suggestion is preselected, and there's "Other eligible player…" for anyone else who qualifies.
  - The All-FBA grid has 2 teams × 5 slots, each a position-filtered picker.
  - Problems appear live ("Pick a winner for DPOY", "Reagan Butler is on both All-FBA teams").
  - **Lock awards** is disabled until there are no problems.
- **Locked:** the winners and the All-FBA teams, then the final races.

**Rankings tab:** as §5.

## 8. Error handling

- **Refused moves** show their problems and save nothing.
- **Saves send versions**, so a stale tab gets the standard conflict reload.
- **The draft autosave** follows the existing pattern: a failed autosave shows its error and falls back to the saved copy, as the rating-pause editor does.
- **Duplicate All-FBA picks** are allowed in a draft, so the page can explain them. The schema rejects them only in a locked file.
- **Missing last-season roster:** if the FBA's last-season roster can't be loaded, a warning shows and Start and Lock stay disabled, since ROTY and MIP depend on it.
- **Old results** without defensive fields count as zero defensive possessions. A player with fewer than 5 games of defensive data isn't ranked for DPOY.

## 9. Testing (test-first)

- **`score`:**
  - the S78 golden odds test (§3);
  - the display caps;
  - `americanOdds` at p = 0.5, favourites (negative odds), and the clamps.
- **`defense`:** a hand-worked possession list with exact `def`, `stops`, `allowed` and `exp`, including the average-defender reference; `pointsSavedPerGame` skipping old results.
- **`races`:**
  - position eligibility for each race;
  - the rookie rule (restricted and not on last season's roster; a second-year player isn't a rookie);
  - MIP score and eligibility, with the 2nd-season flag;
  - the 5-game minimum;
  - D2 per-league MVP races;
  - a valid All-FBA suggestion.
- **`awardMoves`:**
  - every refusal;
  - draft picks, then lock, with the transaction line;
  - lock is refused with a missing or ineligible pick, or an invalid All-FBA team;
  - `lockSeeds` is refused until awards are locked.
- **`rankingsTimeline`:** the mark lists for both leagues; the final mark equals `powerRankings` over all games; movement including NEW and unranked teams.
- **Schema:** `AwardsFile` valid and invalid cases; old `BoxLine`s without defensive fields stay valid.
- **The whole-season engine test** (2b-2a) adds both leagues' Awards steps before Lock seeds.
- **UI (jsdom, `cleanup()` in `afterEach`):**
  - Awards tab stages, pick, then lock;
  - Rankings picker and movement;
  - the new tabs;
  - the Playoffs tab's "Awards step ▸" card in place of Lock seeds.
- **Browser check** on a scratch copy (per `CLAUDE.md`):
  - mid-season races and rankings;
  - the D2 Awards step, then Lock seeds;
  - the FBA pause at game 1290, the Awards step with All-FBA, then Lock seeds.

## 10. Out of scope

- **2b-2c:** copying awards into league history, and "Go to next season".
- **Later:**
  - a separate defensive rating, which would change the sim, rosters, drafts and rating adjustments;
  - a Players / stats-leaders page;
  - playoff awards such as a Finals MVP (none in the league's history);
  - D2 awards beyond the four league MVPs.
