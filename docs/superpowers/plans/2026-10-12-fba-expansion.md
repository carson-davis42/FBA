# FBA expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S80 adds the Philly Phantoms (PHI) and a placeholder "Team 32" (teamId `LAL`): the teams are added before the S80 lottery, the lottery has 16 teams, and an expansion draft runs right after the S80 FBA draft.

**Architecture:** `Team.fromSeason` keeps the new teams out of S79 views; `teamsInSeason` is the one filter. The lottery and pick code take sizes from the data. The expansion draft is a pure engine module (`engine/offseason/expansion.ts`) writing a new strict doc `leagues/fba/S{n}/expansion.json`, driven by one app page.

**Tech Stack:** TypeScript 5, zod 3, Vitest 2 (jsdom for app tests, `cleanup()` in `afterEach`), React 18, React Router 6. Run everything from `web/`.

**Spec:** `docs/superpowers/specs/2026-10-12-fba-expansion-design.md` (read §8 Addendum too: it overrides §4's lock paragraph and adds the position and cap rules).

## Global Constraints

- Never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`.
- Never modify `web/data/**` in tests, scripts or browser checks. `web/data/leagues/fba/S79/*.json` and `events.json` have uncommitted changes from the user's own play: never touch or commit them. Stage files by explicit path, never `git add -A` or `git commit -a`.
- Don't start or stop the dev servers on 5173/5174.
- Scratch files go in `.superpowers/sdd/` (git-ignored); no stray files in the repo.
- Every saved doc type has a strict zod schema in `engine/shared/types.ts` and a rule in `engine/shared/schemaRegistry.ts`.
- Every random choice takes an injected `Rng`. Engine moves in `offseason/` return `WritesResult` (`{ ok: true, writes, label } | { ok: false, problems }`).
- New write paths pass loaded versions through `commitDocs` (`app/roster/commit.ts`); chained saves use the versions returned by the previous save. A save-triggering effect is guarded with a `useRef`.
- `npx tsc --noEmit` must print nothing and the full `npx vitest run` must pass at the end of every task.
- Commit trailer, exactly: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Work on branch `fba-expansion` (already created).
- Rules (user-approved): protect up to 4 chosen players per existing team, restricted-contract players also protected, picks not in the draft; 4 picks per expansion team, snake order PHI, LAL, LAL, PHI, PHI, LAL, LAL, PHI; an existing team loses at most one player; contracts kept; the 16-team odds are `[14, 14, ...S74 × 0.72]`.

## Review Focus

1. A team that protects fewer than 4 and has two exposed players: only one can be lost (second becomes unavailable after the first is taken).
2. An expansion pick at a position the expansion team already holds, or one that pushes its payroll over `CAP`: refused with a readable message, nothing written.
3. Fewer exposed players than picks (everyone protected): `lockProtections` refuses before the draft starts instead of stranding it.
4. Re-running the lottery preview before the teams are added (no `fromSeason` team): behaves as the old 14-team lottery.
5. S79 pages (standings, playoffs, schedules, scores) with PHI and LAL present in `teams.json`: they must not appear or change the clinch bars, seeds or lottery rows.

---

## File Structure

| File | Responsibility |
|---|---|
| `engine/shared/types.ts` (modify) | `Team.fromSeason`, `ExpansionFile`/`ExpansionPick`, `'expansion'` transaction type |
| `engine/shared/schemaRegistry.ts` (modify) | path rule for `S{n}/expansion.json` |
| `engine/shared/teams.ts` (new) | `teamsInSeason`, `teamsJoining` |
| `engine/shared/league.ts` (new) | `PLAYOFF_SEEDS`, `lotterySizeFor` |
| `engine/shared/expansion.ts` (new) | the S80 definition: season, two teams, step ids, size constants |
| `engine/shared/calendar.ts` (modify) | `calendarFor` + `withExpansionStep` |
| `engine/season/addExpansionTeams.ts` (new) | the "add teams" move |
| `engine/season/standings.ts` (modify) | `seasonLength` replaces `SEASON_LENGTH` |
| `engine/season/nextSeason.ts` (modify) | empty rosters for joining teams |
| `engine/offseason/lottery.ts` (modify) | 16-team odds, expansion slots |
| `engine/offseason/expansion.ts` (new) | expansion draft moves |
| `engine/roster/picks.ts`, `tradeValue.ts` (modify) | no hard-coded 14 / 15.5 |
| `importers/run.ts`, `importers/historyRun.ts` or `run.ts` drafts (modify) | `--expansion-step`; `--drafts` keeps later seasons |
| `app/offseason/ExpansionPage.tsx`, `useExpansionState.ts` (new) | the page |
| `app/components/teamColors.ts`, `app/stepRoutes.ts`, `app/shell/Layout.tsx` (modify) | colours, step routes, route |

---

### Task 1: `fromSeason`, `teamsInSeason`, the S80 definition

**Files:**
- Modify: `engine/shared/types.ts` (the `Team` object, ~line 41)
- Create: `engine/shared/teams.ts`, `engine/shared/teams.test.ts`
- Create: `engine/shared/expansion.ts`, `engine/shared/league.ts`
- Modify: `app/components/teamColors.ts`
- Test: `engine/shared/types.test.ts` (add cases; create if absent), `engine/shared/teams.test.ts`

**Interfaces:**
- Produces:
  - `Team.fromSeason?: number`
  - `teamsInSeason(file: TeamsFile, season: number): TeamsFile`, `teamsJoining(file: TeamsFile, season: number): Team[]`
  - `EXPANSION_SEASON = 80`, `EXPANSION_TEAMS: Team[]`, `EXPANSION_PICKS_EACH = 4`, `MAX_PROTECTED = 4`, `addTeamsStepId(season: number): string` → `s${season}-add-expansion-teams`, `expansionDraftStepId(season: number): string` → `s${season}-expansion-draft`
  - `PLAYOFF_SEEDS = 8`, `lotterySizeFor(teamCount: number): number` → `Math.max(0, teamCount - 2 * PLAYOFF_SEEDS)`

- [ ] **Step 1: Write the failing tests** in `engine/shared/teams.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Team, TeamsFile } from './types';
import { teamsInSeason, teamsJoining } from './teams';
import { EXPANSION_TEAMS } from './expansion';
import { lotterySizeFor } from './league';

const t = (teamId: string, fromSeason?: number) => ({
  teamId, name: teamId, abbr: teamId, group: 'E', logoFolder: null, badge: { bg: '#000', fg: '#fff' }, ...(fromSeason ? { fromSeason } : {}),
});
const file = { league: 'fba' as const, teams: [t('A'), t('B', 80), t('C', 81)] };

describe('teamsInSeason', () => {
  it('keeps teams without fromSeason and those that have started', () => {
    expect(teamsInSeason(file, 79).teams.map(x => x.teamId)).toEqual(['A']);
    expect(teamsInSeason(file, 80).teams.map(x => x.teamId)).toEqual(['A', 'B']);
  });
  it('does not mutate its input', () => {
    teamsInSeason(file, 79);
    expect(file.teams).toHaveLength(3);
  });
});
describe('teamsJoining', () => {
  it('lists the teams whose fromSeason is exactly that season', () => {
    expect(teamsJoining(file, 80).map(x => x.teamId)).toEqual(['B']);
  });
});
describe('schema and definition', () => {
  it('accepts fromSeason and still rejects unknown fields', () => {
    expect(Team.safeParse(t('A', 80)).success).toBe(true);
    expect(Team.safeParse({ ...t('A'), extra: 1 }).success).toBe(false);
    expect(Team.safeParse({ ...t('A'), fromSeason: 0 }).success).toBe(false);
  });
  it('defines PHI (East) and LAL (West) from S80, valid as a TeamsFile', () => {
    expect(EXPANSION_TEAMS.map(x => [x.teamId, x.group, x.fromSeason])).toEqual([['PHI', 'E', 80], ['LAL', 'W', 80]]);
    expect(TeamsFile.safeParse({ league: 'fba', teams: EXPANSION_TEAMS }).success).toBe(true);
    const lal = EXPANSION_TEAMS[1];
    expect([lal.name, lal.abbr, lal.logoFolder, lal.logoFile]).toEqual(['Team 32', 'T32', 'FBA', 'FBA_logo.png']);
    expect(EXPANSION_TEAMS[0].logoFolder).toBe('Philly Phantoms');
  });
  it('derives the lottery size from the team count', () => {
    expect([lotterySizeFor(30), lotterySizeFor(32)]).toEqual([14, 16]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run engine/shared/teams.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`types.ts`, in `Team` add after `country`:

```ts
  /** The first season the team plays; teams without it have always been in the league. Season-scoped code reads `teamsInSeason`. */
  fromSeason: int.min(1).optional(),
```

`engine/shared/teams.ts`:

```ts
import type { Team, TeamsFile } from './types';

/** The teams that play in `season`: a team with `fromSeason` joins that season. */
export function teamsInSeason(file: TeamsFile, season: number): TeamsFile {
  return { ...file, teams: file.teams.filter(t => t.fromSeason === undefined || t.fromSeason <= season) };
}

/** The teams whose first season is exactly `season` (the expansion teams of that year). */
export function teamsJoining(file: TeamsFile, season: number): Team[] {
  return file.teams.filter(t => t.fromSeason === season);
}
```

`engine/shared/league.ts`:

```ts
/** Playoff seeds per conference. */
export const PLAYOFF_SEEDS = 8;

/** Non-playoff teams in a two-conference league: the size of the draft lottery when no expansion team joins it. */
export const lotterySizeFor = (teamCount: number): number => Math.max(0, teamCount - 2 * PLAYOFF_SEEDS);
```

`engine/shared/expansion.ts`:

```ts
import type { Team } from './types';

/** The FBA expansion: the season the teams first play. To rename a team before the "add teams" step has run, edit this file; afterwards `leagues/fba/teams.json` is the place. */
export const EXPANSION_SEASON = 80;
export const EXPANSION_PICKS_EACH = 4;
export const MAX_PROTECTED = 4;

export const EXPANSION_TEAMS: Team[] = [
  {
    teamId: 'PHI', name: 'Philly Phantoms', abbr: 'PHI', group: 'E', logoFolder: 'Philly Phantoms',
    badge: { bg: '#173C74', fg: '#ffffff', accent: '#D23434' }, fromSeason: EXPANSION_SEASON,
  },
  {
    // The Los Angeles Labradors are being reworked: a placeholder under their franchise id, with the generic FBA logo.
    teamId: 'LAL', name: 'Team 32', abbr: 'T32', group: 'W', logoFolder: 'FBA', logoFile: 'FBA_logo.png',
    badge: { bg: '#16346F', fg: '#ffffff', accent: '#C8102E' }, fromSeason: EXPANSION_SEASON,
  },
];

export const addTeamsStepId = (season: number) => `s${season}-add-expansion-teams`;
export const expansionDraftStepId = (season: number) => `s${season}-expansion-draft`;
```

`teamColors.ts`: add `PHI: { primary: '#173C74', secondary: '#D23434' },` and `LAL: { primary: '#16346F', secondary: '#C8102E' },` (placeholder FBA colours) to `TEAM_COLORS`.

- [ ] **Step 4: Run** `npx vitest run engine/shared app/components/teamColors.test.ts` and `npx tsc --noEmit` — Expected: PASS, no output. (If `teamColors.test.ts` asserts that every key is in the committed teams.json, make it ignore keys listed in `EXPANSION_TEAMS`.)

- [ ] **Step 5: Commit**

```bash
git add web/engine/shared/types.ts web/engine/shared/teams.ts web/engine/shared/teams.test.ts web/engine/shared/expansion.ts web/engine/shared/league.ts web/app/components/teamColors.ts web/app/components/teamColors.test.ts
git commit -m "Expansion: Team.fromSeason, teamsInSeason and the S80 team definitions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Season length and sizes read from the data

**Files:**
- Modify: `engine/season/standings.ts` (lines 7-11, 252), `engine/playoffs/moves.ts` (line 17), `engine/roster/picks.ts`, `engine/roster/tradeValue.ts`, their tests (`picks.test.ts` imports `LOTTERY_SIZE`)
- Test: `engine/season/standings.test.ts`, `engine/roster/tradeValue.test.ts`

**Interfaces:**
- Consumes: `PLAYOFF_SEEDS`, `lotterySizeFor` (Task 1).
- Produces: `seasonLength(league: SeasonLeague, teams: ScheduleTeamInfo[]): { games: number; confGames: number }`; `standings(league, teams, games, len = seasonLength(league, teams), playoffs)` (default now computed); `PLAYOFF_SEEDS` still exported from `standings.ts` (re-export). `SEASON_LENGTH` and `LOTTERY_SIZE` are removed; `picks.test.ts` uses `lotterySizeFor(30)`.

- [ ] **Step 1: Write the failing tests** (append to `standings.test.ts`)

```ts
import { PAIRINGS } from './schedule';
import { seasonLength } from './standings';

describe('seasonLength', () => {
  const league = (perGroup: number) => ['E', 'W'].flatMap(g => Array.from({ length: perGroup }, (_, i) => ({ teamId: `${g}${i}`, group: g })));
  it('matches the 15-per-conference season (86 games, 56 in conference)', () => {
    expect(seasonLength('fba', league(15))).toEqual({ games: 86, confGames: 56 });
  });
  it('is 92 and 60 for 16 per conference', () => {
    expect(seasonLength('fba', league(16))).toEqual({ games: 92, confGames: 60 });
  });
  it('is 30 for a 16-team D2 league', () => {
    expect(seasonLength('fbad2', Array.from({ length: 16 }, (_, i) => ({ teamId: `D${i}`, group: 'PL' })))).toEqual({ games: 30, confGames: 30 });
  });
});
```

and to `tradeValue.test.ts` a case that `pickValue(...)` with a `ranks` map of 32 teams and `{ kind: 'lottery' }` protects up to slot 16 (a team ranked 16 gets the same value as a "top 16" pick: `expect(pickValue('T16', 81, {kind:'lottery'}, 80, ranks)).toBeCloseTo(pickValue('T16', 81, {kind:'top', n:16}, 80, ranks))`), where `ranks = new Map(Array.from({length:32},(_, i)=>[`T${i+1}`, i+1]))`.

- [ ] **Step 2: Run** `npx vitest run engine/season/standings.test.ts engine/roster/tradeValue.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`standings.ts`:

```ts
import { PLAYOFF_SEEDS } from '../shared/league';
import { PAIRINGS } from './schedule';
export { PLAYOFF_SEEDS };

/** Games per team and conference games per team, from the real group sizes (each pairing is played home and away). */
export function seasonLength(league: SeasonLeague, teams: ScheduleTeamInfo[]): { games: number; confGames: number } {
  const { sameGroup, otherGroup } = PAIRINGS[league];
  const size = new Map<string | null, number>();
  for (const t of teams) size.set(t.group, (size.get(t.group) ?? 0) + 1);
  const [mine = 1] = [...size.values()];
  const same = Math.max(0, mine - 1);
  const other = teams.length - mine;
  const confGames = same * sameGroup * 2;
  return { games: confGames + other * otherGroup * 2, confGames };
}
```

Delete the old `export const PLAYOFF_SEEDS = 8;` and `SEASON_LENGTH`; change `standings(...)`'s `len = SEASON_LENGTH[league]` to `len = seasonLength(league, teams)`. In `playoffs/moves.ts` line 17 pass `seasonLength(state.league, teams)` instead of `SEASON_LENGTH[state.league]` (import `seasonLength`). Fix any other `SEASON_LENGTH` import the compiler reports (`grep -rn SEASON_LENGTH engine app`).

`picks.ts`: delete `export const LOTTERY_SIZE = 14;` and add `export { lotterySizeFor } from '../shared/league';`. In `picks.test.ts` replace `LOTTERY_SIZE` with `lotterySizeFor(30)`.

`tradeValue.ts`: replace `const AVERAGE_SLOT = 15.5;` by computing inside `pickValue`: `const average = (ranks.size + 1) / 2;` and use `average` where `AVERAGE_SLOT` was; replace `Math.min(14, teams)` with `Math.min(lotterySizeFor(teams), teams)` (import from `../shared/league`).

- [ ] **Step 4: Run** `npx vitest run` (whole suite; other tests may import `SEASON_LENGTH`/`LOTTERY_SIZE`, fix them) and `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** the changed files by explicit path with message `Expansion: season length and lottery size come from the team count`.

---

### Task 3: The 16-team lottery

**Files:**
- Modify: `engine/offseason/lottery.ts`, `engine/offseason/lottery.test.ts`, `engine/offseason/testFixtures.ts`
- Modify: `app/offseason/LotteryPage.tsx` (Expansion label)

**Interfaces:**
- Consumes: `teamsInSeason`, `teamsJoining` (Task 1), `PLAYOFF_SEEDS`.
- Produces:
  - `LotteryTeam = { teamId: string; w: number; l: number; expansion?: boolean }`
  - `oddsTable(real: number, expansion: number): number[] | null`
  - `lotteryOdds(teams: LotteryTeam[])` (expansion-flagged teams are taken first, whatever their position in the input)
  - `lotteryPreview(state)` adds one row per team with `fromSeason === state.season + 1` first.
  - Test fixture `teamsFile32()` / `expansionTeams()` in `offseason/testFixtures.ts`.

- [ ] **Step 1: Write the failing tests** (append to `lottery.test.ts`)

```ts
import { oddsTable } from './lottery';

describe('16-team lottery with 2 expansion teams', () => {
  const real = Array.from({ length: 14 }, (_, i) => team(i, i, 80 - i));
  const exp = [{ teamId: 'PHI', w: 0, l: 0, expansion: true }, { teamId: 'LAL', w: 0, l: 0, expansion: true }];

  it('derives the table: 14, 14, then the S74 table scaled to 72%', () => {
    const t = oddsTable(14, 2)!;
    expect(t).toHaveLength(16);
    expect(t.slice(0, 2)).toEqual([14, 14]);
    expect(t[2]).toBeCloseTo(10.08, 10);
    expect(t[15]).toBeCloseTo(0.36, 10);
    expect(t.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('puts the expansion teams in slots 1 and 2 even when listed last, and averages ties only among real teams', () => {
    const r = lotteryOdds([...real, ...exp]);
    if (!r.ok) throw new Error(r.problem);
    expect(r.odds.slice(0, 2).map(o => [o.teamId, o.slot, o.pct])).toEqual([['PHI', 1, 14], ['LAL', 2, 14]]);
    expect(r.odds[2]).toMatchObject({ teamId: 'T0', slot: 3 });
    expect(r.odds.reduce((s, o) => s + o.pct, 0)).toBeCloseTo(100, 10);
  });
  it('has no table for 16 real teams yet', () => {
    expect(lotteryOdds(Array.from({ length: 16 }, (_, i) => team(i)))).toEqual({ ok: false, problem: 'No lottery odds for a 16-team lottery' });
  });
});

describe('runLottery with expansion teams in teams.json', () => {
  it('draws 16 teams, orders 32 picks and ignores the expansion teams in S79 standings', () => {
    const s = state({ teams: teamsFile32() });
    const preview = lotteryPreview(s);
    if (!preview.ok) throw new Error(preview.problem);
    expect(preview.odds).toHaveLength(16);
    expect(preview.odds.slice(0, 2).map(o => o.teamId)).toEqual(['PHI', 'LAL']);
    const r = runLottery(s, mulberry32(7), ctx);
    if (!r.ok) throw new Error(r.problems.join('; '));
    const doc = r.writes.find(w => w.path === 'leagues/fba/S79/lottery.json')!.doc as { lottery: string[]; order: string[] };
    expect(doc.lottery).toHaveLength(16);
    expect(doc.order).toHaveLength(32);
    expect(new Set(doc.order).size).toBe(32);
    expect(doc.order[31]).toBe('T00');
  });
});
```

Add to `testFixtures.ts` (`import { EXPANSION_TEAMS } from '../shared/expansion'`):

```ts
/** The 30-team fixture plus PHI and LAL (fromSeason 80), as teams.json holds them once the teams are added. */
export const teamsFile32 = (): TeamsFile => {
  const f = teamsFile();
  return { ...f, teams: [...f.teams, ...EXPANSION_TEAMS] };
};
```
Also import `teamsFile32`, `lotteryPreview` in the test file.

- [ ] **Step 2: Run** `npx vitest run engine/offseason/lottery.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** in `lottery.ts`

```ts
import { teamsInSeason, teamsJoining } from '../shared/teams';

export interface LotteryTeam { teamId: string; w: number; l: number; expansion?: boolean }

const EXPANSION_PCT = 14;

/**
 * The pick-1 odds (percent), worst slot first, for `real` regular lottery teams plus `expansion` expansion teams.
 * Expansion teams are tied at the top; the real teams share what is left on the real table's shape.
 */
export function oddsTable(real: number, expansion: number): number[] | null {
  const base = LOTTERY_ODDS[real];
  if (!base) return null;
  if (expansion === 0) return base;
  const scale = (100 - expansion * EXPANSION_PCT) / 100;
  return [...Array<number>(expansion).fill(EXPANSION_PCT), ...base.map(p => Number((p * scale).toFixed(6)))];
}

export function lotteryOdds(teams: LotteryTeam[]): { ok: true; odds: LotteryOdds[] } | { ok: false; problem: string } {
  const exp = teams.filter(t => t.expansion);
  const real = teams.filter(t => !t.expansion);
  const table = oddsTable(real.length, exp.length);
  if (!table) return { ok: false, problem: `No lottery odds for a ${teams.length}-team lottery` };
  const ordered = [...exp, ...real];
  const odds: LotteryOdds[] = ordered.map((t, i) => ({ teamId: t.teamId, slot: i + 1, w: t.w, l: t.l, pct: table[i] }));
  // Ties share the average of their slots; expansion teams (the first exp.length rows) are never averaged with real teams.
  for (let i = exp.length; i < odds.length;) {
    let j = i;
    while (j + 1 < odds.length && odds[j + 1].w === odds[i].w && odds[j + 1].l === odds[i].l) j++;
    const avg = table.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) odds[k] = { ...odds[k], pct: avg };
    i = j + 1;
  }
  return { ok: true, odds };
}
```

Replace `teamInfo` and `lotteryPreview`:

```ts
/** The teams that played season n (the expansion teams, which join in n + 1, have no record). */
const teamInfo = (s: LotteryState): ScheduleTeamInfo[] => teamsInSeason(s.teams, s.season).teams.map(t => ({ teamId: t.teamId, group: t.group }));

