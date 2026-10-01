# FBA Universe Web App: Design

**Date:** 2026-09-25
**Status:** Approved in brainstorming; awaiting spec review
**Scope:** Program-level design for all four leagues, plus the detailed scope of sub-project 1 (Foundation). Sub-projects 2–7 get their own specs when they start.

## 1. Goal

Replace the four console Java programs (FBA, FBAD2, FBAJC, FBAWC) with a local web app that:

- Plays each league from the browser when the season calendar reaches it.
- Presents games, standings, brackets, rosters, and players visually (ESPN-style scoreboard, animated live games, bracket graphics, team logos).
- Lets you browse every league's full history, imported once from the Google Sheets and then extended automatically each season.
- Automates the rules-based offseason steps and gives guided tools for the judgment calls.

The Java code stays in the repo untouched as the reference implementation.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Sim engine | Port to TypeScript; the web app becomes the program |
| Java code | Left untouched in `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/`; git tag `java-v1` on the commit before web work starts |
| Hosting / persistence | Local app (`npm run dev`); state saved as JSON files in the repo so git tracks seasons |
| History source | One-time import from the 8 Google Sheets (shared "anyone with link"); afterward the app appends finished seasons itself |
| Offseason | Automate the formulaic steps; guided manual tools for judgment calls. Exact rules are collected from the user in sub-project 7 |
| Stack | Vite + React + TypeScript; small Node server for file I/O; Vitest for tests |
| Theme | "Clean Sports Page" light theme (white cards, gray page, red `#c8102e` accent) by default; "Broadcast Dark" theme (navy `#0b1020`, condensed headlines) switchable, choice remembered |
| Navigation | Persistent sidebar (Leagues / Season / Archive) plus a home dashboard with a single **Continue ▸** button for the next calendar step |
| Scores | ESPN-style scoreboard grouped into Game Days |
| Live game | Broadcast scorebug + play-by-play feed, line score, win probability, live box score |
| Brackets | Classic mirrored layout (East left, West right, Finals center); region tabs + Final Four centerpiece for 64-team brackets |
| Non-FBA logos | JC and D2 teams get generated monogram badges (initials + color); World Cup countries get flags |

## 3. Architecture

```
FBA/  FBAJC/  FBAD2/  FBAWC/     Java (untouched reference, tag java-v1)
FBA Logos/                        source logo PNGs (unchanged)
web/
  package.json                    single package; scripts: dev, test, import
  engine/                         pure TypeScript domain logic; no DOM, no fs
    rng.ts                        injectable RNG (seedable for tests)
    fba/ d2/ jc/ wc/              per-league sim, schedule, standings, brackets
    shared/                       game sim core, series, tiebreak helpers, types
  server/                         Node HTTP server: JSON state read/write, logo serving
  app/                            React UI
    shell/                        sidebar, top bar, theme, routing
    pages/                        home, league pages, team, player, history
    components/                   scoreboard, game card, bracket, standings table, roster table
  importers/                      one-time scripts: .txt + xlsx → JSON, import report
  data/                           the league save (committed)
```

**Boundaries**

- `engine/` is pure: functions take state and an RNG and return new state or events. It never touches the filesystem or the DOM, so it can be unit-tested in isolation.
- `server/` knows about files only: it validates JSON against schemas, writes atomically (temp file + rename), and keeps rolling backups. It has no game logic.
- `app/` sits between them: it calls the engine, renders the results, and persists them through the server API.
- `importers/` run from the command line and write into `data/`. The app never calls them.

**Server API (local only, bound to 127.0.0.1)**

- `GET /api/state/<path>`: read a JSON document under `data/`
- `PUT /api/state/<path>`: schema-validate, back up the previous version to `data/.backups/` (keep last 10 per file), then write atomically
- `GET /logos/<team>/<season>`: resolve the era-correct logo file from the logo manifest

## 4. Data model

All JSON, under `web/data/`.

