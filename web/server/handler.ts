import { readFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import { isLeagueId } from '../engine/shared/leagues';
import { resolveLogo } from '../engine/shared/logos';
import { LogoManifest } from '../engine/shared/types';
import { Storage, StorageError, type BatchWrite, type Version } from './storage';

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

const VERSION = /^[0-9a-f]{16}$/;
const VERSION_TAG = /^"([0-9a-f]{16}|null)"$/;

const BatchRequest = z.object({
  label: z.string().min(1).max(200),
  writes: z.array(z.object({ path: z.string().min(1), doc: z.unknown(), baseVersion: z.string().regex(VERSION).nullable() }).strict()).min(1).max(50),
  resetUndo: z.boolean().optional(),
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
  const allowedOrigins = allowedHosts?.map(h => `http://${h}`);
  const maxBody = options.maxBody ?? DEFAULT_MAX_BODY;

  return async (req, res) => {
    if (allowedHosts && !allowedHosts.includes((req.headers.host ?? '').toLowerCase())) {
      return sendJson(res, 403, { error: 'Forbidden host' });
    }
    if ((req.headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') {
      return sendJson(res, 403, { error: 'Cross-site request blocked' });
    }
    const origin = req.headers.origin;
    if (allowedOrigins && origin && !allowedOrigins.includes(origin.toLowerCase())) {
      return sendJson(res, 403, { error: 'Forbidden origin' });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return sendJson(res, 400, { error: 'Malformed request path' });
    }

    if (req.method === 'POST' && (pathname === '/api/batch' || pathname === '/api/undo')) {
      const contentType = (req.headers['content-type'] ?? '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        req.resume();
        return sendJson(res, 415, { error: 'Content-Type must be application/json' });
      }
    }

    try {
      if (pathname.startsWith('/api/state/')) {
        const rel = pathname.slice('/api/state/'.length);
        if (req.method === 'GET') {
          const { doc, version } = await storage.readWithVersion(rel);
          return sendJson(res, 200, doc, { ETag: `"${version}"` });
        }
        if (req.method === 'PUT') {
          const raw = req.headers['if-match'];
          if (raw === undefined) {
            req.resume();
            return sendJson(res, 428, { error: 'If-Match header required: the version you loaded, or "null" for a new file' });
          }
          const tag = typeof raw === 'string' ? raw.trim().match(VERSION_TAG) : null;
          if (!tag) {
            req.resume();
            return sendJson(res, 400, { error: 'Malformed If-Match header' });
          }
          const baseVersion: Version = tag[1] === 'null' ? null : tag[1];
          const parsed = await jsonBody(req, res, maxBody);
          if (!parsed) return;
          const { version } = await storage.write(rel, parsed.value, baseVersion);
          return sendJson(res, 200, { ok: true, version });
        }
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      if (pathname === '/api/batch') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        const parsed = await jsonBody(req, res, maxBody);
        if (!parsed) return;
        const batch = BatchRequest.safeParse(parsed.value);
        if (!batch.success) return sendJson(res, 400, { error: 'Invalid batch request', issues: batch.error.issues });
        const { batchId, versions } = await storage.writeMany(batch.data.label, batch.data.writes as BatchWrite[], { resetUndo: batch.data.resetUndo });
        return sendJson(res, 200, { ok: true, batchId, versions });
      }

      if (pathname === '/api/undo') {
        if (req.method === 'GET') {
          const peek = await storage.peekUndo();
          return sendJson(res, 200, { ok: true, available: peek !== null, label: peek?.label ?? null, blockedBy: peek?.blockedBy ?? null });
        }
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
        await readBody(req, maxBody);
        const { label, paths } = await storage.undo();
        return sendJson(res, 200, { ok: true, label, paths });
      }

      const history = pathname.match(/^\/api\/history\/([^/]+)$/);
      if (history) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        const league = history[1];
        if (!isLeagueId(league)) return sendJson(res, 404, { error: `Unknown league: ${league}` });
        return sendJson(res, 200, { league, seasons: await storage.history(league) });
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
      if (e instanceof StorageError) return sendJson(res, e.status, { error: e.message, issues: e.issues, conflicts: e.conflicts });
      console.error(e);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  };
}
