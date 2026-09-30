# FBAD2 history (part 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the D2's history (summaries S53–S78, team league paths, D2 drafts S68–S78), fix the S79 D2 league layout with an import mode, and add D2 history pages plus D2 honours on player pages.

**Architecture:**

- Pure sheet parsers (`importers/sheets/d2History.ts`) feed a builder (`importers/d2History.ts`).
- The builder writes summaries in the existing `SummaryFile` shape, plus two new docs: `leagueHistory.json` and `draftHistory.json` under `leagues/fbad2/`.
- The engine view helpers (`engine/history/d2.ts`) derive the rows the pages need.
- The new pages live in `app/history/d2/`.

**Tech Stack:** Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict), Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-30-fbad2-history-design.md`

## Global Constraints

**Commands and baseline**
- Run all commands from `web/`: `npx vitest run [paths]` for tests, and `npx tsc --noEmit`, which must print nothing.
- Baseline: 1542 tests passing.

**Files you must not touch**
- Never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` or `web/data/**`.
- Never run an import against `web/data`. Never start or stop anything on ports 5173/5174.
- Stage files only by explicit path, never `git add -A` or `git add .`.
- Leave no stray files in the repo. Scratch goes in `.superpowers/sdd/` (git-ignored).

**Schemas and import modes**
- Schemas are strict zod (`.strict()`) in `engine/shared/types.ts`, and every saved doc has a path rule in `engine/shared/schemaRegistry.ts`. `web/data.test.ts` must keep passing.
- New import modes require `--data <dir>` (via `requireDataDir`), validate each doc against its schema before writing (`writeDoc`), and write nothing else.

**Tests**
- Vitest globals are off. Every jsdom test file starts with `// @vitest-environment jsdom`, imports from `vitest`, and calls `cleanup()` in `afterEach`.

**History pages**
- Follow the existing pattern in `app/history/*.tsx`: `PageHeader`/`Hero`, `useDoc`, `useHistory`, `PlayerLink` for players, `history.css`, `className="card-grid"`, `"chips"`, `"timeline"` and `"stat-table"`.
- A missing doc shows `<p className="muted">…</p>` with the import command, e.g. "No D2 draft history yet. Run npm run import -- --d2-history --data data."

**Text and codes**
- Season text is "S57". Season ranges use an en dash ("S57–S78", "S57–pres.").
- D2 group codes: `D2` (the single D2 title, S53–S67), `AM` D2-America, `EW` Euro-West, `EE` Euro-East, `ES` Euro-South, and `PL/WL/UL/IL` (S68 on). Labels always come from `groupLabel('fbad2', code)`.

**Commits**
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Task | Role |
|---|---|---|
| `engine/shared/types.ts`, `schemaRegistry.ts`, `leagues.ts`, `engine/awards/races.ts` | 1 | `rsChampions`, new award ids and labels, D2 league/draft history schemas, group labels |
| `docs/superpowers/specs/2026-09-25-fba-web-design.md` | 1 | 3c row fix, part 4 row |
| `importers/sheets/d2History.ts` | 2 | pure tab parsers |
| `importers/d2History.ts`, `importers/run.ts` | 3 | builder, S78 merge, league moves, `--d2-history` and `--d2-leagues` |
| `engine/history/d2.ts` | 4 | view helpers: titles, regular-season champions, MVPs, league path, team case, player honours |
| `app/history/d2/useD2.tsx`, `HistoryLeagueSwitch.tsx`, `D2HistoryHome.tsx`, `D2ChampionshipsPage.tsx`, `D2AwardsPage.tsx`, `app/history/HistoryHome.tsx`, `app/shell/Layout.tsx` | 5 | hooks, switch, D2 hub, Championships, Awards, routes |
| `app/history/d2/D2SeasonPage.tsx`, `D2TeamsPage.tsx`, `D2TeamPage.tsx` | 6 | season, teams, team pages |
| `app/history/d2/D2DraftsPage.tsx`, `D2DraftSeasonPage.tsx`, `app/history/PlayerHistoryPage.tsx` | 7 | drafts pages, D2 honours block |

---

### Task 1: Schemas, labels and the roadmap row

**Files:**
- Modify: `engine/shared/types.ts`, `engine/shared/schemaRegistry.ts`, `engine/shared/leagues.ts`, `engine/awards/races.ts`, `docs/superpowers/specs/2026-09-25-fba-web-design.md`
- Test: `engine/shared/d2History.schema.test.ts` (new)

**Interfaces:**
- Produces:
  - `SummaryFile.rsChampions?: { group: string; teams: string[] }[]` (D2 only).
  - `AwardId` gains `'MVP-D2' | 'MVP-AM' | 'MVP-EW' | 'MVP-EE' | 'MVP-ES'`.
  - `D2_PAST_GROUPS`.
  - `D2LeagueHistoryFile` / `D2Spell` / `D2TeamLeagueHistory`.
  - `D2DraftHistoryFile` / `D2DraftDraft` / `D2DraftPick` (zod schemas plus inferred types).
  - `groupLabel('fbad2', 'D2' | 'AM' | 'EW' | 'EE' | 'ES')`.

