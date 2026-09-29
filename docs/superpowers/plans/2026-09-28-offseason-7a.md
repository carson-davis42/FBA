# Part 7a: Ranking Tool, D2 Reset, College Setup, Create Class and the Recruiting Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the next real offseason steps work under the commissioner's rules:
- a shared **click-to-rank** tool (rank players best first from last season's order, then rate each one with a separate suggestion from last season's curve);
- the **FBAD2 Ratings(reset)** rebuilt on it;
- the one-time **S79 college rosters** built from S78;
- **Create S{n+1} Class** (names and positions);
- the **recruiting board** (projections, commits, decommits, the transfer portal by displacement) and its gate on the FBAJC step.

**Architecture:**
- **Engine** (pure TypeScript):
  - `web/engine/rank/ranking.ts`: the click-to-rank edits and checks on a `RankingFile`;
  - `web/engine/d2/ratings.ts`: the D2 reset builds and finishes a `RankingFile` (the old formula is removed);
  - `web/engine/college/setup.ts`: the one-time college rosters;
  - `web/engine/college/state.ts` and `web/engine/college/recruiting.ts`: the recruiting state, Create Class, and the board moves.
- **Data:** new strict schemas `RankingFile` and `RecruitingFile`; `ReservePlayer.fbaRating`; transaction types `class`, `commit`, `portal`.
- **UI:**
  - `web/app/rank/RankingTable.tsx` (generic, reused by 7c and 7d);
  - the rewritten `D2RatingsPage`;
  - `web/app/college/` (the recruiting page with its Class and Board tabs and the setup panel);
  - the Calendar's FBAJC gate.
- Every move returns `{ ok: true, state, changed, label }` or `{ ok: false, problems }` and saves through `commitDocs` with the loaded versions. The ranking and the class draft autosave through `useAutosaveDoc`.

**Tech Stack:**
- Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict schemas)
- Vitest 2 with jsdom and Testing Library

**Spec:** `docs/superpowers/specs/2026-09-28-offseason-7a-ranking-recruiting-design.md` (decisions D1–D21 in `.superpowers/sdd/progress.md`).

## Global Constraints

- **Repo and commands:** repo root `C:/Users/carso/OneDrive/Documents/Fun/Code/creative_vscode/FBA`. Run every command from `web/`: `npx vitest run <paths>` and `npx tsc --noEmit` (must print nothing).
- **Branch:** work on `offseason`. Never commit to `main`.
- **Read-only folders:** never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/` or `FBA Logos/`.
- **Real save data:** never modify `web/data/**`. The committed data must keep passing `web/data.test.ts`. Don't start or stop dev servers on 5173/5174. Leave no stray files; put scratch in `.superpowers/sdd/`.
- **jsdom tests:** every jsdom test file starts with `// @vitest-environment jsdom` and calls `cleanup()` in `afterEach` (Vitest globals are off).
- **Saves:** new write paths pass the loaded versions through `commitDocs` (`web/app/roster/commit.ts`) or `useAutosaveDoc`. A batch that also writes an autosaved doc sends the autosave hook's `version` for it. An effect or handler that must not save twice is guarded with a `useRef` (the `useSaving` double-render gotcha).
- **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` on its own line, after a blank line.
- **A season number is the year:** in S79, the class being created is the "S80 class" / "Class of S80" (as the calendar's "Create S80 Class" already says). Nothing may call the current season S80.
- **Ratings:** every rating is a whole number from 1 to 99. Stars are 3 to 5.
- **Unnamed college players** (`players.json` name `null`) are shown as `X`, as in the Java.
- **Wording** (exact strings; tests check them):
  - ranking blockers: `N players aren't ranked yet` / `1 player isn't ranked yet`; `N players still need a rating` / `1 player still needs a rating`; `#12 Name (84) is rated above #11 Name (83)`;
  - ranking buttons: `Take the rest in order`, `Use all suggestions`, `Finish ratings` (D2); the suggestion chip reads `suggested 97`;
  - D2 log line: `D2 ratings reset: N players ranked, M took the suggestion` (type `d2-ratings`);
  - college setup: batch label `Set up S79 college rosters`, log line `S79 college rosters set up from S78` (type `season`), summary `278 Seniors leave, 9 players left early, 287 holes`;
  - Create Class: batch label `Create S80 class`, log line `S80 class created: 30 recruits` (type `class`);
  - board log lines: `Name (5★ PG) commits to Texas` (no stars yet: `Name (PG) commits to Texas`), `Name (Jr SG, transfer from Baylor) commits to Texas`, `Name decommits from Texas` (type `commit`), `Name (Jr SG, 78) enters the transfer portal from Texas` (type `portal`);
  - commit preview: `Open spot`, `Jaden Moss (Jr, 78) will enter the portal`, refusal `Texas already has Name committed at PG. Decommit them first`;
  - FBAJC gate: `N recruits and M portal players haven't committed yet` (singular `1 recruit`, `1 portal player`).

## Notes on the spec (clarifications this plan makes)

1. **Where `otherRating` comes from.** Spec §4 says "that player's rating on this season's FBA free-agent list". But closing free agency empties that list (`closeFreeAgency` saves `players: []`) and the D2 reset can only start after it closes, so the list is always empty by then. This plan keeps the number: `closeFreeAgency` copies each moved player's FBA rating onto their Reserve entry as the new optional `ReservePlayer.fbaRating` (only when it isn't null), "Go to next season" strips it together with `fromFba`, and the D2 reset reads `otherRating` from it. The real S79 data hasn't closed free agency yet, so its 21 rated free agents will carry their rating.
2. **Names in the ranking engine.** `leftRows`, `takeRest` and `rankingBlockers` take a `name: (playerId) => string` argument (ties break on name; blocker lines show names).
3. **Ranking edits return the doc.** `take`, `sendBack`, `takeRest`, `setRating` and `applyAllSuggestions` return a `RankingFile`; a refused edit (unknown or already-ranked player, locked file, invalid rating) returns the same object unchanged, which `useAutosaveDoc.update` then skips. They are autosaved doc edits, not batch moves.
4. **`useAllSuggestions` is named `applyAllSuggestions`**, so it isn't mistaken for a React hook.
5. **Out-of-order rule.** A ranked, rated player is out of order when their rating is higher than the lowest rating ranked above them (so `85, 90, 88` flags both 90 and 88). Unrated rows are skipped. Equal ratings are fine.
6. **`rankingBlockers` doesn't check `locked`.** The D2 layer keeps its own `D2 ratings are already finished` blocker.
7. **D2 membership blockers** are exported as `membershipBlockers(state)`, so the page can pass them to the ranking table as extra blockers.
8. **Curve values** are clamped to 1–99 (the D2 data already fits: 65–99).
9. **Recruiting page before the college rosters exist.** The whole page needs the S{n} college rosters; until they exist it shows only the setup panel (or, when `meta.rosterSeason.fbajc` isn't n − 1, a "don't exist yet" note). The recruiting doc is created by the first class-draft autosave (a PUT with `If-Match: "null"`), or by Create Class if no autosave happened. A missing S{n} college transactions doc is treated as empty.
10. **Class tab after creation** lists the recruits with rename, position and Remove (spec §6.2's `editRecruit` / `removeRecruit`), each saved as a batch.
11. **`editRecruit` and `removeRecruit` refusals:** `Name has committed; decommit them first`; `Remove Name's projections first`; a blank name is refused with `Enter a name`.
12. **New player ids** follow the importer: `p` + the zero-padded 5-digit `nextId` (S79's next is `p01914`).
13. **Displaced returning players** keep their class year, rating and stars in the portal. A slot whose player has no class year can't be displaced (`Name has no class year`); the setup and every later tool always set one.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/engine/shared/types.ts` | `RankingRow`, `RankingFile`, `Prospect`, `PortalPlayer`, `ClassDraftRow`, `RecruitingFile`; `ReservePlayer.fbaRating`; transaction types `class`, `commit`, `portal`; removes `RatingBreakdown`, `D2RatingRow`, `D2RatingsFile` (Task 4) |
| `web/engine/shared/schemaRegistry.ts` | `fbajc/S<n>/recruiting.json` → `RecruitingFile`; `fbad2/S<n>/ratings.json` → `RankingFile` |
| `web/engine/roster/moves.ts` | `closeFreeAgency` keeps `fbaRating` on the Reserve entry |
| `web/engine/rank/ranking.ts` (new), `web/engine/rank/testFixtures.ts` (new) | Click-to-rank edits, suggestion, blockers, out-of-order; a shared 6-player fixture |
| `web/app/rank/RankingTable.tsx` (new), `web/app/rank/rank.css` (new) | The two-column ranking screen |
| `web/engine/d2/ratings.ts`, `web/engine/d2/state.ts`, `web/engine/d2/testFixtures.ts` | D2 reset on `RankingFile`; `D2State.prevRatings` |
| `web/app/d2/useD2State.ts`, `web/app/d2/testDocs.ts`, `web/app/pages/D2RatingsPage.tsx` | Loads last season's ranking; the page on `RankingTable` |
| `web/engine/college/setup.ts` (new), `web/engine/college/testFixtures.ts` (new) | One-time college rosters and its batch; college fixtures |
| `web/engine/college/state.ts` (new) | `RecruitingState`, doc paths, writes, names |
| `web/engine/college/recruiting.ts` (new) | Class draft edits, paste parsing, `createClass`, `editRecruit`, `removeRecruit`, projections, `commit`, `decommit`, `commitPreview`, `uncommitted`, `fbajcGateProblem` |
| `web/app/college/ClassTab.tsx`, `web/app/college/BoardTab.tsx`, `web/app/college/college.css` (new) | The Class and Board tabs |
| `web/app/college/useRecruitingState.ts`, `web/app/college/SetupPanel.tsx`, `web/app/college/RecruitingPage.tsx`, `web/app/college/testDocs.ts` (new) | Loading, the setup panel, the page |
| `web/app/shell/Layout.tsx`, `web/app/components/LeagueTabs.tsx`, `web/app/stepRoutes.ts` | Route, FBAJC tabs, Create Class step route |
| `web/app/pages/CalendarPage.tsx` | The FBAJC gate |
| `web/engine/season/nextSeason.ts`, `web/app/pages/NextSeasonPage.tsx` | Lock the recruiting doc; strip `fbaRating`; `RankingFile` type |

---

### Task 1: Schemas for rankings and recruiting, and the FBA rating on Reserves

**Files:**
- Modify: `web/engine/shared/types.ts`
- Modify: `web/engine/shared/schemaRegistry.ts`
- Modify: `web/engine/roster/moves.ts` (`closeFreeAgency`)
- Modify: `web/engine/season/nextSeason.ts` (strip `fbaRating`)
- Test: `web/engine/shared/types.test.ts`, `web/engine/shared/schemaRegistry.test.ts`, `web/engine/roster/moves.test.ts`, `web/engine/season/nextSeason.test.ts`

**Interfaces:**
- **Consumes:** the existing `playerId`, `idList`, `d2Rating` (int 1–99), `Position`, `ClassYear`, `LeagueId` helpers in `types.ts`.
- **Produces:**
  - `RankingKind = z.enum(['d2-reset'])`;
  - `RankingRow`: `{ playerId, position, age: int|null, team: string|null, prevRating: int|null, otherRating: int|null, stat: string|null }`;
  - `RankingFile`: `{ league: LeagueId, season, kind: RankingKind, locked, rows: RankingRow[], order: playerId[], ratings: Record<playerId, 1..99>, curve: (1..99)[] }` with the superRefine checks below;
  - `Prospect`: `{ playerId, position, classYear: ClassYear, rating: 1..99|null, stars: 3..5|null, projections: Record<teamId, int ≥ 1>, committedTo: string|null }`;
  - `PortalPlayer = Prospect & { fromTeam: string }`;
  - `ClassDraftRow`: `{ name: string, position }` (the name may be blank while typing);
  - `RecruitingFile`: `{ league: 'fbajc', season, classOf, locked, classDraft: ClassDraftRow[], created, recruits: Prospect[], portal: PortalPlayer[] }`;
  - `ReservePlayer.fbaRating?: 1..99`;
  - `TransactionType` gains `'class' | 'commit' | 'portal'`.

- [ ] **Step 1: Write the failing tests**

In `web/engine/shared/types.test.ts`, add `RankingFile` and `RecruitingFile` to the import from `./types`, and append:

```ts
describe('Part 7a schemas', () => {
  const row = (playerId: string, prevRating: number | null) =>
    ({ playerId, position: 'PG', age: 25, team: 'AMS', prevRating, otherRating: null, stat: null });
  const ranking = {
    league: 'fbad2', season: 79, kind: 'd2-reset', locked: false,
    rows: [row('p00001', 80), row('p00002', null)],
    order: ['p00001'],
    ratings: { p00001: 81, p00002: 70 },
    curve: [80, 75],
  };
  const ok = (patch: object) => RankingFile.safeParse({ ...ranking, ...patch }).success;

  it('accepts a ranking in progress, where a sent-back row keeps its rating', () => {
    expect(ok({})).toBe(true);
    expect(ok({ rows: [{ ...row('p00001', 80), team: null, stat: '412 pts', otherRating: 71 }, row('p00002', null)] })).toBe(true);
  });

  it('rejects duplicate rows, unknown or repeated ranks, unknown ratings, a rising curve, bad ratings and unknown kinds', () => {
    expect(ok({ rows: [row('p00001', 80), row('p00001', 70)] })).toBe(false);
    expect(ok({ order: ['p00001', 'p00001'] })).toBe(false);
    expect(ok({ order: ['p00009'] })).toBe(false);
    expect(ok({ ratings: { p00009: 70 } })).toBe(false);
    expect(ok({ curve: [75, 80] })).toBe(false);
    expect(ok({ curve: [100] })).toBe(false);
    expect(ok({ ratings: { p00001: 100 } })).toBe(false);
    expect(ok({ ratings: { p00001: 0 } })).toBe(false);
    expect(ok({ kind: 'fba-reset' })).toBe(false);
  });

  it('only locks a ranking that ranks and rates everyone', () => {
    expect(ok({ locked: true })).toBe(false);
    expect(ok({ locked: true, order: ['p00001', 'p00002'] })).toBe(true);
    expect(ok({ locked: true, order: ['p00001', 'p00002'], ratings: { p00001: 81 } })).toBe(false);
  });

  const recruit = { playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: { TEX: 2, UH: 1 }, committedTo: null };
  const transfer = { ...recruit, playerId: 'p00485', classYear: 'Jr', rating: 78, stars: 4, projections: {}, committedTo: 'TEX', fromTeam: 'BAY' };
  const board = { league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true, recruits: [recruit], portal: [transfer] };
  const okBoard = (patch: object) => RecruitingFile.safeParse({ ...board, ...patch }).success;

  it('accepts a recruiting board, and a class draft before the class exists', () => {
    expect(okBoard({})).toBe(true);
    expect(okBoard({ created: false, recruits: [], portal: [], classDraft: [{ name: '', position: 'C' }, { name: 'Zion Carter', position: 'PG' }] })).toBe(true);
  });

  it('rejects a wrong classOf, a player listed twice, draft rows after creation, recruits before it, and bad counts or stars', () => {
    expect(okBoard({ classOf: 81 })).toBe(false);
    expect(okBoard({ portal: [{ ...transfer, playerId: 'p01914' }] })).toBe(false);
    expect(okBoard({ classDraft: [{ name: 'Zion Carter', position: 'PG' }] })).toBe(false);
    expect(okBoard({ created: false })).toBe(false);
    expect(okBoard({ recruits: [{ ...recruit, projections: { TEX: 0 } }] })).toBe(false);
    expect(okBoard({ recruits: [{ ...recruit, stars: 2 }] })).toBe(false);
    expect(okBoard({ portal: [{ ...transfer, fromTeam: undefined }] })).toBe(false);
    expect(okBoard({ league: 'fba' })).toBe(false);
  });

  it('knows the recruiting transaction types and keeps an FBA rating on a Reserve', () => {
    for (const type of ['class', 'commit', 'portal']) expect(TransactionType.safeParse(type).success).toBe(true);
    const reserve = { playerId: 'p00041', position: 'SG', age: 23, rating: null, fromFba: true };
    expect(ReservePlayer.safeParse({ ...reserve, fbaRating: 71 }).success).toBe(true);
    expect(ReservePlayer.safeParse({ ...reserve, fbaRating: 0 }).success).toBe(false);
  });
});
```

In `web/engine/shared/schemaRegistry.test.ts`, add `RecruitingFile` to the `./types` import and append:

```ts
describe('part 7a documents', () => {
  it('knows the recruiting board', () => {
    expect(schemaForPath('leagues/fbajc/S79/recruiting.json')).toBe(RecruitingFile);
    expect(schemaForPath('leagues/fba/S79/recruiting.json')).toBeNull();
  });
});
```

In `web/engine/roster/moves.test.ts`, in `it('moves unsigned free agents to D2 Reserves and locks the pool', …)`, after the `fromFba` expectation add:

```ts
    expect(r.state.reserves.players.map(p => p.fbaRating ?? null)).toEqual([null, null, 69]);
```

In `web/engine/season/nextSeason.test.ts`, in `ready()`, change the first Reserve to carry an FBA rating (the expected S80 Reserves in the first test stay as they are, so the test checks it is stripped):

```ts
        { playerId: 'p09001', position: 'C', age: 30, rating: 60, fromFba: true, fbaRating: 71 },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared/types.test.ts engine/shared/schemaRegistry.test.ts engine/roster/moves.test.ts engine/season/nextSeason.test.ts`
Expected: FAIL: `RankingFile`/`RecruitingFile` aren't exported, the Reserve with `fbaRating` is rejected, and `fbaRating` is missing after closing free agency.

- [ ] **Step 3: Implement the schemas**

In `web/engine/shared/types.ts`:

1. Replace `ReservePlayer` with:

```ts
export const ReservePlayer = z.object({
  playerId, position: Position, age: int.nullable(), rating: int.nullable(),
  /** Set when the player came from FBA free agency this offseason. */
  fromFba: z.literal(true).optional(),
  /** Their rating on the FBA free-agent list when free agency closed; orders the D2 reset's "New" group. */
  fbaRating: int.min(1).max(99).optional(),
}).strict();
```

2. Replace the `TransactionType` line with:

```ts
export const TransactionType = z.enum([
  'signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed', 'drafted', 'd2-pool', 'd2-ratings', 'awards', 'season', 'class', 'commit', 'portal',
]);
```

3. Directly after the `D2DraftFile` type line (`export type D2DraftFile = …`), add:

```ts
export const RankingKind = z.enum(['d2-reset']);
export type RankingKind = z.infer<typeof RankingKind>;

export const RankingRow = z.object({
  playerId,
  position: Position,
  age: int.nullable(),
  /** Team id, or null (D2 Reserves). */
  team: z.string().min(1).nullable(),
  /** Last season's base rating in this league; null = new to this league. */
  prevRating: int.nullable(),
  /** A rating from another league, used only to order the "New" group. */
  otherRating: int.nullable(),
  /** One line of context, e.g. "412 pts". */
  stat: z.string().min(1).nullable(),
}).strict();
export type RankingRow = z.infer<typeof RankingRow>;

/** One click-to-rank reset. `order` is the new ranking, best first; rank k's suggestion is curve[k - 1]. */
export const RankingFile = z.object({
  league: LeagueId,
  season: int,
  kind: RankingKind,
  locked: z.boolean(),
  rows: z.array(RankingRow),
  order: idList,
  /** What the commissioner entered or accepted; a sent-back row keeps its rating. */
  ratings: z.record(playerId, d2Rating),
  curve: z.array(d2Rating),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = new Set(doc.rows.map(r => r.playerId));
  if (ids.size !== doc.rows.length) issue('A player is listed twice in the rows');
  if (new Set(doc.order).size !== doc.order.length) issue('A player is ranked twice');
  for (const id of doc.order) if (!ids.has(id)) issue(`${id} is ranked but isn't in the rows`);
  for (const id of Object.keys(doc.ratings)) if (!ids.has(id)) issue(`${id} has a rating but isn't in the rows`);
  if (doc.curve.some((v, k) => k > 0 && v > doc.curve[k - 1])) issue('The curve must run from high to low');
  if (doc.locked) {
    if (doc.order.length !== doc.rows.length) issue('A finished ranking must rank every player');
    if (doc.order.some(id => doc.ratings[id] === undefined)) issue('A finished ranking must rate every player');
  }
});
export type RankingFile = z.infer<typeof RankingFile>;

export const Prospect = z.object({
  playerId,
  position: Position,
  /** 'Fr' for recruits; a transfer's current class year. */
  classYear: ClassYear,
  /** Recruits: null until Rank Class (7c). Transfers: their college rating. */
  rating: d2Rating.nullable(),
  stars: int.min(3).max(5).nullable(),
  /** Projection counts per school (team id); each count is at least 1. */
  projections: z.record(z.string().min(1), int.positive()),
  committedTo: z.string().min(1).nullable(),
}).strict();
export type Prospect = z.infer<typeof Prospect>;

export const PortalPlayer = Prospect.extend({ fromTeam: z.string().min(1) }).strict();
export type PortalPlayer = z.infer<typeof PortalPlayer>;

/** A Create Class row; the name may be blank while it is being typed. */
export const ClassDraftRow = z.object({ name: z.string(), position: Position }).strict();
export type ClassDraftRow = z.infer<typeof ClassDraftRow>;

/** The recruiting board of the class created in calendar season `season`; it plays its Freshman year in that season's FBAJC. */
export const RecruitingFile = z.object({
  league: z.literal('fbajc'),
  season: int,
  classOf: int,
  locked: z.boolean(),
  /** Create Class rows before "Create class". */
  classDraft: z.array(ClassDraftRow),
  created: z.boolean(),
  recruits: z.array(Prospect),
  portal: z.array(PortalPlayer),
}).strict().superRefine((doc, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (doc.classOf !== doc.season + 1) issue('classOf must be the season + 1');
  const seen = new Set<string>();
  for (const p of [...doc.recruits, ...doc.portal]) {
    if (seen.has(p.playerId)) issue(`${p.playerId} is on the board twice`);
    seen.add(p.playerId);
  }
  if (doc.created && doc.classDraft.length) issue('The class draft must be empty once the class is created');
  if (!doc.created && doc.recruits.length) issue('There are no recruits until the class is created');
});
export type RecruitingFile = z.infer<typeof RecruitingFile>;
```

In `web/engine/shared/schemaRegistry.ts`, add `RecruitingFile` to the `./types` import and add this rule after the `draft.json` rule:

```ts
  [new RegExp(`^leagues/fbajc/${S}/recruiting\\.json$`), RecruitingFile],
```

- [ ] **Step 4: Keep the FBA rating when free agency closes, and strip it at rollover**

In `web/engine/roster/moves.ts`, in `closeFreeAgency`, replace the `reserves` construction with:

```ts
  const reserves = {
    ...state.reserves,
    players: [
      ...state.reserves.players,
      ...moved.map(p => ({
        playerId: p.playerId, position: p.position, age: p.age, rating: null, fromFba: true as const,
        ...(p.rating !== null ? { fbaRating: p.rating } : {}),
      })),
    ],
  };
