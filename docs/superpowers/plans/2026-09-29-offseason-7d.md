# Part 7d Pro Tail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a new season from the app: Adjust Age (pros age; college rosters built, Seniors to the draft, S{n} commits placed), the draft board (early entry, back to school, portal), Adjust Pro Ratings(reset) with the prospects, and the FBA draft.

**Architecture:**
- **Engine:** pure moves in `web/engine/offseason/` (`adjustAge.ts`, `draftBoard.ts`, `proRatings.ts`, `fbaDraft.ts`). Each returns `WritesResult` (`engine/season/moves.ts`).
- **Reuse:** the college helpers from `engine/college/` (`setupCollegeRosters`, `slotFor`, `collegeHole`, `boardPath`) and the ranking tool (`engine/rank/ranking.ts`, `app/rank/RankingTable.tsx`).
- **Pages:** they load docs with `useDoc` and save with `commitDocs(label, writes, versions)`.

**Tech Stack:** TypeScript 5, React 18, React Router 6, zod 3, Vitest 2 (jsdom).

Spec: `docs/superpowers/specs/2026-09-29-offseason-7d-pro-tail-design.md`, cited as §N below.

## Global Constraints

**Commands and data:**
- Run everything from `web/`. `npx tsc --noEmit` must print nothing.
- Filter test output: `npx vitest run <paths> 2>&1 | grep -E "Test Files|Tests|FAIL"`. Before this part the suite is 993 tests.
- Never touch `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`. Don't start or stop servers on 5173/5174.

**Code rules:**
- Vitest globals are off: import `describe/it/expect/vi/afterEach` explicitly. Each jsdom test file calls `cleanup()` in `afterEach`.
- Page tests follow `app/pages/D2RatingsPage.test.tsx`: a stubbed `fetch` serves docs with ETags and records the PUT/batch bodies.
- `useSaving()` forces an extra render when a save starts, so guard every save handler with a `useRef` (see `app/college/SetupPanel.tsx`).
- Every write passes the loaded versions to `commitDocs`. A doc that doesn't exist yet is written without a version, as `SetupPanel` does.

**Seasons and names:**
- n is the calendar season. The **S{n} board** is `boardPath(n − 1)` = `leagues/fbajc/S{n−1}/recruiting.json`, with `classOf` n.
- The draft doc is `leagues/fba/S{n}/draft.json`, and the pro reset is `leagues/fba/S{n}/ratings.json`.
- The college tx is `leagues/fbajc/S{n}/transactions.json`, which may not exist yet; use `{ league: 'fbajc', season: n, entries: [] }` in its place.
- Names: `collegeName(players, id)` (X for unnamed); school names come from the fbajc `TeamsFile`, and `abbr` for short labels.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Responsibility |
|---|---|
| `engine/shared/types.ts`, `engine/shared/schemaRegistry.ts` (modify) | `DraftFile`, `'fba-reset'`, new tx types, two paths |
| `engine/college/recruiting.ts`, `engine/college/walkOns.ts`, `engine/college/portal.ts` (modify) | Export `slotFor`; `unplacedCommits` in the gate and walk-ons; portal return window |
| `app/college/SetupPanel.tsx` (modify) | Show only in the S79 legacy case |
| `engine/rank/ranking.ts` (modify) | `syncRows` |
| `engine/offseason/adjustAge.ts` (+test), `app/offseason/AdjustAgePage.tsx` (+test) | Adjust Age |
| `engine/offseason/draftBoard.ts` (+test) | Declare, back to school, portal, typed rating |
| `engine/offseason/proRatings.ts` (+test), `app/offseason/ProRatingsPage.tsx` (+test) | Adjust Pro Ratings(reset) |
| `engine/offseason/fbaDraft.ts` (+test), `app/offseason/FbaDraftPage.tsx` (+test) | Draft board page and the draft |
| `engine/offseason/testFixtures.ts` (modify) | Shared 7d fixtures |
| `app/stepRoutes.ts` (+test), `app/shell/Layout.tsx` (modify) | Routes and tool links |

---

### Task 1: Schemas

**Files:** modify `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`, `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`.

