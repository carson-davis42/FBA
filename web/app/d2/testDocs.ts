import { vi } from 'vitest';
import { d2DocPath, type D2State } from '../../engine/d2/state';

export const META = {
  currentSeason: 79,
  rosterSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 },
  lastSeason: { fba: 78, fbad2: 78, fbajc: 78, fbawc: 78 },
};

/** Every document a D2 page loads, built from a D2State. Missing optional docs are left out (→ 404). */
export function docsFor(state: D2State): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'meta.json': META,
    'players.json': state.players,
    'leagues/fbad2/teams.json': {
      league: 'fbad2',
      teams: Object.keys(state.d2.teams).map(t => ({ teamId: t, name: `${t} Club`, abbr: t, group: 'PL', logoFolder: null, badge: { bg: 'hsl(1 55% 36%)', fg: '#ffffff' } })),
    },
    'leagues/fba/S79/freeAgents.json': { league: 'fba', season: 79, locked: state.freeAgencyClosed, players: [] },
  };
  if (state.prevD2) out['leagues/fbad2/S78/rosters.json'] = state.prevD2;
  for (const k of ['d2', 'reserves', 'd2Tx', 'calendar', 'ratings', 'pool', 'draft'] as const) {
    const doc = state[k];
    if (doc) out[d2DocPath(k, state.season)] = doc;
  }
  return out;
}

export interface ApiLog {
  batches: { label: string; writes: { path: string; doc: unknown; baseVersion: string | null }[] }[];
  puts: { path: string; ifMatch: string | null; doc: unknown }[];
  undos: number;
}

/**
 * Stubs fetch with an in-memory API over `docs` (which it mutates on writes). Each doc's version is its write count as
 * 16 digits ("0000000000000001" when first served), sent as an ETag and bumped on every PUT or batch write.
 */
export function stubApi(docs: Record<string, unknown>, options: { undoLabel?: string | null; undoBlockedBy?: string | null } = {}): ApiLog {
  const log: ApiLog = { batches: [], puts: [], undos: 0 };
  const counts = new Map<string, number>(Object.keys(docs).map(p => [p, 1]));
  const version = (p: string) => String(counts.get(p) ?? 0).padStart(16, '0');
  const bump = (p: string) => counts.set(p, (counts.get(p) ?? 0) + 1);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/batch') {
      const body = JSON.parse(String(init!.body)) as ApiLog['batches'][number];
      log.batches.push(body);
      const versions: Record<string, string> = {};
      for (const w of body.writes) { docs[w.path] = w.doc; bump(w.path); versions[w.path] = version(w.path); }
      return new Response(JSON.stringify({ ok: true, batchId: '1-0', versions }));
    }
    if (url === '/api/undo') {
      if (init?.method === 'POST') {
        log.undos++;
        return new Response(JSON.stringify({ ok: true, label: options.undoLabel ?? 'Undo', paths: [] }));
      }
      return new Response(JSON.stringify({
        ok: true, available: Boolean(options.undoLabel), label: options.undoLabel ?? null, blockedBy: options.undoBlockedBy ?? null,
      }));
    }
    const path = url.replace('/api/state/', '');
    if (init?.method === 'PUT') {
      const doc = JSON.parse(String(init.body));
      log.puts.push({ path, ifMatch: new Headers(init.headers).get('If-Match'), doc });
      docs[path] = doc;
      bump(path);
      return new Response(JSON.stringify({ ok: true, version: version(path) }));
    }
    if (!(path in docs)) return new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 });
    return new Response(JSON.stringify(docs[path]), { headers: { ETag: `"${version(path)}"` } });
  }));
  return log;
}