**`players.json`** is the global registry, keyed by stable `playerId`. It holds identity only: `name` (null for unnamed "X" placeholders) and `birthSeason` (season − age, when age is known). Retirement and HOF fields arrive with sub-projects 3 and 7.
- A player's career timeline (JC → D2 → FBA → World Cup) is **derived** by scanning the season roster files, so the data lives in one place. At import, the same person across leagues is linked by normalized name (accents ignored) when birth seasons agree within ±1 and they're not already on that league-season's roster. Every link and every ambiguity is listed in the import report.

**`leagues/<league>/teams.json`** holds team identity: `teamId`, `name`, `abbr`, conference or league group, city, eras (for renames and relocations, such as Charlotte Knights → Carolina Knights), and badge colors for non-FBA teams.

**`leagues/<league>/S<n>/`** holds one directory per season:
- `rosters.json`: `teamId → [{ playerId, position, rating, age, contractEnd?, contractAmount?, stars?, classYear? }]`
- `schedule.json`: ordered game list `{ gameNo, home, away, phase, day }`
- `results.json`: `{ gameNo, home, away, homePts, awayPts, ot, quarters: [[h,a]...], playerPts: { playerId: pts } }`
- `standings.json`: derived, stored for fast loading, and rebuildable from results
- `brackets.json`: series/matchups with game-by-game results
- `awards.json`: award races snapshot, final awards, All-Stars
- `pauses.json`: status of in-season manual moments (rating adjustments at ¼, ½, and ¾ of the season; trade deadline; All-Star picks)

**`calendar.json`** holds the season step list, taken from the "FBA Calender" sheet tab:
- Order: Adjust Age → Adjust Pro Ratings → FBA Draft → Free Agency → Adjust D2 Ratings → D2 Draft → Create next class → Make Schedules → FBAD2 → FBA → Draft Lottery → World Cup (even seasons only) → Retirement → HOF Induction → Rank class → Adjust College Ratings → FBAJC
- Tracks current step and completed steps.
- The World Cup step appears only in even seasons. The host is stored per World Cup.

**`history/`** holds normalized imported history plus appended finished seasons: `champions`, `awards`, `allFba`, `hallOfFame`, `drafts`, `transactions`, `events`, `jcSchools`, `jcChampionships` (national, NIT, conference RS and tournament, preseason tournaments), `d2Leagues` (promotion and relegation), `worldCups`.

**`logos/manifest.json`** is generated from `FBA Logos/` filenames:
- `"DCB S44-S78.png"` → `{ team: "DCB", from: 44, to: 78 }`; `pres.` means an open-ended range.
- A file with no era (e.g. `Texas Outlaws.png`) applies to all seasons. Name matching is case-insensitive (`Detroit motors`).
- `Concepts/` and `Alternates/` folders are ignored.
- Former franchise names map to their team (e.g. `Cal Tech Knights`, `Charlotte Knights` → CAR).

## 5. Engine port (faithful to Java)

**Game sim** (from `Main.playGamesTest`):
- 120 possessions, alternating. Quarter breaks every 30 possessions.
- Ball-handler weight = rating − 60. The defender is chosen by the `Team.pickDefender` weights.
- Make chance = clamp(35, 65, rating − 0.45 × defenderRating + 10). A roll margin ≥ 30 scores 3, otherwise 2.
- Overtime is 10 possessions per period, added while the score is tied at the end of regulation or an OT.
- Clutch window (possession > 109 and the margin can still be closed) switches the live view to one possession at a time.

**Also ported:**
- Schedule generation (`makeSchedule`)
- Standings sort and head-to-head tiebreakers
- Clinch markers (`*`, `x`, `n`)
- Rankings (`FootballRanker` / `Graph`)
- Playoff series and bracket advancement (`PlayoffSeries`, `whereToNext`)
- Award races and American odds
- JC tournaments (`PreSeasonTourny`, `PostSeasonTourny`, `MarchMadness`, `NIT`)
- D2 league structure
- WC bracket

Each league's constants (games, teams per conference, series lengths) are carried over from its `Main.java`.

**RNG** is injected. Production uses `Math.random`; tests use a seeded generator.

## 6. UI

