# Roster Moves & Free Agency, Phase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run S79 FBA free agency in the web app: sign, re-sign, release/cut, edit, and trade (players plus conditional draft picks), then close free agency. Every move saves all-or-nothing and can be undone.

**Architecture:**
- Pure rule and move functions in `web/engine/roster/` take a `RosterState` (the eight roster-related documents) and return either the new state plus the list of changed documents, or a list of problems.
- The UI previews each move by calling the same function (dry run), then commits it with one `POST /api/batch`. The server validates the whole batch, journals the previous file contents, and writes every file or none. `POST /api/undo` restores the last journal entry.
- A `--refresh-rosters` import brings in the current sheets (rosters with restricted flags, the free-agent pool, D2 reserves, and future picks) while keeping player ids.

**Tech Stack:** TypeScript 5, zod 3.23.8, React 18 + React Router 6, node:http, exceljs, Vitest 2 (+ jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-26-roster-moves-free-agency-design.md`. Phase 2 (D2 ratings reset, pool, and draft) gets its own plan.

## Global Constraints

- Never modify `FBA/`, `FBAJC/`, `FBAD2/`, `FBAWC/`, or `FBA Logos/`. Work only under `web/` (plus `docs/`).
- Run every command from `web/`. Tests: `npx vitest run <paths>`. Typecheck: `npx tsc --noEmit` (it must print nothing).
- **Contract rules:**
  - Team payroll cap is **$25**, counting only contracts with `contractEnd ≥ current season`.
  - Per-player amount is a whole number from **$1 to $8**.
  - Maximum length is **4 years** for a new signing and **5 years** to re-sign one's own player.
  - **Years must not exceed dollars.**
  - `contractEnd = season + years − 1`.
- **Rookie contracts** are restricted and exactly **1/$1 or 2/$2**.
- A **restricted** expired contract can only be re-signed by its own team; the player is not on the open market.
- **Slots:** each FBA/D2 team has one player per position (PG, SG, SF, PF, C). Extras or gaps are *warnings* while FBA free agency is open. Closing free agency requires every FBA team to have exactly one player per position, payroll ≤ $25, and no expired contracts.
- **Pick conditions:** `none`, `top n`, `lottery` (size = FBA teams − 16 = **14** today), `swap`, `custom`.
  - A pick that doesn't convey rolls to the next season, and its protection shrinks by one spot **every** roll (lottery → top 13 → top 12 …; top 1 → none).
- Transaction labels follow the sheet: `Signed`, `Re-signed`, `Released`, `Cut`. Trade lines look like `->MON SG-Justin Green` and `->CGG S81 Draft Pick(via MON)(4P)`.
- The `players.json` player id format stays `p` + 5 digits.
- Every new document type gets a strict zod schema and a `schemaForPath` rule. The committed `web/data` must keep passing `web/data.test.ts`.
- Commit messages end with your own `Co-Authored-By` line.

## File Structure

```
web/engine/shared/types.ts            + restricted, FreeAgent(s), Reserve(s), PickCondition/Obligation, Picks, Transactions
web/engine/shared/schemaRegistry.ts   + new paths, pathAgreementProblem()
web/engine/roster/
  state.ts        RosterState, DocKey, docPath, MoveResult, helpers (nameOf, appendTx, findOnRoster, withTeam)
  rules.ts        constants, payroll, isExpired, contractProblems, slotProblems, vacantEntry, normalizeRoster
  picks.ts        pickLabel, isProtected, shrink, nextPriority, futureSeasons, resolvePicks
  moves.ts        signPlayer, releasePlayer, editPlayer/editWarnings, freeAgencyBlockers, closeFreeAgency
  trade.ts        makeTrade
  market.ts       marketRows, openPositions
  testFixtures.ts baseState() for tests
web/server/storage.ts       + serialize queue, atomicWrite retry, pathAgreement, writeMany (journal), undo
web/server/handler.ts       + POST /api/batch, POST /api/undo, shared JSON-body reader
web/importers/sheets/xlsx.ts       + readUnderlines()
web/importers/sheets/parsers.ts    + restricted on FBA tab, parseFreeAgentsTab, parseD2ReservesTab, parsePickRows
web/importers/registry.ts          + PlayerRegistry.fromFile()
web/importers/assemble.ts          export rosterFromSheet (+restricted)
web/importers/refresh.ts           assembleRefresh()
web/importers/run.ts               + --refresh-rosters mode
web/app/api.ts                     + postBatch, undoLast
web/app/roster/useRosterState.ts, commit.ts
web/app/components/SignPanel.tsx, EditDialog.tsx, PayrollBar.tsx
web/app/pages/FreeAgencyPage.tsx, TradePage.tsx, TransactionsPage.tsx, roster.css
web/app/stepRoutes.ts
web/app/pages/TeamPage.tsx, LeaguePage.tsx, Home.tsx, CalendarPage.tsx, shell/Layout.tsx, shell/TopBar.tsx, components/RosterTable.tsx (modified)
```

---

### Task 1: Data model for moves, picks, and transactions

**Files:**
- Modify: `web/engine/shared/types.ts`, `web/engine/shared/schemaRegistry.ts`
- Test: `web/engine/shared/types.test.ts` (append), `web/engine/shared/schemaRegistry.test.ts` (append)

**Interfaces:**
- Produces (types.ts):
  - `RosterEntry.restricted?: boolean`
  - `FreeAgent`, `FreeAgentsFile`, `ReservePlayer`, `ReservesFile`, `PickCondition`, `PickRoll`, `PickObligation`, `PicksFile`, `TransactionType`, `TransactionEntry`, `TransactionsFile`. Each is exported as both a schema and a type.
- Produces (schemaRegistry.ts):
  - new rules for `leagues/fba/picks.json`, `leagues/fba/S<n>/freeAgents.json`, `leagues/fbad2/S<n>/reserves.json`, `leagues/<l>/S<n>/transactions.json`
  - `pathAgreementProblem(rel: string, doc: unknown): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `web/engine/shared/types.test.ts`. First add these to the existing import from `./types`: `FreeAgentsFile, PickObligation, PicksFile, ReservesFile, TransactionsFile`. Then add:
```ts
describe('roster-move schemas', () => {
  it('accepts a restricted roster entry', () => {
    const doc = { league: 'fba', season: 79, locked: false, teams: { ATL: [{ playerId: 'p00004', position: 'PF', rating: 75, age: 20, points: 0, contractEnd: 79, contractAmount: 2, restricted: true }] } };
    expect(RostersFile.safeParse(doc).success).toBe(true);
  });

  it('validates free agents and reserves', () => {
    expect(FreeAgentsFile.safeParse({ league: 'fba', season: 79, locked: false, players: [{ playerId: 'p01000', position: 'C', age: 22, rating: null, rookie: true, note: 'R' }] }).success).toBe(true);
    expect(FreeAgentsFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [] }).success).toBe(false);
    expect(ReservesFile.safeParse({ league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p01001', position: 'PG', age: 30, rating: null }] }).success).toBe(true);
  });

  it('validates pick obligations and their conditions', () => {
    const ob = {
      id: 'imp-S80-DCB-1', season: 80, originalTeam: 'DCB', owner: 'OV',
      condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' },
      originSeason: 75, priority: 1, rolls: [], note: '',
    };
    expect(PickObligation.safeParse(ob).success).toBe(true);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'top', n: 0 } }).success).toBe(false);
    expect(PickObligation.safeParse({ ...ob, condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'DCB' } }).success).toBe(true);
    expect(PicksFile.safeParse({ league: 'fba', obligations: [ob] }).success).toBe(true);
  });

  it('validates transactions', () => {
    const tx = { league: 'fba', season: 79, entries: [{ seq: 1, batchId: 'b1', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
    expect(TransactionsFile.safeParse(tx).success).toBe(true);
    expect(TransactionsFile.safeParse({ ...tx, entries: [{ ...tx.entries[0], type: 'waived' }] }).success).toBe(false);
  });
});
```

Append to `web/engine/shared/schemaRegistry.test.ts` (change the existing import line to `import { pathAgreementProblem, schemaForPath } from './schemaRegistry';`):
```ts
describe('roster-move paths', () => {
  it.each([
    'leagues/fba/picks.json', 'leagues/fba/S79/freeAgents.json', 'leagues/fbad2/S79/reserves.json',
    'leagues/fba/S79/transactions.json', 'leagues/fbad2/S79/transactions.json',
  ])('knows %s', rel => {
    expect(schemaForPath(rel)).not.toBeNull();
  });

  it.each(['leagues/fbad2/picks.json', 'leagues/fbad2/S79/freeAgents.json', 'leagues/fba/S79/reserves.json'])('refuses %s', rel => {
    expect(schemaForPath(rel)).toBeNull();
  });
});

describe('pathAgreementProblem', () => {
  it('accepts matching league and season', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 79 })).toBeNull();
    expect(pathAgreementProblem('leagues/fba/teams.json', { league: 'fba', teams: [] })).toBeNull();
    expect(pathAgreementProblem('players.json', { nextId: 1, players: {} })).toBeNull();
  });
  it('flags a league mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fbad2', season: 79 })).toMatch(/league/);
  });
  it('flags a season mismatch', () => {
    expect(pathAgreementProblem('leagues/fba/S79/rosters.json', { league: 'fba', season: 12 })).toMatch(/season/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/shared`
Expected: FAIL. TypeScript/vitest reports that `FreeAgentsFile`, `PickObligation`, and `pathAgreementProblem` are not exported.

- [ ] **Step 3: Implement**

In `web/engine/shared/types.ts`, add `restricted: z.boolean().optional(),` to `RosterEntry` directly after the `classYear` line. Then append at the end of the file:
```ts
const playerId = z.string().regex(/^p\d{5}$/);

export const FreeAgent = z.object({
  playerId,
  position: Position,
  age: int.nullable(),
  rating: int.nullable(),
  rookie: z.boolean(),
  note: z.string(),
}).strict();
export type FreeAgent = z.infer<typeof FreeAgent>;

export const FreeAgentsFile = z.object({ league: z.literal('fba'), season: int, locked: z.boolean(), players: z.array(FreeAgent) }).strict();
export type FreeAgentsFile = z.infer<typeof FreeAgentsFile>;

export const ReservePlayer = z.object({ playerId, position: Position, age: int.nullable(), rating: int.nullable() }).strict();
export type ReservePlayer = z.infer<typeof ReservePlayer>;

export const ReservesFile = z.object({ league: z.literal('fbad2'), season: int, locked: z.boolean(), players: z.array(ReservePlayer) }).strict();
export type ReservesFile = z.infer<typeof ReservesFile>;

export const PickCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('top'), n: int.min(1) }).strict(),
  z.object({ kind: z.literal('lottery') }).strict(),
  z.object({ kind: z.literal('swap'), otherTeam: z.string().min(1), betterTo: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('custom'), text: z.string().min(1) }).strict(),
]);
export type PickCondition = z.infer<typeof PickCondition>;

export const PickRoll = z.object({ fromSeason: int, reason: z.enum(['protected', 'already-owed']) }).strict();
export type PickRoll = z.infer<typeof PickRoll>;

export const PickObligation = z.object({
  id: z.string().min(1),
  season: int,
  originalTeam: z.string().min(1),
  owner: z.string().min(1),
  condition: PickCondition,
  originalCondition: PickCondition,
  originSeason: int,
  priority: int.positive(),
  rolls: z.array(PickRoll),
  note: z.string(),
}).strict();
export type PickObligation = z.infer<typeof PickObligation>;

export const PicksFile = z.object({ league: z.literal('fba'), obligations: z.array(PickObligation) }).strict();
export type PicksFile = z.infer<typeof PicksFile>;

export const TransactionType = z.enum(['signed', 'resigned', 'released', 'cut', 'trade', 'edit', 'fa-closed']);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionEntry = z.object({
  seq: int.positive(),
  batchId: z.string().min(1),
  type: TransactionType,
  teams: z.array(z.string()),
  lines: z.array(z.string().min(1)),
}).strict();
export type TransactionEntry = z.infer<typeof TransactionEntry>;

export const TransactionsFile = z.object({ league: LeagueId, season: int, entries: z.array(TransactionEntry) }).strict();
export type TransactionsFile = z.infer<typeof TransactionsFile>;
```

Replace `web/engine/shared/schemaRegistry.ts` with:
```ts
import type { z } from 'zod';
import {
  CalendarFile, FreeAgentsFile, LogoManifest, MetaFile, PicksFile, PlayersFile, ReservesFile, ResultsFile, RostersFile,
  SummaryFile, TeamsFile, TransactionsFile,
} from './types';

const L = '(fba|fbad2|fbajc|fbawc)';
const S = 'S[1-9]\\d*';

const RULES: [RegExp, z.ZodTypeAny][] = [
  [/^players\.json$/, PlayersFile],
  [/^meta\.json$/, MetaFile],
  [/^calendar\.json$/, CalendarFile],
  [/^logos\/manifest\.json$/, LogoManifest],
  [/^leagues\/fba\/picks\.json$/, PicksFile],
  [new RegExp(`^leagues/${L}/teams\\.json$`), TeamsFile],
  [new RegExp(`^leagues/${L}/${S}/rosters\\.json$`), RostersFile],
  [new RegExp(`^leagues/${L}/${S}/summary\\.json$`), SummaryFile],
  [new RegExp(`^leagues/${L}/${S}/results\\.json$`), ResultsFile],
  [new RegExp(`^leagues/${L}/${S}/transactions\\.json$`), TransactionsFile],
  [new RegExp(`^leagues/fba/${S}/freeAgents\\.json$`), FreeAgentsFile],
  [new RegExp(`^leagues/fbad2/${S}/reserves\\.json$`), ReservesFile],
];

export function schemaForPath(rel: string): z.ZodTypeAny | null {
  for (const [re, schema] of RULES) if (re.test(rel)) return schema;
  return null;
}

const META = new RegExp(`^leagues/${L}/(?:S([1-9]\\d*)/)?`);

/** A document stored under leagues/<league>/[S<n>/] must carry the same league (and season, when it has one). */
export function pathAgreementProblem(rel: string, doc: unknown): string | null {
  const m = rel.match(META);
  if (!m || typeof doc !== 'object' || doc === null) return null;
  const d = doc as { league?: unknown; season?: unknown };
  if ('league' in d && d.league !== m[1]) return `${rel}: league "${String(d.league)}" doesn't match the path`;
  if (m[2] && 'season' in d && d.season !== Number(m[2])) return `${rel}: season ${String(d.season)} doesn't match the path`;
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/shared data.test.ts`
Expected: PASS. The committed data still validates.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` (it prints nothing).
```bash
git add web/engine/shared
git commit -m "web: schemas for free agents, reserves, picks, and transactions"
```

---

### Task 2: Batch writes, journal, and undo on the server

**Files:**
- Modify: `web/server/storage.ts`, `web/server/handler.ts`, `web/.gitignore`, `web/data.test.ts`
- Test: `web/server/storage.test.ts` (append), `web/server/handler.test.ts` (append)

**Interfaces:**
- Consumes: `schemaForPath`, `pathAgreementProblem` (Task 1)
- Produces:
  - `Storage.writeMany(label: string, writes: { path: string; doc: unknown }[]): Promise<{ batchId: string }>`
  - `Storage.undo(): Promise<{ label: string; paths: string[] }>`
  - HTTP `POST /api/batch` with body `{ label, writes: [{ path, doc }] }`, returning 200 `{ ok, batchId }` or 400/404/409
  - HTTP `POST /api/undo`, returning 200 `{ ok, label, paths }`, 404 when there is nothing to undo, or 409
  - `Storage.write` now also rejects a league/season mismatch with 400, and all writes are serialized.

- [ ] **Step 1: Write the failing tests**

Append to `web/server/storage.test.ts`:
```ts
describe('Storage batches and undo', () => {
  const roster = (season: number, rating: number) => ({ league: 'fba', season, locked: false, teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating, age: 28, points: 0 }] } });
  const tx = { league: 'fba', season: 79, entries: [] };

  it('writes every document in a batch', async () => {
    const { storage } = fresh();
    const { batchId } = await storage.writeMany('Sign', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 90) },
      { path: 'leagues/fba/S79/transactions.json', doc: tx },
    ]);
    expect(batchId).toMatch(/^\d+-\d+$/);
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 90));
    expect(await storage.read('leagues/fba/S79/transactions.json')).toEqual(tx);
  });

  it('writes nothing when any document is invalid', async () => {
    const { storage } = fresh();
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 90));
    const failed = storage.writeMany('Bad', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 50) },
      { path: 'leagues/fba/S79/transactions.json', doc: { league: 'fba', season: 79, entries: 'nope' } },
    ]);
    expect(await status(failed)).toBe(400);
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 90));
    expect(await status(storage.read('leagues/fba/S79/transactions.json'))).toBe(404);
  });

  it('rejects a document whose season disagrees with its path', async () => {
    const { storage } = fresh();
    expect(await status(storage.writeMany('X', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(12, 90) }]))).toBe(400);
    expect(await status(storage.write('leagues/fba/S79/rosters.json', roster(12, 90)))).toBe(400);
  });

  it('rejects duplicate paths in one batch', async () => {
    const { storage } = fresh();
    const w = { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 90) };
    expect(await status(storage.writeMany('Dup', [w, w]))).toBe(400);
  });

  it('undoes the last batch, including files it created', async () => {
    const { storage } = fresh();
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 90));
    await storage.writeMany('Sign Okoro', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) },
      { path: 'leagues/fba/S79/transactions.json', doc: tx },
    ]);
    expect(await storage.undo()).toEqual({ label: 'Sign Okoro', paths: ['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json'] });
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 90));
    expect(await status(storage.read('leagues/fba/S79/transactions.json'))).toBe(404);
    expect(await status(storage.undo())).toBe(404);
  });

  it('refuses to undo when a file changed after the batch', async () => {
    const { storage } = fresh();
    await storage.writeMany('Sign', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) }]);
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 71));
    expect(await status(storage.undo())).toBe(409);
  });

  it('serializes overlapping writes', async () => {
    const { storage } = fresh();
    await Promise.all([1, 2, 3, 4, 5].map(i => storage.writeMany(`w${i}`, [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 60 + i) }])));
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 65));
  });
});
```

Append to `web/server/handler.test.ts` (it reuses the file's `base` server from `beforeAll`):
```ts
describe('batch and undo routes', () => {
  const cal = (done: boolean) => ({ season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done }] });

  it('applies a batch and undoes it', async () => {
    await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', body: JSON.stringify(cal(false)) });
    const res = await fetch(`${base}/api/batch`, { method: 'POST', body: JSON.stringify({ label: 'Mark A', writes: [{ path: 'calendar.json', doc: cal(true) }] }) });
    expect(res.status).toBe(200);
    expect((await res.json()).batchId).toBeTruthy();
    const undo = await fetch(`${base}/api/undo`, { method: 'POST' });
    expect(await undo.json()).toEqual({ ok: true, label: 'Mark A', paths: ['calendar.json'] });
    expect(await (await fetch(`${base}/api/state/calendar.json`)).json()).toEqual(cal(false));
  });

  it('rejects a malformed batch body', async () => {
    const res = await fetch(`${base}/api/batch`, { method: 'POST', body: JSON.stringify({ label: '', writes: [] }) });
    expect(res.status).toBe(400);
  });

  it('rejects GET on the batch route', async () => {
    expect((await fetch(`${base}/api/batch`)).status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server`
Expected: FAIL. `storage.writeMany is not a function`, and the routes return 404.

- [ ] **Step 3: Implement storage**

Replace `web/server/storage.ts` with:
```ts
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathAgreementProblem, schemaForPath } from '../engine/shared/schemaRegistry';

export class StorageError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown) {
    super(message);
  }
}

export interface BatchWrite {
  path: string;
  doc: unknown;
}

interface JournalFile {
  path: string;
  before: string | null;
  after: string;
}

interface JournalEntry {
  id: string;
  label: string;
  files: JournalFile[];
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_JOURNAL = 50;

function isLocked(text: string): boolean {
  try {
    return (JSON.parse(text) as { locked?: unknown })?.locked === true;
  } catch {
    return false;
  }
}

export class Storage {
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string, private readonly maxBackups = 10) {}

  /** Runs storage mutations one at a time so overlapping requests can't interleave. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private fullPath(rel: string): string {
    if (!schemaForPath(rel)) throw new StorageError(404, `Unknown document path: ${rel}`);
    return path.join(this.dataDir, ...rel.split('/'));
  }

  private async readRaw(file: string): Promise<string | null> {
    try {
      return await readFile(file, 'utf8');
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  private async atomicWrite(file: string, text: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${this.seq++}.tmp`;
    await writeFile(tmp, text);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? '';
        if (!RETRYABLE.has(code) || attempt >= 5) {
          await unlink(tmp).catch(() => undefined);
          throw e;
        }
        await new Promise(r => setTimeout(r, 20 * (attempt + 1)));
      }
    }
  }

  /** Validates one document for rel and returns its canonical text plus the file's current text. */
  private async prepare(rel: string, doc: unknown): Promise<{ file: string; text: string; before: string | null }> {
    const file = this.fullPath(rel);
    const result = schemaForPath(rel)!.safeParse(doc);
    if (!result.success) throw new StorageError(400, `Invalid document for ${rel}`, result.error.issues);
    const mismatch = pathAgreementProblem(rel, result.data);
    if (mismatch) throw new StorageError(400, mismatch);
    const before = await this.readRaw(file);
    if (before !== null && isLocked(before)) throw new StorageError(409, `${rel} belongs to a finished (locked) season and can't be changed`);
    return { file, text: JSON.stringify(result.data, null, 2) + '\n', before };
  }

  async read(rel: string): Promise<unknown> {
    const text = await this.readRaw(this.fullPath(rel));
    if (text === null) throw new StorageError(404, `Not found: ${rel}`);
    return JSON.parse(text);
  }

  write(rel: string, doc: unknown): Promise<void> {
    return this.serialize(async () => {
      const p = await this.prepare(rel, doc);
      if (p.before !== null) await this.backup(rel, p.before);
      await this.atomicWrite(p.file, p.text);
    });
  }

  writeMany(label: string, writes: BatchWrite[]): Promise<{ batchId: string }> {
    return this.serialize(async () => {
      const seen = new Set<string>();
      const prepared: { rel: string; file: string; text: string; before: string | null }[] = [];
      for (const w of writes) {
        if (seen.has(w.path)) throw new StorageError(400, `Duplicate path in batch: ${w.path}`);
        seen.add(w.path);
        prepared.push({ rel: w.path, ...(await this.prepare(w.path, w.doc)) });
      }

      const id = `${Date.now()}-${String(this.seq++).padStart(6, '0')}`;
      await this.saveJournal({ id, label, files: prepared.map(p => ({ path: p.rel, before: p.before, after: p.text })) });

      const done: typeof prepared = [];
      try {
        for (const p of prepared) {
          if (p.before !== null) await this.backup(p.rel, p.before);
          await this.atomicWrite(p.file, p.text);
          done.push(p);
        }
      } catch (e) {
        for (const p of done.reverse()) {
          if (p.before === null) await unlink(p.file).catch(() => undefined);
          else await this.atomicWrite(p.file, p.before).catch(() => undefined);
        }
        await unlink(this.journalPath(id)).catch(() => undefined);
        throw e;
      }
      return { batchId: id };
    });
  }

  undo(): Promise<{ label: string; paths: string[] }> {
    return this.serialize(async () => {
      const names = await this.journalNames();
      const last = names.at(-1);
      if (!last) throw new StorageError(404, 'Nothing to undo');
      const entry = JSON.parse(await readFile(path.join(this.journalDir(), last), 'utf8')) as JournalEntry;
      for (const f of entry.files) {
        if ((await this.readRaw(this.fullPath(f.path))) !== f.after) {
          throw new StorageError(409, `Can't undo "${entry.label}": ${f.path} has changed since then`);
        }
      }
      for (const f of entry.files) {
        const file = this.fullPath(f.path);
        if (f.before === null) await unlink(file);
        else await this.atomicWrite(file, f.before);
      }
      await unlink(path.join(this.journalDir(), last));
      return { label: entry.label, paths: entry.files.map(f => f.path) };
    });
  }

  private journalDir(): string {
    return path.join(this.dataDir, '.journal');
  }

  private journalPath(id: string): string {
    return path.join(this.journalDir(), `${id}.json`);
  }

  private async journalNames(): Promise<string[]> {
    try {
      return (await readdir(this.journalDir())).filter(n => n.endsWith('.json')).sort();
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
  }

  private async saveJournal(entry: JournalEntry): Promise<void> {
    await mkdir(this.journalDir(), { recursive: true });
    await writeFile(this.journalPath(entry.id), JSON.stringify(entry));
    const names = await this.journalNames();
    for (const old of names.slice(0, Math.max(0, names.length - MAX_JOURNAL))) await unlink(path.join(this.journalDir(), old));
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

- [ ] **Step 4: Implement the routes**

In `web/server/handler.ts`:

1. Add `import { z } from 'zod';` to the imports.
2. Below `readBody`, add:
```ts
const BatchRequest = z.object({
  label: z.string().min(1).max(200),
  writes: z.array(z.object({ path: z.string().min(1), doc: z.unknown() }).strict()).min(1).max(50),
}).strict();

/** Reads and parses a JSON request body. On failure it sends the error response and returns undefined. */
async function jsonBody(req: http.IncomingMessage, res: http.ServerResponse, maxBody: number): Promise<{ value: unknown } | undefined> {
  const body = await readBody(req, maxBody);
  if (body === null) {
    req.resume();
    sendJson(res, 413, { error: 'Request body too large' }, { Connection: 'close' });
    return undefined;
  }
  try {
    return { value: JSON.parse(body) };
  } catch {
    sendJson(res, 400, { error: 'Request body is not valid JSON' });
    return undefined;
  }
}
```
3. Replace the whole `if (req.method === 'PUT') { ... }` block inside the `/api/state/` branch with:
```ts
        if (req.method === 'PUT') {
          const parsed = await jsonBody(req, res, maxBody);
          if (!parsed) return;
          await storage.write(rel, parsed.value);
          return sendJson(res, 200, { ok: true });
        }
```
4. Directly after the closing brace of the `/api/state/` branch, add:
```ts
      if (pathname === '/api/batch') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const parsed = await jsonBody(req, res, maxBody);
        if (!parsed) return;
        const batch = BatchRequest.safeParse(parsed.value);
        if (!batch.success) return sendJson(res, 400, { error: 'Invalid batch request', issues: batch.error.issues });
        const { batchId } = await storage.writeMany(batch.data.label, batch.data.writes);
        return sendJson(res, 200, { ok: true, batchId });
      }

      if (pathname === '/api/undo') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const { label, paths } = await storage.undo();
        return sendJson(res, 200, { ok: true, label, paths });
      }
```

In `web/.gitignore`, add the line `data/.journal/`.

In `web/data.test.ts`, change `if (entry === '.backups') continue;` to `if (entry === '.backups' || entry === '.journal') continue;`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server data.test.ts`
Expected: PASS. The existing storage and handler tests still pass.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/server web/.gitignore web/data.test.ts
git commit -m "web: all-or-nothing batch writes with journal-based undo"
```

---

### Task 3: Roster state and contract/slot rules

**Files:**
- Create: `web/engine/roster/state.ts`, `web/engine/roster/rules.ts`, `web/engine/roster/testFixtures.ts`
- Test: `web/engine/roster/rules.test.ts`

**Interfaces:**
- Consumes: the types from Task 1
- Produces (state.ts):
  - `RosterState { season; fba; d2; freeAgents; reserves; picks; players; fbaTx; d2Tx }`
  - `DocKey`, `DOC_KEYS`, `docPath(key, season)`
  - `MoveContext { batchId }`
  - `MoveResult = { ok: true; state; changed: DocKey[]; label; warnings: string[] } | { ok: false; problems: string[] }`
  - helpers `fail`, `nameOf`, `appendTx`, `findOnRoster`, `withTeam`, `withLeague(state, league, rosters, tx)`
- Produces (rules.ts):
  - `POSITIONS`, `CAP = 25`, `MAX_AMOUNT = 8`, `MAX_YEARS_NEW = 4`, `MAX_YEARS_RESIGN = 5`
  - `isExpired(e, season)`, `payroll(entries, season)`, `contractEndFor(season, years)`
  - `ContractKind = 'new' | 'resign' | 'rookie'`, `contractProblems({ years, amount }, kind): string[]`, `capProblem(total): string | null`
  - `slotProblems(teamId, entries): string[]`, `vacantEntry(position, league)`, `normalizeRoster(entries, league)`
- Produces (testFixtures.ts): `baseState(): RosterState`, used by the tests in Tasks 3–6

- [ ] **Step 1: Create the shared test fixture**

`web/engine/roster/testFixtures.ts`:
```ts
import type { RosterEntry } from '../shared/types';
import type { RosterState } from './state';

const fba = (playerId: string | null, position: RosterEntry['position'], rating: number | null, age: number | null, contractEnd: number | null, contractAmount: number | null, restricted = false): RosterEntry => {
  const e: RosterEntry = { playerId, position, rating, age, points: 0, contractEnd, contractAmount };
  if (restricted) e.restricted = true;
  return e;
};
const d2 = (playerId: string | null, position: RosterEntry['position'], rating: number | null, age: number | null): RosterEntry =>
  ({ playerId, position, rating, age, points: 0 });

const NAMES: Record<string, string> = {
  p00001: 'Gabriel Greenwood', p00002: 'Yasin Milovanovic', p00003: "Koa'e Keano", p00004: 'Callan Schwangau', p00005: 'Olufemi Cisneros',
  p00006: 'Jelani Soweto', p00007: 'Terence Hopkins', p00008: 'Louis Pepperdash III', p00009: 'Kya Emery',
  p00010: 'Milo Lawrenz', p00011: 'Rick Moore', p00012: 'Dan Price', p00013: 'Tom Hale',
  p00020: 'Ben Montgomery', p00021: 'Brooks Burrows', p00022: 'Jamal Edwards', p00023: 'Maddox Dean', p00024: 'Rick King',
  p00030: 'Azubuike Okoro', p00031: 'Milan Tepic', p00032: 'Mubiru Okeke', p00040: 'Kris Dyer',
};

/**
 * S79 fixture.
 * - BOS payroll $23: SF Keano and PF Schwangau are expired (S78, unrestricted).
 * - CAR payroll $23, with the C slot vacant.
 * - MON payroll $6: SG is vacant, and PF Dan Price's S78 contract is expired and restricted.
 * - D2 has one team, AMS.
 */
export function baseState(): RosterState {
  return {
    season: 79,
    fba: {
      league: 'fba', season: 79, locked: false, teams: {
        BOS: [fba('p00001', 'PG', 95, 28, 80, 8), fba('p00002', 'SG', 88, 28, 81, 7), fba('p00003', 'SF', 67, 25, 78, 1), fba('p00004', 'PF', 68, 28, 78, 1), fba('p00005', 'C', 94, 27, 80, 8)],
        CAR: [fba('p00006', 'PG', 92, 24, 82, 8), fba('p00007', 'SG', 69, 28, 79, 1), fba('p00008', 'SF', 93, 23, 80, 7), fba('p00009', 'PF', 77, 29, 80, 7), fba(null, 'C', null, null, null, null)],
        MON: [fba('p00010', 'PG', 81, 19, 80, 2, true), fba(null, 'SG', null, null, null, null), fba('p00011', 'SF', 70, 30, 79, 1), fba('p00012', 'PF', 72, 23, 78, 2, true), fba('p00013', 'C', 75, 26, 80, 3)],
      },
    },
    d2: {
      league: 'fbad2', season: 79, locked: false, teams: {
        AMS: [d2('p00020', 'PG', 75, 30), d2('p00021', 'SG', 72, 26), d2('p00022', 'SF', 75, 27), d2('p00023', 'PF', 94, 22), d2('p00024', 'C', 79, 25)],
      },
    },
    freeAgents: {
      league: 'fba', season: 79, locked: false, players: [
        { playerId: 'p00030', position: 'C', age: 27, rating: 68, rookie: false, note: '' },
        { playerId: 'p00031', position: 'C', age: 22, rating: null, rookie: true, note: 'R' },
        { playerId: 'p00032', position: 'SF', age: 28, rating: 69, rookie: false, note: '' },
      ],
    },
    reserves: { league: 'fbad2', season: 79, locked: false, players: [{ playerId: 'p00040', position: 'PG', age: 30, rating: null }] },
    picks: { league: 'fba', obligations: [] },
    players: {
      nextId: 41,
      players: Object.fromEntries(Object.entries(NAMES).map(([id, name]) => [id, { id, name, birthSeason: null }])),
    },
    fbaTx: { league: 'fba', season: 79, entries: [] },
    d2Tx: { league: 'fbad2', season: 79, entries: [] },
  };
}
```

- [ ] **Step 2: Write the failing tests**

`web/engine/roster/rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { capProblem, contractEndFor, contractProblems, isExpired, normalizeRoster, payroll, slotProblems, vacantEntry } from './rules';
import { appendTx, docPath, findOnRoster } from './state';
import { baseState } from './testFixtures';

describe('payroll and expiry', () => {
  const s = baseState();
  it('counts only active contracts', () => {
    expect(payroll(s.fba.teams.BOS, 79)).toBe(23);
    expect(payroll(s.fba.teams.MON, 79)).toBe(6);
  });
  it('knows expired contracts', () => {
    expect(isExpired(s.fba.teams.BOS[2], 79)).toBe(true);
    expect(isExpired(s.fba.teams.BOS[0], 79)).toBe(false);
    expect(isExpired(s.fba.teams.CAR[4], 79)).toBe(false);
  });
  it('computes contract end', () => {
    expect(contractEndFor(79, 2)).toBe(80);
  });
});

describe('contractProblems', () => {
  it('accepts valid new, re-sign, and rookie deals', () => {
    expect(contractProblems({ years: 2, amount: 2 }, 'new')).toEqual([]);
    expect(contractProblems({ years: 5, amount: 6 }, 'resign')).toEqual([]);
    expect(contractProblems({ years: 1, amount: 1 }, 'rookie')).toEqual([]);
  });
  it('enforces the rules', () => {
    expect(contractProblems({ years: 2, amount: 1 }, 'new')).toEqual(["Years can't exceed dollars (2 years needs at least $2)"]);
    expect(contractProblems({ years: 5, amount: 6 }, 'new')).toEqual(['New signings are limited to 4 years']);
    expect(contractProblems({ years: 6, amount: 8 }, 'resign')).toEqual(['Re-signings are limited to 5 years']);
    expect(contractProblems({ years: 1, amount: 9 }, 'new')).toEqual(["Amount can't exceed $8"]);
    expect(contractProblems({ years: 0, amount: 1.5 }, 'new')).toEqual(['Years must be a whole number, at least 1', 'Amount must be a whole number of dollars, at least $1']);
    expect(contractProblems({ years: 3, amount: 3 }, 'rookie')).toEqual(['Rookie contracts are 1/$1 or 2/$2']);
  });
  it('checks the cap', () => {
    expect(capProblem(25)).toBeNull();
    expect(capProblem(26)).toBe('Payroll would be $26 (cap $25)');
  });
});

describe('slots', () => {
  it('reports missing and doubled positions', () => {
    const s = baseState();
    expect(slotProblems('CAR', s.fba.teams.CAR)).toEqual(['CAR: no C']);
    const extra = [...s.fba.teams.BOS, { ...s.fba.teams.BOS[2], playerId: 'p00032' }];
    expect(slotProblems('BOS', extra)).toEqual(['BOS: 2 players at SF']);
  });
  it('normalizes to position order with one vacancy per empty position', () => {
    const s = baseState();
    const withoutPg = s.fba.teams.BOS.filter(e => e.position !== 'PG');
    const out = normalizeRoster(withoutPg, 'fba');
    expect(out.map(e => [e.position, e.playerId])).toEqual([['PG', null], ['SG', 'p00002'], ['SF', 'p00003'], ['PF', 'p00004'], ['C', 'p00005']]);
    expect(out[0]).toEqual(vacantEntry('PG', 'fba'));
    expect(vacantEntry('PG', 'fbad2')).toEqual({ playerId: null, position: 'PG', rating: null, age: null, points: 0 });
  });
});

describe('state helpers', () => {
  it('builds document paths', () => {
    expect(docPath('freeAgents', 79)).toBe('leagues/fba/S79/freeAgents.json');
    expect(docPath('d2Tx', 79)).toBe('leagues/fbad2/S79/transactions.json');
    expect(docPath('picks', 79)).toBe('leagues/fba/picks.json');
  });
  it('finds players and appends numbered transactions', () => {
    const s = baseState();
    expect(findOnRoster(s.d2, 'p00023')).toMatchObject({ teamId: 'AMS', index: 3 });
    const tx = appendTx(appendTx(s.fbaTx, { batchId: 'b1' }, 'edit', ['BOS'], ['x']), { batchId: 'b2' }, 'cut', ['BOS'], ['y']);
    expect(tx.entries.map(e => [e.seq, e.batchId, e.type])).toEqual([[1, 'b1', 'edit'], [2, 'b2', 'cut']]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run engine/roster/rules`
Expected: FAIL, cannot resolve `./rules` and `./state`.

- [ ] **Step 4: Implement**

`web/engine/roster/state.ts`:
```ts
import type {
  FreeAgentsFile, PicksFile, PlayersFile, ReservesFile, RosterEntry, RostersFile, TransactionsFile, TransactionType,
} from '../shared/types';

export interface RosterState {
  season: number;
  fba: RostersFile;
  d2: RostersFile;
  freeAgents: FreeAgentsFile;
  reserves: ReservesFile;
  picks: PicksFile;
  players: PlayersFile;
  fbaTx: TransactionsFile;
  d2Tx: TransactionsFile;
}

export type DocKey = Exclude<keyof RosterState, 'season'>;

export const DOC_KEYS: DocKey[] = ['fba', 'd2', 'freeAgents', 'reserves', 'picks', 'players', 'fbaTx', 'd2Tx'];

export function docPath(key: DocKey, season: number): string {
  switch (key) {
    case 'fba': return `leagues/fba/S${season}/rosters.json`;
    case 'd2': return `leagues/fbad2/S${season}/rosters.json`;
    case 'freeAgents': return `leagues/fba/S${season}/freeAgents.json`;
    case 'reserves': return `leagues/fbad2/S${season}/reserves.json`;
    case 'picks': return 'leagues/fba/picks.json';
    case 'players': return 'players.json';
    case 'fbaTx': return `leagues/fba/S${season}/transactions.json`;
    case 'd2Tx': return `leagues/fbad2/S${season}/transactions.json`;
  }
}

export interface MoveContext {
  batchId: string;
}

export type MoveResult =
  | { ok: true; state: RosterState; changed: DocKey[]; label: string; warnings: string[] }
  | { ok: false; problems: string[] };

export const fail = (problems: string[]): MoveResult => ({ ok: false, problems });

export function nameOf(state: RosterState, playerId: string): string {
  return state.players.players[playerId]?.name ?? 'Unnamed';
}

export function appendTx(tx: TransactionsFile, ctx: MoveContext, type: TransactionType, teams: string[], lines: string[]): TransactionsFile {
  const seq = tx.entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  return { ...tx, entries: [...tx.entries, { seq, batchId: ctx.batchId, type, teams, lines }] };
}

export function findOnRoster(r: RostersFile, playerId: string): { teamId: string; index: number; entry: RosterEntry } | null {
  for (const [teamId, entries] of Object.entries(r.teams)) {
    const index = entries.findIndex(e => e.playerId === playerId);
    if (index >= 0) return { teamId, index, entry: entries[index] };
  }
  return null;
}

export function withTeam(r: RostersFile, teamId: string, entries: RosterEntry[]): RostersFile {
  return { ...r, teams: { ...r.teams, [teamId]: entries } };
}

/** Replaces one pro league's rosters and transactions without computed-key spreads, so the RosterState type stays exact. */
export function withLeague(state: RosterState, league: 'fba' | 'fbad2', rosters: RostersFile, tx: TransactionsFile): RosterState {
  return league === 'fba' ? { ...state, fba: rosters, fbaTx: tx } : { ...state, d2: rosters, d2Tx: tx };
}
```

`web/engine/roster/rules.ts`:
```ts
import type { Position, RosterEntry } from '../shared/types';

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const CAP = 25;
export const MAX_AMOUNT = 8;
export const MAX_YEARS_NEW = 4;
export const MAX_YEARS_RESIGN = 5;

export type ContractKind = 'new' | 'resign' | 'rookie';

export function isExpired(e: RosterEntry, season: number): boolean {
  return e.playerId !== null && e.contractEnd !== null && e.contractEnd !== undefined && e.contractEnd < season;
}

export function payroll(entries: RosterEntry[], season: number): number {
  return entries.reduce((sum, e) => {
    const active = e.playerId !== null && e.contractEnd !== null && e.contractEnd !== undefined && e.contractEnd >= season;
    return sum + (active ? e.contractAmount ?? 0 : 0);
  }, 0);
}

export function contractEndFor(season: number, years: number): number {
  return season + years - 1;
}

export function contractProblems(t: { years: number; amount: number }, kind: ContractKind): string[] {
  const p: string[] = [];
  const yearsOk = Number.isInteger(t.years) && t.years >= 1;
  const amountOk = Number.isInteger(t.amount) && t.amount >= 1;
  if (!yearsOk) p.push('Years must be a whole number, at least 1');
  if (!amountOk) p.push('Amount must be a whole number of dollars, at least $1');
  if (!yearsOk || !amountOk) return p;
  if (kind === 'rookie') {
    if (!((t.years === 1 && t.amount === 1) || (t.years === 2 && t.amount === 2))) p.push('Rookie contracts are 1/$1 or 2/$2');
    return p;
  }
  if (t.amount > MAX_AMOUNT) p.push(`Amount can't exceed $${MAX_AMOUNT}`);
  const maxYears = kind === 'resign' ? MAX_YEARS_RESIGN : MAX_YEARS_NEW;
  if (t.years > maxYears) p.push(`${kind === 'resign' ? 'Re-signings' : 'New signings'} are limited to ${maxYears} years`);
  if (t.years > t.amount) p.push(`Years can't exceed dollars (${t.years} years needs at least $${t.years})`);
  return p;
}

export function capProblem(total: number): string | null {
  return total > CAP ? `Payroll would be $${total} (cap $${CAP})` : null;
}

export function slotProblems(teamId: string, entries: RosterEntry[]): string[] {
  const p: string[] = [];
  for (const pos of POSITIONS) {
    const n = entries.filter(e => e.position === pos && e.playerId !== null).length;
    if (n === 0) p.push(`${teamId}: no ${pos}`);
    if (n > 1) p.push(`${teamId}: ${n} players at ${pos}`);
  }
  return p;
}

export function vacantEntry(position: Position, league: 'fba' | 'fbad2'): RosterEntry {
  const e: RosterEntry = { playerId: null, position, rating: null, age: null, points: 0 };
  if (league === 'fba') {
    e.contractEnd = null;
    e.contractAmount = null;
  }
  return e;
}

/** Orders entries PG→C, keeps every player, and leaves exactly one vacant entry for each position with no player. */
export function normalizeRoster(entries: RosterEntry[], league: 'fba' | 'fbad2'): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const pos of POSITIONS) {
    const filled = entries.filter(e => e.position === pos && e.playerId !== null);
    out.push(...(filled.length ? filled : [vacantEntry(pos, league)]));
  }
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run engine/roster/rules`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/engine/roster
git commit -m "web: roster state, contract rules, and slot rules"
```

