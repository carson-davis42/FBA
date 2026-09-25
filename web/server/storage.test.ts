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
