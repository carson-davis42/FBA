# Franchise History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each franchise's past names with that era's logo on the history pages, and give seasons without an imported bracket a bracket-style Finals card.

**Architecture:** A new `--franchises` import mode reads the name eras from the team history sheet into `leagues/fba/franchises.json`. A pure engine lookup maps a name as it was used in a season to its franchise. The history pages resolve names through that lookup instead of an exact match on current names, and a new `FinalsCard` covers S1–S51.

**Tech Stack:** Vite 5, React 18, React Router 6, TypeScript 5, zod 3, Vitest 2 + jsdom + Testing Library, exceljs (already a dependency).

**Spec:** `docs/superpowers/specs/2026-09-30-franchise-history-design.md` (decisions F1–F8).

## Global Constraints

- Branch `import-logos` (already checked out). Never switch branches.
- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`, in code, tests or scripts. The user has uncommitted changes there; never stage, revert or touch them. Stage files only by explicit path.
- Don't start or stop anything on ports 5173/5174.
- No new npm dependencies.
- Every jsdom test file calls `cleanup()` in `afterEach` (Vitest globals are off).
- Existing tests keep passing. Change a test only where the markup legitimately changed, and never weaken what it asserts.
- `npx tsc --noEmit` (from `web/`) prints nothing at the end of every task.
- Filter test output: `npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|✗|×" | head -30`.
- Colours: tokens only (`var(--…)`); no hard-coded colours.
- The franchises file is optional everywhere: without it, every page behaves as it does today.
- Reports: write `.superpowers/sdd/fh-task-N-report.md` (what changed, test count, anything odd), then reply in 5 lines or fewer.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Schema and name lookup

**Files:**
- Modify: `web/engine/shared/types.ts` (add after the `Champion` schema, around line 88)
- Modify: `web/engine/shared/schemaRegistry.ts` (import list and one path rule)
- Create: `web/engine/shared/franchises.ts`
- Test: `web/engine/shared/franchises.test.ts`

**Interfaces:**
- Produces: `FranchiseEra`, `Franchise`, `FranchisesFile` (zod schemas and types) in `engine/shared/types.ts`; `franchiseAt(file, name, season)` and `resolveHistoryTeam(teams, file, name, season, teamId?)` plus the `HistoryTeam` type in `engine/shared/franchises.ts`.

- [ ] **Step 1: Write the failing tests**

`web/engine/shared/franchises.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { franchiseAt, resolveHistoryTeam } from './franchises';
import { FranchisesFile, type Team } from './types';

const file: FranchisesFile = {
  franchises: [
    { teamId: 'MON', eras: [
      { name: 'Montreal Chevaliers', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 57, to: null },
      { name: 'Montreal', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 12, to: 56 },
      { name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas, Texas', from: 1, to: 10 },
    ] },
    { teamId: 'TEX', eras: [{ name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas, Texas', from: 41, to: null }] },
    { teamId: 'DEN', eras: [{ name: 'Denver Heights', abbr: 'DEN', city: 'Denver, Colorado', from: 61, to: null }] },
    { teamId: 'CHI', eras: [
      { name: 'Chicago Spartans', abbr: 'CHI', city: 'Chicago, Illinois', from: 49, to: null },
      { name: 'Chicago Spartans', abbr: 'CHI', city: 'Chicago, Illinois', from: 45, to: 49 },
    ] },
    { teamId: 'CP', eras: [{ name: 'Former Pirates', abbr: 'FP', city: 'Columbus, Ohio', from: 1, to: 56 }] },
  ],
};

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('MON', 'Montreal Chevaliers', 'MON'), team('TEX', 'Texas Outlaws', 'TEX'), team('DEN', 'Denver Heights', 'DEN'), team('CP', 'Columbus Pirates', 'CP')];

describe('franchiseAt', () => {
  it('resolves a reused name by season', () => {
    expect(franchiseAt(file, 'Texas Outlaws', 10)?.teamId).toBe('MON');
    expect(franchiseAt(file, 'Texas Outlaws', 50)?.teamId).toBe('TEX');
  });
  it('resolves an old name to its franchise', () => {
    expect(franchiseAt(file, 'Montreal', 30)).toEqual({ teamId: 'MON', era: file.franchises[0].eras[1] });
  });
  it('maps the Denver Height typo', () => {
    expect(franchiseAt(file, 'Denver Height', 74)?.teamId).toBe('DEN');
  });
  it('uses the nearest era with that name in a gap', () => {
    expect(franchiseAt(file, 'Montreal', 11)?.era.from).toBe(12);
  });
  it('prefers the later-starting era when two cover the season', () => {
    expect(franchiseAt(file, 'Chicago Spartans', 49)?.era.from).toBe(49);
  });
  it('returns null for an unknown name or no file', () => {
    expect(franchiseAt(file, 'Nobody', 30)).toBeNull();
    expect(franchiseAt(null, 'Montreal', 30)).toBeNull();
  });
});

describe('resolveHistoryTeam', () => {
  it('gives the current team with the era name and abbreviation', () => {
    const hit = resolveHistoryTeam(teams, file, 'Former Pirates', 20);
    expect(hit?.team.teamId).toBe('CP');
    expect(hit?.name).toBe('Former Pirates');
    expect(hit?.abbr).toBe('FP');
  });
  it('shows the corrected name for a typo', () => {
    expect(resolveHistoryTeam(teams, file, 'Denver Height', 74)?.name).toBe('Denver Heights');
  });
  it('lets a stored teamId win over the name lookup', () => {
    const hit = resolveHistoryTeam(teams, file, 'Texas Outlaws', 10, 'TEX');
    expect(hit?.team.teamId).toBe('TEX');
    expect(hit?.name).toBe('Texas Outlaws');
    expect(hit?.abbr).toBe('TEX');
  });
  it('falls back to an exact current-name match without a file', () => {
    expect(resolveHistoryTeam(teams, null, 'Montreal', 30)).toBeNull();
    expect(resolveHistoryTeam(teams, null, 'Texas Outlaws', 50)?.team.teamId).toBe('TEX');
  });
});

describe('FranchisesFile schema', () => {
  it('rejects an era that ends before it starts', () => {
    const bad = { franchises: [{ teamId: 'X', eras: [{ name: 'X', abbr: 'X', city: 'Y', from: 10, to: 5 }] }] };
    expect(FranchisesFile.safeParse(bad).success).toBe(false);
    expect(FranchisesFile.safeParse(file).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npx vitest run engine/shared/franchises.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|Error" | head`
