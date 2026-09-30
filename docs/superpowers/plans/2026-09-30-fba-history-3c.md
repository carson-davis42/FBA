# FBA history 3c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Franchise trophy cases with era logos, draft history, past transactions and a league timeline in the History section.

**Architecture:** Three new read-only import modes write three new docs (`draftHistory.json`, `pastTransactions.json`, `events.json`). Trophy cases are derived in the engine from the summaries, the Hall of Fame and the franchise eras. Six new History pages read them.

**Tech Stack:** Vite 5, React 18, React Router 6, TypeScript 5, zod 3 (strict), Vitest 2 + jsdom.

Spec: `docs/superpowers/specs/2026-09-30-fba-history-3c-design.md` (T1–T6).

## Global Constraints

- Run all commands from `web/`: `npx vitest run [paths]` for tests, and `npx tsc --noEmit`, which must print nothing.
- Never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/` or `web/data/**`. Never run an import against `web/data`. Never start or stop anything on ports 5173/5174.
- The user has uncommitted changes under `FBA Logos/`, `FBA/` and `web/data/`. Stage files only by explicit path (never `git add -A` or `git add .`).
- Leave no stray files in the repo. Scratch goes in `.superpowers/sdd/` (git-ignored).
- Schemas are strict zod (`.strict()`) in `engine/shared/types.ts`, and every saved doc has a path rule in `engine/shared/schemaRegistry.ts`.
- Vitest globals are off. Every jsdom test file starts with `// @vitest-environment jsdom`, imports from `vitest`, and calls `cleanup()` in `afterEach`.
- New import modes require `--data <dir>` (via `parseDataArg`), validate their doc against its schema before writing, and write nothing else.
- History pages follow the existing pattern (`app/history/*.tsx`): `PageHeader`, `useDoc`, `useFbaTeams`, `TeamFull` for era names and logos, `PlayerLink` for players, and `history.css`.
- Missing docs show `<p className="muted">…</p>` with the import command (e.g. "No draft history yet. Run `npm run import -- --drafts --data data`.").
- Season text is "S57". Season ranges use an en dash ("S57–S78", "S57–pres.").
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Baseline: 1472 tests passing.

## File map

| File | Task | Role |
|---|---|---|
| `engine/shared/types.ts` (append) | 1 | DraftHistoryFile, PastTransactionsFile, EventsFile schemas |
| `engine/shared/schemaRegistry.ts` | 1 | 3 path rules |
| `engine/shared/franchises.ts` | 1 | `franchiseByAbbr` |
| `importers/sheets/drafts.ts`, `importers/draftHistory.ts` | 2 | draft tab parser + builder |
| `importers/sheets/transactions.ts`, `importers/pastTransactions.ts` | 3 | Transactions tab parser + builder |
| `importers/sheets/events.ts`, `importers/history/ruleChanges.json` | 4 | Events tab parser + curated rules |
| `importers/run.ts` | 2,3,4,5 | `--drafts`, `--transactions`, `--events`, `--check-trophies` |
| `engine/history/trophies.ts`, `importers/sheets/teamTabs.ts` | 5 | trophy derivation + team-tab count row parser |
| `app/history/TeamsHistoryPage.tsx`, `FranchisePage.tsx`, `EraStrip.tsx` | 6 | teams grid, franchise page |
| `app/history/DraftsPage.tsx`, `DraftSeasonPage.tsx` | 7 | draft history |
| `app/history/PastTransactionsPage.tsx` | 8 | transactions |
| `app/history/TimelinePage.tsx`, `engine/history/timeline.ts` | 9 | events timeline |
| `app/shell/Layout.tsx`, `app/history/HistoryHome.tsx` | 6–9 | one route and one hub card per page |

---

### Task 1: Schemas, registry and `franchiseByAbbr`

**Files:**
- Modify: `engine/shared/types.ts` (append at the end of the file, so `int` and `playerId` are already defined)
- Modify: `engine/shared/schemaRegistry.ts`
- Modify: `engine/shared/franchises.ts`
- Test: `engine/shared/types.test.ts`, `engine/shared/schemaRegistry.test.ts`, `engine/shared/franchises.test.ts` (add cases)

**Interfaces:**
- Produces: the types `DraftHistoryPick`, `DraftHistoryDraft`, `DraftHistoryFile`, `PastAsset`, `PastMove`, `PastTransaction`, `PastTransactionsFile`, `EventsFile`, and `franchiseByAbbr(file: FranchisesFile | null | undefined, abbr: string, season: number): { teamId: string; era: FranchiseEra | null } | null`.

- [ ] **Step 1: Write failing tests.** Add to `types.test.ts`:

```ts
describe('3c history docs', () => {
  const pick = { pick: 1, teamId: 'SEA', teamName: 'Seattle', viaTeamId: 'OV', name: 'Soren Lindberg', playerId: null, pos: 'PG', detail: 'Freshman', college: 'Arizona' };
  it('accepts a draft history and numbers drafted picks 1..n', () => {
    const ok = { drafts: [{ season: 78, kind: 'draft', picks: [pick, { ...pick, pick: null, teamId: null, teamName: null, viaTeamId: null }] }] };
    expect(DraftHistoryFile.safeParse(ok).success).toBe(true);
    expect(DraftHistoryFile.safeParse({ drafts: [{ season: 78, kind: 'draft', picks: [{ ...pick, pick: 2 }] }] }).success).toBe(false);
    expect(DraftHistoryFile.safeParse({ drafts: [ok.drafts[0], ok.drafts[0]] }).success).toBe(false);
  });
  it('accepts past transactions of both kinds', () => {
    const asset = { text: 'OUT-Clay Peterson', pos: 'OUT', name: 'Clay Peterson', playerId: null };
    const doc = { seasons: [{ season: 33, entries: [
      { kind: 'trade', teamIds: ['CGG', 'SAS'], when: 'Before Week 7', notes: [], moves: [{ to: 'CGG', asset }] },
      { kind: 'cut', teamId: 'CIN', when: null, asset },
    ] }] };
    expect(PastTransactionsFile.safeParse(doc).success).toBe(true);
    expect(PastTransactionsFile.safeParse({ seasons: [{ season: 33, entries: [{ kind: 'waived', teamId: 'CIN', when: null, asset }] }] }).success).toBe(false);
  });
  it('accepts events with ascending unique seasons', () => {
    const doc = { before: [{ label: 'FFL S20', notes: ['FFL Basketball Begins'] }], seasons: [{ season: 1, notes: ['FBA Begins'], rules: [] }, { season: 59, notes: [], rules: ['Draft every season'] }] };
    expect(EventsFile.safeParse(doc).success).toBe(true);
    expect(EventsFile.safeParse({ ...doc, seasons: [...doc.seasons].reverse() }).success).toBe(false);
  });
});
```

Add to `schemaRegistry.test.ts`: `schemaForPath('leagues/fba/draftHistory.json')` is `DraftHistoryFile`, `schemaForPath('leagues/fba/pastTransactions.json')` is `PastTransactionsFile`, and `schemaForPath('leagues/fba/events.json')` is `EventsFile`. Add to `franchises.test.ts` (using that file's existing fixture style):

```ts
describe('franchiseByAbbr', () => {
  const file: FranchisesFile = { franchises: [
    { teamId: 'SAS', eras: [
      { name: 'San Antonio Spirits', abbr: 'SAS', city: 'San Antonio, Texas', from: 57, to: null },
      { name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 56 },
    ] },
    { teamId: 'CAR', eras: [{ name: 'Cal Tech Knights', abbr: 'CT', city: 'x', from: 41, to: 67 }] },
  ] };
  it('maps an era abbreviation to the franchise in that season', () => {
    expect(franchiseByAbbr(file, 'USA', 20)?.teamId).toBe('SAS');
    expect(franchiseByAbbr(file, 'CT', 60)?.teamId).toBe('CAR');
  });
  it('uses the nearest era outside its range, then a current team id', () => {
    expect(franchiseByAbbr(file, 'CT', 70)?.teamId).toBe('CAR');
    expect(franchiseByAbbr({ franchises: [{ teamId: 'MW', eras: [{ name: 'Maine Wildcats', abbr: 'MNE', city: 'x', from: 1, to: null }] }] }, 'MW', 5)).toEqual({ teamId: 'MW', era: null });
  });
  it('gives null for an unknown code or no file', () => {
    expect(franchiseByAbbr(file, 'ZZZ', 5)).toBeNull();
    expect(franchiseByAbbr(null, 'USA', 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run engine/shared`. Expected: FAIL (the exports don't exist).

- [ ] **Step 3: Implement.** Append to `types.ts`:

```ts
/** leagues/fba/draftHistory.json: the sheet's past drafts (imported, 3c). */
export const DraftHistoryPick = z.object({
  /** Order among the drafted rows; null = undrafted. */
  pick: int.positive().nullable(),
  teamId: z.string().min(1).nullable(),
  /** The sheet's team text, e.g. "Cypress G"; null when undrafted. */
  teamName: z.string().min(1).nullable(),
  viaTeamId: z.string().min(1).nullable(),
  name: z.string().min(1),
  playerId: playerId.nullable(),
  pos: z.string().min(1),
  /** Class ("Freshman", "2xSenior", "S39", "X") or, for expansion drafts, age. */
  detail: z.string().min(1).nullable(),
  college: z.string().min(1).nullable(),
}).strict();
export type DraftHistoryPick = z.infer<typeof DraftHistoryPick>;
export const DraftHistoryDraft = z.object({ season: int.min(1), kind: z.enum(['draft', 'expansion']), picks: z.array(DraftHistoryPick) }).strict()
  .refine(d => d.picks.filter(p => p.pick !== null).every((p, i) => p.pick === i + 1), 'Drafted picks must be numbered 1..n in order');
