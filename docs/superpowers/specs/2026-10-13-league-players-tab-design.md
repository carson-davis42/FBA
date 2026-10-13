# Players tab for each league

A "Players" section in the nav of FBA, FBAD2, FBAJC and FBAWC: one sortable table of the season's rostered players.

## Decisions
| # | Decision |
|---|---|
| P1 | Route `/league/:league/players`, a `Players` entry in `leagueSections` for all four leagues (after Teams' neighbours: before `Transactions` for FBA/D2, after `Leaders` for FBAJC, last for FBAWC). |
| P2 | Rostered players of the current season only: no free agents, no D2 reserve pool, no season picker. |
| P3 | FBAJC keeps its Leaders tab unchanged. |
| P4 | Read-only: no new documents, schemas or registry rules; nothing under `web/data` is written. |
| P5 | Sorting reuses `useSort` / `SortTh` (empty values always last). Default: rating descending, then PPG descending, then name. |

## Columns
| League | Columns |
|---|---|
| FBA | #, Player, Team, Pos, Rating, Age, GP, PPG, Pts, Contract (`$amount` and end season) |
| FBAD2 | #, Player, Team, Pos, Rating, Age, GP, PPG, Pts |
| FBAJC | #, Player, School, Pos, Class, Stars, Rating, GP, PPG, Pts (the college rosters have no age) |
| FBAWC | #, Player, Country, Pos, Rating, Age, GP, PPG, Pts (World Cup games; blank when none are played) |

`#` is the rank under the current sort and filters. GP counts the player's box-score appearances in the season's results (trades and rating changes happen mid-season, so the roster `points` alone can't give games). PPG = Pts / GP (0 with no games, shown "—" for an empty GP). Pts is the sum of his box points. Player names link to `/history/fba/players/<id>` via `PlayerLink`; team names link to `/league/<league>/team/<id>`.

## Controls
A team select ("All teams"), a position select ("All positions") and a name search (case-insensitive substring) above the table. They filter before ranking.

## Engine
`engine/shared/playerRows.ts` (pure): `playerRows(input) => PlayerRow[]`, where
```ts
interface PlayerRow {
  playerId: string; name: string; teamId: string; position: Position;
  rating: number | null; age: number | null; gp: number; pts: number; ppg: number | null;
  contractAmount: number | null; contractEnd: number | null;   // FBA only, else null
  classYear: string | null; stars: number | null;               // FBAJC only, else null
}
```
Inputs: the season's `RostersFile`, the season's `ResultsFile | null` (box lines give GP and Pts), `PlayersFile` (names, "Unnamed" fallback) and, for the World Cup, the same shape from its results. Vacant slots (`playerId === null`) are skipped. A player appearing twice (it cannot normally) is counted once (the first roster entry).

## Out of scope
Past seasons, free agents/reserves, career stats (the history Players page covers them), per-game or advanced stats, exporting.