Expected: FAIL (cannot resolve `./franchises`, or `FranchisesFile` is not exported).

- [ ] **Step 3: Add the schemas**

In `web/engine/shared/types.ts`, directly after `export type Champion = z.infer<typeof Champion>;`:

```ts
/** One name a franchise played under, from the team history sheet. `to` is null for the current era. */
export const FranchiseEra = z.object({
  name: z.string().min(1),
  abbr: z.string().min(1),
  city: z.string().min(1),
  from: int.min(1),
  to: int.min(1).nullable(),
}).strict().refine(e => e.to === null || e.to >= e.from, { message: 'to must be null or at least from' });
export type FranchiseEra = z.infer<typeof FranchiseEra>;
export const Franchise = z.object({ teamId: z.string().min(1), eras: z.array(FranchiseEra).min(1) }).strict();
export type Franchise = z.infer<typeof Franchise>;
/** leagues/fba/franchises.json: each franchise's name eras, newest first. */
export const FranchisesFile = z.object({ franchises: z.array(Franchise) }).strict();
export type FranchisesFile = z.infer<typeof FranchisesFile>;
```

In `web/engine/shared/schemaRegistry.ts`, add `FranchisesFile` to the import list from `./types` (alphabetical, after `DraftFile`), and add this rule next to the `hallOfFame` rule:

```ts
  [/^leagues\/fba\/franchises\.json$/, FranchisesFile],
```

- [ ] **Step 4: Write the lookup**

`web/engine/shared/franchises.ts`:

```ts
import type { FranchiseEra, FranchisesFile, Team } from './types';

/** Names in the history sources that are typos of a franchise name. */
const ALIASES: Record<string, string> = { 'Denver Height': 'Denver Heights' };

/**
 * The franchise that used `name` in `season`: the era covering the season (the later-starting one when two do),
 * else the nearest era with that name. Null without a file or for an unknown name.
 */
export function franchiseAt(file: FranchisesFile | null | undefined, name: string, season: number): { teamId: string; era: FranchiseEra } | null {
  if (!file) return null;
  const want = ALIASES[name.trim()] ?? name.trim();
  const hits = file.franchises.flatMap(f => f.eras.filter(e => e.name === want).map(era => ({ teamId: f.teamId, era })));
  if (!hits.length) return null;
  const covers = (e: FranchiseEra) => e.from <= season && (e.to === null || season <= e.to);
  const covering = hits.filter(h => covers(h.era)).sort((a, b) => b.era.from - a.era.from);
  if (covering.length) return covering[0];
  const distance = (e: FranchiseEra) => (season < e.from ? e.from - season : season - (e.to ?? season));
  return [...hits].sort((a, b) => distance(a.era) - distance(b.era) || b.era.from - a.era.from)[0];
}

/** A current team as it appeared in a past season: the name and abbreviation it used then. */
export interface HistoryTeam { team: Team; name: string; abbr: string }

/**
 * The team behind a name recorded in `season`. A stored `teamId` wins; then the franchise lookup; then an exact
 * match on a current name. The era's name and abbreviation are used when the era belongs to that team.
 */
export function resolveHistoryTeam(
  teams: Team[], file: FranchisesFile | null | undefined, name: string, season: number, teamId?: string | null,
): HistoryTeam | null {
  const hit = franchiseAt(file, name, season);
  const team = (teamId ? teams.find(t => t.teamId === teamId) : undefined)
    ?? (hit ? teams.find(t => t.teamId === hit.teamId) : undefined)
    ?? teams.find(t => t.name === name);
  if (!team) return null;
  const era = hit && hit.teamId === team.teamId ? hit.era : null;
  return { team, name: era?.name ?? name, abbr: era?.abbr ?? team.abbr };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run engine/shared/franchises.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
Expected: 1 file, 11 tests pass.

- [ ] **Step 6: Full suite and typecheck**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|✗|×" | head -30` and `npx tsc --noEmit`.
Expected: everything passes (`web/data.test.ts` is unaffected: the committed data has no franchises file); tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add web/engine/shared/types.ts web/engine/shared/schemaRegistry.ts web/engine/shared/franchises.ts web/engine/shared/franchises.test.ts
git commit -m "feat(history): franchise name eras schema and lookup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `--franchises` import mode (and `--data` for `--logos`)

