# FBA expansion: two new teams, the expansion draft and the 16-team lottery

Roadmap row "FBA expansion" (§10 of `2026-09-25-fba-web-design.md`), ledger decision D15. S80 adds the Philly Phantoms (PHI) and a placeholder "Team 32" for the Los Angeles Labradors slot. This part must be done before the S80 rollover: the teams must exist before the S80 lottery runs, and the S80 schedule has to be made for 32 teams.

## Decisions

| # | Decision |
|---|---|
| X1 | **Teams.** PHI (East) and the LAL slot (West) join in S80, giving 16 per conference. The slot's display name is "Team 32", abbreviation `T32`, logo `FBA/FBA_logo.png`. Its `teamId` is `LAL`, so the franchise history (`franchises.json` already has a `LAL` tab) links up when the Labradors are named later; renaming then changes `name` and `abbr` only. |
| X2 | **Season gating.** `teams.json` is league-wide, so each team gets an optional `fromSeason`. PHI and LAL are added with `fromSeason: 80`. Season-scoped code reads `teamsInSeason(file, season)`, so S79 standings, playoffs and rosters never see them. |
| X3 | **Calendar.** Step "Add S80 expansion teams" runs before the S80 lottery, so the teams show in it. Step "S80 Expansion Draft" runs right after "S80 FBA Draft" and before Free Agency/Offseason. |
| X4 | **Lottery.** 16 teams: PHI and LAL tied at the top (14% each, the S67 precedent), then the 14 non-playoff teams on the S74 table scaled to the remaining 72%. Ties between real teams still average. |
| X5 | **Protection** (hybrid of S68 and S75). Each existing team protects up to 4 players of its choice, on contract or not. Players with restricted contracts are protected in addition. Picks are not part of an expansion draft. |
| X6 | **Draft shape.** 4 picks per expansion team (8 in all), snake order PHI, LAL, LAL, PHI, PHI, LAL, LAL, PHI. An existing team loses at most one player. Taken players keep their contracts. |
| X7 | **Sizes come from the data.** Playoff seeds per conference stay 8; the lottery size is `teams − 2 × seeds`, and the schedule, season length and pick protection read the real team count. No `30`, `14` or `15` stays in engine code. |

## 1. Teams, logos and the one place to rename

`engine/season/expansion.ts` holds `EXPANSION_TEAMS: { season: 80; teams: Team[] }`: the two full team records (name, abbr, group, `logoFolder`, `logoFile`, badge, `fromSeason: 80`). This is the single place to edit before the step runs; afterwards `leagues/fba/teams.json` is.

- PHI: `logoFolder: 'Philly Phantoms'`, badge `#173C74` / `#D23434` (site-look spec). The manifest already lists `Philly Phantoms S80-pres..png` (from 80).
- LAL: `logoFolder: 'FBA'`, `logoFile: 'FBA_logo.png'`, badge `#16346F` / `#fff` (the FBA emblem colours). The logo manifest already has the `FBA` folder; `TeamMark` and `logoUrl` need no change.
- Schema: `Team.fromSeason: int.min(1).optional()` (strict, so it must be listed). `web/data.test.ts` keeps passing because the committed data has no team with it.
- `teamsInSeason(file, season)` in `engine/shared/` is the one filter. Every engine entry that takes a `TeamsFile` for a given season, and every page that lists teams for a season, goes through it (audit in §5).

## 2. Calendar steps

Step ids follow the existing pattern (`s{n}-...`):

- `s80-add-expansion-teams`, placed before `s80-fba-draft-lottery` in the S79 tail. Its page action writes `teams.json` with the two teams appended (skipped teams already present), records a transaction, and marks the step done. It is refused before the FBA playoffs finish and after the lottery has run.
- `s80-expansion-draft`, placed after `s80-fba-draft` in the S80 offseason. The calendar generator for new seasons includes it only for a season that has an expansion definition.
- The S79 calendar already in `web/data/calendar.json` is not edited by hand: the first step is inserted by an engine migration the app applies when it loads the calendar (the same way other steps are added to a running season), and the second is generated when the S80 calendar is created.

## 3. Lottery

In `engine/offseason/lottery.ts`:

- `LOTTERY_ODDS` is keyed by lottery size. The 14-entry table is unchanged; the 16-entry table is derived: `[14, 14, ...S74.map(p => p * 0.72)]`, i.e. `14, 14, 10.08, 10.08, 10.08, 9, 7.56, 6.48, 5.4, 4.32, 3.24, 2.16, 1.44, 1.08, 0.72, 0.36` (sums to 100).
- `lotteryPreview` builds its rows from the standings' non-playoff teams plus any team with `fromSeason === season + 1`, placed first. Expansion teams have no record: they are not averaged against real teams and always hold slots 1 and 2.
- `draftOrder` places the 16 lottery teams, then the rest worst first, the champion last, as before. `resolvePicks`'s `lotterySize` is `lottery.length`, which it already is.
- `roster/picks.ts` drops the constant `LOTTERY_SIZE = 14`. Its readers (`shrink` on a "lottery protected" pick) take the size from the season's lottery, or `teams − 2 × PLAYOFF_SEEDS` when no lottery exists yet.
- `LotteryFile` is unchanged (`odds`, `lottery`, `order`, `picks` are already lists). The Lottery page shows the two expansion teams with an "Expansion" label.