**Shell**
- Sidebar sections: Leagues (FBA, FBAD2, FBAJC, World Cup), Season (Calendar, Offseason tools), Archive (History).
- The top bar shows a pill with the current season and step (e.g. "S79 · Free Agency"), plus the theme toggle.
- A league that isn't in its calendar window shows as read-only: you can view it but not play it.

**Home**
- An "Up Next" hero with **Continue ▸**, which routes to whatever the current calendar step needs.
- Last champions box and recent transactions box.

**League pages** have tabs: Scores · Standings · Playoffs/Bracket · Teams · Players · Stats & Awards · History.

**Scores**
- A Game Day strip (‹ Day 40 · 41 · **42** · 43 ›). Days are built by packing schedule games in order into days where no team plays twice.
- Game cards show final, live, or upcoming status, records, top scorer, and a Watch/Play or Box score link.
- Controls: Quick-sim game, Sim rest of day, Sim to… (stops at the next pause card or phase end).

**Live game**
- Scorebug at the top.
- Play-by-play feed with Next possession / Auto / Sim to end.
- Line score by quarter, win probability, and live box score (points per player, which is the stat the sim produces).

**Brackets**
- Classic mirrored layout with seeds, logos, and series wins.
- Clicking a series shows its game-by-game results.
- 64-team brackets use region tabs plus a Final Four centerpiece.

**Team page**
- Era-correct logo and header record.
- Roster table: position, name, age, rating, contract end / $, PPG.
- Schedule and results.
- Trophy case from history.

**Player page**
- Bio, rating by season, career timeline across leagues, awards, draft info.

**Pause cards**
- These replace the Java's "type done" prompts (adjust ratings, trade deadline, All-Stars).
- Each one is a card in the scoreboard that opens the roster editor or All-Star picker. Sims stop there until you continue.

## 7. Error handling

- Importers never fail silently. Unmatched names, unparseable cells, and count mismatches go into `web/importers/import-report.md`. The import exits non-zero only on structural failures, such as a missing file or the wrong number of teams.
- The server rejects any PUT that fails schema validation and returns the validation errors, which the UI shows as a toast. Nothing is written.
- Every write is atomic and backed up (last 10 per file in `data/.backups/`).
- Finished seasons are marked `locked: true` and the server refuses writes to them.
- If a sim is interrupted mid-game, the game is simply not recorded. Games are committed whole, as in the Java.

## 8. Testing

- **Engine unit tests** (Vitest, seeded RNG):
  - Feed S78 `FBA/Results.txt` into the standings engine and check that it reproduces `FBA/Standings.txt` exactly, including clinch markers.
  - Build the S78 bracket from those standings and check it matches `FBA/Playoffs.txt` first-round matchups.
  - Statistical check: simulate the full S78 FBA schedule with S78 rosters many times (seeded). Mean points per team, margin distribution, and OT rate must fall within tolerance of the 1,290 real S78 games in `FBA/Results.txt`. This needs no changes to or runs of the Java code.
  - Game Day packing: every game appears exactly once, and no team plays twice in a day.
  - Logo manifest: era parsing, including `pres.`, no-era files, and case differences.
- **Importer tests:** fixture snippets of each sheet tab parse to the expected JSON.
- **Server tests:** schema rejection, atomic write, backup rotation, and locked-season refusal.
- **UI:** a smoke test that the app boots on the imported data, plus manual checks in the browser pane for each sub-project.

## 9. Starting state

- The app opens at **S79 · Free Agency**, where the calendar sheet's `*Here*` marker is.
- FBA rosters come from the Rosters sheet "FBA Rosters" tab (Pre-S79, which already includes S79 draft picks). The contract is stored as end season + amount; the `.txt` contract length converts as end = season + length − 1 (checked against Keano: 1 year → S78, and Holloway: 2 years → S79).
- Roster sources were chosen by inspecting both copies:
  - **FBAD2 S79:** players, ages, and ratings from the sheet's "FBA D2 Rosters" tab (already aged for S79); team abbreviations and league assignments from `FBAD2/FBAD2Rosters`.
  - **FBAJC S78:** `FBAJC/FBAJCRosters`. The sheet tab lists only named players; the file has every player, including unnamed "X" placeholders.
  - **FBAWC S78:** `FBAWC/FBAWCRosters`. It's the same data as the sheet tab, plus abbreviations.
