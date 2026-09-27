import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import { resolveLogo } from '../engine/shared/logos';
import { LogoManifest } from '../engine/shared/types';
import { Storage, StorageError, type BatchWrite } from './storage';

const DEFAULT_MAX_BODY = 20 * 1024 * 1024;

const isBareName = (s: string) => s.length > 0 && s !== '.' && s !== '..' && path.basename(s) === s && !s.includes('\\');
const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Resolves to the body text, or null when it exceeds maxBody (caller must drain/destroy the request). */
function readBody(req: http.IncomingMessage, maxBody: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maxBody) {
      resolve(null);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      if (tooLarge) return;
      size += c.length;
      if (size > maxBody) {
        tooLarge = true;
        resolve(null);
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

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

export function createHandler(
  storage: Storage,
  logoDir: string,
  options: { allowedHosts?: string[]; maxBody?: number } = {},
): http.RequestListener {
  const allowedHosts = options.allowedHosts?.map(h => h.toLowerCase());
  const maxBody = options.maxBody ?? DEFAULT_MAX_BODY;

  return async (req, res) => {
    if (allowedHosts && !allowedHosts.includes((req.headers.host ?? '').toLowerCase())) {
      return sendJson(res, 403, { error: 'Forbidden host' });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return sendJson(res, 400, { error: 'Malformed request path' });
    }

    try {
      if (pathname.startsWith('/api/state/')) {
        const rel = pathname.slice('/api/state/'.length);
        if (req.method === 'GET') return sendJson(res, 200, await storage.read(rel));
        if (req.method === 'PUT') {
          const parsed = await jsonBody(req, res, maxBody);
          if (!parsed) return;
          await storage.write(rel, parsed.value);
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      if (pathname === '/api/batch') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const parsed = await jsonBody(req, res, maxBody);
        if (!parsed) return;
        const batch = BatchRequest.safeParse(parsed.value);
        if (!batch.success) return sendJson(res, 400, { error: 'Invalid batch request', issues: batch.error.issues });
        const { batchId } = await storage.writeMany(batch.data.label, batch.data.writes as BatchWrite[]);
        return sendJson(res, 200, { ok: true, batchId });
      }

      if (pathname === '/api/undo') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const { label, paths } = await storage.undo();
        return sendJson(res, 200, { ok: true, label, paths });
      }

      const logo = pathname.match(/^\/logos\/([^/]+)\/(\d+)$/);
      if (logo && req.method === 'GET') {
        const [, folder, season] = logo;
        const manifestRaw = await storage.read('logos/manifest.json');
        const parsed = LogoManifest.safeParse(manifestRaw);
        if (!parsed.success) return sendJson(res, 500, { error: 'Stored logo manifest is invalid' });
        const manifest = parsed.data;
        const entries = Object.hasOwn(manifest.folders, folder) ? manifest.folders[folder] : undefined;
        const file = entries ? resolveLogo(entries, folder, Number(season)) : null;
        if (!file || !isBareName(folder) || !isBareName(file)) return sendJson(res, 404, { error: `No logo for ${folder}` });
        let data: Buffer;
        try {
          data = await readFile(path.join(logoDir, folder, file));
        } catch (e) {
          if (isMissing(e)) return sendJson(res, 404, { error: `No logo for ${folder}` });
          throw e;
        }
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
