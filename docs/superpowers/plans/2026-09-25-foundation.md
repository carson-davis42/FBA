# Foundation (Sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `web/` app: the Java snapshot tag, a validated JSON data model imported from the current `.txt` files and Google Sheets, a local save server, and a themed React shell (home dashboard, calendar, and read-only rosters for all four leagues).

**Architecture:** Pure TypeScript domain code in `web/engine/` (schemas, logos, calendar helpers). One-time importers in `web/importers/` turn `.txt` files and xlsx exports into JSON under `web/data/`. A tiny `node:http` server in `web/server/` validates and atomically writes those files and serves era-correct logos. A Vite + React UI in `web/app/` reads and writes through that server.

**Tech Stack:** Node 24, TypeScript 5, Vite 5, React 18, React Router 6, zod 3.23.8, exceljs 4, Vitest 2 (+ jsdom, Testing Library), tsx, concurrently.

**Spec:** `docs/superpowers/specs/2026-09-25-fba-web-design.md` (§11 is this sub-project).

## Global Constraints

- Never modify anything inside `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/`, or `FBA Logos/` after Task 1. They are read-only inputs.
- All web code lives under `web/`. Run every `npm` command from `web/` (or with `npm --prefix web`).
- League ids are exactly `fba`, `fbad2`, `fbajc`, `fbawc`.
- Player ids are `p` + 5 digits (`p00001`), assigned once at import and never reused.
- Data documents live at the exact paths matched by `web/engine/shared/schemaRegistry.ts`; any other path is refused.
- Finished seasons are written with `locked: true`; the server refuses to overwrite a locked document.
- The server binds to `127.0.0.1:5174`; Vite runs on `5173` and proxies `/api` and `/logos` to the server.
- Theme: light "Clean Sports Page" is the default (`--accent: #c8102e`); dark "Broadcast Dark" (`--bg: #0b1020`) is toggled and remembered in `localStorage` key `fba-theme` (wrapped in try/catch).
- The importer's Google Sheet ids: rosters `1f5j4rhYDK7HB8j9Zz-JHDrhRqEYDSxkgfwQcuqP-A2w`, main history `1p5oLB9lJvsVKIyaiEOOg9luPxGBdY3yy5SOGq7edMUM`.
- The contract conversion from `.txt` is `contractEnd = season + contractLen − 1`.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
web/
  package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
  engine/shared/
    types.ts            zod schemas + inferred types for every data document
    leagues.ts          league ids, labels, group (conference/league) labels
    names.ts            normalizeName for cross-league player matching
    calendar.ts         currentStepIndex / markCurrentDone / reopenLast
    schemaRegistry.ts   document path → schema (also the path allow-list)
    logos.ts            parseLogoFilename / resolveLogo
  importers/
    report.ts           Report: collects error/warn/info, renders markdown
    logoManifest.ts     scans FBA Logos/ → LogoManifest
    txt/rosters.ts      parseRosterTxt for the 4 roster file formats
    txt/archives.ts     S78 results, FBA/D2 finals, MM/WC bracket champions
    sheets/xlsx.ts      downloadWorkbook, readTabs, cellText
    sheets/parsers.ts   FBA roster tab, D2 roster tab, calendar tab
    badges.ts           deterministic badge colors
    registry.ts         PlayerRegistry (ids + cross-league linking)
    assemble.ts         pure: parsed inputs → every output document
    run.ts              CLI: read sources, assemble, validate, write, report
    import-report.md    generated, committed
  server/
    storage.ts          validated atomic read/write, backups, locked refusal
    handler.ts          HTTP routes (/api/state/*, /logos/:folder/:season)
    main.ts             starts the server
  app/
    main.tsx, App.tsx, theme.css, api.ts, useTheme.ts
    shell/Layout.tsx, Sidebar.tsx, TopBar.tsx
    components/TeamMark.tsx, RosterTable.tsx, rosterColumns.ts, Placeholder.tsx
    pages/Home.tsx, CalendarPage.tsx, LeaguePage.tsx, TeamPage.tsx
  data/                 imported league save (committed)
```

---

### Task 1: Snapshot the Java programs

**Files:**
- Commit: all current changes under `FBA/`, `FBAJC/`, `FBAWC/`, and the untracked `FBA Logos/`

- [ ] **Step 1: Review what will be committed**

Run: `git status --short`
Expected: modified files under `FBA/`, `FBAJC/`, `FBAWC/`, untracked `FBA Logos/`, `FBAJC/Awards.txt`, `FBAJC/ConferencePreSeasonRankings.txt`, `FBAJC/NITStorage.txt`, `FBAJC/NamesNeeded.txt`, `FBAJC/PreSeasonRankingsHistory.txt`, `FBAJC/src/fbajc/NIT.java`. Nothing under `web/` yet.

- [ ] **Step 2: Commit the S78 state**

```bash
git add FBA FBAJC FBAWC "FBA Logos"
git commit -m "Finish S78 (FBA, FBAJC, FBAWC) and add team logos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Tag the snapshot**

```bash
git tag java-v1
git status --short
```
Expected: `git status --short` prints nothing (clean tree). `git tag` lists `java-v1`.

---

### Task 2: Scaffold `web/` and the shared data model

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/.gitignore`
- Create: `web/engine/shared/types.ts`, `leagues.ts`, `names.ts`, `calendar.ts`, `schemaRegistry.ts`
- Test: `web/engine/shared/types.test.ts`, `names.test.ts`, `calendar.test.ts`, `schemaRegistry.test.ts`

**Interfaces:**
- Produces (types.ts): zod schemas and same-named types `LeagueId`, `Position`, `ClassYear`, `Player`, `PlayersFile`, `Badge`, `Team`, `TeamsFile`, `RosterEntry`, `RostersFile`, `Champion`, `SummaryFile`, `GameResult`, `ResultsFile`, `CalendarStep`, `CalendarFile`, `MetaFile`, `LogoEntry`, `LogoManifest`.
- Produces: `LEAGUES: LeagueId[]`, `LEAGUE_LABEL: Record<LeagueId,string>`, `isLeagueId(x: string): x is LeagueId`, `groupLabel(league: LeagueId, code: string | null): string`
- Produces: `normalizeName(name: string): string`
- Produces: `currentStepIndex(cal: CalendarFile): number` (−1 when all done), `markCurrentDone(cal: CalendarFile): CalendarFile`, `reopenLast(cal: CalendarFile): CalendarFile`
- Produces: `schemaForPath(rel: string): z.ZodTypeAny | null`

- [ ] **Step 1: Create the package files**

`web/package.json`:
```json
{
  "name": "fba-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n server,app -c blue,red \"tsx watch server/main.ts\" \"vite\"",
    "server": "tsx server/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "import": "tsx importers/run.ts"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.4",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "concurrently": "^9.0.1",
    "exceljs": "^4.4.0",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["engine", "server", "importers", "app", "vite.config.ts"]
}
```

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5174',
      '/logos': 'http://127.0.0.1:5174',
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**'],
  },
});
```

`web/.gitignore`:
```
node_modules/
dist/
importers/.cache/
data/.backups/
```

- [ ] **Step 2: Install dependencies**

Run: `cd web && npm install`
Expected: completes with no `ERR!` lines; `web/package-lock.json` is created.

- [ ] **Step 3: Write the failing tests**

`web/engine/shared/types.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MetaFile, RostersFile } from './types';

describe('schemas', () => {
  it('accepts a valid roster document', () => {
    const doc = {
      league: 'fba', season: 79, locked: false,
      teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, contractEnd: 80, contractAmount: 8 }] },
    };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('accepts a vacant roster slot', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { CAR: [{ playerId: null, position: 'C', rating: null, age: null, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('rejects an unknown position', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { BOS: [{ playerId: 'p00001', position: 'G', rating: 95, age: 28, points: 0 }] } };
    expect(RostersFile.safeParse(doc).success).toBe(false);
  });

  it('requires every league in meta', () => {
    const doc = { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } };
    expect(MetaFile.safeParse(doc).success).toBe(false);
  });
});
```

`web/engine/shared/names.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeName } from './names';

describe('normalizeName', () => {
  it('ignores accents and case', () => {
    expect(normalizeName('Yasin Milovanović')).toBe(normalizeName('yasin milovanovic'));
  });
  it('collapses whitespace and keeps apostrophes', () => {
    expect(normalizeName("  Koa'e   Keano ")).toBe("koa'e keano");
  });
  it('treats punctuation as a space', () => {
    expect(normalizeName('Kenyon Rush Jr.')).toBe('kenyon rush jr');
  });
});
```

`web/engine/shared/calendar.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { currentStepIndex, markCurrentDone, reopenLast } from './calendar';
import type { CalendarFile } from './types';

const cal = (done: boolean[]): CalendarFile => ({
  season: 79,
  steps: done.map((d, i) => ({ id: `s${i}`, label: `Step ${i}`, kind: 'offseason', league: null, sub: false, done: d })),
});

describe('calendar helpers', () => {
  it('finds the first unfinished step', () => {
    expect(currentStepIndex(cal([true, false, false]))).toBe(1);
  });
  it('returns -1 when everything is done', () => {
    expect(currentStepIndex(cal([true, true]))).toBe(-1);
  });
  it('marks only the current step done', () => {
    expect(markCurrentDone(cal([true, false, false])).steps.map(s => s.done)).toEqual([true, true, false]);
  });
  it('reopens the most recently finished step', () => {
    expect(reopenLast(cal([true, true, false])).steps.map(s => s.done)).toEqual([true, false, false]);
  });
  it('does not mutate its input', () => {
    const c = cal([false]);
    markCurrentDone(c);
    expect(c.steps[0].done).toBe(false);
  });
});
```

`web/engine/shared/schemaRegistry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { schemaForPath } from './schemaRegistry';

describe('schemaForPath', () => {
  it.each([
    'players.json', 'meta.json', 'calendar.json', 'logos/manifest.json',
    'leagues/fba/teams.json', 'leagues/fbajc/S78/rosters.json',
    'leagues/fbad2/S78/summary.json', 'leagues/fba/S78/results.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each([
    '../secrets.json', 'leagues/nba/teams.json', 'leagues/fba/S78/../../x.json',
    'leagues/fba/78/rosters.json', 'players.json/extra', '',
  ])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd web && npx vitest run engine/shared`
Expected: FAIL. Each file reports it cannot resolve `./types`, `./names`, `./calendar`, or `./schemaRegistry`.

- [ ] **Step 5: Implement the shared modules**

`web/engine/shared/types.ts`:
```ts
import { z } from 'zod';

const int = z.number().int();

export const LeagueId = z.enum(['fba', 'fbad2', 'fbajc', 'fbawc']);
export type LeagueId = z.infer<typeof LeagueId>;

const perLeague = <T extends z.ZodTypeAny>(s: T) => z.object({ fba: s, fbad2: s, fbajc: s, fbawc: s });

export const Position = z.enum(['PG', 'SG', 'SF', 'PF', 'C']);
export type Position = z.infer<typeof Position>;

export const ClassYear = z.enum(['Fr', 'So', 'Jr', 'Sr']);
export type ClassYear = z.infer<typeof ClassYear>;

export const Player = z.object({
  id: z.string().regex(/^p\d{5}$/),
  name: z.string().min(1).nullable(),
  birthSeason: int.nullable(),
});
export type Player = z.infer<typeof Player>;

export const PlayersFile = z.object({ nextId: int.positive(), players: z.record(z.string(), Player) });
export type PlayersFile = z.infer<typeof PlayersFile>;

export const Badge = z.object({ bg: z.string(), fg: z.string() });
export type Badge = z.infer<typeof Badge>;

export const Team = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  abbr: z.string().min(1),
  group: z.string().nullable(),
  logoFolder: z.string().nullable(),
  badge: Badge,
});
export type Team = z.infer<typeof Team>;

export const TeamsFile = z.object({ league: LeagueId, teams: z.array(Team) });
export type TeamsFile = z.infer<typeof TeamsFile>;

export const RosterEntry = z.object({
  playerId: z.string().nullable(),
  position: Position,
  rating: int.nullable(),
  age: int.nullable(),
  points: int,
  contractEnd: int.nullable().optional(),
  contractAmount: z.number().nullable().optional(),
  stars: int.nullable().optional(),
  classYear: ClassYear.nullable().optional(),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

export const RostersFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  teams: z.record(z.string(), z.array(RosterEntry)),
});
export type RostersFile = z.infer<typeof RostersFile>;

export const Champion = z.object({
  title: z.string(),
  champion: z.string(),
  runnerUp: z.string().nullable(),
  score: z.string().nullable(),
});
export type Champion = z.infer<typeof Champion>;

export const SummaryFile = z.object({
  league: LeagueId,
  season: int,
  locked: z.boolean(),
  host: z.string().nullable(),
  champions: z.array(Champion),
});
export type SummaryFile = z.infer<typeof SummaryFile>;

export const GameResult = z.object({
  gameNo: int.positive(),
  home: z.string(),
  away: z.string(),
  homePts: int.nonnegative(),
  awayPts: int.nonnegative(),
});
export type GameResult = z.infer<typeof GameResult>;

export const ResultsFile = z.object({ league: LeagueId, season: int, locked: z.boolean(), games: z.array(GameResult) });
export type ResultsFile = z.infer<typeof ResultsFile>;

export const CalendarStep = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['offseason', 'league']),
  league: LeagueId.nullable(),
  sub: z.boolean(),
  done: z.boolean(),
});
export type CalendarStep = z.infer<typeof CalendarStep>;

export const CalendarFile = z.object({ season: int, steps: z.array(CalendarStep) });
export type CalendarFile = z.infer<typeof CalendarFile>;

export const MetaFile = z.object({ currentSeason: int, rosterSeason: perLeague(int), lastSeason: perLeague(int) });
export type MetaFile = z.infer<typeof MetaFile>;

export const LogoEntry = z.object({ file: z.string(), from: int.nullable(), to: int.nullable(), variant: int });
export type LogoEntry = z.infer<typeof LogoEntry>;

export const LogoManifest = z.object({ folders: z.record(z.string(), z.array(LogoEntry)) });
export type LogoManifest = z.infer<typeof LogoManifest>;
```

`web/engine/shared/leagues.ts`:
```ts
import type { LeagueId } from './types';

export const LEAGUES: LeagueId[] = ['fba', 'fbad2', 'fbajc', 'fbawc'];

export const LEAGUE_LABEL: Record<LeagueId, string> = {
  fba: 'FBA',
  fbad2: 'FBAD2',
  fbajc: 'FBAJC',
  fbawc: 'World Cup',
};

const GROUP_LABEL: Record<LeagueId, Record<string, string>> = {
  fba: { E: 'Eastern Conference', W: 'Western Conference' },
  fbad2: { PL: 'Premier League', WL: 'World League', UL: 'United League', IL: 'International League' },
  fbajc: {
    B12: 'Big 12', ACC: 'ACC', BE: 'Big East', SEC: 'SEC', B10: 'Big Ten', AAC: 'American',
    P12: 'PAC-12', A10: 'Atlantic 10', PAT: 'Patriot', COL: 'Colonial', HOR: 'Horizon', IVY: 'Ivy',
    SOCON: 'Southern', SUN: 'Sun Belt', SKY: 'Big Sky', MWC: 'Mountain West', OVC: 'Ohio Valley', NEC: 'NEC',
  },
  fbawc: {},
};

export function isLeagueId(x: string): x is LeagueId {
  return (LEAGUES as string[]).includes(x);
}

export function groupLabel(league: LeagueId, code: string | null): string {
  if (code === null) return 'Teams';
  return GROUP_LABEL[league][code] ?? code;
}
```

`web/engine/shared/names.ts`:
```ts
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

`web/engine/shared/calendar.ts`:
```ts
import type { CalendarFile } from './types';

export function currentStepIndex(cal: CalendarFile): number {
  return cal.steps.findIndex(s => !s.done);
}

export function markCurrentDone(cal: CalendarFile): CalendarFile {
  const i = currentStepIndex(cal);
  if (i < 0) return cal;
  return { ...cal, steps: cal.steps.map((s, j) => (j === i ? { ...s, done: true } : s)) };
}

export function reopenLast(cal: CalendarFile): CalendarFile {
  const i = currentStepIndex(cal);
  const last = (i < 0 ? cal.steps.length : i) - 1;
  if (last < 0) return cal;
  return { ...cal, steps: cal.steps.map((s, j) => (j === last ? { ...s, done: false } : s)) };
}
```

`web/engine/shared/schemaRegistry.ts`:
```ts
import type { z } from 'zod';
import {
  CalendarFile, LogoManifest, MetaFile, PlayersFile, ResultsFile, RostersFile, SummaryFile, TeamsFile,
} from './types';

const L = '(fba|fbad2|fbajc|fbawc)';

const RULES: [RegExp, z.ZodTypeAny][] = [
  [/^players\.json$/, PlayersFile],
  [/^meta\.json$/, MetaFile],
  [/^calendar\.json$/, CalendarFile],
  [/^logos\/manifest\.json$/, LogoManifest],
  [new RegExp(`^leagues/${L}/teams\\.json$`), TeamsFile],
  [new RegExp(`^leagues/${L}/S\\d+/rosters\\.json$`), RostersFile],
  [new RegExp(`^leagues/${L}/S\\d+/summary\\.json$`), SummaryFile],
  [new RegExp(`^leagues/${L}/S\\d+/results\\.json$`), ResultsFile],
];

export function schemaForPath(rel: string): z.ZodTypeAny | null {
  for (const [re, schema] of RULES) if (re.test(rel)) return schema;
  return null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && npx vitest run engine/shared`
Expected: PASS, 4 files, 0 failures.

- [ ] **Step 7: Typecheck and commit**

Run: `cd web && npx tsc --noEmit`
Expected: no output (success).

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/.gitignore web/engine
git commit -m "web: scaffold package and shared data model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Logo eras, manifest builder, and the import report

**Files:**
- Create: `web/engine/shared/logos.ts`, `web/importers/report.ts`, `web/importers/logoManifest.ts`
- Test: `web/engine/shared/logos.test.ts`, `web/importers/report.test.ts`, `web/importers/logoManifest.test.ts`

**Interfaces:**
- Consumes: `LogoEntry`, `LogoManifest` from `engine/shared/types.ts`
- Produces: `parseLogoFilename(file: string): LogoEntry | null`, `resolveLogo(entries: LogoEntry[], folder: string, season: number): string | null`
- Produces: `class Report { entries: ReportEntry[]; error(topic,msg); warn(topic,msg); info(topic,msg); hasErrors: boolean; count(level): number; toMarkdown(title: string): string }`, `type Level = 'error' | 'warn' | 'info'`
- Produces: `buildLogoManifest(logoRoot: string, report: Report): LogoManifest`

- [ ] **Step 1: Write the failing tests**

`web/engine/shared/logos.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseLogoFilename, resolveLogo } from './logos';
import type { LogoEntry } from './types';

describe('parseLogoFilename', () => {
  it('parses an open-ended era', () => {
    expect(parseLogoFilename('Atlanta Venom S75-pres..png')).toEqual({ file: 'Atlanta Venom S75-pres..png', from: 75, to: null, variant: 0 });
  });
  it('parses a closed era', () => {
    expect(parseLogoFilename('DCB S44-S78.png')).toMatchObject({ from: 44, to: 78 });
  });
  it('parses a single season', () => {
    expect(parseLogoFilename('Seattle Shock S77.png')).toMatchObject({ from: 77, to: 77 });
  });
  it('treats a name without an era as undated', () => {
    expect(parseLogoFilename('Texas Outlaws.png')).toMatchObject({ from: null, to: null, variant: 1 });
  });
  it('reads a trailing number as a variant', () => {
    expect(parseLogoFilename('Vegas Volts 5.png')).toMatchObject({ from: null, variant: 5 });
  });
  it('ignores non-png files', () => {
    expect(parseLogoFilename('Boston Bucks concept.webp')).toBeNull();
  });
});

const e = (file: string): LogoEntry => parseLogoFilename(file)!;

describe('resolveLogo', () => {
  const dcb = [e('DCB S1-S43.png'), e('DCB S44-S78.png'), e('DCB S79-pres..png')];
  it('picks the era covering the season', () => {
    expect(resolveLogo(dcb, 'DCB', 50)).toBe('DCB S44-S78.png');
    expect(resolveLogo(dcb, 'DCB', 79)).toBe('DCB S79-pres..png');
    expect(resolveLogo(dcb, 'DCB', 200)).toBe('DCB S79-pres..png');
  });
  it('falls back to the nearest era when none covers the season', () => {
    expect(resolveLogo([e('Philly Phantoms S80-pres..png')], 'Philly Phantoms', 79)).toBe('Philly Phantoms S80-pres..png');
  });
  it('prefers the highest-numbered undated variant', () => {
    const volts = [e('Vegas Volts 3.png'), e('Vegas Volts 5.png'), e('Vegas Volts 4.png')];
    expect(resolveLogo(volts, 'Vegas Volts', 79)).toBe('Vegas Volts 5.png');
  });
  it('breaks undated ties toward the folder name', () => {
    const orcas = [e('Vancouver Vikings.png'), e('Vancouver Orcas.png')];
    expect(resolveLogo(orcas, 'Vancouver Orcas', 79)).toBe('Vancouver Orcas.png');
  });
  it('returns null for an empty folder', () => {
    expect(resolveLogo([], 'X', 79)).toBeNull();
  });
});
```

`web/importers/report.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Report } from './report';

describe('Report', () => {
  it('tracks errors', () => {
    const r = new Report();
    r.info('a', 'x');
    expect(r.hasErrors).toBe(false);
    r.error('b', 'y');
    expect(r.hasErrors).toBe(true);
    expect(r.count('error')).toBe(1);
  });
  it('renders grouped markdown', () => {
    const r = new Report();
    r.error('rosters', 'missing team');
    r.warn('logos', 'undated');
    r.info('logos', 'skipped');
    const md = r.toMarkdown('Import report');
    expect(md).toContain('# Import report');
    expect(md).toContain('Errors: 1 · Warnings: 1 · Info: 1');
    expect(md).toContain('## Errors\n\n### rosters\n\n- missing team');
    expect(md.indexOf('## Errors')).toBeLessThan(md.indexOf('## Warnings'));
  });
});
```

`web/importers/logoManifest.test.ts`:
```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'logos-'));
  mkdirSync(path.join(root, 'DCB', 'Concepts'), { recursive: true });
  writeFileSync(path.join(root, 'DCB', 'DCB S44-S78.png'), 'x');
  writeFileSync(path.join(root, 'DCB', 'DCB S79-pres..png'), 'x');
  writeFileSync(path.join(root, 'DCB', 'Concepts', 'DCB concept.png'), 'x');
  mkdirSync(path.join(root, 'Texas Outlaws'));
  writeFileSync(path.join(root, 'Texas Outlaws', 'Texas Outlaws.png'), 'x');
  writeFileSync(path.join(root, 'Texas Outlaws', 'notes.txt'), 'x');
  return root;
}

describe('buildLogoManifest', () => {
  it('lists png files per folder and skips subfolders', () => {
    const m = buildLogoManifest(fixture(), new Report());
    expect(m.folders['DCB'].map(e => e.file)).toEqual(['DCB S44-S78.png', 'DCB S79-pres..png']);
    expect(m.folders['Texas Outlaws'].map(e => e.file)).toEqual(['Texas Outlaws.png']);
  });
  it('warns about undated logos', () => {
    const report = new Report();
    buildLogoManifest(fixture(), report);
    expect(report.entries.some(x => x.level === 'warn' && x.message.includes('Texas Outlaws/Texas Outlaws.png'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run engine/shared/logos importers/report importers/logoManifest`
Expected: FAIL with module-not-found for `./logos`, `./report`, and `./logoManifest`.

- [ ] **Step 3: Implement**

`web/engine/shared/logos.ts`:
```ts
import type { LogoEntry } from './types';

const ERA = /\sS(\d+)(?:-(?:S(\d+)|pres))?$/i;

export function parseLogoFilename(file: string): LogoEntry | null {
  if (!/\.png$/i.test(file)) return null;
  const base = file.replace(/\.png$/i, '').replace(/\.+$/, '').trim();
  const m = base.match(ERA);
  if (m) {
    const from = Number(m[1]);
    const to = /-pres$/i.test(base) ? null : m[2] ? Number(m[2]) : from;
    return { file, from, to, variant: 0 };
  }
  const v = base.match(/\s(\d+)$/);
  return { file, from: null, to: null, variant: v ? Number(v[1]) : 1 };
}

export function resolveLogo(entries: LogoEntry[], folder: string, season: number): string | null {
  const dated = entries.filter(e => e.from !== null);
  const covering = dated.filter(e => e.from! <= season && (e.to === null || season <= e.to));
  if (covering.length) return [...covering].sort((a, b) => b.from! - a.from!)[0].file;

  const undated = entries.filter(e => e.from === null);
  if (undated.length) {
    const byFolder = (e: LogoEntry) => (e.file.startsWith(folder) ? 1 : 0);
    return [...undated].sort((a, b) => b.variant - a.variant || byFolder(b) - byFolder(a) || a.file.localeCompare(b.file))[0].file;
  }

  if (!dated.length) return null;
  const distance = (e: LogoEntry) => (season < e.from! ? e.from! - season : season - (e.to ?? season));
  return [...dated].sort((a, b) => distance(a) - distance(b) || b.from! - a.from!)[0].file;
}
```

`web/importers/report.ts`:
```ts
export type Level = 'error' | 'warn' | 'info';

export interface ReportEntry {
  level: Level;
  topic: string;
  message: string;
}

const HEADINGS: Record<Level, string> = { error: 'Errors', warn: 'Warnings', info: 'Info' };

export class Report {
  readonly entries: ReportEntry[] = [];

  error(topic: string, message: string): void { this.entries.push({ level: 'error', topic, message }); }
  warn(topic: string, message: string): void { this.entries.push({ level: 'warn', topic, message }); }
  info(topic: string, message: string): void { this.entries.push({ level: 'info', topic, message }); }

  get hasErrors(): boolean {
    return this.entries.some(e => e.level === 'error');
  }

  count(level: Level): number {
    return this.entries.filter(e => e.level === level).length;
  }

  toMarkdown(title: string): string {
    const out = [`# ${title}`, '', `Errors: ${this.count('error')} · Warnings: ${this.count('warn')} · Info: ${this.count('info')}`];
    for (const level of ['error', 'warn', 'info'] as Level[]) {
      const items = this.entries.filter(e => e.level === level);
      if (!items.length) continue;
      out.push('', `## ${HEADINGS[level]}`);
      const topics = [...new Set(items.map(e => e.topic))];
      for (const topic of topics) {
        out.push('', `### ${topic}`, '');
        for (const e of items.filter(x => x.topic === topic)) out.push(`- ${e.message}`);
      }
    }
    return out.join('\n') + '\n';
  }
}
```

`web/importers/logoManifest.ts`:
```ts
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLogoFilename } from '../engine/shared/logos';
import type { LogoEntry, LogoManifest } from '../engine/shared/types';
import type { Report } from './report';

export function buildLogoManifest(logoRoot: string, report: Report): LogoManifest {
  const folders: Record<string, LogoEntry[]> = {};
  for (const dir of readdirSync(logoRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const entries: LogoEntry[] = [];
    for (const f of readdirSync(path.join(logoRoot, dir.name), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const parsed = parseLogoFilename(f.name);
      if (!parsed) {
        report.info('logos', `Skipped non-PNG file ${dir.name}/${f.name}`);
        continue;
      }
      if (parsed.from === null && dir.name !== 'FBA') {
        report.warn('logos', `Undated logo ${dir.name}/${f.name}: add an era such as "S60-S70" or "S79-pres." to the filename for season-accurate logos`);
      }
      entries.push(parsed);
    }
    folders[dir.name] = entries.sort((a, b) => a.file.localeCompare(b.file));
  }
  return { folders };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run engine/shared/logos importers/report importers/logoManifest`
Expected: PASS, 3 files.

- [ ] **Step 5: Commit**

```bash
git add web/engine/shared/logos.ts web/engine/shared/logos.test.ts web/importers/report.ts web/importers/report.test.ts web/importers/logoManifest.ts web/importers/logoManifest.test.ts
git commit -m "web: logo era parsing, manifest builder, import report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Roster `.txt` parsers

**Files:**
- Create: `web/importers/txt/rosters.ts`
- Test: `web/importers/txt/rosters.test.ts`

**Interfaces:**
- Consumes: `Position`, `ClassYear` types
- Produces:
  ```ts
  type RosterFormat = 'fba' | 'fbad2' | 'fbajc' | 'fbawc';
  interface TxtPlayer { name: string | null; position: Position; age: number | null; rating: number; points: number;
    contractLen: number | null; cost: number | null; stars: number | null; classYear: ClassYear | null }
  interface TxtTeam { name: string; abbr: string; group: string | null; players: TxtPlayer[] }
  function parseRosterTxt(text: string, format: RosterFormat): TxtTeam[]
  ```

The four formats (fields separated by `/`; `X` means unknown or unnamed):

| Format | Team header | Player line |
|---|---|---|
| fba | name/abbr/conf | name/pos/age/contractLen/cost/rating/points |
| fbad2 | name/abbr/league | name/pos/age/rating/points |
| fbajc | name/abbr/conf | name/pos/stars(`4*` or `X`)/class/rating/points |
| fbawc | name/abbr | name/pos/age/rating |

Every file starts with the team count, and each team header is followed by a player-count line.

- [ ] **Step 1: Write the failing tests**

`web/importers/txt/rosters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseRosterTxt } from './rosters';

describe('parseRosterTxt', () => {
  it('parses the FBA format', () => {
    const text = '1\r\nBoston Bucks/BOS/E\r\n2\r\nGabriel Greenwood/PG/27/3/8/96/2980\r\nX/SG/X/X/X/60/0\r\n';
    const [t] = parseRosterTxt(text, 'fba');
    expect(t).toMatchObject({ name: 'Boston Bucks', abbr: 'BOS', group: 'E' });
    expect(t.players[0]).toEqual({
      name: 'Gabriel Greenwood', position: 'PG', age: 27, rating: 96, points: 2980,
      contractLen: 3, cost: 8, stars: null, classYear: null,
    });
    expect(t.players[1]).toMatchObject({ name: null, age: null, contractLen: null, rating: 60 });
  });

  it('parses the D2 format', () => {
    const [t] = parseRosterTxt('1\nAuckland/ACK/IL\n1\nRickie Carver/PG/27/66/158\n', 'fbad2');
    expect(t.group).toBe('IL');
    expect(t.players[0]).toMatchObject({ name: 'Rickie Carver', age: 27, rating: 66, points: 158 });
  });

  it('parses the JC format with stars and class', () => {
    const [t] = parseRosterTxt('1\nBaylor/BAY/B12\n2\nJake Hollister/PG/4*/Fr/82/676\nX/SG/X/So/63/221\n', 'fbajc');
    expect(t.players[0]).toMatchObject({ stars: 4, classYear: 'Fr', rating: 82, points: 676, age: null });
    expect(t.players[1]).toMatchObject({ name: null, stars: null, classYear: 'So' });
  });

  it('parses the World Cup format with no group', () => {
    const [t] = parseRosterTxt('1\nAlgeria/ALG\n1\nX/PG/32/67\n', 'fbawc');
    expect(t).toMatchObject({ name: 'Algeria', abbr: 'ALG', group: null });
    expect(t.players[0]).toMatchObject({ name: null, age: 32, rating: 67, points: 0 });
  });

  it('upper-cases abbreviations and strips a BOM', () => {
    const [t] = parseRosterTxt('﻿1\nDuke/duke/ACC\n0\n', 'fbajc');
    expect(t.abbr).toBe('DUKE');
  });

  it('rejects a bad position', () => {
    expect(() => parseRosterTxt('1\nA/A/E\n1\nBob/G/20/1/1/70/0\n', 'fba')).toThrow(/position/);
  });

  it('rejects a wrong field count', () => {
    expect(() => parseRosterTxt('1\nA/A/E\n1\nBob/PG/20/70\n', 'fba')).toThrow(/fields/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run importers/txt/rosters`
Expected: FAIL, cannot resolve `./rosters`.

- [ ] **Step 3: Implement**

`web/importers/txt/rosters.ts`:
```ts
import type { ClassYear, Position } from '../../engine/shared/types';

export type RosterFormat = 'fba' | 'fbad2' | 'fbajc' | 'fbawc';

export interface TxtPlayer {
  name: string | null;
  position: Position;
  age: number | null;
  rating: number;
  points: number;
  contractLen: number | null;
  cost: number | null;
  stars: number | null;
  classYear: ClassYear | null;
}

export interface TxtTeam {
  name: string;
  abbr: string;
  group: string | null;
  players: TxtPlayer[];
}

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const CLASSES = new Set(['Fr', 'So', 'Jr', 'Sr']);
const FIELD_COUNT: Record<RosterFormat, number> = { fba: 7, fbad2: 5, fbajc: 6, fbawc: 4 };

function optNum(s: string, line: string): number | null {
  if (s === 'X' || s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Expected a number but got "${s}" in "${line}"`);
  return n;
}

function reqNum(s: string, line: string): number {
  const n = optNum(s, line);
  if (n === null) throw new Error(`Missing required number in "${line}"`);
  return n;
}

function parsePlayer(line: string, format: RosterFormat): TxtPlayer {
  const f = line.split('/');
  if (f.length !== FIELD_COUNT[format]) {
    throw new Error(`Expected ${FIELD_COUNT[format]} fields for ${format} but got ${f.length} in "${line}"`);
  }
  if (!POSITIONS.has(f[1])) throw new Error(`Unknown position "${f[1]}" in "${line}"`);
  const p: TxtPlayer = {
    name: f[0] === 'X' ? null : f[0],
    position: f[1] as Position,
    age: null, rating: 0, points: 0, contractLen: null, cost: null, stars: null, classYear: null,
  };
  switch (format) {
    case 'fba':
      p.age = optNum(f[2], line);
      p.contractLen = optNum(f[3], line);
      p.cost = optNum(f[4], line);
      p.rating = reqNum(f[5], line);
      p.points = reqNum(f[6], line);
      break;
    case 'fbad2':
      p.age = optNum(f[2], line);
      p.rating = reqNum(f[3], line);
      p.points = reqNum(f[4], line);
      break;
    case 'fbajc': {
      const stars = f[2].match(/^(\d)\*$/);
      p.stars = stars ? Number(stars[1]) : null;
      if (!CLASSES.has(f[3])) throw new Error(`Unknown class year "${f[3]}" in "${line}"`);
      p.classYear = f[3] as ClassYear;
      p.rating = reqNum(f[4], line);
      p.points = reqNum(f[5], line);
      break;
    }
    case 'fbawc':
      p.age = optNum(f[2], line);
      p.rating = reqNum(f[3], line);
      break;
  }
  return p;
}

export function parseRosterTxt(text: string, format: RosterFormat): TxtTeam[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  let i = 0;
  const count = Number(lines[i++]);
  if (!Number.isInteger(count)) throw new Error(`Expected a team count on line 1 but got "${lines[0]}"`);
  const teams: TxtTeam[] = [];
  for (let t = 0; t < count; t++) {
    const headerLine = lines[i++];
    const header = headerLine?.split('/');
    if (!header || header.length < 2) throw new Error(`Bad team header for team ${t + 1}: "${headerLine}"`);
    const n = Number(lines[i++]);
    if (!Number.isInteger(n)) throw new Error(`Expected a player count after "${headerLine}"`);
    const players: TxtPlayer[] = [];
    for (let p = 0; p < n; p++) players.push(parsePlayer(lines[i++], format));
    teams.push({ name: header[0], abbr: header[1].toUpperCase(), group: header[2] ?? null, players });
  }
  return teams;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run importers/txt/rosters`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/importers/txt/rosters.ts web/importers/txt/rosters.test.ts
git commit -m "web: parse the four roster .txt formats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Season archive `.txt` parsers

**Files:**
- Create: `web/importers/txt/archives.ts`
- Test: `web/importers/txt/archives.test.ts`

**Interfaces:**
- Consumes: `Champion` type
- Produces:
  ```ts
  interface RawResult { gameNo: number; home: string; homePts: number; away: string; awayPts: number }
  interface Series { a: string; aWins: number; b: string; bWins: number }
  interface BracketOutcome { champion: string | null; runnerUp: string | null; host: string | null }
  function parseFbaResults(text: string): RawResult[]
  function parseSeriesLine(line: string): Series | null
  function parseFbaPlayoffs(text: string): Champion | null        // title 'FBA Champion'
  function parseD2Playoffs(text: string): Champion[]              // title '<League> Champion'
  function parseBracketFile(text: string): BracketOutcome         // MMBrackets.txt (JC and WC)
  ```

- [ ] **Step 1: Write the failing tests**

`web/importers/txt/archives.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseBracketFile, parseD2Playoffs, parseFbaPlayoffs, parseFbaResults, parseSeriesLine } from './archives';

describe('parseFbaResults', () => {
  it('parses game lines', () => {
    expect(parseFbaResults('1,Oakland All-Stars,79,Maine Wildcats,88\n2,DCB,82,Seattle Shock,105')).toEqual([
      { gameNo: 1, home: 'Oakland All-Stars', homePts: 79, away: 'Maine Wildcats', awayPts: 88 },
      { gameNo: 2, home: 'DCB', homePts: 82, away: 'Seattle Shock', awayPts: 105 },
    ]);
  });
  it('rejects malformed lines', () => {
    expect(() => parseFbaResults('1,Oakland,79')).toThrow(/Results line/);
  });
});

describe('parseSeriesLine', () => {
  it('handles hyphenated team names', () => {
    expect(parseSeriesLine('4-Oakland All-Stars vs Honolulu Rays-2')).toEqual({ a: 'Oakland All-Stars', aWins: 4, b: 'Honolulu Rays', bWins: 2 });
    expect(parseSeriesLine('1-Honolulu Rays vs Oakland All-Stars-4')).toEqual({ a: 'Honolulu Rays', aWins: 1, b: 'Oakland All-Stars', bWins: 4 });
  });
  it('returns null for other lines', () => {
    expect(parseSeriesLine('-Eastern-')).toBeNull();
  });
});

describe('parseFbaPlayoffs', () => {
  it('reads the finals winner', () => {
    const text = '--Conference Finals--\n-Eastern-\n4-Boston Bucks vs Cincinnati Blue Stripes-0\n\n--FBA Finals--\n4-Boston Bucks vs Memphis Blues-1\n\n\nNext Games:\n';
    expect(parseFbaPlayoffs(text)).toEqual({ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' });
  });
  it('handles the second team winning', () => {
    expect(parseFbaPlayoffs('--FBA Finals--\n2-Boston Bucks vs Memphis Blues-4')?.champion).toBe('Memphis Blues');
  });
  it('returns null for an unfinished finals', () => {
    expect(parseFbaPlayoffs('--FBA Finals--\n3-Boston Bucks vs Memphis Blues-2')).toBeNull();
  });
});

describe('parseD2Playoffs', () => {
  it('reads each league final', () => {
    const text = '--League Semi-Finals--\n-Premier League-\n4-Salzburg vs London-2\n\n--League Finals--\n-Premier League-\n4-Salzburg vs Zurich-1\n-International League-\n3-Naples vs Barcelona-4\n\n\nNext Games:\n';
    expect(parseD2Playoffs(text)).toEqual([
      { title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' },
      { title: 'International League Champion', champion: 'Barcelona', runnerUp: 'Naples', score: '4-3' },
    ]);
  });
});

describe('parseBracketFile', () => {
  it('reads a World Cup bracket with host', () => {
    const text = '     --S78 World Cup Croatia--\n--Region 1--\n   --National Championship--\n(2)Italy vs (1)Germany\n   --Champions--\nGermany\n';
    expect(parseBracketFile(text)).toEqual({ champion: 'Germany', runnerUp: 'Italy', host: 'Croatia' });
  });
  it('reads a March Madness bracket without host', () => {
    const text = '  --S78 March Madness--\n   --National Championship--\n(3)North Carolina vs (3)Syracuse\n   --Champions--\nNorth Carolina\n';
    expect(parseBracketFile(text)).toEqual({ champion: 'North Carolina', runnerUp: 'Syracuse', host: null });
  });
  it('returns nulls for an unfinished bracket', () => {
    expect(parseBracketFile('--S79 March Madness--\n--Region 1--\n')).toEqual({ champion: null, runnerUp: null, host: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run importers/txt/archives`
Expected: FAIL, cannot resolve `./archives`.

- [ ] **Step 3: Implement**

`web/importers/txt/archives.ts`:
```ts
import type { Champion } from '../../engine/shared/types';

export interface RawResult {
  gameNo: number;
  home: string;
  homePts: number;
  away: string;
  awayPts: number;
}

export interface Series {
  a: string;
  aWins: number;
  b: string;
  bWins: number;
}

export interface BracketOutcome {
  champion: string | null;
  runnerUp: string | null;
  host: string | null;
}

const trimmedLines = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim());

export function parseFbaResults(text: string): RawResult[] {
  return trimmedLines(text)
    .filter(l => l.length > 0)
    .map(line => {
      const f = line.split(',');
      const nums = [f[0], f[2], f[4]].map(Number);
      if (f.length !== 5 || nums.some(n => !Number.isInteger(n))) throw new Error(`Results line is malformed: "${line}"`);
      return { gameNo: nums[0], home: f[1], homePts: nums[1], away: f[3], awayPts: nums[2] };
    });
}

export function parseSeriesLine(line: string): Series | null {
  const m = line.trim().match(/^(\d+)-(.+?) vs (.+)-(\d+)$/);
  if (!m) return null;
  return { a: m[2], aWins: Number(m[1]), b: m[3], bWins: Number(m[4]) };
}

function seriesChampion(title: string, s: Series, winsNeeded: number): Champion | null {
  if (s.aWins >= winsNeeded) return { title, champion: s.a, runnerUp: s.b, score: `${s.aWins}-${s.bWins}` };
  if (s.bWins >= winsNeeded) return { title, champion: s.b, runnerUp: s.a, score: `${s.bWins}-${s.aWins}` };
  return null;
}

export function parseFbaPlayoffs(text: string): Champion | null {
  const lines = trimmedLines(text);
  const i = lines.indexOf('--FBA Finals--');
  if (i < 0) return null;
  const s = parseSeriesLine(lines[i + 1] ?? '');
  return s ? seriesChampion('FBA Champion', s, 4) : null;
}

export function parseD2Playoffs(text: string): Champion[] {
  const lines = trimmedLines(text);
  const start = lines.indexOf('--League Finals--');
  if (start < 0) return [];
  const out: Champion[] = [];
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.startsWith('--') || l.startsWith('Next Games')) break;
    if (/^-[^-].*-$/.test(l)) {
      const s = parseSeriesLine(lines[j + 1] ?? '');
      const c = s ? seriesChampion(`${l.slice(1, -1)} Champion`, s, 4) : null;
      if (c) out.push(c);
      j++;
    }
  }
  return out;
}

export function parseBracketFile(text: string): BracketOutcome {
  const lines = trimmedLines(text);
  let host: string | null = null;
  for (const l of lines) {
    const m = l.match(/^--S\d+ World Cup (.+)--$/);
    if (m) { host = m[1]; break; }
  }
  const ci = lines.indexOf('--Champions--');
  const champion = ci >= 0 ? lines.slice(ci + 1).find(l => l.length > 0) ?? null : null;
  let runnerUp: string | null = null;
  const ni = lines.indexOf('--National Championship--');
  if (ni >= 0 && champion) {
    const m = (lines[ni + 1] ?? '').match(/^\(\d+\)(.+?) vs \(\d+\)(.+)$/);
    if (m) runnerUp = m[1] === champion ? m[2] : m[2] === champion ? m[1] : null;
  }
  return { champion, runnerUp, host };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run importers/txt/archives`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/importers/txt/archives.ts web/importers/txt/archives.test.ts
git commit -m "web: parse S78 results, finals, and bracket champions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Google Sheets reading and tab parsers

**Files:**
- Create: `web/importers/sheets/xlsx.ts`, `web/importers/sheets/parsers.ts`
- Test: `web/importers/sheets/xlsx.test.ts`, `web/importers/sheets/parsers.test.ts`

**Interfaces:**
- Produces (xlsx.ts): `downloadWorkbook(sheetId: string, cacheDir: string): Promise<string>` (path to cached .xlsx), `readTabs(file: string, tabs: string[]): Promise<Record<string, string[][]>>`, `cellText(v: unknown): string`
- Produces (parsers.ts):
  ```ts
  interface SheetPlayer { name: string | null; position: Position; age: number | null; rating: number | null;
    contractEnd: number | null; contractAmount: number | null }
  interface SheetTeam { name: string; country: string | null; players: SheetPlayer[] }
  interface ParsedCalendarStep { label: string; sub: boolean }
  interface ParsedCalendar { season: number; steps: ParsedCalendarStep[]; hereIndex: number }
  function parseFbaRosterTab(rows: string[][]): SheetTeam[]
  function parseD2RosterTab(rows: string[][]): SheetTeam[]
  function parseCalendarTab(rows: string[][]): ParsedCalendar
  ```

Tab layouts (0-based columns, observed in the real sheets):
- **"FBA Rosters":** col 2 is a team name or `(PG)`…`(C)`; player rows have name in col 4, age col 5, rating col 6, contract end `S81` col 7, amount col 8. `X` marks a vacant slot. Header rows contain `Position/Team` or are blank in col 2.
- **"FBA D2 Rosters":** col 0 is `Amsterdam(Netherlands)` or `(PG)`; player rows have name col 1, age col 2, rating col 3.
- **"FBA Calender":** col 0 is `S79` (a season header), `*` (a sub-step), or a step number; col 1 is the label; col 2 contains `*Here*` on the current step. A label of `none` means no event that season and is skipped.

- [ ] **Step 1: Write the failing tests**

`web/importers/sheets/xlsx.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cellText } from './xlsx';

describe('cellText', () => {
  it('stringifies plain values', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(84)).toBe('84');
    expect(cellText('  Boston Bucks ')).toBe('Boston Bucks');
  });
  it('unwraps rich text, formulas, and hyperlinks', () => {
    expect(cellText({ richText: [{ text: 'Free ' }, { text: 'Agency' }] })).toBe('Free Agency');
    expect(cellText({ formula: 'SUM(A1:A5)', result: 23 })).toBe('23');
    expect(cellText({ formula: 'SUM(A1:A5)' })).toBe('');
    expect(cellText({ text: 'link', hyperlink: 'http://x' })).toBe('link');
    expect(cellText({ error: '#REF!' })).toBe('');
  });
});
```

`web/importers/sheets/parsers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseCalendarTab, parseD2RosterTab, parseFbaRosterTab } from './parsers';

describe('parseFbaRosterTab', () => {
  const rows = [
    ['', '', 'Position/Team', '', 'Player', 'Age', 'Rating', 'Contract End', 'Contract Amount'],
    ['', '', '', '', '', '', 'Updated:', 'Pre-S79', ''],
    [],
    ['', '', 'Carolina Knights', '', '', '', '', '', '23'],
    ['', '', '(PG)', '', 'Jelani Soweto', '24', '92', 'S82', '8'],
    ['', '', '(C)', '', 'X', 'X', 'X', 'X', 'X'],
    ['', '', '', '', '', '', '', '', ''],
  ];
  it('reads teams and players', () => {
    const [t] = parseFbaRosterTab(rows);
    expect(t.name).toBe('Carolina Knights');
    expect(t.country).toBeNull();
    expect(t.players[0]).toEqual({ name: 'Jelani Soweto', position: 'PG', age: 24, rating: 92, contractEnd: 82, contractAmount: 8 });
  });
  it('reads X as a vacant slot', () => {
    expect(parseFbaRosterTab(rows)[0].players[1]).toEqual({ name: null, position: 'C', age: null, rating: null, contractEnd: null, contractAmount: null });
  });
  it('accepts $-prefixed amounts', () => {
    const [t] = parseFbaRosterTab([['', '', 'DCB'], ['', '', '(SG)', '', 'A B', '30', '80', 'S80', '$6']]);
    expect(t.players[0].contractAmount).toBe(6);
  });
  it('drops label rows that have no players', () => {
    expect(parseFbaRosterTab([['', '', 'Notes'], ['', '', 'DCB'], ['', '', '(SG)', '', 'A B', '30', '80', 'S80', '6']]).map(t => t.name)).toEqual(['DCB']);
  });
});

describe('parseD2RosterTab', () => {
  it('splits team and country', () => {
    const rows = [['Position/Team/Conference', 'Player', 'Age', 'Rating'], [], ['Amsterdam(Netherlands)'], ['(PF)', 'Maddox Dean', '22', '94']];
    const [t] = parseD2RosterTab(rows);
    expect(t).toMatchObject({ name: 'Amsterdam', country: 'Netherlands' });
    expect(t.players[0]).toEqual({ name: 'Maddox Dean', position: 'PF', age: 22, rating: 94, contractEnd: null, contractAmount: null });
  });
});

describe('parseCalendarTab', () => {
  const rows = [
    ['S78', '', ''],
    ['*', 'Adjust Age', ''],
    ['12', 'FBAJC', ''],
    ['S79', '', ''],
    ['*', 'Adjust Age', ''],
    ['1', 'S79 FBA Draft', ''],
    ['2', 'Free Agency/Offseason', '*Here*'],
    ['8', 'none', ''],
    ['12', 'FBAJC', ''],
    ['S80', '', ''],
    ['*', 'Adjust Age', ''],
  ];
  it('returns the block containing *Here*', () => {
    expect(parseCalendarTab(rows)).toEqual({
      season: 79,
      hereIndex: 2,
      steps: [
        { label: 'Adjust Age', sub: true },
        { label: 'S79 FBA Draft', sub: false },
        { label: 'Free Agency/Offseason', sub: false },
        { label: 'FBAJC', sub: false },
      ],
    });
  });
  it('throws when there is no *Here* marker', () => {
    expect(() => parseCalendarTab([['S79'], ['1', 'FBA']])).toThrow(/Here/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run importers/sheets`
Expected: FAIL, cannot resolve `./xlsx` and `./parsers`.

- [ ] **Step 3: Implement**

`web/importers/sheets/xlsx.ts`:
```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(r => r.text).join('').trim();
    if ('result' in o) return cellText(o.result);
    if ('formula' in o || 'sharedFormula' in o) return '';
    if ('text' in o) return cellText(o.text);
    if ('error' in o) return '';
  }
  return String(v).trim();
}

export async function downloadWorkbook(sheetId: string, cacheDir: string): Promise<string> {
  const file = path.join(cacheDir, `${sheetId}.xlsx`);
  if (existsSync(file)) return file;
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`);
  if (!res.ok) {
    throw new Error(`Downloading sheet ${sheetId} failed with HTTP ${res.status}. Is it shared as "Anyone with the link can view"?`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

export async function readTabs(file: string, tabs: string[]): Promise<Record<string, string[][]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, string[][]> = {};
  for (const name of tabs) {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Tab "${name}" not found in ${path.basename(file)}`);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      rows[n - 1] = Array.from(row.values as unknown[]).slice(1).map(cellText);
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out[name] = rows;
  }
  return out;
}
```

`web/importers/sheets/parsers.ts`:
```ts
import type { Position } from '../../engine/shared/types';

export interface SheetPlayer {
  name: string | null;
  position: Position;
  age: number | null;
  rating: number | null;
  contractEnd: number | null;
  contractAmount: number | null;
}

export interface SheetTeam {
  name: string;
  country: string | null;
  players: SheetPlayer[];
}

export interface ParsedCalendarStep {
  label: string;
  sub: boolean;
}

export interface ParsedCalendar {
  season: number;
  steps: ParsedCalendarStep[];
  hereIndex: number;
}

const POS_CELL = /^\((PG|SG|SF|PF|C)\)$/;
const cell = (r: string[], i: number) => (r[i] ?? '').trim();

function numOrNull(s: string): number | null {
  if (s === '' || s === 'X') return null;
  const n = Number(s.replace(/^\$/, ''));
  if (Number.isNaN(n)) throw new Error(`Expected a number but got "${s}"`);
  return n;
}

function seasonOrNull(s: string): number | null {
  if (s === '' || s === 'X') return null;
  const m = s.match(/^S(\d+)$/);
  if (!m) throw new Error(`Expected a season like "S81" but got "${s}"`);
  return Number(m[1]);
}

function parseRosterRows(
  rows: string[][],
  teamCol: number,
  isHeader: (text: string) => boolean,
  readPlayer: (r: string[], position: Position) => SheetPlayer,
  splitCountry: boolean,
): SheetTeam[] {
  const teams: SheetTeam[] = [];
  let current: SheetTeam | null = null;
  for (const r of rows) {
    const text = cell(r, teamCol);
    if (!text || isHeader(text)) continue;
    const pos = text.match(POS_CELL);
    if (pos) {
      if (!current) throw new Error(`Player row appears before any team: ${r.join(',')}`);
      current.players.push(readPlayer(r, pos[1] as Position));
      continue;
    }
    const m = splitCountry ? text.match(/^(.*?)\s*\((.+)\)$/) : null;
    current = { name: m ? m[1] : text, country: m ? m[2] : null, players: [] };
    teams.push(current);
  }
  return teams.filter(t => t.players.length > 0);
}

export function parseFbaRosterTab(rows: string[][]): SheetTeam[] {
  return parseRosterRows(rows, 2, t => t.startsWith('Position/Team'), (r, position) => {
    const name = cell(r, 4);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    return {
      name,
      position,
      age: numOrNull(cell(r, 5)),
      rating: numOrNull(cell(r, 6)),
      contractEnd: seasonOrNull(cell(r, 7)),
      contractAmount: numOrNull(cell(r, 8)),
    };
  }, false);
}

export function parseD2RosterTab(rows: string[][]): SheetTeam[] {
  return parseRosterRows(rows, 0, t => t.startsWith('Position/Team'), (r, position) => {
    const name = cell(r, 1);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    return { name, position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), contractEnd: null, contractAmount: null };
  }, true);
}

export function parseCalendarTab(rows: string[][]): ParsedCalendar {
  let block: ParsedCalendar | null = null;
  let hereOnSkipped = false;
  for (const r of rows) {
    const c0 = cell(r, 0);
    const season = c0.match(/^S(\d+)$/);
    if (season) {
      if (block && block.hereIndex >= 0) return block;
      block = { season: Number(season[1]), steps: [], hereIndex: -1 };
      hereOnSkipped = false;
      continue;
    }
    if (!block) continue;
    const label = cell(r, 1);
    if (!label) continue;
    const here = cell(r, 2).includes('Here');
    if (label.toLowerCase() === 'none') {
      if (here) hereOnSkipped = true;
      continue;
    }
    block.steps.push({ label, sub: c0 === '*' });
    if (here || hereOnSkipped) {
      block.hereIndex = block.steps.length - 1;
      hereOnSkipped = false;
    }
  }
  if (block && block.hereIndex >= 0) return block;
  throw new Error('No "*Here*" marker found in the calendar tab');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run importers/sheets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/importers/sheets
git commit -m "web: read Google Sheets exports and parse roster/calendar tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Player registry and team badges

**Files:**
- Create: `web/importers/registry.ts`, `web/importers/badges.ts`
- Test: `web/importers/registry.test.ts`, `web/importers/badges.test.ts`

**Interfaces:**
- Consumes: `normalizeName`, `Player`, `PlayersFile`, `Badge`, `Report`
- Produces:
  ```ts
  class PlayerRegistry {
    constructor(report: Report)
    add(name: string | null, birthSeason: number | null, scope: string): string  // scope like 'fba:S79'
    toFile(): PlayersFile
    linkedPlayers(): { id: string; name: string; scopes: string[] }[]            // players in 2+ scopes
  }
  function badgeFor(name: string): Badge
  ```

Linking rule: a named player links to an existing player with the same normalized name if their birth seasons are within ±1 (or either is unknown) **and** that player isn't already in this `scope`. Exactly one candidate → link. Several candidates → new player plus a warning. Unnamed (`null`) players always get a new id.

- [ ] **Step 1: Write the failing tests**

`web/importers/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PlayerRegistry } from './registry';
import { Report } from './report';

describe('PlayerRegistry', () => {
  it('assigns sequential padded ids', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('A One', 50, 'fba:S79')).toBe('p00001');
    expect(reg.add('B Two', 50, 'fba:S79')).toBe('p00002');
    expect(reg.toFile().nextId).toBe(3);
  });

  it('links the same person across scopes', () => {
    const reg = new PlayerRegistry(new Report());
    const a = reg.add('Yasin Milovanović', 51, 'fba:S79');
    const b = reg.add('Yasin Milovanovic', 50, 'fba:S78');
    expect(b).toBe(a);
    expect(reg.linkedPlayers()).toEqual([{ id: a, name: 'Yasin Milovanović', scopes: ['fba:S79', 'fba:S78'] }]);
  });

  it('links when one birth season is unknown and fills it in', () => {
    const reg = new PlayerRegistry(new Report());
    const jc = reg.add('Milo Lawrenz', null, 'fbajc:S78');
    const pro = reg.add('Milo Lawrenz', 59, 'fba:S79');
    expect(pro).toBe(jc);
    expect(reg.toFile().players[jc].birthSeason).toBe(59);
  });

  it('does not link different ages', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('Jalen Carter', 57, 'fba:S79')).not.toBe(reg.add('Jalen Carter', 45, 'fbad2:S79'));
  });

  it('does not link two players on the same league-season', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('Chris Smith', 50, 'fbajc:S78')).not.toBe(reg.add('Chris Smith', 50, 'fbajc:S78'));
  });

  it('never links unnamed players', () => {
    const reg = new PlayerRegistry(new Report());
    const a = reg.add(null, null, 'fbajc:S78');
    const b = reg.add(null, null, 'fbawc:S78');
    expect(a).not.toBe(b);
    expect(reg.toFile().players[a].name).toBeNull();
  });

  it('warns on ambiguous matches', () => {
    const report = new Report();
    const reg = new PlayerRegistry(report);
    reg.add('Sam Lee', 50, 'fbad2:S79');
    reg.add('Sam Lee', 50, 'fbad2:S79');
    reg.add('Sam Lee', null, 'fbawc:S78');
    expect(report.entries.some(e => e.level === 'warn' && e.topic === 'ambiguous names')).toBe(true);
  });
});
```

`web/importers/badges.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { badgeFor } from './badges';

