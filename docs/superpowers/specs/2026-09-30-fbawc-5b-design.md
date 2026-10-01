# FBAWC part 5b: data and engine for the S79 World Cup

Status: design agreed with the user 2026-09-30. Parent spec: `2026-09-30-fbawc-design.md` (§1 rules). 5c (pages, Tournament MVP pick UI, UI commit wiring) comes after.

## 1. Decisions (settled with the user)

- **City→country table** (64 D2 cities, 40 countries) is in §2. 45 of the 85 countries have no D2 city.
- **Generated players:** rating uniform integer 65–74 (injected Rng), age 31, `playerId: null`. Drawn once, just before qualifying (odd season). They stay on the roster for the next season's World Cup (age +1 from the normal age adjustment, rating fixed), then are redrawn before the next qualifying. At the World Cup a generated slot is replaced if a real D2 player now fills that position.
- **Country rating** = plain average of the five roster ratings (Java `Team.getRating`). Qualifying uses the roster derived at the start of qualifying; World Cup pots use the roster re-decided at the World Cup start. Rating ties break by the stored random key.
- **Real roster rule:** best player per position (PG, SG, SF, PF, C) across the country's D2 cities. Ties: higher rating, then younger age, then lower playerId.

## 2. City→country table (`engine/wc/countries.ts`)

D2 teamId → fbawc teamId. USA: SJ, MIA, AUS, OMA, TAM. CAN: EDM, OTT. MEX: MC, GUAD. BRA: REC, RIO, SP. ARG: BA. ENG: LON, LIV, MAN. SCOT: EDI, GLAS. NI: BEL. IRE: DUB. FRA: PAR, LYON. SPA: MAD, BARC. ITA: ROME, MIL, NAP, FLO. GER: BER, FRAN, HAM, MUN. NET: AMS, ROT. BEL: BRUS. LUX: LUX. SWIS: ZUR. ARA (Austria): VIE, SALZ. HUN: BUD. CRO: ZAG. GRE: ATH. POL: WAR. UKR: KIEV. RUS: MOS, STP. DEN: COP. NOR: OSL. SWE: STO. PORT: LIS. TUR: IST. UAE: DBA. EGY: CAI. MOR: CAS. NIG: LAG. SA: JOH. IND: MUM. BANG: DHA. CHI: BEI, SHAN. JAP: TOK, OSA. AUS (Australia, not Austin): SYD. NZ: ACK.

Note the id clash: D2 `AUS` is Austin, fbawc `AUS` is Australia; the table is keyed per league, so there is no ambiguity. A test checks that all 64 D2 teams are mapped once, and every target exists in fbawc `teams.json`.

## 3. Engine (`web/engine/wc/`, pure TS)

Every random choice uses an injected `Rng`. Moves return `{ ok: true, state, changed, label }` or `{ ok: false, problems }`; moves that write documents follow the `WritesResult` pattern in `engine/season/moves.ts`.

- `roster.ts`: `deriveRosters({ d2Rosters, previous, season, mode: 'qualifying' | 'worldcup' }, rng)` returns `RosterEntry[]` (5 per country, PG, SG, SF, PF, C order) for all 85 countries, per §1. In `worldcup` mode it carries over the previous season's generated entries with age +1.
- `rating.ts`: `countryRating(roster)`.
- `tiebreak.ts`: `rankTable(rows, games, keys)` ordering by wins, head-to-head among the tied teams (a tied set that hasn't all played each other skips this step), point differential, then the stored random key. Returns the order plus tie notes.
- `qualifying.ts`
  - `startQualifying`: rank by rating, take the top 15 as auto. The host (S(n+1) host from `hosts.json`) replaces #15 if outside the top 15, and #15 joins the 70. Builds the 6-regular schedule: shuffled circulant graph (offsets 1, 2, 3), then about 200 random degree-preserving edge swaps with no repeated pair. 210 games, listed in rounds. Draws the tiebreak keys.
  - `playQualifyingGame`: sims the next unplayed game with `simGame`.
  - `finishQualifying`: allowed once all 210 are played. Top 49 of the table advance.
- `worldcup.ts`
  - `startWorldCup`: field = previous season's auto + advancing. Pots 1–4 by rating, 16 each. Each pot's teams shuffled across groups A–P, host forced into A. Group schedule: double round robin, 12 games per group (192), alternating first-listed team.
  - `playGroupGame`; `finishGroups` when all are played: top 2 per group. Knockout pairs in bracket order: A1–B2, C1–D2, … O1–P2, then B1–A2, D1–C2, … P1–O2 (16 games, round of 32). Winners of adjacent games meet in later rounds, so A and B teams can only meet again late.
  - `playKnockoutGame`; completing the final sets champion and runner-up.
- Games use the existing `engine/season/sim.ts` `simGame(gameNo, home, away, rng)`; overtime means no ties. Box score player ids for generated players use `<countryId>:<position>`. Real players use their playerId.

## 4. Documents (strict zod in `engine/shared/types.ts`, path rules in `schemaRegistry.ts`)

- `leagues/fbawc/S<n>/rosters.json`: the existing `RostersFile` (S79 = qualifying rosters, S80 = World Cup rosters). Generated entries have `playerId: null`.
- `leagues/fbawc/S<odd>/qualifying.json`: `league, season, host, auto[], field[70], schedule[{gameNo, home, away}], keys{teamId: number}, games: GameResult[], advanced[]` (empty until finished).
- `leagues/fbawc/S<even>/worldcup.json`: `league, season, host, field[64], groups{A..P: [4]}, pots, schedule[], groupGames: GameResult[], knockout: rounds of {id, home, away, game: GameResult | null}[], champion, runnerUp`.
- On completion the World Cup writes `S<even>/summary.json` (existing `SummaryFile`, with champion/runner-up and host). The Tournament MVP is added by 5c.
- `pathAgreementProblem` already checks league and season against the path.

## 5. Calendar

- `calendarFor(n)`: odd seasons gain `s<n>-qualifying` (league `fbawc`) at the World Cup step's position (after the draft lottery, before Retirement). Even seasons unchanged.
- `withQualifyingStep(cal)`: inserts that step into an existing calendar that lacks it (the committed S79 calendar). It does not run on real data from this part.
- Every wc move checks `calendarProblem` against its step id (`s<n>-qualifying`, `s<n>-world-cup`) and refuses out of order. `markStepDone` runs when the stage completes.
- `engine/season/locks.ts` is untouched: the wc rosters are derived, not edited.

## 6. Out of scope

Pages, bracket UI, MVP pick, UI commit wiring (5c). Clinch kinds in `Clinch.tsx` only if a type is needed by the engine (expected: no; they go in 5c). No change to `web/data` or the Java folders.

## 7. Tests

- Mapping test (§2); roster derivation (best per position, ties, generated 65–74/age 31, carry-over +1, replaced by a real player).
- Qualifying: top 15 plus host replacement and #15 moving to qualifying, 6-regular schedule with 6 distinct opponents (many seeds), 210 games, 49 advance.
- Tiebreaks: wins, head-to-head, differential, stored random key.
- World Cup: pots, one per pot per group, host in A, 12 games per group, bracket pairing, champion decided.
- Calendar: `calendarFor` odd/even, `withQualifyingStep`, out-of-order refusals.
- Schemas: strict (extra keys rejected). `web/data.test.ts` stays green.
- A full-run test: roster → qualifying → World Cup with a seeded Rng, deterministic result.
