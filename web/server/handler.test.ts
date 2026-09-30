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

async function ifMatch(root: string, rel: string): Promise<string> {
  const res = await fetch(`${root}/api/state/${rel}`);
  return res.status === 404 ? '"null"' : res.headers.get('etag')!;
}
const unquote = (tag: string): string | null => (tag === '"null"' ? null : tag.slice(1, -1));

describe('HTTP handler', () => {
  it('saves and reads documents', async () => {
    const put = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify(calendar) });
    expect(put.status).toBe(200);
    const get = await fetch(`${base}/api/state/calendar.json`);
    expect(await get.json()).toEqual(calendar);
  });

  it('returns validation issues for a bad document', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify({ season: 1 }) });
    expect(res.status).toBe(400);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
  });

  it('rejects non-JSON bodies', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects a document with an unknown key', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, {
      method: 'PUT',
      headers: { 'If-Match': '"null"' },
      body: JSON.stringify({ ...calendar, bogus: 1 }),
    });
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

describe('HTTP handler security', () => {
  let server2: http.Server;
  let base2: string;

  beforeAll(async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-malicious-'));
    const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-malicious-'));
    mkdirSync(path.join(dataDir, 'logos'), { recursive: true });
    mkdirSync(path.join(logoDir, 'x'));
    writeFileSync(path.join(logoDir, 'secret.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(logoDir, 'x', 'nope.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(dataDir, 'logos', 'manifest.json'), JSON.stringify({ folders: { x: [{ file: '../secret.png', from: null, to: null, variant: 1 }] } }));
    const storage = new Storage(dataDir);
    server2 = http.createServer(createHandler(storage, logoDir));
    await new Promise<void>(r => server2.listen(0, '127.0.0.1', r));
    base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(r => server2.close(() => r())));

  it('rejects path traversal in manifest even when written directly to disk', async () => {
    // The manifest on disk has a non-bare `file` value ('../secret.png'), so it now fails
    // LogoManifest.safeParse as a whole (M1: the handler validates the manifest instead of
    // trusting it via an `as` cast). The endpoint still never serves the traversal target;
    // it now fails closed with 500 instead of 404.
    const res = await fetch(`${base2}/logos/x/79`);
    expect(res.status).toBe(500);
    expect(res.status).not.toBe(200);
  });

  it('rejects malicious manifest via PUT', async () => {
    const res = await fetch(`${base2}/api/state/logos/manifest.json`, {
      method: 'PUT',
      headers: { 'If-Match': '"null"' },
      body: JSON.stringify({ folders: { x: [{ file: '../../etc/passwd.png', from: null, to: null, variant: 1 }] } }),
    });
    expect(res.status).toBe(400);
  });
});

describe('HTTP handler host allow-list', () => {
  let server3: http.Server;
  let port3: number;

  beforeAll(async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-hosts-'));
    const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-hosts-'));
    const storage = new Storage(dataDir);
    await storage.write('logos/manifest.json', { folders: {} });
    server3 = http.createServer(createHandler(storage, logoDir, { allowedHosts: ['good.test:1'] }));
    await new Promise<void>(r => server3.listen(0, '127.0.0.1', r));
    port3 = (server3.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>(r => server3.close(() => r())));

  function rawRequest(headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: port3, path: '/api/state/logos/manifest.json', method: 'GET', headers },
        res => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('rejects a spoofed Host header with 403', async () => {
    expect(await rawRequest({ Host: 'evil.example' })).toBe(403);
  });

  it('allows a Host header that is on the list', async () => {
    expect(await rawRequest({ Host: 'good.test:1' })).toBe(200);
  });

  it('rejects an Origin header not derived from the allowed hosts', async () => {
    expect(await rawRequest({ Host: 'good.test:1', Origin: 'http://evil.example' })).toBe(403);
  });

  it('allows an Origin header matching an allowed host', async () => {
    expect(await rawRequest({ Host: 'good.test:1', Origin: 'http://good.test:1' })).toBe(200);
  });
});

describe('HTTP handler CSRF protections', () => {
  it('rejects a POST to /api/undo with a non-JSON Content-Type', async () => {
    const res = await fetch(`${base}/api/undo`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(res.status).toBe(415);
  });

  it('rejects a POST to /api/batch with a non-JSON Content-Type', async () => {
    const res = await fetch(`${base}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    expect(res.status).toBe(415);
  });

  it('accepts a POST to /api/undo with a JSON Content-Type', async () => {
    const res = await fetch(`${base}/api/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).not.toBe(415);
  });

  it('rejects a request with Sec-Fetch-Site: cross-site', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    expect(res.status).toBe(403);
  });

  it('allows a request with Sec-Fetch-Site: same-origin', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    expect(res.status).not.toBe(403);
  });
});

describe('HTTP handler body size limit', () => {
  let server4: http.Server;
  let base4: string;

  beforeAll(async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-bodysize-'));
    const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-bodysize-'));
    const storage = new Storage(dataDir);
    server4 = http.createServer(createHandler(storage, logoDir, { maxBody: 1024 }));
    await new Promise<void>(r => server4.listen(0, '127.0.0.1', r));
    base4 = `http://127.0.0.1:${(server4.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(r => server4.close(() => r())));

  it('returns 413 for an oversized body instead of resetting the connection', async () => {
    const big = 'x'.repeat(5000);
    const res = await fetch(`${base4}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify({ big }) });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);
  });
});

