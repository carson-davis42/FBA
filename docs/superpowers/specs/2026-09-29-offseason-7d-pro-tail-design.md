# Part 7d: Pro Tail (Adjust Age, draft board, Adjust Pro Ratings, FBA draft)

Branch `pro-tail`. It builds on D1–D21 (`.superpowers/sdd/progress.md`) and the 7c timeline (class S{k} plays its Freshman year in FBAJC S{k}; its board is `fbajc/S{k−1}/recruiting.json`).
In this spec, n is the current calendar season. "The S{n} board" means `fbajc/S{n−1}/recruiting.json`.

## 1. Decisions (7d brainstorm, 2026-09-29)

- **E1:** Adjust Age is one automatic click. Nobody is asked Stay, Declare or Portal at Adjust Age; every underclassman stays. This replaces D3's per-player decision at Adjust Age and D19's "declared underclassmen leave at Adjust Age".
- **E2:** Early entry happens on the draft board, from Adjust Age until "Start draft". The commissioner marks who declares.
  - An early entrant can go back to school or enter the portal until the draft starts.
  - Seniors can do neither.
- **E3:** Declaring stays open until the draft starts.
  - Anyone who declares after the pro reset is finished gets their FBA rating typed on the draft board.
  - "Start draft" is refused while any prospect has no FBA rating.
- **E4:** Pro reset suggestions: rank k takes the k-th value of the curve. Ranks past the end of the curve get no suggestion.
- **E5:** A portal player who goes back to his school leaves the portal list. Going back is allowed from Adjust Age until FBAJC is done.

## 2. Adjust Age (`engine/offseason/adjustAge.ts`, page `/offseason/adjust-age`)

It shows a preview and one "Adjust Age" button. The move applies everything in one batch. It is refused unless all of these hold:
- the current calendar step is `adjust-age`;
- `meta.rosterSeason.fbajc === n − 1`;
- `fbajc/S{n−1}/rosters.json` exists;
- `fba/S{n}/draft.json` doesn't exist;
- every S{n} board commit can be placed.

Steps, in order:
1. **Pro ages:** set `age = n − birthSeason` in FBA S{n} rosters and free agents and in D2 S{n} rosters and reserves. Entries with no `birthSeason` keep their age.
2. **College rosters:** build `fbajc/S{n}/rosters.json` from S{n−1}, keeping each team's positions and order.
   - Named Seniors leave, become draft prospects (`senior: true`), and their spot opens (`collegeHole`).
   - X Seniors leave and their spot opens.
   - Fr/So/Jr move up one class year, with `points` set to 0 and their rating and stars unchanged.
3. **Place S{n} board commits:** these are the board recruits and portal players with `committedTo`, in board order, placed through `slotFor` (§6).
   - Into an open spot: the player takes it.
   - Onto a named holder: the holder joins the S{n} board portal with `fromTeam` = that school, his bumped class year, his rating and stars, no projections and not committed.
   - Onto an X holder: the X holder is removed.
4. **Draft doc:** create `fba/S{n}/draft.json` with the Seniors as prospects, `started: false`, `locked: false` and no picks.
5. **Meta and calendar:** set `meta.rosterSeason.fbajc = n` and mark `adjust-age` done.
6. **Logs:**
   - FBAJC tx `adjust-age`: one summary line with counts of Seniors to the draft, X Seniors leaving, commits placed and players displaced.
   - A `portal` line for each displaced player.
   - FBA tx `adjust-age`: "N players age a year".

The preview shows the counts from step 6 and lists who is displaced, before the click.

## 3. Draft board (`engine/offseason/draftBoard.ts`, page `/league/fba/draft`, before Start)

These moves are allowed while `draft.json` exists and `started` is false:

- **Declare:** takes a named So/Jr/Sr on the S{n} college rosters who isn't a committed S{n} board player.
  - His spot opens.
  - He becomes a prospect with `senior: false`, `college`, `classYear`, `collegeRating`, `stars` and `fbaRating: null`.
  - FBAJC tx `declare`.
