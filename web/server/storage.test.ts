import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Storage, StorageError, versionOf } from './storage';

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

  it('rolls back earlier files when a later write fails mid-batch', async () => {
    const { storage } = fresh();
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 90));
    const s = storage as unknown as { atomicWrite: (f: string, t: string) => Promise<void> };
    const real = s.atomicWrite.bind(storage);
    let n = 0;
    // Call 1 is the journal write itself; calls 2 and 3 are the two data writes, so this fails the second data write.
    s.atomicWrite = async (f, t) => { n += 1; if (n === 3) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return real(f, t); };
    const failed = storage.writeMany('Sign', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) },
      { path: 'leagues/fba/S79/transactions.json', doc: tx },
    ]);
    await expect(failed).rejects.toThrow('disk full');
    s.atomicWrite = real;
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 90));
    expect(await status(storage.read('leagues/fba/S79/transactions.json'))).toBe(404);
    expect(await status(storage.undo())).toBe(404);
  });

  it('keeps the journal when the rollback itself fails', async () => {
    const { storage } = fresh();
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 90));
    const s = storage as unknown as { atomicWrite: (f: string, t: string) => Promise<void> };
    const real = s.atomicWrite.bind(storage);
    let n = 0;
    // Call 1 is the journal write; call 2 (the first data write) succeeds, then every write after fails.
    s.atomicWrite = async (f, t) => { n += 1; if (n >= 3) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return real(f, t); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = storage.writeMany('Sign', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) },
      { path: 'leagues/fba/S79/transactions.json', doc: tx },
    ]);
    expect(await status(failed)).toBe(500);
    errSpy.mockRestore();
    s.atomicWrite = real;
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 70));
    expect(await storage.undo()).toEqual({ label: 'Sign', paths: ['leagues/fba/S79/rosters.json', 'leagues/fba/S79/transactions.json'] });
    expect(await storage.read('leagues/fba/S79/rosters.json')).toEqual(roster(79, 90));
  });

  it('peeks the label of the next undo without consuming it', async () => {
    const { storage } = fresh();
    expect(await storage.peekUndo()).toBeNull();
    await storage.writeMany('Sign Okoro', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) }]);
    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro', blockedBy: null });
    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro', blockedBy: null });
    await storage.undo();
    expect(await storage.peekUndo()).toBeNull();
  });

  it('reports blockedBy (the first changed path) instead of failing, when a later write would block the undo', async () => {
    const { storage } = fresh();
    await storage.writeMany('Sign', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) }]);
    await storage.write('leagues/fba/S79/rosters.json', roster(79, 71));
    expect(await storage.peekUndo()).toEqual({ label: 'Sign', blockedBy: 'leagues/fba/S79/rosters.json' });
    // peekUndo never consumes the entry or throws; undo() still reports the same conflict.
    expect(await status(storage.undo())).toBe(409);
  });

  it('never undoes a drawn lottery: peekUndo reports it as blocked and undo refuses', async () => {
    const { storage } = fresh();
    const lottery = { league: 'fba', season: 79, draftSeason: 80, locked: true, odds: [], lottery: [], order: [], picks: [] };
    await storage.writeMany('S80 Draft Lottery', [
      { path: 'leagues/fba/S79/lottery.json', doc: lottery },
      { path: 'calendar.json', doc: cal(true) },
    ]);
    expect(await storage.peekUndo()).toEqual({ label: 'S80 Draft Lottery', blockedBy: 'leagues/fba/S79/lottery.json' });
    await expect(storage.undo()).rejects.toThrow(/final/);
    expect(await storage.read('leagues/fba/S79/lottery.json')).toEqual(lottery);
    // Later moves still undo; Undo just stops at the lottery.
    await storage.writeMany('Mark A', [{ path: 'calendar.json', doc: cal(false) }]);
    expect(await storage.undo()).toEqual({ label: 'Mark A', paths: ['calendar.json'] });
    expect(await status(storage.undo())).toBe(409);
  });

  it('skips a corrupt journal file newer than a valid one, for both peekUndo and undo', async () => {
    const { dir, storage } = fresh();
    await storage.writeMany('Sign Okoro', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) }]);
    const journalDir = path.join(dir, '.journal');
    const garbageName = '99999999999999-999999.json';
    writeFileSync(path.join(journalDir, garbageName), 'not valid json{{{');

    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro', blockedBy: null });
    expect(existsSync(path.join(journalDir, `${garbageName}.corrupt`))).toBe(true);
    expect(await storage.undo()).toEqual({ label: 'Sign Okoro', paths: ['leagues/fba/S79/rosters.json'] });
  });
});

