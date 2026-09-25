import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { resolveLogo } from '../engine/shared/logos';
import type { LogoManifest } from '../engine/shared/types';
import { Storage, StorageError } from './storage';

const MAX_BODY = 20 * 1024 * 1024;

const isBareName = (s: string) => s.length > 0 && s !== '.' && s !== '..' && path.basename(s) === s && !s.includes('\\');

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
        if (!file || !isBareName(folder) || !isBareName(file)) return sendJson(res, 404, { error: `No logo for ${folder}` });
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