- **Back to school:** only for early entrants.
  - If his old spot (`college` plus `position`) is open, he takes it again with the same class year, rating and stars.
  - Otherwise he joins the S{n} board portal (D12).
  - He's removed from the prospects and loses his FBA rating.
- **Portal:** only for early entrants. He joins the S{n} board portal (`fromTeam = college`) and is removed from the prospects.
- **Set FBA rating:** allowed only after the pro reset is finished, and only for a prospect who isn't in its rows. The value is a whole number from 1 to 99.
- **List order:** prospects appear in pro-reset rank order when the reset has them, and the rest follow by FBA rating, then college rating.

## 4. Adjust Pro Ratings(reset) (`engine/offseason/proRatings.ts`, page `/league/fba/ratings`)

It uses the click-to-rank tool with `kind: 'fba-reset'` at `leagues/fba/S{n}/ratings.json`. Start is allowed when the current step is `adjust-pro-ratings-reset`.

- **Rows:**
  - Every player on the FBA S{n} rosters, with `team` and `age`, and `stat` set to `S{n−1}: X pts` from the S{n−1} FBA rosters.
  - Every prospect, with `team: null`, `prevRating: null`, `otherRating = collegeRating` and `stat` like `Jr · <school abbr>`.
- **`prevRating` for FBA players** is the first of these that exists:
  1. their rating in S{n−1}'s locked `fba-reset`;
  2. `oldRating` in the S{n−1} first `ratings` pause file;
  3. their current rating.
- **Curve:**
  1. S{n−1}'s locked `fba-reset` ratings, sorted high to low;
  2. otherwise the `oldRating` values in the S{n−1} first `ratings` pause file;
  3. otherwise the current FBA ratings.
  - Ranks past the end of the curve have no suggestion, which is `suggestion` returning null.
- **Membership:** a declare, back-to-school, portal move or roster change can change who should be listed.
  - `fbaMembershipBlockers` lists the differences.
  - A new shared `syncRows(doc, rows)` in `engine/rank/ranking.ts` fixes them from a "Sync list" button: missing players are added unranked, and players who are gone are removed from `rows`, `order` and `ratings`. It is refused on a locked doc.
- **Finish** is blocked by `rankingBlockers` and the membership blockers. When it runs:
  - the FBA roster ratings and each prospect's `fbaRating` are set;
  - the doc locks;
  - the step is marked done;
  - FBA tx `fba-ratings` gets one line.

## 5. FBA draft (`engine/offseason/fbaDraft.ts`, same page after Start)

- **Start draft** is allowed when:
  - the step is `s{n}-fba-draft`;
  - the pro reset is locked;
  - every prospect has an `fbaRating`;
  - `fba/S{n−1}/lottery.json` exists and is locked.

  It copies `lottery.picks` sorted by slot into `picks: {slot, owner, originalTeam, playerId: null}` and sets `started: true`. Declare, back to school, portal and set rating close from then on.
- **Pick:** the next pick is the first with `playerId: null`, and the prospect must not already be drafted.
  - The owner's FBA roster gets `{playerId, position, rating: fbaRating, age: n − birthSeason, points: 0, contractEnd: n + 1, contractAmount: 2, restricted: true}`, even if that team already has 5 or more players.
  - FBA tx `drafted`: "S{n} Draft #slot: <team> selects <name> (<pos>, <college>)".
  - Undo uses the journal.
- **Finish draft** is allowed when every pick is made or no undrafted prospect is left. Any picks still empty are recorded as no selection.
  - Undrafted prospects join the FBA S{n} free agents as `{rookie: true, rating: fbaRating, age, note: 'Undrafted'}`.
  - The draft doc locks and the step is marked done.

## 6. College handoffs