describe('HTTP handler bad requests', () => {
  it('returns 400 for a malformed URI escape', async () => {
    const res = await fetch(`${base}/api/state/%E0%A4%A`);
    expect(res.status).toBe(400);
  });

  it('returns 404 (not 500) for a prototype-polluting logo folder name', async () => {
    const res = await fetch(`${base}/logos/__proto__/79`);
    expect(res.status).toBe(404);
  });

  describe('missing logo file on disk', () => {
    let server5: http.Server;
    let base5: string;

    beforeAll(async () => {
      const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-missingfile-'));
      const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-missingfile-'));
      mkdirSync(path.join(logoDir, 'Ghost Team'));
      const storage = new Storage(dataDir);
      await storage.write('logos/manifest.json', {
        folders: { 'Ghost Team': [{ file: 'Ghost Team S1-pres..png', from: 1, to: null, variant: 0 }] },
      });
      server5 = http.createServer(createHandler(storage, logoDir));
      await new Promise<void>(r => server5.listen(0, '127.0.0.1', r));
      base5 = `http://127.0.0.1:${(server5.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>(r => server5.close(() => r())));

    it('returns 404 when the manifest points at a file that does not exist on disk', async () => {
      const res = await fetch(`${base5}/logos/Ghost%20Team/79`);
      expect(res.status).toBe(404);
    });
  });
});

describe('batch and undo routes', () => {
  const cal = (done: boolean) => ({ season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done }] });

  it('applies a batch and undoes it', async () => {
    const setupTag = await ifMatch(base, 'calendar.json');
    const setup = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': setupTag }, body: JSON.stringify(cal(false)) });
    expect(setup.status).toBe(200);
    const tag = await ifMatch(base, 'calendar.json');
    const res = await fetch(`${base}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Mark A', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag) }] }) });
    expect(res.status).toBe(200);
    expect((await res.json()).batchId).toBeTruthy();
    const undo = await fetch(`${base}/api/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(await undo.json()).toEqual({ ok: true, label: 'Mark A', paths: ['calendar.json'] });
    expect(await (await fetch(`${base}/api/state/calendar.json`)).json()).toEqual(cal(false));
  });

  it('rejects a malformed batch body', async () => {
    const res = await fetch(`${base}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: '', writes: [] }) });
    expect(res.status).toBe(400);
  });

  it('rejects GET on the batch route', async () => {
    expect((await fetch(`${base}/api/batch`)).status).toBe(405);
  });

  it('GET /api/undo reports availability based on the newest journal entry', async () => {
    const base6 = base;
    // A fresh undo (from the previous test in this file) may or may not be pending; force a known state.
    const setupTag = await ifMatch(base6, 'calendar.json');
    const setup = await fetch(`${base6}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': setupTag }, body: JSON.stringify(cal(false)) });
    expect(setup.status).toBe(200);
    const before = await fetch(`${base6}/api/undo`);
    expect(await before.json()).toEqual({ ok: true, available: false, label: null, blockedBy: null });

    const tag = await ifMatch(base6, 'calendar.json');
    await fetch(`${base6}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Mark B', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag) }] }) });
    const after = await fetch(`${base6}/api/undo`);
    expect(await after.json()).toEqual({ ok: true, available: true, label: 'Mark B', blockedBy: null });

    await fetch(`${base6}/api/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const post = await fetch(`${base6}/api/undo`);
    expect(await post.json()).toEqual({ ok: true, available: false, label: null, blockedBy: null });
  });

  it('GET /api/undo reports blockedBy when the file changed since the batch, without consuming the entry', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'fba-http-blocked-'));
    const logoDir = mkdtempSync(path.join(tmpdir(), 'fba-logos-blocked-'));
    const storage = new Storage(dataDir);
    const server7 = http.createServer(createHandler(storage, logoDir));
    await new Promise<void>(r => server7.listen(0, '127.0.0.1', r));
    const base7 = `http://127.0.0.1:${(server7.address() as AddressInfo).port}`;
    try {
      const setup = await fetch(`${base7}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify(cal(false)) });
      expect(setup.status).toBe(200);
      const tag = await ifMatch(base7, 'calendar.json');
      await fetch(`${base7}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Mark C', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag) }] }) });
      // A non-journaled PUT changes calendar.json to a third state (neither the batch's before nor after),
      // so the batch above can no longer be undone.
      const laterTag = await ifMatch(base7, 'calendar.json');
      const other = { season: 79, steps: [{ id: 'a', label: 'Z', kind: 'offseason', league: null, sub: false, done: false }] };
      await fetch(`${base7}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': laterTag }, body: JSON.stringify(other) });
      const peek = await fetch(`${base7}/api/undo`);
      expect(await peek.json()).toEqual({ ok: true, available: true, label: 'Mark C', blockedBy: 'calendar.json' });
    } finally {
      await new Promise<void>(r => server7.close(() => r()));
    }
  });
});

describe('versions over HTTP', () => {
  const tagOf = async (rel: string) => (await fetch(`${base}/api/state/${rel}`)).headers.get('etag');

  it('sends an ETag with every document', async () => {
    expect(await tagOf('logos/manifest.json')).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it('requires If-Match on PUT', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', body: JSON.stringify(calendar) });
    expect(res.status).toBe(428);
  });

  it('rejects a malformed If-Match', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, { method: 'PUT', headers: { 'If-Match': 'abc' }, body: JSON.stringify(calendar) });
    expect(res.status).toBe(400);
  });

  it('returns the new version on PUT and refuses a stale one', async () => {
    const rel = 'leagues/fba/S79/transactions.json';
    const doc = { league: 'fba', season: 79, entries: [] };
    const first = await fetch(`${base}/api/state/${rel}`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify(doc) });
    expect(first.status).toBe(200);
    const { version } = (await first.json()) as { version: string };
    expect(await tagOf(rel)).toBe(`"${version}"`);
    const again = await fetch(`${base}/api/state/${rel}`, { method: 'PUT', headers: { 'If-Match': '"null"' }, body: JSON.stringify(doc) });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { conflicts: string[] }).conflicts).toEqual([rel]);
  });

  it('requires baseVersion on batch writes and reports stale ones', async () => {
    const rel = 'leagues/fbad2/S79/transactions.json';
    const doc = { league: 'fbad2', season: 79, entries: [] };
    const post = (writes: unknown[]) => fetch(`${base}/api/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'T', writes }),
    });
    expect((await post([{ path: rel, doc }])).status).toBe(400);
    const ok = await post([{ path: rel, doc, baseVersion: null }]);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { versions: Record<string, string> };
    expect(`"${body.versions[rel]}"`).toBe(await tagOf(rel));
    const stale = await post([{ path: rel, doc, baseVersion: null }]);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { conflicts: string[] }).conflicts).toEqual([rel]);
  });
});