- The S78 `.txt` files (results, standings, playoffs, awards) become the locked S78 season archive for FBA, and likewise for the other leagues' most recent completed season.

## 10. Roadmap (each sub-project gets its own spec → plan → build)

This is the single up-to-date list of parts. Update it whenever a part is split, started or finished.

| Part | What it covers | Status | Spec · Plan |
|---|---|---|---|
| 1 Foundation | Data server, schemas, importers, app shell, calendar, roster editor (§11) | Done | §11 · [plan](../plans/2026-09-25-foundation.md) |
| 2a phase 1 | Roster moves, free agency, trades, draft picks, batch undo | Done | [spec](2026-09-26-roster-moves-free-agency-design.md) · [plan](../plans/2026-09-26-roster-moves-phase1.md) |
| 2a phase 2 | D2 cycle: ratings reset, D2 pool, D2 draft | Done | [spec](2026-09-27-d2-cycle-design.md) · [plan](../plans/2026-09-27-d2-cycle.md) |
| 2b-1 | Regular season for the FBA and D2: schedules, sim, live game, standings, pauses, All-Star weekend, roster locks | Done | [spec](2026-09-27-season-play-regular-season-design.md) · [plan](../plans/2026-09-27-regular-season.md) |
| 2b-2a | Postseason for both leagues: seeding tiebreaks, brackets, live playoff games, D2 promotion and relegation, standings markers | Done | [spec](2026-09-27-postseason-design.md) · [plan](../plans/2026-09-28-postseason.md) |
| 2b-2b | Season awards with live races and odds (FBA and D2 MVPs), defensive stats, power-rankings pages | Done | [spec](2026-09-28-awards-rankings-design.md) · [plan](../plans/2026-09-28-awards-rankings.md) |
| 2b-2c | Season wrap-up: each league's season record into history, lock the season, clear Undo; "Go to next season" applies promotion and relegation, creates the next season's docs and resets the calendar | Done | [spec](2026-09-28-season-wrap-up-design.md) · [plan](../plans/2026-09-28-season-wrap-up.md) |
| 7a Offseason | Shared click-to-rank tool, D2 ratings reset rebuilt on it, one-time S79 college rosters, Create Class, recruiting board (projections, commits, decommits, portal by displacement) | Done 2026-09-29 (branch `offseason`, 738 tests, browser-checked on a scratch copy) | [spec](2026-09-28-offseason-7a-ranking-recruiting-design.md) · [plan](../plans/2026-09-28-offseason-7a.md) |
| 7b Offseason | Season tail: FBA draft lottery (full S80 order + pick resolution), retirement, Hall of Fame import, nominees and induction | Done, merged to main 2026-09-29 (824 tests, browser-checked) | [spec](2026-09-29-offseason-7b-season-tail-design.md), [plan](../plans/2026-09-29-offseason-7b.md) |
| 7c Offseason | Class timeline fix, S79 class import, name check, S79 transfer portal, Rank Class (R + consensus), Adjust College Ratings, walk-ons | Done, merged to main 2026-09-29 (93dbc5b, 993 tests, browser-checked on scratch) | [spec](2026-09-29-offseason-7c-college-tail-design.md), [plan](../plans/2026-09-29-offseason-7c.md) |
| 7d Offseason | Adjust Age (pros and college: leavers, declare, portal), Adjust Pro Ratings with draft prospects, FBA draft; replace the 7a college setup panel's `rosterSeason.fbajc === n − 1` condition, which holds again after the S80 rollover | Done, merged to main 2026-09-29 (e1cdc86, 1132 tests, browser-checked on scratch); draftees without a birth season get one from their class year | [spec](2026-09-29-offseason-7d-pro-tail-design.md), [plan](../plans/2026-09-29-offseason-7d.md) |
| 3a FBA history | Finals MVP (FBA) and Series MVP (D2) picks, automatic YSG MVP; season history: import S1–S78 champions, awards, All-FBA, All-Star, S71–S78 standings and transcribed brackets into summaries; Championships, Awards and Season pages; player directory and player pages; en-dash scores; history endpoint validation | DONE, merged to main 2026-09-30 (146d9db, 1253 tests; final Opus review 0C/1I fixed; browser-checked on scratch) | [spec](2026-09-30-fba-history-3a-design.md) · [plan](../plans/2026-09-30-fba-history-3a.md) |
| 3b FBA history | Careers from Players-tab bios (stints + honours) plus app seasons; award counts by player (bio wins, tab 11 baseline, cross-checks); S78 PPG; duplicate-player merge; career leaders; Hall of Fame in History with structured cards; nominee lines from full careers | Built 2026-09-30 on branch `fba-career` (1417 tests; final Opus review 0C/0I/11M, all fixed); browser-checked on scratch with a scratch `--history` import. Merged to main 2026-09-30 | [spec](2026-09-30-fba-career-3b-design.md) · [plan](../plans/2026-09-30-fba-career-3b.md) |
| Site look | Site-wide sports-site visual overhaul: design tokens and shared components, header with league switcher and results ticker, team colours and logos everywhere, heroes, sticky tabs, stat tables, cards and badges on every page; presentation only | Built 2026-09-30 on branch `site-look`, merged to main 2026-09-30 (1441 tests; final Opus review 0C/4I/14M: all Important and cheap Minors fixed, 2 deferred: team-hero record/seed tiles, logos in the ratings/retirement tables); browser-checked at desktop, 375px and dark on scratch data | [spec](2026-09-30-site-look-design.md) · [plan](../plans/2026-09-30-site-look.md) |
| Franchise history | Past team names and era logos on the history pages (from the team history sheet via `npm run import -- --franchises`), a bracket-style Finals card for S1–S51, and `npm run import -- --logos` to rebuild the logo list after renames | Built 2026-09-30 on branch `import-logos`, merged to main 2026-09-30 (1471 tests; final Opus review 0C/1I/7M, the Important and cheap Minors fixed); browser-checked on scratch data with both imports run against it | [spec](2026-09-30-franchise-history-design.md) · [plan](../plans/2026-09-30-franchise-history.md) |
| 3c FBA history | Team trophy cases with era logos, draft history, transactions, events | Built 2026-09-30 on branch `fba-history-3c` (1539 tests; final Opus review 0C/0I/11M, all fixed); browser-checked on scratch with scratch `--drafts`/`--transactions`/`--events` imports. Merged to main 2026-09-30 (44a2985). The three imports were run on real data and committed in 23bcfcb | [spec](2026-09-30-fba-history-3c-design.md) · [plan](../plans/2026-09-30-fba-history-3c.md) |
| 4 FBAD2 | D2 history: S53–S78 summaries (titles, Series MVPs, regular-season champions, MVPs), team league paths, D2 drafts S68–S78, D2 history pages and player D2 honours; `--d2-leagues` one-time fix of the S79 league layout (D2 World Cups moved to part 5) | Built 2026-09-30 on branch `fbad2-history` (1594 tests; final Opus review 0C/4I/11M, all fixed; re-running `--d2-history` lets the sheet win for S78 and earlier); browser-checked on scratch with scratch `--d2-leagues`/`--d2-history` imports. Also merged the duplicate Nadeem Akers (p00150 into p00040) and added FotMob-style clinch bars with a key to every standings table (replacing the letter markers). Merged to main and pushed 2026-09-30 (88bba6d). The user runs `--d2-leagues` then `--d2-history` on real data | [spec](2026-09-30-fbad2-history-design.md) · [plan](../plans/2026-09-30-fbad2-history.md) |
| 5 FBAWC | Split 5a/5b/5c. New S79 format: odd-season qualifying (top 15 auto, 70 play 6 games, top 49 advance), even-season World Cup (16 groups of 4, then a 32-team bracket), rosters from FBAD2 teams by country. **5a** flags, World Cup history (S56–S78 + hosts to S86), Tournament MVP storage; **5b** city→country table, roster derivation, engine, calendar steps; **5c** play pages + MVP pick UI. Standings use the clinch bars | 5a merged to main 2026-09-30 (b7646fe); the user runs `--wc-history` on real data. 5b built 2026-09-30 on branch `fbawc-engine` (1719 tests; final Opus review 0C/0I/10M, 6 fixed in 33e8964): city→country table, roster derivation, qualifying, groups, knockout, schemas, calendar step; awaiting merge. Before 5c the real S79 `calendar.json` needs `withQualifyingStep` applied once. 5c built 2026-09-30 on branch `fbawc-pages` (1772 tests; final Opus review 0C/2I/11M, I1/I2 and the cheap Minors fixed in bc0c06a): qualifying page, World Cup page (groups, knockout bracket, teams), clinch bars (qualified/advanced/eliminated), play wiring through `commitDocs`, Tournament MVP pick (generated players allowed, stored as `mvpName`) writing `S<even>/summary.json`, `--wc-qualifying-step --data` importer mode, step routing. Browser-checked on scratch (375px/dark not measurable); awaiting merge. Before the first real qualifying the user applies `--wc-qualifying-step` to real data Past brackets (branch `history-brackets`, built 2026-10-01, 1831 tests, Opus review 0C/0I/7M, 4 fixed): 67 D2/World Cup bracket pages transcribed from the bracket PDF (World Cup 12, old D2 Tournament 15 incl. S53/S54 with no scores, D2 league tournaments 40 through S78), `--wc-brackets` / `--d2-brackets` import modes (user runs them on real data), a World Cup season page and a D2 Tournament section; schema gained `PastSeries.score`/`unscored`, 6-round brackets and `SummaryFile.pastBrackets`; awaiting merge. [spec](2026-09-30-past-brackets-design.md) · [plan](../plans/2026-09-30-past-brackets.md) | [spec](2026-09-30-fbawc-design.md) · [spec 5c](2026-09-30-fbawc-5c-design.md) · [plan 5c](../plans/2026-09-30-fbawc-5c.md) · [plan 5a](../plans/2026-09-30-fbawc-5a.md) · [spec 5b](2026-09-30-fbawc-5b-design.md) · [plan 5b](../plans/2026-09-30-fbawc-5b.md) |
| 6 FBAJC | 216 teams / 18 conferences, preseason tournaments, conference challenge, rankings, conference tournaments, March Madness, NIT, recruiting and transfer history, school history pages, C-Ship MVP pick. Standings use the clinch bars | Split 6a/6b/6c (spec 2026-10-01). **6a regular season** built 2026-10-01 on branch `fbajc-season` (1944 tests; final Opus review 1C/3I/11M, C and I fixed in 48519cf): season start, 29-day schedule, preseason tournaments, sim with rating progression, rankings, standings with clinch bars, Scores/Standings/Rankings/Tournaments/Leaders pages; browser-checked on scratch (375px and dark measured); awaiting merge. 6a merged to main. **6b postseason** (conference tournaments, March Madness with the Java field logic, NIT with guaranteed regular-season champions, C-Ship MVP, awards, summary; must reuse `fbajcGateProblem` to finish the fbajc step): spec written 2026-10-01 and its defaults confirmed (NIT before March Madness; awards picked before both; All-American teams after both) ([spec 6b](2026-10-01-fbajc-6b-design.md)), [plan 6b](../plans/2026-10-01-fbajc-6b.md) written (20 tasks). **6b built 2026-10-01** on branch `claude/gifted-fermi-szmcmt` (2083 tests, tsc clean; not browser-checked: no scratch tooling in the cloud checkout): conference tournaments, Java March Madness field and regions, NIT with guaranteed regular-season champions, field review and swaps, awards before the NIT, NIT then March Madness, three All-American teams, two MVPs, summary and finishing the step, Postseason and Awards pages, bid bars in the standings. **6c history built 2026-10-01** on branch `claude/kind-brahmagupta-fnq164` ([spec 6c](2026-10-01-fbajc-history-6c-design.md), [plan 6c](../plans/2026-10-01-fbajc-6c.md)): S1–S78 summaries, school history, 46 college brackets (39 March Madness, 7 NIT), a College chip in the history switcher and the college home, championships, season, awards, schools and school pages. The user runs `npm run import -- --jc-history --data <dir>`, `--jc-schools` and `--jc-brackets` on the real data; not browser-checked (no scratch tooling in the cloud checkout). Deferred: PHI and T32 before the S80 rollover, FBAJC school logos | [spec](2026-10-01-fbajc-design.md) · [plan 6a](../plans/2026-10-01-fbajc-6a.md) |
| FBA expansion | Philly Phantoms (PHI, logo in `FBA Logos/`) and a second team named **Team 32 (T32)** (the Los Angeles Labradors are a work in progress: no logo, placeholder name) join in S80. Must be built before the S80 rollover: add teams, expansion draft, 16-team lottery odds | Not started | — |
| Later | A separate defensive rating for players (the best basis for DPOY; changes the sim, rosters, drafts and rating adjustments) | Idea | — |