const meta = (season: number) => ({
  currentSeason: season,
  rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
});

describe('Storage versions', () => {
  it('computes a 16-hex version, and null for a missing file', () => {
    expect(versionOf(null)).toBeNull();
    expect(versionOf('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(versionOf('abc')).toBe(versionOf('abc'));
    expect(versionOf('abc')).not.toBe(versionOf('abd'));
  });

  it('returns the new version from write and readWithVersion', async () => {
    const { dir, storage } = fresh();
    const { version } = await storage.write('calendar.json', cal(false), null);
    expect(version).toBe(versionOf(readFileSync(path.join(dir, 'calendar.json'), 'utf8')));
    expect(await storage.readWithVersion('calendar.json')).toEqual({ doc: cal(false), version });
  });

  it('refuses a write whose base version is stale, without writing', async () => {
    const { storage } = fresh();
    const { version: v1 } = await storage.write('calendar.json', cal(false), null);
    await storage.write('calendar.json', cal(true), v1);
    const err = await storage.write('calendar.json', cal(false), v1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).status).toBe(409);
    expect((err as StorageError).conflicts).toEqual(['calendar.json']);
    expect(await storage.read('calendar.json')).toEqual(cal(true));
  });

  it('treats a null base version as "must not exist yet"', async () => {
    const { storage } = fresh();
    await storage.write('calendar.json', cal(false), null);
    expect(await status(storage.write('calendar.json', cal(true), null))).toBe(409);
  });

  it('writes unconditionally when no base version is given', async () => {
    const { storage } = fresh();
    await storage.write('calendar.json', cal(false));
    await storage.write('calendar.json', cal(true));
    expect(await storage.read('calendar.json')).toEqual(cal(true));
  });

  it('refuses a whole batch when any base version is stale', async () => {
    const { storage } = fresh();
    const { version: calV } = await storage.write('calendar.json', cal(false), null);
    await storage.write('meta.json', meta(79), null);
    const err = await storage.writeMany('Two', [
      { path: 'calendar.json', doc: cal(true), baseVersion: calV },
      { path: 'meta.json', doc: meta(80), baseVersion: '0000000000000000' },
    ]).catch((e: unknown) => e);
    expect((err as StorageError).status).toBe(409);
    expect((err as StorageError).conflicts).toEqual(['meta.json']);
    expect(await storage.read('calendar.json')).toEqual(cal(false));
    expect(await storage.peekUndo()).toBeNull();
  });

  it('returns the new version of every file in a batch', async () => {
    const { dir, storage } = fresh();
    const r = await storage.writeMany('One', [{ path: 'calendar.json', doc: cal(true), baseVersion: null }]);
    expect(r.versions['calendar.json']).toBe(versionOf(readFileSync(path.join(dir, 'calendar.json'), 'utf8')));
  });

  it('names the file in the lock message', async () => {
    const { storage } = fresh();
    const summary = { league: 'fba', season: 78, locked: true, host: null, champions: [] };
    await storage.write('leagues/fba/S78/summary.json', summary);
    const err = await storage.write('leagues/fba/S78/summary.json', { ...summary, locked: false }).catch((e: unknown) => e);
    expect((err as StorageError).message).toBe("leagues/fba/S78/summary.json is locked (finished) and can't be changed");
  });
});

describe('Storage resetUndo', () => {
  const files = (dir: string, sub: string) => (existsSync(path.join(dir, sub)) ? readdirSync(path.join(dir, sub)) : []);

  it('writes without a journal entry, then clears the journal and backups', async () => {
    const { dir, storage } = fresh();
    await storage.write('calendar.json', cal(false));
    await storage.writeMany('Mark', [{ path: 'calendar.json', doc: cal(true) }]);
    expect(files(dir, '.journal')).toHaveLength(1);
    expect(files(dir, '.backups').length).toBeGreaterThan(0);
    await storage.writeMany('Finish', [{ path: 'calendar.json', doc: cal(false) }], { resetUndo: true });
    expect(await storage.read('calendar.json')).toEqual(cal(false));
    expect(files(dir, '.journal')).toEqual([]);
    expect(files(dir, '.backups')).toEqual([]);
    expect(await storage.peekUndo()).toBeNull();
    expect(await status(storage.undo())).toBe(404);
  });

  it('keeps the journal and backups when the batch fails', async () => {
    const { dir, storage } = fresh();
    await storage.write('calendar.json', cal(false));
    await storage.writeMany('Mark', [{ path: 'calendar.json', doc: cal(true) }]);
    const backups = files(dir, '.backups');
    const failed = storage.writeMany('Finish', [{ path: 'calendar.json', doc: cal(false), baseVersion: '0000000000000000' }], { resetUndo: true });
    expect(await status(failed)).toBe(409);
    expect(files(dir, '.journal')).toHaveLength(1);
    expect(files(dir, '.backups')).toEqual(backups);
    expect(await storage.peekUndo()).toEqual({ label: 'Mark', blockedBy: null });
  });

  it('points at .backups, not a journal, when the rollback itself fails', async () => {
    const { dir, storage } = fresh();
    const roster = (rating: number) => ({ league: 'fba', season: 79, locked: false, teams: { BOS: [{ playerId: 'p00001', position: 'PG', rating, age: 28, points: 0 }] } });
    const tx = { league: 'fba', season: 79, entries: [] };
    await storage.write('leagues/fba/S79/rosters.json', roster(90));
    const s = storage as unknown as { atomicWrite: (f: string, t: string) => Promise<void> };
    const real = s.atomicWrite.bind(storage);
    let n = 0;
    // resetUndo writes no journal: call 1 is the first data write and succeeds, then every write after fails.
    s.atomicWrite = async (f, t) => { n += 1; if (n >= 2) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return real(f, t); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = await storage.writeMany('Finish', [
      { path: 'leagues/fba/S79/rosters.json', doc: roster(70) },
      { path: 'leagues/fba/S79/transactions.json', doc: tx },
    ], { resetUndo: true }).catch((e: unknown) => e);
    errSpy.mockRestore();
    s.atomicWrite = real;
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).status).toBe(500);
    expect((err as StorageError).message).toContain('The previous copies are in .backups/');
    expect((err as StorageError).message).not.toContain('Undo');
    expect(files(dir, '.backups').length).toBeGreaterThan(0);
    expect(await storage.peekUndo()).toBeNull();
  });
});