export function lotteryPreview(state: LotteryState): ReturnType<typeof lotteryOdds> {
  const rows = standings('fba', teamInfo(state), state.results.games, undefined, state.playoffs).lottery;
  const joining = teamsJoining(state.teams, state.season + 1).map(t => ({ teamId: t.teamId, w: 0, l: 0, expansion: true }));
  return lotteryOdds([...joining, ...rows.map(r => ({ teamId: r.teamId, w: r.w, l: r.l }))]);
}
```

`runLottery` needs no other change (`draftOrder` already filters drawn teams; `teamInfo` is season-filtered; `lotterySize: lottery.length`).

`LotteryPage.tsx`: in `teamOf`, after the `TeamName`, append `{t.fromSeason === state.season + 1 && <Badge kind="current">Expansion</Badge>}` (wrap in a fragment); the odds bar `o.pct * 5` stays.

- [ ] **Step 4: Run** `npx vitest run engine/offseason app/offseason` and `npx tsc --noEmit` — Expected: PASS. Add one assertion to `app/offseason/LotteryPage.test.tsx`: with `teamsFile32()` loaded, the preview shows "Expansion" twice and 16 odds rows.

- [ ] **Step 5: Commit** (explicit paths) `Expansion: 16-team lottery odds with the expansion teams tied at the top`.

---

### Task 4: Calendar steps and the migration

**Files:**
- Modify: `engine/shared/calendar.ts`, `engine/shared/calendar.test.ts`
- Modify: `importers/run.ts` (new mode `--expansion-step`, add to `MODE_FLAGS`, dispatch near line 750)
- Modify: `app/stepRoutes.ts`, `app/stepRoutes.test.ts`

**Interfaces:**
- Consumes: `EXPANSION_SEASON`, `addTeamsStepId`, `expansionDraftStepId` (Task 1).
- Produces: `calendarFor(n)` includes `addTeamsStepId(EXPANSION_SEASON)` before `s{n+1}-fba-draft-lottery` when `n + 1 === EXPANSION_SEASON`, and `expansionDraftStepId(EXPANSION_SEASON)` right after `s{n}-fba-draft` when `n === EXPANSION_SEASON`; `withExpansionStep(cal: CalendarFile): CalendarFile` (adds the first step to a calendar for season `EXPANSION_SEASON - 1` that lacks it, else returns `cal` unchanged); `toolTarget` returns `/league/fba/expansion` for both step ids.

- [ ] **Step 1: Write the failing tests** (append to `calendar.test.ts`)

```ts
import { withExpansionStep } from './calendar';