Part 2 was originally one sub-project, "FBA league": engine port, scores, live game, standings, playoffs bracket, team, player, and stats/awards pages, pause cards, season completion into history. It was split into the 2a and 2b parts above as it was built.

The original descriptions of the remaining parts:

3. **FBA history:** import and views for champions, awards, All-FBA, HOF, team trophy cases with era logos, draft history, player career timelines, transactions, events.
4. **FBAD2:** 64 teams / 4 leagues, playoffs, promotion and relegation display, D2 history.
5. **FBAWC:** host nation, group/bracket play, flags, World Cup history. Even seasons only.
6. **FBAJC:** 216 teams / 18 conferences, preseason tournaments, conference challenge, rankings, conference tournaments, March Madness, NIT, recruiting and transfer history, school history pages.
7. **Offseason:** calendar step tools. Automated: aging, contract expiry, draft lottery, promotion/relegation, class progression. Guided: rating adjustments, drafts (drag-and-drop board), free agency, trades, retirement, HOF, creating and ranking the recruit class. Rules are gathered from the user at the start of this sub-project.

Part 7 was split into 7a–7d on 2026-09-28 (rules and decisions D1–D21 in `.superpowers/sdd/progress.md`; 7d added E1–E5 in its spec). All four are done as of 2026-09-29, so every offseason calendar step now has its own tool page.