describe('badgeFor', () => {
  it('is deterministic', () => {
    expect(badgeFor('Duke')).toEqual(badgeFor('Duke'));
  });
  it('produces an hsl background and white text', () => {
    expect(badgeFor('Salzburg')).toMatchObject({ bg: expect.stringMatching(/^hsl\(\d{1,3} 55% 36%\)$/), fg: '#ffffff' });
  });
  it('varies by name', () => {
    expect(badgeFor('Duke').bg).not.toBe(badgeFor('Kentucky').bg);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run importers/registry importers/badges`
Expected: FAIL, cannot resolve modules.

- [ ] **Step 3: Implement**

`web/importers/badges.ts`:
```ts
import type { Badge } from '../engine/shared/types';

export function badgeFor(name: string): Badge {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { bg: `hsl(${h % 360} 55% 36%)`, fg: '#ffffff' };
}
```

`web/importers/registry.ts`:
```ts
import { normalizeName } from '../engine/shared/names';
import type { Player, PlayersFile } from '../engine/shared/types';
import type { Report } from './report';

export class PlayerRegistry {
  private readonly players = new Map<string, Player>();
  private readonly byName = new Map<string, string[]>();
  private readonly scopes = new Map<string, string[]>();
  private next = 1;

  constructor(private readonly report: Report) {}

  add(name: string | null, birthSeason: number | null, scope: string): string {
    if (name === null) return this.create(null, birthSeason, scope);
    const key = normalizeName(name);
    const sameName = this.byName.get(key) ?? [];
    const candidates = sameName
      .map(id => this.players.get(id)!)
      .filter(p => !this.scopes.get(p.id)!.includes(scope))
      .filter(p => p.birthSeason === null || birthSeason === null || Math.abs(p.birthSeason - birthSeason) <= 1);

    if (candidates.length === 1) {
      const p = candidates[0];
      if (p.birthSeason === null && birthSeason !== null) p.birthSeason = birthSeason;
      this.scopes.get(p.id)!.push(scope);
      return p.id;
    }
    if (candidates.length > 1) {
      this.report.warn('ambiguous names', `${name} (${scope}) could be any of ${candidates.length} existing players; created a new player`);
    } else if (sameName.length > 0) {
      this.report.info('same name, different player', `${name} (${scope}) was not linked to an existing player with this name (different age or already on this roster)`);
    }
    const id = this.create(name, birthSeason, scope);
    this.byName.set(key, [...sameName, id]);
    return id;
  }

  toFile(): PlayersFile {
    return { nextId: this.next, players: Object.fromEntries(this.players) };
  }

  linkedPlayers(): { id: string; name: string; scopes: string[] }[] {
    return [...this.players.values()]
      .filter(p => p.name !== null && this.scopes.get(p.id)!.length > 1)
      .map(p => ({ id: p.id, name: p.name!, scopes: [...this.scopes.get(p.id)!] }));
  }

  private create(name: string | null, birthSeason: number | null, scope: string): string {
    const id = `p${String(this.next++).padStart(5, '0')}`;
    this.players.set(id, { id, name, birthSeason });
    this.scopes.set(id, [scope]);
    return id;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run importers/registry importers/badges`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/importers/registry.ts web/importers/registry.test.ts web/importers/badges.ts web/importers/badges.test.ts
git commit -m "web: player registry with cross-league linking, team badges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Assemble every output document

**Files:**
- Create: `web/importers/assemble.ts`
- Test: `web/importers/assemble.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7
- Produces:
  ```ts
  interface ImportInputs {
    fbaTxt: TxtTeam[]; d2Txt: TxtTeam[]; jcTxt: TxtTeam[]; wcTxt: TxtTeam[];
    fbaSheet: SheetTeam[]; d2Sheet: SheetTeam[];
    calendar: ParsedCalendar;
    fbaResults: RawResult[]; fbaFinals: Champion | null; d2Finals: Champion[];
    jcBracket: BracketOutcome; wcBracket: BracketOutcome;
    logoManifest: LogoManifest;
  }
  function seasonsFor(current: number): { rosterSeason: Record<LeagueId, number>; lastSeason: Record<LeagueId, number> }
  function leagueForStep(label: string): LeagueId | null
  function calendarFrom(parsed: ParsedCalendar): CalendarFile
  function assemble(inputs: ImportInputs, report: Report): Record<string, unknown>  // data-relative path → document
  ```

Output for current season 79 (N = current, N−1 = last):

| Path | Source | locked |
|---|---|---|
| `players.json`, `meta.json`, `calendar.json`, `logos/manifest.json` | derived | — |
| `leagues/<lg>/teams.json` ×4 | `.txt` headers | — |
| `leagues/fba/S79/rosters.json` | "FBA Rosters" tab | false |
| `leagues/fba/S78/rosters.json` | `FBA/FBARosters.txt` | true |
| `leagues/fbad2/S79/rosters.json` | "FBA D2 Rosters" tab | false |
| `leagues/fbad2/S78/rosters.json` | `FBAD2/FBAD2Rosters` | true |
| `leagues/fbajc/S78/rosters.json` | `FBAJC/FBAJCRosters` | true |
| `leagues/fbawc/S78/rosters.json` | `FBAWC/FBAWCRosters` | true |
| `leagues/fba/S78/results.json` | `FBA/Results.txt` | true |
| `leagues/<lg>/S78/summary.json` ×4 | Playoffs / MMBrackets | true |

Registry insertion order (it decides which record "owns" a name): FBA S79 sheet, FBA S78 txt, D2 S79 sheet, D2 S78 txt, JC S78, WC S78.

- [ ] **Step 1: Write the failing test**

`web/importers/assemble.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { CalendarFile, MetaFile, ResultsFile, RostersFile, SummaryFile, TeamsFile } from '../engine/shared/types';
import { assemble, calendarFrom, leagueForStep, seasonsFor, type ImportInputs } from './assemble';
import { Report } from './report';
import type { TxtPlayer } from './txt/rosters';

const P = (name: string | null, position: TxtPlayer['position'], age: number | null, rating: number, extra: Partial<TxtPlayer> = {}): TxtPlayer => ({
  name, position, age, rating, points: 0, contractLen: null, cost: null, stars: null, classYear: null, ...extra,
});

function inputs(): ImportInputs {
  return {
    fbaTxt: [
      { name: 'Boston Bucks', abbr: 'BOS', group: 'E', players: [P('Gabriel Greenwood', 'PG', 27, 96, { contractLen: 3, cost: 8, points: 2980 })] },
      { name: 'Memphis Blues', abbr: 'MEM', group: 'W', players: [P('Ivory Huntley', 'PG', 25, 97, { contractLen: 2, cost: 9, points: 2900 })] },
    ],
    fbaSheet: [
      { name: 'Boston Bucks', country: null, players: [
        { name: 'Gabriel Greenwood', position: 'PG', age: 28, rating: 95, contractEnd: 80, contractAmount: 8 },
        { name: null, position: 'SG', age: null, rating: null, contractEnd: null, contractAmount: null },
      ] },
      { name: 'Memphis Blues', country: null, players: [{ name: 'Ivory Huntley', position: 'PG', age: 26, rating: 97, contractEnd: 81, contractAmount: 9 }] },
    ],
    d2Txt: [{ name: 'Salzburg', abbr: 'SAL', group: 'PL', players: [P('Ben Montgomery', 'PG', 29, 75)] }],
    d2Sheet: [{ name: 'Salzburg', country: 'Austria', players: [{ name: 'Ben Montgomery', position: 'PG', age: 30, rating: 75, contractEnd: null, contractAmount: null }] }],
    jcTxt: [{ name: 'Duke', abbr: 'DUKE', group: 'ACC', players: [
      P(null, 'C', null, 70, { classYear: 'Fr', points: 100 }),
      P('Ivory Huntley', 'PG', null, 80, { stars: 5, classYear: 'Sr' }),
    ] }],
    wcTxt: [{ name: 'Germany', abbr: 'GER', group: null, players: [P('Gabriel Greenwood', 'PG', 28, 96)] }],
    calendar: {
      season: 79,
      hereIndex: 2,
      steps: [
        { label: 'Adjust Age', sub: true },
        { label: 'S79 FBA Draft', sub: false },
        { label: 'Free Agency/Offseason', sub: false },
        { label: 'FBA D2', sub: false },
        { label: 'FBA', sub: false },
        { label: 'FBAJC', sub: false },
      ],
    },
    fbaResults: [{ gameNo: 1, home: 'Boston Bucks', homePts: 90, away: 'Memphis Blues', awayPts: 80 }],
    fbaFinals: { title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' },
    d2Finals: [{ title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' }],
    jcBracket: { champion: 'Duke', runnerUp: 'North Carolina', host: null },
    wcBracket: { champion: 'Germany', runnerUp: 'Italy', host: 'Croatia' },
    logoManifest: { folders: { 'Boston Bucks': [{ file: 'Boston Bucks S61-pres..png', from: 61, to: null, variant: 0 }] } },
  };
}

describe('seasonsFor', () => {
  it('handles an odd (non-World Cup) season', () => {
    expect(seasonsFor(79)).toEqual({
      rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
      lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
    });
  });
  it('handles an even (World Cup) season', () => {
    expect(seasonsFor(80).lastSeason.fbawc).toBe(78);
  });
});

describe('calendar mapping', () => {
  it('maps league step labels', () => {
    expect(leagueForStep('FBA D2')).toBe('fbad2');
    expect(leagueForStep('FBA')).toBe('fba');
    expect(leagueForStep('FBAJC')).toBe('fbajc');
    expect(leagueForStep('S80 FBA World Cup')).toBe('fbawc');
    expect(leagueForStep('S79 FBA Draft')).toBeNull();
  });
  it('marks steps before *Here* as done and makes ids unique', () => {
    const cal = calendarFrom({ season: 79, hereIndex: 1, steps: [{ label: 'Adjust Age', sub: true }, { label: 'Adjust Age', sub: true }, { label: 'FBA', sub: false }] });
    expect(cal.steps.map(s => [s.id, s.done, s.kind])).toEqual([
      ['adjust-age', true, 'offseason'],
      ['adjust-age-2', false, 'offseason'],
      ['fba', false, 'league'],
    ]);
  });
});

describe('assemble', () => {
  it('produces every document and they all validate', () => {
    const files = assemble(inputs(), new Report());
    expect(Object.keys(files).sort()).toEqual([
      'calendar.json',
      'leagues/fba/S78/results.json', 'leagues/fba/S78/rosters.json', 'leagues/fba/S78/summary.json',
      'leagues/fba/S79/rosters.json', 'leagues/fba/teams.json',
      'leagues/fbad2/S78/rosters.json', 'leagues/fbad2/S78/summary.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/teams.json',
      'leagues/fbajc/S78/rosters.json', 'leagues/fbajc/S78/summary.json', 'leagues/fbajc/teams.json',
      'leagues/fbawc/S78/rosters.json', 'leagues/fbawc/S78/summary.json', 'leagues/fbawc/teams.json',
      'logos/manifest.json', 'meta.json', 'players.json',
    ]);
    for (const [rel, doc] of Object.entries(files)) {
      const r = schemaForPath(rel)!.safeParse(doc);
      expect(r.success, `${rel}: ${!r.success && JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('links players across leagues and seasons', () => {
    const files = assemble(inputs(), new Report());
    const fba79 = files['leagues/fba/S79/rosters.json'] as RostersFile;
    const fba78 = files['leagues/fba/S78/rosters.json'] as RostersFile;
    const jc = files['leagues/fbajc/S78/rosters.json'] as RostersFile;
    const wc = files['leagues/fbawc/S78/rosters.json'] as RostersFile;
    expect(fba78.teams.BOS[0].playerId).toBe(fba79.teams.BOS[0].playerId);
    expect(wc.teams.GER[0].playerId).toBe(fba79.teams.BOS[0].playerId);
    expect(jc.teams.DUKE[1].playerId).toBe(fba79.teams.MEM[0].playerId);
  });

  it('keeps vacancies and converts contracts', () => {
    const files = assemble(inputs(), new Report());
    const fba79 = files['leagues/fba/S79/rosters.json'] as RostersFile;
    const fba78 = files['leagues/fba/S78/rosters.json'] as RostersFile;
    expect(fba79.teams.BOS[1]).toEqual({ playerId: null, position: 'SG', rating: null, age: null, points: 0, contractEnd: null, contractAmount: null });
    expect(fba79.locked).toBe(false);
    expect(fba78.locked).toBe(true);
    expect(fba78.teams.BOS[0]).toMatchObject({ contractEnd: 80, contractAmount: 8, points: 2980 });
  });

  it('builds teams, results, summaries, meta, and calendar', () => {
    const report = new Report();
    const files = assemble(inputs(), report);
    const teams = files['leagues/fba/teams.json'] as TeamsFile;
    expect(teams.teams.find(t => t.teamId === 'BOS')!.logoFolder).toBe('Boston Bucks');
    expect(teams.teams.find(t => t.teamId === 'MEM')!.logoFolder).toBeNull();
    expect((files['leagues/fba/S78/results.json'] as ResultsFile).games[0]).toEqual({ gameNo: 1, home: 'BOS', away: 'MEM', homePts: 90, awayPts: 80 });
    expect((files['leagues/fbawc/S78/summary.json'] as SummaryFile).host).toBe('Croatia');
    expect((files['meta.json'] as MetaFile).rosterSeason).toEqual({ fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 });
    expect((files['calendar.json'] as CalendarFile).steps.map(s => s.done)).toEqual([true, true, false, false, false, false]);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Expected 4 FBAD2 league champions'))).toBe(true);
    expect(report.entries.some(e => e.level === 'warn' && e.message.includes('Memphis Blues'))).toBe(true);
    expect(report.hasErrors).toBe(false);
  });

  it('reports a sheet team missing from the roster file', () => {
    const inp = inputs();
    inp.fbaSheet[0].name = 'Boston Celtics';
    const report = new Report();
    assemble(inp, report);
    expect(report.hasErrors).toBe(true);
    expect(report.entries.filter(e => e.level === 'error').map(e => e.message)).toEqual([
      'fba: sheet team "Boston Celtics" has no match in the roster file',
      'fba: team "Boston Bucks" is missing from the sheet tab',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run importers/assemble`
Expected: FAIL, cannot resolve `./assemble`.

- [ ] **Step 3: Implement**

`web/importers/assemble.ts`:
```ts
import type {
  CalendarFile, CalendarStep, Champion, GameResult, LeagueId, LogoManifest, MetaFile, ResultsFile, RosterEntry, RostersFile, SummaryFile, TeamsFile,
} from '../engine/shared/types';
import { badgeFor } from './badges';
import { PlayerRegistry } from './registry';
import type { Report } from './report';
import type { ParsedCalendar, SheetTeam } from './sheets/parsers';
import type { BracketOutcome, RawResult } from './txt/archives';
import type { TxtTeam } from './txt/rosters';

export interface ImportInputs {
  fbaTxt: TxtTeam[];
  d2Txt: TxtTeam[];
  jcTxt: TxtTeam[];
  wcTxt: TxtTeam[];
  fbaSheet: SheetTeam[];
  d2Sheet: SheetTeam[];
  calendar: ParsedCalendar;
  fbaResults: RawResult[];
  fbaFinals: Champion | null;
  d2Finals: Champion[];
  jcBracket: BracketOutcome;
  wcBracket: BracketOutcome;
  logoManifest: LogoManifest;
}

export function seasonsFor(current: number): { rosterSeason: Record<LeagueId, number>; lastSeason: Record<LeagueId, number> } {
  const last = current - 1;
  const lastWc = current % 2 === 0 ? current - 2 : current - 1;
  return {
    rosterSeason: { fba: current, fbad2: current, fbajc: last, fbawc: lastWc },
    lastSeason: { fba: last, fbad2: last, fbajc: last, fbawc: lastWc },
  };
}

export function leagueForStep(label: string): LeagueId | null {
  const l = label.trim();
  if (l === 'FBA D2') return 'fbad2';
  if (l === 'FBA') return 'fba';
  if (l === 'FBAJC') return 'fbajc';
  if (/world cup/i.test(l)) return 'fbawc';
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function calendarFrom(parsed: ParsedCalendar): CalendarFile {
  const used = new Set<string>();
  return {
    season: parsed.season,
    steps: parsed.steps.map((s, i): CalendarStep => {
      const base = slug(s.label) || `step-${i + 1}`;
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      const league = leagueForStep(s.label);
      return { id, label: s.label, kind: league ? 'league' : 'offseason', league, sub: s.sub, done: i < parsed.hereIndex };
    }),
  };
}

function teamsFile(league: LeagueId, txt: TxtTeam[], logoFolders: Set<string>, report: Report): TeamsFile {
  const seen = new Set<string>();
  for (const t of txt) {
    if (seen.has(t.abbr)) report.error('teams', `${league}: duplicate abbreviation ${t.abbr}`);
    seen.add(t.abbr);
    if (league === 'fba' && !logoFolders.has(t.name)) report.warn('logos', `No logo folder for FBA team "${t.name}"; a badge will be shown`);
  }
  return {
    league,
    teams: txt.map(t => ({
      teamId: t.abbr,
      name: t.name,
      abbr: t.abbr,
      group: t.group,
      logoFolder: league === 'fba' && logoFolders.has(t.name) ? t.name : null,
      badge: badgeFor(t.name),
    })),
  };
}

function rosterFromTxt(league: LeagueId, season: number, txt: TxtTeam[], reg: PlayerRegistry, locked: boolean): RostersFile {
  const scope = `${league}:S${season}`;
  const teams: Record<string, RosterEntry[]> = {};
  for (const t of txt) {
    teams[t.abbr] = t.players.map(p => {
      const e: RosterEntry = {
        playerId: reg.add(p.name, p.age === null ? null : season - p.age, scope),
        position: p.position,
        rating: p.rating,
        age: p.age,
        points: p.points,
      };
      if (league === 'fba') {
        e.contractEnd = p.contractLen === null ? null : season + p.contractLen - 1;
        e.contractAmount = p.cost;
      }
      if (league === 'fbajc') {
        e.stars = p.stars;
        e.classYear = p.classYear;
      }
      return e;
    });
  }
  return { league, season, locked, teams };
}

function rosterFromSheet(
  league: 'fba' | 'fbad2', season: number, sheet: SheetTeam[], txt: TxtTeam[], reg: PlayerRegistry, report: Report,
): RostersFile {
  const scope = `${league}:S${season}`;
  const abbrByName = new Map(txt.map(t => [t.name, t.abbr]));
  const teams: Record<string, RosterEntry[]> = {};
  for (const st of sheet) {
    const abbr = abbrByName.get(st.name);
    if (!abbr) {
      report.error('rosters', `${league}: sheet team "${st.name}" has no match in the roster file`);
      continue;
    }
    teams[abbr] = st.players.map(p => {
      if (p.name === null) {
        report.info('vacancies', `${league} S${season}: ${st.name} ${p.position} is vacant`);
        const vacant: RosterEntry = { playerId: null, position: p.position, rating: null, age: null, points: 0 };
        if (league === 'fba') { vacant.contractEnd = null; vacant.contractAmount = null; }
        return vacant;
      }
      const e: RosterEntry = {
        playerId: reg.add(p.name, p.age === null ? null : season - p.age, scope),
        position: p.position,
        rating: p.rating === null ? null : Math.round(p.rating),
        age: p.age === null ? null : Math.round(p.age),
        points: 0,
      };
      if (league === 'fba') { e.contractEnd = p.contractEnd; e.contractAmount = p.contractAmount; }
      return e;
    });
  }
  for (const t of txt) if (!teams[t.abbr]) report.error('rosters', `${league}: team "${t.name}" is missing from the sheet tab`);
  return { league, season, locked: false, teams };
}

function resultsFile(season: number, raw: RawResult[], txt: TxtTeam[], report: Report): ResultsFile {
  const idByName = new Map(txt.map(t => [t.name, t.abbr]));
  const games: GameResult[] = [];
  for (const g of raw) {
    const home = idByName.get(g.home);
    const away = idByName.get(g.away);
    if (!home || !away) {
      report.error('results', `Game ${g.gameNo}: unknown team "${home ? g.away : g.home}"`);
      continue;
    }
    games.push({ gameNo: g.gameNo, home, away, homePts: g.homePts, awayPts: g.awayPts });
  }
  return { league: 'fba', season, locked: true, games };
}

function summary(league: LeagueId, season: number, champions: Champion[], host: string | null): SummaryFile {
  return { league, season, locked: true, host, champions };
}

function bracketChampions(title: string, b: BracketOutcome): Champion[] {
  return b.champion ? [{ title, champion: b.champion, runnerUp: b.runnerUp, score: null }] : [];
}

export function assemble(inp: ImportInputs, report: Report): Record<string, unknown> {
  const season = inp.calendar.season;
  const { rosterSeason, lastSeason } = seasonsFor(season);
  const reg = new PlayerRegistry(report);
  const folders = new Set(Object.keys(inp.logoManifest.folders));
  const files: Record<string, unknown> = {};

  files['leagues/fba/teams.json'] = teamsFile('fba', inp.fbaTxt, folders, report);
  files['leagues/fbad2/teams.json'] = teamsFile('fbad2', inp.d2Txt, folders, report);
  files['leagues/fbajc/teams.json'] = teamsFile('fbajc', inp.jcTxt, folders, report);
  files['leagues/fbawc/teams.json'] = teamsFile('fbawc', inp.wcTxt, folders, report);

  files[`leagues/fba/S${rosterSeason.fba}/rosters.json`] = rosterFromSheet('fba', rosterSeason.fba, inp.fbaSheet, inp.fbaTxt, reg, report);
  files[`leagues/fba/S${lastSeason.fba}/rosters.json`] = rosterFromTxt('fba', lastSeason.fba, inp.fbaTxt, reg, true);
  files[`leagues/fbad2/S${rosterSeason.fbad2}/rosters.json`] = rosterFromSheet('fbad2', rosterSeason.fbad2, inp.d2Sheet, inp.d2Txt, reg, report);
  files[`leagues/fbad2/S${lastSeason.fbad2}/rosters.json`] = rosterFromTxt('fbad2', lastSeason.fbad2, inp.d2Txt, reg, true);
  files[`leagues/fbajc/S${lastSeason.fbajc}/rosters.json`] = rosterFromTxt('fbajc', lastSeason.fbajc, inp.jcTxt, reg, true);
  files[`leagues/fbawc/S${lastSeason.fbawc}/rosters.json`] = rosterFromTxt('fbawc', lastSeason.fbawc, inp.wcTxt, reg, true);

  files[`leagues/fba/S${lastSeason.fba}/results.json`] = resultsFile(lastSeason.fba, inp.fbaResults, inp.fbaTxt, report);

  if (!inp.fbaFinals) report.warn('champions', 'No finished FBA Finals found in FBA/Playoffs.txt');
  files[`leagues/fba/S${lastSeason.fba}/summary.json`] = summary('fba', lastSeason.fba, inp.fbaFinals ? [inp.fbaFinals] : [], null);
  if (inp.d2Finals.length !== 4) report.warn('champions', `Expected 4 FBAD2 league champions, found ${inp.d2Finals.length}`);
  files[`leagues/fbad2/S${lastSeason.fbad2}/summary.json`] = summary('fbad2', lastSeason.fbad2, inp.d2Finals, null);
  if (!inp.jcBracket.champion) report.warn('champions', 'No FBAJC national champion found in FBAJC/MMBrackets.txt');
  files[`leagues/fbajc/S${lastSeason.fbajc}/summary.json`] = summary('fbajc', lastSeason.fbajc, bracketChampions('National Champion', inp.jcBracket), null);
  if (!inp.wcBracket.champion) report.warn('champions', 'No World Cup champion found in FBAWC/MMBrackets.txt');
  files[`leagues/fbawc/S${lastSeason.fbawc}/summary.json`] = summary('fbawc', lastSeason.fbawc, bracketChampions('World Cup Champion', inp.wcBracket), inp.wcBracket.host);

  const linked = reg.linkedPlayers();
  const crossLeague = linked.filter(p => new Set(p.scopes.map(s => s.split(':')[0])).size > 1);
  report.info('linked players', `${linked.length} players appear on more than one roster; ${crossLeague.length} of them span leagues`);
  for (const p of crossLeague) report.info('cross-league links', `${p.name} (${p.id}): ${p.scopes.join(', ')}`);

  files['players.json'] = reg.toFile();
  files['calendar.json'] = calendarFrom(inp.calendar);
  const meta: MetaFile = { currentSeason: season, rosterSeason, lastSeason };
  files['meta.json'] = meta;
  files['logos/manifest.json'] = inp.logoManifest;
  return files;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run importers/assemble`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add web/importers/assemble.ts web/importers/assemble.test.ts
git commit -m "web: assemble imported data into validated documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Import CLI and the real import

**Files:**
- Create: `web/importers/run.ts`
- Generated and committed: `web/data/**`, `web/importers/import-report.md`

**Interfaces:**
- Consumes: every importer module plus `schemaForPath`
- Produces: `npm run import [-- --force]`

- [ ] **Step 1: Implement the CLI**

`web/importers/run.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import { assemble } from './assemble';
import { buildLogoManifest } from './logoManifest';
import { Report } from './report';
import { parseCalendarTab, parseD2RosterTab, parseFbaRosterTab } from './sheets/parsers';
import { downloadWorkbook, readTabs } from './sheets/xlsx';
import { parseBracketFile, parseD2Playoffs, parseFbaPlayoffs, parseFbaResults } from './txt/archives';
import { parseRosterTxt } from './txt/rosters';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const DATA = path.join(WEB, 'data');
const CACHE = path.join(WEB, 'importers', '.cache');
const REPORT = path.join(WEB, 'importers', 'import-report.md');
const SHEETS = {
  rosters: '1f5j4rhYDK7HB8j9Zz-JHDrhRqEYDSxkgfwQcuqP-A2w',
  main: '1p5oLB9lJvsVKIyaiEOOg9luPxGBdY3yy5SOGq7edMUM',
};

const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');

async function main(): Promise<void> {
  if (existsSync(path.join(DATA, 'meta.json')) && !process.argv.includes('--force')) {
    console.error('web/data already holds an import. Re-run with "npm run import -- --force" to overwrite all league data.');
    process.exit(1);
  }
  const report = new Report();

  console.log('Downloading Google Sheets (cached in web/importers/.cache)...');
  const rosterTabs = await readTabs(await downloadWorkbook(SHEETS.rosters, CACHE), ['FBA Rosters', 'FBA D2 Rosters']);
  const mainTabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['FBA Calender']);

  console.log('Parsing sources...');
  const files = assemble({
    fbaTxt: parseRosterTxt(read('FBA/FBARosters.txt'), 'fba'),
    d2Txt: parseRosterTxt(read('FBAD2/FBAD2Rosters'), 'fbad2'),
    jcTxt: parseRosterTxt(read('FBAJC/FBAJCRosters'), 'fbajc'),
    wcTxt: parseRosterTxt(read('FBAWC/FBAWCRosters'), 'fbawc'),
    fbaSheet: parseFbaRosterTab(rosterTabs['FBA Rosters']),
    d2Sheet: parseD2RosterTab(rosterTabs['FBA D2 Rosters']),
    calendar: parseCalendarTab(mainTabs['FBA Calender']),
    fbaResults: parseFbaResults(read('FBA/Results.txt')),
    fbaFinals: parseFbaPlayoffs(read('FBA/Playoffs.txt')),
    d2Finals: parseD2Playoffs(read('FBAD2/Playoffs.txt')),
    jcBracket: parseBracketFile(read('FBAJC/MMBrackets.txt')),
    wcBracket: parseBracketFile(read('FBAWC/MMBrackets.txt')),
    logoManifest: buildLogoManifest(path.join(REPO, 'FBA Logos'), report),
  }, report);

  for (const [rel, doc] of Object.entries(files)) {
    const schema = schemaForPath(rel);
    if (!schema) {
      report.error('schema', `${rel}: no schema registered for this path`);
      continue;
    }
    const r = schema.safeParse(doc);
    if (!r.success) {
      report.error('schema', `${rel}: ${r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
  }

  writeFileSync(REPORT, report.toMarkdown('Import report'));
  if (report.hasErrors) {
    console.error(`Import found ${report.count('error')} error(s); nothing was written to web/data. See web/importers/import-report.md`);
    process.exit(1);
  }

  for (const [rel, doc] of Object.entries(files)) {
    const file = path.join(DATA, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`Wrote ${Object.keys(files).length} documents to web/data (${report.count('warn')} warnings). Report: web/importers/import-report.md`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the real import**

Run: `cd web && npm run import`
Expected: `Wrote 19 documents to web/data (N warnings). Report: web/importers/import-report.md`, exit code 0.
If it exits with errors instead, open `web/importers/import-report.md`, fix the parser that produced the error (add a failing unit test for that exact input first), and re-run.

- [ ] **Step 3: Sanity-check the imported data**

Run:
```bash
cd web && node -e "
const fs=require('fs');const j=p=>JSON.parse(fs.readFileSync('data/'+p));
const m=j('meta.json');console.log('meta',JSON.stringify(m));
const cal=j('calendar.json');console.log('current step',cal.steps.find(s=>!s.done).label);
for (const [lg,s] of Object.entries(m.rosterSeason)) {const r=j('leagues/'+lg+'/S'+s+'/rosters.json');console.log(lg,'S'+s,Object.keys(r.teams).length,'teams',Object.values(r.teams).flat().length,'slots');}
console.log('players',Object.keys(j('players.json').players).length);
console.log('fba champ',j('leagues/fba/S78/summary.json').champions[0].champion);
console.log('results',j('leagues/fba/S78/results.json').games.length);
"
```
Expected:
- `meta {"currentSeason":79,"rosterSeason":{"fba":79,"fbad2":79,"fbajc":78,"fbawc":78},"lastSeason":{"fba":78,"fbad2":78,"fbajc":78,"fbawc":78}}`
- `current step Free Agency/Offseason`
- `fba S79 30 teams 150 slots`, `fbad2 S79 64 teams 320 slots`, `fbajc S78 216 teams 1080 slots`, `fbawc S78 85 teams 425 slots`
- `fba champ Boston Bucks`, `results 1290`

- [ ] **Step 4: Review the report**

Open `web/importers/import-report.md`. Confirm `Errors: 0`. Skim the Warnings (undated logos such as `Texas Outlaws.png`, `Vegas Volts 3/4/5.png`) and the cross-league links list. List anything surprising in the task handoff notes so the user can review it.

- [ ] **Step 5: Commit**

```bash
git add web/importers/run.ts web/importers/import-report.md web/data
git commit -m "web: import current rosters, calendar, logos, and S78 archives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Save server

**Files:**
- Create: `web/server/storage.ts`, `web/server/handler.ts`, `web/server/main.ts`
- Test: `web/server/storage.test.ts`, `web/server/handler.test.ts`

**Interfaces:**
- Consumes: `schemaForPath`, `resolveLogo`, `LogoManifest`
- Produces:
  ```ts
  class StorageError extends Error { status: number; issues?: unknown }
  class Storage { constructor(dataDir: string, maxBackups?: number); read(rel: string): Promise<unknown>; write(rel: string, doc: unknown): Promise<void> }
  function createHandler(storage: Storage, logoDir: string): http.RequestListener
  ```
- HTTP: `GET /api/state/<rel>` → 200 JSON | 404; `PUT /api/state/<rel>` → 200 `{ok:true}` | 400 `{error, issues}` | 404 | 409; `GET /logos/<folder>/<season>` → 200 image/png | 404.

- [ ] **Step 1: Write the failing tests**

`web/server/storage.test.ts`:
```ts
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Storage, StorageError } from './storage';

const cal = (done: boolean) => ({ season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done }] });
const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fba-data-'));
  return { dir, storage: new Storage(dir, 10) };
};

async function status(p: Promise<unknown>): Promise<number> {
  try { await p; return 200; } catch (e) { if (e instanceof StorageError) return e.status; throw e; }
}

describe('Storage', () => {
  it('round-trips a valid document', async () => {
    const { storage } = fresh();
    await storage.write('calendar.json', cal(false));
    expect(await storage.read('calendar.json')).toEqual(cal(false));
  });

  it('returns 404 for a missing document', async () => {
    expect(await status(fresh().storage.read('calendar.json'))).toBe(404);
  });

  it('rejects unknown paths', async () => {
    const { storage } = fresh();
    expect(await status(storage.read('../etc/passwd'))).toBe(404);
    expect(await status(storage.write('notes.json', {}))).toBe(404);
  });

  it('rejects invalid documents without writing', async () => {
    const { dir, storage } = fresh();
    expect(await status(storage.write('calendar.json', { season: 'x' }))).toBe(400);
    expect(existsSync(path.join(dir, 'calendar.json'))).toBe(false);
  });

  it('refuses to overwrite a locked document', async () => {
    const { storage } = fresh();
    const summary = { league: 'fba', season: 78, locked: true, host: null, champions: [] };
    await storage.write('leagues/fba/S78/summary.json', summary);
    expect(await status(storage.write('leagues/fba/S78/summary.json', { ...summary, locked: false }))).toBe(409);
  });

  it('keeps only the newest backups and leaves no temp files', async () => {
    const { dir, storage } = fresh();
    for (let i = 0; i < 13; i++) await storage.write('calendar.json', cal(i % 2 === 0));
    expect(readdirSync(path.join(dir, '.backups')).filter(f => f.startsWith('calendar.json.'))).toHaveLength(10);
    expect(readdirSync(dir).filter(f => f.endsWith('.tmp'))).toHaveLength(0);
  });
});
```

`web/server/handler.test.ts`:
```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from './handler';
import { Storage } from './storage';

let server: http.Server;
let base: string;

beforeAll(async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-'));
  const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-'));
  mkdirSync(path.join(logoDir, 'Boston Bucks'));
  writeFileSync(path.join(logoDir, 'Boston Bucks', 'Boston Bucks S61-pres..png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const storage = new Storage(dataDir);
  await storage.write('logos/manifest.json', { folders: { 'Boston Bucks': [{ file: 'Boston Bucks S61-pres..png', from: 61, to: null, variant: 0 }] } });
  server = http.createServer(createHandler(storage, logoDir));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(r => server.close(() => r())));

const calendar = { season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done: false }] };

describe('HTTP handler', () => {
  it('saves and reads documents', async () => {
    const put = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', body: JSON.stringify(calendar) });
    expect(put.status).toBe(200);
    const get = await fetch(`${base}/api/state/calendar.json`);
    expect(await get.json()).toEqual(calendar);
  });

  it('returns validation issues for a bad document', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', body: JSON.stringify({ season: 1 }) });
    expect(res.status).toBe(400);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
  });

  it('rejects non-JSON bodies', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', body: 'nope' });
    expect(res.status).toBe(400);
  });

  it('serves an era-correct logo', async () => {
    const res = await fetch(`${base}/logos/Boston%20Bucks/79`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('404s unknown logo folders and traversal attempts', async () => {
    expect((await fetch(`${base}/logos/Nope/79`)).status).toBe(404);
    expect((await fetch(`${base}/logos/..%2F..%2Fsecret/79`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run server`
Expected: FAIL, cannot resolve `./storage` and `./handler`.

- [ ] **Step 3: Implement**

`web/server/storage.ts`:
```ts
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { schemaForPath } from '../engine/shared/schemaRegistry';

export class StorageError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown) {
    super(message);
  }
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

export class Storage {
  private seq = 0;

  constructor(private readonly dataDir: string, private readonly maxBackups = 10) {}

  private fullPath(rel: string): string {
    if (!schemaForPath(rel)) throw new StorageError(404, `Unknown document path: ${rel}`);
    return path.join(this.dataDir, ...rel.split('/'));
  }

  async read(rel: string): Promise<unknown> {
    const file = this.fullPath(rel);
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (isMissing(e)) throw new StorageError(404, `Not found: ${rel}`);
      throw e;
    }
  }

  async write(rel: string, doc: unknown): Promise<void> {
    const file = this.fullPath(rel);
    const result = schemaForPath(rel)!.safeParse(doc);
    if (!result.success) throw new StorageError(400, `Invalid document for ${rel}`, result.error.issues);

    let existing: string | null = null;
    try {
      existing = await readFile(file, 'utf8');
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
    if (existing !== null) {
      const prev = JSON.parse(existing) as { locked?: unknown };
      if (prev && prev.locked === true) throw new StorageError(409, `${rel} belongs to a finished (locked) season and can't be changed`);
      await this.backup(rel, existing);
    }

    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${this.seq++}.tmp`;
    await writeFile(tmp, JSON.stringify(result.data, null, 2) + '\n');
    await rename(tmp, file);
  }

  private async backup(rel: string, content: string): Promise<void> {
    const dir = path.join(this.dataDir, '.backups');
    await mkdir(dir, { recursive: true });
    const prefix = `${rel.replaceAll('/', '__')}.`;
    await writeFile(path.join(dir, `${prefix}${Date.now()}-${String(this.seq++).padStart(6, '0')}.json`), content);
    const mine = (await readdir(dir)).filter(f => f.startsWith(prefix)).sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - this.maxBackups))) await unlink(path.join(dir, old));
  }
}
```

`web/server/handler.ts`:
```ts
import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { resolveLogo } from '../engine/shared/logos';
import type { LogoManifest } from '../engine/shared/types';
import { Storage, StorageError } from './storage';

const MAX_BODY = 20 * 1024 * 1024;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new StorageError(413, 'Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createHandler(storage: Storage, logoDir: string): http.RequestListener {
  return async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);

      if (pathname.startsWith('/api/state/')) {
        const rel = pathname.slice('/api/state/'.length);
        if (req.method === 'GET') return sendJson(res, 200, await storage.read(rel));
        if (req.method === 'PUT') {
          let doc: unknown;
          try {
            doc = JSON.parse(await readBody(req));
          } catch (e) {
            if (e instanceof StorageError) throw e;
            return sendJson(res, 400, { error: 'Request body is not valid JSON' });
          }
          await storage.write(rel, doc);
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      const logo = pathname.match(/^\/logos\/([^/]+)\/(\d+)$/);
      if (logo && req.method === 'GET') {
        const [, folder, season] = logo;
        const manifest = (await storage.read('logos/manifest.json')) as LogoManifest;
        const entries = manifest.folders[folder];
        const file = entries ? resolveLogo(entries, folder, Number(season)) : null;
        if (!file) return sendJson(res, 404, { error: `No logo for ${folder}` });
        const data = await readFile(path.join(logoDir, folder, file));
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
        return res.end(data);
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof StorageError) return sendJson(res, e.status, { error: e.message, issues: e.issues });
      console.error(e);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  };
}
```

`web/server/main.ts`:
```ts
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './handler';
import { Storage } from './storage';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5174;

const server = http.createServer(createHandler(new Storage(path.join(WEB, 'data')), path.join(WEB, '..', 'FBA Logos')));
server.listen(PORT, '127.0.0.1', () => console.log(`FBA data server on http://127.0.0.1:${PORT}`));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run server`
Expected: PASS, 11 tests.

- [ ] **Step 5: Smoke-test against real data**

Run the server in the background: `cd web && npm run server`. Then:
```bash
curl -s http://127.0.0.1:5174/api/state/meta.json
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://127.0.0.1:5174/logos/Boston%20Bucks/79"
```
Expected: the meta JSON, then `200 image/png`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add web/server
git commit -m "web: validated JSON save server with backups and logo route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App shell (themes, sidebar, top bar, routing)

**Files:**
- Create: `web/index.html`, `web/app/main.tsx`, `web/app/App.tsx`, `web/app/theme.css`, `web/app/api.ts`, `web/app/useTheme.ts`
- Create: `web/app/shell/Layout.tsx`, `web/app/shell/Sidebar.tsx`, `web/app/shell/TopBar.tsx`, `web/app/components/Placeholder.tsx`
- Test: `web/app/shell/Layout.test.tsx`

**Interfaces:**
- Consumes: `CalendarFile`, `currentStepIndex`, `LEAGUES`, `LEAGUE_LABEL`
- Produces:
  ```ts
  getDoc<T>(rel: string): Promise<T>; putDoc(rel: string, doc: unknown): Promise<void>
  useDoc<T>(rel: string | null): { data: T | undefined; error: Error | undefined; reload: () => void }
  useTheme(): { theme: 'light' | 'dark'; toggle: () => void }
  <Layout />   // sidebar + top bar + routes; exported for tests (wrap in a Router)
  <App />      // BrowserRouter + Layout
  <Placeholder title note />
  ```
- Routes: `/` Home, `/calendar`, `/league/:league`, `/league/:league/team/:teamId`, `/offseason` (placeholder), `/history` (placeholder). Task 11 routes the page components from Tasks 12–13 as placeholders first.

`putDoc` fires `window` event `doc-saved` with `detail = rel`; every `useDoc` watching that path reloads, so the top-bar pill updates when the calendar page saves.

- [ ] **Step 1: Write the failing test**

`web/app/shell/Layout.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

const calendar = {
  season: 79,
  steps: [
    { id: 'adjust-age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
    { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state/calendar.json') return new Response(JSON.stringify(calendar));
    return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('Layout', () => {
  it('shows the brand, league links, and the season pill', async () => {
    render(<MemoryRouter initialEntries={['/history']}><Layout /></MemoryRouter>);
    expect(screen.getByText('FBA Universe')).toBeTruthy();
    for (const label of ['FBA', 'FBAD2', 'FBAJC', 'World Cup']) expect(screen.getByRole('link', { name: new RegExp(`^${label}$`) })).toBeTruthy();
    expect(await screen.findByText('S79 · Free Agency/Offseason')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
  });

  it('toggles the dark theme', () => {
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run app/shell`
Expected: FAIL, cannot resolve `./Layout`.

- [ ] **Step 3: Implement the shell**

`web/index.html`:
```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FBA Universe</title>
    <link rel="icon" href="/logos/FBA/1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app/main.tsx"></script>
  </body>
</html>
```

`web/app/theme.css`:
```css
:root {
  --bg: #f3f4f6;
  --surface: #ffffff;
  --surface-2: #f9fafb;
  --border: #e3e5e8;
  --text: #111827;
  --muted: #6b7280;
  --accent: #c8102e;
  --accent-soft: #fde8eb;
  --good: #166534;
  --good-soft: #dcfce7;
  --hero-from: #0b1020;
  --hero-to: #1c2a5a;
  --font-body: Inter, system-ui, sans-serif;
  --font-head: Inter, system-ui, sans-serif;
  --head-transform: none;
  color-scheme: light;
}
:root[data-theme='dark'] {
  --bg: #0b1020;
  --surface: #141c38;
  --surface-2: #111831;
  --border: #232d52;
  --text: #e8ecf5;
  --muted: #8d97b8;
  --accent: #e2283a;
  --accent-soft: #3a1422;
  --good: #4ade80;
  --good-soft: #14331f;
  --hero-from: #111831;
  --hero-to: #2a3a78;
  --font-head: 'Barlow Condensed', Inter, sans-serif;
  --head-transform: uppercase;
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 14px; line-height: 1.4; }
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: var(--font-head); text-transform: var(--head-transform); letter-spacing: 0.01em; margin: 0 0 12px; }
button { font: inherit; cursor: pointer; }

.app { display: grid; grid-template-columns: 220px 1fr; grid-template-rows: 56px 1fr; min-height: 100vh; }
.topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
.topbar .brand img { width: 32px; height: 32px; object-fit: contain; }
.topbar .spacer { flex: 1; }
.pill { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 10px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
.icon-btn { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; padding: 6px 10px; }

.sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 12px; }
.sidebar .section { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 14px 8px 6px; }
.sidebar a { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; font-weight: 600; }
.sidebar a:hover { background: var(--surface-2); }
.sidebar a.active { background: var(--accent-soft); color: var(--accent); }
.main { padding: 20px; min-width: 0; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
.card h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-family: var(--font-body); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.muted { color: var(--muted); }
.btn { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 6px; padding: 7px 12px; font-weight: 700; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn:disabled { opacity: 0.5; cursor: default; }
.error { color: var(--accent); }

@media (max-width: 760px) {
  .app { grid-template-columns: 1fr; grid-template-rows: 56px auto 1fr; }
  .sidebar { border-right: 0; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
  .sidebar .section { display: none; }
  .main { padding: 16px; }
  .topbar .brand span { display: none; }
}
```

`web/app/api.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new ApiError(res.status, body.error ?? res.statusText);
}

export async function getDoc<T>(rel: string): Promise<T> {
  return (await check(await fetch(`/api/state/${rel}`))).json() as Promise<T>;
}

export async function putDoc(rel: string, doc: unknown): Promise<void> {
  await check(await fetch(`/api/state/${rel}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }));
  window.dispatchEvent(new CustomEvent('doc-saved', { detail: rel }));
}

export function useDoc<T>(rel: string | null): { data: T | undefined; error: Error | undefined; reload: () => void } {
  const [state, setState] = useState<{ data?: T; error?: Error }>({});
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!rel) return;
    const onSaved = (e: Event) => { if ((e as CustomEvent<string>).detail === rel) reload(); };
    window.addEventListener('doc-saved', onSaved);
    return () => window.removeEventListener('doc-saved', onSaved);
  }, [rel, reload]);

  useEffect(() => {
    if (!rel) return;
    let live = true;
    getDoc<T>(rel).then(
      data => live && setState({ data }),
      error => live && setState({ error: error as Error }),
    );
    return () => { live = false; };
  }, [rel, version]);

  return { data: state.data, error: state.error, reload };
}
```

`web/app/useTheme.ts`:
```ts
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'fba-theme';

function load(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(load);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // storage unavailable (private window); the theme still applies for this visit
    }
  }, [theme]);
  return { theme, toggle: () => setTheme(t => (t === 'light' ? 'dark' : 'light')) };
}
```

`web/app/components/Placeholder.tsx`:
```tsx
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="card muted">{note}</div>
    </section>
  );
}
```

`web/app/shell/TopBar.tsx`:
```tsx
import { currentStepIndex } from '../../engine/shared/calendar';
import type { CalendarFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { useTheme } from '../useTheme';

export function TopBar() {
  const { data: cal } = useDoc<CalendarFile>('calendar.json');
  const { theme, toggle } = useTheme();
  let pill = '';
  if (cal) {
    const i = currentStepIndex(cal);
    pill = i < 0 ? `S${cal.season} · Complete` : `S${cal.season} · ${cal.steps[i].label}`;
  }
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logos/FBA/1" alt="" />
        <span>FBA Universe</span>
      </div>
      <div className="spacer" />
      {pill && <span className="pill">{pill}</span>}
      <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  );
}
```

`web/app/shell/Sidebar.tsx`:
```tsx
import { NavLink } from 'react-router-dom';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="section">Leagues</div>
      {LEAGUES.map(lg => (
        <NavLink key={lg} to={`/league/${lg}`}>{LEAGUE_LABEL[lg]}</NavLink>
      ))}
      <div className="section">Season</div>
      <NavLink to="/calendar">Calendar</NavLink>
      <NavLink to="/offseason">Offseason tools</NavLink>
      <div className="section">Archive</div>
      <NavLink to="/history">History</NavLink>
    </nav>
  );
}
```

`web/app/shell/Layout.tsx`:
```tsx
import { Route, Routes } from 'react-router-dom';
import { Placeholder } from '../components/Placeholder';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Placeholder title="Home" note="Dashboard arrives in the next task." />} />
          <Route path="/calendar" element={<Placeholder title="Calendar" note="Calendar arrives in the next task." />} />
          <Route path="/league/:league" element={<Placeholder title="League" note="League pages arrive soon." />} />
          <Route path="/league/:league/team/:teamId" element={<Placeholder title="Team" note="Team pages arrive soon." />} />
          <Route path="/offseason" element={<Placeholder title="Offseason tools" note="Arrives in sub-project 7. For now, mark offseason steps done on the Calendar page." />} />
          <Route path="/history" element={<Placeholder title="History" note="League history arrives in sub-project 3." />} />
          <Route path="*" element={<Placeholder title="Not found" note="That page doesn't exist." />} />
        </Routes>
      </main>
    </div>
  );
}
```

`web/app/App.tsx`:
```tsx
import { BrowserRouter } from 'react-router-dom';
import { Layout } from './shell/Layout';

export function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
```

`web/app/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run app/shell`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `cd web && npx tsc --noEmit`
Expected: no output.

```bash
git add web/index.html web/app
git commit -m "web: app shell with sidebar, season pill, and light/dark themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Home dashboard and Calendar page

**Files:**
- Create: `web/app/pages/Home.tsx`, `web/app/pages/CalendarPage.tsx`, `web/app/pages/pages.css`
- Modify: `web/app/shell/Layout.tsx` (swap the `/` and `/calendar` placeholders)
- Test: `web/app/pages/Home.test.tsx`, `web/app/pages/CalendarPage.test.tsx`

**Interfaces:**
- Consumes: `useDoc`, `putDoc`, `currentStepIndex`, `markCurrentDone`, `reopenLast`, `LEAGUES`, `LEAGUE_LABEL`, `MetaFile`, `CalendarFile`, `SummaryFile`
- Produces: `<Home />`, `<CalendarPage />`

Continue ▸ goes to `/league/<league>` for a league step, and to `/calendar` for an offseason step.

- [ ] **Step 1: Write the failing tests**

`web/app/pages/Home.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'calendar.json': { season: 79, steps: [
    { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: true },
    { id: 'fba-d2', label: 'FBA D2', kind: 'league', league: 'fbad2', sub: false, done: false },
  ] },
  'leagues/fba/S78/summary.json': { league: 'fba', season: 78, locked: true, host: null, champions: [{ title: 'FBA Champion', champion: 'Boston Bucks', runnerUp: 'Memphis Blues', score: '4-1' }] },
  'leagues/fbad2/S78/summary.json': { league: 'fbad2', season: 78, locked: true, host: null, champions: [{ title: 'Premier League Champion', champion: 'Salzburg', runnerUp: 'Zurich', score: '4-1' }] },
  'leagues/fbajc/S78/summary.json': { league: 'fbajc', season: 78, locked: true, host: null, champions: [{ title: 'National Champion', champion: 'North Carolina', runnerUp: 'Syracuse', score: null }] },
  'leagues/fbawc/S78/summary.json': { league: 'fbawc', season: 78, locked: true, host: 'Croatia', champions: [{ title: 'World Cup Champion', champion: 'Germany', runnerUp: 'Italy', score: null }] },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Home', () => {
  it('shows the next step with a Continue link to that league', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByText('Play FBAD2 S79')).toBeTruthy();
    expect(screen.getByRole('link', { name: /continue/i }).getAttribute('href')).toBe('/league/fbad2');
  });

  it('lists last champions for every league', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByText('Boston Bucks')).toBeTruthy();
    expect(await screen.findByText('Salzburg')).toBeTruthy();
    expect(await screen.findByText('North Carolina')).toBeTruthy();
    expect(await screen.findByText('Germany')).toBeTruthy();
    expect(screen.getByText(/host: Croatia/)).toBeTruthy();
  });
});
```

`web/app/pages/CalendarPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

let saved: unknown = null;
const calendar = { season: 79, steps: [
  { id: 'age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'fa', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  saved = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return new Response('{"ok":true}'); }
    return new Response(JSON.stringify(saved ?? calendar));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CalendarPage', () => {
  it('marks the current step done', async () => {
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /mark "Free Agency\/Offseason" done/i }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as typeof calendar).steps.map(s => s.done)).toEqual([true, true, false]);
  });

  it('reopens the last finished step', async () => {
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /reopen previous step/i }));
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as typeof calendar).steps.map(s => s.done)).toEqual([false, false, false]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run app/pages`
Expected: FAIL, cannot resolve `./Home` and `./CalendarPage`.

- [ ] **Step 3: Implement**

`web/app/pages/pages.css`:
```css
.hero { display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: 10px; color: #fff; background: linear-gradient(120deg, var(--hero-from), var(--hero-to)); margin-bottom: 16px; }
.hero img { width: 64px; height: 64px; object-fit: contain; }
.hero .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; opacity: 0.7; text-transform: uppercase; }
.hero .title { font-family: var(--font-head); font-size: 22px; font-weight: 800; text-transform: var(--head-transform); }
.hero .btn.primary { margin-left: auto; }
.champ-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--border); }
.champ-row:last-child { border-bottom: 0; }
.champ-row b { text-align: right; }
.steps { list-style: none; margin: 0; padding: 0; }
.steps li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.steps li:last-child { border-bottom: 0; }
.steps li.sub { padding-left: 34px; font-size: 13px; }
.steps li.done { color: var(--muted); }
.steps li.current { background: var(--accent-soft); color: var(--accent); font-weight: 700; border-radius: 6px; }
.steps .mark { width: 20px; text-align: center; }
.steps .tag { margin-left: auto; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 8px; background: var(--surface-2); border: 1px solid var(--border); color: var(--muted); }
.cal-actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
```

`web/app/pages/Home.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { currentStepIndex } from '../../engine/shared/calendar';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile, LeagueId, MetaFile, SummaryFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import './pages.css';

function ChampionRows({ league, meta }: { league: LeagueId; meta: MetaFile | undefined }) {
  const season = meta?.lastSeason[league];
  const { data } = useDoc<SummaryFile>(season === undefined ? null : `leagues/${league}/S${season}/summary.json`);
  if (!data) return null;
  if (!data.champions.length) {
    return <div className="champ-row"><span>{LEAGUE_LABEL[league]} S{data.season}</span><span className="muted">—</span></div>;
  }
  return (
    <>
      {data.champions.map(c => (
        <div className="champ-row" key={c.title}>
          <span>
            {LEAGUE_LABEL[league]} S{data.season} · {c.title}
            {data.host && <span className="muted"> (host: {data.host})</span>}
          </span>
          <b>{c.champion}</b>
        </div>
      ))}
    </>
  );
}

export function Home() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const { data: meta } = useDoc<MetaFile>('meta.json');
  if (error) return <p className="error">Couldn't load the calendar: {error.message}. Is the data server running?</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const step = i < 0 ? null : cal.steps[i];
  const title = !step ? `Season ${cal.season} complete` : step.kind === 'league' && step.league ? `Play ${LEAGUE_LABEL[step.league]} S${cal.season}` : step.label;
  const target = step?.kind === 'league' && step.league ? `/league/${step.league}` : '/calendar';

  return (
    <section>
      <div className="hero">
        <img src="/logos/FBA/1" alt="" />
        <div>
          <div className="eyebrow">Up next</div>
          <div className="title">{title}</div>
        </div>
        <Link className="btn primary" to={target}>Continue ▸</Link>
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Last champions</h3>
          {LEAGUES.map(lg => <ChampionRows key={lg} league={lg} meta={meta} />)}
        </div>
      </div>
    </section>
  );
}
```

`web/app/pages/CalendarPage.tsx`:
```tsx
import { useState } from 'react';
import { currentStepIndex, markCurrentDone, reopenLast } from '../../engine/shared/calendar';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { CalendarFile } from '../../engine/shared/types';
import { putDoc, useDoc } from '../api';
import './pages.css';

export function CalendarPage() {
  const { data: cal, error } = useDoc<CalendarFile>('calendar.json');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <p className="error">Couldn't load the calendar: {error.message}</p>;
  if (!cal) return <p className="muted">Loading…</p>;

  const i = currentStepIndex(cal);
  const save = async (next: CalendarFile) => {
    setBusy(true);
    setSaveError(null);
    try {
      await putDoc('calendar.json', next);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>Season {cal.season} calendar</h1>
      <div className="cal-actions">
        {i >= 0 && (
          <button className="btn primary" disabled={busy} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark “{cal.steps[i].label}” done
          </button>
        )}
        <button className="btn" disabled={busy || i === 0} onClick={() => save(reopenLast(cal))} aria-label="Reopen previous step">
          ↺ Reopen previous step
        </button>
      </div>
      {saveError && <p className="error">Save failed: {saveError}</p>}
      <p className="muted">Until each league and offseason tool is built, mark steps done here once you've handled them.</p>
      <div className="card">
        <ol className="steps">
          {cal.steps.map((s, j) => (
            <li key={s.id} className={[s.sub ? 'sub' : '', s.done ? 'done' : '', j === i ? 'current' : ''].join(' ')}>
              <span className="mark">{s.done ? '✓' : j === i ? '▶' : '•'}</span>
              <span>{s.label}</span>
              {s.league && <span className="tag">{LEAGUE_LABEL[s.league]}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

Modify `web/app/shell/Layout.tsx`: add the imports
```tsx
import { CalendarPage } from '../pages/CalendarPage';
import { Home } from '../pages/Home';
```
and replace the first two routes with:
```tsx
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run app`
Expected: PASS (Layout, Home, CalendarPage).

- [ ] **Step 5: Commit**

```bash
git add web/app
git commit -m "web: home dashboard with Continue and a working season calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: League and team roster pages

**Files:**
- Create: `web/app/components/rosterColumns.ts`, `web/app/components/TeamMark.tsx`, `web/app/components/RosterTable.tsx`, `web/app/pages/LeaguePage.tsx`, `web/app/pages/TeamPage.tsx`, `web/app/pages/league.css`
- Modify: `web/app/shell/Layout.tsx` (swap the league/team placeholders)
- Test: `web/app/components/rosterColumns.test.ts`, `web/app/pages/LeaguePage.test.tsx`

**Interfaces:**
- Consumes: `useDoc`, `isLeagueId`, `groupLabel`, `LEAGUE_LABEL`, `TeamsFile`, `RostersFile`, `PlayersFile`, `MetaFile`, `RosterEntry`, `Team`
- Produces:
  ```ts
  interface Column { label: string; value: (e: RosterEntry, name: string) => string; numeric?: boolean }
  function rosterColumns(league: LeagueId): Column[]
  function playerLabel(e: RosterEntry, players: Record<string, Player>): string   // 'Vacant' | 'Unnamed' | name
  function formatContract(e: RosterEntry): string                                 // 'S81 · $6' | '—'
  function formatStars(e: RosterEntry): string                                    // '★★★★' | '—'
  function teamRating(entries: RosterEntry[]): number | null                     // rounded mean of known ratings
  <TeamMark team season size? />, <RosterTable league entries players />, <LeaguePage />, <TeamPage />
  ```

- [ ] **Step 1: Write the failing tests**

`web/app/components/rosterColumns.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../../engine/shared/types';
import { formatContract, formatStars, playerLabel, rosterColumns, teamRating } from './rosterColumns';

const e = (over: Partial<RosterEntry>): RosterEntry => ({ playerId: 'p00001', position: 'PG', rating: 90, age: 25, points: 0, ...over });

describe('roster helpers', () => {
  it('labels players, vacancies, and unnamed players', () => {
    const players = { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: null, birthSeason: null } };
    expect(playerLabel(e({}), players)).toBe('Gabriel Greenwood');
    expect(playerLabel(e({ playerId: null }), players)).toBe('Vacant');
    expect(playerLabel(e({ playerId: 'p00002' }), players)).toBe('Unnamed');
  });
  it('formats contracts and stars', () => {
    expect(formatContract(e({ contractEnd: 81, contractAmount: 6 }))).toBe('S81 · $6');
    expect(formatContract(e({ contractEnd: null }))).toBe('—');
    expect(formatStars(e({ stars: 4 }))).toBe('★★★★');
    expect(formatStars(e({ stars: null }))).toBe('—');
  });
  it('averages known ratings', () => {
    expect(teamRating([e({ rating: 90 }), e({ rating: 81 }), e({ rating: null })])).toBe(86);
    expect(teamRating([e({ rating: null })])).toBeNull();
  });
  it('picks columns per league', () => {
    expect(rosterColumns('fba').map(c => c.label)).toEqual(['Pos', 'Player', 'Age', 'Rating', 'Contract']);
    expect(rosterColumns('fbajc').map(c => c.label)).toEqual(['Pos', 'Player', 'Recruit', 'Class', 'Rating']);
    expect(rosterColumns('fbad2').map(c => c.label)).toEqual(['Pos', 'Player', 'Age', 'Rating']);
  });
});
```

`web/app/pages/LeaguePage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaguePage } from './LeaguePage';
import { TeamPage } from './TeamPage';

const badge = { bg: 'hsl(10 55% 36%)', fg: '#ffffff' };
const docs: Record<string, unknown> = {
  'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
  'players.json': { nextId: 3, players: { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: 'Ivory Huntley', birthSeason: 53 } } },
  'leagues/fba/teams.json': { league: 'fba', teams: [
    { teamId: 'BOS', name: 'Boston Bucks', abbr: 'BOS', group: 'E', logoFolder: 'Boston Bucks', badge },
    { teamId: 'MEM', name: 'Memphis Blues', abbr: 'MEM', group: 'W', logoFolder: null, badge },
  ] },
  'leagues/fba/S79/rosters.json': { league: 'fba', season: 79, locked: false, teams: {
    BOS: [{ playerId: 'p00001', position: 'PG', rating: 95, age: 28, points: 0, contractEnd: 80, contractAmount: 8 }, { playerId: null, position: 'SG', rating: null, age: null, points: 0, contractEnd: null, contractAmount: null }],
    MEM: [{ playerId: 'p00002', position: 'PG', rating: 97, age: 26, points: 0, contractEnd: 81, contractAmount: 9 }],
  } },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const doc = docs[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/league/:league" element={<LeaguePage />} />
      <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('LeaguePage', () => {
  it('groups teams by conference with ratings', async () => {
    renderAt('/league/fba');
    expect(await screen.findByText('Eastern Conference')).toBeTruthy();
    expect(screen.getByText('Western Conference')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Boston Bucks/ }).getAttribute('href')).toBe('/league/fba/team/BOS');
    expect(screen.getByText('97')).toBeTruthy();
  });

  it('rejects an unknown league', () => {
    renderAt('/league/nba');
    expect(screen.getByText(/Unknown league/)).toBeTruthy();
  });
});

describe('TeamPage', () => {
  it('shows the roster with contract and vacancy', async () => {
    renderAt('/league/fba/team/BOS');
    expect(await screen.findByText('Gabriel Greenwood')).toBeTruthy();
    expect(screen.getByText('S80 · $8')).toBeTruthy();
    expect(screen.getByText('Vacant')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Boston Bucks logo' }).getAttribute('src')).toBe('/logos/Boston%20Bucks/79');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run app/components app/pages/LeaguePage`
Expected: FAIL, cannot resolve `./rosterColumns`, `./LeaguePage`, and `./TeamPage`.

- [ ] **Step 3: Implement**

`web/app/components/rosterColumns.ts`:
```ts
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';

export interface Column {
  label: string;
  value: (e: RosterEntry, name: string) => string;
  numeric?: boolean;
}

export function playerLabel(e: RosterEntry, players: Record<string, Player>): string {
  if (e.playerId === null) return 'Vacant';
  return players[e.playerId]?.name ?? 'Unnamed';
}

export function formatContract(e: RosterEntry): string {
  if (e.contractEnd === null || e.contractEnd === undefined) return '—';
  return `S${e.contractEnd}` + (e.contractAmount === null || e.contractAmount === undefined ? '' : ` · $${e.contractAmount}`);
}

export function formatStars(e: RosterEntry): string {
  return e.stars ? '★'.repeat(e.stars) : '—';
}

export function teamRating(entries: RosterEntry[]): number | null {
  const ratings = entries.map(e => e.rating).filter((r): r is number => r !== null);
  return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
}

const dash = (n: number | null) => (n === null ? '—' : String(n));

export function rosterColumns(league: LeagueId): Column[] {
  const pos: Column = { label: 'Pos', value: e => e.position };
  const player: Column = { label: 'Player', value: (_e, name) => name };
  const age: Column = { label: 'Age', value: e => dash(e.age), numeric: true };
  const rating: Column = { label: 'Rating', value: e => dash(e.rating), numeric: true };
  switch (league) {
    case 'fba':
      return [pos, player, age, rating, { label: 'Contract', value: formatContract }];
    case 'fbajc':
      return [pos, player, { label: 'Recruit', value: formatStars }, { label: 'Class', value: e => e.classYear ?? '—' }, rating];
    default:
      return [pos, player, age, rating];
  }
}
```

`web/app/components/TeamMark.tsx`:
```tsx
import type { Team } from '../../engine/shared/types';

export function TeamMark({ team, season, size = 32 }: { team: Team; season: number; size?: number }) {
  if (team.logoFolder) {
    return (
      <img
        className="team-mark"
        src={`/logos/${encodeURIComponent(team.logoFolder)}/${season}`}
        width={size}
        height={size}
        alt={`${team.name} logo`}
      />
    );
  }
  return (
    <span
      className="team-badge"
      aria-hidden="true"
      style={{ background: team.badge.bg, color: team.badge.fg, width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
    >
      {team.abbr.slice(0, 4)}
    </span>
  );
}
```

`web/app/components/RosterTable.tsx`:
```tsx
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';

export function RosterTable({ league, entries, players }: { league: LeagueId; entries: RosterEntry[]; players: Record<string, Player> }) {
  const columns = rosterColumns(league);
  return (
    <table className="roster">
      <thead>
        <tr>{columns.map(c => <th key={c.label} className={c.numeric ? 'num' : ''}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const name = playerLabel(e, players);
          return (
            <tr key={`${e.position}-${i}`} className={e.playerId === null ? 'vacant' : ''}>
              {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

`web/app/pages/league.css`:
```css
.league-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.group { margin-bottom: 20px; }
.group h2 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-body); }
.team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.team-card { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.team-card:hover { border-color: var(--accent); }
.team-card .name { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.team-card .rtg { font-weight: 800; font-variant-numeric: tabular-nums; }
.team-mark { object-fit: contain; flex: none; }
.team-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: 800; flex: none; letter-spacing: 0.02em; }
.team-hero { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.team-hero h1 { margin: 0; }
.roster { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.roster th, .roster td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--border); }
.roster th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); background: var(--surface-2); }
.roster .num { text-align: right; font-variant-numeric: tabular-nums; }
.roster tr.vacant td { color: var(--muted); font-style: italic; }
.roster tr:last-child td { border-bottom: 0; }
.table-wrap { overflow-x: auto; }
```

`web/app/pages/LeaguePage.tsx`:
```tsx
import { Link, useParams } from 'react-router-dom';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, RostersFile, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { teamRating } from '../components/rosterColumns';
import { TeamMark } from '../components/TeamMark';
import './league.css';

export function LeaguePage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams, error } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);

  if (!valid) return <p className="error">Unknown league “{league}”.</p>;
  if (error) return <p className="error">Couldn't load teams: {error.message}</p>;
  if (!teams || !rosters || season === undefined) return <p className="muted">Loading…</p>;

  const groups = new Map<string | null, Team[]>();
  for (const t of teams.teams) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);

  return (
    <section>
      <div className="league-head">
        <h1>{LEAGUE_LABEL[league]}</h1>
        <span className="muted">S{season} rosters · {teams.teams.length} teams{rosters.locked ? ' · final (locked)' : ''}</span>
      </div>
      {[...groups.entries()].map(([code, list]) => (
        <div className="group" key={code ?? 'all'}>
          <h2>{groupLabel(league, code)}</h2>
          <div className="team-grid">
            {[...list].sort((a, b) => a.name.localeCompare(b.name)).map(t => (
              <Link key={t.teamId} className="team-card" to={`/league/${league}/team/${t.teamId}`}>
                <TeamMark team={t} season={season} />
                <span className="name">{t.name}</span>
                <span className="rtg">{teamRating(rosters.teams[t.teamId] ?? []) ?? '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
```

`web/app/pages/TeamPage.tsx`:
```tsx
import { Link, useParams } from 'react-router-dom';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, RostersFile, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { RosterTable } from '../components/RosterTable';
import { teamRating } from '../components/rosterColumns';
import { TeamMark } from '../components/TeamMark';
import './league.css';

export function TeamPage() {
  const { league = '', teamId = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);

  if (!valid) return <p className="error">Unknown league “{league}”.</p>;
  if (!teams || !players || !rosters || season === undefined) return <p className="muted">Loading…</p>;
  const team = teams.teams.find(t => t.teamId === teamId);
  if (!team) return <p className="error">No team “{teamId}” in {LEAGUE_LABEL[league]}.</p>;
  const entries = rosters.teams[team.teamId] ?? [];

  return (
    <section>
      <p><Link to={`/league/${league}`} className="muted">← {LEAGUE_LABEL[league]}</Link></p>
      <div className="team-hero">
        <TeamMark team={team} season={season} size={72} />
        <div>
          <h1>{team.name}</h1>
          <div className="muted">{groupLabel(league, team.group)} · S{season} · Team rating {teamRating(entries) ?? '—'}</div>
        </div>
      </div>
      <div className="table-wrap">
        <RosterTable league={league} entries={entries} players={players.players} />
      </div>
    </section>
  );
}
```

Modify `web/app/shell/Layout.tsx`: add the imports
```tsx
import { LeaguePage } from '../pages/LeaguePage';
import { TeamPage } from '../pages/TeamPage';
```
and replace the two league routes with:
```tsx
          <Route path="/league/:league" element={<LeaguePage />} />
          <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run app`
Expected: PASS (all app tests).

- [ ] **Step 5: Typecheck and commit**

Run: `cd web && npx tsc --noEmit`
Expected: no output.

```bash
git add web/app
git commit -m "web: league team grids and team roster pages with logos and badges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: End-to-end verification and README

**Files:**
- Create: `.claude/launch.json`
- Modify: `README.md` (append a "Web app" section)

- [ ] **Step 1: Run the whole test suite and typecheck**

Run: `cd web && npm test && npx tsc --noEmit`
Expected: every test file passes; tsc prints nothing.

- [ ] **Step 2: Add the launch config**

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "fba-web",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "web", "run", "dev"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 3: Verify in the browser**

Start `fba-web` (preview_start or `npm --prefix web run dev`) and open http://localhost:5173. Check each item and fix anything that fails:
1. The top bar shows the FBA logo, "FBA Universe", and the pill **S79 · Free Agency/Offseason**.
2. Home shows "Free Agency/Offseason" under Up next, Continue goes to `/calendar`, and the last champions are Boston Bucks (FBA), four FBAD2 league champions, North Carolina (FBAJC), and Germany (World Cup, host Croatia).
3. On Calendar, **Mark done** advances the pill to the next step and **Reopen previous step** moves it back. Leave it on Free Agency when you finish.
4. FBA shows Eastern and Western groups of 15 with logos. DCB shows its S79 logo. Carolina Knights shows a Vacant C row, and Vegas Volts shows a Vacant PF row.
5. FBAD2 shows 4 leagues of 16 with badges, FBAJC shows 18 conferences of 12 with star and class columns, and World Cup shows 85 teams.
6. The dark theme toggle switches to navy with condensed headings and persists after a reload.
7. At phone width (375px) nothing scrolls horizontally except roster tables inside their wrapper.

- [ ] **Step 4: Update the README**

Append to `README.md`:
```markdown

## Web app (`web/`)

A browser version of all four leagues. The Java programs above are kept as the reference (git tag `java-v1`).

    cd web
    npm install
    npm run dev        # app on http://localhost:5173, data server on 127.0.0.1:5174
    npm test           # engine, importer, server, and UI tests

League data lives in `web/data/` as JSON and is committed like the old `.txt` files. `npm run import` rebuilt it from the `.txt` files and Google Sheets once. Re-running it needs `-- --force` and overwrites all league data. The design is in `docs/superpowers/specs/2026-09-25-fba-web-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add .claude/launch.json README.md
git commit -m "web: launch config and README for the web app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