**Files:**
- Create: `web/importers/sheets/franchises.ts`
- Test: `web/importers/sheets/franchises.test.ts`
- Modify: `web/importers/sheets/xlsx.ts` (add `tabNames`)
- Modify: `web/importers/run.ts` (SHEETS id, `dataDir()`, `refreshLogos()` uses it, new `importFranchises()`, `main()` wiring)
- Modify: `README.md` (the `--logos` line and one new line)

**Interfaces:**
- Consumes: `FranchisesFile`, `FranchiseEra`, `Franchise` from Task 1; `schemaForPath` (existing).
- Produces: `parseFranchiseTab(rows: string[][]): { eras: FranchiseEra[]; problems: string[] }`; `tabNames(file: string): Promise<string[]>`; CLI `npm run import -- --franchises [--data <dir>]` and `npm run import -- --logos [--data <dir>]`.

- [ ] **Step 1: Write the failing parser test**

`web/importers/sheets/franchises.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseFranchiseTab } from './franchises';

/** A CAR-style tab: header row, award columns to the right, then name-era blocks in column A, newest first. */
function carTab(): string[][] {
  const rows: string[][] = Array.from({ length: 52 }, () => []);
  rows[0] = ['Team Info', 'Championships', 'C-Ship app.'];
  rows[2] = ['', '(S57)', '(S56)'];
  const block = (at: number, cells: string[]) => cells.forEach((c, k) => { rows[at + k] = [c, k === 0 ? '(S70)' : '']; });
  block(8, ['Carolina Knights', 'CAR', '(Charlotte, North Carolina)', 'S73-pres.']);
  block(21, ['Charlotte Knights', 'CHA', '(Charlotte, North Carolina)', 'S68-S72']);
  block(33, ['Cal Tech Golden Knights', 'CT', '(Sacramento, California)', 'S57-S67']);
  block(46, ['Cal Tech Knights', 'CT', '(Sacramento, California)', 'S41-S56']);
  return rows;
}

describe('parseFranchiseTab', () => {
  it('reads every name era in sheet order', () => {
    const { eras, problems } = parseFranchiseTab(carTab());
    expect(problems).toEqual([]);
    expect(eras).toEqual([
      { name: 'Carolina Knights', abbr: 'CAR', city: 'Charlotte, North Carolina', from: 73, to: null },
      { name: 'Charlotte Knights', abbr: 'CHA', city: 'Charlotte, North Carolina', from: 68, to: 72 },
      { name: 'Cal Tech Golden Knights', abbr: 'CT', city: 'Sacramento, California', from: 57, to: 67 },
      { name: 'Cal Tech Knights', abbr: 'CT', city: 'Sacramento, California', from: 41, to: 56 },
    ]);
  });
  it('accepts "pres" without the dot', () => {
    const rows: string[][] = [['Denver Heights'], ['DEN'], ['(Denver, Colorado)'], ['S61-pres']];
    expect(parseFranchiseTab(rows).eras).toEqual([{ name: 'Denver Heights', abbr: 'DEN', city: 'Denver, Colorado', from: 61, to: null }]);
  });
  it('reports and skips a block with a missing cell', () => {
    const rows = carTab();
    rows[22] = [''];
    const { eras, problems } = parseFranchiseTab(rows);
    expect(eras.map(e => e.name)).toEqual(['Carolina Knights', 'Cal Tech Golden Knights', 'Cal Tech Knights']);
    expect(problems).toEqual(['row 25: era "S68-S72" is missing its name, abbreviation or (city)']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `web/`): `npx vitest run importers/sheets/franchises.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|Error" | head`
Expected: FAIL (cannot resolve `./franchises`).

- [ ] **Step 3: Write the parser**

`web/importers/sheets/franchises.ts`:

```ts
import type { FranchiseEra } from '../../engine/shared/types';

const RANGE = /^S(\d+)-(?:S(\d+)|pres\.?)$/i;

/**
 * One franchise tab of the team history sheet. Column A lists the franchise's name eras, newest first, each as
 * four cells: name, abbreviation, "(City, Region)", and "S41-S56" or "S73-pres.".
 */
export function parseFranchiseTab(rows: string[][]): { eras: FranchiseEra[]; problems: string[] } {
  const col = rows.map(r => (r?.[0] ?? '').trim());
  const eras: FranchiseEra[] = [];
  const problems: string[] = [];
  col.forEach((cell, i) => {
    const m = cell.match(RANGE);
    if (!m) return;
    const name = col[i - 3] ?? '';
    const abbr = col[i - 2] ?? '';
    const place = col[i - 1] ?? '';
    const city = /^\(.+\)$/.test(place) ? place.slice(1, -1).trim() : '';
    if (!name || !abbr || !city) {
      problems.push(`row ${i + 1}: era "${cell}" is missing its name, abbreviation or (city)`);
      return;
    }
    eras.push({ name, abbr, city, from: Number(m[1]), to: m[2] ? Number(m[2]) : null });
  });
  return { eras, problems };
}
```