**Carried into part 3 (now in 3a, except the HOF items, which are in 3b):** season summaries store scores with an en dash ("4–1"), but the imported S78 ones use a hyphen, so normalise them. `GET /api/history/<lg>` doesn't validate summaries, and one corrupt file returns a 500 for the whole list. The 7b Hall of Fame page is to be restyled, and nominee career lines regenerated from full history.

## 11. Sub-project 1: Foundation (detailed scope)

**In scope**

1. Tag the current commit `java-v1`. No changes to Java folders.
2. Scaffold `web/` (Vite + React + TS, Vitest, Node server) with `npm run dev` starting both the server and the UI.
3. JSON schemas and TypeScript types for everything in §4.
4. The server: read, validate, atomic write, backups, locked-season refusal, and logo serving via the manifest.
5. Importers:
   - Logo manifest.
   - Team lists for all 4 leagues.
   - Current rosters for all 4 leagues, which creates `players.json` with IDs.
   - Calendar from the sheet.
   - The import report.
6. App shell: sidebar, top bar with the season/step pill, light/dark themes, and routing placeholders for each league page.
7. Home dashboard: Up Next hero with Continue ▸, and last champions (read from the S78 archive files). The recent-transactions box arrives with the transactions import in sub-project 3.
8. Calendar page: step list for S79 with a "Mark done" button to advance.
9. Read-only roster and team pages for all 4 leagues (roster table plus logo or badge), so the imported data is visible immediately. World Cup teams use generated badges until sub-project 5 adds flags.

**Out of scope for Foundation:** playing games, brackets, history import (beyond last champions), and offseason automation.

**Done when:**
- `npm run dev` opens the app at S79 · Free Agency.
- All four leagues' rosters are browsable with the correct logos or badges.
- The import report shows no unresolved errors.
- The server and importer tests pass.
