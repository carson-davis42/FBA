# FBAJC postseason (roadmap part 6b): design

Status: rules agreed with the user 2026-10-01 (three changes from the part-6 spec, marked **Changed**). The Java reference is `FBAJC/src/fbajc/` (`PostSeasonTourny.java`, `MarchMadness.java`, `NIT.java`, tag `java-v1`, read-only). Part 6a (regular season) is merged. This spec covers 6b only; 6c is history.

## 1. Scope

From the end of day 29 to the finished `fbajc` calendar step:

1. Conference tournaments (18 conferences, 11 games each).
2. The March Madness and NIT fields, with a commissioner review before play.
3. **Awards**: live races and picks, made after the fields are set and before any NIT or March Madness game.
4. The **NIT** (31 games), then **March Madness** (63 games).
5. **All-American teams**, picked after both tournaments.
6. C-Ship MVP pick.
7. The season summary, which finishes the `fbajc` step.

**Changed:** the Java plays March Madness before the NIT. The web app plays the NIT first, then March Madness.

## 2. Rules

### 2.1 Conference tournaments
Taken from the part-6 spec and the Java (`PostSeasonTourny`): 12 teams seeded by the final conference standings (the 6a tiebreaks). Round 1: 8v9, 5v12, 6v11, 7v10. Seeds 1–4 have byes. Quarters: 1 v (8/9), 4 v (5/12), 3 v (6/11), 2 v (7/10). Then semis and the final: 11 games. The winner is the conference tournament champion. Home has no advantage.

Starting the tournaments requires all 3132 regular-season games to be played. Rounds are played in order across all 18 conferences (4 rounds), like the regular-season days; "Play round" and "Play all conference tournaments" each save once.

- Ratings progress in these games (`progressRatings`), as in the Java.
- These games **do not** count toward conference standings or the regular-season record.
- Player points are recorded in every postseason game.

### 2.2 Regular-season champions
**Changed (new):** each conference's regular-season champion is the team (or teams, if tied) with the best conference record after the 22 games. A tie for first is a shared title: every tied team counts. The 6a standings tiebreaks still order the table, but they do not remove a share of the title.

### 2.3 March Madness field
**Changed (the clean 46-at-large rule in the part-6 spec is dropped):** the Java selection is ported as it is.

- The 18 conference **tournament** champions are guaranteed a bid, sorted by ranking.
- The loop over the 64 slots follows `MarchMadness.java` lines 50–125: it adds the best remaining champion once as many champions remain as open slots; it guarantees the champions of the nine major conferences (`B12 ACC BE SEC B10 AAC P12 A10 MWC`) a place from slot 52 backwards (`major_conf_champs >= 52 - a`); from slot 51 on, at-large picks skip major-conference teams; otherwise it takes the best team by ranking.
- The ranking is the last blended ranking, taken after the conference tournaments.
- Seeding, regions and the same-conference separation (`addToRegions`) are ported verbatim: seed lines 1–2 by the snake, seeds 3–16 with the Java's conflict rounds; region slot order from `bracket1..4`. The engine tests pin the S78-style outputs by a seeded run against hand-checked regions.
- The commissioner can swap a field team for another team and re-run the placement before the first game. Swaps keep the field legal (64 distinct teams, every conference tournament champion still in).

The 64-team field is stored in field order with seeds, so the bracket can be rebuilt.

### 2.4 NIT field
**Changed:** the NIT field is 32 teams.

