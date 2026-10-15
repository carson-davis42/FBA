# FBAJC First Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** March Madness gets a First Four: 8 play-in games, a 72-team field, shown in Field, March Madness and Bracketology.

**Architecture:** `selectMarchMadness` still picks the 64 spots. A new pure `selectFirstFour` derives, per group (power / other), the 4 worst spot holders, 4 challengers from `leftover`, adjacent pairs by rank, and the First Four In / Out lists. `computeField` runs it; `setFields`, `swapField` and Bracketology all use `computeField`. The bracket gets 8 round-0 games feeding the open Round of 64 slots.

**Tech Stack:** TypeScript 5, zod 3, React 18, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-10-15-fbajc-first-four-design.md`

## Global Constraints

- Run commands from `web/`: `npx vitest run [paths]`, `npx tsc --noEmit` (must print nothing).
- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/`. Never start/stop the dev servers on 5173/5174.
- Do not stage or commit `web/app/season/LiveGame.tsx`, `web/app/shell/Layout.tsx`, `web/app/shell/useScrollMemory.ts`, or `web/data/**`. Stage by explicit path, never `git add -A`.
- Files are CRLF: write replacements tolerant of `\r\n` (read as utf-8 with `newline=''`, normalise, write back); avoid apostrophes in `it('...')` titles inside Python heredocs.
- Every random choice is injected; moves return `{ ok: true, state, changed, label }` or `{ ok: false, problems }`.
- Strict zod schemas: new fields must be optional/defaulted so saved docs still load; the committed `web/data` must keep passing `web/data.test.ts`.
- jsdom test files call `cleanup()` in `afterEach`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `first-four`.
- Check test output before committing; a failing run must not be followed by `git commit`.

## Review Focus

- A conference champion sits among the 4 worst-ranked of its group: it plays a First Four game and can lose (it is then out of the field).
- A group has fewer than 4 teams in `leftover` for challengers: no crash, fewer play-in games (the field then has fewer than 8 pairs; `firstFour` length must still be 0 or 8, so fall back to no First Four and a warning).
- A swap names a play-in team (slot placeholder or challenger): the pair and regions stay consistent.
- A saved postseason with no `firstFour` (older save) loads and plays as a 64-team bracket.
- Round 0 games must not appear in the past-bracket tree (`pastBracketOf`), so season summaries stay 6 rounds.

---

### Task 1: Schema, selection and `computeField`

**Files:**
- Modify: `web/engine/shared/types.ts` (BracketGame round min 0; `field.mm.firstFour`; refinements)
- Modify: `web/engine/jc/field.ts` (add `selectFirstFour`)
- Modify: `web/engine/jc/fieldMoves.ts` (`computeField`, `setFields`, `swapField`)
- Test: `web/engine/jc/field.test.ts`, `web/engine/jc/fieldMoves.test.ts`, `web/engine/jc/schemas.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `export const FirstFourGame = z.object({ id: z.string().min(1), group: z.enum(['power','other']), teams: z.tuple([z.string().min(1), z.string().min(1)]), seed: int.min(1).max(16), region: int.min(0).max(3) }).strict()`
  - `field.mm.firstFour: z.array(FirstFourGame).default([])`
- Produces (field.ts):
  ```ts
  export interface FirstFourPair { id: string; group: 'power' | 'other'; teams: [string, string]; spot: number /* index in the 64-slot pick order */ }
  export interface FirstFourPick {
    /** The 64 slots in pick order, a play-in spot holding the better-ranked team of its pair. */
    slots: string[];
    pairs: FirstFourPair[];
    firstFourIn: { power: string[]; other: string[] };   // 4 each, ranking order
    firstFourOut: { power: string[]; other: string[] };  // 4 each, ranking order
    /** Per group, the eight in ranking order. */
    lastEight: { power: string[]; other: string[] };
    /** Teams of `leftover` that remain after the 8 challengers. */
    leftover: string[];
    warnings: string[];
  }
  export function selectFirstFour(ranking: string[], field: string[], leftover: string[], confOf: (id: string) => string): FirstFourPick;
  ```
- Produces (fieldMoves.ts): `ComputedField` gains `firstFour: FirstFourPick`, and `mmTeams` stays the 64 slots; `leftover` is the post-First-Four leftover.

- [ ] **Step 1: Write failing tests** in `engine/jc/field.test.ts`

```ts
import { selectFirstFour, MAJOR_CONFERENCES } from './field';