- [ ] **Step 1: Write the failing tests** (`engine/shared/d2History.schema.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { groupLabel } from './leagues';
import { schemaForPath } from './schemaRegistry';
import { D2DraftHistoryFile, D2LeagueHistoryFile, SummaryFile } from './types';

const base = { season: 60, locked: true, host: null, champions: [] };

describe('D2 history schemas', () => {
  it('accepts rsChampions and the new MVP ids on a D2 summary only', () => {
    const d2 = { league: 'fbad2', ...base, rsChampions: [{ group: 'AM', teams: ['San Jose', 'Toronto'] }], awards: [{ award: 'MVP-D2', playerId: 'p00001', teamId: 'Rome' }] };
    expect(SummaryFile.safeParse(d2).success).toBe(true);
    expect(SummaryFile.safeParse({ ...d2, league: 'fba', awards: [] }).success).toBe(false);
    expect(SummaryFile.safeParse({ ...d2, rsChampions: [{ group: 'AM', teams: [] }] }).success).toBe(false);
  });

  it('validates league history: unique teams, one open spell and it is last', () => {
    const ok = { teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'ES', from: 56, to: 67 }, { group: 'PL', from: 68, to: null }] }] };
    expect(D2LeagueHistoryFile.safeParse(ok).success).toBe(true);
    expect(D2LeagueHistoryFile.safeParse({ teams: [...ok.teams, ...ok.teams] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: 70, spells: [{ group: 'PL', from: 68, to: null }, { group: 'WL', from: 70, to: 71 }] }] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'PL', from: 70, to: 68 }] }] }).success).toBe(false);
    expect(D2LeagueHistoryFile.safeParse({ teams: [{ teamId: 'ROM', founded: null, spells: [{ group: 'D2', from: 60, to: 61 }] }] }).success).toBe(false);
  });

  it('validates D2 drafts: picks 1..n, one draft per season', () => {
    const pick = (n: number) => ({ pick: n, teamId: 'ROM', teamName: 'Rome', name: 'A B', playerId: null, pos: 'PG', age: 22, rating: null });
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [pick(1), pick(2)] }] }).success).toBe(true);
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [pick(2)] }] }).success).toBe(false);
    expect(D2DraftHistoryFile.safeParse({ drafts: [{ season: 68, picks: [] }, { season: 68, picks: [] }] }).success).toBe(false);
  });

  it('registers the two new paths and labels the past groups', () => {
    expect(schemaForPath('leagues/fbad2/leagueHistory.json')).toBe(D2LeagueHistoryFile);
    expect(schemaForPath('leagues/fbad2/draftHistory.json')).toBe(D2DraftHistoryFile);
    expect(groupLabel('fbad2', 'EW')).toBe('Euro-West');
    expect(groupLabel('fbad2', 'D2')).toBe('D2 International');
    expect(groupLabel('fbad2', 'PL')).toBe('Premier League');
  });
});
```

- [ ] **Step 2: Run them.** `npx vitest run engine/shared/d2History.schema.test.ts` should FAIL: the exports don't exist yet.

- [ ] **Step 3: Implement.**

In `engine/shared/types.ts`:
- Extend `AwardId` to `z.enum(['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL', 'MVP-D2', 'MVP-AM', 'MVP-EW', 'MVP-EE', 'MVP-ES'])`.
- In `SummaryFile`, after `promotion`, add:
  ```ts
  /** D2 only: the regular-season (or, before S68, division) champions by group; co-champions share a group (imported history). */
  rsChampions: z.array(z.object({ group: z.string().min(1), teams: z.array(z.string().min(1)).min(1) }).strict()).optional(),
  ```
  and in its `superRefine`, add `if (doc.league !== 'fbad2' && doc.rsChampions) issue('Only the D2 has regular-season league champions');`.
- Append at the end of the file:

```ts
/** D2 groups before the S68 league split, then the four leagues. */
export const D2_PAST_GROUPS = ['AM', 'EW', 'EE', 'ES', 'PL', 'WL', 'UL', 'IL'] as const;
export const D2Spell = z.object({ group: z.enum(D2_PAST_GROUPS), from: int.min(1), to: int.min(1).nullable() }).strict()
  .refine(s => s.to === null || s.to >= s.from, 'A spell ends on or after it starts');
export type D2Spell = z.infer<typeof D2Spell>;
export const D2TeamLeagueHistory = z.object({ teamId: z.string().min(1), founded: int.min(1).nullable(), spells: z.array(D2Spell).min(1) }).strict()
  .refine(t => t.spells.every((s, i) => s.to !== null || i === t.spells.length - 1), 'Only the last spell can be open (pres.)');
export type D2TeamLeagueHistory = z.infer<typeof D2TeamLeagueHistory>;
/** leagues/fbad2/leagueHistory.json: each D2 team's leagues by season (imported, part 4). */
export const D2LeagueHistoryFile = z.object({ teams: z.array(D2TeamLeagueHistory) }).strict()
  .refine(f => new Set(f.teams.map(t => t.teamId)).size === f.teams.length, 'Each team appears once');
export type D2LeagueHistoryFile = z.infer<typeof D2LeagueHistoryFile>;

export const D2DraftPick = z.object({
  pick: int.positive(),
  teamId: z.string().min(1).nullable(),
  teamName: z.string().min(1),
  name: z.string().min(1),
  playerId: playerId.nullable(),
  pos: z.string().min(1),
  age: int.positive().nullable(),
  /** From S77 on; the earlier tabs have no rating column. */
  rating: int.min(0).max(150).nullable(),
}).strict();
export type D2DraftPick = z.infer<typeof D2DraftPick>;
export const D2DraftDraft = z.object({ season: int.min(1), picks: z.array(D2DraftPick) }).strict()
  .refine(d => d.picks.every((p, i) => p.pick === i + 1), 'Picks must be numbered 1..n in order');
export type D2DraftDraft = z.infer<typeof D2DraftDraft>;
/** leagues/fbad2/draftHistory.json: the draft sheet's "S68 D2"…"S78 D2" tabs (imported, part 4). */
export const D2DraftHistoryFile = z.object({ drafts: z.array(D2DraftDraft) }).strict()
  .refine(f => new Set(f.drafts.map(d => d.season)).size === f.drafts.length, 'One draft per season');
export type D2DraftHistoryFile = z.infer<typeof D2DraftHistoryFile>;
```


In `engine/shared/schemaRegistry.ts`, add these next to the `leagues/fba/draftHistory.json` rule and import the schemas:

```ts
  [/^leagues\/fbad2\/leagueHistory\.json$/, D2LeagueHistoryFile],
  [/^leagues\/fbad2\/draftHistory\.json$/, D2DraftHistoryFile],
```

In `engine/shared/leagues.ts`, the `fbad2` entry becomes:
```ts
  fbad2: { PL: 'Premier League', WL: 'World League', UL: 'United League', IL: 'International League', D2: 'D2 International', AM: 'D2-America', EW: 'Euro-West', EE: 'Euro-East', ES: 'Euro-South' },
```
First grep for `GROUP_LABEL` and `groupLabel('fbad2'` and make sure nothing iterates the fbad2 keys. It's module-private, so nothing should.

In `engine/awards/races.ts`, add these entries to `AWARD_LABEL`: `'MVP-D2': 'D2 MVP', 'MVP-AM': 'D2-America MVP', 'MVP-EW': 'Euro-West MVP', 'MVP-EE': 'Euro-East MVP', 'MVP-ES': 'Euro-South MVP'`. `D2_AWARDS` stays the four league MVPs, because the live races only run those. If tsc then complains about another exhaustive `Record<AwardId, …>`, add the same five labels there.

In `docs/superpowers/specs/2026-09-25-fba-web-design.md`, §10:
- In the 3c row, replace "The user runs the three imports on real data" with "The three imports were run on real data and committed in 23bcfcb".
- Replace the part 4 row with:
  `| 4 FBAD2 | D2 history: S53–S78 summaries (titles, Series MVPs, regular-season champions, MVPs), team league paths, D2 drafts S68–S78, D2 history pages and player D2 honours; \`--d2-leagues\` one-time fix of the S79 league layout (D2 World Cups moved to part 5) | In progress on branch \`fbad2-history\` | [spec](2026-09-30-fbad2-history-design.md) · [plan](../plans/2026-09-30-fbad2-history.md) |`

- [ ] **Step 4: Verify.** `npx vitest run engine/shared data.test.ts` passes, and `npx tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit.**

```bash
git add engine/shared/types.ts engine/shared/schemaRegistry.ts engine/shared/leagues.ts engine/awards/races.ts engine/shared/d2History.schema.test.ts ../docs/superpowers/specs/2026-09-25-fba-web-design.md
git commit -m "feat(d2-history): schemas, award ids and group labels for D2 history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: D2 sheet parsers

**Files:**
- Create: `importers/sheets/d2History.ts`
- Test: `importers/sheets/d2History.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Tabs are `string[][]`, as `readTabs` returns them: trimmed text, and `''` for empty cells.
- Produces:

```ts
export type PastGroup = 'AM' | 'EW' | 'EE' | 'ES' | 'PL' | 'WL' | 'UL' | 'IL';
export interface TeamLeagueRow { name: string; founded: number | null; spells: { group: PastGroup; from: number; to: number | null }[] }
export interface TitleRow { season: number; half: 1 | 2 | null; group: 'D2' | 'PL' | 'WL' | 'UL' | 'IL'; champion: string; runnerUp: string | null; seriesMvp: string | null }
export interface MvpCell { name: string; team: string }
export interface AwardsRow { season: number; half: 1 | 2 | null; mvps: { award: 'MVP-D2' | 'MVP-AM' | 'MVP-EW' | 'MVP-EE' | 'MVP-ES' | 'MVP-PL' | 'MVP-WL' | 'MVP-UL' | 'MVP-IL'; cell: MvpCell }[]; rsChampions: { group: PastGroup; teams: string[] }[] }
export interface D2DraftRow { team: string; name: string; pos: string; age: number | null; rating: number | null }
export function parseSeasonCell(text: string): { season: number; half: 1 | 2 | null } | null;   // "S55(1)" → {55,1}; "S60" → {60,null}
export function parseMvpCell(text: string): MvpCell | null;                                     // "Jordan-Lee Davidson-D2(Dhaka)"; "X"/"" → null
export function pastGroupCode(text: string): PastGroup | null;                                  // "D2-America"→AM, "Euro-West"→EW, "Euro-East"→EE, "Euro-South"→ES, "PL"/"Premier League"→PL, etc.
export function parseTeamLeagueHistory(rows: string[][]): TeamLeagueRow[];
export function parseIntlChampionships(rows: string[][]): TitleRow[];
export function parseLeagueChampionships(rows: string[][]): TitleRow[];
export function parseAwardsTab(rows: string[][]): AwardsRow[];                                  // both awards tabs, driven by the header row
export function d2DraftTabSeason(tab: string): number | null;                                   // "S68 D2" → 68; "S68" → null
export function parseD2DraftTab(rows: string[][]): D2DraftRow[];
```

**Rules, taken from the real sheet (see the spec's Sources section):**

- **`parseTeamLeagueHistory`:**
  - A row whose first cell is "Premier League", "World League", "United League" or "International League" is a section header. Skip it, including the legend cells on the same row.
  - Every other non-empty row is `name | spell | spell | …`. Strip a trailing ` (+)` or ` (-)` from the name.
  - `Est: S72` sets `founded` and isn't a spell.
  - A spell is `<group>: S<a>-S<b>`, `<group>: S<a>-pres.` (to = null) or `<group>: S<a>` (to = a).
  - An unknown group or a malformed cell throws `Error("Team League History: can't read \"<cell>\" (<name>)")`.
- **`parseIntlChampionships`:**
  - The header row starts with `Year`.
  - Each data row is `Year | Champion | Runner-Up | Series MVP | Date`, with `group: 'D2'`.
  - `X` or `''` becomes null for the runner-up and the Series MVP.
- **`parseLeagueChampionships`:**
  - Find the header row (it starts with `Year`). Every header cell matching `/^(PL|WL|UL|IL) Champion$/` starts a block at column c: champion = c, runner-up = c+1, Series MVP = c+2.
  - A block whose champion is `X` or `''` is skipped.
- **`parseAwardsTab`:**
  - Map the header cells:
    - `D2 MVP` → `MVP-D2`
    - `<Group> MVP` → `MVP-<code>`
    - `<Group> Champions` or `<Group> RS Champions` → a regular-season-champions column
  - `<Group>` goes through `pastGroupCode`, which accepts the long names "Premier League", "World League", "United League", "International League", "D2-America", "Euro-West", "Euro-East" and "Euro-South".
  - Champion cells split on `/` and trim. `X` means none (group left out).
  - MVP cells go through `parseMvpCell`. `X` means none.
  - An MVP cell that isn't `X` and doesn't match throws.
- **`parseMvpCell`:** match `/^(.*)-D2\((.*)\)$/`, which splits on the last `-D2(`, so hyphenated names survive.
- **`parseD2DraftTab`:**
  - Skip empty rows and rows whose first cell is `TEAM` (case-insensitive).
  - `age`/`rating` become `Number(cell)` when `/^\d+$/`, else null.

- [ ] **Step 1: Write the failing tests** (`importers/sheets/d2History.test.ts`). Use small tabs copied from the real sheet:

```ts
import { describe, expect, it } from 'vitest';
import { d2DraftTabSeason, parseAwardsTab, parseD2DraftTab, parseIntlChampionships, parseLeagueChampionships, parseMvpCell, parseSeasonCell, parseTeamLeagueHistory } from './d2History';

describe('D2 sheet parsers', () => {
  it('reads season cells and MVP cells', () => {
    expect(parseSeasonCell('S55(2)')).toEqual({ season: 55, half: 2 });
    expect(parseSeasonCell('S60')).toEqual({ season: 60, half: null });
    expect(parseSeasonCell('Year')).toBeNull();
    expect(parseMvpCell('Jordan-Lee Davidson-D2(Dhaka)')).toEqual({ name: 'Jordan-Lee Davidson', team: 'Dhaka' });
    expect(parseMvpCell('X')).toBeNull();
  });

  it('reads team league history with Est, single-season and pres. spells', () => {
    const rows = [
      ['Premier League', '(+): Set to be Promoted', '(-): Set to be Relegated'],
      ['Madrid', 'Euro-South: S56-S67', 'WL: S68', 'PL: S75-pres.'],
      ['World League'],
      ['Zagreb (+)', 'Est: S71', 'UL: S71', 'WL: S71-pres.'],
    ];
    expect(parseTeamLeagueHistory(rows)).toEqual([
      { name: 'Madrid', founded: null, spells: [{ group: 'ES', from: 56, to: 67 }, { group: 'WL', from: 68, to: 68 }, { group: 'PL', from: 75, to: null }] },
      { name: 'Zagreb', founded: 71, spells: [{ group: 'UL', from: 71, to: 71 }, { group: 'WL', from: 71, to: null }] },
    ]);
    expect(() => parseTeamLeagueHistory([['Rome', 'XL: S1-S2']])).toThrow(/can't read/);
  });

  it('reads the international and league championship tabs', () => {
    expect(parseIntlChampionships([
      ['Year', 'Champion', 'Runner-Up', 'Series MVP', 'Date'],
      ['S55(1)', 'Syracuse', 'San Jose', 'Myles Hamilton', 'X'],
    ])).toEqual([{ season: 55, half: 1, group: 'D2', champion: 'Syracuse', runnerUp: 'San Jose', seriesMvp: 'Myles Hamilton' }]);
    const league = parseLeagueChampionships([
      ['Year', 'PL Champion', 'PL Runner-Up', 'Series MVP', 'Date', '', 'WL Champion', 'WL Runner-Up', 'Series MVP', 'Date', '', 'UL Champion', 'UL Runner-Up', 'Series MVP', 'Date', '', 'IL Champion', 'IL Runner-Up', 'Series MVP', 'Date'],
      ['S71', 'Hamburg', 'Madrid', 'Derrick Burns', 'd', '', 'Austin', 'Tokyo', 'Bobbie Allen', 'd', '', 'Zagreb', 'Buenos Aires', 'Milo Blanchard', 'd', '', 'X', 'X', 'X', 'X'],
    ]);
    expect(league.map(t => `${t.group}:${t.champion}>${t.runnerUp}:${t.seriesMvp}`)).toEqual(['PL:Hamburg>Madrid:Derrick Burns', 'WL:Austin>Tokyo:Bobbie Allen', 'UL:Zagreb>Buenos Aires:Milo Blanchard']);
  });

  it('reads both awards tabs by header, with co-champions and X', () => {
    const early = parseAwardsTab([
      ['Year', 'D2 MVP', 'D2-America Champions', 'D2-America MVP', 'Euro-West Champions', 'Euro-West MVP', 'Euro-East Champions', 'Euro-East MVP', 'Euro-South Champions', 'Euro-South MVP'],
      ['S57', 'Myles Hamilton-D2(Rome)', 'Toronto/San Jose', 'X', 'Lyon/London', 'X', 'Vienna', 'X', 'Rome', 'X'],
      ['S53', 'Westin Winter-D2(San Jose)', 'San Jose', 'X', 'X', 'X', 'X', 'X', 'X', 'X'],
    ]);
    expect(early[0].mvps).toEqual([{ award: 'MVP-D2', cell: { name: 'Myles Hamilton', team: 'Rome' } }]);
    expect(early[0].rsChampions).toEqual([{ group: 'AM', teams: ['Toronto', 'San Jose'] }, { group: 'EW', teams: ['Lyon', 'London'] }, { group: 'EE', teams: ['Vienna'] }, { group: 'ES', teams: ['Rome'] }]);
    expect(early[1].rsChampions).toEqual([{ group: 'AM', teams: ['San Jose'] }]);
    const late = parseAwardsTab([
      ['Year', 'Premier League RS Champions', 'Premier League MVP', 'World League RS Champions', 'World League MVP', 'United League RS Champions', 'United League MVP', 'International League RS Champions', 'International League MVP'],
      ['S69', 'Munich/Rome', 'Billie Hodges-D2(Rome)', 'Glasgow', 'Dennis Holloway-D2(Glasgow)', 'Madrid/Vancouver', 'Jaydon Cantrell-D2(Madrid)', 'X', 'X'],
    ]);
    expect(late[0].season).toBe(69);
    expect(late[0].mvps.map(m => m.award)).toEqual(['MVP-PL', 'MVP-WL', 'MVP-UL']);
    expect(late[0].rsChampions[0]).toEqual({ group: 'PL', teams: ['Munich', 'Rome'] });
    expect(late[0].rsChampions).toHaveLength(3);
  });

  it('reads D2 draft tabs with and without ratings and skips the trailing header', () => {
    expect(d2DraftTabSeason('S70 D2')).toBe(70);
    expect(d2DraftTabSeason('S70')).toBeNull();
    expect(parseD2DraftTab([['Brussels', 'Jonathan Rudd', 'SG', '25'], ['Berlin', 'Jaden Samuels', 'SF', '29', '97'], ['TEAM', 'PLAYER', 'POSITION', 'AGE', 'RATING'], []]))
      .toEqual([{ team: 'Brussels', name: 'Jonathan Rudd', pos: 'SG', age: 25, rating: null }, { team: 'Berlin', name: 'Jaden Samuels', pos: 'SF', age: 29, rating: 97 }]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run importers/sheets/d2History.test.ts`. It should FAIL because the module is missing.
- [ ] **Step 3: Implement** `importers/sheets/d2History.ts` to the rules above. Keep each parser a small pure function, and have them share `parseSeasonCell`, `pastGroupCode` and a `blank = (s: string) => s === '' || s === 'X'` helper.
- [ ] **Step 4: Verify.** The test file passes, and `npx tsc --noEmit` prints nothing.
- [ ] **Step 5: Commit** `importers/sheets/d2History.ts` and its test with the message "feat(d2-history): D2 history sheet parsers" and the trailer.

---

### Task 3: Builder, league moves and the two import modes

**Files:**
- Create: `importers/d2History.ts`, `importers/d2History.test.ts`
- Modify: `importers/run.ts`

**Interfaces:**
- Consumes: the Task 2 parsers; the Task 1 types; `nameResolver(players, report, topic)` from `importers/history.ts`; `Report` from `importers/report.ts`.
- Produces:

```ts
export const D2_SHEET = '16oZgCRFdQLF4NVOecz5lhS_xJXI4YTh-NDDM7gQCXAc';
export const D2_TABS = { leagues: 'Team League History', intl: 'D2 International Championships(', league: 'D2 League Championships(S68-pre', awardsEarly: 'D2 Awards(S53-S67)', awardsLate: 'D2 Awards(S68-pres.)' } as const;
export interface D2HistoryCtx { players: PlayersFile; teams: TeamsFile; existing: Map<number, SummaryFile> }
export function buildD2History(d2Tabs: Record<string, string[][]>, draftTabs: Record<string, string[][]>, ctx: D2HistoryCtx, report: Report):
  { summaries: SummaryFile[]; leagueHistory: D2LeagueHistoryFile; drafts: D2DraftHistoryFile };
export function buildLeagueHistory(rows: string[][], teams: TeamsFile, report: Report): D2LeagueHistoryFile;
export function d2LeagueMoves(teams: TeamsFile, history: D2LeagueHistoryFile):
  { next: TeamsFile; moves: { teamId: string; name: string; from: string; to: string }[]; problems: string[] };
```

**Builder rules:**

- **Team ids:** match by exact `name` in `ctx.teams` (the D2 `teams.json`). No match leaves the id unset (champions) or null (draft `teamId`). Report each distinct unmatched name once as `report.info('d2-teams', …)`.
- **Players:**
  - `nameResolver(ctx.players, report, 'd2-history')`.
  - An unresolved Series MVP gives `finalsMvp: null`.
  - An unresolved MVP award is skipped. `nameResolver` already warns.
- **Summaries:** one per season found in the championship tabs or the awards tabs.
  - `{ league: 'fbad2', season, locked: true, host: null, champions, awards, rsChampions }`. Leave `rsChampions` or `awards` out when they would be empty.
  - Titles:
    - `D2` group: `"D2 International Champion"`, plus `" (1)"`/`" (2)"` when `half` is set.
    - League groups: `` `${groupLabel('fbad2', g)} Champion` `` (e.g. "Premier League Champion").
  - Champion entry: `{ title, champion, runnerUp, score: null, group, finalsMvp, teamId?, runnerUpId? }`. Only set the ids when they resolve.
  - Awards: `{ award, playerId, teamId: id ?? teamName }`.
  - The S55 halves both land in the S55 summary: two champions and two `MVP-D2` awards.
- **Merging with an existing summary** (`ctx.existing.get(season)`, e.g. S78):
  - Keep every existing field.
  - For each existing champion whose `title` equals a built title, add the missing `group`, `teamId`, `runnerUpId` and `finalsMvp`. Keep its `champion`, `runnerUp` and `score`.
  - Built titles with no existing match are appended.
  - Set `awards` and `rsChampions` only when the existing doc lacks them.
- **League history:**
  - `buildLeagueHistory` maps each `TeamLeagueRow` to `{ teamId, founded, spells }`.
  - A name not in `teams.json` is a `report.error('d2-leagues', …)`, and the row is skipped.
  - Every `teams.json` team missing from the sheet is also an error.
  - Teams are sorted by `teamId`.
- **Drafts:**
  - Each tab whose `d2DraftTabSeason` is set gives one draft, picks numbered 1..n in row order. Drafts are sorted by season.
  - `playerId` comes from the resolver, with the where-text `S<season> D2 <name>`.
- **`d2LeagueMoves`:**
  - The current group is the spell with `to === null`, which must be one of PL/WL/UL/IL.
  - Problems: a teams.json team with no history, a history team not in teams.json, a team with no open spell, or any of PL/WL/UL/IL not ending at exactly 16 teams.
  - `next` changes only `group`. `moves` lists the changed teams, sorted by name.

- [ ] **Step 1: Write the failing tests** (`importers/d2History.test.ts`). Cover:
  1. A two-season build: an S55 with two halves, and an S69 with a PL block and a UL block. Check titles, group, `teamId` for a matched name and none for an unmatched name ("Toronto"), `finalsMvp`, `rsChampions` with co-champions, awards `teamId` as id or name, and the two S55 `MVP-D2` awards.
  2. Merge with an existing S78 whose champion title "Premier League Champion" has `score: '4-1'`: the score is kept, and `group: 'PL'` and `finalsMvp` are added.
  3. Every built summary passes `SummaryFile.safeParse`, and the league history and drafts pass their schemas.
  4. `buildLeagueHistory` reports an unknown team as an error.
  5. `d2LeagueMoves`: build 64 teams (16 per league) in memory, then move 2 teams PL↔WL. It returns 2 moves and no problems. A history that would leave the WL with 15 teams returns a problem, and so does a missing team.

  Build the fixtures inline: a `PlayersFile` with 3–4 players, and a `TeamsFile` built by a small `mkTeam(id, name, group)` helper (`logoFolder: null, badge: { bg: '#000', fg: '#fff' }, abbr: id`).

- [ ] **Step 2: Run** `npx vitest run importers/d2History.test.ts`. It should FAIL because the module is missing.
- [ ] **Step 3: Implement** `importers/d2History.ts` to the rules above.
- [ ] **Step 4: Add the modes to `importers/run.ts`**, following `importDraftHistory`:
  - Add `d2: '16oZgCRFdQLF4NVOecz5lhS_xJXI4YTh-NDDM7gQCXAc'` to `SHEETS`, and add `'--d2-history', '--d2-leagues'` to `MODE_FLAGS` and to the dispatch.
  - **`importD2History()`:**
    1. `requireDataDir('--d2-history')`.
    2. Read `players.json` and `leagues/fbad2/teams.json`, and exit with a message if either is missing.
    3. Delete the cached D2 and draft workbooks and download them fresh, as the other modes do.
    4. `readTabs(d2File, Object.values(D2_TABS))` and `readTabs(draftFile, n => d2DraftTabSeason(n) !== null)`.
    5. For `existing`, read every `leagues/fbad2/S<n>/summary.json` that exists for the built seasons.
    6. `printReport`. If `report.count('error') > 0`, exit with code 1 without writing.
    7. Otherwise `writeDoc` each summary (`leagues/fbad2/S<n>/summary.json`), `leagues/fbad2/leagueHistory.json` and `leagues/fbad2/draftHistory.json`.
    8. Print `Wrote N summaries (S53–S78), 64 team league histories, D drafts (P picks).`
  - **`importD2Leagues()`:**
    1. `requireDataDir('--d2-leagues')`.
    2. Read `leagues/fbad2/teams.json`.
    3. Download only the D2 sheet, run `buildLeagueHistory` on the Team League History tab, then `d2LeagueMoves`.
    4. On report errors or `problems`, print them and exit 1 without writing.
    5. Otherwise print each move (`Mumbai: WL → PL`), then `writeDoc('leagues/fbad2/teams.json', next)`. When there are no moves, print "No league changes." and write nothing.
- [ ] **Step 5: Verify.** `npx vitest run importers` passes, and `npx tsc --noEmit` prints nothing. Don't run either mode yourself; the controller dry-runs them on scratch data.
- [ ] **Step 6: Commit** `importers/d2History.ts`, `importers/d2History.test.ts` and `importers/run.ts` with the message "feat(d2-history): D2 history builder and --d2-history/--d2-leagues" and the trailer.

**Controller after Task 3:**
- Dry-run `buildD2History` read-only against `importers/.cache/` (scratch tsx script in `.superpowers/sdd/d2survey/`).
- Expect 25 summaries, 64 league histories and 11 drafts, with the schemas passing.
- List the unresolved names.
- Check that `d2LeagueMoves` on the real `teams.json` gives exactly the 12 known moves.

---

### Task 4: D2 history view helpers

**Files:**
- Create: `engine/history/d2.ts`, `engine/history/d2.test.ts`

**Interfaces:**
- Consumes: `SummaryFile`, `Team`, `D2LeagueHistoryFile`, `D2DraftHistoryFile`, `AwardEntry` (types.ts); `groupLabel` (leagues.ts); `AWARD_LABEL` (engine/awards/races.ts).
- Produces:

```ts
export const D2_MVP_AWARDS = ['MVP-D2', 'MVP-AM', 'MVP-EW', 'MVP-EE', 'MVP-ES', 'MVP-PL', 'MVP-WL', 'MVP-UL', 'MVP-IL'] as const;
export const D2_IMPORT_THROUGH = 79;   // league history covers seasons up to the S79 layout
export interface D2TitleRow { season: number; title: string; group: string | null; champion: string; teamId: string | null; runnerUp: string | null; runnerUpId: string | null; score: string | null; seriesMvp: string | null }
export function d2TitleRows(seasons: SummaryFile[]): D2TitleRow[];                 // newest season first, then champions order
export function rsChampionsOf(s: SummaryFile): { group: string; teams: string[] }[];   // rsChampions, else rank-1 standings name per group in PL,WL,UL,IL order
export function d2Mvps(s: SummaryFile): AwardEntry[];                               // awards in D2_MVP_AWARDS order (duplicates kept)
export function d2MvpCounts(seasons: SummaryFile[]): { playerId: string; count: number }[];   // desc by count, then playerId
export interface PathSpell { group: string; from: number; to: number | null }
export function leagueInSeason(history: D2LeagueHistoryFile | null, teamId: string, season: number): string | null;  // last spell covering the season
export function leaguePath(history: D2LeagueHistoryFile | null, summaries: SummaryFile[], teamId: string, current?: { season: number; group: string }): PathSpell[];
export interface D2TeamCase {
  titles: { season: number; title: string; group: string | null }[];
  finalsLost: { season: number; title: string }[];
  rsTitles: { season: number; group: string }[];
  mvps: { season: number; award: string; playerId: string }[];
  seriesMvps: { season: number; title: string; playerId: string }[];
  picks: { season: number; pick: number; playerId: string | null; name: string }[];
}
export function d2TeamCase(team: Team, seasons: SummaryFile[], drafts: D2DraftHistoryFile | null): D2TeamCase;
export interface D2Honour { season: number; text: string }
export function d2PlayerHonours(playerId: string, seasons: SummaryFile[], drafts: D2DraftHistoryFile | null, teams: Team[]): D2Honour[];   // oldest first
```

**Rules:**

- A team matches a champion, runner-up, regular-season champion or award by `teamId === team.teamId`, or by an exact name (`champion === team.name`, `award.teamId === team.name`).
- **`leaguePath`:**
  1. Start with the team's imported spells.
  2. If `summaries` holds seasons > `D2_IMPORT_THROUGH` whose `standings` contain the team, or `current` is given, turn an open imported spell into `to: D2_IMPORT_THROUGH`.
  3. Append one `{group, from: s, to: s}` per such season (from the standings row's `group`), then `current` as `{group, from: current.season, to: current.season}`.
  4. Merge neighbours with the same group when `next.from <= prev.to + 1`.
  5. When `current` was given, or an app season was appended, the last spell gets `to: null`.
  6. With no imported entry and no app seasons, return `[]`.
- **`d2PlayerHonours` texts:**
  - `"<AWARD_LABEL[award]> (<team name>)"`. The team name is the D2 team's `name` when `award.teamId` is an id, else the stored text.
  - `"Series MVP, <title>"`.
  - `"D2 draft: pick <n> (<teamName>)"`.

- [ ] **Step 1: Write the failing tests** (`engine/history/d2.test.ts`) for:
  - `d2TitleRows`: ordering, and the two S55 titles.
  - `rsChampionsOf`: from the `rsChampions` field, and from the standings of an app-played summary (rank-1 rows).
  - `d2Mvps` ordering, and `d2MvpCounts` with the S55 duplicate counting twice.
  - `leagueInSeason` with the shared-edge spells (`PL: S68-S71`, `WL: S71-S73` → S71 is WL).
  - `leaguePath`:
    - imported only (the open spell stays null);
    - with an S80 summary moving the team to a new group (`[… {PL, 75, 79}, {WL, 80, null}]`);
    - with `current` in the same group (merged, `to: null`);
    - merging of adjacent same-group spells.
  - `d2TeamCase`: titles, finals lost, regular-season titles by name, MVPs by id and by name, Series MVPs and picks.
  - `d2PlayerHonours`: the three text forms, oldest first.
- [ ] **Step 2: Run** `npx vitest run engine/history/d2.test.ts`. It should FAIL.
- [ ] **Step 3: Implement** `engine/history/d2.ts`.
- [ ] **Step 4: Verify.** The tests pass, and `npx tsc --noEmit` prints nothing.
- [ ] **Step 5: Commit** both files with the message "feat(d2-history): D2 history view helpers" and the trailer.

---

### Task 5: D2 history hub, league switch, Championships and Awards pages

**Files:**
- Create: `app/history/d2/useD2.tsx`, `app/history/d2/HistoryLeagueSwitch.tsx`, `app/history/d2/D2HistoryHome.tsx`, `app/history/d2/D2ChampionshipsPage.tsx`, `app/history/d2/D2AwardsPage.tsx`, `app/history/d2/D2HistoryPages.test.tsx`
- Modify: `app/history/HistoryHome.tsx` (render `<HistoryLeagueSwitch />` under the PageHeader), `app/shell/Layout.tsx` (routes for this task and Tasks 6–7)

**Interfaces:**
- Consumes: the Task 4 helpers; `useHistory`, `useDoc`; `TeamName`, `PageHeader`, `Badge`, `PlayerLink`, `SkippedWarning`; `formatScore` (`engine/history/format.ts`); `groupLabel`; `AWARD_LABEL`.
- Produces:

```ts
// useD2.tsx
export function useD2Teams(): { settled: boolean; teams: Team[] };   // leagues/fbad2/teams.json; missing or unreadable → [] (decoration only)
export function D2Team({ teams, teamId, name, season, size }: { teams: Team[]; teamId?: string | null; name: string; season: number; size?: number }): JSX.Element;
//   a known team (by id, else exact name) → <TeamName team={…} season={season} size={size ?? 20} to={`/history/fbad2/teams/${team.teamId}`} />, else plain name text
// HistoryLeagueSwitch.tsx
export function HistoryLeagueSwitch(): JSX.Element;   // <nav aria-label="History league"><ul className="chips">: links "FBA" → /history, "D2" → /history/fbad2; the chip for the current path gets className "chip active"
```

Check `TeamName`'s `to` prop in `app/components/TeamName.tsx`. If it doesn't render a link, wrap it in `<Link>` instead.

**Pages:**

- **`D2HistoryHome` (`/history/fbad2`):**
  - `PageHeader kicker="FBAD2" title="History"`, the switch and `SkippedWarning`.
  - Feature cards (`card link headed feature`, `aria-label` = title), in this order:
    - Championships → `/history/fbad2/championships`
    - Awards → `/history/fbad2/awards`
    - Seasons → `/history/fbad2/season/<latest>` (only when there are seasons)
    - Teams → `/history/fbad2/teams`
    - Drafts → `/history/fbad2/drafts`
  - A "Seasons" chip list, newest first, linking to `/history/fbad2/season/<n>`.
- **`D2ChampionshipsPage` (`/history/fbad2/championships`):**
  - `PageHeader kicker="FBAD2 history" title="D2 Championships"`.
  - An `ol.timeline` with one `li.timeline-row` per season, newest first:
    - a season link `S<n>` → `/history/fbad2/season/<n>`;
    - one line per title: `<b>{groupLabel}</b> <D2Team champion/> over <D2Team runnerUp/>` (`—` when there's no runner-up);
    - the score via `formatScore` when set;
    - the `Badge kind="finals-mvp"` text `Series MVP <PlayerLink/>` when `seriesMvp` is set.
  - For the `D2` group, show the title text ("D2 International Champion (1)") instead of the group label.
- **`D2AwardsPage` (`/history/fbad2/awards`):**
  - `PageHeader kicker="FBAD2 history" title="D2 Awards"`.
  - A `table.stat-table` with the columns Season | MVPs | Regular-season champions, newest first:
    - MVPs: each `AWARD_LABEL[a.award]`: `<PlayerLink/>` (team text), `<br/>`-separated;
    - regular-season champions: each `groupLabel: teams.join(' / ')`.
  - Then an `h2` "Most MVPs": the top 10 from `d2MvpCounts` as an `ol` of `PlayerLink ×count`.
- **Routes in `app/shell/Layout.tsx`**, next to the FBA history routes:
  - `/history/fbad2` → D2HistoryHome
  - `/history/fbad2/championships` → D2ChampionshipsPage
  - `/history/fbad2/awards` → D2AwardsPage
  - Also add now the routes for Tasks 6–7, pointing at the page components those tasks create: `/history/fbad2/season/:season`, `/history/fbad2/teams`, `/history/fbad2/teams/:teamId`, `/history/fbad2/drafts`, `/history/fbad2/drafts/:season`.
  - So that tsc stays clean in this task, create the Task 6–7 page files as minimal stubs that export the component and render `<p className="muted">Loading…</p>`. Tasks 6–7 replace them.

- [ ] **Step 1: Write the failing tests** (`D2HistoryPages.test.tsx`). Use the `stub()` fetch pattern from `app/history/HistoryPages.test.tsx`: `/api/history/fbad2` → `{ seasons, errors: [] }`, `/api/state/players.json`, `/api/state/leagues/fbad2/teams.json`, and 404 otherwise. Use two summaries:
  - an S55 with two D2 titles and two `MVP-D2` awards;
  - an S69 with PL and UL titles (PL champion "Lisbon" matching a teams.json team `LIS`, runner-up "Rome" not in teams.json), an `MVP-PL` award and `rsChampions` `[{group:'PL', teams:['Munich','Rome']}]`.

  Assert:
  - The hub links: Championships `/history/fbad2/championships`, Seasons `/history/fbad2/season/69`, Teams, Drafts, plus the switch's FBA link `/history` and D2 link `/history/fbad2`.
  - Championships: two rows, newest first. Row 1 contains "Premier League", the Lisbon link `/history/fbad2/teams/LIS`, the plain text "Rome" and "Series MVP". Row 2 contains "D2 International Champion (1)" and "(2)".
  - Awards: the S69 row has "Premier League MVP" and "Premier League: Munich / Rome". "Most MVPs" lists the S55 player once with ×2, when the same player won both halves in the fixture.
  - `HistoryHome` (FBA) now renders the switch with the D2 link `/history/fbad2`. Update `app/history/HistoryPages.test.tsx` only if one of its link queries becomes ambiguous.
- [ ] **Step 2: Run** `npx vitest run app/history/d2`. It should FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Verify.** `npx vitest run app/history app/shell` passes, and `npx tsc --noEmit` prints nothing.
- [ ] **Step 5: Commit** the new and changed files by path with the message "feat(d2-history): D2 history hub, Championships and Awards pages" and the trailer.

---

### Task 6: D2 season, teams and team pages

**Files:**
- Replace the stubs: `app/history/d2/D2SeasonPage.tsx`, `app/history/d2/D2TeamsPage.tsx`, `app/history/d2/D2TeamPage.tsx`
- Test: `app/history/d2/D2TeamPages.test.tsx`

**Interfaces:**
- Consumes: `useD2Teams`, `D2Team` (Task 5); `d2TitleRows`, `rsChampionsOf`, `d2Mvps`, `leaguePath`, `d2TeamCase` (Task 4); `Bracket` (`app/playoffs/Bracket.tsx`, props `{ league, series, teams: Map<string, Team>, season, group, open, onOpen? }`); `Hero`, `TeamMark`, `teamTheme(team, 'fbad2')`, `formatScore`.
- Docs: `leagues/fbad2/leagueHistory.json` and `leagues/fbad2/draftHistory.json` (both optional), and `meta.json` for `currentSeason`.

**Pages:**

- **`D2SeasonPage` (`/history/fbad2/season/:season`):**
  - An unknown season shows "Not found".
  - `Hero kicker="Season <n>" title="S<n> D2 season"`.
  - A `<select aria-label="Season">` navigating to `/history/fbad2/season/<value>`, newest first.
  - Sections, each an `h2` only when it has content:
    - **"Titles":** the lines as on Championships;
    - **"Regular-season champions":** `rsChampionsOf`, as groupLabel: teams;
    - **"MVPs":** `d2Mvps`, as label: PlayerLink (team);
    - **"Standings":** only when `season.standings` is present. One `h3` plus table per group (PL, WL, UL, IL order) with Rank | Team | W | L | W%, sorted by rank;
    - **"Playoffs":** only when `season.bracket` is present. For each group with series, an `h3` and `<Bracket league="fbad2" series={series.filter(s => s.group === g)} teams={map} season={n} group={g} open={null} />`;
    - **"Promotion and relegation":** only when `season.promotion` is present. One line per league: `groupLabel: promoted A, B · relegated C, D`.
- **`D2TeamsPage` (`/history/fbad2/teams`):**
  - `PageHeader kicker="FBAD2 history" title="Teams"`.
  - For each of PL, WL, UL, IL: an `h2` with the group label, then a `card-grid` of `Link.card.link` → `/history/fbad2/teams/<id>`.
  - Each card: `TeamName` (size 40) and a muted "N title(s)" with a correct singular.
  - Teams come from teams.json, grouped by `group` and sorted by name.
- **`D2TeamPage` (`/history/fbad2/teams/:teamId`):**
  - An unknown team shows "Not found".
  - `Hero`: kicker = current `groupLabel`, title = team name, `theme={teamTheme(team,'fbad2')}`, `logo={<TeamMark team season={currentSeason} size={72} />}`, stats Titles / Finals / RS titles.
  - `h2` "League path": `ul.chips` of `groupLabel S<from>–S<to|pres.>` (a single season shows as `S71`), from `leaguePath(history, seasons, id, { season: meta.currentSeason, group: team.group })`. When the league history doc is missing, show the muted import hint.
  - Trophy case sections from `d2TeamCase`, each an `h2` plus a list and shown only when non-empty:
    - "Titles" (`S<n> <title>`)
    - "Finals lost"
    - "Regular-season titles"
    - "MVPs" (`S<n> <label> <PlayerLink>`)
    - "Series MVPs"
    - "Draft picks" (`S<n> pick <k>: <PlayerLink or name>`, with the season linking to `/history/fbad2/drafts/<n>`)

- [ ] **Step 1: Write the failing tests** (`D2TeamPages.test.tsx`). Stub fetch as in Task 5, plus `leagues/fbad2/leagueHistory.json`, `leagues/fbad2/draftHistory.json` and `meta.json` (`currentSeason: 79`). Assert:
  - **Season page, imported S69:**
    - it shows the Titles, Regular-season champions and MVPs sections;
    - there's no Standings heading;
    - the Season select changes the route (render inside `MemoryRouter` + `Routes`, and check the new page's hero).
  - **Season page, app-played S80 summary** with standings for PL (2 rows) and `promotion: [{ league: 'PL', promoted: [], relegated: ['LIS'] }]`: the Standings table and the promotion line render. Keep `bracket` out, since the `Bracket` internals are already tested.
  - **Teams page:** four group headings. A card links to `/history/fbad2/teams/LIS` and shows "1 title".
  - **Team page (LIS):**
    - the hero title is "Lisbon";
    - the league path chips read "Euro-South S56–S67" and "Premier League S68–pres.";
    - the Titles list contains "S69 Premier League Champion";
    - Draft picks contains a link to `/history/fbad2/drafts/70`.
  - **Unknown team:** "Not found".
- [ ] **Step 2: Run** `npx vitest run app/history/d2/D2TeamPages.test.tsx`. It should FAIL.
- [ ] **Step 3: Implement** the three pages.
- [ ] **Step 4: Verify.** `npx vitest run app/history` passes, and `npx tsc --noEmit` prints nothing.
- [ ] **Step 5: Commit** by path with the message "feat(d2-history): D2 season, teams and team pages" and the trailer.

---

### Task 7: D2 draft pages and the player page's D2 honours

**Files:**
- Replace the stubs: `app/history/d2/D2DraftsPage.tsx`, `app/history/d2/D2DraftSeasonPage.tsx`
- Modify: `app/history/PlayerHistoryPage.tsx`
- Test: `app/history/d2/D2DraftPages.test.tsx`; add cases to `app/history/CareerPages.test.tsx` (or whichever existing test renders `PlayerHistoryPage`; grep for it)

**Interfaces:**
- Consumes: `useD2Teams`, `D2Team` (Task 5); `d2PlayerHonours` (Task 4); `D2DraftHistoryFile` (Task 1).

**Pages:**

- **`D2DraftsPage` (`/history/fbad2/drafts`):**
  - `PageHeader kicker="FBAD2" title="Drafts"`.
  - A `ul.chips` of `S<n>` links → `/history/fbad2/drafts/<n>`, newest first.
  - A missing doc shows "No D2 draft history yet. Run npm run import -- --d2-history --data data."
- **`D2DraftSeasonPage` (`/history/fbad2/drafts/:season`):**
  - `PageHeader kicker="FBAD2 drafts" title="S<n> D2 Draft"`.
  - Prev/next season links when those drafts exist.
  - A `table.stat-table` with the columns Pick | Team | Player | Pos | Age | Rating:
    - Team: `<D2Team teamId name={teamName} season={n} size={16} />`;
    - Player: `PlayerLink` when `playerId` is set, else the name;
    - `—` for a null age or rating.
  - An unknown season shows "Not found".
- **`PlayerHistoryPage`:**
  - Add `useHistory('fbad2')` (named `d2`), `useDoc<D2DraftHistoryFile>('leagues/fbad2/draftHistory.json')` and `useD2Teams()`.
  - Treat the D2 history as decoration: an error or missing doc means no D2 block, never an error page. Wait only until they settle.
  - Compute `d2 = d2PlayerHonours(playerId, d2Seasons ?? [], d2Drafts ?? null, d2Teams)`.
  - When it's non-empty, render after the Honours block: `<div><h2>D2 honours</h2><ul>{S<season>: text}</ul></div>`.
  - Include `d2.length === 0` in the "No history recorded" condition, so a D2-only player shows the D2 block and not that line.
  - Keep every existing FBA behaviour unchanged. Existing tests stub fetch and return 404 for unknown URLs. `useHistory('fbad2')` must then settle to "no D2 data", so check how `useHistory` handles a 404 and treat its `error` as empty for the D2 call.

- [ ] **Step 1: Write the failing tests.**
  - Drafts list: chips S70 and S68, newest first.
  - Draft season S70:
    - the rows in order;
    - a matched team links to `/history/fbad2/teams/LIS`;
    - an unmatched team ("Vancouver") shows as text;
    - a `—` rating;
    - the next/prev links.
  - Player page, for a player with an `MVP-PL` award and a Series MVP in the D2 fixture seasons and no FBA data: the "D2 honours" heading, "S69: Premier League MVP (Lisbon)" and "S69: Series MVP, Premier League Champion", and no "No history recorded".
  - The existing player page tests still pass unchanged.
- [ ] **Step 2: Run** the new tests. They should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx vitest run app` passes, and `npx tsc --noEmit` prints nothing.
- [ ] **Step 5: Commit** by path with the message "feat(d2-history): D2 draft pages and player D2 honours" and the trailer.

---

### Task 8 (controller): scratch browser check, final review and roadmap

1. **Set up the scratch run** per CLAUDE.md's Browser checks (5183/5184, `.superpowers/sdd/rscheck/`):
   - `prep.mjs` copies the data.
   - Run `npm run import -- --d2-leagues --data <scratch>`. Expect the 12 moves.
   - Then run `npm run import -- --d2-history --data <scratch>`.
2. **Text-read every D2 history page:**
   - the hub and the switch;
   - Championships (S78 plus S55's two titles);
   - Awards;
   - seasons S53, S55, S69 and S78;
   - Teams (4 × 16);
   - two team pages (Madrid, whose path has many moves, and Oslo, founded S72);
   - drafts S68/S77/S78;
   - a D2-only player page and a player with both FBA and D2 honours.
   - Then check 375px and dark mode for horizontal scroll. At most 3 screenshots, at scale 0.5.
3. **Clean up:** stop both processes, delete the scratch data and `rscheck.vite.config.ts`, and check that `git status` is clean.
4. **Final review:** one Opus whole-branch review, its findings to one fixer, then re-verify tsc and the test count.
5. **Close out:** update the part 4 roadmap row (status, tests) and `.superpowers/sdd/progress.md`, then stop for the user before merging. The user runs `--d2-leagues` and `--d2-history` on real data.