## 4. Expansion draft

New document `leagues/fba/S{n}/expansion.json`, strict zod schema `ExpansionFile` and a path rule in `schemaRegistry.ts`:

```
ExpansionFile = {
  league: 'fba', season: int,                       // the draft season (80)
  phase: 'protect' | 'draft' | 'done',
  protections: Record<teamId, playerId[]>,          // 0–4 chosen per existing team
  order: teamId[],                                  // expansion teams in pick order (8)
  picks: { n: int, teamId, fromTeamId, playerId }[], // in order
}
```

Engine (`engine/offseason/expansion.ts`, pure, injected `Rng` where random; moves return `{ ok, state, changed, label }` or `{ ok: false, problems }`):

- `startExpansion(state)`: needs the S80 FBA draft finished; builds the order and an empty `protections`. Refused if no team has `fromSeason === season`.
- `protectPlayers(state, teamId, playerIds)`: at most 4, all on that team's S80 roster; a restricted-contract player cannot be in the list (they are protected anyway) and does not count against the 4.
- `lockProtections(state)`: moves to `draft`. Protections are editable until then, per team.
- `exposed(state, teamId)`: players on the team's roster who are not protected and not restricted-contract. A team that has already lost a player has none exposed.
- `expansionPick(state, playerId, ctx)`: the team on the clock takes an exposed player; the player moves to the expansion team's S80 roster with the same contract, the donor team is marked used, a transaction entry (`kind: 'expansion'`) is appended, and the pick is recorded.
- `finishExpansion(state, ctx)`: after pick 8, marks the step done, writes the `draftHistory` entry (`kind: 'expansion'`, `season` 80) and sets `phase: 'done'`.
- If fewer than 8 exposed players remain (32 teams, so at most one in 8 can be a problem), the last picks report a problem and the commissioner may lower protections; the plan does not auto-resolve it.

Roster locks (`engine/season/locks.ts`) get the same exception the draft has: expansion picks may move players while the step is open.

App: a new Expansion page (`app/pages/ExpansionPage.tsx`, route `/offseason/expansion`) with three views by phase: team picker for protections (4 slots, restricted players shown as "protected"), the draft board with exposed players and the pick on the clock, and a read-only result. Saves go through `commitDocs`/`commitMove` with the loaded versions. The Add Teams action lives on the same page and appears while `s80-add-expansion-teams` is the next step.

## 5. Data-driven sizes: audit and fixes

Checked in the code survey; each gets a test that runs with 16/16 teams:

- `season/standings.ts`: `SEASON_LENGTH.fba` is `{ games: 86, confGames: 56 }`, correct for 15 per conference and wrong for 16 (92 / 60). It becomes a function of the group sizes (`seasonLength(league, teams)`); callers pass the season's teams. `PLAYOFF_SEEDS = 8` stays and is the only fixed number.
- `season/schedule.ts`: pairings are already per-group, so the generator works for 16/16. The rating-pause points are quarters of the game count, which it already computes; add a test with 32 teams.
- `roster/tradeValue.ts`: `AVERAGE_SLOT = 15.5` and `Math.min(14, teams)` become derived from the team count and lottery size.
- `roster/picks.ts` and `offseason/lottery.ts`: §3.
- `playoffs/*`: bracket code reads the seeds from the standings; confirm with a 32-team fixture (the existing fixture note says "15 teams per conference" and is parameterised so it can be 16).
- `offseason/fbaDraft.ts`: the draft's pick count is the `order.length`; confirm no `30`. A 32-team order gives 32 picks.
- `engine/jc/*` and `engine/d2/*` constants (`g === 30`, `D2_LEAGUE_SIZE = 16`) are about other leagues and are left alone.
- UI: `StandingsPage` already uses `PLAYOFF_SEEDS` and the standings result; Teams, Rosters, Trades and History grids use `teamsInSeason`.

## 6. Testing

- Engine unit tests: `lotteryOdds` for 16 (sum 100, expansion tied at 14, ties averaged), `drawLottery` with 16, `draftOrder`, `teamsInSeason`, expansion moves (protection limit, restricted exemption, one loss per team, snake order, contracts kept, finish writes history), `seasonLength` for 15/15 and 16/16.
- Fixture-based end-to-end: a 32-team season runs schedule → playoffs → lottery (16) → draft → expansion draft.
- App tests (jsdom, `cleanup()` after each): the Add Teams action, protection UI limits, the pick flow, the Lottery page's Expansion label.
- Schema tests: `Team.fromSeason` accepted, unknown fields still rejected; `ExpansionFile` strict and registered.
- No test, script or browser check writes `web/data/**`; browser checks use the scratch flow in CLAUDE.md.

## 7. Out of scope

- The Labradors' real name, logo and colours (a later edit of `teams.json`).
- D2/JC/WC leagues, and any change to the S74 14-team table for later seasons beyond the generic derivation.
- Importing S80 sheet data (real-data runs stay deferred).
- Expansion team free-agency behaviour: they fill rosters through normal Free Agency.

## Risks and assumptions to confirm

- `teamId: 'LAL'` for "Team 32" (X1) instead of `T32`; the spec row says "Team 32 (T32)", so this is a judgement call.
- Conferences: PHI East, LAL West (user approved).
- The calendar migration for the existing S79 calendar (§2) is the riskiest part; the plan starts with a test against a copy of the committed calendar.