**Produces:** `DraftProspect`, `DraftPick` and `DraftFile` (zod + types); `RankingKind` gains `'fba-reset'`; `TransactionType` gains `'adjust-age' | 'declare' | 'fba-ratings'`; registry rules for `leagues/fba/S{n}/draft.json` (`DraftFile`) and `leagues/fba/S{n}/ratings.json` (`RankingFile`).

- [ ] **Step 1: Write the failing tests** (`types.test.ts`):
  - A valid unstarted draft (2 prospects, `picks: []`) parses.
  - A started draft with picks `[{slot:1, owner:'t1', originalTeam:'t1', playerId:'p00001'}, {slot:2, ..., playerId:null}]` parses.
  - Each of these fails with its message:
    - a duplicate prospect id: `A prospect is listed twice`;
    - a pick whose `playerId` isn't a prospect: `p00009 is picked but isn't a prospect`;
    - one player picked twice: `p00001 is picked twice`;
    - picks on an unstarted draft: `An unstarted draft has no picks`;
    - `locked: true, started: false`: `A finished draft must have started`;
    - `fbaRating: 0`.
  - An `fba-reset` `RankingFile` parses.

  `schemaRegistry.test.ts`: `schemaForPath('leagues/fba/S80/draft.json')` is `DraftFile`, and `('leagues/fba/S80/ratings.json')` is `RankingFile`.
- [ ] **Step 2: Run to verify failure:** `npx vitest run engine/shared 2>&1 | grep -E "Test Files|Tests|FAIL"`.
- [ ] **Step 3: Implement** in `types.ts`, after `LotteryFile`:

```ts
export const DraftProspect = z.object({
  playerId,
  position: Position,
  /** The college (fbajc team id) he left. */
  college: z.string().min(1),
  classYear: ClassYear,
  /** Seniors enter at Adjust Age and can't go back to school or to the portal. */
  senior: z.boolean(),
  collegeRating: int.nullable(),
  stars: int.nullable(),
  /** Set by the pro reset, or typed on the board for a late entrant. */
  fbaRating: int.min(1).max(99).nullable(),
}).strict();
export type DraftProspect = z.infer<typeof DraftProspect>;

export const DraftPick = z.object({ slot: int.positive(), owner: z.string().min(1), originalTeam: z.string().min(1), playerId: playerId.nullable() }).strict();
export type DraftPick = z.infer<typeof DraftPick>;

/** leagues/fba/S{n}/draft.json: the S{n} draft board (prospects) and, once started, its picks. */
export const DraftFile = z.object({
  league: z.literal('fba'),
  season: int,
  locked: z.boolean(),
  started: z.boolean(),
  prospects: z.array(DraftProspect),
  picks: z.array(DraftPick),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = new Set(doc.prospects.map(p => p.playerId));
  if (ids.size !== doc.prospects.length) issue('A prospect is listed twice');
  const picked = new Set<string>();
  for (const p of doc.picks) {
    if (p.playerId === null) continue;
    if (!ids.has(p.playerId)) issue(`${p.playerId} is picked but isn't a prospect`);
    if (picked.has(p.playerId)) issue(`${p.playerId} is picked twice`);
    picked.add(p.playerId);
  }
  if (!doc.started && doc.picks.length) issue('An unstarted draft has no picks');
  if (doc.locked && !doc.started) issue('A finished draft must have started');
});
export type DraftFile = z.infer<typeof DraftFile>;
```

  Also add `'fba-reset'` to `RankingKind` and `'adjust-age', 'declare', 'fba-ratings'` to the end of `TransactionType`. In `schemaRegistry.ts`, next to the lottery rule, add:

```ts
  [new RegExp(`^leagues/fba/${S}/draft\\.json$`), DraftFile],
  [new RegExp(`^leagues/fba/${S}/ratings\\.json$`), RankingFile],