describe('selectFirstFour', () => {
  // 80 ranked teams t00..t79; every third team is power ('B12'), the rest 'SKY'.
  const ranking = Array.from({ length: 80 }, (_, i) => `t${String(i).padStart(2, '0')}`);
  const confOf = (id: string): string => (Number(id.slice(1)) % 3 === 0 ? 'B12' : 'SKY');
  // A 64-team field in pick order: the best 64 by ranking.
  const field = ranking.slice(0, 64);
  const leftover = ranking.slice(64);

  it('pairs the last eight of each group, adjacent by ranking', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    expect(r.pairs).toHaveLength(8);
    expect(r.slots).toHaveLength(64);
    const power = r.pairs.filter(p => p.group === 'power');
    expect(power).toHaveLength(4);
    const eight = r.lastEight.power;
    expect(eight).toHaveLength(8);
    expect(power.map(p => p.teams)).toEqual([[eight[0], eight[1]], [eight[2], eight[3]], [eight[4], eight[5]], [eight[6], eight[7]]]);
  });
  it('takes the spot holders from the 64 and the challengers from the leftover, per group', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    for (const g of ['power', 'other'] as const) {
      const eight = r.lastEight[g];
      expect(eight.every(t => (confOf(t) === 'B12') === (g === 'power'))).toBe(true);
      expect(eight.slice(0, 4).every(t => field.includes(t))).toBe(true);
      expect(eight.slice(4).every(t => leftover.includes(t))).toBe(true);
    }
  });
  it('puts the better team of a pair in its spot and removes the challengers from the leftover', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    for (const p of r.pairs) expect(r.slots[p.spot]).toBe(p.teams[0]);
    const challengers = [...r.lastEight.power.slice(4), ...r.lastEight.other.slice(4)];
    expect(r.leftover.some(t => challengers.includes(t))).toBe(false);
    expect(r.leftover[0]).toBe(leftover.find(t => !challengers.includes(t)));
  });
  it('lists First Four In above the spot holders and First Four Out below the challengers', () => {
    const r = selectFirstFour(ranking, field, leftover, confOf);
    expect(r.firstFourIn.power).toHaveLength(4);
    expect(r.firstFourOut.other).toHaveLength(4);
    const worstIn = Math.min(...r.firstFourIn.power.map(t => ranking.indexOf(t)));
    const bestEight = Math.min(...r.lastEight.power.map(t => ranking.indexOf(t)));
    expect(worstIn).toBeLessThan(bestEight);
    const bestOut = Math.min(...r.firstFourOut.power.map(t => ranking.indexOf(t)));
    const worstEight = Math.max(...r.lastEight.power.map(t => ranking.indexOf(t)));
    expect(bestOut).toBeGreaterThan(worstEight);
  });
  it('plays no First Four, with a warning, when a group has too few challengers', () => {
    const r = selectFirstFour(ranking, field, leftover.slice(0, 3), confOf);
    expect(r.pairs).toHaveLength(0);
    expect(r.slots).toEqual(field);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
```
(Import `describe`, `expect`, `it` as the file already does. `MAJOR_CONFERENCES` import is only needed if `B12` is not in it; `B12` is.)

- [ ] **Step 2: Run to verify failure**: `npx vitest run engine/jc/field.test.ts` -> FAIL (`selectFirstFour` not exported).

- [ ] **Step 3: Implement `selectFirstFour`** in `engine/jc/field.ts`:

```ts
export function selectFirstFour(ranking: string[], field: string[], leftover: string[], confOf: (id: string) => string): FirstFourPick {
  const rank = (t: string): number => ranking.indexOf(t);
  const byRank = (a: string, b: string): number => rank(a) - rank(b);
  const slots = [...field];
  const none: FirstFourPick = {
    slots, pairs: [], firstFourIn: { power: [], other: [] }, firstFourOut: { power: [], other: [] },
    lastEight: { power: [], other: [] }, leftover: [...leftover], warnings: [],
  };
  const groups: ('power' | 'other')[] = ['power', 'other'];
  const inGroup = (t: string, g: 'power' | 'other'): boolean => isMajor(confOf(t)) === (g === 'power');
  const picked: Record<string, { holders: string[]; challengers: string[]; above: string[]; out: string[] }> = {};
  for (const g of groups) {
    const members = field.filter(t => inGroup(t, g)).sort(byRank);
    const pool = leftover.filter(t => inGroup(t, g));
    if (members.length < 8 || pool.length < 4) {
      return { ...none, warnings: [`There are too few ${g === 'power' ? 'power-conference' : 'other-conference'} teams for a First Four; March Madness has 64 teams`] };
    }
    picked[g] = {
      holders: members.slice(-4), challengers: pool.slice(0, 4),
      above: members.slice(-8, -4), out: pool.slice(4, 8),
    };
  }
  const pairs: FirstFourPair[] = [];
  const lastEight: FirstFourPick['lastEight'] = { power: [], other: [] };
  for (const g of groups) {
    const { holders, challengers } = picked[g];
    const eight = [...holders, ...challengers].sort(byRank);
    lastEight[g] = eight;
    const spots = holders.map(t => slots.indexOf(t)).sort((a, b) => a - b);
    for (let k = 0; k < 4; k++) {
      pairs.push({ id: '', group: g, teams: [eight[2 * k], eight[2 * k + 1]], spot: spots[k] });
      slots[spots[k]] = eight[2 * k];
    }
  }
  pairs.forEach((p, i) => { p.id = `P${i + 1}`; });
  const taken = new Set(groups.flatMap(g => picked[g].challengers));
  return {
    slots, pairs,
    firstFourIn: { power: picked.power.above, other: picked.other.above },
    firstFourOut: { power: picked.power.out, other: picked.other.out },
    lastEight,
    leftover: leftover.filter(t => !taken.has(t)),
    warnings: [],
  };
}
```
Note: slots[spots[k]] is overwritten for all four holders' positions; a holder that is not the better team of its assigned pair is removed from `slots` (it is the pair's second team or sits in another pair). The 8 teams then occupy 4 slots, so `slots` still has 64 distinct teams.

- [ ] **Step 4: Run** `npx vitest run engine/jc/field.test.ts` -> PASS.

- [ ] **Step 5: Schema.** In `engine/shared/types.ts`: change `BracketGame.round` to `int.min(0).max(6)`; add `FirstFourGame` (above `JcPostseasonFile`); add `firstFour: z.array(FirstFourGame).default([])` inside `field.mm`; in the `superRefine` add:

```ts
const ff = d.field.mm.firstFour;
if (ff.length !== 0 && ff.length !== 8) issue('March Madness has 0 or 8 First Four games');
const ffTeams = ff.flatMap(g => g.teams);
if (new Set(ffTeams).size !== ffTeams.length) issue('A team is in two First Four games');
for (const g of ff) {
  if (!mm.includes(g.teams[0])) issue(`${g.id}: the placeholder must be in the field`);
  if (mm.includes(g.teams[1])) issue(`${g.id}: the challenger is already in the field`);
}
if (nit.some(t => ffTeams.includes(t))) issue('A team is in both the First Four and the NIT');
```
Test in `schemas.test.ts`: a postseason doc without `firstFour` parses and gets `[]`; one with 3 games fails; one with a challenger also in `teams` fails.

- [ ] **Step 6: `computeField` / `setFields` / `swapField`.**
  - `ComputedField` adds `firstFour: FirstFourPick`; `computeField` runs `selectMarchMadness`, then `selectFirstFour(ranking, field, leftover, confOf)`, then `selectNit(ff.leftover, rsChampions)`, `placeRegions(ff.slots, confOf)`; `mmTeams = ff.slots`, `leftover = ff.leftover`.
  - Seeds: after `placeRegions`, add `seeds[challenger] = seeds[placeholder]` for every pair.
  - `withField` takes the `firstFour` entries (`{id, group, teams, seed, region}`: `seed = seeds[placeholder]`, `region` = the index of the region array containing the placeholder) and writes `field.mm.firstFour`; `buildMarchMadness` is wired in Task 2 (pass the entries now; ignore until then).
  - `setFields` stores them. A pair's `teams[1]` is the challenger.
  - `swapField(tournament = 'mm')`: `out` may be a slot team or a pair's challenger. Replace `out` with `into` wherever it appears in `teams` and in `firstFour[].teams`, re-run `placeRegions(teams, confOf)`, and recompute each pair's region and seed. The champion rule checks `teams` plus challengers: "Every conference tournament champion must stay in March Madness" counts a champion in a pair as in the field. `inField`/`isn't in that field` checks use slot teams plus challengers.

- [ ] **Step 7: Tests** in `fieldMoves.test.ts` (uses the played fixture): `setFields` yields `firstFour.length === 8` and 72 distinct teams (`teams` + challengers); the NIT excludes all 72; every conference champion is in the 72; a swap of a challenger for a leftover team updates the pair; an old-shape postseason (firstFour `[]`) still `swapField`s. Update existing assertions that assumed `mm.teams` was the full field.

- [ ] **Step 8: Run** `npx vitest run engine/jc engine/shared` and `npx tsc --noEmit`; fix existing tests broken only by the 72-team field.

- [ ] **Step 9: Commit**

```bash
git add web/engine/shared/types.ts web/engine/jc/field.ts web/engine/jc/fieldMoves.ts web/engine/jc/field.test.ts web/engine/jc/fieldMoves.test.ts web/engine/jc/schemas.test.ts
git commit -m "FBAJC: First Four selection and saved field shape"
```

---

### Task 2: Bracket with First Four games

**Files:**
- Modify: `web/engine/jc/regions.ts` (`buildMarchMadness`)
- Modify: `web/engine/jc/bracket.ts` (`roundName`)
- Modify: `web/engine/jc/postseason.ts` (`pastBracketOf`)
- Modify: `web/engine/jc/fieldMoves.ts` (call the new `buildMarchMadness`)
- Test: `web/engine/jc/regions.test.ts`, `web/engine/jc/postseason.test.ts`, `web/engine/jc/bracket.test.ts`

**Interfaces:**
- Consumes: `field.mm.firstFour` entries `{ id, group, teams: [placeholder, challenger], seed, region }`.
- Produces: `buildMarchMadness(regions: string[][], seeds: Record<string, number>, firstFour: FirstFourEntry[] = []): Bracket` where `FirstFourEntry` is `z.infer<typeof FirstFourGame>`.

- [ ] **Step 1: Failing tests** in `regions.test.ts`:

```ts
it('adds eight round-0 First Four games that feed the open Round of 64 slots', () => {
  const { seeds, regions } = placeRegions(field64, confOf);
  const placeholders = [regions[0][15], regions[1][14], regions[2][13], regions[3][12]];  // any 4 slots
  const firstFour = placeholders.map((p, i) => ({
    id: `P${i + 1}`, group: 'other' as const, teams: [p, `x${i}`] as [string, string],
    seed: seeds[p], region: regions.findIndex(r => r.includes(p)),
  }));
  const b = buildMarchMadness(regions, { ...seeds, ...Object.fromEntries(firstFour.map(g => [g.teams[1], g.seed])) }, firstFour);
  expect(b.games.filter(g => g.round === 0)).toHaveLength(4);
  for (const f of firstFour) {
    const game = b.games.find(g => g.id === f.id)!;
    expect([game.home, game.away]).toEqual(f.teams);
    expect([game.homeSeed, game.awaySeed]).toEqual([f.seed, f.seed]);
    const target = b.games.find(g => g.id === game.next!.id)!;
    expect(target[game.next!.side]).toBeNull();
    expect(target[game.next!.side === 'home' ? 'homeSeed' : 'awaySeed']).toBe(f.seed);
  }
  expect(() => buildMarchMadness(regions, seeds)).not.toThrow();
});
```
(`field64` and `confOf` are the file's existing fixtures; reuse its helpers. With 8 pairs the count is 8; the test uses 4 to keep the fixture small, which the builder must also support.)

- [ ] **Step 2: Implement.** In `buildMarchMadness`, after building the regional games:

```ts
for (const f of firstFour) {
  const reg = regions[f.region];
  const i = reg.indexOf(f.teams[0]);
  const g = TOP.indexOf(i) >= 0 ? TOP.indexOf(i) : BOTTOM.indexOf(i);
  const side: 'home' | 'away' = TOP.indexOf(i) >= 0 ? 'home' : 'away';
  const target = games.find(x => x.id === `R${f.region + 1}-${g + 1}`)!;
  target[side] = null;
  target[side === 'home' ? 'homeSeed' : 'awaySeed'] = f.seed;
  games.push({ id: f.id, round: 0, region: f.region, home: f.teams[0], away: f.teams[1], homeSeed: f.seed, awaySeed: f.seed, next: { id: target.id, side } });
}
```
`games` entries are plain `NewGame` objects, so mutate before `buildBracket`. `bracket.ts`: `roundName` returns `'First Four'` for `kind === 'mm' && round === 0`. `postseason.ts`: `pastBracketOf` filters `b.games` to `round >= 1` before computing the tree. `fieldMoves.withField` passes `firstFour` to `buildMarchMadness`.

- [ ] **Step 3: Tests** for play flow in `postseason.test.ts` (uses `jcReadyForNit` or a fixture with fields set): after fields set the MM bracket has 71 games; `playableGames` returns only round-0 games first; playing the First Four round fills each target slot with the winner at the pair's seed; `playPostToEnd(state, 'mm', rng)` ends with a champion; `pastBracketOf` has 6 rounds and no P game; `roundName('mm', 0) === 'First Four'`. Update the existing 63-game and 64-team assertions in `regions.test.ts`/`postseason.test.ts`.

- [ ] **Step 4: Run** `npx vitest run engine/jc` + `npx tsc --noEmit`; the slow fixtures take ~15 s.

- [ ] **Step 5: Commit** (explicit paths of the files above):

```bash
git commit -m "FBAJC: First Four games feed the Round of 64"
```

---

### Task 3: Bracketology engine

**Files:**
- Modify: `web/engine/jc/bracketology.ts`, `web/engine/jc/bracketology.test.ts`

**Interfaces:**
- Consumes: `computeField(...)` (with `firstFour`) from Task 1.
- Produces, replacing `power`/`other` bubbles:

```ts
export interface PlayInGame { id: string; teams: [string, string]; seed: number }
export interface GroupBubble {
  firstFourIn: string[];                 // 4
  lastEight: { top: PlayInGame[]; bottom: PlayInGame[] };  // top = games 1-2 (teams 1-4), bottom = games 3-4 (teams 5-8)
  firstFourOut: string[];                // 4
}
// Projection: power: GroupBubble; other: GroupBubble; mmTeams = 64 slots; playIn: PlayInGame[] (8)
```
`bids` counts all 72 teams (slots plus challengers); the sum is 72.

- [ ] **Step 1: Failing tests** in `bracketology.test.ts`: each group has 4 `firstFourIn`, 2 games in `lastEight.top` and 2 in `lastEight.bottom`, 4 `firstFourOut`; `playIn` has 8 games and the seed of a game equals `seeds[teams[0]]`; the top games' teams are the four best-ranked of the group's eight; `bids` sum to 72; the projection still equals `setFields` (slots, seeds, regions, NIT, `firstFour` pairs) when the projected champions equal the real ones; `lastFourIn`/`power.lastFourIn` are gone. Update the previously written "four bubble teams" test to the new shape.

- [ ] **Step 2: Implement** by mapping `computeField(...).firstFour`: `playIn` from `pairs` (`seed = seeds[teams[0]]`), per group `firstFourIn`/`firstFourOut` from the pick, and `lastEight` split by game order within the group (pairs are already in ranking order: first two pairs are `top`, last two `bottom`). `bids` iterate over slots plus the challenger of each pair.

- [ ] **Step 3: Run** `npx vitest run engine/jc/bracketology.test.ts` and `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add web/engine/jc/bracketology.ts web/engine/jc/bracketology.test.ts
git commit -m "Bracketology: First Four In, Last Eight In and First Four Out projection"
```

---

### Task 4: UI

**Files:**
- Modify: `web/app/jc/Bracketology.tsx`
- Modify: `web/app/jc/PostseasonPage.tsx` (Field panel, March Madness panel)
- Modify: `web/app/jc/StandingsPage.tsx` (in-field set includes challengers)
- Test: `web/app/jc/PostseasonPage.test.tsx`, `web/app/jc/StandingsPage.test.tsx`

**Interfaces:**
- Consumes: `Projection.power/other: GroupBubble`, `Projection.playIn`, `field.mm.firstFour`, round-0 games in `state.postseason.mm`.

- [ ] **Step 1: Failing tests** in `PostseasonPage.test.tsx`:
  - Bracketology tab (before fields): headings `First Four In` x2, `Last Eight In` x4 (names `Power conferences, top four` etc.), `First Four Out` x2; each Last Eight box lists 2 games as "A vs B".
  - Field tab after `setFields`: a "First Four" list of 8 pairs and regions where a play-in spot reads "Winner of P<n>"; the NIT list has 32 teams.
  - March Madness tab: a `First Four` card list with 8 games above the region tabs; selecting `Region 1` shows no `First Four` column; `Final Four` tab unchanged; after "Play round" the First Four games have results and the Round of 64 slots are filled.
  - Standings: a challenger (play-in team) is counted as in March Madness.

- [ ] **Step 2: Bracketology.tsx.** Replace the two `BubbleCards` sections by three sections each split into power/other:
  - `First Four In` (two cards: "Power conferences" / "Other conferences", 4 teams each, with the seed note "(seed N)" from `p.seeds`),
  - `Last Eight In` (four cards: `Power conferences, top four` / `Power conferences, bottom four` / `Other conferences, top four` / `Other conferences, bottom four`; each card lists its two games as `<TeamA> vs <TeamB> (seed N)`),
  - `First Four Out` (two cards).
  Keep the `*` key and region lists; `BracketView` filter for regions uses `g.round >= 1`.

- [ ] **Step 3: PostseasonPage.** Field panel: show `field.mm.firstFour` as a "First Four" card (8 lines `P1: A vs B (seed N, Region k)`); a region slot whose team is a placeholder shows `Winner of P<n>`; the swap lists include challengers. March Madness panel: render `<BracketView filter={g => g.round === 0}>` under a "First Four" heading above the region tabs when the bracket has round-0 games; region filter `g.round >= 1 && g.round < 5`; Final Four filter unchanged. `Watch next game` already uses `nextPostGame`.

- [ ] **Step 4: StandingsPage:** `new Set([...field.mm.teams, ...field.mm.firstFour.flatMap(g => g.teams)])`.

- [ ] **Step 5: Run** `npx vitest run app/jc engine/jc`, then the full suite `npx vitest run`, then `npx tsc --noEmit`. Read the output before committing.

- [ ] **Step 6: Commit**

```bash
git add web/app/jc/Bracketology.tsx web/app/jc/PostseasonPage.tsx web/app/jc/StandingsPage.tsx web/app/jc/PostseasonPage.test.tsx web/app/jc/StandingsPage.test.tsx
git commit -m "FBAJC: First Four in the Field, March Madness and Bracketology tabs"
```

---

## Self-review notes

- Spec coverage: selection (Task 1), shared `computeField` (1, 3), saved data and refinements (1), bracket and round name and `pastBracketOf` (2), swaps (1), UI sections (4), tests listed per task.
- Interfaces named in later tasks (`FirstFourPick`, `FirstFourGame`, `GroupBubble`, `PlayInGame`) are defined in the task that produces them.
- If a group lacks 4 challengers the whole First Four is skipped with a warning (`firstFour` = `[]`), which keeps the 0-or-8 invariant.