---

### Task 4: Draft pick labels, protections, and resolution

**Files:**
- Create: `web/engine/roster/picks.ts`
- Test: `web/engine/roster/picks.test.ts`

**Interfaces:**
- Consumes: `PickCondition`, `PickObligation`
- Produces:
  - `LOTTERY_SIZE = 14`
  - `pickLabel(ob): string`
  - `isProtected(c, slot, lotterySize): boolean`
  - `shrink(c, lotterySize): PickCondition`
  - `nextPriority(obligations, season, originalTeam): number`
  - `futureSeasons(season): number[]` (season+1 … season+4)
  - `owedFrom(obligations, season, originalTeam): PickObligation[]` (sorted by priority)
  - `ResolvedPick { slot; originalTeam; owner; obligationId: string | null; flag: string | null }`
  - `resolvePicks({ season, order, lotterySize, obligations }): { picks: ResolvedPick[]; obligations: PickObligation[] }`

- [ ] **Step 1: Write the failing test**

`web/engine/roster/picks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { PickCondition, PickObligation } from '../shared/types';
import { futureSeasons, isProtected, LOTTERY_SIZE, nextPriority, pickLabel, resolvePicks, shrink } from './picks';

const ob = (over: Partial<PickObligation>): PickObligation => ({
  id: 'x', season: 80, originalTeam: 'DCB', owner: 'OV', condition: { kind: 'none' }, originalCondition: { kind: 'none' },
  originSeason: 80, priority: 1, rolls: [], note: '', ...over,
});

// DCB's S80 pick is owed to OV (top 9, priority 1, originally LP from S75) and NY (top 11, priority 2, originally 12P from S79).
const dcb = (): PickObligation[] => [
  ob({ id: 'ov', owner: 'OV', condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, originSeason: 75, priority: 1 }),
  ob({ id: 'ny', owner: 'NY', condition: { kind: 'top', n: 11 }, originalCondition: { kind: 'top', n: 12 }, originSeason: 79, priority: 2 }),
];
const orderWithDcbAt = (slot: number) => {
  const others = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15'];
  const order = others.slice(0, slot - 1);
  order.push('DCB', ...others.slice(slot - 1));
  return order;
};

describe('labels and conditions', () => {
  it('formats pick labels like the sheet', () => {
    expect(pickLabel(ob({ season: 81, originalTeam: 'MON', owner: 'CGG', condition: { kind: 'top', n: 4 } }))).toBe('S81 Draft Pick(via MON)(4P)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'LA', condition: { kind: 'lottery' } }))).toBe('S81 Draft Pick(via LA)(LP)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'SAS', condition: { kind: 'none' } }))).toBe('S81 Draft Pick(via SAS)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'DCB', condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'DCB' } }))).toBe('S81 Pick Swap(DCB/SAS)(DCB gets better)');
    expect(pickLabel(ob({ season: 81, originalTeam: 'NY', condition: { kind: 'custom', text: 'if NY makes finals' } }))).toBe('S81 Draft Pick(via NY)(if NY makes finals)');
  });

  it('checks protection by slot', () => {
    expect(isProtected({ kind: 'top', n: 9 }, 9, LOTTERY_SIZE)).toBe(true);
    expect(isProtected({ kind: 'top', n: 9 }, 10, LOTTERY_SIZE)).toBe(false);
    expect(isProtected({ kind: 'lottery' }, 14, LOTTERY_SIZE)).toBe(true);
    expect(isProtected({ kind: 'lottery' }, 15, LOTTERY_SIZE)).toBe(false);
    expect(isProtected({ kind: 'none' }, 1, LOTTERY_SIZE)).toBe(false);
  });

  it('shrinks protection by one spot per roll', () => {
    const cases: [PickCondition, PickCondition][] = [
      [{ kind: 'lottery' }, { kind: 'top', n: 13 }],
      [{ kind: 'top', n: 9 }, { kind: 'top', n: 8 }],
      [{ kind: 'top', n: 1 }, { kind: 'none' }],
      [{ kind: 'none' }, { kind: 'none' }],
    ];
    for (const [from, to] of cases) expect(shrink(from, LOTTERY_SIZE)).toEqual(to);
  });

  it('lists future seasons and next priority', () => {
    expect(futureSeasons(79)).toEqual([80, 81, 82, 83]);
    expect(nextPriority(dcb(), 80, 'DCB')).toBe(3);
    expect(nextPriority(dcb(), 81, 'DCB')).toBe(1);
  });
});

describe('resolvePicks', () => {
  it('keeps a protected pick and rolls both obligations with smaller protection', () => {
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(5), lotterySize: LOTTERY_SIZE, obligations: dcb() });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toEqual({ slot: 5, originalTeam: 'DCB', owner: 'DCB', obligationId: null, flag: null });
    expect(r.obligations.map(o => [o.id, o.season, o.condition, o.priority, o.rolls])).toEqual([
      ['ov', 81, { kind: 'top', n: 8 }, 1, [{ fromSeason: 80, reason: 'protected' }]],
      ['ny', 81, { kind: 'top', n: 10 }, 2, [{ fromSeason: 80, reason: 'protected' }]],
    ]);
  });

  it('conveys to the first unprotected obligation and rolls the rest as already owed', () => {
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(12), lotterySize: LOTTERY_SIZE, obligations: dcb() });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'OV', obligationId: 'ov' });
    expect(r.obligations).toHaveLength(1);
    expect(r.obligations[0]).toMatchObject({ id: 'ny', season: 81, condition: { kind: 'top', n: 10 }, rolls: [{ fromSeason: 80, reason: 'already-owed' }] });
  });

  it('skips a protected first obligation and conveys to the next one', () => {
    const obligations = [ob({ id: 'a', owner: 'OV', condition: { kind: 'top', n: 12 }, priority: 1 }), ob({ id: 'b', owner: 'NY', condition: { kind: 'top', n: 9 }, priority: 2 })];
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(10), lotterySize: LOTTERY_SIZE, obligations });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'NY', obligationId: 'b' });
    expect(r.obligations[0]).toMatchObject({ id: 'a', season: 81, condition: { kind: 'top', n: 11 }, rolls: [{ fromSeason: 80, reason: 'protected' }] });
  });

  it('turns lottery protection into top 13 when it rolls', () => {
    const r = resolvePicks({ season: 81, order: orderWithDcbAt(3), lotterySize: LOTTERY_SIZE, obligations: [ob({ season: 81, condition: { kind: 'lottery' } })] });
    expect(r.obligations[0]).toMatchObject({ season: 82, condition: { kind: 'top', n: 13 } });
  });

  it('queues rolled obligations after ones already owed next season', () => {
    const obligations = [...dcb(), ob({ id: 'next', season: 81, owner: 'MEM', priority: 1 })];
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(5), lotterySize: LOTTERY_SIZE, obligations });
    expect(r.obligations.filter(o => o.season === 81).map(o => [o.id, o.priority])).toEqual([['next', 1], ['ov', 2], ['ny', 3]]);
  });

  it('gives the better pick of a swap to the named team', () => {
    const swap = ob({ id: 's', originalTeam: 'DCB', owner: 'SAS', condition: { kind: 'swap', otherTeam: 'SAS', betterTo: 'SAS' } });
    const r = resolvePicks({ season: 80, order: ['DCB', 'X', 'SAS'], lotterySize: LOTTERY_SIZE, obligations: [swap] });
    expect(r.picks.map(p => [p.slot, p.originalTeam, p.owner])).toEqual([[1, 'DCB', 'SAS'], [2, 'X', 'X'], [3, 'SAS', 'DCB']]);
    expect(r.obligations).toEqual([]);
  });

  it('flags custom conditions and leaves them unresolved', () => {
    const custom = ob({ id: 'c', condition: { kind: 'custom', text: 'if DCB wins the title' } });
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(4), lotterySize: LOTTERY_SIZE, obligations: [custom] });
    expect(r.picks.find(p => p.originalTeam === 'DCB')).toMatchObject({ owner: 'DCB', flag: 'Custom condition: decide manually' });
    expect(r.obligations).toEqual([custom]);
  });

  it('leaves other seasons untouched', () => {
    const later = ob({ id: 'later', season: 82 });
    const r = resolvePicks({ season: 80, order: orderWithDcbAt(1), lotterySize: LOTTERY_SIZE, obligations: [later] });
    expect(r.obligations).toEqual([later]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/roster/picks`