- [ ] **Step 4: Run the parser test to verify it passes**

Run: `npx vitest run importers/sheets/franchises.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL|×"`
Expected: 1 file, 3 tests pass.

- [ ] **Step 5: Add `tabNames` to xlsx.ts**

In `web/importers/sheets/xlsx.ts`, after `readTabs`:

```ts
/** The workbook's tab names, in sheet order. */
export async function tabNames(file: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map(ws => ws.name);
}
```

- [ ] **Step 6: Wire the import modes in run.ts**

In `web/importers/run.ts`:

1. Add to the `SHEETS` object: `teamHistory: '1_oz7ULZMsaFInj-ncqs8qUm_5UBBNffJM_x9_ZOvQFU',`
2. Add `Franchise, FranchisesFile` to the type import from `../engine/shared/types` (it already imports `LogoManifest`, `TeamsFile`, …), `parseFranchiseTab` from `./sheets/franchises`, and `tabNames` to the existing `./sheets/xlsx` import.
3. Add this helper after `readJson`:

```ts
/** The data folder to write: web/data, or the folder given with --data <dir> (use a scratch copy for checks). */
function dataDir(): string {
  const i = process.argv.indexOf('--data');
  if (i < 0) return DATA;
  const dirArg = process.argv[i + 1];
  if (!dirArg || dirArg.startsWith('--')) {
    console.error('--data needs a folder: the data folder to write.');
    process.exit(1);
  }
  return path.resolve(dirArg);
}
```

4. In `refreshLogos()`, replace `const file = path.join(DATA, ...rel.split('/'));` and `const before = existsSync(file) ? readJson<LogoManifest>(rel) : null;` with:

```ts
  const file = path.join(dataDir(), ...rel.split('/'));
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as LogoManifest) : null;
```

and change its last line to `console.log(`Wrote ${file}.`);`.

5. Add after `refreshLogos()`:

```ts
/** Reads each franchise's name eras from the team history sheet into leagues/fba/franchises.json. Writes nothing else. */
async function importFranchises(): Promise<void> {
  const rel = 'leagues/fba/franchises.json';
  const dir = dataDir();
  rmSync(path.join(CACHE, `${SHEETS.teamHistory}.xlsx`), { force: true });
  console.log('Downloading the team history sheet (about 75 MB)...');
  const book = await downloadWorkbook(SHEETS.teamHistory, CACHE);
  const ids = (await tabNames(book)).filter(n => /^[A-Z]+$/.test(n));
  const tabs = await readTabs(book, ids);
  const franchises: Franchise[] = [];
  for (const id of ids) {
    const { eras, problems } = parseFranchiseTab(tabs[id]);
    for (const p of problems) console.warn(`warning: ${id} ${p}`);
    if (eras.length) franchises.push({ teamId: id, eras });
    else console.warn(`warning: ${id} has no name eras`);
  }
  const doc: FranchisesFile = { franchises };
  if (!franchises.length || !schemaForPath(rel)?.safeParse(doc).success) {
    console.error(`The parsed ${rel} is empty or fails its schema; nothing was written.`);
    process.exit(1);
  }
  const teamsFile = path.join(dir, 'leagues', 'fba', 'teams.json');
  if (existsSync(teamsFile)) {
    const known = new Set((JSON.parse(readFileSync(teamsFile, 'utf8')) as TeamsFile).teams.map(t => t.teamId));
    const extra = franchises.filter(f => !known.has(f.teamId)).map(f => f.teamId);
    if (extra.length) console.log(`Not in teams.json yet: ${extra.join(', ')}`);
  }
  const file = path.join(dir, ...rel.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  const eraCount = franchises.reduce((n, f) => n + f.eras.length, 0);
  console.log(`Wrote ${file}: ${franchises.length} franchises, ${eraCount} name eras.`);
}
```

6. In `main()`, next to the `--logos` line: `if (process.argv.includes('--franchises')) return importFranchises();`

- [ ] **Step 7: Update the README**

In `README.md`, replace the `--logos` line with these two lines:

```markdown
- `npm run import -- --logos` rebuilds the logo list (`web/data/logos/manifest.json`) from `FBA Logos/` after you add or rename logo files, and prints the team folders that changed. It writes nothing else. Add `--data <dir>` to write to another data folder.
- `npm run import -- --franchises` reads each franchise's past names, abbreviations, cities and seasons from the team history sheet into `web/data/leagues/fba/franchises.json`, so the history pages can show old team names with that era's logo. It writes nothing else; re-run it after a rename or relocation. Add `--data <dir>` to write to another data folder.
```

- [ ] **Step 8: Full suite and typecheck**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|✗|×" | head -30` and `npx tsc --noEmit`.
Expected: all pass; tsc prints nothing. Do NOT run either import mode: without `--data` they write the user's real `web/data`. The controller runs them against scratch data in Task 5.

- [ ] **Step 9: Commit**