describe('expansion steps', () => {
  it('S79 has the add-teams step right before the S80 lottery', () => {
    const ids = calendarFor(79).steps.map(s => s.id);
    expect(ids.indexOf('s80-add-expansion-teams')).toBe(ids.indexOf('s80-fba-draft-lottery') - 1);
    expect(ids.indexOf('s80-add-expansion-teams')).toBeGreaterThan(ids.indexOf('fba'));
  });
  it('S80 has the expansion draft right after the S80 draft', () => {
    const ids = calendarFor(80).steps.map(s => s.id);
    expect(ids.indexOf('s80-expansion-draft')).toBe(ids.indexOf('s80-fba-draft') + 1);
    expect(ids[ids.indexOf('s80-expansion-draft') + 1]).toBe('free-agency-offseason');
  });
  it('other seasons are unchanged', () => {
    expect(calendarFor(78).steps.some(s => /expansion/.test(s.id))).toBe(false);
    expect(calendarFor(81).steps.some(s => /expansion/.test(s.id))).toBe(false);
  });
  it('migrates an S79 calendar that lacks the step, once, keeping done flags', () => {
    const old = { ...calendarFor(79), steps: calendarFor(79).steps.filter(s => !/expansion/.test(s.id)).map((s, i) => ({ ...s, done: i < 9 })) };
    const next = withExpansionStep(old);
    expect(next.steps).toHaveLength(old.steps.length + 1);
    expect(next.steps.find(s => s.id === 's80-add-expansion-teams')!.done).toBe(false);
    expect(next.steps.filter(s => s.done)).toHaveLength(9);
    expect(withExpansionStep(next)).toBe(next);
  });
  it('leaves other seasons alone', () => {
    const c = calendarFor(78);
    expect(withExpansionStep(c)).toBe(c);
  });
});
```

and in `stepRoutes.test.ts` expect `toolTarget` of `{ id: 's80-add-expansion-teams', ...}` and `{ id: 's80-expansion-draft', ...}` to be `'/league/fba/expansion'`.

- [ ] **Step 2: Run** `npx vitest run engine/shared/calendar.test.ts app/stepRoutes.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