```

- [ ] **Step 4: Run the tests, tsc, the full suite (993 + new, 0 failures) and `data.test.ts`.**
- [ ] **Step 5: Commit** `feat: 7d schemas (draft doc, fba-reset, tx types)`.

---

### Task 2: College handoffs (§6)

**Files:** modify `web/engine/college/recruiting.ts`, `web/engine/college/walkOns.ts`, `web/engine/college/portal.ts`, `web/app/college/SetupPanel.tsx` and their tests (`recruiting.test.ts` or `board.test.ts`, `walkOns.test.ts`, `portal.test.ts`, and the `SetupPanel` test inside `app/college/RecruitingPage.test.tsx` or wherever it is tested now; grep for `SetupPanel`).

**Produces:**

```ts
export type Slot = { ok: true; index: number; displaced: RosterEntry | null; unnamed?: true } | { ok: false; problem: string };
export function slotFor(state: RecruitingState, p: Prospect, teamId: string, school: string): Slot; // now exported, body unchanged
/** Ids of committed board players who aren't on rosters.teams[committedTo]. */
export function unplacedCommits(board: RecruitingFile, rosters: RostersFile): string[];
```

- [ ] **Step 1: Write the failing tests.**
  - **`unplacedCommits`:**
    - a committed recruit on its school's roster gives `[]`;
    - a committed recruit not on it gives `[id]`;
    - uncommitted players are ignored.
  - **`fbajcGateProblem(board, rosters)`** with one unplaced commit and no holes: `1 committed player isn't on the rosters yet`. With two it reads `2 committed players aren't on the rosters yet`. The part joins the existing ones with `; `, in this order: uncommitted, unplaced, open spots.
  - **`walkOnProblem`:** on the `fbajc` step, with no uncommitted players but one unplaced commit, it returns the same unplaced text.
  - **`takeOutOfPortal`:**
    - it succeeds while `make-s{n}-schedules` isn't done, which is new;
    - it still fails with `The S{n} transfer portal is closed` once `fbajc` is done;
    - the returned player is gone from `recruiting.portal`.
  - **`SetupPanel`:**
    - with `rosterSeason.fbajc === n − 1` and `adjust-age` not done, it shows `Run Adjust Age to build the S{n} college rosters.` with a link to `/offseason/adjust-age`, and no setup button;
    - with `adjust-age` done, the setup card shows as before.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
  - `fbajcGateProblem`: when both `board` and `rosters` are given, push the unplaced part between the two existing parts.
  - `walkOnProblem`: after the gate check, `const unplaced = unplacedCommits(state.recruiting, state.rosters).length;` and return the same text when it's non-zero.
  - `takeOutOfPortal`: replace `portalProblem(state.calendar)` with `state.calendar.steps.find(s => s.id === 'fbajc')?.done ? 'The S${n} transfer portal is closed' : null`.
  - `SetupPanel` needs the calendar. Add `calendar: CalendarFile` to `CollegeSetupInput` in `app/college/useRecruitingState.ts`; it already loads the calendar, so check.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: FBAJC gate and walk-ons refuse unplaced commits; portal return from Adjust Age`.

---

### Task 3: `syncRows` for the ranking tool

**Files:** modify `web/engine/rank/ranking.ts`, `web/engine/rank/ranking.test.ts`.

**Produces:**

```ts
/** Brings the rows in line with who should be listed: new players are added (unranked), missing ones are removed from rows, order and ratings. A locked doc is returned unchanged. */
export function syncRows(doc: RankingFile, rows: RankingRow[]): RankingFile;
```

- [ ] **Step 1: Write the failing tests.** Start from a doc with rows A, B, C, `order: [A, B]` and `ratings: {A: 80, B: 70, C: 60}`. `syncRows` with rows A, C, D gives:
  - rows A, C, D, with A and C keeping their **old** row objects and D taking the new one;
  - `order: [A]`;
  - `ratings: {A: 80, C: 60}`.

  A locked doc comes back as the same object. With the same membership, the result is `toEqual` the input.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and tsc.**
- [ ] **Step 5: Commit** `feat: syncRows keeps a ranking's list in step with its members`.

---

### Task 4: Adjust Age engine (§2)

**Files:** create `web/engine/offseason/adjustAge.ts`, `web/engine/offseason/adjustAge.test.ts`; modify `web/engine/offseason/testFixtures.ts`.

**Interfaces:**