```bash
git add web/importers/sheets/franchises.ts web/importers/sheets/franchises.test.ts web/importers/sheets/xlsx.ts web/importers/run.ts README.md
git commit -m "feat(import): --franchises reads team name eras from the team history sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: History pages resolve past names

**Files:**
- Modify: `web/app/components/TeamName.tsx`
- Test: `web/app/components/TeamName.test.tsx` (add one case)
- Modify: `web/app/history/useTeams.tsx`
- Create: `web/app/history/useTeams.test.tsx`
- Modify: `web/app/history/PastBracket.tsx`
- Test: `web/app/history/PastBracket.test.tsx` (add one case)
- Modify: `web/app/history/ChampionshipsPage.tsx` (pass `franchises`)
- Modify: `web/app/history/SeasonHistoryPage.tsx` (load franchises; hero team via `resolveHistoryTeam`; pass `franchises` to `PastBracket`)

**Interfaces:**
- Consumes: `resolveHistoryTeam`, `FranchisesFile` (Task 1).
- Produces: `TeamName` optional props `name?: string; abbr?: string`; `useFbaTeams(): { settled: boolean; teams: Team[]; franchises: FranchisesFile | null }`; `TeamFull({ teams, franchises?, teamId?, name, season, variant?: 'full' | 'abbr', size? })`; `PastBracket({ bracket, teams, season, franchises? })`.

- [ ] **Step 1: Write the failing tests**

Add to `web/app/components/TeamName.test.tsx`, inside its existing `describe('TeamName', …)` (it already defines the `venom` fixture):

```tsx
  it('shows name and abbreviation overrides', () => {
    render(<><TeamName team={venom} season={30} name="Former Pirates" abbr="FP" /><TeamName team={venom} season={30} variant="abbr" name="Former Pirates" abbr="FP" /></>);
    expect(screen.getByText('Former Pirates')).toBeTruthy();
    expect(screen.getByText('FP').closest('.team-name')!.getAttribute('title')).toBe('Former Pirates');
  });
```

`web/app/history/useTeams.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FranchisesFile, Team } from '../../engine/shared/types';
import { TeamFull } from './useTeams';

afterEach(cleanup);

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('MON', 'Montreal Chevaliers', 'MON')];
const franchises: FranchisesFile = { franchises: [{ teamId: 'MON', eras: [
  { name: 'Montreal Chevaliers', abbr: 'MON', city: 'Montreal', from: 57, to: null },
  { name: 'Montreal', abbr: 'MON', city: 'Montreal', from: 12, to: 56 },
] }] };

describe('TeamFull', () => {
  it('shows an old name with its franchise mark when franchises are loaded', () => {
    const { container } = render(<TeamFull teams={teams} franchises={franchises} name="Montreal" season={30} />);
    expect(container.querySelector('.team-name')).toBeTruthy();
    expect(screen.getByText('Montreal')).toBeTruthy();
  });
  it('shows plain text for an old name without franchises', () => {
    const { container } = render(<TeamFull teams={teams} name="Montreal" season={30} />);
    expect(container.querySelector('.team-name')).toBeNull();
    expect(container.textContent).toBe('Montreal');
  });
});
```

Add to `web/app/history/PastBracket.test.tsx` (read it first; reuse its imports and `cleanup`):

```tsx
describe('PastBracket with franchises', () => {
  const mon: Team = { teamId: 'MON', name: 'Montreal Chevaliers', abbr: 'MON', group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } };
  const franchises: FranchisesFile = { franchises: [{ teamId: 'MON', eras: [{ name: 'Montreal', abbr: 'MTL', city: 'Montreal', from: 12, to: 56 }] }] };
  const bracket: PastBracketDoc = { rounds: 1, series: [{ id: 'R1-1', round: 1, home: { name: 'Montreal', record: null, seed: 1 }, away: { name: 'Gamma', record: null, seed: 2 }, homeWins: 4, awayWins: 1, winner: 'home' }] };
  it('marks an old name with its franchise and era abbreviation', () => {
    const { container } = render(<PastBracket bracket={bracket} teams={[mon]} season={30} franchises={franchises} />);
    expect(container.querySelectorAll('.series-side .team-name')).toHaveLength(1);
    expect(screen.getByText('MTL')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });
  it('keeps plain text without franchises', () => {
    const { container } = render(<PastBracket bracket={bracket} teams={[mon]} season={30} />);
    expect(container.querySelectorAll('.series-side .team-name')).toHaveLength(0);
    expect(screen.getByText('Montreal')).toBeTruthy();
  });
});
```

(`PastBracketDoc` is `PastBracket` from `engine/shared/types` imported under that alias, as `PastBracket.tsx` does; add `FranchisesFile` and `Team` to the type import.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/components/TeamName.test.tsx app/history/useTeams.test.tsx app/history/PastBracket.test.tsx 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head`
Expected: the new cases FAIL (unknown props, no franchise resolution).

- [ ] **Step 3: TeamName overrides**

`web/app/components/TeamName.tsx`, replace the function signature and first two lines of the body:

```tsx
/** Logo plus name. 'short' is the last word of the name ("Venom"); 'abbr' is the abbreviation. `name`/`abbr` override the team's (history pages show the name a team used that season). */
export function TeamName({ team, season, variant = 'full', to, size = 20, name = team.name, abbr = team.abbr }: {
  team: Team; season: number; variant?: 'full' | 'short' | 'abbr'; to?: string; size?: number; name?: string; abbr?: string;
}) {
  const label = variant === 'abbr' ? abbr : variant === 'short' ? name.split(' ').slice(-1)[0] : name;
  const title = variant === 'full' ? undefined : name;
```