describe('Storage history', () => {
  it("returns every summary of a league in season order, and nothing for a league with none", async () => {
    const { storage } = fresh();
    const sum = (season: number) => ({ league: 'fba', season, locked: true, host: null, champions: [] });
    for (const s of [79, 9, 78]) await storage.write(`leagues/fba/S${s}/summary.json`, sum(s));
    await storage.write('leagues/fba/S80/rosters.json', { league: 'fba', season: 80, locked: false, teams: {} });
    expect(await storage.history('fba')).toEqual({ seasons: [sum(9), sum(78), sum(79)], errors: [] });
    expect(await storage.history('fbad2')).toEqual({ seasons: [], errors: [] });
  });

  it('skips a summary that is bad JSON or fails the schema, and reports it in errors', async () => {
    const { dir, storage } = fresh();
    const good = { league: 'fba', season: 9, locked: true, host: null, champions: [] };
    await storage.write('leagues/fba/S9/summary.json', good);
    mkdirSync(path.join(dir, 'leagues', 'fba', 'S10'), { recursive: true });
    writeFileSync(path.join(dir, 'leagues', 'fba', 'S10', 'summary.json'), '{');
    mkdirSync(path.join(dir, 'leagues', 'fba', 'S11'), { recursive: true });
    writeFileSync(path.join(dir, 'leagues', 'fba', 'S11', 'summary.json'), JSON.stringify({ ...good, season: 'x' }));
    const out = await storage.history('fba');
    expect(out.seasons).toEqual([good]);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0]).toEqual({ season: 10, message: 'bad JSON' });
    expect(out.errors[1].season).toBe(11);
    expect(out.errors[1].message).toMatch(/^season: /);
  });

  it('gives a root-level schema issue (a document that is not an object) without a leading colon', async () => {
    const { dir, storage } = fresh();
    mkdirSync(path.join(dir, 'leagues', 'fba', 'S9'), { recursive: true });
    writeFileSync(path.join(dir, 'leagues', 'fba', 'S9', 'summary.json'), '[]');
    const out = await storage.history('fba');
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].season).toBe(9);
    expect(out.errors[0].message.length).toBeGreaterThan(0);
    expect(out.errors[0].message.startsWith(':')).toBe(false);
  });
});