In `calendar.ts` (import `EXPANSION_SEASON, addTeamsStepId, expansionDraftStepId` from `./expansion`), inside `calendarFor`'s steps array:

```ts
      step(`s${n}-fba-draft`, `S${n} FBA Draft`),
      ...(n === EXPANSION_SEASON ? [step(expansionDraftStepId(n), `S${n} Expansion Draft`)] : []),
      step('free-agency-offseason', 'Free Agency/Offseason'),
```
and
```ts
      step('fba', 'FBA', false, 'fba'),
      ...(n + 1 === EXPANSION_SEASON ? [step(addTeamsStepId(n + 1), `Add S${n + 1} Expansion Teams`)] : []),
      step(`s${n + 1}-fba-draft-lottery`, `S${n + 1} FBA Draft Lottery`),
```

```ts
/** Adds the add-teams step (before the lottery) to the calendar of the season before the expansion, if it lacks it. */
export function withExpansionStep(cal: CalendarFile): CalendarFile {
  const id = addTeamsStepId(EXPANSION_SEASON);
  if (cal.season !== EXPANSION_SEASON - 1 || cal.steps.some(s => s.id === id)) return cal;
  const at = cal.steps.findIndex(s => s.id === `s${EXPANSION_SEASON}-fba-draft-lottery`);
  const added: CalendarStep = { id, label: `Add S${EXPANSION_SEASON} Expansion Teams`, kind: 'offseason', league: null, sub: false, done: false };
  const steps = at < 0 ? [...cal.steps, added] : [...cal.steps.slice(0, at), added, ...cal.steps.slice(at)];
  return { ...cal, steps };
}
```

`stepRoutes.ts` `toolTarget`: `if (/^s\d+-(add-expansion-teams|expansion-draft)$/.test(step.id)) return '/league/fba/expansion';`

`importers/run.ts`: copy `importWcQualifyingStep` as `importExpansionStep` using `withExpansionStep`, flag `--expansion-step`, messages `'--expansion-step needs calendar.json in the data folder.'`, `'Already has the expansion step'`, `` `Added s${EXPANSION_SEASON}-add-expansion-teams` ``; add `'--expansion-step'` to `MODE_FLAGS` and `if (process.argv.includes('--expansion-step')) return importExpansionStep();` next to the qualifying dispatch. Add a README line next to `--wc-qualifying-step` (find with `grep -rn "wc-qualifying-step" --include=*.md .`).

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: PASS. Existing tests that count calendar steps for S79/S80 get updated.

- [ ] **Step 5: Commit** `Expansion: calendar steps, the S79 migration mode and step routes`.

---

### Task 5: Add the teams (move) and the S80 rollover