```ts
export const ADJUST_AGE_STEP = 'adjust-age';
export const draftPath = (season: number) => `leagues/fba/S${season}/draft.json`;
export interface AdjustAgeState {
  season: number; calendar: CalendarFile; meta: MetaFile; players: PlayersFile;
  fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null;
  prevCollege: RostersFile | null;         // fbajc S{n−1}
  board: RecruitingFile | null;            // the S{n} board, boardPath(n − 1)
  collegeTeams: TeamsFile; fbaTx: TransactionsFile; collegeTx: TransactionsFile;
  draftExists: boolean;
}
export interface AdjustAgePreview {
  aged: number; seniors: number; xSeniors: number; placed: number;
  displaced: { playerId: string; teamId: string; classYear: ClassYear; position: Position; rating: number | null }[];
}
export function adjustAgePreview(state: AdjustAgeState): { ok: true; preview: AdjustAgePreview } | { ok: false; problems: string[] };
export function adjustAge(state: AdjustAgeState, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests** on a fixture with n = 80: 2 FBAJC teams (`t1` in B12, `t2` elsewhere), 5 slots each.
  - **The college side of the fixture:**
    - `t1` has a named Sr G, an X Sr F, and a named So C.
    - The board has a recruit R1 (C) committed to `t1` and a recruit R2 (G) committed to `t2`, where `t2`'s G slot holds an X Fr. It also has an uncommitted recruit R3.
  - **The pro side of the fixture:** 2 FBA players, 1 D2 player and 1 reserve, all with `birthSeason` 58 and `age` 21, plus one FBA player with `birthSeason: null` and `age: 30`.
  - **Expectations:**
    - Every pro entry with a birth season gets `age: 22`; the null one stays 30. `aged` is 4.
    - The S80 college rosters:
      - `t1` G and F are holes (`collegeHole`), the named So is now Jr (`points: 0`), and R1 took the C slot.
      - That So-now-Jr C was displaced into the board portal: `{fromTeam: 't1', classYear: 'Jr', projections: {}, committedTo: null}`, with rating and stars kept.
      - R2 replaced the X Fr at `t2` G, and no portal entry was made for him.
      - R3 is untouched.
    - `draft.json`:
      - one prospect `{college: 't1', classYear: 'Sr', senior: true, collegeRating: <his rating>, fbaRating: null}`;
      - `started: false`, `locked: false`, `picks: []`.
    - `meta.rosterSeason.fbajc` is 80, and `adjust-age` is done.
    - Tx:
      - the college tx gets `adjust-age`: `Class years move up: 1 Senior enters the S80 draft, 1 unnamed Senior leaves, 2 commitments join their schools`, plus a `portal` line `<Name> (Jr C, 74) enters the transfer portal from <School>`;
      - the FBA tx gets `adjust-age`: `4 players age a year`.
    - Writes: FBA rosters, free agents (when not null), D2 rosters, reserves (when not null), fbajc S80 rosters, the board (only when a placement happened), `draft.json`, meta, calendar and both tx docs. The label is `Adjust Age (S80)`.
    - **Refusals**, each returned as `{ok: false}` with the listed problem:
      - off the step, the `calendarProblem(calendar, 'adjust-age', 'Ages are adjusted')` text;
      - `rosterSeason.fbajc === 80`: `The S80 college rosters already exist`;
      - `prevCollege` null: `The S79 college rosters are missing`;
      - `draftExists`: `The S80 draft board already exists`;
      - two commits into one slot: `slotFor`'s `already has … committed` problem;
      - a commit to a school with no roster: `slotFor`'s `<school> has no roster`.
    - A null board: no placements, and nothing is written to a board.
    - The preview matches the counts and lists the displaced Jr.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
  - **College rosters:** `setupCollegeRosters({ season: n, prev: prevCollege, proIds: new Set() })`. Count named against X Seniors from `prevCollege` using `players.players[id]?.name`.
  - **Placement:** go through `[...board.recruits, ...board.portal].filter(p => p.committedTo)` in that order.
    - Use a working `RecruitingState` `{ season: n, recruiting: board, rosters, teams: collegeTeams, players, tx: collegeTx, calendar }`, updated after each placement.
    - Call `slotFor(state, p, p.committedTo, school)`, and place the player with the same entry shape `commit` uses.
    - `slotFor`'s "already has … committed" check guards a double placement, since the first placed player counts as committed.
  - **Aging:** a pure `ageEntry(e, n, players)` that returns `e` unchanged when there's no id or no birth season. It's used for every roster entry, free agent and reserve.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Adjust Age engine (pro ages, college rosters, Seniors to the draft, S{n} commits placed)`.