export type DraftHistoryDraft = z.infer<typeof DraftHistoryDraft>;
export const DraftHistoryFile = z.object({ drafts: z.array(DraftHistoryDraft) }).strict()
  .refine(f => new Set(f.drafts.map(d => `${d.season}:${d.kind}`)).size === f.drafts.length, 'One draft of each kind per season');
export type DraftHistoryFile = z.infer<typeof DraftHistoryFile>;

export const PastAsset = z.object({ text: z.string().min(1), pos: z.string().min(1).nullable(), name: z.string().min(1).nullable(), playerId: playerId.nullable() }).strict();
export type PastAsset = z.infer<typeof PastAsset>;
export const PastMove = z.object({ to: z.string().min(1), asset: PastAsset }).strict();
export type PastMove = z.infer<typeof PastMove>;
const PastTrade = z.object({
  kind: z.literal('trade'), teamIds: z.array(z.string().min(1)).min(2), when: z.string().min(1).nullable(), notes: z.array(z.string().min(1)), moves: z.array(PastMove),
}).strict();
const PastTeamMove = z.object({ kind: z.enum(['cut', 'released', 'signed', 'acquired']), teamId: z.string().min(1), when: z.string().min(1).nullable(), asset: PastAsset }).strict();
export const PastTransaction = z.union([PastTrade, PastTeamMove]);
export type PastTransaction = z.infer<typeof PastTransaction>;
/** leagues/fba/pastTransactions.json: the sheet's Transactions tab (imported, 3c). */
export const PastTransactionsFile = z.object({ seasons: z.array(z.object({ season: int.min(1), entries: z.array(PastTransaction) }).strict()) }).strict()
  .refine(f => f.seasons.every((s, i) => i === 0 || s.season > f.seasons[i - 1].season), 'Seasons ascend without repeats');
export type PastTransactionsFile = z.infer<typeof PastTransactionsFile>;

/** leagues/fba/events.json: Events-tab notes and curated rule changes (imported, 3c). */
export const EventsFile = z.object({
  before: z.array(z.object({ label: z.string().min(1), notes: z.array(z.string().min(1)).min(1) }).strict()),
  seasons: z.array(z.object({ season: int.min(1), notes: z.array(z.string().min(1)), rules: z.array(z.string().min(1)) }).strict()),
}).strict().refine(f => f.seasons.every((s, i) => i === 0 || s.season > f.seasons[i - 1].season), 'Seasons ascend without repeats');
export type EventsFile = z.infer<typeof EventsFile>;
```

In `schemaRegistry.ts`, import the three schemas and add them after the `franchises.json` rule:

```ts
  [/^leagues\/fba\/draftHistory\.json$/, DraftHistoryFile],
  [/^leagues\/fba\/pastTransactions\.json$/, PastTransactionsFile],
  [/^leagues\/fba\/events\.json$/, EventsFile],
```

In `franchises.ts`, pull out the shared helpers and add `franchiseByAbbr`. `franchiseAt` keeps its behaviour:

```ts
const covers = (e: FranchiseEra, season: number) => e.from <= season && (e.to === null || season <= e.to);
const distance = (e: FranchiseEra, season: number) => (season < e.from ? e.from - season : season - (e.to ?? season));
/** The covering hit (later-starting first), else the nearest one. */
function pick<T extends { era: FranchiseEra }>(hits: T[], season: number): T | null {
  if (!hits.length) return null;
  const covering = hits.filter(h => covers(h.era, season)).sort((a, b) => b.era.from - a.era.from);
  if (covering.length) return covering[0];
  return [...hits].sort((a, b) => distance(a.era, season) - distance(b.era, season) || b.era.from - a.era.from)[0];
}

/**
 * The franchise that used abbreviation `abbr` in `season` (sheets and imported awards store era codes: USA, CT, CP…),
 * else a franchise whose current teamId is `abbr` (era null). Null without a file or for an unknown code.
 */
export function franchiseByAbbr(file: FranchisesFile | null | undefined, abbr: string, season: number): { teamId: string; era: FranchiseEra | null } | null {
  if (!file) return null;
  const code = abbr.trim();
  const hit = pick(file.franchises.flatMap(f => f.eras.filter(e => e.abbr === code).map(era => ({ teamId: f.teamId, era }))), season);
  if (hit) return hit;
  const own = file.franchises.find(f => f.teamId === code);
  return own ? { teamId: own.teamId, era: null } : null;
}
```

Rewrite `franchiseAt`'s body to `return pick(hits, season)` after it builds `hits` (it keeps the alias lookup and the null-file check).

- [ ] **Step 4: Run** `npx vitest run engine/shared web/data.test.ts` then `npx tsc --noEmit`. Expected: PASS; tsc prints nothing.
- [ ] **Step 5: Commit** `git add engine/shared/types.ts engine/shared/types.test.ts engine/shared/schemaRegistry.ts engine/shared/schemaRegistry.test.ts engine/shared/franchises.ts engine/shared/franchises.test.ts`, message `feat(history): 3c doc schemas and franchiseByAbbr`.

---

### Task 2: Draft history import (`--drafts`)

**Files:**
- Create: `importers/sheets/drafts.ts`, `importers/sheets/drafts.test.ts`, `importers/draftHistory.ts`, `importers/draftHistory.test.ts`
- Modify: `importers/run.ts`

**Interfaces:**
- Consumes: `franchiseAt`, `franchiseByAbbr` (Task 1), `nameResolver` (`importers/history.ts`), `Report` (`importers/report.ts`).
- Produces: `parseDraftTab(rows: string[][]): DraftRow[]`, `draftTabKind(tab: string): { season: number; kind: 'draft' | 'expansion' } | null`, `resolveSheetTeam(file: FranchisesFile, text: string, season: number): string | null` (exported from `importers/draftHistory.ts`), `buildDraftHistory(tabs, ctx, report): DraftHistoryFile`. In `run.ts`: `requireDataDir(flag: string): string`, `readDataJson<T>(dir: string, rel: string): T | null`, `writeDoc(dir: string, rel: string, doc: unknown): void` (Tasks 3–5 reuse them).

Sheet facts: tabs `S49`, `S51`, `S53`, `S55`, `S57`, `S59`…`S79` are drafts, and `S59 Exp`, `S61 Exp`, `S63 Exp`, `S68 Exp` and `S75 exp` are expansion drafts. Ignore `S78 D2`-style tabs, `S79 Draft Board` and `S80`–`S83` (future picks). Rows are `TEAM | PLAYER | POSITION | CLASS-or-AGE | COLLEGE [| date]`, in pick order. The header row `TEAM | PLAYER | …` can sit at the bottom. Team text looks like `Seattle(via OV)`, `Cypress G(via STL)`, `Cal Tech`, `Former Pirates`, `DCB` or `Undrafted`.

- [ ] **Step 1: Failing tests** (`importers/sheets/drafts.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { draftTabKind, parseDraftTab } from './drafts';

describe('parseDraftTab', () => {
  it('reads picks in order, splits "(via X)", skips the header and blanks', () => {
    const rows = [
      ['Seattle(via OV)', 'Soren Lindberg', 'PG', 'Freshman', 'Arizona'],
      ['', '', '', '', ''],
      ['Undrafted', 'Cai Scott', 'SG', 'Senior', 'LSU'],
      ['TEAM', 'PLAYER', 'POSITION', 'CLASS', 'COLLEGE', '2026-04-23'],
    ];
    expect(parseDraftTab(rows)).toEqual([
      { team: 'Seattle', via: 'OV', name: 'Soren Lindberg', pos: 'PG', detail: 'Freshman', college: 'Arizona' },
      { team: 'Undrafted', via: null, name: 'Cai Scott', pos: 'SG', detail: 'Senior', college: 'LSU' },
    ]);
  });
});