**Files:**
- Create: `engine/season/addExpansionTeams.ts`, `engine/season/addExpansionTeams.test.ts`
- Modify: `engine/shared/types.ts` (`'expansion'` in `TransactionType`), `engine/season/nextSeason.ts`, `engine/season/nextSeason.test.ts`, `app/pages/NextSeasonPage.tsx` (load `leagues/fba/teams.json`)

**Interfaces:**
- Consumes: `EXPANSION_TEAMS`, `EXPANSION_SEASON`, `addTeamsStepId`, `teamsJoining`, `calendarProblem`, `markStepDone`, `appendTx`.
- Produces:
  - `AddTeamsState = { season: number; calendar: CalendarFile; teams: TeamsFile; tx: TransactionsFile }`
  - `addExpansionTeams(state: AddTeamsState, ctx: MoveContext): WritesResult` — writes `leagues/fba/teams.json`, `leagues/fba/S{season}/transactions.json`, `calendar.json`.
  - `NextSeasonInput.fbaTeams: TeamsFile`; the S{n+1} FBA rosters gain `normalizeRoster([], 'fba')` for each team with `fromSeason === n + 1` that has no entry.

- [ ] **Step 1: Write the failing tests**

`addExpansionTeams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calendarFor } from '../shared/calendar';
import { EXPANSION_TEAMS } from '../shared/expansion';
import type { TeamsFile, TransactionsFile } from '../shared/types';
import { addExpansionTeams, type AddTeamsState } from './addExpansionTeams';

const base = (): TeamsFile => ({ league: 'fba', teams: [{ teamId: 'A', name: 'A', abbr: 'A', group: 'E', logoFolder: null, badge: { bg: '#000', fg: '#fff' } }] });
const atStep = () => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === 's80-add-expansion-teams');
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};
const state = (over: Partial<AddTeamsState> = {}): AddTeamsState => ({
  season: 79, calendar: atStep(), teams: base(), tx: { league: 'fba', season: 79, entries: [] } as TransactionsFile, ...over,
});

describe('addExpansionTeams', () => {
  it('appends both teams, logs it and completes the step', () => {
    const r = addExpansionTeams(state(), { batchId: 'b' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    const teams = r.writes.find(w => w.path === 'leagues/fba/teams.json')!.doc as TeamsFile;
    expect(teams.teams.map(t => t.teamId)).toEqual(['A', 'PHI', 'LAL']);
    const tx = r.writes.find(w => w.path === 'leagues/fba/S79/transactions.json')!.doc as TransactionsFile;
    expect(tx.entries[0].type).toBe('expansion');
    const cal = r.writes.find(w => w.path === 'calendar.json')!.doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === 's80-add-expansion-teams')!.done).toBe(true);
  });
  it('refuses when the step is not current', () => {
    const r = addExpansionTeams(state({ calendar: calendarFor(79) }), { batchId: 'b' });
    expect(r.ok).toBe(false);
  });
  it('refuses when the teams are already there', () => {
    const r = addExpansionTeams(state({ teams: { ...base(), teams: [...base().teams, ...EXPANSION_TEAMS] } }), { batchId: 'b' });
    expect(r).toEqual({ ok: false, problems: ['The expansion teams are already in the league'] });
  });
});
```

`nextSeason.test.ts`: add a case in the existing style: with `fbaTeams` containing PHI/LAL (`fromSeason: 80`) and an S79→S80 input, the written `leagues/fba/S80/rosters.json` has `PHI` and `LAL` each with exactly 5 vacant entries (positions PG SG SF PF C, `playerId: null`) and existing teams are unchanged. Every other existing `nextSeasonDocs` test input gets `fbaTeams: { league: 'fba', teams: [] }`.

- [ ] **Step 2: Run** `npx vitest run engine/season` — Expected: FAIL.

- [ ] **Step 3: Implement**

`types.ts`: add `'expansion'` to the `TransactionType` enum list.

`addExpansionTeams.ts`:

```ts
import { appendTx, type MoveContext } from '../roster/state';
import { addTeamsStepId, EXPANSION_SEASON, EXPANSION_TEAMS } from '../shared/expansion';
import { markStepDone } from '../shared/calendar';
import type { CalendarFile, TeamsFile, TransactionsFile } from '../shared/types';
import { calendarProblem, type WritesResult } from './moves';

export interface AddTeamsState {
  /** The current season (the one before the expansion). */
  season: number;
  calendar: CalendarFile;
  teams: TeamsFile;
  /** This season's FBA transactions. */
  tx: TransactionsFile;
}

/** The "add teams" step: the expansion teams join teams.json (with `fromSeason`), so the lottery can list them. */
export function addExpansionTeams(state: AddTeamsState, ctx: MoveContext): WritesResult {
  const id = addTeamsStepId(EXPANSION_SEASON);
  const step = calendarProblem(state.calendar, id, 'The expansion teams are added');
  if (step) return { ok: false, problems: [step] };
  const have = new Set(state.teams.teams.map(t => t.teamId));
  if (EXPANSION_TEAMS.some(t => have.has(t.teamId))) return { ok: false, problems: ['The expansion teams are already in the league'] };
  const names = EXPANSION_TEAMS.map(t => t.name).join(' and ');
  return {
    ok: true,
    label: `Add the S${EXPANSION_SEASON} expansion teams`,
    writes: [
      { path: 'leagues/fba/teams.json', doc: { ...state.teams, teams: [...state.teams.teams, ...EXPANSION_TEAMS] } },
      { path: `leagues/fba/S${state.season}/transactions.json`, doc: appendTx(state.tx, ctx, 'expansion', EXPANSION_TEAMS.map(t => t.teamId), [`${names} join the league in S${EXPANSION_SEASON}`]) },
      { path: 'calendar.json', doc: markStepDone(state.calendar, id) },
    ],
  };
}
```

`nextSeason.ts`: add `fbaTeams: TeamsFile` to `NextSeasonInput` (it already imports `TeamsFile`); import `normalizeRoster` from `../roster/rules` and `teamsJoining` from `../shared/teams`; after building `carry(input.fba.rosters)`:

```ts
  const fbaNext = carry(input.fba.rosters);
  for (const t of teamsJoining(input.fbaTeams, next)) {
    if (!(t.teamId in fbaNext.teams)) fbaNext.teams[t.teamId] = normalizeRoster([], 'fba');
  }
```
and write `fbaNext` instead of `carry(input.fba.rosters)` for `p.next.fbaRosters`. (`carry` returns a fresh object, so mutating `teams` here is safe.)

`NextSeasonPage.tsx`: add `useDoc<TeamsFile>('leagues/fba/teams.json')` to the loaded docs, pass as `fbaTeams` (missing ⇒ `{ league: 'fba', teams: [] }`). Update `NextSeasonPage.test.tsx` fixtures to serve the teams doc.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `Expansion: the add-teams move and empty S80 rosters for joining teams`.

---

### Task 6: Season gating across pages

**Files:**
- Modify: `app/season/useSeasonState.ts`, `app/offseason/useLotteryState.ts` (no filter: the engine filters), `app/pages/SchedulesPage.tsx`, `app/pages/LeaguePage.tsx`, `app/pages/TradePage.tsx`, `app/pages/TransactionsPage.tsx`, `app/pages/TeamPage.tsx`, `app/pages/FreeAgencyPage.tsx`, `engine/season/moves.ts` (`makeSchedules`)
- Test: add cases to `engine/season/moves.test.ts`, `app/pages/StandingsPage.test.tsx`