Expected: FAIL, cannot resolve `./picks`.

- [ ] **Step 3: Implement**

`web/engine/roster/picks.ts`:
```ts
import type { PickCondition, PickObligation } from '../shared/types';

export const LOTTERY_SIZE = 14;

export function pickLabel(ob: PickObligation): string {
  const c = ob.condition;
  if (c.kind === 'swap') return `S${ob.season} Pick Swap(${ob.originalTeam}/${c.otherTeam})(${c.betterTo} gets better)`;
  const base = `S${ob.season} Draft Pick(via ${ob.originalTeam})`;
  switch (c.kind) {
    case 'none': return base;
    case 'top': return `${base}(${c.n}P)`;
    case 'lottery': return `${base}(LP)`;
    case 'custom': return `${base}(${c.text})`;
  }
}

export function isProtected(c: PickCondition, slot: number, lotterySize: number): boolean {
  if (c.kind === 'top') return slot <= c.n;
  if (c.kind === 'lottery') return slot <= lotterySize;
  return false;
}

export function shrink(c: PickCondition, lotterySize: number): PickCondition {
  const n = c.kind === 'lottery' ? lotterySize - 1 : c.kind === 'top' ? c.n - 1 : null;
  if (n === null) return c;
  return n >= 1 ? { kind: 'top', n } : { kind: 'none' };
}

export function futureSeasons(season: number): number[] {
  return [1, 2, 3, 4].map(i => season + i);
}

const byPriority = (a: PickObligation, b: PickObligation) => a.priority - b.priority || a.id.localeCompare(b.id);

export function owedFrom(obligations: PickObligation[], season: number, originalTeam: string): PickObligation[] {
  return obligations.filter(o => o.season === season && o.originalTeam === originalTeam).sort(byPriority);
}

export function nextPriority(obligations: PickObligation[], season: number, originalTeam: string): number {
  return owedFrom(obligations, season, originalTeam).reduce((m, o) => Math.max(m, o.priority), 0) + 1;
}

export interface ResolvedPick {
  slot: number;
  originalTeam: string;
  owner: string;
  obligationId: string | null;
  flag: string | null;
}

export function resolvePicks(input: { season: number; order: string[]; lotterySize: number; obligations: PickObligation[] }): {
  picks: ResolvedPick[];
  obligations: PickObligation[];
} {
  const { season, order, lotterySize } = input;
  const slotOf = new Map(order.map((t, i) => [t, i + 1]));
  const holder = new Map<string, Omit<ResolvedPick, 'slot' | 'originalTeam'>>(
    order.map(t => [t, { owner: t, obligationId: null, flag: null }]),
  );
  const kept = input.obligations.filter(o => o.season !== season);
  const current = input.obligations.filter(o => o.season === season);
  const rolled: PickObligation[] = [];

  const swaps = current.filter(o => o.condition.kind === 'swap');
  const swapTeams = new Set<string>();
  for (const s of swaps) {
    if (s.condition.kind !== 'swap') continue;
    const a = s.originalTeam;
    const b = s.condition.otherTeam;
    swapTeams.add(a).add(b);
    const slotA = slotOf.get(a);
    const slotB = slotOf.get(b);
    if (slotA === undefined || slotB === undefined) {
      kept.push(s);
      continue;
    }
    const better = slotA < slotB ? a : b;
    const worse = better === a ? b : a;
    const other = s.condition.betterTo === a ? b : a;
    holder.set(better, { owner: s.condition.betterTo, obligationId: s.id, flag: null });
    holder.set(worse, { owner: other, obligationId: s.id, flag: null });
  }

  for (const team of order) {
    const queue = current.filter(o => o.originalTeam === team && o.condition.kind !== 'swap').sort(byPriority);
    if (!queue.length) continue;
    if (swapTeams.has(team)) {
      holder.set(team, { ...holder.get(team)!, flag: 'Pick is part of a swap and also owed: decide manually' });
      kept.push(...queue);
      continue;
    }
    if (queue.some(o => o.condition.kind === 'custom')) {
      holder.set(team, { owner: team, obligationId: null, flag: 'Custom condition: decide manually' });
      kept.push(...queue);
      continue;
    }
    const slot = slotOf.get(team)!;
    let conveyed = false;
    for (const o of queue) {
      if (!conveyed && !isProtected(o.condition, slot, lotterySize)) {
        conveyed = true;
        holder.set(team, { owner: o.owner, obligationId: o.id, flag: null });
        continue;
      }
      rolled.push({
        ...o,
        season: season + 1,
        condition: shrink(o.condition, lotterySize),
        rolls: [...o.rolls, { fromSeason: season, reason: conveyed ? 'already-owed' : 'protected' }],
      });
    }
  }

  kept.push(...current.filter(o => o.condition.kind !== 'swap' && !slotOf.has(o.originalTeam)));

  const placed: PickObligation[] = [];
  for (const r of rolled) placed.push({ ...r, priority: nextPriority([...kept, ...placed], r.season, r.originalTeam) });

  return {
    picks: order.map((t, i) => ({ slot: i + 1, originalTeam: t, ...holder.get(t)! })),
    obligations: [...kept, ...placed],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/roster/picks`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/engine/roster/picks.ts web/engine/roster/picks.test.ts
git commit -m "web: draft pick labels, protection rolls, and pick resolution"
```

---

### Task 5: Sign, re-sign, release/cut, edit, and close free agency

**Files:**
- Create: `web/engine/roster/moves.ts`
- Test: `web/engine/roster/moves.test.ts`

**Interfaces:**
- Consumes: `state.ts` and `rules.ts` (Task 3), `baseState` (fixture)
- Produces:
  - `SignInput { playerId; teamId; years; amount; rating?: number; conflict: 'keep' | 'release' | 'cut' }`
  - `signPlayer(state, input, ctx): MoveResult`
  - `ReleaseInput { league: 'fba' | 'fbad2'; teamId; playerId; kind: 'released' | 'cut' }`
  - `releasePlayer(state, input, ctx): MoveResult`
  - `EditChanges = Partial<{ rating: number | null; age: number | null; contractEnd: number | null; contractAmount: number | null; restricted: boolean }>`
  - `EditInput { league; teamId; playerId; changes: EditChanges }`
  - `editWarnings(state, input): string[]`
  - `editPlayer(state, input, ctx): MoveResult`
  - `freeAgencyBlockers(state): string[]`
  - `closeFreeAgency(state, ctx): MoveResult`

Behavior notes (spec §3):
- **Who can be signed:** a free agent, a D2 roster player, or an FBA player whose contract has expired.
  - Signing your own expired player is a **re-sign** (5-year max, and the new contract is unrestricted).
  - Another team signing an unrestricted expired player takes him off his old team, and the old team gets a `Released … (contract ended)` log entry.
  - A restricted expired player can only be re-signed by his own team.
  - Rookies (`FreeAgent.rookie`) must sign 1/$1 or 2/$2, and their contract is restricted.
- **Ratings:** signing a D2 player requires `rating` (his FBA rating). A player whose rating is null also requires `rating`.
- **Conflicts:** `conflict` decides what happens to a player already at that position. `release` and `cut` send him to the FA pool; `keep` keeps both players and returns a slot warning.
- **Release after FA closes:** once free agency is closed (`freeAgents.locked`), an FBA release sends the player to D2 Reserves (rating null) instead. A D2 release or cut always goes to Reserves and keeps his D2 rating.
- **Closing free agency** moves every unsigned free agent into `reserves.json` with rating null. The spec's D2 pool is "D2 rosters + Reserves + leftover FBA free agents", so appending them to Reserves is exactly how they enter the pool. Phase 2 builds `pool.json` from rosters and Reserves.

- [ ] **Step 1: Write the failing test**

`web/engine/roster/moves.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { closeFreeAgency, editPlayer, editWarnings, freeAgencyBlockers, releasePlayer, signPlayer } from './moves';
import { payroll } from './rules';
import type { MoveResult, RosterState } from './state';
import { baseState } from './testFixtures';

const ctx = { batchId: 'b1' };
const ok = (r: MoveResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.problems.join('; ')}`);
  return r;
};
const problems = (r: MoveResult) => (r.ok ? [] : r.problems);

describe('signPlayer', () => {
  it('signs a free agent into an open slot', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.CAR[4]).toEqual({ playerId: 'p00030', position: 'C', rating: 68, age: 27, points: 0, contractEnd: 80, contractAmount: 2, restricted: false });
    expect(payroll(r.state.fba.teams.CAR, 79)).toBe(25);
    expect(r.state.freeAgents.players.map(p => p.playerId)).toEqual(['p00031', 'p00032']);
    expect(r.state.fbaTx.entries).toEqual([{ seq: 1, batchId: 'b1', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }]);
    expect(r.changed.sort()).toEqual(['fba', 'fbaTx', 'freeAgents']);
    expect(r.label).toBe('Sign Azubuike Okoro → CAR');
    expect(r.warnings).toEqual([]);
  });

  it('blocks deals that break the cap or contract rules', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 3, amount: 3, conflict: 'release' }, ctx))).toEqual(['Payroll would be $26 (cap $25)']);
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'MON', years: 2, amount: 1, conflict: 'release' }, ctx))).toEqual(["Years can't exceed dollars (2 years needs at least $2)"]);
    expect(problems(signPlayer(baseState(), { playerId: 'p00030', teamId: 'MON', years: 5, amount: 5, conflict: 'release' }, ctx))).toEqual(['New signings are limited to 4 years']);
  });

  it('signs rookies only to the rookie scale, restricted, with a rating', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00031', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, ctx))).toEqual(['Enter a rating for this player']);
    expect(problems(signPlayer(baseState(), { playerId: 'p00031', teamId: 'MON', years: 3, amount: 3, rating: 70, conflict: 'release' }, ctx))).toEqual(['Rookie contracts are 1/$1 or 2/$2']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00031', teamId: 'CAR', years: 1, amount: 1, rating: 70, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.CAR[4]).toMatchObject({ playerId: 'p00031', rating: 70, contractEnd: 79, contractAmount: 1, restricted: true });
  });

  it('signs a D2 player with a new FBA rating and opens his D2 slot', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, conflict: 'release' }, ctx))).toEqual(['Enter his FBA rating (D2 ratings are on a different scale)']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.MON[1]).toMatchObject({ playerId: 'p00021', position: 'SG', rating: 70 });
    expect(r.state.d2.teams.AMS[1]).toEqual({ playerId: null, position: 'SG', rating: null, age: null, points: 0 });
    expect(r.state.d2Tx.entries[0].lines).toEqual(['SG-Brooks Burrows signed by MON (FBA)']);
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx', 'fba', 'fbaTx']);
  });

  it('releases or cuts the current starter as part of the signing', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00032', teamId: 'BOS', years: 1, amount: 1, conflict: 'cut' }, ctx));
    expect(r.state.fba.teams.BOS.filter(e => e.position === 'SF').map(e => e.playerId)).toEqual(['p00032']);
    expect(r.state.freeAgents.players.find(p => p.playerId === 'p00003')).toEqual({ playerId: 'p00003', position: 'SF', age: 25, rating: 67, rookie: false, note: '' });
    expect(r.state.fbaTx.entries[0].lines).toEqual(['Signed SF-Mubiru Okeke (1/$1, thru S79)', "Cut SF-Koa'e Keano"]);
  });

  it('can keep both players and warns about the doubled slot', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00032', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx));
    expect(r.state.fba.teams.BOS).toHaveLength(6);
    expect(r.warnings).toEqual(['BOS: 2 players at SF']);
  });

  it('lets another team sign an unrestricted expired player', () => {
    const r = ok(signPlayer(baseState(), { playerId: 'p00004', teamId: 'MON', years: 1, amount: 1, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.BOS[3]).toMatchObject({ playerId: null, position: 'PF' });
    expect(r.state.fba.teams.MON[3]).toMatchObject({ playerId: 'p00004' });
    expect(r.state.freeAgents.players.some(p => p.playerId === 'p00012')).toBe(true);
    expect(r.state.fbaTx.entries.map(e => [e.type, e.teams, e.lines])).toEqual([
      ['signed', ['MON'], ['Signed PF-Callan Schwangau (1/$1, thru S79)', 'Released PF-Dan Price']],
      ['released', ['BOS'], ['Released PF-Callan Schwangau (contract ended)']],
    ]);
  });

  it("protects a restricted expired player from other teams and lets his team re-sign him", () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00012', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['Dan Price is restricted: only MON can re-sign him']);
    const r = ok(signPlayer(baseState(), { playerId: 'p00012', teamId: 'MON', years: 5, amount: 5, conflict: 'release' }, ctx));
    expect(r.state.fba.teams.MON[3]).toMatchObject({ playerId: 'p00012', contractEnd: 83, contractAmount: 5, restricted: false });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'resigned', lines: ['Re-signed PF-Dan Price (5/$5, thru S83)'] });
    expect(r.label).toBe('Re-sign Dan Price → MON');
  });

  it('refuses unknown players and closed free agency', () => {
    expect(problems(signPlayer(baseState(), { playerId: 'p00001', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['That player is not available to sign']);
    const closed: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    expect(problems(signPlayer(closed, { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx))).toEqual(['Free agency is closed']);
  });
});

describe('releasePlayer', () => {
  it('releases an FBA player to the free-agent pool', () => {
    const r = ok(releasePlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00002', kind: 'released' }, ctx));
    expect(r.state.fba.teams.BOS[1]).toMatchObject({ playerId: null, position: 'SG' });
    expect(r.state.freeAgents.players.at(-1)).toMatchObject({ playerId: 'p00002', rating: 88 });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'released', teams: ['BOS'], lines: ['Released SG-Yasin Milovanovic'] });
  });

  it('cuts a D2 player to Reserves, keeping his D2 rating', () => {
    const r = ok(releasePlayer(baseState(), { league: 'fbad2', teamId: 'AMS', playerId: 'p00023', kind: 'cut' }, ctx));
    expect(r.state.reserves.players.at(-1)).toEqual({ playerId: 'p00023', position: 'PF', age: 22, rating: 94 });
    expect(r.state.d2Tx.entries[0].lines).toEqual(['Cut PF-Maddox Dean']);
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx', 'reserves']);
  });

  it('sends FBA releases to Reserves after free agency closes', () => {
    const closed: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    const r = ok(releasePlayer(closed, { league: 'fba', teamId: 'BOS', playerId: 'p00002', kind: 'cut' }, ctx));
    expect(r.state.reserves.players.at(-1)).toEqual({ playerId: 'p00002', position: 'SG', age: 28, rating: null });
    expect(r.changed).not.toContain('freeAgents');
  });

  it('refuses a player who is not on the team', () => {
    expect(problems(releasePlayer(baseState(), { league: 'fba', teamId: 'CAR', playerId: 'p00002', kind: 'cut' }, ctx))).toEqual(['That player is not on CAR']);
  });
});

describe('editPlayer', () => {
  it('applies changes and logs them', () => {
    const r = ok(editPlayer(baseState(), { league: 'fba', teamId: 'BOS', playerId: 'p00001', changes: { rating: 96, contractEnd: 81 } }, ctx));
    expect(r.state.fba.teams.BOS[0]).toMatchObject({ rating: 96, contractEnd: 81 });
    expect(r.state.fbaTx.entries[0]).toMatchObject({ type: 'edit', lines: ['Edited PG-Gabriel Greenwood: rating 95→96, contract end S80→S81'] });
  });

  it('warns without blocking when an edit breaks a rule', () => {
    const input = { league: 'fba' as const, teamId: 'BOS', playerId: 'p00001', changes: { contractAmount: 10 } };
    expect(editWarnings(baseState(), input)).toEqual(["Amount can't exceed $8"]);
    const r = ok(editPlayer(baseState(), input, ctx));
    expect(r.warnings).toEqual(editWarnings(baseState(), input));
  });
});

describe('closing free agency', () => {
  it('lists what blocks closing', () => {
    expect(freeAgencyBlockers(baseState())).toEqual([
      "BOS: SF-Koa'e Keano's contract expired (re-sign or release him)",
      "BOS: PF-Callan Schwangau's contract expired (re-sign or release him)",
      'CAR: no C',
      'MON: no SG',
      "MON: PF-Dan Price's contract expired (re-sign or release him)",
    ]);
    expect(problems(closeFreeAgency(baseState(), ctx))).toHaveLength(5);
  });

  it('moves unsigned free agents to D2 Reserves and locks the pool', () => {
    let s = baseState();
    s = ok(signPlayer(s, { playerId: 'p00003', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00004', teamId: 'BOS', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00030', teamId: 'CAR', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00012', teamId: 'MON', years: 1, amount: 1, conflict: 'keep' }, ctx)).state;
    s = ok(signPlayer(s, { playerId: 'p00021', teamId: 'MON', years: 1, amount: 1, rating: 70, conflict: 'keep' }, ctx)).state;
    expect(freeAgencyBlockers(s)).toEqual([]);
    const r = ok(closeFreeAgency(s, ctx));
    expect(r.state.freeAgents).toEqual({ league: 'fba', season: 79, locked: true, players: [] });
    expect(r.state.reserves.players.map(p => [p.playerId, p.rating])).toEqual([['p00040', null], ['p00031', null], ['p00032', null]]);
    expect(r.state.fbaTx.entries.at(-1)).toMatchObject({ type: 'fa-closed', lines: ['Free agency closed: 2 unsigned players moved to D2 Reserves'] });
    expect(r.changed.sort()).toEqual(['fbaTx', 'freeAgents', 'reserves']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/roster/moves`