(The rest of the function is unchanged.)

- [ ] **Step 4: useTeams**

In `web/app/history/useTeams.tsx`: import `FranchisesFile` alongside `Team, TeamsFile`, and `resolveHistoryTeam` from `'../../engine/shared/franchises'`. Replace `useFbaTeams` and `TeamFull`:

```tsx
/** The FBA teams and franchise name eras, for decoration only: a missing or unreadable doc means plain text instead of logos, never an error page. */
export function useFbaTeams() {
  const doc = useDoc<TeamsFile>('leagues/fba/teams.json');
  const fr = useDoc<FranchisesFile>('leagues/fba/franchises.json');
  const done = (d: { data?: unknown; missing: boolean; error?: unknown }) => !!d.data || d.missing || !!d.error;
  return { settled: done(doc) && done(fr), teams: doc.data?.teams ?? [], franchises: fr.data ?? null };
}
```

```tsx
/** A team as recorded in a past season, with its franchise's logo when it resolves, else the bare text. */
export function TeamFull({ teams, franchises = null, teamId, name, season, variant = 'full', size }: {
  teams: Team[]; franchises?: FranchisesFile | null; teamId?: string | null; name: string; season: number; variant?: 'full' | 'abbr'; size?: number;
}) {
  const hit = resolveHistoryTeam(teams, franchises, name, season, teamId);
  return hit ? <TeamName team={hit.team} season={season} variant={variant} size={size} name={hit.name} abbr={hit.abbr} /> : <>{name}</>;
}
```

Check that `useDoc`'s return value has `data`, `missing` and `error` with those names (see `web/app/api.ts`); adjust the `done` parameter type to the real one if needed. Keep `findTeam` and `TeamAbbr` as they are.

- [ ] **Step 5: PastBracket**

In `web/app/history/PastBracket.tsx`: import `FranchisesFile` in the type import and `TeamFull` from `'./useTeams'` (drop the now-unused `TeamName` import). Replace `Side` and thread `franchises` through:

```tsx
function Side({ side, wins, won, teams, franchises, season }: { side: PastSide | null; wins: number; won: boolean; teams: Team[]; franchises: FranchisesFile | null; season: number }) {
  if (!side) return <SideRow seed={null} name="BYE" wins={null} won={false} />;
  return (
    <SideRow
      seed={side.seed}
      name={<TeamFull teams={teams} franchises={franchises} name={side.name} season={season} variant="abbr" size={20} />}
      wins={wins}
      won={won}
    />
  );
}
```

`PastBracket`'s props become `{ bracket, teams, season, franchises = null }: { bracket: PastBracketDoc; teams: Team[]; season: number; franchises?: FranchisesFile | null }`, and both `<Side …>` calls pass `franchises={franchises}`.

- [ ] **Step 6: ChampionshipsPage**

In `web/app/history/ChampionshipsPage.tsx`: destructure `franchises` from `useFbaTeams()` next to `settled, teams`, and pass `franchises={franchises}` to both `TeamFull` calls. Leave the "West · East" line as plain text.

- [ ] **Step 7: SeasonHistoryPage**

In `web/app/history/SeasonHistoryPage.tsx`:

1. Import `FranchisesFile` in the types import and `resolveHistoryTeam` from `'../../engine/shared/franchises'`.
2. After the `d2Teams` line: `const franchises = useDoc<FranchisesFile>('leagues/fba/franchises.json');`
3. The loading guard also waits for it (an error is not a failure; it just means no franchises):
   `if (!seasons || !players.data || !fbaTeams.data || !d2Teams.data || !(franchises.data || franchises.missing || franchises.error)) return <p className="muted">Loading…</p>;`
4. Replace the `champTeam` line with:

```tsx
  const fr = franchises.data ?? null;
  const champTeam = champion ? resolveHistoryTeam(fbaTeams.data.teams, fr, champion.champion, season.season, champion.teamId)?.team : undefined;
```

5. `Playoffs` gets a `franchises: FranchisesFile | null` prop (render call: `franchises={fr}`), and its `<PastBracket …>` passes `franchises={franchises}`. The Hero title stays `champion.champion`.

- [ ] **Step 8: Run the history and component tests, then the full suite**

Run: `npx vitest run app/history app/components 2>&1 | grep -E "Test Files|Tests |FAIL|×"`, then the full suite and `npx tsc --noEmit`.
Expected: all pass. Existing history tests stub unknown URLs with 404, so the franchises doc is "missing" there and behaviour is unchanged. If one breaks, fix only a query broken by the markup change and note it in the report.

- [ ] **Step 9: Commit**

