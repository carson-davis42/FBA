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

  it('rejects a document with an unknown key', async () => {
    const res = await fetch(`${base}/api/state/calendar.json`, {
      method: 'PUT',
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

  function rawRequest(hostHeader: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: port3, path: '/api/state/logos/manifest.json', method: 'GET', headers: { Host: hostHeader } },
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
    expect(await rawRequest('evil.example')).toBe(403);
  });

  it('allows a Host header that is on the list', async () => {
    expect(await rawRequest('good.test:1')).toBe(200);
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
    const res = await fetch(`${base4}/api/state/calendar.json`, { method: 'PUT', body: JSON.stringify({ big }) });
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