Expected: FAIL, cannot resolve `./moves`.

- [ ] **Step 3: Implement**

`web/engine/roster/moves.ts`:
```ts
import type { FreeAgent, Position, RosterEntry } from '../shared/types';
import {
  CAP, capProblem, contractEndFor, contractProblems, isExpired, MAX_AMOUNT, MAX_YEARS_RESIGN, normalizeRoster, payroll, POSITIONS, slotProblems,
  type ContractKind,
} from './rules';
import {
  appendTx, type DocKey, fail, findOnRoster, type MoveContext, type MoveResult, nameOf, type RosterState, withLeague, withTeam,
} from './state';

export interface SignInput {
  playerId: string;
  teamId: string;
  years: number;
  amount: number;
  rating?: number;
  conflict: 'keep' | 'release' | 'cut';
}

type Source =
  | { kind: 'fa'; fa: FreeAgent }
  | { kind: 'd2'; teamId: string; entry: RosterEntry }
  | { kind: 'expired'; teamId: string; entry: RosterEntry };

function findSource(state: RosterState, playerId: string): Source | null {
  const fa = state.freeAgents.players.find(p => p.playerId === playerId);
  if (fa) return { kind: 'fa', fa };
  const d2 = findOnRoster(state.d2, playerId);
  if (d2) return { kind: 'd2', teamId: d2.teamId, entry: d2.entry };
  const fba = findOnRoster(state.fba, playerId);
  if (fba && isExpired(fba.entry, state.season)) return { kind: 'expired', teamId: fba.teamId, entry: fba.entry };
  return null;
}

const toFreeAgent = (e: RosterEntry): FreeAgent => ({ playerId: e.playerId!, position: e.position, age: e.age, rating: e.rating, rookie: false, note: '' });

export function signPlayer(state: RosterState, input: SignInput, ctx: MoveContext): MoveResult {
  const { season } = state;
  if (state.freeAgents.locked) return fail(['Free agency is closed']);
  const team = state.fba.teams[input.teamId];
  if (!team) return fail([`Unknown FBA team ${input.teamId}`]);
  const src = findSource(state, input.playerId);
  if (!src) return fail(['That player is not available to sign']);

  const name = nameOf(state, input.playerId);
  const position: Position = src.kind === 'fa' ? src.fa.position : src.entry.position;
  const age = src.kind === 'fa' ? src.fa.age : src.entry.age;
  const resign = src.kind === 'expired' && src.teamId === input.teamId;
  if (src.kind === 'expired' && !resign && src.entry.restricted) return fail([`${name} is restricted: only ${src.teamId} can re-sign him`]);
  const kind: ContractKind = resign ? 'resign' : src.kind === 'fa' && src.fa.rookie ? 'rookie' : 'new';

  const problems = contractProblems({ years: input.years, amount: input.amount }, kind);
  const knownRating = src.kind === 'fa' ? src.fa.rating : src.kind === 'expired' ? src.entry.rating : null;
  const rating = input.rating ?? knownRating;
  if (src.kind === 'd2' && input.rating === undefined) problems.push('Enter his FBA rating (D2 ratings are on a different scale)');
  else if (rating === null) problems.push('Enter a rating for this player');
  else if (!Number.isInteger(rating) || rating < 1 || rating > 99) problems.push('Rating must be a whole number from 1 to 99');

  let entries = team.filter(e => e.playerId !== input.playerId);
  const occupant = entries.find(e => e.position === position && e.playerId !== null);
  const displaced = occupant && input.conflict !== 'keep' ? occupant : null;
  if (displaced) entries = entries.filter(e => e !== displaced);
  const end = contractEndFor(season, input.years);
  entries = normalizeRoster(
    [...entries, { playerId: input.playerId, position, rating: rating ?? null, age, points: 0, contractEnd: end, contractAmount: input.amount, restricted: kind === 'rookie' }],
    'fba',
  );
  const cap = capProblem(payroll(entries, season));
  if (cap) problems.push(cap);
  if (problems.length) return fail(problems);

  const changed = new Set<DocKey>(['fba', 'fbaTx']);
  let fba = withTeam(state.fba, input.teamId, entries);
  let { d2, freeAgents, d2Tx } = state;
  const lines = [`${resign ? 'Re-signed' : 'Signed'} ${position}-${name} (${input.years}/$${input.amount}, thru S${end})`];

  if (src.kind === 'fa') {
    freeAgents = { ...freeAgents, players: freeAgents.players.filter(p => p.playerId !== input.playerId) };
    changed.add('freeAgents');
  }
  if (src.kind === 'd2') {
    d2 = withTeam(d2, src.teamId, normalizeRoster(d2.teams[src.teamId].filter(e => e.playerId !== input.playerId), 'fbad2'));
    d2Tx = appendTx(d2Tx, ctx, 'signed', [src.teamId], [`${position}-${name} signed by ${input.teamId} (FBA)`]);
    changed.add('d2').add('d2Tx');
  }
  if (src.kind === 'expired' && !resign) {
    fba = withTeam(fba, src.teamId, normalizeRoster(fba.teams[src.teamId].filter(e => e.playerId !== input.playerId), 'fba'));
  }
  if (displaced) {
    freeAgents = { ...freeAgents, players: [...freeAgents.players, toFreeAgent(displaced)] };
    changed.add('freeAgents');
    lines.push(`${input.conflict === 'cut' ? 'Cut' : 'Released'} ${displaced.position}-${nameOf(state, displaced.playerId!)}`);
  }

  let fbaTx = appendTx(state.fbaTx, ctx, resign ? 'resigned' : 'signed', [input.teamId], lines);
  if (src.kind === 'expired' && !resign) {
    fbaTx = appendTx(fbaTx, ctx, 'released', [src.teamId], [`Released ${position}-${name} (contract ended)`]);
  }

  return {
    ok: true,
    state: { ...state, fba, d2, freeAgents, fbaTx, d2Tx },
    changed: [...changed],
    label: `${resign ? 'Re-sign' : 'Sign'} ${name} → ${input.teamId}`,
    warnings: slotProblems(input.teamId, entries).filter(p => !p.includes(': no ')),
  };
}

export interface ReleaseInput {
  league: 'fba' | 'fbad2';
  teamId: string;
  playerId: string;
  kind: 'released' | 'cut';
}

export function releasePlayer(state: RosterState, input: ReleaseInput, ctx: MoveContext): MoveResult {
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const team = state[key].teams[input.teamId];
  const entry = team?.find(e => e.playerId === input.playerId);
  if (!team || !entry) return fail([`That player is not on ${input.teamId}`]);

  const name = nameOf(state, input.playerId);
  const rosters = withTeam(state[key], input.teamId, normalizeRoster(team.filter(e => e !== entry), input.league));
  const changed: DocKey[] = [key, txKey];
  let { freeAgents, reserves } = state;
  if (input.league === 'fba' && !freeAgents.locked) {
    freeAgents = { ...freeAgents, players: [...freeAgents.players, toFreeAgent(entry)] };
    changed.push('freeAgents');
  } else {
    const rating = input.league === 'fbad2' ? entry.rating : null;
    reserves = { ...reserves, players: [...reserves.players, { playerId: input.playerId, position: entry.position, age: entry.age, rating }] };
    changed.push('reserves');
  }
  const verb = input.kind === 'cut' ? 'Cut' : 'Released';
  const tx = appendTx(state[txKey], ctx, input.kind, [input.teamId], [`${verb} ${entry.position}-${name}`]);
  return {
    ok: true,
    state: { ...withLeague(state, input.league, rosters, tx), freeAgents, reserves },
    changed,
    label: `${verb === 'Cut' ? 'Cut' : 'Release'} ${name} (${input.teamId})`,
    warnings: [],
  };
}

export type EditChanges = Partial<{
  rating: number | null;
  age: number | null;
  contractEnd: number | null;
  contractAmount: number | null;
  restricted: boolean;
}>;

export interface EditInput {
  league: 'fba' | 'fbad2';
  teamId: string;
  playerId: string;
  changes: EditChanges;
}

function applyEdit(state: RosterState, input: EditInput): { entries: RosterEntry[]; before: RosterEntry; after: RosterEntry } | null {
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const team = state[key].teams[input.teamId];
  const before = team?.find(e => e.playerId === input.playerId);
  if (!team || !before) return null;
  const after: RosterEntry = { ...before, ...input.changes };
  return { entries: team.map(e => (e === before ? after : e)), before, after };
}

export function editWarnings(state: RosterState, input: EditInput): string[] {
  const applied = applyEdit(state, input);
  if (!applied || input.league !== 'fba') return [];
  const { after, entries } = applied;
  const w: string[] = [];
  if (after.contractAmount != null && after.contractAmount > MAX_AMOUNT) w.push(`Amount can't exceed $${MAX_AMOUNT}`);
  if (after.contractEnd != null && after.contractEnd - state.season + 1 > MAX_YEARS_RESIGN) w.push(`Contract runs more than ${MAX_YEARS_RESIGN} seasons`);
  if (after.contractEnd != null && after.contractAmount != null && after.contractEnd - state.season + 1 > after.contractAmount) w.push("Years exceed dollars");
  const total = payroll(entries, state.season);
  if (total > CAP) w.push(`Payroll would be $${total} (cap $${CAP})`);
  return w;
}

const FIELD_LABEL: Record<keyof EditChanges, string> = {
  rating: 'rating', age: 'age', contractEnd: 'contract end', contractAmount: 'amount', restricted: 'restricted',
};

function show(field: keyof EditChanges, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (field === 'contractEnd') return `S${v}`;
  if (field === 'contractAmount') return `$${v}`;
  return String(v);
}

export function editPlayer(state: RosterState, input: EditInput, ctx: MoveContext): MoveResult {
  const applied = applyEdit(state, input);
  if (!applied) return fail([`That player is not on ${input.teamId}`]);
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const name = nameOf(state, input.playerId);
  const diffs = (Object.keys(input.changes) as (keyof EditChanges)[])
    .filter(f => applied.before[f] !== applied.after[f])
    .map(f => `${FIELD_LABEL[f]} ${show(f, applied.before[f])}→${show(f, applied.after[f])}`);
  const tx = appendTx(state[txKey], ctx, 'edit', [input.teamId], [`Edited ${applied.before.position}-${name}: ${diffs.join(', ') || 'no changes'}`]);
  return {
    ok: true,
    state: withLeague(state, input.league, withTeam(state[key], input.teamId, applied.entries), tx),
    changed: [key, txKey],
    label: `Edit ${name}`,
    warnings: editWarnings(state, input),
  };
}

export function freeAgencyBlockers(state: RosterState): string[] {
  const out: string[] = [];
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    for (const pos of POSITIONS) {
      const players = entries.filter(e => e.position === pos && e.playerId !== null);
      if (players.length === 0) out.push(`${teamId}: no ${pos}`);
      if (players.length > 1) out.push(`${teamId}: ${players.length} players at ${pos}`);
      for (const e of players) {
        if (isExpired(e, state.season)) out.push(`${teamId}: ${pos}-${nameOf(state, e.playerId!)}'s contract expired (re-sign or release him)`);
      }
    }
    const cap = capProblem(payroll(entries, state.season));
    if (cap) out.push(`${teamId}: ${cap}`);
  }
  return out;
}

export function closeFreeAgency(state: RosterState, ctx: MoveContext): MoveResult {
  if (state.freeAgents.locked) return fail(['Free agency is already closed']);
  const blockers = freeAgencyBlockers(state);
  if (blockers.length) return fail(blockers);
  const moved = state.freeAgents.players;
  const reserves = {
    ...state.reserves,
    players: [...state.reserves.players, ...moved.map(p => ({ playerId: p.playerId, position: p.position, age: p.age, rating: null }))],
  };
  const fbaTx = appendTx(state.fbaTx, ctx, 'fa-closed', [], [`Free agency closed: ${moved.length} unsigned players moved to D2 Reserves`]);
  return {
    ok: true,
    state: { ...state, freeAgents: { ...state.freeAgents, locked: true, players: [] }, reserves, fbaTx },
    changed: ['freeAgents', 'reserves', 'fbaTx'],
    label: 'Close free agency',
    warnings: [],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/roster/moves`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/engine/roster/moves.ts web/engine/roster/moves.test.ts
git commit -m "web: sign, re-sign, release, edit, and close free agency moves"
```

---

### Task 6: Trades and the market list

**Files:**
- Create: `web/engine/roster/trade.ts`, `web/engine/roster/market.ts`
- Test: `web/engine/roster/trade.test.ts`, `web/engine/roster/market.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5
- Produces:
  - `TradeAsset = { kind: 'player'; playerId; from; to } | { kind: 'pick'; obligationId; from; to } | { kind: 'ownPick'; season; from; to; condition: PickCondition }`
  - `TradeInput { league: 'fba' | 'fbad2'; teams: string[]; assets: TradeAsset[] }`
  - `makeTrade(state, input, ctx): MoveResult`
  - `MarketType = 'FA' | 'Rookie' | 'D2' | 'Expired'`
  - `MarketRow { playerId; name; position; age; rating: number | null; scale: 'FBA' | 'D2'; type: MarketType; from: string | null }`
  - `marketRows(state): MarketRow[]`
  - `openPositions(entries): Position[]`

- [ ] **Step 1: Write the failing tests**

`web/engine/roster/trade.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { MoveResult, RosterState } from './state';
import { baseState } from './testFixtures';
import { makeTrade } from './trade';

const ctx = { batchId: 'bT' };
const ok = (r: MoveResult) => {
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r;
};
const problems = (r: MoveResult) => (r.ok ? [] : r.problems);

describe('makeTrade', () => {
  it('moves a player one way and a protected own pick the other way', () => {
    const r = ok(makeTrade(baseState(), {
      league: 'fba', teams: ['CAR', 'MON'], assets: [
        { kind: 'player', playerId: 'p00007', from: 'CAR', to: 'MON' },
        { kind: 'ownPick', season: 81, from: 'MON', to: 'CAR', condition: { kind: 'top', n: 4 } },
      ],
    }, ctx));
    expect(r.state.fba.teams.MON[1]).toMatchObject({ playerId: 'p00007', position: 'SG' });
    expect(r.state.fba.teams.CAR[1]).toMatchObject({ playerId: null, position: 'SG' });
    expect(r.state.picks.obligations).toEqual([{
      id: 'bT-1', season: 81, originalTeam: 'MON', owner: 'CAR', condition: { kind: 'top', n: 4 }, originalCondition: { kind: 'top', n: 4 },
      originSeason: 81, priority: 1, rolls: [], note: '',
    }]);
    expect(r.state.fbaTx.entries[0]).toEqual({ seq: 1, batchId: 'bT', type: 'trade', teams: ['CAR', 'MON'], lines: ['->MON SG-Terence Hopkins', '->CAR S81 Draft Pick(via MON)(4P)'] });
    expect(r.warnings).toEqual(['CAR: no SG', 'CAR: no C']);
    expect(r.changed.sort()).toEqual(['fba', 'fbaTx', 'picks']);
    expect(r.label).toBe('Trade CAR/MON');
  });

  it('blocks a trade that puts a team over the cap', () => {
    const r = makeTrade(baseState(), { league: 'fba', teams: ['CAR', 'BOS'], assets: [{ kind: 'player', playerId: 'p00009', from: 'CAR', to: 'BOS' }] }, ctx);
    expect(problems(r)).toEqual(['BOS: Payroll would be $30 (cap $25)']);
  });

  it('blocks slot problems once free agency is closed', () => {
    const s: RosterState = { ...baseState(), freeAgents: { ...baseState().freeAgents, locked: true } };
    const r = makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'player', playerId: 'p00007', from: 'CAR', to: 'MON' }] }, ctx);
    expect(problems(r)).toContain('CAR: no SG');
  });

  it('passes an owned obligation on without changing its condition', () => {
    const first = ok(makeTrade(baseState(), { league: 'fba', teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 81, from: 'MON', to: 'CAR', condition: { kind: 'lottery' } }] }, ctx));
    const r = ok(makeTrade(first.state, { league: 'fba', teams: ['CAR', 'BOS'], assets: [{ kind: 'pick', obligationId: 'bT-1', from: 'CAR', to: 'BOS' }] }, { batchId: 'bU' }));
    expect(r.state.picks.obligations[0]).toMatchObject({ owner: 'BOS', condition: { kind: 'lottery' } });
    expect(r.state.fbaTx.entries.at(-1)!.lines).toEqual(['->BOS S81 Draft Pick(via MON)(LP)']);
  });

  it('adds a second obligation on an already-owed pick at the next priority', () => {
    const first = ok(makeTrade(baseState(), { league: 'fba', teams: ['MON', 'CAR'], assets: [{ kind: 'ownPick', season: 80, from: 'MON', to: 'CAR', condition: { kind: 'top', n: 9 } }] }, ctx));
    const r = ok(makeTrade(first.state, { league: 'fba', teams: ['MON', 'BOS'], assets: [{ kind: 'ownPick', season: 80, from: 'MON', to: 'BOS', condition: { kind: 'top', n: 11 } }] }, { batchId: 'bV' }));
    expect(r.state.picks.obligations.map(o => [o.owner, o.priority])).toEqual([['CAR', 1], ['BOS', 2]]);
  });

  it('validates assets', () => {
    const s = baseState();
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR'], assets: [] }, ctx))).toEqual(['A trade needs at least two teams', 'Add at least one player or pick']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'player', playerId: 'p00001', from: 'CAR', to: 'MON' }] }, ctx))).toEqual(['Gabriel Greenwood is not on CAR']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'pick', obligationId: 'nope', from: 'CAR', to: 'MON' }] }, ctx))).toEqual(['CAR does not own pick nope']);
    expect(problems(makeTrade(s, { league: 'fba', teams: ['CAR', 'MON'], assets: [{ kind: 'ownPick', season: 90, from: 'CAR', to: 'MON', condition: { kind: 'none' } }] }, ctx))).toEqual(['Picks can be traded for S80–S83']);
    expect(problems(makeTrade(s, { league: 'fbad2', teams: ['AMS', 'X'], assets: [] }, ctx))).toContain('Unknown team X');
  });

  it('trades between D2 teams without contracts or picks', () => {
    const s = baseState();
    s.d2.teams.ZUR = [{ playerId: 'p00040', position: 'PG', rating: 70, age: 30, points: 0 }];
    const r = ok(makeTrade(s, { league: 'fbad2', teams: ['AMS', 'ZUR'], assets: [{ kind: 'player', playerId: 'p00020', from: 'AMS', to: 'ZUR' }, { kind: 'player', playerId: 'p00040', from: 'ZUR', to: 'AMS' }] }, ctx));
    expect(r.state.d2.teams.AMS[0].playerId).toBe('p00040');
    expect(r.changed.sort()).toEqual(['d2', 'd2Tx']);
  });
});
```

`web/engine/roster/market.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { marketRows, openPositions } from './market';
import { baseState } from './testFixtures';