```

In `web/engine/season/nextSeason.ts`, in `nextSeasonDocs`, replace the `players:` line of the S{n+1} `reserves` with:

```ts
    players: (input.fbad2.reserves?.players ?? []).map(({ fromFba: _fromFba, fbaRating: _fbaRating, ...rest }) => rest),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/shared/types.test.ts engine/shared/schemaRegistry.test.ts engine/roster/moves.test.ts engine/season/nextSeason.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes (including `data.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add web/engine/shared/types.ts web/engine/shared/types.test.ts web/engine/shared/schemaRegistry.ts web/engine/shared/schemaRegistry.test.ts web/engine/roster/moves.ts web/engine/roster/moves.test.ts web/engine/season/nextSeason.ts web/engine/season/nextSeason.test.ts
git commit -m "feat: ranking and recruiting schemas; Reserves keep their FBA rating when free agency closes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The click-to-rank engine

**Files:**
- Create: `web/engine/rank/ranking.ts`
- Create: `web/engine/rank/testFixtures.ts`
- Test: `web/engine/rank/ranking.test.ts`

**Interfaces:**
- **Consumes:** `RankingFile`, `RankingRow`, `Position` (Task 1).
- **Produces** (all pure; every edit returns the same object when refused):
  - `type NameOf = (playerId: string) => string`;
  - `leftRows(doc, name): RankingRow[]`: unranked rows; rows with a `prevRating` first (high to low), then the New group (`prevRating` null) by `otherRating` high to low (null last); ties by name, then id;
  - `rankedRows(doc): RankingRow[]`: the rows in `order`;
  - `take(doc, id)`, `sendBack(doc, id)`, `takeRest(doc, name)`: `RankingFile`;
  - `suggestion(doc, k: number): number | null` (k is 1-based);
  - `setRating(doc, id, value: number | null): RankingFile` (null clears);
  - `applyAllSuggestions(doc): RankingFile`;
  - `outOfOrderPairs(doc): { above: RankedRating; below: RankedRating }[]` with `RankedRating = { id: string; rank: number; rating: number }`;
  - `outOfOrder(doc): Set<string>` (the `below` ids);
  - `rankingBlockers(doc, name): string[]`;
  - `suggestionsTaken(doc): number`: ranked players whose rating equals their rank's suggestion.
- `web/engine/rank/testFixtures.ts` exports `RANK_NAMES`, `rankName: NameOf` and `rankingDoc(patch?: Partial<RankingFile>): RankingFile` (used again in Task 3).

- [ ] **Step 1: Write the fixture**

Create `web/engine/rank/testFixtures.ts`:

```ts
import type { Position, RankingFile, RankingRow } from '../shared/types';
import type { NameOf } from './ranking';

export const RANK_NAMES: Record<string, string> = {
  p00001: 'Ada Stone', p00002: 'Ben Cole', p00003: 'Cal Reyes', p00004: 'Dev Hart', p00005: 'Eli Park', p00006: 'Finn Lowe',
};

export const rankName: NameOf = id => RANK_NAMES[id] ?? id;

const row = (playerId: string, prevRating: number | null, otherRating: number | null, position: Position): RankingRow =>
  ({ playerId, position, age: 25, team: prevRating === null ? null : 'AMS', prevRating, otherRating, stat: prevRating === null ? null : '300 pts' });

/**
 * Six players, nobody ranked, curve 90 · 85 · 80:
 * Ada Stone PG 80 · Ben Cole SG 85 · Cal Reyes PG 80 · Dev Hart PG new (FBA 70) · Eli Park PG new · Finn Lowe C new (FBA 75).
 * Last season's order: Ben, Ada, Cal, then New: Finn, Dev, Eli.
 */
export function rankingDoc(patch: Partial<RankingFile> = {}): RankingFile {
  return {
    league: 'fbad2',
    season: 79,
    kind: 'd2-reset',
    locked: false,
    rows: [
      row('p00001', 80, null, 'PG'), row('p00002', 85, null, 'SG'), row('p00003', 80, null, 'PG'),
      row('p00004', null, 70, 'PG'), row('p00005', null, null, 'PG'), row('p00006', null, 75, 'C'),
    ],
    order: [],
    ratings: {},
    curve: [90, 85, 80],
    ...patch,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/rank/ranking.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RankingFile } from '../shared/types';
import {
  applyAllSuggestions, leftRows, outOfOrder, rankedRows, rankingBlockers, sendBack, setRating, suggestion, suggestionsTaken, take, takeRest,
} from './ranking';
import { rankingDoc, rankName } from './testFixtures';

const ids = (rows: { playerId: string }[]) => rows.map(r => r.playerId);
const ALL = ['p00002', 'p00001', 'p00003', 'p00006', 'p00004', 'p00005'];

describe('leftRows', () => {
  it('lists last season first (high to low), then the New group by the other rating, with ties on name', () => {
    expect(ids(leftRows(rankingDoc(), rankName))).toEqual(ALL);
  });

  it('breaks full ties on id and leaves out ranked players', () => {
    expect(ids(leftRows(rankingDoc(), () => 'Same')).slice(0, 3)).toEqual(['p00002', 'p00001', 'p00003']);
    expect(ids(leftRows(rankingDoc({ order: ['p00002', 'p00006'] }), rankName))).toEqual(['p00001', 'p00003', 'p00004', 'p00005']);
  });
});

describe('take, sendBack and takeRest', () => {
  it('appends a taken player and refuses unknown, repeated or locked takes', () => {
    const doc = take(rankingDoc(), 'p00003');
    expect(doc.order).toEqual(['p00003']);
    expect(ids(rankedRows(doc))).toEqual(['p00003']);
    expect(take(doc, 'p00003')).toBe(doc);
    expect(take(doc, 'p00099')).toBe(doc);
    const locked = rankingDoc({ locked: true });
    expect(take(locked, 'p00001')).toBe(locked);
  });

  it('sends a player back but keeps their rating', () => {
    const doc = sendBack(rankingDoc({ order: ['p00002', 'p00001'], ratings: { p00001: 84 } }), 'p00002');
    expect(doc.order).toEqual(['p00001']);
    const back = sendBack(doc, 'p00001');
    expect(back.order).toEqual([]);
    expect(back.ratings).toEqual({ p00001: 84 });
    expect(sendBack(back, 'p00001')).toBe(back);
  });

  it('takes the rest in last season\'s order', () => {
    const doc = takeRest(take(rankingDoc(), 'p00006'), rankName);
    expect(doc.order).toEqual(['p00006', 'p00002', 'p00001', 'p00003', 'p00004', 'p00005']);
    expect(takeRest(doc, rankName)).toBe(doc);
  });
});

describe('suggestions and ratings', () => {
  it('suggests the curve value for a rank, and nothing past the curve', () => {
    expect([1, 2, 3, 4].map(k => suggestion(rankingDoc(), k))).toEqual([90, 85, 80, null]);
  });

  it('sets and clears ratings, refusing invalid values, unknown players and locked files', () => {
    const doc = setRating(rankingDoc(), 'p00001', 84);
    expect(doc.ratings).toEqual({ p00001: 84 });
    expect(setRating(doc, 'p00001', 84)).toBe(doc);
    for (const bad of [0, 100, 7.5]) expect(setRating(doc, 'p00001', bad)).toBe(doc);
    expect(setRating(doc, 'p00099', 70)).toBe(doc);
    expect(setRating(doc, 'p00001', null).ratings).toEqual({});
    expect(setRating(rankingDoc(), 'p00001', null)).toEqual(rankingDoc());
    const locked = rankingDoc({ locked: true });
    expect(setRating(locked, 'p00001', 70)).toBe(locked);
  });

  it('applies every suggestion without overwriting a typed rating', () => {
    const doc = rankingDoc({ order: ['p00002', 'p00001', 'p00003', 'p00006'], ratings: { p00001: 84 } });
    const next = applyAllSuggestions(doc);
    expect(next.ratings).toEqual({ p00002: 90, p00001: 84, p00003: 80 });
    expect(applyAllSuggestions(next)).toBe(next);
    expect(suggestionsTaken(next)).toBe(2);
  });
});

describe('rankingBlockers and outOfOrder', () => {
  it('counts unranked and unrated players', () => {
    expect(rankingBlockers(rankingDoc(), rankName)).toEqual(["6 players aren't ranked yet"]);
    expect(rankingBlockers(take(rankingDoc(), 'p00002'), rankName)).toEqual(["5 players aren't ranked yet", '1 player still needs a rating']);
    const five = rankingDoc({ order: ALL.slice(0, 5) });
    expect(rankingBlockers(five, rankName)).toEqual(["1 player isn't ranked yet", '5 players still need a rating']);
  });

  it('flags a rating higher than the lowest one ranked above it, skipping unrated rows', () => {
    const doc = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00001: 86, p00003: 80 } });
    expect(rankingBlockers(doc, rankName)).toContain('#2 Ada Stone (86) is rated above #1 Ben Cole (85)');
    expect([...outOfOrder(doc)]).toEqual(['p00001']);
    const gap = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00003: 90 } });
    expect(rankingBlockers(gap, rankName)).toContain('#3 Cal Reyes (90) is rated above #1 Ben Cole (85)');
    const both = rankingDoc({ order: ['p00002', 'p00001', 'p00003'], ratings: { p00002: 85, p00001: 90, p00003: 88 } });
    expect([...outOfOrder(both)]).toEqual(['p00001', 'p00003']);
  });

  it('is empty once everyone is ranked and rated in order (ties allowed), and the result can be locked', () => {
    const doc = rankingDoc({ order: ALL, ratings: { p00002: 85, p00001: 85, p00003: 80, p00006: 75, p00004: 70, p00005: 65 } });
    expect(rankingBlockers(doc, rankName)).toEqual([]);
    expect(outOfOrder(doc).size).toBe(0);
    expect(RankingFile.safeParse({ ...doc, locked: true }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/rank/ranking.test.ts`
Expected: FAIL: `./ranking` doesn't exist.

- [ ] **Step 4: Implement**

Create `web/engine/rank/ranking.ts`:

```ts
import type { RankingFile, RankingRow } from '../shared/types';

/** The display name for a player id. */
export type NameOf = (playerId: string) => string;

const MIN_RATING = 1;
const MAX_RATING = 99;

const tieBreak = (name: NameOf) => (a: RankingRow, b: RankingRow) =>
  name(a.playerId).localeCompare(name(b.playerId)) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);

/**
 * The rows not ranked yet, in last season's order: players with a previous rating (high to low), then the
 * "New" group by the other league's rating (high to low, none last). Ties break on name, then id.
 */
export function leftRows(doc: RankingFile, name: NameOf): RankingRow[] {
  const ranked = new Set(doc.order);
  const left = doc.rows.filter(r => !ranked.has(r.playerId));
  const tie = tieBreak(name);
  const known = left.filter(r => r.prevRating !== null).sort((a, b) => b.prevRating! - a.prevRating! || tie(a, b));
  const fresh = left.filter(r => r.prevRating === null).sort((a, b) => (b.otherRating ?? -1) - (a.otherRating ?? -1) || tie(a, b));
  return [...known, ...fresh];
}

/** The ranked rows, best first. */
export function rankedRows(doc: RankingFile): RankingRow[] {
  const byId = new Map(doc.rows.map(r => [r.playerId, r]));
  return doc.order.map(id => byId.get(id)!);
}

/** Ranks the player next. Unknown or already-ranked players, and locked files, leave the doc unchanged. */
export function take(doc: RankingFile, playerId: string): RankingFile {
  if (doc.locked || doc.order.includes(playerId) || !doc.rows.some(r => r.playerId === playerId)) return doc;
  return { ...doc, order: [...doc.order, playerId] };
}

/** Returns a ranked player to the left column. Their entered rating stays in `ratings`. */
export function sendBack(doc: RankingFile, playerId: string): RankingFile {
  if (doc.locked || !doc.order.includes(playerId)) return doc;
  return { ...doc, order: doc.order.filter(id => id !== playerId) };
}

/** Ranks everyone left, in `leftRows` order. */
export function takeRest(doc: RankingFile, name: NameOf): RankingFile {
  if (doc.locked) return doc;
  const rest = leftRows(doc, name);
  return rest.length ? { ...doc, order: [...doc.order, ...rest.map(r => r.playerId)] } : doc;
}

/** The suggested rating for rank k (1-based): the rating that held rank k last season. */
export function suggestion(doc: RankingFile, k: number): number | null {
  return doc.curve[k - 1] ?? null;
}

/** Sets a rating (a whole number from 1 to 99) or clears it (null). Anything else leaves the doc unchanged. */
export function setRating(doc: RankingFile, playerId: string, value: number | null): RankingFile {
  if (doc.locked || !doc.rows.some(r => r.playerId === playerId)) return doc;
  if (value === null) {
    if (doc.ratings[playerId] === undefined) return doc;
    const { [playerId]: _cleared, ...rest } = doc.ratings;
    return { ...doc, ratings: rest };
  }
  if (!Number.isInteger(value) || value < MIN_RATING || value > MAX_RATING || doc.ratings[playerId] === value) return doc;
  return { ...doc, ratings: { ...doc.ratings, [playerId]: value } };
}

/** Gives every ranked player without a rating their rank's suggestion. Never overwrites a typed rating. */
export function applyAllSuggestions(doc: RankingFile): RankingFile {
  if (doc.locked) return doc;
  const ratings = { ...doc.ratings };
  let changed = false;
  doc.order.forEach((id, i) => {
    const s = suggestion(doc, i + 1);
    if (ratings[id] === undefined && s !== null) {
      ratings[id] = s;
      changed = true;
    }
  });
  return changed ? { ...doc, ratings } : doc;
}

export interface RankedRating { id: string; rank: number; rating: number }

/** Each rated player whose rating is higher than the lowest rating ranked above them, paired with that player. */
export function outOfOrderPairs(doc: RankingFile): { above: RankedRating; below: RankedRating }[] {
  const out: { above: RankedRating; below: RankedRating }[] = [];
  let lowest: RankedRating | null = null;
  doc.order.forEach((id, i) => {
    const rating = doc.ratings[id];
    if (rating === undefined) return;
    const cur = { id, rank: i + 1, rating };
    if (lowest && rating > lowest.rating) out.push({ above: lowest, below: cur });
    else lowest = cur;
  });
  return out;
}

/** The ids to flag on screen: players rated above someone ranked higher. */
export function outOfOrder(doc: RankingFile): Set<string> {
  return new Set(outOfOrderPairs(doc).map(p => p.below.id));
}

/** Why the ranking can't be finished yet; empty when it can. */
export function rankingBlockers(doc: RankingFile, name: NameOf): string[] {
  const out: string[] = [];
  const left = doc.rows.length - doc.order.length;
  if (left) out.push(left === 1 ? "1 player isn't ranked yet" : `${left} players aren't ranked yet`);
  const unrated = doc.order.filter(id => doc.ratings[id] === undefined).length;
  if (unrated) out.push(unrated === 1 ? '1 player still needs a rating' : `${unrated} players still need a rating`);
  for (const { above, below } of outOfOrderPairs(doc)) {
    out.push(`#${below.rank} ${name(below.id)} (${below.rating}) is rated above #${above.rank} ${name(above.id)} (${above.rating})`);
  }
  return out;
}

/** How many ranked players have exactly their rank's suggestion. */
export function suggestionsTaken(doc: RankingFile): number {
  return doc.order.filter((id, i) => doc.ratings[id] !== undefined && doc.ratings[id] === suggestion(doc, i + 1)).length;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/rank/ranking.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 7: Commit**

```bash
git add web/engine/rank
git commit -m "feat: click-to-rank engine (take, send back, take the rest, suggestions, blockers)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The ranking table screen

**Files:**
- Create: `web/app/rank/RankingTable.tsx`
- Create: `web/app/rank/rank.css`
- Test: `web/app/rank/RankingTable.test.tsx`

**Interfaces:**
- **Consumes:** everything in `web/engine/rank/ranking.ts` (Task 2); `rankingDoc`, `rankName` from `web/engine/rank/testFixtures.ts`; `RatingInput` from `web/app/components/RatingInput.tsx` (its box is labelled `New rating for <name>` and saves on blur or Enter); `POSITIONS` from `web/engine/roster/rules.ts`.
- **Produces:** `RankingTable(props: RankingTableProps)` with

```ts
export interface RankingTableProps {
  doc: RankingFile;
  name: NameOf;
  /** How the Team column shows a row's team (null = no team, e.g. D2 Reserves). */
  teamLabel: (team: string | null) => string;
  /** Short name of the league `otherRating` comes from, e.g. "FBA"; shown as "FBA 71" in the Prev column of new players. */
  otherLabel: string;
  /** Applies a change to the latest copy of the doc (e.g. useAutosaveDoc's update). */
  onChange: (change: (current: RankingFile) => RankingFile) => void;
  /** Blockers from the caller (e.g. pool membership), listed after the ranking's own. */
  extraBlockers: string[];
  finishLabel: string;
  onFinish: () => void;
  /** True while a save is running: Finish is disabled. */
  busy: boolean;
}
```

- Accessible names the tests (and Task 4) use: tables `Last season's order` and `New ranking`; buttons `Rank <name> next`, `Send <name> back`, `Take the rest in order`, `Use all suggestions`, `Use suggested <n> for <name>` (text `suggested <n>`), the position chips `All`, `PG` … `C`, and the Finish button named by `finishLabel`. An out-of-order row shows `⚠` with the title `Rated above a player ranked higher`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/rank/RankingTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankingDoc, rankName } from '../../engine/rank/testFixtures';
import type { RankingFile } from '../../engine/shared/types';
import { RankingTable } from './RankingTable';

afterEach(cleanup);

const ALL = ['p00002', 'p00001', 'p00003', 'p00006', 'p00004', 'p00005'];
const IN_ORDER = { p00002: 85, p00001: 85, p00003: 80, p00006: 75, p00004: 70, p00005: 65 };

function Harness({ initial, extra = [], onFinish = () => {} }: { initial: RankingFile; extra?: string[]; onFinish?: () => void }) {
  const [doc, setDoc] = useState(initial);
  return (
    <RankingTable
      doc={doc} name={rankName} teamLabel={t => t ?? 'Reserves'} otherLabel="FBA" onChange={change => setDoc(change)}
      extraBlockers={extra} finishLabel="Finish ratings" onFinish={onFinish} busy={false}
    />
  );
}

const leftNames = () => within(screen.getByRole('table', { name: "Last season's order" })).queryAllByRole('button').map(b => b.textContent);
const rightNames = () => within(screen.getByRole('table', { name: 'New ranking' })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[1].textContent);
const box = (name: string) => screen.getByLabelText(`New rating for ${name}`) as HTMLInputElement;

describe('RankingTable', () => {
  it("lists last season's order with a New divider, and ranks a clicked player next", () => {
    render(<Harness initial={rankingDoc()} />);
    expect(leftNames()).toEqual(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
    const left = screen.getByRole('table', { name: "Last season's order" });
    expect(within(left).getByText('New')).toBeTruthy();
    expect(within(left).getByText('FBA 75')).toBeTruthy();
    expect(within(left).getAllByText('300 pts')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Ada Stone next' }));
    expect(rightNames()).toEqual(['Ada Stone']);
    expect(leftNames()).toEqual(['Ben Cole', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
  });

  it('sends a ranked player back to their place', () => {
    render(<Harness initial={rankingDoc()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Ada Stone next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send Ada Stone back' }));
    expect(rightNames()).toEqual([]);
    expect(leftNames()[1]).toBe('Ada Stone');
  });

  it('takes the rest in order', () => {
    render(<Harness initial={rankingDoc()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the rest in order' }));
    expect(rightNames()).toEqual(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe', 'Dev Hart', 'Eli Park']);
    expect(leftNames()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Take the rest in order' })).toBeNull();
  });

  it('shows empty rating boxes, with a separate suggestion chip, only once everyone is ranked', () => {
    render(<Harness initial={rankingDoc({ order: ['p00002'] })} />);
    expect(screen.queryByLabelText('New rating for Ben Cole')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take the rest in order' }));
    expect(box('Ben Cole').value).toBe('');
    const chip = screen.getByRole('button', { name: 'Use suggested 90 for Ben Cole' });
    expect(chip.textContent).toBe('suggested 90');
    expect(screen.queryByRole('button', { name: /^Use suggested \d+ for Finn Lowe$/ })).toBeNull();
    fireEvent.click(chip);
    expect(box('Ben Cole').value).toBe('90');
    fireEvent.click(screen.getByRole('button', { name: 'Send Eli Park back' }));
    expect(screen.queryByLabelText('New rating for Ben Cole')).toBeNull();
  });

  it('uses all suggestions without overwriting a typed rating', () => {
    render(<Harness initial={rankingDoc({ order: ALL })} />);
    fireEvent.change(box('Ada Stone'), { target: { value: '84' } });
    fireEvent.blur(box('Ada Stone'));
    fireEvent.click(screen.getByRole('button', { name: 'Use all suggestions' }));
    expect(['Ben Cole', 'Ada Stone', 'Cal Reyes', 'Finn Lowe'].map(n => box(n).value)).toEqual(['90', '84', '80', '']);
  });

  it('flags out-of-order rows and keeps Finish disabled until everyone is rated in order', () => {
    const onFinish = vi.fn();
    render(<Harness initial={rankingDoc({ order: ALL, ratings: { ...IN_ORDER, p00001: 86 } })} onFinish={onFinish} />);
    expect(screen.getByText('#2 Ada Stone (86) is rated above #1 Ben Cole (85)')).toBeTruthy();
    expect(screen.getByTitle('Rated above a player ranked higher')).toBeTruthy();
    const finish = screen.getByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    fireEvent.change(box('Ada Stone'), { target: { value: '84' } });
    fireEvent.blur(box('Ada Stone'));
    expect(screen.queryByTitle('Rated above a player ranked higher')).toBeNull();
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("lists the caller's blockers and keeps Finish disabled for them", () => {
    render(<Harness initial={rankingDoc({ order: ALL, ratings: IN_ORDER })} extra={['Kris Dyer is no longer in the D2 pool']} />);
    expect(screen.getByText('Kris Dyer is no longer in the D2 pool')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Finish ratings' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('filters both columns by position, while taking still appends to the one ranking', () => {
    render(<Harness initial={rankingDoc({ order: ['p00002'] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(leftNames()).toEqual(['Finn Lowe']);
    expect(rightNames()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Finn Lowe next' }));
    fireEvent.click(screen.getByRole('button', { name: 'SG' }));
    expect(leftNames()).toEqual([]);
    expect(rightNames()).toEqual(['Ben Cole']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rightNames()).toEqual(['Ben Cole', 'Finn Lowe']);
  });

  it('is read-only once locked', () => {
    render(<Harness initial={rankingDoc({ locked: true, order: ALL, ratings: IN_ORDER })} />);
    for (const name of ['Take the rest in order', 'Use all suggestions', 'Finish ratings']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Send .* back$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use suggested/ })).toBeNull();
    expect(box('Ben Cole').disabled).toBe(true);
    expect(box('Ben Cole').value).toBe('85');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/rank/RankingTable.test.tsx`
Expected: FAIL: `./RankingTable` doesn't exist.

- [ ] **Step 3: Implement**

Create `web/app/rank/rank.css`:

```css
.rank-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 760px) { .rank-cols { grid-template-columns: 1fr; } }
.rank-col h3 { margin: 0; }
.rank-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rank-table th, .rank-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: left; }
.rank-table .n { text-align: right; }
.rank-table tr.rank-take { cursor: pointer; }
.rank-table tr.rank-take:hover { background: var(--surface-2); }
.rank-name { background: none; border: 0; padding: 0; color: inherit; font: inherit; font-weight: 700; cursor: pointer; text-align: left; }
.rank-divider td { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); background: var(--surface-2); }
.rank-table tr.out-of-order { background: var(--accent-soft); }
.rank-flag { color: var(--accent); font-weight: 700; margin-left: 4px; }
.rank-rating { white-space: nowrap; }
.suggest { margin-left: 6px; border: 1px dashed var(--border); background: transparent; color: var(--muted); border-radius: 999px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
.suggest:hover { color: var(--text); border-color: var(--text); }
```

Create `web/app/rank/RankingTable.tsx`:

```tsx
import { Fragment, useState } from 'react';
import {
  applyAllSuggestions, leftRows, outOfOrder, rankedRows, rankingBlockers, sendBack, setRating, suggestion, take, takeRest, type NameOf,
} from '../../engine/rank/ranking';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RankingFile, RankingRow } from '../../engine/shared/types';
import { RatingInput } from '../components/RatingInput';
import '../pages/roster.css';
import './rank.css';

type Filter = 'ALL' | Position;

export interface RankingTableProps {
  doc: RankingFile;
  name: NameOf;
  /** How the Team column shows a row's team (null = no team, e.g. D2 Reserves). */
  teamLabel: (team: string | null) => string;
  /** Short name of the league `otherRating` comes from, e.g. "FBA"; shown as "FBA 71" in the Prev column of new players. */
  otherLabel: string;
  /** Applies a change to the latest copy of the doc (e.g. useAutosaveDoc's update). */
  onChange: (change: (current: RankingFile) => RankingFile) => void;
  /** Blockers from the caller (e.g. pool membership), listed after the ranking's own. */
  extraBlockers: string[];
  finishLabel: string;
  onFinish: () => void;
  /** True while a save is running: Finish is disabled. */
  busy: boolean;
}

/**
 * The click-to-rank screen. Left: players not ranked yet, in last season's order (a "New" divider above players new to
 * the league). Right: the new ranking. Rating boxes appear once everyone is ranked; each starts empty, with the
 * suggestion as a separate chip. The position filter is for reading only.
 */
export function RankingTable({ doc, name, teamLabel, otherLabel, onChange, extraBlockers, finishLabel, onFinish, busy }: RankingTableProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const locked = doc.locked;
  const shown = (r: RankingRow) => filter === 'ALL' || r.position === filter;
  const left = leftRows(doc, name);
  const allPlaced = left.length === 0;
  const flagged = outOfOrder(doc);
  const blockers = [...rankingBlockers(doc, name), ...extraBlockers];
  const prev = (r: RankingRow) => r.prevRating ?? (r.otherRating !== null ? <span className="muted">{otherLabel} {r.otherRating}</span> : '—');
  let dividerShown = false;

  return (
    <div className="rank">
      <div className="chips" role="group" aria-label="Position filter">
        {(['ALL', ...POSITIONS] as Filter[]).map(f => (
          <button key={f} type="button" className={`chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'All' : f}
          </button>
        ))}
      </div>
      <div className="rank-cols">
        <div className="rank-col">
          <div className="toolbar">
            <h3>Last season's order · {left.length}</h3>
            {!locked && left.length > 0 && (
              <button type="button" className="btn" onClick={() => onChange(cur => takeRest(cur, name))}>Take the rest in order</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="rank-table" aria-label="Last season's order">
              <thead>
                <tr><th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th><th>Stat</th></tr>
              </thead>
              <tbody>
                {left.map((r, i) => {
                  if (!shown(r)) return null;
                  const divider = r.prevRating === null && !dividerShown;
                  if (divider) dividerShown = true;
                  return (
                    <Fragment key={r.playerId}>
                      {divider && <tr className="rank-divider"><td colSpan={7}>New</td></tr>}
                      <tr className={locked ? undefined : 'rank-take'} onClick={locked ? undefined : () => onChange(cur => take(cur, r.playerId))}>
                        <td className="n">{i + 1}</td>
                        <td>
                          <button type="button" className="rank-name" disabled={locked} aria-label={`Rank ${name(r.playerId)} next`}>{name(r.playerId)}</button>
                        </td>
                        <td>{r.position}</td>
                        <td className="n">{r.age ?? '—'}</td>
                        <td>{teamLabel(r.team)}</td>
                        <td className="n">{prev(r)}</td>
                        <td>{r.stat ?? ''}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rank-col">
          <div className="toolbar">
            <h3>New ranking · {doc.order.length}</h3>
            {!locked && allPlaced && (
              <button type="button" className="btn" onClick={() => onChange(applyAllSuggestions)}>Use all suggestions</button>
            )}
          </div>
          {!locked && !allPlaced && doc.order.length > 0 && <p className="muted">Rating boxes appear once every player is ranked.</p>}
          <div className="table-wrap">
            <table className="rank-table" aria-label="New ranking">
              <thead>
                <tr>
                  <th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th>Team</th><th className="n">Prev</th>
                  {allPlaced && <th>Rating</th>}
                  <th><span className="muted">Back</span></th>
                </tr>
              </thead>
              <tbody>
                {rankedRows(doc).map((r, i) => {
                  if (!shown(r)) return null;
                  const s = suggestion(doc, i + 1);
                  const bad = flagged.has(r.playerId);
                  return (
                    <tr key={r.playerId} className={bad ? 'out-of-order' : undefined}>
                      <td className="n">{i + 1}</td>
                      <td>{name(r.playerId)}{bad && <span className="rank-flag" title="Rated above a player ranked higher">⚠</span>}</td>
                      <td>{r.position}</td>
                      <td className="n">{r.age ?? '—'}</td>
                      <td>{teamLabel(r.team)}</td>
                      <td className="n">{prev(r)}</td>
                      {allPlaced && (
                        <td className="rank-rating">
                          <RatingInput
                            value={doc.ratings[r.playerId] ?? null} name={name(r.playerId)} disabled={locked} allowBlank
                            onSave={v => onChange(cur => setRating(cur, r.playerId, v))}
                          />
                          {s !== null && !locked && (
                            <button
                              type="button" className="suggest" aria-label={`Use suggested ${s} for ${name(r.playerId)}`}
                              onClick={() => onChange(cur => setRating(cur, r.playerId, s))}
                            >
                              suggested {s}
                            </button>
                          )}
                        </td>
                      )}
                      <td>
                        {!locked && (
                          <button type="button" className="btn" aria-label={`Send ${name(r.playerId)} back`} onClick={() => onChange(cur => sendBack(cur, r.playerId))}>↩</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {!locked && blockers.length > 0 && <ul className="problems">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
      {!locked && (
        <div className="toolbar">
          <button type="button" className="btn primary" disabled={busy || blockers.length > 0} onClick={onFinish}>{finishLabel}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/rank/RankingTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 6: Commit**

```bash
git add web/app/rank
git commit -m "feat: two-column click-to-rank table with suggestion chips and blockers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The D2 ratings reset on the ranking tool

**Files:**
- Modify: `web/engine/shared/types.ts` (remove `RatingBreakdown`, `D2RatingRow`, `D2RatingsFile`)
- Modify: `web/engine/shared/schemaRegistry.ts`, `web/engine/shared/schemaRegistry.test.ts`, `web/engine/shared/types.test.ts`
- Modify: `web/engine/d2/state.ts`, `web/engine/d2/ratings.ts`, `web/engine/d2/testFixtures.ts`
- Modify: `web/engine/season/nextSeason.ts`, `web/app/pages/NextSeasonPage.tsx` (type only)
- Modify: `web/app/d2/useD2State.ts`, `web/app/d2/testDocs.ts`
- Modify: `web/app/pages/D2RatingsPage.tsx`
- Test: `web/engine/d2/ratings.test.ts` (rewritten), `web/app/pages/D2RatingsPage.test.tsx` (rewritten)

**Interfaces:**
- **Consumes:** `RankingFile`, `RankingRow`, `ReservePlayer.fbaRating` (Task 1); `rankingBlockers`, `suggestionsTaken`, `takeRest`, `applyAllSuggestions`, `setRating` (Task 2); `RankingTable` (Task 3).
- **Produces:**
  - `D2State.ratings: RankingFile | null` and new `D2State.prevRatings: RankingFile | null` (last season's `fbad2/S<n-1>/ratings.json`);
  - `buildRankingRows(state: D2State): RankingRow[]`;
  - `d2Curve(prevRatings: RankingFile | null, rows: RankingRow[]): number[]`;
  - `startRatings(state: D2State): D2Result` (no Rng any more);
  - `membershipBlockers(state: D2State): string[]`;
  - `ratingsBlockers(state: D2State): string[]`, `finishRatings(state: D2State, ctx: MoveContext): D2Result` (same names, new behaviour);
  - `parseRatingInput` and `MAX_RATING` stay (the rating box uses them);
  - removed: `ageAdjustment`, `clampSuggested`, `performanceScores`, `buildRatings`, `setRating` (the D2 one), `MIN_SUGGESTED`.
- The fixture `d2RatedState()` keeps its documented ratings, so the pool and draft tests don't change.

- [ ] **Step 1: Rewrite the engine tests**

Replace `web/engine/d2/ratings.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { applyAllSuggestions, setRating, takeRest } from '../rank/ranking';
import { RankingFile } from '../shared/types';
import { buildRankingRows, d2Curve, finishRatings, membershipBlockers, parseRatingInput, ratingsBlockers, startRatings } from './ratings';
import { d2Name, type D2Result, type D2State } from './state';
import { d2BaseState, d2RatedState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: D2Result) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const started = (s: D2State = d2BaseState()): D2State => ok(startRatings(s)).state;
/** Everyone ranked in last season's order; the 8 with a suggestion take it; the 5 new players are rated 66, 64, 62, 60, 58. */
const ranked = (s: D2State): D2State => {
  let doc = applyAllSuggestions(takeRest(s.ratings!, id => d2Name(s, id)));
  for (const [id, v] of [['p00041', 66], ['p00043', 64], ['p00044', 62], ['p00040', 60], ['p00042', 58]] as const) doc = setRating(doc, id, v);
  return { ...s, ratings: doc };
};
const prevFile = (ratings: Record<string, number>, locked = true): RankingFile => ({
  league: 'fbad2', season: 78, kind: 'd2-reset', locked,
  rows: Object.keys(ratings).map(playerId => ({ playerId, position: 'PG', age: 25, team: 'AMS', prevRating: 70, otherRating: null, stat: null })),
  order: Object.keys(ratings), ratings, curve: [],
});

describe('buildRankingRows', () => {
  it("lists every pool member with the current D2 rating, last season's points and an FBA rating", () => {
    const rows = buildRankingRows(d2BaseState());
    expect(rows.map(r => [r.playerId, r.team, r.prevRating, r.otherRating, r.stat])).toEqual([
      ['p00020', 'AMS', 75, null, '300 pts'], ['p00021', 'AMS', 72, null, '300 pts'], ['p00022', 'AMS', 75, null, '300 pts'], ['p00023', 'AMS', 94, null, '700 pts'],
      ['p00025', 'BER', 70, null, '300 pts'], ['p00026', 'BER', 80, null, '300 pts'], ['p00027', 'BER', 68, null, '300 pts'], ['p00028', 'BER', 85, null, '300 pts'],
      ['p00040', null, null, null, null], ['p00041', null, null, 71, null], ['p00042', null, null, null, null],
      ['p00043', null, null, null, null], ['p00044', null, null, null, null],
    ]);
    expect(rows[0]).toMatchObject({ position: 'PG', age: 30 });
  });

  it('has no stat without last season', () => {
    expect(buildRankingRows({ ...d2BaseState(), prevD2: null }).every(r => r.stat === null)).toBe(true);
  });
});

describe('d2Curve', () => {
  it("uses last season's finished ratings, high to low", () => {
    expect(d2Curve(prevFile({ p00001: 80, p00002: 91, p00003: 77 }), [])).toEqual([91, 80, 77]);
  });

  it("falls back to these rows' current ratings when last season has no finished reset", () => {
    const rows = buildRankingRows(d2BaseState());
    expect(d2Curve(null, rows)).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
    expect(d2Curve(prevFile({ p00001: 99 }, false), rows)).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
  });
});

describe('startRatings', () => {
  it('builds an empty ranking with the curve once free agency is closed', () => {
    const r = ok(startRatings(d2BaseState()));
    expect(r.changed).toEqual(['ratings']);
    expect(r.label).toBe('Start D2 ratings reset');
    expect(r.state.ratings).toMatchObject({ league: 'fbad2', season: 79, kind: 'd2-reset', locked: false, order: [], ratings: {} });
    expect(r.state.ratings!.rows).toHaveLength(13);
    expect(r.state.ratings!.curve).toEqual([94, 85, 80, 75, 75, 72, 70, 68]);
    expect(RankingFile.safeParse(r.state.ratings).success).toBe(true);
    const withPrev = ok(startRatings({ ...d2BaseState(), prevRatings: prevFile({ p00001: 88, p00002: 90 }) }));
    expect(withPrev.state.ratings!.curve).toEqual([90, 88]);
  });

  it('refuses before free agency closes, or twice', () => {
    expect(startRatings({ ...d2BaseState(), freeAgencyClosed: false })).toEqual({ ok: false, problems: ['Close free agency first'] });
    expect(startRatings(started())).toEqual({ ok: false, problems: ['The ratings reset has already started'] });
  });
});

describe('ratingsBlockers', () => {
  it('asks for a full ranking, then a rating for everyone, then the right order', () => {
    const s = started();
    expect(ratingsBlockers(s)).toEqual(["13 players aren't ranked yet"]);
    expect(ratingsBlockers({ ...s, ratings: takeRest(s.ratings!, id => d2Name(s, id)) })).toEqual(['13 players still need a rating']);
    const r = ranked(s);
    expect(ratingsBlockers(r)).toEqual([]);
    expect(ratingsBlockers({ ...r, ratings: setRating(r.ratings!, 'p00041', 99) })).toEqual(['#9 Kyron Smart (99) is rated above #8 Adrian Grant (68)']);
  });

  it('flags players missing from, or no longer in, the list', () => {
    const s = started();
    const moved = { ...s, reserves: { ...s.reserves, players: s.reserves.players.filter(p => p.playerId !== 'p00043') } };
    expect(membershipBlockers(moved)).toEqual(['Adrian Napoletani is no longer in the D2 pool']);
    const missing = { ...s, ratings: { ...s.ratings!, rows: s.ratings!.rows.filter(r => r.playerId !== 'p00044') } };
    expect(membershipBlockers(missing)).toEqual(["Brycen Holcomb isn't in the ratings list"]);
    expect(ratingsBlockers(ranked(moved))).toEqual(['Adrian Napoletani is no longer in the D2 pool']);
  });
});

describe('finishRatings', () => {
  it('is refused while blocked', () => {
    expect(finishRatings(started(), ctx)).toEqual({ ok: false, problems: ["13 players aren't ranked yet"] });
  });

  it('writes the new ratings onto rosters and Reserves, locks, logs, and marks the calendar', () => {
    const r = ok(finishRatings(ranked(started()), ctx));
    expect(r.label).toBe('Finish D2 ratings');
    expect(r.changed).toEqual(['d2', 'reserves', 'ratings', 'd2Tx', 'calendar']);
    expect(r.state.d2.teams.AMS.map(e => e.rating)).toEqual([75, 72, 75, 94, null]);
    expect(r.state.d2.teams.BER.map(e => e.rating)).toEqual([70, null, 80, 68, 85]);
    expect(r.state.reserves.players.map(p => p.rating)).toEqual([60, 66, 58, 64, 62]);
    expect(r.state.reserves.players[1]).toMatchObject({ fromFba: true, fbaRating: 71 });
    expect(r.state.ratings!.locked).toBe(true);
    expect(RankingFile.safeParse(r.state.ratings).success).toBe(true);
    expect(r.state.d2Tx.entries.at(-1)).toMatchObject({ type: 'd2-ratings', teams: [], lines: ['D2 ratings reset: 13 players ranked, 8 took the suggestion'] });
    expect(r.state.calendar.steps.find(x => x.id === 'fbad2-ratings-reset')!.done).toBe(true);
    expect(ratingsBlockers(r.state)).toEqual(['D2 ratings are already finished']);
  });
});

describe('parseRatingInput', () => {
  it('accepts blanks and whole numbers from 1 to 99', () => {
    expect(parseRatingInput('')).toEqual({ ok: true, value: null });
    expect(parseRatingInput(' 78 ')).toEqual({ ok: true, value: 78 });
    for (const bad of ['0', '100', '7.5', 'abc', '-3']) expect(parseRatingInput(bad)).toEqual({ ok: false, problem: 'Enter a whole number from 1 to 99' });
  });
});

describe('d2RatedState fixture', () => {
  it('has the documented ratings', () => {
    const s = d2RatedState();
    expect(s.d2.teams.AMS.map(e => e.rating)).toEqual([73, 72, 75, 97, null]);
    expect(s.d2.teams.BER.map(e => e.rating)).toEqual([72, null, 80, 66, 85]);
    expect(s.reserves.players.map(p => p.rating)).toEqual([78, 74, 70, 60, 65]);
    expect(s.ratings!.locked).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/d2/ratings.test.ts`
Expected: FAIL: `buildRankingRows`, `d2Curve` and `membershipBlockers` aren't exported.

- [ ] **Step 3: Replace the schema and the D2 state**

In `web/engine/shared/types.ts`, delete `RatingBreakdown`, `D2RatingRow` and `D2RatingsFile` (with their type lines). Keep `const d2Rating = int.min(1).max(99);` where it is.

In `web/engine/shared/schemaRegistry.ts`, remove `D2RatingsFile` from the import, add `RankingFile`, and change the ratings rule to:

```ts
  [new RegExp(`^leagues/fbad2/${S}/ratings\\.json$`), RankingFile],
```

In `web/engine/shared/schemaRegistry.test.ts`, replace `D2RatingsFile` with `RankingFile` in the import and in `expect(schemaForPath('leagues/fbad2/S79/ratings.json')).toBe(RankingFile);`.

In `web/engine/shared/types.test.ts`, remove `D2RatingsFile` from the import and delete the test `it('accepts a ratings file and rejects out-of-range ratings', …)` (with its `row` constant) from `describe('D2 cycle schemas', …)`; the `RankingFile` tests from Task 1 replace it.

In `web/engine/d2/state.ts`, change the import to use `RankingFile` instead of `D2RatingsFile`, and change the `ratings` field and add `prevRatings`:

```ts
  /** This season's D2 reset ranking (`fbad2/S<n>/ratings.json`). */
  ratings: RankingFile | null;
  /** Last season's D2 reset ranking (read-only; its ratings are the suggestion curve). Null if missing. */
  prevRatings: RankingFile | null;
```

In `web/engine/season/nextSeason.ts` and `web/app/pages/NextSeasonPage.tsx`, replace every `D2RatingsFile` with `RankingFile` (import and type uses).

- [ ] **Step 4: Rewrite the engine**

Replace `web/engine/d2/ratings.ts` with:

```ts
import { rankingBlockers, suggestionsTaken } from '../rank/ranking';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import type { RankingFile, RankingRow } from '../shared/types';
import { d2Fail, d2Name, poolMembers, type D2Result, type D2State } from './state';

export const MAX_RATING = 99;

/** Parses a typed rating: blank → null, otherwise a whole number from 1 to 99. */
export function parseRatingInput(text: string): { ok: true; value: number | null } | { ok: false; problem: string } {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > MAX_RATING) return { ok: false, problem: 'Enter a whole number from 1 to 99' };
  return { ok: true, value: Number(t) };
}

/** One ranking row per D2 pool member (rosters in team order, then Reserves). */
export function buildRankingRows(state: D2State): RankingRow[] {
  const points = new Map<string, number>();
  for (const e of Object.values(state.prevD2?.teams ?? {}).flat()) {
    if (e.playerId) points.set(e.playerId, (points.get(e.playerId) ?? 0) + e.points);
  }
  const fbaRating = new Map(state.reserves.players.flatMap(p => (p.fbaRating === undefined ? [] : [[p.playerId, p.fbaRating] as const])));
  return poolMembers(state).map(m => ({
    playerId: m.playerId,
    position: m.position,
    age: m.age,
    team: m.team,
    prevRating: m.rating,
    otherRating: fbaRating.get(m.playerId) ?? null,
    stat: points.has(m.playerId) ? `${points.get(m.playerId)} pts` : null,
  }));
}

/** The suggestion ladder, high to low: last season's finished D2 reset ratings; without one, these rows' current D2 ratings. */
export function d2Curve(prevRatings: RankingFile | null, rows: RankingRow[]): number[] {
  const source = prevRatings?.locked
    ? Object.values(prevRatings.ratings)
    : rows.flatMap(r => (r.prevRating === null ? [] : [r.prevRating]));
  return source.map(v => Math.max(1, Math.min(MAX_RATING, v))).sort((a, b) => b - a);
}

export function startRatings(state: D2State): D2Result {
  if (!state.freeAgencyClosed) return d2Fail(['Close free agency first']);
  if (state.ratings) return d2Fail(['The ratings reset has already started']);
  const rows = buildRankingRows(state);
  const ratings: RankingFile = {
    league: 'fbad2', season: state.season, kind: 'd2-reset', locked: false, rows, order: [], ratings: {}, curve: d2Curve(state.prevRatings, rows),
  };
  return { ok: true, state: { ...state, ratings }, changed: ['ratings'], label: 'Start D2 ratings reset' };
}

/** The ranking must list exactly the D2 pool: nobody missing, nobody who has left it. */
export function membershipBlockers(state: D2State): string[] {
  if (!state.ratings) return [];
  const listed = new Set(state.ratings.rows.map(r => r.playerId));
  const members = poolMembers(state);
  const present = new Set(members.map(m => m.playerId));
  const out: string[] = [];
  for (const m of members) if (!listed.has(m.playerId)) out.push(`${d2Name(state, m.playerId)} isn't in the ratings list`);
  for (const r of state.ratings.rows) if (!present.has(r.playerId)) out.push(`${d2Name(state, r.playerId)} is no longer in the D2 pool`);
  return out;
}

export function ratingsBlockers(state: D2State): string[] {
  if (!state.ratings) return ['Start the ratings reset first'];
  if (state.ratings.locked) return ['D2 ratings are already finished'];
  return [...rankingBlockers(state.ratings, id => d2Name(state, id)), ...membershipBlockers(state)];
}

export function finishRatings(state: D2State, ctx: MoveContext): D2Result {
  const blockers = ratingsBlockers(state);
  if (blockers.length) return d2Fail(blockers);
  const ratings = state.ratings!;
  const next = new Map(Object.entries(ratings.ratings));
  const teams = Object.fromEntries(Object.entries(state.d2.teams).map(([t, entries]) => [
    t, entries.map(e => (e.playerId !== null && next.has(e.playerId) ? { ...e, rating: next.get(e.playerId)! } : e)),
  ]));
  const reserves = { ...state.reserves, players: state.reserves.players.map(p => ({ ...p, rating: next.get(p.playerId) ?? p.rating })) };
  const line = `D2 ratings reset: ${ratings.rows.length} players ranked, ${suggestionsTaken(ratings)} took the suggestion`;
  const d2Tx = appendTx(state.d2Tx, ctx, 'd2-ratings', [], [line]);
  return {
    ok: true,
    state: {
      ...state,
      d2: { ...state.d2, teams },
      reserves,
      ratings: { ...ratings, locked: true },
      d2Tx,
      calendar: markStepDone(state.calendar, 'fbad2-ratings-reset'),
    },
    changed: ['d2', 'reserves', 'ratings', 'd2Tx', 'calendar'],
    label: 'Finish D2 ratings',
  };
}
```

- [ ] **Step 5: Update the D2 fixtures**

In `web/engine/d2/testFixtures.ts`:
- Change the import from `./ratings` to `import { finishRatings, startRatings } from './ratings';` (the D2 `setRating` is gone). Keep the other imports.
- In `d2BaseState()`, give Kyron Smart his FBA rating and add `prevRatings: null` next to `ratings: null`:

```ts
        { playerId: 'p00041', position: 'SG', age: 23, rating: null, fromFba: true, fbaRating: 71 },
```

```ts
    ratings: null,
    prevRatings: null,
```

- In the `d2BaseState` doc comment, change the Kyron Smart line to `SG Kyron Smart (23, from FBA free agency, FBA rating 71)`.
- Replace `d2RatedState` and its doc comment with:

```ts
/** The finished D2 reset in d2RatedState: [player, new rating], best first. */
const RATED: [string, number][] = [
  ['p00023', 97], ['p00028', 85], ['p00026', 80], ['p00040', 78], ['p00022', 75], ['p00041', 74], ['p00020', 73],
  ['p00021', 72], ['p00025', 72], ['p00042', 70], ['p00027', 66], ['p00044', 65], ['p00043', 60],
];

/**
 * d2BaseState (no performance data) with the ratings reset finished, ranked and rated as RATED:
 * Reserves PG Kris Dyer 78, SG Kyron Smart 74, PF Myron Mason 70, SG Adrian Napoletani 60, C Brycen Holcomb 65.
 * Roster ratings: AMS PG 73, SG 72, SF 75, PF 97 · BER PG 72, SF 80, PF 66, C 85.
 */
export function d2RatedState(): D2State {
  const started = startRatings({ ...d2BaseState(), prevD2: null });
  if (!started.ok) throw new Error(started.problems.join('; '));
  const ratings = { ...started.state.ratings!, order: RATED.map(([id]) => id), ratings: Object.fromEntries(RATED) };
  const finished = finishRatings({ ...started.state, ratings }, { batchId: 'fixture' });
  if (!finished.ok) throw new Error(finished.problems.join('; '));
  return finished.state;
}
```

- [ ] **Step 6: Run the engine tests**

Run: `npx vitest run engine/d2 engine/shared engine/season/nextSeason.test.ts`
Expected: PASS (the pool and draft tests are unchanged and still pass on the same fixture ratings).

- [ ] **Step 7: Rewrite the page tests**

Replace `web/app/pages/D2RatingsPage.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRatings } from '../../engine/d2/ratings';
import { d2Name, type D2State } from '../../engine/d2/state';
import { d2BaseState, d2RatedState } from '../../engine/d2/testFixtures';
import { applyAllSuggestions, setRating, takeRest } from '../../engine/rank/ranking';
import type { RankingFile } from '../../engine/shared/types';
import { docsFor, stubApi } from '../d2/testDocs';
import { D2RatingsPage } from './D2RatingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(<MemoryRouter><D2RatingsPage /></MemoryRouter>);

const started = (): D2State => {
  const r = startRatings({ ...d2BaseState(), prevD2: null });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
/** Everyone ranked in last season's order and rated in order, so the reset can be finished. */
const complete = (s: D2State): D2State => {
  let doc = applyAllSuggestions(takeRest(s.ratings!, id => d2Name(s, id)));
  for (const [id, v] of [['p00041', 66], ['p00043', 64], ['p00044', 62], ['p00040', 60], ['p00042', 58]] as const) doc = setRating(doc, id, v);
  return { ...s, ratings: doc };
};

describe('D2RatingsPage', () => {
  it('asks to close free agency first', async () => {
    stubApi(docsFor({ ...d2BaseState(), freeAgencyClosed: false }));
    renderPage();
    expect(await screen.findByText(/Close free agency first/)).toBeTruthy();
  });

  it('starts the reset as one batch that creates ratings.json', async () => {
    const log = stubApi(docsFor(d2BaseState()));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start ratings reset' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Start D2 ratings reset');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([['leagues/fbad2/S79/ratings.json', null]]);
    expect((log.batches[0].writes[0].doc as RankingFile).kind).toBe('d2-reset');
  });

  it("lists last season's order with the FBA free agent first among new players, and autosaves a click", async () => {
    const log = stubApi(docsFor(started()));
    renderPage();
    await screen.findByRole('button', { name: 'Rank Maddox Dean next' });
    expect(screen.getAllByRole('button', { name: /^Rank .* next$/ }).map(b => b.textContent)).toEqual([
      'Maddox Dean', 'Xavier Booker', 'Jalil Grant', 'Ben Montgomery', 'Jamal Edwards', 'Brooks Burrows', 'Milo Dean', 'Adrian Grant',
      'Kyron Smart', 'Adrian Napoletani', 'Brycen Holcomb', 'Kris Dyer', 'Myron Mason',
    ]);
    expect(screen.getByText('FBA 71')).toBeTruthy();
    expect(screen.getByText("13 players aren't ranked yet")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rank Xavier Booker next' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbad2/S79/ratings.json', ifMatch: '"0000000000000001"' });
    expect((log.puts[0].doc as RankingFile).order).toEqual(['p00028']);
  });

  it('finishes as one batch that includes the calendar', async () => {
    const log = stubApi(docsFor(complete(started())));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' });
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Finish D2 ratings');
    expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fbad2/S79/ratings.json', 'leagues/fbad2/S79/reserves.json',
      'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
  });

  it('hands off to the version an autosave returned when Finish follows an edit', async () => {
    const s = complete(started());
    const log = stubApi(docsFor({ ...s, ratings: setRating(s.ratings!, 'p00040', null) }));
    renderPage();
    const finish = await screen.findByRole('button', { name: 'Finish ratings' });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    const input = screen.getByLabelText('New rating for Kris Dyer');
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.blur(input);
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0].ifMatch).toBe('"0000000000000001"');
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].writes.find(w => w.path === 'leagues/fbad2/S79/ratings.json')!.baseVersion).toBe('0000000000000002');
  });

  it('is read-only and points to the pool once finished', async () => {
    stubApi(docsFor(d2RatedState()));
    renderPage();
    expect(await screen.findByText(/D2 ratings are finished/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish ratings' })).toBeNull();
  });
});
```

- [ ] **Step 8: Load last season's ranking, and rewrite the page**

In `web/app/d2/useD2State.ts`:
- Replace `D2RatingsFile` with `RankingFile` in the import and in `useDoc<RankingFile>(at('ratings'))`.
- After the `prevD2` line add:

```ts
  const prevRatings = useDoc<RankingFile>(season === undefined ? null : `leagues/fbad2/S${season - 1}/ratings.json`);
```

- Change `const optional: DocState<unknown>[] = [ratings, pool, draft, prevD2, freeAgents];` to include `prevRatings`:

```ts
  const optional: DocState<unknown>[] = [ratings, pool, draft, prevD2, prevRatings, freeAgents];
```

- In the returned `state`, after `prevD2: prevD2.data ?? null,` add `prevRatings: prevRatings.data ?? null,`.

In `web/app/d2/testDocs.ts`, in `docsFor`, after the `prevD2` line add:

```ts
  if (state.prevRatings) out[`leagues/fbad2/S${state.season - 1}/ratings.json`] = state.prevRatings;
```

Replace `web/app/pages/D2RatingsPage.tsx` with:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { finishRatings, membershipBlockers, startRatings } from '../../engine/d2/ratings';
import { d2DocPath, d2Name, d2Writes, type D2Result } from '../../engine/d2/state';
import type { RankingFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { useD2State } from '../d2/useD2State';
import { RankingTable } from '../rank/RankingTable';
import { commitDocs, newBatchId } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import './roster.css';

export function D2RatingsPage() {
  const { state, versions, error } = useD2State();
  const saving = useSaving();
  const path = state ? d2DocPath('ratings', state.season) : '';
  const autosave = useAutosaveDoc<RankingFile>(path, state?.ratings ?? undefined, versions[path] ?? null);
  const [actionError, setActionError] = useState('');

  if (error) return <p className="error">Couldn't load D2 data: {error.message}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  const title = <h1>S{state.season} D2 ratings reset</h1>;

  const run = async (result: D2Result) => {
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setActionError('');
    try {
      await commitDocs(result.label, d2Writes(result), { ...versions, [path]: autosave.version });
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  if (!state.freeAgencyClosed) {
    return <section>{title}<p className="muted">Close free agency first. <Link to="/league/fba/free-agency">Go to free agency ▸</Link></p></section>;
  }
  const ratings = autosave.doc ?? state.ratings ?? undefined;
  if (!ratings) {
    return (
      <section>
        {title}
        <p className="muted">
          Rank every D2 roster player and Reserve, best first, starting from last season's order. Once everyone is ranked, give each player
          a new rating; the app suggests the rating that held the same rank last season.
        </p>
        <button className="btn primary" disabled={saving} onClick={() => run(startRatings(state))}>Start ratings reset</button>
        {actionError && <p className="error">{actionError}</p>}
      </section>
    );
  }

  const live = { ...state, ratings };
  return (
    <section>
      {title}
      {ratings.locked && <p className="muted">D2 ratings are finished. <Link to="/league/fbad2/draft">Build the D2 pool ▸</Link></p>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      <RankingTable
        doc={ratings}
        name={id => d2Name(state, id)}
        teamLabel={team => team ?? 'Reserves'}
        otherLabel="FBA"
        onChange={autosave.update}
        extraBlockers={membershipBlockers(live)}
        finishLabel="Finish ratings"
        onFinish={() => run(finishRatings(live, { batchId: newBatchId() }))}
        busy={saving}
      />
    </section>
  );
}
```

- [ ] **Step 9: Run the page tests**

Run: `npx vitest run app/pages/D2RatingsPage.test.tsx app/pages/D2DraftPage.test.tsx app/pages/NextSeasonPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing (no references to the removed names remain); every test passes, including `data.test.ts`.

- [ ] **Step 11: Commit**

```bash
git add web/engine/shared web/engine/d2 web/engine/season/nextSeason.ts web/app/d2 web/app/pages/D2RatingsPage.tsx web/app/pages/D2RatingsPage.test.tsx web/app/pages/NextSeasonPage.tsx
git commit -m "feat: D2 ratings reset on the click-to-rank tool; the rating formula is removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The one-time S79 college rosters

**Files:**
- Create: `web/engine/college/setup.ts`
- Create: `web/engine/college/testFixtures.ts`
- Test: `web/engine/college/setup.test.ts`

**Interfaces:**
- **Consumes:** `RostersFile`, `RosterEntry`, `MetaFile`, `FreeAgentsFile`, `ReservesFile`, `TransactionsFile`, `ClassYear`, `Position`, `TeamsFile`, `PlayersFile` from `../shared/types`; `POSITIONS` from `../roster/rules`; `appendTx`, `MoveContext` from `../roster/state`.
- **Produces:**
  - `collegeHole(position: Position): RosterEntry`: `{ playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null }`;
  - `interface SetupCounts { seniors: number; early: number; holes: number }`;
  - `setupCollegeRosters(input: { season: number; prev: RostersFile; proIds: Set<string> }): { ok: true; rosters: RostersFile; counts: SetupCounts } | { ok: false; problems: string[] }`;
  - `setupSummary(counts: SetupCounts): string` (`4 Seniors leave, 1 player left early, 6 holes`);
  - `proPlayerIds(docs: { fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null }): Set<string>`;
  - `collegeSetupDocs(input: { meta: MetaFile; prev: RostersFile; proIds: Set<string>; rostersExist: boolean }, ctx: MoveContext): CollegeSetupResult`, where `CollegeSetupResult = { ok: true; writes: { path: string; doc: unknown }[]; label: string; counts: SetupCounts } | { ok: false; problems: string[] }`. The writes are, in order, `leagues/fbajc/S<n>/rosters.json`, `leagues/fbajc/S<n>/transactions.json`, `meta.json`, with n = `meta.currentSeason`.
- `web/engine/college/testFixtures.ts` exports `collegeTeams()`, `collegePlayers()`, `collegeS78Rosters()`, `collegeProIds()`, `collegePros()` (Tasks 6–10 build on them).

- [ ] **Step 1: Write the fixtures**

Create `web/engine/college/testFixtures.ts`:

```ts
import type { ClassYear, PlayersFile, Position, RosterEntry, RostersFile, TeamsFile } from '../shared/types';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };

/** Baylor and Texas (Big 12), Duke (ACC). */
export function collegeTeams(): TeamsFile {
  return {
    league: 'fbajc',
    teams: [
      { teamId: 'BAY', name: 'Baylor', abbr: 'BAY', group: 'B12', logoFolder: null, badge },
      { teamId: 'TEX', name: 'Texas', abbr: 'TEX', group: 'B12', logoFolder: null, badge },
      { teamId: 'DUKE', name: 'Duke', abbr: 'DUKE', group: 'ACC', logoFolder: null, badge },
    ],
  };
}

const NAMED: Record<string, string> = { p00485: 'Jaden Moss', p00488: 'Omar Reed', p00503: 'Luis Vega', p00510: 'Ty Brooks' };
const UNNAMED = ['p00486', 'p00487', 'p00489', 'p00500', 'p00502', 'p00504', 'p00511', 'p00512', 'p00513', 'p00514'];

/** Every college player in the fixtures (unnamed ones are "X"); the next id is p01914, as in the real S79 data. */
export function collegePlayers(): PlayersFile {
  const players: PlayersFile['players'] = {};
  for (const [id, name] of Object.entries(NAMED)) players[id] = { id, name, birthSeason: null };
  for (const id of UNNAMED) players[id] = { id, name: null, birthSeason: null };
  return { nextId: 1914, players };
}

const c = (playerId: string | null, position: Position, classYear: ClassYear, rating: number, stars: number | null = null): RosterEntry =>
  (playerId === null
    ? { playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null }
    : { playerId, position, rating, age: null, points: 300, stars, classYear });

/**
 * S78 college rosters, 300 points each:
 * - BAY: PG Jaden Moss p00485 (Fr, 82, 4★) · SG X p00486 (Sr, 70) · SF X p00487 (So, 72) · PF Omar Reed p00488 (Jr, 69) · C X p00489 (Sr, 74).
 * - TEX: PG X p00500 (Jr, 88, 5★; now in the pros) · SG hole · SF X p00502 (Fr, 75) · PF Luis Vega p00503 (So, 66) · C X p00504 (Jr, 71).
 * - DUKE: PG Ty Brooks p00510 (Sr, 90; now in the pros) · SG X p00511 (Fr, 60) · SF X p00512 (So, 61) · PF X p00513 (Sr, 62) · C X p00514 (Fr, 63).
 *
 * Set up for S79 (with collegeProIds), this gives:
 * - BAY: PG Jaden Moss (So, 82, 4★) · SG hole · SF X (Jr, 72) · PF Omar Reed (Sr, 69) · C hole.
 * - TEX: PG hole · SG hole · SF X (So, 75) · PF Luis Vega (Jr, 66) · C X (Sr, 71).
 * - DUKE: PG hole · SG X p00511 (So, 60) · SF X (Jr, 61) · PF hole · C X (So, 63).
 */
export function collegeS78Rosters(): RostersFile {
  return {
    league: 'fbajc',
    season: 78,
    locked: true,
    teams: {
      BAY: [c('p00485', 'PG', 'Fr', 82, 4), c('p00486', 'SG', 'Sr', 70), c('p00487', 'SF', 'So', 72), c('p00488', 'PF', 'Jr', 69), c('p00489', 'C', 'Sr', 74)],
      TEX: [c('p00500', 'PG', 'Jr', 88, 5), c(null, 'SG', 'Fr', 0), c('p00502', 'SF', 'Fr', 75), c('p00503', 'PF', 'So', 66), c('p00504', 'C', 'Jr', 71)],
      DUKE: [c('p00510', 'PG', 'Sr', 90), c('p00511', 'SG', 'Fr', 60), c('p00512', 'SF', 'So', 61), c('p00513', 'PF', 'Sr', 62), c('p00514', 'C', 'Fr', 63)],
    },
  };
}

/** S79 FBA rosters (Ty Brooks, drafted, plus a vacancy) and D2 rosters (the early leaver p00500). */
export function collegePros(): { fba: RostersFile; d2: RostersFile } {
  return {
    fba: { league: 'fba', season: 79, locked: false, teams: { BOS: [
      { playerId: 'p00510', position: 'PG', rating: 70, age: 22, points: 0 },
      { playerId: null, position: 'SG', rating: null, age: null, points: 0 },
    ] } },
    d2: { league: 'fbad2', season: 79, locked: false, teams: { AMS: [{ playerId: 'p00500', position: 'PG', rating: 72, age: 21, points: 0 }] } },
  };
}

/** The S78 college players now in the S79 pro data. */
export function collegeProIds(): Set<string> {
  return new Set(['p00500', 'p00510']);
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/college/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pathAgreementProblem, schemaForPath } from '../shared/schemaRegistry';
import type { MetaFile, RostersFile } from '../shared/types';
import { collegeHole, collegeSetupDocs, proPlayerIds, setupCollegeRosters, setupSummary } from './setup';
import { collegeProIds, collegePros, collegeS78Rosters } from './testFixtures';

const META: MetaFile = {
  currentSeason: 79,
  rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
};

const run = () => {
  const r = setupCollegeRosters({ season: 79, prev: collegeS78Rosters(), proIds: collegeProIds() });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};

describe('setupCollegeRosters', () => {
  it('moves returning players up a class year with points reset, keeping rating and stars', () => {
    const { rosters } = run();
    expect(rosters).toMatchObject({ league: 'fbajc', season: 79, locked: false });
    expect(rosters.teams.BAY[0]).toEqual({ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' });
    expect(rosters.teams.BAY.map(e => e.classYear)).toEqual(['So', null, 'Jr', 'Sr', null]);
    expect(rosters.teams.DUKE.map(e => e.classYear)).toEqual([null, 'So', 'Jr', null, 'So']);
  });

  it('turns Seniors (named or X), players now in the pros and existing holes into holes', () => {
    const { rosters } = run();
    expect(collegeHole('PF')).toEqual({ playerId: null, position: 'PF', rating: null, age: null, points: 0, stars: null, classYear: null });
    expect(rosters.teams.BAY[1]).toEqual(collegeHole('SG'));
    expect(rosters.teams.BAY[4]).toEqual(collegeHole('C'));
    expect(rosters.teams.TEX.map(e => e.playerId)).toEqual([null, null, 'p00502', 'p00503', 'p00504']);
    expect(rosters.teams.DUKE.map(e => e.playerId)).toEqual([null, 'p00511', 'p00512', null, 'p00514']);
  });

  it('keeps five slots per team, one per position, and counts who left', () => {
    const r = run();
    for (const entries of Object.values(r.rosters.teams)) expect(entries.map(e => e.position)).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
    expect(r.counts).toEqual({ seniors: 4, early: 1, holes: 6 });
    expect(setupSummary(r.counts)).toBe('4 Seniors leave, 1 player left early, 6 holes');
    expect(setupSummary({ seniors: 1, early: 9, holes: 1 })).toBe('1 Senior leaves, 9 players left early, 1 hole');
    expect(schemaForPath('leagues/fbajc/S79/rosters.json')!.safeParse(r.rosters).success).toBe(true);
  });

  it('refuses the wrong season and a team without one slot per position', () => {
    expect(setupCollegeRosters({ season: 80, prev: collegeS78Rosters(), proIds: new Set() }))
      .toEqual({ ok: false, problems: ['Set up from the S79 college rosters (got S78)'] });
    const prev = collegeS78Rosters();
    const short: RostersFile = { ...prev, teams: { ...prev.teams, BAY: prev.teams.BAY.slice(0, 4) } };
    expect(setupCollegeRosters({ season: 79, prev: short, proIds: new Set() }))
      .toEqual({ ok: false, problems: ["BAY doesn't have one slot per position"] });
  });
});

describe('proPlayerIds', () => {
  it('collects everyone on the FBA and D2 rosters, the FBA free agents and the D2 Reserves', () => {
    const { fba, d2 } = collegePros();
    const ids = proPlayerIds({
      fba, d2,
      freeAgents: { league: 'fba', season: 79, locked: false, players: [{ playerId: 'p00700', position: 'C', age: 22, rating: null, rookie: true, note: '' }] },
      reserves: { league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p00701', position: 'SF', age: 25, rating: null }] },
    });
    expect([...ids].sort()).toEqual(['p00500', 'p00510', 'p00700', 'p00701']);
    expect([...proPlayerIds({ fba, d2, freeAgents: null, reserves: null })].sort()).toEqual(['p00500', 'p00510']);
  });
});

describe('collegeSetupDocs', () => {
  it('writes the rosters, a new transactions doc and meta', () => {
    const r = collegeSetupDocs({ meta: META, prev: collegeS78Rosters(), proIds: collegeProIds(), rostersExist: false }, { batchId: 'b1' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(r.label).toBe('Set up S79 college rosters');
    expect(r.counts).toEqual({ seniors: 4, early: 1, holes: 6 });
    expect(r.writes.map(w => w.path)).toEqual(['leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json', 'meta.json']);
    for (const w of r.writes) {
      expect(schemaForPath(w.path)!.safeParse(w.doc).success).toBe(true);
      expect(pathAgreementProblem(w.path, w.doc)).toBeNull();
    }
    expect(r.writes[1].doc).toEqual({
      league: 'fbajc', season: 79, entries: [{ seq: 1, batchId: 'b1', type: 'season', teams: [], lines: ['S79 college rosters set up from S78'] }],
    });
    expect((r.writes[2].doc as MetaFile).rosterSeason).toEqual({ fba: 79, fbad2: 79, fbajc: 79, fbawc: 78 });
    expect((r.writes[2].doc as MetaFile).currentSeason).toBe(79);
  });

  it('refuses when the rosters exist, or the college rosters are not on the previous season', () => {
    const input = { meta: META, prev: collegeS78Rosters(), proIds: collegeProIds(), rostersExist: true };
    expect(collegeSetupDocs(input, { batchId: 'b1' })).toEqual({ ok: false, problems: ['The S79 college rosters already exist'] });
    const later = { ...META, rosterSeason: { ...META.rosterSeason, fbajc: 79 } };
    expect(collegeSetupDocs({ ...input, rostersExist: false, meta: later }, { batchId: 'b1' }))
      .toEqual({ ok: false, problems: ['The college rosters are on S79, not S78'] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/college/setup.test.ts`
Expected: FAIL: `./setup` doesn't exist.

- [ ] **Step 4: Implement**

Create `web/engine/college/setup.ts`:

```ts
import { POSITIONS } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import type { ClassYear, FreeAgentsFile, MetaFile, Position, ReservesFile, RosterEntry, RostersFile, TransactionsFile } from '../shared/types';

const NEXT_YEAR: Record<'Fr' | 'So' | 'Jr', ClassYear> = { Fr: 'So', So: 'Jr', Jr: 'Sr' };

/** An empty college slot. */
export function collegeHole(position: Position): RosterEntry {
  return { playerId: null, position, rating: null, age: null, points: 0, stars: null, classYear: null };
}

export interface SetupCounts { seniors: number; early: number; holes: number }

/**
 * Builds season n's college rosters from season n−1's (D19): every Senior leaves (named ones went pro, X ones just
 * leave), every player now in the pro data leaves (they left early), the rest move up a class year with points reset.
 * Empty slots stay empty. Every team keeps its five slots, one per position.
 */
export function setupCollegeRosters(input: { season: number; prev: RostersFile; proIds: Set<string> }):
  { ok: true; rosters: RostersFile; counts: SetupCounts } | { ok: false; problems: string[] } {
  const { season, prev, proIds } = input;
  if (prev.league !== 'fbajc' || prev.season !== season - 1) {
    return { ok: false, problems: [`Set up from the S${season - 1} college rosters (got S${prev.season})`] };
  }
  const problems: string[] = [];
  const counts: SetupCounts = { seniors: 0, early: 0, holes: 0 };
  const teams: Record<string, RosterEntry[]> = {};
  for (const [teamId, entries] of Object.entries(prev.teams)) {
    const positions = entries.map(e => e.position);
    if (entries.length !== POSITIONS.length || POSITIONS.some(p => !positions.includes(p))) {
      problems.push(`${teamId} doesn't have one slot per position`);
      continue;
    }
    teams[teamId] = entries.map(e => {
      if (e.playerId === null) {
        counts.holes++;
        return collegeHole(e.position);
      }
      const year = e.classYear;
      if (year === 'Sr') {
        counts.seniors++;
        counts.holes++;
        return collegeHole(e.position);
      }
      if (proIds.has(e.playerId)) {
        counts.early++;
        counts.holes++;
        return collegeHole(e.position);
      }
      if (!year) {
        problems.push(`${teamId} ${e.position} has no class year`);
        return e;
      }
      return { ...e, classYear: NEXT_YEAR[year], points: 0 };
    });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, rosters: { league: 'fbajc', season, locked: false, teams }, counts };
}

/** "278 Seniors leave, 9 players left early, 287 holes". */
export function setupSummary(c: SetupCounts): string {
  const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    count(c.seniors, 'Senior leaves', 'Seniors leave'),
    count(c.early, 'player left early', 'players left early'),
    count(c.holes, 'hole', 'holes'),
  ].join(', ');
}

/** Every player id in this season's pro data: FBA and D2 rosters, FBA free agents, D2 Reserves. */
export function proPlayerIds(docs: { fba: RostersFile; freeAgents: FreeAgentsFile | null; d2: RostersFile; reserves: ReservesFile | null }): Set<string> {
  const ids = new Set<string>();
  for (const rosters of [docs.fba, docs.d2]) {
    for (const e of Object.values(rosters.teams).flat()) if (e.playerId) ids.add(e.playerId);
  }
  for (const p of docs.freeAgents?.players ?? []) ids.add(p.playerId);
  for (const p of docs.reserves?.players ?? []) ids.add(p.playerId);
  return ids;
}

export type CollegeSetupResult =
  | { ok: true; writes: { path: string; doc: unknown }[]; label: string; counts: SetupCounts }
  | { ok: false; problems: string[] };

/** The one-time setup batch: the S{n} college rosters, a new S{n} college transactions doc, and meta.rosterSeason.fbajc = n. */
export function collegeSetupDocs(input: { meta: MetaFile; prev: RostersFile; proIds: Set<string>; rostersExist: boolean }, ctx: MoveContext): CollegeSetupResult {
  const n = input.meta.currentSeason;
  if (input.rostersExist) return { ok: false, problems: [`The S${n} college rosters already exist`] };
  if (input.meta.rosterSeason.fbajc !== n - 1) {
    return { ok: false, problems: [`The college rosters are on S${input.meta.rosterSeason.fbajc}, not S${n - 1}`] };
  }
  const built = setupCollegeRosters({ season: n, prev: input.prev, proIds: input.proIds });
  if (!built.ok) return built;
  const tx: TransactionsFile = appendTx({ league: 'fbajc', season: n, entries: [] }, ctx, 'season', [], [`S${n} college rosters set up from S${n - 1}`]);
  const meta: MetaFile = { ...input.meta, rosterSeason: { ...input.meta.rosterSeason, fbajc: n } };
  return {
    ok: true,
    label: `Set up S${n} college rosters`,
    counts: built.counts,
    writes: [
      { path: `leagues/fbajc/S${n}/rosters.json`, doc: built.rosters },
      { path: `leagues/fbajc/S${n}/transactions.json`, doc: tx },
      { path: 'meta.json', doc: meta },
    ],
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/college/setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Check the real S79 counts (read only)**

Run this read-only check from `web/` and note the three numbers in your report (it only reads `web/data`, it writes nothing):

```bash
npx tsx -e "import { readFileSync } from 'node:fs'; import { proPlayerIds, setupCollegeRosters, setupSummary } from './engine/college/setup'; const r = (p: string) => JSON.parse(readFileSync('data/' + p, 'utf8')); const ids = proPlayerIds({ fba: r('leagues/fba/S79/rosters.json'), freeAgents: r('leagues/fba/S79/freeAgents.json'), d2: r('leagues/fbad2/S79/rosters.json'), reserves: r('leagues/fbad2/S79/reserves.json') }); const s = setupCollegeRosters({ season: 79, prev: r('leagues/fbajc/S78/rosters.json'), proIds: ids }); console.log(s.ok ? setupSummary(s.counts) : s.problems);"
```

Expected: one line of the form `278 Seniors leave, N players left early, M holes` (the ledger's data facts suggest about 9 early leavers). If it prints problems instead, stop and report them. If `tsx -e` can't run the snippet, put the same code in a scratch file under `.superpowers/sdd/`, run it with `npx tsx <file>`, then delete the file.

- [ ] **Step 7: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 8: Commit**

```bash
git add web/engine/college
git commit -m "feat: one-time college rosters from the previous season (Seniors and early leavers become holes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The recruiting state and Create Class

**Files:**
- Create: `web/engine/college/state.ts`
- Create: `web/engine/college/recruiting.ts` (the class half; Task 7 adds the board moves)
- Modify: `web/engine/college/testFixtures.ts` (add `collegeBaseState`, `collegeClassState`)
- Test: `web/engine/college/recruiting.test.ts`

**Interfaces:**
- **Consumes:** `RecruitingFile`, `ClassDraftRow`, `Prospect` (Task 1); `setupCollegeRosters` and the fixtures (Task 5); `markStepDone`; `appendTx`, `MoveContext`.
- **Produces** in `web/engine/college/state.ts`:

```ts
export interface RecruitingState {
  season: number;
  recruiting: RecruitingFile;
  rosters: RostersFile;   // fbajc S{n}
  teams: TeamsFile;       // fbajc schools (read-only)
  players: PlayersFile;
  tx: TransactionsFile;   // fbajc S{n}
  calendar: CalendarFile;
}
export type RecruitingDocKey = 'recruiting' | 'rosters' | 'players' | 'tx' | 'calendar';
export function recruitingDocPath(key: RecruitingDocKey, season: number): string;
export type RecruitingResult =
  | { ok: true; state: RecruitingState; changed: RecruitingDocKey[]; label: string }
  | { ok: false; problems: string[] };
export const recruitingFail: (problems: string[]) => RecruitingResult;
export function recruitingWrites(result: Extract<RecruitingResult, { ok: true }>): { path: string; doc: unknown }[];
export function emptyRecruiting(season: number): RecruitingFile;
export function collegeName(players: PlayersFile, playerId: string): string;   // name, or 'X'
export function schoolName(state: RecruitingState, teamId: string): string;    // team name, or the id
export function schoolAbbr(state: RecruitingState, teamId: string): string;    // team abbr, or the id
```

- **Produces** in `web/engine/college/recruiting.ts`:
  - `parseClassList(text: string): { rows: ClassDraftRow[]; bad: string[] }`;
  - doc edits (return the same doc when the class is created or the doc is locked, or the index is unknown): `addDraftRow(doc, row)`, `appendDraftRows(doc, rows)`, `editDraftRow(doc, index, patch: Partial<ClassDraftRow>)`, `removeDraftRow(doc, index)`;
  - `draftCounts(doc): Record<Position, number>`;
  - moves: `createClass(state, ctx): RecruitingResult`, `editRecruit(state, playerId, patch: { name?: string; position?: Position }): RecruitingResult`, `removeRecruit(state, playerId): RecruitingResult`.
- Fixtures: `collegeBaseState(): RecruitingState` (S79, the Task 5 setup applied, empty recruiting doc, calendar at Create S80 Class); `collegeClassState(): RecruitingState` (class created: Zion Carter PG `p01914`, Malik Ford SG `p01915`, Eli Grant PF `p01916`).

- [ ] **Step 1: Write the state module and the fixtures**

Create `web/engine/college/state.ts`:

```ts
import type { CalendarFile, PlayersFile, RecruitingFile, RostersFile, TeamsFile, TransactionsFile } from '../shared/types';

/** Everything the recruiting page reads and writes for the class created in calendar season `season`. */
export interface RecruitingState {
  season: number;
  recruiting: RecruitingFile;
  /** This season's FBAJC rosters. */
  rosters: RostersFile;
  /** The FBAJC schools (read-only). */
  teams: TeamsFile;
  players: PlayersFile;
  /** This season's FBAJC transactions. */
  tx: TransactionsFile;
  calendar: CalendarFile;
}

export type RecruitingDocKey = 'recruiting' | 'rosters' | 'players' | 'tx' | 'calendar';

export function recruitingDocPath(key: RecruitingDocKey, season: number): string {
  switch (key) {
    case 'recruiting': return `leagues/fbajc/S${season}/recruiting.json`;
    case 'rosters': return `leagues/fbajc/S${season}/rosters.json`;
    case 'tx': return `leagues/fbajc/S${season}/transactions.json`;
    case 'players': return 'players.json';
    case 'calendar': return 'calendar.json';
  }
}

export type RecruitingResult =
  | { ok: true; state: RecruitingState; changed: RecruitingDocKey[]; label: string }
  | { ok: false; problems: string[] };

export const recruitingFail = (problems: string[]): RecruitingResult => ({ ok: false, problems });

/** The batch writes for a successful result: one per changed document. */
export function recruitingWrites(result: Extract<RecruitingResult, { ok: true }>): { path: string; doc: unknown }[] {
  return result.changed.map(k => ({ path: recruitingDocPath(k, result.state.season), doc: result.state[k] }));
}

/** A new recruiting doc for the class created in `season` (it plays its Freshman year in that season's FBAJC). */
export function emptyRecruiting(season: number): RecruitingFile {
  return { league: 'fbajc', season, classOf: season + 1, locked: false, classDraft: [], created: false, recruits: [], portal: [] };
}

/** A college player's name; unnamed players are "X", as in the Java. */
export function collegeName(players: PlayersFile, playerId: string): string {
  return players.players[playerId]?.name ?? 'X';
}

export function schoolName(state: RecruitingState, teamId: string): string {
  return state.teams.teams.find(t => t.teamId === teamId)?.name ?? teamId;
}

export function schoolAbbr(state: RecruitingState, teamId: string): string {
  return state.teams.teams.find(t => t.teamId === teamId)?.abbr ?? teamId;
}
```

Append to `web/engine/college/testFixtures.ts` (and extend its imports: `import type { ClassDraftRow, … } from '../shared/types';`, `import { createClass } from './recruiting';`, `import { setupCollegeRosters } from './setup';`, `import { emptyRecruiting, type RecruitingState } from './state';`):

```ts
/**
 * S79 FBAJC after the one-time setup (see collegeS78Rosters for the rosters), before the S80 class exists.
 * Calendar: FBAD2 Draft done, then Create S80 Class (current), Make S79 Schedules, FBAJC.
 */
export function collegeBaseState(): RecruitingState {
  const set = setupCollegeRosters({ season: 79, prev: collegeS78Rosters(), proIds: collegeProIds() });
  if (!set.ok) throw new Error(set.problems.join('; '));
  return {
    season: 79,
    recruiting: emptyRecruiting(79),
    rosters: set.rosters,
    teams: collegeTeams(),
    players: collegePlayers(),
    tx: { league: 'fbajc', season: 79, entries: [] },
    calendar: {
      season: 79,
      steps: [
        { id: 'fbad2-draft', label: 'FBAD2 Draft', kind: 'offseason', league: null, sub: true, done: true },
        { id: 'create-s80-class', label: 'Create S80 Class', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'make-s79-schedules', label: 'Make S79 Schedules', kind: 'offseason', league: null, sub: false, done: false },
        { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
      ],
    },
  };
}

export const CLASS_DRAFT: ClassDraftRow[] = [
  { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'PF' },
];

/** collegeBaseState with the S80 class created from CLASS_DRAFT: Zion Carter PG p01914, Malik Ford SG p01915, Eli Grant PF p01916. */
export function collegeClassState(): RecruitingState {
  const s = collegeBaseState();
  const r = createClass({ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }, { batchId: 'fixture' });
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/engine/college/recruiting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RecruitingFile, type ClassDraftRow } from '../shared/types';
import {
  addDraftRow, appendDraftRows, createClass, draftCounts, editDraftRow, editRecruit, parseClassList, removeDraftRow, removeRecruit,
} from './recruiting';
import { emptyRecruiting, recruitingWrites, type RecruitingResult, type RecruitingState } from './state';
import { collegeBaseState, collegeClassState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const drafted = (rows: ClassDraftRow[]): RecruitingState => {
  const s = collegeBaseState();
  return { ...s, recruiting: { ...s.recruiting, classDraft: rows } };
};
const withRecruit = (s: RecruitingState, id: string, patch: object): RecruitingState => ({
  ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => (p.playerId === id ? { ...p, ...patch } : p)) },
});

describe('parseClassList', () => {
  it('reads "Name, POS" and "Name<Tab>POS" lines and lists the rest back', () => {
    expect(parseClassList('Zion Carter, PG\nMalik Ford\tsg\n\n  bad line \nEli Grant , PF \nSmith, Jr., C\r\n, PG')).toEqual({
      rows: [
        { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' },
        { name: 'Eli Grant', position: 'PF' }, { name: 'Smith, Jr.', position: 'C' },
      ],
      bad: ['bad line', ', PG'],
    });
  });
});

describe('class draft edits', () => {
  it('adds, edits, appends and removes rows, and counts positions', () => {
    let doc = addDraftRow(emptyRecruiting(79), { name: '', position: 'PG' });
    doc = editDraftRow(doc, 0, { name: 'Zion Carter' });
    doc = appendDraftRows(doc, [{ name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'SG' }]);
    doc = editDraftRow(doc, 2, { position: 'PF' });
    expect(doc.classDraft).toEqual([
      { name: 'Zion Carter', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }, { name: 'Eli Grant', position: 'PF' },
    ]);
    expect(draftCounts(doc)).toEqual({ PG: 1, SG: 1, SF: 0, PF: 1, C: 0 });
    doc = removeDraftRow(doc, 1);
    expect(doc.classDraft.map(r => r.name)).toEqual(['Zion Carter', 'Eli Grant']);
    expect(RecruitingFile.safeParse(doc).success).toBe(true);
  });

  it('leaves a created or locked doc, or an unknown row, unchanged', () => {
    const created = collegeClassState().recruiting;
    expect(addDraftRow(created, { name: 'A', position: 'C' })).toBe(created);
    expect(appendDraftRows(created, [{ name: 'A', position: 'C' }])).toBe(created);
    const locked = { ...emptyRecruiting(79), locked: true, classDraft: [{ name: 'A', position: 'C' as const }] };
    expect(editDraftRow(locked, 0, { name: 'B' })).toBe(locked);
    expect(removeDraftRow(locked, 0)).toBe(locked);
    const one = addDraftRow(emptyRecruiting(79), { name: 'A', position: 'C' });
    expect(editDraftRow(one, 5, { name: 'B' })).toBe(one);
    expect(removeDraftRow(one, 5)).toBe(one);
  });
});

describe('createClass', () => {
  it('creates a player and a recruit per row, logs, and marks the calendar step done', () => {
    const r = ok(createClass(drafted([{ name: ' Zion Carter ', position: 'PG' }, { name: 'Malik Ford', position: 'SG' }]), ctx));
    expect(r.label).toBe('Create S80 class');
    expect(r.changed).toEqual(['recruiting', 'players', 'tx', 'calendar']);
    expect(r.state.players.nextId).toBe(1916);
    expect(r.state.players.players.p01914).toEqual({ id: 'p01914', name: 'Zion Carter', birthSeason: 61 });
    expect(r.state.players.players.p01915).toEqual({ id: 'p01915', name: 'Malik Ford', birthSeason: 61 });
    expect(r.state.recruiting).toMatchObject({ created: true, classDraft: [], classOf: 80 });
    expect(r.state.recruiting.recruits).toEqual([
      { playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null },
      { playerId: 'p01915', position: 'SG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null },
    ]);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'class', teams: [], lines: ['S80 class created: 2 recruits'] });
    expect(r.state.calendar.steps.find(s => s.id === 'create-s80-class')!.done).toBe(true);
    expect(recruitingWrites(r).map(w => w.path)).toEqual([
      'leagues/fbajc/S79/recruiting.json', 'players.json', 'leagues/fbajc/S79/transactions.json', 'calendar.json',
    ]);
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
    const one = ok(createClass(drafted([{ name: 'Zion Carter', position: 'PG' }]), ctx));
    expect(one.state.tx.entries.at(-1)!.lines).toEqual(['S80 class created: 1 recruit']);
  });

  it('refuses an empty draft, blank names, a second creation and a locked doc', () => {
    expect(createClass(collegeBaseState(), ctx)).toEqual({ ok: false, problems: ['Add at least one recruit first'] });
    expect(createClass(drafted([{ name: 'A B', position: 'PG' }, { name: ' ', position: 'C' }]), ctx)).toEqual({ ok: false, problems: ['1 row needs a name'] });
    expect(createClass(drafted([{ name: '', position: 'PG' }, { name: ' ', position: 'C' }]), ctx)).toEqual({ ok: false, problems: ['2 rows need a name'] });
    expect(createClass(collegeClassState(), ctx)).toEqual({ ok: false, problems: ['The class has already been created'] });
    const s = drafted([{ name: 'A B', position: 'PG' }]);
    expect(createClass({ ...s, recruiting: { ...s.recruiting, locked: true } }, ctx)).toEqual({ ok: false, problems: ['Recruiting for this class is finished'] });
  });
});

describe('editRecruit and removeRecruit', () => {
  it('renames a recruit in players.json, or changes their position on the board', () => {
    const s = collegeClassState();
    const renamed = ok(editRecruit(s, 'p01914', { name: ' Zion Carver ' }));
    expect(renamed.changed).toEqual(['players']);
    expect(renamed.label).toBe('Edit Zion Carver');
    expect(renamed.state.players.players.p01914).toEqual({ id: 'p01914', name: 'Zion Carver', birthSeason: 61 });
    const moved = ok(editRecruit(s, 'p01914', { position: 'SG' }));
    expect(moved.changed).toEqual(['recruiting']);
    expect(moved.state.recruiting.recruits[0].position).toBe('SG');
  });

  it('refuses a blank name, no change, unknown players and committed recruits', () => {
    const s = collegeClassState();
    expect(editRecruit(s, 'p01914', { name: '  ' })).toEqual({ ok: false, problems: ['Enter a name'] });
    expect(editRecruit(s, 'p01914', { name: 'Zion Carter', position: 'PG' })).toEqual({ ok: false, problems: ['Nothing to change'] });
    expect(editRecruit(s, 'p00485', { name: 'Z' })).toEqual({ ok: false, problems: ["p00485 isn't in the class"] });
    expect(editRecruit(withRecruit(s, 'p01914', { committedTo: 'DUKE' }), 'p01914', { name: 'Z' }))
      .toEqual({ ok: false, problems: ['Zion Carter has committed; decommit them first'] });
  });

  it('removes an unprojected, uncommitted recruit from the class and players.json', () => {
    const r = ok(removeRecruit(collegeClassState(), 'p01915'));
    expect(r.label).toBe('Remove Malik Ford from the class');
    expect(r.changed).toEqual(['recruiting', 'players']);
    expect(r.state.recruiting.recruits.map(p => p.playerId)).toEqual(['p01914', 'p01916']);
    expect(r.state.players.players.p01915).toBeUndefined();
    expect(r.state.players.nextId).toBe(1917);
  });

  it('refuses to remove a projected or committed recruit', () => {
    const s = collegeClassState();
    expect(removeRecruit(withRecruit(s, 'p01915', { projections: { TEX: 1 } }), 'p01915'))
      .toEqual({ ok: false, problems: ["Remove Malik Ford's projections first"] });
    expect(removeRecruit(withRecruit(s, 'p01915', { committedTo: 'TEX' }), 'p01915'))
      .toEqual({ ok: false, problems: ['Malik Ford has committed; decommit them first'] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run engine/college/recruiting.test.ts`
Expected: FAIL: `./recruiting` doesn't exist.

- [ ] **Step 4: Implement the class half of `recruiting.ts`**

Create `web/engine/college/recruiting.ts`:

```ts
import { POSITIONS } from '../roster/rules';
import { appendTx, type MoveContext } from '../roster/state';
import { markStepDone } from '../shared/calendar';
import type { ClassDraftRow, Position, Prospect, RecruitingFile } from '../shared/types';
import { collegeName, recruitingFail, type RecruitingDocKey, type RecruitingResult, type RecruitingState } from './state';

const LOCKED = 'Recruiting for this class is finished';
const LINE = /^(.+?)\s*[\t,]\s*(PG|SG|SF|PF|C)\s*$/i;

/** Reads a pasted class list: one "Name, POS" or "Name<Tab>POS" per line. Blank lines are skipped; lines that don't parse come back in `bad`. */
export function parseClassList(text: string): { rows: ClassDraftRow[]; bad: string[] } {
  const rows: ClassDraftRow[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LINE);
    const name = m?.[1].trim();
    if (!m || !name) bad.push(line);
    else rows.push({ name, position: m[2].toUpperCase() as Position });
  }
  return { rows, bad };
}

const draftOpen = (doc: RecruitingFile) => !doc.locked && !doc.created;

export function addDraftRow(doc: RecruitingFile, row: ClassDraftRow): RecruitingFile {
  return draftOpen(doc) ? { ...doc, classDraft: [...doc.classDraft, row] } : doc;
}

export function appendDraftRows(doc: RecruitingFile, rows: ClassDraftRow[]): RecruitingFile {
  return draftOpen(doc) && rows.length ? { ...doc, classDraft: [...doc.classDraft, ...rows] } : doc;
}

export function editDraftRow(doc: RecruitingFile, index: number, patch: Partial<ClassDraftRow>): RecruitingFile {
  if (!draftOpen(doc) || !doc.classDraft[index]) return doc;
  return { ...doc, classDraft: doc.classDraft.map((r, i) => (i === index ? { ...r, ...patch } : r)) };
}

export function removeDraftRow(doc: RecruitingFile, index: number): RecruitingFile {
  if (!draftOpen(doc) || !doc.classDraft[index]) return doc;
  return { ...doc, classDraft: doc.classDraft.filter((_, i) => i !== index) };
}

export function draftCounts(doc: RecruitingFile): Record<Position, number> {
  const out = Object.fromEntries(POSITIONS.map(p => [p, 0])) as Record<Position, number>;
  for (const r of doc.classDraft) out[r.position]++;
  return out;
}

/** Create S{n+1} Class: a new player (born n − 18) and an uncommitted Freshman recruit per draft row. */
export function createClass(state: RecruitingState, ctx: MoveContext): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  if (doc.created) return recruitingFail(['The class has already been created']);
  if (!doc.classDraft.length) return recruitingFail(['Add at least one recruit first']);
  const blank = doc.classDraft.filter(r => !r.name.trim()).length;
  if (blank) return recruitingFail([blank === 1 ? '1 row needs a name' : `${blank} rows need a name`]);
  let nextId = state.players.nextId;
  const people = { ...state.players.players };
  const recruits: Prospect[] = doc.classDraft.map(r => {
    const id = `p${String(nextId++).padStart(5, '0')}`;
    people[id] = { id, name: r.name.trim(), birthSeason: state.season - 18 };
    return { playerId: id, position: r.position, classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo: null };
  });
  const k = recruits.length;
  return {
    ok: true,
    state: {
      ...state,
      recruiting: { ...doc, classDraft: [], created: true, recruits },
      players: { nextId, players: people },
      tx: appendTx(state.tx, ctx, 'class', [], [`S${doc.classOf} class created: ${k} ${k === 1 ? 'recruit' : 'recruits'}`]),
      calendar: markStepDone(state.calendar, `create-s${doc.classOf}-class`),
    },
    changed: ['recruiting', 'players', 'tx', 'calendar'],
    label: `Create S${doc.classOf} class`,
  };
}

/** Renames a recruit (players.json) or changes their position (the board). Only while uncommitted. */
export function editRecruit(state: RecruitingState, playerId: string, patch: { name?: string; position?: Position }): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  const p = doc.recruits.find(r => r.playerId === playerId);
  if (!p) return recruitingFail([`${playerId} isn't in the class`]);
  const name = collegeName(state.players, playerId);
  if (p.committedTo) return recruitingFail([`${name} has committed; decommit them first`]);
  let next = state;
  const changed: RecruitingDocKey[] = [];
  if (patch.name !== undefined && patch.name.trim() !== name) {
    const newName = patch.name.trim();
    if (!newName) return recruitingFail(['Enter a name']);
    const player = state.players.players[playerId];
    next = { ...next, players: { ...next.players, players: { ...next.players.players, [playerId]: { ...player, name: newName } } } };
    changed.push('players');
  }
  if (patch.position !== undefined && patch.position !== p.position) {
    const position = patch.position;
    next = { ...next, recruiting: { ...doc, recruits: doc.recruits.map(r => (r.playerId === playerId ? { ...r, position } : r)) } };
    changed.push('recruiting');
  }
  if (!changed.length) return recruitingFail(['Nothing to change']);
  return { ok: true, state: next, changed, label: `Edit ${collegeName(next.players, playerId)}` };
}

/** Takes a recruit out of the class and out of players.json (nothing else refers to them). Only with no projections and no commitment. */
export function removeRecruit(state: RecruitingState, playerId: string): RecruitingResult {
  const doc = state.recruiting;
  if (doc.locked) return recruitingFail([LOCKED]);
  const p = doc.recruits.find(r => r.playerId === playerId);
  if (!p) return recruitingFail([`${playerId} isn't in the class`]);
  const name = collegeName(state.players, playerId);
  if (p.committedTo) return recruitingFail([`${name} has committed; decommit them first`]);
  if (Object.keys(p.projections).length) return recruitingFail([`Remove ${name}'s projections first`]);
  const { [playerId]: _removed, ...rest } = state.players.players;
  return {
    ok: true,
    state: {
      ...state,
      recruiting: { ...doc, recruits: doc.recruits.filter(r => r.playerId !== playerId) },
      players: { ...state.players, players: rest },
    },
    changed: ['recruiting', 'players'],
    label: `Remove ${name} from the class`,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/college`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 7: Commit**

```bash
git add web/engine/college
git commit -m "feat: recruiting state and Create Class (draft rows, paste parsing, create, edit, remove)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The recruiting board moves

**Files:**
- Modify: `web/engine/college/recruiting.ts` (append the board half)
- Test: `web/engine/college/board.test.ts`

**Interfaces:**
- **Consumes:** `RecruitingState`, `RecruitingResult`, `recruitingFail`, `collegeName`, `schoolName` (Task 6); `collegeHole` (Task 5); `appendTx`, `withTeam` from `../roster/state`; the fixtures `collegeClassState` (Task 6).
- **Produces** (appended to `web/engine/college/recruiting.ts`):
  - `addProjection(state, playerId, teamId): RecruitingResult` and `removeProjection(state, playerId, teamId): RecruitingResult` (changed: `['recruiting']`);
  - `projectionShares(p: Prospect): { teamId: string; count: number; pct: number }[]` (count high to low, then team id);
  - `formatShares(p: Prospect, abbr: (teamId: string) => string): string` (`67% TEX · 33% BAY`);
  - `commitPreview(state, playerId, teamId): { ok: true; text: string } | { ok: false; text: string }`;
  - `commit(state, playerId, teamId, ctx): RecruitingResult` and `decommit(state, playerId, ctx): RecruitingResult` (changed: `['recruiting', 'rosters', 'tx']`);
  - `uncommitted(doc: RecruitingFile): { recruits: Prospect[]; portal: PortalPlayer[] }`;
  - `fbajcGateProblem(doc: RecruitingFile | null): string | null`.

- [ ] **Step 1: Write the failing tests**

The fixture (see `collegeS78Rosters` and `collegeClassState`) has, in S79: BAY PG Jaden Moss (So, 82, 4★), SG hole, PF Omar Reed (Sr); TEX PG and SG holes, PF Luis Vega (Jr); DUKE PG hole, SG X `p00511` (So, 60), PF hole. The class is Zion Carter PG `p01914`, Malik Ford SG `p01915`, Eli Grant PF `p01916`.

Create `web/engine/college/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RecruitingFile, RostersFile } from '../shared/types';
import {
  addProjection, commit, commitPreview, decommit, fbajcGateProblem, formatShares, projectionShares, removeProjection, uncommitted,
} from './recruiting';
import { collegeHole } from './setup';
import type { RecruitingResult, RecruitingState } from './state';
import { collegeClassState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const project = (s: RecruitingState, id: string, teams: string[]) => teams.reduce((cur, t) => ok(addProjection(cur, id, t)).state, s);

describe('projections', () => {
  it('counts projections per school and shows the shares', () => {
    const s = project(collegeClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    const zion = s.recruiting.recruits[0];
    expect(zion.projections).toEqual({ TEX: 2, BAY: 1 });
    expect(projectionShares(zion)).toEqual([{ teamId: 'TEX', count: 2, pct: 67 }, { teamId: 'BAY', count: 1, pct: 33 }]);
    expect(formatShares(zion, t => t)).toBe('67% TEX · 33% BAY');
    expect(addProjection(collegeClassState(), 'p01914', 'TEX')).toMatchObject({ ok: true, changed: ['recruiting'], label: 'Project Zion Carter to Texas' });
  });

  it('removes one projection at a time and drops a school at zero', () => {
    let s = project(collegeClassState(), 'p01914', ['TEX', 'TEX', 'BAY']);
    s = ok(removeProjection(s, 'p01914', 'TEX')).state;
    s = ok(removeProjection(s, 'p01914', 'BAY')).state;
    expect(s.recruiting.recruits[0].projections).toEqual({ TEX: 1 });
    expect(removeProjection(s, 'p01914', 'BAY')).toEqual({ ok: false, problems: ['Zion Carter has no Baylor projection'] });
  });

  it('refuses unknown schools and players, and committed players', () => {
    const s = collegeClassState();
    expect(addProjection(s, 'p01914', 'XYZ')).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    expect(addProjection(s, 'p09999', 'TEX')).toEqual({ ok: false, problems: ["p09999 isn't on the recruiting board"] });
    const committed = ok(commit(s, 'p01914', 'DUKE', ctx)).state;
    expect(addProjection(committed, 'p01914', 'TEX')).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
  });
});

describe('commit', () => {
  it('fills an open spot', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'DUKE', ctx));
    expect(r.label).toBe('Zion Carter commits to Duke');
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.state.rosters.teams.DUKE[0]).toEqual({ playerId: 'p01914', position: 'PG', rating: null, age: null, points: 0, stars: null, classYear: 'Fr' });
    expect(r.state.recruiting.recruits[0].committedTo).toBe('DUKE');
    expect(r.state.recruiting.portal).toEqual([]);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'commit', teams: ['DUKE'], lines: ['Zion Carter (PG) commits to Duke'] });
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
    expect(RostersFile.safeParse(r.state.rosters).success).toBe(true);
  });

  it('shows the stars once the recruit has them', () => {
    const s = collegeClassState();
    const starred = { ...s, recruiting: { ...s.recruiting, recruits: s.recruiting.recruits.map(p => ({ ...p, stars: 5, rating: 88 })) } };
    const r = ok(commit(starred, 'p01914', 'DUKE', ctx));
    expect(r.state.tx.entries.at(-1)!.lines).toEqual(['Zion Carter (5★ PG) commits to Duke']);
    expect(r.state.rosters.teams.DUKE[0]).toMatchObject({ rating: 88, stars: 5 });
  });

  it('sends the returning player at that spot to the transfer portal', () => {
    const r = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx));
    expect(r.state.rosters.teams.BAY[0].playerId).toBe('p01914');
    expect(r.state.recruiting.portal).toEqual([
      { playerId: 'p00485', position: 'PG', classYear: 'So', rating: 82, stars: 4, projections: {}, committedTo: null, fromTeam: 'BAY' },
    ]);
    expect(r.state.tx.entries.slice(-2).map(e => [e.type, e.teams, e.lines])).toEqual([
      ['portal', ['BAY'], ['Jaden Moss (So PG, 82) enters the transfer portal from Baylor']],
      ['commit', ['BAY'], ['Zion Carter (PG) commits to Baylor']],
    ]);
    expect(RecruitingFile.safeParse(r.state.recruiting).success).toBe(true);
  });

  it('calls an unnamed returning player X', () => {
    const r = ok(commit(collegeClassState(), 'p01915', 'DUKE', ctx));
    expect(r.state.tx.entries.at(-2)!.lines).toEqual(['X (So SG, 60) enters the transfer portal from Duke']);
  });

  it('refuses to displace a player who committed this cycle (7a-3)', () => {
    const s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    expect(commit(s, 'p00485', 'BAY', ctx)).toEqual({ ok: false, problems: ['Baylor already has Zion Carter committed at PG. Decommit them first'] });
  });

  it('lets a transfer commit to another school', () => {
    let s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    s = ok(commit(s, 'p00485', 'DUKE', ctx)).state;
    expect(s.rosters.teams.DUKE[0]).toEqual({ playerId: 'p00485', position: 'PG', rating: 82, age: null, points: 0, stars: 4, classYear: 'So' });
    expect(s.recruiting.portal[0].committedTo).toBe('DUKE');
    expect(s.tx.entries.at(-1)!.lines).toEqual(['Jaden Moss (So PG, transfer from Baylor) commits to Duke']);
  });

  it('refuses a second commit, an unknown school and a locked board', () => {
    const s = ok(commit(collegeClassState(), 'p01914', 'DUKE', ctx)).state;
    expect(commit(s, 'p01914', 'TEX', ctx)).toEqual({ ok: false, problems: ['Zion Carter has already committed to Duke'] });
    expect(commit(collegeClassState(), 'p01914', 'XYZ', ctx)).toEqual({ ok: false, problems: ['Unknown school XYZ'] });
    const c = collegeClassState();
    expect(commit({ ...c, recruiting: { ...c.recruiting, locked: true } }, 'p01914', 'DUKE', ctx))
      .toEqual({ ok: false, problems: ['Recruiting for this class is finished'] });
  });
});

describe('commitPreview', () => {
  it('says what happens at the chosen school', () => {
    const s = collegeClassState();
    expect(commitPreview(s, 'p01914', 'DUKE')).toEqual({ ok: true, text: 'Open spot' });
    expect(commitPreview(s, 'p01914', 'BAY')).toEqual({ ok: true, text: 'Jaden Moss (So, 82) will enter the portal' });
    expect(commitPreview(s, 'p01914', 'XYZ')).toEqual({ ok: false, text: 'Unknown school XYZ' });
    const c = ok(commit(s, 'p01914', 'BAY', ctx)).state;
    expect(commitPreview(c, 'p00485', 'BAY')).toEqual({ ok: false, text: 'Baylor already has Zion Carter committed at PG. Decommit them first' });
  });
});

describe('decommit', () => {
  it('opens the spot, keeps the projections, and leaves a displaced player in the portal', () => {
    let s = project(collegeClassState(), 'p01914', ['BAY']);
    s = ok(commit(s, 'p01914', 'BAY', ctx)).state;
    const r = ok(decommit(s, 'p01914', ctx));
    expect(r.label).toBe('Zion Carter decommits from Baylor');
    expect(r.changed).toEqual(['recruiting', 'rosters', 'tx']);
    expect(r.state.rosters.teams.BAY[0]).toEqual(collegeHole('PG'));
    expect(r.state.recruiting.recruits[0]).toMatchObject({ committedTo: null, projections: { BAY: 1 } });
    expect(r.state.recruiting.portal.map(p => p.playerId)).toEqual(['p00485']);
    expect(r.state.tx.entries.at(-1)).toMatchObject({ type: 'commit', teams: ['BAY'], lines: ['Zion Carter decommits from Baylor'] });
  });

  it('refuses a player who has not committed', () => {
    expect(decommit(collegeClassState(), 'p01914', ctx)).toEqual({ ok: false, problems: ["Zion Carter hasn't committed"] });
  });
});

describe('uncommitted and the FBAJC gate', () => {
  it('counts recruits and portal players without a commitment', () => {
    expect(fbajcGateProblem(null)).toBeNull();
    expect(fbajcGateProblem(collegeClassState().recruiting)).toBe("3 recruits and 0 portal players haven't committed yet");
    let s = ok(commit(collegeClassState(), 'p01914', 'BAY', ctx)).state;
    const open = uncommitted(s.recruiting);
    expect(open.recruits.map(p => p.playerId)).toEqual(['p01915', 'p01916']);
    expect(open.portal.map(p => p.playerId)).toEqual(['p00485']);
    expect(fbajcGateProblem(s.recruiting)).toBe("2 recruits and 1 portal player haven't committed yet");
    for (const [id, t] of [['p00485', 'DUKE'], ['p01915', 'BAY'], ['p01916', 'DUKE']] as const) s = ok(commit(s, id, t, ctx)).state;
    expect(fbajcGateProblem(s.recruiting)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/college/board.test.ts`
Expected: FAIL: `addProjection` and the other board functions aren't exported.

- [ ] **Step 3: Implement the board half**

In `web/engine/college/recruiting.ts`, extend the imports:

```ts
import { appendTx, withTeam, type MoveContext } from '../roster/state';
import type { ClassDraftRow, PortalPlayer, Position, Prospect, RecruitingFile, RosterEntry } from '../shared/types';
import { collegeHole } from './setup';
import { collegeName, recruitingFail, schoolName, type RecruitingDocKey, type RecruitingResult, type RecruitingState } from './state';
```

Then append:

```ts
type OnBoard = { list: 'recruit'; p: Prospect } | { list: 'portal'; p: PortalPlayer };

function onBoard(doc: RecruitingFile, playerId: string): OnBoard | null {
  const recruit = doc.recruits.find(p => p.playerId === playerId);
  if (recruit) return { list: 'recruit', p: recruit };
  const transfer = doc.portal.find(p => p.playerId === playerId);
  return transfer ? { list: 'portal', p: transfer } : null;
}

/** Applies a change to one prospect, wherever they are on the board. */
function withProspect(doc: RecruitingFile, playerId: string, change: (p: Prospect) => Prospect): RecruitingFile {
  return {
    ...doc,
    recruits: doc.recruits.map(p => (p.playerId === playerId ? change(p) : p)),
    portal: doc.portal.map(p => (p.playerId === playerId ? { ...p, ...change(p) } : p)),
  };
}

/** True when this player is a recruit or transfer who committed this cycle. */
function committedThisCycle(doc: RecruitingFile, playerId: string): boolean {
  return [...doc.recruits, ...doc.portal].some(p => p.playerId === playerId && p.committedTo !== null);
}

type BoardCheck = { ok: true; found: OnBoard; name: string; school: string } | { ok: false; problems: string[] };

/** The checks every projection and commit shares: an open board, an uncommitted player on it, and a known school. */
function boardCheck(state: RecruitingState, playerId: string, teamId: string): BoardCheck {
  if (state.recruiting.locked) return { ok: false, problems: [LOCKED] };
  const found = onBoard(state.recruiting, playerId);
  if (!found) return { ok: false, problems: [`${playerId} isn't on the recruiting board`] };
  const name = collegeName(state.players, playerId);
  if (found.p.committedTo) return { ok: false, problems: [`${name} has already committed to ${schoolName(state, found.p.committedTo)}`] };
  if (!state.teams.teams.some(t => t.teamId === teamId)) return { ok: false, problems: [`Unknown school ${teamId}`] };
  return { ok: true, found, name, school: schoolName(state, teamId) };
}

export function addProjection(state: RecruitingState, playerId: string, teamId: string): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const recruiting = withProspect(state.recruiting, playerId, p => ({ ...p, projections: { ...p.projections, [teamId]: (p.projections[teamId] ?? 0) + 1 } }));
  return { ok: true, state: { ...state, recruiting }, changed: ['recruiting'], label: `Project ${check.name} to ${check.school}` };
}

export function removeProjection(state: RecruitingState, playerId: string, teamId: string): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const count = check.found.p.projections[teamId] ?? 0;
  if (!count) return recruitingFail([`${check.name} has no ${check.school} projection`]);
  const recruiting = withProspect(state.recruiting, playerId, p => {
    const { [teamId]: _last, ...rest } = p.projections;
    return { ...p, projections: count > 1 ? { ...p.projections, [teamId]: count - 1 } : rest };
  });
  return { ok: true, state: { ...state, recruiting }, changed: ['recruiting'], label: `Remove a ${check.school} projection for ${check.name}` };
}

/** Each projected school's share of the player's projections, most first. */
export function projectionShares(p: Prospect): { teamId: string; count: number; pct: number }[] {
  const total = Object.values(p.projections).reduce((a, b) => a + b, 0);
  return Object.entries(p.projections)
    .map(([teamId, count]) => ({ teamId, count, pct: Math.round((100 * count) / total) }))
    .sort((a, b) => b.count - a.count || a.teamId.localeCompare(b.teamId));
}

/** "67% TEX · 33% UH". */
export function formatShares(p: Prospect, abbr: (teamId: string) => string): string {
  return projectionShares(p).map(s => `${s.pct}% ${abbr(s.teamId)}`).join(' · ');
}

type Slot = { ok: true; index: number; displaced: RosterEntry | null } | { ok: false; problem: string };

/** The slot at the player's position on that school's roster, and who would have to leave it. */
function slotFor(state: RecruitingState, p: Prospect, teamId: string, school: string): Slot {
  const entries = state.rosters.teams[teamId];
  if (!entries) return { ok: false, problem: `${school} has no roster` };
  const index = entries.findIndex(e => e.position === p.position);
  if (index < 0) return { ok: false, problem: `${school} has no ${p.position} spot` };
  const holder = entries[index];
  if (holder.playerId === null) return { ok: true, index, displaced: null };
  const holderName = collegeName(state.players, holder.playerId);
  if (committedThisCycle(state.recruiting, holder.playerId)) {
    return { ok: false, problem: `${school} already has ${holderName} committed at ${p.position}. Decommit them first` };
  }
  if (!holder.classYear) return { ok: false, problem: `${holderName} has no class year` };
  return { ok: true, index, displaced: holder };
}

const ratingNote = (rating: number | null) => (rating !== null ? `, ${rating}` : '');

/** What committing to this school would do: "Open spot", "Name (Jr, 78) will enter the portal", or why it's refused. */
export function commitPreview(state: RecruitingState, playerId: string, teamId: string): { ok: true; text: string } | { ok: false; text: string } {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return { ok: false, text: check.problems.join('; ') };
  const slot = slotFor(state, check.found.p, teamId, check.school);
  if (!slot.ok) return { ok: false, text: slot.problem };
  if (!slot.displaced) return { ok: true, text: 'Open spot' };
  const d = slot.displaced;
  return { ok: true, text: `${collegeName(state.players, d.playerId!)} (${d.classYear}${ratingNote(d.rating)}) will enter the portal` };
}

/**
 * The player commits: they take the slot at their position. A returning player in that slot enters the transfer portal
 * (D12); a player who committed this cycle can't be displaced (7a-3).
 */
export function commit(state: RecruitingState, playerId: string, teamId: string, ctx: MoveContext): RecruitingResult {
  const check = boardCheck(state, playerId, teamId);
  if (!check.ok) return check;
  const { found, name, school } = check;
  const p = found.p;
  const slot = slotFor(state, p, teamId, school);
  if (!slot.ok) return recruitingFail([slot.problem]);
  let recruiting = state.recruiting;
  let tx = state.tx;
  if (slot.displaced) {
    const d = slot.displaced;
    const dId = d.playerId!;
    const transfer: PortalPlayer = {
      playerId: dId, position: d.position, classYear: d.classYear!, rating: d.rating, stars: d.stars ?? null, projections: {}, committedTo: null, fromTeam: teamId,
    };
    recruiting = { ...recruiting, portal: [...recruiting.portal, transfer] };
    tx = appendTx(tx, ctx, 'portal', [teamId], [
      `${collegeName(state.players, dId)} (${d.classYear} ${d.position}${ratingNote(d.rating)}) enters the transfer portal from ${school}`,
    ]);
  }
  const entry: RosterEntry = { playerId, position: p.position, rating: p.rating, age: null, points: 0, stars: p.stars, classYear: p.classYear };
  const rosters = withTeam(state.rosters, teamId, state.rosters.teams[teamId].map((e, i) => (i === slot.index ? entry : e)));
  recruiting = withProspect(recruiting, playerId, x => ({ ...x, committedTo: teamId }));
  const what = found.list === 'portal'
    ? `${p.classYear} ${p.position}, transfer from ${schoolName(state, found.p.fromTeam)}`
    : `${p.stars !== null ? `${p.stars}★ ` : ''}${p.position}`;
  tx = appendTx(tx, ctx, 'commit', [teamId], [`${name} (${what}) commits to ${school}`]);
  return { ok: true, state: { ...state, recruiting, rosters, tx }, changed: ['recruiting', 'rosters', 'tx'], label: `${name} commits to ${school}` };
}

/** The player decommits: their slot becomes a hole; projections are kept; anyone they displaced stays in the portal (7a-2). */
export function decommit(state: RecruitingState, playerId: string, ctx: MoveContext): RecruitingResult {
  if (state.recruiting.locked) return recruitingFail([LOCKED]);
  const found = onBoard(state.recruiting, playerId);
  if (!found) return recruitingFail([`${playerId} isn't on the recruiting board`]);
  const name = collegeName(state.players, playerId);
  const teamId = found.p.committedTo;
  if (!teamId) return recruitingFail([`${name} hasn't committed`]);
  const school = schoolName(state, teamId);
  const entries = state.rosters.teams[teamId] ?? [];
  const index = entries.findIndex(e => e.playerId === playerId);
  if (index < 0) return recruitingFail([`${name} isn't on ${school}'s roster`]);
  const rosters = withTeam(state.rosters, teamId, entries.map((e, i) => (i === index ? collegeHole(e.position) : e)));
  const recruiting = withProspect(state.recruiting, playerId, x => ({ ...x, committedTo: null }));
  const tx = appendTx(state.tx, ctx, 'commit', [teamId], [`${name} decommits from ${school}`]);
  return { ok: true, state: { ...state, recruiting, rosters, tx }, changed: ['recruiting', 'rosters', 'tx'], label: `${name} decommits from ${school}` };
}

/** Recruits and portal players with no commitment yet. */
export function uncommitted(doc: RecruitingFile): { recruits: Prospect[]; portal: PortalPlayer[] } {
  return { recruits: doc.recruits.filter(p => !p.committedTo), portal: doc.portal.filter(p => !p.committedTo) };
}

/** Why the FBAJC step can't be marked done yet, or null (also null when there is no recruiting doc). */
export function fbajcGateProblem(doc: RecruitingFile | null): string | null {
  if (!doc) return null;
  const open = uncommitted(doc);
  const r = open.recruits.length;
  const m = open.portal.length;
  if (!r && !m) return null;
  return `${r} ${r === 1 ? 'recruit' : 'recruits'} and ${m} ${m === 1 ? 'portal player' : 'portal players'} haven't committed yet`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/college`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 6: Commit**

```bash
git add web/engine/college
git commit -m "feat: recruiting board moves (projections, commit with portal displacement, decommit, FBAJC gate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Class tab

**Files:**
- Create: `web/app/college/ClassTab.tsx`
- Create: `web/app/college/college.css`
- Test: `web/app/college/ClassTab.test.tsx`

**Interfaces:**
- **Consumes:** `parseClassList`, `addDraftRow`, `appendDraftRows`, `editDraftRow`, `removeDraftRow`, `draftCounts`, `createClass`, `editRecruit`, `removeRecruit` (Task 6); `RecruitingState`, `RecruitingResult`, `collegeName`, `schoolName` (Task 6); `collegeBaseState`, `collegeClassState`, `CLASS_DRAFT` fixtures; `newBatchId` from `web/app/roster/commit.ts`; `POSITIONS`.
- **Produces:**

```ts
export function ClassTab(props: {
  state: RecruitingState;
  saving: boolean;
  /** Applies a change to the recruiting doc (autosaved by the page). */
  onDraft: (change: (current: RecruitingFile) => RecruitingFile) => void;
  /** Saves a move's result as one batch (the page shows refusals). */
  onRun: (result: RecruitingResult) => void;
}): JSX.Element;
```

- Before the class exists: rows with inputs `Name <k>` and selects `Position <k>`, buttons `Remove row <k>`, `Add recruit`, a textarea `Paste list` with `Add pasted`, the list `Lines that weren't added`, the count line `PG 1 · SG 1 · SF 0 · PF 1 · C 0 · 3 total`, and `Create class`.
- After: one row per recruit with the input `Name of <name>`, the select `Position of <name>`, a status (`Open`, `Projected`, `Committed: Duke`) and `Remove <name>`.
- `web/app/college/college.css` holds the styles for this tab and the Board (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `web/app/college/ClassTab.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { CLASS_DRAFT, collegeBaseState, collegeClassState } from '../../engine/college/testFixtures';
import type { RecruitingFile } from '../../engine/shared/types';
import { ClassTab } from './ClassTab';

afterEach(cleanup);

/** Holds the state like the page does: draft edits change the recruiting doc; successful moves replace the state. */
function Harness({ initial, runs }: { initial: RecruitingState; runs: RecruitingResult[] }) {
  const [state, setState] = useState(initial);
  const onDraft = (change: (cur: RecruitingFile) => RecruitingFile) => setState(s => ({ ...s, recruiting: change(s.recruiting) }));
  const onRun = (r: RecruitingResult) => {
    runs.push(r);
    if (r.ok) setState(r.state);
  };
  return <ClassTab state={state} saving={false} onDraft={onDraft} onRun={onRun} />;
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('ClassTab before the class exists', () => {
  it('adds rows, saves a name on blur, changes positions and counts them', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    expect(screen.getByText('PG 0 · SG 0 · SF 0 · PF 0 · C 0 · 0 total')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create class' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add recruit' }));
    fireEvent.change(input('Name 1'), { target: { value: 'Zion Carter' } });
    fireEvent.blur(input('Name 1'));
    fireEvent.change(screen.getByLabelText('Position 1'), { target: { value: 'SF' } });
    expect(screen.getByText('PG 0 · SG 0 · SF 1 · PF 0 · C 0 · 1 total')).toBeTruthy();
    expect(input('Name 1').value).toBe('Zion Carter');
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(screen.queryByLabelText('Name 1')).toBeNull();
  });

  it('adds a pasted list and lists back the lines it could not read', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    fireEvent.change(screen.getByLabelText('Paste list'), { target: { value: 'Zion Carter, PG\nnope\nMalik Ford\tSG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted' }));
    expect(input('Name 1').value).toBe('Zion Carter');
    expect(input('Name 2').value).toBe('Malik Ford');
    expect((screen.getByLabelText('Position 2') as HTMLSelectElement).value).toBe('SG');
    expect(within(screen.getByRole('list', { name: "Lines that weren't added" })).getByText('nope')).toBeTruthy();
    expect((screen.getByLabelText('Paste list') as HTMLTextAreaElement).value).toBe('nope');
  });

  it('creates the class as one move', () => {
    const runs: RecruitingResult[] = [];
    const s = collegeBaseState();
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }} runs={runs} />);
    expect(screen.getByText('PG 1 · SG 1 · SF 0 · PF 1 · C 0 · 3 total')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: true, label: 'Create S80 class' });
    expect(screen.getByLabelText('Name of Zion Carter')).toBeTruthy();
  });
});

describe('ClassTab after the class exists', () => {
  it('renames and repositions an open recruit, and removes one only without projections or a commitment', () => {
    const runs: RecruitingResult[] = [];
    const s = collegeClassState();
    const recruits = s.recruiting.recruits.map(p =>
      (p.playerId === 'p01915' ? { ...p, projections: { TEX: 1 } } : p.playerId === 'p01916' ? { ...p, committedTo: 'DUKE' } : p));
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, recruits } }} runs={runs} />);
    expect((screen.getByRole('button', { name: 'Remove Malik Ford' }) as HTMLButtonElement).disabled).toBe(true);
    expect(input('Name of Eli Grant').disabled).toBe(true);
    expect(screen.getByText('Committed: Duke')).toBeTruthy();
    expect(screen.getByText('Projected')).toBeTruthy();
    fireEvent.change(input('Name of Zion Carter'), { target: { value: 'Zion Carver' } });
    fireEvent.blur(input('Name of Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Edit Zion Carver', changed: ['players'] });
    fireEvent.change(screen.getByLabelText('Position of Zion Carver'), { target: { value: 'SG' } });
    expect(runs.at(-1)).toMatchObject({ ok: true, changed: ['recruiting'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Zion Carver' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Remove Zion Carver from the class' });
    expect(screen.queryByLabelText('Name of Zion Carver')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/college/ClassTab.test.tsx`
Expected: FAIL: `./ClassTab` doesn't exist.

- [ ] **Step 3: Implement**

Create `web/app/college/college.css`:

```css
.board-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.board-table th, .board-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }
.board-table .n { text-align: right; }
.board-table .actions { white-space: nowrap; }
.board-table input[type='text'], .college-search {
  padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit;
}
.paste { width: 100%; max-width: 480px; min-height: 90px; font: inherit; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.shares { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.tag-x { margin-left: 4px; border: 0; background: none; color: var(--muted); cursor: pointer; font-weight: 700; padding: 0; }
.picker { margin: 8px 0; }
.picker h4 { margin: 8px 0 4px; font-size: 12px; color: var(--muted); }
.picker-preview { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
```

Create `web/app/college/ClassTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  addDraftRow, appendDraftRows, createClass, draftCounts, editDraftRow, editRecruit, parseClassList, removeDraftRow, removeRecruit,
} from '../../engine/college/recruiting';
import { collegeName, schoolName, type RecruitingResult, type RecruitingState } from '../../engine/college/state';
import { POSITIONS } from '../../engine/roster/rules';
import type { Position, RecruitingFile } from '../../engine/shared/types';
import { newBatchId } from '../roster/commit';
import '../pages/roster.css';
import './college.css';

interface Props {
  state: RecruitingState;
  saving: boolean;
  /** Applies a change to the recruiting doc (autosaved by the page). */
  onDraft: (change: (current: RecruitingFile) => RecruitingFile) => void;
  /** Saves a move's result as one batch (the page shows refusals). */
  onRun: (result: RecruitingResult) => void;
}

/** A text box that saves on blur (or Enter), like the rating box. */
function TextField({ label, value, disabled, onSave }: { label: string; value: string; disabled: boolean; onSave: (value: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      type="text" aria-label={label} value={text} disabled={disabled}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (text !== value) onSave(text); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function PositionSelect({ label, value, disabled, onChange }: { label: string; value: Position; disabled: boolean; onChange: (p: Position) => void }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value as Position)}>
      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

/** Create S{n+1} Class: the class draft (names and positions) until "Create class", then the recruit list. */
export function ClassTab({ state, saving, onDraft, onRun }: Props) {
  const [paste, setPaste] = useState('');
  const [bad, setBad] = useState<string[]>([]);
  const doc = state.recruiting;
  if (doc.created) return <CreatedClass state={state} saving={saving} onRun={onRun} />;
  const locked = doc.locked;
  const counts = draftCounts(doc);
  const addPasted = () => {
    const parsed = parseClassList(paste);
    if (parsed.rows.length) onDraft(cur => appendDraftRows(cur, parsed.rows));
    setBad(parsed.bad);
    setPaste(parsed.bad.join('\n'));
  };
  return (
    <div>
      <p className="muted">
        Enter the S{doc.classOf} class: a name and a position for each recruit. Ratings and stars come at Rank S{doc.classOf} Class.
      </p>
      <p>{`${POSITIONS.map(p => `${p} ${counts[p]}`).join(' · ')} · ${doc.classDraft.length} total`}</p>
      <div className="table-wrap">
        <table className="board-table" aria-label="Class draft">
          <thead><tr><th className="n">#</th><th>Name</th><th>Pos</th><th><span className="muted">Remove</span></th></tr></thead>
          <tbody>
            {doc.classDraft.map((r, i) => (
              <tr key={i}>
                <td className="n">{i + 1}</td>
                <td><TextField label={`Name ${i + 1}`} value={r.name} disabled={locked} onSave={v => onDraft(cur => editDraftRow(cur, i, { name: v }))} /></td>
                <td><PositionSelect label={`Position ${i + 1}`} value={r.position} disabled={locked} onChange={p => onDraft(cur => editDraftRow(cur, i, { position: p }))} /></td>
                <td><button type="button" className="btn" aria-label={`Remove row ${i + 1}`} disabled={locked} onClick={() => onDraft(cur => removeDraftRow(cur, i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button type="button" className="btn" disabled={locked} onClick={() => onDraft(cur => addDraftRow(cur, { name: '', position: 'PG' }))}>Add recruit</button>
      </div>
      <h3>Paste list</h3>
      <p className="muted">One recruit per line: "Name, POS" or "Name", a tab, then "POS".</p>
      <textarea className="paste" aria-label="Paste list" value={paste} disabled={locked} onChange={e => setPaste(e.target.value)} />
      <div className="toolbar">
        <button type="button" className="btn" disabled={locked || !paste.trim()} onClick={addPasted}>Add pasted</button>
      </div>
      {bad.length > 0 && (
        <>
          <p className="error">These lines weren't added:</p>
          <ul className="problems" aria-label="Lines that weren't added">{bad.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </>
      )}
      <div className="toolbar">
        <button
          type="button" className="btn primary" disabled={saving || locked || doc.classDraft.length === 0}
          onClick={() => onRun(createClass(state, { batchId: newBatchId() }))}
        >
          Create class
        </button>
      </div>
    </div>
  );
}

function CreatedClass({ state, saving, onRun }: { state: RecruitingState; saving: boolean; onRun: (result: RecruitingResult) => void }) {
  const doc = state.recruiting;
  return (
    <div>
      <p className="muted">
        The S{doc.classOf} class has {doc.recruits.length} recruits. Rename a recruit or change a position while they are uncommitted; remove one only
        before any projections.
      </p>
      <div className="table-wrap">
        <table className="board-table" aria-label="Class">
          <thead><tr><th>Name</th><th>Pos</th><th>Status</th><th><span className="muted">Remove</span></th></tr></thead>
          <tbody>
            {doc.recruits.map(p => {
              const name = collegeName(state.players, p.playerId);
              const fixed = doc.locked || p.committedTo !== null;
              const projected = Object.keys(p.projections).length > 0;
              return (
                <tr key={p.playerId}>
                  <td><TextField label={`Name of ${name}`} value={name} disabled={fixed || saving} onSave={v => onRun(editRecruit(state, p.playerId, { name: v }))} /></td>
                  <td><PositionSelect label={`Position of ${name}`} value={p.position} disabled={fixed || saving} onChange={pos => onRun(editRecruit(state, p.playerId, { position: pos }))} /></td>
                  <td>{p.committedTo ? `Committed: ${schoolName(state, p.committedTo)}` : projected ? 'Projected' : 'Open'}</td>
                  <td>
                    <button
                      type="button" className="btn" aria-label={`Remove ${name}`} disabled={fixed || projected || saving}
                      title={p.committedTo ? 'Decommit first' : projected ? 'Remove the projections first' : undefined}
                      onClick={() => onRun(removeRecruit(state, p.playerId))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/college/ClassTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 6: Commit**

```bash
git add web/app/college
git commit -m "feat: Class tab (class draft with paste, Create class, rename and remove recruits)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Board tab

**Files:**
- Create: `web/app/college/BoardTab.tsx`
- Test: `web/app/college/BoardTab.test.tsx`

**Interfaces:**
- **Consumes:** `addProjection`, `removeProjection`, `projectionShares`, `commit`, `commitPreview`, `decommit`, `uncommitted` (Task 7); `RecruitingState`, `RecruitingResult`, `collegeName`, `schoolName`, `schoolAbbr` (Task 6); `groupLabel` from `web/engine/shared/leagues.ts` (`B12` → `Big 12`); `college.css` (Task 8); `newBatchId`.
- **Produces:**

```ts
export function BoardTab(props: { state: RecruitingState; saving: boolean; onRun: (result: RecruitingResult) => void }): JSX.Element;
```

- Accessible names the tests (and Task 10) use: tables `Class of S80` and `Transfer portal`; the count line `0 of 3 committed · 0 in the portal`; per row buttons `Add a projection for <name>`, `Commit <name>`, `Decommit <name>`, and on each projection tag `Remove a <ABBR> projection for <name>`; the picker is a `dialog` named `Project <name>` or `Commit <name>` with the search box `Search schools`, school buttons named by school, the headings `Projected` (commit only) and each conference, and `Confirm commit` / `Close`; the filters are the chips `All`, `PG` … `C`, `Everyone`, `Uncommitted`, `Committed` and the box `Search names`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/college/BoardTab.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { addProjection, commit } from '../../engine/college/recruiting';
import type { RecruitingResult, RecruitingState } from '../../engine/college/state';
import { collegeBaseState, collegeClassState } from '../../engine/college/testFixtures';
import { BoardTab } from './BoardTab';

afterEach(cleanup);

function Harness({ initial, runs }: { initial: RecruitingState; runs: RecruitingResult[] }) {
  const [state, setState] = useState(initial);
  const onRun = (r: RecruitingResult) => {
    runs.push(r);
    if (r.ok) setState(r.state);
  };
  return <MemoryRouter><BoardTab state={state} saving={false} onRun={onRun} /></MemoryRouter>;
}

const ok = (r: RecruitingResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.state;
};
const names = (table: string) => within(screen.getByRole('table', { name: table })).queryAllByRole('row').slice(1)
  .map(r => (r as HTMLTableRowElement).cells[0].textContent);
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('BoardTab', () => {
  it('asks for the class first', () => {
    render(<Harness initial={collegeBaseState()} runs={[]} />);
    expect(screen.getByText(/Create the S80 class first/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Go to the class/ }).getAttribute('href')).toBe('/league/fbajc/recruiting?tab=class');
  });

  it('shows the counts and the projections as shares', () => {
    let s = collegeClassState();
    for (const t of ['TEX', 'TEX', 'BAY']) s = ok(addProjection(s, 'p01914', t));
    render(<Harness initial={s} runs={[]} />);
    expect(screen.getByText('0 of 3 committed · 0 in the portal')).toBeTruthy();
    expect(names('Class of S80')).toEqual(['Zion Carter', 'Malik Ford', 'Eli Grant']);
    const zion = screen.getByText('Zion Carter').closest('tr')!;
    expect(within(zion).getByText('67% TEX')).toBeTruthy();
    expect(within(zion).getByText('33% BAY')).toBeTruthy();
    expect(screen.getByText('Nobody is in the portal.')).toBeTruthy();
  });

  it('adds a projection with the school picker, and removes one', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={collegeClassState()} runs={runs} />);
    fireEvent.click(button('Add a projection for Zion Carter'));
    const dialog = screen.getByRole('dialog', { name: 'Project Zion Carter' });
    fireEvent.change(within(dialog).getByLabelText('Search schools'), { target: { value: 'tex' } });
    expect(within(dialog).queryByRole('button', { name: 'Baylor' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Texas' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Project Zion Carter to Texas' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('100% TEX')).toBeTruthy();
    fireEvent.click(button('Remove a TEX projection for Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Remove a Texas projection for Zion Carter' });
  });

  it('commits through the picker, listing projected schools first and saying who would leave', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={ok(addProjection(collegeClassState(), 'p01914', 'BAY'))} runs={runs} />);
    fireEvent.click(button('Commit Zion Carter'));
    const dialog = screen.getByRole('dialog', { name: 'Commit Zion Carter' });
    expect(within(dialog).getAllByRole('heading').map(h => h.textContent)).toEqual(['Commit · Zion Carter', 'Projected', 'Big 12', 'ACC']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duke' }));
    expect(within(dialog).getByText('Open spot')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Baylor' }));
    expect(within(dialog).getByText('Jaden Moss (So, 82) will enter the portal')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm commit' }));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Zion Carter commits to Baylor' });
    expect(screen.getByText('Committed: Baylor')).toBeTruthy();
    expect(screen.getByText('1 of 3 committed · 1 in the portal')).toBeTruthy();
    expect(names('Transfer portal')).toEqual(['Jaden Moss']);
  });

  it('refuses in the picker to displace someone who committed this cycle', () => {
    render(<Harness initial={ok(commit(collegeClassState(), 'p01914', 'BAY', { batchId: 't' }))} runs={[]} />);
    fireEvent.click(button('Commit Jaden Moss'));
    const dialog = screen.getByRole('dialog', { name: 'Commit Jaden Moss' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Baylor' }));
    expect(within(dialog).getByText('Baylor already has Zion Carter committed at PG. Decommit them first')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Confirm commit' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('decommits', () => {
    const runs: RecruitingResult[] = [];
    render(<Harness initial={ok(commit(collegeClassState(), 'p01914', 'BAY', { batchId: 't' }))} runs={runs} />);
    fireEvent.click(button('Decommit Zion Carter'));
    expect(runs.at(-1)).toMatchObject({ ok: true, label: 'Zion Carter decommits from Baylor' });
    expect(button('Commit Zion Carter')).toBeTruthy();
  });

  it('filters by position, commitment and name', () => {
    render(<Harness initial={ok(commit(collegeClassState(), 'p01914', 'DUKE', { batchId: 't' }))} runs={[]} />);
    fireEvent.click(button('SG'));
    expect(names('Class of S80')).toEqual(['Malik Ford']);
    fireEvent.click(button('All'));
    fireEvent.click(button('Committed'));
    expect(names('Class of S80')).toEqual(['Zion Carter']);
    fireEvent.click(button('Uncommitted'));
    expect(names('Class of S80')).toEqual(['Malik Ford', 'Eli Grant']);
    fireEvent.click(button('Everyone'));
    fireEvent.change(screen.getByLabelText('Search names'), { target: { value: 'eli' } });
    expect(names('Class of S80')).toEqual(['Eli Grant']);
  });

  it('is read-only once locked', () => {
    const s = collegeClassState();
    render(<Harness initial={{ ...s, recruiting: { ...s.recruiting, locked: true } }} runs={[]} />);
    expect(screen.queryByRole('button', { name: /^(Commit|Add a projection for) / })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/college/BoardTab.test.tsx`
Expected: FAIL: `./BoardTab` doesn't exist.

- [ ] **Step 3: Implement**

Create `web/app/college/BoardTab.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addProjection, commit, commitPreview, decommit, projectionShares, removeProjection, uncommitted,
} from '../../engine/college/recruiting';
import { collegeName, schoolAbbr, schoolName, type RecruitingResult, type RecruitingState } from '../../engine/college/state';
import { groupLabel } from '../../engine/shared/leagues';
import { POSITIONS } from '../../engine/roster/rules';
import type { PortalPlayer, Position, Prospect, Team } from '../../engine/shared/types';
import { newBatchId } from '../roster/commit';
import '../pages/roster.css';
import './college.css';

type Status = 'all' | 'open' | 'committed';
type Picking = { playerId: string; mode: 'project' | 'commit' };

const STATUS: [Status, string][] = [['all', 'Everyone'], ['open', 'Uncommitted'], ['committed', 'Committed']];

interface Props {
  state: RecruitingState;
  saving: boolean;
  onRun: (result: RecruitingResult) => void;
}

/** The recruiting board: the class and the transfer portal, with projections, commits and decommits. */
export function BoardTab({ state, saving, onRun }: Props) {
  const [pos, setPos] = useState<'ALL' | Position>('ALL');
  const [status, setStatus] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<Picking | null>(null);
  const doc = state.recruiting;
  if (!doc.created && doc.portal.length === 0) {
    return (
      <p className="muted">
        Create the S{doc.classOf} class first. <Link to="/league/fbajc/recruiting?tab=class">Go to the class ▸</Link>
      </p>
    );
  }
  const locked = doc.locked;
  const name = (id: string) => collegeName(state.players, id);
  const open = uncommitted(doc);
  const needle = search.trim().toLowerCase();
  const shown = (p: Prospect) =>
    (pos === 'ALL' || p.position === pos)
    && (status === 'all' || (status === 'committed') === (p.committedTo !== null))
    && name(p.playerId).toLowerCase().includes(needle);
  const run = (result: RecruitingResult) => {
    setPicking(null);
    onRun(result);
  };
  const picked = picking ? [...doc.recruits, ...doc.portal].find(p => p.playerId === picking.playerId) ?? null : null;

  const row = (p: Prospect | PortalPlayer) => (
    <tr key={p.playerId}>
      <td>{name(p.playerId)}</td>
      <td>{p.position}</td>
      <td>{p.classYear}</td>
      <td>{p.stars !== null ? `${p.stars}★` : '—'}</td>
      <td className="n">{p.rating ?? '—'}</td>
      {'fromTeam' in p && <td>{schoolName(state, p.fromTeam)}</td>}
      <td>
        {p.committedTo ? <strong>{`Committed: ${schoolName(state, p.committedTo)}`}</strong> : (
          <span className="shares">
            {projectionShares(p).map(s => (
              <span key={s.teamId} className="tag">
                {`${s.pct}% ${schoolAbbr(state, s.teamId)}`}
                {!locked && (
                  <button
                    type="button" className="tag-x" disabled={saving}
                    aria-label={`Remove a ${schoolAbbr(state, s.teamId)} projection for ${name(p.playerId)}`}
                    onClick={() => run(removeProjection(state, p.playerId, s.teamId))}
                  >
                    −
                  </button>
                )}
              </span>
            ))}
            {Object.keys(p.projections).length === 0 && <span className="muted">No projections</span>}
          </span>
        )}
      </td>
      <td className="actions">
        {!locked && !p.committedTo && (
          <>
            <button type="button" className="btn" disabled={saving} aria-label={`Add a projection for ${name(p.playerId)}`}
              onClick={() => setPicking({ playerId: p.playerId, mode: 'project' })}>+</button>{' '}
            <button type="button" className="btn" disabled={saving} aria-label={`Commit ${name(p.playerId)}`}
              onClick={() => setPicking({ playerId: p.playerId, mode: 'commit' })}>Commit</button>
          </>
        )}
        {!locked && p.committedTo && (
          <button type="button" className="btn" disabled={saving} aria-label={`Decommit ${name(p.playerId)}`}
            onClick={() => run(decommit(state, p.playerId, { batchId: newBatchId() }))}>Decommit</button>
        )}
      </td>
    </tr>
  );

  const head = (portal: boolean) => (
    <thead>
      <tr>
        <th>Name</th><th>Pos</th><th>Yr</th><th>Stars</th><th className="n">Rtg</th>{portal && <th>From</th>}<th>Projections</th>
        <th><span className="muted">Actions</span></th>
      </tr>
    </thead>
  );

  return (
    <div>
      <p className="muted">{`${doc.recruits.length - open.recruits.length} of ${doc.recruits.length} committed · ${open.portal.length} in the portal`}</p>
      <div className="chips" role="group" aria-label="Position filter">
        {(['ALL', ...POSITIONS] as ('ALL' | Position)[]).map(p => (
          <button key={p} type="button" className={`chip${pos === p ? ' on' : ''}`} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'ALL' ? 'All' : p}</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Commitment filter">
        {STATUS.map(([s, label]) => (
          <button key={s} type="button" className={`chip${status === s ? ' on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{label}</button>
        ))}
        <input className="college-search" aria-label="Search names" placeholder="Search names" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {picking && picked && (
        <SchoolPicker
          state={state} prospect={picked} mode={picking.mode} saving={saving} onClose={() => setPicking(null)}
          onPick={teamId => run(picking.mode === 'project'
            ? addProjection(state, picked.playerId, teamId)
            : commit(state, picked.playerId, teamId, { batchId: newBatchId() }))}
        />
      )}
      <h2>Class of S{doc.classOf} · {doc.recruits.length}</h2>
      <div className="table-wrap">
        <table className="board-table" aria-label={`Class of S${doc.classOf}`}>
          {head(false)}
          <tbody>{doc.recruits.filter(shown).map(row)}</tbody>
        </table>
      </div>
      <h2>Transfer portal · {doc.portal.length}</h2>
      {doc.portal.length === 0 ? <p className="muted">Nobody is in the portal.</p> : (
        <div className="table-wrap">
          <table className="board-table" aria-label="Transfer portal">
            {head(true)}
            <tbody>{doc.portal.filter(shown).map(row)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Picks a school: every school by conference (projected schools first when committing). Committing shows who holds the spot first. */
function SchoolPicker({ state, prospect, mode, saving, onPick, onClose }: {
  state: RecruitingState; prospect: Prospect; mode: 'project' | 'commit'; saving: boolean;
  onPick: (teamId: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const who = collegeName(state.players, prospect.playerId);
  const needle = query.trim().toLowerCase();
  const projected = new Set(Object.keys(prospect.projections));
  const first: Team[] = [];
  const groups = new Map<string, Team[]>();
  for (const t of state.teams.teams) {
    if (!`${t.name} ${t.abbr}`.toLowerCase().includes(needle)) continue;
    if (mode === 'commit' && projected.has(t.teamId)) first.push(t);
    else groups.set(t.group ?? '', [...(groups.get(t.group ?? '') ?? []), t]);
  }
  const byName = (a: Team, b: Team) => a.name.localeCompare(b.name);
  const preview = mode === 'commit' && chosen ? commitPreview(state, prospect.playerId, chosen) : null;
  const schoolButton = (t: Team) => (
    <button
      key={t.teamId} type="button" className={`chip${chosen === t.teamId ? ' on' : ''}`} disabled={saving}
      onClick={() => (mode === 'project' ? onPick(t.teamId) : setChosen(t.teamId))}
    >
      {t.name}
    </button>
  );
  return (
    <div className="card picker" role="dialog" aria-label={`${mode === 'project' ? 'Project' : 'Commit'} ${who}`}>
      <div className="toolbar">
        <h3>{mode === 'project' ? 'Add a projection' : 'Commit'} · {who}</h3>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <input className="college-search" aria-label="Search schools" placeholder="Search schools" value={query} onChange={e => setQuery(e.target.value)} />
      {first.length > 0 && (
        <>
          <h4>Projected</h4>
          <div className="chips">{[...first].sort(byName).map(schoolButton)}</div>
        </>
      )}
      {[...groups.entries()].map(([group, list]) => (
        <div key={group}>
          <h4>{groupLabel('fbajc', group || null)}</h4>
          <div className="chips">{[...list].sort(byName).map(schoolButton)}</div>
        </div>
      ))}
      {preview && (
        <div className="picker-preview">
          <span className={preview.ok ? undefined : 'error'}>{preview.text}</span>
          <button type="button" className="btn primary" disabled={!preview.ok || saving} onClick={() => onPick(chosen!)}>Confirm commit</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/college/BoardTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 6: Commit**

```bash
git add web/app/college
git commit -m "feat: recruiting Board tab (shares, school picker, commit preview, decommit, filters)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The recruiting page, the one-time setup panel, and the wiring

**Files:**
- Create: `web/app/college/useRecruitingState.ts`
- Create: `web/app/college/SetupPanel.tsx`
- Create: `web/app/college/RecruitingPage.tsx`
- Create: `web/app/college/testDocs.ts`
- Modify: `web/app/shell/Layout.tsx`, `web/app/components/LeagueTabs.tsx`, `web/app/stepRoutes.ts`
- Test: `web/app/college/RecruitingPage.test.tsx`, `web/app/components/LeagueTabs.test.tsx`, `web/app/stepRoutes.test.ts`

**Interfaces:**
- **Consumes:** `ClassTab` (Task 8), `BoardTab` (Task 9), `collegeSetupDocs`, `setupSummary`, `proPlayerIds` (Task 5), `emptyRecruiting`, `recruitingDocPath`, `recruitingWrites`, `RecruitingState`, `RecruitingResult` (Task 6); `useDoc`, `useSaving`, `Versions` (`web/app/api.ts`); `useAutosaveDoc`; `commitDocs`, `newBatchId`; `stubApi` from `web/app/d2/testDocs.ts`; the college fixtures.
- **Produces:**
  - `interface CollegeSetupInput { meta: MetaFile; prev: RostersFile | null; proIds: Set<string> }`;
  - `useRecruitingState(): { season?: number; state?: RecruitingState; setup?: CollegeSetupInput; versions: Versions; error?: Error }`: `state` once the S{n} college rosters exist (a missing recruiting doc becomes a memoised `emptyRecruiting(n)` with version null; a missing transactions doc becomes an empty one); otherwise `setup`;
  - `SetupPanel({ season, setup, versions })`;
  - `RecruitingPage` at `/league/fbajc/recruiting` (tabs `Board` and `Class` as links `?tab=board` / `?tab=class`; default Board once the class exists, Class before);
  - `stepRoutes`: `create-s<k>-class` → `/league/fbajc/recruiting?tab=class`;
  - FBAJC league tabs: `Teams · Recruiting`.
- Test helpers in `web/app/college/testDocs.ts`: `recruitingDocs(state, { recruiting?: boolean })` and `setupDocs(fbajcSeason = 78)`.

- [ ] **Step 1: Write the test helpers and the failing tests**

Create `web/app/college/testDocs.ts`:

```ts
import type { RecruitingState } from '../../engine/college/state';
import { collegeBaseState, collegePros, collegeS78Rosters } from '../../engine/college/testFixtures';

const meta = (fbajc: number) => ({
  currentSeason: 79,
  rosterSeason: { fba: 79, fbad2: 79, fbajc, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
});

/** Every document the recruiting page loads once the S79 college rosters exist. `recruiting: false` leaves the recruiting doc out (404). */
export function recruitingDocs(state: RecruitingState, options: { recruiting?: boolean } = {}): Record<string, unknown> {
  const { fba, d2 } = collegePros();
  const out: Record<string, unknown> = {
    'meta.json': meta(79),
    'players.json': state.players,
    'calendar.json': state.calendar,
    'leagues/fbajc/teams.json': state.teams,
    'leagues/fbajc/S79/rosters.json': state.rosters,
    'leagues/fbajc/S79/transactions.json': state.tx,
    'leagues/fbajc/S78/rosters.json': collegeS78Rosters(),
    'leagues/fba/S79/rosters.json': fba,
    'leagues/fbad2/S79/rosters.json': d2,
  };
  if (options.recruiting !== false) out['leagues/fbajc/S79/recruiting.json'] = state.recruiting;
  return out;
}

/** The documents before the one-time setup: no S79 college rosters, transactions or recruiting doc; meta.rosterSeason.fbajc as given. */
export function setupDocs(fbajcSeason = 78): Record<string, unknown> {
  const out = recruitingDocs(collegeBaseState(), { recruiting: false });
  delete out['leagues/fbajc/S79/rosters.json'];
  delete out['leagues/fbajc/S79/transactions.json'];
  out['meta.json'] = meta(fbajcSeason);
  return out;
}
```

Create `web/app/college/RecruitingPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASS_DRAFT, collegeBaseState, collegeClassState } from '../../engine/college/testFixtures';
import type { RecruitingFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { RecruitingPage } from './RecruitingPage';
import { recruitingDocs, setupDocs } from './testDocs';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/fbajc/recruiting" element={<RecruitingPage />} /></Routes>
  </MemoryRouter>,
);
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('RecruitingPage', () => {
  it('offers the one-time college setup with its counts, and saves it as one batch', async () => {
    const log = stubApi(setupDocs());
    renderAt('/league/fbajc/recruiting');
    expect(await screen.findByText('4 Seniors leave, 1 player left early, 6 holes')).toBeTruthy();
    fireEvent.click(await enabled('Set up S79 college rosters'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Set up S79 college rosters');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S79/rosters.json', null], ['leagues/fbajc/S79/transactions.json', null], ['meta.json', '0000000000000001'],
    ]);
    expect(await screen.findByRole('button', { name: 'Create class' })).toBeTruthy();
  });

  it("says the rosters don't exist yet when the college isn't on the previous season", async () => {
    stubApi(setupDocs(77));
    renderAt('/league/fbajc/recruiting');
    expect(await screen.findByText("The S79 college rosters don't exist yet.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up S79 college rosters' })).toBeNull();
  });

  it('opens on the Class tab before the class exists, and the first draft edit creates the recruiting doc', async () => {
    const log = stubApi(recruitingDocs(collegeBaseState(), { recruiting: false }));
    renderAt('/league/fbajc/recruiting');
    fireEvent.click(await screen.findByRole('button', { name: 'Add recruit' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbajc/S79/recruiting.json', ifMatch: '"null"' });
    expect((log.puts[0].doc as RecruitingFile).classDraft).toEqual([{ name: '', position: 'PG' }]);
    expect(screen.getByRole('link', { name: 'Recruiting' }).getAttribute('href')).toBe('/league/fbajc/recruiting');
  });

  it('creates the class as one batch with the loaded versions', async () => {
    const s = collegeBaseState();
    const log = stubApi(recruitingDocs({ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }));
    renderAt('/league/fbajc/recruiting?tab=class');
    fireEvent.click(await enabled('Create class'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Create S80 class');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S79/recruiting.json', '0000000000000001'], ['players.json', '0000000000000001'],
      ['leagues/fbajc/S79/transactions.json', '0000000000000001'], ['calendar.json', '0000000000000001'],
    ]);
  });

  it('opens on the Board once the class exists, and commits as one batch', async () => {
    const log = stubApi(recruitingDocs(collegeClassState()));
    renderAt('/league/fbajc/recruiting');
    fireEvent.click(await enabled('Commit Zion Carter'));
    fireEvent.click(screen.getByRole('button', { name: 'Duke' }));
    fireEvent.click(await enabled('Confirm commit'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Zion Carter commits to Duke');
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fbajc/S79/recruiting.json', 'leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
  });

  it('shows the class list on ?tab=class once the class exists', async () => {
    stubApi(recruitingDocs(collegeClassState()));
    renderAt('/league/fbajc/recruiting?tab=class');
    expect(await screen.findByLabelText('Name of Zion Carter')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Class' }).getAttribute('aria-selected')).toBe('true');
  });
});
```

In `web/app/components/LeagueTabs.test.tsx`, append inside the `describe`:

```tsx
  it('gives the FBAJC Teams and Recruiting, and the World Cup only Teams', () => {
    render(<MemoryRouter><LeagueTabs league="fbajc" /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(a => [a.textContent, a.getAttribute('href')])).toEqual([['Teams', '/league/fbajc'], ['Recruiting', '/league/fbajc/recruiting']]);
    cleanup();
    render(<MemoryRouter><LeagueTabs league="fbawc" /></MemoryRouter>);
    expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(['Teams']);
  });
```

In `web/app/stepRoutes.test.ts`, append inside the `describe`:

```ts
  it('opens Create Class on the recruiting page', () => {
    expect(toolTarget(step('create-s80-class'))).toBe('/league/fbajc/recruiting?tab=class');
    expect(stepTarget(step('create-s81-class'))).toBe('/league/fbajc/recruiting?tab=class');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/college/RecruitingPage.test.tsx app/components/LeagueTabs.test.tsx app/stepRoutes.test.ts`
Expected: FAIL: `./RecruitingPage` doesn't exist; the FBAJC tabs and the Create Class route are missing.

- [ ] **Step 3: Implement the loader**

Create `web/app/college/useRecruitingState.ts`:

```ts
import { useMemo } from 'react';
import { proPlayerIds } from '../../engine/college/setup';
import { emptyRecruiting, recruitingDocPath, type RecruitingDocKey, type RecruitingState } from '../../engine/college/state';
import type {
  CalendarFile, FreeAgentsFile, MetaFile, PlayersFile, RecruitingFile, ReservesFile, RostersFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

/** What the one-time college setup needs. */
export interface CollegeSetupInput {
  meta: MetaFile;
  /** Last season's college rosters; null if missing. */
  prev: RostersFile | null;
  proIds: Set<string>;
}

/**
 * Loads the recruiting board for the current calendar season: `state` once the season's college rosters exist,
 * otherwise `setup` for the one-time setup panel. `versions` holds every doc either of them may write.
 */
export function useRecruitingState(): { season?: number; state?: RecruitingState; setup?: CollegeSetupInput; versions: Versions; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const at = (k: RecruitingDocKey) => (n === undefined ? null : recruitingDocPath(k, n));
  const recruiting = useDoc<RecruitingFile>(at('recruiting'));
  const rosters = useDoc<RostersFile>(at('rosters'));
  const tx = useDoc<TransactionsFile>(at('tx'));
  const players = useDoc<PlayersFile>(at('players'));
  const calendar = useDoc<CalendarFile>(at('calendar'));
  const teams = useDoc<TeamsFile>(n === undefined ? null : 'leagues/fbajc/teams.json');
  const prev = useDoc<RostersFile>(n === undefined ? null : `leagues/fbajc/S${n - 1}/rosters.json`);
  const fba = useDoc<RostersFile>(n === undefined ? null : `leagues/fba/S${n}/rosters.json`);
  const freeAgents = useDoc<FreeAgentsFile>(n === undefined ? null : `leagues/fba/S${n}/freeAgents.json`);
  const d2 = useDoc<RostersFile>(n === undefined ? null : `leagues/fbad2/S${n}/rosters.json`);
  const reserves = useDoc<ReservesFile>(n === undefined ? null : `leagues/fbad2/S${n}/reserves.json`);
  // Stable stand-ins for docs that don't exist yet: useAutosaveDoc resyncs whenever its data changes identity.
  const emptyBoard = useMemo(() => (n === undefined ? undefined : emptyRecruiting(n)), [n]);
  const emptyTx = useMemo<TransactionsFile | undefined>(() => (n === undefined ? undefined : { league: 'fbajc', season: n, entries: [] }), [n]);
  const proIds = useMemo(
    () => (fba.data && d2.data ? proPlayerIds({ fba: fba.data, freeAgents: freeAgents.data ?? null, d2: d2.data, reserves: reserves.data ?? null }) : new Set<string>()),
    [fba.data, freeAgents.data, d2.data, reserves.data],
  );

  const versions: Versions = {};
  if (n !== undefined) {
    const writable: [RecruitingDocKey, DocState<unknown>][] = [
      ['recruiting', recruiting], ['rosters', rosters], ['tx', tx], ['players', players], ['calendar', calendar],
    ];
    for (const [k, d] of writable) versions[recruitingDocPath(k, n)] = d.version;
    versions['meta.json'] = meta.version;
  }

  const required: DocState<unknown>[] = [players, calendar, teams, fba, d2];
  const optional: DocState<unknown>[] = [recruiting, rosters, tx, prev, freeAgents, reserves];
  const error = meta.error ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (n === undefined || required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { season: n, versions, error };
  if (!rosters.data) return { season: n, versions, error, setup: { meta: meta.data!, prev: prev.data ?? null, proIds } };
  return {
    season: n,
    versions,
    error,
    state: {
      season: n,
      recruiting: recruiting.data ?? emptyBoard!,
      rosters: rosters.data,
      teams: teams.data!,
      players: players.data!,
      tx: tx.data ?? emptyTx!,
      calendar: calendar.data!,
    },
  };
}
```

- [ ] **Step 4: Implement the setup panel and the page**

Create `web/app/college/SetupPanel.tsx`:

```tsx
import { useRef, useState } from 'react';
import { collegeSetupDocs, setupSummary } from '../../engine/college/setup';
import { useSaving, type Versions } from '../api';
import { commitDocs, newBatchId } from '../roster/commit';
import type { CollegeSetupInput } from './useRecruitingState';

/** The one-time "Set up S{n} college rosters" card (D19), shown while the season's college rosters don't exist. */
export function SetupPanel({ season, setup, versions }: { season: number; setup: CollegeSetupInput; versions: Versions }) {
  const saving = useSaving();
  const started = useRef(false);
  const [error, setError] = useState('');
  if (setup.meta.rosterSeason.fbajc !== season - 1) return <p className="muted">The S{season} college rosters don't exist yet.</p>;
  if (!setup.prev) return <p className="error">The S{season - 1} college rosters are missing.</p>;
  const prev = setup.prev;
  const input = { meta: setup.meta, prev, proIds: setup.proIds, rostersExist: false };
  const preview = collegeSetupDocs(input, { batchId: 'preview' });
  if (!preview.ok) return <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>;

  const go = async () => {
    // A ref, not state: the save must never start twice (useSaving re-renders as it starts).
    if (started.current) return;
    started.current = true;
    setError('');
    const r = collegeSetupDocs(input, { batchId: newBatchId() });
    if (!r.ok) {
      setError(r.problems.join('; '));
      started.current = false;
      return;
    }
    try {
      await commitDocs(r.label, r.writes, versions);
    } catch (e) {
      setError((e as Error).message);
      started.current = false;
    }
  };

  return (
    <div className="card">
      <h3>Set up S{season} college rosters</h3>
      <p>
        The S{season} college rosters are built from S{season - 1}: class years move up, every Senior leaves, and players now in the pros
        leave. The gaps are holes for the new class and for transfers.
      </p>
      <p><strong>{setupSummary(preview.counts)}</strong></p>
      <button type="button" className="btn primary" disabled={saving} onClick={go}>Set up S{season} college rosters</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

Create `web/app/college/RecruitingPage.tsx`:

```tsx
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { recruitingDocPath, recruitingWrites, type RecruitingResult } from '../../engine/college/state';
import type { RecruitingFile } from '../../engine/shared/types';
import { useSaving } from '../api';
import { LeagueTabs } from '../components/LeagueTabs';
import { commitDocs } from '../roster/commit';
import { useAutosaveDoc } from '../useAutosaveDoc';
import { BoardTab } from './BoardTab';
import { ClassTab } from './ClassTab';
import { SetupPanel } from './SetupPanel';
import { useRecruitingState } from './useRecruitingState';
import '../pages/league.css';
import '../pages/roster.css';

/** FBAJC recruiting (/league/fbajc/recruiting): Create Class and the recruiting board, for the class created this calendar season. */
export function RecruitingPage() {
  const load = useRecruitingState();
  const [params] = useSearchParams();
  const saving = useSaving();
  const path = load.season === undefined ? '' : recruitingDocPath('recruiting', load.season);
  const autosave = useAutosaveDoc<RecruitingFile>(path, load.state?.recruiting, load.versions[path] ?? null);
  const [actionError, setActionError] = useState('');

  if (load.error) return <p className="error">Couldn't load recruiting: {load.error.message}</p>;
  if (load.season === undefined || (!load.state && !load.setup)) return <p className="muted">Loading…</p>;
  const n = load.season;
  const head = (
    <>
      <div className="league-head">
        <h1>FBAJC recruiting</h1>
        <span className="muted">Class of S{n + 1}</span>
      </div>
      <LeagueTabs league="fbajc" />
    </>
  );
  if (!load.state) return <section>{head}<SetupPanel season={n} setup={load.setup!} versions={load.versions} /></section>;

  const recruiting = autosave.doc ?? load.state.recruiting;
  const state = { ...load.state, recruiting };
  const versions = { ...load.versions, [path]: autosave.version };
  const run = async (result: RecruitingResult) => {
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return;
    }
    setActionError('');
    try {
      await commitDocs(result.label, recruitingWrites(result), versions);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const asked = params.get('tab');
  const tab = asked === 'class' || asked === 'board' ? asked : recruiting.created ? 'board' : 'class';
  const tabLink = (id: 'board' | 'class', label: string) => (
    <Link role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} to={`/league/fbajc/recruiting?tab=${id}`}>{label}</Link>
  );

  return (
    <section>
      {head}
      <div className="tabs" role="tablist">{tabLink('board', 'Board')}{tabLink('class', 'Class')}</div>
      {recruiting.locked && <p className="muted">Recruiting for this class is finished.</p>}
      {autosave.error && <p className="error">{autosave.error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {tab === 'class'
        ? <ClassTab state={state} saving={saving} onDraft={autosave.update} onRun={run} />
        : <BoardTab state={state} saving={saving} onRun={run} />}
    </section>
  );
}
```

- [ ] **Step 5: Wire the route, the tabs and the calendar step**

In `web/app/shell/Layout.tsx`, add `import { RecruitingPage } from '../college/RecruitingPage';` and, next to the other `/league/fbad2/...` routes, add:

```tsx
          <Route path="/league/fbajc/recruiting" element={<RecruitingPage />} />
```

In `web/app/components/LeagueTabs.tsx`, change the doc comment to `Scores · Standings · Playoffs · Awards · Rankings · Teams · Transactions for the FBA and D2; Teams · Recruiting for the FBAJC; other leagues only have Teams for now.` and replace the `tabs` expression with:

```tsx
  const tabs: [string, string][] = league === 'fba' || league === 'fbad2'
    ? [['scores', 'Scores'], ['standings', 'Standings'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['rankings', 'Rankings'], ['', 'Teams'], ['transactions', 'Transactions']]
    : league === 'fbajc'
      ? [['', 'Teams'], ['recruiting', 'Recruiting']]
      : [['', 'Teams']];
```

In `web/app/stepRoutes.ts`, in `toolTarget`, after the schedules line add:

```ts
  if (/^create-s\d+-class$/.test(step.id)) return '/league/fbajc/recruiting?tab=class';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run app/college app/components/LeagueTabs.test.tsx app/stepRoutes.test.ts app/shell`
Expected: PASS.

- [ ] **Step 7: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes.

- [ ] **Step 8: Commit**

```bash
git add web/app/college web/app/shell/Layout.tsx web/app/components/LeagueTabs.tsx web/app/components/LeagueTabs.test.tsx web/app/stepRoutes.ts web/app/stepRoutes.test.ts
git commit -m "feat: FBAJC recruiting page with the one-time college setup, Class and Board tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The FBAJC gate, and locking the recruiting board at "Go to next season"

**Files:**
- Modify: `web/app/pages/CalendarPage.tsx`
- Modify: `web/engine/season/nextSeason.ts`
- Modify: `web/app/pages/NextSeasonPage.tsx`
- Modify: `web/engine/playoffs/season.e2e.test.ts` (its `NextSeasonInput`)
- Test: `web/app/pages/CalendarPage.test.tsx`, `web/engine/season/nextSeason.test.ts`

**Interfaces:**
- **Consumes:** `fbajcGateProblem` (Task 7); `RecruitingFile` (Task 1).
- **Produces:**
  - Calendar: while the current step is `fbajc`, "Mark done" is disabled when `fbajcGateProblem(recruiting)` returns a problem (shown next to the button), while the recruiting doc is still loading (`Checking recruiting…`), or when it failed to load (`Couldn't check recruiting: <message>`). A missing doc (404) means no gate;
  - `nextSeasonPaths(n).fbajc.recruiting = 'leagues/fbajc/S<n>/recruiting.json'`;
  - `NextSeasonInput.fbajc: { recruiting: RecruitingFile | null }`; `nextSeasonDocs` locks it (when present and unlocked) right after the D2 draft.

- [ ] **Step 1: Write the failing tests**

In `web/app/pages/CalendarPage.test.tsx`, append a new `describe` at the end of the file:

```tsx
describe('CalendarPage FBAJC gate', () => {
  const atFbajc = { season: 79, steps: [
    { id: 'adjust-college-ratings', label: 'Adjust College Ratings', kind: 'offseason', league: null, sub: true, done: true },
    { id: 'fbajc', label: 'FBAJC', kind: 'league', league: 'fbajc', sub: false, done: false },
  ] };
  const board = (committedTo: string | null) => ({
    league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true,
    recruits: [{ playerId: 'p01914', position: 'PG', classYear: 'Fr', rating: null, stars: null, projections: {}, committedTo }],
    portal: [],
  });
  const markDone = async () => screen.findByRole('button', { name: /mark "FBAJC" done/i }) as Promise<HTMLButtonElement>;

  it('keeps Mark done off while anyone is uncommitted', async () => {
    current = atFbajc;
    extra['leagues/fbajc/S79/recruiting.json'] = board(null);
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText("1 recruit and 0 portal players haven't committed yet")).toBeTruthy();
    expect((await markDone()).disabled).toBe(true);
  });

  it('allows Mark done once everyone has committed', async () => {
    current = atFbajc;
    extra['leagues/fbajc/S79/recruiting.json'] = board('DUKE');
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    const button = await markDone();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('has no gate without a recruiting doc', async () => {
    current = atFbajc;
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    const button = await markDone();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('keeps Mark done off when the recruiting doc fails to load', async () => {
    current = atFbajc;
    errors['leagues/fbajc/S79/recruiting.json'] = 500;
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    expect(await screen.findByText(/Couldn't check recruiting/)).toBeTruthy();
    expect((await markDone()).disabled).toBe(true);
  });
});
```

In `web/engine/season/nextSeason.test.ts`:
- add `RecruitingFile` to the `import type { … } from '../shared/types';` line;
- in `ready()`, after `nextStarted: false,` add `fbajc: { recruiting: null },`;
- append inside `describe('nextSeasonDocs', …)`:

```ts
  it('locks the S79 recruiting board when there is one', () => {
    const recruiting: RecruitingFile = { league: 'fbajc', season: 79, classOf: 80, locked: false, classDraft: [], created: true, recruits: [], portal: [] };
    const r = run({ ...ready(), fbajc: { recruiting } });
    const paths = r.writes.map(w => w.path);
    expect(paths.indexOf('leagues/fbajc/S79/recruiting.json')).toBe(paths.indexOf('leagues/fbad2/S79/draft.json') + 1);
    expect(r.writes.find(w => w.path === 'leagues/fbajc/S79/recruiting.json')!.doc).toEqual({ ...recruiting, locked: true });
    const done = run({ ...ready(), fbajc: { recruiting: { ...recruiting, locked: true } } });
    expect(done.writes.some(w => w.path.endsWith('/recruiting.json'))).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/pages/CalendarPage.test.tsx engine/season/nextSeason.test.ts`
Expected: FAIL: the gate text never appears, and `fbajc` isn't part of `NextSeasonInput` (a type error surfaces in tsc; the lock test fails at runtime).

- [ ] **Step 3: Implement the gate**

In `web/app/pages/CalendarPage.tsx`:
- add `import { fbajcGateProblem } from '../../engine/college/recruiting';` and add `RecruitingFile` to the `import type { CalendarFile, SummaryFile } from '../../engine/shared/types';` line;
- after the `d2Summary` line add:

```tsx
  const recruiting = useDoc<RecruitingFile>(cal ? `leagues/fbajc/S${cal.season}/recruiting.json` : null);
```

- after `const tool = …;` add:

```tsx
  // The FBAJC step waits until every recruit and portal player has committed (a missing recruiting doc means no gate).
  const atFbajc = i >= 0 && cal.steps[i].id === 'fbajc';
  const gate = !atFbajc ? null
    : recruiting.data ? fbajcGateProblem(recruiting.data)
    : recruiting.missing ? null
    : recruiting.error ? `Couldn't check recruiting: ${recruiting.error.message}`
    : 'Checking recruiting…';
```

- change the Mark done button's `disabled={busy || saving}` to `disabled={busy || saving || gate !== null}`, and right after that button's closing `)}` add:

```tsx
        {gate && <span className="muted">{gate}</span>}
```

- [ ] **Step 4: Lock the recruiting board at "Go to next season"**

In `web/engine/season/nextSeason.ts`:
- add `RecruitingFile` to the type import from `../shared/types`;
- in `nextSeasonPaths`, after the `fbad2: { … },` entry add:

```ts
    fbajc: { recruiting: `leagues/fbajc/S${n}/recruiting.json` },
```

- in `NextSeasonInput`, after the `fbad2: { … };` member add:

```ts
  /** The recruiting board of the class created this season (null if none). */
  fbajc: { recruiting: RecruitingFile | null };
```

- in `nextSeasonDocs`, after `lock(p.fbad2.draft, input.fbad2.draft);` add:

```ts
  lock(p.fbajc.recruiting, input.fbajc.recruiting);
```

In `web/engine/playoffs/season.e2e.test.ts`, next to `nextStarted: false,` add `fbajc: { recruiting: null },`.

In `web/app/pages/NextSeasonPage.tsx`:
- add `RecruitingFile` to the type import;
- after the `d2Summary` line add `const recruiting = useDoc<RecruitingFile>(p && p.fbajc.recruiting);`;
- add `[p.fbajc.recruiting, recruiting],` to the `all` list (after the `d2Summary` pair);
- in `input`, after the `fbad2: { … },` member add `fbajc: { recruiting: recruiting.data ?? null },`;
- change the first confirm bullet to: `Locks the S{n} FBA and D2 rosters, free agents, reserves and transactions, and the recruiting board.`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/pages/CalendarPage.test.tsx app/pages/NextSeasonPage.test.tsx engine/season engine/playoffs/season.e2e.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc prints nothing; every test passes, including `data.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add web/app/pages/CalendarPage.tsx web/app/pages/CalendarPage.test.tsx web/engine/season/nextSeason.ts web/engine/season/nextSeason.test.ts web/app/pages/NextSeasonPage.tsx web/engine/playoffs/season.e2e.test.ts
git commit -m "feat: FBAJC step waits for every commitment; Go to next season locks the recruiting board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a subagent task)

1. **Final review:** a final Opus review of the whole branch against the spec. Align the spec with the clarifications above that the review accepts (`fbaRating` on Reserves, `name` arguments, `applyAllSuggestions`, the out-of-order rule, the page's setup-first flow).
2. **Browser check** on a scratch copy, per `CLAUDE.md` (scratch data server on 5184, Vite on 5183 via `web/rscheck.vite.config.ts`, data from `.superpowers/sdd/rscheck/prep.mjs`; never the real data):
   1. Close FBA free agency. Check that a few Reserves carry `fbaRating`.
   2. D2 reset: rank a few by clicking, send one back, use the position filter, Take the rest, Use all suggestions, make one row out of order (see ⚠ and the blocker), fix it, Finish.
   3. The D2 pool and draft still work from the new ratings.
   4. Mark done up to Create S80 Class; "Open Create S80 Class ▸" lands on the Class tab. Set up the S79 college rosters (compare the counts with Task 5 Step 6); the FBAJC team pages show S79 rosters with holes.
   5. Create a class by pasting a list (include one bad line), then Create class.
   6. Board: add projections (check the shares), commit into a hole, commit displacing a returning player (the portal gets them), try the 7a-3 refusal, decommit, and commit the transfer somewhere.
   7. Mark done through to the FBAJC step: Mark done stays off with the gate message while anyone is uncommitted.
   8. Check the phone width (375 px): the ranking columns stack and the board scrolls sideways without the page scrolling.
   9. Stop both processes, delete the scratch data and config, and confirm `git status` is clean and `web/data` unchanged.
3. **Roadmap:** mark 7a done in §10 of `docs/superpowers/specs/2026-09-25-fba-web-design.md`, and update the memory note and the ledger.
4. **Finish the branch** with superpowers:finishing-a-development-branch.
