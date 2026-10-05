# Box scores for old brackets

Every box in an old bracket (`PastBracket`, used by the FBA, D2, FBAJC and World Cup season pages) links to a page for that game or series: both teams, the result, and each team's roster from that season. Nothing that isn't stored is shown (no points, minutes or stats per player).

## Route

`/history/:league/season/:season/game/:seriesId`, with `league` one of `fba`, `fbad2`, `fbajc`, `fbawc`. Which bracket of the season:

- no query: the season's `pastBracket` (FBA, World Cup, the FBAJC March Madness bracket, the single D2 bracket);
- `?bracket=nit`: the FBAJC NIT (`jc.nitBracket`);
- `?bracket=<group>` (for example `AM`): that group's entry in the D2 `pastBrackets`.

Byes and empty slots are not links.

## The page

- Header (the live `ScoreBug`): both teams in their colours with logo, seed/record where stored, the round name (`roundLabel`) and `S<n>`. The result is points for a single game with a stored score (winner's points first, OT tag), wins for a series, `—` for a series whose page printed only the winner.
- Two roster tables, titled "Players recorded for <team> in S<n>": player (linked), plus the honours won that season. S78 and later FBA seasons also show position, rating, age and points (the real roster file). An empty roster says "No players recorded". The note says rosters hold only players the app has a career bio for, so they can be partial.
- A back link to the season page.

## Rosters

- FBA: the franchise behind the team (`resolveHistoryTeam`) through `franchiseIndex(...).rosterFor(season)` (the Players tab logic).
- D2, World Cup, FBAJC: `rosterFromBios(kind, teamName, season, ...)` in `engine/history/seasonRoster.ts`. It reads the FBA career bios' stints `D2(<city>)`, `WC(<country>)` and college school names, matching the bracket's team name case- and punctuation-insensitively, covering the stint's seasons (via `stintSeasons`), with the honours dated that season.

## Out of scope

Individual game results within a series, player stats, rosters for players with no bio.

## Tests

Engine: each kind matches by name and season, honours by season, unmatched name gives none. Page: header per result type (points, wins, unscored), rosters for FBA and a D2 team, empty roster message, unknown game. Bracket: linked boxes, none for byes.