```bash
git add web/app/components/TeamName.tsx web/app/components/TeamName.test.tsx web/app/history/useTeams.tsx web/app/history/useTeams.test.tsx web/app/history/PastBracket.tsx web/app/history/PastBracket.test.tsx web/app/history/ChampionshipsPage.tsx web/app/history/SeasonHistoryPage.tsx
git commit -m "feat(history): past team names resolve to their franchise and era logo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Finals card for seasons without a bracket

**Files:**
- Modify: `web/app/playoffs/Bracket.tsx` (`SideRow`'s `seed` prop accepts a label)
- Create: `web/app/history/FinalsCard.tsx`
- Test: `web/app/history/FinalsCard.test.tsx`
- Modify: `web/app/history/SeasonHistoryPage.tsx` (render `FinalsCard` in place of the "Finals: … def. …" line)
- Modify: `web/app/history/SeasonHistoryPage.test.tsx` (the "falls back to the champions line" case)
- Modify: `web/app/history/history.css`

**Interfaces:**
- Consumes: `TeamFull` with `franchises` and `variant` (Task 3); `SideRow`, `ChampBadge` from `app/playoffs/Bracket.tsx`; `Champion`, `SummaryFile`, `FranchisesFile`, `Team` types.
- Produces: `FinalsCard({ champion, conf, teams, franchises, season })`, `finalsWins(score): [number, number] | null`.

- [ ] **Step 1: Write the failing tests**

`web/app/history/FinalsCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Champion, FranchisesFile, Team } from '../../engine/shared/types';
import { FinalsCard, finalsWins } from './FinalsCard';

afterEach(cleanup);

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('SAS', 'San Antonio Spirits', 'SAS'), team('CP', 'Columbus Pirates', 'CP')];
const franchises: FranchisesFile = { franchises: [
  { teamId: 'SAS', eras: [{ name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 27 }] },
  { teamId: 'CP', eras: [{ name: 'Former Pirates', abbr: 'FP', city: 'Columbus, Ohio', from: 1, to: 34 }] },
] };
const champion: Champion = { title: 'FBA Champion', champion: 'San Antonio', runnerUp: 'Former Pirates', score: '1–0', finalsMvp: null };

describe('finalsWins', () => {
  it('reads en dash and hyphen scores, winner first', () => {
    expect(finalsWins('1–0')).toEqual([1, 0]);
    expect(finalsWins('4-1')).toEqual([4, 1]);
    expect(finalsWins(null)).toBeNull();
    expect(finalsWins('OT')).toBeNull();
  });
});

describe('FinalsCard', () => {
  it('shows the champion and runner-up as a decided Finals box', () => {
    const { container } = render(<FinalsCard champion={champion} conf={{ E: 'Former Pirates', W: 'San Antonio' }} teams={teams} franchises={franchises} season={20} />);
    const won = container.querySelector('.series-box.finals .series-side.won');
    const lost = container.querySelector('.series-box.finals .series-side:not(.won)');
    expect(won?.textContent).toContain('San Antonio');
    expect(won?.querySelector('.seed')?.textContent).toBe('W');
    expect(won?.querySelector('.wins')?.textContent).toBe('1');
    expect(lost?.textContent).toContain('Former Pirates');
    expect(lost?.querySelector('.seed')?.textContent).toBe('E');
    expect(lost?.querySelector('.wins')?.textContent).toBe('0');
    expect(container.querySelectorAll('.series-box.finals .team-name')).toHaveLength(2);
    expect(container.querySelector('.champ-badge')).toBeTruthy();
    expect(screen.getByText("The full bracket for S20 wasn't recorded.")).toBeTruthy();
  });
  it('works without franchises, conference champions or a score', () => {
    const { container } = render(<FinalsCard champion={{ ...champion, score: null }} conf={null} teams={teams} franchises={null} season={20} />);
    expect(container.querySelector('.series-side.won')?.textContent).toContain('San Antonio');
    expect(container.querySelector('.series-side.won .seed')?.textContent).toBe('');
    expect(container.querySelector('.series-side.won .wins')?.textContent).toBe('');
    expect(container.querySelectorAll('.team-name')).toHaveLength(0);
  });
});
```

In `web/app/history/SeasonHistoryPage.test.tsx`, replace the case `'falls back to the champions line without a bracket'` (the markup legitimately changed from a text line to the card) with:

```tsx
  it('shows a Finals card without a bracket', async () => {
    stub([{ ...s72, pastBracket: null, confChampions: { E: 'Boston', W: 'Utah' } }]);
    const { container } = renderAt('/history/fba/season/72');
    await screen.findByRole('heading', { name: 'Utah' });
    fireEvent.click(screen.getByRole('tab', { name: 'Playoffs' }));
    const won = container.querySelector('.finals-only .series-side.won');
    expect(won?.textContent).toContain('Utah');
    expect(won?.querySelector('.wins')?.textContent).toBe('4');
    expect(container.querySelector('.finals-only .series-side:not(.won) .wins')?.textContent).toBe('3');
    expect(screen.getByText("The full bracket for S72 wasn't recorded.")).toBeTruthy();
    expect(screen.getByText(/Finals MVP:/)).toBeTruthy();
  });
```

(`s72` has `champion: 'Utah'`, `runnerUp: 'Boston'`, `score: '4-3'`, `finalsMvp: 'p00002'`. Keep the other cases as they are.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/history/FinalsCard.test.tsx app/history/SeasonHistoryPage.test.tsx 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head`
Expected: FAIL (no `./FinalsCard`; no `.finals-only` on the page).

- [ ] **Step 3: Widen SideRow's seed**