describe('marketRows', () => {
  it('lists free agents, rookies, D2 players, and unrestricted expired contracts', () => {
    const rows = marketRows(baseState());
    const byId = Object.fromEntries(rows.map(r => [r.playerId, r]));
    expect(byId.p00030).toMatchObject({ type: 'FA', scale: 'FBA', rating: 68, from: null, name: 'Azubuike Okoro' });
    expect(byId.p00031).toMatchObject({ type: 'Rookie', rating: null });
    expect(byId.p00023).toMatchObject({ type: 'D2', scale: 'D2', rating: 94, from: 'AMS' });
    expect(byId.p00003).toMatchObject({ type: 'Expired', from: 'BOS' });
    expect(byId.p00012).toBeUndefined();
    expect(byId.p00001).toBeUndefined();
  });

  it('sorts FBA-scale players by rating before D2 players', () => {
    const rows = marketRows(baseState());
    expect(rows.slice(0, 3).map(r => r.playerId)).toEqual(['p00032', 'p00030', 'p00004']);
    expect(rows.at(-1)!.scale).toBe('D2');
  });
});

describe('openPositions', () => {
  it('lists positions without a player', () => {
    expect(openPositions(baseState().fba.teams.CAR)).toEqual(['C']);
    expect(openPositions(baseState().fba.teams.BOS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/roster/trade engine/roster/market`
Expected: FAIL, cannot resolve `./trade` and `./market`.

- [ ] **Step 3: Implement**

`web/engine/roster/trade.ts`:
```ts
import type { PickCondition, PickObligation } from '../shared/types';
import { futureSeasons, nextPriority, pickLabel } from './picks';
import { capProblem, normalizeRoster, payroll, slotProblems } from './rules';
import { appendTx, type DocKey, fail, type MoveContext, type MoveResult, nameOf, type RosterState, withLeague, withTeam } from './state';

export type TradeAsset =
  | { kind: 'player'; playerId: string; from: string; to: string }
  | { kind: 'pick'; obligationId: string; from: string; to: string }
  | { kind: 'ownPick'; season: number; from: string; to: string; condition: PickCondition };

export interface TradeInput {
  league: 'fba' | 'fbad2';
  teams: string[];
  assets: TradeAsset[];
}

export function makeTrade(state: RosterState, input: TradeInput, ctx: MoveContext): MoveResult {
  const key = input.league === 'fba' ? 'fba' : 'd2';
  const txKey = input.league === 'fba' ? 'fbaTx' : 'd2Tx';
  const problems: string[] = [];
  const teams = [...new Set(input.teams)];
  if (teams.length < 2) problems.push('A trade needs at least two teams');
  for (const t of teams) if (!state[key].teams[t]) problems.push(`Unknown team ${t}`);
  if (!input.assets.length) problems.push('Add at least one player or pick');
  if (problems.length) return fail(problems);

  let rosters = state[key];
  let obligations: PickObligation[] = state.picks.obligations;
  const lines: string[] = [];
  const seasons = futureSeasons(state.season);
  let created = 0;

  for (const a of input.assets) {
    if (!teams.includes(a.from) || !teams.includes(a.to) || a.from === a.to) {
      problems.push('Every asset must move between two different teams in the trade');
      continue;
    }
    if (a.kind === 'player') {
      const entry = rosters.teams[a.from].find(e => e.playerId === a.playerId);
      if (!entry) {
        problems.push(`${nameOf(state, a.playerId)} is not on ${a.from}`);
        continue;
      }
      rosters = withTeam(rosters, a.from, normalizeRoster(rosters.teams[a.from].filter(e => e !== entry), input.league));
      rosters = withTeam(rosters, a.to, normalizeRoster([...rosters.teams[a.to], entry], input.league));
      lines.push(`->${a.to} ${entry.position}-${nameOf(state, a.playerId)}`);
      continue;
    }
    if (input.league !== 'fba') {
      problems.push('Only FBA trades can include draft picks');
      continue;
    }
    if (a.kind === 'pick') {
      const ob = obligations.find(o => o.id === a.obligationId);
      if (!ob || ob.owner !== a.from) {
        problems.push(`${a.from} does not own pick ${a.obligationId}`);
        continue;
      }
      const moved = { ...ob, owner: a.to };
      obligations = obligations.map(o => (o === ob ? moved : o));
      lines.push(`->${a.to} ${pickLabel(moved)}`);
      continue;
    }
    if (!seasons.includes(a.season)) {
      problems.push(`Picks can be traded for S${seasons[0]}–S${seasons.at(-1)}`);
      continue;
    }
    const c = a.condition;
    if (c.kind === 'swap' && (!state.fba.teams[c.otherTeam] || ![a.from, c.otherTeam].includes(c.betterTo))) {
      problems.push('A pick swap needs another team and must name which of the two gets the better pick');
      continue;
    }
    created += 1;
    const ob: PickObligation = {
      id: `${ctx.batchId}-${created}`,
      season: a.season,
      originalTeam: a.from,
      owner: a.to,
      condition: c,
      originalCondition: c,
      originSeason: a.season,
      priority: nextPriority(obligations, a.season, a.from),
      rolls: [],
      note: '',
    };
    obligations = [...obligations, ob];
    lines.push(`->${a.to} ${pickLabel(ob)}`);
  }
  if (problems.length) return fail(problems);

  const slotIssues = teams.flatMap(t => slotProblems(t, rosters.teams[t]));
  if (input.league === 'fba') {
    for (const t of teams) {
      const cap = capProblem(payroll(rosters.teams[t], state.season));
      if (cap) problems.push(`${t}: ${cap}`);
    }
    if (state.freeAgents.locked) problems.push(...slotIssues);
  }
  if (problems.length) return fail(problems);

  const changed: DocKey[] = [key, txKey];
  if (obligations !== state.picks.obligations) changed.push('picks');
  return {
    ok: true,
    state: { ...withLeague(state, input.league, rosters, appendTx(state[txKey], ctx, 'trade', teams, lines)), picks: { ...state.picks, obligations } },
    changed,
    label: `Trade ${teams.join('/')}`,
    warnings: input.league === 'fba' && state.freeAgents.locked ? [] : slotIssues,
  };
}
```

`web/engine/roster/market.ts`:
```ts
import type { Position, RosterEntry } from '../shared/types';
import { isExpired, POSITIONS } from './rules';
import { nameOf, type RosterState } from './state';

export type MarketType = 'FA' | 'Rookie' | 'D2' | 'Expired';

export interface MarketRow {
  playerId: string;
  name: string;
  position: Position;
  age: number | null;
  rating: number | null;
  scale: 'FBA' | 'D2';
  type: MarketType;
  from: string | null;
}

export function marketRows(state: RosterState): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const fa of state.freeAgents.players) {
    rows.push({ playerId: fa.playerId, name: nameOf(state, fa.playerId), position: fa.position, age: fa.age, rating: fa.rating, scale: 'FBA', type: fa.rookie ? 'Rookie' : 'FA', from: null });
  }
  for (const [teamId, entries] of Object.entries(state.fba.teams)) {
    for (const e of entries) {
      if (isExpired(e, state.season) && !e.restricted) {
        rows.push({ playerId: e.playerId!, name: nameOf(state, e.playerId!), position: e.position, age: e.age, rating: e.rating, scale: 'FBA', type: 'Expired', from: teamId });
      }
    }
  }
  for (const [teamId, entries] of Object.entries(state.d2.teams)) {
    for (const e of entries) {
      if (e.playerId) rows.push({ playerId: e.playerId, name: nameOf(state, e.playerId), position: e.position, age: e.age, rating: e.rating, scale: 'D2', type: 'D2', from: teamId });
    }
  }
  const rank = (r: MarketRow) => (r.scale === 'FBA' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
}

export function openPositions(entries: RosterEntry[]): Position[] {
  return POSITIONS.filter(pos => !entries.some(e => e.position === pos && e.playerId !== null));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/roster`
Expected: PASS for all engine/roster tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/engine/roster/trade.ts web/engine/roster/trade.test.ts web/engine/roster/market.ts web/engine/roster/market.test.ts
git commit -m "web: multi-team trades with conditional picks, and the FA market list"
```

---

### Task 7: Sheet parsers for restricted contracts, free agents, reserves, and picks

**Files:**
- Modify: `web/importers/sheets/xlsx.ts`, `web/importers/sheets/parsers.ts`
- Test: `web/importers/sheets/parsers.test.ts` (append)

**Interfaces:**
- Produces:
  - `readUnderlines(file: string, tab: string): Promise<Set<string>>`, with keys `"<rowIndex0>:<colIndex0>"` matching `readTabs` rows
  - `SheetPlayer.restricted?: true` (set only when the FBA contract-end cell, column index 7, is underlined)
  - `parseFbaRosterTab(rows, underlined?: Set<string>)`
  - `ParsedFreeAgent { name; position; age: number | null; rating: number | null; note: string }` and `parseFreeAgentsTab(rows): ParsedFreeAgent[]`
  - `parseD2ReservesTab(rows): SheetPlayer[]`
  - `ParsedPick { season; owner; originalTeam; originSeason; condition: PickCondition; originalCondition: PickCondition; priority: number | null }` and `parsePickRows(rows, season): ParsedPick[]`

- [ ] **Step 1: Write the failing tests**

Append to `web/importers/sheets/parsers.test.ts` (add `parseD2ReservesTab, parseFreeAgentsTab, parsePickRows` to its import from `./parsers`):
```ts
describe('restricted contracts on the FBA tab', () => {
  it('flags players whose contract-end cell is underlined', () => {
    const rows = [['', '', 'Atlanta Venom'], ['', '', '(PF)', '', 'Rakeem Holloway', '20', '75', 'S79', '2'], ['', '', '(C)', '', 'Issa Cisse', '26', '84', 'S81', '7']];
    const [t] = parseFbaRosterTab(rows, new Set(['1:7']));
    expect(t.players[0]).toEqual({ name: 'Rakeem Holloway', position: 'PF', age: 20, rating: 75, contractEnd: 79, contractAmount: 2, restricted: true });
    expect(t.players[1]).not.toHaveProperty('restricted');
  });
});

describe('parseFreeAgentsTab', () => {
  const rows = [
    ['On Roster(Unrestricted)', 'On Roster(Restricted)', 'Not on a Roster'],
    ['Name', 'Pos', 'Age', 'Rating', 'Possible Teams'],
    ['Restricted FAs'], ['Next:', 'NONE'],
    ['Free Agents'],
    ['Mubiru Okeke', 'SF', '28', '69', ''],
    ['Bobbie Allen', 'C', '32', '68', 'X'],
    ['Milan Tepic', 'C', '22', 'X', 'R'],
    [''],
    [' Top D2'], ['NONE'],
  ];
  it('reads the Free Agents section until Top D2', () => {
    expect(parseFreeAgentsTab(rows)).toEqual([
      { name: 'Mubiru Okeke', position: 'SF', age: 28, rating: 69, note: '' },
      { name: 'Bobbie Allen', position: 'C', age: 32, rating: 68, note: 'X' },
      { name: 'Milan Tepic', position: 'C', age: 22, rating: null, note: 'R' },
    ]);
  });
  it('throws without a Free Agents section', () => {
    expect(() => parseFreeAgentsTab([['Name']])).toThrow(/Free Agents/);
  });
});

describe('parseD2ReservesTab', () => {
  it('reads players after the Reserves header', () => {
    const rows = [['Zurich(Switzerland)'], ['(PG)', 'Markus Edmonds', '31', '98'], [], ['Reserves'], ['(PG)', 'Kris Dyer', '30', ''], ['(C)', 'X', 'X', 'X']];
    expect(parseD2ReservesTab(rows)).toEqual([{ name: 'Kris Dyer', position: 'PG', age: 30, rating: null, contractEnd: null, contractAmount: null }]);
  });
  it('returns nothing without a Reserves section', () => {
    expect(parseD2ReservesTab([['Zurich(Switzerland)']])).toEqual([]);
  });
});

describe('parsePickRows', () => {
  it('parses owners, protections, history, and priority', () => {
    const rows = [
      ['OV(via DCB)(S75)', 'Top 9 Protected', 'Originally LP', 'priority 1'],
      ['NY(via DCB)(S79)', 'Top 11 Protected', 'Originally 12P', 'priority 2'],
      ['CHI(via LA)(S81)', 'Lottery Protected', '', ''],
      ['CHI(via SAS)(S81)', '', '', ''],
      ['MEM(via VEG)(S81)', 'if VEG misses playoffs', '', ''],
      ['', '', '', ''],
      ['TEAM', 'PLAYER', 'POSITION'],
    ];
    expect(parsePickRows(rows, 80)).toEqual([
      { season: 80, owner: 'OV', originalTeam: 'DCB', originSeason: 75, condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, priority: 1 },
      { season: 80, owner: 'NY', originalTeam: 'DCB', originSeason: 79, condition: { kind: 'top', n: 11 }, originalCondition: { kind: 'top', n: 12 }, priority: 2 },
      { season: 80, owner: 'CHI', originalTeam: 'LA', originSeason: 81, condition: { kind: 'lottery' }, originalCondition: { kind: 'lottery' }, priority: null },
      { season: 80, owner: 'CHI', originalTeam: 'SAS', originSeason: 81, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null },
      { season: 80, owner: 'MEM', originalTeam: 'VEG', originSeason: 81, condition: { kind: 'custom', text: 'if VEG misses playoffs' }, originalCondition: { kind: 'custom', text: 'if VEG misses playoffs' }, priority: null },
    ]);
  });
  it('rejects a row it cannot read', () => {
    expect(() => parsePickRows([['Chicago gets LA pick']], 81)).toThrow(/pick row/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run importers/sheets`
Expected: FAIL. The new functions are not exported, and there is no `restricted` flag yet.

- [ ] **Step 3: Implement**

In `web/importers/sheets/parsers.ts`:

1. Add `import type { PickCondition } from '../../engine/shared/types';` and change the existing type import to `import type { PickCondition, Position } from '../../engine/shared/types';`.
2. Add `restricted?: true;` as the last field of `SheetPlayer`.
3. Change `parseRosterRows` so `readPlayer` also receives the row index. Its parameter becomes `readPlayer: (r: string[], position: Position, rowIndex: number) => SheetPlayer`, and the loop becomes:
```ts
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    const text = cell(r, teamCol);
    if (!text || isHeader(text)) continue;
    if (stopAt && stopAt(text)) break;
    const pos = text.match(POS_CELL);
    if (pos) {
      if (!current) throw new Error(`Player row appears before any team: ${r.join(',')}`);
      current.players.push(readPlayer(r, pos[1] as Position, rowIndex));
      continue;
    }
    const m = splitCountry ? text.match(/^(.*?)\s*\((.+)\)$/) : null;
    current = { name: m ? m[1] : text, country: m ? m[2] : null, players: [] };
    teams.push(current);
  }
```
4. Replace `parseFbaRosterTab` with:
```ts
export function parseFbaRosterTab(rows: string[][], underlined: Set<string> = new Set()): SheetTeam[] {
  return parseRosterRows(rows, 2, t => t.startsWith('Position/Team'), (r, position, rowIndex) => {
    const name = cell(r, 4);
    if (name === 'X' || name === '') return { name: null, position, age: null, rating: null, contractEnd: null, contractAmount: null };
    const player: SheetPlayer = {
      name,
      position,
      age: numOrNull(cell(r, 5)),
      rating: numOrNull(cell(r, 6)),
      contractEnd: seasonOrNull(cell(r, 7)),
      contractAmount: numOrNull(cell(r, 8)),
    };
    if (underlined.has(`${rowIndex}:7`)) player.restricted = true;
    return player;
  }, false);
}
```
5. Append:
```ts
export interface ParsedFreeAgent {
  name: string;
  position: Position;
  age: number | null;
  rating: number | null;
  note: string;
}

export function parseFreeAgentsTab(rows: string[][]): ParsedFreeAgent[] {
  const start = rows.findIndex(r => cell(r, 0) === 'Free Agents');
  if (start < 0) throw new Error('No "Free Agents" section found in the free agents tab');
  const out: ParsedFreeAgent[] = [];
  for (const r of rows.slice(start + 1)) {
    const name = cell(r, 0);
    if (name === 'Top D2') break;
    if (!name) continue;
    const position = cell(r, 1);
    if (!/^(PG|SG|SF|PF|C)$/.test(position)) throw new Error(`Free agent "${name}" has an unknown position "${position}"`);
    out.push({ name, position: position as Position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), note: cell(r, 4) });
  }
  return out;
}

export function parseD2ReservesTab(rows: string[][]): SheetPlayer[] {
  const start = rows.findIndex(r => cell(r, 0).toLowerCase() === 'reserves');
  if (start < 0) return [];
  const out: SheetPlayer[] = [];
  for (const r of rows.slice(start + 1)) {
    const pos = cell(r, 0).match(POS_CELL);
    const name = cell(r, 1);
    if (!pos || !name || name === 'X') continue;
    out.push({ name, position: pos[1] as Position, age: numOrNull(cell(r, 2)), rating: numOrNull(cell(r, 3)), contractEnd: null, contractAmount: null });
  }
  return out;
}

export interface ParsedPick {
  season: number;
  owner: string;
  originalTeam: string;
  originSeason: number;
  condition: PickCondition;
  originalCondition: PickCondition;
  priority: number | null;
}

function conditionFromText(text: string): PickCondition {
  if (!text) return { kind: 'none' };
  const top = text.match(/^Top (\d+) Protected$/i);
  if (top) return { kind: 'top', n: Number(top[1]) };
  if (/^Lottery Protected$/i.test(text)) return { kind: 'lottery' };
  return { kind: 'custom', text };
}

function originalFromText(text: string): PickCondition | null {
  const m = text.match(/^Originally (\d+)P$/i);
  if (m) return { kind: 'top', n: Number(m[1]) };
  if (/^Originally LP$/i.test(text)) return { kind: 'lottery' };
  return null;
}

export function parsePickRows(rows: string[][], season: number): ParsedPick[] {
  const out: ParsedPick[] = [];
  for (const r of rows) {
    const head = cell(r, 0);
    if (!head) continue;
    if (head === 'TEAM') break;
    const m = head.match(/^([A-Z]+)\(via ([A-Z]+)\)\(S(\d+)\)$/);
    if (!m) throw new Error(`S${season}: can't read pick row "${r.join(',')}"`);
    const condition = conditionFromText(cell(r, 1));
    const priority = cell(r, 3).match(/^priority (\d+)$/i);
    out.push({
      season,
      owner: m[1],
      originalTeam: m[2],
      originSeason: Number(m[3]),
      condition,
      originalCondition: originalFromText(cell(r, 2)) ?? condition,
      priority: priority ? Number(priority[1]) : null,
    });
  }
  return out;
}
```

In `web/importers/sheets/xlsx.ts`, append:
```ts
/** Cells with underlined text, keyed "<row index>:<column index>" (0-based, matching readTabs rows). */
export async function readUnderlines(file: string, tab: string): Promise<Set<string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tab);
  if (!ws) throw new Error(`Tab "${tab}" not found in ${path.basename(file)}`);
  const out = new Set<string>();
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    row.eachCell({ includeEmpty: false }, (c, col) => {
      if (c.font?.underline) out.add(`${n - 1}:${col - 1}`);
    });
  });
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run importers`
Expected: PASS. The existing parser and assemble tests are unchanged, because `restricted` is only added when a cell is underlined.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/importers/sheets
git commit -m "web: parse restricted contracts, free agents, D2 reserves, and future picks"
```

---

### Task 8: Refresh import that keeps player ids

**Files:**
- Modify: `web/importers/registry.ts`, `web/importers/assemble.ts`, `web/importers/run.ts`
- Create: `web/importers/refresh.ts`
- Test: `web/importers/registry.test.ts` (append), `web/importers/refresh.test.ts`
- Generated and committed: `web/data/**`, `web/importers/refresh-report.md`

**Interfaces:**
- Consumes: Task 7 parsers, the existing `rosterFromSheet` logic
- Produces:
  - `PlayerRegistry.fromFile(file: PlayersFile, report: Report): PlayerRegistry`
  - `rosterFromSheet(league, season, sheet, teams: { name: string; abbr: string }[], reg, report): RostersFile`, now exported. For FBA it sets `restricted: true` when the sheet flags it.
  - `RefreshInputs` and `assembleRefresh(inp, report): Record<string, unknown>`
  - `npm run import -- --refresh-rosters`

- [ ] **Step 1: Write the failing tests**

Append to `web/importers/registry.test.ts`:
```ts
describe('PlayerRegistry.fromFile', () => {
  it('reuses existing ids and continues numbering', () => {
    const file = { nextId: 3, players: { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: 'Milo Lawrenz', birthSeason: null } } };
    const reg = PlayerRegistry.fromFile(file, new Report());
    expect(reg.add('Gabriel Greenwood', 51, 'fba:S79')).toBe('p00001');
    expect(reg.add('Milo Lawrenz', 60, 'fba:S79')).toBe('p00002');
    expect(reg.add('New Guy', 57, 'fba-fa:S79')).toBe('p00003');
    expect(reg.toFile().players.p00002.birthSeason).toBe(60);
    expect(reg.toFile().nextId).toBe(4);
  });
});
```

`web/importers/refresh.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../engine/shared/schemaRegistry';
import type { FreeAgentsFile, PicksFile, ReservesFile, RostersFile } from '../engine/shared/types';
import { assembleRefresh, type RefreshInputs } from './refresh';
import { Report } from './report';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
const team = (teamId: string, name: string) => ({ teamId, name, abbr: teamId, group: 'E', logoFolder: null, badge });

function inputs(): RefreshInputs {
  return {
    season: 79,
    players: { nextId: 3, players: { p00001: { id: 'p00001', name: 'Rakeem Holloway', birthSeason: 59 }, p00002: { id: 'p00002', name: 'Ben Montgomery', birthSeason: 49 } } },
    fbaTeams: { league: 'fba', teams: [team('ATL', 'Atlanta Venom'), team('DCB', 'DCB'), team('OV', 'Ohio Valley Sharks')] },
    d2Teams: { league: 'fbad2', teams: [team('AMS', 'Amsterdam')] },
    fbaSheet: [
      { name: 'Atlanta Venom', country: null, players: [{ name: 'Rakeem Holloway', position: 'PF', age: 20, rating: 75, contractEnd: 79, contractAmount: 2, restricted: true }] },
      { name: 'DCB', country: null, players: [{ name: 'Keon Whitfield', position: 'SF', age: 24, rating: 80, contractEnd: 81, contractAmount: 5 }] },
      { name: 'Ohio Valley Sharks', country: null, players: [{ name: 'Callan Schwangau', position: 'PF', age: 28, rating: 68, contractEnd: 78, contractAmount: 1 }] },
    ],
    d2Sheet: [{ name: 'Amsterdam', country: 'Netherlands', players: [{ name: 'Ben Montgomery', position: 'PG', age: 30, rating: 75, contractEnd: null, contractAmount: null }] }],
    reserves: [{ name: 'Kris Dyer', position: 'PG', age: 30, rating: null, contractEnd: null, contractAmount: null }],
    freeAgents: [
      { name: 'Mubiru Okeke', position: 'SF', age: 28, rating: 69, note: '' },
      { name: 'Callan Schwangau', position: 'PF', age: 28, rating: 68, note: '' },
      { name: 'Milan Tepic', position: 'C', age: 22, rating: null, note: 'R' },
    ],
    picks: [
      { season: 80, owner: 'OV', originalTeam: 'DCB', originSeason: 75, condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, priority: 1 },
      { season: 81, owner: 'ATL', originalTeam: 'DCB', originSeason: 81, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null },
    ],
  };
}

describe('assembleRefresh', () => {
  it('writes valid documents and keeps existing ids', () => {
    const files = assembleRefresh(inputs(), new Report());
    expect(Object.keys(files).sort()).toEqual([
      'leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fba/picks.json',
      'leagues/fbad2/S79/reserves.json', 'leagues/fbad2/S79/rosters.json', 'leagues/fbad2/S79/transactions.json', 'players.json',
    ]);
    for (const [rel, doc] of Object.entries(files)) expect(schemaForPath(rel)!.safeParse(doc).success, rel).toBe(true);
    const fba = files['leagues/fba/S79/rosters.json'] as RostersFile;
    expect(fba.teams.ATL.find(e => e.playerId === 'p00001')).toMatchObject({ restricted: true, contractEnd: 79 });
    expect((files['leagues/fbad2/S79/rosters.json'] as RostersFile).teams.AMS[0].playerId).toBe('p00002');
  });

  it('skips listed free agents who are on a roster and flags rookies', () => {
    const report = new Report();
    const fa = assembleRefresh(inputs(), report)['leagues/fba/S79/freeAgents.json'] as FreeAgentsFile;
    expect(fa.players.map(p => [p.position, p.rating, p.rookie, p.note])).toEqual([['SF', 69, false, ''], ['C', null, true, 'R']]);
    expect(report.entries.some(e => e.message.includes('Callan Schwangau') && e.message.includes('OV'))).toBe(true);
  });

  it('builds reserves and pick obligations', () => {
    const files = assembleRefresh(inputs(), new Report());
    expect((files['leagues/fbad2/S79/reserves.json'] as ReservesFile).players).toEqual([{ playerId: 'p00005', position: 'PG', age: 30, rating: null }]);
    expect((files['leagues/fba/picks.json'] as PicksFile).obligations).toEqual([
      { id: 'imp-S80-DCB-1', season: 80, originalTeam: 'DCB', owner: 'OV', condition: { kind: 'top', n: 9 }, originalCondition: { kind: 'lottery' }, originSeason: 75, priority: 1, rolls: [], note: '' },
      { id: 'imp-S81-DCB-1', season: 81, originalTeam: 'DCB', owner: 'ATL', condition: { kind: 'none' }, originalCondition: { kind: 'none' }, originSeason: 81, priority: 1, rolls: [], note: '' },
    ]);
  });

  it('reports picks that name unknown teams', () => {
    const inp = inputs();
    inp.picks.push({ season: 82, owner: 'ZZZ', originalTeam: 'DCB', originSeason: 82, condition: { kind: 'none' }, originalCondition: { kind: 'none' }, priority: null });
    const report = new Report();
    assembleRefresh(inp, report);
    expect(report.entries.filter(e => e.level === 'error').map(e => e.message)).toEqual(['S82 pick ZZZ(via DCB): unknown team']);
  });
});
```
The reserve player gets `p00005` because new ids follow the implementation's fixed processing order (FBA rosters → D2 rosters → reserves → free agents): Keon Whitfield `p00003` and Callan Schwangau `p00004` (FBA rosters), Ben Montgomery links to `p00002` (D2), Kris Dyer `p00005` (reserves), then Mubiru Okeke `p00006` and Milan Tepic `p00007` (free agents). The test fixes that order.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run importers/registry importers/refresh`
Expected: FAIL. `PlayerRegistry.fromFile` is not a function, and `./refresh` can't be resolved.

- [ ] **Step 3: Implement**

In `web/importers/registry.ts`, add this static method inside the class, after the constructor:
```ts
  static fromFile(file: PlayersFile, report: Report): PlayerRegistry {
    const reg = new PlayerRegistry(report);
    for (const p of Object.values(file.players)) {
      reg.players.set(p.id, { ...p });
      reg.scopes.set(p.id, []);
      if (p.name !== null) {
        const key = normalizeName(p.name);
        reg.byName.set(key, [...(reg.byName.get(key) ?? []), p.id]);
      }
    }
    reg.next = file.nextId;
    return reg;
  }
```

In `web/importers/assemble.ts`, change the `rosterFromSheet` signature to be exported and to accept any `{ name, abbr }` teams:
```ts
export function rosterFromSheet(
  league: 'fba' | 'fbad2', season: number, sheet: SheetTeam[], txt: { name: string; abbr: string }[], reg: PlayerRegistry, report: Report,
): RostersFile {
```
Inside it, change the non-vacant FBA branch `if (league === 'fba') { e.contractEnd = p.contractEnd; e.contractAmount = p.contractAmount; }` to:
```ts
      if (league === 'fba') {
        e.contractEnd = p.contractEnd;
        e.contractAmount = p.contractAmount;
        if (p.restricted) e.restricted = true;
      }
```

`web/importers/refresh.ts`:
```ts
import { normalizeName } from '../engine/shared/names';
import type { FreeAgentsFile, PickObligation, PicksFile, PlayersFile, ReservesFile, TeamsFile, TransactionsFile } from '../engine/shared/types';
import { rosterFromSheet } from './assemble';
import { PlayerRegistry } from './registry';
import type { Report } from './report';
import type { ParsedFreeAgent, ParsedPick, SheetPlayer, SheetTeam } from './sheets/parsers';

export interface RefreshInputs {
  season: number;
  players: PlayersFile;
  fbaTeams: TeamsFile;
  d2Teams: TeamsFile;
  fbaSheet: SheetTeam[];
  d2Sheet: SheetTeam[];
  reserves: SheetPlayer[];
  freeAgents: ParsedFreeAgent[];
  picks: ParsedPick[];
}

export function assembleRefresh(inp: RefreshInputs, report: Report): Record<string, unknown> {
  const { season } = inp;
  const reg = PlayerRegistry.fromFile(inp.players, report);
  const birth = (age: number | null) => (age === null ? null : season - age);
  const teamsOf = (t: TeamsFile) => t.teams.map(x => ({ name: x.name, abbr: x.teamId }));

  const fba = rosterFromSheet('fba', season, inp.fbaSheet, teamsOf(inp.fbaTeams), reg, report);
  const d2 = rosterFromSheet('fbad2', season, inp.d2Sheet, teamsOf(inp.d2Teams), reg, report);

  const reserves: ReservesFile = {
    league: 'fbad2', season, locked: false,
    players: inp.reserves.map(p => ({ playerId: reg.add(p.name, birth(p.age), `fbad2-res:S${season}`), position: p.position, age: p.age, rating: p.rating })),
  };

  const abbrOf = new Map(inp.fbaTeams.teams.map(t => [t.name, t.teamId]));
  const rostered = new Map<string, string>();
  for (const t of inp.fbaSheet) for (const p of t.players) if (p.name) rostered.set(normalizeName(p.name), abbrOf.get(t.name) ?? t.name);
  const freeAgents: FreeAgentsFile = { league: 'fba', season, locked: false, players: [] };
  for (const fa of inp.freeAgents) {
    const onTeam = rostered.get(normalizeName(fa.name));
    if (onTeam) {
      report.info('free agents', `${fa.name} is listed as a free agent but is on the ${onTeam} roster; he'll show there (as an expired contract if it has ended)`);
      continue;
    }
    freeAgents.players.push({
      playerId: reg.add(fa.name, birth(fa.age), `fba-fa:S${season}`),
      position: fa.position, age: fa.age, rating: fa.rating, rookie: fa.age !== null && fa.age <= 22, note: fa.note,
    });
  }
  const rookies = freeAgents.players.filter(p => p.rookie).length;
  report.info('free agents', `${freeAgents.players.length} free agents imported (${rookies} treated as undrafted rookies because they are 22 or younger)`);

  const known = new Set(inp.fbaTeams.teams.map(t => t.teamId));
  const obligations: PickObligation[] = [];
  for (const p of inp.picks) {
    if (!known.has(p.owner) || !known.has(p.originalTeam)) {
      report.error('picks', `S${p.season} pick ${p.owner}(via ${p.originalTeam}): unknown team`);
      continue;
    }
    const taken = obligations.filter(o => o.season === p.season && o.originalTeam === p.originalTeam).map(o => o.priority);
    const priority = p.priority ?? (taken.length ? Math.max(...taken) + 1 : 1);
    obligations.push({
      id: `imp-S${p.season}-${p.originalTeam}-${priority}`,
      season: p.season, originalTeam: p.originalTeam, owner: p.owner,
      condition: p.condition, originalCondition: p.originalCondition, originSeason: p.originSeason,
      priority, rolls: [], note: '',
    });
  }
  const picks: PicksFile = { league: 'fba', obligations };
  const emptyTx = (league: 'fba' | 'fbad2'): TransactionsFile => ({ league, season, entries: [] });

  return {
    [`leagues/fba/S${season}/rosters.json`]: fba,
    [`leagues/fbad2/S${season}/rosters.json`]: d2,
    [`leagues/fba/S${season}/freeAgents.json`]: freeAgents,
    [`leagues/fbad2/S${season}/reserves.json`]: reserves,
    'leagues/fba/picks.json': picks,
    [`leagues/fba/S${season}/transactions.json`]: emptyTx('fba'),
    [`leagues/fbad2/S${season}/transactions.json`]: emptyTx('fbad2'),
    'players.json': reg.toFile(),
  };
}
```

In `web/importers/run.ts`:

1. Add these imports: `rmSync` (from node:fs); `parseD2ReservesTab, parseFreeAgentsTab, parsePickRows` (from ./sheets/parsers); `readUnderlines` (from ./sheets/xlsx); `assembleRefresh` (from ./refresh); and `import type { MetaFile, PlayersFile, TeamsFile, TransactionsFile } from '../engine/shared/types';`.
2. Add `draft: '1e3YJEurdTk5y2XKHQcgttCbknZZsJOB8RhR10_gG1W4',` to `SHEETS`.
3. Add this function above `main`:
```ts
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(DATA, ...rel.split('/')), 'utf8')) as T;

