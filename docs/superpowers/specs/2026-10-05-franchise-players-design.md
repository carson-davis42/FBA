# Franchise players tab

A **Players** tab on the franchise history page (`/history/fba/teams/:teamId`): every player who ever played for the franchise with their seasons and accolades, plus a season picker that shows the roster from that exact season.

## Data and its limits

- Full season rosters (position, rating, age, points, contract) exist only for S78 and S79 (`leagues/fba/S78|S79/rosters.json`, keyed by franchise `teamId`).
- Every earlier season is known only from the player career bios (`leagues/fba/playerBios.json`, 1,336 players, checked against the commissioner's Players sheet on 2026-10-05). A bio stint such as `CT-S41-S56` or `BOS/DEN-S30-S31` gives a team code and a range of seasons; honours sit under their stint, some with an exact season (`S62 ROTY`), some only as a count (`2x Young-Star`).
- So before S78 a roster is **names plus honours won that season**: no ratings, positions or stats. The user accepted this on 2026-10-05.

## Behaviour

**Tabs.** The page gets an Overview / Players tab bar (the existing `.subnav` style). Everything on the page today is Overview. The tab is chosen by `?tab=players`, so it can be linked; default is Overview.

**All-time view (default on the Players tab).** One row per player who ever played for the franchise:

- Player, linked to their page.
- Seasons with this team, as ranges (`S12–S18, S22`), plus a count.
- Accolades earned with this team: label and, where known, the seasons (`MVP S14, S16`); count-only honours show as `2x Young-Star`. Hall of Fame is shown as an accolade.
- Sortable by name, first season, seasons played, accolade count. A search box filters by name.

**By-season view.** A season picker listing only seasons the franchise existed (from its eras; the current season included). Choosing a season shows that season's roster:

- S78 and later: full roster columns (position, rating, age, points) from `rosters.json`, plus honours won that season.
- Before S78: name and honours won that season.
- The season is in the URL (`?tab=players&season=62`).

A player appears for a season when one of their FBA stints for this franchise covers it. Players with no stints and no honours (nothing to show) are left out.

## Matching a stint to a franchise

A stint's team code is matched to the franchise's name eras: the code must equal the abbreviation of an era whose `from`–`to` covers the seasons in question (so `TEX` in S1–S10 belongs to Montreal, `FLO` in S11 to Montreal, `FP`/`OV`/`CT` to their franchises). A code with a slash (`BOS/DEN`, a mid-season trade) counts for each team it names, for those seasons. Ranges with several parts (`S12-S18;S22-S24`) are expanded to a set of seasons.

## Units

- `engine/history/franchiseRoster.ts` (pure): `franchisePlayers(...)` returns the all-time rows and a `rosterForSeason(season)`. Inputs: the franchise, player bios, season summaries, hall of fame, the players document, and the S78/S79 rosters. It builds each player's career with `liveCareer` so accolades match the player pages.
- `app/history/FranchisePlayers.tsx`: the tab body (view switch, search, sort, season picker, tables).
- `app/history/FranchisePage.tsx`: gains the tab bar and loads the extra documents (bios, S78/S79 rosters) only when the Players tab is open.

## Out of scope

Per-season stats for pre-S78 seasons, D2/JC/World Cup rosters, editing anything.

## Testing

- Engine: era matching (including `TEX`→MON for S1–S10 and the S11 era), slash codes, multi-part ranges, `pres` stints, exact-season honours landing on the right season, count-only honours on the total, players with no stints excluded, S78/S79 rosters merged in.
- Page: the tab switches by `?tab=`, the all-time table lists and sorts players, the season picker changes the roster and the URL, a pre-S78 season shows names without rating columns.
- Run the existing `app/history` tests and `npx tsc --noEmit`.