describe('history and resetUndo routes', () => {
  const cal = (done: boolean) => ({ season: 79, steps: [{ id: 'a', label: 'A', kind: 'offseason', league: null, sub: false, done }] });
  const post = (body: unknown) => fetch(`${base}/api/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('returns summaries in season order, 404s an unknown league and refuses other methods', async () => {
    const sum = (season: number) => ({ league: 'fbajc', season, locked: true, host: null, champions: [] });
    for (const s of [12, 3]) {
      const tag = await ifMatch(base, `leagues/fbajc/S${s}/summary.json`);
      const put = await fetch(`${base}/api/state/leagues/fbajc/S${s}/summary.json`, { method: 'PUT', headers: { 'If-Match': tag }, body: JSON.stringify(sum(s)) });
      expect(put.status).toBe(200);
    }
    expect(await (await fetch(`${base}/api/history/fbajc`)).json()).toEqual({ league: 'fbajc', seasons: [sum(3), sum(12)], errors: [] });
    expect((await fetch(`${base}/api/history/nba`)).status).toBe(404);
    expect((await fetch(`${base}/api/history/fbajc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(405);
  });

  it('clears Undo after a resetUndo batch, and rejects a non-boolean resetUndo', async () => {
    const tag1 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'Mark R', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag1) }] })).status).toBe(200);
    expect((await (await fetch(`${base}/api/undo`)).json()).available).toBe(true);
    const tag2 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'Finish', writes: [{ path: 'calendar.json', doc: cal(false), baseVersion: unquote(tag2) }], resetUndo: true })).status).toBe(200);
    expect(await (await fetch(`${base}/api/undo`)).json()).toEqual({ ok: true, available: false, label: null, blockedBy: null });
    const tag3 = await ifMatch(base, 'calendar.json');
    expect((await post({ label: 'X', writes: [{ path: 'calendar.json', doc: cal(true), baseVersion: unquote(tag3) }], resetUndo: 'yes' })).status).toBe(400);
  });
});