**Interfaces:**
- Consumes: `teamsInSeason` (Task 1).
- Produces: every season-scoped consumer of `leagues/fba/teams.json` sees only teams with `fromSeason <= that season`. History pages (`app/history/*`) keep all teams (they need PHI/LAL for logos and franchise pages).

- [ ] **Step 1: Write the failing tests**
  - `moves.test.ts`: `makeSchedules` for season 79 with an `fba.teams` file that also holds PHI and LAL (`fromSeason: 80`) produces a schedule with 30 teams' games only (`new Set(games.flatMap(g => [g.home, g.away])).size === 30`); for season 80 with the same file, 32 teams and every team playing 92 games (`games.length === 32 * 92 / 2`).
  - `StandingsPage.test.tsx`: with `leagues/fba/teams.json` holding the expansion teams and season 79 data, neither "Team 32" nor "Philly Phantoms" appears.

- [ ] **Step 2: Run** them — Expected: FAIL.

- [ ] **Step 3: Implement.** In `makeSchedules` build `teams` from `teamsInSeason(input[league].teams, input.season).teams`. In each page/hook listed, apply `teamsInSeason(doc, season)` to the loaded `TeamsFile` where the season is the current/viewed season (`useSeasonState`: its season is `meta.currentSeason`; `LeaguePage`, `TradePage`, `TransactionsPage`, `TeamPage`, `FreeAgencyPage`, `SchedulesPage`: `meta.currentSeason`). Use a `useMemo` so the object identity is stable. Leave `app/history/*` and `app/offseason/FbaDraftPage.tsx`/`ProRatingsPage.tsx` (the draft season is S80, where the teams exist; the filter is a no-op there) untouched.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `Expansion: S79 pages and schedules ignore teams that join in S80`.

---

### Task 7: The expansion draft engine

**Files:**
- Modify: `engine/shared/types.ts` (add `ExpansionPick`, `ExpansionFile` after `DraftHistoryFile`), `engine/shared/schemaRegistry.ts`
- Create: `engine/offseason/expansion.ts`, `engine/offseason/expansion.test.ts`
- Modify: `engine/shared/schemaRegistry.test.ts` (rule exists)

**Interfaces:**
- Consumes: `slotProblems`-style helpers from `engine/roster/rules` (`normalizeRoster`, `vacantEntry`, `payroll`, `capProblem`, `CAP`), `findOnRoster`, `appendTx`, `withTeam`, `docPath`, `teamsJoining`, `calendarProblem`, `markStepDone`.
- Produces:

```ts
export const expansionPath = (season: number) => `leagues/fba/S${season}/expansion.json`;
export interface ExpansionState {
  season: number;                 // 80
  calendar: CalendarFile;
  teams: TeamsFile;               // leagues/fba/teams.json
  fba: RostersFile;               // this season's FBA rosters
  players: PlayersFile;
  expansion: ExpansionFile | null;
  tx: TransactionsFile;           // this season's FBA transactions
  history: DraftHistoryFile;      // leagues/fba/draftHistory.json
}
export function expansionOrder(teamIds: string[], each?: number): string[];
export interface Exposed { playerId: string; teamId: string; position: Position; rating: number | null; age: number | null; contractAmount: number | null; contractEnd: number | null }
export function exposedPlayers(state: ExpansionState): Exposed[];
export function onTheClock(file: ExpansionFile): string | null;          // teamId or null
export function startExpansion(state, ctx: MoveContext): WritesResult;
export function setProtections(state, teamId: string, playerIds: string[], ctx: MoveContext): WritesResult;
export function lockProtections(state, ctx: MoveContext): WritesResult;
export function pickProblems(state, playerId: string): string[];          // why this pick is refused (empty = allowed)
export function expansionPick(state, playerId: string, ctx: MoveContext): WritesResult;
export function finishExpansion(state, ctx: MoveContext): WritesResult;
```

- [ ] **Step 1: Write the failing tests** (`expansion.test.ts`). Build a small fixture inline: 6 existing teams `A..F` (group E/W), each with 5 players (one per position, ids `p10001`…, ratings 70-90, `contractAmount: 3`, `contractEnd: 82`), plus PHI and LAL (`fromSeason: 80`) with `normalizeRoster([], 'fba')` rosters; `players.players[id] = { name, ... }` as `PlayersFile` requires (copy a minimal valid entry from `offseason/testFixtures.ts`); `calendar` positioned at `s80-expansion-draft` as current (use `calendarFor(80)` with all earlier steps done). Cases:

```ts
it('orders the picks as a snake', () => {
  expect(expansionOrder(['PHI', 'LAL'], 4)).toEqual(['PHI', 'LAL', 'LAL', 'PHI', 'PHI', 'LAL', 'LAL', 'PHI']);
});
it('starts with an empty protect phase for the joining teams only', () => { /* startExpansion → expansion.json phase 'protect', order of 8, protections {} */ });
it('refuses start with no joining teams, off-step, or when already started', () => {});
it('setProtections: accepts 4, refuses 5, refuses another team’s player, refuses a restricted player, refuses duplicates', () => {});
it('exposedPlayers excludes protected and restricted players and the expansion teams’ own players', () => {});
it('lockProtections refuses when fewer players are exposed than picks (Review Focus 3)', () => {
  // every team protects 4 and has its 5th restricted → 0 exposed → problem mentions "0 players are exposed; the draft needs 8"
});
it('expansionPick moves the player with his contract and vacates the donor slot', () => {});
it('a team that lost a player has no more exposed players (Review Focus 1)', () => {
  // protect nothing on team A (5 exposed), PHI takes one → exposedPlayers has none from A
});
it('refuses a position the expansion team already holds (Review Focus 2)', () => {});
it('refuses a pick that takes payroll over the cap (Review Focus 2)', () => {
  // taker already at $22 payroll, player $4 → capProblem message "Payroll would be $26 (cap $25)"
});
it('refuses picking out of turn data: not exposed, phase not draft, draft finished', () => {});
it('finishExpansion refuses before 8 picks; after 8 writes phase done, a draftHistory expansion entry numbered 1..8 and completes the step', () => {});
it('writes only schema-valid docs', () => { /* ExpansionFile.parse(doc) for every expansion.json write */ });
```
Write each body fully (the one-line comments above are the spec of each test; every test must contain real `expect`s).