1. Every **regular-season champion** (or co-champion, 2.2) that did not make March Madness is guaranteed a place, in ranking order.
2. The rest of the 32 are the best remaining teams by ranking (the Java's `NIT_field`: next 32 after the 64).
3. If more than 32 regular-season champions miss March Madness (a long chain of ties), the best 32 by ranking get in and the commissioner sees a warning.

A regular-season champion that is already in March Madness is in March Madness (the guarantee is "NIT at least"). Teams are seeded by ranking, split into two regions of 16 by the Java's alternating rule (indexes 0,2,4… and 1,3,5…), and start at the round of 32: 31 games. Seed order inside a region is `0,15,8,7,4,11,12,3,1,14,9,6,5,10,13,2`.

### 2.5 Playing the tournaments
- March Madness: 6 rounds (R64, R32, Sweet 16, Elite 8, Final Four, Championship), 63 games, no byes. NIT: 5 rounds, 31 games.
- **Ratings do not change** in March Madness or NIT games (part-6 spec). Player points are recorded.
- Single game live (the 6a live page pattern), "Play round", and "Play all of March Madness / NIT" (in-memory, one save).
- **Order (changed from the Java):** the NIT is played first, then March Madness. March Madness cannot start until the NIT has a champion, and the NIT cannot start until the awards are picked (2.7). The step finishes when both have a champion, the All-American teams are picked and the summary is saved.

### 2.6 C-Ship MVP
After the title game the commissioner picks the C-Ship MVP from the **champion's roster**, listed by March Madness points per game; X (unnamed) players are allowed, so the pick may be stored as a name (`mvpName`, like the World Cup Tournament MVP).

### 2.7 Awards
Same pattern as the FBA awards page. Live races with the Java's score (0.40 × scaled PPG + 0.35 × scaled rating + 0.25 × team success; softmax temperature 8 over the top 8; American odds): Trae York POY, Angelo Farrell Freshman, Rhett Blackwell Guard, Jacob Peters Forward, Dustin Holloway Center and one POY per conference (18).

- **When:** picked after the conference tournaments and the field review, **before the NIT and March Madness**. The races count the regular season and the conference tournaments only; no NIT or March Madness games exist yet.
- The commissioner picks each winner (races and odds are shown); X players may win. Winners are stored in the summary.
- The NIT cannot start until every award has a winner.

### 2.8 All-American teams
**Changed (new):** picked after the NIT and March Madness. Format G/F/C/ANY/ANY (rule change S71): each team has one guard, one forward, one center and two players of any position. Candidates are listed by season points per game, rating and position, with March Madness or NIT points shown. X players may be picked.

The number of teams (first team only, or first, second and third) is not in the Java or the rule history: see §6.

## 3. Data

New and changed documents under `leagues/fbajc/S<n>/` (strict zod in `engine/shared/types.ts`, path rules in `schemaRegistry.ts`):

| Document | Contents |
|---|---|
| `postseason.json` | `confTournaments` (18: seeds, games, champion), `field` (March Madness 64 in field order with seeds and regions; NIT 32 with regions), `mm` and `nit` brackets with games, `outcome` (champion, runner-up, C-Ship MVP) |
| `summary.json` | the existing `SummaryFile`, extended with the FBAJC fields: conference champions (tournament and regular season, 18 each, co-champions allowed), national awards, conference POYs, All-American teams, `pastBracket` |

- Postseason game box scores live in `postseason.json` so that standings and the regular-season record stay untouched; per-player postseason points are summed from there.
- `SummaryFile.confChampions` is E/W only; the FBAJC fields get their own optional keys (`jc`). `web/data.test.ts` must keep passing.
- Every save uses `commitDocs` with the loaded versions; chained saves use the versions returned by the last save.

## 4. Pages and wiring

- FBAJC Scores page gains the postseason after day 29: a "Conference tournaments" stage with a Play round / Play all button.
- New **Postseason** section: Conference Tournaments (18 brackets, tabs by conference), March Madness (region tabs + Final Four, reusing the bracket styles), NIT, and a **Field** panel (review and swap before the first game).
- New **Awards** page for the league: races and picks before the NIT; the All-American picker after March Madness.
- Standings tables gain the `champion` clinch kind for the regular-season title (6a) and a **bid** kind: MM bid, NIT bid (the tournaments' own bars).
- NIT and March Madness pages, in play order. C-Ship MVP card on the March Madness page after the title game; a Finish season card finishes the `fbajc` step through `fbajcGateProblem`/the calendar's `markStepDone`, as the FBA/D2 wrap-up does (`engine/season/wrapUp.ts`).
- Calendar wiring: the step stays open until the summary exists; `stepRoutes.ts` still opens Scores.
- Roster locks are already decided by `engine/season/locks.ts`; the college rosters don't change in the postseason.

## 5. Out of scope
History importers and brackets (6c), the S80 college rollover (the existing wrap-up covers the pro leagues; college rollover is part of the S80 Create Class work).

## 6. Decisions and open items

Confirmed by the user on 2026-10-01:
1. Conference tournament games don't count toward the standings record, but they feed the rankings used to seed March Madness.
2. A regular-season co-champion means every team tied at the top conference record.
3. The NIT is played before March Madness.
4. Awards are picked right before the NIT and March Madness; All-American teams are picked after both.

Open:
- How many All-American teams (first team only, or first, second and third)? Default: three teams of five, G/F/C/ANY/ANY.
- Does the S78 summary hold All-American history to match? The 6c importer will fill past seasons; 6b stores only from S79 on.