---

### Task 5: Adjust Age page

**Files:** create `web/app/offseason/AdjustAgePage.tsx`, `web/app/offseason/AdjustAgePage.test.tsx`; modify `web/app/shell/Layout.tsx` (`<Route path="/offseason/adjust-age" …>`) and `web/app/stepRoutes.ts` (`TOOL_STEPS['adjust-age'] = '/offseason/adjust-age'`, +test).

- [ ] **Step 1: Write the failing tests.**
  - **Loads:**
    - `calendar.json`, `meta.json` and `players.json`;
    - FBA S{n} `rosters`, `freeAgents` and `transactions`;
    - D2 S{n} `rosters` and `reserves`;
    - FBAJC S{n−1} `rosters` and `teams.json`, plus `boardPath(n−1)`;
    - FBAJC S{n} `transactions` (a 404 becomes the empty tx) and `draft.json` (its 404 means `draftExists: false`).
  - **Shows** `<h1>Adjust Age</h1>` and the preview: `4 players age a year`, `1 Senior enters the S80 draft`, `1 unnamed Senior leaves`, `2 commitments join their schools`, and a "Displaced to the portal" list with name, school and class year.
  - **The button** "Adjust Age" posts one batch with the writes from `adjustAge`. A second click during the save doesn't post twice (a `useRef` guard).
  - **After it's done** (`adjust-age` done), the page shows `Ages are adjusted.` with links "Draft board ▸" (`/league/fba/draft`) and "Pro ratings ▸" (`/league/fba/ratings`).
  - **A refusal** shows the problems and no button.
  - **`stepRoutes.test.ts`:** `toolTarget` of `adjust-age` is `/offseason/adjust-age`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement,** modelled on `app/offseason/RetirementPage.tsx`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Adjust Age page`.

---

### Task 6: Draft board engine (§3)

**Files:** create `web/engine/offseason/draftBoard.ts`, `web/engine/offseason/draftBoard.test.ts`.

**Interfaces:**

```ts
export interface DraftBoardState {
  season: number; draft: DraftFile; rosters: RostersFile /* fbajc S{n} */; board: RecruitingFile /* S{n} board */;
  collegeTeams: TeamsFile; players: PlayersFile; collegeTx: TransactionsFile; ratings: RankingFile | null /* fba-reset S{n} */;
}
export function draftBoardProblem(draft: DraftFile): string | null;          // 'The S{n} draft has started' once started
export function declareCandidates(state: DraftBoardState): { playerId: string; teamId: string; position: Position; classYear: ClassYear; rating: number | null }[];
export function declare(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult;
export function backToSchool(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult;
export function draftToPortal(state: DraftBoardState, playerId: string, ctx: MoveContext): WritesResult;
export function setProspectRating(state: DraftBoardState, playerId: string, value: number): WritesResult;
/** Prospects in pro-reset rank order when ranked, then the rest by FBA rating, then college rating (nulls last), then name. */
export function boardOrder(state: DraftBoardState): DraftProspect[];
```

- [ ] **Step 1: Write the failing tests.**
  - **`declareCandidates`:** named So/Jr/Sr on the S{n} rosters, sorted by school name, then position. It excludes X players, Fr, and any player who is a committed recruit or portal player on the board.
  - **`declare`:**
    - The player's slot becomes `collegeHole`.
    - The prospect gets `{senior: false, college, classYear, collegeRating, stars, fbaRating: null}`.
    - Tx `declare`: `<Name> (Jr C, <School>) declares for the S80 draft`.
    - Writes: draft, rosters and college tx. Label `<Name> declares for the draft`.
    - Refusals:
      - a non-candidate: `<Name> can't declare`;
      - a started draft: the `draftBoardProblem` text.
  - **`backToSchool`:**
    - If his slot is open, he's restored with the same class year, rating and stars. Tx `declare`: `<Name> returns to <School>`.
    - If the slot is taken, he joins `board.portal` with `{fromTeam: college, classYear, rating: collegeRating, stars, projections: {}, committedTo: null}`. Tx `portal`: `<Name> (Jr C, 74) returns from the draft; his <School> spot is taken, so he enters the transfer portal`.
    - Either way he's removed from the prospects.
    - A Senior is refused: `Seniors can't go back to school`.
  - **`draftToPortal`:** he joins the portal as above. Tx `portal`: `<Name> (Jr C, 74) leaves the draft and enters the transfer portal from <School>`. A Senior is refused: `Seniors can't enter the transfer portal`.
  - **`setProspectRating`:**
    - It is refused unless `ratings?.locked`: `Finish the pro ratings reset first`.
    - It is refused for a prospect in `ratings.rows`: `<Name> was rated in the pro reset`.
    - A value outside 1–99, or not whole, is refused: `Enter a whole number from 1 to 99`.
    - Otherwise it writes only the draft. Label `<Name>: FBA rating 71`.
  - **`boardOrder`:** covers the rank order, then the rest by rating, including the tie-breaks.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Paths come from `draftPath(n)`, `leagues/fbajc/S${n}/rosters.json`, `boardPath(n − 1)` and the college tx path.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: draft board moves (declare, back to school, portal, typed rating)`.

---

### Task 7: Adjust Pro Ratings engine (§4)

**Files:** create `web/engine/offseason/proRatings.ts`, `web/engine/offseason/proRatings.test.ts`.

**Interfaces:**

```ts
export const PRO_RATINGS_STEP = 'adjust-pro-ratings-reset';
export const proRatingsPath = (season: number) => `leagues/fba/S${season}/ratings.json`;
export interface ProRatingsState {
  season: number; calendar: CalendarFile; fba: RostersFile; prevFba: RostersFile | null; draft: DraftFile | null;
  players: PlayersFile; collegeTeams: TeamsFile; ratings: RankingFile | null; prevRatings: RankingFile | null /* S{n−1} fba-reset */;
  pause: RatingPauseFile | null /* S{n−1} first 'ratings' pause */; tx: TransactionsFile /* fba S{n} */;
}
export function proRatingRows(state: ProRatingsState): RankingRow[];
export function proCurve(state: ProRatingsState): number[];
export function startProRatings(state: ProRatingsState): WritesResult;
export function proMembershipBlockers(state: ProRatingsState): string[];
export function syncProRatings(state: ProRatingsState): WritesResult;
export function proRatingsBlockers(state: ProRatingsState): string[];
export function finishProRatings(state: ProRatingsState, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests.**
  - **Rows:**
    - Every FBA roster player gets `{team, age: entry.age, prevRating, otherRating: null, stat: 'S79: 412 pts'}`. The points are summed over `prevFba`, and `stat` is null when there are none.
    - Every prospect gets `{team: null, age: n − birthSeason or null, prevRating: null, otherRating: collegeRating, stat: 'Jr · TEX'}`.
  - **`prevRating` for FBA players** is the first that exists:
    1. `prevRatings.ratings[id]`, if `prevRatings?.locked`;
    2. the `pause` row's `oldRating`;
    3. `entry.rating`.
  - **`proCurve`:** a locked `prevRatings` gives its ratings sorted high to low. Otherwise the `pause` `oldRating`s are sorted the same way, and failing that the FBA roster ratings. Values are clamped to 1–99.
  - **`suggestion(doc, curve.length + 1)`** is null, which is existing behaviour; confirm it with an `fba-reset` doc.
  - **`startProRatings`:**
    - It is refused off the step (`calendarProblem(calendar, 'adjust-pro-ratings-reset', 'Pro ratings are reset')`).
    - Without a draft doc: `Run Adjust Age first`.
    - When the doc already exists: `The pro ratings reset has already started`.
    - Otherwise it writes an unlocked `fba-reset` doc with `rows`, `curve`, `order: []` and `ratings: {}`. Label `Start the pro ratings reset`.
  - **Membership:** `<Name> isn't in the ratings list` or `<Name> is no longer on an FBA roster or the draft board`. `syncProRatings` writes `syncRows(ratings, proRatingRows(state))`, labelled `Sync the pro ratings list`.
  - **Finish:**
    - It is blocked by `rankingBlockers` plus the membership blockers, and by `Pro ratings are already finished`.
    - It writes:
      - the locked ranking;
      - the FBA rosters, with each ranked player's rating;
      - the draft, with each prospect's `fbaRating` set by id;
      - the calendar, with the step done;
      - tx `fba-ratings`: `FBA ratings reset: 150 players and 12 prospects ranked, 140 took the suggestion` (via `suggestionsTaken`).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement,** modelled on `engine/college/collegeRatings.ts`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Adjust Pro Ratings engine (FBA players plus draft prospects)`.

---

### Task 8: Adjust Pro Ratings page

**Files:** create `web/app/offseason/ProRatingsPage.tsx`, `web/app/offseason/ProRatingsPage.test.tsx`; modify `Layout.tsx` (`/league/fba/ratings`) and `stepRoutes.ts` (`TOOL_STEPS['adjust-pro-ratings-reset'] = '/league/fba/ratings'`, +test).

- [ ] **Step 1: Write the failing tests.**
  - **Loads:**
    - the calendar and players;
    - FBA S{n} rosters and tx, and FBA S{n−1} rosters;
    - `draftPath(n)`, `proRatingsPath(n)` and `proRatingsPath(n−1)`;
    - the fbajc `teams.json`;
    - the S{n−1} FBA `schedule.json`, then `seasonDocPath('ratingPause', 'fba', n − 1, afterGame)` (`engine/season/state.ts`) for its first pause with `kind: 'ratings'`. If there's no schedule or no pause, `pause` is null.
  - **Before start:** a "Start the pro ratings reset" button posts the new doc.
  - **While ranking:**
    - it renders `RankingTable`, with `teamLabel` giving the FBA team name, or `Prospect` for `team: null`;
    - `otherLabel` is `College`, and `extraBlockers` is `proMembershipBlockers`;
    - a "Sync list" button shows only while those blockers exist, and posts `syncProRatings`.
  - **Finish** posts one batch.
  - **When locked:** `Pro ratings are finished.` with "Draft board ▸".
  - **`<h1>`:** `S{n} FBA ratings reset`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement,** modelled on `app/college/CollegeRatingsPage.tsx`.
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: Adjust Pro Ratings page`.

---

### Task 9: FBA draft engine (§5)

**Files:** create `web/engine/offseason/fbaDraft.ts`, `web/engine/offseason/fbaDraft.test.ts`.

**Interfaces:**

```ts
export const draftStepId = (season: number) => `s${season}-fba-draft`;
export interface FbaDraftState {
  season: number; calendar: CalendarFile; draft: DraftFile; ratings: RankingFile | null; lottery: LotteryFile | null /* S{n−1} */;
  fba: RostersFile; freeAgents: FreeAgentsFile; players: PlayersFile; fbaTeams: TeamsFile; collegeTeams: TeamsFile; tx: TransactionsFile;
}
export function startDraftProblems(state: FbaDraftState): string[];
export function startDraft(state: FbaDraftState, ctx: MoveContext): WritesResult;
export function onTheClock(draft: DraftFile): DraftPick | null;
export function draftPick(state: FbaDraftState, playerId: string, ctx: MoveContext): WritesResult;
export function finishDraftProblems(state: FbaDraftState): string[];
export function finishDraft(state: FbaDraftState, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests.**
  - **`startDraftProblems`**, in this order:
    - `calendarProblem(calendar, 's80-fba-draft', 'The draft starts')`;
    - `Finish the pro ratings reset first`;
    - `<Name> has no FBA rating` for each unrated prospect;
    - `The S79 draft lottery hasn't been drawn`, when it's missing or unlocked;
    - `The draft has already started`.
  - **`startDraft`:**
    - `picks` come from `lottery.picks` sorted by `slot`, as `{slot, owner, originalTeam, playerId: null}`, and `started` becomes true.
    - Tx `drafted`: `The S80 draft starts: 30 picks, 12 prospects`.
    - It writes only the draft and the tx.
  - **`onTheClock`:** the first pick with `playerId: null`, or null.
  - **`draftPick`:**
    - It sets the pick's `playerId`.
    - It appends `{playerId, position, rating: fbaRating, age: 80 − birthSeason, points: 0, contractEnd: 81, contractAmount: 2, restricted: true}` to the owner's roster, even when that roster already has 5 players.
    - Tx `drafted`: `S80 Draft #3: <Team> selects <Name> (G, <School>)`. Label `#3: <Team> selects <Name>`.
    - Refusals: `The draft hasn't started`, `The draft is finished`, `<Name> has already been drafted`, `<id> isn't a prospect`.
  - **`finishDraftProblems`:** `The draft hasn't started`, and `<k> picks are still to be made` while an empty pick remains and an undrafted prospect exists. There's no problem when picks remain but no prospects do.
  - **`finishDraft`:**
    - Undrafted prospects are appended to `freeAgents.players` as `{playerId, position, age, rating: fbaRating, rookie: true, note: 'Undrafted'}`.
    - `draft.locked` becomes true, and the step is marked done.
    - Tx `drafted`: `The S80 draft is finished: 2 undrafted prospects join free agency`, plus a line `#29: <Team> makes no selection` for each empty pick.
    - Writes: draft, free agents, calendar and tx.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: FBA draft engine (start, picks on the rookie deal, undrafted to free agency)`.

---

### Task 10: Draft board and draft page

**Files:** create `web/app/offseason/FbaDraftPage.tsx`, `web/app/offseason/FbaDraftPage.test.tsx`; modify `Layout.tsx` (`/league/fba/draft`) and `stepRoutes.ts` (`if (/^s\d+-fba-draft$/.test(step.id)) return '/league/fba/draft';` before the lottery regex, +test).

- [ ] **Step 1: Write the failing tests.**
  - **Loads:**
    - the calendar and players;
    - `draftPath(n)`, `proRatingsPath(n)` and `lotteryPath(n − 1)`;
    - FBA S{n} rosters, free agents and tx, and the FBA `teams.json`;
    - FBAJC S{n} rosters and `teams.json`, `boardPath(n − 1)` and the FBAJC S{n} tx (a 404 becomes the empty tx).
  - **No draft doc:** `Run Adjust Age first.` with a link to `/offseason/adjust-age`.
  - **Before start:**
    - **Prospects table** in `boardOrder`: name, position, school, class year, college rating and FBA rating. Early entrants have "Back to school" and "Portal" buttons; Seniors have none.
    - **Late-entrant rating:** an input is shown when `setProspectRating` would be allowed. It saves on blur or Enter; an invalid entry shows the problem and isn't saved.
    - **"Declare early entrants" section:** `declareCandidates` grouped by school, each with a "Declare" button.
    - **"Start the draft":** shown on the draft step. It is disabled while `startDraftProblems` isn't empty, and the problems are listed under it.
  - **After start:**
    - `On the clock: #3 <Team>` (the pick's owner, with `(from <originalTeam abbr>)` when the owner differs from the original team);
    - the prospects not yet drafted in `boardOrder`, each with a "Draft" button;
    - the picks made so far.
    - "Finish the draft" is shown when `finishDraftProblems` is empty.
  - **After finish:** `The S{n} draft is finished.` plus the full pick list.
  - **Saving:** every button posts one batch and is guarded by a `useRef`.
  - **`stepRoutes.test.ts`:** `s80-fba-draft` goes to `/league/fba/draft`, and `s81-fba-draft-lottery` still goes to `/league/fba/lottery`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, tsc and the full suite.**
- [ ] **Step 5: Commit** `feat: draft board and FBA draft page`.

---

## After the tasks (controller)

1. **Final review:** one Opus review of `main..pro-tail`.
2. **Browser check:** text only, on scratch data (CLAUDE.md "Browser checks").
   - **Prep:**
     - `prep.mjs` roster fill only.
     - On the scratch server only: run the S79 college setup, give the S80 class board a few commitments (one onto a named holder), lock a drawn S79 lottery, and run "Go to next season" to S80.
   - **Walk-through:**
     1. Adjust Age: preview, click, and the displaced player is in the portal.
     2. Draft board: declare two; send one back to school and one to the portal.
     3. Pro reset: start, then declare another and use "Sync list", then Use all suggestions and Finish.
     4. Declare one more after the reset and type his rating.
     5. Start the draft, make every pick, then Finish.
     6. Check that the undrafted players are in FBA free agency and the calendar sits at Free Agency/Offseason.
   - **Also check:** 375px width and the console.
3. **Wrap-up:** update `progress.md`, the §10 roadmap row and the roadmap memory. Stop for the user before merging.