async function refreshRosters(): Promise<void> {
  const meta = readJson<MetaFile>('meta.json');
  const season = meta.currentSeason;
  for (const league of ['fba', 'fbad2']) {
    const rel = `leagues/${league}/S${season}/transactions.json`;
    if (existsSync(path.join(DATA, ...rel.split('/'))) && readJson<TransactionsFile>(rel).entries.length > 0) {
      console.error(`Refusing to refresh: moves have already been made in the app (${rel}). Refreshing would overwrite them.`);
      process.exit(1);
    }
  }
  const report = new Report();
  rmSync(path.join(CACHE, `${SHEETS.rosters}.xlsx`), { force: true });
  rmSync(path.join(CACHE, `${SHEETS.draft}.xlsx`), { force: true });
  console.log('Downloading current Rosters and Draft History sheets...');
  const rostersBook = await downloadWorkbook(SHEETS.rosters, CACHE);
  const faTab = `Free Agents S${season}`;
  const tabs = await readTabs(rostersBook, ['FBA Rosters', 'FBA D2 Rosters', faTab]);
  const underlined = await readUnderlines(rostersBook, 'FBA Rosters');
  const draftBook = await downloadWorkbook(SHEETS.draft, CACHE);
  const pickSeasons = [1, 2, 3, 4].map(i => season + i);
  const draftTabs = await readTabs(draftBook, pickSeasons.map(s => `S${s}`));

  const files = assembleRefresh({
    season,
    players: readJson<PlayersFile>('players.json'),
    fbaTeams: readJson<TeamsFile>('leagues/fba/teams.json'),
    d2Teams: readJson<TeamsFile>('leagues/fbad2/teams.json'),
    fbaSheet: parseFbaRosterTab(tabs['FBA Rosters'], underlined),
    d2Sheet: parseD2RosterTab(tabs['FBA D2 Rosters']),
    reserves: parseD2ReservesTab(tabs['FBA D2 Rosters']),
    freeAgents: parseFreeAgentsTab(tabs[faTab]),
    picks: pickSeasons.flatMap(s => parsePickRows(draftTabs[`S${s}`], s)),
  }, report);

  for (const [rel, doc] of Object.entries(files)) {
    const r = schemaForPath(rel)?.safeParse(doc);
    if (!r?.success) report.error('schema', `${rel}: ${r ? r.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ') : 'no schema'}`);
  }
  const reportPath = path.join(WEB, 'importers', 'refresh-report.md');
  writeFileSync(reportPath, report.toMarkdown('Roster refresh report'));
  if (report.hasErrors) {
    console.error(`Refresh found ${report.count('error')} error(s); nothing was written. See web/importers/refresh-report.md`);
    process.exit(1);
  }
  for (const [rel, doc] of Object.entries(files)) {
    const file = path.join(DATA, ...rel.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`Refreshed ${Object.keys(files).length} documents (${report.count('warn')} warnings). Report: web/importers/refresh-report.md`);
}
```
4. At the top of `main()`, add: `if (process.argv.includes('--refresh-rosters')) return refreshRosters();`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run importers`
Expected: PASS.

- [ ] **Step 5: Run the real refresh**

Run: `npm run import -- --refresh-rosters`. This downloads the current sheets, which can take a few minutes; use a long timeout.
Expected: `Refreshed 8 documents …`, exit code 0. If it exits with errors, read `web/importers/refresh-report.md`, fix the parser that caused it (add a failing unit test for that exact row first), and re-run.

Then run: `npx vitest run data.test.ts`. Every committed data file, old and new, must validate.

Sanity-check the result:
```bash
node -e "const j=p=>JSON.parse(require('fs').readFileSync('data/'+p));const r=j('leagues/fba/S79/rosters.json');console.log('restricted',Object.values(r.teams).flat().filter(e=>e.restricted).length);console.log('FAs',j('leagues/fba/S79/freeAgents.json').players.length,'reserves',j('leagues/fbad2/S79/reserves.json').players.length,'picks',j('leagues/fba/picks.json').obligations.length);console.log('players',Object.keys(j('players.json').players).length)"
```
Expected (for the sheets as of 2026-09-25):
- about 23 restricted contracts
- 100+ free agents
- about 133 reserves
- 11 pick obligations (S80–S83: 3 + 4 + 2 + 2)
- the player count is the old count (1779) plus the new players only

Record the actual numbers in your report.

- [ ] **Step 6: Commit**

```bash
git add web/importers web/data
git commit -m "web: refresh S79 rosters, free agents, reserves, and picks from the sheets (ids preserved)"
```

---

### Task 9: App data layer: batch commits, the roster-state hook, and undo

**Files:**
- Modify: `web/app/api.ts`, `web/app/shell/TopBar.tsx`
- Create: `web/app/roster/useRosterState.ts`, `web/app/roster/commit.ts`
- Test: `web/app/roster/commit.test.ts`, `web/app/shell/TopBar.test.tsx`

**Interfaces:**
- Consumes: `RosterState`, `DOC_KEYS`, `docPath`, `MoveResult` (Task 3)
- Produces:
  - `postBatch(label, writes): Promise<string>`. It dispatches `doc-saved` for each path and `batch-saved` once.
  - `undoLast(): Promise<string>`, returning the undone label. It dispatches `doc-saved` for every restored path.
  - `useRosterState(): { state?: RosterState; error?: Error }`
  - `newBatchId(): string`
  - `commitMove(result: Extract<MoveResult, { ok: true }>, extra?: { path: string; doc: unknown }[]): Promise<void>`
  - The TopBar shows **↶ Undo last move** after a batch is saved during the current page session.

- [ ] **Step 1: Write the failing tests**

`web/app/roster/commit.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signPlayer } from '../../engine/roster/moves';
import { baseState } from '../../engine/roster/testFixtures';
import { commitMove, newBatchId } from './commit';

afterEach(() => vi.unstubAllGlobals());

describe('commitMove', () => {
  it('posts every changed document plus extras as one batch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: '1-0' })));
    vi.stubGlobal('fetch', fetchMock);
    const saved: string[] = [];
    window.addEventListener('doc-saved', e => saved.push((e as CustomEvent<string>).detail));
    const r = signPlayer(baseState(), { playerId: 'p00030', teamId: 'CAR', years: 2, amount: 2, conflict: 'release' }, { batchId: 'b1' });
    if (!r.ok) throw new Error('sign failed');
    await commitMove(r, [{ path: 'calendar.json', doc: { season: 79, steps: [] } }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/batch');
    const body = JSON.parse(String(init.body));
    expect(body.label).toBe('Sign Azubuike Okoro → CAR');
    expect(body.writes.map((w: { path: string }) => w.path).sort()).toEqual([
      'calendar.json', 'leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json',
    ]);
    expect(saved).toContain('leagues/fba/S79/rosters.json');
  });

  it('makes unique batch ids', () => {
    expect(newBatchId()).not.toBe(newBatchId());
  });
});
```

`web/app/shell/TopBar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/undo') return new Response(JSON.stringify({ ok: true, label: 'Sign Azubuike Okoro → CAR', paths: ['calendar.json'] }));
    return new Response(JSON.stringify({ season: 79, steps: [] }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TopBar undo', () => {
  it('appears after a move and undoes it', async () => {
    render(<TopBar />);
    expect(screen.queryByRole('button', { name: /undo last move/i })).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent('batch-saved', { detail: 'Sign' })); });
    fireEvent.click(screen.getByRole('button', { name: /undo last move/i }));
    expect(await screen.findByText('Undid: Sign Azubuike Okoro → CAR')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/roster app/shell/TopBar`
Expected: FAIL, cannot resolve `./commit`, and there is no undo button.

- [ ] **Step 3: Implement**

Append to `web/app/api.ts`:
```ts
export async function postBatch(label: string, writes: { path: string; doc: unknown }[]): Promise<string> {
  const res = await check(await fetch('/api/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, writes }) }));
  const body = (await res.json()) as { batchId: string };
  for (const w of writes) window.dispatchEvent(new CustomEvent('doc-saved', { detail: w.path }));
  window.dispatchEvent(new CustomEvent('batch-saved', { detail: label }));
  return body.batchId;
}

export async function undoLast(): Promise<string> {
  const res = await check(await fetch('/api/undo', { method: 'POST' }));
  const body = (await res.json()) as { label: string; paths: string[] };
  for (const p of body.paths) window.dispatchEvent(new CustomEvent('doc-saved', { detail: p }));
  return body.label;
}
```

`web/app/roster/commit.ts`:
```ts
import { docPath, type MoveResult } from '../../engine/roster/state';
import { postBatch } from '../api';

export function newBatchId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function commitMove(result: Extract<MoveResult, { ok: true }>, extra: { path: string; doc: unknown }[] = []): Promise<void> {
  const writes = result.changed.map(k => ({ path: docPath(k, result.state.season), doc: result.state[k] }));
  await postBatch(result.label, [...writes, ...extra]);
}
```

`web/app/roster/useRosterState.ts`:
```ts
import { DOC_KEYS, docPath, type RosterState } from '../../engine/roster/state';
import type { MetaFile } from '../../engine/shared/types';
import { useDoc } from '../api';

export function useRosterState(): { state?: RosterState; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const rel = (k: (typeof DOC_KEYS)[number]) => (season === undefined ? null : docPath(k, season));
  const fba = useDoc<RosterState['fba']>(rel('fba'));
  const d2 = useDoc<RosterState['d2']>(rel('d2'));
  const freeAgents = useDoc<RosterState['freeAgents']>(rel('freeAgents'));
  const reserves = useDoc<RosterState['reserves']>(rel('reserves'));
  const picks = useDoc<RosterState['picks']>(rel('picks'));
  const players = useDoc<RosterState['players']>(rel('players'));
  const fbaTx = useDoc<RosterState['fbaTx']>(rel('fbaTx'));
  const d2Tx = useDoc<RosterState['d2Tx']>(rel('d2Tx'));
  const docs = [fba, d2, freeAgents, reserves, picks, players, fbaTx, d2Tx];
  const error = meta.error ?? docs.find(d => d.error)?.error;
  if (season === undefined || docs.some(d => !d.data)) return { error };
  return {
    state: {
      season, fba: fba.data!, d2: d2.data!, freeAgents: freeAgents.data!, reserves: reserves.data!,
      picks: picks.data!, players: players.data!, fbaTx: fbaTx.data!, d2Tx: d2Tx.data!,
    },
  };
}
```

In `web/app/shell/TopBar.tsx`:
- Change the imports to `import { useEffect, useState } from 'react';` and `import { undoLast, useDoc } from '../api';`.
- Inside `TopBar`, before `return`, add:
```tsx
  const [canUndo, setCanUndo] = useState(false);
  const [undoMsg, setUndoMsg] = useState('');
  useEffect(() => {
    const onSaved = () => { setCanUndo(true); setUndoMsg(''); };
    window.addEventListener('batch-saved', onSaved);
    return () => window.removeEventListener('batch-saved', onSaved);
  }, []);
  const undo = async () => {
    try {
      setUndoMsg(`Undid: ${await undoLast()}`);
    } catch (e) {
      setUndoMsg((e as Error).message);
    }
  };
```
- In the JSX, directly after `<div className="spacer" />`, add:
```tsx
      {undoMsg && <span className="muted undo-msg">{undoMsg}</span>}
      {canUndo && <button className="btn" onClick={undo}>↶ Undo last move</button>}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app`
Expected: PASS (all app tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/app
git commit -m "web: batch commits, roster state hook, and undo button"
```

---

### Task 10: Free agency market page and sign panel

**Files:**
- Create: `web/app/pages/FreeAgencyPage.tsx`, `web/app/components/SignPanel.tsx`, `web/app/components/PayrollBar.tsx`, `web/app/pages/roster.css`, `web/app/stepRoutes.ts`
- Modify: `web/app/shell/Layout.tsx`, `web/app/pages/Home.tsx`, `web/app/pages/CalendarPage.tsx`
- Test: `web/app/pages/FreeAgencyPage.test.tsx`

**Interfaces:**
- Consumes: `marketRows`, `openPositions`, `signPlayer`, `freeAgencyBlockers`, `closeFreeAgency`, `useRosterState`, `commitMove`, `newBatchId`, `markCurrentDone`, `currentStepIndex`
- Produces:
  - `<SignPanel state teams playerId defaultTeam onClose />`
  - `<PayrollBar total />`
  - `stepTarget(step: CalendarStep): string`
  - `TOOL_STEPS: Record<string, string>`, currently `{ 'free-agency-offseason': '/league/fba/free-agency' }`
  - route `/league/:league/free-agency`

- [ ] **Step 1: Write the failing test**

`web/app/pages/FreeAgencyPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docPath, DOC_KEYS } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { FreeAgencyPage } from './FreeAgencyPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

function docs(): Record<string, unknown> {
  const s = baseState();
  const out: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'calendar.json': { season: 79, steps: [{ id: 'free-agency-offseason', label: 'Free Agency/Offseason', kind: 'offseason', league: null, sub: false, done: false }] },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) out[docPath(k, 79)] = s[k];
  return out;
}