In `web/app/playoffs/Bracket.tsx`, change `SideRow`'s prop type from `seed: number | null` to `seed: ReactNode` (`ReactNode` is already imported there; the body `seed ?? ''` is unchanged). All existing callers pass numbers or null, which still type-check.

- [ ] **Step 4: Write FinalsCard**

`web/app/history/FinalsCard.tsx`:

```tsx
import type { Champion, FranchisesFile, SummaryFile, Team } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import { TeamFull } from './useTeams';

/** Wins from a series score such as "4–1" or "2-0", winner first; null when the score can't be read. */
export function finalsWins(score: string | null | undefined): [number, number] | null {
  const m = (score ?? '').match(/^\s*(\d+)\s*[–-]\s*(\d+)\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The Finals of a season with no recorded bracket, drawn as the Finals box of a bracket. */
export function FinalsCard({ champion, conf, teams, franchises, season }: {
  champion: Champion; conf: SummaryFile['confChampions']; teams: Team[]; franchises: FranchisesFile | null; season: number;
}) {
  const wins = finalsWins(champion.score);
  const confOf = (name: string | null) => (!name || !conf ? null : conf.E === name ? 'E' : conf.W === name ? 'W' : null);
  const row = (name: string | null, teamId: string | undefined, w: number | null, won: boolean) => (
    <SideRow
      seed={confOf(name)}
      name={name ? <TeamFull teams={teams} franchises={franchises} teamId={teamId} name={name} season={season} size={20} /> : '—'}
      wins={w}
      won={won}
    />
  );
  return (
    <div className="stack">
      <p className="muted">The full bracket for S{season} wasn't recorded.</p>
      <div className="finals-only">
        <div className="series-box finals decided">
          <ChampBadge />
          {row(champion.champion, champion.teamId, wins ? wins[0] : null, true)}
          {row(champion.runnerUp, champion.runnerUpId, wins ? wins[1] : null, false)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Use it on the season page**

In `web/app/history/SeasonHistoryPage.tsx`'s `Playoffs`, replace

```tsx
      ) : champion ? (
        <p>Finals: {champion.champion} def. {champion.runnerUp ?? '—'}, {formatScore(champion.score)}</p>
```

with

```tsx
      ) : champion ? (
        <FinalsCard champion={champion} conf={season.confChampions ?? null} teams={teams} franchises={franchises} season={season.season} />
```

Import `FinalsCard` from `'./FinalsCard'`. If `formatScore` is now unused in the file, remove its import. The Finals MVP line below stays.

- [ ] **Step 6: Style**

Append to `web/app/history/history.css`:

```css
/* The Finals box on its own, for seasons without a recorded bracket. */
.finals-only { display: flex; justify-content: center; padding-top: var(--s4); }
.finals-only .series-box { width: min(360px, 100%); }
```

(Use only spacing tokens that exist in `web/app/theme.css`; if `--s4` is not defined there, use the nearest defined `--s*` token.)

- [ ] **Step 7: Run the tests, then the full suite**

Run: `npx vitest run app/history app/playoffs 2>&1 | grep -E "Test Files|Tests |FAIL|×"`, then the full suite and `npx tsc --noEmit`.
Expected: all pass; tsc prints nothing.

- [ ] **Step 8: Commit**

```bash
git add web/app/playoffs/Bracket.tsx web/app/history/FinalsCard.tsx web/app/history/FinalsCard.test.tsx web/app/history/SeasonHistoryPage.tsx web/app/history/SeasonHistoryPage.test.tsx web/app/history/history.css
git commit -m "feat(history): Finals card for seasons without a recorded bracket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser check, final review and docs (controller)

- [ ] Prep scratch data: `node .superpowers/sdd/rscheck/prep.mjs`. Then, from `web/`, rebuild the scratch copy's logo list and franchises: `npm run import -- --logos --data ../.superpowers/sdd/rscheck/data` and `npm run import -- --franchises --data ../.superpowers/sdd/rscheck/data`. Expect 32 franchises and "Not in teams.json yet: LAL, PHI".
- [ ] Start the scratch data server on 5184 and Vite on 5183 (temporary `web/rscheck.vite.config.ts`, started with `--force`).
- [ ] Check, at desktop, 375×812 and dark: `/history/fba/season/20` (Playoffs tab: Finals card, San Antonio over Former Pirates, both with `.team-name` marks, W/E labels), `/history/fba/season/54` (past bracket: St.Louis and Cypress Black Sox resolve to marks), `/history/fba/season/10` (Texas Outlaws resolves to MON), `/history/fba/championships` (Montreal and San Antonio rows carry marks), and no horizontal scroll. Logo requests for those marks return 200. At most three screenshots at scale 0.5.
- [ ] Clean up: stop both processes, delete the scratch data and `web/rscheck.vite.config.ts`, reset the viewport, confirm `git status` matches its state before the check.
- [ ] Opus final review of `git diff main...import-logos` (includes the earlier `--logos` commit) to `.superpowers/sdd/fh-final-review.md`; a Sonnet fixer applies Critical and Important findings and cheap Minors.
- [ ] Add a roadmap row to `docs/superpowers/specs/2026-09-25-fba-web-design.md` and a section to `.superpowers/sdd/progress.md`; commit. Stop for the user before merging, and remind them to run `npm run import -- --logos` and `npm run import -- --franchises` on the real data.