- [ ] **Step 2: Run** `npx vitest run engine/offseason/expansion.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`types.ts`:

```ts
/** leagues/fba/S{n}/expansion.json: the expansion draft held in season n (protections, then the picks). */
export const ExpansionPick = z.object({
  n: int.positive(), teamId: z.string().min(1), fromTeamId: z.string().min(1), playerId, position: Position,
}).strict();
export type ExpansionPick = z.infer<typeof ExpansionPick>;
export const ExpansionFile = z.object({
  league: z.literal('fba'),
  season: int,
  phase: z.enum(['protect', 'draft', 'done']),
  /** Up to 4 chosen players per existing team (restricted-contract players are protected without being listed). */
  protections: z.record(z.string(), z.array(playerId).max(4)),
  /** The expansion teams in pick order. */
  order: z.array(z.string().min(1)),
  picks: z.array(ExpansionPick),
}).strict().refine(f => f.picks.length <= f.order.length, 'More picks than the order allows');
export type ExpansionFile = z.infer<typeof ExpansionFile>;
```

`schemaRegistry.ts`: import `ExpansionFile`; add `[new RegExp(`^leagues/fba/${S}/expansion\\.json$`), ExpansionFile],` after the lottery rule. Add a case to `schemaRegistry.test.ts` (`schemaForPath('leagues/fba/S80/expansion.json')` is `ExpansionFile`).

`expansion.ts` rules to implement exactly:
- `expansionOrder(ids, each = EXPANSION_PICKS_EACH)`: for round `r` in `0..each-1`, push `r % 2 === 0 ? ids : [...ids].reverse()`.
- joining teams = `teamsJoining(state.teams, state.season)`; existing teams = every team id in `state.fba.teams` not joining.
- `exposedPlayers`: for each existing team, for each entry with `playerId !== null`, `restricted !== true`, not in `protections[teamId]`; skip the team if `expansion.picks.some(p => p.fromTeamId === teamId)`.
- `startExpansion`: problems: `calendarProblem(calendar, expansionDraftStepId(season), 'The expansion draft starts')`; no joining teams ("No team joins in S{n}"); `state.expansion` exists ("The expansion draft has already started"). Writes `{ path: expansionPath(n), doc: { league: 'fba', season: n, phase: 'protect', protections: {}, order: expansionOrder(joining ids), picks: [] } }` and a transaction `appendTx(tx, ctx, 'expansion', joining ids, [`The S${n} expansion draft starts: ${order.length} picks`])`.
- `setProtections(teamId, ids)`: phase must be `protect`; teamId must be an existing team; `ids.length <= MAX_PROTECTED`; no duplicates; each on that team's roster (`state.fba.teams[teamId]`); none `restricted` (message: `${name} has a restricted contract and is protected already`). Writes the doc with `protections[teamId] = ids` (an empty list removes the key).
- `lockProtections`: phase must be `protect`; `donors = new Set(exposedPlayers(state).map(e => e.teamId)).size`; if `donors < order.length` problem `Only ${donors} ${donors === 1 ? 'team has' : 'teams have'} an exposed player; the draft needs ${order.length}. Lower some protections`; writes phase `draft`.
- `pickProblems(state, playerId)`: phase must be `draft` ("The draft isn't open"); `onTheClock` non-null ("The expansion draft is finished"); player must be in `exposedPlayers` ("`${name}` isn't available: protected, restricted or his team has already lost a player"); the clock team's roster must not hold a player at that position (`${team} already has a ${pos}`); `capProblem(payroll(roster, season) + amount)` where amount `contractAmount ?? 0` (only when `contractEnd >= season`, reuse `payroll([entry], season)`).
- `expansionPick`: runs `calendarProblem` + `pickProblems`; builds: donor roster `normalizeRoster(donor.filter(e => e.playerId !== playerId), 'fba')` (keeps order, vacates the slot); taker roster `normalizeRoster([...taker.filter(e => e.playerId !== null), moved], 'fba')` with `moved = { ...entry }` (contract and `restricted` kept); `picks` appended with `{ n: picks.length + 1, teamId, fromTeamId, playerId, position }`; transaction line `S${n} Expansion Draft #${k}: ${teamName} selects ${playerName} (${pos}, from ${donorName})`. Writes: expansion.json, `docPath('fba', n)` rosters, `docPath('fbaTx', n)` transactions. Label `#${k}: ${teamName} selects ${playerName}`.
- `finishExpansion`: phase `draft` and `picks.length === order.length` (else `${left} picks are still to be made`); writes expansion.json `phase: 'done'`; `leagues/fba/draftHistory.json` with `{ season: n, kind: 'expansion', picks: picks.map(p => ({ pick: p.n, teamId: p.teamId, teamName, viaTeamId: null, name, playerId: p.playerId, pos: p.position, detail: age === null ? null : String(age), college: null })) }` appended to `state.history.drafts` and re-sorted by `season` then `draft` before `expansion` (the schema's uniqueness refine means a second finish is refused: also guard `state.history.drafts.some(d => d.season === n && d.kind === 'expansion')`); the tx line `The S${n} expansion draft is finished`; `calendar.json` with `markStepDone(calendar, expansionDraftStepId(n))`.

- [ ] **Step 4: Run** `npx vitest run engine` and `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `Expansion: the expansion draft engine and its expansion.json schema`.

---

### Task 8: The Expansion page

**Files:**
- Create: `app/offseason/useExpansionState.ts`, `app/offseason/ExpansionPage.tsx`, `app/offseason/ExpansionPage.test.tsx`
- Modify: `app/shell/Layout.tsx` (route `/league/fba/expansion`), `app/offseason/offseason.css` (only if the existing classes don't cover it)

**Interfaces:**
- Consumes: `addExpansionTeams`, `startExpansion`, `setProtections`, `lockProtections`, `expansionPick`, `pickProblems`, `exposedPlayers`, `onTheClock`, `finishExpansion`, `commitDocs`, `newBatchId`, `useDoc`, `useSaving`, `TeamName`, `PageHeader`, `Badge`.
- Produces: `useExpansionState(): { addState?: AddTeamsState; draftState?: ExpansionState; versions: Versions; mode: 'add' | 'draft' | 'none'; error?: Error }`.

Page behaviour (follow `LotteryPage.tsx` and `FbaDraftPage.tsx` for loading, `PageHeader`, `commitDocs` and error display):

1. **Mode.** With `n = meta.currentSeason`: if the calendar has `addTeamsStepId(n + 1)` not done ⇒ `add`; else if it has `expansionDraftStepId(n)` ⇒ `draft`; else `none` (text "No expansion this season").
2. **Add mode.** A card listing the two teams from `EXPANSION_TEAMS` (logo via `TeamMark`/`TeamName`, name, conference) and a button "Add teams" (disabled while `useSaving()` or when `addExpansionTeams(state, …)` returns not ok, showing the problem text). On click: `commitDocs(result.label, result.writes, versions)`; versions come from `useDoc` for `leagues/fba/teams.json`, `leagues/fba/S{n}/transactions.json`, `calendar.json`.
3. **Draft mode** by `expansion.phase`:
   - no doc: card with "Start expansion draft" (`startExpansion`).
   - `protect`: a team selector (select of existing teams; each with a count "2/4"), the selected team's roster as a table with a checkbox per player (max 4 checked, disabled beyond; restricted players show a "Protected (restricted)" badge and no checkbox). Checking a box calls `setProtections` and commits. A summary line "N players exposed from M teams; the draft needs 8 picks". Button "Lock protections" (shows `lockProtections` problem when refused).
   - `draft`: the on-clock team (name + logo) and the order list with picks filled in; a table of `exposedPlayers` (name, pos, rating, age, contract, from team) with a "Take" button per row, disabled with the `pickProblems` text as `title`/inline note when refused. After the 8th pick a "Finish expansion draft" button (`finishExpansion`).
   - `done`: a read-only table of the 8 picks (pick, team, player, pos, from, contract).
4. **Saving.** Each action is one `commitDocs` call guarded by a `useRef` busy flag (CLAUDE.md gotcha); chained writes in a single action use the returned versions.
5. Use `s.teams.teams.find(...)` for names; show restricted/protected status with `Badge`.

- [ ] **Step 1: Write the failing tests** (`ExpansionPage.test.tsx`, jsdom, `cleanup()` in `afterEach`, `stubApi` from `../d2/testDocs` as in `FbaDraftPage.test.tsx`). Build docs from the engine fixture used in Task 7 (export it from `engine/offseason/testFixtures.ts` as `expansionState()` in this task). Cases:
  - add mode (`meta.currentSeason: 79`, calendar at the add-teams step): shows "Philly Phantoms" and "Team 32"; clicking "Add teams" posts one batch whose paths are exactly `leagues/fba/teams.json`, `leagues/fba/S79/transactions.json`, `calendar.json` with the loaded versions as `baseVersion`.
  - protect mode: checking a 5th box is impossible (disabled); a restricted player has no checkbox; "Lock protections" is disabled with the refusal text when too few players are exposed.
  - draft mode: the on-clock team is PHI; clicking "Take" on a player posts expansion.json + rosters + transactions; a refused pick (position already held) shows its text and posts nothing.
  - done mode: shows 8 picks, no buttons.

- [ ] **Step 2: Run** `npx vitest run app/offseason/ExpansionPage.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** the hook (mirror `useLotteryState.ts`: `useDoc` for each doc, `versions` for every doc a move writes: `leagues/fba/teams.json`, `leagues/fba/S{n}/transactions.json`, `calendar.json`, `leagues/fba/S{n}/expansion.json`, `leagues/fba/S{n}/rosters.json`, `leagues/fba/draftHistory.json`; docs that don't exist yet have version `null`; `expansion.json` is optional/missing until started) and the page as specified; register the route in `Layout.tsx` next to the draft route.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `Expansion: the Expansion page (add teams, protections, draft)`.

---

### Task 9: Keep `--drafts` from dropping the expansion draft, and S80 integration

**Files:**
- Modify: `importers/run.ts` (`importDraftHistory`, ~line 367-384), `importers/draftHistory.test.ts` or a new `importers/draftsKeep.test.ts`
- Create: `engine/season/expansion.e2e.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `keepLaterDrafts(existing: DraftHistoryFile | null, built: DraftHistoryFile, lastSeason: number): DraftHistoryFile` exported from `importers/draftHistory.ts`.

- [ ] **Step 1: Write the failing tests**
  - `keepLaterDrafts`: existing has S79 draft, S80 draft and S80 expansion; built has only ≤79 entries; the result is built's drafts followed by the existing entries with `season > 79`, sorted by season then draft-before-expansion; with `existing = null` the result equals `built`.
  - `expansion.e2e.test.ts`: using the 32-team fixture, run `runLottery` (S79) → assert 16-team lottery/32 order, and that `startDraft` (from `offseason/fbaDraft`, with the fixture's `fbaDraftState()` given that lottery) creates 32 picks → `addExpansionTeams` is applied before it (write teams file) → `nextSeasonDocs` input gives PHI/LAL empty rosters → run `startExpansion`, protect 4 on each existing team in turn (leave 8 teams' 5th player exposed), `lockProtections`, 8 `expansionPick`s (choosing the first allowed exposed player each time with `pickProblems` empty), `finishExpansion`; assert each expansion team holds 4 players at 4 distinct positions, donors each lost exactly 1, total players = 150 + 0 (30 teams × 5; two teams of 4) and every written doc passes `schemaForPath(path)!.parse`. Apply writes between steps by a tiny helper that replaces the doc in an in-memory map.

- [ ] **Step 2: Run** them — Expected: FAIL.

- [ ] **Step 3: Implement** `keepLaterDrafts` and use it in `importDraftHistory`: read the existing `leagues/fba/draftHistory.json` with `readDataJson<DraftHistoryFile>(dir, ...)` and write `keepLaterDrafts(existing, doc, 79)`. Validate with `DraftHistoryFile.parse` before writing.

- [ ] **Step 4: Run** the full `npx vitest run` and `npx tsc --noEmit` — Expected: PASS, and `git status --short` shows only the user's three pre-existing `web/data` changes.

- [ ] **Step 5: Commit** `Expansion: --drafts keeps later seasons; S80 expansion end-to-end test`.

---

### Task 10: Browser check on scratch data, docs and ledger

**Files:**
- Scratch only: `.superpowers/sdd/rscheck/server.ts`, `.superpowers/sdd/rscheck/prep.mjs` (existing), `web/rscheck.vite.config.ts` (create for the check, delete after)
- Modify: `docs/superpowers/specs/2026-09-25-fba-web-design.md` (§10 FBA expansion row → "Built on fba-expansion, awaiting merge"), `.superpowers/sdd/progress.md` (D15 entry: built, what remains), `docs/fba-rule-changes.md` is NOT edited.

- [ ] **Step 1: Prep scratch data** following CLAUDE.md "Browser checks": `.superpowers/sdd/rscheck/prep.mjs` copies `web/data` to a scratch folder and fills empty roster slots. In the scratch copy only, set the S79 calendar so that every step through `fba` is done (the current step is `s80-add-expansion-teams`; run `--expansion-step --data <scratch>` to add it), and make S79 playoffs/results complete if the scratch data lacks them (copy from a fixture; never touch `web/data`).
- [ ] **Step 2: Start the scratch data server on 5184 and Vite on 5183** (`web/rscheck.vite.config.ts` pointing the proxy at 5184). Do not touch 5173/5174.
- [ ] **Step 3: Check, text-first (`read_page`, `get_page_text`, `read_network_requests`), screenshots only for the final proof:**
  - `/league/fba/expansion`: Add teams adds PHI and Team 32 (the FBA logo loads for Team 32; PHI logo loads), the calendar's next step is the lottery.
  - `/league/fba/lottery`: 16 rows, Expansion badges on PHI and Team 32 at 14.0%, odds sum to 100, run it, the draft order has 32 picks.
  - `/league/fba/standings` (S79) shows 30 teams.
  - After "Go to next season" in scratch (fill S79 tail steps via the calendar by marking them done in scratch): S80 rosters list PHI/LAL; the draft, then `/league/fba/expansion` protect → lock → 8 picks → finish; teams pages show the players; `/history/fba/drafts/80` lists an Expansion draft section.
  - 375px width and dark mode: no horizontal scroll on the expansion and lottery pages.
- [ ] **Step 4: Clean up:** stop both processes, delete the scratch data folder and `web/rscheck.vite.config.ts`, and confirm `git status --short` shows only the user's three `web/data` changes plus the files of this task.
- [ ] **Step 5: Update the roadmap row and ledger, run final verification** (`npx vitest run` all pass, `npx tsc --noEmit` prints nothing), commit with the trailer: `Expansion: roadmap row and ledger`.
- [ ] **Step 6:** Report to the user: what was built, the one-time commands they must run on real data when ready (`npm run import -- --expansion-step --data data` from `web/`, the data path as used for the other modes), and the open S81+ lottery-table decision from spec §8.

---

## Self-review

- **Spec coverage:** X1 teams/logos/LAL id → Task 1; X2 gating → Tasks 1, 5, 6; X3 calendar → Task 4; X4 odds → Task 3; X5/X6 rules → Task 7 (+ §8 position/cap); X7 sizes → Tasks 2, 3; §2 migration → Task 4; §4 doc + page → Tasks 7, 8; history entry → Tasks 7, 9; §6 testing → every task + Task 9 e2e; §5 audit list: standings/schedule (2, 6), tradeValue/picks (2), playoffs moves (2), fbaDraft (no change; covered by e2e's 32-pick order: Task 9 asserts `order` length 32 and a `startDraft` over it is exercised only by existing 30-team tests, so Task 9's e2e also calls `startDraft` with the 32-team lottery).
- **Placeholders:** none in code steps; Task 7/8 tests are specified by case with their assertions named; their bodies are written during the TDD step.
- **Type consistency:** `ExpansionState`, `AddTeamsState`, `addTeamsStepId`/`expansionDraftStepId`, `teamsInSeason`/`teamsJoining`, `lotterySizeFor`, `seasonLength`, `oddsTable` are defined once (Tasks 1-3, 5, 7) and used with the same names later.
