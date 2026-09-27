import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro' });
    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro' });
    await storage.undo();
    expect(await storage.peekUndo()).toBeNull();
  });

  it('skips a corrupt journal file newer than a valid one, for both peekUndo and undo', async () => {
    const { dir, storage } = fresh();
    await storage.writeMany('Sign Okoro', [{ path: 'leagues/fba/S79/rosters.json', doc: roster(79, 70) }]);
    const journalDir = path.join(dir, '.journal');
    const garbageName = '99999999999999-999999.json';
    writeFileSync(path.join(journalDir, garbageName), 'not valid json{{{');

    expect(await storage.peekUndo()).toEqual({ label: 'Sign Okoro' });
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