- **`slotFor`** is exported from `recruiting.ts` and reused as is. It works on the rosters being built, whose players, board and season are passed in through the `RecruitingState` shape.
- **`unplacedCommits(board, rosters)`** lists the ids of committed board players who aren't on `rosters.teams[committedTo]`.
  - `fbajcGateProblem` adds "N committed players aren't on the rosters yet".
  - `walkOnProblem` refuses on the same condition.
- **`takeOutOfPortal`** no longer uses `portalProblem`. It is refused only after FBAJC is done or when the board isn't the S{n} board (E5). Entering the portal from the Portal page keeps its window.
- **`SetupPanel`** shows only when `rosterSeason.fbajc === n − 1` and `adjust-age` is done (the S79 legacy case). Otherwise it shows nothing.

## 7. Data shapes (`engine/shared/types.ts`, `schemaRegistry.ts`)

```ts
DraftProspect = { playerId, position, college: string, classYear: ClassYear, senior: boolean,
                  collegeRating: int|null, stars: int|null, fbaRating: 1..99|null }
DraftPick     = { slot: int+, owner: string, originalTeam: string, playerId: playerId|null }
DraftFile     = { league: 'fba', season, locked, started, prospects: DraftProspect[], picks: DraftPick[] }
// refine: unique prospect ids; every pick playerId is a prospect and appears at most once; picks empty unless started;
//         locked ⇒ started
```

- **Paths:** `^leagues/fba/S\d+/draft\.json$` → DraftFile, and `^leagues/fba/S\d+/ratings\.json$` → RankingFile.
- **Enums:** `RankingKind` gains `'fba-reset'`, and `TransactionType` gains `'adjust-age'`, `'declare'` and `'fba-ratings'`.
- **Compatibility:** the committed `web/data` has neither file, so `data.test.ts` still passes.

## 8. Calendar and pages

- Each step links to its page: `adjust-age` → `/offseason/adjust-age`, `adjust-pro-ratings-reset` → `/league/fba/ratings`, and `s{n}-fba-draft` → `/league/fba/draft`. The Mark done fallback is removed for these three.
- Every write goes through `commitDocs` with the loaded versions, and a chained save uses the returned versions.

## 9. Edge cases

- **An S{n} board commit that can't be placed** (no roster, or no spot at that position): Adjust Age is refused and lists the problems.
- **Two S{n} commits on one slot** can't happen (the board rule from 7c). The check stays anyway: a slot already taken this Adjust Age by a commit counts as `committedThisCycle`, so `slotFor` refuses it.
- **A displaced player whose class year was Sr before the bump** can't happen, because Seniors leave in step 2 before any placing.
- **Fewer prospects than picks:** Finish is allowed once the prospects run out.
- **A prospect goes back to school or to the portal while the pro reset is unlocked:** the membership blocker shows until "Sync list".
- **After the reset is locked**, back to school or portal simply removes the prospect.
- **A declare after the reset is locked:** the rating is typed on the board (E3).
- **An X player displaced at Adjust Age** keeps his record in `players.json` but has no roster spot, like 7c's commit rule.

## 10. Tests

- **Engine:**
  - Adjust Age: ages, class bump, Seniors named and X, placement into an open spot, onto a named holder (portal) and onto an X holder, refusals, meta and calendar.
  - Draft board: each move and its window.
  - `syncRows`.
  - Pro-reset rows, `prevRating`, curve sources and blockers, and Finish.
  - Draft: Start refusals, pick contract, Finish into free agency, no selection.
  - `unplacedCommits` in the gate and walk-ons.
  - `takeOutOfPortal` before Make Schedules.
- **Schemas:** DraftFile refinements and the new path rules.
- **Pages (jsdom):** Adjust Age preview plus click, draft board moves, reset Sync list, draft start/pick/finish, and SetupPanel visibility.
- **Browser check** (text only, scratch data): calendar S80 from Adjust Age through the FBA draft.
