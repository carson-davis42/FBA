# FBAJC (junior college league), roadmap part 6: design

Status: rules agreed with the user 2026-10-01. Part 6 is split into 6a, 6b and 6c. This spec fixes the rules for all three; each sub-part gets its own plan (6a first). The Java reference is `FBAJC/` (tag `java-v1`, read-only).

## 1. Rules

### Structure
- 216 teams, 18 conferences of 12 (`leagues/fbajc/teams.json`, `group` = conference). Teams play 5 starters; team rating = average of the 5 starters' current rating.
- Empty roster slots become generated "X" freshmen when the season starts, rated 55–72 by conference tier (Java `Main.java`). Shown as "X (Team)". When an X reaches 76 (Fr), 78 (So) or 80 (Jr) it goes on a **Names needed** list on the FBAJC page so the commissioner can rename the player.
- Regular season: 29 games per team = 3 preseason tournament + 4 conference challenge + 22 conference (home and away vs each of 11 mates). 3132 games. Home has no advantage.

### Season start (Decision: at the FBAJC step)
A "Start season" button on the FBAJC page, after the Adjust College Ratings step, builds in one move: placeholder players, preseason ranking (top 25 by team rating, ties shuffled), the 27 preseason tournament fields, and the 29-day schedule. The commissioner can see the fields and re-draw them before play.

### Calendar: 29 days, one game per team per day (108 games a day)
| Days | Content |
|---|---|
| 1–3 | Preseason tournaments: day 1 four first-round games, day 2 semis and loser's bracket round, day 3 placement games and championship |
| 4–7 | 4 conference challenge sets: each set pairs the 18 conferences into 9 pairs; teams matched in shuffled order, random home/away |
| 8–29 | 22 conference rounds (double round-robin, circle method) |

This replaces the Java's priority-queue game order (the Java has no dates). Rankings recompute after each day, which equals the Java's "every 108 games after 324".

### Preseason tournaments
27 tournaments of 8 teams, every team in exactly one. Fields (Java `PreTournys`): Champions Classic = last season's champion and runner-up (read from the saved `S<n-1>/summary.json`; only if in different conferences), then top-25 teams from distinct conferences up to 4, then unranked teams from distinct conferences up to 8; Maui 4+4; tournaments 3–5: 3 top-25 + 5 unranked; 6–9: 2 + 6; 10–27: 8 distinct conferences, one team each, favouring conferences with the most teams left. A team plays 3 games: R1, then winners' or losers' bracket, then placement.