describe('draftTabKind', () => {
  it('classifies tab names', () => {
    expect(draftTabKind('S49')).toEqual({ season: 49, kind: 'draft' });
    expect(draftTabKind('S75 exp')).toEqual({ season: 75, kind: 'expansion' });
    expect(draftTabKind('S68 Exp')).toEqual({ season: 68, kind: 'expansion' });
    expect(draftTabKind('S78 D2')).toBeNull();
    expect(draftTabKind('S79 Draft Board')).toBeNull();
  });
});
```

`importers/draftHistory.test.ts` builds a fixture `FranchisesFile` and `PlayersFile`:
- **SEA:** era `Seattle Shock` / `SEA`, from 59.
- **OV:** era `Ohio Valley` / `OV`, from 1.
- **CGG:** era `Cypress Green Guns` / `CGG`, 1–56.
- **CAR:** era `Cal Tech Knights` / `CT`, 41–67.
- **Players:** `p00001` Soren Lindberg.

It then asserts:
- `resolveSheetTeam(file, 'Seattle', 78)` is `'SEA'` (prefix of an era covering the season);
- `resolveSheetTeam(file, 'Cypress G', 49)` is `'CGG'` (alias);
- `resolveSheetTeam(file, 'Cal Tech', 49)` is `'CAR'`;
- `resolveSheetTeam(file, 'Nowhere', 49)` is `null`;
- `buildDraftHistory({ S78: rows, 'S75 exp': expRows }, { players, franchises: file, lastSeason: 79 }, report)` gives the drafts sorted by season then kind (`draft` before `expansion`), with the undrafted row as `{ pick: null, teamId: null, teamName: null, viaTeamId: null, … }`, pick 1 as `{ teamId: 'SEA', viaTeamId: 'OV', playerId: 'p00001' }`, and an unresolved team or player adding a `report.warn` whose topic is `'drafts'`.

- [ ] **Step 2: Run** `npx vitest run importers/sheets/drafts.test.ts importers/draftHistory.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `importers/sheets/drafts.ts`:

```ts
export interface DraftRow { team: string; via: string | null; name: string; pos: string; detail: string | null; college: string | null }

/** One draft tab: rows TEAM | PLAYER | POSITION | CLASS-or-AGE | COLLEGE in pick order; the header row may sit anywhere. */
export function parseDraftTab(rows: string[][]): DraftRow[] {
  const out: DraftRow[] = [];
  for (const r of rows) {
    const [team = '', name = '', pos = '', detail = '', college = ''] = r.map(c => (c ?? '').trim());
    if (!team || !name) continue;
    if (team.toUpperCase() === 'TEAM' && name.toUpperCase() === 'PLAYER') continue;
    const m = team.match(/^(.*?)\s*\(via\s+([^)]+)\)\s*$/i);
    out.push({ team: m ? m[1].trim() : team, via: m ? m[2].trim() : null, name, pos, detail: detail || null, college: college || null });
  }
  return out;
}

/** "S49" → draft, "S75 exp" → expansion; anything else (D2, Draft Board) → null. */
export function draftTabKind(tab: string): { season: number; kind: 'draft' | 'expansion' } | null {
  const m = tab.trim().match(/^S(\d+)(?:\s+(exp))?$/i);
  return m ? { season: Number(m[1]), kind: m[2] ? 'expansion' : 'draft' } : null;
}
```

`importers/draftHistory.ts`:

```ts
import { franchiseAt, franchiseByAbbr } from '../engine/shared/franchises';
import type { DraftHistoryDraft, DraftHistoryFile, FranchisesFile, PlayersFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import { draftTabKind, parseDraftTab } from './sheets/drafts';

/** Sheet shorthands that no era name starts with. */
const SHEET_TEAM_ALIASES: Record<string, string> = { 'Cypress G': 'Cypress Green Guns', 'Cypress B': 'Cypress Black Sox' };

/** A sheet team text in `season` → franchise id: exact era name, alias, abbreviation, then a unique era-name prefix among eras covering the season. */
export function resolveSheetTeam(file: FranchisesFile, text: string, season: number): string | null {
  const t = text.trim();
  const exact = franchiseAt(file, SHEET_TEAM_ALIASES[t] ?? t, season);
  if (exact) return exact.teamId;
  const byAbbr = franchiseByAbbr(file, t, season);
  if (byAbbr) return byAbbr.teamId;
  const covering = file.franchises.filter(f => f.eras.some(e => e.from <= season && (e.to === null || season <= e.to) && e.name.startsWith(`${t} `)));
  return covering.length === 1 ? covering[0].teamId : null;
}

export function buildDraftHistory(
  tabs: Record<string, string[][]>, ctx: { players: PlayersFile; franchises: FranchisesFile; lastSeason: number }, report: Report,
): DraftHistoryFile {
  const resolve = nameResolver(ctx.players, report, 'drafts');
  const drafts: DraftHistoryDraft[] = [];
  for (const [tab, rows] of Object.entries(tabs)) {
    const kind = draftTabKind(tab);
    if (!kind || kind.season > ctx.lastSeason) continue;
    let n = 0;
    const picks = parseDraftTab(rows).map(r => {
      const where = `${tab} ${r.name}`;
      if (r.team.toLowerCase() === 'undrafted') {
        return { pick: null, teamId: null, teamName: null, viaTeamId: null, name: r.name, playerId: resolve(r.name, where), pos: r.pos, detail: r.detail, college: r.college };
      }
      const teamId = resolveSheetTeam(ctx.franchises, r.team, kind.season);
      if (!teamId) report.warn('drafts', `Unresolved team "${r.team}" (${where})`);
      const viaTeamId = r.via ? franchiseByAbbr(ctx.franchises, r.via, kind.season)?.teamId ?? null : null;
      if (r.via && !viaTeamId) report.warn('drafts', `Unresolved via "${r.via}" (${where})`);
      return { pick: ++n, teamId, teamName: r.team, viaTeamId, name: r.name, playerId: resolve(r.name, where), pos: r.pos, detail: r.detail, college: r.college };
    });
    drafts.push({ season: kind.season, kind: kind.kind, picks });
  }
  drafts.sort((a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'draft' ? -1 : 1));
  return { drafts };
}
```

In `run.ts`, add these helpers after `dataDir()`:

```ts
/** The folder given with --data <dir>; exits when absent. Import modes that write history need an explicit folder. */
function requireDataDir(flag: string): string {
  const r = parseDataArg(process.argv, '');
  if ('error' in r || !r.dir) {
    console.error(`${flag} needs --data <dir>: the data folder to read and write (use a scratch copy first).`);
    process.exit(1);
  }
  return r.dir;
}
const readDataJson = <T>(dir: string, rel: string): T | null => {
  const file = path.join(dir, ...rel.split('/'));
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
};
/** Validates `doc` against its path's schema, then writes it; exits without writing on a schema failure. */
function writeDoc(dir: string, rel: string, doc: unknown): void {
  const checked = schemaForPath(rel)?.safeParse(doc);
  if (!checked?.success) {
    console.error(`The built ${rel} fails its schema; nothing was written.${checked && !checked.success ? `\n${checked.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`).join('\n')}` : ''}`);
    process.exit(1);
  }
  const file = path.join(dir, ...rel.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Wrote ${file}.`);
}
/** Prints a report's warnings and errors to the console (3c imports write no report file). */
function printReport(report: Report): void {
  for (const e of report.entries.filter(x => x.level !== 'info')) console.warn(`${e.level}: [${e.topic}] ${e.message}`);
}
```

Then add the mode:

```ts
/** Reads the draft sheet's S49–S79 FBA and expansion drafts into leagues/fba/draftHistory.json. Writes nothing else. */
async function importDraftHistory(): Promise<void> {
  const dir = requireDataDir('--drafts');
  const players = readDataJson<PlayersFile>(dir, 'players.json');
  const franchises = readDataJson<FranchisesFile>(dir, 'leagues/fba/franchises.json');
  if (!players || !franchises) {
    console.error('--drafts needs players.json and leagues/fba/franchises.json in the data folder (run --franchises first).');
    process.exit(1);
  }
  rmSync(path.join(CACHE, `${SHEETS.draft}.xlsx`), { force: true });
  console.log('Downloading the draft history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.draft, CACHE), n => { const k = draftTabKind(n); return !!k && k.season <= 79; });
  const report = new Report();
  const doc = buildDraftHistory(tabs, { players, franchises, lastSeason: 79 }, report);
  printReport(report);
  for (const d of doc.drafts) console.log(`S${d.season} ${d.kind}: ${d.picks.filter(p => p.pick !== null).length} picks, ${d.picks.filter(p => p.pick === null).length} undrafted`);
  writeDoc(dir, 'leagues/fba/draftHistory.json', doc);
}
```

Add `'--drafts'` to `MODE_FLAGS` and `if (process.argv.includes('--drafts')) return importDraftHistory();` to `main()`. Import `draftTabKind` and `buildDraftHistory`.

- [ ] **Step 4: Run** `npx vitest run importers` then `npx tsc --noEmit`. Expected: PASS; tsc prints nothing. Do not run the import itself (the controller runs it on a scratch copy).
- [ ] **Step 5: Commit** the five files by path, message `feat(import): --drafts draft history`.

---

### Task 3: Past transactions import (`--transactions`)

**Files:**
- Create: `importers/sheets/transactions.ts`, `importers/sheets/transactions.test.ts`, `importers/pastTransactions.ts`, `importers/pastTransactions.test.ts`
- Modify: `importers/run.ts`

**Interfaces:**
- Consumes: `franchiseByAbbr` (Task 1); `requireDataDir`, `readDataJson`, `writeDoc`, `printReport` (Task 2); `nameResolver`.
- Produces: `parseTransactionsTab(rows: string[][]): { seasons: RawTxSeason[]; skipped: number; problems: string[] }`, `parseAsset(text: string): { pos: string; name: string } | null`, `buildPastTransactions(rows, ctx, report): PastTransactionsFile`.

Sheet facts (main sheet, tab `Transactions`; only columns A and B matter):
- Key rows come first (`Key:`, `Trade: ->`, …). `S33` alone starts a season.
- A trade header is `CGG/USA | Before Week 7`, followed by `->CGG | OUT-Clay Peterson` rows. Rows like `S78 Pick Swap | DCB GB` inside a trade are notes.
- A team block header is `CIN`, or `CT | Before Week 5` with timing, followed by `Cut | IN-Justin Hayes`, `Released | …`, `Signed | …`, `Acquired | …`.
- `Traded Away | …` and `Traded For | …` repeat the trades and are skipped.
- Asset text looks like `SF-Keon Whitfield`, `OUT-Clay Peterson`, `S41 Draft Pick(via MIL)`, `S79 Draft Pick(via MIL)(6P)` or `S47 6th Overall Pick(via OAK)`.

- [ ] **Step 1: Failing tests** (`importers/sheets/transactions.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { parseAsset, parseTransactionsTab } from './transactions';

const rows = [
  ['Key:'], ['Trade: ->'], ['Trade Deadline: Halfway through', 'season(S72-pres.)'],
  ['S33'], ['CGG/USA', 'Before Week 7'], ['->CGG', 'OUT-Clay Peterson'], ['->USA', 'S41 Draft Pick(via MIL)'], [''],
  ['S62'], ['BOS'], ['Cut', 'OUT-Webb Allen'], ['Signed', 'MID-Freddy King'],
  ['CT', 'Before Week 5'], ['Acquired', 'OUT-Mateo Mosley'],
  ['DCB/NY'], ['S78 Pick Swap', 'DCB GB'], ['->NY', 'PF-Morgan Meyer'],
  ['MW'], ['Traded Away', 'PF-Jamari Odom'], ['Released', 'C-Theon Campos'],
];

describe('parseTransactionsTab', () => {
  it('reads seasons, trades with timing and notes, and team blocks', () => {
    const { seasons, skipped, problems } = parseTransactionsTab(rows);
    expect(problems).toEqual([]);
    expect(skipped).toBe(1);
    expect(seasons.map(s => s.season)).toEqual([33, 62]);
    expect(seasons[0].entries).toEqual([{ kind: 'trade', codes: ['CGG', 'USA'], when: 'Before Week 7', notes: [], moves: [{ to: 'CGG', asset: 'OUT-Clay Peterson' }, { to: 'USA', asset: 'S41 Draft Pick(via MIL)' }] }]);
    expect(seasons[1].entries).toEqual([
      { kind: 'cut', code: 'BOS', when: null, asset: 'OUT-Webb Allen' },
      { kind: 'signed', code: 'BOS', when: null, asset: 'MID-Freddy King' },
      { kind: 'acquired', code: 'CT', when: 'Before Week 5', asset: 'OUT-Mateo Mosley' },
      { kind: 'trade', codes: ['DCB', 'NY'], when: null, notes: ['S78 Pick Swap — DCB GB'], moves: [{ to: 'NY', asset: 'PF-Morgan Meyer' }] },
      { kind: 'released', code: 'MW', when: null, asset: 'C-Theon Campos' },
    ]);
  });
  it('reports rows it cannot place', () => {
    expect(parseTransactionsTab([['S40'], ['Cut', 'OUT-X Y']]).problems).toHaveLength(1);
  });
});

describe('parseAsset', () => {
  it('splits player assets and leaves picks alone', () => {
    expect(parseAsset('C-Dennis Lofton')).toEqual({ pos: 'C', name: 'Dennis Lofton' });
    expect(parseAsset('SG-Joseph Reid-Jones')).toEqual({ pos: 'SG', name: 'Joseph Reid-Jones' });
    expect(parseAsset('S79 Draft Pick(via MIL)(6P)')).toBeNull();
  });
});
```

`importers/pastTransactions.test.ts` uses a fixture `FranchisesFile` (SAS with eras SAS from 57 and USA 1–56; CGG with CGG from 1) and a `PlayersFile` with `p00001` Clay Peterson. It asserts that `buildPastTransactions(rows, { players, franchises }, report)`:
- maps `USA` in S33 to `SAS` in both `teamIds` and `moves[].to`;
- sets `asset: { text: 'OUT-Clay Peterson', pos: 'OUT', name: 'Clay Peterson', playerId: 'p00001' }`;
- gives pick assets `pos: null, name: null, playerId: null`;
- keeps an unresolved code (e.g. `ZZ`) as-is, with a `report.warn` whose topic is `'transactions'`;
- puts the parse `problems` in as `report.warn`, and the skipped count as one `report.info`.

- [ ] **Step 2: Run** `npx vitest run importers/sheets/transactions.test.ts importers/pastTransactions.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `importers/sheets/transactions.ts`:

```ts
export type RawTx =
  | { kind: 'trade'; codes: string[]; when: string | null; notes: string[]; moves: { to: string; asset: string }[] }
  | { kind: 'cut' | 'released' | 'signed' | 'acquired'; code: string; when: string | null; asset: string };
export interface RawTxSeason { season: number; entries: RawTx[] }

const MOVE_KINDS: Record<string, 'cut' | 'released' | 'signed' | 'acquired'> = { cut: 'cut', released: 'released', signed: 'signed', acquired: 'acquired' };
const CODE = /^[A-Z]{2,4}$/;
const TRADE = /^[A-Z]{2,4}(?:\/[A-Z]{2,4})+$/;

/** The main sheet's Transactions tab (column A = header or kind, column B = asset or timing). */
export function parseTransactionsTab(rows: string[][]): { seasons: RawTxSeason[]; skipped: number; problems: string[] } {
  const seasons: RawTxSeason[] = [];
  const problems: string[] = [];
  let skipped = 0;
  let season: RawTxSeason | null = null;
  let block: { type: 'trade'; entry: Extract<RawTx, { kind: 'trade' }> } | { type: 'team'; code: string; when: string | null } | null = null;
  rows.forEach((r, i) => {
    const a = (r[0] ?? '').trim();
    const b = (r[1] ?? '').trim();
    if (!a && !b) { block = null; return; }
    const sm = a.match(/^S(\d+)$/);
    if (sm && !b) { season = { season: Number(sm[1]), entries: [] }; seasons.push(season); block = null; return; }
    if (!season) return;
    if (a.startsWith('->')) {
      if (block?.type === 'trade') block.entry.moves.push({ to: a.slice(2).trim(), asset: b });
      else problems.push(`row ${i + 1}: "${a} | ${b}" is outside a trade`);
      return;
    }
    const kind = MOVE_KINDS[a.toLowerCase()];
    if (kind) {
      if (block?.type === 'team') season.entries.push({ kind, code: block.code, when: block.when, asset: b });
      else problems.push(`row ${i + 1}: "${a} | ${b}" is outside a team block`);
      return;
    }
    if (/^traded (away|for)$/i.test(a)) { skipped++; return; }
    if (TRADE.test(a)) {
      const entry = { kind: 'trade' as const, codes: a.split('/'), when: b || null, notes: [] as string[], moves: [] as { to: string; asset: string }[] };
      season.entries.push(entry);
      block = { type: 'trade', entry };
      return;
    }
    if (CODE.test(a)) { block = { type: 'team', code: a, when: b || null }; return; }
    if (block?.type === 'trade') { block.entry.notes.push(b ? `${a} — ${b}` : a); return; }
    problems.push(`row ${i + 1}: "${a} | ${b}" not understood`);
  });
  return { seasons, skipped, problems };
}

/** "SF-Keon Whitfield" → pos + name; pick and other assets → null. */
export function parseAsset(text: string): { pos: string; name: string } | null {
  const m = text.trim().match(/^(PG|SG|SF|PF|C|IN|MID|OUT)-(.+)$/);
  return m ? { pos: m[1], name: m[2].trim() } : null;
}
```

Beware the TS narrowing of `block` inside `forEach` (`let` captured by a closure). If tsc complains, use a `for (let i = 0; i < rows.length; i++)` loop with `continue`.

`importers/pastTransactions.ts`:

```ts
import { franchiseByAbbr } from '../engine/shared/franchises';
import type { FranchisesFile, PastAsset, PastTransactionsFile, PlayersFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import { parseAsset, parseTransactionsTab } from './sheets/transactions';

export function buildPastTransactions(rows: string[][], ctx: { players: PlayersFile; franchises: FranchisesFile }, report: Report): PastTransactionsFile {
  const { seasons, skipped, problems } = parseTransactionsTab(rows);
  for (const p of problems) report.warn('transactions', p);
  report.info('transactions', `Skipped ${skipped} Traded Away / Traded For lines (they repeat the trades)`);
  const resolve = nameResolver(ctx.players, report, 'transactions');
  const team = (code: string, season: number) => {
    const id = franchiseByAbbr(ctx.franchises, code, season)?.teamId;
    if (!id) report.warn('transactions', `Unresolved team code ${code} (S${season})`);
    return id ?? code;
  };
  const asset = (text: string, season: number): PastAsset => {
    const p = parseAsset(text);
    return p ? { text, pos: p.pos, name: p.name, playerId: resolve(p.name, `S${season} transactions`) } : { text, pos: null, name: null, playerId: null };
  };
  const out = seasons.map(s => ({
    season: s.season,
    entries: s.entries.map(e => e.kind === 'trade'
      ? { kind: 'trade' as const, teamIds: e.codes.map(c => team(c, s.season)), when: e.when, notes: e.notes, moves: e.moves.map(m => ({ to: team(m.to, s.season), asset: asset(m.asset, s.season) })) }
      : { kind: e.kind, teamId: team(e.code, s.season), when: e.when, asset: asset(e.asset, s.season) }),
  }));
  // The sheet may list a season twice; merge in order so seasons ascend without repeats.
  const merged = new Map<number, PastTransactionsFile['seasons'][number]>();
  for (const s of out) merged.set(s.season, { season: s.season, entries: [...(merged.get(s.season)?.entries ?? []), ...s.entries] });
  return { seasons: [...merged.values()].sort((a, b) => a.season - b.season) };
}
```

Empty asset text: a move row with an empty column B would fail `PastAsset.text.min(1)`. Guard it in the parser: when `b` is empty on a `->` or a kind row, push a problem instead of an entry. Add one test row for this.

`run.ts`, mode `--transactions`:

```ts
/** Reads the main sheet's Transactions tab into leagues/fba/pastTransactions.json. Writes nothing else. */
async function importPastTransactions(): Promise<void> {
  const dir = requireDataDir('--transactions');
  const players = readDataJson<PlayersFile>(dir, 'players.json');
  const franchises = readDataJson<FranchisesFile>(dir, 'leagues/fba/franchises.json');
  if (!players || !franchises) {
    console.error('--transactions needs players.json and leagues/fba/franchises.json in the data folder (run --franchises first).');
    process.exit(1);
  }
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading the main history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Transactions']);
  const report = new Report();
  const doc = buildPastTransactions(tabs['Transactions'] ?? [], { players, franchises }, report);
  printReport(report);
  console.log(`${doc.seasons.length} seasons, ${doc.seasons.reduce((n, s) => n + s.entries.length, 0)} entries.`);
  writeDoc(dir, 'leagues/fba/pastTransactions.json', doc);
}
```

Add `'--transactions'` to `MODE_FLAGS` and its dispatch line to `main()`.

- [ ] **Step 4: Run** `npx vitest run importers` then `npx tsc --noEmit`. Expected: PASS; tsc prints nothing.
- [ ] **Step 5: Commit** by path, message `feat(import): --transactions past transactions`.

---

### Task 4: Events import (`--events`) and curated rule changes

**Files:**
- Create: `importers/sheets/events.ts`, `importers/sheets/events.test.ts`, `importers/history/ruleChanges.json`, `importers/history/ruleChanges.test.ts`
- Modify: `importers/run.ts`

**Interfaces:**
- Consumes: `requireDataDir`, `writeDoc` (Task 2).
- Produces: `parseEventsTab(rows: string[][]): { before: { label: string; notes: string[] }[]; seasons: { season: number; notes: string[] }[] }`, `buildEvents(parsed, rules: { season: number; lines: string[] }[]): EventsFile`.

Sheet facts (main sheet, tab `Events`): column A is `FFL S1`…`FFL S47`, then `S1`…`S78`; the note text is in the later columns. Only about 20 rows carry notes, e.g. `FFL S20 | FFL Basketball Begins`, `S1 | FBA Begins`, `S48 | FBA adds JC`.

- [ ] **Step 1: Failing tests** (`importers/sheets/events.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { buildEvents, parseEventsTab } from './events';

describe('events', () => {
  const rows = [['FFL S19'], ['FFL S20', 'FFL Basketball Begins'], ['S1', 'FBA Begins'], ['S2'], ['S11', 'FBA JC S3', '']];
  it('keeps rows with notes', () => {
    expect(parseEventsTab(rows)).toEqual({
      before: [{ label: 'FFL S20', notes: ['FFL Basketball Begins'] }],
      seasons: [{ season: 1, notes: ['FBA Begins'] }, { season: 11, notes: ['FBA JC S3'] }],
    });
  });
  it('merges rules by season, ascending', () => {
    const doc = buildEvents(parseEventsTab(rows), [{ season: 59, lines: ['Draft every season'] }, { season: 1, lines: ['After 2OT it is a tie'] }]);
    expect(doc.seasons).toEqual([
      { season: 1, notes: ['FBA Begins'], rules: ['After 2OT it is a tie'] },
      { season: 11, notes: ['FBA JC S3'], rules: [] },
      { season: 59, notes: [], rules: ['Draft every season'] },
    ]);
  });
});
```

`importers/history/ruleChanges.test.ts` reads the JSON (`import rules from './ruleChanges.json'`, or `readFileSync` if JSON imports aren't set up; check how `fbaBrackets.test.ts` loads `fbaBrackets.json` and do the same). It checks that:
- it's an array of `{ season: int ≥ 1, lines: non-empty string[] }`;
- the seasons strictly ascend;
- season 1 exists;
- some entry has `season: 59` with a line containing `Expansion`;
- no line is empty or only punctuation or whitespace.

- [ ] **Step 2: Run** `npx vitest run importers/sheets/events.test.ts importers/history/ruleChanges.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `importers/sheets/events.ts`:

```ts
import type { EventsFile } from '../../engine/shared/types';

export function parseEventsTab(rows: string[][]): { before: { label: string; notes: string[] }[]; seasons: { season: number; notes: string[] }[] } {
  const before: { label: string; notes: string[] }[] = [];
  const seasons: { season: number; notes: string[] }[] = [];
  for (const r of rows) {
    const a = (r[0] ?? '').trim();
    const notes = r.slice(1).map(c => (c ?? '').trim()).filter(Boolean);
    if (!notes.length) continue;
    if (/^FFL S\d+$/.test(a)) before.push({ label: a, notes });
    const m = a.match(/^S(\d+)$/);
    if (m) seasons.push({ season: Number(m[1]), notes });
  }
  return { before, seasons };
}

export function buildEvents(parsed: ReturnType<typeof parseEventsTab>, rules: { season: number; lines: string[] }[]): EventsFile {
  const by = new Map<number, { season: number; notes: string[]; rules: string[] }>();
  const at = (s: number) => by.get(s) ?? by.set(s, { season: s, notes: [], rules: [] }).get(s)!;
  for (const s of parsed.seasons) at(s.season).notes.push(...s.notes);
  for (const r of rules) at(r.season).rules.push(...r.lines);
  return { before: parsed.before, seasons: [...by.values()].sort((a, b) => a.season - b.season) };
}
```

Create `importers/history/ruleChanges.json` by hand from `docs/fba-rule-changes.md` (read the whole file; about 204 lines):
- Emit one `{ "season": n, "lines": [...] }` per season, in ascending order.
- The opening block (FBA S1–pres. rules, the offseason order list) goes under season 1.
- `Team Updates-S57` lines and `S57 ASG …` go under 57. Each `S59 - …` line goes under 59, and so on. A rule dated `S72-pres.` goes under 72.
- Strip leading `S59 - ` prefixes, code-fence markers and blank lines. Keep the doc's wording, one rule per line. Indented sub-lines (e.g. the 5pt contest details) join their parent line with ": " or become their own line, whichever reads cleanly.
- Don't invent rules.

`run.ts`, mode `--events`:

```ts
/** Reads the main sheet's Events tab plus importers/history/ruleChanges.json into leagues/fba/events.json. Writes nothing else. */
async function importEvents(): Promise<void> {
  const dir = requireDataDir('--events');
  rmSync(path.join(CACHE, `${SHEETS.main}.xlsx`), { force: true });
  console.log('Downloading the main history sheet...');
  const tabs = await readTabs(await downloadWorkbook(SHEETS.main, CACHE), ['Events']);
  const rules = JSON.parse(readFileSync(path.join(WEB, 'importers', 'history', 'ruleChanges.json'), 'utf8')) as { season: number; lines: string[] }[];
  const doc = buildEvents(parseEventsTab(tabs['Events'] ?? []), rules);
  console.log(`${doc.before.length} pre-FBA notes, ${doc.seasons.length} seasons with notes or rules.`);
  writeDoc(dir, 'leagues/fba/events.json', doc);
}
```

Add `'--events'` to `MODE_FLAGS` and its dispatch line.

- [ ] **Step 4: Run** `npx vitest run importers` then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** by path, message `feat(import): --events timeline notes and curated rule changes`.

---

### Task 5: Trophy case engine and `--check-trophies`

**Files:**
- Create: `engine/history/trophies.ts`, `engine/history/trophies.test.ts`, `importers/sheets/teamTabs.ts`, `importers/sheets/teamTabs.test.ts`
- Modify: `importers/run.ts`

**Interfaces:**
- Consumes: `franchiseByAbbr` (Task 1), `resolveHistoryTeam` (`engine/shared/franchises.ts`); `requireDataDir`, `readDataJson` (Task 2).
- Produces:

```ts
export const TROPHY_AWARDS = ['MVP', 'ROTY', 'PPK', 'LP', 'MC', 'DPOY', 'MIP'] as const;
export interface TrophyCase {
  championships: number[]; finals: number[]; confTitles: number[]; tournaments: number[];
  awards: { award: string; playerId: string; season: number }[];
  hallOfFamers: { name: string; playerId: string | null; season: string }[];
}
export interface TrophyInput { summaries: SummaryFile[]; teams: Team[]; franchises: FranchisesFile | null; hallOfFame: HallOfFameFile | null }
export function trophyCase(teamId: string, input: TrophyInput): TrophyCase;
export function parseTeamTabCounts(rows: string[][]): Record<string, number> | null; // importers/sheets/teamTabs.ts
```

Rules (spec §2):
- **Champion and runner-up:** from the `title === 'FBA Champion'` row. The ids are `teamId` / `runnerUpId` when set, else `resolveHistoryTeam(teams, franchises, name, season)?.team.teamId`.
- **Conference titles:** the `confChampions.E` / `.W` names resolved the same way. When `confChampions` is absent or null, use standings rows with `rank === 1` (resolve `row.name` with `row.teamId` as the id hint).
- **Tournament:** standings rows with `playoff !== null`. If there are none, every side name in `pastBracket.series` (home/away `name`). If there is none, the `bracket.seeds[].teams` ids.
- **Awards:** `summary.awards` whose `award` is in `TROPHY_AWARDS` and whose `franchiseByAbbr(franchises, a.teamId, season)?.teamId ?? a.teamId` equals `teamId`.
- **Hall of Famers:** for each class and inductee, the lines matching `/^([A-Z]{2,4}(?:\/[A-Z]{2,4})*):\s*(?:FFL-)?S?(\d+)?/`. Each code in the `/`-split list maps through `franchiseByAbbr(franchises, code, start ?? 1)`, where `start` is the captured number and FFL gives 1. Count each inductee once per franchise. `season` is the class's `season` text.
- Only `league === 'fba'` summaries count. All number lists are unique and ascending. Awards are sorted by season, then by `TROPHY_AWARDS` order.

- [ ] **Step 1: Failing tests** (`engine/history/trophies.test.ts`). Build the fixtures inline:
- `teams` = SAS (`name: 'San Antonio Spirits'`) and MON (`name: 'Montreal Chevaliers'`), using a `Team` from an existing test fixture helper, or minimal objects cast via `as Team`.
- `franchises`: SAS eras `San Antonio Spirits`/`SAS` from 57 and `San Antonio`/`USA` 1–56; MON era `Montreal`/`MON` from 1.
- Summaries:
  - S20: `champions: [{ title: 'FBA Champion', champion: 'San Antonio', runnerUp: 'Montreal', score: '1–0' }]`, `confChampions: { E: 'Montreal', W: 'San Antonio' }`, `awards: [{ award: 'MVP', playerId: 'p00001', teamId: 'USA' }, { award: 'FMVP', … }]` (use a real non-trophy AwardId from `AwardId` if FMVP isn't one; check the enum);
  - S60: `pastBracket` with a 1-round series `R1-1`, home `San Antonio Spirits`, away `Montreal`;
  - S79: standings rows for SAS (`group: 'West'`, `rank: 1`, `playoff: { round: 4, champion: true }`) and MON (`rank: 2`, `playoff: null`), with `champions[0].teamId: 'SAS'`, `runnerUpId: 'MON'`.
- `hallOfFame`: class `S30` with an inductee `{ name: 'Old Timer', playerId: null, retiredSeason: 'S29' }` whose lines are `['MON: S8-S23', 'USA/OAK: S24-S26', '3x Conference Champion']`.

Expect `trophyCase('SAS', …)` to equal:

```ts
{ championships: [20, 79], finals: [20, 79], confTitles: [20, 79], tournaments: [60, 79],
  awards: [{ award: 'MVP', playerId: 'p00001', season: 20 }],
  hallOfFamers: [{ name: 'Old Timer', playerId: null, season: 'S30' }] }
```

and `trophyCase('MON', …).finals` to be `[20, 79]`, with `championships` `[]`, `confTitles` `[20]`, `tournaments` `[60]` and one Hall of Famer. Add a case where an award's `teamId` is a current id with no era match (e.g. `'MON'`) and still counts.

`importers/sheets/teamTabs.test.ts`:

```ts
const rows = [
  ['Team Info', 'Championships', 'C-Ship app.', 'Conference Titles', 'FBA Tourny app.', "MVP's", 'PPK Award', 'LP Award', 'MC Award', "DPOY's", "MIP's", "ROTY's", 'Hall of Famers'],
  ['', '8', '16', '13', '18', '11', '2', '2', '6', '2', '0', '4', '15'],
];
expect(parseTeamTabCounts(rows)).toEqual({ championships: 8, finals: 16, confTitles: 13, tournaments: 18, MVP: 11, PPK: 2, LP: 2, MC: 6, DPOY: 2, MIP: 0, ROTY: 4, hallOfFamers: 15 });
expect(parseTeamTabCounts([['x']])).toBeNull();
```

- [ ] **Step 2: Run** `npx vitest run engine/history/trophies.test.ts importers/sheets/teamTabs.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `engine/history/trophies.ts` following the rules above. The helper:

```ts
const idOf = (input: TrophyInput, name: string | null | undefined, season: number, hint?: string | null): string | null =>
  name ? resolveHistoryTeam(input.teams, input.franchises, name, season, hint)?.team.teamId ?? hint ?? null : hint ?? null;
```

`importers/sheets/teamTabs.ts`: find row 0's header cells by name (case-insensitive `startsWith`) and read the numbers from row 1:

```ts
const COLUMNS: [string, string][] = [
  ['championships', 'championships'], ['c-ship app', 'finals'], ['conference titles', 'confTitles'], ['fba tourny', 'tournaments'],
  ["mvp", 'MVP'], ['ppk', 'PPK'], ['lp award', 'LP'], ['mc award', 'MC'], ['dpoy', 'DPOY'], ['mip', 'MIP'], ['roty', 'ROTY'], ['hall of famers', 'hallOfFamers'],
];
/** Row 2 of a team history tab: the count under each header; null when the header row isn't there. */
export function parseTeamTabCounts(rows: string[][]): Record<string, number> | null {
  const head = (rows[0] ?? []).map(c => (c ?? '').trim().toLowerCase());
  const out: Record<string, number> = {};
  for (const [label, key] of COLUMNS) {
    const i = head.findIndex(h => h.startsWith(label));
    if (i < 0) return null;
    out[key] = Number((rows[1]?.[i] ?? '').trim() || 0);
  }
  return out;
}
```

`run.ts`, mode `--check-trophies`. It is read-only: it reads summaries from `<dir>/leagues/fba/S*/summary.json` (use `readdirSync`, the way `readJsonDocs` does), plus `teams.json`, `franchises.json` and `hallOfFame.json`, and downloads the team history sheet (`rmSync` the cache first, as `importFranchises` does). For each tab whose name matches `/^[A-Z]+$/`, compare `parseTeamTabCounts` with `trophyCase` counts (the lists' lengths, and award counts by key). Print one line per mismatch, e.g. `SAS confTitles: sheet 13, app 12`, then a total. It writes nothing. Add `'--check-trophies'` to `MODE_FLAGS` and its dispatch line.

- [ ] **Step 4: Run** `npx vitest run engine/history importers` then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** by path, message `feat(history): derived trophy cases and --check-trophies`.

---

### Task 6: Teams grid and franchise page

**Files:**
- Create: `app/history/TeamsHistoryPage.tsx`, `app/history/FranchisePage.tsx`, `app/history/EraStrip.tsx`, `app/history/FranchisePages.test.tsx`
- Modify: `app/shell/Layout.tsx` (routes), `app/history/HistoryHome.tsx` (a Teams card), `app/pages/TeamPage.tsx` (a link), `app/history/history.css`

**Interfaces:**
- Consumes: `trophyCase`, `TROPHY_AWARDS` (Task 5); `DraftHistoryFile` (Task 1); `useFbaTeams`, `TeamFull` (`app/history/useTeams.tsx`); `useHistory`, `useDoc` (`app/api.ts`); `PlayerLink`; `Hero` (`app/components/Hero`); `teamTheme` (`app/components/teamColors`); `TeamName`, `TeamMark`.
- Produces: routes `/history/fba/teams` and `/history/fba/teams/:teamId`; `EraStrip({ franchise, team, manifest })`.

Page content (spec §3):
- **`TeamsHistoryPage`:**
  - `PageHeader kicker="FBA history" title="Teams"`, then `div.card-grid`.
  - One `Link.card.link` per franchise in `franchises.json`, in teams.json order, then any others by teamId.
  - Each card shows `TeamName` at the latest season with size 40 (when the team exists in teams.json; else the newest era's name), then a muted line: `{n} titles · {n} Finals · {n} conference titles`.
  - The latest season is the max season in `useHistory('fba')`, or 79 when there are none.
  - Missing `franchises.json` shows the muted text `No franchise history yet. Run npm run import -- --franchises.`
- **`FranchisePage`:**
  - The page reads `useParams().teamId`, `useHistory('fba')`, `players.json`, `leagues/fba/hallOfFame.json`, `leagues/fba/draftHistory.json`, `logos/manifest.json` and `useFbaTeams()`. The hallOfFame, draftHistory and manifest docs may be missing; treat them as null.
  - `Hero`: logo `TeamMark` (size 96) at the latest season, kicker `FBA franchise`, and title the team's name. Stats are Titles, Finals, Conf. titles and Tournaments (counts). Pass `theme={teamTheme(team, 'fba')}` when the team exists.
  - `EraStrip` comes next, then these sections, each as `<h2 className="section-title">`:
    - `Championships`, `Finals appearances`, `Conference titles`, `Tournament appearances`: `ul.chips` of `Link.chip` to `/history/fba/season/:n`, or "None yet".
    - `Awards`: one row per award key that has winners, `<b>{award}</b>` then winners as `PlayerLink (S20)`, comma-separated.
    - `Hall of Famers`: a list of `PlayerLink`, or the plain name when `playerId` is null, with the class season.
    - `Draft picks`: a table (Season, Pick, Player, Pos, College) of `draftHistory.drafts.flatMap(d => d.picks.filter(p => p.teamId === teamId))`, newest first. A `kind === 'expansion'` pick shows "Exp." in the Pick cell. The section is hidden when there are none.
    - A link `Transactions →` to `/history/fba/transactions?team={teamId}`.
  - An unknown teamId (not in franchises and not in teams) shows `<p className="error">Unknown franchise "{teamId}".</p>`.
- **`EraStrip`:**
  - `ol.era-strip` of `li.era-tile`, newest era first (the `franchise.eras` order).
  - Each tile shows that era's logos, then `<b>{era.name}</b>`, `<span className="muted">{era.abbr} · {era.city}</span>` and `<span className="muted">S{from}–{to === null ? 'pres.' : 'S' + to}</span>`.
  - The logos are the `manifest.folders[team.logoFolder]` entries with `variant === 0` that overlap `[era.from, era.to ?? Infinity]`. Each one renders `<img className="team-mark" src={`/logos/${encodeURIComponent(folder)}/${Math.max(entry.from, era.from)}`} width={56} height={56} alt={`${era.name} logo`} />`.
  - With no manifest, no folder or no overlap, it shows one `TeamMark` for the team at `era.from` (size 56, label `era.name`), or nothing when the team isn't in teams.json.
- **TeamPage:** inside the `Hero` children, add `{lg === 'fba' && <Link className="btn" to={`/history/fba/teams/${teamId}`}>Franchise history</Link>}` next to the Trade link (outside the `editable` condition).
- **HistoryHome:** add `{ to: '/history/fba/teams', title: 'Teams', text: 'Every franchise: eras, logos and trophy case.' }` to `FEATURES` after Championships.
- **CSS** (append to `history.css`): `.era-strip { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s3); } .era-tile { display: grid; gap: 4px; justify-items: start; padding: var(--s3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); min-width: 0; } .era-logos { display: flex; gap: var(--s2); flex-wrap: wrap; }`.

- [ ] **Step 1: Failing tests** in `FranchisePages.test.tsx`, following `HistoryPages.test.tsx`: stub `fetch` for `/api/history/fba`, `/api/state/players.json`, `/api/state/leagues/fba/teams.json`, `/api/state/leagues/fba/franchises.json`, `/api/state/leagues/fba/hallOfFame.json`, `/api/state/leagues/fba/draftHistory.json` and `/api/state/logos/manifest.json`; anything else is a 404. Render inside `MemoryRouter initialEntries={['/history/fba/teams/SAS']}` with `<Routes><Route path="/history/fba/teams/:teamId" element={<FranchisePage />} /></Routes>`. Cases:
  1. The Teams grid shows a SAS card linking to `/history/fba/teams/SAS` with the text `1 titles` (use the S20 fixture from Task 5).
  2. The franchise page shows the h1 `San Antonio Spirits`, era tiles `San Antonio Spirits` and `San Antonio` with `S1–S56`, and a Championships chip `S20` linking to `/history/fba/season/20`.
  3. The Awards section links the MVP to `/history/fba/players/p00001`.
  4. The Draft picks table lists a pick from the draftHistory fixture.
  5. A missing draftHistory (404) hides the Draft picks section without error.
  6. With a manifest entry `{ file: 'x.png', from: 57, to: null, variant: 0 }` under the team's `logoFolder`, the S57 era tile has an `img` with `src` `/logos/<folder>/57`.
  7. An unknown teamId shows the error text.

  Also add to the existing TeamPage test file (find it with `grep -rl "TeamPage" app --include=*.test.tsx`): the FBA team page has a `Franchise history` link to `/history/fba/teams/<id>`.
- [ ] **Step 2: Run** `npx vitest run app/history app/pages`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the three components, routes (`<Route path="/history/fba/teams" element={<TeamsHistoryPage />} />` and `<Route path="/history/fba/teams/:teamId" element={<FranchisePage />} />` before the `*` route), the hub card, the TeamPage link and the CSS. If an existing HistoryHome test counts cards, update its expectation.
- [ ] **Step 4: Run** `npx vitest run` (full; filter to the summary lines) then `npx tsc --noEmit`. Expected: all PASS.
- [ ] **Step 5: Commit** by path, message `feat(history): franchise pages with era strip and trophy case`.

---

### Task 7: Draft history pages and the player "Drafted" line

**Files:**
- Create: `app/history/DraftsPage.tsx`, `app/history/DraftSeasonPage.tsx`, `app/history/DraftPages.test.tsx`
- Modify: `app/shell/Layout.tsx`, `app/history/HistoryHome.tsx`, `app/history/PlayerHistoryPage.tsx` (+ its test in `CareerPages.test.tsx` or `PlayersHistory.test.tsx`, whichever covers it)

**Interfaces:**
- Consumes: `DraftHistoryFile`, `DraftFile`, `MetaFile`, `PlayersFile` types; `useDoc`, `useFbaTeams`, `TeamFull`, `PlayerLink`.
- Produces: routes `/history/fba/drafts` and `/history/fba/drafts/:season`; `draftLine(history: DraftHistoryFile | null, playerId: string): string | null` exported from `DraftSeasonPage.tsx` (or a small `app/history/drafts.ts`).

Content:
- **`DraftsPage`:**
  - `PageHeader title="Drafts"`, then `ul.chips` with one chip per imported season (newest first, deduped across draft and expansion). Each links to `/history/fba/drafts/:season` with the label `S{n}`, plus ` + Exp.` when the season has an expansion draft.
  - Then app-draft chips: for each `s` from 80 to `meta.currentSeason + 1` not already imported, render `<AppDraftChip season={s} />`. It is a component that calls `useDoc<DraftFile>(`leagues/fba/S${s}/draft.json`)` and renders a chip only when the doc exists and `started` is true. The app chips come first (newest first).
  - With no draftHistory (404) and no app drafts, it shows `No draft history yet. Run npm run import -- --drafts --data data.`
- **`DraftSeasonPage`:**
  - The title is `S{season} Draft`, with a `← Drafts` link.
  - When draftHistory has `kind: 'draft'` for the season: a `table.stat-table` with the columns Pick, Team, Player, Pos, Class, College.
    - **Team:** `TeamFull` with `teamId` and `name={teamName}` at that season. After it, when `viaTeamId` is set, a muted ` (via ` plus `TeamFull variant="abbr"` for the via team plus `)`.
    - **Player:** a `PlayerLink` when `playerId` is set, else the plain name.
  - Then a section `Expansion draft` in the same table shape, when a `kind: 'expansion'` draft exists (the header shows "Age" instead of "Class").
  - Then a section `Undrafted`: a comma-separated list of the `pick === null` players.
  - When the season isn't imported, it reads `leagues/fba/S{season}/draft.json`. It lists `picks` with a non-null `playerId`, ordered by `slot`: Pick = slot, Team = owner, plus `(via originalTeam)` when it differs, Player via `PlayerLink`, and Pos, Class and College from the matching `prospects` entry (`position`, `classYear`, `college`).
  - With neither source: `No S{season} draft on record.`
- **`draftLine`:**
  - The first imported draft pick (by season, draft before expansion) with that `playerId`.
  - A drafted pick gives `Drafted S{season}, #{pick} by {teamName}` (or `Expansion draft S{season}, #{pick} by {teamName}`); an undrafted one gives `Undrafted, S{season}`. None gives null.
  - `PlayerHistoryPage` loads `leagues/fba/draftHistory.json` (it may be missing) and renders `<p className="muted">{line}</p>` under the header when the line isn't null.
- **HistoryHome:** add `{ to: '/history/fba/drafts', title: 'Drafts', text: 'Every draft board since S49.' }` after Teams.

- [ ] **Step 1: Failing tests** in `DraftPages.test.tsx`:
  1. The index lists `S78` and `S75 + Exp.` chips from a fixture with S78 draft, S75 draft and S75 expansion.
  2. The season page for 78 shows the rows in pick order: pick 1 with `Seattle` and `(via`, and the player link for `p00001`.
  3. The Undrafted section lists `Cai Scott`.
  4. Season 80 without draftHistory reads the stubbed `leagues/fba/S80/draft.json` (one picked prospect) and shows the player.
  5. An unknown season shows `No S12 draft on record.`
  6. The `draftLine` unit cases: drafted, undrafted, none.

  In the player page test: a stubbed draftHistory gives the line `Drafted S78, #1 by Seattle`.
- [ ] **Step 2: Run** `npx vitest run app/history`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the pages, routes, card and player line.
- [ ] **Step 4: Run** `npx vitest run` (summary lines) and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** by path, message `feat(history): draft history pages and drafted line`.

---

### Task 8: Transactions history page

**Files:**
- Create: `app/history/PastTransactionsPage.tsx`, `app/history/PastTransactionsPage.test.tsx`
- Modify: `app/shell/Layout.tsx`, `app/history/HistoryHome.tsx`, `app/history/history.css`

**Interfaces:**
- Consumes: `PastTransactionsFile`, `TransactionsFile`, `MetaFile`; `useDoc`, `useFbaTeams`, `TeamFull`/`TeamName`, `PlayerLink`; `useSearchParams` from react-router.
- Produces: the route `/history/fba/transactions`.

Content:
- **`PageHeader title="Transactions"`**, then two `<select>`s with the labels `Season` and `Team`, bound to the `season` and `team` search params (`setSearchParams`, replace).
  - The season options are the imported seasons plus `meta.currentSeason` and every season from 79 to `meta.currentSeason`, deduped and newest first. The default is the newest imported season, or the current season when nothing is imported.
  - The team options are `All teams` (the empty value) plus teams.json teams by name.
- **Imported season:** the entries in sheet order.
  - **Trade:** an `article.card.tx-trade`.
    - The head shows the teams as `TeamFull variant="abbr"` (resolve each `teamId` with `name` = the team's current name; the logo and era come from `TeamFull` via its teamId), joined by ` ⇄ `, plus the `when` in muted.
    - Then, for each receiving team, a line `→ {abbr}: {assets}`. An asset with a playerId is a `PlayerLink` with its `pos ` prefix; otherwise it is `asset.text`.
    - Then the notes in muted.
  - **Team moves:** a single `table.stat-table` (Team, Move, Player/asset, When) with the move label capitalised ("Cut", "Released", "Signed", "Acquired").
  - **Team filter:** trades whose `teamIds` include the team, and moves whose `teamId` matches.
- **App seasons (79 on):** also load `leagues/fba/S{season}/transactions.json`. When it exists, render a section `Moves in the app` listing each entry as the `TransactionsPage` feed does: team abbreviations, a `badge` with the type, and the lines. Only these types show: `signed`, `resigned`, `released`, `cut`, `trade`, `drafted`. The team filter uses `entry.teams`.
- **No data at all:** `No past transactions yet. Run npm run import -- --transactions --data data.`
- **HistoryHome:** add `{ to: '/history/fba/transactions', title: 'Transactions', text: 'Trades, signings and cuts by season.' }`.
- **CSS:** `.tx-trade { display: grid; gap: 4px; padding: var(--s3) var(--s4); } .tx-trade-head { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; }`.

- [ ] **Step 1: Failing tests:**
  1. The default season is the newest imported season; a trade card shows `Before Week 7` and a player link.
  2. The moves table has a `Cut` row.
  3. `?team=CIN` hides trades without CIN.
  4. `?season=79` with a stubbed S79 `transactions.json` shows `Moves in the app` with an entry line.
  5. Everything missing shows the import hint.

  Render with `MemoryRouter initialEntries={['/history/fba/transactions?season=33']}` and a `Routes` wrapper.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (summary lines) and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** by path, message `feat(history): past transactions page`.

---

### Task 9: League timeline page

**Files:**
- Create: `engine/history/timeline.ts`, `engine/history/timeline.test.ts`, `app/history/TimelinePage.tsx`, `app/history/TimelinePage.test.tsx`
- Modify: `app/shell/Layout.tsx`, `app/history/HistoryHome.tsx`

**Interfaces:**
- Consumes: `EventsFile`, `FranchisesFile`, `SummaryFile`.
- Produces:

```ts
export interface TimelineSeason {
  season: number;
  champion: { name: string; teamId: string | null } | null;
  expansions: { teamId: string; name: string }[];   // a franchise whose earliest era starts this season (season > 1)
  renames: { teamId: string; from: string; to: string }[]; // a later era of an existing franchise starts this season (name changed)
  notes: string[]; rules: string[];
}
export function buildTimeline(summaries: SummaryFile[], franchises: FranchisesFile | null, events: EventsFile | null): TimelineSeason[]; // newest first
```

Rules:
- A timeline season exists for every FBA summary season, every events season and every era `from` > 1.
- The champion is the `FBA Champion` row (`teamId ?? null`, `name: champion`).
- Expansions and renames come from each franchise's eras sorted by `from`. The earliest era with `from > 1` is an expansion. Each later era is a rename from the previous era's `name` to this one. Skip the rename when the names are equal (a gap or relocation with the same name).

Content:
- `PageHeader title="Timeline"`, then `ol.timeline` newest first. Each `li.timeline-row` shows:
  - `Link.timeline-season` `S{n}` to `/history/fba/season/:n` (a plain `span` when there is no summary);
  - the champion (a `TeamFull` champion line) when present;
  - `New: {names}` for expansions;
  - `{from} → {to}` for renames;
  - the notes;
  - `ul` of rules under `<b>Rule changes</b>`.
- A final block `Before the FBA` lists `events.before` (`label: notes`).
- A missing events doc still renders the derived milestones, plus a muted hint `Run npm run import -- --events --data data for league notes and rule changes.`
- **HistoryHome:** add `{ to: '/history/fba/events', title: 'Timeline', text: 'Milestones, name changes and rule changes by season.' }`.

- [ ] **Step 1: Failing tests:**
  - **`buildTimeline`** with franchises SEA (Seattle Shock from 59), CGG→NO (eras `Cypress Black Sox` 1–56, `New Orleans Seminoles` 57–null, under teamId NO), summaries S20 and S59, and events `{ before: [...], seasons: [{ season: 59, notes: [], rules: ['Draft every season'] }] }`. Expect S59 to have `expansions: [{ teamId: 'SEA', name: 'Seattle Shock' }]` and the rule, S57 to have `renames: [{ teamId: 'NO', from: 'Cypress Black Sox', to: 'New Orleans Seminoles' }]`, and the order to be newest first.
  - **Page:** `Rule changes` and `Draft every season` are shown, `New: Seattle Shock` is shown, `Before the FBA` is shown, and a missing events doc shows the hint.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (summary lines) and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** by path, message `feat(history): league timeline page`.

---

### Task 10 (controller): scratch browser check, final review, roadmap

- Prepare scratch data with `.superpowers/sdd/rscheck/prep.mjs`, then run `--drafts`, `--transactions`, `--events` and `--check-trophies` with `--data <scratch>` only. Record the counts and warnings in progress.md.
- Start the scratch data server (5184) and Vite (5183, `web/rscheck.vite.config.ts`, `--force`). Read `/history`, `/history/fba/teams`, `/history/fba/teams/SAS`, `/history/fba/drafts/78`, `/history/fba/transactions?season=76` and `/history/fba/events` as text or JS. Check 375 px and dark mode for h-scroll. At most 3 screenshots at scale 0.5.
- Stop both, delete the scratch data and config, and check that `git status` is clean apart from the user's own changes.
- Final whole-branch review (Opus); one fixer for its findings.
- Update the roadmap row and progress.md; stop for the user before merging.
