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
    const res = await fetch(`${base2}/logos/x/79`);
    expect(res.status).toBe(404);
  });

  it('rejects malicious manifest via PUT', async () => {
    const res = await fetch(`${base2}/api/state/logos/manifest.json`, {
      method: 'PUT',
      body: JSON.stringify({ folders: { x: [{ file: '../../etc/passwd.png', from: null, to: null, variant: 1 }] } }),
    });
    expect(res.status).toBe(400);
  });
});
