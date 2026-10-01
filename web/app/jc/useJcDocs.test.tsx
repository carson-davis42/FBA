// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JcResult, JcState } from '../../engine/jc/state';
import { useJcDocs } from './useJcDocs';
import { useJcRun } from './useJcRun';

const docs: Record<string, unknown> = {
  'calendar.json': { season: 79, steps: [] },
  'players.json': { players: [] },
  'leagues/fbajc/teams.json': { teams: [] },
  'leagues/fbajc/S79/rosters.json': { rosters: [] },
  'leagues/fbajc/S79/results.json': { games: [] },
  'leagues/fbajc/S78/summary.json': { marker: 'prev' },
};
const requested: string[] = [];
const posts: { writes: { path: string; baseVersion: string | null }[] }[] = [];

beforeEach(() => {
  requested.length = 0;
  posts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ batchId: 'b', versions: {} }), { status: 200 });
    }
    const rel = url.replace('/api/state/', '');
    requested.push(rel);
    const doc = docs[rel];
    return doc ? new Response(JSON.stringify(doc), { headers: { ETag: '"v1"' } }) : new Response('{}', { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useJcDocs', () => {
  it('loads the docs; a missing schedule is null with a null version', async () => {
    const { result } = renderHook(() => useJcDocs(79));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('');
    const s = result.current.state;
    expect(s?.season).toBe(79);
    expect(s?.schedule).toBeNull();
    expect(s?.results).toEqual({ games: [] });
    expect(result.current.versions['leagues/fbajc/S79/schedule.json']).toBeNull();
    expect(result.current.versions['leagues/fbajc/S79/results.json']).toBe('v1');
    expect(result.current.lastSummary).toEqual({ marker: 'prev' });
    expect(requested).toContain('leagues/fbajc/S78/summary.json');
  });
});

describe('useJcDocs missing docs', () => {
  it('names the missing season rosters instead of loading forever', async () => {
    const saved = docs['leagues/fbajc/S79/rosters.json'];
    delete docs['leagues/fbajc/S79/rosters.json'];
    try {
      const { result } = renderHook(() => useJcDocs(79));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.state).toBeNull();
      expect(result.current.missing).toMatch(/S79 college rosters don't exist yet/);
      expect(result.current.missing).toContain('leagues/fbajc/S79/rosters.json');
    } finally {
      docs['leagues/fbajc/S79/rosters.json'] = saved;
    }
  });
  it('loads the previous class board into the state', async () => {
    docs['leagues/fbajc/S78/recruiting.json'] = { marker: 'board' };
    try {
      const { result } = renderHook(() => useJcDocs(79));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.state?.board).toEqual({ marker: 'board' });
      expect(requested).toContain('leagues/fbajc/S78/recruiting.json');
    } finally {
      delete docs['leagues/fbajc/S78/recruiting.json'];
    }
  });
});

describe('useJcRun', () => {
  it('saves once when run twice quickly, with baseVersions', async () => {
    const { result } = renderHook(() => ({ d: useJcDocs(79) }));
    await waitFor(() => expect(result.current.d.loading).toBe(false));
    const r = renderHook(() => useJcRun(result.current.d.versions, () => {}));
    const state = result.current.d.state as JcState;
    const build = (): JcResult => ({ ok: true, state, changed: ['schedule', 'results'], label: 'Test' });
    await act(async () => { await Promise.all([r.result.current.run(build), r.result.current.run(build)]); });
    expect(posts).toHaveLength(1);
    expect(posts[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S79/schedule.json', null],
      ['leagues/fbajc/S79/results.json', 'v1'],
    ]);
  });
  it('shows problems on failure', async () => {
    const r = renderHook(() => useJcRun({}, () => {}));
    await act(async () => { await r.result.current.run(() => ({ ok: false, problems: ['bad'] })); });
    expect(r.result.current.error).toBe('bad');
    expect(posts).toHaveLength(0);
  });
});

describe('useJcDocs postseason docs', () => {
  it('loads the postseason and awards docs, null with null versions when absent', async () => {
    const { result } = renderHook(() => useJcDocs(79));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state?.postseason).toBeNull();
    expect(result.current.state?.awards).toBeNull();
    expect(result.current.versions['leagues/fbajc/S79/postseason.json']).toBeNull();
    expect(result.current.versions['leagues/fbajc/S79/awards.json']).toBeNull();
    expect(result.current.versions['leagues/fbajc/S79/summary.json']).toBeNull();
  });
});
