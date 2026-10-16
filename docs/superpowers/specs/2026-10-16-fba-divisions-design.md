# FBA divisions: 84-game schedule, NHL-style playoffs, 16-team lottery

Starts in S80, the first 32-team season. The Java sims are the reference for older seasons; nothing before S80 changes except where noted under "History".

## Why
The league grows from 30 to 32 teams (16 per conference). The old pairing (4 games vs each conference opponent, 2 vs each other-conference team) would give 92 games. The commissioner wants a division-based format instead: shorter, with rivalries, and with divisions that matter in the playoffs.

## Goals
- Four divisions of 8: two per conference.
- An 84-game schedule per team.
- NHL-style playoff qualification and seeding, with the existing 4-round fixed bracket.
- A 16-team draft lottery from S81 that is as fair as the 14-team table.
- Past seasons keep their conference, titles and history.

## Non-goals
- No change to series length (best of 7, 2-2-1-1-1), the Finals, D2, JC or World Cup.
- No change to roster, draft or free-agency rules.
- No editing of `web/data/**` by code or tests. The user updates real data themselves (importer or the app's own flow).

## Divisions and conferences (decided)
| Conference | Division | Teams |
|---|---|---|
| East | Atlantic | BOS, MW, NY, MAN, PHI, DCB, CAR, MON |
| East | Great Lakes | CHI, MIL, DET, CIN, CP, OV, TOR, STL |
| West | Pacific | SEA, VAN, LAL (Boise Raptors), OAK, LA, VEG, HON, DEN |
| West | Gulf | TEX, SAS, NO, FLO, CGG, PHX, MEM, ATL |

Atlanta moves East to West and St. Louis moves West to East, from S80. The conference code stays `E` / `W`. Division is a new per-team, per-season value. (Boise's teamId is `LAL`; its abbreviation is BOI.)

## Schedule (decided)
Per team: 7 division opponents x 4 games (2 home, 2 away) = 28; 8 other-division conference opponents x 3 = 24; 16 other-conference opponents x 2 (1 home, 1 away) = 32. Total **84 games** (42 home, 42 away).

- A 3-game pair is split 2-1 one way or the other. Each team has 4 opponents where it hosts twice and 4 where it hosts once, so home and away each total 42 per team. The assignment must be balanced for every team at once (a builder problem to solve; deterministic given the injected `Rng`).
- `PAIRINGS` becomes a per-relationship count (division, other division, other conference). D2 keeps its single pairing (1+1 in-league).
- The builder's greedy "team with most games left" loop stays; only the opponent multiset and the home/away split change.
- Pauses stay at the integer quarter points: games 21, 42, 63, 84 (ratings at each; trade deadline after game 42; All-Star break after game 63; ratings after 84). Same rule as today, applied to 84.
- Calendar steps (`make-s80-schedules` etc.) do not change. `make-s80-schedules` builds the 84-game schedule.

## Playoffs (decided)
Per conference, 8 teams: the top 3 in each division by record, plus the 2 best remaining teams in the conference (wild cards WC1, WC2). 16 of 32 teams qualify, as now.

- **Round 1:** the division winner with the better record plays WC2; the other division winner plays WC1. In each division, 2nd plays 3rd.
- **Round 2 (division final):** the two Round 1 winners in a division meet. The bracket is fixed (no reseeding).
- **Round 3:** division champions meet (conference final). **Round 4:** the Finals, unchanged.
- Home court: the better regular-season record hosts games 1, 2, 5 and 7 (the "lower seed number at home" rule becomes "better record"; this replaces seed numbers for ordering inside a series; a builder may keep a seed number for display only).
- Tiebreakers for division rank, wild-card rank and "better record": the same ones as S79 (the conference-standings tiebreakers in `engine/playoffs/tiebreak.ts`). Wild-card ties use the conference ranking.
- `roundName` and `bracketColumns` rename Round 2 "division finals". Standings pages show four divisions with clinch markers for division title, playoff spot and wild-card position, reusing the existing FotMob-style clinch bars (see user memory on clinch bars).

## Draft lottery (decided: my default, user approved the shape)
The S79 lottery (for the S80 draft) is unchanged: 2 expansion teams plus the 14 non-playoff teams. The lottery after the S80 season (for the S81 draft) is the 16 non-playoff teams, all real, and uses the new 16-team table below. `oddsTable` gets a 16 entry.

Pick-1 odds, worst slot first, from the 14-team table's cumulative curve stretched to 16 slots (linear interpolation of the cumulative sum):
`12.25, 12.25, 12.25, 11.5, 10.19, 8.81, 7.69, 6.56, 5.25, 4.13, 3, 2.13, 1.56, 1.19, 0.81, 0.44` (sums to 100). Keep full precision in code (compute from the curve, don't hard-code rounded numbers). Tie sharing (average of the slots) works as today. The 14-team table stays for old seasons. Open for the commissioner: if they prefer 14% for the worst three instead, only this table changes.

## History (decided)
A team's conference and division are per season. Seasons through S79 keep each team's conference at the time (St. Louis = West, Atlanta = East); "Western conference champions" and the like stay with the right team. From S80 the table above applies. History pages, the franchise page and standings for old seasons read the season's conference, not the team's current one. Old seasons have no divisions.

## Constraints
- The schema change is strict zod in `engine/shared/types.ts` with a path rule in `schemaRegistry.ts`; committed `web/data` must keep passing `web/data.test.ts` without edits. Divisions and conference changes need a place to live that existing files already satisfy (for example an optional per-season mapping, defaulting to the current `group` for seasons before S80).
- Moves return `{ ok, state, changed, label }`. All randomness takes the injected `Rng`. Saves keep ETag/If-Match, and new write paths pass loaded versions.
- Roster locks and calendar order stay as they are.

## Left to the builder
- Where the per-season conference/division mapping lives, and the importer or migration the user runs to apply it to real data (the user runs it; code must not).
- The algorithm for the balanced home/away assignment on the 3-game pairs.
- Any UI layout for four divisions on standings and bracket pages (follow the existing look).
- Tests first, including a 32-team fixture like `engine/season/expansion.e2e.test.ts`: 84 games per team, 42 home/42 away, correct pairing counts, a playoff bracket from known standings (including a case where a wild card outranks a division winner's record), and the 16-slot lottery odds summing to 100.

## Not verified yet
Nothing is built. No browser checks have been done.