### Game sim and progression
- 120 possessions, 10-possession OT periods. Ball-handler weighted by (rating − 40); defender by `Team.pickDefender`; make chance clamp(35, 65, offence − 0.45×defence + 10)%; a make is worth 3 when the roll margin ≥ 30, else 2.
- **Kept as in the Java (user decision):** after every regular-season, preseason-tournament and conference-tournament game each starter's rating may rise (`updatePlayerRatings`, capped at 99). March Madness and NIT games do not change ratings.
- The web app records player points in **every** game, including the tournaments (the Java's postseason skips them).

### Rankings
Blend = ratingWeight × rank by team rating + frWeight × FootballRanker rank, lower is better; ties go to the ranker rank, then team rating. frWeight is a smoothstep of gamesPlayed/3132: 0 below 5%, 1 from 65%. FootballRanker = average shortest-path cost over the win graph (edge 1/max(1, margin/8)), divided by win%. The full 216 order is kept; the page shows the top 25 with change column (+n, −n, --, NR) and dropped teams.

### Standings
Per conference. Tiebreaks: conference games back, fewer conference games played, overall win%, ranking position (a ranked team beats an unranked one), then **head-to-head, point differential, and a stored random draw** (the World Cup rule; the Java left these to the sort). Standings use `app/components/Clinch.tsx` bars and key; new kinds as needed (conference champion; later NCAA/NIT bid).

### Postseason (6b)
- **Conference tournaments:** 18 conferences, 12 teams seeded by standings, 11 games (round 1: 8v9, 5v12, 6v11, 7v10; seeds 1–4 have byes; quarters 1 vs 8/9, 4 vs 5/12, 3 vs 6/11, 2 vs 7/10; semis; final). Winner = conference champion. Ratings progress in these games.
- **March Madness field (clean rule, replaces the Java's slot-52 logic):** the 18 conference champions get in; the best 46 others by ranking get at-large bids. The 64 are seeded by ranking into 16 seed lines of 4 and placed with the Java's snake into 4 regions (seed 1s to regions 1–4, seed 2s reversed; seeds 3–16 via `addToRegions`, keeping same-conference teams apart in early rounds). The commissioner can adjust the field before it starts. 63 games: R64, R32, Sweet 16, Elite 8, Final Four, Championship; no byes.
- **NIT:** the next 32 teams by ranking; 2 regions of 16 seeds; starts at the Round of 32 (31 games).
- **C-Ship MVP:** a new award (not in the Java). After the title game the commissioner picks from the **champion's roster**, listed by March Madness points per game; X players allowed. Stored as `mvpName` in `S<n>/summary.json`.
- **Awards:** same pattern as the FBA awards page. Live races use the Java's score (0.40 × scaled PPG + 0.35 × scaled rating + 0.25 × team success; softmax temperature 8 over the top 8, shown as American odds) for Trae York POY, Angelo Farrell Freshman, Rhett Blackwell Guard, Jacob Peters Forward, Dustin Holloway Center and a POY per conference (18). Picked at season end; winners stored in the summary.
- The season summary (champion, runner-up, C-Ship MVP, awards, conference champions, bracket as `pastBracket`) finishes the `fbajc` calendar step.

### History (6c)
Importers from the "FBAJC history" and "FBAJC school history" sheets (ids in the `fba-data-sources` memory note; read first, scope may shrink if thin): per-season summaries (champions, runners-up, MVP, awards, conference champions), `--jc-brackets` from the bracket PDF (about 70 two-sided March Madness and NIT pages, 16–64 slots, seeds, scores, BYEs, using `web/importers/history/` and the `PastBracket` renderer), school history pages (titles, seasons, records), and an FBAJC option in `HistoryLeagueSwitch`.

## 2. Parts

| Part | Scope |
|---|---|
| 6a | Engine (`engine/jc/`): season start, schedule, tournaments, sim with progression, rankings, standings. Schemas and path rules. Pages Scores, Standings, Rankings, Tournaments, Leaders; Start season panel; Names needed list; calendar wiring (`stepRoutes.ts`, `Home.tsx` titles, `SectionNav` `leagueSections`). |
| 6b | Conference tournaments, March Madness, NIT, C-Ship MVP pick, awards, season summary, finishing the calendar step. |
| 6c | History importers, `--jc-brackets`, school pages, history switcher. |

## 3. Design notes

- Pure TypeScript engine; every random choice takes an injected `Rng` (`engine/d2/random.ts`). Moves return `{ok, state, changed, label}` or `{ok:false, problems}`.
- New saved document types get strict zod schemas in `engine/shared/types.ts` and path rules in `schemaRegistry.ts`, under `leagues/fbajc/S<n>/` (schedule + results, rankings, tournaments, later postseason). Player ratings and points progress in the existing `rosters.json`. `web/data.test.ts` must keep passing.
- Saves go through `commitDocs` with the loaded versions (missing doc = version null). "Play day" and "Play to end of regular season" simulate in memory and save once; saving handlers are guarded with a `useRef`. A single game can be played live.
- The calendar `fbajc` step opens Scores; roster locks follow the season phase (`engine/season/locks.ts`).
- Pages for a season whose stage doesn't exist must not title themselves with the current season.
- Tests: RED first; every jsdom test file calls `cleanup()` in `afterEach`. Browser checks on scratch data only (CLAUDE.md), including 375px and dark mode; if the pane is hidden, say so.

## 4. Open items for the plans
- Exact tier-to-rating table for X players (Java `Main.java`) and the `updatePlayerRatings` constants: the 6a plan copies them from the Java.
- Circle-method conference rounds vs the Java's random game order: only the day layout is fixed here.
- Conference-champion clinch kinds and the "bid" kinds for 6b.