beforeEach(() => {
  posted = null;
  const d = docs();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={['/league/fba/free-agency']}>
    <Routes><Route path="/league/:league/free-agency" element={<FreeAgencyPage />} /></Routes>
  </MemoryRouter>,
);

describe('FreeAgencyPage', () => {
  it('lists the market with types', async () => {
    renderPage();
    expect(await screen.findByText('Azubuike Okoro')).toBeTruthy();
    expect(screen.getByText('Milan Tepic')).toBeTruthy();
    expect(screen.getByText('Maddox Dean')).toBeTruthy();
    expect(screen.getByText("Koa'e Keano")).toBeTruthy();
  });

  it('filters by team needs', async () => {
    renderPage();
    await screen.findByText('Azubuike Okoro');
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'CAR' } });
    expect(screen.getByText(/Open: C/)).toBeTruthy();
    expect(screen.queryByText('Mubiru Okeke')).toBeNull();
    expect(screen.getByText('Azubuike Okoro')).toBeTruthy();
  });

  it('signs a player through the sign panel', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Azubuike Okoro'));
    const panel = screen.getByRole('region', { name: /sign azubuike okoro/i });
    fireEvent.change(within(panel).getByLabelText('Team'), { target: { value: 'CAR' } });
    fireEvent.change(within(panel).getByLabelText('Years'), { target: { value: '2' } });
    fireEvent.change(within(panel).getByLabelText('Amount ($)'), { target: { value: '3' } });
    expect(within(panel).getByText('Payroll would be $26 (cap $25)')).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Amount ($)'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Sign' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Sign Azubuike Okoro → CAR');
    expect(posted!.writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/freeAgents.json', 'leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json']);
  });

  it('shows what blocks closing free agency', async () => {
    renderPage();
    expect(await screen.findByText('CAR: no C')).toBeTruthy();
    expect((screen.getByRole('button', { name: /close free agency/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/pages/FreeAgencyPage`
Expected: FAIL, cannot resolve `./FreeAgencyPage`.

- [ ] **Step 3: Implement**

`web/app/stepRoutes.ts`:
```ts
import type { CalendarStep } from '../engine/shared/types';

/** Calendar steps that have their own tool page; the tool completes the step instead of "Mark done". */
export const TOOL_STEPS: Record<string, string> = {
  'free-agency-offseason': '/league/fba/free-agency',
};

export function stepTarget(step: CalendarStep): string {
  if (step.kind === 'league' && step.league) return `/league/${step.league}`;
  return TOOL_STEPS[step.id] ?? '/calendar';
}
```

`web/app/components/PayrollBar.tsx`:
```tsx
import { CAP } from '../../engine/roster/rules';

export function PayrollBar({ total }: { total: number }) {
  const pct = Math.min(100, Math.round((total / CAP) * 100));
  return (
    <div className="payroll" aria-label={`Payroll $${total} of $${CAP}`}>
      <div className="payroll-label">Payroll ${total} / ${CAP}</div>
      <div className="payroll-track"><i className={total > CAP ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
```

`web/app/components/SignPanel.tsx`:
```tsx
import { useState } from 'react';
import { marketRows } from '../../engine/roster/market';
import { signPlayer, type SignInput } from '../../engine/roster/moves';
import { payroll } from '../../engine/roster/rules';
import type { RosterState } from '../../engine/roster/state';
import type { TeamsFile } from '../../engine/shared/types';
import { commitMove, newBatchId } from '../roster/commit';

export function SignPanel({ state, teams, playerId, defaultTeam, onClose }: {
  state: RosterState; teams: TeamsFile; playerId: string; defaultTeam: string; onClose: () => void;
}) {
  const row = marketRows(state).find(r => r.playerId === playerId);
  const [teamId, setTeamId] = useState(defaultTeam);
  const [years, setYears] = useState(1);
  const [amount, setAmount] = useState(1);
  const [rating, setRating] = useState('');
  const [conflict, setConflict] = useState<SignInput['conflict']>('release');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!row) return null;

  const needsRating = row.scale === 'D2' || row.rating === null;
  const input: SignInput = { playerId, teamId, years, amount, rating: rating === '' ? undefined : Number(rating), conflict };
  const preview = teamId ? signPlayer(state, input, { batchId: 'preview' }) : null;
  const occupant = teamId ? state.fba.teams[teamId]?.find(e => e.position === row.position && e.playerId !== null && e.playerId !== playerId) : undefined;
  const occupantName = occupant ? state.players.players[occupant.playerId!]?.name ?? 'Unnamed' : '';

  const sign = async () => {
    const result = signPlayer(state, input, { batchId: newBatchId() });
    if (!result.ok) return;
    setBusy(true);
    setError('');
    try {
      await commitMove(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card sign-panel" aria-label={`Sign ${row.name}`}>
      <h3>Sign {row.name} ({row.position}, {row.rating ?? 'unrated'}{row.scale === 'D2' ? ' D2' : ''})</h3>
      <div className="form-row">
        <label>Team
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">Choose…</option>
            {teams.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name} (${payroll(state.fba.teams[t.teamId] ?? [], state.season)})</option>)}
          </select>
        </label>
        <label>Years <input type="number" min={1} max={5} value={years} onChange={e => setYears(Number(e.target.value))} /></label>
        <label>Amount ($) <input type="number" min={1} max={8} value={amount} onChange={e => setAmount(Number(e.target.value))} /></label>
        {needsRating && <label>FBA rating <input type="number" min={1} max={99} value={rating} onChange={e => setRating(e.target.value)} /></label>}
      </div>
      {occupant && (
        <fieldset className="form-row">
          <legend>{teamId} already has {occupantName} at {row.position}</legend>
          {(['release', 'cut', 'keep'] as const).map(c => (
            <label key={c}><input type="radio" name="conflict" checked={conflict === c} onChange={() => setConflict(c)} />
              {c === 'release' ? `Release ${occupantName}` : c === 'cut' ? `Cut ${occupantName}` : 'Keep both for now'}</label>
          ))}
        </fieldset>
      )}
      {preview && !preview.ok && <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {preview?.ok && <p className="ok">✓ Ready to sign{preview.warnings.length ? `, but ${preview.warnings.join('; ')}` : ''}</p>}
      {error && <p className="error">Save failed: {error}</p>}
      <div className="form-row">
        <button className="btn primary" disabled={!preview?.ok || busy} onClick={sign}>Sign</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
```

`web/app/pages/FreeAgencyPage.tsx`:
```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { marketRows, type MarketType, openPositions } from '../../engine/roster/market';
import { closeFreeAgency, freeAgencyBlockers } from '../../engine/roster/moves';
import { payroll, POSITIONS } from '../../engine/roster/rules';
import { currentStepIndex, markCurrentDone } from '../../engine/shared/calendar';
import type { CalendarFile, Position, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { SignPanel } from '../components/SignPanel';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import './roster.css';

const TYPES: MarketType[] = ['FA', 'Rookie', 'D2', 'Expired'];

export function FreeAgencyPage() {
  const { league = '' } = useParams();
  const { state, error } = useRosterState();
  const { data: teams } = useDoc<TeamsFile>('leagues/fba/teams.json');
  const { data: cal } = useDoc<CalendarFile>('calendar.json');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [type, setType] = useState<MarketType | 'ALL'>('ALL');
  const [teamId, setTeamId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [closeError, setCloseError] = useState('');

  if (league !== 'fba') return <p className="error">Free agency is only for the FBA.</p>;
  if (error) return <p className="error">Couldn't load rosters: {error.message}</p>;
  if (!state || !teams || !cal) return <p className="muted">Loading…</p>;

  const team = teamId ? state.fba.teams[teamId] : undefined;
  const needs = team ? openPositions(team) : [];
  const rows = marketRows(state).filter(r =>
    (pos === 'ALL' || r.position === pos) && (type === 'ALL' || r.type === type) && (!team || needs.length === 0 || needs.includes(r.position)),
  );
  const blockers = freeAgencyBlockers(state);
  const closed = state.freeAgents.locked;

  const close = async () => {
    const result = closeFreeAgency(state, { batchId: newBatchId() });
    if (!result.ok) return;
    const i = currentStepIndex(cal);
    const extra = i >= 0 && cal.steps[i].id === 'free-agency-offseason' ? [{ path: 'calendar.json', doc: markCurrentDone(cal) }] : [];
    try {
      await commitMove(result, extra);
    } catch (e) {
      setCloseError((e as Error).message);
    }
  };

  return (
    <section>
      <h1>S{state.season} free agency</h1>
      {closed && <p className="muted">Free agency is closed. Unsigned players moved to D2 Reserves.</p>}
      <div className="form-row filters">
        <label>Team
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {teams.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
        <label>Position
          <select value={pos} onChange={e => setPos(e.target.value as Position | 'ALL')}>
            <option value="ALL">All</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Type
          <select value={type} onChange={e => setType(e.target.value as MarketType | 'ALL')}>
            <option value="ALL">All</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {team && (
        <div className="card team-panel">
          <h3>{teams.teams.find(t => t.teamId === teamId)?.name} · {needs.length ? `Open: ${needs.join(', ')}` : 'No open positions'}</h3>
          <PayrollBar total={payroll(team, state.season)} />
          <div className="table-wrap"><RosterTable league="fba" entries={team} players={state.players.players} /></div>
        </div>
      )}

      {selected && !closed && (
        <SignPanel key={selected} state={state} teams={teams} playerId={selected} defaultTeam={teamId} onClose={() => setSelected(null)} />
      )}

      <div className="table-wrap">
        <table className="roster market">
          <thead><tr><th>Pos</th><th>Player</th><th className="num">Age</th><th className="num">Rating</th><th>Type</th><th>From</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.playerId} className={selected === r.playerId ? 'selected' : ''} onClick={() => setSelected(r.playerId)}>
                <td>{r.position}</td>
                <td>{r.name}</td>
                <td className="num">{r.age ?? '—'}</td>
                <td className="num">{r.rating ?? '—'}{r.scale === 'D2' ? ' D2' : ''}</td>
                <td><span className={`tag tag-${r.type.toLowerCase()}`}>{r.type}</span></td>
                <td>{r.from ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!closed && (
        <div className="card close-fa">
          <h3>Close free agency</h3>
          {blockers.length ? <ul className="problems">{blockers.map(b => <li key={b}>{b}</li>)}</ul> : <p className="ok">✓ Every team is set. Unsigned players will move to D2 Reserves.</p>}
          {closeError && <p className="error">Save failed: {closeError}</p>}
          <button className="btn primary" disabled={blockers.length > 0} onClick={close}>Close free agency</button>
        </div>
      )}
    </section>
  );
}
```

`web/app/pages/roster.css`:
```css
.filters { margin-bottom: 12px; }
.form-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 8px 0; border: 0; padding: 0; }
.form-row label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; font-weight: 600; color: var(--muted); }
.form-row fieldset label, fieldset.form-row label { flex-direction: row; align-items: center; color: var(--text); }
.form-row input, .form-row select { font: inherit; padding: 5px 7px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--text); min-width: 70px; }
legend { font-weight: 700; margin-bottom: 4px; }
.sign-panel { border: 2px solid var(--accent); margin: 12px 0; }
.team-panel { margin-bottom: 12px; }
.problems { color: var(--accent); margin: 6px 0; padding-left: 18px; }
.ok { color: var(--good); font-weight: 700; }
.market tbody tr { cursor: pointer; }
.market tbody tr:hover, .market tr.selected { background: var(--accent-soft); }
.tag { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700; background: var(--surface-2); border: 1px solid var(--border); }
.tag-d2 { color: #1d4ed8; }
.tag-rookie, .tag-restricted { color: #92400e; }
.tag-expired { color: #b45309; }
.payroll { margin: 6px 0 10px; }
.payroll-label { font-size: 12px; font-weight: 700; color: var(--muted); }
.payroll-track { height: 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); overflow: hidden; }
.payroll-track i { display: block; height: 100%; background: var(--accent); }
.payroll-track i.over { background: #7f1d1d; }
.close-fa { margin-top: 16px; }
.undo-msg { font-size: 12px; }
.row-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.row-actions .btn { padding: 2px 8px; font-size: 12px; }
.tx-list { list-style: none; padding: 0; margin: 0; }
.tx-list li { padding: 8px 0; border-bottom: 1px solid var(--border); }
.trade-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.asset { display: flex; justify-content: space-between; gap: 6px; padding: 5px 6px; border-radius: 5px; cursor: pointer; }
.asset:hover { background: var(--surface-2); }
.asset.sending { background: var(--accent-soft); }
.league-links { display: flex; gap: 8px; margin: 4px 0 14px; }
```

In `web/app/shell/Layout.tsx`, add `import { FreeAgencyPage } from '../pages/FreeAgencyPage';` and this route, placed before the team route:
```tsx
          <Route path="/league/:league/free-agency" element={<FreeAgencyPage />} />
```

In `web/app/pages/Home.tsx`, add `import { stepTarget } from '../stepRoutes';` and replace the `const target = …` line with:
```tsx
  const target = step ? stepTarget(step) : '/calendar';
```

In `web/app/pages/CalendarPage.tsx`:
- Add `import { Link } from 'react-router-dom';` and `import { TOOL_STEPS } from '../stepRoutes';`.
- Replace the `{i >= 0 && ( <button …Mark… /> )}` block with:
```tsx
        {i >= 0 && TOOL_STEPS[cal.steps[i].id] && (
          <Link className="btn primary" to={TOOL_STEPS[cal.steps[i].id]}>Open {cal.steps[i].label} ▸</Link>
        )}
        {i >= 0 && !TOOL_STEPS[cal.steps[i].id] && (
          <button className="btn primary" disabled={busy} onClick={() => save(markCurrentDone(cal))} aria-label={`Mark "${cal.steps[i].label}" done`}>
            ✓ Mark "{cal.steps[i].label}" done
          </button>
        )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app`
Expected: PASS. The existing Home and Calendar tests still pass (their steps aren't tool steps).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/app
git commit -m "web: free agency market with live-validated sign panel and close-FA checklist"
```

---

### Task 11: Trade builder page

**Files:**
- Create: `web/app/pages/TradePage.tsx`
- Modify: `web/app/shell/Layout.tsx`
- Test: `web/app/pages/TradePage.test.tsx`

**Interfaces:**
- Consumes: `makeTrade`, `TradeAsset`, `futureSeasons`, `owedFrom`, `pickLabel`, `useRosterState`, `commitMove`, `newBatchId`
- Produces: route `/trade/:league` (`fba` | `fbad2`). An optional `?team=XXX` pre-selects the first team.

- [ ] **Step 1: Write the failing test**

`web/app/pages/TradePage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TradePage } from './TradePage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

beforeEach(() => {
  posted = null;
  const s = baseState();
  const d: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TradePage', () => {
  it('builds a player-for-pick trade and saves it', async () => {
    render(
      <MemoryRouter initialEntries={['/trade/fba?team=CAR']}>
        <Routes><Route path="/trade/:league" element={<TradePage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Add team'), { target: { value: 'MON' } });
    const car = screen.getByRole('region', { name: 'CAR Team' });
    const mon = screen.getByRole('region', { name: 'MON Team' });
    fireEvent.click(within(car).getByText('Terence Hopkins'));
    fireEvent.click(within(mon).getByText('S81 own pick'));
    fireEvent.change(within(mon).getByLabelText('S81 condition'), { target: { value: 'top' } });
    fireEvent.change(within(mon).getByLabelText('S81 protected top'), { target: { value: '4' } });
    expect(screen.getByText('->MON SG-Terence Hopkins')).toBeTruthy();
    expect(screen.getByText('->CAR S81 Draft Pick(via MON)(4P)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make trade' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Trade CAR/MON');
    expect(posted!.writes.map(w => w.path).sort()).toEqual(['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json', 'leagues/fba/picks.json']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/pages/TradePage`
Expected: FAIL, cannot resolve `./TradePage`.

- [ ] **Step 3: Implement**

`web/app/pages/TradePage.tsx`:
```tsx
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { futureSeasons, owedFrom, pickLabel } from '../../engine/roster/picks';
import { makeTrade, type TradeAsset } from '../../engine/roster/trade';
import type { PickCondition, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import './roster.css';

type Kind = PickCondition['kind'];

function conditionFor(kind: Kind, n: number, text: string, from: string, to: string, betterTo: string): PickCondition {
  switch (kind) {
    case 'none': return { kind: 'none' };
    case 'top': return { kind: 'top', n: Math.max(1, n) };
    case 'lottery': return { kind: 'lottery' };
    case 'swap': return { kind: 'swap', otherTeam: to, betterTo: betterTo === from ? from : to };
    case 'custom': return { kind: 'custom', text: text || 'custom condition' };
  }
}

export function TradePage() {
  const { league = '' } = useParams();
  const [search] = useSearchParams();
  const { state, error } = useRosterState();
  const lg = league === 'fbad2' ? 'fbad2' : 'fba';
  const { data: teams } = useDoc<TeamsFile>(`leagues/${lg}/teams.json`);
  const [teamIds, setTeamIds] = useState<string[]>(search.get('team') ? [search.get('team')!] : []);
  const [assets, setAssets] = useState<TradeAsset[]>([]);
  const [pickOpts, setPickOpts] = useState<Record<string, { kind: Kind; n: number; text: string; betterTo: string }>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (league !== 'fba' && league !== 'fbad2') return <p className="error">Trades are for the FBA and FBAD2.</p>;
  if (error) return <p className="error">Couldn't load rosters: {error.message}</p>;
  if (!state || !teams) return <p className="muted">Loading…</p>;

  const rosters = lg === 'fba' ? state.fba : state.d2;
  const nameOfTeam = (t: string) => teams.teams.find(x => x.teamId === t)?.name ?? t;
  const defaultTo = (from: string) => teamIds.find(t => t !== from) ?? from;
  const pickKey = (from: string, season: number) => `${from}-${season}`;

  const withConditions = assets.map(a => {
    if (a.kind !== 'ownPick') return a;
    const o = pickOpts[pickKey(a.from, a.season)] ?? { kind: 'none' as Kind, n: 1, text: '', betterTo: a.to };
    return { ...a, condition: conditionFor(o.kind, o.n, o.text, a.from, a.to, o.betterTo) };
  });
  const preview = teamIds.length >= 2 && assets.length ? makeTrade(state, { league: lg, teams: teamIds, assets: withConditions }, { batchId: 'preview' }) : null;
  const txKey = lg === 'fba' ? 'fbaTx' : 'd2Tx';
  const lines = preview?.ok ? preview.state[txKey].entries.at(-1)!.lines : [];

  const toggle = (asset: TradeAsset, matches: (a: TradeAsset) => boolean) =>
    setAssets(prev => (prev.some(matches) ? prev.filter(a => !matches(a)) : [...prev, asset]));
  const setDest = (i: number, to: string) => setAssets(prev => prev.map((a, j) => (j === i ? { ...a, to } : a)));

  const save = async () => {
    const result = makeTrade(state, { league: lg, teams: teamIds, assets: withConditions }, { batchId: newBatchId() });
    if (!result.ok) return;
    setBusy(true);
    setSaveError('');
    try {
      await commitMove(result);
      setAssets([]);
      setPickOpts({});
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>{lg === 'fba' ? 'FBA' : 'FBAD2'} trade</h1>
      <div className="form-row">
        <label>Add team
          <select value="" onChange={e => e.target.value && setTeamIds(ids => [...ids, e.target.value])}>
            <option value="">Choose…</option>
            {teams.teams.filter(t => !teamIds.includes(t.teamId)).map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
        {teamIds.map(t => (
          <button key={t} className="btn" onClick={() => { setTeamIds(ids => ids.filter(x => x !== t)); setAssets(a => a.filter(x => x.from !== t && x.to !== t)); }}>
            {t} ✕
          </button>
        ))}
      </div>

      <div className="trade-cols">
        {teamIds.map(from => (
          <section key={from} className="card" aria-label={nameOfTeam(from)}>
            <h3>{nameOfTeam(from)}</h3>
            {(rosters.teams[from] ?? []).filter(e => e.playerId).map(e => {
              const i = assets.findIndex(a => a.kind === 'player' && a.playerId === e.playerId);
              const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
              return (
                <div key={e.playerId} className={`asset ${i >= 0 ? 'sending' : ''}`}>
                  <span onClick={() => toggle({ kind: 'player', playerId: e.playerId!, from, to: defaultTo(from) }, a => a.kind === 'player' && a.playerId === e.playerId)}>
                    {e.position} <b>{name}</b> {e.rating ?? '—'}{lg === 'fba' && e.contractEnd != null ? ` · S${e.contractEnd} $${e.contractAmount}` : ''}
                  </span>
                  {i >= 0 && teamIds.length > 2 && (
                    <select aria-label={`Send ${name} to`} value={assets[i].to} onChange={ev => setDest(i, ev.target.value)}>
                      {teamIds.filter(t => t !== from).map(t => <option key={t} value={t}>→ {t}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
            {lg === 'fba' && (
              <>
                <h3>Draft picks</h3>
                {futureSeasons(state.season).map(season => {
                  const key = pickKey(from, season);
                  const i = assets.findIndex(a => a.kind === 'ownPick' && a.from === from && a.season === season);
                  const owed = owedFrom(state.picks.obligations, season, from);
                  const opt = pickOpts[key] ?? { kind: 'none' as Kind, n: 1, text: '', betterTo: defaultTo(from) };
                  const setOpt = (patch: Partial<typeof opt>) => setPickOpts(p => ({ ...p, [key]: { ...opt, ...patch } }));
                  return (
                    <div key={season} className={`asset ${i >= 0 ? 'sending' : ''}`}>
                      <span onClick={() => toggle({ kind: 'ownPick', season, from, to: defaultTo(from), condition: { kind: 'none' } }, a => a.kind === 'ownPick' && a.from === from && a.season === season)}>
                        S{season} own pick{owed.length ? ` (owed: ${owed.map(o => `${o.owner} ${pickLabel(o).replace(/^.*\)\(/, '(')}`).join(', ')})` : ''}
                      </span>
                      {i >= 0 && (
                        <span className="form-row">
                          <select aria-label={`S${season} condition`} value={opt.kind} onChange={e => setOpt({ kind: e.target.value as Kind })}>
                            <option value="none">Unprotected</option>
                            <option value="top">Top-N protected</option>
                            <option value="lottery">Lottery protected</option>
                            <option value="swap">Pick swap</option>
                            <option value="custom">Custom</option>
                          </select>
                          {opt.kind === 'top' && <input aria-label={`S${season} protected top`} type="number" min={1} max={29} value={opt.n} onChange={e => setOpt({ n: Number(e.target.value) })} />}
                          {opt.kind === 'swap' && (
                            <select aria-label={`S${season} better pick to`} value={opt.betterTo} onChange={e => setOpt({ betterTo: e.target.value })}>
                              <option value={from}>{from} gets better</option>
                              <option value={assets[i].to}>{assets[i].to} gets better</option>
                            </select>
                          )}
                          {opt.kind === 'custom' && <input aria-label={`S${season} custom condition`} value={opt.text} onChange={e => setOpt({ text: e.target.value })} />}
                          {teamIds.length > 2 && (
                            <select aria-label={`Send S${season} pick to`} value={assets[i].to} onChange={ev => setDest(i, ev.target.value)}>
                              {teamIds.filter(t => t !== from).map(t => <option key={t} value={t}>→ {t}</option>)}
                            </select>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
                {state.picks.obligations.filter(o => o.owner === from).map(o => (
                  <div key={o.id} className={`asset ${assets.some(a => a.kind === 'pick' && a.obligationId === o.id) ? 'sending' : ''}`}
                    onClick={() => toggle({ kind: 'pick', obligationId: o.id, from, to: defaultTo(from) }, a => a.kind === 'pick' && a.obligationId === o.id)}>
                    {pickLabel(o)}
                  </div>
                ))}
              </>
            )}
          </section>
        ))}
      </div>

      <div className="card">
        <h3>Summary</h3>
        {lines.length > 0 && <ul className="tx-list">{lines.map(l => <li key={l}>{l}</li>)}</ul>}
        {preview && !preview.ok && <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>}
        {preview?.ok && preview.warnings.length > 0 && <p className="muted">Fix before free agency ends: {preview.warnings.join('; ')}</p>}
        {saveError && <p className="error">Save failed: {saveError}</p>}
        <button className="btn primary" disabled={!preview?.ok || busy} onClick={save}>Make trade</button>
      </div>
    </section>
  );
}
```

In `web/app/shell/Layout.tsx`, add `import { TradePage } from '../pages/TradePage';` and the route `<Route path="/trade/:league" element={<TradePage />} />`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
```bash
git add web/app
git commit -m "web: trade builder for players and conditional picks"
```

---

### Task 12: Team page actions, edit dialog, transactions page, and navigation

**Files:**
- Create: `web/app/components/EditDialog.tsx`, `web/app/pages/TransactionsPage.tsx`
- Modify: `web/app/components/RosterTable.tsx`, `web/app/pages/TeamPage.tsx`, `web/app/pages/LeaguePage.tsx`, `web/app/shell/Layout.tsx`
- Test: `web/app/pages/TeamActions.test.tsx`

**Interfaces:**
- Consumes: `releasePlayer`, `editPlayer`, `editWarnings`, `isExpired`, `payroll`, `SignPanel`, `PayrollBar`, `useRosterState`, `commitMove`, `newBatchId`
- Produces:
  - `RosterTable` optional props `extraLabel?: string` and `renderExtra?: (e: RosterEntry) => ReactNode`
  - `<EditDialog state league teamId playerId onClose />`
  - route `/league/:league/transactions`
  - league-page links to Free agency (FBA), Trade, and Transactions

- [ ] **Step 1: Write the failing test**

`web/app/pages/TeamActions.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_KEYS, docPath } from '../../engine/roster/state';
import { baseState } from '../../engine/roster/testFixtures';
import { TeamPage } from './TeamPage';
import { TransactionsPage } from './TransactionsPage';

const badge = { bg: 'hsl(1 55% 36%)', fg: '#ffffff' };
let posted: { label: string; writes: { path: string; doc: unknown }[] } | null = null;

beforeEach(() => {
  posted = null;
  const s = baseState();
  s.fbaTx = { ...s.fbaTx, entries: [{ seq: 1, batchId: 'b0', type: 'signed', teams: ['CAR'], lines: ['Signed C-Azubuike Okoro (2/$2, thru S80)'] }] };
  const d: Record<string, unknown> = {
    'meta.json': { currentSeason: 79, rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 }, lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 } },
    'leagues/fba/teams.json': { league: 'fba', teams: ['BOS', 'CAR', 'MON'].map(t => ({ teamId: t, name: `${t} Team`, abbr: t, group: 'E', logoFolder: null, badge })) },
  };
  for (const k of DOC_KEYS) d[docPath(k, 79)] = s[k];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') { posted = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ ok: true, batchId: '1-0' })); }
    const doc = d[url.replace('/api/state/', '')];
    return doc ? new Response(JSON.stringify(doc)) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/league/:league/team/:teamId" element={<TeamPage />} />
      <Route path="/league/:league/transactions" element={<TransactionsPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('team page actions', () => {
  it('shows payroll and contract tags', async () => {
    renderAt('/league/fba/team/MON');
    expect(await screen.findByText('Payroll $6 / $25')).toBeTruthy();
    expect((await screen.findAllByText('Restricted')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Expired')).toBeTruthy();
  });

  it('releases a player after confirming', async () => {
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Yasin Milovanovic')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Release' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm release' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Release Yasin Milovanovic (BOS)');
  });

  it('edits a rating', async () => {
    renderAt('/league/fba/team/BOS');
    const row = (await screen.findByText('Gabriel Greenwood')).closest('tr')!;
    fireEvent.click(await within(row).findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('region', { name: /edit gabriel greenwood/i });
    fireEvent.change(within(dialog).getByLabelText('Rating'), { target: { value: '96' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.label).toBe('Edit Gabriel Greenwood');
  });

  it('lists transactions newest first', async () => {
    renderAt('/league/fba/transactions');
    expect(await screen.findByText('Signed C-Azubuike Okoro (2/$2, thru S80)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/pages/TeamActions`
Expected: FAIL, cannot resolve `./TransactionsPage`.

- [ ] **Step 3: Implement**

Replace `web/app/components/RosterTable.tsx` with:
```tsx
import type { ReactNode } from 'react';
import type { LeagueId, Player, RosterEntry } from '../../engine/shared/types';
import { playerLabel, rosterColumns } from './rosterColumns';

export function RosterTable({ league, entries, players, extraLabel, renderExtra }: {
  league: LeagueId;
  entries: RosterEntry[];
  players: Record<string, Player>;
  extraLabel?: string;
  renderExtra?: (e: RosterEntry) => ReactNode;
}) {
  const columns = rosterColumns(league);
  return (
    <table className="roster">
      <thead>
        <tr>
          {columns.map(c => <th key={c.label} className={c.numeric ? 'num' : ''}>{c.label}</th>)}
          {renderExtra && <th>{extraLabel ?? ''}</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => {
          const name = playerLabel(e, players);
          return (
            <tr key={`${e.position}-${i}`} className={e.playerId === null ? 'vacant' : ''}>
              {columns.map(c => <td key={c.label} className={c.numeric ? 'num' : ''}>{c.value(e, name)}</td>)}
              {renderExtra && <td>{renderExtra(e)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

`web/app/components/EditDialog.tsx`:
```tsx
import { useState } from 'react';
import { editPlayer, editWarnings, type EditChanges, type EditInput } from '../../engine/roster/moves';
import type { RosterState } from '../../engine/roster/state';
import { commitMove, newBatchId } from '../roster/commit';

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export function EditDialog({ state, league, teamId, playerId, onClose }: {
  state: RosterState; league: 'fba' | 'fbad2'; teamId: string; playerId: string; onClose: () => void;
}) {
  const entry = (league === 'fba' ? state.fba : state.d2).teams[teamId]?.find(e => e.playerId === playerId);
  const [rating, setRating] = useState(String(entry?.rating ?? ''));
  const [age, setAge] = useState(String(entry?.age ?? ''));
  const [end, setEnd] = useState(String(entry?.contractEnd ?? ''));
  const [amount, setAmount] = useState(String(entry?.contractAmount ?? ''));
  const [restricted, setRestricted] = useState(Boolean(entry?.restricted));
  const [error, setError] = useState('');
  if (!entry) return null;
  const name = state.players.players[playerId]?.name ?? 'Unnamed';

  const changes: EditChanges = { rating: num(rating), age: num(age) };
  if (league === 'fba') Object.assign(changes, { contractEnd: num(end), contractAmount: num(amount), restricted });
  const input: EditInput = { league, teamId, playerId, changes };
  const warnings = editWarnings(state, input);

  const save = async () => {
    const result = editPlayer(state, input, { batchId: newBatchId() });
    if (!result.ok) return;
    try {
      await commitMove(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card sign-panel" aria-label={`Edit ${name}`}>
      <h3>Edit {name}</h3>
      <div className="form-row">
        <label>Rating <input type="number" value={rating} onChange={e => setRating(e.target.value)} /></label>
        <label>Age <input type="number" value={age} onChange={e => setAge(e.target.value)} /></label>
        {league === 'fba' && (
          <>
            <label>Contract end <input type="number" value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label>Amount ($) <input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label><input type="checkbox" checked={restricted} onChange={e => setRestricted(e.target.checked)} /> Restricted</label>
          </>
        )}
      </div>
      {warnings.length > 0 && <ul className="problems">{warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul>}
      {error && <p className="error">Save failed: {error}</p>}
      <div className="form-row">
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
```

`web/app/pages/TransactionsPage.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import './roster.css';

export function TransactionsPage() {
  const { league = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: tx, error } = useDoc<TransactionsFile>(valid && meta ? `leagues/${league}/S${meta.currentSeason}/transactions.json` : null);
  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (error) return <p className="muted">No transactions yet this season.</p>;
  if (!tx) return <p className="muted">Loading…</p>;
  return (
    <section>
      <h1>{LEAGUE_LABEL[league]} transactions · S{tx.season}</h1>
      {tx.entries.length === 0 && <p className="muted">No moves yet.</p>}
      <ul className="tx-list">
        {[...tx.entries].reverse().map(e => (
          <li key={e.seq}>
            <b>{e.teams.join('/') || 'League'}</b> <span className="tag">{e.type}</span>
            {e.lines.map(l => <div key={l}>{l}</div>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Replace `web/app/pages/TeamPage.tsx` with:
```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { releasePlayer } from '../../engine/roster/moves';
import { isExpired, payroll } from '../../engine/roster/rules';
import { groupLabel, isLeagueId, LEAGUE_LABEL } from '../../engine/shared/leagues';
import type { MetaFile, PlayersFile, RosterEntry, RostersFile, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { EditDialog } from '../components/EditDialog';
import { PayrollBar } from '../components/PayrollBar';
import { RosterTable } from '../components/RosterTable';
import { teamRating } from '../components/rosterColumns';
import { SignPanel } from '../components/SignPanel';
import { TeamMark } from '../components/TeamMark';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import './league.css';
import './roster.css';

export function TeamPage() {
  const { league = '', teamId = '' } = useParams();
  const valid = isLeagueId(league);
  const { data: meta } = useDoc<MetaFile>(valid ? 'meta.json' : null);
  const { data: teams } = useDoc<TeamsFile>(valid ? `leagues/${league}/teams.json` : null);
  const { data: players } = useDoc<PlayersFile>(valid ? 'players.json' : null);
  const season = valid && meta ? meta.rosterSeason[league] : undefined;
  const { data: rosters } = useDoc<RostersFile>(season === undefined ? null : `leagues/${league}/S${season}/rosters.json`);
  const editable = (league === 'fba' || league === 'fbad2') && meta !== undefined && season === meta.currentSeason && rosters?.locked === false;
  const { state } = useRosterState();
  const { data: fbaTeams } = useDoc<TeamsFile>(editable ? 'leagues/fba/teams.json' : null);
  const [pending, setPending] = useState<{ playerId: string; kind: 'released' | 'cut' } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [resigning, setResigning] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!valid) return <p className="error">Unknown league "{league}".</p>;
  if (!teams || !players || !rosters || season === undefined) return <p className="muted">Loading…</p>;
  const team = teams.teams.find(t => t.teamId === teamId);
  if (!team) return <p className="error">No team "{teamId}" in {LEAGUE_LABEL[league]}.</p>;
  const entries = rosters.teams[team.teamId] ?? [];
  const lg = league === 'fbad2' ? 'fbad2' : 'fba';

  const release = async (playerId: string, kind: 'released' | 'cut') => {
    if (!state) return;
    const result = releasePlayer(state, { league: lg, teamId, playerId, kind }, { batchId: newBatchId() });
    if (!result.ok) return setError(result.problems.join('; '));
    try {
      await commitMove(result);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const actions = (e: RosterEntry) => {
    if (!e.playerId || !state) return null;
    const tags = [];
    if (e.restricted) tags.push(<span key="r" className="tag tag-restricted">Restricted</span>);
    if (lg === 'fba' && isExpired(e, state.season)) tags.push(<span key="x" className="tag tag-expired">Expired</span>);
    if (pending?.playerId === e.playerId) {
      const verb = pending.kind === 'cut' ? 'cut' : 'release';
      return (
        <span className="row-actions">
          <button className="btn primary" onClick={() => release(e.playerId!, pending.kind)}>Confirm {verb}</button>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
        </span>
      );
    }
    return (
      <span className="row-actions">
        {tags}
        {lg === 'fba' && isExpired(e, state.season) && !state.freeAgents.locked && <button className="btn" onClick={() => setResigning(e.playerId)}>Re-sign</button>}
        <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'released' })}>Release</button>
        <button className="btn" onClick={() => setPending({ playerId: e.playerId!, kind: 'cut' })}>Cut</button>
        <button className="btn" onClick={() => setEditing(e.playerId)}>Edit</button>
      </span>
    );
  };

  return (
    <section>
      <p><Link to={`/league/${league}`} className="muted">← {LEAGUE_LABEL[league]}</Link></p>
      <div className="team-hero">
        <TeamMark team={team} season={season} size={72} />
        <div>
          <h1>{team.name}</h1>
          <div className="muted">{groupLabel(league, team.group)} · S{season} · Team rating {teamRating(entries) ?? '—'}</div>
          {editable && <Link className="btn" to={`/trade/${league}?team=${teamId}`}>Trade…</Link>}
        </div>
      </div>
      {lg === 'fba' && editable && <PayrollBar total={payroll(entries, season)} />}
      {error && <p className="error">{error}</p>}
      {editing && state && <EditDialog state={state} league={lg} teamId={teamId} playerId={editing} onClose={() => setEditing(null)} />}
      {resigning && state && fbaTeams && <SignPanel state={state} teams={fbaTeams} playerId={resigning} defaultTeam={teamId} onClose={() => setResigning(null)} />}
      <div className="table-wrap">
        <RosterTable league={league} entries={entries} players={players.players} extraLabel={editable ? 'Actions' : undefined} renderExtra={editable && state ? actions : undefined} />
      </div>
    </section>
  );
}
```

In `web/app/pages/LeaguePage.tsx`, add `Link` to its react-router import if it's missing, and add this directly after the closing `</div>` of `league-head`:
```tsx
      {(league === 'fba' || league === 'fbad2') && (
        <div className="league-links">
          {league === 'fba' && <Link className="btn" to="/league/fba/free-agency">Free agency</Link>}
          <Link className="btn" to={`/trade/${league}`}>Trade</Link>
          <Link className="btn" to={`/league/${league}/transactions`}>Transactions</Link>
        </div>
      )}
```
Also add `import './roster.css';` to LeaguePage.

In `web/app/shell/Layout.tsx`, add `import { TransactionsPage } from '../pages/TransactionsPage';` and the route `<Route path="/league/:league/transactions" element={<TransactionsPage />} />`.

**Note on the Re-sign button:** a restricted expired player isn't in the market list, so the `SignPanel` can't find his row. Make `SignPanel` fall back to the roster when `marketRows` has no match. Replace its first line with:
```tsx
  const found = marketRows(state).find(r => r.playerId === playerId);
  const own = Object.entries(state.fba.teams).flatMap(([t, es]) => es.filter(e => e.playerId === playerId).map(e => ({ t, e })))[0];
  const row = found ?? (own ? { playerId, name: state.players.players[playerId]?.name ?? 'Unnamed', position: own.e.position, age: own.e.age, rating: own.e.rating, scale: 'FBA' as const, type: 'Expired' as const, from: own.t } : undefined);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app`
Expected: PASS (all app tests, including the existing LeaguePage/TeamPage tests).

- [ ] **Step 5: Typecheck, run the full suite, and commit**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: every test passes, and tsc is clean.
```bash
git add web/app
git commit -m "web: team page release/cut/edit/re-sign, transactions page, league links"
```

---

### Task 13: End-to-end check on real S79 data

**Files:**
- Modify: `README.md` (append to the "Web app" section)

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: every test passes, and tsc is clean.

- [ ] **Step 2: Browser check**

Start the app (`npm --prefix web run dev`, or the `fba-web` launch config) and open http://localhost:5173. Check each item:
1. **Home:** Continue goes to **/league/fba/free-agency**. The Calendar page shows "Open Free Agency/Offseason ▸" instead of Mark done.
2. **Market:** it lists FA, Rookie, D2, and Expired players. Setting the Team filter to Carolina Knights shows its roster, the payroll bar, and "Open: C", and filters the market to C.
3. **Sign:** sign a free agent at C for Carolina with a legal contract. The roster updates, the player leaves the market, and **↶ Undo last move** appears. Click it: the signing is reversed and the market shows the player again.
4. **Rule checks:** try 3 years at $1 (blocked: years > dollars), and a new signing for 5 years (blocked).
5. **Trade:** open Trade from a team page and add a second team. Send a player and an S81 own pick as Top-4 protected. The summary shows the sheet-style lines. Make the trade, check the Transactions tab, then Undo it.
6. **Team page:** it shows Restricted and Expired tags, Release and Cut need a confirm step, and Edit shows warnings for an $10 amount without blocking. Undo any change you make.
7. **Close free agency:** the checklist lists the real blockers. Don't close it; leave the data as you found it.
8. `git status` shows no changes under `web/data` (everything was undone). If something remains, undo it or restore it with `git checkout web/data`.

- [ ] **Step 3: Update the README**

Append to the "Web app (`web/`)" section of `README.md`:
```markdown

### Offseason: free agency and trades
- **Free agency** (`/league/fba/free-agency`): sign free agents, D2 players, rookies, and expired contracts. The app enforces the $25 cap, the $8 max, 4-year new / 5-year re-sign limits, years ≤ dollars, and the rookie scale. **Close free agency** only works when every team has five players (one per position) and is under the cap.
- **Trades** (`/trade/fba`, `/trade/fbad2`): players and conditional draft picks (Top-N, Lottery, Swap, Custom). Picks that don't convey roll to the next season with protection one spot smaller.
- Every move saves all-or-nothing and can be reverted with **↶ Undo last move**.
- `npm run import -- --refresh-rosters` re-imports the S79 rosters, free agents, reserves, and picks from the sheets and keeps player ids. It refuses once moves have been made in the app.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: free agency and trades in the README"
```
